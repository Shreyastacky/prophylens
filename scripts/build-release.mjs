import { execFileSync } from 'node:child_process';
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
let revision = process.env.VITE_SOURCE_REVISION ?? 'uncommitted';
try {
  if (!process.env.VITE_SOURCE_REVISION)
    revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
execFileSync(npm, ['run', 'build', '--workspaces', '--if-present'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, VITE_SOURCE_REVISION: revision, VITE_APP_VERSION: version },
});
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('apps/web/dist', 'dist', { recursive: true });
cpSync('LICENSE', 'dist/LICENSE.txt');
cpSync('THIRD_PARTY_NOTICES.md', 'dist/THIRD_PARTY_NOTICES.txt');
mkdirSync('dist/licenses', { recursive: true });
for (const name of ['react', 'react-dom', 'scheduler', 'chess.js']) {
  const folder = join('node_modules', name);
  const license = readdirSync(folder).find((file) => /^licen[sc]e/i.test(file));
  if (!license) throw new Error('Missing licence for ' + name);
  cpSync(join(folder, license), join('dist/licenses', name + '.txt'));
}
cpSync('node_modules/@phosphor-icons/react/LICENSE', 'dist/licenses/phosphor-icons-react.txt');
const assets = {};
function collect(folder) {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) collect(path);
    else
      assets[
        path
          .split(/[\\\\/]/)
          .join('/')
          .slice(5)
      ] = createHash('sha256').update(readFileSync(path)).digest('hex');
  }
}
collect('dist');
const pins = JSON.parse(readFileSync('public/engine/manifest.json', 'utf8'));
for (const [file, expected] of [
  ['engine/stockfish-18-lite-single.js', pins.scriptSha256],
  ['engine/stockfish-18-lite-single.wasm', pins.wasmSha256],
]) {
  if (assets[file] !== expected) throw new Error('Engine checksum mismatch in build: ' + file);
}
writeFileSync(
  'dist/release.json',
  JSON.stringify({ version, sourceRevision: revision, assets }, null, 2),
);
const bundled = {};
const mime = {
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};
for (const name of [...Object.keys(assets), 'release.json']) {
  const bytes = readFileSync(join('dist', name));
  bundled[name] = {
    body: bytes.toString('base64'),
    hash: createHash('sha256').update(bytes).digest('hex'),
    type: mime[name.slice(name.lastIndexOf('.'))] ?? 'application/octet-stream',
  };
}
mkdirSync('dist/server', { recursive: true });
writeFileSync('dist/server/assets.js', 'export const assets = ' + JSON.stringify(bundled) + ';\n');
cpSync('scripts/site-worker.mjs', 'dist/server/index.js');
cpSync('scripts/security-policy.mjs', 'dist/server/security-policy.js');
writeFileSync('dist/server/package.json', '{"type":"module"}\n');
