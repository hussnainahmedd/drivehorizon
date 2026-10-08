import assert from 'node:assert/strict';
import { access, stat } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { listPackage } from '@electron/asar';

const root = path.resolve(process.env.PACKAGE_DIR || 'release/linux-unpacked');
const executable = path.join(root, 'drivehorizon');
const archive = path.join(root, 'resources/app.asar');

for (const file of [executable, archive]) {
  await access(file);
  assert.ok((await stat(file)).size > 0, file);
}

const files = new Set((await listPackage(archive)).map(file => file.replace(/^\//, '')));
for (const required of ['dist/index.html', 'dist/favicon.svg', 'electron/main.cjs', 'electron/check-assets.cjs', 'electron/preload.cjs', 'electron/assets.cjs', 'LICENSE', 'README.md', 'package.json']) {
  assert.ok(files.has(required), `missing packaged file: ${required}`);
}

const result = await new Promise((resolve, reject) => {
  const child = spawn(executable, ['--check-assets'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error(`packaged runtime check timed out\n${stdout}\n${stderr}`)); }, 30000);
  child.on('error', error => { clearTimeout(timer); reject(error); });
  child.on('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }); });
});

assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
assert.match(result.stdout, /PASS: DriveHorizon native runtime and packaged local assets/);
console.log(`PASS: Linux package contains ${files.size} asar entries and starts its native asset check.`);
