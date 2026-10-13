import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { initializeSamples } from '../src/lib/cupping.js';
import { normalizeSessionIdentity } from '../src/lib/googleSheets.js';
import { sessionFingerprint } from '../src/lib/sharedSync.js';

const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  for (const width of [390, 768, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const session = normalizeSessionIdentity({ id: 123, name: 'Update QA', startTime: '10/11/2026, 10:00:00 AM', date: '10/11/2026', lexiconMode: 'osito', sessionCode: 'Z598-9J6R', sharedRevision: 1, sharedUpdatedAt: '2026-10-11T14:00:00.000Z', samples: initializeSamples(2) });
    session.samples[0].lotName = 'Boox coffee';
    if (width === 768) {
      delete session.date;
      delete session.lexiconMode;
    }
    let remote = structuredClone(session);
    remote.sharedRevision = width === 768 ? 1 : 2;
    remote.sharedUpdatedAt = '2026-10-11T15:00:00.000Z';
    remote.samples[0].lotName = 'Desktop coffee';
    const fingerprint = sessionFingerprint(session);
    if (width === 1280) session.samples[0].notes.otherText = 'Unsynced local note';
    let uploads = 0;
    await context.addInitScript(({ session, fingerprint, width }) => {
      localStorage.setItem('cupping_history', JSON.stringify([session]));
      if (width !== 768) localStorage.setItem('cupping_shared_sync_acknowledged_v1', JSON.stringify({ [session.syncId]: fingerprint }));
    }, { session, fingerprint, width });
    await context.route('https://script.google.com/**', async route => {
      if (route.request().method() === 'POST') {
        uploads++;
        return route.fulfill({ body: 'received' });
      }
      const url = new URL(route.request().url());
      const result = url.searchParams.get('action') === 'recall' ? { protocol: 2, session: remote } : { error: 'sharedConflict' };
      return route.fulfill({ contentType: 'text/javascript', body: `${url.searchParams.get('callback')}(${JSON.stringify(result)});` });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('http://127.0.0.1:5173/my-cupping-appV2/');
    await page.getByRole('button', { name: /saved sessions|history/i }).click();
    await page.getByText('Update QA', { exact: true }).click();
    if (width !== 1280) {
      await page.waitForTimeout(2500);
      assert.equal(uploads, 0, 'Opening a shared session without editing must not upload');
      assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.cupping_history)[0]), session, 'Viewing must not rewrite saved session data');
    }
    await page.getByRole('button', { name: 'Update Session', exact: true }).click();
    await page.getByText('A newer session is available', { exact: true }).waitFor();
    if (width === 1280) await page.getByText(/including any unsynced changes/).waitFor();
    await page.screenshot({ path: `/tmp/session-update-${width}.png` });
    assert.ok(await page.locator('dialog').evaluate(el => el.scrollWidth <= el.clientWidth));
    await page.getByRole('button', { name: 'Keep This Version' }).click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.cupping_history)[0].samples[0].lotName), 'Boox coffee');
    await page.getByRole('button', { name: 'Update Session', exact: true }).click();
    await page.getByRole('button', { name: 'Load Updated Session' }).click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.cupping_history)[0].samples[0].lotName), 'Desktop coffee');
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.cupping_history).length), 1);
    await page.getByRole('button', { name: 'Update Session', exact: true }).click();
    await page.getByText('This session is up to date.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Close', exact: true }).last().click();
    await page.waitForTimeout(2500);
    assert.equal(uploads, 0, 'Accepting a remote session must not start an upload');
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Update Session', exact: true }).click();
    await page.getByText('You are offline. Your local session is unchanged.', { exact: true }).waitFor();
    assert.equal(uploads, 0, 'Checking or accepting a remote session must not upload it again');
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('Passed: desktop/mobile refresh, cancel, replace without duplication, up-to-date, offline, and no accidental uploads.');
} finally { await browser.close(); }
