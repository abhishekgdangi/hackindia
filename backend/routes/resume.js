/**
 * routes/resume.js  — v3 Hybrid Pipeline
 *
 *  Stage 0  Text extraction     pdf-parse / mammoth / utf8
 *  Stage 1  Rule-based          ATS checks, skill detection, section scoring
 *  Stage 2  RAG                 Role matching, gap roadmap, domain roadmap
 *  Stage 3  Groq LLM            Language tasks — augmented with RAG context
 *                               + rule signals + self-validation step
 *
 * Deps: multer, pdf-parse, mammoth, groq-sdk
 */

const express = require("express");
const multer  = require("multer");
const router  = express.Router();
const Groq    = require("groq-sdk");
const logger  = require("../utils/logger");
const KB      = require("../data/resumeKB");

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const ext = (file.originalname || "").toLowerCase();
    const ok  =
      file.mimetype === "application/pdf" ||
      file.mimetype === "application/msword" ||
      file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.mimetype === "text/plain" ||
      ext.endsWith(".pdf") || ext.endsWith(".docx") ||
      ext.endsWith(".doc") || ext.endsWith(".txt");
    ok ? cb(null, true) : cb(new Error("Only PDF, DOCX, DOC, and TXT files are supported."));
  },
});

/* ══════════════════════════════════════════════════════════════
   STAGE 0 — TEXT EXTRACTION
══════════════════════════════════════════════════════════════ */
async function extractText(file) {
  const ext  = (file.originalname || "").toLowerCase();
  const mime = file.mimetype || "";
  if (mime === "application/pdf" || ext.endsWith(".pdf")) {
    const pdfParse = require("pdf-parse");
    return (await pdfParse(file.buffer)).text || "";
  }
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    ext.endsWith(".docx")
  ) {
    const mammoth = require("mammoth");
    return (await mammoth.extractRawText({ buffer: file.buffer })).value || "";
  }
  if (mime === "application/msword" || ext.endsWith(".doc")) {
    try {
      const mammoth = require("mammoth");
      return (await mammoth.extractRawText({ buffer: file.buffer })).value || "";
    } catch {
      return file.buffer.toString("utf8").replace(/[^\x20-\x7E\n\r\t]/g, " ");
    }
  }
  return file.buffer.toString("utf8");
}

/* ══════════════════════════════════════════════════════════════
   STAGE 1 — RULE-BASED  (deterministic, instant, free)
══════════════════════════════════════════════════════════════ */
function runRuleBased(text) {
  const ats      = KB.runATSChecks(text);
  const skills   = KB.detectSkills(text);
  const sections = KB.detectSections(text);
  const rtype    = KB.detectResumeType(text);
  const words    = text.trim().split(/\s+/).length;

  const sectionScores = {};
  for (const [sec, info] of Object.entries(sections)) {
    const maxHits = KB.SECTION_KW[sec].length;
    sectionScores[sec] = Math.min(100, Math.round((info.hits / Math.max(1, maxHits)) * 300));
  }

  const weights = { education:0.15, skills:0.25, projects:0.25, experience:0.20, certifications:0.05 };
  const overallRuleScore = Math.round(
    Object.entries(weights).reduce((s, [k, w]) => s + (sectionScores[k] || 0) * w, 0) * 0.6 +
    ats.ats_score * 0.4
  );

  return {
    ats_score:         ats.ats_score,
    overall_rule_score:overallRuleScore,
    section_scores: {
      education:      Math.min(100, sectionScores.education      || 0),
      skills:         Math.min(100, Math.round((skills.length / 12) * 100)),
      projects:       Math.min(100, sectionScores.projects       || 0),
      experience:     Math.min(100, sectionScores.experience     || 0),
      certifications: Math.min(100, sectionScores.certifications || 0),
    },
    format_issues:     ats.format_issues,
    keyword_issues:    ats.keyword_issues,
    contact_issues:    ats.contact_issues,
    all_ats_issues:    ats.all_issues,
    section_detection: ats.section_detection,
    skills_found:      skills,
    resume_type:       rtype,
    word_count:        words,
    sections_present:  Object.fromEntries(
      Object.entries(sections).map(([k, v]) => [k, v.present])
    ),
  };
}

