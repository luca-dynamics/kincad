// Image generation adapters for Gemini (Nano Banana / 2.0 Flash) and OpenAI (DALL-E 3 / gpt-image-1).
// Returns a `data:image/png;base64,...` data URL, or throws on failure.

/** Try Gemini image generation models in priority order. */
const GEMINI_IMAGE_MODELS = [
  "gemini-2.5-flash-preview-image-generation", // Nano Banana
  "gemini-2.0-flash-preview-image-generation",
];

export async function generateImageGemini(prompt: string, apiKey: string): Promise<string> {
  let lastErr = "";
  for (const model of GEMINI_IMAGE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
        }),
      });
      if (!res.ok) {
        lastErr = `${model} ${res.status}: ${(await res.text()).slice(0, 200)}`;
        continue;
      }
      const data = await res.json();
      const parts = data.candidates?.[0]?.content?.parts ?? [];
      const imgPart = parts.find((p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData);
      if (!imgPart?.inlineData) { lastErr = `${model}: no image in response`; continue; }
      const { mimeType, data: b64 } = imgPart.inlineData;
      return `data:${mimeType};base64,${b64}`;
    } catch (e) {
      lastErr = String(e);
    }
  }
  throw new Error(`Gemini image generation failed: ${lastErr}`);
}

/** OpenAI DALL-E 3 / gpt-image-1 — tries gpt-image-1 first, falls back to dall-e-3. */
const OPENAI_IMAGE_MODELS = ["gpt-image-1", "dall-e-3"];

export async function generateImageOpenAI(prompt: string, apiKey: string): Promise<string> {
  let lastErr = "";
  for (const model of OPENAI_IMAGE_MODELS) {
    try {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model, prompt, n: 1, size: "1024x1024", response_format: "b64_json" }),
      });
      if (!res.ok) {
        lastErr = `${model} ${res.status}: ${(await res.text()).slice(0, 200)}`;
        continue;
      }
      const data = await res.json();
      const b64 = data.data?.[0]?.b64_json;
      if (!b64) { lastErr = `${model}: no image data`; continue; }
      return `data:image/png;base64,${b64}`;
    } catch (e) {
      lastErr = String(e);
    }
  }
  throw new Error(`OpenAI image generation failed: ${lastErr}`);
}

/**
 * Generate an image using whichever provider key is available.
 * Preference: Gemini (Nano Banana) → OpenAI (gpt-image-1/DALL-E 3).
 */
export async function generateImage(
  prompt: string,
  googleKey?: string,
  openAIKey?: string,
): Promise<string> {
  if (googleKey) return generateImageGemini(prompt, googleKey);
  if (openAIKey) return generateImageOpenAI(prompt, openAIKey);
  throw new Error("No image generation key available. Add a Google or OpenAI API key.");
}
