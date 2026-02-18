export interface PageChunk {
	text: string;
	elements: Element[];
}

export interface AudioQueueState {
	chunks: PageChunk[];
	currentIndex: number;
	prefetchedAudio: Map<number, string>;
	currentAudio: HTMLAudioElement | null;
	stopped: boolean;
}

export interface PageSegment {
	element: Element;
	text: string;
}

export interface OverlayUI {
	setStatus: (msg: string, type?: 'info' | 'error' | 'success') => void;
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
