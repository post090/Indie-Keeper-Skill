#!/usr/bin/env node
// feedback.js · Feedback Box: feedback lifecycle + auto-generated INBOX (zero deps)
// ─────────────────────────────────────────────────────────────
// Reference implementation of the indie-keeper Feedback Box.
// Any passing remark goes into the inbox with one command, walks a
// lifecycle, and mature ideas graduate into ROADMAP tasks
// (pinned as fb #N — traceable end to end).
//
// Storage: feedback.json (structured source of truth)
//        + auto-generated INBOX.md (human-readable, never hand-edit)
//
// Usage:
//   node feedback.js add "<text>" [--from someone] [--tag bug|idea|ui|balance|other]
//   node feedback.js list [--status idea] [--from someone] [--tag bug]
//   node feedback.js show <id>
//   node feedback.js plan <id> [--status designed]     switch status (omit = advance one step)
//   node feedback.js link <id> --to "ROADMAP v0.5@docs/ROADMAP.md"
//   node feedback.js done <id> [--version v0.5.0] [--commit h1,h2] [--summary "..."]
//   node feedback.js drop <id> [--reason "..."]
//   node feedback.js init                              create an empty inbox
//
// All commands accept --root=<project root> (default: cwd) and --lang=<en|zh>
'use strict';

const fs = require('fs');
const path = require('path');
const { detectLang, makeT } = require('../lang');

// ── argv parsing: both --name=value and --name value are accepted ──
const VALUE_FLAGS = new Set(['root', 'store', 'from', 'tag', 'status', 'to', 'version', 'commit', 'summary', 'reason', 'link', 'lang']);

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
const CANDIDATES = ['feedback.json', 'docs/feedback/feedback.json', '.docs/feedback.json'];

const lang = detectLang();

// ── statuses & tags ──
// six-state lifecycle (open is a legacy alias for idea)
const STATUS_LABEL = {
  idea: { en: '💡 idea', zh: '💡 想法' },
  designed: { en: '📐 designed', zh: '📐 已设计' },
  planned: { en: '📋 planned', zh: '📋 已计划' },
  doing: { en: '🔧 doing', zh: '🔧 施工中' },
  done: { en: '✅ done', zh: '✅ 已处理' },
  dropped: { en: '⚪ dropped', zh: '⚪ 撤掉' },
};
const STATUS_ORDER = ['idea', 'designed', 'planned', 'doing', 'done', 'dropped'];
// auto-advance chain for plan (done/dropped never auto-entered; use done/drop explicitly)
const NEXT_STATUS = { idea: 'designed', designed: 'planned', planned: 'doing' };
const TAG_LABEL = {
  bug: { en: '🐛bug', zh: '🐛BUG' },
  idea: { en: '💡idea', zh: '💡想法' },
  ui: { en: '🎨UI', zh: '🎨UI' },
  balance: { en: '⚖️balance', zh: '⚖️平衡' },
  other: { en: '📌other', zh: '📌其它' },
};
function sLabel(s) { return (STATUS_LABEL[s] || {})[lang] || s; }
function tLabel(tag) { return (TAG_LABEL[tag] || {})[lang] || tag || ''; }

