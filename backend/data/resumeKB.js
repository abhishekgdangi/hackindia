/**
 * data/resumeKB.js
 * In-process knowledge base for free RAG retrieval.
 * No vector DB needed — keyword overlap scoring at runtime.
 *
 * Structure:
 *  ROLES       — role profiles with required/bonus skills + salary + JD keywords
 *  SKILLS_META — per-skill metadata: category, priority, learning resources
 *  ROADMAPS    — ordered learning paths per domain
 *  ATS_RULES   — deterministic ATS check definitions
 *  SECTION_KW  — section detection keyword lists
 */

// ── 1. ROLE PROFILES ─────────────────────────────────────────────
const ROLES = [
  {
    id: "fullstack",
    title: "Full Stack Developer",
    aliases: ["fullstack","full stack","full-stack","mern","mean","web developer"],
    required:  ["javascript","react","node.js","express","mongodb","html","css","git","rest api"],
    bonus:     ["typescript","docker","aws","redis","graphql","next.js","postgresql"],
    jdKeywords:["full stack","frontend","backend","api","database","deployment","responsive"],
    salaryRange:"₹4L – ₹18L",
    demand:    "Very High",
  },
  {
    id: "frontend",
    title: "Frontend Developer",
    aliases: ["frontend","front-end","ui developer","react developer","angular developer"],
    required:  ["javascript","react","html","css","git","responsive design"],
    bonus:     ["typescript","next.js","vue","tailwind","redux","figma","testing"],
    jdKeywords:["ui","ux","component","responsive","cross-browser","accessibility"],
    salaryRange:"₹3.5L – ₹15L",
    demand:    "High",
  },
  {
    id: "backend",
    title: "Backend Developer",
    aliases: ["backend","back-end","server side","api developer","node developer","java developer"],
    required:  ["node.js","express","rest api","sql","git","authentication"],
    bonus:     ["docker","redis","kafka","microservices","aws","postgresql","mongodb"],
    jdKeywords:["api","server","database","performance","scalability","microservices"],
    salaryRange:"₹4L – ₹20L",
    demand:    "Very High",
  },
  {
    id: "aiml",
    title: "ML/AI Engineer",
    aliases: ["machine learning","ml engineer","ai engineer","data scientist","nlp engineer","deep learning"],
    required:  ["python","machine learning","numpy","pandas","scikit-learn","statistics"],
    bonus:     ["pytorch","tensorflow","keras","hugging face","langchain","sql","docker","aws","mlflow"],
    jdKeywords:["model","training","inference","dataset","pipeline","accuracy","evaluation"],
    salaryRange:"₹6L – ₹30L",
    demand:    "Very High",
  },
  {
    id: "data",
    title: "Data Analyst / Data Scientist",
    aliases: ["data analyst","data scientist","bi analyst","analytics","business intelligence"],
    required:  ["python","sql","pandas","numpy","excel","data visualization"],
    bonus:     ["tableau","power bi","matplotlib","seaborn","spark","airflow","dbt","r"],
    jdKeywords:["analysis","insights","dashboard","report","kpi","metrics","query"],
    salaryRange:"₹4L – ₹16L",
    demand:    "High",
  },
  {
    id: "devops",
    title: "DevOps / Cloud Engineer",
    aliases: ["devops","cloud engineer","sre","platform engineer","infrastructure","site reliability"],
    required:  ["linux","docker","ci/cd","git","bash","aws"],
    bonus:     ["kubernetes","terraform","ansible","jenkins","github actions","azure","gcp","prometheus"],
    jdKeywords:["deployment","pipeline","automation","infrastructure","monitoring","reliability"],
    salaryRange:"₹6L – ₹28L",
    demand:    "Very High",
  },
  {
    id: "mobile",
    title: "Mobile App Developer",
    aliases: ["android developer","ios developer","flutter developer","react native","mobile developer"],
    required:  ["flutter","dart","android","kotlin","react native","javascript","git"],
    bonus:     ["swift","ios","firebase","rest api","state management","testing"],
    jdKeywords:["mobile","app","android","ios","cross-platform","publish","store"],
    salaryRange:"₹4L – ₹18L",
    demand:    "High",
  },
  {
    id: "blockchain",
    title: "Blockchain Developer",
    aliases: ["blockchain","web3","smart contract","solidity","defi","crypto"],
    required:  ["solidity","web3.js","ethereum","javascript","git"],
    bonus:     ["hardhat","truffle","ipfs","defi","nft","react","node.js"],
    jdKeywords:["smart contract","dapp","defi","nft","consensus","token","wallet"],
    salaryRange:"₹6L – ₹35L",
    demand:    "Medium",
  },
  {
    id: "security",
    title: "Security / Cybersecurity Engineer",
    aliases: ["cybersecurity","security engineer","ethical hacker","penetration tester","ctf","infosec"],
    required:  ["networking","linux","python","penetration testing","security"],
    bonus:     ["burpsuite","metasploit","wireshark","ctf","aws security","docker","siem"],
    jdKeywords:["vulnerability","threat","incident","compliance","firewall","audit","encryption"],
    salaryRange:"₹5L – ₹25L",
    demand:    "High",
  },
  {
    id: "sde",
    title: "Software Developer / SDE",
    aliases: ["software developer","sde","software engineer","programmer","developer"],
    required:  ["data structures","algorithms","git","oop","problem solving"],
    bonus:     ["system design","sql","docker","any backend language","testing"],
    jdKeywords:["software","develop","engineer","code","system","design","scale"],
    salaryRange:"₹3.5L – ₹20L",
    demand:    "Very High",
  },
];