/* ══════════════════════════════════════════════════════════════
   STAGE 2 — RAG  (in-process KB, instant, free)
══════════════════════════════════════════════════════════════ */
function runRAG(ruleResult, targetDomain) {
  const { skills_found } = ruleResult;

  const topRoles   = KB.retrieveTopRoles(skills_found, 3);
  const allRequired = [...new Set(topRoles.flatMap(r => [...r.required, ...r.bonus]))];
  const skillsLower = skills_found.map(s => s.toLowerCase());
  const missing = allRequired
    .filter(s => !skillsLower.some(d => d.includes(s) || s.includes(d)))
    .slice(0, 14);

  const gap_roadmap     = KB.retrieveSkillRoadmap(missing, topRoles, 6);
  const domain_roadmap  = targetDomain ? KB.retrieveDomainRoadmap(targetDomain) : null;
  const domainRole      = targetDomain
    ? KB.ROLES.find(r => targetDomain.toLowerCase().includes(r.id)) || topRoles[0]
    : topRoles[0];
  const domain_required = domainRole?.required || [];

  return {
    top_roles:         topRoles,
    skills_missing:    missing,
    gap_roadmap,
    domain_roadmap,
    domain_required,
    recommended_roles: topRoles.map(r => r.title),
    role_scores:       topRoles.map(r => ({
      title:  r.title,
      score:  r.score,
      salary: r.salaryRange,
      demand: r.demand,
    })),
  };
}

/* ══════════════════════════════════════════════════════════════
   BUILD RAG CONTEXT BLOCK  (injected into LLM prompt)
══════════════════════════════════════════════════════════════ */
function buildRAGContext(ragResult, targetDomain) {
  const lines = [];

  lines.push("=== RETRIEVED ROLE KNOWLEDGE ===");
  for (const role of ragResult.top_roles) {
    lines.push(`Role: ${role.title} (match score: ${role.score}%)`);
    lines.push(`  Required skills : ${role.required.join(", ")}`);
    lines.push(`  Bonus skills    : ${role.bonus.slice(0, 6).join(", ")}`);
    lines.push(`  Salary range    : ${role.salaryRange}  |  Demand: ${role.demand}`);
    lines.push(`  JD keywords     : ${role.jdKeywords.join(", ")}`);
  }

  lines.push("\n=== SKILL GAP CONTEXT ===");
  lines.push(`Missing skills (from role requirements): ${ragResult.skills_missing.join(", ") || "none"}`);
  lines.push(`Domain required: ${ragResult.domain_required.join(", ") || "not specified"}`);

  if (ragResult.domain_roadmap) {
    lines.push(`\n=== DOMAIN LEARNING ROADMAP (${targetDomain}) ===`);
    ragResult.domain_roadmap.forEach((step, i) => lines.push(`  ${i + 1}. ${step}`));
  }

  lines.push("\n=== GAP ROADMAP PRIORITIES ===");
  ragResult.gap_roadmap.forEach(g => {
    lines.push(`  ${g.skill} [${g.priority}] — ${g.reason}`);
  });

  return lines.join("\n");
}

/* ══════════════════════════════════════════════════════════════
   BUILD RULE SIGNALS BLOCK  (injected into LLM prompt)
══════════════════════════════════════════════════════════════ */
function buildRuleSignals(ruleResult) {
  return [
    "=== RULE ENGINE SIGNALS ===",
    `Resume Type    : ${ruleResult.resume_type}`,
    `Word Count     : ${ruleResult.word_count}`,
    `ATS Score      : ${ruleResult.ats_score}/100`,
    `Overall (rule) : ${ruleResult.overall_rule_score}/100`,
    `Section Detect : ${ruleResult.section_detection}`,
    `Skills Found   : ${ruleResult.skills_found.join(", ") || "none"}`,
    `Sections Present: ${Object.entries(ruleResult.sections_present).filter(([,v])=>v).map(([k])=>k).join(", ") || "none detected"}`,
    "",
    "ATS Issues:",
    ...(ruleResult.all_ats_issues.length
      ? ruleResult.all_ats_issues.map(i => `  - ${i}`)
      : ["  - none"]),
    "",
    "Section Scores:",
    ...Object.entries(ruleResult.section_scores).map(([k,v]) => `  ${k}: ${v}/100`),
  ].join("\n");
}

