const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

async function requestGemini(prompt, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error("Gemini API key is not configured");
    error.code = "GEMINI_KEY_MISSING";
    throw error;
  }
  const model = options.model || DEFAULT_MODEL;
  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent";
  const requestBody = {
    contents: [{ role: "user", parts: [{ text: String(prompt).slice(0, options.maxInputChars || 12000) }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.2,
      maxOutputTokens: options.maxOutputTokens || 2048,
      ...(options.responseMimeType ? { responseMimeType: options.responseMimeType } : {})
    },
    ...(options.googleSearch ? { tools: [{ google_search: {} }] } : {})
  };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(options.timeoutMs || 55000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Gemini API returned HTTP " + response.status);
    error.code = "GEMINI_API_ERROR";
    error.status = response.status;
    throw error;
  }
  const candidate = payload.candidates?.[0] || {};
  const text = (candidate.content?.parts || []).map(part => part.text || "").join("").trim();
  if (!text) {
    const error = new Error("Gemini returned no text content");
    error.code = "GEMINI_EMPTY_RESPONSE";
    error.finishReason = candidate.finishReason || null;
    error.promptBlockReason = payload.promptFeedback?.blockReason || null;
    throw error;
  }
  const chunks = candidate.groundingMetadata?.groundingChunks || [];
  const sources = chunks
    .filter(chunk => /^https:\/\//i.test(chunk.web?.uri || ""))
    .map(chunk => ({ title: String(chunk.web.title || "Google Search source").slice(0, 240), url: chunk.web.uri }))
    .filter((source, index, all) => all.findIndex(item => item.url === source.url) === index)
    .slice(0, 8);
  return { text, model, usage: payload.usageMetadata || null, sources, groundingMetadata: candidate.groundingMetadata || null };
}

export async function generateGeminiText(prompt, options = {}) {
  return requestGemini(prompt, options);
}

export async function generateGeminiResearch(prompt, options = {}) {
  return requestGemini(prompt, { ...options, googleSearch: true, maxOutputTokens: options.maxOutputTokens || 4096 });
}

export { DEFAULT_MODEL };