// ── 2. SKILLS METADATA ────────────────────────────────────────────
const SKILLS_META = {
  // Languages
  "python":        { cat:"Language",   priority:"High",   resource:"cs50p.harvard.edu", time:"4 weeks" },
  "javascript":    { cat:"Language",   priority:"High",   resource:"javascript.info",   time:"4 weeks" },
  "typescript":    { cat:"Language",   priority:"High",   resource:"typescriptlang.org",time:"2 weeks" },
  "java":          { cat:"Language",   priority:"Medium", resource:"mooc.fi/en/programming-basics",time:"6 weeks" },
  "c++":           { cat:"Language",   priority:"Medium", resource:"learncpp.com",       time:"6 weeks" },
  "go":            { cat:"Language",   priority:"Medium", resource:"go.dev/tour",        time:"3 weeks" },
  "kotlin":        { cat:"Language",   priority:"Medium", resource:"kotlinlang.org",     time:"3 weeks" },
  // Web
  "react":         { cat:"Frontend",   priority:"High",   resource:"react.dev",          time:"3 weeks" },
  "next.js":       { cat:"Frontend",   priority:"High",   resource:"nextjs.org/learn",   time:"2 weeks" },
  "node.js":       { cat:"Backend",    priority:"High",   resource:"nodejs.org/en/learn",time:"3 weeks" },
  "express":       { cat:"Backend",    priority:"High",   resource:"expressjs.com",      time:"1 week"  },
  "django":        { cat:"Backend",    priority:"Medium", resource:"docs.djangoproject.com",time:"3 weeks" },
  "fastapi":       { cat:"Backend",    priority:"High",   resource:"fastapi.tiangolo.com",time:"2 weeks" },
  "graphql":       { cat:"API",        priority:"Medium", resource:"graphql.org/learn",  time:"2 weeks" },
  // Data/AI
  "machine learning":{ cat:"AI/ML",   priority:"High",   resource:"fast.ai",            time:"8 weeks" },
  "deep learning": { cat:"AI/ML",     priority:"High",   resource:"fast.ai",            time:"6 weeks" },
  "pytorch":       { cat:"AI/ML",     priority:"High",   resource:"pytorch.org/tutorials",time:"4 weeks" },
  "tensorflow":    { cat:"AI/ML",     priority:"Medium", resource:"tensorflow.org/tutorials",time:"4 weeks" },
  "pandas":        { cat:"Data",      priority:"High",   resource:"pandas.pydata.org",  time:"2 weeks" },
  "numpy":         { cat:"Data",      priority:"High",   resource:"numpy.org/learn",    time:"1 week"  },
  "sql":           { cat:"Database",  priority:"High",   resource:"sqlzoo.net",         time:"2 weeks" },
  "scikit-learn":  { cat:"AI/ML",     priority:"High",   resource:"scikit-learn.org",   time:"3 weeks" },
  // Cloud/DevOps
  "docker":        { cat:"DevOps",    priority:"High",   resource:"docs.docker.com/get-started",time:"1 week" },
  "kubernetes":    { cat:"DevOps",    priority:"Medium", resource:"kubernetes.io/docs/tutorials",time:"3 weeks" },
  "aws":           { cat:"Cloud",     priority:"High",   resource:"aws.amazon.com/training/free",time:"4 weeks" },
  "azure":         { cat:"Cloud",     priority:"Medium", resource:"learn.microsoft.com",time:"4 weeks" },
  "gcp":           { cat:"Cloud",     priority:"Medium", resource:"cloud.google.com/training/free",time:"4 weeks" },
  "ci/cd":         { cat:"DevOps",    priority:"High",   resource:"github.com/features/actions",time:"1 week" },
  "terraform":     { cat:"DevOps",    priority:"Medium", resource:"developer.hashicorp.com/terraform",time:"2 weeks" },
  "linux":         { cat:"OS",        priority:"High",   resource:"linuxcommand.org",   time:"2 weeks" },
  // Databases
  "mongodb":       { cat:"Database",  priority:"High",   resource:"mongodb.com/docs/manual",time:"1 week" },
  "postgresql":    { cat:"Database",  priority:"High",   resource:"postgresql.org/docs/tutorial",time:"1 week" },
  "redis":         { cat:"Database",  priority:"Medium", resource:"redis.io/docs",      time:"1 week"  },
  "firebase":      { cat:"Database",  priority:"Medium", resource:"firebase.google.com/docs",time:"1 week" },
  // Tools
  "git":           { cat:"Tool",      priority:"High",   resource:"learngitbranching.js.org",time:"3 days" },
  "docker":        { cat:"Tool",      priority:"High",   resource:"docs.docker.com",    time:"1 week"  },
  "figma":         { cat:"Design",    priority:"Low",    resource:"figma.com/resources",time:"1 week"  },
  "system design": { cat:"Concept",  priority:"High",   resource:"systemdesignprimer.com",time:"6 weeks" },
  "data structures":{ cat:"Concept", priority:"High",   resource:"neetcode.io",        time:"6 weeks" },
  "algorithms":    { cat:"Concept",   priority:"High",   resource:"neetcode.io",        time:"6 weeks" },
};