/* ══════════════════════════════════════════════════════════════
   STAGE 3 — LLM PROMPT  (augmented with RAG + rule signals)
══════════════════════════════════════════════════════════════ */
function buildLLMPrompt(resumeText, jobDescription, targetDomain, ruleResult, ragResult) {
  const retrievedContext = buildRAGContext(ragResult, targetDomain);
  const ruleSignals      = buildRuleSignals(ruleResult);

  return `You are an expert AI career assistant combining:
- ATS system logic
- Senior recruiter evaluation
- Skill gap analysis
- Resume optimization
- Resume builder
- Output validation system

You must:
1. Analyze the resume
2. Identify gaps and weaknesses
3. Compare with job description (if provided)
4. Compare with domain expectations (using retrieved context)
5. Generate improvements WITHOUT hallucination
6. Build a clean ATS-friendly resume structure
7. VALIDATE your own output before returning

Return ONLY valid JSON.

---

INPUT:

Resume Text:
${resumeText.slice(0, 8000)}

Job Description (optional):
${jobDescription ? jobDescription.slice(0, 2500) : "NOT PROVIDED"}

Target Domain (optional):
${targetDomain || "NOT PROVIDED"}

Retrieved Knowledge (RAG context):
${retrievedContext}

Rule Engine Signals:
${ruleSignals}

---

STRICT RULES (ANTI-HALLUCINATION):
1. Resume is the ONLY source of truth for skills, experience, projects
2. DO NOT invent tools, technologies, frameworks, experience, metrics
3. Retrieved context is ONLY for identifying missing skills and benchmarking
4. If something is not in resume — mark it as missing
5. Rewrites must improve wording ONLY — NOT introduce new claims
6. If unsure — return minimal safe output

---

TASKS:
1. Classify resume type — use rule signal: "${ruleResult.resume_type}"
2. Compute overall_score — blend qualitative judgment with rule score ${ruleResult.overall_rule_score}
3. Use ats_score from rule signals: ${ruleResult.ats_score} — do NOT change this value
4. Identify gaps and weak sections
5. Extract skills from resume only — use rule signal skills as reference: [${ruleResult.skills_found.join(", ")}]
6. Compare with JD and domain expectations from retrieved context
7. Generate skill gap roadmap using retrieved context priorities
8. Analyze ATS issues using rule signals provided
9. Rewrite weak bullets safely — no new claims
10. Provide recruiter decision
11. Generate interview questions from resume content
12. Build ATS-friendly resume structure from existing data only
13. SELF-VALIDATE output before returning

---

OUTPUT FORMAT — return this exact JSON:

{
  "summary": {
    "resume_type": "${ruleResult.resume_type}",
    "overall_score": number,
    "ats_score": ${ruleResult.ats_score},
    "match_score": number or null
  },
  "gaps_analysis": {
    "critical_gaps": [string],
    "weak_sections": [{ "section": string, "issue": string, "fix": string }]
  },
  "skills_analysis": {
    "found": [string],
    "missing": [string],
    "domain_required": [string],
    "gap_roadmap": [{ "skill": string, "priority": "High | Medium | Low", "reason": string, "learning_steps": [string] }]
  },
  "job_matching": {
    "matching_skills": [string],
    "missing_keywords": [string],
    "alignment_issues": [string]
  },
  "ats_analysis": {
    "format_issues": [string],
    "keyword_issues": [string],
    "section_detection": "${ruleResult.section_detection}"
  },
  "bullet_optimization": [{ "original": string, "improved": string, "issues": [string], "evidence": string }],
  "section_rewrite": { "summary": string, "experience": [string], "projects": [string] },
  "domain_insights": {
    "recommended_roles": [string],
    "top_skills": [string],
    "readiness": "Low | Medium | High"
  },
  "interview_prep": { "likely_questions": [string], "focus_areas": [string] },
  "recruiter_decision": { "shortlist": "Yes | No | Maybe", "reason": string },
  "priority_action_plan": [string],
  "resume_builder": {
    "header": { "name": string, "email": string, "phone": string },
    "summary": string,
    "skills": [string],
    "experience": [{ "role": string, "organization": string, "description": [string] }],
    "projects": [{ "name": string, "description": [string] }],
    "education": [string],
    "certifications": [string]
  },
  "validation": {
    "is_safe": true,
    "issues": []
  }
}

---

SELF-VALIDATION STEP (MANDATORY before returning):

1. Check every skill/tool/technology in output — is it present in resume text?
   → If not, remove it

2. Check rewritten bullets — do they add new claims or metrics not in resume?
   → If yes, revert to safer version

3. Ensure missing skills are NOT listed as found

4. Ensure all improvements are grounded in actual resume content

5. If any issue found:
   → set validation.is_safe = false
   → list issues in validation.issues[]

6. Otherwise:
   → validation.is_safe = true
   → validation.issues = []

---

LOGIC RULES:
1. If job description is NOT PROVIDED: match_score = null, job_matching = empty arrays
2. If domain is NOT PROVIDED: domain_insights = null
3. Use rule signals for all ATS values — do not recompute
4. Use retrieved context ONLY for missing skills and gap roadmap
5. priority_action_plan: exactly 5 items, most impactful first
6. bullet_optimization: up to 4 bullets rewritten
7. resume_builder: structure ONLY existing resume data, no fabrication

---

QUALITY RULES:
- Be precise and structured
- Avoid generic advice
- Focus on hiring impact
- Ensure valid JSON`;
}

