#!/usr/bin/env node
// e2e.js · end-to-end exercise of the indie-keeper mechanism layer (zero deps)
// ─────────────────────────────────────────────────────────────
// Spins up a throwaway project dir, runs the keeper CLI against it through a
// realistic user flow, and asserts on exit codes + stdout. Catches the kind
// of regressions the audit found — e.g. `keeper docs extract --lang zh` was
// silently rewritten to `--ui-lang zh` and filtered nothing.
//
// Run:  node scripts/tests/e2e.js
// Exits 0 on full pass, 1 on any failure. Prints one line per scenario.
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const KEEPER = path.join(REPO_ROOT, 'scripts', 'keeper.js');
const NODE = process.execPath;

let pass = 0, fail = 0;
const failures = [];

function run(args, opts = {}) {
  const r = spawnSync(NODE, [KEEPER, ...args], {
    cwd: opts.cwd || REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...(opts.env || {}) },
  });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), raw: r };
}

function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail) console.log(`      ${detail}`); failures.push(name); }
}

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'keeper-e2e-'));
}

function write(root, rel, content) {
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

// ────────────────────────────────────────────────────────────

console.log('\nindie-keeper e2e exercise\n');

// Scene 1: truth check green + where + section update
(function scene1() {
  console.log('Scene 1 · Archive (truth check / where / section update)');
  const root = mkTmpDir();
  try {
    write(root, 'AGENTS.md', '# Rules\n\nUse strict mode.\n');
    write(root, 'docs/lore.md', '# Lore\n\n## World\n\nOld world text.\n\n## Characters\n\nLila is the protagonist.\n');
    write(root, 'docs/truth-source.json', JSON.stringify({
      version: 1,
      scanDir: 'docs',
      topics: {
        rules: { file: 'AGENTS.md', desc: 'AI rules' },
        lore: { file: 'docs/lore.md', desc: 'world + characters', aliases: ['world'] },
      },
    }, null, 2));

    // truth check → green
    let r = run(['truth', 'check', `--root=${root}`]);
    ok('truth check green (exit 0)', r.code === 0, r.out.trim());

    // truth where <topic>
    r = run(['where', 'lore', `--root=${root}`]);
    ok('where finds topic', r.code === 0 && /docs\/lore\.md/.test(r.out), r.out.trim());

    // truth update --section (safe edit)
    r = run(['truth', 'update', 'docs/lore.md', '--section', 'World', '--content', 'New world text after edit.', `--root=${root}`]);
    ok('section update exits 0', r.code === 0, r.out.trim());
    const after = fs.readFileSync(path.join(root, 'docs/lore.md'), 'utf8');
    ok('section update only touched target section', after.includes('New world text after edit.') && after.includes('Lila is the protagonist.'));
    ok('section update preserved other section', after.includes('## Characters'));

    // truth sections lists headings
    r = run(['truth', 'sections', 'docs/lore.md', `--root=${root}`]);
    ok('sections lists headings', r.code === 0 && /World/.test(r.out) && /Characters/.test(r.out));
    const doc = '# Manual\n## First\n### Notes\noriginal one\n## Second\n### Notes\noriginal two\n';
    write(root, 'manual.md', doc);
    const update = ['truth', 'update', 'manual.md', '--section', 'Notes', '--root', root];
    r = run([...update, '--content', 'replacement']);
    ok('ambiguous headings fail without changing the file', r.code === 1 && fs.readFileSync(path.join(root, 'manual.md'), 'utf8') === doc, r.out);
    write(root, 'body.txt', 'literal \\n in an example');
    r = run([...update, '--parent', 'Second', '--file', 'body.txt']);
    const edited = fs.readFileSync(path.join(root, 'manual.md'), 'utf8');
    ok('scoped edit preserves its sibling and literal escapes', r.code === 0 && edited === doc.replace('original two', '\nliteral \\n in an example'), r.out);

  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})();

// Scene 2: truth check reports untracked + dead link
(function scene2() {
  console.log('Scene 2 · Archive checkup detects problems');
  const root = mkTmpDir();
  try {
    write(root, 'AGENTS.md', '# Rules\n');
    write(root, 'docs/registered.md', '# Registered\n');
    write(root, 'docs/untracked.md', '# Should be flagged\n');
    write(root, 'docs/truth-source.json', JSON.stringify({
      version: 1,
      scanDir: 'docs',
      topics: {
        rules: { file: 'AGENTS.md', desc: 'rules' },
        good: { file: 'docs/registered.md', desc: 'registered' },
        dead: { file: 'docs/missing.md', desc: 'dead link target' },
      },
    }, null, 2));

    const r = run(['truth', 'check', `--root=${root}`]);
    ok('check exits 1 on problems', r.code === 1, `exit=${r.code}`);
    ok('check reports untracked doc', /untracked/.test(r.out) && /untracked\.md/.test(r.out), r.out);
    ok('check reports dead link', /dead link/.test(r.out) && /missing\.md/.test(r.out), r.out);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})();

// Scene 3: docs-i18n extract → stamp → stale flow
(function scene3() {
  console.log('Scene 3 · Docs Translation Desk (extract / stamp / stale)');
  const root = mkTmpDir();
  try {
    write(root, 'README.md', '# Project\n\nHello world.\n');
    write(root, 'docs/docs-manifest.json', JSON.stringify({
      version: 1,
      sourceLang: 'en',
      primaryLang: 'en',
      i18nDir: '',
      langs: ['en', 'zh'],
      docs: [
        { id: 'readme', primary: 'README.md', source: 'README.md', desc: 'front page', translations: { zh: 'README.zh.md' } },
      ],
    }, null, 2));

    // extract template for zh
    let r = run(['docs', 'extract', '--doc', 'readme', '--lang', 'zh', `--root=${root}`]);
    ok('extract creates zh template', r.code === 0, r.out.trim());
    const zhPath = path.join(root, 'README.zh.md');
    ok('zh template file exists', fs.existsSync(zhPath));
    ok('template has TODO marker', fs.existsSync(zhPath) && /\[TODO/.test(fs.readFileSync(zhPath, 'utf8')));

    // fill translation + stamp
    fs.writeFileSync(zhPath, '# 项目\n\n你好世界。\n');
    r = run(['docs', 'stamp', 'readme', 'zh', `--root=${root}`]);
    ok('stamp succeeds', r.code === 0, r.out.trim());

    // status → fresh (use the totals line — "0 needing work" / "0 待更新")
    r = run(['docs', 'status', `--root=${root}`]);
    ok('status shows fresh after stamp', /0\s+needing work|0\s+待更新/.test(r.out), r.out);

    // modify source → status should report stale (totals becomes non-zero)
    fs.writeFileSync(path.join(root, 'README.md'), '# Project\n\nHello world, updated.\n');
    r = run(['docs', 'status', `--root=${root}`]);
    ok('status reports stale after source change', /[1-9]\d*\s+needing work|[1-9]\d*\s+待更新/.test(r.out), r.out);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})();

// Scene 4: keeper --lang forwarding (regression guard for the BUG we just fixed)
(function scene4() {
  console.log('Scene 4 · keeper --lang forwarding (docs extract --lang zh regression guard)');
  const root = mkTmpDir();
  try {
    write(root, 'README.md', '# Project\n\nHello.\n');
    write(root, 'docs/docs-manifest.json', JSON.stringify({
      version: 1,
      sourceLang: 'en',
      primaryLang: 'en',
      i18nDir: '',
      langs: ['en', 'zh'],
      docs: [
        { id: 'readme', primary: 'README.md', source: 'README.md', desc: 'front page', translations: { zh: 'README.zh.md' } },
      ],
    }, null, 2));

    // BUG scenario: --lang zh must reach docs-i18n as TARGET language, not be
    // rewritten to --ui-lang (which would make onlyLang empty and extract for
    // ALL languages instead of just zh).
    const r = run(['docs', 'extract', '--doc', 'readme', '--lang', 'zh', `--root=${root}`]);
    ok('extract --lang zh exits 0', r.code === 0, r.out.trim());
    ok('zh template created', fs.existsSync(path.join(root, 'README.zh.md')));
    // en is the source lang → no en template should be created
    ok('source-lang template NOT created (only zh targeted)', !fs.existsSync(path.join(root, 'README.en.md')));

    // --lang en (source) → should skip, create 0
    const r2 = run(['docs', 'extract', '--doc', 'readme', '--lang', 'en', '--dry', `--root=${root}`]);
    ok('extract --lang en (source) skips with create 0', /create.*0|创建.*0|0.*template/.test(r2.out) || /skip/i.test(r2.out), r2.out);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})();

// Scene 5: keeper --lang zh hello → Chinese menu
(function scene5() {
  console.log('Scene 5 · UI language switch (--lang zh hello)');
  const root = mkTmpDir();
  try {
    write(root, 'AGENTS.md', '# Rules\n');
    write(root, 'docs/truth-source.json', JSON.stringify({
      version: 1, scanDir: 'docs', topics: { rules: { file: 'AGENTS.md', desc: 'rules' } },
    }, null, 2));

    const r = run(['--lang', 'zh', 'hello'], { cwd: root });
    ok('--lang zh hello exits 0', r.code === 0, r.out.slice(0, 200));
    ok('Chinese text in output', /未提交改动|进行中的\s*sprint|接班|常用命令/.test(r.out), r.out.slice(0, 300));

    const r2 = run(['hello'], { cwd: root });
    ok('default hello is English', /handover|shift|archive|feedback/i.test(r2.out), r2.out.slice(0, 300));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})();

// Scene 6: cross-platform path separator in truth-source.json (Windows backslash)
(function scene6() {
  console.log('Scene 6 · Cross-platform path (backslash in truth-source.json)');
  const root = mkTmpDir();
  try {
    write(root, 'AGENTS.md', '# Rules\n');
    write(root, 'docs/lore.md', '# Lore\n');
    // User on Windows might write backslash in JSON
    write(root, 'docs/truth-source.json', JSON.stringify({
      version: 1,
      scanDir: 'docs',
      topics: {
        rules: { file: 'AGENTS.md', desc: 'rules' },
        lore: { file: 'docs\\lore.md', desc: 'lore with backslash' },
      },
    }, null, 2));

    const r = run(['truth', 'check', `--root=${root}`]);
    const deadLinkReported = /dead link/.test(r.out) && /lore\.md/.test(r.out);
    ok('backslash path not reported as dead link', !deadLinkReported, r.out);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})();

// Scene 7: wiki-link with CJK + spaces + date (docs-site pack robustness)
(function scene7() {
  console.log('Scene 7 · WIKI pack with CJK + spaces + date in wiki-links');
  const root = mkTmpDir();
  try {
    write(root, 'docs/会议纪要.md', '# 2026-07-29 会议纪要\n\nLink: [[主角 设定]]\n');
    write(root, 'docs/主角 设定.md', '# 主角设定\n\nLila is the protagonist.\n');

    // pack should not crash on CJK + spaces
    const r = run(['site', 'pack', '--out', path.join(root, 'site.html'), `--root=${root}`, '--dir', 'docs']);
    ok('pack exits 0 with CJK + spaces', r.code === 0, r.out.trim());
    ok('pack output file exists', fs.existsSync(path.join(root, 'site.html')));
    const html = fs.readFileSync(path.join(root, 'site.html'), 'utf8');
    ok('pack html contains CJK content', /会议纪要|主角/.test(html));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})();

// Scene 8: keeper refs <keyword> — related-document scan with classification
(function scene8() {
  console.log('Scene 8 · keeper refs (related-document scan)');
  const root = mkTmpDir();
  try {
    // current fact docs
    write(root, 'SKILL.md', '# Skill\n\nSeven rooms are independent.\n');
    write(root, 'AGENTS.md', '# Rules\n\nSeven rooms mentioned here too.\n');
    // historical narrative docs
    write(root, 'docs/PROGRESS.md', '# Progress\n\nv1.0 shipped with seven rooms.\n');
    write(root, 'docs/ROADMAP.md', '# Roadmap\n\nv1.0: seven rooms.\n');

    const r = run(['refs', 'seven rooms', `--root=${root}`]);
    ok('refs exits 0', r.code === 0, r.out.trim());
    ok('refs finds current-fact mentions', /SKILL\.md/.test(r.out) && /AGENTS\.md/.test(r.out), r.out);
    ok('refs finds historical mentions', /PROGRESS\.md/.test(r.out) && /ROADMAP\.md/.test(r.out), r.out);
    ok('refs classifies current vs historical', /historical narrative[^\n]*\n(?:(?!other mentions)[\s\S])*PROGRESS\.md/i.test(r.out), r.out);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})();

// Scene 9: keeper sync — end-of-session sweep (refresh + checks)
(function scene9() {
  console.log('Scene 9 · keeper sync (end-of-session sweep)');
  const root = mkTmpDir();
  try {
    write(root, 'AGENTS.md', '# Rules\n');
    write(root, 'docs/truth-source.json', JSON.stringify({
      version: 1, scanDir: 'docs', topics: { rules: { file: 'AGENTS.md', desc: 'rules' } },
    }, null, 2));
    write(root, 'docs/docs-manifest.json', JSON.stringify({
      version: 1, sourceLang: 'en', primaryLang: 'en', i18nDir: '', langs: ['en'],
      docs: [{ id: 'rules', primary: 'AGENTS.md', source: 'AGENTS.md', desc: 'rules' }],
    }, null, 2));
    // START-HERE with a refresh region
    write(root, 'START-HERE.md', `# Start\n\n## Progress\n\n<!-- keeper:refresh:start progress -->\nold\n<!-- keeper:refresh:end -->\n`);

    const r = run(['sync', `--root=${root}`]);
    ok('sync exits 0 on green project', r.code === 0, r.out);
    ok('sync reports truth check ok', /truth.*ok/i.test(r.out), r.out);
    ok('sync reports docs check ok', /docs.*ok/i.test(r.out), r.out);
    ok('sync refreshed START-HERE', /START-HERE.*refreshed/i.test(r.out), r.out);
    ok('sync says safe to end', /safe to end/i.test(r.out), r.out);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})();

// Scene 10: keeper sync detects problems (non-zero exit)
(function scene10() {
  console.log('Scene 10 · keeper sync detects problems');
  const root = mkTmpDir();
  try {
    write(root, 'AGENTS.md', '# Rules\n');
    write(root, 'docs/untracked.md', '# Untracked\n');
    write(root, 'docs/truth-source.json', JSON.stringify({
      version: 1, scanDir: 'docs', topics: { rules: { file: 'AGENTS.md', desc: 'rules' } },
    }, null, 2));
    write(root, 'docs/docs-manifest.json', JSON.stringify({
      version: 1, sourceLang: 'en', primaryLang: 'en', i18nDir: '', langs: ['en'],
      docs: [{ id: 'rules', primary: 'AGENTS.md', source: 'AGENTS.md', desc: 'rules' }],
    }, null, 2));

    const r = run(['sync', `--root=${root}`]);
    // Debug: also run truth check directly to see if it detects the untracked doc
    const tc = run(['truth', 'check', `--root=${root}`]);
    ok('sync exits 1 on problems', r.code === 1, `sync exit=${r.code} · truth check exit=${tc.code} · truth out: ${tc.out.slice(0, 300)}`);
    ok('sync reports truth problems', /truth.*problem/i.test(r.out), `sync out: ${r.out} · truth out: ${tc.out}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})();

// Scene 11: keeper stale — detects stale translations
(function scene11() {
  console.log('Scene 11 · keeper stale (staleness sweep)');
  const root = mkTmpDir();
  try {
    write(root, 'AGENTS.md', '# Rules\n');
    write(root, 'docs/truth-source.json', JSON.stringify({
      version: 1, scanDir: 'docs', topics: { rules: { file: 'AGENTS.md', desc: 'rules' } },
    }, null, 2));
    write(root, 'docs/docs-manifest.json', JSON.stringify({
      version: 1, sourceLang: 'en', primaryLang: 'en', i18nDir: '', langs: ['en', 'zh'],
      docs: [{ id: 'rules', primary: 'AGENTS.md', source: 'AGENTS.md', desc: 'rules', translations: { zh: 'AGENTS.zh.md' } }],
    }, null, 2));
    // stamp zh translation, then modify source → should make it stale
    write(root, 'AGENTS.zh.md', '# 规则\n');
    run(['docs', 'stamp', 'rules', 'zh', `--root=${root}`]);
    write(root, 'AGENTS.md', '# Rules\n\nUpdated.\n');  // source changed → zh stale

    const r = run(['stale', `--root=${root}`]);
    ok('stale exits non-zero on stale translations', r.code === 1, `exit=${r.code}`);
    ok('stale reports stale translations', /AGENTS\.zh\.md: stale/.test(r.out), r.out);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})();

// Scene 12: keeper stale all green
(function scene12() {
  console.log('Scene 12 · keeper stale (all green)');
  const root = mkTmpDir();
  try {
    write(root, 'AGENTS.md', '# Rules\n');
    write(root, 'docs/truth-source.json', JSON.stringify({
      version: 1, scanDir: 'docs', topics: { rules: { file: 'AGENTS.md', desc: 'rules' } },
    }, null, 2));
    write(root, 'docs/docs-manifest.json', JSON.stringify({
      version: 1, sourceLang: 'en', primaryLang: 'en', i18nDir: '', langs: ['en'],
      docs: [{ id: 'rules', primary: 'AGENTS.md', source: 'AGENTS.md', desc: 'rules' }],
    }, null, 2));

    const r = run(['stale', `--root=${root}`]);
    ok('stale exits 0 on clean project', r.code === 0, `exit=${r.code}`);
    ok('stale says all green', /all green|nothing stale/i.test(r.out), r.out);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})();

// ────────────────────────────────────────────────────────────

// Scene 13: release changelog init + add + cut + show
(function scene13() {
  console.log('Scene 13 · release changelog (init / add / cut / show)');
  const root = mkTmpDir();
  try {
    // init
    let r = run(['release', 'changelog', 'init', `--root=${root}`]);
    ok('changelog init exits 0', r.code === 0, r.out);
    ok('CHANGELOG.md created', fs.existsSync(path.join(root, 'CHANGELOG.md')));
    ok('template has Unreleased section', /## \[Unreleased\]/.test(fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')));

    // init again without --force → exit 1
    r = run(['release', 'changelog', 'init', `--root=${root}`]);
    ok('changelog init refuses overwrite', r.code === 1);

    // add a bullet
    r = run(['release', 'changelog', 'add', 'Added new feature X', `--root=${root}`]);
    ok('changelog add exits 0', r.code === 0, r.out);
    const afterAdd = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    ok('bullet added under Unreleased', /## \[Unreleased\][\s\S]*- Added new feature X/.test(afterAdd));

    // cut a version
    r = run(['release', 'changelog', 'cut', '0.2.0', `--root=${root}`]);
    ok('changelog cut exits 0', r.code === 0, r.out);
    const afterCut = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
    ok('versioned section created', /## \[0\.2\.0\] - \d{4}-\d{2}-\d{2}/.test(afterCut));
    ok('fresh Unreleased section prepended', /## \[Unreleased\][\s\S]*## \[0\.2\.0\]/.test(afterCut));
    ok('bullet moved to versioned section', /## \[0\.2\.0\][\s\S]*- Added new feature X/.test(afterCut));

    // show
    r = run(['release', 'changelog', 'show', `--root=${root}`]);
    ok('changelog show exits 0', r.code === 0);
    ok('show prints versioned section', /0\.2\.0/.test(r.out));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})();

// Scene 14: ver next — auto-compute next version from conventional commits
(function scene14() {
  console.log('Scene 14 · ver next (conventional commits → next version)');
  const root = mkTmpDir();
  try {
    // set up a minimal version-manifest.json + package.json
    // package.json is written with spaces around ':' to match the manifest pattern
    write(root, 'package.json', '{\n  "name": "test",\n  "version": "0.1.0"\n}\n');
    write(root, 'version-manifest.json', JSON.stringify({
      targets: [{ file: 'package.json', patterns: ['"version": "{{version}}"'] }],
      blockMajor: true,
    }) + '\n');

    // git init + initial commit + tag
    spawnSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });
    spawnSync('git', ['config', 'user.email', 'test@test.local'], { cwd: root, stdio: 'ignore' });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: root, stdio: 'ignore' });
    spawnSync('git', ['add', '.'], { cwd: root, stdio: 'ignore' });
    spawnSync('git', ['commit', '-q', '-m', 'chore: initial release'], { cwd: root, stdio: 'ignore' });
    spawnSync('git', ['tag', 'v0.1.0'], { cwd: root, stdio: 'ignore' });

    // add a feat commit (should trigger minor bump)
    fs.writeFileSync(path.join(root, 'feature.txt'), 'new feature\n');
    spawnSync('git', ['add', 'feature.txt'], { cwd: root, stdio: 'ignore' });
    spawnSync('git', ['commit', '-q', '-m', 'feat: add feature X'], { cwd: root, stdio: 'ignore' });

    // ver next → should recommend minor (0.1.0 → 0.2.0)
    const r = run(['ver', 'next', `--root=${root}`]);
    ok('ver next exits 0', r.code === 0, r.out);
    ok('recommends minor bump', /minor/i.test(r.out), r.out);
    ok('shows 0.1.0 → 0.2.0', /0\.1\.0.*0\.2\.0/.test(r.out), r.out);
    ok('breakdown shows 1 feat', /1 feat/.test(r.out) || /feat.*1/.test(r.out), r.out);

    // ver bump (no arg) → should auto-use minor and bump to 0.2.0
    const bumpR = run(['ver', 'bump', `--root=${root}`]);
    ok('ver bump (no arg) exits 0', bumpR.code === 0, bumpR.out);
    const pkgAfter = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    ok('package.json bumped to 0.2.0', pkgAfter.version === '0.2.0', `got ${pkgAfter.version}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})();

// Scene 15: release preflight commit — debug residue + credential detection
(function scene15() {
  console.log('Scene 15 · release preflight commit (debug residue + credentials)');
  const root = mkTmpDir();
  try {
    spawnSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });
    spawnSync('git', ['config', 'user.email', 'test@test.local'], { cwd: root, stdio: 'ignore' });
    spawnSync('git', ['config', 'user.name', 'Test'], { cwd: root, stdio: 'ignore' });

    // 1. clean file → preflight commit exits 0
    write(root, 'clean.js', '"use strict";\nmodule.exports = function () { return 42; };\n');
    spawnSync('git', ['add', 'clean.js'], { cwd: root, stdio: 'ignore' });
    let r = run(['release', 'preflight', 'commit', `--root=${root}`]);
    ok('preflight commit clean → exit 0', r.code === 0, r.out);
    ok('preflight reports no debug residue', /no debug residue/.test(r.out), r.out);

    // 2. file with console.log → warning (exit 0, warnings don't block)
    write(root, 'debug.js', '"use strict";\nconsole.log("debug");\nmodule.exports = {};\n');
    spawnSync('git', ['add', 'debug.js'], { cwd: root, stdio: 'ignore' });
    r = run(['release', 'preflight', 'commit', `--root=${root}`]);
    ok('preflight commit with debug → still exit 0 (warning only)', r.code === 0, r.out);
    ok('preflight reports debug residue found', /debug residue\(s\) found/.test(r.out), r.out);

    write(root, '脚本.js', 'const broken = ;\n');
    spawnSync('git', ['add', '脚本.js'], { cwd: root, stdio: 'ignore' });
    write(root, '脚本.js', 'const fixed = true;\n');
    r = run(['release', 'preflight', 'commit', '--root', root]);
    ok('syntax check reads staged Unicode paths even after a working-tree fix', r.code === 1 && r.out.includes('脚本.js'), r.out);
    spawnSync('git', ['add', '脚本.js'], { cwd: root, stdio: 'ignore' });
    write(root, '脚本.js', 'const broken = ;\n');
    r = run(['release', 'preflight', 'commit', '--root', root]);
    ok('unstaged syntax errors do not fail staged checks', r.code === 0, r.out);

    write(root, 'notes.md', '# Notes\n');
    write(root, 'locales/docs-manifest.json', JSON.stringify({
      sourceLang: 'en', primaryLang: 'en', i18nDir: '', langs: ['en', 'zh'],
      docs: [{ id: 'notes', source: 'notes.md', primary: 'notes.md' }],
    }));
    spawnSync('git', ['add', 'notes.md'], { cwd: root, stdio: 'ignore' });
    r = run(['release', 'preflight', 'commit', '--root', root]);
    ok('commit warns about missing translations in locales/', r.code === 0 && /translation check failed/.test(r.out), r.out);
    r = run(['release', 'preflight', 'build', '--root', root]);
    ok('build rejects missing translations', r.code === 1 && /translation check failed/.test(r.out), r.out);
    write(root, 'notes.zh.md', '# 笔记');
    run(['docs', 'stamp', 'notes', 'zh', '--root', root]);
    r = run(['release', 'preflight', 'commit', '--lang', 'zh', '--root', root]);
    ok('fresh translations pass in Chinese', r.code === 0 && /✓  翻译同步/.test(r.out), r.out);

    // 3. staged .env file → exit 1 (credential = blocking problem)
    write(root, '.env', 'SECRET=abc123\n');
    spawnSync('git', ['add', '.env'], { cwd: root, stdio: 'ignore' });
    r = run(['release', 'preflight', 'commit', `--root=${root}`]);
    ok('preflight commit with .env → exit 1', r.code === 1, r.out);
    ok('preflight reports credential file', /credential file/i.test(r.out), r.out);
    spawnSync('git', ['reset', '--', '.env'], { cwd: root, stdio: 'ignore' });
    write(root, 'package.json', JSON.stringify({ scripts: { test: 'node project-test.cjs' } }));
    write(root, 'project-test.cjs', "require('fs').writeFileSync('ran-test', 'yes'); process.exit(3);");
    r = run(['release', 'preflight', 'push', '--root', root]);
    ok('push preflight runs the target project test and propagates failure', r.code === 1 && fs.existsSync(path.join(root, 'ran-test')) && /tests failed/.test(r.out), r.out);

  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})();

// ────────────────────────────────────────────────────────────

// A sibling project must never be read or modified through the caller's cwd.
(function projectSelection() {
  const tmp = mkTmpDir();
  try {
    const opts = { cwd: tmp };
    const root = path.join(tmp, 'target project');
    write(tmp, 'keeper-profile.json', '{"project":{"name":"Caller"}}');
    write(root, 'keeper-profile.json', '{"project":{"name":"Target"},"language":"zh"}');
    const progress = '# Progress\n### 2000-01-01\n\n- old\n';
    const plan = '| P-1 | item | ⬜ |\n';
    const start = '<!-- keeper:refresh:start progress -->old<!-- keeper:refresh:end -->\n';
    for (const dir of [tmp, root]) {
      write(dir, 'PROGRESS.md', progress);
      write(dir, 'PLAN.md', plan);
      write(dir, 'START-HERE.md', start);
    }
    for (const cmd of ['hello', 'status']) {
      const r = run(['--root', 'target project', cmd], opts);
      ok(cmd + ' reads target profile and language', r.code === 0 && /Target/.test(r.out) && /反馈/.test(r.out), r.out);
    }
    let r = run(['--lang', 'en', 'progress', 'add', 'entry', '--root', root], opts);
    const updated = fs.readFileSync(path.join(root, 'PROGRESS.md'), 'utf8');
    ok('progress writes only the requested entry in the target', r.code === 0 && /^- entry$/m.test(updated) && fs.readFileSync(path.join(tmp, 'PROGRESS.md'), 'utf8') === progress, r.out);
    r = run(['plan', 'done', 'P-1', '--root=' + root], opts);
    ok('plan updates only the requested project', r.code === 0 && fs.readFileSync(path.join(root, 'PLAN.md'), 'utf8').includes('✅') && fs.readFileSync(path.join(tmp, 'PLAN.md'), 'utf8') === plan);
    r = run(['sync', '--check', '--root', root], opts);
    ok('read-only sync preserves START-HERE', r.code === 0 && fs.readFileSync(path.join(root, 'START-HERE.md'), 'utf8') === start);
    r = run(['start-here', 'refresh', '--root=' + root], opts);
    ok('refresh reads target progress and preserves caller', r.code === 0 && fs.readFileSync(path.join(root, 'START-HERE.md'), 'utf8').includes('entry') && fs.readFileSync(path.join(tmp, 'START-HERE.md'), 'utf8') === start, r.out);
    write(root, 'keeper-profile.json', '{"startHere":{"enabled":false}}');
    write(root, 'START-HERE.md', start);
    r = run(['sync', '--root', root], opts);
    ok('sync respects the START-HERE opt-out', r.code === 0 && fs.readFileSync(path.join(root, 'START-HERE.md'), 'utf8') === start);
    write(root, 'app/package.json', '{}');
    write(root, 'feedback.json', '{"items":[{"id":7,"status":"idea"}]}');
    r = run(['fb', 'add', 'test entry'], { cwd: path.join(root, 'app') });
    const store = JSON.parse(fs.readFileSync(path.join(root, 'feedback.json'), 'utf8'));
    ok('nested package uses project feedback and legacy IDs', r.code === 0 && store.items[1]?.id === 8 && store.nextId === 9, r.out);
    write(root, 'docs/feedback/feedback.json', JSON.stringify({ nextId: 1, items: [{ id: 4, text: 'old', status: 'idea' }] }));
    const feedback = ['--store', 'docs/feedback/feedback.json', '--root', root];
    r = run(['fb', 'add', 'new', ...feedback], opts);
    ok('lagging feedback counter cannot reuse a stored ID', r.code === 0 && r.out.includes('#5'), r.out);
    r = run(['fb', 'link', '5', '--to', 'Plan@PLAN.md#tasks', ...feedback], opts);
    const inbox = fs.readFileSync(path.join(root, 'docs/feedback/INBOX.md'), 'utf8');
    ok('generated feedback links resolve from their Markdown page', r.code === 0 && inbox.includes('[Plan](../../PLAN.md#tasks)'), r.out);
    r = run(['progress', 'add', 'unexpected', '--root'], opts);
    ok('missing root value fails before editing', r.code === 1 && fs.readFileSync(path.join(tmp, 'PROGRESS.md'), 'utf8') === progress);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})();

(function strictChecks() {
  const root = mkTmpDir();
  try {
    const check = (...args) => run([...args, '--root', root]);
    write(root, 'keeper-profile.json', '{"language":"zh"}');
    write(root, 'locales/docs-manifest.json', JSON.stringify({
      sourceLang: 'en', primaryLang: 'en', i18nDir: '', langs: ['en', 'zh', 'ja'],
      docs: [{ id: 'help', primary: 'help.md', source: 'help.md' }],
    }));
    write(root, 'help.md', '# Help');
    write(root, 'help.zh.md', '# 帮助');
    let r = check('docs', 'stamp', 'help', '--lang', 'zh');
    ok('stamp accepts the target-language flag', r.code === 0, r.out);
    write(root, 'help.ja.md', '# Help (ja)');
    r = check('docs', 'stamp', 'help', '--lang', 'zh');
    const state = fs.readFileSync(path.join(root, 'locales/docs-state.json'), 'utf8');
    ok('targeted stamp leaves other languages unstamped', r.code === 0 && !state.includes('help:ja'));
    ok('bulk check accepts a positional language filter', check('docs', 'stamp', '--all', 'zh', '--check').code === 0);
    ok('unknown stamp language is rejected', check('docs', 'stamp', 'help', '--lang', 'xx').code === 1);
    fs.unlinkSync(path.join(root, 'help.ja.md'));
    for (const args of [['docs', 'stamp', '--all', '--check'], ['stale'], ['sync']]) {
      r = check(...args);
      ok(args.join(' ') + ' rejects a missing translation', r.code === 1 && r.out.includes('help.ja.md'), r.out);
    }
    ok('checking leaves fingerprints intact', fs.readFileSync(path.join(root, 'locales/docs-state.json'), 'utf8') === state);
    fs.unlinkSync(path.join(root, 'help.md'));
    ok('check rejects a missing source', check('docs', 'stamp', '--all', '--check').code === 1);
    write(root, '.docs/truth-source.json', '{"topics":{"rules":{"file":"missing.md"}}}');
    r = check('stale');
    ok('Chinese archive failures reach stale output', r.code === 1 && /死链/.test(r.out) && r.out.includes('missing.md'), r.out);
    write(root, 'locales/docs-manifest.json', '{');
    r = check('sync');
    ok('malformed registry fails the sweep', r.code === 1 && /docs.*发现问题/.test(r.out), r.out);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})();

(function versionPatterns() {
  const root = mkTmpDir();
  try {
    const targets = [
      { file: 'app.txt', patterns: ['build {{code}} = {{version}}'] },
      { file: 'other.txt', patterns: ['version {{version}}'] },
    ];
    write(root, 'version-manifest.json', JSON.stringify({ targets }));
    write(root, 'app.txt', 'build 10203 = 1.2.3');
    write(root, 'other.txt', 'old format');
    const set = () => run(['ver', 'set', '1.2.4', '--root', root]);
    let r = set();
    ok('later pattern failure leaves the first file untouched', r.code === 1 && fs.readFileSync(path.join(root, 'app.txt'), 'utf8') === 'build 10203 = 1.2.3', r.out);
    write(root, 'other.txt', 'version 1.2.3');
    ok('check accepts build code before version', run(['ver', 'check', '--root', root]).code === 0);
    r = set();
    ok('set updates both files after validation', r.code === 0 && fs.readFileSync(path.join(root, 'app.txt'), 'utf8') === 'build 10204 = 1.2.4', r.out);
    write(root, 'app.txt', 'build 1 = 1.2.4');
    ok('mismatched build code fails version check', run(['ver', 'check', '--root', root]).code === 1);

  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})();

// A small terminal adapter varies only the stream capabilities; the actual entry point runs.
(function bannerOutput() {
  const root = mkTmpDir();
  try {
    write(root, 'keeper-profile.json', '{"project":{"name":"Orbit Orchard"}}');
    write(root, 'game-i18n-manifest.json', '{"sourceLang":"en","langs":["zh"],"scan":{"dirs":["src"],"exts":[".gd"]}}');
    write(root, 'src/sample.gd', 'extends Node\n');
    const render = (width, env = {}, args = ['help']) => {
      const adapter = 'Object.defineProperties(process.stdout, {isTTY:{value:true},columns:{value:' + width + '}});' +
        'require(process.argv[1]);';
      const p = spawnSync(NODE, ['-e', adapter, KEEPER, ...args, '--root', root], {
        encoding: 'utf8', env: { ...process.env, TERM: 'xterm', NO_COLOR: '', CI: '', ...env },
      });
      if (p.status !== 0) throw Error(p.stderr);
      return p.stdout;
    };
    const wide = render(80);
    ok('wide terminal draws an ASCII wordmark', /\x1b\[36m[\x20-\x7e\r\n]+\x1b\[0m/.test(wide));
    for (const [label, width, env] of [['narrow', 36, {}], ['no color', 80, { NO_COLOR: '1' }],
      ['dumb', 80, { TERM: 'dumb' }], ['tiny', 7, {}]]) {
      const out = render(width, env);
      const line = out.split(/\r?\n/)[0];
      ok(label + ' gets a width-safe plain ASCII mark', line.startsWith('[o_o]') && line.length <= width && !out.includes('\x1b'));
    }
    const art = /\[o_o\]|\[o o\]|\x1b/;
    ok('redirected help omits artwork', !art.test(run(['help', '--root', root]).out));
    ok('CI terminal omits artwork', !art.test(render(80, { CI: 'true' })));
    const report = JSON.parse(render(80, {}, ['game', 'scan', '--json']));
    ok('machine output parses as JSON in a terminal', report.files === 1 && report.hits.length === 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})();

(function formalAcceptance() {
  console.log('Formal Sprint acceptance');
  const root = mkTmpDir();
  const sprint = (...args) => run(['sprint', ...args, '--lang', 'en'], { cwd: root });
  const digest = s => require('crypto').createHash('sha256').update(s).digest('hex');
  const record = 'evidence/run.json';
  const file = (name, contents) => {
    write(root, 'evidence/' + name, contents);
    return { file: name, sha256: digest(contents) };
  };
  try {
    const git = (...args) => {
      const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
      if (r.status !== 0) throw Error(r.stderr);
      return r.stdout.trim();
    };
    git('init', '-q');
    write(root, 'game.txt', 'independent test fixture');
    git('add', 'game.txt');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'test: initial game');
    const commit = git('rev-parse', 'HEAD');
    sprint('new', 'Sample');
    ok('formal task needs declared scope and source', sprint('add', 'missing', '--formal').code === 1);
    sprint('add', 'Window smoke', '--formal', '--covers', 'headless,window', '--human-review', '--from', 'issue 3', '--accept', 'Window shows count after click');
    const approve = () => sprint('approve', '1.1', '--record', record, '--by', 'human:claimed');
    ok('claimed human identity alone cannot accept a formal item', sprint('approve', '1.1', '--by', 'human:claimed').code === 1);
    const logic = { result: 'passed', ...file('logic.log', 'assert count=1') };
    const window = { result: 'passed', ...file('window.log', 'sample window observation') };
    const report = { commit, run: 'fixture-1', command: 'sample game test', coverage: { headless: logic } };
    const save = () => write(root, record, JSON.stringify(report));
    save();
    ok('headless coverage cannot satisfy missing window case', /window/.test(approve().out) && approve().code === 1);
    report.coverage.window = window;
    report.commit = '0'.repeat(40);
    save();
    ok('unknown commit rejected', /commit SHA/.test(approve().out));
    report.commit = commit;
    save();
    ok('human-required case needs separate decision receipt', /decision receipt/.test(approve().out));
    report.review = window;
    save();
    ok('run artifact cannot double as a decision receipt', approve().code === 1);
    report.review = file('decision.txt', 'Fixture decision, recorded separately');
    window.result = 'failed';
    save();
    ok('failed result cannot be accepted', approve().code === 1);
    window.result = 'passed';
    save();
    ok('formal acceptance attaches a real commit, record and scope', approve().code === 0 && sprint('show').out.includes(commit));
    ok('human label is reported as recorder', sprint('show').out.includes('reported by human:claimed'));
    file('window.log', 'changed');
    ok('changed artifact blocks lint and archive', sprint('lint').code === 1 && sprint('close').code === 1);
    file('window.log', 'sample window observation');
    report.run = 'different-run';
    save();
    ok('same artifacts do not authorize replacing the approved report', /digest/.test(sprint('lint').out));
    report.run = 'fixture-1';
    save();
    sprint('add', 'Small edit', '--accept', 'Text appears');
    ok('small task keeps lightweight self-check', sprint('approve', '1.2').code === 0 && sprint('show').out.includes('reported by self'));
    ok('exact original evidence can be linted and archived', sprint('lint').code === 0 && sprint('close').code === 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})();

(function handoffBoard() {
  const root = mkTmpDir();
  try {
    const hello = lang => run(['hello', '--root', root, '--lang', lang], { cwd: root }).out;
    write(root, 'HANDOFF.md', '# Legacy\nRead the previous shift.\n');
    ok('legacy root handoff remains discoverable', hello('en').includes('HANDOFF.md'));
    write(root, 'docs/PLAN.md', '# Plan\nPending decision on release scope.\n');
    write(root, 'docs/HANDOFF.md', [
      '# Handoff', '## Handoff brief', '- Next: Run smoke', '- Why: Confirm HUD',
      '- Decision: issue 3', '- Evidence: evidence/run.json', '## History', '- Next: OBSOLETE',
    ].join('\r\n'));
    const board = hello('en');
    ok('hello shows action, why, source and evidence from the preferred handoff', [
      'docs/HANDOFF.md', 'Run smoke', 'Confirm HUD', 'issue 3', 'evidence/run.json',
    ].every(s => board.includes(s)) && !board.includes('OBSOLETE'));
    ok('empty plan table does not claim all work is done', board.includes('no pending numbered plan rows'));
    write(root, 'docs/HANDOFF.md', '## 接班要点\n- 下一步：核对候选\n- 证据：测试报告\n## 旧班次\n- 原因：过时记录\n');
    const zh = hello('zh');
    ok('Chinese brief excludes historical sections', zh.includes('下一步：核对候选') && zh.includes('证据：测试报告') && !zh.includes('过时记录'));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})();

console.log(`\n${pass} passed · ${fail} failed`);
if (fail) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
console.log('');
