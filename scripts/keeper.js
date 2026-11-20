#!/usr/bin/env node
// keeper.js · unified entry for indie-keeper (zero deps)
// ─────────────────────────────────────────────────────────────
// One door, seven rooms, plus three built-in daily commands:
//   keeper hello    30-second handover briefing (who am I, what's pending)
//   keeper status   workspace health at a glance (git / feedback / sprint)
//   keeper where    topic → authoritative doc (forwards to the Archive)
// Room commands are pure dispatch — every room script runs standalone;
// this file just saves you from memorizing seven file names.
//
// Suggested setup: copy the whole scripts/ folder into the target
// project (e.g. tools/keeper/), then register in package.json:
//   "keeper": "node tools/keeper/keeper.js"
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { detectLang, makeT } = require('./lang');

const projectFiles = require('./project-files');
const cli = parseEntryArgs(process.argv.slice(2));
const ROOT = cli.flags.root ? path.resolve(cli.flags.root) : projectRoot();
const lang = detectLang(process.argv.slice(2), ROOT);

// ── Room registry: door plate (with aliases) → script file ──
const ROOMS = [
  { cmd: 'truth', aliases: ['archive'], script: 'truth.js',
    name: { en: 'Archive', zh: '档案室' },
    desc: { en: 'source-of-truth registry · safe section edits · checkup', zh: '真相源登记 · 章节安全编辑 · 体检' } },
  { cmd: 'fb', aliases: ['feedback'], script: 'feedback.js',
    name: { en: 'Feedback Box', zh: '意见箱' },
    desc: { en: 'collect feedback · lifecycle · pin to ROADMAP', zh: '反馈收集 · 生命周期 · 挂 ROADMAP' } },
  { cmd: 'site', aliases: [], script: 'docs-site.js',
    name: { en: 'WIKI', zh: 'WIKI' },
    desc: { en: 'local browsing (wiki links/backlinks) · single-file pack', zh: '本地浏览（双链/反链）· 单文件打包' } },
  { cmd: 'docs', aliases: ['docs-i18n'], script: 'docs-i18n.js',
    name: { en: 'Docs Translation Desk', zh: '文档翻译部' },
    desc: { en: 'document i18n: templates · stamps · status board', zh: '文档多语言：抽模板 · 记指纹 · 看状态表' } },
  { cmd: 'game', aliases: ['game-i18n'], script: 'game-i18n.js',
    name: { en: 'Game Text Desk', zh: '游戏文案部' },
    desc: { en: 'in-game text: hardcode scan · drift · glossary', zh: '游戏内文案：硬编码扫描 · 漂移 · 术语表' } },
  { cmd: 'ver', aliases: ['version'], script: 'version-sync.js',
    name: { en: 'Shipping Dock · Version', zh: '发货口·版本' },
    desc: { en: 'sync version number across files', zh: '版本号多文件同步' } },
  { cmd: 'sprint', aliases: [], script: 'sprint.js',
    name: { en: 'Shipping Dock · Acceptance', zh: '发货口·验收' },
    desc: { en: 'sprint checklist · anti-hand-waving lint', zh: 'Sprint 验收清单 · lint 防糊弄' } },
  { cmd: 'release', aliases: [], script: 'release.js',
    name: { en: 'Shipping Dock · Release', zh: '发货口·发布' },
    desc: { en: 'preflight (commit/push/build) · changelog · GitHub/itch/steam guides', zh: '发布前体检（commit/push/build）· changelog · GitHub/itch/steam 指引' } },
  { cmd: 'branch', aliases: [], script: 'branch.js',
    name: { en: 'Shipping Dock · Branches', zh: '发货口·分支' },
    desc: { en: 'branch naming policy · protected-branch guard', zh: '分支命名规范 · 保护分支守卫' } },
  { cmd: 'schedule', aliases: ['gantt'], script: 'schedule.js',
    name: { en: 'Schedule', zh: '调度室' },
    desc: { en: 'version dates + effort estimates · Gantt', zh: '版本日期 + 工期预估 · 甘特图' } },
];

