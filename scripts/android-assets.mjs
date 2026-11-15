import { copyFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const root = 'android/app/src/main/res';
const icons = {
  mdpi: ['ic_launcher (8).png', 'ic_launcher_foreground (7).png'],
  hdpi: ['ic_launcher (2).png', 'ic_launcher_foreground (1).png'],
  xhdpi: ['ic_launcher (6).png', 'ic_launcher_foreground (5).png'],
  xxhdpi: ['ic_launcher (4).png', 'ic_launcher_foreground (3).png'],
  xxxhdpi: ['ic_launcher.png', 'ic_launcher_foreground.png']
};
for (const [density, [icon, foreground]] of Object.entries(icons)) {
  const directory = join(root, `mipmap-${density}`);
  await mkdir(directory, { recursive: true });
  for (const name of ['ic_launcher.png', 'ic_launcher_round.png']) await copyFile(icon, join(directory, name));
  await copyFile(foreground, join(directory, 'ic_launcher_foreground.png'));
}
for (const directory of ['mipmap-anydpi-v26', 'values', 'drawable', 'drawable-nodpi']) await mkdir(join(root, directory), { recursive: true });
for (const name of ['ic_launcher.xml', 'ic_launcher_round.xml']) await copyFile(name, join(root, 'mipmap-anydpi-v26', name));
// Replace the generated launcher color instead of defining it in two files.
await rm(join(root, 'values', 'ic_launcher_background.xml'), { force: true });
await copyFile('colors.xml', join(root, 'values', 'konnekt_colors.xml'));
for (const directory of ['drawable', 'drawable-nodpi']) await copyFile('splash.png', join(root, directory, 'splash.png'));
console.log('Installed existing KONNEKT launcher and splash assets.');
