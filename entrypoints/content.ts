import { chunkText } from "@/utils/chunker";
import { apiKeyStorage, voiceStorage, speedStorage } from "@/utils/storage";
import { VOICES } from "@/utils/tts";

interface AudioQueueState {
  chunks: string[];
  currentIndex: number;
  prefetchedAudio: Map<number, string>;
  currentAudio: HTMLAudioElement | null;
  stopped: boolean;
}

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",

  async main() {
    let state: AudioQueueState | null = null;

    const initialVoice = await voiceStorage.getValue();
    const initialSpeed = await speedStorage.getValue();

    const { host, ui } = createOverlayUI(initialVoice, initialSpeed);
    document.body.appendChild(host);

    const apiKey = await apiKeyStorage.getValue();
    if (!apiKey) {
      ui.showMissingKey();
    }

    apiKeyStorage.watch((newKey) => {
      if (newKey) {
        ui.hideMissingKey();
      } else {
        ui.showMissingKey();
      }
    });

    ui.onPlay = async () => {
      stop();
      const text = getPageText();
      const chunks = chunkText(text);
      if (chunks.length === 0) {
        ui.setStatus("No text found on page", "error");
        return;
      }

      state = {
        chunks,
        currentIndex: 0,
        prefetchedAudio: new Map(),
        currentAudio: null,
        stopped: false,
      };
      ui.setPlaying(true);
      ui.setStatus("Generating speech…");
      startPlayback();
    };

    ui.onStop = () => {
      stop();
      ui.setPlaying(false);
      ui.setStatus("");
    };

    ui.onPrev = () => {
      if (!state || state.stopped) {
        return;
      }
      const target = Math.max(0, state.currentIndex - 1);
      skipToChunk(target);
    };

    ui.onNext = () => {
      if (!state || state.stopped) {
        return;
      }
      const target = state.currentIndex + 1;
      if (target >= state.chunks.length) {
        return;
      }
      skipToChunk(target);
    };

    ui.onVoiceChange = (voice: string) => {
      voiceStorage.setValue(voice);
    };

    ui.onSpeedChange = (speed: number) => {
      speedStorage.setValue(speed);
    };

    browser.runtime.onMessage.addListener(
      (message: { type: string }, _sender, sendResponse) => {
        if (message.type === "GET_STATUS") {
          if (!state || state.stopped) {
            sendResponse({ playing: false });
          } else {
            sendResponse({
              playing: true,
              currentChunk: state.currentIndex + 1,
              totalChunks: state.chunks.length,
            });
          }
          return false;
        }

        if (message.type === "START_READING") {
          ui.onPlay?.();
          sendResponse({ ok: true });
          return false;
        }

        if (message.type === "STOP_READING") {
          ui.onStop?.();
          sendResponse({ ok: true });
          return false;
        }
      },
    );

    function stop() {
      if (state) {
        state.stopped = true;
        if (state.currentAudio) {
          state.currentAudio.pause();
          state.currentAudio.src = "";
        }
        state = null;
      }
    }

    function skipToChunk(index: number) {
      if (!state || state.stopped) {
        return;
      }
      if (state.currentAudio) {
        state.currentAudio.pause();
        state.currentAudio.src = "";
        state.currentAudio = null;
      }
      ui.setStatus(`Loading chunk ${index + 1}…`);
      const cached = state.prefetchedAudio.get(index);
      if (cached) {
        playChunk(index, cached);
      } else {
        fetchChunkAudio(index).then((uri) => {
          if (uri && state && !state.stopped) {
            playChunk(index, uri);
          }
        });
      }
    }

    async function fetchChunkAudio(index: number): Promise<string | null> {
      if (!state || state.stopped || index >= state.chunks.length) {
        return null;
      }

      const cached = state.prefetchedAudio.get(index);
      if (cached) {
        return cached;
      }

      try {
        const res = await browser.runtime.sendMessage({
          type: "TTS_SPEAK",
          text: state.chunks[index],
        });
        if (res.error) {
          console.error(`[Announce] TTS error for chunk ${index}:`, res.error);
          ui.setStatus(res.error, "error");
          return null;
        }
        if (state && !state.stopped) {
          state.prefetchedAudio.set(index, res.audioDataUri);
        }
        return res.audioDataUri;
      } catch (err) {
        console.error(`[Announce] Failed to fetch chunk ${index}:`, err);
        ui.setStatus("Speech generation failed", "error");
        return null;
      }
    }

    async function startPlayback() {
      if (!state || state.stopped) {
        return;
      }

      const firstAudioPromise = fetchChunkAudio(0);

      if (state.chunks.length > 1) {
        fetchChunkAudio(1);
      }

      const audioUri = await firstAudioPromise;
      if (!audioUri || !state || state.stopped) {
        ui.setPlaying(false);
        return;
      }

      playChunk(0, audioUri);
    }

    function playChunk(index: number, audioDataUri: string) {
      if (!state || state.stopped) {
        return;
      }

      state.currentIndex = index;
      state.prefetchedAudio.delete(index);
      ui.setStatus(`Playing ${index + 1} / ${state.chunks.length}`, "success");

      const audio = new Audio(audioDataUri);
      state.currentAudio = audio;

      const prefetchIndex = index + 2;
      if (prefetchIndex < state.chunks.length) {
        fetchChunkAudio(prefetchIndex);
      }

      audio.addEventListener("ended", () => {
        if (!state || state.stopped) {
          return;
        }

        const nextIndex = index + 1;
        if (nextIndex >= state.chunks.length) {
          stop();
          ui.setPlaying(false);
          ui.setStatus("Done", "success");
          return;
        }

        const nextAudio = state.prefetchedAudio.get(nextIndex);
        if (nextAudio) {
          playChunk(nextIndex, nextAudio);
        } else {
          ui.setStatus(`Loading chunk ${nextIndex + 1}…`);
          fetchChunkAudio(nextIndex).then((uri) => {
            if (uri && state && !state.stopped) {
              playChunk(nextIndex, uri);
            }
          });
        }
      });

      audio.play().catch((err) => {
        console.error("[Announce] Audio play failed:", err);
        ui.setStatus("Audio playback failed", "error");
        ui.setPlaying(false);
      });
    }

    function getPageText(): string {
      const selection = window.getSelection()?.toString().trim();
      if (selection) {
        return selection;
      }

      const article = document.querySelector("article");
      if (article) {
        return article.innerText.trim();
      }

      return document.body.innerText.trim();
    }
  },
});

