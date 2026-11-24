// Real staging SDK checks. Only newly labelled fixture records/media are changed.
// Existing identities, relationships, keys, profiles and media are preserved.
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { validateConfig, APP_ORIGIN, acceptanceProxy } from './staging-config.mjs';
import { installStagingNetwork } from './staging-network.mjs';

const file = process.env.KONNEKT_ACCEPTANCE_CONFIG;
const report = { runId: randomUUID(), project: 'konnekt-staging', decision: 'BLOCKED', checks: [] };
let server, context, stop, phase = 'configuration';
try {
  if (!file?.endsWith('.local') || (await stat(file)).mode & 0o077) throw Error('Private fixture configuration required');
  const config = validateConfig(JSON.parse(await readFile(file, 'utf8')));
  if (config.allowExtendedAcceptance !== true || !config.fixtureRun) throw Error('Approved fixture run required');
  report.sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  report.scriptSHA256 = createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex');
  report.startedAt = new Date().toISOString();
  const video = [...await readFile(new URL('../../tests/fixtures/social-video.webm', import.meta.url))];
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5280', '--strictPort', '--mode', 'staging'], {
    stdio: 'ignore', env: { ...process.env, VITE_SUPABASE_URL: config.projectUrl, VITE_SUPABASE_PUBLISHABLE_KEY: config.publishableKey }
  });
  let ready = false;
  for (let n = 0; n < 100; n++) {
    if (server.exitCode !== null) throw Error('Local staging server unavailable');
    try { if ((await fetch(APP_ORIGIN + '/KONNEKT/')).ok) { ready = true; break; } } catch {}
    await delay(100);
  }
  if (!ready) throw Error('Local staging server unavailable');
  const proxy = acceptanceProxy(process.env), violations = [];
  context = await chromium.launchPersistentContext('', { headless: true, executablePath: existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined, serviceWorkers: 'block', args: ['--no-sandbox'], proxy });
  stop = await installStagingNetwork(context, { proxy, onViolation: value => violations.push(value) });
  const page = await context.newPage();
  await page.goto(APP_ORIGIN + '/KONNEKT/', { waitUntil: 'domcontentloaded' });
  phase = 'real-sdk-storage-authorization';
  const result = await page.evaluate(async ({ config, video, run }) => {
    await import('/KONNEKT/src/lib_supabase.js');
    const sdk = performance.getEntriesByType('resource').map(row => row.name).find(url => url.includes('@supabase_supabase-js'));
    if (!sdk?.startsWith(location.origin)) throw Error('Local SDK unavailable');
    const { createClient } = await import(sdk);
    const { resolveSocialMedia } = await import('/KONNEKT/src/services/socialMedia.js');
    const clients = [], checks = [], ownedObjects = [], rows = [];
    const bucket = 'konnekt-public-media';
    let addedFollow = false, failure, reelId, statusId;
    const check = (label, value) => { checks.push({ check: label, result: value ? 'PASS' : 'FAIL' }); if (!value) throw Error(label); };
    const client = index => createClient(config.projectUrl, config.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'social-storage-' + run + '-' + index } });
    let a, b, c;
    try {
      for (let i = 0; i < 3; i++) {
        const sdkClient = client(i); clients.push(sdkClient);
        const auth = await sdkClient.auth.signInWithPassword({ email: config.accounts[i].email, password: config.accounts[i].password });
        if (auth.error || auth.data.user?.app_metadata?.konnekt_test_run !== config.fixtureRun) throw Error('Unapproved fixture identity');
        const profile = await sdkClient.from('profiles').select('id,username').eq('id', auth.data.user.id).single();
        if (profile.error || profile.data.username !== config.accounts[i].username) throw Error('Fixture profile mismatch');
        rows.push(profile.data.id);
      }
      [a, b, c] = clients;
      const [owner, follower, outsider] = rows;
      const relations = await a.from('follows').select('follower_id').eq('followed_id', owner).in('follower_id', [follower, outsider]);
      if (relations.error || relations.data.some(row => row.follower_id === outsider)) throw Error('An existing outsider relationship cannot be changed for this test');
      const alreadyFollowing = relations.data.some(row => row.follower_id === follower);
      const path = `reels/${owner}/test-storage-${run}.webm`;
      const uploaded = await a.storage.from(bucket).upload(path, new Uint8Array(video), { contentType: 'video/webm', upsert: false });
      if (uploaded.error) throw Error('Fixture upload failed');
      ownedObjects.push(path);
      const canSign = async (who, value) => { const r = await who.storage.from(bucket).createSignedUrl(value, 30); return !r.error && !!r.data?.signedUrl; };
      check('unreferenced uploaded social object cannot be signed by uploader, peer or outsider', !(await canSign(a, path)) && !(await canSign(b, path)) && !(await canSign(c, path)));
      const reel = await a.from('reels').insert({ user_id: owner, media_path: path, caption: 'TEST STORAGE ACCEPTANCE ' + run, visibility: 'public', published_at: new Date().toISOString() }).select('id').single();
      if (reel.error) throw Error('Fixture Reel insert failed');
      reelId = reel.data.id;
      check('published public Reel can be authorized by uploader, peer and outsider', await canSign(a, path) && await canSign(b, path) && await canSign(c, path));
      const signed = await resolveSocialMedia(b, config.projectUrl, path);
      const media = await fetch(signed); const bytes = new Uint8Array(await media.arrayBuffer());
      check('actual application media resolver retrieves the original playable fixture bytes', media.ok && bytes.length === video.length && bytes.every((value, index) => value === video[index]));
      const anon = client('anonymous');
      check('anonymous signing is denied for otherwise visible content', !(await canSign(anon, path)));
      const publicResponse = await fetch(config.projectUrl + '/storage/v1/object/public/' + bucket + '/' + path);
      check('unauthenticated public object URL cannot bypass the private bucket', !publicResponse.ok);
      if (!alreadyFollowing) {
        const follow = await b.from('follows').insert({ follower_id: follower, followed_id: owner });
        if (follow.error) throw Error('Fixture follow insert failed');
        addedFollow = true;
      }
      const restricted = await a.from('reels').update({ visibility: 'followers' }).eq('id', reelId).select('id').single();
      if (restricted.error) throw Error('Fixture audience update failed');
      check('follower media is authorized for uploader and follower, denied to outsider', await canSign(a, path) && await canSign(b, path) && !(await canSign(c, path)));
      const deleted = await a.from('reels').update({ deleted_at: new Date().toISOString() }).eq('id', reelId);
      if (deleted.error) throw Error('Fixture soft deletion failed');
      check('soft-deleted Reel cannot mint a new media URL for any test account', !(await canSign(a, path)) && !(await canSign(b, path)) && !(await canSign(c, path)));
      const statusPath = `statuses/${owner}/test-storage-${run}.webm`;
      const statusUpload = await a.storage.from(bucket).upload(statusPath, new Uint8Array(video), { contentType: 'video/webm', upsert: false });
      if (statusUpload.error) throw Error('Fixture Status upload failed');
      ownedObjects.push(statusPath);
      const expiresAt = new Date(Date.now() + 20000).toISOString();
      const status = await a.from('statuses').insert({ user_id: owner, text_content: 'TEST STORAGE EXPIRY ' + run, media_url: statusPath, media_type: 'video', expires_at: expiresAt }).select('id').single();
      if (status.error) throw Error('Fixture Status insert failed');
      statusId = status.data.id;
      check('unexpired Status media is authorized for uploader, peer and outsider', await canSign(a, statusPath) && await canSign(b, statusPath) && await canSign(c, statusPath));
      await new Promise(resolve => setTimeout(resolve, Math.max(0, Date.parse(expiresAt) - Date.now()) + 1000));
      check('expired Status media cannot mint a new URL for any test account', !(await canSign(a, statusPath)) && !(await canSign(b, statusPath)) && !(await canSign(c, statusPath)));
      // The existing thirty-second URL is a bearer capability, not a revocable session.
      // This suite makes no assertion of immediate invalidation of already-issued links.
    } catch (error) { failure = error.message; }
    finally {
      if (reelId && a) {
        const cleanup = await a.from('reels').update({ deleted_at: new Date().toISOString() }).eq('id', reelId);
        if (cleanup.error) failure ||= 'New fixture Reel soft deletion failed';
      }
      if (addedFollow) {
        const cleanup = await b.from('follows').delete().eq('follower_id', rows[1]).eq('followed_id', rows[0]);
        if (cleanup.error) failure ||= 'New fixture follow cleanup failed';
      }
      if (ownedObjects.length && a) {
        for (const path of ownedObjects) {
          const cleanup = await a.functions.invoke('cleanup-social-media', { body: { path } });
          if (cleanup.error || cleanup.data?.removed !== true || cleanup.data?.path !== path) failure ||= 'New fixture media cleanup could not be confirmed';
        }
      }
      for (const sdkClient of clients) { const logout = await sdkClient.auth.signOut({ scope: 'local' }); if (logout.error) failure ||= 'Fresh fixture sign-out failed'; }
    }
    return { checks, failure, fixtures: { reelId, statusId, uploadedPaths: ownedObjects, followCreated: addedFollow }, retainedEvidence: 'Only newly labelled fixture records/media were eligible for cleanup. See private fixture IDs; failures require cleanup review. No original account, profile, key, follow or media was removed.' };
  }, { config, video, run: report.runId });
  report.checks = result.checks;
  report.retainedEvidence = result.retainedEvidence;
  report.fixtures = result.fixtures;
  if (violations.length) throw Error('Unexpected transport scope');
  if (result.failure) { report.failure = result.failure; report.decision = 'FAIL_OR_BLOCKED'; process.exitCode = 1; }
  else report.decision = 'PASS_SCOPED_LIVE_SOCIAL_STORAGE';
} catch (error) { report.phase = phase; report.decision = 'BLOCKED'; report.errorType = error.name; process.exitCode = 1; }
finally {
  stop?.(); await context?.close().catch(() => {}); server?.kill();
  if (file?.endsWith('.local')) {
    const directory = file + '.social-storage.local';
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const saved = JSON.stringify(report, null, 2);
    await writeFile(directory + '/' + report.runId + '.json', saved, { mode: 0o600 });
    await writeFile(directory + '/report.json', saved, { mode: 0o600 });
  }
  console.log(report.decision);
}
