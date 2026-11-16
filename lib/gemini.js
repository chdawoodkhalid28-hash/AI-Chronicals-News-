const DEFAULT_MODEL = "gemini-3.8-flash";

export async function generateGeminiText(prompt, options = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error("Gemini API key is not configured");
    error.code = "GEMINI_KEY_MISSING";
    throw error;
  }

  const model = options.model || DEFAULT_MODEL;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: String(prompt).slice(0, 4000) }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: options.maxOutputTokens || 96 }
      }),
      signal: AbortSignal.timeout(20000)
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Gemini API returned HTTP ${response.status}`);
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
    const error = new Error("Gemini returned no text content");
    error.code = "GEMINI_EMPTY_RESPONSE";
    throw error;
  }

  return { text, model, usage: payload.usageMetadata || null };
}

export { DEFAULT_MODEL };