/* ══════════════════════════════════════════════════════════════
   MERGE — combine all 3 stages into final API response
══════════════════════════════════════════════════════════════ */
function mergeResults(ruleResult, ragResult, llmResult, jobDescription) {
  const hasJD = !!jobDescription;

  // Match score: deterministic keyword overlap (not LLM)
  let match_score = null;
  if (hasJD) {
    const jdLower = jobDescription.toLowerCase();
    const hits    = ruleResult.skills_found.filter(s => jdLower.includes(s.toLowerCase())).length;
    const bonus   = (llmResult.job_matching?.matching_skills?.length || 0) * 2;
    match_score   = Math.min(100, Math.round((hits / Math.max(ruleResult.skills_found.length, 1)) * 80 + bonus));
  }

  // Readiness: computed from rule scores (not LLM)
  const readiness = ruleResult.ats_score >= 70 && ruleResult.skills_found.length >= 8 ? "High"
                  : ruleResult.ats_score >= 50 && ruleResult.skills_found.length >= 4 ? "Medium" : "Low";

  return {
    summary: {
      resume_type:   ruleResult.resume_type,
      overall_score: llmResult.summary?.overall_score || ruleResult.overall_rule_score,
      ats_score:     ruleResult.ats_score,           // always from rule engine
      match_score,                                    // always deterministic
    },

    gaps_analysis:   llmResult.gaps_analysis || { critical_gaps: [], weak_sections: [] },

    // Skills: rule-based found + RAG missing + LLM gap roadmap
    skills_analysis: {
      found:          ruleResult.skills_found,
      missing:        ragResult.skills_missing,
      domain_required:ragResult.domain_required,
      gap_roadmap:    llmResult.skills_analysis?.gap_roadmap?.length
                        ? llmResult.skills_analysis.gap_roadmap
                        : ragResult.gap_roadmap,
    },

    // JD matching: LLM (language task) but only if JD provided
    job_matching: hasJD
      ? (llmResult.job_matching || { matching_skills: [], missing_keywords: [], alignment_issues: [] })
      : { matching_skills: [], missing_keywords: [], alignment_issues: [] },

    // ATS: rule-based values, LLM narrative issues
    ats_analysis: {
      format_issues:    [...ruleResult.format_issues, ...ruleResult.contact_issues],
      keyword_issues:   ruleResult.keyword_issues,
      section_detection:ruleResult.section_detection,
    },

    bullet_optimization: llmResult.bullet_optimization || [],
    section_rewrite:     llmResult.section_rewrite     || { summary: "", experience: [], projects: [] },

    domain_insights: {
      recommended_roles: ragResult.recommended_roles,
      top_skills:        ragResult.top_roles[0]?.required || [],
      readiness,
      role_scores:       ragResult.role_scores,
      domain_roadmap:    ragResult.domain_roadmap || null,
    },

    interview_prep:       llmResult.interview_prep       || { likely_questions: [], focus_areas: [] },
    recruiter_decision:   llmResult.recruiter_decision   || { shortlist: "Maybe", reason: "Insufficient data" },
    priority_action_plan: llmResult.priority_action_plan || [],
    resume_builder:       llmResult.resume_builder       || {},

    // Validation from LLM self-check
    validation: llmResult.validation || { is_safe: true, issues: [] },

    _pipeline: { rule_based: "✓", rag: "✓", llm: "✓", self_validated: llmResult.validation?.is_safe ?? true },
  };
}

