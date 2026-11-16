import { readFile, readdir } from 'node:fs/promises';
import {STAGING_ORIGIN} from './validate-staging-integrations.mjs';

const productionRef = 'itkoagpigiifodfhoujt';
const stagingUrl = process.env.VITE_SUPABASE_URL || process.env.KONNEKT_STAGING_SUPABASE_URL;
if (stagingUrl?.replace(/\/$/,'')!==STAGING_ORIGIN) throw new Error('Supply the existing konnekt-staging URL to verify the bundle.');
const assets = await readdir(new URL('../dist/assets/', import.meta.url));
const sources = await Promise.all(assets.filter(name => name.endsWith('.js')).map(name => readFile(new URL('../dist/assets/' + name, import.meta.url), 'utf8')));
const bundle = sources.join('\n');
if (!bundle.includes(stagingUrl.replace(/\/$/, ''))) throw new Error('Staging URL missing from built JavaScript.');
if (bundle.includes(productionRef)) throw new Error('Production backend reference found in staging JavaScript.');
console.log('PASS staging bundle targets its separate backend and excludes the production project reference');
