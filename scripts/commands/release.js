#!/usr/bin/env node
// release.js · Shipping Dock: release pipeline (preflight + platform guides)
// ─────────────────────────────────────────────────────────────
// Reference implementation of the indie-keeper Shipping Dock release pipeline.
// Provides preflight checks (commit/push/build) and platform-specific
// templates + guidance (GitHub / itch / steam). Does NOT call gh/butler/steamcmd
// directly — prints the commands for the user/AI to run.
//
// Why no direct calls: zero-dependency principle + cross-platform stability.
// The AI/human reads the guide, runs the commands themselves. Preflight only
// checks state (git / files / version manifest / sibling keeper scripts).
//
// Usage:
//   node release.js preflight <commit|push|build>   pre-release checks (exit 1 on problems)
//   node release.js github <sub>                    GitHub release/workflow templates + guide
//   node release.js itch <sub>                      itch.io templates + guide
//   node release.js steam <sub>                     steam templates + guide
//
// All commands accept --root=<project root>, --lang=<en|zh>
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { detectLang, makeT } = require('../lang');

// ── argv parsing ──
const VALUE_FLAGS = new Set(['root', 'lang', 'out', 'version']);
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

const ROOT = path.resolve(flag('root', process.cwd()));
const SCRIPTS_DIR = __dirname;
const lang = detectLang();

