import {
	apiKeyStorage,
	voiceStorage,
	speedStorage,
	positionsStorage,
} from '@/utils/storage';
import type { AudioQueueState } from './types';
import { HIGHLIGHT_CLASS, injectHighlightStyle } from './styles';
import { isSupportedSite } from './theme';
import { buildPageChunks } from './text-extraction';
import { createOverlayUI } from './overlay-ui';

export default defineContentScript({
	matches: ['<all_urls>'],
	runAt: 'document_idle',

	async main() {
		let state: AudioQueueState | null = null;
		let highlightedElements: Element[] = [];
		let currentSpeed: number;

		const pageUrl = window.location.href.split('#')[0];

		injectHighlightStyle();

		const initialVoice = await voiceStorage.getValue();
		const initialSpeed = await speedStorage.getValue();
		currentSpeed = initialSpeed;

		const { host, ui } = createOverlayUI(initialVoice, initialSpeed);

		if (!isSupportedSite()) {
			host.style.display = 'none';
		}

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
			ui.setPlayButtonText('Resume');
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
				ui.setStatus('No text found on page', 'error');
				return;
			}

			const saved = await getSavedPosition();
			const startIndex = saved !== null && saved < chunks.length ? saved : 0;

			state = {
				chunks,
				currentIndex: startIndex,
				prefetchedAudio: new Map(),
				currentAudio: null,
				stopped: false,
			};
			ui.setPlaying(true);
			ui.setPlayButtonText('Read Aloud');
			ui.setStatus('Generating speech…');
			startPlayback(startIndex);
		};

		ui.onStop = () => {
			stop();
			ui.setPlaying(false);
			ui.setStatus('');
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
			currentSpeed = speed;
			speedStorage.setValue(speed);
			if (state?.currentAudio) {
				state.currentAudio.playbackRate = speed;
			}
		};

		browser.runtime.onMessage.addListener(
			(message: { type: string }, _sender, sendResponse) => {
				if (message.type === 'SHOW_OVERLAY') {
					host.style.display = '';
					sendResponse({ ok: true });
					return false;
				}
				if (message.type === 'GET_STATUS') {
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
				if (message.type === 'START_READING') {
					ui.onPlay?.();
					sendResponse({ ok: true });
					return false;
				}
				if (message.type === 'STOP_READING') {
					ui.onStop?.();
					sendResponse({ ok: true });
					return false;
				}
			}
		);

		function stop() {
			clearHighlight();
			if (state) {
				state.stopped = true;
				if (state.currentAudio) {
					state.currentAudio.pause();
					state.currentAudio.src = '';
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
				state.currentAudio.src = '';
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
					type: 'TTS_SPEAK',
					text: state.chunks[index].text,
				});
				if (res.error) {
					console.error(`[Announce] TTS error for chunk ${index}:`, res.error);
					ui.setStatus(res.error, 'error');
					return null;
				}
				if (state && !state.stopped) {
					state.prefetchedAudio.set(index, res.audioDataUri);
				}
				return res.audioDataUri;
			} catch (err) {
				console.error(`[Announce] Failed to fetch chunk ${index}:`, err);
				ui.setStatus('Speech generation failed', 'error');
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
			ui.setStatus(`Playing ${index + 1} / ${state.chunks.length}`, 'success');
			savePosition(index);

			highlightChunk(index);

			const audio = new Audio(audioDataUri);
			audio.playbackRate = currentSpeed;
			state.currentAudio = audio;

			const prefetchIndex = index + 2;
			if (prefetchIndex < state.chunks.length) {
				fetchChunkAudio(prefetchIndex);
			}

			audio.addEventListener('ended', () => {
				if (!state || state.stopped) {
					return;
				}

				const nextIndex = index + 1;
				if (nextIndex >= state.chunks.length) {
					clearPosition();
					stop();
					ui.setPlaying(false);
					ui.setStatus('Done', 'success');
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
				console.error('[Announce] Audio play failed:', err);
				ui.setStatus('Audio playback failed', 'error');
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
				chunk.elements[0].scrollIntoView({
					behavior: 'smooth',
					block: 'center',
				});
			}
		}

		function clearHighlight() {
			for (const el of highlightedElements) {
				el.classList.remove(HIGHLIGHT_CLASS);
			}
			highlightedElements = [];
		}
	},
});
