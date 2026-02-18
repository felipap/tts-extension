import { VOICES } from '@/utils/tts';
import type { OverlayUI } from './types';
import {
	ICON_SPEAKER,
	ICON_PAUSE_FAB,
	ICON_PLAY,
	ICON_PAUSE,
	ICON_CLOSE,
	ICON_PREV,
	ICON_NEXT,
} from './icons';
import { OVERLAY_CSS } from './styles';
import { detectPageTheme } from './theme';

export function createOverlayUI(
	initialVoice: string,
	initialSpeed: number
): { host: HTMLElement; ui: OverlayUI } {
	const host = document.createElement('announce-ext');
	host.style.cssText =
		'all: initial; position: fixed; z-index: 2147483647; bottom: 20px; right: 20px;';
	const shadow = host.attachShadow({ mode: 'closed' });

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
          <button class="toggle-btn" id="toggle-btn">${ICON_PLAY} Read Aloud</button>
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
            <input type="range" id="speed-range" min="1" max="3" step="0.25" value="${initialSpeed}" />
          </div>
        </div>
      </div>
    </div>
  `;

	const widget = shadow.getElementById('widget')!;
	const fab = shadow.getElementById('fab')!;
	const missingKeyEl = shadow.getElementById('missing-key')!;
	const closeBtn = shadow.getElementById('close-btn')!;
	const toggleBtn = shadow.getElementById('toggle-btn')! as HTMLButtonElement;
	const navControls = shadow.getElementById('nav-controls')!;
	const prevBtn = shadow.getElementById('prev-btn')! as HTMLButtonElement;
	const nextBtn = shadow.getElementById('next-btn')! as HTMLButtonElement;
	const statusEl = shadow.getElementById('status')!;
	const voiceSelect = shadow.getElementById(
		'voice-select'
	)! as HTMLSelectElement;
	const speedRange = shadow.getElementById('speed-range')! as HTMLInputElement;
	const speedVal = shadow.getElementById('speed-val')!;

	let keyMissing = false;
	let isPlaying = false;
	let idleLabel = 'Read Aloud';

	for (const v of VOICES) {
		const opt = document.createElement('option');
		opt.value = v;
		opt.textContent = v.charAt(0).toUpperCase() + v.slice(1);
		if (v === initialVoice) {
			opt.selected = true;
		}
		voiceSelect.appendChild(opt);
	}

	fab.addEventListener('click', () => {
		if (keyMissing) {
			return;
		}
		widget.classList.remove('collapsed');
		widget.classList.add('expanded');
	});

	closeBtn.addEventListener('click', () => {
		widget.classList.remove('expanded');
		widget.classList.add('collapsed');
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
			missingKeyEl.classList.remove('hidden');
		},

		hideMissingKey() {
			keyMissing = false;
			missingKeyEl.classList.add('hidden');
		},

		setStatus(msg, type = 'info') {
			statusEl.textContent = msg;
			statusEl.className = `status ${type}`;
		},

		setPlayButtonText(text: string) {
			idleLabel = text;
			if (!isPlaying) {
				toggleBtn.innerHTML = `${ICON_PLAY} ${text}`;
			}
		},

		setPlaying(playing) {
			isPlaying = playing;
			if (playing) {
				toggleBtn.innerHTML = `${ICON_PAUSE} Pause`;
				toggleBtn.classList.add('pausing');
				fab.innerHTML = ICON_PAUSE_FAB;
				fab.classList.add('playing');
				navControls.classList.remove('hidden');
			} else {
				toggleBtn.innerHTML = `${ICON_PLAY} ${idleLabel}`;
				toggleBtn.classList.remove('pausing');
				fab.innerHTML = ICON_SPEAKER;
				fab.classList.remove('playing');
				navControls.classList.add('hidden');
			}
		},
	};

	toggleBtn.addEventListener('click', () => {
		if (isPlaying) {
			ui.onStop?.();
		} else {
			ui.onPlay?.();
		}
	});
	prevBtn.addEventListener('click', () => ui.onPrev?.());
	nextBtn.addEventListener('click', () => ui.onNext?.());

	voiceSelect.addEventListener('change', () => {
		ui.onVoiceChange?.(voiceSelect.value);
	});

	speedRange.addEventListener('input', () => {
		const val = parseFloat(speedRange.value);
		speedVal.textContent = `${val}×`;
		ui.onSpeedChange?.(val);
	});

	return { host, ui };
}
