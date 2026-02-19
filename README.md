# Cupping Lab (Modular React App)

This project was migrated from a single `index.html` file into a standard React app structure.

## What changed

- Moved app code into `src/` modules (components, constants, helpers, styles).
- Added Vite project setup (`package.json`, `vite.config.js`, `src/main.jsx`).
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

1. Install Node.js 18+ (or 20+ recommended).
2. In this folder, run:

```bash
npm install
npm run dev
```

3. Open the URL shown in terminal (usually `http://localhost:5173`).

## Optional: enable smart tag mapping

Create a `.env` file in the project root:

```bash
VITE_GEMINI_API_KEY=your_key_here
```

If this variable is not set, the app still works; smart mapping is simply skipped.
