import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, setup, ME, OTHER, CHAT } from './helpers.mjs';
let server;
before(async () => { server = await startServer(); });
after(() => server?.stop());
async function fixture() {
  const f = await setup(server.base);
  await f.page.getByRole('tab', { name: 'Chats', exact: true }).waitFor();
  f.db.profiles[1].encryption_public_key = await f.page.evaluate(async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
    return JSON.stringify(await crypto.subtle.exportKey('jwk', pair.publicKey));
  });
  return f;
}
test('empty voice recordings are rejected before encryption upload or message insert', async () => {
  const f = await fixture();
  try {
    const error = await f.page.evaluate(async ({ me, chat }) => {
      try { await (await import('/KONNEKT/src/services/voiceMessages.js')).sendEncryptedVoiceMessage(new File([], 'empty.webm', { type: 'audio/webm' }), chat, me); }
      catch (error) { return error.message; }
    }, { me: ME, chat: CHAT });
    assert.match(error || '', /empty|no audio/i);
    assert.equal(f.db.messages.length, 0);
    assert.equal(f.requests.filter(r => r.method === 'POST' && r.path.includes('/storage/')).length, 0);
  } finally { await f.close(); }
});
test('retry after a committed voice insert and failed verification reuses the message identity without duplicate upload', async () => {
  const f = await fixture();
  try {
    await f.context.route('**/rest/v1/messages', async route => {
      if (route.request().method() !== 'POST') return route.fallback();
      const body = route.request().postDataJSON();
      f.db.messages.push({ ...body, id: body.id || crypto.randomUUID() });
      f.failures.set('GET:messages', { message: 'Fixture confirmation outage' });
      return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Fixture lost success response' }) });
    });
    const first = await f.page.evaluate(async ({ me, chat }) => {
      window.__voiceDraft = {};
      window.__voiceFile = new File(['fixture audio bytes'], 'voice.webm', { type: 'audio/webm' });
      try { await (await import('/KONNEKT/src/services/voiceMessages.js')).sendEncryptedVoiceMessage(window.__voiceFile, chat, me, { draft: window.__voiceDraft, durationMs: 2000 }); }
      catch (error) { return error.message; }
    }, { me: ME, chat: CHAT });
    assert.match(first || '', /confirm|retained/i);
    assert.equal(f.db.messages.length, 1);
    const uploads = f.requests.filter(r => r.method === 'POST' && r.path.includes('/storage/')).length;
    f.failures.delete('GET:messages');
    await f.context.unroute('**/rest/v1/messages');
    await f.page.evaluate(async ({ me, chat }) => {
      await (await import('/KONNEKT/src/services/voiceMessages.js')).sendEncryptedVoiceMessage(window.__voiceFile, chat, me, { draft: window.__voiceDraft, durationMs: 2000 });
    }, { me: ME, chat: CHAT });
    assert.equal(f.db.messages.length, 1, 'Retry duplicated a committed voice note');
    assert.equal(f.requests.filter(r => r.method === 'POST' && r.path.includes('/storage/')).length, uploads);
  } finally { await f.close(); }
});

test('voice recording pause/resume, cancel and preview use existing chat controls', async () => {
  const f = await fixture();
  try {
    await f.page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        const context = new AudioContext(), tone = context.createOscillator(), dest = context.createMediaStreamDestination();
        tone.connect(dest); tone.start(); window.__voiceTracks = dest.stream.getTracks();
        return dest.stream;
      };
    });
    await f.page.getByRole('tab', { name: 'Chats', exact: true }).click();
    await f.page.getByText('Other Member', { exact: true }).click();
    await f.page.getByRole('button', { name: 'Record voice note', exact: true }).click();
    await f.page.getByText('Start recording', { exact: true }).click();
    await f.page.getByRole('button', { name: 'Pause recording', exact: true }).click();
    await f.page.getByText('Recording paused', { exact: true }).waitFor();
    await f.page.getByRole('button', { name: 'Resume recording', exact: true }).click();
    await f.page.waitForTimeout(400);
    await f.page.getByText('Stop recording', { exact: true }).click();
    await f.page.getByLabel('Voice note preview', { exact: true }).waitFor();
    assert(await f.page.evaluate(() => window.__voiceTracks.every(t => t.readyState === 'ended')));
    await f.page.getByText('Discard', { exact: true }).click();
    await f.page.getByText('Start recording', { exact: true }).click();
    await f.page.getByRole('button', { name: 'Cancel recording', exact: true }).click();
    await f.page.getByText('Start recording', { exact: true }).waitFor();
    assert(await f.page.evaluate(() => window.__voiceTracks.every(t => t.readyState === 'ended')));
    assert.equal(f.db.messages.length, 0);
  } finally { await f.close(); }
});

