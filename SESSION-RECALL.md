# Session recall deployment

## Lot Summary lookup

### Device cache

Deploy the updated Apps Script first, then publish the frontend. No repair is needed. The read-only `lotCatalog` action returns only four strings per record: Lot ID, Mark, Processing, Origin. It deliberately bypasses any server cache so manual refresh sees the current sheet. Conflicting duplicate IDs remain identifiable in this list.

The app keeps a dedicated local cache (`cupping_lot_catalog_v1`) with only these values, duplicate-status markers, and its last full-refresh timestamp. It builds an in-memory ID index once, reuses it offline, and attempts a background refresh at startup/online return when older than one hour, plus hourly while open. A cached lookup starts when the edited ID field loses focus; it makes no network call. Unknown IDs use the live exact-ID endpoint and successful results join the cache. Missing IDs are never negatively cached.

**Refresh Lot Data** in Lot Information always requests a fresh full list. Afterward it checks the current lots using the usual manual-edit review safeguards. Background refresh alone never changes session fields. Refresh failures retain the existing cache; storage-quota failures retain it in memory and report that it could not be saved between visits. Session storage is separate and never cleared by this feature.

First download and live cache misses can still be slow on Google Apps Script; the speed improvement applies to the locally cached list. No pricing, inventory, or other sheet columns are included in the catalog.

The existing Apps Script now supports a read-only `lookupLot` action using spreadsheet `1hyfuTZSRZP1SQc5c-pQ3MpfRS_lJazK9Nww6HFvOskE`, tab ID `1244711014` (Lot Summary). It detects the header within the first 20 rows (currently row 3): Lot ID -> Osito ID, Mark -> Lot Name, Processing -> Processing, Origin -> Country. The deployment owner's Google account must have read access. Replace/save/redeploy the existing script as a new version before publishing the frontend. No repair, added columns, or changes to the source sheet are needed.

IDs match their displayed text exactly after trimming surrounding whitespace. Leading zeroes, punctuation and year suffixes are not discarded. Matching duplicate IDs with different mapped data are flagged; identical mapped duplicates are harmless. Only the three requested fields are returned. The existing public endpoint means anyone with a matching Lot ID can request these three fields, but no other source columns or whole-sheet listing are exposed.

After IDs change in either lot editor, leaving the ID field starts lookup for the pending edited IDs (including multi-row pastes). Typing alone does not start a lookup. Opening an existing session alone does not start field lookups. Table View shows a checkmark for success without increasing row height; regular view retains its text status. Blank sheet cells never erase entries. Existing differing details require explicit review/replacement. Washed, Natural, Honey and Other match ignoring case/outer whitespace; every other nonblank processing value becomes Other, with its full text retained in processing details. No fuzzy process mapping occurs.

Requests are cancelled when the ID, session, or view changes, and results are tied to stable coffee IDs rather than row numbers. Manual entry works offline or when lookup fails; an inline retry is provided. No lookup modifies scores, notes, session IDs, or the source sheet. Accepted details go through the normal local autosave and version-protected session sync.

Tests: `node --test tests/lot-lookup.test.js tests/lot-cache.test.js` and `scripts/check-lot-lookup-ui.mjs` (Playwright/Chrome, mocked network, local port 5175 or `LOT_TEST_URL`). The source-sheet check found conflicting duplicate IDs `41` and `356`; these are not selected automatically.

## AirTable Sample ID lookup

A new "Sample ID" field sits alongside Osito ID on each sample. Unlike Osito ID (one per coffee,
shared across that coffee's several samples), Sample ID is unique per physical sample (PSS, Arrival,
etc.) in the company's AirTable "Master Sheet" (base `appb33eKqdsHn03CM`, table `tbl9SXWK6ItEaWTbt`),
so a lookup by Sample ID is never ambiguous the way an Osito-ID-based one would be. The two fields
are independent: either can be filled alone (an offer sample often has no Osito ID yet), and filling
Sample ID with one that resolves to an Osito ID also fills the Osito ID field, which in turn triggers
the existing Lot Summary lookup on its own - no special chaining code was needed for that.

The Apps Script `lookupSample_` function (`doGet` action `lookupSample`) calls AirTable's REST API
directly with `UrlFetchApp`, using a Personal Access Token stored as the `AIRTABLE_API_TOKEN` Script
Property (Apps Script editor -> Project Settings -> Script Properties) - never in the client, never in
this repo. It only requests/returns the fields in `AIRTABLE_SAMPLE_FIELD_MAP`: Osito ID, Lot Name,
Sample Type, Moisture, and aW (water activity); AirTable's `percent`-type Moisture is converted from
its 0-1 fraction to this app's 0-100 scale. Adding another field later (the base has many more, e.g.
Processing, Country) only needs a new map entry and one line in `lookupSample_` - no client changes.

Unlike the Lot Summary sheet (a few hundred rows, safe to prefetch whole), this AirTable table has
7,000+ rows and keeps growing, so there is no bulk catalog or local cache here (`useSampleLookup.js`
is a point-lookup-only version of `useLotLookup.js`) - every lookup is a live network call on blur or
paste, same debounce/conflict-review/retry pattern as the Lot Summary lookup otherwise.

Saved with the session like Osito ID (CSV column `Lab Sample ID`, spreadsheet column `Lab Sample ID`,
shown on primary PDF reports only - omitted from shared/Panel reports along with the other fields
`server/SETUP.md` already excludes there).

