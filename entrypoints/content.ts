import { apiKeyStorage, voiceStorage, speedStorage, positionsStorage } from "@/utils/storage";
import { VOICES } from "@/utils/tts";

const TARGET_CHUNK_SIZE = 800;
const HIGHLIGHT_CLASS = "announce-ext-highlight";

interface PageChunk {
  text: string;
  elements: Element[];
}

interface AudioQueueState {
  chunks: PageChunk[];
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
    let highlightedElements: Element[] = [];

    const pageUrl = window.location.href.split("#")[0];

    injectHighlightStyle();

    const initialVoice = await voiceStorage.getValue();
    const initialSpeed = await speedStorage.getValue();

    const { host, ui } = createOverlayUI(initialVoice, initialSpeed);
    document.body.appendChild(host);

    async function savePosition(index: number) {
      const positions = await positionsStorage.getValue();
      positions[pageUrl] = index;
      await positionsStorage.setValue(positions);
    }

    async function getSavedPosition(): Promise<number | null> {
      const positions = await positionsStorage.getValue();
      return positions[pageUrl] ?? null;
    }

    async function clearPosition() {
      const positions = await positionsStorage.getValue();
      delete positions[pageUrl];
      await positionsStorage.setValue(positions);
    }

    const savedPosition = await getSavedPosition();
    if (savedPosition !== null) {
      ui.setPlayButtonText("Resume");
    }

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
      const chunks = buildPageChunks();
      if (chunks.length === 0) {
        ui.setStatus("No text found on page", "error");
        return;
      }

      const saved = await getSavedPosition();
      const startIndex = (saved !== null && saved < chunks.length) ? saved : 0;

      state = {
        chunks,
        currentIndex: startIndex,
        prefetchedAudio: new Map(),
        currentAudio: null,
        stopped: false,
      };
      ui.setPlaying(true);
      ui.setPlayButtonText("Read Aloud");
      ui.setStatus("Generating speech…");
      startPlayback(startIndex);
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
      skipToChunk(Math.max(0, state.currentIndex - 1));
    };

    ui.onNext = () => {
      if (!state || state.stopped) {
        return;
      }
      const target = state.currentIndex + 1;
      if (target < state.chunks.length) {
        skipToChunk(target);
      }
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
      clearHighlight();
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
          text: state.chunks[index].text,
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

    async function startPlayback(startIndex: number = 0) {
      if (!state || state.stopped) {
        return;
      }

      const firstAudioPromise = fetchChunkAudio(startIndex);
      if (startIndex + 1 < state.chunks.length) {
        fetchChunkAudio(startIndex + 1);
      }

      const audioUri = await firstAudioPromise;
      if (!audioUri || !state || state.stopped) {
        ui.setPlaying(false);
        return;
      }

      playChunk(startIndex, audioUri);
    }

    function playChunk(index: number, audioDataUri: string) {
      if (!state || state.stopped) {
        return;
      }

      state.currentIndex = index;
      state.prefetchedAudio.delete(index);
      ui.setStatus(`Playing ${index + 1} / ${state.chunks.length}`, "success");
      savePosition(index);

      highlightChunk(index);

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
          clearPosition();
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

    function highlightChunk(index: number) {
      clearHighlight();
      if (!state) {
        return;
      }
      const chunk = state.chunks[index];
      if (!chunk) {
        return;
      }

      for (const el of chunk.elements) {
        el.classList.add(HIGHLIGHT_CLASS);
      }
      highlightedElements = [...chunk.elements];

      if (chunk.elements.length > 0) {
        chunk.elements[0].scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }

    function clearHighlight() {
      for (const el of highlightedElements) {
        el.classList.remove(HIGHLIGHT_CLASS);
      }
      highlightedElements = [];
    }

    function buildPageChunks(): PageChunk[] {
      const selection = window.getSelection()?.toString().trim();
      if (selection) {
        return buildChunksFromText(selection);
      }

      const root = document.querySelector("article") || document.body;
      const segments = collectSegments(root);

      if (segments.length === 0) {
        const text = root.innerText?.trim();
        if (text) {
          return buildChunksFromText(text);
        }
        return [];
      }

      return groupSegmentsIntoChunks(segments);
    }
  },
});

// --- Text extraction helpers ---

interface PageSegment {
  element: Element;
  text: string;
}

const BLOCK_SELECTOR =
  "p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption, pre, td, th, dt, dd";

function collectSegments(root: Element): PageSegment[] {
  const blocks = root.querySelectorAll(BLOCK_SELECTOR);
  const segments: PageSegment[] = [];

  for (const el of blocks) {
    const text = (el as HTMLElement).innerText?.trim();
    if (text) {
      segments.push({ element: el, text });
    }
  }

  return segments;
}

function groupSegmentsIntoChunks(segments: PageSegment[]): PageChunk[] {
  const chunks: PageChunk[] = [];
  let currentText = "";
  let currentElements: Element[] = [];

  for (const seg of segments) {
    if (currentText && currentText.length + seg.text.length + 2 > TARGET_CHUNK_SIZE) {
      chunks.push({ text: currentText, elements: currentElements });
      currentText = seg.text;
      currentElements = [seg.element];
    } else {
      currentText = currentText ? `${currentText}\n\n${seg.text}` : seg.text;
      currentElements.push(seg.element);
    }
  }

  if (currentText) {
    chunks.push({ text: currentText, elements: currentElements });
  }

  return chunks;
}

