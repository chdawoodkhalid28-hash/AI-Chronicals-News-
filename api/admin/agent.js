const DEPARTMENTS = {
  newsroom: "Newsroom Lead — write the first complete neutral news draft.",
  assignment_desk: "Assignment Editor — assess newsworthiness, scope, missing context, and further reporting.",
  pakistan_desk: "Pakistan Desk — review Pakistan-specific facts, institutions, geography, dates, and context.",
  provincial_local_desk: "Provincial & Local Desk — review local relevance, district and province details, and place-name accuracy.",
  politics_desk: "Politics Desk — review political claims, attribution, balance, and neutral wording. Do not advocate.",
  world_desk: "World Desk — review international context, country names, diplomacy, and time references.",
  crime_desk: "Crime & Public Safety Desk — check allegations, presumption of innocence, victim privacy, and public safety.",
  courts_legal_desk: "Courts & Legal Affairs Desk — check legal terminology, case status, allegations versus findings, and due process.",
  business_economy_desk: "Business & Economy Desk — review economic claims, company names, market context, and figures.",
  finance_markets_desk: "Finance & Markets Desk — review rates, prices, market data, units, and time-sensitive claims.",
  sports_desk: "Sports Desk — review teams, players, competitions, scores, dates, and statistics.",
  technology_ai_desk: "Technology & AI Desk — review technical claims, product names, model names, and capability statements.",
  science_health_desk: "Science & Health Desk — review scientific and medical claims, evidence strength, and overstatement.",
  climate_environment_desk: "Climate & Environment Desk — review climate, weather, environmental claims, and measurements.",
  education_desk: "Education Desk — review institutions, examination details, policy wording, and statistics.",
  agriculture_desk: "Agriculture & Rural Affairs Desk — review crops, inputs, pests, yields, seasons, and rural context.",
  research_desk: "Research Desk — identify missing primary sources, background, corroboration, and open questions.",
  open_source_verification_desk: "Open-Source Verification Desk — assess whether supplied excerpts support claims. Do not claim to open URLs.",
  fact_check_desk: "Fact-Check Desk — classify claims as supported, unsupported, contradicted, or requiring verification.",
  urdu_english_desk: "Urdu & English Language Desk — check translation, names, transliteration, readability, and consistency.",
  copy_editing_desk: "Copy Editor — check grammar, structure, clarity, repetition, headline accuracy, and style.",
  photo_visuals_desk: "Photo & Visuals Desk — recommend only lawfully sourced visuals; flag misleading or unverifiable image needs.",
  audience_social_desk: "Audience & Social Desk — suggest factual audience summaries and safe social framing; avoid clickbait.",
  seo_distribution_desk: "SEO & Distribution Desk — suggest accurate search terms and metadata without sensationalism.",
  ethics_standards_desk: "Ethics & Standards Editor — check harm, privacy, fairness, sourcing, and corrections risk.",
  security_privacy_desk: "Security & Privacy Desk — check personal data exposure, source safety, and sensitive details."
};

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const crypto = require("crypto");
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const expected = process.env.ADMIN_PASSWORD || process.env.ADMINPASSWORD;
  const supplied = (req.headers.authorization || "").replace(/^Bearer\\s+/i, "");
  if (!safeEqual(supplied, expected)) return res.status(401).json({ error: "Admin authentication failed" });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "OPENAI_API_KEY is not configured" });

  const body = req.body || {};
  const department = body.department;
  const topic = body.topic;
  const language = body.language === "en" ? "en" : "ur";
  const sources = body.sources || [];
  const draft = body.draft || null;
  if (!Object.prototype.hasOwnProperty.call(DEPARTMENTS, department)) return res.status(400).json({ error: "Unknown department" });
  if (typeof topic !== "string" || topic.trim().length < 8) return res.status(400).json({ error: "Topic must contain at least 8 characters" });
  if (!Array.isArray(sources) || sources.length < 1 || sources.length > 8) return res.status(400).json({ error: "Provide 1 to 8 source references" });
  const cleanSources = sources.map((s) => ({
    title: String(s.title || "").slice(0, 240),
    url: String(s.url || "").slice(0, 1000),
    excerpt: String(s.excerpt || "").slice(0, 5000)
  }));
  if (cleanSources.some((s) => !/^https:\/\//i.test(s.url) || !s.excerpt.trim())) {
    return res.status(400).json({ error: "Every source needs an HTTPS URL and excerpt" });
  }
  const isLead = department === "newsroom";
  if (!isLead && (!draft || typeof draft.article !== "string" || !draft.article.trim())) {
    return res.status(400).json({ error: "Review agents require the newsroom draft" });
  }

  const system = isLead
    ? "You are the independent Newsroom Lead agent for AI Chronicals News. Produce an unpublished neutral draft only. Never claim facts are independently verified beyond supplied excerpts. Do not invent names, quotes, dates, figures, or URLs. Flag gaps and conflicts. Write in " + (language === "en" ? "English" : "clear Pakistani Urdu") + '. Return JSON only: {"headline":"","dek":"","category":"","language":"' + language + '","article":"","sourceNotes":[],"factCheck":{"supportedByProvidedExcerpts":[],"needsVerification":[],"conflicts":[]}}. Cite only supplied source titles and URLs.'
    : "You are the separate " + DEPARTMENTS[department] + " You are one of 26 independently invoked department agents. Review the supplied draft and source excerpts from your department perspective only. Do not rewrite the whole article. Never claim you opened a URL or verified beyond supplied excerpts. Flag unsupported statements, risks, omissions, and concrete corrections. 'Not applicable' is acceptable. Write in " + (language === "en" ? "English" : "clear Pakistani Urdu") + '. Return JSON only: {"department":"' + department + '","status":"PASS|REVISE|HOLD","summary":"","issues":[],"recommendedChanges":[],"claimsNeedingVerification":[],"sourceLimitations":[]}';
  const payload = {
    topic: topic.trim(),
    language: language,
    sources: cleanSources
  };
  if (!isLead) payload.draft = {
    headline: draft.headline,
    dek: draft.dek,
    category: draft.category,
    article: draft.article,
    sourceNotes: draft.sourceNotes
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        temperature: isLead ? 0.2 : 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: JSON.stringify(payload) }
        ]
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(502).json({ error: "AI agent request failed", detail: data.error && data.error.message ? data.error.message : "Upstream error" });
    const raw = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : null;
    if (!raw) return res.status(502).json({ error: "AI agent returned empty output" });
    return res.status(200).json({ ok: true, department: department, result: JSON.parse(raw) });
  } catch (error) {
    return res.status(500).json({ error: "Agent execution failed", detail: error.message });
  }
}
