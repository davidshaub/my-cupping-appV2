# Session recall deployment

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
