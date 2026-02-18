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

apiKeyInput.addEventListener("input", saveKey);
apiKeyInput.addEventListener("change", saveKey);

toggleKeyBtn.addEventListener("click", () => {
  const showing = apiKeyInput.type === "text";
  apiKeyInput.type = showing ? "password" : "text";
});

loadKey();
