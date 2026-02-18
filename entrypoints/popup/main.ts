import { apiKeyStorage } from "@/utils/storage";

const apiKeyInput = document.getElementById("api-key") as HTMLInputElement;
const toggleKeyBtn = document.getElementById("toggle-key") as HTMLButtonElement;
const savedMsg = document.getElementById("saved-msg") as HTMLParagraphElement;

let saveTimeout: ReturnType<typeof setTimeout> | null = null;

async function loadKey() {
  const key = await apiKeyStorage.getValue();
  apiKeyInput.value = key;
}

async function saveKey() {
  await apiKeyStorage.setValue(apiKeyInput.value.trim());
  savedMsg.textContent = "Saved";
  savedMsg.classList.add("visible");

  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = setTimeout(() => {
    savedMsg.classList.remove("visible");
  }, 1500);
}

async function showOverlayOnActiveTab() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]?.id) {
    try {
      await browser.tabs.sendMessage(tabs[0].id, { type: "SHOW_OVERLAY" });
    } catch {
      // Content script may not be injected on this page
    }
  }
}

apiKeyInput.addEventListener("input", saveKey);
apiKeyInput.addEventListener("change", saveKey);

toggleKeyBtn.addEventListener("click", () => {
  const showing = apiKeyInput.type === "text";
  apiKeyInput.type = showing ? "password" : "text";
});

loadKey();
showOverlayOnActiveTab();