const MSG = {
  noStore: { en: 'feedback.json not found (looked in: {0}). Run feedback.js init first.', zh: '没找到 feedback.json（找过：{0}）。先跑 feedback.js init。' },
  noItems: { en: '{0} is missing the items array', zh: '{0} 缺少 items 数组' },
  inboxTitle: { en: '# 📬 Feedback Box · INBOX', zh: '# 📬 意见箱 · INBOX' },
  inboxNote: { en: '> Auto-generated · never hand-edit · maintained by: feedback.js add / plan / link / done / drop', zh: '> 自动生成 · 勿手改 · 维护命令：feedback.js add / plan / link / done / drop' },
  inboxSource: { en: '> Source of truth: {0}', zh: '> 真相源：{0}' },
  inboxStats: { en: 'Stats: 💡{0} · 📐{1} · 📋{2} · 🔧{3} · ✅{4} · ⚪{5}', zh: '统计：💡{0} · 📐{1} · 📋{2} · 🔧{3} · ✅{4} · ⚪{5}' },
  inboxCols: { en: '| # | tag | from | text / links | time / outcome |', zh: '| # | 标签 | 来自 | 内容 / 双链 | 时间 / 处理结果 |' },
  initExists: { en: '{0} already exists (--force to overwrite)', zh: '{0} 已存在（--force 覆盖）' },
  initComment: { en: 'Feedback Box source of truth · maintained by feedback.js · never hand-edit', zh: '意见箱真相源 · feedback.js 维护 · 勿手改' },
  initDone: { en: '✓ initialized {0} + INBOX.md', zh: '✓ 已初始化 {0} + INBOX.md' },
  addUsage: { en: 'Usage: feedback.js add "<text>" [--from someone] [--tag bug]', zh: '用法：feedback.js add "<内容>" [--from 某人] [--tag bug]' },
  badTag: { en: 'Unknown tag "{0}" (available: {1})', zh: '未知标签"{0}"（可用：{1}）' },
  badStatus: { en: 'Unknown status "{0}"', zh: '未知状态"{0}"' },
  added: { en: '✓ fb #{0} inboxed · {1} · from {2}', zh: '✓ fb #{0} 已入箱 · {1} · 来自 {2}' },
  listEmpty: { en: '(no matching feedback)', zh: '（没有匹配的反馈）' },
  listFoot: { en: '\n  {0} item(s) · details: feedback.js show <id>\n', zh: '\n  共 {0} 条 · 详情：feedback.js show <id>\n' },
  noSuchFb: { en: 'No fb #{0}', zh: '没有 fb #{0}' },
  showText: { en: '  text: {0}', zh: '  内容：{0}' },
  showMeta: { en: '  from: {0} · tag: {1}', zh: '  来自：{0} · 标签：{1}' },
  showTimes: { en: '  created: {0} · updated: {1}', zh: '  创建：{0} · 更新：{1}' },
  showNote: { en: '  note: {0}', zh: '  备注：{0}' },
  showResult: { en: '  outcome: {0}', zh: '  结果：{0}' },
  noAutoNext: { en: 'fb #{0} is currently {1}, cannot auto-advance (use done/drop commands for those)', zh: 'fb #{0} 当前是 {1}，不能自动推进（done/drop 请用对应命令）' },
  badStatusList: { en: 'Unknown status "{0}" (available: {1})', zh: '未知状态"{0}"（可用：{1}）' },
  planned: { en: '✓ fb #{0}: {1} → {2}', zh: '✓ fb #{0}：{1} → {2}' },
  planHint: { en: '  remember to pin fb #{0} on the matching ROADMAP task', zh: '  记得在 ROADMAP 对应任务上挂 fb #{0}' },
  linkUsage: { en: 'Usage: feedback.js link <id> --to "label@path" (e.g. "ROADMAP v0.5@docs/ROADMAP.md")', zh: '用法：feedback.js link <id> --to "标签@路径"（如 "ROADMAP v0.5@docs/ROADMAP.md"）' },
  linked: { en: '✓ fb #{0} linked: {1} → {2}', zh: '✓ fb #{0} 已挂链：{1} → {2}' },
  doneMsg: { en: '✓ fb #{0} done{1}', zh: '✓ fb #{0} 已处理{1}' },
  droppedMsg: { en: '✓ fb #{0} dropped{1}', zh: '✓ fb #{0} 已撤掉{1}' },
  dropReason: { en: ' · reason: {0}', zh: ' · 原因：{0}' },
  unknownCmd: { en: 'Unknown command "{0}", see feedback.js help', zh: '未知命令"{0}"，看 feedback.js help' },
  help: {
    en: `feedback.js · Feedback Box (lifecycle + auto INBOX)

  feedback.js add "<text>" [--from someone] [--tag bug|idea|ui|balance|other]
  feedback.js list [--status idea] [--from X] [--tag X]
  feedback.js show <id>
  feedback.js plan <id> [--status designed]    switch status · omit = advance one step
  feedback.js link <id> --to "label@path"      add a link (e.g. a ROADMAP task)
  feedback.js done <id> [--version vX.Y.Z] [--commit h1,h2] [--summary "..."]
  feedback.js drop <id> [--reason "..."]
  feedback.js init [--force]

  Lifecycle: 💡idea → 📐designed → 📋planned → 🔧doing → ✅done (⚪dropped anytime)
  Storage: feedback.json (source of truth) + INBOX.md (auto-generated, never hand-edit)
`,
    zh: `feedback.js · 意见箱（反馈生命周期 + 自动 INBOX）

  feedback.js add "<内容>" [--from 某人] [--tag bug|idea|ui|balance|other]
  feedback.js list [--status idea] [--from X] [--tag X]
  feedback.js show <id>
  feedback.js plan <id> [--status designed]    切状态 · 不传自动推进下一档
  feedback.js link <id> --to "标签@路径"        挂双链（如 ROADMAP 任务）
  feedback.js done <id> [--version vX.Y.Z] [--commit h1,h2] [--summary "..."]
  feedback.js drop <id> [--reason "..."]
  feedback.js init [--force]

  生命周期：💡idea → 📐designed → 📋planned → 🔧doing → ✅done（⚪dropped 随时可撤）
  存储：feedback.json（真相源）+ INBOX.md（自动生成勿手改）
`,
  },
};
const t = makeT(MSG, lang);

