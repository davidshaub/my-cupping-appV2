# Osito Cupping Lab

React/Vite app for running coffee cupping sessions, scoring samples, keeping session history, and exporting results.

## What changed

- Moved app code into `src/` modules (components, constants, helpers, styles).
- Added Vite project setup (`package.json`, `vite.config.js`, `src/main.jsx`).
- Bundled Tailwind through Vite instead of loading it from a CDN.
- Preserved the same UI and behavior.
- Kept recent bug fixes:
  - Safe history parsing from `localStorage`
  - Safer CSV escaping/download cleanup
  - No AI request unless `VITE_GEMINI_API_KEY` is set
  - No crash when cycling tags in sections without cycle support

## Folder layout

- `src/App.jsx`: main screen flow and state
- `src/components/`: reusable UI pieces
- `src/lib/cupping.js`: scoring/tag/csv/helpers
- `src/constants.js`: fixed data and config
- `src/styles.css`: custom and print styles

## Run it locally

1. Install Node.js 22.12+.
2. In this folder, run:

```bash
npm install
npm run dev
```

3. Open the URL shown in terminal. With the current Vite base path, the app runs at:

```text
http://localhost:5173/my-cupping-appV2/
```

## Local data

Sessions are saved in the browser's `localStorage`, so they stay on the same device/browser and are not sent to a server. Clearing browser site data will remove saved sessions.

## Deployment

The GitHub Pages workflow builds the app with Node.js 22 and publishes the `dist/` output. The Vite base path is configured for `/my-cupping-appV2/`.

## Optional: enable smart tag mapping

Create a `.env` file in the project root:

```bash
VITE_GEMINI_API_KEY=your_key_here
```

If this variable is not set, the app still works; smart mapping is simply skipped.
