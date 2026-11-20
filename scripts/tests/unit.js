#!/usr/bin/env node
// unit.js · unit tests for shared complex logic (zero deps)
// ─────────────────────────────────────────────────────────────
// e2e.js exercises whole CLI flows; this file pins down the pure logic that
// several rooms share — the kind where a subtle regex bug breaks many
// commands at once:
//   - parseConventionalCommits  (version-sync: bump level inference)
//   - compile / parseSemver     (version-sync: placeholder pattern matching)
//   - scanDebugResidue / scanCredentials  (release: preflight classification)
//   - cutUnreleased             (release: changelog cut/slice)
//
// Run:  node scripts/tests/unit.js
// Exits 0 on full pass, 1 on any failure. Same output style as e2e.js.
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); if (detail) console.log(`      ${detail}`); failures.push(name); }
}

// release.js resolves ROOT from cwd at require time — chdir into a throwaway
// dir first so scanDebugResidue reads fixture files from there.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'keeper-unit-'));
const origCwd = process.cwd();
process.chdir(tmp);

const vs = require('../commands/version-sync.js');
const rel = require('../commands/release.js');
const br = require('../commands/branch.js');

console.log('\nindie-keeper unit tests\n');

// ── parseConventionalCommits ────────────────────────────────
(function suiteConventional() {
  console.log('Suite 1 · parseConventionalCommits (bump level inference)');
  const p = vs.parseConventionalCommits;

  let r = p('feat: add gantt view\n');
  ok('single feat → minor', r.level === 'minor' && r.feat === 1, JSON.stringify(r));

  r = p('fix: crash on empty manifest\n');
  ok('single fix → patch', r.level === 'patch' && r.fix === 1, JSON.stringify(r));

  r = p('perf: faster collect\n');
  ok('perf counts as fix → patch', r.level === 'patch' && r.fix === 1, JSON.stringify(r));

  r = p('feat: a\n\nfix: b\n\ndocs: c\n');
  ok('feat+fix+docs → minor, counts split', r.level === 'minor' && r.feat === 1 && r.fix === 1 && r.other === 1, JSON.stringify(r));

  r = p('feat!: drop node 14\n');
  ok('bang after type → major', r.level === 'major' && r.breaking === 1, JSON.stringify(r));

  r = p('feat(scope)!: drop node 14\n');
  ok('bang after scope → major', r.level === 'major' && r.breaking === 1, JSON.stringify(r));

  r = p('refactor: rework loader\nBREAKING CHANGE: manifest schema v2\n');
  ok('BREAKING CHANGE in body → major', r.level === 'major' && r.breaking === 1, JSON.stringify(r));

  r = p('fix: first\nmulti-paragraph body\n\nBREAKING CHANGE: new schema\n\0\nfeat: second\n\0');
  ok('git record boundaries preserve breaking footers and the next subject', r.breaking === 1 && r.feat === 1 && r.other === 0);

  r = p('update stuff\n');
  ok('non-conventional subject → other, patch', r.level === 'patch' && r.other === 1, JSON.stringify(r));

  r = p('feature: not a real type\n');
  ok('unknown type word → other (regex anchored)', r.other === 1 && r.feat === 0, JSON.stringify(r));
})();

// ── compile / parseSemver (placeholder pattern matching) ────
(function suitePattern() {
  console.log('Suite 2 · compile / parseSemver (version-sync pattern matching)');

  let c = vs.compile('"version": "{{version}}"');
  let m = c.re.exec('  "version": "1.2.3",');
  ok('{{version}} matches quoted semver', !!m && m[1] === '1.2.3' && c.groups[0] === 'version', m && m[1]);
  ok('{{version}} rejects two-part version', !c.re.test('"version": "1.2"'));

  c = vs.compile('versionCode {{code}}');
  m = c.re.exec('versionCode 10203');
  ok('{{code}} captures digits', !!m && m[1] === '10203' && c.groups[0] === 'code', m && m[1]);

  c = vs.compile('version={{version}} code={{code}}');
  m = c.re.exec('version=0.2.0 code=200');
  ok('both placeholders capture in order', !!m && m[1] === '0.2.0' && m[2] === '200' && c.groups.join(',') === 'version,code', m && `${m[1]}/${m[2]}`);

  c = vs.compile('app.version = "{{version}}" # x.y.z');
  ok('regex metachars in pattern are escaped', c.re.test('app.version = "3.0.1" # x.y.z') && !c.re.test('appXversion = "3.0.1" # xAyBz'));

  const v = vs.parseSemver(' 1.2.3 ');
  ok('parseSemver trims and splits', v.major === 1 && v.minor === 2 && v.patch === 3);
  ok('fmt roundtrips', vs.fmt(v) === '1.2.3');
  ok('codeOf is positional', vs.codeOf({ major: 1, minor: 2, patch: 3 }) === 10203);
})();

