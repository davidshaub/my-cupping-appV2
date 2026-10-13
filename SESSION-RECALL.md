# Session recall deployment

## Lot Summary lookup

### Device cache

Deploy the updated Apps Script first, then publish the frontend. No repair is needed. The read-only `lotCatalog` action returns only four strings per record: Lot ID, Mark, Processing, Origin. It deliberately bypasses any server cache so manual refresh sees the current sheet. Conflicting duplicate IDs remain identifiable in this list.

The app keeps a dedicated local cache (`cupping_lot_catalog_v1`) with only these values, duplicate-status markers, and its last full-refresh timestamp. It builds an in-memory ID index once, reuses it offline, and attempts a background refresh at startup/online return when older than one hour, plus hourly while open. A cached lookup waits only a short 250ms typing pause; it makes no network call. Unknown IDs use the live exact-ID endpoint and successful results join the cache. Missing IDs are never negatively cached.

**Refresh Lot Data** in Lot Information always requests a fresh full list. Afterward it checks the current lots using the usual manual-edit review safeguards. Background refresh alone never changes session fields. Refresh failures retain the existing cache; storage-quota failures retain it in memory and report that it could not be saved between visits. Session storage is separate and never cleared by this feature.

First download and live cache misses can still be slow on Google Apps Script; the speed improvement applies to the locally cached list. No pricing, inventory, or other sheet columns are included in the catalog.

The existing Apps Script now supports a read-only `lookupLot` action using spreadsheet `1hyfuTZSRZP1SQc5c-pQ3MpfRS_lJazK9Nww6HFvOskE`, tab ID `1244711014` (Lot Summary). It detects the header within the first 20 rows (currently row 3): Lot ID -> Osito ID, Mark -> Lot Name, Processing -> Processing, Origin -> Country. The deployment owner's Google account must have read access. Replace/save/redeploy the existing script as a new version before publishing the frontend. No repair, added columns, or changes to the source sheet are needed.

IDs match their displayed text exactly after trimming surrounding whitespace. Leading zeroes, punctuation and year suffixes are not discarded. Matching duplicate IDs with different mapped data are flagged; identical mapped duplicates are harmless. Only the three requested fields are returned. The existing public endpoint means anyone with a matching Lot ID can request these three fields, but no other source columns or whole-sheet listing are exposed.

After an ID changes in either lot editor, a 250ms typing pause starts a cached lookup; an uncached ID uses a 650ms pause before its live request. Opening an existing session alone does not start field lookups. Blank sheet cells never erase entries. Existing differing details require explicit review/replacement. Washed, Natural, Honey and Other match ignoring case/outer whitespace; every other nonblank processing value becomes Other, with its full text retained in processing details. No fuzzy process mapping occurs.

Requests are cancelled when the ID, session, or view changes, and results are tied to stable coffee IDs rather than row numbers. Manual entry works offline or when lookup fails; an inline retry is provided. No lookup modifies scores, notes, session IDs, or the source sheet. Accepted details go through the normal local autosave and version-protected session sync.

Tests: `node --test tests/lot-lookup.test.js tests/lot-cache.test.js` and `scripts/check-lot-lookup-ui.mjs` (Playwright/Chrome, mocked network, local port 5175 or `LOT_TEST_URL`). The source-sheet check found conflicting duplicate IDs `41` and `356`; these are not selected automatically.

## Session Update rollout

For the version-protected Session Update feature, deploy the updated Apps Script **before** publishing the frontend. Replace the existing source, save, then Deploy > Manage deployments > pencil > New version > Deploy, retaining the existing URL. Do not run the repair function again. No new sheet column is required.

Then publish the frontend and reload it on each device. Existing sessions without a known revision must be checked through **Update Session** in their report (or recalled by code) before editing can sync. This is intentional: an older local copy cannot safely be treated as current. Unknown-version clients are prevented from overwriting existing shared sessions.

The report shows the last server-assigned sync time and offers a confirmation before loading a newer version. Unsynced local edits receive an explicit replacement warning; cancel leaves them intact. Save a separate session or export CSV before replacing edits you want to retain. A current local revision with unsynced edits is left alone to upload normally. Offline/error checks never replace local data.

Google assigns an integer revision and UTC timestamp on each accepted upload. Revision comparison and writes run under one script lock. A stale upload is rejected, not merged, and the report prompts the user to check for updates. Recalling a session acknowledges it locally so opening it does not upload it again. The shared session ID, coffee IDs, and code remain unchanged.

These versions track **app uploads**, not manual spreadsheet edits. Edit session content in the app. This remains explicit refresh, not live collaborative editing.

Verification: `node scripts/check-shared-sync.mjs`, `node scripts/check-sheet-repair.mjs`, `node --test tests/*.test.js`, and `npm run build`. `scripts/check-session-update-ui.mjs` additionally exercises isolated mobile/desktop browser contexts with mocked Google responses (requires Playwright and Chrome). It never contacts the live spreadsheet.

1. In the existing Google Sheet, open Extensions > Apps Script.
2. Replace the script with `server/google-apps-script.gs` from this project.
3. Use Deploy > Manage deployments, edit the existing web-app deployment, choose New version, then Deploy. Keep the same URL, execute-as-owner setting, and Anyone access.
4. Deploy the frontend through the normal GitHub workflow.

The script adds a visible **Session Code** column automatically on the next upload. Do not rename or replace **Session ID**, **Sample ID**, or **App Data**. Codes appear after a confirmed upload. Existing locally saved sessions are re-uploaded to receive codes; open the app on the device holding them while online.

Codes are assigned under a script lock, checked for collisions, and retained when a session is renamed or edited. Recall retrieves the latest uploaded rows, not unsynced offline changes. It saves locally and asks before replacing an existing local session. Saved Sessions search is unchanged.

Anyone with a code can retrieve its session, without signing in. This is not private authenticated storage; codes can be shared or guessed, and there is no per-user authorization or rate limit in this version. Do not use it for confidential data. The public endpoint's existing write-access model is unchanged.

Verify on two devices: create a session, wait for a code in Saved Sessions, enter it through Recall Session on the other device, and compare every coffee, its order, scores, notes, and No Score status. Check renamed sessions and replacement confirmation. Offline CSV import remains available.

## Repairing a partially sorted sheet

Do not delete Session Codes: this does not realign the coffee fields and would invalidate shared codes.

1. Replace the Apps Script source with the updated `server/google-apps-script.gs` and save.
2. Select `repairCuppingSheet` in the editor's function dropdown and click Run. Authorize it if prompted.
3. Check the execution log and sheet. The function creates a timestamped backup tab before changing data. It restores app-owned fields from the embedded App Data snapshots without deleting rows or changing session identities/codes. Manual edits to app-owned sheet fields are preserved in the backup, not merged into the app snapshot.
4. Redeploy the existing web app using New version (same URL).

The repair recovers coffee order from stored positions or matching displaced visible records. If a legacy session's order cannot be recovered, it restores the original coffee numbering and lists that session in `originalNumberingRestoredFor` in the execution log. Names, scores, and notes still come from the stored snapshot. Invalid identities or ambiguous original numbering stop the repair before any writes.

Uploads now expand the standard sheet filter across every column, including hidden IDs and Session Code, and store order inside App Data as well. Use that full-width filter for sorting. Existing custom filter views or manually selected ranges are not updated: recreate those across all columns before using them. Do not sort only a subset of columns. The repair function is editor-only; it is not exposed through the public web endpoint.
