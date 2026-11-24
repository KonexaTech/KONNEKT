import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_VOICE_BYTES, MAX_VOICE_MS, validateVoiceFile, voiceMetadata, parseVoiceMetadata, voiceTime, voiceMessageId } from '../src/services/voiceNoteFormat.js';
import { claimAudioPlayback, releaseAudioPlayback } from '../src/services/audioPlayback.js';

test('voice metadata roundtrips without exposing extra fields or accepting invalid duration/format/size', () => {
  const metadata = voiceMetadata({ size: 3000, type: 'audio/webm;codecs=opus' }, 2500);
  assert.equal(metadata.duration_ms, 2500);
  assert.deepEqual(parseVoiceMetadata(JSON.stringify({ ...metadata, unexpected: 'ignored' })), metadata);
  for (const file of [{ size: 0, type: 'audio/webm' }, { size: MAX_VOICE_BYTES + 1, type: 'audio/webm' }, { size: 1, type: 'text/html' }]) assert.throws(() => validateVoiceFile(file));
  for (const ms of [NaN, -1, MAX_VOICE_MS + 1]) assert.throws(() => voiceMetadata({ size: 1, type: 'audio/mp4' }, ms));
  for (const text of ['Voice note', '{}', '{', JSON.stringify({ ...metadata, version: 2 }), JSON.stringify({ ...metadata, duration_ms: -1 }), 'x'.repeat(513)]) assert.equal(parseVoiceMetadata(text), null);
  assert.equal(voiceTime(65000), '01:05');
});
test('voice retry identities use secure UUID v4 values without requiring crypto.randomUUID', () => {
  const ids = Array.from({ length: 100 }, voiceMessageId);
  assert.equal(new Set(ids).size, 100);
  assert(ids.every(id => /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id)));
});
test('starting a second audio pauses only the previous player and cleanup cannot revoke a newer player', () => {
  let a = 0, b = 0;
  const first = { pause: () => { a++; } }, second = { pause: () => { b++; } };
  claimAudioPlayback(first); claimAudioPlayback(first); assert.equal(a, 0);
  claimAudioPlayback(second); assert.equal(a, 1);
  releaseAudioPlayback(first); claimAudioPlayback(first); assert.equal(b, 1);
  releaseAudioPlayback(first);
});
