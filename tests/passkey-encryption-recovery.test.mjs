import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/konnektEncryption.js', import.meta.url), 'utf8')
  .replace("import { supabase } from './lib_supabase';", 'const supabase = globalThis.__passkeyTestSupabase;');

const createFakeIndexedDb = keys => ({
  open() {
    const request = {};
    const db = {
      close() {},
      createObjectStore() {},
      transaction() {
        return {
          objectStore() {
            return {
              get(id) {
                const r = {};
                queueMicrotask(() => { r.result = keys.get(id); r.onsuccess?.(); });
                return r;
              },
              put(value, id) {
                const r = {};
                queueMicrotask(() => { keys.set(id, value); r.onsuccess?.(); });
                return r;
              }
            };
          }
        };
      }
    };
    queueMicrotask(() => {
      request.result = db;
      request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  }
});

async function setup() {
  const keys = new Map();
  const state = { profile: null, backup: null, prompts: 0, enrolled: 0, failPrf: false, wrongPrf: false };
  const credentialId = crypto.getRandomValues(new Uint8Array(32));
  const prfSecret = crypto.getRandomValues(new Uint8Array(32));
  globalThis.indexedDB = createFakeIndexedDb(keys);
  globalThis.PublicKeyCredential = class {};
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      credentials: {
        async create(options) {
          assert.equal(options.publicKey.rp.name, 'KONNEKT');
          assert.equal(options.publicKey.authenticatorSelection.userVerification, 'required');
          state.enrolled++;
          return { rawId: credentialId };
        },
        async get(options) {
          assert.equal(options.publicKey.userVerification, 'required');
          state.prompts++;
          return {
            rawId: credentialId,
            getClientExtensionResults() {
              return state.failPrf
                ? { prf: {} }
                : { prf: { results: { first: state.wrongPrf ? crypto.getRandomValues(new Uint8Array(32)).buffer : prfSecret.buffer } } };
            }
          };
        }
      }
    }
  });
  globalThis.__passkeyTestSupabase = {
    auth: { async getUser() { return { data: { user: { id: 'owner-id', email: 'fixture@example.invalid' } }, error: null }; } },
    from(table) {
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle() {
                  if (table === 'profiles') return { data: { encryption_public_key: state.profile }, error: null };
                  return { data: state.backup, error: null };
                }
              };
            }
          };
        },
        update(row) {
          return {
            async eq() {
              if (table !== 'profiles') throw Error('Wrong update target');
              state.profile = row.encryption_public_key;
              return { error: null };
            }
          };
        },
        async upsert(row) {
          assert.equal(table, 'user_key_passkey_backups');
          assert.equal(row.user_id, 'owner-id');
          assert.ok(!row.privateKey);
          state.backup = row;
          return { error: null };
        }
      };
    }
  };
  const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(source).toString('base64') +
    '#' + Math.random().toString(36).slice(2);
  return { keys, state, encryption: await import(moduleUrl) };
}

test('passkey enrollment stores only encrypted identity and restores same key automatically', async () => {
  const { keys, state, encryption } = await setup();
  const original = await encryption.ensureKonnektIdentity('owner-id');
  const publicKey = JSON.stringify(original.publicJwk);
  await encryption.enrollKonnektAutomaticKeyRecovery();
  assert.ok(state.backup.ciphertext.length > 80);
  assert.ok(state.backup.iv);
  assert.ok(state.backup.salt);
  assert.equal(state.enrolled, 1);
  assert.equal(state.prompts, 1);
  assert.equal(state.profile, publicKey);
  keys.delete('owner-id');

  const recovered = await encryption.ensureKonnektIdentity('owner-id');
  assert.equal(JSON.stringify(recovered.publicJwk), publicKey);
  assert.equal(recovered.privateKey.type, 'private');
  assert.equal(state.prompts, 2);
  assert.equal(state.profile, publicKey, 'passkey restore cannot rotate the registered identity');
});

test('incorrect passkey PRF secret never overwrites encryption public key or saves a new private key', async () => {
  const { keys, state, encryption } = await setup();
  const original = await encryption.ensureKonnektIdentity('owner-id');
  await encryption.enrollKonnektAutomaticKeyRecovery();
  keys.delete('owner-id');
  const previous = state.profile;
  state.wrongPrf = true;
  await assert.rejects(() => encryption.ensureKonnektIdentity('owner-id'), /private key is not stored on this device/);
  assert.equal(state.profile, previous);
  assert.equal(keys.size, 0);
  assert.equal(JSON.stringify(original.publicJwk), previous);
});

test('unsupported PRF provider does not save a passkey backup', async () => {
  const { state, encryption } = await setup();
  await encryption.ensureKonnektIdentity('owner-id');
  state.failPrf = true;
  await assert.rejects(() => encryption.enrollKonnektAutomaticKeyRecovery(), /does not support encrypted-key recovery/);
  assert.equal(state.backup, null);
});

test('passkey restore requires no automatic identity rotation and server table is owner scoped', () => {
  const sql = readFileSync(new URL('../20261121_konnekt_passkey_key_backups.sql', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../src/konnektEncryption.js', import.meta.url), 'utf8');
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /user_id = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(sql, /SECURITY DEFINER/);
  assert.doesNotMatch(sql, /\b(?:DELETE|TRUNCATE|DROP TABLE)\b/i);
  assert.match(script, /restoreKonnektIdentityFromPasskey\(userId, profile\.encryption_public_key\)/);
  assert.match(script, /JSON\.stringify\(payload\.publicJwk\) !== expectedPublicKey/);
  assert.match(script, /Signed-in account changed during passkey recovery/);
});