// ── 3. DOMAIN ROADMAPS ────────────────────────────────────────────
const ROADMAPS = {
  "Full Stack": [
    "Master HTML + CSS basics (1 week)",
    "Learn JavaScript thoroughly — ES6+, async, DOM (3 weeks)",
    "Build with React — components, hooks, state (3 weeks)",
    "Learn Node.js + Express — REST APIs (2 weeks)",
    "Add MongoDB or PostgreSQL (1 week)",
    "Deploy a full project on Vercel + Render (1 week)",
    "Add TypeScript to your React project (1 week)",
    "Learn Docker basics for containerisation (1 week)",
  ],
  "AI/ML": [
    "Python fundamentals + NumPy + Pandas (3 weeks)",
    "Statistics and probability basics (2 weeks)",
    "Scikit-learn — classical ML algorithms (3 weeks)",
    "Deep Learning with PyTorch — fast.ai course (4 weeks)",
    "Build and deploy an end-to-end ML project (2 weeks)",
    "Learn NLP basics — transformers, HuggingFace (3 weeks)",
    "Experiment tracking — MLflow or W&B (1 week)",
    "LLM fine-tuning and LangChain (3 weeks)",
  ],
  "DevOps/Cloud": [
    "Linux fundamentals — shell, permissions, processes (2 weeks)",
    "Git + GitHub Actions CI/CD pipelines (1 week)",
    "Docker — images, containers, compose (2 weeks)",
    "AWS Free Tier — EC2, S3, IAM, RDS (3 weeks)",
    "Kubernetes basics — pods, deployments, services (3 weeks)",
    "Infrastructure as Code with Terraform (2 weeks)",
    "Monitoring with Prometheus + Grafana (1 week)",
    "Get AWS Cloud Practitioner certified (2 weeks)",
  ],
  "Frontend": [
    "HTML5 + CSS3 + Flexbox + Grid mastery (2 weeks)",
    "JavaScript ES6+ in depth (3 weeks)",
    "React — hooks, context, routing (3 weeks)",
    "TypeScript fundamentals (2 weeks)",
    "Next.js — SSR, SSG, App Router (2 weeks)",
    "Testing — React Testing Library + Jest (1 week)",
    "Build and deploy 3 portfolio projects (2 weeks)",
    "Learn Figma basics for UI understanding (1 week)",
  ],
  "Backend": [
    "Pick a language — Node.js or Python (2 weeks)",
    "REST API design principles (1 week)",
    "Express / FastAPI — build CRUD APIs (2 weeks)",
    "SQL fundamentals — PostgreSQL (2 weeks)",
    "Authentication — JWT, OAuth (1 week)",
    "Caching with Redis (1 week)",
    "Docker + basic deployment (1 week)",
    "System design basics (3 weeks)",
  ],
  "Mobile": [
    "Dart language basics (1 week)",
    "Flutter fundamentals — widgets, state (3 weeks)",
    "Navigation + state management (Riverpod/Bloc) (2 weeks)",
    "REST API integration + Firebase (2 weeks)",
    "Build and publish an Android app (2 weeks)",
    "Add iOS build (requires Mac) (1 week)",
    "Testing + CI/CD for mobile (1 week)",
  ],
  "Data Science": [
    "Python + Pandas + NumPy (3 weeks)",
    "SQL — complex queries, joins, subqueries (2 weeks)",
    "Statistics + probability (2 weeks)",
    "Data visualisation — Matplotlib, Seaborn, Plotly (1 week)",
    "Machine Learning with Scikit-learn (3 weeks)",
    "Tableau or Power BI (2 weeks)",
    "End-to-end project — Kaggle competition (2 weeks)",
    "Learn Spark basics for big data (2 weeks)",
  ],
  "Cybersecurity": [
    "Networking fundamentals — TCP/IP, DNS, HTTP (2 weeks)",
    "Linux + Bash scripting (2 weeks)",
    "Python for security scripting (2 weeks)",
    "Web application security — OWASP Top 10 (2 weeks)",
    "Burp Suite + OWASP Juice Shop practice (2 weeks)",
    "Try HTB or TryHackMe — beginner rooms (ongoing)",
    "Network security + Wireshark (2 weeks)",
    "Prepare for CEH or CompTIA Security+ (6 weeks)",
  ],
  "Blockchain": [
    "Ethereum fundamentals + how blockchain works (1 week)",
    "Solidity basics — contracts, variables, functions (3 weeks)",
    "Hardhat development environment (1 week)",
    "Build an ERC-20 token contract (1 week)",
    "Web3.js / Ethers.js — frontend integration (2 weeks)",
    "Build a DApp with React + MetaMask (2 weeks)",
    "DeFi protocols — Uniswap, Aave concepts (2 weeks)",
    "Security auditing basics for smart contracts (2 weeks)",
  ],
};