test('audio attachments coordinate playback and offer supported speed and seeking controls', async () => {
  const f = await setup(server.base, { db: { messages: [1, 2].map(i => ({ id: `voice-${i}`, conversation_id: CHAT, sender_id: OTHER, body: 'Voice note', media_path: `fixture/audio-${i}.wav`, media_type: 'audio', created_at: '2026-11-17T00:00:00Z' })) } });
  try {
    const samples = 8000, bytes = Buffer.alloc(44 + samples * 2);
    bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8); bytes.writeUInt32LE(16, 16);
    bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write('data', 36); bytes.writeUInt32LE(samples * 2, 40);
    for (let i = 0; i < samples; i++) bytes.writeInt16LE(Math.sin(i / 8) * 5000, 44 + 2 * i);
    await f.context.route('**/storage/v1/object/**', route => route.fulfill({ status: 200, contentType: 'audio/wav', body: bytes }));
    await f.page.getByRole('tab', { name: 'Chats', exact: true }).click(); await f.page.getByText('Other Member', { exact: true }).click();
    const audio = f.page.locator('audio'); await audio.nth(1).waitFor();
    await f.page.waitForFunction(() => [...document.querySelectorAll('audio')].every(a => a.readyState >= 2));
    await audio.nth(0).evaluate(a => a.play()); await audio.nth(1).evaluate(a => a.play());
    assert(await audio.nth(0).evaluate(a => a.paused));
    await f.page.getByRole('button', { name: 'Playback speed: 1×', exact: true }).nth(1).click();
    assert.equal(await audio.nth(1).evaluate(a => a.playbackRate), 1.5);
    await f.page.getByRole('button', { name: 'Playback speed: 1.5×', exact: true }).click();
    assert.equal(await audio.nth(1).evaluate(a => a.playbackRate), 2);
    await audio.nth(1).evaluate(a => { a.pause(); a.currentTime = 0.5; });
    assert(Math.abs(await audio.nth(1).evaluate(a => a.currentTime) - 0.5) < 0.1);
    assert(await audio.nth(1).evaluate(a => a.controls && a.src.startsWith('blob:')));
  } finally { await f.close(); }
});

test('voice permission denial and cancellation of a pending grant leave the chat usable without capture', async () => {
  const f = await fixture();
  try {
    await f.page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Microphone permission denied', 'NotAllowedError'); }; });
    await f.page.getByRole('tab', { name: 'Chats', exact: true }).click(); await f.page.getByText('Other Member', { exact: true }).click();
    await f.page.getByRole('button', { name: 'Record voice note', exact: true }).click();
    await f.page.getByText('Start recording', { exact: true }).click(); await f.page.getByText(/Microphone permission denied/).waitFor();
    await f.page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { window.__grantVoice = () => {
        const context = new AudioContext(), source = context.createOscillator(), dest = context.createMediaStreamDestination(); source.connect(dest); source.start();
        window.__lateVoiceTracks = dest.stream.getTracks(); resolve(dest.stream);
      }; });
    });
    await f.page.getByText('Start recording', { exact: true }).click();
    await f.page.getByRole('button', { name: 'Cancel recording', exact: true }).click();
    await f.page.evaluate(() => window.__grantVoice());
    await f.page.waitForFunction(() => window.__lateVoiceTracks.every(t => t.readyState === 'ended'));
    await f.page.getByText('Start recording', { exact: true }).waitFor();
    assert.equal(f.db.messages.length, 0);
  } finally { await f.close(); }
});