const MSG = {
  optionValue: { en: 'Missing value for {0}', zh: '{0} 缺少参数值' },
  progressUsage: { en: 'usage: keeper progress add "<text>"', zh: '用法：keeper progress add "<内容>"' },
  planUsage: { en: 'usage: keeper plan done <P-X>', zh: '用法：keeper plan done <任务编号>' },
  refreshUsage: { en: 'usage: keeper start-here refresh [--dry-run]', zh: '用法：keeper start-here refresh [--dry-run]' },
  usageHead: {
    en: '  usage: keeper <command> [args…]\n\n  ── on shift-start (orient yourself) ──',
    zh: '  用法：keeper <命令> [参数…]\n\n  ── 接班时（先看清状态） ──',
  },
  helloDesc: { en: 'new session? run this first — 30s handover briefing', zh: '新会话？先跑这个——30 秒接班速查' },
  statusDesc: { en: 'stuck or wrapping up? glance at workspace health', zh: '卡住或收工？看一眼工作区健康度' },
  editingHead: { en: '\n  ── when editing (don\'t break things) ──', zh: '\n  ── 改东西时（别弄坏文档） ──' },
  whereDesc: { en: '"which file is this setting in?" — check before editing', zh: '"这个设定写在哪个文件？"——改之前先查' },
  truthDesc: { en: 'edit docs safely: section replace only, never full rewrite', zh: '安全编辑文档：只替换章节，绝不整文件重写' },
  refsDesc: { en: 'before changing a fact, scan who else mentions it', zh: '改某事实前，扫一遍还有哪些文档提到它' },
  progressDesc: { en: 'log what just happened → PROGRESS.md', zh: '记一笔刚才做了啥 → PROGRESS.md' },
  planDesc: { en: 'mark a PLAN.md task done', zh: '把 PLAN.md 任务标完成' },
  syncHead2: { en: '\n  ── on session-end (refresh + check) ──', zh: '\n  ── 收尾时（刷新 + 检查） ──' },
  shDesc: { en: 'refresh START-HERE.md sections from PROGRESS + truth-source', zh: '从 PROGRESS + 真相源刷新 START-HERE.md 的派生段' },
    shDisabled: { en: 'START-HERE is disabled in keeper-profile.json (startHere.enabled: false) — nothing to refresh. Flip it back on to use this command.', zh: 'START-HERE 已在 keeper-profile.json 里关闭（startHere.enabled: false）——没有可刷新的内容。要用请先把开关打开。' },
  syncDesc: { en: 'one command to finish: refresh derived content + run all checks', zh: '一键收尾：刷新派生内容 + 跑所有检查' },
  staleDesc: { en: '"what did I forget to update?" — scan for staleness', zh: '"我漏更新了啥？"——扫一遍过期的地方' },
  roomsHead: { en: '\n  ── rooms (one file per concern) ──\n  room      aliases       what it does', zh: '\n  ── 房间（一事一文件） ──\n  房间       别名          管什么' },
  examples: {
    en: '\n  room-level help: keeper <room> help (e.g. keeper truth help)\n  full manual: references/cli.md\n',
    zh: '\n  某个房间怎么用：keeper <房间> help（如 keeper truth help）\n  完整手册：references/cli.md\n',
  },
  noRoom: {
    en: '✗ No command called "{0}". Available: hello / status / where / truth / refs / progress / plan / start-here / sync / stale / {1} (keeper help)',
    zh: '✗ 没有"{0}"这个命令。有这些：hello / status / where / truth / refs / progress / plan / start-here / sync / stale / {1}（keeper help 看全表）',
  },
  // hello
  helloVersion: { en: 'version', zh: '版本' },
  helloGitClean: { en: 'working tree clean', zh: '工作区干净' },
  helloGitDirty: { en: '{0} uncommitted change(s)', zh: '{0} 个未提交改动' },
  helloGitNone: { en: 'not a git repo yet (git init when ready)', zh: '还不是 git 仓库（想留历史就 git init）' },
  helloFbHead: { en: 'open feedback ({0})', zh: '待处理反馈（{0}）' },
  helloFbNone: { en: 'no open feedback', zh: '没有待处理的反馈' },
  helloFbMore: { en: '  … {0} more · keeper fb list', zh: '  … 还有 {0} 条 · keeper fb list' },
  helloSprint: { en: 'sprint {0} · {1} · {2}/{3} accepted', zh: 'sprint {0} · {1} · 已验收 {2}/{3}' },
  helloSprintNone: { en: 'no active sprint (keeper sprint new "<title>")', zh: '没有进行中的 sprint（keeper sprint new "<标题>" 起一个）' },
  helloTruth: { en: '{0} topic(s) registered · keeper where <topic> to look up', zh: '已登记 {0} 个主题 · keeper where <主题> 直达' },
  helloTruthNone: { en: 'no truth-source registry yet (keeper truth init)', zh: '还没有真相源登记表（keeper truth init 生成）' },
  helloHandoff: { en: '📬 handover note from the last shift: {0} — read it before touching anything', zh: '📬 上一班留了交接备忘：{0} —— 动手前先读它' },
  helloAgents: { en: '🤖 dev rules: {0} — read it before touching anything', zh: '🤖 开发守则：{0} —— 动手前先读它' },
  helloAgentsMissing: { en: '🤖 no AGENTS.md found — create one during triage (see SKILL.md)', zh: '🤖 没有 AGENTS.md —— 问诊时建一份（见 SKILL.md）' },
  helloStartHere: { en: '📌 START-HERE.md — stale? Check before ending the shift', zh: '📌 START-HERE.md —— 过期了吗？收工前看一眼' },
  helloStartHereMissing: { en: '📌 no START-HERE.md — create one (see SKILL.md "Human entry page")', zh: '📌 没有 START-HERE.md —— 建一份（见 SKILL.md"给人看的入口页"）' },
  helloCmds: {
    en: '\n  common commands:\n    keeper where <topic>      find the authoritative doc\n    keeper fb add "<text>"    drop a feedback note\n    keeper site serve         browse docs locally\n    keeper sprint show        current sprint details\n    keeper help               everything else\n',
    zh: '\n  常用命令：\n    keeper where <主题>       这个设定写在哪个文件？\n    keeper fb add "<内容>"    随手记一条反馈\n    keeper site serve         本地逛 WIKI\n    keeper sprint show        当前 sprint 详情\n    keeper help               看全部命令\n',
  },
  // hello — docs to maintain section
  docCommits: { en: ' · {0} commits since', zh: ' · 此后 {0} 次提交' },
  docCurrent: { en: ' · up to date', zh: ' · 已是最新' },
  docProgress: { en: 'last {0}{1} · keeper progress add "<text>"', zh: '更新于 {0}{1} · keeper progress add "<内容>"' },
  docPending: { en: '{0} pending', zh: '{0} 项待办' },
  docAllDone: { en: 'no pending numbered plan rows', zh: '编号计划行无待办' },
  docStartHere: { en: 'review the progress summary', zh: '检查进展总结' },
  docTopics: { en: '{0} topics registered', zh: '已登记 {0} 个主题' },
  helloDocs: { en: 'docs to maintain', zh: '要维护的文档' },
  // progress
  progressNoFile: { en: '✗ no PROGRESS.md in the root or docs/', zh: '✗ 根目录与 docs/ 中均无 PROGRESS.md' },
  progressNoText: { en: '✗ no text provided · usage: keeper progress add "<text>"', zh: '✗ 没写内容 · 用法：keeper progress add "<内容>"' },
  progressAdded: { en: '✓ PROGRESS.md: appended under ### {0}', zh: '✓ PROGRESS.md：在 ### {0} 下追加一条' },
  progressNewDay: { en: '✓ PROGRESS.md: new entry ### {0} (no section for today yet)', zh: '✓ PROGRESS.md：新建 ### {0} 段（今天还没记过）' },
  // plan
  planNoFile: { en: '✗ no PLAN.md in the root or docs/', zh: '✗ 根目录与 docs/ 中均无 PLAN.md' },
  planNoId: { en: '✗ no task ID provided · usage: keeper plan done <P-X>', zh: '✗ 没写任务 ID · 用法：keeper plan done <P-X>' },
  planNotFound: { en: '✗ task {0} not found in PLAN.md tables', zh: '✗ PLAN.md 表格里没找到任务 {0}' },
  planDone: { en: '✓ PLAN.md: marked {0} as ✅', zh: '✓ PLAN.md：{0} 标记为 ✅' },
  planAlready: { en: '· {0} was already ✅', zh: '· {0} 已经是 ✅ 了' },
  // start-here refresh
  shNoFile: { en: '✗ no START-HERE.md in the root or docs/', zh: '✗ 根目录与 docs/ 中均无 START-HERE.md' },
  shNoMarkers: { en: '✗ no <!-- keeper:refresh --> markers found in START-HERE.md — cannot refresh safely', zh: '✗ START-HERE.md 里没找到 <!-- keeper:refresh --> 标记 —— 无法安全刷新' },
  shRefreshed: { en: '✓ START-HERE.md: refreshed {0} section(s)', zh: '✓ START-HERE.md：刷新了 {0} 段' },
  shDryRun: { en: '(dry run — changes not written)', zh: '（预览模式 —— 不写文件）' },
  // status
  stGit: { en: 'git', zh: 'git' },
  stFb: { en: 'feedback', zh: '反馈' },
  stFbLine: { en: 'open {0} · doing {1} · done {2}', zh: '待办 {0} · 进行中 {1} · 已完成 {2}' },
  stFbNone: { en: 'no feedback box yet (keeper fb init)', zh: '还没建意见箱（keeper fb init）' },
  stSprint: { en: 'sprint', zh: 'sprint' },
  stBranch: { en: 'branch {0} · last commit: {1}', zh: '分支 {0} · 最近 commit：{1}' },
  // refs · related-document scan
  refsUsage: { en: 'usage: keeper refs <keyword> [--root=.] · lists every doc mentioning the keyword, sorted by "current fact" vs "historical narrative"', zh: '用法：keeper refs <关键词> [--root=.] · 列出所有提到该关键词的文档，按"当前事实"和"历史叙述"分类' },
  refsNoKeyword: { en: '✗ give a keyword to scan for · e.g. keeper refs "six rooms"', zh: '✗ 要给个关键词 · 例：keeper refs "六个房间"' },
  refsHead: { en: '\n  refs · "{0}"\n', zh: '\n  关联扫描 · "{0}"\n' },
  refsCurrent: { en: '  ── current fact (must update when the fact changes) ──', zh: '  ── 当前事实（事实变了必须改） ──' },
  refsHistory: { en: '\n  ── historical narrative (leave as-is — it was true at the time) ──', zh: '\n  ── 历史叙述（保留原样——当时确实是那样） ──' },
  refsOther: { en: '\n  ── other mentions ──', zh: '\n  ── 其他引用 ──' },
  refsEmpty: { en: '  (no mentions found)', zh: '  （没找到引用）' },
  refsNone: { en: '  (none)', zh: '  （无）' },
  refsHint: { en: '\n  tip: current fact = SKILL / README / AGENTS / START-HERE / DOCS-OVERVIEW / room manuals · historical = PROGRESS / ROADMAP / sprints / HANDOFF', zh: '\n  提示：当前事实 = SKILL / README / AGENTS / START-HERE / DOCS-OVERVIEW / 房间手册 · 历史叙述 = PROGRESS / ROADMAP / sprints / HANDOFF' },
  // sync · end-of-session sweep
  syncReadOnly: { en: '\n  sync · check project files\n', zh: '\n  sync · 检查项目文件\n' },
  syncHead: { en: '\n  sync · refresh derived content + run all checks\n', zh: '\n  sync · 刷新派生内容 + 跑所有检查\n' },
  syncRefreshOk: { en: '  ✓ {0}: refreshed {1} section(s)', zh: '  ✓ {0}：刷新了 {1} 段' },
  syncRefreshSkip: { en: '  = {0}: no refresh markers found (skip)', zh: '  = {0}：没有刷新标记（跳过）' },
  syncRefreshFail: { en: '  ✗ {0}: {1}', zh: '  ✗ {0}：{1}' },
  syncCheckOk: { en: '  ✓ {0}: ok', zh: '  ✓ {0}：通过' },
  syncCheckSkip: { en: '  = {0}: skipped (room not installed)', zh: '  = {0}：跳过（房间未安装）' },
  syncCheckFail: { en: '  ✗ {0}: problems found (run `keeper {0} {1}` for details)', zh: '  ✗ {0}：发现问题（跑 `keeper {0} {1}` 看详情）' },
  syncSummary: { en: '\n  {0} step(s) ok · {1} problem(s)\n', zh: '\n  {0} 步通过 · {1} 个问题\n' },
  syncHint: { en: '  all green — safe to end the session', zh: '  全绿——可以收工了' },
  // stale · staleness sweep
  staleHead: { en: '\n  stale · what might be outdated\n', zh: '\n  stale · 哪些可能过期了\n' },
  staleStaleTasks: { en: '  ⚠️ PLAN.md tasks marked ⬜/🔧 but mentioned as done in PROGRESS: {0}', zh: '  ⚠️ PLAN.md 标 ⬜/🔧 但 PROGRESS 显示已完成的任务：{0}' },
  staleStaleTasksOk: { en: '  ✓ stale tasks: none', zh: '  ✓ 过期任务：无' },
  staleSummary: { en: '\n  {0} issue(s) found\n', zh: '\n  发现 {0} 个问题\n' },
  staleAllGreen: { en: '  all green — nothing stale\n', zh: '  全绿——没有过期的\n' },
};
const t = makeT(MSG, lang);

