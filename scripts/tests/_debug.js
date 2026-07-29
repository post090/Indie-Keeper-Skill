// Quick debug script for Scene 10 truth check
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'keeper-test-'));
fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Rules\n');
fs.writeFileSync(path.join(root, 'docs/untracked.md'), '# Untracked\n');
fs.writeFileSync(path.join(root, 'docs/truth-source.json'), JSON.stringify({
  version: 1, scanDir: 'docs', topics: { rules: { file: 'AGENTS.md', desc: 'rules' } }
}, null, 2));
const r = spawnSync(process.execPath, [path.join('scripts', 'keeper.js'), 'truth', 'check', `--root=${root}`], { encoding: 'utf8' });
console.log('exit:', r.status);
console.log('stdout:', JSON.stringify(r.stdout));
console.log('stderr:', JSON.stringify(r.stderr));
fs.rmSync(root, { recursive: true, force: true });
