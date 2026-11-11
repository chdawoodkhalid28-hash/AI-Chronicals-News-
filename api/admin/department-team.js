const DEPARTMENTS = {
  newsroom: "Newsroom / Editor-in-Chief",
  assignment_desk: "Assignment Desk",
  pakistan_desk: "Pakistan",
  provincial_local_desk: "Provincial & Local",
  politics_desk: "Politics",
  world_desk: "World",
  crime_desk: "Crime & Public Safety",
  courts_legal_desk: "Courts & Legal Affairs",
  business_economy_desk: "Business & Economy",
  finance_markets_desk: "Finance & Markets",
  sports_desk: "Sports",
  technology_ai_desk: "Technology & AI",
  science_health_desk: "Science & Health",
  climate_environment_desk: "Climate & Environment",
  education_desk: "Education",
  agriculture_desk: "Agriculture & Rural Affairs",
  research_desk: "Research",
  open_source_verification_desk: "Open-Source Verification",
  fact_check_desk: "Fact-Check",
  urdu_english_desk: "Urdu & English",
  copy_editing_desk: "Copy Editing",
  photo_visuals_desk: "Photo & Visuals",
  audience_social_desk: "Audience & Social Media",
  seo_distribution_desk: "SEO & Distribution",
  ethics_standards_desk: "Ethics & Standards",
  security_privacy_desk: "Security & Privacy"
};

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const crypto = require("crypto");
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function openAIChat(body) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + process.env.OPENAI_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok) {
    const message = data && data.error && data.error.message ? data.error.message : "Upstream AI request failed";
    const error = new Error(message);
    error.status = 502;
    throw error;
  }
  const message = data.choices && data.choices[0] && data.choices[0].message;
  if (!message || typeof message.content !== "string" || !message.content.trim()) {
    const error = new Error("AI returned an empty response");
    error.status = 502;
    throw error;
  }
  return message;
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
  const title = DEPARTMENTS[department];
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  const centralBrief = typeof body.centralBrief === "string" ? body.centralBrief.trim().slice(0, 9000) : "";
  const language = body.language === "en" ? "en" : "ur";
  if (!title) return res.status(400).json({ error: "Unknown department" });
  if (instruction.length < 8 || instruction.length > 3000) {
    return res.status(400).json({ error: "Instruction must contain 8 to 3000 characters" });
  }

  const languageName = language === "en" ? "English" : "clear Pakistani Urdu";
  try {
    // Each department performs its own web-search request; Buland's central brief is context only.
    const searchMessage = await openAIChat({
      model: "gpt-5-search-api",
      web_search_options: { search_context_size: "high" },
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "You are the dedicated Search & Research unit reporting only to the " + title + " Director at AI Chronicals News. Independently research the user's assignment from this department's perspective. Find current, relevant, credible sources; prioritize primary documents, official agencies, original datasets and reputable newsrooms. Separate confirmed facts, attributed claims, context, and unknowns. Include dates and precise locations. Do not invent facts, quotations, source titles or URLs. The central Buland brief is background only: independently search rather than simply repeat it. Return a concise structured research dossier in " + languageName + "."
        },
        {
          role: "user",
          content: "Assignment: " + instruction + "\\nDepartment: " + title + "\\nBuland central context (not a substitute for independent research): " + centralBrief
        }
      ]
    });

    const annotations = Array.isArray(searchMessage.annotations) ? searchMessage.annotations : [];
    const seen = new Set();
    const sources = annotations
      .filter(item => item && item.url_citation && /^https:\\/\\//i.test(item.url_citation.url || ""))
      .map(item => ({
        title: String(item.url_citation.title || "Web source").slice(0, 240),
        url: item.url_citation.url
      }))
      .filter(item => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
      })
      .slice(0, 8);

    const researchBrief = searchMessage.content.trim();
    if (!researchBrief || sources.length === 0) {
      return res.status(422).json({
        error: "Department search did not return a research brief with citable HTTPS sources. This department is not publication-ready.",
        department,
        directorTitle: "Director " + title,
        status: "HOLD",
        sourceCount: sources.length
      });
    }

    // The Director coordinates distinct Search, Research, Storyline, Graphics and Presentation workstreams.
    const packageMessage = await openAIChat({
      model: "gpt-4.1-mini",
      temperature: 0.15,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are Director " + title + " at AI Chronicals News. You command a department team with five workstreams: Search, Research, Storyline, Graphics, and Presentation. The Search & Research unit has supplied the dossier and cited links. Now coordinate the workstreams and return a complete, unpublished news package in " + languageName + ". Use only facts in the dossier; URLs are citations returned by search, not proof that every page was opened or independently verified. Do not invent quotes, numbers, dates, image credits, licensing, interviews or visual assets. If evidence is inadequate, mark HOLD and clearly list missing verification. Storyline must include a headline, summary and coherent article. Graphics must provide a practical creative brief, suggested layout and caption/alt text; do not claim an image file was generated. Presentation must provide a publish-ready content order and platform variants, not claim anything was published or distributed. Include source limitations. Return JSON only with this schema: {\"department\":\"\",\"directorTitle\":\"\",\"status\":\"PASS|REVISE|HOLD\",\"executiveSummary\":\"\",\"searchTeam\":{\"searchFocus\":\"\",\"sources\":[]},\"researchTeam\":{\"keyFacts\":[],\"timeline\":[],\"context\":[],\"claimsNeedingVerification\":[],\"sourceLimitations\":[]},\"storylineTeam\":{\"headline\":\"\",\"dek\":\"\",\"category\":\"\",\"article\":\"\",\"socialCaption\":\"\"},\"graphicsTeam\":{\"visualConcept\":\"\",\"layoutBrief\":\"\",\"infographicData\":[],\"imagePrompt\":\"\",\"caption\":\"\",\"altText\":\"\",\"rightsAndAuthenticityChecks\":[]},\"presentationTeam\":{\"contentOrder\":[],\"websitePresentation\":\"\",\"socialVariants\":[],\"seoTitle\":\"\",\"metaDescription\":\"\",\"keywords\":[]},\"directorFindings\":[],\"actionPlan\":[],\"issues\":[],\"directorRecommendation\":\"\",\"editorialStatus\":\"PENDING_ADMIN_APPROVAL\"}. PASS is allowed only when all material claims are supported by the dossier; otherwise use REVISE or HOLD."
        },
        {
          role: "user",
          content: JSON.stringify({
            department,
            directorTitle: "Director " + title,
            assignment: instruction,
            researchDossier: researchBrief,
            citedSources: sources
          })
        }
      ]
    });

    let result;
    try {
      result = JSON.parse(packageMessage.content);
    } catch {
      return res.status(502).json({ error: "Department team returned invalid JSON" });
    }
    result.department = department;
    result.directorTitle = "Director " + title;
    result.editorialStatus = "PENDING_ADMIN_APPROVAL";
    result.publication = "DISABLED";
    result.searchResearch = {
      independentSearchPerformed: true,
      sourceCount: sources.length,
      sources,
      dossier: researchBrief
    };
    return res.status(200).json({
      ok: true,
      department,
      directorTitle: result.directorTitle,
      status: result.status || "HOLD",
      result
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: "Department team execution failed",
      detail: error.message
    });
  }
}
