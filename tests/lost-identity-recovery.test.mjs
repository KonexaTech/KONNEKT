import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/konnektEncryption.js', import.meta.url), 'utf8')
  .replace("import { supabase } from './lib_supabase';", 'const supabase = globalThis.__lostKeyTestSupabase;');

function makeIndexedDb(keys) {
  return {
    open() {
      const openRequest = {};
      const db = {
        createObjectStore() {},
        close() {},
        transaction() {
          return {
            objectStore() {
              return {
                get(id) {
                  const request = {};
                  queueMicrotask(() => {
                    request.result = keys.get(id);
                    request.onsuccess?.();
                  });
                  return request;
                },
                put(value, id) {
                  const request = {};
                  queueMicrotask(() => {
                    keys.set(id, value);
                    request.onsuccess?.();
                  });
                  return request;
                }
              };
            }
          };
        }
      };
      queueMicrotask(() => {
        openRequest.result = db;
        openRequest.onupgradeneeded?.();
        openRequest.onsuccess?.();
      });
      return openRequest;
    }
  };
}

async function setup({ hasLocal = false, hasBackup = false, rpcFailure = false } = {}) {
  const keys = new Map();
  if (hasLocal) keys.set('owner-id', { privateKey: 'test-key', publicJwk: { kty: 'EC' } });
  const state = {
    registered: '{"kty":"EC","crv":"P-256","x":"old","y":"old"}',
    backup: hasBackup ? { user_id: 'owner-id' } : null,
    rpcCalls: []
  };
  globalThis.indexedDB = makeIndexedDb(keys);
  globalThis.__lostKeyTestSupabase = {
    auth: { async getUser() { return { data: { user: { id: 'owner-id' } }, error: null }; } },
    from(table) {
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  if (table === 'profiles') return { data: { encryption_public_key: state.registered }, error: null };
                  return { data: state.backup, error: null };
                }
              };
            }
          };
        }
      };
    },
    async rpc(name, args) {
      state.rpcCalls.push({ name, args });
      if (rpcFailure) return { data: null, error: new Error('RPC denied') };
      assert.equal(name, 'konnekt_replace_lost_encryption_identity');
      assert.equal(state.backup, null);
      assert.equal(args.p_previous_public_key, state.registered);
      state.registered = args.p_next_public_key;
      state.backup = { user_id: 'owner-id', ...args };
      return { data: true, error: null };
    }
  };
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64') +
    '#' + Math.random().toString(36).slice(2);
  const encryption = await import(moduleUrl);
  return { state, keys, encryption };
}

test('lost-key reset refuses a device that still stores an identity', async () => {
  const { state, encryption } = await setup({ hasLocal: true });
  await assert.rejects(() => encryption.replaceLostKonnektIdentity('new-long-passphrase'), /still has an encryption identity/);
  assert.equal(state.rpcCalls.length, 0);
});

test('lost-key reset refuses accounts with an existing backup', async () => {
  const { state, encryption } = await setup({ hasBackup: true });
  await assert.rejects(() => encryption.replaceLostKonnektIdentity('new-long-passphrase'), /recovery backup exists/);
  assert.equal(state.rpcCalls.length, 0);
});

test('lost-key reset does not save a new local key when server denies the atomic RPC', async () => {
  const { state, keys, encryption } = await setup({ rpcFailure: true });
  await assert.rejects(() => encryption.replaceLostKonnektIdentity('new-long-passphrase'), /RPC denied/);
  assert.equal(state.rpcCalls.length, 1);
  assert.equal(keys.size, 0);
  assert.equal(state.backup, null);
});

test('lost-key reset creates a P-256 private key and passphrase-protected backup', async () => {
  const { state, keys, encryption } = await setup();
  const passphrase = 'correct-horse-new-backup-2026';
  await encryption.replaceLostKonnektIdentity(passphrase);
  const identity = keys.get('owner-id');
  assert.equal(identity.privateKey.type, 'private');
  assert.equal(identity.publicJwk.crv, 'P-256');
  assert.equal(JSON.stringify(identity.publicJwk), state.registered);
  assert.equal(state.rpcCalls.length, 1);
  assert.equal(state.rpcCalls[0].args.p_key_version, 1);

  const backup = state.backup;
  const salt = Uint8Array.from(Buffer.from(backup.p_salt, 'base64'));
  const iv = Uint8Array.from(Buffer.from(backup.p_iv, 'base64'));
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: backup.p_iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, key, Buffer.from(backup.p_ciphertext, 'base64')
  );
  const payload = JSON.parse(new TextDecoder().decode(plaintext));
  assert.equal(payload.userId, 'owner-id');
  assert.equal(JSON.stringify(payload.publicJwk), state.registered);
  assert.ok(payload.privateKey.length > 50);
});

test('reset screen requires an explicit typed warning and no existing backup', () => {
  const screen = readFileSync(new URL('../src/screens/KeyRecoveryScreen.jsx', import.meta.url), 'utf8');
  assert.match(screen, /resetPhrase !== 'RESET MY ENCRYPTION'/);
  assert.match(screen, /hasLocalIdentity === false/);
  assert.match(screen, /hasRecoveryBackup === false/);
  assert.match(screen, /START NEW ENCRYPTION IDENTITY/);
  assert.match(screen, /Older encrypted messages cannot be opened with this new key/);
});

test('atomic SQL RPC is invoker-only and checks owner and backup existence', () => {
  const sql = readFileSync(new URL('../20261121_konnekt_lost_identity_reset.sql', import.meta.url), 'utf8');
  assert.match(sql, /SECURITY INVOKER/);
  assert.doesNotMatch(sql, /SECURITY DEFINER/);
  assert.match(sql, /auth.uid\(\)/);
  assert.match(sql, /FOR UPDATE/);
  assert.match(sql, /EXISTS \(\s*SELECT 1 FROM public.user_key_backups/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public.konnekt_replace_lost_encryption_identity/);
  assert.doesNotMatch(sql, /\b(?:DELETE|TRUNCATE|DROP TABLE)\b/i);
});
