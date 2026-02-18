import { storage } from "@wxt-dev/storage";

export const apiKeyStorage = storage.defineItem<string>("local:openai-api-key", {
  fallback: "",
});

export const voiceStorage = storage.defineItem<string>("local:tts-voice", {
  fallback: "alloy",
});

export const speedStorage = storage.defineItem<number>("local:tts-speed", {
  fallback: 1.0,
});
