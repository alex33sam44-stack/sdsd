import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const forbidden = [
  ['supa', 'base'].join(''),
  ['@supa', 'base/supa', 'base-js'].join(''),
  'VITE_' + ['SUPA', 'BASE'].join('') + '_',
  ['SUPA', 'BASE'].join('') + '_URL',
  ['SUPA', 'BASE'].join('') + '_SERVICE_ROLE_KEY',
];

const ignored = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
]);

const hits = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (ignored.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else {
      const text = readFileSync(p, 'utf8');
      for (const token of forbidden) {
        if (text.toLowerCase().includes(token.toLowerCase())) {
          hits.push(p.replace(root + '/', ''));
          break;
        }
      }
    }
  }
}

walk(root);

if (hits.length) {
  console.error('[verify-no-legacy-provider] Forbidden legacy provider references found:');
  for (const h of hits) console.error('-', h);
  process.exit(1);
}

console.log('[verify-no-legacy-provider] OK');