const MSG = {
  help: {
    en: `release.js · Shipping Dock release pipeline (preflight + changelog + platform guides)

  release.js preflight <commit|push|build>   pre-release checks (exit 1 on problems)
  release.js changelog <sub>                 CHANGELOG.md management (Keep a Changelog format)
  release.js github <sub>                    GitHub release notes / workflow template / gh CLI guide
  release.js itch <sub>                      itch.io setup template + butler upload guide
  release.js steam <sub>                     steam build scripts template + steamcmd guide

  preflight stages:
    commit   before \`git commit\` — debug residue / credentials / syntax / docs sync / truth check
    push     before \`git push\`   — all commit checks + tests / behind-remote / branch confirm / sync
    build    before packaging     — version bumped / translations / sprint accepted / clean tree / notes ready

  changelog subs: init / add "<text>" / cut <X.Y.Z> / show
  github subs:    release-notes / workflow-template / guide
  itch subs:      init / guide
  steam subs:     init / guide

  Does NOT call gh/butler/steamcmd directly — prints commands for you to run.
  All commands accept --root=<path> and --lang=<en|zh>.
`,
    zh: `release.js · 发货口发布流水线（preflight 检查 + changelog 管理 + 平台指引）

  release.js preflight <commit|push|build>   发布前检查（有问题 exit 1）
  release.js changelog <子命令>              CHANGELOG.md 管理（Keep a Changelog 格式）
  release.js github <子命令>                 GitHub release notes / workflow 模板 / gh CLI 指引
  release.js itch <子命令>                   itch.io 配置模板 + butler 上传指引
  release.js steam <子命令>                  steam 构建脚本模板 + steamcmd 指引

  preflight 阶段：
    commit   \`git commit\` 前——调试残留 / 凭证 / 语法 / 翻译同步 / 真相源
    push     \`git push\` 前——commit 全部检查 + 测试 / 是否落后 / 分支确认 / sync
    build    打包前——版本号 / 翻译 / sprint 验收 / 干净工作区 / release notes

  changelog 子命令：init / add "<内容>" / cut <X.Y.Z> / show
  github 子命令：   release-notes / workflow-template / guide
  itch 子命令：     init / guide
  steam 子命令：    init / guide

  不直接调 gh/butler/steamcmd——打印命令让你自己跑。
  所有命令支持 --root=<路径> 和 --lang=<en|zh>。
`,
  },
  unknownCmd: { en: 'Unknown command "{0}", see release.js help', zh: '不认识命令"{0}"，看 release.js help' },
  preflightUsage: { en: 'Usage: release.js preflight <commit|push|build>', zh: '用法：release.js preflight <commit|push|build>' },
  clUnknownSub: { en: 'Unknown changelog subcommand "{0}". Available: add / cut / show / init', zh: '不认识的 changelog 子命令"{0}"。有：add / cut / show / init' },
  clNoFile: { en: '✗ no CHANGELOG.md found (run `keeper release changelog init` first)', zh: '✗ 没找到 CHANGELOG.md（先跑 `keeper release changelog init`）' },
  clNoText: { en: '✗ no text provided · usage: keeper release changelog add "<text>"', zh: '✗ 没写内容 · 用法：keeper release changelog add "<内容>"' },
  clInitExists: { en: '✗ CHANGELOG.md already exists (use --force to overwrite)', zh: '✗ CHANGELOG.md 已存在（用 --force 覆盖）' },
  clInitDone: { en: '✓ CHANGELOG.md created (Keep a Changelog format)', zh: '✓ CHANGELOG.md 已创建（Keep a Changelog 格式）' },
  clAdded: { en: '✓ CHANGELOG.md: added to [Unreleased] · {0}', zh: '✓ CHANGELOG.md：已加到 [Unreleased] · {0}' },
  clAddedNoUnreleased: { en: '✗ no "## [Unreleased]" section in CHANGELOG.md — add one first (or run `keeper release changelog init --force`)', zh: '✗ CHANGELOG.md 里没有 "## [Unreleased]" 段——先加一个（或跑 `keeper release changelog init --force`）' },
  clCutNoUnreleased: { en: '✗ no "## [Unreleased]" section to cut — nothing to release', zh: '✗ 没有 "## [Unreleased]" 段可切——没东西可发' },
  clCutNoVersion: { en: '✗ no version given · usage: keeper release changelog cut <X.Y.Z> (or run `keeper ver next` to compute one)', zh: '✗ 没给版本号 · 用法：keeper release changelog cut <X.Y.Z>（或跑 `keeper ver next` 算一个）' },
  clCutDone: { en: '✓ CHANGELOG.md: cut [Unreleased] → [{0}] · {1}', zh: '✓ CHANGELOG.md：[Unreleased] 切成 [{0}] · {1}' },
  clCutEmpty: { en: '  (Unreleased was empty — cut anyway, created a fresh Unreleased section)', zh: '  （Unreleased 是空的——照切，建了新的 Unreleased 段）' },
  clShowHead: { en: '\n  CHANGELOG.md\n', zh: '\n  CHANGELOG.md\n' },
  clGenerateHint: { en: '\n  tip: to auto-fill [Unreleased] from git log, use a conventional-commits walker (planned: `keeper release changelog generate`)', zh: '\n  提示：要从 git log 自动填充 [Unreleased]，用 conventional commits 解析（计划中：`keeper release changelog generate`）' },

  // ── preflight: shared ──
  preflightHead: { en: '\n  preflight · {0}\n', zh: '\n  preflight · {0}\n' },
  preflightGitNone: { en: '  ⚠️  not a git repo (preflight needs git)', zh: '  ⚠️  不是 git 仓库（preflight 需要 git）' },
  preflightWorktreeClean: { en: '  ✓  working tree clean', zh: '  ✓  工作区干净' },
  preflightWorktreeDirty: { en: '  ▸  {0} change(s) in worktree', zh: '  ▸  工作区有 {0} 个改动' },
  preflightNoStaged: { en: '  =  nothing staged (stage files first)', zh: '  =  没有暂存的文件（先 stage）' },

  // ── preflight: debug residue ──
  preflightDebugHead: { en: '  ▸  debug residue scan (staged source files)', zh: '  ▸  调试残留扫描（已暂存的源码）' },
  preflightDebugFound: { en: '  ⚠️  {0} debug residue(s) found — review before commit', zh: '  ⚠️  发现 {0} 处调试残留——提交前清掉' },
  preflightDebugOk: { en: '  ✓  no debug residue', zh: '  ✓  没有调试残留' },

  // ── preflight: credentials ──
  preflightCredFound: { en: '  ❌ {0} credential file(s) in staging — unstage immediately', zh: '  ❌ 暂存区有 {0} 个凭证文件——立刻移出' },
  preflightCredOk: { en: '  ✓  no credential files in staging', zh: '  ✓  暂存区没有凭证文件' },

  // ── preflight: syntax ──
  preflightSyntaxHead: { en: '  ▸  syntax check (node --check)', zh: '  ▸  语法检查（node --check）' },
  preflightSyntaxFail: { en: '  ❌ {0} file(s) failed syntax check', zh: '  ❌ {0} 个文件语法检查失败' },
  preflightSyntaxOk: { en: '  ✓  {0} file(s) passed', zh: '  ✓  {0} 个文件通过' },
  preflightSyntaxSkip: { en: '  =  no .js files staged', zh: '  =  没有暂存的 .js 文件' },

  // ── preflight: docs sync ──
  preflightDocsHead: { en: '  ▸  docs translation sync', zh: '  ▸  文档翻译同步' },
  preflightDocsStale: { en: '  ⚠️  translations stale — run `keeper docs status` for details', zh: '  ⚠️  翻译过期——跑 `keeper docs status` 看详情' },
  preflightDocsOk: { en: '  ✓  translations fresh', zh: '  ✓  翻译同步' },
  preflightDocsSkip: { en: '  =  no docs-manifest.json (Docs Translation Desk not installed)', zh: '  =  没有 docs-manifest.json（文档翻译部未安装）' },
  preflightNoDocChanges: { en: '  =  no .md files in staging', zh: '  =  暂存区没有 .md 文件' },

  // ── preflight: truth check ──
  preflightTruthHead: { en: '  ▸  truth check (Archive health)', zh: '  ▸  真相源体检（档案室健康度）' },
  preflightTruthFail: { en: '  ❌ truth check failed — run `keeper truth check` for details', zh: '  ❌ 真相源体检失败——跑 `keeper truth check` 看详情' },
  preflightTruthOk: { en: '  ✓  truth check passed', zh: '  ✓  真相源体检通过' },
  preflightTruthSkip: { en: '  =  no truth-source.json (Archive not installed)', zh: '  =  没有 truth-source.json（档案室未安装）' },

  // ── preflight: push-specific ──
  preflightTestHead: { en: '  ▸  test suite', zh: '  ▸  测试套件' },
  preflightTestFail: { en: '  ❌ tests failed', zh: '  ❌ 测试失败' },
  preflightTestOk: { en: '  ✓  tests passed', zh: '  ✓  测试通过' },
  preflightTestSkip: { en: '  =  no test script in package.json', zh: '  =  package.json 里没有 test 脚本' },
  preflightBehindHead: { en: '  ▸  remote sync', zh: '  ▸  远程同步' },
  preflightBehind: { en: '  ⚠️  local is behind origin by {0} commit(s) — pull first', zh: '  ⚠️  本地落后 origin {0} 个 commit——先 pull' },
  preflightAhead: { en: '  ✓  local is ahead of origin by {0} commit(s) — safe to push', zh: '  ✓  本地领先 origin {0} 个 commit——可以推' },
  preflightUpToDate: { en: '  =  local is up to date with origin — nothing to push', zh: '  =  本地跟 origin 一致——没东西可推' },
  preflightNoRemote: { en: '  =  no remote configured', zh: '  =  没配置远程' },
  preflightBranchHead: { en: '  ▸  branch check', zh: '  ▸  分支检查' },
  preflightBranchWarn: { en: '  ⚠️  pushing to branch "{0}" — confirm this is intentional (main/master?)', zh: '  ⚠️  推送到分支"{0}"——确认这是故意的（main/master？）' },
  preflightBranchOk: { en: '  ✓  branch: {0}', zh: '  ✓  分支：{0}' },
  preflightProgressHead: { en: '  ▸  PROGRESS.md recency', zh: '  ▸  PROGRESS.md 时效' },
  preflightProgressStale: { en: '  ⚠️  last PROGRESS.md entry is {0} day(s) old — log before pushing', zh: '  ⚠️  PROGRESS.md 上一条是 {0} 天前的——推之前记一笔' },
  preflightProgressOk: { en: '  ✓  PROGRESS.md recent', zh: '  ✓  PROGRESS.md 是最近的' },
  preflightProgressSkip: { en: '  =  no PROGRESS.md', zh: '  =  没有 PROGRESS.md' },
  preflightSyncHead: { en: '  ▸  keeper sync (derived content + all checks)', zh: '  ▸  keeper sync（派生内容 + 所有检查）' },
  preflightSyncFail: { en: '  ❌ keeper sync found problems — run `keeper sync` for details', zh: '  ❌ keeper sync 发现问题——跑 `keeper sync` 看详情' },
  preflightSyncOk: { en: '  ✓  keeper sync all green', zh: '  ✓  keeper sync 全绿' },

  // ── preflight: build-specific ──
  preflightVersionHead: { en: '  ▸  version consistency', zh: '  ▸  版本号一致性' },
  preflightVersionFail: { en: '  ❌ versions disagree across files — run `keeper ver check`', zh: '  ❌ 各处版本号不一致——跑 `keeper ver check`' },
  preflightVersionOk: { en: '  ✓  versions consistent: {0}', zh: '  ✓  版本号一致：{0}' },
  preflightVersionSkip: { en: '  =  no version-manifest.json (version sync not installed)', zh: '  =  没有 version-manifest.json（版本同步未安装）' },
  preflightSprintHead: { en: '  ▸  sprint acceptance', zh: '  ▸  sprint 验收' },
  preflightSprintPending: { en: '  ⚠️  sprint {0} has {1} unaccepted item(s) — accept or explicitly defer', zh: '  ⚠️  sprint {0} 还有 {1} 项未验收——验收或显式延后' },
  preflightSprintOk: { en: '  ✓  sprint {0} fully accepted', zh: '  ✓  sprint {0} 全部验收' },
  preflightSprintSkip: { en: '  =  no active sprint', zh: '  =  没有进行中的 sprint' },
  preflightCleanHead: { en: '  ▸  clean worktree', zh: '  ▸  干净工作区' },
  preflightCleanFail: { en: '  ❌ {0} uncommitted change(s) — commit or stash before building', zh: '  ❌ {0} 个未提交改动——打包前先 commit 或 stash' },
  preflightCleanOk: { en: '  ✓  worktree clean', zh: '  ✓  工作区干净' },
  preflightNotesHead: { en: '  ▸  release notes', zh: '  ▸  发布说明' },
  preflightNotesMissing: { en: '  ⚠️  no CHANGELOG.md or docs/releases/ found — draft release notes first', zh: '  ⚠️  没找到 CHANGELOG.md 或 docs/releases/——先起草 release notes' },
  preflightNotesOk: { en: '  ✓  release notes file found: {0}', zh: '  ✓  找到 release notes 文件：{0}' },
  preflightStaleHead: { en: '  ▸  keeper stale (overall staleness)', zh: '  ▸  keeper stale（整体过期扫描）' },
  preflightStaleFail: { en: '  ❌ stale scan found issues — run `keeper stale` for details', zh: '  ❌ 过期扫描发现问题——跑 `keeper stale` 看详情' },
  preflightStaleOk: { en: '  ✓  nothing stale', zh: '  ✓  没有过期的' },

  // ── preflight: summary ──
  preflightAllGreen: { en: '\n  ✓ {0} preflight all green — safe to proceed\n', zh: '\n  ✓ {0} preflight 全绿——可以继续\n' },
  preflightSummary: { en: '\n  {0} preflight: {1} problem(s) · {2} warning(s)\n', zh: '\n  {0} preflight：{1} 个问题 · {2} 个警告\n' },

  // ── github subs ──
  ghUnknownSub: { en: 'Unknown github subcommand "{0}". Available: release-notes / workflow-template / guide', zh: '不认识的 github 子命令"{0}"。有：release-notes / workflow-template / guide' },
  ghNotesHead: { en: '\n  release notes draft (from PROGRESS.md + sprint)\n', zh: '\n  release notes 草稿（从 PROGRESS.md + sprint 提取）\n' },
  ghNotesNoData: { en: '  (no PROGRESS.md or sprint data found — write notes manually)', zh: '  （没找到 PROGRESS.md 或 sprint 数据——手写 notes）' },
  ghNotesWritten: { en: '  ✓ written to {0}', zh: '  ✓ 已写入 {0}' },
  ghNotesStdout: { en: '  (printed to stdout — use --out=<file> to write)', zh: '  （输出到 stdout——用 --out=<file> 写文件）' },
  ghWfHead: { en: '\n  GitHub Actions workflow template (build + release on tag)\n', zh: '\n  GitHub Actions workflow 模板（打 tag 时构建 + 发布）\n' },
  ghWfWritten: { en: '  ✓ written to {0}', zh: '  ✓ 已写入 {0}' },
  ghWfExists: { en: '  ⚠️  {0} already exists — use --force to overwrite', zh: '  ⚠️  {0} 已存在——用 --force 覆盖' },
  ghGuideHead: { en: '\n  GitHub release guide (gh CLI commands)\n', zh: '\n  GitHub 发布指引（gh CLI 命令）\n' },

  // ── itch subs ──
  itchUnknownSub: { en: 'Unknown itch subcommand "{0}". Available: init / guide', zh: '不认识的 itch 子命令"{0}"。有：init / guide' },
  itchInitHead: { en: '\n  itch.io project config (itch.toml)\n', zh: '\n  itch.io 项目配置（itch.toml）\n' },
  itchInitWritten: { en: '  ✓ written to {0}', zh: '  ✓ 已写入 {0}' },
  itchInitExists: { en: '  ⚠️  {0} already exists — use --force to overwrite', zh: '  ⚠️  {0} 已存在——用 --force 覆盖' },
  itchGuideHead: { en: '\n  itch.io upload guide (butler CLI)\n', zh: '\n  itch.io 上传指引（butler CLI）\n' },

  // ── steam subs ──
  steamUnknownSub: { en: 'Unknown steam subcommand "{0}". Available: init / guide', zh: '不认识的 steam 子命令"{0}"。有：init / guide' },
  steamInitHead: { en: '\n  steam build scripts (steam_upload.vdf)\n', zh: '\n  steam 构建脚本（steam_upload.vdf）\n' },
  steamInitWritten: { en: '  ✓ written to {0}', zh: '  ✓ 已写入 {0}' },
  steamInitExists: { en: '  ⚠️  {0} already exists — use --force to overwrite', zh: '  ⚠️  {0} 已存在——用 --force 覆盖' },
  steamGuideHead: { en: '\n  steam upload guide (steamcmd)\n', zh: '\n  steam 上传指引（steamcmd）\n' },
};
const t = makeT(MSG, lang);

