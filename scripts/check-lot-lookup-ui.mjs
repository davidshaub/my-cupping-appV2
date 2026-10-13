import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 950 } });
    await context.route('https://script.google.com/**', async route => {
      if (route.request().method() === 'POST') return route.fulfill({ body: 'received' });
      const url = new URL(route.request().url()), id = url.searchParams.get('id');
      let result = { error: 'sharedUnavailable' };
      if (url.searchParams.get('action') === 'lookupLot') {
        if (id === '100.26') await new Promise(resolve => setTimeout(resolve, 1200));
        result = { lotLookup: { id, status: id === '103.26' ? 'missing' : id === '104.26' ? 'ambiguous' : 'found', lot: { lotName: `Lot ${id}`, country: 'Brazil', processing: id === '101.26' ? 'EA Decaf' : 'Washed' } } };
      }
      await route.fulfill({ contentType: 'text/javascript', body: `${url.searchParams.get('callback')}(${JSON.stringify(result)});` });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(8000);
    await page.goto('http://127.0.0.1:5174/my-cupping-appV2/');
    await page.getByRole('button', { name: 'Configure lot information' }).click();
    const id = page.getByPlaceholder('OS-ID...').first();
    await id.fill('101.26');
    await page.getByText('Lot details loaded', { exact: true }).waitFor();
    assert.equal(await page.locator('select').first().inputValue(), 'Other');
    assert.equal(await page.locator('input').filter({ visible: true }).evaluateAll(inputs => inputs.find(input => input.value === 'EA Decaf')?.value), 'EA Decaf');
    await page.screenshot({ path: `/tmp/lot-lookup-${width}.png` });
    await id.fill('102.26');
    await page.getByText('Sheet details available', { exact: true }).click();
    assert.equal(await page.locator('select').first().inputValue(), 'Other', 'Existing processing is not silently overwritten');
    await page.getByRole('button', { name: 'Replace These Details' }).click();
    assert.equal(await page.locator('select').first().inputValue(), 'Washed');
    await id.fill('103.26');
    await page.getByText('No matching Lot ID', { exact: true }).waitFor();
    assert.equal(await page.locator('select').first().inputValue(), 'Washed');
    await id.fill('104.26');
    await page.getByText('Multiple matches. Check Lot Summary.', { exact: true }).waitFor();
    await id.fill('100.26');
    await page.waitForTimeout(800);
    await id.fill('103.26');
    await page.getByText('No matching Lot ID', { exact: true }).waitFor();
    await page.waitForTimeout(1000);
    assert.equal(await page.locator('input').evaluateAll(inputs => inputs.some(input => input.value === 'Lot 100.26')), false);
    await page.getByRole('button', { name: /Table View/ }).click();
    await id.fill('101.26');
    await page.getByText('Sheet details available', { exact: true }).click();
    await page.getByRole('button', { name: 'Replace These Details' }).click();
    assert.equal(await page.getByLabel('Processing 1', { exact: true }).inputValue(), 'Other');
    assert.equal(await page.locator('input').evaluateAll(inputs => inputs.some(input => input.value === 'EA Decaf')), true);
    await page.screenshot({ path: `/tmp/lot-lookup-table-${width}.png` });
    await context.close();
  }
  console.log('Passed: mobile/desktop, both views, Other details, conflict review, missing/duplicate IDs, and stale responses.');
} finally { await browser.close(); }
