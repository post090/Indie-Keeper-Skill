#!/usr/bin/env node
// version-sync.js · Shipping Dock: sync the version number across files (zero deps)
// ─────────────────────────────────────────────────────────────
// Reference implementation of the indie-keeper Shipping Dock.
// Version numbers tend to scatter across files (package.json /
// build.gradle / VERSION…) and hand-editing always misses one.
// One manifest registers every location; one command updates them all.
//
// Each location in version-manifest.json is described with placeholders:
//   {{version}} = X.Y.Z
//   {{code}}    = major*10000 + minor*100 + patch (Android-style build number)
// e.g.  "versionName \"{{version}}\""  or  "\"version\": \"{{version}}\""
//
// Usage:
//   node version-sync.js show                    versions everywhere + consistency
//   node version-sync.js bump patch|minor|major  bump all (major refused by default)
//   node version-sync.js set <X.Y.Z>             force-set all to a given version
//   node version-sync.js check                   CI check · exit 1 on mismatch
//
// Touches files only, never git — review and commit yourself.
// All commands accept --root=<project root>, --manifest=<manifest path>, --lang=<en|zh>
'use strict';

const fs = require('fs');
const path = require('path');
const { detectLang, makeT } = require('../lang');

// ── argv parsing: both --name=value and --name value are accepted ──
const VALUE_FLAGS = new Set(['root', 'manifest', 'lang']);
function parseArgv(raw) {
  const flags = {}; const bools = new Set(); const pos = [];
  for (let i = 0; i < raw.length; i++) {
    const a = raw[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) flags[a.slice(2, eq)] = a.slice(eq + 1);
      else {
        const name = a.slice(2);
        if (VALUE_FLAGS.has(name) && i + 1 < raw.length && !raw[i + 1].startsWith('--')) flags[name] = raw[++i];
        else bools.add(name);
      }
    } else pos.push(a);
  }
  return { flags, bools, pos };
}
const A = parseArgv(process.argv.slice(2));
function flag(name, dflt) { return name in A.flags ? A.flags[name] : dflt; }

const lang = detectLang();