// --- Overlay UI ---

interface OverlayUI {
  setStatus: (msg: string, type?: "info" | "error" | "success") => void;
  setPlaying: (playing: boolean) => void;
  showMissingKey: () => void;
  hideMissingKey: () => void;
  onPlay: (() => void) | null;
  onStop: (() => void) | null;
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onVoiceChange: ((voice: string) => void) | null;
  onSpeedChange: ((speed: number) => void) | null;
}

function createOverlayUI(
  initialVoice: string,
  initialSpeed: number,
): { host: HTMLElement; ui: OverlayUI } {
  const host = document.createElement("announce-ext");
  host.style.cssText =
    "all: initial; position: fixed; z-index: 2147483647; bottom: 20px; right: 20px;";
  const shadow = host.attachShadow({ mode: "closed" });

  shadow.innerHTML = `
    <style>${OVERLAY_CSS}</style>
    <div class="widget collapsed" id="widget">
      <div class="missing-key hidden" id="missing-key">
        API key not set. Click the Announce extension icon to configure it.
      </div>
      <button class="fab" id="fab" title="Announce – Read page aloud">
        ${ICON_SPEAKER}
      </button>
      <div class="panel" id="panel">
        <div class="panel-header">
          <span class="panel-title">Announce</span>
          <button class="close-btn" id="close-btn" title="Collapse">${ICON_CLOSE}</button>
        </div>
        <div class="controls">
          <button class="play-btn" id="play-btn">${ICON_PLAY} Read Aloud</button>
          <button class="stop-btn" id="stop-btn" disabled>${ICON_STOP} Stop</button>
        </div>
        <div class="nav-controls hidden" id="nav-controls">
          <button class="nav-btn" id="prev-btn" title="Previous chunk">${ICON_PREV}</button>
          <p class="status" id="status"></p>
          <button class="nav-btn" id="next-btn" title="Next chunk">${ICON_NEXT}</button>
        </div>
        <div class="settings">
          <div class="setting-row">
            <label>Voice</label>
            <select id="voice-select"></select>
          </div>
          <div class="setting-row">
            <label>Speed <span id="speed-val">${initialSpeed}×</span></label>
            <input type="range" id="speed-range" min="0.25" max="4.0" step="0.25" value="${initialSpeed}" />
          </div>
        </div>
      </div>
    </div>
  `;

  const widget = shadow.getElementById("widget")!;
  const fab = shadow.getElementById("fab")!;
  const missingKeyEl = shadow.getElementById("missing-key")!;
  const closeBtn = shadow.getElementById("close-btn")!;
  const playBtn = shadow.getElementById("play-btn")! as HTMLButtonElement;
  const stopBtn = shadow.getElementById("stop-btn")! as HTMLButtonElement;
  const navControls = shadow.getElementById("nav-controls")!;
  const prevBtn = shadow.getElementById("prev-btn")! as HTMLButtonElement;
  const nextBtn = shadow.getElementById("next-btn")! as HTMLButtonElement;
  const statusEl = shadow.getElementById("status")!;
  const voiceSelect = shadow.getElementById("voice-select")! as HTMLSelectElement;
  const speedRange = shadow.getElementById("speed-range")! as HTMLInputElement;
  const speedVal = shadow.getElementById("speed-val")!;

  let keyMissing = false;

  for (const v of VOICES) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v.charAt(0).toUpperCase() + v.slice(1);
    if (v === initialVoice) {
      opt.selected = true;
    }
    voiceSelect.appendChild(opt);
  }

  fab.addEventListener("click", () => {
    if (keyMissing) {
      return;
    }
    widget.classList.remove("collapsed");
    widget.classList.add("expanded");
  });

  closeBtn.addEventListener("click", () => {
    widget.classList.remove("expanded");
    widget.classList.add("collapsed");
  });

  const ui: OverlayUI = {
    onPlay: null,
    onStop: null,
    onPrev: null,
    onNext: null,
    onVoiceChange: null,
    onSpeedChange: null,

    showMissingKey() {
      keyMissing = true;
      missingKeyEl.classList.remove("hidden");
    },

    hideMissingKey() {
      keyMissing = false;
      missingKeyEl.classList.add("hidden");
    },

    setStatus(msg, type = "info") {
      statusEl.textContent = msg;
      statusEl.className = `status ${type}`;
    },

    setPlaying(playing) {
      playBtn.disabled = playing;
      stopBtn.disabled = !playing;
      if (playing) {
        fab.innerHTML = ICON_STOP_FAB;
        fab.classList.add("playing");
        navControls.classList.remove("hidden");
      } else {
        fab.innerHTML = ICON_SPEAKER;
        fab.classList.remove("playing");
        navControls.classList.add("hidden");
      }
    },
  };

  playBtn.addEventListener("click", () => ui.onPlay?.());
  stopBtn.addEventListener("click", () => ui.onStop?.());
  prevBtn.addEventListener("click", () => ui.onPrev?.());
  nextBtn.addEventListener("click", () => ui.onNext?.());

  voiceSelect.addEventListener("change", () => {
    ui.onVoiceChange?.(voiceSelect.value);
  });

  speedRange.addEventListener("input", () => {
    const val = parseFloat(speedRange.value);
    speedVal.textContent = `${val}×`;
    ui.onSpeedChange?.(val);
  });

  return { host, ui };
}

