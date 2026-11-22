export const MAX_VOICE_BYTES = 15 * 1024 * 1024 - 16; // AES-GCM tag counts toward the existing upload cap.
export const MAX_VOICE_MS = 5 * 60 * 1000;

export function validateVoiceFile(file) {
  if (!file || !Number.isSafeInteger(file.size) || file.size <= 0) throw new Error('The recording is empty. Record some audio before sending.');
  if (file.size > MAX_VOICE_BYTES) throw new Error('Voice notes must be smaller than 15 MB. Record a shorter note.');
  if (!/^audio\/(webm|ogg|mp4|aac|mpeg|wav|x-wav)(;|$)/i.test(file.type || '')) throw new Error('Choose a supported audio recording.');
}

export function voiceMetadata(file, durationMs) {
  validateVoiceFile(file);
  if (!Number.isFinite(durationMs) || durationMs < 0 || durationMs > MAX_VOICE_MS) throw new Error('The recording duration is invalid. Record a new note.');
  return { kind: 'konnekt.voice', version: 1, duration_ms: Math.round(durationMs), size_bytes: file.size, mime_type: file.type.split(';')[0].toLowerCase() };
}

export function parseVoiceMetadata(text) {
  if (typeof text !== 'string' || text.length > 512) return null;
  try {
    const value = JSON.parse(text);
    if (value.kind !== 'konnekt.voice' || value.version !== 1) return null;
    const expected = voiceMetadata({ size: value.size_bytes, type: value.mime_type }, value.duration_ms);
    return expected;
  } catch { return null; }
}

export function voiceTime(milliseconds) {
  const seconds = Math.max(0, Math.floor((Number.isFinite(milliseconds) ? milliseconds : 0) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function voiceMessageId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = [...bytes].map(b => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}
