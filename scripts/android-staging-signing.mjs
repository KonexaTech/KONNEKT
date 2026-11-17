import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, readFileSync, writeFileSync, mkdtempSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function configureStagingSigning({ projectRoot, tempRoot, env }) {
  for (const name of ['KONNEKT_STAGING_KEYSTORE_BASE64','KONNEKT_STAGING_KEYSTORE_PASSWORD','KONNEKT_STAGING_KEY_ALIAS','KONNEKT_STAGING_KEY_PASSWORD']) {
    if (!env[name]) throw new Error(`Stable staging signing requires the Actions secret ${name}.`);
  }
  const encoded = env.KONNEKT_STAGING_KEYSTORE_BASE64.replace(/\s/g, '');
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.toString('base64') !== encoded) throw new Error('Invalid staging keystore encoding.');
  const dir = mkdtempSync(join(tempRoot, 'konnekt-staging-signing-'));
  chmodSync(dir, 0o700);
  const keystore = join(dir, 'staging.keystore');
  writeFileSync(keystore, bytes, { mode: 0o600 });
  let certificate;
  try {
    certificate = execFileSync('keytool', ['-exportcert', '-keystore', keystore, '-storepass:env', 'KONNEKT_STAGING_KEYSTORE_PASSWORD', '-alias', env.KONNEKT_STAGING_KEY_ALIAS], { env: { ...process.env, ...env }, stdio: ['ignore','pipe','pipe'] });
  } catch { throw new Error('Cannot open the staging signing certificate; check the keystore, password and alias.'); }
  const sha256 = createHash('sha256').update(certificate).digest('hex');
  // A pinned fingerprint protects existing testers from an accidental signing-key
  // rotation that would make subsequent APK updates uninstallable.
  const pinned = (env.KONNEKT_STAGING_CERT_SHA256 || '').replace(/[^a-fA-F0-9]/g, '').toLowerCase();
  if (env.KONNEKT_STAGING_CERT_SHA256 && (pinned.length !== 64 || pinned !== sha256)) {
    throw new Error('Staging signing certificate differs from the pinned fingerprint; stop before distributing an incompatible update.');
  }
  const file = join(projectRoot, 'android/app/build.gradle');
  const start = '// BEGIN KONNEKT STAGING SIGNING', end = '// END KONNEKT STAGING SIGNING';
  const original = readFileSync(file, 'utf8');
  const clean = original.replace(new RegExp(`${start}[\\s\\S]*?${end}\\n?`, 'g'), '');
  const block = `${start}\nandroid {\n  signingConfigs {\n    konnektStaging {\n      storeFile file(System.getenv('KONNEKT_SIGNING_KEYSTORE_PATH'))\n      storePassword System.getenv('KONNEKT_STAGING_KEYSTORE_PASSWORD')\n      keyAlias System.getenv('KONNEKT_STAGING_KEY_ALIAS')\n      keyPassword System.getenv('KONNEKT_STAGING_KEY_PASSWORD')\n    }\n  }\n  buildTypes {\n    debug { signingConfig signingConfigs.konnektStaging }\n  }\n}\n${end}\n`;
  writeFileSync(file, clean.trimEnd() + '\n' + block);
  return { keystore, sha256 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = configureStagingSigning({ projectRoot: process.cwd(), tempRoot: process.env.RUNNER_TEMP, env: process.env });
    appendFileSync(process.env.GITHUB_ENV, `KONNEKT_SIGNING_KEYSTORE_PATH=${result.keystore}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `certificate_sha256=${result.sha256}\n`);
    console.log(`Stable staging certificate SHA-256: ${result.sha256}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
