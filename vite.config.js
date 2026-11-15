
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const pwaFiles = [
  'manifest.webmanifest',
  'sw.js',
  'konnekt.svg',
  'konnekt-192.png',
  'konnekt-512.png'
];

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'validate-konnekt-staging',
      config(_config, { mode }) {
        if (mode !== 'staging') return;

        const env = loadEnv(mode, process.cwd());
        if (
          !/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(env.VITE_SUPABASE_URL ?? '') ||
          env.VITE_SUPABASE_URL.includes('itkoagpigiifodfhoujt') ||
          !env.VITE_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')
        ) {
          throw new Error('Staging requires a separate hosted Supabase project URL and publishable key.');
        }
      }
    },

    {
      name: 'copy-konnekt-pwa-assets',

      generateBundle() {
        for (const file of pwaFiles) {
          this.emitFile({
            type: 'asset',
            fileName: file,
            source: readFileSync(
              path.resolve(process.cwd(), file)
            )
          });
        }
      }
    }
  ],

  base: '/KONNEKT/',

  resolve: {
    alias: {
      'react-native': 'react-native-web'
    }
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
