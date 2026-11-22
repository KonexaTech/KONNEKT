import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { validateConfig, APP_ORIGIN, acceptanceProxy } from './staging-config.mjs';
import { installStagingNetwork } from './staging-network.mjs';
import { login, feature, moduleUrl } from './staging-session.mjs';
const file = process.env.KONNEKT_ACCEPTANCE_CONFIG;
if (!file?.endsWith('.local') || (await stat(file)).mode & 0o077) throw Error('Private approved configuration required');
const config = validateConfig(JSON.parse(await readFile(file, 'utf8')));
if (config.allowExtendedAcceptance !== true || !config.fixtureRun) throw Error('Approved fixture scope required');
const directory = file + '.key-recovery.local'; await mkdir(directory, { recursive: true, mode: 0o700 });
const report = { sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), decision: 'RUNNING', checks: [] };
let server, context, cleanupNetwork;
const save = async () => writeFile(directory + '/report.json', JSON.stringify(report, null, 2), { mode: 0o600 });
const pass = async name => { report.checks.push({ check: name, result: 'PASS' }); await save(); console.log('PASS ' + name); };
process.once('SIGTERM', () => { report.decision = 'BLOCKED_TIMEOUT'; void save().finally(() => process.exit(1)); });
async function open(profile) {
  const proxy = acceptanceProxy(process.env), violations = [];
  const options = { headless: true, executablePath: existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined, serviceWorkers: 'block', args: ['--no-sandbox'], proxy };
  context = await chromium.launchPersistentContext(profile, options);
  cleanupNetwork = await installStagingNetwork(context, { proxy, onViolation: value => violations.push(value) });
  const page = await context.newPage(); for (const old of context.pages()) if (old !== page) await old.close();
  page.setDefaultTimeout(30000);
  await page.goto(APP_ORIGIN + '/KONNEKT/', { waitUntil: 'domcontentloaded' });
  const home = page.getByRole('tab', { name: 'Profile', exact: true }), signIn = page.getByText('LOG IN', { exact: true });
  await home.or(signIn).first().waitFor(); if (await signIn.isVisible()) await login(page, config.accounts[1]); await home.waitFor();
  await page.evaluate(async ({ moduleUrl, run, username }) => {
    const { supabase } = await import(moduleUrl); const u = await supabase.auth.getUser();
    if (u.error || u.data.user?.app_metadata?.konnekt_test_run !== run) throw Error('Not the approved fixture');
    const p = await supabase.from('profiles').select('username').eq('id', u.data.user.id).single();
    if (p.error || p.data.username !== username) throw Error('Fixture mismatch');
  }, { moduleUrl, run: config.fixtureRun, username: config.accounts[1].username });
  return { page, violations };
}
async function close() { cleanupNetwork?.(); cleanupNetwork = null; await context?.close(); context = null; }
try {
  report.cryptoSHA256 = createHash('sha256').update(await readFile('src/konnektEncryption.js')).digest('hex'); await save();
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5280', '--strictPort', '--mode', 'staging'], { stdio: 'ignore', env: { ...process.env, VITE_SUPABASE_URL: config.projectUrl, VITE_SUPABASE_PUBLISHABLE_KEY: config.publishableKey } });
  let ready = false;
  for (let n = 0; n < 100; n++) { try { if ((await fetch(APP_ORIGIN + '/KONNEKT/')).ok) { ready = true; break; } } catch {} await delay(100); } assert(ready);
  let f = await open(file + '.artifacts.local/profiles/account-1');
  const before = await f.page.evaluate(async moduleUrl => {
    const { supabase } = await import(moduleUrl), e = await import('/KONNEKT/src/konnektEncryption.js');
    const { data: { user } } = await supabase.auth.getUser();
    const p = await supabase.from('profiles').select('encryption_public_key').eq('id', user.id).single();
    const b = await supabase.from('user_key_backups').select('updated_at').eq('user_id', user.id).maybeSingle();
    if (p.error || b.error) throw Error('Backup preflight failed');
    const local = await e.getStoredKonnektIdentity(user.id);
    if (!local?.privateKey || JSON.stringify(local.publicJwk) !== p.data.encryption_public_key) throw Error('Original identity unavailable; no replacement allowed');
    return { publicKey: p.data.encryption_public_key, backupExists: !!b.data };
  }, moduleUrl);
  const secretPath = directory + '/passphrase.secret.local';
  let secret;
  if (existsSync(secretPath)) {
    if ((await stat(secretPath)).mode & 0o077) throw Error('Recovery secret permissions invalid');
    secret = JSON.parse(await readFile(secretPath, 'utf8'));
    if (secret.fixtureRun !== config.fixtureRun || secret.publicKey !== before.publicKey) throw Error('Saved fixture secret does not match original identity');
  } else {
    if (before.backupExists) throw Error('Existing backup preserved: no passphrase available and no overwrite allowed');
    secret = { fixtureRun: config.fixtureRun, publicKey: before.publicKey, passphrase: randomBytes(32).toString('base64url') };
    await writeFile(secretPath, JSON.stringify(secret), { mode: 0o600, flag: 'wx' });
  }
  await feature(f.page, 'Encryption key recovery');
  if (!before.backupExists) {
    await f.page.getByText('No recovery backup found for this account.', { exact: true }).waitFor();
    await f.page.getByPlaceholder('At least 12 characters', { exact: true }).fill(secret.passphrase);
    await f.page.getByPlaceholder('Enter the same passphrase again', { exact: true }).fill(secret.passphrase);
    await f.page.getByRole('button', { name: 'CREATE / UPDATE BACKUP', exact: true }).click();
    await f.page.getByText(/Your encrypted recovery backup has been saved/).waitFor();
  }
  assert.equal(f.violations.length, 0); await pass('original fixture B identity backed up through the real UI; pre-existing unrelated backups preserved'); await close();
  // New isolated profile; original profile is neither cleared nor overwritten.
  const isolated = directory + '/isolated-profile-' + Date.now();
  f = await open(isolated); await feature(f.page, 'Encryption key recovery');
  const localAbsent = await f.page.evaluate(async moduleUrl => { const { supabase } = await import(moduleUrl); const { data: { user } } = await supabase.auth.getUser(); return !(await (await import('/KONNEKT/src/konnektEncryption.js')).getStoredKonnektIdentity(user.id)); }, moduleUrl); assert(localAbsent);
  await f.page.getByPlaceholder('At least 12 characters', { exact: true }).fill('Wrong isolated recovery fixture passphrase');
  await f.page.getByRole('button', { name: 'RESTORE ON THIS DEVICE', exact: true }).click();
  await f.page.getByText('Recovery passphrase is incorrect or the backup is damaged.', { exact: true }).waitFor();
  assert(await f.page.evaluate(async moduleUrl => { const { supabase } = await import(moduleUrl); const { data: { user } } = await supabase.auth.getUser(); return !(await (await import('/KONNEKT/src/konnektEncryption.js')).getStoredKonnektIdentity(user.id)); }, moduleUrl));
  await pass('wrong recovery passphrase rejected in isolated session without creating or replacing a local identity');
  await f.page.getByPlaceholder('At least 12 characters', { exact: true }).fill(secret.passphrase);
  await f.page.getByRole('button', { name: 'RESTORE ON THIS DEVICE', exact: true }).click();
  await f.page.getByText(/Your encryption identity has been restored on this device/).waitFor();
  const messages = JSON.parse(await readFile(file + '.voice-field.local/report.json', 'utf8')).messages.filter(row => row.actor === 0 && row.kind === 'voice');
  assert.equal(messages.length, 2);
  const verified = await f.page.evaluate(async ({ moduleUrl, originalPublicKey, messages }) => {
    const { supabase } = await import(moduleUrl), e = await import('/KONNEKT/src/konnektEncryption.js');
    const { data: { user } } = await supabase.auth.getUser();
    const profile = await supabase.from('profiles').select('encryption_public_key').eq('id', user.id).single();
    const local = await e.getStoredKonnektIdentity(user.id);
    if (profile.error || profile.data.encryption_public_key !== originalPublicKey || JSON.stringify(local?.publicJwk) !== originalPublicKey) throw Error('Original identity was changed');
    for (const target of messages) {
      const m = await supabase.from('messages').select('*').eq('id', target.id).single(); if (m.error) throw Error('Protected message unavailable');
      const peer = await supabase.from('profiles').select('encryption_public_key').eq('id', m.data.sender_id).single(); if (peer.error) throw Error('Peer key unavailable');
      const key = target.group ? await e.getGroupKonnektCryptoKey(m.data.conversation_id, user.id) : await e.getKonnektConversationCryptoKey(user.id, peer.data.encryption_public_key);
      const metadata = JSON.parse(await e.decryptWithKonnektCryptoKey(key, m.data.body, m.data.encryption_iv));
      const encrypted = await supabase.storage.from('konnekt-chat-media').download(m.data.media_path); if (encrypted.error) throw Error('Private media unavailable');
      const audio = await e.decryptKonnektBinary(key, encrypted.data, m.data.media_encryption_iv, m.data.media_mime_type);
      if (metadata.kind !== 'konnekt.voice' || audio.size !== metadata.size_bytes) throw Error('Restored key could not authenticate original voice data');
    }
    return messages.length;
  }, { moduleUrl, originalPublicKey: before.publicKey, messages }); assert.equal(verified, 2);
  await pass('correct passphrase restored the identical original key and authenticated existing direct/group voice ciphertext and private files');
  const denied = await f.page.evaluate(async ({ config, moduleUrl }) => {
    const sdkUrl = performance.getEntriesByType('resource').map(row => row.name).find(url => url.includes('@supabase_supabase-js'));
    if (!sdkUrl?.startsWith(location.origin)) throw Error('SDK unavailable');
    const { createClient } = await import(sdkUrl); const c = createClient(config.projectUrl, config.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'qa-recovery-outsider' } });
    try {
      const result = await c.auth.signInWithPassword({ email: config.accounts[2].email, password: config.accounts[2].password });
      if (result.error || result.data.user.app_metadata.konnekt_test_run !== config.fixtureRun) throw Error('Outsider unavailable');
      const { supabase } = await import(moduleUrl); const { data: { user } } = await supabase.auth.getUser();
      const row = await c.from('user_key_backups').select('user_id').eq('user_id', user.id);
      return !row.error && row.data.length === 0;
    } finally { await c.auth.signOut({ scope: 'local' }); }
  }, { config, moduleUrl }); assert(denied); assert.equal(f.violations.length, 0);
  await pass('outsider C cannot read the original account recovery backup');
  report.decision = 'PASS_SCOPED_LIVE_UI_KEY_RECOVERY';
} catch (error) {
  report.decision = 'FAIL_OR_BLOCKED'; process.exitCode = 1;
  await writeFile(directory + '/error.local', String(error?.stack || error), { mode: 0o600 }); console.error('FAIL_OR_BLOCKED: recovery acceptance; private diagnostics retained');
} finally { await close().catch(() => {}); server?.kill(); await save(); }