function buildChunksFromText(text: string): PageChunk[] {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) {
    return [];
  }

  const chunks: PageChunk[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current && current.length + para.length + 2 > TARGET_CHUNK_SIZE) {
      chunks.push({ text: current, elements: [] });
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }

  if (current) {
    chunks.push({ text: current, elements: [] });
  }

  return chunks;
}

function injectHighlightStyle() {
  const style = document.createElement("style");
  style.textContent = `
    .${HIGHLIGHT_CLASS} {
      background-color: rgba(99, 102, 241, 0.15) !important;
      border-radius: 4px;
      transition: background-color 0.3s;
    }
  `;
  document.head.appendChild(style);
}

// --- Overlay UI ---

interface OverlayUI {
  setStatus: (msg: string, type?: "info" | "error" | "success") => void;
  setPlaying: (playing: boolean) => void;
  setPlayButtonText: (text: string) => void;
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

  const theme = detectPageTheme();

  shadow.innerHTML = `
    <style>${OVERLAY_CSS}</style>
    <div class="widget collapsed ${theme}" id="widget">
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

    setPlayButtonText(text: string) {
      playBtn.innerHTML = `${ICON_PLAY} ${text}`;
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

// --- Theme detection ---

function detectPageTheme(): "light" | "dark" {
  const el = document.documentElement;
  const bg = getComputedStyle(el).backgroundColor;
  if (!bg || bg === "transparent" || bg === "rgba(0, 0, 0, 0)") {
    const bodyBg = getComputedStyle(document.body).backgroundColor;
    return luminanceFromCss(bodyBg) > 0.5 ? "light" : "dark";
  }
  return luminanceFromCss(bg) > 0.5 ? "light" : "dark";
}

function luminanceFromCss(color: string): number {
  const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) {
    return 1;
  }
  const [r, g, b] = [+match[1], +match[2], +match[3]].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// --- CSS ---

const OVERLAY_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }

  .widget.dark {
    --bg-panel: #0f0f11;
    --bg-surface: #18181b;
    --border: #27272a;
    --border-separator: #1e1e22;
    --text: #e4e4e7;
    --text-heading: #fff;
    --text-muted: #a1a1aa;
    --text-faint: #71717a;
    --stop-bg: #27272a;
    --stop-text: #a1a1aa;
    --stop-hover-bg: #3f3f46;
    --stop-hover-text: #e4e4e7;
    --nav-bg: #18181b;
    --nav-hover-bg: #27272a;
    --nav-hover-border: #3f3f46;
    --range-track: #27272a;
    --shadow: rgba(0,0,0,0.4);
    --shadow-lg: rgba(0,0,0,0.5);
  }

  .widget.light {
    --bg-panel: #ffffff;
    --bg-surface: #f4f4f5;
    --border: #e4e4e7;
    --border-separator: #e4e4e7;
    --text: #27272a;
    --text-heading: #09090b;
    --text-muted: #71717a;
    --text-faint: #a1a1aa;
    --stop-bg: #f4f4f5;
    --stop-text: #52525b;
    --stop-hover-bg: #e4e4e7;
    --stop-hover-text: #27272a;
    --nav-bg: #f4f4f5;
    --nav-hover-bg: #e4e4e7;
    --nav-hover-border: #d4d4d8;
    --range-track: #d4d4d8;
    --shadow: rgba(0,0,0,0.08);
    --shadow-lg: rgba(0,0,0,0.12);
  }

  .widget {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    color: var(--text);
    line-height: 1.4;
  }

  .missing-key {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 12px;
    color: #ef4444;
    max-width: 240px;
    line-height: 1.4;
    box-shadow: 0 4px 20px var(--shadow);
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
    box-shadow: 0 4px 20px var(--shadow);
    transition: background 0.15s, transform 0.15s, box-shadow 0.15s;
  }
  .fab:hover {
    background: #818cf8;
    transform: scale(1.05);
    box-shadow: 0 6px 24px var(--shadow-lg);
  }
  .fab.playing { background: #ef4444; }
  .fab.playing:hover { background: #f87171; }

  .panel {
    display: none;
    flex-direction: column;
    gap: 12px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 16px;
    width: 280px;
    box-shadow: 0 8px 40px var(--shadow-lg);
  }

  .widget.collapsed .fab { display: flex; }
  .widget.collapsed .panel { display: none; }
  .widget.expanded .fab { display: none; }
  .widget.expanded .panel { display: flex; }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .panel-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-heading);
    letter-spacing: -0.02em;
  }
  .close-btn {
    background: none;
    border: none;
    color: var(--text-faint);
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s;
  }
  .close-btn:hover { color: var(--text); }

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
  .stop-btn { background: var(--stop-bg); color: var(--stop-text); }
  .stop-btn:hover:not(:disabled) { background: var(--stop-hover-bg); color: var(--stop-hover-text); }
  button:disabled { opacity: 0.4; cursor: not-allowed; }

  .nav-controls {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .nav-controls.hidden { display: none; }

  .nav-btn {
    background: var(--nav-bg);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text-muted);
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
    color: var(--text);
    border-color: var(--nav-hover-border);
    background: var(--nav-hover-bg);
  }

  .status {
    font-size: 12px;
    text-align: center;
    min-height: 16px;
    flex: 1;
  }
  .status.error { color: #ef4444; }
  .status.info { color: #6366f1; }
  .status.success { color: #22c55e; }

  .settings {
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-top: 1px solid var(--border-separator);
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
    color: var(--text-muted);
  }

  select {
    width: 100%;
    background: var(--bg-surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 6px 8px;
    color: var(--text);
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
    background: var(--range-track);
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
