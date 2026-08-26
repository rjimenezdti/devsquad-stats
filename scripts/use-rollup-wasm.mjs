/**
 * Redirects Rollup's platform-native binding to the pure-WASM build
 * (@rollup/wasm-node). Needed on machines where Windows Application Control /
 * WDAC blocks loading unsigned native .node modules from node_modules, which
 * otherwise breaks both `vite` (dev) and `vite build`.
 *
 * Idempotent: safe to run repeatedly. Wired as a `postinstall` hook; run
 * manually with `npm run setup:rollup-wasm` if install scripts are disabled.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scopeDir = join(root, 'node_modules', '@rollup');

if (!existsSync(join(scopeDir, 'wasm-node'))) {
  console.warn('[rollup-wasm] @rollup/wasm-node is not installed; skipping patch.');
  process.exit(0);
}

let patched = 0;
for (const name of readdirSync(scopeDir)) {
  // Only the platform binding packages (e.g. rollup-win32-x64-msvc), not wasm-node.
  if (!name.startsWith('rollup-') || name === 'wasm-node') continue;

  const pkgDir = join(scopeDir, name);
  const pkgJsonPath = join(pkgDir, 'package.json');
  if (!existsSync(pkgJsonPath)) continue;

  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
  const shim = "module.exports = require('@rollup/wasm-node/dist/native.js');\n";
  writeFileSync(join(pkgDir, 'index.js'), shim);

  if (pkg.main !== './index.js') {
    pkg.main = './index.js';
    writeFileSync(pkgJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
  patched += 1;
  console.log(`[rollup-wasm] Patched @rollup/${name} -> @rollup/wasm-node`);
}

if (patched === 0) {
  console.log('[rollup-wasm] No native rollup packages found to patch.');
}