// ── scanDebugResidue / scanCredentials (preflight) ──────────
(function suitePreflight() {
  console.log('Suite 3 · preflight classification (debug residue / credentials)');

  fs.writeFileSync(path.join(tmp, 'clean.js'), '"use strict";\nmodule.exports = 1;\n');
  fs.writeFileSync(path.join(tmp, 'dirty.js'), 'console.log("hi");\nconst x = 1; // TODO tidy\n');
  fs.writeFileSync(path.join(tmp, 'app.py'), 'print("debug")\n');
  fs.writeFileSync(path.join(tmp, 'notes.md'), 'console.log in prose does not count\n');
  fs.mkdirSync(path.join(tmp, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'tests', 'x.js'), 'console.log("allowed in tests");\n');
  fs.writeFileSync(path.join(tmp, 'y.test.js'), 'debugger;\n');

  let hits = rel.scanDebugResidue(['clean.js']);
  ok('clean source → no hits', hits.length === 0, hits.join(' | '));

  hits = rel.scanDebugResidue(['dirty.js']);
  ok('console.log + TODO both flagged with line numbers', hits.length === 2 && /dirty\.js:1 \[console\.log\]/.test(hits[0]) && /dirty\.js:2 \[TODO\]/.test(hits[1]), hits.join(' | '));

  hits = rel.scanDebugResidue(['app.py']);
  ok('print() flagged in .py', hits.length === 1 && /\[print\(\)\]/.test(hits[0]), hits.join(' | '));

  hits = rel.scanDebugResidue(['notes.md']);
  ok('non-source extension skipped', hits.length === 0, hits.join(' | '));

  hits = rel.scanDebugResidue(['tests/x.js', 'y.test.js']);
  ok('test files exempt from residue scan', hits.length === 0, hits.join(' | '));

  const creds = rel.scanCredentials(['.env', 'config/.env.local', 'certs/server.pem', 'id_rsa', 'android.keystore', 'credentials.json', 'src/env.js', 'README.md']);
  ok('credential filenames flagged, lookalikes spared',
    creds.length === 6 && !creds.includes('src/env.js') && !creds.includes('README.md'), creds.join(' | '));
})();

// ── cutUnreleased (changelog cut/slice) ─────────────────────
(function suiteChangelog() {
  console.log('Suite 4 · cutUnreleased (changelog cut/slice)');

  const base = '# Changelog\n\n## [Unreleased]\n\n### Added\n- gantt zoom\n\n## [0.1.0] - 2026-07-28\n\n- first release\n';
  let r = rel.cutUnreleased(base, '0.2.0', '2026-07-29');
  ok('cut returns content + hasBullets', !!r && r.hasBullets === true);
  ok('versioned heading dated correctly', r.content.includes('## [0.2.0] - 2026-07-29'));
  ok('fresh Unreleased prepended before new version', r.content.indexOf('## [Unreleased]') < r.content.indexOf('## [0.2.0]'));
  ok('old bullets land under the new version heading',
    r.content.indexOf('## [0.2.0]') < r.content.indexOf('- gantt zoom') && r.content.indexOf('- gantt zoom') < r.content.indexOf('## [0.1.0]'));
  ok('older releases untouched', r.content.includes('## [0.1.0] - 2026-07-28'));

  const empty = '# Changelog\n\n## [Unreleased]\n\n## [0.1.0] - 2026-07-28\n';
  r = rel.cutUnreleased(empty, '0.2.0', '2026-07-29');
  ok('empty Unreleased → hasBullets false', !!r && r.hasBullets === false);

  ok('no Unreleased heading → null', rel.cutUnreleased('# Changelog\n\n## [0.1.0] - x\n', '0.2.0', '2026-07-29') === null);

  // cut twice: the fresh Unreleased from cut #1 must be cuttable again
  const twice = rel.cutUnreleased(rel.cutUnreleased(base, '0.2.0', '2026-07-29').content, '0.3.0', '2026-08-01');
  ok('second cut works on the fresh Unreleased', !!twice && twice.content.includes('## [0.3.0] - 2026-08-01') && twice.hasBullets === false);
})();

