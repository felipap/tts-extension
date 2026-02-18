import { storage } from '@wxt-dev/storage';

export const apiKeyStorage = storage.defineItem<string>(
	'local:openai-api-key',
	{
		fallback: import.meta.env.VITE_OPENAI_API_KEY ?? '',
	}
);

export const voiceStorage = storage.defineItem<string>('local:tts-voice', {
	fallback: 'alloy',
});

export const speedStorage = storage.defineItem<number>('local:tts-speed', {
	fallback: 1.25,
});

export const positionsStorage = storage.defineItem<Record<string, number>>(
	'local:reading-positions',
	{ fallback: {} }
);
