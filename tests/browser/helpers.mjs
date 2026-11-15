import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

export const ME = '11111111-1111-4111-8111-111111111111';
export const OTHER = '22222222-2222-4222-8222-222222222222';
export const CHAT = '33333333-3333-4333-8333-333333333333';
export const user = { id: ME, aud: 'authenticated', role: 'authenticated', email: 'fixture@example.test', app_metadata: { provider: 'email' }, user_metadata: { full_name: 'Fixture Member' }, created_at: '2026-01-01T00:00:00Z' };
const segment = value => Buffer.from(JSON.stringify(value)).toString('base64url');
export const session = { access_token: `${segment({ alg: 'HS256', typ: 'JWT' })}.${segment({ sub: ME, exp: 4102444800, role: 'authenticated', aal: 'aal1' })}.fixture-signature`, refresh_token: 'fixture-refresh-token', expires_in: 3600, expires_at: 4102444800, token_type: 'bearer', user };

export async function startServer() {
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'pipe' });
  let logs = '';
  server.stdout.on('data', b => logs += b);
  server.stderr.on('data', b => logs += b);
  const base = `http://127.0.0.1:${port}/KONNEKT/`;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(`Test server failed: ${logs}`);
    try { if ((await fetch(base)).ok) return { base, stop: () => server.kill() }; } catch {}
    await delay(100);
  }
  server.kill();
  throw new Error(`Test server did not start: ${logs}`);
}

export async function setup(base, options = {}) {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || (process.platform === 'linux' && (await import('node:fs')).existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: options.width || 390, height: 844 }, serviceWorkers: 'block' });
  await context.routeWebSocket(/supabase/, socket => socket.close());
  const db = {
    profiles: [{ id: ME, username: 'fixture', full_name: 'Fixture Member', bio: '' }, { id: OTHER, username: 'other', full_name: 'Other Member', bio: '' }],
    conversations: [{ id: CHAT, title: null, is_group: false, created_by: ME, created_at: '2026-01-01T00:00:00Z' }],
    conversation_members: [{ conversation_id: CHAT, user_id: ME }, { conversation_id: CHAT, user_id: OTHER }],
    messages: [], follows: [], notifications: [], ...options.db
  };
  const requests = [];
  const failures = new Map();
  const rpcResults = new Map();
  const single = req => (req.headers()['accept'] || '').includes('vnd.pgrst.object');
  function filterRows(rows, search) {
    return rows.filter(row => [...search].every(([key, value]) => {
      if (['select', 'order', 'limit', 'offset', 'on_conflict', 'or'].includes(key)) return true;
      if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
      if (value.startsWith('neq.')) return String(row[key]) !== value.slice(4);
      if (value === 'is.null') return row[key] == null;
      if (value.startsWith('in.(')) return value.slice(4, -1).split(',').includes(String(row[key]));
      return true;
    }));
  }
  await context.route('https://*.supabase.co/**', async route => {
    const req = route.request(), url = new URL(req.url()), method = req.method();
    const table = url.pathname.split('/').pop();
    let body = null;
    try { body = req.postDataJSON(); } catch { /* Storage uploads are binary. */ }
    requests.push({ path: url.pathname, method, body, search: url.search });
    const headers = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'content-range': '0-0/0' };
    const respond = (data, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(data) });
    if (failures.has(`${method}:${table}`)) return respond(failures.get(`${method}:${table}`), 400);
    if (url.pathname.includes('/auth/v1/')) {
      if (table === 'token') return respond(session);
      if (table === 'user') return respond(user);
      if (table === 'logout') return respond({});
      if (table === 'recover') return respond({});
      if (table === 'signup') return respond({ user, session: null });
      return respond({});
    }
    if (url.pathname.includes('/rpc/')) return respond(rpcResults.has(table) ? rpcResults.get(table) : CHAT);
    if (url.pathname.includes('/storage/v1/object/sign/')) return respond({ signedURL: '/object/sign/fixture' });
    if (url.pathname.includes('/storage/')) return respond({ Key: 'fixture-upload' });
    let rows = db[table] || [];
    let matches = filterRows(rows, url.searchParams);
    if (method === 'HEAD') return route.fulfill({ status: 200, headers: { ...headers, 'content-range': `0-0/${matches.length}` } });
    if (method === 'POST') {
      const values = (Array.isArray(body) ? body : [body]).map((row, i) => ({ id: row.id || `44444444-4444-4444-8444-${String(rows.length + i).padStart(12, '0')}`, created_at: '2026-11-15T00:00:00Z', ...row }));
      db[table] = [...rows, ...values]; matches = values;
    }
    if (method === 'PATCH') { matches.forEach(row => Object.assign(row, body)); }
    if (method === 'DELETE') db[table] = rows.filter(row => !matches.includes(row));
    if (method === 'GET') {
      for (const order of (url.searchParams.get('order') || '').split(',').reverse()) {
        if (!order) continue;
        const [key, direction] = order.split('.');
        matches = [...matches].sort((a,b) => String(a[key] ?? '').localeCompare(String(b[key] ?? '')) * (direction === 'desc' ? -1 : 1));
      }
      if (url.searchParams.has('limit')) matches = matches.slice(0, Number(url.searchParams.get('limit')));
    }
    const result = single(req) ? matches[0] || null : matches;
    return respond(result, method === 'POST' ? 201 : 200);
  });
  if (options.signedIn !== false) await context.addInitScript(({ session }) => {
    localStorage.setItem('sb-itkoagpigiifodfhoujt-auth-token', JSON.stringify(session));
  }, { session });
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base);
  return { browser, context, page, db, requests, failures, rpcResults, errors, close: () => browser.close() };
}

export async function hub(page) {
  await page.getByRole('tab', { name: 'Profile', exact: true }).click();
  await page.getByText('☰  ALL FEATURES', { exact: true }).click();
}
export async function openFeature(page, name) {
  await hub(page);
  await page.getByRole('button', { name: `Open ${name}`, exact: true }).click();
}
