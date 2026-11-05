# Soundsnap Downloader (Chrome Extension)

Adds a **download button** next to every sound on Soundsnap search results. Clicking it downloads the MP3 stream that the site's player uses.

## Installation

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (top-right).
3. Click **Load unpacked**.
4. Select this folder (the one containing `manifest.json`).
5. Open a Soundsnap search page and refresh it.

Chromium-based browsers such as Edge, Brave, and Opera work the same way via their own extensions pages (`edge://extensions`, `brave://extensions`, etc.).

## Usage

- Click the download (down-arrow) icon in the action row under a search result.
- The sound is saved to your browser's **Downloads** folder as `<sound-title>.mp3`.
- A short toast notification appears in the bottom-right corner.

## How It Works

1. The content script reads Soundsnap's public Typesense search configuration from `dynamic_data` on the page.
2. It resolves the sound's file path from the Typesense index using the sound ID (`nid`).
3. It calls the player's `/play?t=e&p=...` endpoint in the page context, so the same session cookies are used.
4. The signed MP3 URL returned by the server is passed to `chrome.downloads`.
5. If the server has not prepared the MP3 yet, the extension retries automatically a few times.

## Notes

- The downloaded file is the site's **preview/stream MP3**. The original 96 kHz / 24-bit WAV requires a Soundsnap subscription.
- If a download fails, play the sound once on the page and try the button again.
- Sounds are subject to Soundsnap's own license terms. Check the license before commercial use.

## Files

- `manifest.json` — Manifest V3 definition
- `content.js` — injects download buttons and resolves the play URL
- `background.js` — looks up sound metadata and starts the download
- `icons/` — extension icons