test('recording errors stop tracks and never offer a corrupt recording for sending', async () => {
  const f = await fixture();
  try {
    await f.page.evaluate(() => {
      const Original = MediaRecorder;
      window.MediaRecorder = class extends Original { start(...args) { super.start(...args); setTimeout(() => this.onerror?.(new Event('error')), 100); } };
      navigator.mediaDevices.getUserMedia = async () => { const c = new AudioContext(), t = c.createOscillator(), d = c.createMediaStreamDestination(); t.connect(d); t.start(); window.__errorTracks = d.stream.getTracks(); return d.stream; };
    });
    await f.page.getByRole('tab', { name: 'Chats', exact: true }).click(); await f.page.getByText('Other Member', { exact: true }).click();
    await f.page.getByRole('button', { name: 'Record voice note', exact: true }).click(); await f.page.getByText('Start recording', { exact: true }).click();
    await f.page.getByText(/Microphone recording failed/).waitFor();
    assert(await f.page.evaluate(() => window.__errorTracks.every(t => t.readyState === 'ended')));
    assert.equal(await f.page.getByText('Send voice note', { exact: true }).count(), 0);
    assert.equal(await f.page.locator('audio').count(), 0);
  } finally { await f.close(); }
});

test('voice metadata stays encrypted, failed sends retain a retryable recording and reload renders private audio', async () => {
  const f = await fixture();
  const uploads = new Map();
  try {
    await f.context.route('**/storage/v1/object/**', async route => {
      const request = route.request(), url = new URL(request.url());
      const path = decodeURIComponent(url.pathname).replace('/authenticated/', '/');
      if (request.method() === 'POST') {
        let bytes = request.postDataBuffer();
        if (request.headers()['content-type']?.includes('multipart/form-data')) {
          const form = await new Response(bytes, { headers: { 'content-type': request.headers()['content-type'] } }).formData();
          const file = [...form.values()].find(value => typeof value !== 'string'); bytes = Buffer.from(await file.arrayBuffer());
        }
        uploads.set(path, bytes);
        return route.fallback();
      }
      if (request.method() === 'GET' && uploads.has(path)) return route.fulfill({ status: 200, contentType: 'application/octet-stream', body: uploads.get(path) });
      return route.fallback();
    });
    await f.page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { const c = new AudioContext(), t = c.createOscillator(), d = c.createMediaStreamDestination(); t.connect(d); t.start(); return d.stream; }; });
    await f.page.getByRole('tab', { name: 'Chats', exact: true }).click(); await f.page.getByText('Other Member', { exact: true }).click();
    await f.page.getByRole('button', { name: 'Record voice note', exact: true }).click(); await f.page.getByText('Start recording', { exact: true }).click();
    await f.page.getByText('Stop recording', { exact: true }).waitFor(); await f.page.waitForTimeout(400); await f.page.getByText('Stop recording', { exact: true }).click();
    f.failures.set('POST:messages', { message: 'Fixture failed send' });
    await f.page.getByText('Send voice note', { exact: true }).click(); await f.page.getByText('Fixture failed send', { exact: true }).waitFor();
    assert.equal(f.db.messages.length, 0);
    await f.page.getByLabel('Voice note preview', { exact: true }).waitFor();
    f.failures.delete('POST:messages');
    await f.page.getByText('Retry voice note', { exact: true }).click();
    const dialog = f.page.getByRole('alertdialog', { name: 'Voice note sent', exact: true }); await dialog.waitFor();
    assert.equal(f.db.messages.length, 1);
    const row = f.db.messages[0];
    const metadata = await f.page.evaluate(async row => {
      const enc = await import('/KONNEKT/src/konnektEncryption.js');
      const { supabase } = await import('/KONNEKT/src/lib_supabase.js');
      const peer = await supabase.from('profiles').select('encryption_public_key').eq('id', row.peer).single();
      const key = await enc.getKonnektConversationCryptoKey(row.me, peer.data.encryption_public_key);
      return JSON.parse(await enc.decryptWithKonnektCryptoKey(key, row.body, row.encryption_iv));
    }, { ...row, me: ME, peer: OTHER });
    assert.equal(metadata.kind, 'konnekt.voice'); assert(metadata.duration_ms > 0); assert(metadata.size_bytes > 0); assert(metadata.mime_type.startsWith('audio/'));
    assert(row.is_encrypted && row.media_encrypted); assert(!row.body.includes('konnekt.voice'));
    const attempts = f.requests.filter(r => r.method === 'POST' && r.path.endsWith('/messages'));
    assert.equal(attempts.length, 2); assert.equal(attempts[0].body.id, attempts[1].body.id);
    assert.equal(f.requests.filter(r => r.method === 'DELETE' && r.path.includes('/storage/')).length, 1);
    await dialog.getByRole('button', { name: 'OK', exact: true }).click();
    await f.page.getByLabel('Voice message', { exact: true }).waitFor();
    await f.page.reload(); await f.page.getByRole('tab', { name: 'Chats', exact: true }).click(); await f.page.getByText('Other Member', { exact: true }).click();
    await f.page.getByLabel('Voice message', { exact: true }).waitFor();
    await f.page.getByLabel('Voice message', { exact: true }).evaluate(a => a.play());
    await f.page.waitForFunction(() => document.querySelector('audio')?.currentTime > 0);
  } finally { await f.close(); }
});

