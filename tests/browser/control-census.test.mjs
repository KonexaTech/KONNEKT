import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { startServer, setup } from './helpers.mjs';
import { featureLinks } from '../../scripts/audit/control-inventory.mjs';
let server;
before(async () => { server = await startServer(); });
after(() => server?.stop());

test('all feature-hub menu entries load without uncaught errors and provide a navigation escape', { timeout: 240000 }, async () => {
  const links = featureLinks(await readFile(new URL('../../src/screens/FeatureHubScreen.jsx', import.meta.url), 'utf8'));
  assert(links.length > 20);
  const f = await setup(server.base);
  const report = { scope: 'Fixture menu-route activation and visible-control census; controls inside destinations are observed, not automatically verified.', entries: [] };
  const failures = [];
  try {
    await f.context.addInitScript(() => {
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Fixture denies hardware access', 'NotAllowedError'); };
    });
    for (const { label, route } of links) {
      const oldErrors = f.errors.length, oldRequests = f.requests.length;
      const row = { label, route, result: 'BLOCKED', controls: [], requestTargets: [] };
      report.entries.push(row);
      try {
        await f.page.reload();
        await f.page.getByRole('tab', { name: 'Profile', exact: true }).click();
        await f.page.getByText('☰  ALL FEATURES', { exact: true }).click();
        await f.page.getByRole('button', { name: 'Open ' + label, exact: true }).click();
        await f.page.getByRole('button', { name: 'Open ' + label, exact: true }).waitFor({ state: 'hidden' });
        const back = f.page.getByText(/^(?:(?:‹|←)(?:\s*(?:Back|Go back|Close).*)?|Go back)$/).first();
        await f.page.getByRole('tab', { name: 'Profile', exact: true }).or(back).first().waitFor({ state: 'visible' });
        row.controls = await f.page.locator('[role="button"],button,[role="tab"],[role="switch"],input,textarea,select,a[href],[tabindex="0"],audio[controls],video[controls]').evaluateAll(nodes => nodes.filter(node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden').map(node => ({
          role: node.getAttribute('role') || node.tagName.toLowerCase(),
          name: (node.getAttribute('aria-label') || node.getAttribute('placeholder') || node.innerText || node.tagName).replace(/\s+/g, ' ').trim().slice(0, 140),
          disabled: node.disabled === true || node.getAttribute('aria-disabled') === 'true', result: 'BLOCKED', activation: 'OBSERVED_ONLY'
        })));
        const main = await f.page.getByRole('tab', { name: 'Profile', exact: true }).isVisible();
        assert(main || await back.isVisible(), 'Destination has no visible Back or main tabs');
        assert.equal(f.errors.length, oldErrors, 'Uncaught exception after activating menu entry');
        if (!main) { await back.click(); await f.page.getByRole('button', { name: 'Open ' + label, exact: true }).waitFor(); }
        row.result = 'PASS';
      } catch (error) { row.result = 'FAIL'; row.error = String(error.message).split('\n')[0]; failures.push(label + ': ' + row.error); }
      row.requestTargets = [...new Set(f.requests.slice(oldRequests).map(request => request.method + ' ' + request.path))];
    }
    assert.deepEqual(failures, []);
  } finally {
    await writeFile('/tmp/konnekt-control-census.json', JSON.stringify(report, null, 2));
    await f.close();
  }
});