const MSG = {
  noManifest: {
    en: 'version-manifest.json not found.\n  Copy templates/version-manifest.template.json and adapt it, or point at one with --manifest.',
    zh: '没找到 version-manifest.json。\n  从 templates/version-manifest.template.json 抄一份改改，或 --manifest 指定路径。',
  },
  manifestMissing: { en: 'Manifest not found: {0}', zh: '登记表不存在：{0}' },
  emptyTargets: { en: 'The manifest has an empty targets array', zh: '登记表的 targets 数组是空的' },
  badSemver: { en: 'Version "{0}" is invalid (expected X.Y.Z, three numbers)', zh: '版本号"{0}"不合法（要 X.Y.Z 三段数字）' },
  noPlaceholder: { en: 'This pattern has no {{version}} or {{code}} placeholder: {0}', zh: '这条 pattern 里没有 {{version}} 或 {{code}} 占位符：{0}' },
  patternNotFound: { en: 'Pattern not found in {0}: {1}', zh: '在 {0} 里没找到这个 pattern：{1}' },
  fileMissing: { en: 'file not found', zh: '文件不存在' },
  noMatch: { en: 'pattern did not match', zh: 'pattern 没匹配上' },
  showMissing: { en: '  ⚠ {0}: file not found', zh: '  ⚠ {0}：文件不存在' },
  showNoMatch: { en: '  ✗ {0}: pattern did not match ({1})', zh: '  ✗ {0}：pattern 没匹配上（{1}）' },
  showVersion: { en: 'version {0}', zh: '版本 {0}' },
  showCode: { en: 'build {0}', zh: '构建号 {0}' },
  showOk: { en: '  Consistent: everything is {0}\n', zh: '  一致：全部都是 {0}\n' },
  showBad: { en: '  ⚠ Mismatch: {0} — use the set command to align\n', zh: '  ⚠ 不一致：{0}——用 set 命令拉齐\n' },
  showNone: { en: '(nothing readable)', zh: '（一个都没读出来）' },
  checkBroken: { en: '  ✗ {0}: {1}', zh: '  ✗ {0}：{1}' },
  checkMismatch: { en: '  ✗ Versions disagree across files: {0}', zh: '  ✗ 各处版本号不一致：{0}' },
  checkOk: { en: '✓ Versions consistent everywhere: {0}', zh: '✓ 各处版本号一致：{0}' },
  skipMissing: { en: '  ⚠ skipped {0} (file not found)', zh: '  ⚠ 跳过 {0}（文件不存在）' },
  applied: { en: '  ✓ {0} → {1}', zh: '  ✓ {0} → {1}' },
  appliedCode: { en: '  ✓ {0} → {1} (build {2})', zh: '  ✓ {0} → {1}（构建号 {2}）' },
  bumpUsage: { en: 'Usage: version-sync.js bump [patch|minor|major] (no arg = auto from git log)', zh: '用法：version-sync.js bump [patch|minor|major]（不填 = 从 git log 自动算）' },
  majorBlocked: {
    en: 'major bumps are refused by default (staying on 0.x until launch is a common discipline).\n  If you mean it: add --allow-major, or set blockMajor to false in the manifest.',
    zh: 'major 默认不给升（正式上线前停在 0.x 是常见纪律）。\n  真要升：加 --allow-major，或把登记表的 blockMajor 改成 false。',
  },
  bumpMismatch: { en: 'Versions disagree across files ({0}) — align with set before bumping', zh: '各处版本号不一致（{0}）——先用 set 拉齐再 bump' },
  bumping: { en: '\nBumping {0}: {1} → {2}\n', zh: '\n升 {0}：{1} → {2}\n' },
  bumped: {
    en: '\n  Files updated, nothing committed yet — review, then commit (suggested message: "chore(release): v{0}")\n',
    zh: '\n  文件已改好，还没提交——检查一遍后自己 commit（建议写 "chore(release): v{0}"）\n',
  },
  setUsage: { en: 'Usage: version-sync.js set <X.Y.Z>', zh: '用法：version-sync.js set <X.Y.Z>' },
  // next · auto-compute next version from conventional commits
  nextHead: { en: '\n  next version (from conventional commits)\n', zh: '\n  下一个版本号（从 conventional commits 推算）\n' },
  nextNoGit: { en: '  ⚠️  not a git repo — cannot read commit history', zh: '  ⚠️  不是 git 仓库——读不到提交历史' },
  nextNoCommits: { en: '  ⚠️  no commits found since last tag — nothing to bump', zh: '  ⚠️  上次 tag 后没有 commit——没东西可升' },
  nextNoTag: { en: '  =  no version tag found — scanning all commits', zh: '  =  没找到版本 tag——扫描全部 commit' },
  nextFromTag: { en: '  ▸  since tag {0}: {1} commit(s)', zh: '  ▸  自 tag {0} 起：{1} 个 commit' },
  nextBreakdown: { en: '  ▸  breakdown: {0} breaking · {1} feat · {2} fix/perf · {3} other', zh: '  ▸  分类：{0} breaking · {1} feat · {2} fix/perf · {3} 其他' },
  nextLevel: { en: '  ▸  recommended bump: {0}', zh: '  ▸  建议升：{0}' },
  nextDowngraded: { en: '  =  major downgraded to minor (blockMajor=true, staying on 0.x)', zh: '  =  major 降级为 minor（blockMajor=true，停在 0.x）' },
  nextResult: { en: '\n  {0} → {1}\n', zh: '\n  {0} → {1}\n' },
  nextHint: { en: '  run `keeper ver bump {0}` to apply, or `keeper ver bump` to use this auto-computed level', zh: '  跑 `keeper ver bump {0}` 应用，或 `keeper ver bump` 直接用这个自动算的级别' },
  nextAutoUsed: { en: '  =  no level given — auto-computed from git log: {0}', zh: '  =  没给级别——从 git log 自动算的：{0}' },
  unknownCmd: { en: 'Unknown command "{0}", see version-sync.js help', zh: '不认识命令"{0}"，看 version-sync.js help' },
  help: {
    en: `version-sync.js · sync the version number across files

  version-sync.js show                    versions everywhere + consistency
  version-sync.js next                    compute next version from conventional commits (dry run)
  version-sync.js bump [patch|minor|major]  bump all (no arg = auto from git log · major refused by default)
  version-sync.js set <X.Y.Z>             force-set all (to fix a mismatch)
  version-sync.js check                   CI check · exit 1 on mismatch

  Manifest: version-manifest.json (placeholders {{version}} / {{code}})
  Conventional commits: feat→minor · fix/perf→patch · BREAKING→major (downgraded to minor if blockMajor on 0.x)
  Bug fix → bump patch · new feature → bump minor · touches files only, never git
`,
    zh: `version-sync.js · 版本号多文件同步

  version-sync.js show                    看各处版本号 + 一致性
  version-sync.js next                    从 conventional commits 推算下一个版本号（预览）
  version-sync.js bump [patch|minor|major]  全部升一级（不填 = 从 git log 自动算 · major 默认拒绝）
  version-sync.js set <X.Y.Z>             全部强设成指定版本（用于拉齐不一致）
  version-sync.js check                   CI 体检 · 不一致就报错退出

  登记表：version-manifest.json（占位符 {{version}} / {{code}}）
  Conventional commits：feat→minor · fix/perf→patch · BREAKING→major（blockMajor 下 0.x 降级为 minor）
  修 bug 用 bump patch · 加新功能用 bump minor · 只改文件不碰 git
`,
  },
};
const t = makeT(MSG, lang);

