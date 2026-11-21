import { supabase } from './lib_supabase';

const DB_NAME = 'konnekt-secure-keys';
const STORE_NAME = 'identities';
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function openKeyDb() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('Secure local key storage is unavailable in this browser.'));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open secure key storage.'));
  });
}
async function readKey(userId) {
  const db = await openKeyDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(userId);
    request.onsuccess = () => { const value = request.result || null; db.close(); resolve(value); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}
async function saveKey(userId, value) {
  const db = await openKeyDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(value, userId);
    request.onsuccess = () => { db.close(); resolve(); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}
function toBase64(bytes) {
  let binary = '';
  new Uint8Array(bytes).forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}
function fromBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

const pendingIdentities = new Map();
export function ensureKonnektIdentity(userId) {
  if (!userId) return Promise.reject(new Error('Sign in before preparing encryption.'));
  if (!pendingIdentities.has(userId)) {
    const pending = prepareKonnektIdentity(userId).finally(() => pendingIdentities.delete(userId));
    pendingIdentities.set(userId, pending);
  }
  return pendingIdentities.get(userId);
}

async function prepareKonnektIdentity(userId) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure encryption is unavailable. Open KONNEKT using HTTPS on a supported browser.');
  let identity = await readKey(userId);
  const { data: profile, error: readError } = await supabase.from('profiles').select('encryption_public_key').eq('id', userId).maybeSingle();
  if (readError) throw readError;
  // Never silently replace a server-registered identity when this device has lost its private key.
  if ((!identity?.privateKey || !identity?.publicJwk) && profile?.encryption_public_key) {
    try {
      const recovered = await restoreKonnektIdentityFromPasskey(userId, profile.encryption_public_key);
      if (recovered) identity = await readKey(userId);
    } catch {
      // The passkey may be unavailable, unsupported or declined. Never silently
      // rotate the identity; preserve the manual passphrase recovery path.
    }
  }
  if ((!identity?.privateKey || !identity?.publicJwk) && profile?.encryption_public_key) {
    throw new Error('This account already has an encryption identity, but its private key is not stored on this device. Restore your encrypted key backup before opening encrypted chats. KONNEKT will not replace your old key.');
  }
  if (!identity?.privateKey || !identity?.publicJwk) {
    const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
    const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
    identity = { privateKey: pair.privateKey, publicJwk };
    await saveKey(userId, identity);
  }
  const publicKey = JSON.stringify(identity.publicJwk);
  if (profile?.encryption_public_key && profile.encryption_public_key !== publicKey) {
    throw new Error('The encryption identity on this device differs from your registered key. No key was changed. Restore the matching backup before sending messages.');
  }
  if (profile?.encryption_public_key !== publicKey) {
    const { error } = await supabase.from('profiles').update({ encryption_public_key: publicKey }).eq('id', userId);
    if (error) throw new Error(`Could not publish your encryption public key. Apply the database upgrade first. ${error.message}`);
  }
  return identity;
}

async function deriveConversationKey(userId, otherPublicKey) {
  const identity = await ensureKonnektIdentity(userId);
  const jwk = typeof otherPublicKey === 'string' ? JSON.parse(otherPublicKey) : otherPublicKey;
  const importedOther = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  return crypto.subtle.deriveKey({ name: 'ECDH', public: importedOther }, identity.privateKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptKonnektText({ userId, otherUserId, otherPublicKey, text }) {
  const key = await deriveConversationKey(userId, otherPublicKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(text));
  return { body: toBase64(encrypted), encryption_iv: toBase64(iv), is_encrypted: true };
}

export async function decryptKonnektText({ userId, otherUserId, otherPublicKey, body, encryption_iv }) {
  const key = await deriveConversationKey(userId, otherPublicKey);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(encryption_iv) }, key, fromBase64(body));
  return decoder.decode(plain);
}


// Group encryption uses one random AES-GCM key per conversation version.
// That key is wrapped separately for every member using ECDH-derived AES-GCM.
export async function getKonnektConversationCryptoKey(userId, otherPublicKey) {
  return deriveConversationKey(userId, otherPublicKey);
}

export async function createGroupKeyEnvelopes(conversationId, memberProfiles, keyVersion = 1) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in before setting up group encryption.');
  const identity = await ensureKonnektIdentity(user.id);
  const rawGroupKey = crypto.getRandomValues(new Uint8Array(32));
  const senderPublicKey = JSON.stringify(identity.publicJwk);
  const envelopes = [];
  for (const member of memberProfiles) {
    if (!member?.id || !member?.encryption_public_key) throw new Error('Every group member must open KONNEKT once before secure group messaging can be enabled.');
    const wrappingKey = await deriveConversationKey(user.id, member.encryption_public_key);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const wrapped = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, rawGroupKey);
    envelopes.push({
      conversation_id: conversationId,
      user_id: member.id,
      sender_id: user.id,
      sender_public_key: senderPublicKey,
      key_version: keyVersion,
      wrapped_key: toBase64(wrapped),
      wrap_iv: toBase64(iv)
    });
  }
  const { error } = await supabase.from('group_key_envelopes').insert(envelopes);
  if (error) {
    // Concurrent creator attempts can race on the same group-key envelope.
    // Only accept the conflict if this member can actually decrypt an existing key.
    if (error.code !== '23505') throw error;
    const existingKey = await getGroupKonnektCryptoKey(conversationId, user.id);
    if (!existingKey) throw error;
  }
  return true;
}