test('backgrounding stops voice capture without sending and a short phone viewport can reach preview/send controls', async () => {
  const f = await fixture();
  try {
    await f.page.setViewportSize({ width: 320, height: 568 });
    await f.page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { const c = new AudioContext(), t = c.createOscillator(), d = c.createMediaStreamDestination(); t.connect(d); t.start(); window.__backgroundVoice = d.stream.getTracks(); return d.stream; }; });
    await f.page.getByRole('tab', { name: 'Chats', exact: true }).click(); await f.page.getByText('Other Member', { exact: true }).click();
    await f.page.getByRole('button', { name: 'Record voice note', exact: true }).click(); await f.page.getByText('Start recording', { exact: true }).click();
    await f.page.getByText('Stop recording', { exact: true }).waitFor(); await f.page.waitForTimeout(400);
    await f.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await f.page.getByLabel('Voice note preview', { exact: true }).waitFor();
    assert(await f.page.evaluate(() => window.__backgroundVoice.every(t => t.readyState === 'ended')));
    await f.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    const send = f.page.getByText('Send voice note', { exact: true }); await send.scrollIntoViewIfNeeded();
    const box = await send.boundingBox(); assert(box.y >= 0 && box.y + box.height <= 568);
    assert.equal(f.db.messages.length, 0);
  } finally { await f.close(); }
});

test('voice API rejects a changed actor and serializes concurrent retries of the same recording', async () => {
  const f = await fixture();
  try {
    const result = await f.page.evaluate(async ({ me, other, chat }) => {
      const { sendEncryptedVoiceMessage } = await import('/KONNEKT/src/services/voiceMessages.js');
      const file = new File(['fixture audio'], 'fixture.webm', { type: 'audio/webm' });
      let denied = false;
      try { await sendEncryptedVoiceMessage(file, chat, other); } catch { denied = true; }
      const draft = {};
      const [first, second] = await Promise.all([sendEncryptedVoiceMessage(file, chat, me, { draft }), sendEncryptedVoiceMessage(file, chat, me, { draft })]);
      return { denied, same: first.id === second.id };
    }, { me: ME, other: OTHER, chat: CHAT });
    assert(result.denied && result.same); assert.equal(f.db.messages.length, 1);
    assert.equal(f.requests.filter(r => r.method === 'POST' && r.path.endsWith('/messages')).length, 1);
  } finally { await f.close(); }
});
