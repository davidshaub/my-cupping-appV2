// This is an instant UI gate. Every data lookup/save still checks the password in Apps Script.
// If the server password changes, configure the matching SHA-256 value in the frontend build.
const DEFAULT_DIGEST = 'fed689b780dbee176f04dbc90d839dc134ced4c7ba98c43d4d6a956cede9bb3d';
export async function acceptsPanelPassword(password) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
  const hex = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2,'0')).join('');
  return hex === (import.meta.env?.VITE_PANEL_PASSWORD_SHA256 || DEFAULT_DIGEST);
}
