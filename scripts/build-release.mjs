import { execFileSync } from 'node:child_process';
import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
let revision = process.env.VITE_SOURCE_REVISION ?? 'uncommitted';
try {
  if (!process.env.VITE_SOURCE_REVISION)
    revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
execFileSync(npm, ['run', 'build', '--workspaces', '--if-present'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, VITE_SOURCE_REVISION: revision },
});
rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });
cpSync('apps/web/dist', 'dist', { recursive: true });
cpSync('LICENSE', 'dist/LICENSE.txt');
cpSync('THIRD_PARTY_NOTICES.md', 'dist/THIRD_PARTY_NOTICES.txt');
mkdirSync('dist/licenses', { recursive: true });
for (const name of ['react', 'react-dom', 'chess.js']) {
  const folder = join('node_modules', name);
  const license = readdirSync(folder).find((file) => /^licen[sc]e/i.test(file));
  if (!license) throw new Error('Missing licence for ' + name);
  cpSync(join(folder, license), join('dist/licenses', name + '.txt'));
}
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
writeFileSync(
  'dist/release.json',
  JSON.stringify({ version: '0.1.0-alpha', sourceRevision: revision, assets }, null, 2),
);