export async function getGroupKonnektCryptoKey(conversationId, userId) {
  const { data: envelope, error } = await supabase.from('group_key_envelopes')
    .select('sender_id,sender_public_key,key_version,wrapped_key,wrap_iv')
    .eq('conversation_id', conversationId).eq('user_id', userId)
    .order('key_version', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!envelope) return null;
  const wrappingKey = await deriveConversationKey(userId, envelope.sender_public_key);
  const raw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(envelope.wrap_iv) },
    wrappingKey,
    fromBase64(envelope.wrapped_key)
  );
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt','decrypt']);
}

export async function encryptWithKonnektCryptoKey(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = value instanceof Blob ? await value.arrayBuffer() : encoder.encode(String(value));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
  return { body: toBase64(cipher), encryption_iv: toBase64(iv), is_encrypted: true };
}

export async function decryptWithKonnektCryptoKey(key, body, iv) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, key, fromBase64(body));
  return decoder.decode(plain);
}

export async function encryptKonnektBinary(key, file) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, await file.arrayBuffer());
  return { blob: new Blob([cipher], { type: 'application/octet-stream' }), iv: toBase64(iv) };
}

export async function decryptKonnektBinary(key, encryptedBlob, iv, mimeType = 'application/octet-stream') {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, key, await encryptedBlob.arrayBuffer());
  return new Blob([plain], { type: mimeType });
}


// Passphrase-protected, cross-device recovery. The server stores ciphertext only.
export async function getStoredKonnektIdentity(userId) { return userId ? readKey(userId) : null; }
const RECOVERY_ITERATIONS = 310000;
async function deriveRecoveryKey(passphrase, salt) {
  if (String(passphrase || '').length < 12) throw new Error('Use a recovery passphrase with at least 12 characters.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: RECOVERY_ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt']);
}
export async function createKonnektKeyBackup(passphrase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in before creating a key recovery backup.');
  const identity = await ensureKonnektIdentity(user.id);
  if (!identity.privateKey.extractable) throw new Error('This account key was created by an older version and cannot be exported safely. Keep the original device signed in; create a recovery backup after a new supported identity is provisioned.');
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', identity.privateKey);
  const payload = JSON.stringify({ version: 1, userId: user.id, publicJwk: identity.publicJwk, privateKey: toBase64(pkcs8) });
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveRecoveryKey(passphrase, salt);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(payload));
  const row = { user_id: user.id, ciphertext: toBase64(cipher), salt: toBase64(salt), iv: toBase64(iv), iterations: RECOVERY_ITERATIONS, key_version: 1, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('user_key_backups').upsert(row, { onConflict: 'user_id' });
  if (error) throw error;
  return true;
}
/**
 * Last resort for a signed-in account that has lost its private identity and
 * has no recovery backup. This does not decrypt or delete historical messages.
 *
 * The authenticated database RPC atomically publishes the replacement public
 * key and the passphrase-encrypted backup, or changes neither. The private key
 * is generated and encrypted in this browser and is never sent in plaintext.
 */
