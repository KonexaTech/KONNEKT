import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { validateConfig, APP_ORIGIN, acceptanceProxy, assertIsolation } from './staging-config.mjs';
import { installStagingNetwork } from './staging-network.mjs';
import { login, tab, moduleUrl } from './staging-session.mjs';

const file = process.env.KONNEKT_ACCEPTANCE_CONFIG;
const report = { runId: randomUUID(), project: 'konnekt-staging', decision: 'RUNNING', checks: [], messages: [] };
let server, phase = 'config', currentContext, currentNetwork;
const directory = file + '.voice-field.local';
async function save() { if (!file) return; await mkdir(directory, { recursive: true, mode: 0o700 }); await writeFile(directory + '/report.json', JSON.stringify(report, null, 2), { mode: 0o600 }); }
async function pass(check) { report.checks.push({ check, result: 'PASS' }); await save(); console.log('PASS ' + check); }
process.once('SIGTERM', () => { report.decision = 'BLOCKED_TIMEOUT'; report.failedPhase = phase; void save().finally(() => process.exit(1)); });
try {
  if (!file?.endsWith('.local') || (await stat(file)).mode & 0o077) throw Error('Private configuration required');
  const config = validateConfig(JSON.parse(await readFile(file, 'utf8')));
  if (config.allowExtendedAcceptance !== true || !config.fixtureRun) throw Error('Approved fixture run required');
  report.sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  report.sourceSHA256 = {};
  for (const path of ['src/services/voiceMessages.js', 'src/services/media.js', 'src/services/mediaValidation.js', 'src/screens/VoiceNoteScreen.jsx', 'src/screens/ChatConversationScreen.jsx', 'src/screens/ChatsScreen.jsx', 'src/components/VoiceNotePlayer.jsx', 'src/konnektEncryption.js']) report.sourceSHA256[path] = createHash('sha256').update(await readFile(path)).digest('hex');
  await save();
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5280', '--strictPort', '--mode', 'staging'], {
    cwd: process.cwd(), stdio: 'ignore', env: { ...process.env, VITE_SUPABASE_URL: config.projectUrl, VITE_SUPABASE_PUBLISHABLE_KEY: config.publishableKey }
  });
  let ready = false;
  for (let n = 0; n < 100; n++) { try { if ((await fetch(APP_ORIGIN + '/KONNEKT/')).ok) { ready = true; break; } } catch {} await delay(100); }
  assert(ready);
  async function actor(index, action) {
    const proxy = acceptanceProxy(process.env), violations = [];
    currentContext = await chromium.launchPersistentContext(file + '.artifacts.local/profiles/account-' + index, {
      headless: true, executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
      serviceWorkers: 'block', viewport: { width: 390, height: 844 }, args: ['--no-sandbox'], proxy
    });
    currentNetwork = await installStagingNetwork(currentContext, { proxy, onViolation: value => violations.push(value) });
    const page = await currentContext.newPage(); page.setDefaultTimeout(30000);
    for (const old of currentContext.pages()) if (old !== page) await old.close();
    try {
      await page.goto(APP_ORIGIN + '/KONNEKT/', { waitUntil: 'domcontentloaded' });
      const home = page.getByRole('tab', { name: 'Profile', exact: true }), signIn = page.getByText('LOG IN', { exact: true });
      await home.or(signIn).first().waitFor(); if (await signIn.isVisible()) await login(page, config.accounts[index]); await home.waitFor();
      const profile = await page.evaluate(async ({ moduleUrl, run, username }) => {
        const { supabase } = await import(moduleUrl); const user = await supabase.auth.getUser();
        if (user.error || user.data.user?.app_metadata?.konnekt_test_run !== run) throw Error('Not the approved fixture');
        const row = await supabase.from('profiles').select('id,username,full_name,encryption_public_key').eq('id', user.data.user.id).single();
        if (row.error || row.data.username !== username) throw Error('Fixture mismatch');
        const key = await (await import('/KONNEKT/src/konnektEncryption.js')).getStoredKonnektIdentity(row.data.id);
        if (!key?.privateKey || JSON.stringify(key.publicJwk) !== row.data.encryption_public_key) throw Error('Existing keys unavailable; no identity will be replaced');
        return row.data;
      }, { moduleUrl, run: config.fixtureRun, username: config.accounts[index].username });
      console.log('ACCEPTANCE fixture ' + index + ' ready');
      await page.evaluate(() => {
        const original = URL.createObjectURL.bind(URL); window.__qaAudioBlobs = new Map();
        URL.createObjectURL = blob => { const url = original(blob); if (blob.type.startsWith('audio/')) window.__qaAudioBlobs.set(url, blob); return url; };
        window.__qaAudioContexts = [];
        navigator.mediaDevices.getUserMedia = async () => {
          const context = new AudioContext(), tone = context.createOscillator(), output = context.createMediaStreamDestination();
          tone.connect(output); tone.start(); window.__qaAudioContexts.push(context); window.__qaLastTracks = output.stream.getTracks(); return output.stream;
        };
      });
      await action(page, profile);
      assert.equal(violations.length, 0);
    } finally {
      await page.evaluate(async () => {
        for (const { client, channel } of window.__qaVoiceChannels || []) await client.removeChannel(channel);
        if (window.__qaOutsider) await window.__qaOutsider.auth.signOut({ scope: 'local' });
      }).catch(() => {});
      await page.evaluate(async () => { for (const context of window.__qaAudioContexts || []) await context.close(); }).catch(() => {});
      currentNetwork?.(); currentNetwork = null; await currentContext.close(); currentContext = null;
    }
  }
  let pinnedIds = null;
  async function conversations(page, index, profile) {
    return page.evaluate(async ({ moduleUrl, peerUsername, owner, pinnedIds }) => {
      const { supabase } = await import(moduleUrl);
      const peer = await supabase.from('profiles').select('id,username,full_name').eq('username', peerUsername).single(); if (peer.error) throw Error('Peer unavailable');
      const memberships = await supabase.from('conversation_members').select('conversation_id').eq('user_id', owner); if (memberships.error) throw Error('Memberships unavailable');
      const ids = memberships.data.map(row => row.conversation_id);
      const rows = await supabase.from('conversations').select('id,title,is_group').in('id', ids); if (rows.error) throw Error('Conversations unavailable');
      const members = await supabase.from('conversation_members').select('conversation_id,user_id').in('conversation_id', ids); if (members.error) throw Error('Members unavailable');
      const allowed = rows.data.filter(row => { const set = members.data.filter(member => member.conversation_id === row.id).map(member => member.user_id); return set.length === 2 && set.includes(owner) && set.includes(peer.data.id); });
      const direct = allowed.find(row => !row.is_group && (!pinnedIds || row.id === pinnedIds.direct)), group = allowed.find(row => row.is_group && row.title && (!pinnedIds || row.id === pinnedIds.group));
      if (!direct || !group) throw Error('Existing direct/group fixture unavailable');
      return [{ ...direct, name: peer.data.full_name || peer.data.username }, { ...group, name: group.title }];
    }, { moduleUrl, peerUsername: config.accounts[index === 0 ? 1 : 0].username, owner: profile.id, pinnedIds });
  }
  async function open(page, conversation) { await tab(page, 'Chats'); await page.getByTestId('conversation-' + conversation.id).click(); await page.getByPlaceholder('Message securely…').waitFor(); }
  async function receive(page, message) {
    await open(page, message.conversation);
    if (message.kind === 'document') {
      await page.evaluate(() => { window.open = url => { window.__qaDocumentUrl = url; return null; }; });
      await page.getByTestId('message-' + message.id).getByRole('button', { name: 'Open attachment', exact: true }).click();
      const digest = await page.evaluate(async () => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await (await fetch(window.__qaDocumentUrl)).arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join(''));
      assert.equal(digest, message.sha256); return;
    }
    const audio = page.getByTestId('message-' + message.id).getByLabel('Voice message', { exact: true }); await audio.waitFor();
    const hash = await audio.evaluate(async node => {
      const blob = window.__qaAudioBlobs.get(node.src); if (!blob) throw Error('Not decrypted audio');
      return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');
    });
    assert.equal(hash, message.sha256);
    await audio.evaluate(node => node.play()); await page.waitForFunction(id => document.querySelector(`[data-testid="message-${id}"] audio`)?.currentTime > 0, message.id); await audio.evaluate(node => node.pause());
    await audio.evaluate(node => { node.currentTime = 0.1; });
    await audio.evaluate(node => node.play()); await page.waitForFunction(id => document.querySelector(`[data-testid="message-${id}"] audio`)?.currentTime > 0.15, message.id); await audio.evaluate(node => node.pause());
    await page.getByTestId('message-' + message.id).getByRole('button', { name: 'Playback speed: 1×', exact: true }).click();
    assert.equal(await audio.evaluate(node => node.playbackRate), 1.5);
  }
  const sent = [[], []];
  for (const index of [0, 1]) {
    phase = 'actor-' + index;
    await actor(index, async (page, profile) => {
      const chats = await conversations(page, index, profile);
      if (index === 0) pinnedIds = { direct: chats[0].id, group: chats[1].id };
      if (index === 1) for (const message of sent[0]) { message.conversation.name = chats.find(chat => chat.id === message.conversation.id).name; await receive(page, message); }
      // A separate nonpersistent C client cannot replace the app's own session.
      await page.evaluate(async ({ config, moduleUrl, runId }) => {
        const sdkUrl = performance.getEntriesByType('resource').map(row => row.name).find(url => url.includes('@supabase_supabase-js'));
        if (!sdkUrl?.startsWith(location.origin)) throw Error('SDK module unavailable');
        const { createClient } = await import(sdkUrl);
        const outsider = createClient(config.projectUrl, config.publishableKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'qa-voice-outsider-' + runId } });
        const result = await outsider.auth.signInWithPassword({ email: config.accounts[2].email, password: config.accounts[2].password });
        if (result.error || result.data.user.app_metadata.konnekt_test_run !== config.fixtureRun) throw Error('Outsider unavailable');
        const { supabase } = await import(moduleUrl);
        const actor = await supabase.auth.getUser();
        if (actor.error || actor.data.user.id === result.data.user.id) throw Error('App session changed');
        window.__qaOutsider = outsider; window.__qaOutsiderId = result.data.user.id;
        window.__qaOutsiderEvents = []; window.__qaMemberEvents = []; window.__qaChannelHealthy = true;
        async function subscribe(client, name, events) {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(Error('Realtime subscribe timeout')), 15000);
            const channel = client.channel(name).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => events.push({ id: payload.new.id, conversation_id: payload.new.conversation_id })).subscribe(status => {
              if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); }
              if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) window.__qaChannelHealthy = false;
            });
            (window.__qaVoiceChannels ||= []).push({ client, channel });
          });
        }
        await subscribe(supabase, 'qa-voice-member-' + runId, window.__qaMemberEvents);
        await subscribe(outsider, 'qa-voice-outsider-' + runId, window.__qaOutsiderEvents);
      }, { config, moduleUrl, runId: report.runId + '-' + index });
      async function control() {
        return page.evaluate(async ({ moduleUrl, username }) => {
          const { supabase } = await import(moduleUrl);
          const chat = await supabase.rpc('konnekt_start_direct_conversation', { target_username: username }); if (chat.error) throw Error('Control conversation unavailable');
          const row = await window.__qaOutsider.from('messages').insert({ conversation_id: chat.data, sender_id: window.__qaOutsiderId, body: 'TEST VOICE ACCEPTANCE CONTROL' }).select('id').single();
          if (row.error) throw Error('Control write failed'); return row.data.id;
        }, { moduleUrl, username: config.accounts[2].username });
      }
      const before = await control(); await page.waitForFunction(id => window.__qaOutsiderEvents.some(row => row.id === id), before);
      for (const kind of ['voice', 'document']) for (const conversation of chats) {
        phase = `actor-${index}-${conversation.is_group ? 'group' : 'direct'}`;
        await open(page, conversation);
        let sha256, response;
        if (kind === 'voice') {
        await page.getByRole('button', { name: 'Record voice note', exact: true }).click(); await page.getByText('Start recording', { exact: true }).click();
        await page.getByText('Stop recording', { exact: true }).waitFor(); await delay(500);
        await page.getByRole('button', { name: 'Pause recording', exact: true }).click(); await page.getByText('Recording paused', { exact: true }).waitFor(); await page.getByRole('button', { name: 'Resume recording', exact: true }).click(); await delay(200);
        await page.getByText('Stop recording', { exact: true }).click(); const preview = page.getByLabel('Voice note preview', { exact: true }); await preview.waitFor();
        sha256 = await preview.evaluate(async node => [...new Uint8Array(await crypto.subtle.digest('SHA-256', await window.__qaAudioBlobs.get(node.src).arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join(''));
        assert(await page.evaluate(() => window.__qaLastTracks.every(track => track.readyState === 'ended')));
        const inserted = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/rest/v1/messages');
        await page.getByText('Send voice note', { exact: true }).click(); response = await inserted;
        await page.getByRole('alertdialog', { name: 'Voice note sent', exact: true }).getByRole('button', { name: 'OK', exact: true }).click();
        } else {
          const content = Buffer.from('TEST PRIVATE DOCUMENT ' + report.runId + ' ' + index + ' ' + conversation.is_group);
          sha256 = createHash('sha256').update(content).digest('hex');
          const chooser = page.waitForEvent('filechooser'); await page.getByRole('button', { name: 'Attach media', exact: true }).click();
          const inserted = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/rest/v1/messages');
          await (await chooser).setFiles({ name: 'test-private-document.txt', mimeType: 'text/plain', buffer: content }); response = await inserted;
        }
        assert(response.ok()); const payload = response.request().postDataJSON(); assert(payload.is_encrypted && payload.media_encrypted); assert(!payload.body.includes('konnekt.voice'));
        const id = payload.id || await page.evaluate(async ({ moduleUrl, path, owner }) => { const { supabase } = await import(moduleUrl); const row = await supabase.from('messages').select('id').eq('media_path', path).eq('sender_id', owner).single(); if (row.error) throw Error('Document confirmation failed'); return row.data.id; }, { moduleUrl, path: payload.media_path, owner: profile.id });
        const message = { id, path: payload.media_path, conversation, sha256, kind };
        sent[index].push(message); report.messages.push({ id, path: payload.media_path, group: conversation.is_group, actor: index, kind }); await save();
        const denied = await page.evaluate(async ({ id, path }) => {
          const client = window.__qaOutsider;
          const rows = await client.from('messages').select('id').eq('id', id);
          const file = await client.storage.from('konnekt-chat-media').download(path);
          const link = await client.storage.from('konnekt-chat-media').createSignedUrl(path, 30);
          return !rows.error && rows.data.length === 0 && !!file.error && !!link.error;
        }, message); assert(denied);
        await pass(`${index === 0 ? 'A to B' : 'B to A'} ${conversation.is_group ? 'group' : 'direct'} ${kind}: actual encrypted insert and outsider message/file/signed-link denial`);
      }
      const after = await control(); await page.waitForFunction(id => window.__qaOutsiderEvents.some(row => row.id === id), after);
      await page.waitForFunction(ids => ids.every(id => window.__qaMemberEvents.some(row => row.id === id)), sent[index].map(message => message.id));
      const events = await page.evaluate(() => ({ outsiderEvents: window.__qaOutsiderEvents, memberEvents: window.__qaMemberEvents, subscriptionHealthy: window.__qaChannelHealthy }));
      for (const message of sent[index]) assertIsolation({ ...events, conversationId: message.conversation.id, protectedIds: [message.id], beforeControlId: before, afterControlId: after });
      await pass(`actor ${index}: actual member Realtime delivery and outsider exclusion with before/after positive controls`);
      if (index === 0) {
        phase = 'test-report';
        await tab(page, 'Discover'); await page.getByLabel('Search Discover').fill(config.accounts[1].username); await page.getByText('@' + config.accounts[1].username, { exact: true }).click();
        await page.getByText('Report account', { exact: true }).click(); await page.getByText('Other', { exact: true }).click(); await page.getByPlaceholder('Additional details (optional)').fill('TEST REPORT — controlled KONNEKT acceptance ' + report.runId);
        const submitted = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/rest/v1/user_reports'); await page.getByText('Submit report', { exact: true }).click();
        const result = await submitted; assert(result.ok()); const rows = await result.json(); const reportId = rows[0]?.id || rows.id; assert(reportId);
        await page.getByRole('alertdialog', { name: 'Report submitted', exact: true }).getByRole('button', { name: 'OK', exact: true }).click();
        const privateReport = await page.evaluate(async id => { const row = await window.__qaOutsider.from('user_reports').select('id').eq('id', id); return !row.error && row.data.length === 0; }, reportId); assert(privateReport);
        report.testReportId = reportId;
        await pass('actual clearly labelled TEST REPORT submission succeeds and outsider C cannot read the moderation record');
      }
    });
  }
  phase = 'A-receive';
  await actor(0, async (page, profile) => {
    const chats = await conversations(page, 0, profile);
    for (const message of sent[1]) { message.conversation.name = chats.find(chat => chat.id === message.conversation.id).name; await receive(page, message); }
  });
  await pass('both original account identities decrypted peer direct/group voice and documents with matching original byte hashes; audio playback, seeking and speed work in-browser');
  report.decision = 'PASS_SCOPED_LIVE_ENCRYPTED_SYNTHETIC_VOICE_DOCUMENTS_REPORTING';
} catch (error) {
  report.decision = 'FAIL_OR_BLOCKED'; report.failedPhase = phase; process.exitCode = 1;
  await mkdir(directory, { recursive: true, mode: 0o700 }); await writeFile(directory + '/error.local', String(error?.stack || error), { mode: 0o600 }); console.error('FAIL_OR_BLOCKED: ' + phase);
} finally {
  currentNetwork?.(); await currentContext?.close().catch(() => {}); server?.kill(); await save();
  console.log('Private report saved; fixture evidence retained for approved cleanup. No physical microphone/device acceptance claimed.');
}
