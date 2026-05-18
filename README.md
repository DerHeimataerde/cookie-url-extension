# Cookie-URL Analyzer -- Chrome Extension

A Chrome extension that passively monitors every page you visit, compares URL query parameters to browser cookies, and surfaces tracking correlations in a structured dashboard.

Built as the browser-side companion to [cookie-url-lab](../Cookie-Url), applying the same detection logic directly in the browser.

---

## Demo

<!-- To add a demo video: on GitHub, edit this file and drag-and-drop your video into the editor -->

https://github.com/user-attachments/assets/b9207712-ea0c-47c3-81ec-eb0132bcfc87



---

## What it does

For every page visited while recording is active, the extension captures:

- All URL query parameters and their values
- All cookies available for that page
- Value correlations -- URL parameter values that appear inside cookie values (identity, base64, urldecode, hex, split variants)
- Name correlations -- parameter names that semantically match cookie names (e.g. session_id and sess, fbclid and _fbc)

---

## Dashboard

Click the extension icon to open the popup, then Open Dashboard.

### Pages tab

Visits organized by domain. Each domain expands to show individual pages. Each page expands to show query parameters, cookies (highlighted if correlated), and a correlations section with VALUE rows (param value inside cookie value) and NAME rows (similar key names).

### Mappings tab

Cross-page grouped correlation patterns ranked by score and observation count.

---

## Transforms applied

- identity: abc123 maps to abc123
- urldecode: hello%20world maps to hello world
- base64url: dXNlci0xMjM maps to user-123
- hex: 6162 maps to ab
- split:SEP:N: v1.dXNlcg.sig split on dot index 1 maps to dXNlcg
- split+b64:SEP:N: same then base64-decoded maps to user

---

## Semantic name matching

Parameter and cookie names are compared against known alias groups including session/sess/sid, user/uid, token/tok/jwt, click IDs (gclid/fbclid/ttclid/msclkid), client/cid, visitor/vid, campaign/utm, and more. See SEMANTIC_GROUPS in background.js.

---

## Installation

1. Clone or download this repository.
2. Go to chrome://extensions in Chrome.
3. Enable Developer mode (top right toggle).
4. Click Load unpacked and select this folder.

---

## Usage

1. Click the extension icon and press Start Recording.
2. Browse normally -- every page load is captured.
3. Click Open Dashboard to inspect results.
4. Use the domain filter to focus on a specific site.
5. Click Pause Recording to stop. Clear Data to wipe.

---

## Project structure

- manifest.json: Manifest V3 -- permissions and entry points
- background.js: Service worker -- captures visits, runs detection, stores results
- popup.html/js/css: Toolbar popup -- Start/Pause toggle, live stats, dashboard link
- dashboard.html/js/css: Full dashboard -- Pages tab (by domain) and Mappings tab

---

## Permissions used

- tabs: Detect when a page finishes loading
- cookies: Read cookies for the current page
- storage: Persist visits and findings across sessions
- host_permissions (all URLs): Read cookies for any domain

---

## Scope and ethics

- Intended for local research and personal traffic analysis only.
- All data stays in your browser (chrome.storage.local) -- nothing is sent anywhere.
- Do not use this to analyze other people's sessions without authorization.