export async function replaceLostKonnektIdentity(passphrase) {
  if (String(passphrase || '').length < 12) {
    throw new Error('Choose a new recovery passphrase with at least 12 characters.');
  }
  if (!globalThis.crypto?.subtle) {
    throw new Error('Secure encryption is unavailable. Use a supported browser over HTTPS.');
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error('Sign in before starting a new encryption identity.');

  // Never rotate a key that is still available on this device.
  if (await readKey(user.id)) {
    throw new Error('This device still has an encryption identity. Back it up instead of resetting it.');
  }

  const [
    { data: profile, error: profileError },
    { data: existingBackup, error: backupError }
  ] = await Promise.all([
    supabase.from('profiles')
      .select('encryption_public_key').eq('id', user.id).maybeSingle(),
    supabase.from('user_key_backups')
      .select('user_id').eq('user_id', user.id).maybeSingle()
  ]);
  if (profileError) throw profileError;
  if (backupError) throw backupError;
  if (!profile?.encryption_public_key) {
    throw new Error('No previous registered key was found. Open a chat to create your first encryption identity.');
  }
  if (existingBackup) {
    throw new Error('An encrypted recovery backup exists. Do not replace this identity; restore your backup instead.');
  }

  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']
  );
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const privateKeyBytes = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  const payload = JSON.stringify({
    version: 1, userId: user.id, publicJwk,
    privateKey: toBase64(privateKeyBytes)
  });
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveRecoveryKey(passphrase, salt);
  const ciphertext = toBase64(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(payload))
  );

  // The server enforces owner identity, a missing backup, the expected old key,
  // and all-or-nothing publication of the new key with its encrypted backup.
  // There is no automatic reset when a chat fails to open.
  if (await readKey(user.id)) {
    throw new Error('An encryption key appeared on this device. Reset cancelled; make a backup of it.');
  }
  const { data: replaced, error: replaceError } = await supabase.rpc(
    'konnekt_replace_lost_encryption_identity',
    {
      p_previous_public_key: profile.encryption_public_key,
      p_next_public_key: JSON.stringify(publicJwk),
      p_ciphertext: ciphertext,
      p_salt: toBase64(salt),
      p_iv: toBase64(iv),
      p_iterations: RECOVERY_ITERATIONS,
      p_key_version: 1
    }
  );
  if (replaceError) throw replaceError;
  if (replaced !== true) throw new Error('The encryption identity was not updated.');

  try {
    await saveKey(user.id, { privateKey: pair.privateKey, publicJwk });
  } catch {
    throw new Error(
      'Your new encrypted backup was saved, but this device could not store the private key. ' +
      'Do not reset again. Keep the new passphrase and restore your backup on a supported browser.'
    );
  }
  return true;
}

