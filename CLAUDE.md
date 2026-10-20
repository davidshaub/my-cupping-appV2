# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install                # install deps (Node >=22.12.0 required)
npm run dev                 # Vite dev server -> http://localhost:5173/my-cupping-appV2/
npm run build                # production build to dist/
npm run preview               # serve the built dist/ (used for service-worker/offline testing)
```

Tests use Node's built-in test runner, not a framework — there is no `npm test` script:

```bash
node --test tests/*.test.js           # full unit test suite
node --test tests/lot-lookup.test.js  # a single test file
```

Several `scripts/check-*.mjs` files are manual verification scripts (not part of `node --test`), referenced from `server/SETUP.md` and `SESSION-RECALL.md` after specific features change:

```bash
node scripts/check-sheets-sync.mjs
node scripts/check-shared-sync.mjs
node scripts/check-sheet-repair.mjs
node scripts/check-collaboration-ui.mjs   # needs Playwright/Chrome + local Vite server (not a package.json dependency — install separately: npx playwright install)
node scripts/check-shared-offline-ui.mjs  # needs `npm run preview -- --host 127.0.0.1 --port 4173`
```

To regenerate the combined Google Apps Script source after editing `server/*.gs`:

```bash
node scripts/build-apps-script.mjs   # writes output/apps-script/Code.gs (gitignored build artifact)
```

## Architecture

**Frontend only, no app backend.** This is a static React/Vite SPA deployed to GitHub Pages (`.github/workflows/deploy.yml` builds and publishes `dist/` on push to `main`). The Vite `base` in `vite.config.js` is hardcoded to `/my-cupping-appV2/` and must match the GitHub Pages repo path. The "backend" is a Google Apps Script web app bound to the cupping spreadsheet — see below.

- `src/App.jsx` — a single ~2300-line component holding almost all session/scoring UI state (setup, active cupping, history, modals, drag-and-drop sample ordering, PDF/CSV export flows, collaboration entry points). Most business logic is delegated to `src/lib/*`; `App.jsx` itself is mostly state wiring and event handlers. Expect to read this file alongside whichever `lib`/`hooks` module you're touching.
- `src/lib/*` — pure(ish) logic modules, independently testable:
  - `cupping.js` — scoring math, tag/CSV helpers, session CSV import/export.
  - `pdfReport.js` / `reportDesign.js` / `reportFilenames.js` — PDF report generation (largest module at ~1700 lines; built on `pdf-lib`).
  - `googleSheets.js` — maps a session/sample to the exact spreadsheet column layout (`SPREADSHEET_ID`/`SHEET_ID` live here); `planSheetUpdates` reconciles existing vs. new rows by `Session ID`/`Sample ID`.
  - `sharedSync.js` — talks to the Apps Script endpoint via **JSONP** (`readScriptResponse` injects a `<script>` tag with a callback, since the Apps Script web app doesn't support a normal CORS fetch for this flow), with upload + polling-for-receipt logic in `saveSharedSessions`.
  - `collaboration.js`, `sharedAutosave.js`, `sharedAutosaveRegistry.js`, `sharedLink.js`, `sharedCuppingSearch.js`, `panelAccess.js`, `panelComparisons.js` — shared/guest cupping invitations and the Panel Report feature described in `server/SETUP.md`.
  - `lotLookup.js`, `lotCache.js`, `lotOptions.js` — Lot Summary sheet lookups, with a local cache described in `SESSION-RECALL.md`.
  - `lexicon.js`, `tagModifiers.js`, `flavorWheel.js` — flavor descriptor/tag domain logic (see `LEXICONS.md`).
  - `sessionRecall.js`, `sessionDisplay.js` — recall-by-code validation/formatting.
- `src/hooks/*` — React wiring around the `lib` modules (`useGoogleSheets`, `useLotLookup`, `useSharedAutosave`, `useSharedOutboxSync`).
- `src/components/*` — presentational pieces pulled out of `App.jsx`.
- `src/i18n.js` + `src/locales/pt-BR.js` — English/Spanish/Portuguese UI translation; `LEXICONS.md` documents Portuguese flavor-term conventions and notes that new descriptors need a Portuguese label or coverage tests fail.
- `scripts/offlineCachePlugin.js` — custom Vite plugin wired into `vite.config.js` for offline/PWA-style asset caching of the app and its PDF assets.

### Google Apps Script ("the backend")

Source lives in this repo, not only in the Sheet's script editor:
- `server/google-apps-script.gs` — core sync (session/sample upload, receipts, recall codes, lot lookup, sheet repair).
- `server/collaboration.gs` — shared cupping invitations and Panel Report endpoints.

`scripts/build-apps-script.mjs` concatenates both into `output/apps-script/Code.gs`, which a human then pastes into **Extensions → Apps Script** in the Sheet and deploys as a new version of the *existing* web app deployment (same `/exec` URL — changing the URL breaks every client). Full deployment runbook, quotas, and the data/public-access model are in `server/SETUP.md`; `SESSION-RECALL.md` has historical rollout notes for specific past features (session recall, lot cache, sheet repair) that are useful background but describe completed migrations, not standing instructions.

There is no service account and no API key for Sheets access — the Apps Script web app itself is the authorization boundary, deployed as "Execute as: Me / Who has access: Anyone." Local-only sync config goes through `.env` (`VITE_SYNC_API_URL`, `VITE_PANEL_PASSWORD_SHA256`); the GitHub Actions deploy workflow supplies the same two values from repo Actions variables at build time.

### Data flow

Sessions save to browser `localStorage` immediately and always work offline. When `VITE_SYNC_API_URL` resolves (default endpoint is hardcoded in `sharedSync.js`), sessions additionally upload to the spreadsheet in the background; uploads are batched, retried with backoff, and confirmed via a receipt poll rather than trusting the opaque JSONP response. Shared/guest cupping and Panel Reports layer on top of this same endpoint with their own invitation/host-credential model (see `server/SETUP.md`).
