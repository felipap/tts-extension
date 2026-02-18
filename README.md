# Announce

A Chrome extension that reads any webpage aloud using OpenAI's text-to-speech API.

Announce adds a floating button to every page. Click it to open a compact panel, hit **Read Aloud**, and the page content is streamed to you chunk by chunk with the current paragraph highlighted as it plays.

## Features

- **Full-page or selection** — reads the entire article, or just the text you've highlighted
- **9 OpenAI voices** — Alloy, Ash, Coral, Echo, Fable, Onyx, Nova, Sage, Shimmer
- **Adjustable speed** — 0.25× to 4×
- **Seamless playback** — text is split into chunks and the next one is fetched while the current one plays, so there's little to no gap
- **Live highlighting** — the passage being read is highlighted on the page and scrolled into view
- **Resume where you left off** — reading position is saved per URL so you can pick up later
- **Adaptive theme** — the overlay detects whether the page is light or dark and matches automatically

## Install

1. Download the latest `announce-chrome.zip` from [Releases](../../releases/latest)
2. Unzip it
3. Open Chrome and go to `chrome://extensions`
4. Enable **Developer mode** (toggle in the top-right corner)
5. Click **Load unpacked** and select the unzipped folder
6. Click the **Announce** icon in the toolbar and paste your [OpenAI API key](https://platform.openai.com/api-keys)

That's it. Navigate to any page and click the floating speaker button in the bottom-right corner.

Your API key is stored locally in the extension and is only used to call `api.openai.com`. It never leaves your browser otherwise.

## Usage

- **Read a full page** — click the floating button, then **Read Aloud**
- **Read a selection** — highlight some text on the page first, then click **Read Aloud**
- **Skip forward / back** — use the arrow buttons in the panel while audio is playing
- **Change voice or speed** — adjust in the panel; your preferences are saved across sessions
- **Resume later** — if you stop partway through, the button will say **Resume** next time you visit the page

## Build from source

```bash
npm install
npm run build
```

The unpacked extension is output to `.output/chrome-mv3/`. Load that folder in `chrome://extensions` the same way as above.

For development with hot reload:

```bash
npm run dev
```

## License

[MIT](LICENSE)