// ── 4. DETERMINISTIC ATS RULES ────────────────────────────────────
const ATS_RULES = [
  { id:"email",    test: t => /\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/i.test(t),                    issue:"No email address detected",                      severity:"critical" },
  { id:"phone",    test: t => /(\+91|91\s*[-.]?\s*)?[6-9]\d{9}/.test(t),                    issue:"No valid Indian phone number found",              severity:"critical" },
  { id:"length_s", test: t => t.trim().split(/\s+/).length >= 200,                           issue:"Resume too short (under 200 words) — ATS may reject", severity:"high" },
  { id:"length_l", test: t => t.trim().split(/\s+/).length <= 1200,                          issue:"Resume too long (over 1200 words) — trim to 1–2 pages", severity:"medium" },
  { id:"linkedin", test: t => /linkedin\.com\/in\//i.test(t),                                issue:"No LinkedIn URL — add linkedin.com/in/yourname", severity:"high" },
  { id:"github",   test: t => /github\.com\/[\w-]+/i.test(t),                                issue:"No GitHub URL — required for most software roles", severity:"high" },
  { id:"skills",   test: t => /skills|technologies|tech stack|proficient/i.test(t),          issue:"No Skills section detected — ATS scans for this keyword", severity:"critical" },
  { id:"education",test: t => /education|university|college|degree|b\.tech|b\.e\b/i.test(t), issue:"No Education section detected",                  severity:"high" },
  { id:"pipes",    test: t => (t.match(/\|/g)||[]).length <= 8,                               issue:"Too many pipe characters (|) — breaks ATS column parsing", severity:"medium" },
  { id:"tables",   test: t => (t.match(/\t/g)||[]).length <= 15,                              issue:"Excessive tabs detected — table layout breaks ATS extraction", severity:"medium" },
  { id:"special",  test: t => (t.match(/[^\x00-\x7F]/g)||[]).length <= 30,                   issue:"Many special/unicode characters detected — may cause ATS garbling", severity:"low" },
  { id:"sections", test: t => {
      const found = ["experience|work|internship","project","skill","education|degree","certification|certificate"].filter(kw=>new RegExp(kw,"i").test(t));
      return found.length >= 3;
    }, issue:"Fewer than 3 standard sections detected — add Experience, Skills, Projects, Education", severity:"critical" },
];

// ── 5. SECTION DETECTION KEYWORDS ────────────────────────────────
const SECTION_KW = {
  education:      ["b.tech","b.e","b.sc","m.tech","mba","phd","bachelor","master","degree","university","college","cgpa","gpa","10th","12th","graduation","engineering","iit","nit","bits","vit","srm","manipal"],
  skills:         ["skills","tech stack","technologies","tools","languages","frameworks","libraries","proficient","expertise","programming","core competencies","technical skills"],
  projects:       ["project","built","developed","created","implemented","deployed","application","platform","website","system","api","model","github.com","live demo"],
  experience:     ["experience","internship","intern","worked","job","role","position","company","startup","responsibilities","month","year","tenure","employed","full-time","part-time"],
  certifications: ["certificate","certification","certified","coursera","udemy","nptel","aws certified","google","microsoft","linkedin learning","edx","credly","badge"],
  summary:        ["summary","objective","profile","about me","career objective","professional summary"],
  achievements:   ["achievement","award","winner","rank","scholarship","honour","honor","merit","recognition","1st","2nd","3rd","gold","silver"],
};

// ── 6. ALL TECH SKILLS (for rule-based detection) ─────────────────
const ALL_SKILLS = [
  "python","java","javascript","typescript","c++","c#","go","golang","rust","kotlin","swift","php","ruby","scala","r",
  "react","angular","vue","next.js","nextjs","node.js","nodejs","express","django","flask","fastapi","spring","spring boot","laravel","rails",
  "html","css","tailwind","bootstrap","sass","scss","redux","graphql","rest api","restful","websocket",
  "machine learning","deep learning","nlp","computer vision","tensorflow","pytorch","keras","scikit-learn","hugging face","langchain","openai","llm","generative ai","transformers",
  "pandas","numpy","matplotlib","seaborn","plotly","scipy","statsmodels",
  "aws","azure","gcp","google cloud","docker","kubernetes","ci/cd","github actions","jenkins","travis","terraform","ansible","linux","bash","shell",
  "mysql","postgresql","mongodb","redis","firebase","sqlite","oracle","elasticsearch","dynamodb","cassandra","supabase",
  "android","ios","flutter","react native","dart","swift","kotlin",
  "git","github","gitlab","bitbucket","agile","scrum","jira","figma","postman","swagger","vscode",
  "blockchain","solidity","web3","web3.js","ethers.js","hardhat","truffle","ethereum","defi","nft","ipfs",
  "cybersecurity","penetration testing","burpsuite","metasploit","wireshark","owasp","ctf","ethical hacking",
  "tableau","power bi","excel","sql","spark","hadoop","airflow","dbt","kafka","rabbitmq","nginx",
  "data structures","algorithms","system design","oop","design patterns","microservices","devops","mlops",
];

// ── RAG RETRIEVAL FUNCTIONS ───────────────────────────────────────

/**
 * Score a role against detected skills using keyword overlap.
 * Returns 0–100.
 */
function scoreRoleMatch(role, detectedSkills) {
  const ds = detectedSkills.map(s => s.toLowerCase());
  const req = role.required.length;
  const reqHits = role.required.filter(s => ds.some(d => d.includes(s) || s.includes(d))).length;
  const bonHits = role.bonus.filter(s => ds.some(d => d.includes(s) || s.includes(d))).length;
  const reqScore = req ? (reqHits / req) * 70 : 0;
  const bonScore = Math.min(30, bonHits * 5);
  return Math.round(reqScore + bonScore);
}

/**
 * Retrieve top N matching roles for a given set of detected skills.
 */
function retrieveTopRoles(detectedSkills, n = 3) {
  return ROLES
    .map(role => ({ ...role, score: scoreRoleMatch(role, detectedSkills) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

/**
 * Retrieve skill metadata + learning steps for missing skills.
 */
function retrieveSkillRoadmap(missingSkills, topRoles, limit = 6) {
  const priority = new Map();

  // Weight missing skills that appear in top role requirements
  for (const role of topRoles) {
    for (const s of role.required) {
      const cur = priority.get(s) || 0;
      priority.set(s, cur + 2);
    }
    for (const s of role.bonus) {
      const cur = priority.get(s) || 0;
      priority.set(s, cur + 1);
    }
  }

  return missingSkills
    .map(skill => {
      const meta  = SKILLS_META[skill.toLowerCase()] || {};
      const score = priority.get(skill.toLowerCase()) || 0;
      return {
        skill,
        priority: score >= 4 ? "High" : score >= 2 ? "Medium" : "Low",
        reason:   meta.resource ? `Essential for target roles — learn via ${meta.resource}` : `Common requirement in Indian software job postings`,
        learning_steps: meta.resource ? [
          `Start with ${meta.resource}`,
          `Build one small project using ${skill}`,
          `Add to resume Skills section + GitHub`,
          meta.time ? `Estimated time: ${meta.time}` : "Estimated time: 1–3 weeks",
        ] : [`Search "${skill} tutorial for beginners"`, `Build a small project`, `Add to resume + GitHub`],
        _score: score,
      };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, limit)
    .map(({ _score, ...rest }) => rest);
}

/**
 * Retrieve domain roadmap steps.
 */
function retrieveDomainRoadmap(domain) {
  const key = Object.keys(ROADMAPS).find(k => domain.toLowerCase().includes(k.toLowerCase()));
  return key ? ROADMAPS[key] : null;
}

/**
 * Run all deterministic ATS checks.
 * Returns { score, format_issues, keyword_issues, section_detection, section_hits }
 */
function runATSChecks(text) {
  const t = text.toLowerCase();

  // ATS rule checks
  const failed = ATS_RULES.filter(rule => !rule.test(text));
  const format_issues  = failed.filter(r => ["pipes","tables","special","length_s","length_l"].includes(r.id)).map(r => r.issue);
  const keyword_issues = failed.filter(r => ["skills","education","sections"].includes(r.id)).map(r => r.issue);
  const contact_issues = failed.filter(r => ["email","phone","linkedin","github"].includes(r.id)).map(r => r.issue);

  const all_issues = [...contact_issues, ...format_issues, ...keyword_issues];

  // Section detection
  const sectionScores = Object.entries(SECTION_KW).map(([sec, kws]) => ({
    section: sec,
    hits: kws.filter(k => t.includes(k)).length,
  }));
  const detected = sectionScores.filter(s => s.hits > 0).length;
  const section_detection = detected >= 5 ? "Good" : detected >= 3 ? "Medium" : "Poor";

  // ATS score: start at 100, deduct per severity
  let atsScore = 100;
  for (const r of failed) {
    if (r.severity === "critical") atsScore -= 18;
    else if (r.severity === "high")   atsScore -= 10;
    else if (r.severity === "medium") atsScore -= 5;
    else                              atsScore -= 2;
  }
  atsScore = Math.max(10, Math.min(100, atsScore));

  return { ats_score: atsScore, format_issues, keyword_issues, contact_issues, section_detection, all_issues };
}

/**
 * Detect tech skills from resume text.
 */
function detectSkills(text) {
  const t = text.toLowerCase();
  const found = [];
  for (const skill of ALL_SKILLS) {
    const pattern = new RegExp(`\\b${skill.replace(/[.+]/g, "\\$&")}\\b`, "i");
    if (pattern.test(t) && !found.includes(skill)) found.push(skill);
  }
  return found;
}

/**
 * Detect resume type from text.
 */
function detectResumeType(text) {
  const t = text.toLowerCase();
  const expYears = t.match(/\b(\d+)\s*\+?\s*(year|yr)s?\s*(of\s*)?(experience|exp)\b/i);
  if (expYears && parseInt(expYears[1]) >= 2) return "Experienced";
  if (/\bfresher\b|\bfresh graduate\b|\bentry.?level\b/i.test(t)) return "Fresher";
  if ((t.match(/intern/gi)||[]).length >= 2) return "Internship";
  if (/work experience|professional experience|employment/i.test(t)) return "Experienced";
  return "Fresher";
}

/**
 * Detect section presence and score each.
 */
function detectSections(text) {
  const t = text.toLowerCase();
  const result = {};
  for (const [sec, kws] of Object.entries(SECTION_KW)) {
    const hits = kws.filter(k => t.includes(k)).length;
    result[sec] = { hits, present: hits > 0 };
  }
  return result;
}

module.exports = {
  ROLES, SKILLS_META, ROADMAPS, ATS_RULES, SECTION_KW, ALL_SKILLS,
  retrieveTopRoles, retrieveSkillRoadmap, retrieveDomainRoadmap,
  runATSChecks, detectSkills, detectResumeType, detectSections, scoreRoleMatch,
};