`SAMPLE_TYPE_OPTIONS` (`src/lib/lotOptions.js`) was updated to match AirTable's actual Sample Type
choices (Type, Offer, PSS, Arrival, Spot, Frozen - Spot, Client, Cacao) plus an Other catch-all; it is
a suggestion list only (`SearchableSelect` accepts any typed value), so this is cosmetic, not validation.

Deployment: paste the regenerated Apps Script, set the `AIRTABLE_API_TOKEN` Script Property (read
access to the base above), then redeploy as the usual new version of the existing `/exec` deployment.

Tests: `node --test tests/*.test.js` (covers `sampleLookup.js`'s patch/conflict logic) and
`node scripts/check-sample-lookup-sync.mjs` (mocks `UrlFetchApp` to verify `lookupSample_`/`doGet`
against found/missing/ambiguous/unconfigured AirTable responses).

Not yet built, flagged for later: writing cupping scores/notes back into this AirTable base after a
session - that would need write access (a different trust model than this read-only lookup). The
schema decision is now resolved (see "Cupping Log table" below); the write logic itself (the push
button, the update-vs-archive branch, the lock around it) is not yet implemented.

## Osito Mode toggle

A password-gated, device-remembered toggle in Settings (`getOsitoMode`/`setOsitoMode` in
`src/lib/collaboration.js`, key `osito_mode_enabled`) hides internal-team-only extras from the
general public by default. Right now that's just the Sample ID field (both Lot Information views);
future internal-only features (e.g. the AirTable push button once built) should check the same flag.

Turning it ON requires the Panel Report password (same password, `acceptsPanelPassword`, same
`PanelPasswordDialog` with optional `title`/`submitLabel`/`busyLabel` props). The password is then
remembered on that device (`osito_mode_password` in localStorage, like the cupper name) for as long as
Osito Mode stays on, so password-gated actions like Push to AirTable never re-prompt; turning Osito
Mode off clears it. If Osito Mode was already on before this existed (no remembered password), the
first Push asks once and remembers it. The server still re-checks the password on every push.

In `App.jsx`, `METADATA_TABLE_COLUMNS` became a per-render value (`metadataTableColumns(ositoMode)`)
instead of a module-level constant, since Table View addresses every other column by a hardcoded
numeric position in the hand-coded markup - those are now computed as `idOffset + N` (`idOffset` is
1 when Osito Mode is on, 0 when off) rather than literal numbers, so turning the toggle off removes
Sample ID's column entirely (not just hides it) without renumbering anything else.

## Cupping Log table

AirTable's Master Sheet always holds only the *most recent* cupping for a Sample ID. A new "Cupping
Log" table (`tblNo6waRocS6ySb0` in the same base) holds superseded ones: when a Sample ID that
already has Score/notes gets cupped again, its current Score/Cup Profile/Negative Notes/Other
Notes/Cupping Date get copied into a new Cupping Log row *before* Master Sheet is overwritten with
the new cupping. Only Sample IDs cupped more than once ever have a row here. The table's "Sample"
field links back to Master Sheet, which automatically gained a reverse "Cupping Log" link column
showing each sample's archived history inline - no separate lookup field was needed.

Cup Profile/Negative Notes on the new table start with the same choice lists Master Sheet had at
creation time; AirTable's write API accepts `typecast: true` to auto-add any new descriptor the app
lexicon introduces later, so no separate sync job is needed to keep the lists current.

## Push to AirTable

A session-level "Push to AirTable" button (next to Export PDF/CSV, Osito Mode only) sends every
sample with a Sample ID filled in. Client-side (`src/lib/airtablePush.js`) computes the score, merges
Fragrance/Aroma + In-the-Cup tags into Cup Profile (AirTable doesn't distinguish them), strips
Slight/Intense modifiers to canonical English names, and combines sweetness/acidity level + notes
the same way the CSV export's "General Notes" column already does.

Submitting requires the Panel Report password (same password, same `PanelPasswordDialog`, now with
`title`/`submitLabel`/`busyLabel` props so it reads correctly for this second purpose) - checked
client-side first for instant feedback, then independently re-checked server-side (`doPost` action
`pushCupping` in `server/google-apps-script.gs`) since this mutates a shared company database, not
just this app's own data. One `LockService` lock covers the whole batch so two near-simultaneous
pushes for the same Sample ID can't both see "nothing there yet" and both skip archiving. The
update-vs-archive branch matches the design above exactly: look up the Sample ID's current row: if
its Score/Other Notes/Date Cupped are all empty, update in place; if not, copy that old cupping into
a new Cupping Log row *before* overwriting Master Sheet with the new one. Uses the normal POST +
receipt-poll pattern already used for primary sync, since Apps Script POST responses aren't directly
readable; the client reuses the generic `action: 'receipt'` GET handler to collect the per-sample
results (`updated`/`archived`/`notFound`/`ambiguous`/`invalid`/`error`).

**Required before this works live**: the `AIRTABLE_API_TOKEN` Script Property's AirTable Personal
Access Token needs its scope widened from read-only (`data.records:read`) to also include
`data.records:write` (AirTable's token page lets you edit an existing token's scopes - no need to
create a new one or update the Script Property again if you just add the scope to the same token).
Without that, every push will fail with `airtableUnavailable` even though the lookup still works.

Tests: `node --test tests/*.test.js` (covers `airtablePush.js`'s payload/tag logic) and
`node scripts/check-airtable-push-sync.mjs` (mocks `UrlFetchApp` to verify the update-vs-archive
branch, that the archive write always happens before the overwrite, the password check, the lock,
and per-sample error reporting).

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
