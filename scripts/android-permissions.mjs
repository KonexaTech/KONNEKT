import { readFile, writeFile } from 'node:fs/promises';
const path = 'android/app/src/main/AndroidManifest.xml';
let manifest = await readFile(path, 'utf8');
if (!manifest.includes('</manifest>')) throw new Error('Android manifest is incomplete.');
for (const name of ['CAMERA', 'RECORD_AUDIO', 'MODIFY_AUDIO_SETTINGS']) {
  const permission = `android.permission.${name}`;
  if (!manifest.includes(`android:name="${permission}"`)) manifest = manifest.replace('</manifest>', `    <uses-permission android:name="${permission}" />\n</manifest>`);
}
// Calls are optional; permit installation on devices without either input device.
for (const name of ['android.hardware.camera', 'android.hardware.microphone']) {
  if (!manifest.includes(`android:name="${name}"`)) manifest = manifest.replace('</manifest>', `    <uses-feature android:name="${name}" android:required="false" />\n</manifest>`);
}
await writeFile(path, manifest);
console.log('Configured optional microphone/camera access; runtime consent is still required.');