// ── draftFromLog / applyDraft (changelog draft) ──────
(function suiteDraft() {
  console.log('Suite 5 · draftFromLog / applyDraft (changelog draft)');

  const log = [
    'feat(gantt): zoom controls',
    'fix: dead-link check on Windows',
    'perf: faster sidebar collect',
    'refactor(core): split commands dir',
    'revert: drop broken cache',
    'docs: update README',
    'chore: bump year',
    'random non-conventional subject',
    'feat!: new manifest schema',
  ].join('\n');

  const d = rel.draftFromLog(log);
  ok('feat → Added (scope stripped to description)', d.buckets.Added.length === 2 && d.buckets.Added[0] === 'zoom controls');
  ok('fix → Fixed', d.buckets.Fixed.length === 1 && d.buckets.Fixed[0] === 'dead-link check on Windows');
  ok('perf + refactor → Changed', d.buckets.Changed.length === 2);
  ok('revert → Removed', d.buckets.Removed.length === 1);
  ok('docs/chore/non-conventional skipped, counted', d.skipped === 3, `skipped=${d.skipped}`);
  ok('bang subject gets **BREAKING** prefix', d.buckets.Added[1] === '**BREAKING** new manifest schema');

  const base = '# Changelog\n\n## [Unreleased]\n\n## [0.1.0] - 2026-07-28\n';
  const a = rel.applyDraft(base, d.buckets);
  ok('applyDraft writes grouped sections under Unreleased', !!a && a.count === 6 && /## \[Unreleased\]\n\n### Added\n- zoom controls/.test(a.content));
  ok('sections land before the previous release', a.content.indexOf('### Fixed') < a.content.indexOf('## [0.1.0]'));
  ok('applyDraft null without Unreleased', rel.applyDraft('# C\n\n## [0.1.0] - x\n', d.buckets) === null);
  ok('applyDraft no-op on empty buckets', rel.applyDraft(base, { Added: [], Changed: [], Fixed: [], Removed: [] }).count === 0);

  // draft → apply → cut roundtrip: the drafted entries survive a cut
  const cut = rel.cutUnreleased(a.content, '0.2.0', '2026-07-29');
  ok('draft entries survive changelog cut', !!cut && cut.hasBullets === true && cut.content.indexOf('## [0.2.0]') < cut.content.indexOf('- zoom controls'));
})();

// ── slugify / validateBranchName (branch policy) ────
(function suiteBranch() {
  console.log('Suite 6 · slugify / validateBranchName (branch policy)');

  ok('slugify kebab-cases words', br.slugify(['Login', 'UI', 'v2']) === 'login-ui-v2', br.slugify(['Login', 'UI', 'v2']));
  ok('slugify squashes punctuation runs', br.slugify(['fix:', ' the -- thing!!']) === 'fix-the-thing');
  ok('slugify keeps CJK', br.slugify(['登录', '界面']) === '登录-界面');
  ok('slugify empty when nothing usable', br.slugify(['!!!', '---']) === '');

  const policy = br.DEFAULT_POLICY;
  ok('protected branch passes by definition', br.validateBranchName('main', policy).ok === true && br.validateBranchName('main', policy).protected === true);
  ok('compliant name passes', br.validateBranchName('feature/login-ui', policy).ok === true);
  ok('missing slash rejected', br.validateBranchName('quickfix', policy).reason === 'no-slash');
  ok('unknown type rejected', br.validateBranchName('feat/login-ui', policy).reason === 'bad-type');
  ok('uppercase/underscore slug rejected', br.validateBranchName('feature/Login_UI', policy).reason === 'bad-slug');
  ok('trailing hyphen slug rejected', br.validateBranchName('fix/broken-', policy).reason === 'bad-slug');
})();

// ── summary ─────────────────────────────────────────────────
process.chdir(origCwd);
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* tmp dir, best effort */ }

console.log(`\n${pass} passed · ${fail} failed`);
if (fail) { for (const f of failures) console.log(`  ✗ ${f}`); process.exit(1); }
