import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateMediaFile } from '../src/services/mediaValidation.js';
test('PDF/text documents are private-chat-only and encrypted uploads reserve tag bytes', () => {
  for (const type of ['application/pdf', 'text/plain']) {
    assert.equal(validateMediaFile({ size: 100, type }, 'konnekt-chat-media', 16), 'document');
    assert.throws(() => validateMediaFile({ size: 100, type }, 'konnekt-public-media'));
  }
  for (const type of ['text/html', 'application/javascript', 'application/octet-stream']) assert.throws(() => validateMediaFile({ size: 10, type }, 'konnekt-chat-media'));
  assert.throws(() => validateMediaFile({ size: 0, type: 'image/png' }, 'konnekt-chat-media'));
  assert.throws(() => validateMediaFile({ size: 15 * 1024 * 1024, type: 'audio/webm' }, 'konnekt-chat-media', 16));
  assert.equal(validateMediaFile({ size: 15 * 1024 * 1024 - 16, type: 'audio/webm' }, 'konnekt-chat-media', 16), 'audio');
  assert.equal(validateMediaFile({ size: 45 * 1024 * 1024, type: 'video/webm' }, 'konnekt-public-media'), 'video');
});