const ROOT = path.resolve(flag('root', process.cwd()));
const CANDIDATES = ['version-manifest.json', '.docs/version-manifest.json'];

function fail(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// ── git helper (best effort, never throws) ──
function git(args) {
  try {
    const r = require('child_process').spawnSync('git', args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
  } catch { return { ok: false, out: '', err: '' }; }
}

// Find the most recent version tag (vX.Y.Z or X.Y.Z). Returns {tag, commits} or null.
function lastVersionTag() {
  // try vX.Y.Z first (common convention), then bare X.Y.Z
  const r = git(['describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*']);
  if (r.ok && r.out) return r.out;
  const r2 = git(['describe', '--tags', '--abbrev=0', '--match', '[0-9]*.[0-9]*.[0-9]*']);
  if (r2.ok && r2.out) return r2.out;
  return null;
}

// Parse conventional commits from `git log <range> --format=%s%n%b` output.
// Returns { breaking, feat, fix, other } counts and the recommended bump level.
function parseConventionalCommits(logText) {
  const commits = logText.split('\n\n').filter(Boolean); // commits separated by blank line (subject + body)
  let breaking = 0, feat = 0, fix = 0, other = 0;
  // Match subject lines: "type(scope)!: description" or "type: description"
  const subjectRe = /^(feat|fix|perf|refactor|docs|style|test|chore|ci|build|revert)(\([^)]*\))?(!)?:\s/;
  for (const block of commits) {
    const lines = block.split('\n');
    const subject = lines[0] || '';
    const body = lines.slice(1).join('\n');
    const m = subjectRe.exec(subject);
    // BREAKING: explicit "!" after type/scope, or "BREAKING CHANGE:" in body
    const hasBang = m && m[3] === '!';
    const hasBodyBreaking = /BREAKING[ -]CHANGE/i.test(body);
    if (hasBang || hasBodyBreaking) { breaking++; continue; }
    if (m) {
      if (m[1] === 'feat') feat++;
      else if (m[1] === 'fix' || m[1] === 'perf') fix++;
      else other++;
    } else {
      other++;
    }
  }
  let level;
  if (breaking > 0) level = 'major';
  else if (feat > 0) level = 'minor';
  else if (fix > 0) level = 'patch';
  else level = 'patch'; // conservative: any commit → at least patch
  return { breaking, feat, fix, other, level };
}

// Compute the next version from current + git log, respecting blockMajor.
// Returns { level, current, next, downgraded, breakdown, fromTag, commitCount }.
function computeNext(manifest) {
  const { versions } = collect(manifest);
  if (versions.size !== 1) fail(t('bumpMismatch', [...versions].join(' vs ')));
  const cur = parseSemver([...versions][0]);

  const tag = lastVersionTag();
  const range = tag ? `${tag}..HEAD` : 'HEAD';
  const logR = git(['log', range, '--format=%s%n%b']);
  if (!logR.ok) return { level: null, cur, next: cur, error: 'no-git' };
  const logText = logR.out;
  if (!logText.trim()) return { level: null, cur, next: cur, error: 'no-commits', tag };

  const breakdown = parseConventionalCommits(logText);
  let level = breakdown.level;
  let downgraded = false;

  // commit count since tag
  const countR = git(['rev-list', '--count', range]);
  const commitCount = countR.ok ? +countR.out : 0;

  // blockMajor: if on 0.x and major recommended, downgrade to minor
  const blockMajor = manifest.blockMajor !== false;
  if (level === 'major' && blockMajor && cur.major === 0) {
    level = 'minor';
    downgraded = true;
  }

  const next =
    level === 'major' ? { major: cur.major + 1, minor: 0, patch: 0 } :
    level === 'minor' ? { major: cur.major, minor: cur.minor + 1, patch: 0 } :
    { major: cur.major, minor: cur.minor, patch: cur.patch + 1 };

  return { level, cur, next, downgraded, breakdown, fromTag: tag, commitCount };
}

function cmdNext() {
  const manifest = loadManifest();
  console.log(t('nextHead'));
  const r = computeNext(manifest);
  if (r.error === 'no-git') { console.log(t('nextNoGit')); process.exit(1); }
  if (r.error === 'no-commits') { console.log(t('nextNoCommits')); process.exit(1); }

  if (r.fromTag) console.log(t('nextFromTag', r.fromTag, r.commitCount));
  else console.log(t('nextNoTag'));

  const b = r.breakdown;
  console.log(t('nextBreakdown', b.breaking, b.feat, b.fix, b.other));
  console.log(t('nextLevel', r.level));
  if (r.downgraded) console.log(t('nextDowngraded'));

  console.log(t('nextResult', fmt(r.cur), fmt(r.next)));
  console.log(t('nextHint', r.level));
}

function loadManifest() {
  const explicit = flag('manifest', '');
  let p = null;
  if (explicit) {
    p = path.resolve(ROOT, explicit);
    if (!fs.existsSync(p)) fail(t('manifestMissing', explicit));
  } else {
    p = CANDIDATES.map(c => path.join(ROOT, c)).find(c => fs.existsSync(c)) || null;
  }
  if (!p) fail(t('noManifest'));
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(m.targets) || !m.targets.length) fail(t('emptyTargets'));
  return m;
}