// --- SVGs ---

const ICON_SPEAKER = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;

const ICON_STOP_FAB = `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;

const ICON_PLAY = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;

const ICON_STOP = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>`;

const ICON_CLOSE = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

const ICON_PREV = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>`;

const ICON_NEXT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`;

// --- CSS ---

const OVERLAY_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }

  .widget {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    color: #e4e4e7;
    line-height: 1.4;
  }

  /* --- Missing key --- */

  .missing-key {
    background: #0f0f11;
    border: 1px solid #27272a;
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 12px;
    color: #ef4444;
    max-width: 240px;
    line-height: 1.4;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    position: absolute;
    bottom: 56px;
    right: 0;
    transition: opacity 0.15s, transform 0.15s;
  }
  .missing-key.hidden {
    opacity: 0;
    transform: translateY(4px);
    pointer-events: none;
  }

  /* --- FAB --- */

  .fab {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: #6366f1;
    color: #fff;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
  }
  .fab:hover {
    background: #818cf8;
    transform: scale(1.05);
    box-shadow: 0 6px 24px rgba(0,0,0,0.5);
  }
  .fab.playing { background: #ef4444; }
  .fab.playing:hover { background: #f87171; }

  /* --- Panel --- */

  .panel {
    display: none;
    flex-direction: column;
    gap: 12px;
    background: #0f0f11;
    border: 1px solid #27272a;
    border-radius: 12px;
    padding: 16px;
    width: 280px;
    box-shadow: 0 8px 40px rgba(0,0,0,0.5);
  }

  .widget.collapsed .fab { display: flex; }
  .widget.collapsed .panel { display: none; }
  .widget.expanded .fab { display: none; }
  .widget.expanded .panel { display: flex; }

  /* --- Panel header --- */

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .panel-title {
    font-size: 14px;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.02em;
  }
  .close-btn {
    background: none;
    border: none;
    color: #71717a;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s;
  }
  .close-btn:hover { color: #e4e4e7; }

  /* --- Controls --- */

  .controls { display: flex; gap: 8px; }

  .play-btn, .stop-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 600;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;
    font-family: inherit;
  }
  .play-btn { background: #6366f1; color: #fff; }
  .play-btn:hover:not(:disabled) { background: #818cf8; }
  .stop-btn { background: #27272a; color: #a1a1aa; }
  .stop-btn:hover:not(:disabled) { background: #3f3f46; color: #e4e4e7; }
  button:disabled { opacity: 0.4; cursor: not-allowed; }

  /* --- Nav controls --- */

  .nav-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .nav-controls.hidden { display: none; }

  .nav-btn {
    background: #18181b;
    border: 1px solid #27272a;
    border-radius: 6px;
    color: #a1a1aa;
    cursor: pointer;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
    flex-shrink: 0;
  }
  .nav-btn:hover {
    color: #e4e4e7;
    border-color: #3f3f46;
    background: #27272a;
  }

  /* --- Status --- */

  .status {
    font-size: 12px;
    text-align: center;
    min-height: 16px;
    flex: 1;
  }
  .status.error { color: #ef4444; }
  .status.info { color: #6366f1; }
  .status.success { color: #22c55e; }

  /* --- Settings --- */

  .settings {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-top: 1px solid #1e1e22;
    padding-top: 12px;
  }
  .setting-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .setting-row label {
    font-size: 11px;
    font-weight: 500;
    color: #a1a1aa;
  }

  select {
    width: 100%;
    background: #18181b;
    border: 1px solid #27272a;
    border-radius: 6px;
    padding: 6px 8px;
    color: #e4e4e7;
    font-size: 12px;
    font-family: inherit;
    outline: none;
    cursor: pointer;
    transition: border-color 0.15s;
  }
  select:focus { border-color: #6366f1; }

  input[type="range"] {
    -webkit-appearance: none;
    width: 100%;
    height: 4px;
    background: #27272a;
    border-radius: 2px;
    outline: none;
    margin-top: 4px;
  }
  input[type="range"]::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    background: #6366f1;
    border-radius: 50%;
    cursor: pointer;
    transition: background 0.15s;
  }
  input[type="range"]::-webkit-slider-thumb:hover { background: #818cf8; }
`;
