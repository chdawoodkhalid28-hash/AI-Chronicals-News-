import { timingSafeEqual } from "node:crypto";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const expected = process.env.ADMIN_PASSWORD || process.env.ADMINPASSWORD;
  const supplied = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const safeEqual = (a, b) => {
    if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
    const left = Buffer.from(a), right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  };
  if (!safeEqual(supplied, expected)) return res.status(401).json({ error: "Admin authentication failed" });
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: "OPENAI_API_KEY is not configured" });

  const body = req.body || {};
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  const language = body.language === "en" ? "en" : "ur";
  if (instruction.length < 8 || instruction.length > 3000) {
    return res.status(400).json({ error: "Instruction must contain 8 to 3000 characters" });
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5-search-api",
        web_search_options: { search_context_size: "high" },
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content: "You are Buland, the autonomous research and assignment agent for AI Chronicals News. Research the user's news instruction using live web search. Prioritize primary sources, official statements, reputable newsrooms, and direct documents. Produce a concise factual research brief in " + (language === "en" ? "English" : "clear Pakistani Urdu") + ". Separate confirmed facts from claims and uncertainty. Include dates and context. Do not invent facts, quotations, source titles, or URLs. Do not write as if a claim is verified merely because one page reports it. Your report will be supplied to 26 newsroom review agents. Return only the research brief, not a finished publishable article."
          },
          { role: "user", content: instruction }
        ]
      })
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(502).json({
        error: "Buland web research failed",
        detail: data.error && data.error.message ? data.error.message : "Search service error"
      });
    }
    const message = data.choices && data.choices[0] && data.choices[0].message;
    const brief = message && typeof message.content === "string" ? message.content.trim() : "";
    const annotations = message && Array.isArray(message.annotations) ? message.annotations : [];
    const seen = new Set();
    const sources = annotations
      .filter((item) => item && item.url_citation && /^https:\/\//i.test(item.url_citation.url || ""))
      .map((item) => ({
        title: String(item.url_citation.title || "Web source").slice(0, 240),
        url: item.url_citation.url,
        excerpt: brief.slice(0, 5000)
      }))
      .filter((item) => {
        if (seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
      })
      .slice(0, 8);
    if (!brief) return res.status(502).json({ error: "Buland returned an empty research brief" });
    if (!sources.length) {
      return res.status(422).json({
        error: "Buland could not return citable HTTPS sources. Try a more specific instruction.",
        researchBrief: brief
      });
    }
    return res.status(200).json({
      ok: true,
      agent: "Buland",
      researchBrief: brief,
      sources,
      sourceCount: sources.length,
      nextStep: "26 department agents can now prepare and review an unpublished draft."
    });
  } catch (error) {
    return res.status(500).json({ error: "Buland research execution failed", detail: error.message });
  }
}