/* ══════════════════════════════════════════════════════════════
   ROUTE
══════════════════════════════════════════════════════════════ */
router.post("/analyze", upload.single("resume"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Please upload a resume file (PDF, DOCX, DOC, or TXT)." });
    }

    const { jobDescription = "", targetDomain = "" } = req.body;
    logger.info(`[resume] ${req.file.originalname} | JD:${!!jobDescription} | Domain:${targetDomain || "none"}`);

    // Stage 0 — Extract
    const text = await extractText(req.file);
    if (!text || text.trim().length < 50) {
      return res.status(400).json({
        error: "Could not extract readable text. Try a text-based PDF or DOCX — scanned image resumes are not supported.",
      });
    }
    logger.info(`[resume] Extracted ${text.length} chars`);

    // Stage 1 — Rule-based
    const ruleResult = runRuleBased(text);
    logger.info(`[resume] Rule: ATS=${ruleResult.ats_score} skills=${ruleResult.skills_found.length} type=${ruleResult.resume_type}`);

    // Stage 2 — RAG
    const ragResult = runRAG(ruleResult, targetDomain);
    logger.info(`[resume] RAG: roles=${ragResult.recommended_roles.join(",")} missing=${ragResult.skills_missing.length}`);

    // Stage 3 — LLM (with full RAG context + rule signals injected)
    const prompt = buildLLMPrompt(text, jobDescription, targetDomain, ruleResult, ragResult);
    const completion = await groqCall({
      model:       "llama-3.3-70b-versatile",
      temperature: 0.25,
      max_tokens:  4000,
      messages:    [{ role: "user", content: prompt }],
    });

    let raw = completion.choices[0].message.content.trim();
    raw = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    const llmResult = JSON.parse(raw);

    logger.info(`[resume] LLM: shortlist=${llmResult.recruiter_decision?.shortlist} safe=${llmResult.validation?.is_safe} score=${llmResult.summary?.overall_score}`);

    const final = mergeResults(ruleResult, ragResult, llmResult, jobDescription);
    return res.json(final);

  } catch (err) {
    logger.error(`[resume] Error: ${err.message}`);

    if (err.message?.includes("Only PDF")) {
      return res.status(400).json({ error: err.message });
    }
    // Groq rate limit (429)
    if (err.status === 429 || err.message?.includes("429") || err.message?.toLowerCase().includes("rate limit")) {
      return res.status(429).json({
        error: "The AI is busy right now — Groq rate limit reached. Please wait 30 seconds and try again.",
      });
    }
    // Groq token limit
    if (err.message?.toLowerCase().includes("token") || err.message?.toLowerCase().includes("context")) {
      return res.status(400).json({
        error: "Your resume is too long for analysis. Try trimming it to under 3 pages and upload again.",
      });
    }
    // Groq API key missing / auth error
    if (err.message?.toLowerCase().includes("api key") || err.message?.toLowerCase().includes("authentication")) {
      return res.status(503).json({
        error: "AI service not configured. Contact the site admin.",
      });
    }

    return res.status(500).json({ error: "Analysis failed. Please try again." });
  }
});

module.exports = router;
