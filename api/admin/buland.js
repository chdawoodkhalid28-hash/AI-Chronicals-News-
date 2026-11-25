import { timingSafeEqual } from "node:crypto";
import { generateGeminiResearch } from "../../lib/gemini.js";

function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false;
  const left = Buffer.from(a), right = Buffer.from(b);
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
  if (!safeEqual(supplied, expected)) return res.status(401).json({ error: "Admin authentication failed" });

  const body = req.body || {};
  const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
  const language = body.language === "en" ? "en" : "ur";
  if (instruction.length < 8 || instruction.length > 3000) {
    return res.status(400).json({ error: "Instruction must contain 8 to 3000 characters" });
  }

  const system = "You are Buland, the central research coordinator for AI Chronicals News. Research using Google Search grounding. Prioritize official sources, primary documents, reputable newsrooms and direct statements. Separate confirmed facts, attributed claims and unknowns. Never invent facts, quotations, source titles or URLs. Return a concise factual research brief in " + (language === "en" ? "English" : "clear Pakistani Urdu") + ". This is research only, not a publishable article.";
  try {
    let brief = "";
    let sources = [];
    let provider = "gemini";
    let model = null;

    if (process.env.OPENAI_API_KEY) {
      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: "Bearer " + process.env.OPENAI_API_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-5-search-api",
            web_search_options: { search_context_size: "high" },
            temperature: 0.2,
            messages: [
              { role: "system", content: system },
              { role: "user", content: instruction }
            ]
          }),
          signal: AbortSignal.timeout(55000)
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error?.message || "OpenAI search request failed");
        const message = data.choices?.[0]?.message || {};
        brief = typeof message.content === "string" ? message.content.trim() : "";
        sources = (message.annotations || [])
          .filter(item => item?.url_citation && /^https:\/\//i.test(item.url_citation.url || ""))
          .map(item => ({ title: String(item.url_citation.title || "Web source").slice(0, 240), url: item.url_citation.url }));
        provider = "openai";
        model = "gpt-5-search-api";
      } catch (error) {
        if (!process.env.GEMINI_API_KEY) throw error;
      }
    }

    if (!brief && process.env.GEMINI_API_KEY) {
      const result = await generateGeminiResearch(system + "\n\nAssignment: " + instruction, { maxOutputTokens: 4096, temperature: 0.2 });
      brief = result.text;
      sources = result.sources;
      provider = "gemini";
      model = result.model;
    }

    const unique = [];
    const seen = new Set();
    for (const source of sources) {
      if (!source?.url || seen.has(source.url)) continue;
      seen.add(source.url);
      unique.push(source);
    }
    if (!brief) return res.status(502).json({ error: "Buland returned an empty research brief" });
    if (!unique.length) {
      return res.status(422).json({
        error: "Research returned no citable HTTPS sources. Assignment remains on HOLD.",
        researchBrief: brief,
        status: "HOLD",
        provider
      });
    }
    return res.status(200).json({
      ok: true,
      agent: "Buland",
      provider,
      model,
      researchBrief: brief,
      sources: unique.slice(0, 8),
      sourceCount: Math.min(unique.length, 8),
      nextStep: "26 department workflows may now prepare unpublished review packages."
    });
  } catch (error) {
    return res.status(502).json({ error: "Buland research execution failed", detail: error.message });
  }
}
