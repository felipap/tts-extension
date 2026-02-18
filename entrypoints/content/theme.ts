export function isSupportedSite(): boolean {
	const hostname = window.location.hostname;
	if (hostname === 'medium.com' || hostname.endsWith('.medium.com')) {
		return true;
	}
	if (hostname.endsWith('.substack.com') || hostname === 'substack.com') {
		return true;
	}
	if (hostname === 'x.com' || hostname === 'twitter.com') {
		return true;
	}
	return false;
}

export function detectPageTheme(): 'light' | 'dark' {
	const el = document.documentElement;
	const bg = getComputedStyle(el).backgroundColor;
	if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') {
		const bodyBg = getComputedStyle(document.body).backgroundColor;
		return luminanceFromCss(bodyBg) > 0.5 ? 'light' : 'dark';
	}
	return luminanceFromCss(bg) > 0.5 ? 'light' : 'dark';
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