export async function restoreKonnektKeyBackup(passphrase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in before restoring your encryption key.');
  const { data: row, error } = await supabase.from('user_key_backups').select('ciphertext,salt,iv,iterations,key_version').eq('user_id', user.id).maybeSingle();
  if (error) throw error;
  if (!row) throw new Error('No recovery backup exists for this account.');
  if (row.key_version !== 1 || row.iterations < 100000 || row.iterations > 1000000) throw new Error('This recovery backup version is not supported.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: fromBase64(row.salt), iterations: row.iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  let payload;
  try { payload = JSON.parse(decoder.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(row.iv) }, key, fromBase64(row.ciphertext)))); }
  catch { throw new Error('Recovery passphrase is incorrect or the backup is damaged.'); }
  if (payload.userId !== user.id || !payload.publicJwk || !payload.privateKey) throw new Error('Recovery backup does not match this signed-in account.');
 
const publicKey = JSON.stringify(payload.publicJwk);

// Never silently overwrite a different key on this device.
const existingIdentity = await readKey(user.id);

if (
  existingIdentity?.publicJwk &&
  JSON.stringify(existingIdentity.publicJwk) !== publicKey
) {
  throw new Error(
    'A different encryption identity is already stored on this device. KONNEKT has not overwritten it. Use the original device or contact support before changing encryption keys.'
  );
}

// Confirm the backup matches the account's registered public key.
const { data: profile, error: profileReadError } = await supabase
  .from('profiles')
  .select('encryption_public_key')
  .eq('id', user.id)
  .maybeSingle();

if (profileReadError) throw profileReadError;

if (
  profile?.encryption_public_key &&
  profile.encryption_public_key !== publicKey
) {
  throw new Error(
    'This recovery backup does not match the encryption key registered to your account. No local or server key was changed.'
  );
}

const privateKey = await crypto.subtle.importKey(
  'pkcs8',
  fromBase64(payload.privateKey),
  { name: 'ECDH', namedCurve: 'P-256' },
  true,
  ['deriveKey']
);

await saveKey(user.id, {
  privateKey,
  publicJwk: payload.publicJwk
});

const { error: profileError } = await supabase
  .from('profiles')
  .update({ encryption_public_key: publicKey })
  .eq('id', user.id);

if (profileError) throw profileError;

  return true;
}

/**
 * Optional passwordless key recovery.
 *
 * A WebAuthn PRF-capable passkey, created while the original private key still
 * exists, derives an AES wrapping key after the user's authenticator approval.
 * Supabase stores only encrypted private-key bytes and public credential data.
 * Neither the passkey secret nor plaintext private key leaves this browser.
 * No passkey backup means no automatic recovery; this never rotates an identity.
 */
function requirePasskeyPrf() {
  if (!globalThis.navigator?.credentials?.create ||
      !globalThis.navigator?.credentials?.get ||
      !globalThis.PublicKeyCredential ||
      !globalThis.crypto?.subtle) {
    throw new Error('Passkey recovery is unavailable in this browser or Android WebView.');
  }
}

function passkeyRecoveryKeyFromCredential(credential) {
  const result = credential?.getClientExtensionResults?.();
  const first = result?.prf?.results?.first;
  if (!first || first.byteLength !== 32) {
    throw new Error('This passkey provider does not support encrypted-key recovery (WebAuthn PRF). Use passphrase recovery instead.');
  }
  return first;
}

async function promptKonnektPasskey(credentialId, salt) {
  requirePasskeyPrf();
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: fromBase64(credentialId) }],
      userVerification: 'required',
      timeout: 60000,
      extensions: { prf: { eval: { first: salt } } }
    }
  });
  if (toBase64(credential?.rawId || new Uint8Array()) !== credentialId) {
    throw new Error('The selected passkey does not match the encrypted backup.');
  }
  return passkeyRecoveryKeyFromCredential(credential);
}