// ── semver ──

function parseSemver(s) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(s).trim());
  if (!m) fail(t('badSemver', s));
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}
function fmt(v) { return `${v.major}.${v.minor}.${v.patch}`; }
function codeOf(v) { return v.major * 10000 + v.minor * 100 + v.patch; }

// ── placeholder engine ──
// Compiles "versionName \"{{version}}\"" into a regex:
// {{version}} captures X.Y.Z, {{code}} captures digits

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function compile(pattern) {
  const groups = [];
  const re = escapeRe(pattern)
    .replace(/\\\{\\\{version\\\}\\\}/g, () => { groups.push('version'); return '([0-9]+\\.[0-9]+\\.[0-9]+)'; })
    .replace(/\\\{\\\{code\\\}\\\}/g, () => { groups.push('code'); return '([0-9]+)'; });
  if (!groups.length) fail(t('noPlaceholder', pattern));
  return { re: new RegExp(re), groups };
}

function readTarget(target) {
  const p = path.join(ROOT, target.file);
  if (!fs.existsSync(p)) return { ...target, exists: false };
  const text = fs.readFileSync(p, 'utf8');
  const values = {};
  for (const pattern of target.patterns) {
    const { re, groups } = compile(pattern);
    const m = re.exec(text);
    if (!m) return { ...target, exists: true, matched: false, pattern };
    groups.forEach((g, i) => { values[g] = m[i + 1]; });
  }
  return { ...target, exists: true, matched: true, values };
}

function writeTarget(target, version, code) {
  const p = path.join(ROOT, target.file);
  let text = fs.readFileSync(p, 'utf8');
  for (const pattern of target.patterns) {
    const { re } = compile(pattern);
    const replacement = pattern
      .replace(/\{\{version\}\}/g, version)
      .replace(/\{\{code\}\}/g, String(code));
    if (!re.test(text)) fail(t('patternNotFound', target.file, pattern));
    text = text.replace(re, replacement);
  }
  fs.writeFileSync(p, text, 'utf8');
}

