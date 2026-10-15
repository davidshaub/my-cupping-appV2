# Activate automatic shared sync

This uses the Google account and spreadsheet you already have. No Cloudflare,
additional hosting account, service-account key, or per-user Google login is needed.
Normal use is subject to Google's Apps Script quotas. The app keeps working and
retains local saves when the service is temporarily unavailable.

## One-time owner setup

1. Open **Cupping Lab Data → Extensions → Apps Script**.
2. Run `node scripts/build-apps-script.mjs` in this repository. Replace the
   existing script with the entire generated `output/apps-script/Code.gs` and save.
   This combines the normal sync code with the shared cupping/Panel Report code.
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

## Shared cuppings and Panel Reports

After replacing the script, choose **Deploy → Manage deployments → Edit → New
version → Deploy**. Retain the existing web app URL. This update is required before
the new app screens can create invitations or retrieve Panel evaluations. Deploy
the script before publishing the updated app. No new account or paid service is used.

The primary data tab gains a visible **Cupper** column automatically on the next
normal upload from the updated app. Deploying the script or changing Settings alone
does not trigger an upload. Set your name, then create and save a new primary cupping
session to trigger this; the column is appended at the right of the existing columns.
You may also add the exact header **Cupper** manually; the sync will reuse it.
Settings stores the default name in browser local storage. Each
evaluation retains its saved name; changing Settings does not rename history.

The script creates four additional tabs as needed: **Shared Invitations**, **Shared
Coffees**, **Shared Contributions**, and **Osito Panel Reports**. They store invitation
metadata, frozen coffee/host snapshots, separate guest evaluations, and fixed Panel
editions. Guest contributions never overwrite primary sample rows. A selected-coffee
invitation exposes only that selection and has its own code, distinct from recall codes.

Invitees may switch between Quick and Full forms. The quick final score and full
attribute scores are retained independently; the active form determines the submitted
score. Drafts are saved on the guest's device. A confirmed server receipt is required
before showing a successful submission. Each guest can update only the row associated
with their private browser credential. Concurrent stale edits are rejected. Closing
submissions rejects both new entries and updates on the server. Reports remain readable.

The browser that created an invitation retains a separate host credential under
Settings → Your shared cuppings. Keep that browser's site data to retain host control.
Guests also need their original browser/site data to edit previous entries. No login
is needed. A code/link grants participation, not host control or other guests' editing.

The Panel composer lives under **Settings → Panel Report**. Opening it shows a modal
password prompt. An immediate local SHA-256 comparison opens the composer without a
Google round trip; every evaluation lookup and edition save/load still checks the
password independently in Apps Script. The local check is a convenience gate, not
the authorization for spreadsheet access. The initial password is `C0ff33`. If changing
the server's `OSITO_PANEL_PASSWORD` Script Property, also configure the matching
`VITE_PANEL_PASSWORD_SHA256` build variable and rebuild the frontend. The password
is held in component memory only, never in browser persistence or a GET URL.

**Compare specific coffees** accepts one coffee comparison per line, with that coffee's
Sample IDs separated by commas. Two cuppers tasting five coffees means five lines,
each with the two evaluations for the same coffee. Input order sets report order;
missing or repeated IDs must be corrected before comparisons are built. Existing
summaries are retained when the same evaluation group is rebuilt.
Rebuilding with already-loaded Sample IDs uses the local evaluations. To retrieve
updated source records, use **Advanced options → Refresh evaluations**. Those
optional menus move individual evaluations to another coffee or leave them out;
the combined evaluation count appears beside each coffee heading. The menus are
collapsed by default and read **Exclude this evaluation**, **Keep as a separate
coffee**, or **Combine under [coffee name]**.

**Compare complete sessions** accepts session/invitation codes, separated by commas
or new lines. Matching lot IDs are suggested as groups for review. Table positions
and names alone never cause grouping; evaluations without a lot ID remain separate.
The author must confirm roast/preparation suitability, inclusion, and grouping.
Identifiers can be primary **Sample IDs**, individual shared contribution IDs, primary
session codes, or invitation codes. A primary session-code lookup includes guest
contributions from its invitations. Choose which evaluations represent the same coffee;
the author reviews all group suggestions. Cross-session matching and roast/preparation suitability
are the report author's decision. Empty scores are excluded from averages, descriptor
aliases count once per cupper, and an Attribute Map is shown only when all included
evaluations contain scored full forms. Notes are edited as a panel summary.

Save a fixed edition to obtain an edition ID; reopen it using that ID and the password.
Shared reports and Panel Reports use the same landscape vector PDF renderer, score
block, fonts, logo/footer, and chart layout as primary reports. Their identification
blocks contain only Osito ID, Lot/Coffee Name, and Processing. Country, sample type,
roast ID, water activity, and moisture are omitted from previews and all aggregate
PDF exports, including saved editions. Cupper attribution stays in its existing
location. Primary reports and source data retain their metadata. The flavor wheel retains external descriptor
labels, connecting lines, and the color-group key. Full-form Panels include the
Attribute Map; other aggregate reports show individual scores in that area. Blank
Panel observations read **None.** Fonts/logo are preloaded; a combined export embeds
fonts once and paints all coffees directly into one document.
Group descriptors are a union; tag counts show agreement rather than wheel segment size.
Visible reports refresh every 30 seconds while online, or via Refresh. PDF exports
capture the currently loaded results; a saved Panel edition remains fixed.

**Export PDF** opens a dialog with **Open / Print PDF**, **Download PDF**, and
**Download PDF set**. The first two use the combined report. The PDF set is a ZIP
with a separate complete PDF per included coffee, named after the coffee heading
(with safe filenames and numeric suffixes for duplicate names). Export options
capture a snapshot when the dialog opens so all three actions use the same content.

Verification: `node --test tests/*.test.js`, `node scripts/check-shared-sync.mjs`,
`node scripts/check-sheets-sync.mjs`, and `node scripts/check-collaboration-ui.mjs`
(the last requires Playwright/Chrome and the local Vite server). Browser checks mock
the Google service. A live Apps Script deployment must still be verified using a real
invitation, separate guest browser, submission, close/reopen, and Panel lookup.