function fail(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// ── helpers ──

function git(args, cwd) {
  try {
    const r = spawnSync('git', args, { cwd: cwd || ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    return { ok: r.status === 0, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
  } catch { return { ok: false, out: '', err: '' }; }
}

function runKeeper(script, args, cwd) {
  const p = path.join(SCRIPTS_DIR, script);
  if (!fs.existsSync(p)) return { ok: false, code: -1, out: '', err: 'script not found' };
  try {
    const r = spawnSync(process.execPath, [p, ...args, `--root=${cwd || ROOT}`], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    return { ok: r.status === 0, code: r.status, out: (r.stdout || '') + (r.stderr || ''), err: '' };
  } catch (e) { return { ok: false, code: -1, out: '', err: String(e) }; }
}

function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

function loadProfile() {
  for (const c of ['keeper-profile.json', 'docs/keeper-profile.json', '.docs/keeper-profile.json']) {
    const p = path.join(ROOT, c);
    const s = readJSON(p);
    if (s) return s;
  }
  return null;
}

function hasFile(rel) { return fs.existsSync(path.join(ROOT, rel)); }

// staged source files (added/copied/modified), excluding deletions
function stagedFiles() {
  const r = git(['diff', '--cached', '--name-only', '--diff-filter=ACM']);
  if (!r.ok || !r.out.trim()) return [];
  return r.out.split('\n').filter(Boolean);
}

// scan staged source files for debug residue (console.log / debugger / print / TODO)
const DEBUG_PATTERNS = [
  { re: /console\.(log|debug|info)\s*\(/, label: 'console.log' },
  { re: /\bdebugger\b/, label: 'debugger' },
  { re: /\bprint\s*\(/, label: 'print()' },
  { re: /\bTODO\b/, label: 'TODO' },
  { re: /\bFIXME\b/, label: 'FIXME' },
];
const SOURCE_EXTS = new Set(['.js', '.ts', '.jsx', '.tsx', '.py', '.mjs', '.cjs']);
const TEST_PATTERNS = [/\.test\./, /\.spec\./, /__tests__\//, /\/tests?\//];

function scanDebugResidue(files) {
  const hits = [];
  for (const rel of files) {
    const ext = path.extname(rel);
    if (!SOURCE_EXTS.has(ext)) continue;
    if (TEST_PATTERNS.some(re => re.test(rel))) continue;
    const abs = path.join(ROOT, rel);
    let text; try { text = fs.readFileSync(abs, 'utf8').replace(/\r\n?/g, '\n'); } catch { continue; }
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      for (const { re, label } of DEBUG_PATTERNS) {
        if (re.test(lines[i])) {
          hits.push(`${rel}:${i + 1} [${label}] ${lines[i].trim().slice(0, 100)}`);
          break;
        }
      }
    }
  }
  return hits;
}

// scan staged files for credentials (.env / *.key / *.pem / id_rsa / etc.)
const CRED_FILE_PATTERNS = [/^\.env(\.|$)/, /\.key$/, /\.pem$/, /\.p12$/, /\.pfx$/, /^id_rsa/, /^id_ecdsa/, /^credentials\.json$/, /\.keystore$/];

function scanCredentials(files) {
  const hits = [];
  for (const rel of files) {
    const base = path.basename(rel);
    if (CRED_FILE_PATTERNS.some(re => re.test(base))) hits.push(rel);
  }
  return hits;
}

// syntax check .js files with node --check
function syntaxCheck(files) {
  const errors = [];
  const jsFiles = files.filter(f => f.endsWith('.js'));
  for (const rel of jsFiles) {
    const abs = path.join(ROOT, rel);
    const r = spawnSync(process.execPath, ['--check', abs], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    if (r.status !== 0) {
      const msg = (r.stderr || '').trim().split('\n')[0];
      errors.push(`${rel}: ${msg}`);
    }
  }
  return errors;
}

// check if docs-manifest.json exists (Docs Translation Desk installed)
function hasDocsManifest() {
  return hasFile('docs/docs-manifest.json') || hasFile('docs-manifest.json') || hasFile('.docs/docs-manifest.json');
}

// check if truth-source.json exists (Archive installed)
function hasTruthSource() {
  return hasFile('docs/truth-source.json') || hasFile('truth-source.json') || hasFile('.docs/truth-source.json');
}

// check if version-manifest.json exists (version sync installed)
function hasVersionManifest() {
  return hasFile('version-manifest.json') || hasFile('.docs/version-manifest.json');
}

// find the current sprint file (status: in-progress)
function currentSprint() {
  const dir = path.join(ROOT, 'docs', 'sprints');
  if (!fs.existsSync(dir)) return null;
  const nums = fs.readdirSync(dir).map(f => /^(\d+)\.md$/.exec(f)).filter(Boolean).map(m => +m[1]).sort((a, b) => b - a);
  for (const n of nums) {
    const raw = fs.readFileSync(path.join(dir, `${n}.md`), 'utf8');
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
    if (!fm || !/status:\s*in-progress/.test(fm[1])) continue;
    const pending = (raw.match(/^- \[ \]/gm) || []).length;
    const approved = (raw.match(/^- \[x\]/gm) || []).length;
    return { n, pending, approved };
  }
  return null;
}

// last PROGRESS.md entry date
function lastProgressDate() {
  for (const c of ['PROGRESS.md', 'docs/PROGRESS.md']) {
    const p = path.join(ROOT, c);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8').replace(/\r\n?/g, '\n');
    const m = text.match(/^### (\d{4}-\d{2}-\d{2})/m);
    return m ? m[1] : null;
  }
  return null;
}

// ── preflight: commit ──

function preflightCommit() {
  let problems = 0, warnings = 0;
  const files = stagedFiles();

  // 1. git status overview
  const st = git(['status', '--short']);
  if (!st.ok) { console.log(t('preflightGitNone')); problems++; return { problems, warnings }; }
  const dirty = st.out.split('\n').filter(Boolean);
  if (dirty.length === 0) { console.log(t('preflightWorktreeClean')); }
  else { console.log(t('preflightWorktreeDirty', dirty.length)); for (const l of dirty.slice(0, 8)) console.log(`    ${l}`); }

  if (files.length === 0) { console.log(t('preflightNoStaged')); return { problems, warnings }; }

  // 2. debug residue
  console.log(t('preflightDebugHead'));
  const debugHits = scanDebugResidue(files);
  if (debugHits.length) { console.log(t('preflightDebugFound', debugHits.length)); for (const h of debugHits.slice(0, 10)) console.log(`    ${h}`); warnings += debugHits.length; }
  else console.log(t('preflightDebugOk'));

  // 3. credentials
  const credHits = scanCredentials(files);
  if (credHits.length) { console.log(t('preflightCredFound', credHits.length)); for (const h of credHits) console.log(`    ${h}`); problems += credHits.length; }
  else console.log(t('preflightCredOk'));

  // 4. syntax check
  console.log(t('preflightSyntaxHead'));
  const jsFiles = files.filter(f => f.endsWith('.js'));
  if (jsFiles.length === 0) console.log(t('preflightSyntaxSkip'));
  else {
    const syntaxErrors = syntaxCheck(files);
    if (syntaxErrors.length) { console.log(t('preflightSyntaxFail', syntaxErrors.length)); for (const e of syntaxErrors) console.log(`    ${e}`); problems += syntaxErrors.length; }
    else console.log(t('preflightSyntaxOk', jsFiles.length));
  }

  // 5. docs sync (if .md files staged)
  const hasMd = files.some(f => f.endsWith('.md'));
  if (hasMd) {
    console.log(t('preflightDocsHead'));
    if (!hasDocsManifest()) console.log(t('preflightDocsSkip'));
    else {
      const r = runKeeper('docs-i18n.js', ['status']);
      const stale = /needing work|待更新/.test(r.out) && !/0\s+needing work|0\s+待更新/.test(r.out);
      if (stale) { console.log(t('preflightDocsStale')); warnings++; }
      else console.log(t('preflightDocsOk'));
    }
  }

  // 6. truth check
  console.log(t('preflightTruthHead'));
  if (!hasTruthSource()) console.log(t('preflightTruthSkip'));
  else {
    const r = runKeeper('truth.js', ['check']);
    if (r.code !== 0) { console.log(t('preflightTruthFail')); problems++; }
    else console.log(t('preflightTruthOk'));
  }

  return { problems, warnings };
}

// ── preflight: push ──

function preflightPush() {
  // run all commit checks first
  console.log(t('preflightHead', 'push (includes commit checks)'));
  let { problems, warnings } = preflightCommit();

  // 1. test suite
  console.log(t('preflightTestHead'));
  const pkg = readJSON(path.join(ROOT, 'package.json'));
  if (pkg && pkg.scripts && pkg.scripts.test && !/no test specified/.test(pkg.scripts.test)) {
    const r = spawnSync(process.execPath, [path.join(SCRIPTS_DIR, '..', 'tests', 'e2e.js')], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    // fall back to `npm test` if e2e doesn't exist
    let result = r;
    if (r.error || r.status === null) {
      const nr = spawnSync('npm', ['test', '--silent'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
      result = nr;
    }
    if (result.status === 0) console.log(t('preflightTestOk'));
    else { console.log(t('preflightTestFail')); problems++; }
  } else {
    console.log(t('preflightTestSkip'));
  }

  // 2. remote sync (behind/ahead)
  console.log(t('preflightBehindHead'));
  const remote = git(['remote']);
  if (!remote.ok || !remote.out) { console.log(t('preflightNoRemote')); }
  else {
    git(['fetch']);
    const behind = git(['rev-list', '--count', '@{u}..HEAD']);
    const ahead = git(['rev-list', '--count', 'HEAD..@{u}']);
    if (behind.ok && ahead.ok) {
      const aheadN = +behind.out || 0;
      const behindN = +ahead.out || 0;
      if (behindN > 0) { console.log(t('preflightBehind', behindN)); warnings++; }
      else if (aheadN > 0) console.log(t('preflightAhead', aheadN));
      else console.log(t('preflightUpToDate'));
    } else {
      console.log(t('preflightNoRemote'));
    }
  }

  // 3. branch confirm
  console.log(t('preflightBranchHead'));
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branch.ok) {
    if (['main', 'master'].includes(branch.out)) console.log(t('preflightBranchWarn', branch.out));
    else console.log(t('preflightBranchOk', branch.out));
  }

  // 4. PROGRESS.md recency
  console.log(t('preflightProgressHead'));
  const lastDate = lastProgressDate();
  if (!lastDate) { console.log(t('preflightProgressSkip')); }
  else {
    const days = Math.floor((Date.now() - new Date(lastDate + 'T00:00:00Z').getTime()) / 86400000);
    if (days > 3) { console.log(t('preflightProgressStale', days)); warnings++; }
    else console.log(t('preflightProgressOk'));
  }

  // 5. keeper sync
  console.log(t('preflightSyncHead'));
  const keeper = path.join(SCRIPTS_DIR, '..', 'keeper.js');
  if (!fs.existsSync(keeper)) { console.log(t('preflightSyncSkip')); }
  else {
    const r = spawnSync(process.execPath, [keeper, 'sync', `--root=${ROOT}`], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    if (r.status === 0) console.log(t('preflightSyncOk'));
    else { console.log(t('preflightSyncFail')); problems++; }
  }

  return { problems, warnings };
}

// ── preflight: build ──

function preflightBuild() {
  let problems = 0, warnings = 0;

  // 1. version consistency
  console.log(t('preflightVersionHead'));
  if (!hasVersionManifest()) { console.log(t('preflightVersionSkip')); }
  else {
    const r = runKeeper('version-sync.js', ['check']);
    if (r.code !== 0) { console.log(t('preflightVersionFail')); problems++; }
    else {
      const m = r.out.match(/consistent everywhere:?\s*(\S+)/i);
      console.log(t('preflightVersionOk', m ? m[1] : '✓'));
    }
  }

  // 2. translations
  console.log(t('preflightDocsHead'));
  if (!hasDocsManifest()) { console.log(t('preflightDocsSkip')); }
  else {
    const r = runKeeper('docs-i18n.js', ['status']);
    const stale = /needing work|待更新/.test(r.out) && !/0\s+needing work|0\s+待更新/.test(r.out);
    if (stale) { console.log(t('preflightDocsStale')); problems++; }
    else console.log(t('preflightDocsOk'));
  }

  // 3. sprint acceptance
  console.log(t('preflightSprintHead'));
  const sp = currentSprint();
  if (!sp) { console.log(t('preflightSprintSkip')); }
  else if (sp.pending > 0) { console.log(t('preflightSprintPending', sp.n, sp.pending)); warnings++; }
  else console.log(t('preflightSprintOk', sp.n));

  // 4. clean worktree
  console.log(t('preflightCleanHead'));
  const st = git(['status', '--short']);
  if (!st.ok) { console.log(t('preflightGitNone')); problems++; }
  else {
    const dirty = st.out.split('\n').filter(Boolean);
    if (dirty.length > 0) { console.log(t('preflightCleanFail', dirty.length)); problems++; }
    else console.log(t('preflightCleanOk'));
  }

  // 5. release notes
  console.log(t('preflightNotesHead'));
  const notesCandidates = ['CHANGELOG.md', 'docs/CHANGELOG.md', 'docs/releases/', 'RELEASE_NOTES.md'];
  const found = notesCandidates.find(c => hasFile(c));
  if (!found) { console.log(t('preflightNotesMissing')); warnings++; }
  else console.log(t('preflightNotesOk', found));

  // 6. keeper stale
  console.log(t('preflightStaleHead'));
  const keeper = path.join(SCRIPTS_DIR, '..', 'keeper.js');
  if (!fs.existsSync(keeper)) { console.log(t('preflightStaleSkip')); }
  else {
    const r = spawnSync(process.execPath, [keeper, 'stale', `--root=${ROOT}`], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
    if (r.status === 0) console.log(t('preflightStaleOk'));
    else { console.log(t('preflightStaleFail')); problems++; }
  }

  return { problems, warnings };
}

function cmdPreflight(args) {
  const stage = args[0];
  if (!['commit', 'push', 'build'].includes(stage)) fail(t('preflightUsage'));
  console.log(t('preflightHead', stage));

  let result;
  if (stage === 'commit') result = preflightCommit();
  else if (stage === 'push') result = preflightPush();
  else result = preflightBuild();

  if (result.problems === 0 && result.warnings === 0) {
    console.log(t('preflightAllGreen', stage));
    process.exit(0);
  } else {
    console.log(t('preflightSummary', stage, result.problems, result.warnings));
    process.exit(result.problems === 0 ? 0 : 1);
  }
}

// ── github subs ──

function cmdGithub(args) {
  const sub = args[0];
  if (!sub) fail(t('ghUnknownSub', '(none)'));
  if (sub === 'release-notes') return ghReleaseNotes(args.slice(1));
  if (sub === 'workflow-template') return ghWorkflowTemplate(args.slice(1));
  if (sub === 'guide') return ghGuide();
  fail(t('ghUnknownSub', sub));
}

function ghReleaseNotes(args) {
  const outFile = flag('out', '');
  console.log(t('ghNotesHead'));

  // pull from PROGRESS.md (latest section) + current sprint items
  const lines = [];
  const prof = loadProfile();
  const version = (prof && prof.versioning) ? '' : ''; // version comes from `keeper ver show`

  // extract latest PROGRESS.md entries
  for (const c of ['PROGRESS.md', 'docs/PROGRESS.md']) {
    const p = path.join(ROOT, c);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8').replace(/\r\n?/g, '\n');
    const sections = text.split(/^### /m).filter(s => /^\d{4}-\d{2}-\d{2}/.test(s));
    if (sections.length) {
      const recent = sections.slice(0, 2);
      for (const sec of recent) {
        const dateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(sec);
        const date = dateMatch ? dateMatch[1] : '';
        const bullets = sec.split('\n').slice(1).filter(l => /^-\s+/.test(l)).map(l => l.trim().replace(/^-\s+/, ''));
        if (bullets.length) {
          lines.push(`### ${date}`);
          for (const b of bullets.slice(0, 5)) lines.push(`- ${b}`);
          lines.push('');
        }
      }
    }
    break;
  }

  // extract current sprint accepted items
  const sp = currentSprint();
  if (sp) {
    const spPath = path.join(ROOT, 'docs', 'sprints', `${sp.n}.md`);
    if (fs.existsSync(spPath)) {
      const text = fs.readFileSync(spPath, 'utf8').replace(/\r\n?/g, '\n');
      const accepted = text.split('\n').filter(l => /^- \[x\]/.test(l)).map(l => l.replace(/^\- \[x\]\s*/, '').trim());
      if (accepted.length) {
        lines.push('### Accepted this sprint');
        for (const a of accepted.slice(0, 10)) lines.push(`- ${a}`);
        lines.push('');
      }
    }
  }

  if (lines.length === 0) { console.log(t('ghNotesNoData')); return; }

  const content = `# Release Notes\n\n${lines.join('\n')}\n<!-- Generated by \`keeper release github release-notes\` — edit freely -->\n`;

  if (outFile) {
    const abs = path.resolve(ROOT, outFile);
    fs.writeFileSync(abs, content);
    console.log(t('ghNotesWritten', outFile));
  } else {
    console.log(content);
    console.log(t('ghNotesStdout'));
  }
}

const WORKFLOW_TEMPLATE = `# GitHub Actions workflow: build + release on tag push
# Generated by indie-keeper \`keeper release github workflow-template\`
# Adapt to your stack (this is a Node.js example — swap build steps for Unity/Godot/etc.)
name: Build & Release

on:
  push:
    tags: ['v*']  # triggers on vX.Y.Z tags

permissions:
  contents: write  # needed by softprops/action-gh-release

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci  # or: your build command
      - run: npm test --if-present
      # package the build artifact
      - run: tar -czf build-\${{ github.ref_name }}.tar.gz dist/  # adjust path
      - uses: softprops/action-gh-release@v2
        with:
          files: build-\${{ github.ref_name }}.tar.gz
          generate_release_notes: true  # auto-generate from commits/PRs
`;

function ghWorkflowTemplate(args) {
  const outFile = flag('out', '.github/workflows/release.yml');
  const force = A.bools.has('force');
  console.log(t('ghWfHead'));

  const abs = path.resolve(ROOT, outFile);
  if (fs.existsSync(abs) && !force) { console.log(t('ghWfExists', outFile)); return; }

  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, WORKFLOW_TEMPLATE);
  console.log(t('ghWfWritten', outFile));
}

function ghGuide() {
  console.log(t('ghGuideHead'));
  console.log(`  ${lang === 'zh' ? '前提：装好 gh CLI 并登录（gh auth login）' : 'Prerequisite: install gh CLI and run \`gh auth login\`'}\n`);
  console.log('  # ' + (lang === 'zh' ? '查看当前版本的 release' : 'list releases') + ':');
  console.log('  gh release list\n');
  console.log('  # ' + (lang === 'zh' ? '创建 release（从 tag 自动生成 notes）' : 'create release (auto-generate notes from commits)') + ':');
  console.log('  gh release create vX.Y.Z --generate-notes --title "vX.Y.Z"\n');
  console.log('  # ' + (lang === 'zh' ? '上传构建产物到已有 release' : 'upload build artifacts to an existing release') + ':');
  console.log('  gh release upload vX.Y.Z ./build/*.zip\n');
  console.log('  # ' + (lang === 'zh' ? '查看 workflow 运行状态' : 'check workflow run status') + ':');
  console.log('  gh run list --limit 5');
  console.log('  gh run watch  # ' + (lang === 'zh' ? '实时跟踪最新一次运行' : 'watch the latest run') + '\n');
  console.log('  # ' + (lang === 'zh' ? '手动触发 workflow（需 workflow 配置 workflow_dispatch）' : 'manually trigger a workflow (requires workflow_dispatch trigger)') + ':');
  console.log('  gh workflow run release.yml\n');
  console.log('  # ' + (lang === 'zh' ? '打 tag（触发 release workflow）' : 'create a tag (triggers the release workflow)') + ':');
  console.log('  git tag vX.Y.Z');
  console.log('  git push origin vX.Y.Z\n');
  console.log('  ' + (lang === 'zh' ? '提示：preflight build 全绿后再打 tag。release notes 可以用' : 'Tip: run `keeper release preflight build` before tagging. Draft notes with') + ' `keeper release github release-notes` ' + (lang === 'zh' ? '起草' : 'first') + '.\n');
}

// ── itch subs ──

function cmdItch(args) {
  const sub = args[0];
  if (!sub) fail(t('itchUnknownSub', '(none)'));
  if (sub === 'init') return itchInit(args.slice(1));
  if (sub === 'guide') return itchGuide();
  fail(t('itchUnknownSub', sub));
}

const ITCH_TOML_TEMPLATE = `# itch.io project config — generated by indie-keeper
# Doc: https://itch.io/docs/butler/pushing.html#the-itch-toml-manifest
# Edit this to match your game, then \`butler push\` will read it.

[[actions]]
name = "play"
path = "Game.exe"  # ${'the entry point — swap for your build output (Game.app / Game.x86_64 / index.html)'}

# ${'platform + sandbox are inferred from the file above; override if butler guesses wrong'}
# platform = "windows"  # windows / linux / osx / web
# sandbox = true  # ${'set true for HTML5 web games'}

[prj]
title = "${'Your Game Title'}"
cover = "cover.png"  # ${'512x512 cover image, optional but recommended'}
screenshots = ["screenshots/s1.png"]  # ${'3-30 screenshots, at least 1920x1080'}
`;

function itchInit(args) {
  const outFile = flag('out', 'itch.toml');
  const force = A.bools.has('force');
  console.log(t('itchInitHead'));

  const abs = path.resolve(ROOT, outFile);
  if (fs.existsSync(abs) && !force) { console.log(t('itchInitExists', outFile)); return; }

  fs.writeFileSync(abs, ITCH_TOML_TEMPLATE);
  console.log(t('itchInitWritten', outFile));
}

function itchGuide() {
  console.log(t('itchGuideHead'));
  console.log('  ' + (lang === 'zh' ? 'itch.io 是独立游戏最常用的首发平台：零门槛、零上架费、分成自选（可设为 0）。' : 'itch.io is the most common indie first-release platform: zero barrier, no listing fee, revenue share is optional (can be 0).') + '\n');
  console.log('  ' + (lang === 'zh' ? '== 首次配置 ==' : '== First-time setup ==') + '\n');
  console.log('  # ' + (lang === 'zh' ? '1. 注册 itch.io 账号，创建一个项目（itch.io dashboard → Create new project）' : '1. Register an itch.io account, create a project (dashboard → Create new project)'));
  console.log('  # ' + (lang === 'zh' ? '2. 安装 butler（itch 的命令行上传工具）' : "2. Install butler (itch's CLI upload tool)"));
  console.log('  #    ' + (lang === 'zh' ? 'Windows: 从 https://itch.io/docs/butler/ 下载，或 scoop install butler' : 'Windows: download from https://itch.io/docs/butler/ or \`scoop install butler\`'));
  console.log('  #    ' + (lang === 'zh' ? 'macOS: brew install butler' : 'macOS: \`brew install butler\`')) + '\n';
  console.log('  # ' + (lang === 'zh' ? '3. 登录 butler' : '3. Login') + ':');
  console.log('  butler login\n');
  console.log('  ' + (lang === 'zh' ? '== 上传构建 ==' : '== Upload a build ==') + '\n');
  console.log('  # ' + (lang === 'zh' ? '先生成 itch.toml 配置（如果还没有）' : 'Generate itch.toml first (if missing)') + ':');
  console.log('  keeper release itch init\n');
  console.log('  # ' + (lang === 'zh' ? '打包游戏到 build/ 目录' : 'Build your game into build/') + '\n');
  console.log('  # ' + (lang === 'zh' ? '推送 build/ 到 itch.io（user/your-game 换成你的项目页路径）' : 'Push build/ to itch.io (replace user/your-game with your project page)') + ':');
  console.log('  butler push build/ user/your-game:channel\n');
  console.log('  #    ' + (lang === 'zh' ? 'channel 是版本通道：windows / mac / linux / web' : 'channel = version channel: windows / mac / linux / web'));
  console.log('  #    ' + (lang === 'zh' ? '例：butler push build/ mystudio/mygame:windows' : 'e.g. butler push build/ mystudio/mygame:windows') + '\n');
  console.log('  # ' + (lang === 'zh' ? '查看上传历史' : 'View upload history') + ':');
  console.log('  butler status user/your-game\n');
  console.log('  ' + (lang === 'zh' ? '== 在 CI 里自动上传 ==（参考 GitHub workflow 模板）' : '== Auto-upload in CI == (see the GitHub workflow template)') + '\n');
  console.log('  # ' + (lang === 'zh' ? '在 GitHub Actions 里设 BUTLER_API_KEY secret，然后：' : 'Set BUTLER_API_KEY secret in GitHub Actions, then:') + '');
  console.log('  butler push build/ user/your-game:windows --userversion ${{ github.ref_name }}\n');
  console.log('  ' + (lang === 'zh' ? '提示：preflight build 全绿后再上传。版本号用 keeper ver show 查。' : 'Tip: run `keeper release preflight build` before uploading. Check version with `keeper ver show`.') + '\n');
}

// ── steam subs ──

function cmdSteam(args) {
  const sub = args[0];
  if (!sub) fail(t('steamUnknownSub', '(none)'));
  if (sub === 'init') return steamInit(args.slice(1));
  if (sub === 'guide') return steamGuide();
  fail(t('steamUnknownSub', sub));
}

const STEAM_VDF_TEMPLATE = `# steam build upload script — generated by indie-keeper
# Doc: https://partner.steamgames.com/doc/sdk/upload
# Used by: steamcmd +runscript steam_upload.vdf
# Edit the values below before first upload.

"build"
{
  "appid"     "1234560"  # your Steam App ID (from Steamworks partner dashboard)
  "desc"      "vX.Y.Z release build"  # description shown in Steamworks build list
  "buildoutput" "build/steam/"  # local path where the build is staged
  "contentroot" "build/"  # root of the files to upload

  "depots"
  {
    "1234561"  # Depot ID for Windows (from Steamworks: your app → Depots)
    {
      "FileMapping"
      {
        "LocalPath" "*"  # upload everything under contentroot
        "DepotPath" "."
        "recursive" "1"
      }
    }
    # repeat for mac/linux depots if cross-platform:
    # "1234562" { "FileMapping" { "LocalPath" "mac/*" "DepotPath" "." "recursive" "1" } }
  }
}
`;

function steamInit(args) {
  const outFile = flag('out', 'steam_upload.vdf');
  const force = A.bools.has('force');
  console.log(t('steamInitHead'));

  const abs = path.resolve(ROOT, outFile);
  if (fs.existsSync(abs) && !force) { console.log(t('steamInitExists', outFile)); return; }

  fs.writeFileSync(abs, STEAM_VDF_TEMPLATE);
  console.log(t('steamInitWritten', outFile));
}

function steamGuide() {
  console.log(t('steamGuideHead'));
  console.log('  ' + (lang === 'zh' ? 'Steam 有一次性入场费（$100），需要先在 Steamworks 注册 App ID。比 itch 复杂，但覆盖面更广。' : 'Steam has a one-time $100 entry fee; you need to register an App ID on Steamworks first. More setup than itch, but wider reach.') + '\n');
  console.log('  ' + (lang === 'zh' ? '== 首次配置 ==' : '== First-time setup ==') + '\n');
  console.log('  # ' + (lang === 'zh' ? '1. 在 https://partner.steamgames.com 注册 Steamworks 合作伙伴账号，交 $100 入场费，创建 App' : '1. Register a Steamworks partner account at https://partner.steamgames.com, pay $100 entry fee, create an App'));
  console.log('  #    ' + (lang === 'zh' ? '拿到 App ID（数字），并在 App → Depots 里为每个平台创建 Depot（每个 Depot 也有数字 ID）' : 'Get your App ID (numeric), and create a Depot per platform under App → Depots (each Depot also has a numeric ID)') + '\n');
  console.log('  # ' + (lang === 'zh' ? '2. 安装 steamcmd（Steam 命令行上传工具）' : '2. Install steamcmd (Steam command-line upload tool)'));
  console.log('  #    ' + (lang === 'zh' ? 'Windows: 从 https://partner.steamgames.com/doc/sdk 下载 Steamworks SDK，里面含 steamcmd.exe' : 'Windows: download Steamworks SDK from https://partner.steamgames.com/doc/sdk, contains steamcmd.exe'));
  console.log('  #    ' + (lang === 'zh' ? 'macOS/Linux: brew install --cask steamcmd 或用 SDK 里的 steamcmd.sh' : 'macOS/Linux: \`brew install --cask steamcmd\` or use steamcmd.sh from the SDK') + '\n');
  console.log('  # ' + (lang === 'zh' ? '3. 在 Steamworks → App → Settings → Steamworks Settings 设一个 build bot 账号（专用上传账号）' : '3. In Steamworks → App → Settings, create a build bot account (dedicated upload account)'));
  console.log('  #    ' + (lang === 'zh' ? '拿到用户名 + 密码，用于 steamcmd 登录' : 'Get username + password for steamcmd login') + '\n');
  console.log('  # ' + (lang === 'zh' ? '4. 生成 steam_upload.vdf（如果还没有）' : '4. Generate steam_upload.vdf (if missing)') + ':');
  console.log('  keeper release steam init');
  console.log('  #    ' + (lang === 'zh' ? '打开生成的 vdf，把 appid 和 depot ID 改成你自己的' : 'Open the vdf, replace appid and depot IDs with your own') + '\n');
  console.log('  ' + (lang === 'zh' ? '== 上传构建 ==' : '== Upload a build ==') + '\n');
  console.log('  # ' + (lang === 'zh' ? '打包游戏到 build/ 目录' : 'Build your game into build/') + '\n');
  console.log('  # ' + (lang === 'zh' ? '登录 steamcmd 并上传（runscript 模式）' : 'Login to steamcmd and upload (runscript mode)') + ':');
  console.log('  steamcmd +login build_bot_username +runscript steam_upload.vdf +quit\n');
  console.log('  # ' + (lang === 'zh' ? '上传后在 Steamworks → App → Builds 设"default branch"，然后在 Store Page Editor 里发版' : 'After upload: set the default branch in Steamworks → App → Builds, then publish via the Store Page Editor') + '\n');
  console.log('  ' + (lang === 'zh' ? '== 在 CI 里自动上传 ==' : '== Auto-upload in CI ==') + '\n');
  console.log('  # ' + (lang === 'zh' ? '在 GitHub Actions 里设 STEAM_USERNAME / STEAM_PASSWORD secrets' : 'Set STEAM_USERNAME / STEAM_PASSWORD secrets in GitHub Actions'));
  console.log('  # ' + (lang === 'zh' ? '用GameDriverDeploy 插件（russehl/steam-deploy）或直接调 steamcmd' : 'Use the GameDrivers/steam-deploy action or call steamcmd directly') + '\n');
  console.log('  # ' + (lang === 'zh' ? '首次会要 Steam Guard 验证码（发邮箱），后续用 set_steam_guard_code 跳过' : 'First login needs Steam Guard code (emailed); later logins use set_steam_guard_code to skip') + '\n');
  console.log('  ' + (lang === 'zh' ? '提示：preflight build 全绿后再上传。Steam 审核可能要 1-5 天，提前发版。' : 'Tip: run `keeper release preflight build` before uploading. Steam review can take 1-5 days — submit early.') + '\n');
}

// ── changelog subs ──

const CHANGELOG_TEMPLATE = `# Changelog

All notable changes to this project are documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [SemVer](https://semver.org/).

## [Unreleased]

<!-- Add new entries here as you ship. Use \`keeper release changelog add "<text>"\` to append. -->
<!-- Categories: Added / Changed / Deprecated / Removed / Fixed / Security -->

## [0.1.0] - 1970-01-01

### Added
- Project onboarded into indie-keeper.
`;

function changelogPath() {
  for (const c of ['CHANGELOG.md', 'docs/CHANGELOG.md']) {
    const p = path.join(ROOT, c);
    if (fs.existsSync(p)) return p;
  }
  // default location for new file
  return path.join(ROOT, 'CHANGELOG.md');
}

function cmdChangelog(args) {
  const sub = args[0];
  if (!sub) fail(t('clUnknownSub', '(none)'));
  if (sub === 'init') return clInit(args.slice(1));
  if (sub === 'add') return clAdd(args.slice(1));
  if (sub === 'cut') return clCut(args.slice(1));
  if (sub === 'show') return clShow(args.slice(1));
  fail(t('clUnknownSub', sub));
}

function clInit(args) {
  const force = A.bools.has('force');
  const p = changelogPath();
  if (fs.existsSync(p) && !force) { console.error(t('clInitExists')); process.exit(1); }
  fs.writeFileSync(p, CHANGELOG_TEMPLATE);
  console.log(t('clInitDone'));
}

function clAdd(args) {
  const text = args.filter(a => !a.startsWith('--')).join(' ').trim();
  if (!text) { console.error(t('clNoText')); process.exit(1); }
  const p = changelogPath();
  if (!fs.existsSync(p)) { console.error(t('clNoFile')); process.exit(1); }
  let content = fs.readFileSync(p, 'utf8').replace(/\r\n?/g, '\n');

  // Find the "## [Unreleased]" heading and insert a bullet right under it.
  // If there's a "### <Category>" right under Unreleased, insert under the first such category.
  const unreleasedRe = /^## \[Unreleased\]\s*$/m;
  const m = unreleasedRe.exec(content);
  if (!m) { console.error(t('clAddedNoUnreleased')); process.exit(1); }

  const insertAt = m.index + m[0].length;
  // peek the next non-blank line — if it's a "### Category", insert after that heading
  const rest = content.slice(insertAt);
  const catMatch = /^\s*\n(### \w+)\s*\n/.exec(rest);
  let insertion;
  if (catMatch) {
    insertion = content.slice(0, insertAt) + '\n' + catMatch[1] + '\n- ' + text + content.slice(insertAt + catMatch[0].length);
  } else {
    // no category heading — insert a plain bullet under Unreleased
    insertion = content.slice(0, insertAt) + '\n- ' + text + content.slice(insertAt);
  }
  fs.writeFileSync(p, insertion);
  console.log(t('clAdded', text));
}

function clCut(args) {
  const version = args.find(a => !a.startsWith('--'));
  if (!version) { console.error(t('clCutNoVersion')); process.exit(1); }
  const p = changelogPath();
  if (!fs.existsSync(p)) { console.error(t('clNoFile')); process.exit(1); }
  let content = fs.readFileSync(p, 'utf8').replace(/\r\n?/g, '\n');

  const unreleasedRe = /^## \[Unreleased\]\s*$/m;
  const m = unreleasedRe.exec(content);
  if (!m) { console.error(t('clCutNoUnreleased')); process.exit(1); }

  // Check whether Unreleased has any content (bullets) between it and the next "## " heading
  const afterUnreleased = content.slice(m.index + m[0].length);
  const nextH2 = afterUnreleased.indexOf('\n## ');
  const unreleasedBody = nextH2 >= 0 ? afterUnreleased.slice(0, nextH2) : afterUnreleased;
  const hasBullets = /^\s*-\s/m.test(unreleasedBody);

  const today = new Date().toISOString().slice(0, 10);
  const newHeading = `## [${version}] - ${today}`;
  // Replace "## [Unreleased]" with the versioned heading, and prepend a fresh Unreleased section
  const freshUnreleased = '## [Unreleased]\n\n';
  const newContent = content.slice(0, m.index) + freshUnreleased + newHeading + content.slice(m.index + m[0].length);
  fs.writeFileSync(p, newContent);
  console.log(t('clCutDone', version, today));
  if (!hasBullets) console.log(t('clCutEmpty'));
}

function clShow(args) {
  const p = changelogPath();
  if (!fs.existsSync(p)) { console.error(t('clNoFile')); process.exit(1); }
  const content = fs.readFileSync(p, 'utf8').replace(/\r\n?/g, '\n');
  console.log(t('clShowHead'));
  // print the first ~60 lines so it fits on one screen
  const lines = content.split('\n');
  for (const l of lines.slice(0, 60)) console.log('  ' + l);
  if (lines.length > 60) console.log(`  … +${lines.length - 60} more lines`);
  console.log(t('clGenerateHint'));
}

// ── main ──

function main() {
  const cmd = A.pos[0];
  const rest = A.pos.slice(1);
  if (!cmd || cmd === 'help') { console.log(t('help')); return; }
  const table = {
    preflight: cmdPreflight,
    github: cmdGithub,
    itch: cmdItch,
    steam: cmdSteam,
    changelog: cmdChangelog,
  };
  if (!table[cmd]) fail(t('unknownCmd', cmd));
  table[cmd](rest);
}

main();
