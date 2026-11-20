// lang.js · bilingual output helper shared by the keeper family (zero deps)
// ─────────────────────────────────────────────────────────────
// Where the language comes from (highest priority first):
//   1. CLI flag        --lang en / --lang=zh
//   2. Project config  "language" field in keeper-profile.json
//                      (searched upward from the current directory)
//   3. Default         en
'use strict';

const fs = require('fs');
const path = require('path');

function norm(s) { return /^zh/i.test(String(s).trim()) ? 'zh' : 'en'; }

function detectLang(argv, projectDir) {
  const a = argv || process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--lang' && a[i + 1]) return norm(a[i + 1]);
    const m = /^--lang=(.+)$/.exec(a[i]);
    if (m) return norm(m[1]);
  }
  const explicitRoot = projectDir || a.find(arg => arg.startsWith('--root='))?.slice(7)
    || (a.includes('--root') && a[a.indexOf('--root') + 1]);
  let dir = explicitRoot ? path.resolve(explicitRoot) : process.cwd();
  for (let up = 0; up < 8; up++) {
    const p = path.join(dir, 'keeper-profile.json');
    if (fs.existsSync(p)) {
      try {
        const lang = JSON.parse(fs.readFileSync(p, 'utf8')).language;
        if (lang) return norm(lang);
      } catch { /* broken profile → fall through to default */ }
      break;
    }
    const parent = path.dirname(dir);
    if (explicitRoot || parent === dir) break;
    dir = parent;
  }
  return 'en';
}

// t() factory: give it a dictionary { key: { en, zh } } and a language,
// get back t(key, ...args). Placeholders {0} {1} … are filled from args.
// Missing zh falls back to en; missing key falls back to the key itself.
function makeT(dict, lang) {
  return function t(key, ...args) {
    const item = dict[key] || {};
    const s = item[lang] || item.en || key;
    return s.replace(/\{(\d+)\}/g, (_, i) => (args[i] !== undefined ? String(args[i]) : ''));
  };
}

module.exports = { detectLang, makeT, norm };