export async function enrollKonnektAutomaticKeyRecovery() {
  requirePasskeyPrf();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!user) throw new Error('Sign in before enrolling passkey recovery.');

  const identity = await ensureKonnektIdentity(user.id);
  if (!identity.privateKey.extractable) {
    throw new Error('This older encryption key cannot be exported. Do not delete this device or reset it.');
  }
  const registeredKey = JSON.stringify(identity.publicJwk);
  const { data: profile, error: profileError } = await supabase.from('profiles')
    .select('encryption_public_key').eq('id', user.id).maybeSingle();
  if (profileError) throw profileError;
  if (profile?.encryption_public_key !== registeredKey) {
    throw new Error('Your local encryption identity differs from the account identity. Passkey enrollment cancelled.');
  }

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'KONNEKT' },
      user: {
        id: encoder.encode(user.id),
        name: user.email || user.id,
        displayName: 'KONNEKT encrypted recovery'
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 }
      ],
      authenticatorSelection: {
        residentKey: 'required',
        requireResidentKey: true,
        userVerification: 'required'
      },
      attestation: 'none',
      timeout: 60000,
      extensions: { prf: {} }
    }
  });
  if (!credential?.rawId) throw new Error('Passkey enrollment was cancelled.');
  const credentialId = toBase64(credential.rawId);
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const secret = await promptKonnektPasskey(credentialId, salt);
  const wrappingKey = await crypto.subtle.importKey('raw', secret, { name: 'AES-GCM' }, false, ['encrypt']);
  const payload = JSON.stringify({
    version: 1,
    userId: user.id,
    publicJwk: identity.publicJwk,
    privateKey: toBase64(await crypto.subtle.exportKey('pkcs8', identity.privateKey))
  });
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = toBase64(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, wrappingKey, encoder.encode(payload)
  ));
  const { data: { user: stillSignedIn } } = await supabase.auth.getUser();
  if (stillSignedIn?.id !== user.id) throw new Error('Signed-in account changed during recovery setup.');
  const { error } = await supabase.from('user_key_passkey_backups').upsert({
    user_id: user.id,
    credential_id: credentialId,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext,
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });
  if (error) throw error;
  return true;
}

/**
 * Attempts restoration from a previously enrolled passkey. The browser can
 * present a fingerprint/PIN/face prompt; it cannot silently bypass user
 * verification. If no enrolled backup exists, returns false.
 */
export async function restoreKonnektIdentityFromPasskey(userId, expectedPublicKey) {
  requirePasskeyPrf();
  if (!userId || !expectedPublicKey) return false;
  const existing = await readKey(userId);
  if (existing?.privateKey && existing?.publicJwk) return true;
  const { data: backup, error } = await supabase.from('user_key_passkey_backups')
    .select('credential_id,salt,iv,ciphertext').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  if (!backup) return false;

  const salt = fromBase64(backup.salt);
  const secret = await promptKonnektPasskey(backup.credential_id, salt);
  const wrappingKey = await crypto.subtle.importKey('raw', secret, { name: 'AES-GCM' }, false, ['decrypt']);
  let payload;
  try {
    const bytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(backup.iv) },
      wrappingKey, fromBase64(backup.ciphertext)
    );
    payload = JSON.parse(decoder.decode(bytes));
  } catch {
    throw new Error('Passkey recovery failed. The encrypted backup was not modified.');
  }
  if (payload?.version !== 1 || payload.userId !== userId ||
      JSON.stringify(payload.publicJwk) !== expectedPublicKey ||
      !payload.privateKey) {
    throw new Error('Passkey backup does not match this signed-in encryption identity.');
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || user?.id !== userId) throw new Error('Signed-in account changed during passkey recovery.');
  if (await readKey(userId)) {
    throw new Error('An encryption key appeared on this device. Recovery did not overwrite it.');
  }
  const privateKey = await crypto.subtle.importKey('pkcs8', fromBase64(payload.privateKey),
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
  await saveKey(userId, { privateKey, publicJwk: payload.publicJwk });
  return true;
}

export async function getKonnektIdentityFingerprint(publicJwk) {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(publicJwk)));
  return Array.from(new Uint8Array(bytes)).slice(0, 16).map(x => x.toString(16).padStart(2,'0')).join('').toUpperCase().match(/.{1,4}/g).join(' ');
}
