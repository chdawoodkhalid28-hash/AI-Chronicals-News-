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
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + process.env.OPENAI_API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(55000)
      });
      const data = await response.json();
      if (!response.ok) {
        const message = data && data.error && data.error.message ? data.error.message : "Upstream AI request failed";
        const error = new Error(message);
        error.status = response.status;
        if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
          await new Promise(resolve => setTimeout(resolve, 900));
          lastError = error;
          continue;
        }
        throw error;
      }
      const message = data.choices && data.choices[0] && data.choices[0].message;
      if (!message || typeof message.content !== "string" || !message.content.trim()) {
        const error = new Error("AI returned an empty response");
        error.status = 502;
        throw error;
      }
      return message;
    } catch (error) {
      lastError = error;
      if (attempt === 0 && (!error.status || error.status >= 500)) {
        await new Promise(resolve => setTimeout(resolve, 900));
        continue;
      }
      throw error;
    }
  }
  throw lastError || new Error("Upstream AI request failed");
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const expected = process.env.ADMIN_PASSWORD || process.env.ADMINPASSWORD;
  const supplied = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
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
          content: "Assignment: " + instruction + "\nDepartment: " + title + "\nBuland central context (not a substitute for independent research): " + centralBrief
        }
      ]
    });

    const annotations = Array.isArray(searchMessage.annotations) ? searchMessage.annotations : [];
    const seen = new Set();
    const sources = annotations
      .filter(item => item && item.url_citation && /^https:\/\//i.test(item.url_citation.url || ""))
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

    // Five specialist roles run as separate model invocations under this department Director.
    const dossierContext = JSON.stringify({ department, title, instruction, researchBrief, sources });
    const roleSpecs = [
      {
        key: "researchTeam",
        name: "Research Specialist",
        task: "Structure the research dossier into keyFacts, timeline, context, claimsNeedingVerification, sourceLimitations. Distinguish sourced facts from allegations and unknowns. Do not add facts absent from the dossier."
      },
      {
        key: "storylineTeam",
        name: "Storyline Editor",
        task: "Write a clear, balanced news headline, dek, category, article and socialCaption. Use only facts in the dossier. Attribute claims and preserve uncertainty."
      },
      {
        key: "factCheckTeam",
        name: "Evidence Audit Specialist",
        task: "Audit each material claim against the supplied dossier and citations. Do not claim to have opened sources or independently verified them. Return overallStatus PASS, REVISE or HOLD, claimChecks with claim/evidence/status, missingEvidence and riskNotes. Mark HOLD when serious claims lack support."
      },
      {
        key: "graphicsTeam",
        name: "Graphics & Visuals Designer",
        task: "Create visualConcept, layoutBrief, infographicData, imagePrompt, caption, altText and rightsAndAuthenticityChecks. Do not invent data, claim an image file was generated, or assume photo licensing."
      },
      {
        key: "presentationTeam",
        name: "Presentation & Distribution Producer",
        task: "Prepare contentOrder, websitePresentation, socialVariants, seoTitle, metaDescription and keywords. Do not claim anything was published or distributed."
      }
    ];
    const roleResults = await Promise.all(roleSpecs.map(async role => {
      const message = await openAIChat({
        model: "gpt-4.1-mini",
        temperature: 0.15,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "You are the " + role.name + " on the dedicated AI team reporting to Director " + title + " at AI Chronicals News. Work independently within your specialist remit. Output valid JSON only, in " + languageName + ". " + role.task + " Your JSON must contain the fields required by your task, and may include a concise executiveNote."
          },
          { role: "user", content: dossierContext }
        ]
      });
      let parsed;
      try { parsed = JSON.parse(message.content); }
      catch { throw new Error(role.name + " returned invalid JSON"); }
      return [role.key, parsed];
    }));

    const team = Object.fromEntries(roleResults);
    const malformedRole = roleSpecs.find(role =>
      !team[role.key] || typeof team[role.key] !== "object" || Array.isArray(team[role.key])
    );
    if (malformedRole) {
      const error = new Error(malformedRole.name + " returned an invalid structured result");
      error.status = 502;
      throw error;
    }

    const researchTeam = team.researchTeam;
    const factCheckTeam = team.factCheckTeam;
    const factStatus = String(factCheckTeam.overallStatus || "HOLD").toUpperCase();
    const validFactStatus = ["PASS", "REVISE", "HOLD"].includes(factStatus);
    const hasValidAudit = Array.isArray(researchTeam.claimsNeedingVerification) &&
      Array.isArray(factCheckTeam.claimChecks) &&
      factCheckTeam.claimChecks.length > 0 &&
      Array.isArray(factCheckTeam.missingEvidence);
    const hasMaterialGaps = researchTeam.claimsNeedingVerification.length > 0 ||
      factCheckTeam.missingEvidence.length > 0;
    // PASS is reserved for a structurally complete evidence audit with no declared gaps.
    const status = !validFactStatus || !hasValidAudit || factStatus === "HOLD" ? "HOLD" :
      factStatus === "PASS" && !hasMaterialGaps ? "PASS" : "REVISE";
    const result = {
      department,
      directorTitle: "Director " + title,
      status,
      executiveSummary: team.storylineTeam.dek || team.researchTeam.executiveNote || "Department package prepared for editorial review.",
      searchTeam: {
        searchFocus: title + " independent web search",
        sources
      },
      researchTeam: team.researchTeam,
      storylineTeam: team.storylineTeam,
      factCheckTeam: team.factCheckTeam,
      graphicsTeam: team.graphicsTeam,
      presentationTeam: team.presentationTeam,
      directorFindings: [
        "Search was performed independently for this department.",
        "Research, Storyline, Evidence Audit, Graphics and Presentation were handled by separate model invocations."
      ],
      actionPlan: [
        ...(Array.isArray(team.researchTeam.claimsNeedingVerification) ? team.researchTeam.claimsNeedingVerification : []),
        ...(Array.isArray(team.factCheckTeam.missingEvidence) ? team.factCheckTeam.missingEvidence : [])
      ],
      issues: Array.isArray(team.factCheckTeam.riskNotes) ? team.factCheckTeam.riskNotes : [],
      directorRecommendation: status === "PASS" ?
        "Ready for human editorial review; not published." :
        "Do not publish until listed evidence gaps and editorial issues are resolved.",
      editorialStatus: "PENDING_ADMIN_APPROVAL",
      publication: "DISABLED",
      searchResearch: {
        independentSearchPerformed: true,
        sourceCount: sources.length,
        sources,
        dossier: researchBrief
      },
      executionModel: {
        search: "one independent web-search model invocation",
        specialistRoles: 5,
        roleNames: roleSpecs.map(role => role.name),
        note: "Each specialist role is a separate model invocation coordinated by this department Director; these are not persistent background services."
      }
    };
    return res.status(200).json({
      ok: true,
      department,
      directorTitle: result.directorTitle,
      status: result.status,
      result
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: "Department team execution failed",
      detail: error.message
    });
  }
}
