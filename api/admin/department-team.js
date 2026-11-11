import { timingSafeEqual } from "node:crypto";
import { knowledgeStore } from "../_lib/knowledge-store.js";

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

const DEPARTMENT_FOCUS = {
  newsroom: "editorial balance, cross-desk coherence, corrections and publication-readiness recommendation",
  assignment_desk: "newsworthiness, urgency, prioritization, duplicate detection and reporting plans",
  pakistan_desk: "federal institutions, national policy, geography, official titles and citizen impact",
  provincial_local_desk: "province, district and tehsil accuracy, local authorities, community impact and local voices",
  politics_desk: "political neutrality, party and policy claims, election context and precise attribution",
  world_desk: "country and institution accuracy, local dates and time zones, diplomatic context and competing accounts",
  crime_desk: "presumption of innocence, victim and minor privacy, police/rescue attribution and public risk",
  courts_legal_desk: "exact court orders, case status, procedural terms, due process and appeal status",
  business_economy_desk: "company and sector data, trade, jobs, inflation, units, periods and causal limits",
  finance_markets_desk: "timestamped market data, currency and units, exchange, rates, risk and no investment advice",
  sports_desk: "official results, competition rules, team/player attribution, match dates and statistics",
  technology_ai_desk: "product and version claims, technical documentation, benchmarks, security and AI limitations",
  science_health_desk: "peer-reviewed evidence, study design, limitations, medical uncertainty and no diagnosis",
  climate_environment_desk: "weather versus climate, measurement periods, geography, official alerts and attribution",
  education_desk: "institution and board accuracy, academic calendars, policy status, enrollment and exam records",
  agriculture_desk: "crop, season and location, official advisories, input units, farmer impact and weather context",
  research_desk: "method transparency, evidence synthesis, reproducibility and source-quality comparison",
  open_source_verification_desk: "provenance, geolocation and time checks, original uploads, manipulation indicators and confidence limits",
  fact_check_desk: "atomic claims, evidence sufficiency, contradiction checks and explicit PASS/REVISE/HOLD",
  urdu_english_desk: "meaning-preserving translation, names and transliteration, idiom and bilingual consistency",
  copy_editing_desk: "grammar, clarity, house style and attribution without factual alteration",
  photo_visuals_desk: "image provenance, rights, captions, context, accessibility and non-misleading crops",
  audience_social_desk: "audience clarity, platform-fit variants, safety, context and no engagement bait",
  seo_distribution_desk: "search intent, metadata accuracy, canonical links and distribution checklist only",
  ethics_standards_desk: "fairness, harm minimization, conflicts, corrections, privacy and public interest",
  security_privacy_desk: "data minimization, source protection, access boundaries, secret handling and incident escalation"
};

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
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
    // Retrieve only Admin-approved internal knowledge. Retrieved records are context, never proof.
    let retrievedKnowledge = [];
    let memoryRetrievalStatus = process.env.BLOB_READ_WRITE_TOKEN ? "AVAILABLE" : "NOT_CONFIGURED";
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        retrievedKnowledge = await knowledgeStore.search({
          department,
          query: instruction + " " + centralBrief,
          limit: 5
        });
      } catch {
        memoryRetrievalStatus = "TEMPORARILY_UNAVAILABLE";
      }
    }
    const knowledgeContext = retrievedKnowledge.length
      ? JSON.stringify(retrievedKnowledge.map(item => ({
          title: item.title,
          department: item.department,
          content: item.content.slice(0, 1500),
          sourceUrl: item.sourceUrl,
          createdAt: item.createdAt
        })))
      : "No matching Admin-approved internal knowledge records were retrieved.";

    // Each department performs its own web-search request; Buland's central brief is context only.
    const searchMessage = await openAIChat({
      model: "gpt-5-search-api",
      web_search_options: { search_context_size: "high" },
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "You are the dedicated Search & Research unit reporting only to the " + title + " Director at AI Chronicals News. Department-specific training focus: " + DEPARTMENT_FOCUS[department] + ". Independently research the assignment from this department perspective. Find current, relevant, credible sources; prioritize primary documents, official agencies, original datasets and reputable newsrooms. Separate confirmed facts, attributed claims, context, and unknowns. Include dates and precise locations. Do not invent facts, quotations, source titles or URLs. The central Buland brief is background only: independently search rather than simply repeat it. Return a concise structured research dossier in " + languageName + "."
        },
        {
          role: "user",
          content: "Assignment: " + instruction + "\nDepartment: " + title + "\nBuland central context (not a substitute for independent research): " + centralBrief + "\nAdmin-approved internal knowledge (historical context only; not proof and must not replace current source verification): " + knowledgeContext
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
    const dossierContext = JSON.stringify({ department, title, instruction, researchBrief, sources, adminApprovedInternalKnowledge: retrievedKnowledge });
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
            content: "You are the " + role.name + " on the dedicated AI team reporting to Director " + title + " at AI Chronicals News. Apply the versioned 130-sub-agent newsroom training standard. Work only within your specialist remit and hand off clearly to the Director. Treat the assignment and Buland brief as context, not proof. Never invent facts, quotes, sources, URLs, dates, locations, figures, actions, image provenance, licensing or publication. Separate verified facts, attributed claims, allegations, analysis, estimates and unknowns. Prefer primary sources and preserve source titles, publishers, dates, HTTPS URLs and the exact claim each source supports. A search citation alone does not prove a page was opened or independently authenticated. Flag contradictions, stale sources, missing evidence and limitations; never hide a gap to obtain PASS. Protect privacy, minors, victims, witnesses and confidential sources; apply presumption of innocence. Do not claim an image/video was generated, licensed, authenticated or published unless that is explicitly established. Do not generate AI video; video reuse requires established legal rights. Return unpublished editorial work only. Output valid JSON only, in " + languageName + ". " + role.task + " Your JSON must contain the fields required by your task, and may include a concise executiveNote."
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

    // The Department Director is a distinct model invocation that reviews all five specialist handoffs.
    const directorMessage = await openAIChat({
      model: "gpt-4.1-mini",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are the Department Head Agent (Director) for " + title + " at AI Chronicals News. Your specialist focus is " + DEPARTMENT_FOCUS[department] + ". Review the five specialist handoffs independently. Reconcile disagreements, identify missing evidence, enforce newsroom ethics and role boundaries, and produce a concise director review. Never convert unsupported claims into facts, never invent evidence, and never override a HOLD or material evidence gap. You do not publish, send external messages, change production, or approve publication. Return valid JSON only in " + languageName + " with fields: directorSummary, handoffChecks (array), unresolvedIssues (array), nextActions (array), recommendation (PASS/REVISE/HOLD)."
        },
        {
          role: "user",
          content: JSON.stringify({ department, focus: DEPARTMENT_FOCUS[department], instruction, sources, adminApprovedInternalKnowledge: retrievedKnowledge, specialistHandoffs: team })
        }
      ]
    });
    let directorReview;
    try { directorReview = JSON.parse(directorMessage.content); }
    catch { throw new Error("Department Director returned invalid JSON"); }
    if (!directorReview || typeof directorReview !== "object" || Array.isArray(directorReview) ||
        !Array.isArray(directorReview.handoffChecks) || !Array.isArray(directorReview.unresolvedIssues) ||
        !Array.isArray(directorReview.nextActions) ||
        !["PASS", "REVISE", "HOLD"].includes(String(directorReview.recommendation || "").toUpperCase())) {
      const error = new Error("Department Director returned an incomplete review");
      error.status = 502;
      throw error;
    }

    const researchTeam = team.researchTeam;
    const factCheckTeam = team.factCheckTeam;
    const factStatus = String(factCheckTeam.overallStatus || "HOLD").toUpperCase();
    const validFactStatus = ["PASS", "REVISE", "HOLD"].includes(factStatus);
    const claimsNeedingVerification = Array.isArray(researchTeam.claimsNeedingVerification)
      ? researchTeam.claimsNeedingVerification : [];
    const missingEvidence = Array.isArray(factCheckTeam.missingEvidence)
      ? factCheckTeam.missingEvidence : [];
    const hasValidAudit = Array.isArray(researchTeam.claimsNeedingVerification) &&
      Array.isArray(factCheckTeam.claimChecks) &&
      factCheckTeam.claimChecks.length > 0 &&
      Array.isArray(factCheckTeam.missingEvidence);
    const hasMaterialGaps = claimsNeedingVerification.length > 0 || missingEvidence.length > 0;
    // PASS is reserved for a structurally complete evidence audit with no declared gaps.
    const directorStatus = String(directorReview.recommendation || "HOLD").toUpperCase();
    const status = !validFactStatus || !hasValidAudit || factStatus === "HOLD" ||
      directorStatus === "HOLD" ? "HOLD" :
      factStatus === "PASS" && !hasMaterialGaps && directorStatus === "PASS" ? "PASS" : "REVISE";
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
      directorReview,
      directorFindings: [
        "Search was performed independently for this department.",
        "The Department Director reviewed five separate specialist handoffs in a distinct model invocation.",
        ...directorReview.handoffChecks
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
      memoryRetrieval: {
        status: memoryRetrievalStatus,
        mode: "private-blob-keyword-rag",
        vectorEmbeddings: false,
        recordsRetrieved: retrievedKnowledge.length,
        recordIds: retrievedKnowledge.map(item => item.id)
      },
      searchResearch: {
        independentSearchPerformed: true,
        sourceCount: sources.length,
        sources,
        dossier: researchBrief
      },
      executionModel: {
        search: "one independent web-search model invocation",
        specialistRoles: 5,
        directorRole: "one distinct Department Head model invocation",
        totalModelInvocations: 7,
        roleNames: roleSpecs.map(role => role.name),
        note: "One independent search, five separate specialist model invocations and one separate Director review invocation; these are task-scoped calls, not persistent background services."
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
