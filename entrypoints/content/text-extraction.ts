import type { PageChunk, PageSegment } from './types';

const TARGET_CHUNK_SIZE = 800;

const BLOCK_SELECTOR =
	'p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption, pre, td, th, dt, dd';

function getStripSelectors(): string {
	if (window.location.hostname.endsWith('substack.com')) {
		return '.footnote-anchor, [data-component-name="FootnoteAnchorToDOM"]';
	}
	return '';
}

function getCleanText(el: HTMLElement): string {
	const strip = getStripSelectors();
	if (!strip) {
		return el.innerText?.trim() ?? '';
	}
	const clone = el.cloneNode(true) as HTMLElement;
	for (const unwanted of clone.querySelectorAll(strip)) {
		unwanted.remove();
	}
	return clone.innerText?.trim() ?? '';
}

function collectSegments(root: Element): PageSegment[] {
	const blocks = root.querySelectorAll(BLOCK_SELECTOR);
	const segments: PageSegment[] = [];

	for (const el of blocks) {
		const text = getCleanText(el as HTMLElement);
		if (text) {
			segments.push({ element: el, text });
		}
	}

	return segments;
}

function groupSegmentsIntoChunks(segments: PageSegment[]): PageChunk[] {
	const chunks: PageChunk[] = [];
	let currentText = '';
	let currentElements: Element[] = [];

	for (const seg of segments) {
		if (
			currentText &&
			currentText.length + seg.text.length + 2 > TARGET_CHUNK_SIZE
		) {
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
	let current = '';

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

export function buildPageChunks(): PageChunk[] {
	const selection = window.getSelection()?.toString().trim();
	if (selection) {
		return buildChunksFromText(selection);
	}

	const root = document.querySelector('article') || document.body;
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
