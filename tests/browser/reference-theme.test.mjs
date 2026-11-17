import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, setup } from './helpers.mjs';
let server;
before(async () => { server = await startServer({ preview: process.env.KONNEKT_TEST_PREVIEW === '1' }); });
after(() => server?.stop());

for (const width of [390, 1280]) test(`reference palette preserves five tabs, light mode and chat access at ${width}px`, async () => {
  const f = await setup(server.base, { width });
  try {
    const { page } = f;
    await page.getByRole('tab', { name: 'Chats', exact: true }).click();
    await page.getByText('Other Member', { exact: true }).waitFor();
    assert.deepEqual(await page.getByRole('tab').allTextContents(), ['✉Chats', '▶Reels', '◉Status', '◎Discover', '◌Profile']);
    const appearance = await page.evaluate(() => {
      const shell = document.querySelector('[data-testid="konnekt-app-shell"]');
      const selected = document.querySelector('[role="tab"][aria-selected="true"]');
      const mark = document.querySelector('[data-testid="konnekt-brand-mark"]');
      return { bg: getComputedStyle(shell).backgroundColor, tab: getComputedStyle(selected).backgroundImage, border: getComputedStyle(selected).borderBottomColor, mark: getComputedStyle(mark).backgroundImage, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
    });
    assert.equal(appearance.bg, 'rgb(5, 3, 10)');
    assert.match(appearance.tab, /rgb\(106, 13, 173\)/);
    assert.equal(appearance.border, 'rgb(255, 193, 7)');
    assert.match(appearance.mark, /linear-gradient/);
    assert.equal(appearance.overflow, false);
    await page.screenshot({ path: `/tmp/konnekt-reference-theme-${width}.png` });
    await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
    assert.equal(await page.getByTestId('konnekt-app-shell').evaluate(node => getComputedStyle(node).backgroundColor), 'rgb(247, 243, 252)');
    assert.equal(await page.getByRole('tab', { name: 'Chats', exact: true }).evaluate(node => getComputedStyle(node).borderBottomColor), 'rgb(106, 13, 173)');
    await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
    await page.getByText('Other Member', { exact: true }).click();
    await page.getByPlaceholder('Message securely…').waitFor();
    assert(await page.getByRole('button', { name: 'Send message', exact: true }).isVisible());
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});

test('public welcome retains login/signup and uses readable dark text on its orange action', async () => {
  const f = await setup(server.base, { signedIn: false });
  try {
    const signup = f.page.getByText('SIGN UP', { exact: true });
    await signup.waitFor();
    assert.equal(await signup.evaluate(node => getComputedStyle(node).color), 'rgb(5, 3, 10)');
    await f.page.getByText('LOG IN', { exact: true }).click();
    await f.page.getByPlaceholder('Email address', { exact: true }).waitFor();
    assert.deepEqual(f.errors, []);
  } finally { await f.close(); }
});
