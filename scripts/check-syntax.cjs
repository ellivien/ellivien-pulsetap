const { readdirSync, statSync } = require('node:fs');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

function collectJavaScript(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectJavaScript(path);
    if (entry.isFile() && /\.(?:[cm]?js)$/.test(entry.name)) return [path];
    return [];
  });
}

const roots = ['netlify', 'scripts', 'tests'];
const files = roots.flatMap(root => statSync(root).isDirectory() ? collectJavaScript(root) : []);
let failed = false;

for (const file of files) {
  if (file === __filename) continue;
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) failed = true;
}

if (failed) process.exit(1);
console.log(`Syntax check passed for ${files.length - 1} JavaScript files.`);

