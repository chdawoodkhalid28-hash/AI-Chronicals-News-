const DEFAULT_MODEL = "gemini-3.5-flash-lite";

export async function generateGeminiText(prompt, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error("Gemini API key is not configured");
    error.code = "GEMINI_KEY_MISSING";
    throw error;
  }

  const model = options.model || DEFAULT_MODEL;
  const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + model + ":generateContent";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: String(prompt).slice(0, 4000) }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: options.maxOutputTokens || 96,
        ...(options.responseMimeType ? { responseMimeType: options.responseMimeType } : {})
      }
    }),
    signal: AbortSignal.timeout(45000)
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Gemini API returned HTTP " + response.status);
    error.code = "GEMINI_API_ERROR";
    error.status = response.status;
    throw error;
  }

  const text = (payload.candidates || [])
    .flatMap(candidate => candidate.content?.parts || [])
    .map(part => part.text || "")
    .join("")
    .trim();

  if (!text) {
    const candidate = (payload.candidates || [])[0] || {};
    const error = new Error("Gemini returned no text content");
    error.code = "GEMINI_EMPTY_RESPONSE";
    error.finishReason = typeof candidate.finishReason === "string" ? candidate.finishReason : null;
    error.promptBlockReason = typeof payload.promptFeedback?.blockReason === "string"
      ? payload.promptFeedback.blockReason
      : null;
    throw error;
  }

  return { text, model, usage: payload.usageMetadata || null };
}

export { DEFAULT_MODEL };
