import { generateSpeech, type Voice } from '@/utils/tts';
import { apiKeyStorage, voiceStorage, speedStorage } from '@/utils/storage';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = '';
	for (let i = 0; i < bytes.byteLength; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary);
}

export default defineBackground(() => {
	browser.runtime.onMessage.addListener(
		(message: { type: string; text?: string }, _sender, sendResponse) => {
			if (message.type === 'TTS_SPEAK' && message.text) {
				handleSpeak(message.text)
					.then(sendResponse)
					.catch((err) => {
						sendResponse({ error: err.message });
					});
				return true;
			}
		}
	);

	async function handleSpeak(text: string) {
		const apiKey = await apiKeyStorage.getValue();
		if (!apiKey) {
			throw new Error(
				'OpenAI API key not set. Open the extension popup to configure it.'
			);
		}

		const voice = (await voiceStorage.getValue()) as Voice;
		const speed = await speedStorage.getValue();
		const audioBuffer = await generateSpeech(apiKey, text, voice, speed);
		const base64 = arrayBufferToBase64(audioBuffer);

		return { audioDataUri: `data:audio/mpeg;base64,${base64}` };
	}
});