// ── commands ──

function collect(manifest) {
  const reads = manifest.targets.map(readTarget);
  const versions = new Set(
    reads.filter(r => r.exists && r.matched && r.values.version).map(r => r.values.version)
  );
  return { reads, versions };
}

function cmdShow() {
  const manifest = loadManifest();
  const { reads, versions } = collect(manifest);
  console.log('');
  for (const r of reads) {
    if (!r.exists) { console.log(t('showMissing', r.file)); continue; }
    if (!r.matched) { console.log(t('showNoMatch', r.file, r.pattern)); continue; }
    const parts = [r.values.version && t('showVersion', r.values.version), r.values.code && t('showCode', r.values.code)]
      .filter(Boolean).join(' · ');
    console.log(`  ✓ ${r.file}: ${parts}`);
  }
  console.log('');
  if (versions.size === 1) console.log(t('showOk', [...versions][0]));
  else console.log(t('showBad', [...versions].join(' vs ') || t('showNone')));
}

function cmdCheck() {
  const manifest = loadManifest();
  const { reads, versions } = collect(manifest);
  const broken = reads.filter(r => !r.exists || !r.matched);
  if (broken.length || versions.size !== 1) {
    for (const r of broken) console.error(t('checkBroken', r.file, !r.exists ? t('fileMissing') : t('noMatch')));
    if (versions.size > 1) console.error(t('checkMismatch', [...versions].join(' vs ')));
    process.exit(1);
  }
  console.log(t('checkOk', [...versions][0]));
}

function applyAll(manifest, version) {
  const sem = parseSemver(version);
  const code = codeOf(sem);
  for (const tg of manifest.targets) {
    const r = readTarget(tg);
    if (!r.exists) { console.log(t('skipMissing', tg.file)); continue; }
    writeTarget(tg, version, code);
    const hasCode = tg.patterns.some(p => p.includes('{{code}}'));
    console.log(hasCode ? t('appliedCode', tg.file, version, code) : t('applied', tg.file, version));
  }
}

function cmdBump(args) {
  const manifest = loadManifest();
  let level = args[0];
  // no level → auto-compute from git log (conventional commits)
  if (!level) {
    const r = computeNext(manifest);
    if (r.error === 'no-git') { console.error(t('nextNoGit')); process.exit(1); }
    if (r.error === 'no-commits') { console.error(t('nextNoCommits')); process.exit(1); }
    console.log(t('nextAutoUsed', r.level));
    level = r.level;
  }
  if (!['patch', 'minor', 'major'].includes(level)) fail(t('bumpUsage'));
  if (level === 'major' && !A.bools.has('allow-major') && manifest.blockMajor !== false) {
    fail(t('majorBlocked'));
  }
  const { versions } = collect(manifest);
  if (versions.size !== 1) fail(t('bumpMismatch', [...versions].join(' vs ')));
  const cur = parseSemver([...versions][0]);
  const next =
    level === 'major' ? { major: cur.major + 1, minor: 0, patch: 0 } :
    level === 'minor' ? { major: cur.major, minor: cur.minor + 1, patch: 0 } :
    { major: cur.major, minor: cur.minor, patch: cur.patch + 1 };
  console.log(t('bumping', level, fmt(cur), fmt(next)));
  applyAll(manifest, fmt(next));
  console.log(t('bumped', fmt(next)));
}

function cmdSet(args) {
  const manifest = loadManifest();
  const version = args[0];
  if (!version) fail(t('setUsage'));
  parseSemver(version);
  console.log('');
  applyAll(manifest, version);
  console.log('');
}

// ── main ──

function main() {
  const cmd = A.pos[0];
  const rest = A.pos.slice(1);
  if (!cmd || cmd === 'help') { console.log(t('help')); return; }
  const table = { show: cmdShow, next: cmdNext, bump: cmdBump, set: cmdSet, check: cmdCheck };
  if (!table[cmd]) fail(t('unknownCmd', cmd));
  table[cmd](rest);
}

main();