// Fixed-width ASCII. Project names stay on a separate, naturally wrapping line.
const BANNER = String.raw`
        .-.
     .--'-'--.      _           _ _            _
     | [o o] |     (_)_ __   __| (_) ___      | | _____  ___ _ __   ___ _ __
     |   ^   |     | | '_ \ / _' | |/ _ \____| |/ / _ \/ _ \ '_ \ / _ \ '__|
     '---+---'     | | | | | (_| | |  __/____|   <  __/  __/ |_) |  __/ |
       _/ \_       |_|_| |_|\__,_|_|\___|    |_|\_\___|\___| .__/ \___|_|
                                                           |_|`.trimEnd();

function findRoom(word) {
  return ROOMS.find(r => r.cmd === word || r.aliases.includes(word)) || null;
}

// ── shared context: project profile / stores (best effort, never throws) ──
function findUp(names) {
  let dir = process.cwd();
  while (true) {
    for (const n of names) {
      const p = path.join(dir, n);
      if (fs.existsSync(p)) return p;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function readJSON(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }

function projectName() {
  return loadProfile(ROOT)?.project?.name || null;
}

function projectRoot() {
  // Prefer keeper-profile.json (the governance root) so monorepo / nested
  // code-project layouts don't get hijacked by an inner package.json found first.
  // Fall back to .git / package.json only when no profile exists yet.
  const p = findUp(['keeper-profile.json']) || findUp(['.git', 'package.json']);
  return p ? path.dirname(p) : process.cwd();
}

// Remove shared flags from positional input before dispatch.
function parseEntryArgs(raw) {
  const args = [];
  const flags = {};
  for (let i = 0; i < raw.length; i++) {
    const match = /^--(root|lang|ui-lang)(?:=(.*))?$/.exec(raw[i]);
    if (!match) { args.push(raw[i]); continue; }
    const name = match[1];
    const value = match[2] ?? raw[++i];
    if (!value || value.startsWith('--')) return { args, flags, error: '--' + name };
    flags[name] = value;
  }
  return { args, flags };
}

function safeExec(argv, cwd) {
  try {
    const r = spawnSync(argv[0], argv.slice(1), { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });
    return r.status === 0 ? r.stdout.trim() : null;
  } catch { return null; }
}

function loadFeedback(root) {
  for (const c of ['feedback.json', 'docs/feedback/feedback.json', '.docs/feedback.json']) {
    const s = readJSON(path.join(root, c));
    if (s && Array.isArray(s.items)) return s;
  }
  return null;
}

function loadTruth(root) {
  for (const c of projectFiles.truth) {
    const s = readJSON(path.join(root, c));
    if (s && s.topics) return s;
  }
  return null;
}

// project profile (keeper-profile.json) — the on-disk triage result every
// room consults. Returns null if absent (caller treats as "all defaults").
function loadProfile(root) {
  for (const c of ['keeper-profile.json', 'docs/keeper-profile.json', '.docs/keeper-profile.json']) {
    const s = readJSON(path.join(root, c));
    if (s) return s;
  }
  return null;
}

// find the project's AI rule file (AGENTS.md by convention, but CLAUDE.md /
// .cursorrules / etc. count too) — returns the relative path, or null
function findRuleFile(root) {
  const names = ['AGENTS.md', 'CLAUDE.md', 'SOUL.md', 'GEMINI.md', 'START-HERE.md', '.cursorrules', '.github/copilot-instructions.md'];
  for (const n of names) {
    if (fs.existsSync(path.join(root, n))) return n;
  }
  return null;
}

function currentSprint(root) {
  const dir = path.join(root, 'docs', 'sprints');
  if (!fs.existsSync(dir)) return null;
  const nums = fs.readdirSync(dir).map(f => /^(\d+)\.md$/.exec(f)).filter(Boolean).map(m => +m[1]).sort((a, b) => b - a);
  for (const n of nums) {
    const raw = fs.readFileSync(path.join(dir, `${n}.md`), 'utf8');
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
    if (!fm || !/status:\s*in-progress/.test(fm[1])) continue;
    const title = (/title:\s*(.*)/.exec(fm[1]) || [, '?'])[1].trim();
    const pending = (raw.match(/^- \[ \]/gm) || []).length;
    const approved = (raw.match(/^- \[x\]/gm) || []).length;
    return { n, title, pending, approved };
  }
  return null;
}

// ── entry-doc state (for hello's "docs to maintain" section) ──
// Returns { name → { name, mtime, text } } for whichever entry docs exist.
// Used by cmdHello to show which docs need attention, and by AI during long
// tasks to quickly figure out what to maintain.

// Find an entry doc at root OR under docs/ (root wins for backwards compat).
// Returns the absolute path if found, else null.
function findEntryDoc(root, name) {
  const atRoot = path.join(root, name);
  if (fs.existsSync(atRoot)) return atRoot;
  const atDocs = path.join(root, 'docs', name);
  if (fs.existsSync(atDocs)) return atDocs;
  return null;
}

function entryDocState(root) {
  const out = {};
  const names = ['PROGRESS.md', 'PLAN.md', 'START-HERE.md', 'DOCS-OVERVIEW.md', 'ARCHITECTURE.md', 'UIUX-SPEC.md'];
  for (const name of names) {
    const p = findEntryDoc(root, name);
    if (!p) continue;
    let stat; try { stat = fs.statSync(p); } catch { continue; }
    let text = ''; try { text = fs.readFileSync(p, 'utf8').replace(/\r\n?/g, '\n'); } catch {}
    out[name] = { name, mtime: stat.mtime, text };
  }
  return out;
}

// Most recent "### YYYY-MM-DD" date in PROGRESS.md (the date of the last entry).
function lastProgressDate(text) {
  const m = text.match(/^### (\d{4}-\d{2}-\d{2})/m);
  return m ? m[1] : null;
}

// Count PLAN.md table rows whose status cell isn't ✅ (i.e. 🔧 or ⬜).
function countPlanPending(text) {
  let pending = 0;
  for (const line of text.split('\n')) {
    const m = /^\|\s*(P-\d+)\s*\|.*\|\s*(✅|🔧|⬜)\s*\|$/.exec(line);
    if (m && m[2] !== '✅') pending++;
  }
  return pending;
}

// Count git commits since a YYYY-MM-DD date (inclusive of that day).
// Returns null if git is unavailable or the repo has no commits.
function countCommitsSince(root, dateStr) {
  if (!dateStr) return null;
  const out = safeExec(['git', 'log', '--since=' + dateStr + 'T00:00:00', '--oneline'], root);
  if (out === null) return null;
  return out.split('\n').filter(Boolean).length;
}

// Compact MM-DD format for mtime display (year is obvious from context).
function fmtMD(d) {
  if (!d) return '?';
  const m = d.getMonth() + 1; const day = d.getDate();
  return (m < 10 ? '0' : '') + m + '-' + (day < 10 ? '0' : '') + day;
}

// ── built-in: keeper progress add "<text>" ──
// Prepends a "- <text>" entry to PROGRESS.md under today's "### YYYY-MM-DD"
// section. If today's section doesn't exist yet, creates it at the top of the
// "## 流水账（最新在上）" / "## Progress log" area (right before the first
// existing "### <date>" section). Language-agnostic: matches any "### date"
// line; if none exists, falls back to appending after the first "## " header.
function cmdProgress(args) {
  const sub = args[0];
  if (sub !== 'add') {
    console.error(t('progressUsage'));
    process.exit(1);
  }
  const text = args.slice(1).join(' ').trim();
  if (!text) { console.error(t('progressNoText')); process.exit(1); }
  const root = ROOT;
  const file = findEntryDoc(root, 'PROGRESS.md');
  if (!file) { console.error(t('progressNoFile')); process.exit(1); }
  let content = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
  const now = new Date();
  const today = now.getFullYear() + '-' + fmtMD(now);

  // Find the first "### YYYY-MM-DD" line (most recent entry, since log is reverse-chrono).
  const dateRe = /^### (\d{4}-\d{2}-\d{2})/m;
  const m = content.match(dateRe);
  let newContent;
  if (m && m[1] === today) {
    // Today's section already exists — insert right after the "### today" line.
    const insertAt = m.index + m[0].length;
    newContent = content.slice(0, insertAt) + '\n- ' + text + content.slice(insertAt);
    console.log(t('progressAdded', today));
  } else if (m) {
    // Today's section doesn't exist yet — insert a new "### today" section
    // right BEFORE the first existing date section (keeps reverse-chrono order).
    const insertAt = m.index;
    const block = '### ' + today + '\n\n- ' + text + '\n\n';
    newContent = content.slice(0, insertAt) + block + content.slice(insertAt);
    console.log(t('progressNewDay', today));
  } else {
    // No "### date" section at all — append after the first "## " header.
    const h2 = content.match(/^## .+$/m);
    if (h2) {
      const insertAt = h2.index + h2[0].length;
      const block = '\n\n### ' + today + '\n\n- ' + text + '\n';
      newContent = content.slice(0, insertAt) + block + content.slice(insertAt);
    } else {
      // Last resort: prepend.
      newContent = '# PROGRESS\n\n### ' + today + '\n\n- ' + text + '\n\n' + content;
    }
    console.log(t('progressNewDay', today));
  }
  fs.writeFileSync(file, newContent);
}

// ── built-in: keeper plan done <P-X> ──
// Finds the first table row in PLAN.md whose first cell matches the task ID
// (e.g. "P-4") and flips its last cell (status) to ✅. Idempotent: if already
// ✅, prints a note and exits 0.
function cmdPlan(args) {
  const sub = args[0];
  if (sub !== 'done') {
    console.error(t('planUsage'));
    process.exit(1);
  }
  const id = (args[1] || '').trim();
  if (!id) { console.error(t('planNoId')); process.exit(1); }
  const root = ROOT;
  const file = findEntryDoc(root, 'PLAN.md');
  if (!file) { console.error(t('planNoFile')); process.exit(1); }
  const content = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
  const lines = content.split('\n');
  // Match: | P-X | ... | STATUS |
  // The status cell is the last cell. Allow ✅ / 🔧 / ⬜ / ☐ / [x] / [ ].
  const rowRe = /^\|(\s*)(P-\d+)(\s*)\|([\s\S]*?)\|(\s*)(✅|🔧|⬜|☐|\[x\]|\[ \])(\s*)\|$/;
  let found = false;
  let already = false;
  for (let i = 0; i < lines.length; i++) {
    const m = rowRe.exec(lines[i]);
    if (!m || m[2] !== id) continue;
    found = true;
    if (m[6] === '✅') { already = true; break; }
    lines[i] = lines[i].replace(/\|(\s*)(✅|🔧|⬜|☐|\[x\]|\[ \])(\s*)\|$/, '| ✅ |');
    break;
  }
  if (!found) { console.error(t('planNotFound', id)); process.exit(1); }
  if (already) { console.log(t('planDone', id) + ' ' + t('planAlready', id)); return; }
  fs.writeFileSync(file, lines.join('\n'));
  console.log(t('planDone', id));
}

// ── built-in: keeper start-here refresh ──
// Refreshes the <!-- keeper:refresh:start <name> --> … <!-- keeper:refresh:end -->
// regions in START-HERE.md so the human entry page stays in sync without manual
// editing. Two regions are supported:
//   progress — derives a short "what's new" from PROGRESS.md's latest entries
//               + recent git log
//   docmap   — derives the document map table from truth-source.json
// Other parts of START-HERE.md (待办 / 怎么浏览 / 谁在干活) are left untouched —
// those need human judgement.
// Usage: keeper start-here refresh [--dry-run]
function cmdStartHere(args) {
  const sub = args[0];
  if (sub !== 'refresh') {
    console.error(t('refreshUsage'));
    process.exit(1);
  }
  const dryRun = args.includes('--dry-run') || args.includes('-n');
  const root = ROOT;
  // Respect the opt-out: startHere.enabled=false means the project deliberately
  // has no human entry page — degrade gracefully instead of refreshing anyway.
  const shProf = loadProfile(root);
  if (shProf && shProf.startHere && shProf.startHere.enabled === false) {
    console.log('  ' + t('shDisabled'));
    return;
  }
  const file = findEntryDoc(root, 'START-HERE.md');
  if (!file) { console.error(t('shNoFile')); process.exit(1); }
  const content = fs.readFileSync(file, 'utf8');

  const result = refreshRegions(root, content);
  if (!result.count) { console.error(t('shNoMarkers')); process.exit(1); }
  const refreshed = result.count;

  if (dryRun) {
    console.log(t('shRefreshed', refreshed) + ' ' + t('shDryRun'));
    console.log('\n--- diff (first 2000 chars of new content) ---\n');
    console.log(result.content.slice(0, 2000));
    return;
  }
  if (content !== result.content) fs.writeFileSync(file, result.content);
  console.log(t('shRefreshed', refreshed));
}

function refreshRegions(root, text) {
  let count = 0;
  const region = /<!--\s*keeper:refresh:start\s+(\w+)\s*-->[\s\S]*?<!--\s*keeper:refresh:end\s*-->/g;
  const content = text.replace(region, (original, name) => {
    if (name !== 'progress' && name !== 'docmap') return original;
    count++;
    return name === 'progress' ? buildProgressSection(root) : buildDocMapSection(root);
  });
  return { content, count };
}

// Build the "📰 进展总结" section content from PROGRESS.md + git log.
// Extracts the latest 2-3 entries from PROGRESS.md and wraps them with the
// refresh markers. Keeps it short — this is a snapshot, not a full log.
function buildProgressSection(root) {
  const docs = entryDocState(root);
  const prog = docs['PROGRESS.md'];
  const lines = [];
  lines.push('<!-- keeper:refresh:start progress -->');

  if (prog && prog.text) {
    // Extract the latest "### YYYY-MM-DD" section's bullet entries
    const sections = prog.text.split(/^### /m).filter(s => /^\d{4}-\d{2}-\d{2}/.test(s));
    if (sections.length) {
      // Take the most recent 2 date sections
      const recent = sections.slice(0, 2);
      for (const sec of recent) {
        const dateMatch = /^(\d{4}-\d{2}-\d{2})/.exec(sec);
        const date = dateMatch ? dateMatch[1] : '';
        const bullets = sec.split('\n').slice(1).filter(l => /^-\s+/.test(l)).map(l => l.trim());
        if (bullets.length) {
          lines.push(`**${date}**：${bullets[0].replace(/^-\s+/, '')}`);
          for (const b of bullets.slice(1, 3)) lines.push(b);
        }
      }
    }
  }

  // Recent git commits (best effort)
  const log = safeExec(['git', 'log', '--oneline', '-5'], root);
  if (log) {
    lines.push('');
    lines.push('最近 commit：');
    for (const line of log.split('\n').filter(Boolean).slice(0, 5)) {
      lines.push(`- \`${line}\``);
    }
  }

  lines.push('<!-- keeper:refresh:end -->');
  return lines.join('\n');
}

// Build the "🗂️ 文档地图" section from truth-source.json.
// Renders tables grouped by category (entry / plan / manuals / config),
// derived from the registered topics.
function buildDocMapSection(root) {
  const ts = loadTruth(root);
  const lines = [];
  lines.push('<!-- keeper:refresh:start docmap -->');

  if (ts && ts.topics) {
    const topics = Object.entries(ts.topics);
    // Categorize by the file path prefix
    const groups = { entry: [], plan: [], manuals: [], config: [], other: [] };
    for (const [key, info] of topics) {
      const f = info.file || '';
      let group;
      if (['SKILL.md', 'AGENTS.md', 'START-HERE.md', 'README.md'].includes(f)) group = 'entry';
      else if (f.startsWith('docs/ROADMAP') || f.startsWith('docs/PLAN') || f.startsWith('docs/PROGRESS')
            || f.startsWith('docs/sprints') || f.startsWith('docs/feedback') || f.startsWith('docs/decisions')
            || f.startsWith('docs/HANDOFF') || f.startsWith('docs/ARCHITECTURE') || f.startsWith('docs/DOCS-OVERVIEW')) group = 'plan';
      else if (f.startsWith('references/')) group = 'manuals';
      else if (f.endsWith('.json')) group = 'config';
      else group = 'other';
      groups[group].push({ key, ...info });
    }

    const labels = {
      entry: '### 入口（先读这些）',
      plan: '### 计划与状态（常变）',
      manuals: '### 手册（稳定参考）',
      config: '### 配置（数据文件）',
      other: '### 其他',
    };

    for (const g of ['entry', 'plan', 'manuals', 'config', 'other']) {
      if (!groups[g].length) continue;
      lines.push(labels[g]);
      lines.push('');
      lines.push('| 文件 | 看了能知道什么 |');
      lines.push('|------|----------------|');
      for (const item of groups[g]) {
        const display = item.file || item.key;
        const desc = item.desc || '';
        lines.push(`| **[[${display}]]** | ${desc} |`);
      }
      lines.push('');
    }
  }

  lines.push('<!-- keeper:refresh:end -->');
  return lines.join('\n');
}

function printBanner(showProject = false) {
  const name = projectName();
  if (!process.stdout.isTTY || process.env.CI || cli.args.includes('--json')) {
    if (showProject && name) console.log(name);
    return;
  }
  const width = process.stdout.columns || 0;
  const canColor = !process.env.NO_COLOR && process.env.TERM !== 'dumb';
  if (canColor && BANNER.split('\n').every(line => line.length <= width)) {
    console.log('\x1b[36m' + BANNER + '\x1b[0m');
  } else if (width >= 18) {
    console.log('[o_o] indie-keeper');
  } else if (width >= 5) {
    console.log('[o_o]');
  }
  if (name) console.log(name);
}

// ── built-in: keeper (bare) / keeper help ──
function printMenu() {
  printBanner();
  console.log('');
  console.log(t('usageHead'));
  console.log(`  hello     ${t('helloDesc')}`);
  console.log(`  status    ${t('statusDesc')}`);
  console.log(t('editingHead'));
  console.log(`  where     ${t('whereDesc')}`);
  console.log(`  truth     ${t('truthDesc')}`);
  console.log(`  refs      ${t('refsDesc')}`);
  console.log(`  progress  ${t('progressDesc')}`);
  console.log(`  plan      ${t('planDesc')}`);
  console.log(t('syncHead2'));
  console.log(`  start-here ${t('shDesc')}`);
  console.log(`  sync      ${t('syncDesc')}`);
  console.log(`  stale     ${t('staleDesc')}`);
  console.log(t('roomsHead'));
  for (const r of ROOMS) {
    const alias = r.aliases.length ? r.aliases.join('/') : '—';
    console.log(`  ${r.cmd.padEnd(9)} ${alias.padEnd(12)} ${r.name[lang]} · ${r.desc[lang]}`);
  }
  console.log(t('examples'));
}

// ── built-in: keeper refs <keyword> · related-document scan ──
// Before changing a fact (e.g. "six rooms" → "seven rooms"), run this to see
// every doc that mentions the keyword, sorted into:
//   - current fact  (SKILL / README / AGENTS / START-HERE / DOCS-OVERVIEW / room manuals)
//   - historical narrative (PROGRESS / ROADMAP / sprints / HANDOFF — leave as-is)
//   - other mentions
// This is the "scan around the change" step AI tends to skip.
function cmdRefs(args) {
  const keyword = args.find(a => !a.startsWith('--'));
  if (!keyword) { console.error(t('refsNoKeyword')); process.exit(1); }
  const root = ROOT;

  // Classify a file by its path: "current fact" vs "historical narrative" vs "other"
  const HISTORICAL = ['progress.md', 'roadmap.md', 'handoff.md'];
  const HISTORICAL_DIRS = ['docs/sprints/', 'docs/decisions/', 'docs/feedback/'];
  function classify(rel) {
    const lower = rel.toLowerCase().replace(/\\/g, '/');
    const base = lower.split('/').pop().replace(/\.zh\.md$/, '.md');
    if (HISTORICAL.includes(base)) return 'history';
    if (HISTORICAL_DIRS.some(d => lower.startsWith(d))) return 'history';
    // current fact: root docs + references/ + DOCS-OVERVIEW + docs/zh/ mirrors of root docs
    if (lower === 'skill.md' || lower === 'readme.md' || lower === 'agents.md' ||
        lower === 'start-here.md' || lower === 'docs/docs-overview.md' ||
        lower.startsWith('references/') ||
        lower.startsWith('docs/zh/skill') || lower.startsWith('docs/zh/readme')) return 'current';
    return 'other';
  }

  // Walk .md files under root + docs + references
  const hits = [];
  const kwLower = keyword.toLowerCase();
  function walk(dir, base) {
    if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      if (name.startsWith('.') || name === 'node_modules' || name === '_archive') continue;
      const abs = path.join(dir, name);
      const rel = base ? `${base}/${name}` : name;
      const st = fs.statSync(abs);
      if (st.isDirectory()) {
        if (name === 'templates' || name === 'assets') continue;
        walk(abs, rel);
      } else if (name.endsWith('.md')) {
        let text; try { text = fs.readFileSync(abs, 'utf8').replace(/\r\n?/g, '\n'); } catch { continue; }
        const lines = text.split('\n');
        const matches = [];
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(kwLower)) {
            matches.push({ line: i + 1, text: lines[i].trim().slice(0, 120) });
          }
        }
        if (matches.length) hits.push({ rel: rel.replace(/\\/g, '/'), matches, kind: classify(rel) });
      }
    }
  }
  // Walk root-level .md recursively (covers root + docs/ + references/ in one pass)
  walk(root, '');

  const current = hits.filter(h => h.kind === 'current');
  const history = hits.filter(h => h.kind === 'history');
  const other = hits.filter(h => h.kind === 'other');

  console.log(t('refsHead', keyword));

  console.log(t('refsCurrent'));
  if (!current.length) console.log(t('refsNone'));
  for (const h of current) {
    for (const m of h.matches) console.log(`  ${h.rel}:${m.line}  ${m.text}`);
  }

  console.log(t('refsHistory'));
  if (!history.length) console.log(t('refsNone'));
  for (const h of history) {
    for (const m of h.matches) console.log(`  ${h.rel}:${m.line}  ${m.text}`);
  }

  if (other.length) {
    console.log(t('refsOther'));
    for (const h of other) {
      for (const m of h.matches) console.log(`  ${h.rel}:${m.line}  ${m.text}`);
    }
  }

  console.log(t('refsHint'));
}

// Use each room's exit code; diagnostic prose is localized.
function runChecks(root, rooms) {
  const checks = {
    docs: ['stamp', '--all', '--check'],
    truth: ['check'],
    schedule: ['check'],
  };
  let passed = 0, failed = 0;
  for (const room of rooms) {
    if (!projectFiles[room].some(file => fs.existsSync(path.join(root, file)))) {
      console.log(t('syncCheckSkip', room));
      continue;
    }
    const script = path.join(__dirname, 'commands', findRoom(room).script);
    const uiFlag = room === 'docs' ? '--ui-lang' : '--lang';
    const args = [script, ...checks[room], '--root', root, uiFlag, lang];
    const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
    if (r.status === 0) {
      passed++;
      console.log(t('syncCheckOk', room));
    } else {
      failed++;
      console.log(t('syncCheckFail', room, checks[room].join(' ')));
      console.error([r.stdout, r.stderr, r.error?.message].filter(Boolean).join('\n').trim());
    }
  }
  return { passed, failed };
}

function cmdSync(args) {
  const root = ROOT;
  let okSteps = 0, problems = 0;
  console.log(t(args.includes('--check') ? 'syncReadOnly' : 'syncHead'));

  // Refresh enabled regions only on a write-mode sweep.
  const sh = findEntryDoc(root, 'START-HERE.md');
  if (!args.includes('--check') && sh && loadProfile(root)?.startHere?.enabled !== false) {
    try {
      const original = fs.readFileSync(sh, 'utf8');
      const { content, count } = refreshRegions(root, original);
      if (count > 0) {
        if (original !== content) fs.writeFileSync(sh, content);
        console.log(t('syncRefreshOk', 'START-HERE.md', count));
        okSteps++;
      } else {
        console.log(t('syncRefreshSkip', 'START-HERE.md'));
      }
    } catch (e) { console.log(t('syncRefreshFail', 'START-HERE.md', e.message)); problems++; }
  }

  // 2. run checkups via room scripts (truth check, docs stamp --all --check, schedule check)
  // Each check is skipped if the room's data file is missing (room not installed).
  const checked = runChecks(root, ['truth', 'docs', 'schedule']);
  okSteps += checked.passed;
  problems += checked.failed;

  console.log(t('syncSummary', okSteps, problems));
  if (problems === 0) console.log(t('syncHint'));
  process.exit(problems === 0 ? 0 : 1);
}

// ── built-in: keeper stale · staleness sweep ──
// Scans for everything that might be outdated across the project:
//   - missing, stale, or unfinished translations (docs stamp --all --check)
//   - dead links / untracked docs (truth check)
//   - PLAN.md tasks marked ⬜/🔧 but mentioned as done in PROGRESS
// More diagnostic than `sync` (which refreshes + checks) — this is for
// "what did the AI forget to update?".
function cmdStale() {
  const root = ROOT;
  let issues = 0;
  console.log(t('staleHead'));

  issues += runChecks(root, ['docs', 'truth']).failed;

  // 3. PLAN tasks marked ⬜/🔧 but PROGRESS says done
  const planPath = findEntryDoc(root, 'PLAN.md');
  const progressPath = findEntryDoc(root, 'PROGRESS.md');
  if (planPath && progressPath) {
    try {
      const planText = fs.readFileSync(planPath, 'utf8').replace(/\r\n?/g, '\n');
      const progressText = fs.readFileSync(progressPath, 'utf8').replace(/\r\n?/g, '\n');
      // find PLAN rows like "| P-9 | ... | ... | ⬜ |" or "🔧"
      const taskIds = [];
      for (const line of planText.split('\n')) {
        const m = line.match(/^\|\s*(P-\d+)\s*\|.*\|\s*(⬜|🔧)\s*\|/);
        if (m) taskIds.push(m[1]);
      }
      // check if PROGRESS mentions these task ids as done (heuristic: id appears near "done"/"✅"/"完成")
      const lines = progressText.split('\n');
      const stale = taskIds.filter(id => {
        const task = new RegExp('\\b' + id + '\\b');
        return lines.some(l => task.test(l) && /done|✅|完成|已做|ship/.test(l));
      });
      if (stale.length) { console.log(t('staleStaleTasks', stale.join(', '))); issues += stale.length; }
      else console.log(t('staleStaleTasksOk'));
    } catch { /* PLAN/PROGRESS parse failure — skip */ }
  }

  if (issues === 0) console.log(t('staleAllGreen'));
  else console.log(t('staleSummary', issues));
  process.exit(issues === 0 ? 0 : 1);
}

// ── built-in: keeper hello · 30-second handover briefing ──
function cmdHello() {
  const root = ROOT;
  printBanner(true);
  console.log('');

  // version (package.json, if any)
  const pkg = readJSON(path.join(root, 'package.json'));
  if (pkg && pkg.version) console.log(`  ${t('helloVersion')} v${pkg.version}`);

  // git
  const st = safeExec(['git', 'status', '--short'], root);
  if (st === null) console.log(`  ${t('helloGitNone')}`);
  else {
    const n = st.split('\n').filter(Boolean).length;
    console.log('  ' + (n ? t('helloGitDirty', n) : t('helloGitClean')));
  }

  // handover note from the last shift (docs/HANDOFF.md preferred, root HANDOFF.md fallback)
  for (const rel of ['docs/HANDOFF.md', 'HANDOFF.md']) {
    if (fs.existsSync(path.join(root, rel))) {
      console.log('  ' + t('helloHandoff', rel));
      const lines = fs.readFileSync(path.join(root, rel), 'utf8').split(/\r?\n/);
      const start = lines.findIndex(line => /^##\s+(Handoff brief|接班要点)\s*$/i.test(line));
      if (start >= 0) {
        const keys = new Set();
        for (const line of lines.slice(start + 1)) {
          if (/^#{1,2}\s/.test(line) || keys.size === 4) break;
          const field = /^- (Next|Why|Decision|Evidence|下一步|原因|决策|证据)\s*[:：]\s*(\S.*)$/i.exec(line);
          if (field && !keys.has(field[1].toLowerCase())) {
            keys.add(field[1].toLowerCase());
            console.log('    ' + line.slice(2));
          }
        }
      }
      break;
    }
  }

  // AI dev rules (AGENTS.md, or whatever rule file the project uses)
  const ruleFile = findRuleFile(root);
  if (ruleFile) console.log('  ' + t('helloAgents', ruleFile));
  else console.log('  ' + t('helloAgentsMissing'));

  console.log('');

  // open feedback (anything not done/dropped)
  const fb = loadFeedback(root);
  if (fb) {
    const open = fb.items.filter(it => !['done', 'dropped'].includes(it.status === 'open' ? 'idea' : it.status));
    if (open.length) {
      console.log(`  ▸ ${t('helloFbHead', open.length)}`);
      for (const it of open.slice(0, 5)) console.log(`    #${it.id} [${it.tag || '?'}] ${it.text}`);
      if (open.length > 5) console.log(t('helloFbMore', open.length - 5));
    } else console.log(`  ▸ ${t('helloFbNone')}`);
  }

  // current sprint
  const sp = currentSprint(root);
  if (sp) console.log(`  ▸ ${t('helloSprint', sp.n, sp.title, sp.approved, sp.approved + sp.pending)}`);
  else console.log(`  ▸ ${t('helloSprintNone')}`);

  // truth-source registry
  const ts = loadTruth(root);
  if (ts) console.log(`  ▸ ${t('helloTruth', Object.keys(ts.topics).length)}`);
  else console.log(`  ▸ ${t('helloTruthNone')}`);

  // docs to maintain — entry docs state at a glance (helps AI in long tasks
  // figure out what to update and which CLI command to use).
  // START-HERE reminder is folded in here; opt out via profile.startHere.enabled = false.
  const prof = loadProfile(root);
  const startHereEnabled = !prof || !prof.startHere || prof.startHere.enabled !== false;
  // entryDocs.* opt-outs: a doc the user disabled at triage must not be nagged
  // about, even if the file still exists on disk.
  const entryOn = k => !prof || !prof.entryDocs || prof.entryDocs[k] !== false;
  const docs = entryDocState(root);
  const docLines = [];
  if (docs['PROGRESS.md'] && entryOn('progress')) {
    const last = lastProgressDate(docs['PROGRESS.md'].text);
    const commits = countCommitsSince(root, last);
    const lastStr = last ? last.slice(5) : '—';
    const commitStr = commits === null ? '' : commits > 0 ? t('docCommits', commits) : t('docCurrent');
    docLines.push(`PROGRESS.md   ${t('docProgress', lastStr, commitStr)}`);
  }
  if (docs['PLAN.md'] && entryOn('plan')) {
    const pending = countPlanPending(docs['PLAN.md'].text);
    const taskStr = pending > 0 ? t('docPending', pending) : t('docAllDone');
    docLines.push(`PLAN.md       ${taskStr} · keeper plan done <P-X>`);
  }
  if (startHereEnabled) {
    if (docs['START-HERE.md']) {
      docLines.push(`START-HERE    ${fmtMD(docs['START-HERE.md'].mtime)} · ${t('docStartHere')}`);
    } else {
      console.log('  ' + t('helloStartHereMissing'));
    }
  }
  if (docs['DOCS-OVERVIEW.md'] && entryOn('docsOverview')) {
    const topics = ts ? Object.keys(ts.topics).length : 0;
    docLines.push(`DOCS-OVERVIEW ${fmtMD(docs['DOCS-OVERVIEW.md'].mtime)} · ${t('docTopics', topics)}`);
  }
  if (docs['ARCHITECTURE.md'] && entryOn('architecture')) {
    docLines.push(`ARCHITECTURE  ${fmtMD(docs['ARCHITECTURE.md'].mtime)}`);
  }
  if (docs['UIUX-SPEC.md'] && entryOn('uiuxSpec')) {
    docLines.push(`UIUX-SPEC     ${fmtMD(docs['UIUX-SPEC.md'].mtime)}`);
  }
  if (docLines.length) {
    console.log(`  ▸ ${t('helloDocs')}`);
    for (const l of docLines) console.log('    ' + l);
  }

  console.log(t('helloCmds'));
}

// ── built-in: keeper status · workspace health ──
function cmdStatus() {
  const root = ROOT;
  const name = projectName() || path.basename(root);
  const pkg = readJSON(path.join(root, 'package.json'));
  console.log(`\n  ${name}${pkg && pkg.version ? ' · v' + pkg.version : ''}\n`);

  // git
  const st = safeExec(['git', 'status', '--short'], root);
  if (st === null) console.log(`  ${t('stGit')}: ${t('helloGitNone')}`);
  else {
    const lines = st.split('\n').filter(Boolean);
    console.log(`  ${t('stGit')}: ${lines.length ? t('helloGitDirty', lines.length) : t('helloGitClean')}`);
    for (const l of lines.slice(0, 8)) console.log(`    ${l}`);
    if (lines.length > 8) console.log(`    … +${lines.length - 8}`);
    const branch = safeExec(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], root);
    const last = safeExec(['git', 'log', '-1', '--format=%h %s (%cr)'], root);
    if (branch && last) console.log(`  ${t('stBranch', branch, last.replace(/^"|"$/g, ''))}`);
  }

  // feedback counts
  const fb = loadFeedback(root);
  if (fb) {
    const c = { open: 0, doing: 0, done: 0 };
    for (const it of fb.items) {
      const s = it.status === 'open' ? 'idea' : (it.status || 'idea');
      if (s === 'doing') c.doing++;
      else if (s === 'done' || s === 'dropped') c.done++;
      else c.open++;
    }
    console.log(`  ${t('stFb')}: ${t('stFbLine', c.open, c.doing, c.done)}`);
  } else console.log(`  ${t('stFb')}: ${t('stFbNone')}`);

  // sprint
  const sp = currentSprint(root);
  if (sp) console.log(`  ${t('stSprint')}: ${t('helloSprint', sp.n, sp.title, sp.approved, sp.approved + sp.pending)}`);
  else console.log(`  ${t('stSprint')}: ${t('helloSprintNone')}`);
  console.log('');
}

function main() {
  if (cli.error) { console.error(t('optionValue', cli.error)); process.exit(1); }
  const [word, ...rest] = cli.args;

  if (!word) { printMenu(); return; }
  if (word === 'help' || word === '--help') { printMenu(); return; }
  if (word === 'hello') { cmdHello(); return; }
  if (word === 'status') { cmdStatus(); return; }
  if (word === 'progress') { cmdProgress(rest); return; }
  if (word === 'plan') { cmdPlan(rest); return; }
  if (word === 'start-here') { cmdStartHere(rest); return; }
  if (word === 'refs') { cmdRefs(rest); return; }
  if (word === 'sync') { cmdSync(rest); return; }
  if (word === 'stale') { cmdStale(); return; }

  // keeper where <topic> → Archive's where (same registry, shorter to type)
  const forward = word === 'where'
    ? { script: 'truth.js', args: ['where', ...rest] }
    : null;

  const room = forward ? null : findRoom(word);
  if (!forward && !room) {
    console.error(t('noRoom', word, ROOMS.map(r => r.cmd).join(' / ')));
    process.exit(1);
  }

  const script = path.join(__dirname, 'commands', forward ? forward.script : room.script);
  const pass = forward ? forward.args : rest;
  pass.push('--root', ROOT);
  for (const flag of ['lang', 'ui-lang']) {
    if (cli.flags[flag]) pass.push('--' + flag, cli.flags[flag]);
  }
  const r = spawnSync(process.execPath, [script, ...pass], { stdio: 'inherit' });
  process.exit(r.status === null ? 1 : r.status);
}

main();
