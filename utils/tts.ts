const TTS_URL = "https://api.openai.com/v1/audio/speech";
const MAX_CHARS = 4096;

export type Voice = "alloy" | "ash" | "coral" | "echo" | "fable" | "onyx" | "nova" | "sage" | "shimmer";

export const VOICES: Voice[] = [
  "alloy", "ash", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer",
];

export async function generateSpeech(
  apiKey: string,
  text: string,
  voice: Voice,
  speed: number,
): Promise<ArrayBuffer> {
  const trimmed = text.slice(0, MAX_CHARS);

  const res = await fetch(TTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      input: trimmed,
      voice,
      speed,
      response_format: "mp3",
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message ?? `TTS request failed (${res.status})`);
  }

  return res.arrayBuffer();
}