function fail(msg) { console.error(`✗ ${msg}`); process.exit(1); }

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function nowStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function normStatus(s) { return s === 'open' ? 'idea' : (s || 'idea'); }

// ── storage ──

function findStorePath() {
  const explicit = flag('store', '');
  if (explicit) return path.resolve(ROOT, explicit);
  for (const c of CANDIDATES) {
    const p = path.join(ROOT, c);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function load() {
  const p = findStorePath();
  if (!p) fail(t('noStore', CANDIDATES.join(', ')));
  const store = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(store.items)) fail(t('noItems', p));
  store._path = p;
  return store;
}

function save(store) {
  const { _path, ...data } = store;
  fs.writeFileSync(_path, JSON.stringify(data, null, 2) + '\n', 'utf8');
  regenInbox(store);
}

function findItem(store, id) {
  return store.items.find(it => String(it.id) === String(id)) || null;
}

// ── INBOX.md generation ──

function regenInbox(store) {
  const inboxPath = path.join(path.dirname(store._path), 'INBOX.md');
  const groups = {};
  for (const k of STATUS_ORDER) groups[k] = [];
  for (const it of store.items) (groups[normStatus(it.status)] || groups.idea).push(it);

  const lines = [];
  lines.push(t('inboxTitle'));
  lines.push('');
  lines.push(t('inboxNote'));
  lines.push(t('inboxSource', path.basename(store._path)));
  lines.push('');
  const c = {};
  for (const k of STATUS_ORDER) c[k] = groups[k].length;
  lines.push(t('inboxStats', c.idea, c.designed, c.planned, c.doing, c.done, c.dropped));
  lines.push('');

  for (const key of STATUS_ORDER) {
    const arr = groups[key];
    if (!arr.length) continue;
    lines.push(`## ${sLabel(key)}（${arr.length}）`);
    lines.push('');
    lines.push(t('inboxCols'));
    lines.push('|---|---|---|---|---|');
    for (const it of arr) {
      const tag = tLabel(it.tag);
      const links = (it.links || []).map(l => `[${l.label}](${l.href})`).join(' · ');
      const result = it.result
        ? [it.result.version, (it.result.commits || []).map(h => '`' + h + '`').join(','), it.result.summary].filter(Boolean).join(' · ')
        : (it.note || '');
      lines.push(`| ${it.id} | ${tag} | ${it.from} | ${it.text}${links ? ' · ' + links : ''} | ${it.created}${result ? ' · ' + result : ''} |`);
    }
    lines.push('');
  }
  fs.writeFileSync(inboxPath, lines.join('\n') + '\n', 'utf8');
}

// ── commands ──

function cmdInit() {
  const dir = path.join(ROOT, 'docs', 'feedback');
  const p = path.join(dir, 'feedback.json');
  if (fs.existsSync(p) && !A.bools.has('force')) fail(t('initExists', path.relative(ROOT, p)));
  fs.mkdirSync(dir, { recursive: true });
  const store = {
    _comment: t('initComment'),
    nextId: 1,
    items: [],
  };
  fs.writeFileSync(p, JSON.stringify(store, null, 2) + '\n', 'utf8');
  regenInbox({ ...store, _path: p });
  console.log(t('initDone', path.relative(ROOT, p)));
}

function cmdAdd(args) {
  const text = args.join(' ');
  if (!text) fail(t('addUsage'));
  const store = load();
  const item = {
    id: store.nextId++,
    text,
    from: flag('from', '?'),
    tag: flag('tag', 'other'),
    status: normStatus(flag('status', 'idea')),
    links: [],
    created: nowStamp(),
    updated: nowStamp(),
    note: null,
    result: null,
  };
  if (!(item.tag in TAG_LABEL)) fail(t('badTag', item.tag, Object.keys(TAG_LABEL).join(' / ')));
  if (!STATUS_ORDER.includes(item.status)) fail(t('badStatus', item.status));
  store.items.push(item);
  save(store);
  console.log(t('added', item.id, sLabel(item.status), item.from));
  console.log(`  ${item.text}`);
}

function cmdList() {
  const store = load();
  const fStatus = flag('status', '');
  const fFrom = flag('from', '');
  const fTag = flag('tag', '');
  let items = store.items;
  if (fStatus) items = items.filter(it => normStatus(it.status) === normStatus(fStatus));
  if (fFrom) items = items.filter(it => it.from === fFrom);
  if (fTag) items = items.filter(it => it.tag === fTag);
  if (!items.length) { console.log(t('listEmpty')); return; }
  console.log('');
  for (const it of items) {
    console.log(`  #${String(it.id).padEnd(4)} ${sLabel(normStatus(it.status))}  ${tLabel(it.tag)}  [${it.from}] ${it.text}`);
  }
  console.log(t('listFoot', items.length));
}

function cmdShow(args) {
  const store = load();
  const item = findItem(store, args[0]);
  if (!item) fail(t('noSuchFb', args[0]));
  console.log('');
  console.log(`  fb #${item.id} · ${sLabel(normStatus(item.status))}`);
  console.log(t('showText', item.text));
  console.log(t('showMeta', item.from, tLabel(item.tag)));
  console.log(t('showTimes', item.created, item.updated));
  for (const l of item.links || []) console.log(`  🔗 ${l.label} → ${l.href}`);
  if (item.note) console.log(t('showNote', item.note));
  if (item.result) {
    const r = item.result;
    console.log(t('showResult', [r.version, (r.commits || []).join(','), r.summary].filter(Boolean).join(' · ')));
  }
  console.log('');
}

function cmdPlan(args) {
  const store = load();
  const item = findItem(store, args[0]);
  if (!item) fail(t('noSuchFb', args[0]));
  const cur = normStatus(item.status);
  let next = flag('status', '');
  if (!next) {
    next = NEXT_STATUS[cur];
    if (!next) fail(t('noAutoNext', item.id, cur));
  }
  next = normStatus(next);
  if (!STATUS_ORDER.includes(next)) fail(t('badStatusList', next, STATUS_ORDER.join(' / ')));
  item.status = next;
  item.updated = nowStamp();
  save(store);
  console.log(t('planned', item.id, sLabel(cur), sLabel(next)));
  if (next === 'planned') console.log(t('planHint', item.id));
}

function cmdLink(args) {
  const store = load();
  const item = findItem(store, args[0]);
  if (!item) fail(t('noSuchFb', args[0]));
  const to = flag('to', '');
  const m = /^(.+)@(.+)$/.exec(to);
  if (!m) fail(t('linkUsage'));
  item.links = item.links || [];
  item.links.push({ label: m[1].trim(), href: m[2].trim() });
  item.updated = nowStamp();
  save(store);
  console.log(t('linked', item.id, m[1].trim(), m[2].trim()));
}

function cmdDone(args) {
  const store = load();
  const item = findItem(store, args[0]);
  if (!item) fail(t('noSuchFb', args[0]));
  item.status = 'done';
  item.updated = nowStamp();
  item.result = {
    version: flag('version', null),
    commits: flag('commit', '') ? flag('commit', '').split(',').map(s => s.trim()) : [],
    summary: flag('summary', null),
  };
  save(store);
  console.log(t('doneMsg', item.id, item.result.version ? ` · ${item.result.version}` : ''));
}

function cmdDrop(args) {
  const store = load();
  const item = findItem(store, args[0]);
  if (!item) fail(t('noSuchFb', args[0]));
  item.status = 'dropped';
  item.note = flag('reason', item.note);
  item.updated = nowStamp();
  save(store);
  console.log(t('droppedMsg', item.id, item.note ? t('dropReason', item.note) : ''));
}

// ── main ─────────────────────────────────────────────────────

function main() {
  const cmd = A.pos[0];
  const rest = A.pos.slice(1);
  if (!cmd || cmd === 'help') { console.log(t('help')); return; }
  const table = { init: cmdInit, add: cmdAdd, list: cmdList, show: cmdShow, plan: cmdPlan, link: cmdLink, done: cmdDone, drop: cmdDrop };
  if (!table[cmd]) fail(t('unknownCmd', cmd));
  table[cmd](rest);
}

main();
