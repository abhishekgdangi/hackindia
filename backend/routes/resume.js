const express = require('express');
const router = express.Router();
const Groq = require('groq-sdk');

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

const cache = {};

router.post('/analyze', async (req, res) => {
  const { resumeText } = req.body;

  if (!resumeText || resumeText.trim().length < 50) {
    return res.status(400).json({ error: 'Resume text must be at least 50 characters.' });
  }

  const cacheKey = resumeText.trim().slice(0, 120);
  if (cache[cacheKey]) {
    return res.json(cache[cacheKey]);
  }

  const systemPrompt = `You are an expert ATS resume analyzer for Indian engineering students targeting software jobs.
Analyze the resume and respond ONLY with valid JSON. No markdown. No explanation outside JSON.
Return exactly this structure:
{
  "overall_score": <0-100>,
  "ats_score": <0-100>,
  "section_scores": {
    "education": <0-100>,
    "skills": <0-100>,
    "projects": <0-100>,
    "experience": <0-100>,
    "certifications": <0-100>
  },
  "skills_found": ["array of tech skills detected in resume"],
  "skills_missing": ["important skills for Indian software jobs not found in resume"],
  "strengths": ["3 to 5 specific things done well"],
  "suggestions": ["5 specific actionable improvements with exact wording changes"],
  "ats_warnings": ["specific things that will cause ATS parsing failure"],
  "resume_type": "fresher OR experienced OR internship",
  "target_roles": ["2 to 3 best-fit job roles based on this resume"],
  "one_line_verdict": "one punchy sentence summarizing the resume quality"
}`;

  const userPrompt = `Analyze this resume and return ONLY the JSON object described:\n\n${resumeText}`;

  try {
    const completion = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: 2000
    });

    let raw = completion.choices[0].message.content.trim();

    // Strip accidental markdown code fences
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();

    const parsed = JSON.parse(raw);
    cache[cacheKey] = parsed;
    return res.json(parsed);
  } catch (err) {
    console.error('[resume] Analysis error:', err.message);
    return res.status(500).json({ error: 'Analysis failed. Please try again.' });
  }
});

module.exports = router;
