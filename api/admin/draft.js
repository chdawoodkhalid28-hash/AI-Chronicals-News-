import { timingSafeEqual } from "node:crypto";

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const expected = process.env.ADMIN_PASSWORD || process.env.ADMINPASSWORD;
  const supplied = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!safeEqual(supplied, expected)) {
    return res.status(401).json({ error: "Admin authentication failed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: "OPENAI_API_KEY is not configured for this deployment" });
  }

  const { topic, language = "ur", sources = [] } = req.body || {};
  if (typeof topic !== "string" || topic.trim().length < 8) {
    return res.status(400).json({ error: "Please provide a topic or event with at least 8 characters." });
  }
  if (!Array.isArray(sources) || sources.length === 0 || sources.length > 8) {
    return res.status(400).json({ error: "Provide 1 to 8 source references before drafting." });
  }
  const cleanSources = sources.map((s) => ({
    title: String(s.title || "").slice(0, 240),
    url: String(s.url || "").slice(0, 1000),
    excerpt: String(s.excerpt || "").slice(0, 5000)
  }));
  if (cleanSources.some((s) => !/^https:\/\//i.test(s.url) || !s.excerpt.trim())) {
    return res.status(400).json({ error: "Every source must include an https URL and a source excerpt." });
  }

  const system = `You are the editorial coordination desk of AI CHRONICALS NEWS. Create an unpublished draft only. Never claim that you independently verified a fact beyond the supplied source excerpts. If sources conflict or a key fact is missing, clearly flag it. Do not invent quotes, numbers, dates, names, or source URLs. Write in the requested language (ur means clear Pakistani Urdu; en means English). Return valid JSON only with this shape:
{
 "headline": "...",
 "dek": "...",
 "category": "Pakistan|World|Politics|Business|Sports|Technology|Weather|Crime|Education|Agriculture|Science|Environment",
 "language": "ur|en",
 "article": "...",
 "sourceNotes": ["..."],
 "factCheck": {"confirmedFromProvidedSources":["..."],"needsHumanVerification":["..."],"conflicts":["..."]},
 "departmentReviews": {
  "editor_in_chief": "Review note from Editor-in-Chief",
  "assignment_desk": "Review note from Assignment Desk",
  "pakistan_desk": "Review note from Pakistan Desk",
  "provincial_local_desk": "Review note from Provincial & Local Desk",
  "politics_desk": "Review note from Politics Desk",
  "world_desk": "Review note from World Desk",
  "crime_desk": "Review note from Crime & Public Safety Desk",
  "courts_legal_desk": "Review note from Courts & Legal Affairs Desk",
  "business_economy_desk": "Review note from Business & Economy Desk",
  "finance_markets_desk": "Review note from Finance & Markets Desk",
  "sports_desk": "Review note from Sports Desk",
  "technology_ai_desk": "Review note from Technology & AI Desk",
  "science_health_desk": "Review note from Science & Health Desk",
  "climate_environment_desk": "Review note from Climate & Environment Desk",
  "education_desk": "Review note from Education Desk",
  "agriculture_desk": "Review note from Agriculture & Rural Affairs Desk",
  "research_desk": "Review note from Research Desk",
  "open_source_verification_desk": "Review note from Open-Source Verification Desk",
  "fact_check_desk": "Review note from Fact-Check Desk",
  "urdu_english_desk": "Review note from Urdu & English Language Desk",
  "copy_editing_desk": "Review note from Copy Editing Desk",
  "photo_visuals_desk": "Review note from Photo & Visuals Desk",
  "audience_social_desk": "Review note from Audience & Social Media Desk",
  "seo_distribution_desk": "Review note from SEO & Distribution Desk",
  "ethics_standards_desk": "Review note from Ethics & Standards Desk",
  "security_privacy_desk": "Review note from Security & Privacy Desk"
 },
 "editorialStatus": "PENDING_ADMIN_APPROVAL",
 "reviewModel": "single-model multi-desk perspective; not independent agents"
}
Prepare a concise, specific review note for every listed department. These are role-based review perspectives in one model call, not separate autonomous agents and not independent verification. A department may say "not applicable" when appropriate. Keep the article neutral, attributed, and proportionate to the evidence. Cite supplied source titles/URLs in sourceNotes. Do not publish or imply publication.

Departments:
- Editor-in-Chief (editor_in_chief)
- Assignment Desk (assignment_desk)
- Pakistan Desk (pakistan_desk)
- Provincial & Local Desk (provincial_local_desk)
- Politics Desk (politics_desk)
- World Desk (world_desk)
- Crime & Public Safety Desk (crime_desk)
- Courts & Legal Affairs Desk (courts_legal_desk)
- Business & Economy Desk (business_economy_desk)
- Finance & Markets Desk (finance_markets_desk)
- Sports Desk (sports_desk)
- Technology & AI Desk (technology_ai_desk)
- Science & Health Desk (science_health_desk)
- Climate & Environment Desk (climate_environment_desk)
- Education Desk (education_desk)
- Agriculture & Rural Affairs Desk (agriculture_desk)
- Research Desk (research_desk)
- Open-Source Verification Desk (open_source_verification_desk)
- Fact-Check Desk (fact_check_desk)
- Urdu & English Language Desk (urdu_english_desk)
- Copy Editing Desk (copy_editing_desk)
- Photo & Visuals Desk (photo_visuals_desk)
- Audience & Social Media Desk (audience_social_desk)
- SEO & Distribution Desk (seo_distribution_desk)
- Ethics & Standards Desk (ethics_standards_desk)
- Security & Privacy Desk (security_privacy_desk)`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify({ topic: topic.trim(), language, sources: cleanSources }) }
        ]
      })
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(502).json({ error: "AI draft service returned an error", detail: data.error?.message || "Upstream request failed" });
    }
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) return res.status(502).json({ error: "AI draft service returned an empty response" });
    const parsed = JSON.parse(raw);
    parsed.editorialStatus = "PENDING_ADMIN_APPROVAL";
    return res.status(200).json({ ok: true, draft: parsed });
  } catch (error) {
    return res.status(500).json({ error: "Draft generation failed", detail: error.message });
  }
}
