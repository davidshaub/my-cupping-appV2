# Activate automatic shared sync

This uses the Google account and spreadsheet you already have. No Cloudflare,
additional hosting account, service-account key, or per-user Google login is needed.
Normal use is subject to Google's Apps Script quotas. The app keeps working and
retains local saves when the service is temporarily unavailable.

## One-time owner setup

1. Open **Cupping Lab Data → Extensions → Apps Script**.
2. Replace the starter code with the entire contents of
   [google-apps-script.gs](google-apps-script.gs), and save.
3. Choose **Deploy → New deployment → Web app**.
   Set **Execute as: Me**, and **Who has access: Anyone**.
   Deploy and authorize the script to use the spreadsheet under your account.
4. Copy the deployed **Web app URL** ending in `/exec`. Give that URL to Codex
   so it can configure and publish the app. No key or client secret is required.

Some Workspace administrators restrict anonymous Apps Script deployment. If
“Anyone” is unavailable, this setup needs your administrator's approval.

## App configuration

The owner-provided public `/exec` URL is configured in `src/lib/sharedSync.js`.
The GitHub Actions variable **VITE_SYNC_API_URL** can optionally override it.
For local testing, use `.env` with `VITE_SYNC_API_URL=<web app URL>`.

Changing script source requires updating the existing deployment to a new
version; keep the same `/exec` URL.

## Automatic upload only

There are no sync indicators, Google login buttons, or manual sync controls in the app.
Each device retains its own local history. The service never downloads sessions from
other devices. Offline edits upload when the app is open online again.

Uploads contain only changed samples, batch up to 20 sessions, and occur at most
once every 30 seconds per app instance. Unchanged devices make no background
requests. Each upload requires a server receipt before it is acknowledged locally.
Failures retry with increasing delays up to five minutes. Local saves remain immediate.

## Data and public access

The endpoint is deliberately public, as requested. Anyone who uses or calls it
can submit cupping data. It can only read/write the
fixed cupping spreadsheet and tab in the script. This is not an authenticated
private workspace. Session IDs and Sample IDs identify updates; they are not
passwords. Do not use this endpoint for confidential information.

The script adds and hides **Session ID**, **Sample ID**, and **App Data** if needed.
App Data preserves the original sample data. The sheet's existing column
names, formatting, and unrelated cell values/formulas are retained. Submitted
text is treated as text rather than executable formulas.

One script lock serializes writers from all devices. Each upload reads the sheet
once and batches neighboring changed rows, using Apps Script's built-in Sheets
service. Replayed requests and interrupted responses update existing identifiers
rather than append duplicates. Simultaneous edits to the same session use the last
server write; separate sessions have separate IDs.

## Verification

Run `npm run build`, `node scripts/check-sheets-sync.mjs`, and
`node scripts/check-shared-sync.mjs`.
These verify offline caching, data mapping, idempotent uploads, receipts, upload-only behavior, and preservation of unrelated formulas. They simulate Google's
runtime; successful deployment and a real upload must also be verified after
the owner supplies the deployed `/exec` URL.
