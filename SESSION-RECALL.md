# Session recall deployment

1. In the existing Google Sheet, open Extensions > Apps Script.
2. Replace the script with `server/google-apps-script.gs` from this project.
3. Use Deploy > Manage deployments, edit the existing web-app deployment, choose New version, then Deploy. Keep the same URL, execute-as-owner setting, and Anyone access.
4. Deploy the frontend through the normal GitHub workflow.

The script adds a visible **Session Code** column automatically on the next upload. Do not rename or replace **Session ID**, **Sample ID**, or **App Data**. Codes appear after a confirmed upload. Existing locally saved sessions are re-uploaded to receive codes; open the app on the device holding them while online.

Codes are assigned under a script lock, checked for collisions, and retained when a session is renamed or edited. Recall retrieves the latest uploaded rows, not unsynced offline changes. It saves locally and asks before replacing an existing local session. Saved Sessions search is unchanged.

Anyone with a code can retrieve its session, without signing in. This is not private authenticated storage; codes can be shared or guessed, and there is no per-user authorization or rate limit in this version. Do not use it for confidential data. The public endpoint's existing write-access model is unchanged.

Verify on two devices: create a session, wait for a code in Saved Sessions, enter it through Recall Session on the other device, and compare every coffee, its order, scores, notes, and No Score status. Check renamed sessions and replacement confirmation. Offline CSV import remains available.
