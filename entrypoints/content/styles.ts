export const HIGHLIGHT_CLASS = 'announce-ext-highlight';

export function injectHighlightStyle() {
	const style = document.createElement('style');
	style.textContent = `
    .${HIGHLIGHT_CLASS} {
      background-color: rgba(99, 102, 241, 0.15) !important;
      border-radius: 4px;
      transition: background-color 0.3s;
    }
  `;
	document.head.appendChild(style);
}

export const OVERLAY_CSS = `
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

  .toggle-btn {
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
    transition: background 0.15s, color 0.15s;
    font-family: inherit;
    background: #6366f1;
    color: #fff;
  }
  .toggle-btn:hover { background: #818cf8; }
  .toggle-btn.pausing { background: var(--stop-bg); color: var(--stop-text); }
  .toggle-btn.pausing:hover { background: var(--stop-hover-bg); color: var(--stop-hover-text); }

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
