import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
for (const directory of ['bin', 'src', 'scripts', 'public', 'test']) {
  for (const name of await readdir(directory)) {
    if (!/\.(mjs|js)$/.test(name)) continue;
    const file = path.join(directory, name); const bytes = await readFile(file);
    if (bytes[0] === 239 && bytes[1] === 187 && bytes[2] === 191) throw new Error(`${file}: unexpected BOM`);
    if (bytes.includes(Buffer.from('\r\n')) && bytes.toString().replaceAll('\r\n', '').includes('\n')) throw new Error(`${file}: mixed newlines`);
    const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log('JavaScript syntax, BOM, and newline checks passed.');
