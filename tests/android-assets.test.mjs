import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

test('branding assets replace generated launcher color and install idempotently', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'konnekt-branding-'));
  try {
    const script = resolve('scripts/android-assets.mjs');
    // Use the source asset names referenced by the installer.
    for (const name of await readdir('.')) {
      if (/^ic_launcher.*\.(png|xml)$/.test(name) || ['colors.xml', 'splash.png'].includes(name)) await copyFile(name, join(fixture, name));
    }
    const values = join(fixture, 'android/app/src/main/res/values');
    await mkdir(values, { recursive: true });
    await writeFile(join(values, 'ic_launcher_background.xml'), '<resources><color name="ic_launcher_background">#FFFFFF</color></resources>');
    await writeFile(join(values, 'strings.xml'), '<resources><string name="app_name">KONNEKT Staging</string></resources>');
    for (let n = 0; n < 2; n++) execFileSync(process.execPath, [script], { cwd: fixture });
    const files = await readdir(values);
    const contents = await Promise.all(files.map(name => readFile(join(values, name), 'utf8')));
    assert.equal(contents.join('\n').match(/name="ic_launcher_background"/g)?.length, 1);
    assert.match(await readFile(join(values, 'strings.xml'), 'utf8'), /KONNEKT Staging/);
  } finally { await rm(fixture, { recursive: true, force: true }); }
});


test('native call permissions are declared once and hardware stays optional', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'konnekt-permissions-'));
  try {
    const directory = join(fixture, 'android/app/src/main');
    await mkdir(directory, { recursive: true });
    const manifest = join(directory, 'AndroidManifest.xml');
    await writeFile(manifest, '<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application /></manifest>');
    for (let n = 0; n < 2; n++) execFileSync(process.execPath, [resolve('scripts/android-permissions.mjs')], { cwd: fixture });
    const xml = await readFile(manifest, 'utf8');
    for (const permission of ['CAMERA','RECORD_AUDIO','MODIFY_AUDIO_SETTINGS']) assert.equal(xml.split('android.permission.' + permission).length - 1, 1);
    for (const device of ['camera','microphone']) assert(xml.includes('android:name="android.hardware.' + device + '" android:required="false"'));
  } finally { await rm(fixture, { recursive: true, force: true }); }
});
