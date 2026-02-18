import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "Announce",
    description: "Read webpage text aloud using OpenAI TTS",
    permissions: ["storage", "activeTab", "tabs"],
    host_permissions: ["https://api.openai.com/*"],
  },
  webExt: {
    startUrls: ["https://benn.substack.com/p/go-crazy-folks-go-crazy"],
  },
});
