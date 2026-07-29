#!/usr/bin/env node
// schedule.js · Version schedule + effort estimates (zero deps)
// ─────────────────────────────────────────────────────────────
// Reference implementation of the indie-keeper schedule room.
// Stores versions → items with start/due/estimate/dependsOn/confidence.
// The Gantt view in docs-site renders this file directly; this script
// is for adding/listing/bumping items from the CLI without hand-editing JSON.
//
// Storage: schedule.json (structured source of truth)
//
// Usage:
//   node schedule.js init                              create an empty schedule
//   node schedule.js add "<title>" --version v0.1 [--estimate 2] [--start 2026-08-01]
//                       [--due 2026-08-02] [--depends 0.1.1,0.1.2] [--confidence low]
//   node schedule.js list [--version v0.1] [--status todo|doing|done|blocked|dropped]
//   node schedule.js show <id>
//   node schedule.js bump <id> --status doing          change an item's status
//   node schedule.js edit <id> [--estimate 5] [--start ...] [--due ...] [--confidence high]
//   node schedule.js done <id>                         mark an item done
//   node schedule.js drop <id>                         mark an item dropped
//   node schedule.js gantt [--out schedule.svg]       export a standalone SVG Gantt
//   node schedule.js check                             validate deps/dates/ids
//
// All commands accept --root=<project root> (default: cwd) and --lang=<en|zh>
'use strict';

const fs = require('fs');
const path = require('path');
const { detectLang, makeT } = require('../lang');

// ── argv parsing ──
const VALUE_FLAGS = new Set(['root', 'version', 'estimate', 'start', 'due', 'depends', 'confidence', 'status', 'out', 'lang', 'title']);
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
const CANDIDATES = ['schedule.json', 'docs/schedule.json', '.docs/schedule.json'];

const lang = detectLang();

// ── labels ──
const VSTATUS = {
  planned: { en: '⬜ planned', zh: '⬜ 计划中' },
  'in-progress': { en: '🔧 in progress', zh: '🔧 进行中' },
  shipped: { en: '✅ shipped', zh: '✅ 已发' },
  paused: { en: '⏸ paused', zh: '⏸ 搁置' },
};
const ISTATUS = {
  todo: { en: '⬜ todo', zh: '⬜ 待办' },
  doing: { en: '🔧 doing', zh: '🔧 施工中' },
  done: { en: '✅ done', zh: '✅ 完成' },
  blocked: { en: '🚫 blocked', zh: '🚫 卡住' },
  dropped: { en: '⚪ dropped', zh: '⚪ 撤掉' },
};
function vsLabel(s) { return (VSTATUS[s] || {})[lang] || s; }
function isLabel(s) { return (ISTATUS[s] || {})[lang] || s; }

const MSG = {
  noFile: {
    en: '✗ no schedule.json found (run: schedule init)',
    zh: '✗ 没有 schedule.json（先跑：schedule init）',
  },
  usage: {
    en: 'usage: schedule <init|add|list|show|bump|edit|done|drop|gantt|check> [args]\n  see: schedule help',
    zh: '用法：schedule <init|add|list|show|bump|edit|done|drop|gantt|check> [参数]\n  详见：schedule help',
  },
  initDone: { en: '✓ created schedule.json (empty)', zh: '✓ 已创建 schedule.json（空）' },
  initExists: { en: '✗ schedule.json already exists — use --force to overwrite', zh: '✗ schedule.json 已存在 —— 加 --force 覆盖' },
  addNeedVersion: { en: '✗ --version is required (e.g. --version v0.1)', zh: '✗ 必须指定 --version（如 --version v0.1）' },
  addNeedTitle: { en: '✗ title is required', zh: '✗ 必须有标题' },
  addNoVersion: { en: '✗ version "{0}" not found in schedule', zh: '✗ 版本"{0}"不在 schedule 里' },
  addDone: { en: '✓ added {0} to {1}', zh: '✓ 已把 {0} 加进 {1}' },
  listHead: { en: '  {0} · {1} · milestone {2}', zh: '  {0} · {1} · 里程碑 {2}' },
  listHeadNoMs: { en: '  {0} · {1} · no milestone', zh: '  {0} · {1} · 无里程碑' },
  listItem: { en: '    {0} [{1}] {2} · {3}d · {4}→{5} · {6}', zh: '    {0} [{1}] {2} · {3}天 · {4}→{5} · {6}' },
  listItemNoDates: { en: '    {0} [{1}] {2} · {3}d · {4}', zh: '    {0} [{1}] {2} · {3}天 · {4}' },
  listEmpty: { en: '  (no items)', zh: '  （没有条目）' },
  showNotFound: { en: '✗ item "{0}" not found', zh: '✗ 找不到条目"{0}"' },
  bumpNeedStatus: { en: '✗ --status is required (todo|doing|done|blocked|dropped)', zh: '✗ 必须指定 --status（todo|doing|done|blocked|dropped）' },
  bumpDone: { en: '✓ {0}: {1} → {2}', zh: '✓ {0}：{1} → {2}' },
  editDone: { en: '✓ updated {0}', zh: '✓ 已更新 {0}' },
  noChange: { en: '  (no fields to update — use --estimate/--start/--due/--confidence)', zh: '  （没有要更新的字段 —— 用 --estimate/--start/--due/--confidence）' },
  doneAlready: { en: '✓ {0} already done', zh: '✓ {0} 已经是完成状态' },
  droppedAlready: { en: '✓ {0} already dropped', zh: '✓ {0} 已经撤掉' },
  ganttNoFile: { en: '✗ no schedule.json to render', zh: '✗ 没有 schedule.json 可渲染' },
  ganttWritten: { en: '✓ wrote {0}', zh: '✓ 已生成 {0}' },
  ganttEmpty: { en: '✗ schedule has no items to plot', zh: '✗ schedule 里没有条目可画' },
  checkOk: { en: '✓ schedule.json looks good', zh: '✓ schedule.json 没问题' },
  checkFail: { en: '✗ {0} problem(s) found:', zh: '✗ 发现 {0} 个问题：' },
  checkDupId: { en: '  · duplicate item id: {0}', zh: '  · 条目 id 重复：{0}' },
  checkBadDep: { en: '  · {0} depends on unknown id: {1}', zh: '  · {0} 依赖了不存在的 id：{1}' },
  checkDueBeforeStart: { en: '  · {0}: due {1} before start {2}', zh: '  · {0}：截止 {1} 早于开始 {2}' },
};
const t = makeT(MSG, lang);

// ── file helpers ──
function findStore() {
  for (const c of CANDIDATES) {
    const p = path.join(ROOT, c);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
function load() {
  const p = findStore();
  if (!p) { console.error(t('noFile')); process.exit(1); }
  return { path: p, data: JSON.parse(fs.readFileSync(p, 'utf8')) };
}
function save(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}
function emptySchedule() {
  return { version: 1, versions: [] };
}
function findVersion(data, vid) {
  return data.versions.find(v => v.id === vid);
}
function findItem(data, id) {
  for (const v of data.versions) {
    const it = v.items && v.items.find(x => x.id === id);
    if (it) return { item: it, version: v };
  }
  return null;
}
function nextItemId(version) {
  const prefix = version.id + '.';
  let max = 0;
  for (const it of version.items || []) {
    const m = new RegExp('^' + prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\d+)$').exec(it.id);
    if (m) max = Math.max(max, +m[1]);
  }
  return prefix + (max + 1);
}

// ── date helpers (no external deps; working with YYYY-MM-DD) ──
function parseDate(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}
function fmtDate(d) {
  if (!d) return '';
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function addDays(d, n) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}
function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

// ── commands ──
function cmdInit() {
  const force = A.bools.has('force');
  const target = path.join(ROOT, CANDIDATES[0]);
  if (fs.existsSync(target) && !force) { console.error(t('initExists')); process.exit(1); }
  save(target, emptySchedule());
  console.log(t('initDone'));
}

function cmdAdd() {
  const title = A.pos[0] || flag('title');
  const vid = flag('version');
  if (!vid) { console.error(t('addNeedVersion')); process.exit(1); }
  if (!title) { console.error(t('addNeedTitle')); process.exit(1); }
  const { path: p, data } = load();
  const v = findVersion(data, vid);
  if (!v) { console.error(t('addNoVersion', vid)); process.exit(1); }
  if (!v.items) v.items = [];
  const id = nextItemId(v);
  const depends = flag('depends') ? flag('depends').split(',').map(s => s.trim()).filter(Boolean) : [];
  const item = {
    id,
    title,
    estimate: flag('estimate') ? +flag('estimate') : null,
    dependsOn: depends,
    status: 'todo',
    confidence: flag('confidence', 'high'),
  };
  if (flag('start')) item.start = flag('start');
  if (flag('due')) item.due = flag('due');
  v.items.push(item);
  save(p, data);
  console.log(t('addDone', id, vid));
}

function cmdList() {
  const { data } = load();
  const vid = flag('version');
  const statusFilter = flag('status');
  for (const v of data.versions) {
    if (vid && v.id !== vid) continue;
    if (v.milestone) console.log(t('listHead', v.id, v.title, v.milestone));
    else console.log(t('listHeadNoMs', v.id, v.title));
    const items = v.items || [];
    const shown = items.filter(it => !statusFilter || it.status === statusFilter);
    if (!shown.length) { console.log(t('listEmpty')); continue; }
    for (const it of shown) {
      const conf = it.confidence === 'low' ? (lang === 'zh' ? '低把握' : 'low') : (lang === 'zh' ? '高把握' : 'high');
      if (it.start && it.due) console.log(t('listItem', it.id, isLabel(it.status), it.title, it.estimate || '?', it.start, it.due, conf));
      else console.log(t('listItemNoDates', it.id, isLabel(it.status), it.title, it.estimate || '?', conf));
    }
  }
}

function cmdShow() {
  const id = A.pos[0];
  const found = findItem(load().data, id);
  if (!found) { console.error(t('showNotFound', id)); process.exit(1); }
  const { item, version } = found;
  console.log(`  ${item.id} · ${item.title}`);
  console.log(`  version: ${version.id} (${version.title})`);
  console.log(`  status: ${isLabel(item.status)}`);
  console.log(`  estimate: ${item.estimate != null ? item.estimate + 'd' : '—'}`);
  if (item.start) console.log(`  start: ${item.start}`);
  if (item.due) console.log(`  due: ${item.due}`);
  console.log(`  confidence: ${item.confidence || 'high'}`);
  if (item.dependsOn && item.dependsOn.length) console.log(`  depends on: ${item.dependsOn.join(', ')}`);
}

function cmdBump() {
  const id = A.pos[0];
  const newStatus = flag('status');
  if (!newStatus) { console.error(t('bumpNeedStatus')); process.exit(1); }
  const { path: p, data } = load();
  const found = findItem(data, id);
  if (!found) { console.error(t('showNotFound', id)); process.exit(1); }
  const old = found.item.status || 'todo';
  found.item.status = newStatus;
  save(p, data);
  console.log(t('bumpDone', id, isLabel(old), isLabel(newStatus)));
}

function cmdEdit() {
  const id = A.pos[0];
  const { path: p, data } = load();
  const found = findItem(data, id);
  if (!found) { console.error(t('showNotFound', id)); process.exit(1); }
  const it = found.item;
  let changed = false;
  if (flag('estimate') != null) { it.estimate = +flag('estimate'); changed = true; }
  if (flag('start')) { it.start = flag('start'); changed = true; }
  if (flag('due')) { it.due = flag('due'); changed = true; }
  if (flag('confidence')) { it.confidence = flag('confidence'); changed = true; }
  if (flag('title')) { it.title = flag('title'); changed = true; }
  if (flag('depends')) { it.dependsOn = flag('depends').split(',').map(s => s.trim()).filter(Boolean); changed = true; }
  if (!changed) { console.log(t('noChange')); return; }
  save(p, data);
  console.log(t('editDone', id));
}

function cmdDone() {
  const id = A.pos[0];
  const { path: p, data } = load();
  const found = findItem(data, id);
  if (!found) { console.error(t('showNotFound', id)); process.exit(1); }
  if (found.item.status === 'done') { console.log(t('doneAlready', id)); return; }
  found.item.status = 'done';
  save(p, data);
  console.log(t('bumpDone', id, isLabel('todo'), isLabel('done')));
}

function cmdDrop() {
  const id = A.pos[0];
  const { path: p, data } = load();
  const found = findItem(data, id);
  if (!found) { console.error(t('showNotFound', id)); process.exit(1); }
  if (found.item.status === 'dropped') { console.log(t('droppedAlready', id)); return; }
  found.item.status = 'dropped';
  save(p, data);
  console.log(t('bumpDone', id, isLabel('todo'), isLabel('dropped')));
}

function cmdCheck() {
  const { data } = load();
  const problems = [];
  const seenIds = new Set();
  const allIds = new Set();
  for (const v of data.versions) {
    for (const it of v.items || []) {
      allIds.add(it.id);
      if (seenIds.has(it.id)) problems.push(t('checkDupId', it.id));
      seenIds.add(it.id);
    }
  }
  for (const v of data.versions) {
    for (const it of v.items || []) {
      for (const dep of it.dependsOn || []) {
        if (!allIds.has(dep)) problems.push(t('checkBadDep', it.id, dep));
      }
      if (it.start && it.due) {
        const s = parseDate(it.start), d = parseDate(it.due);
        if (s && d && d < s) problems.push(t('checkDueBeforeStart', it.id, it.due, it.start));
      }
    }
  }
  if (!problems.length) { console.log(t('checkOk')); process.exit(0); }
  console.error(t('checkFail', problems.length));
  for (const p of problems) console.error(p);
  process.exit(1);
}

// ── Gantt SVG export (standalone file) ──
// The docs-site in-place Gantt is a separate renderer that shares the layout
// math with this function; keep them in sync if you change spacing here.
function cmdGantt() {
  const { data } = load();
  if (!data.versions.length || !data.versions.some(v => (v.items || []).length)) {
    console.error(t('ganttEmpty')); process.exit(1);
  }
  const out = flag('out', 'schedule.svg');
  const svg = renderGanttSVG(data);
  fs.writeFileSync(path.resolve(ROOT, out), svg);
  console.log(t('ganttWritten', out));
}

// Shared Gantt layout — docs-site.js imports this to render the in-place view.
// Returns an SVG string. Pure function, no I/O.
function renderGanttSVG(data) {
  // Collect all dated items to compute the time range
  const dated = [];
  const milestones = [];
  for (const v of data.versions) {
    if (v.milestone) milestones.push({ date: parseDate(v.milestone), label: v.id });
    for (const it of v.items || []) {
      if (it.start && it.due) {
        dated.push({ item: it, version: v, start: parseDate(it.start), due: parseDate(it.due) });
      }
    }
  }

  // If nothing has dates, fall back to a sequential layout by estimate
  if (!dated.length) {
    return renderSequentialGantt(data);
  }

  // Compute date range
  let minDate = dated[0].start;
  let maxDate = dated[0].due;
  for (const d of dated) {
    if (d.start < minDate) minDate = d.start;
    if (d.due > maxDate) maxDate = d.due;
  }
  for (const m of milestones) {
    if (m.date < minDate) minDate = m.date;
    if (m.date > maxDate) maxDate = m.date;
  }
  // Pad by a day on each side
  minDate = addDays(minDate, -1);
  maxDate = addDays(maxDate, 1);
  const totalDays = daysBetween(minDate, maxDate) + 1;

  // Layout constants
  const ROW_H = 26;
  const LABEL_W = 200;
  const DAY_W = 22;
  const HEADER_H = 40;
  const GROUP_H = 22;
  const W = LABEL_W + totalDays * DAY_W + 20;
  let rows = [];
  // Build rows grouped by version
  for (const v of data.versions) {
    rows.push({ type: 'group', label: `${v.id} · ${v.title}`, version: v });
    for (const it of v.items || []) {
      if (it.status === 'dropped') continue;
      rows.push({ type: 'item', item: it, version: v });
    }
  }
  const H = HEADER_H + rows.length * ROW_H + 20;

  // SVG building (string concat — no deps)
  const parts = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="12">`);
  parts.push(`<rect width="${W}" height="${H}" fill="#fafafa"/>`);

  // Date header (week markers)
  for (let i = 0; i < totalDays; i++) {
    const d = addDays(minDate, i);
    const x = LABEL_W + i * DAY_W;
    if (d.getDay() === 1) {
      // Monday: draw a week divider + label
      parts.push(`<line x1="${x}" y1="${HEADER_H}" x2="${x}" y2="${H}" stroke="#e0e0e0" stroke-width="1"/>`);
      const label = `${d.getMonth() + 1}/${d.getDate()}`;
      parts.push(`<text x="${x + 3}" y="16" fill="#888" font-size="10">${label}</text>`);
    }
    if (d.getDay() === 0 || d.getDay() === 6) {
      parts.push(`<rect x="${x}" y="${HEADER_H}" width="${DAY_W}" height="${H - HEADER_H}" fill="#f0f0f0"/>`);
    }
  }

  // Milestone vertical lines (drawn before bars so bars sit on top)
  for (const m of milestones) {
    const dayIdx = daysBetween(minDate, m.date);
    if (dayIdx < 0 || dayIdx >= totalDays) continue;
    const x = LABEL_W + dayIdx * DAY_W + DAY_W / 2;
    parts.push(`<line x1="${x}" y1="${HEADER_H}" x2="${x}" y2="${H - 10}" stroke="#d97706" stroke-width="1.5" stroke-dasharray="4 3"/>`);
    parts.push(`<polygon points="${x - 5},${HEADER_H - 8} ${x + 5},${HEADER_H - 8} ${x},${HEADER_H}" fill="#d97706"/>`);
    parts.push(`<text x="${x + 7}" y="${HEADER_H - 4}" fill="#d97706" font-size="10" font-weight="bold">${m.label} ★</text>`);
  }

  // Rows
  let y = HEADER_H;
  for (const row of rows) {
    if (row.type === 'group') {
      parts.push(`<rect x="0" y="${y}" width="${W}" height="${ROW_H}" fill="#eef2ff"/>`);
      parts.push(`<text x="10" y="${y + 16}" font-weight="bold" fill="#3730a3">${escapeXml(row.label)}</text>`);
      y += ROW_H;
      continue;
    }
    const it = row.item;
    const itemId = escapeXml(it.id);
    const itemTitle = escapeXml(it.title);
    // Label — clickable, matches the bar
    parts.push(`<text x="10" y="${y + 16}" fill="#333" class="gantt-label" data-item-id="${itemId}" style="cursor:pointer;text-decoration:underline;text-decoration-color:transparent">${it.id + ' · ' + itemTitle}</text>`);
    if (it.start && it.due) {
      const s = parseDate(it.start), d = parseDate(it.due);
      const startIdx = daysBetween(minDate, s);
      const endIdx = daysBetween(minDate, d);
      const x = LABEL_W + startIdx * DAY_W;
      const w = Math.max(DAY_W, (endIdx - startIdx + 1) * DAY_W);
      const fill = it.status === 'done' ? '#9ca3af' : it.status === 'doing' ? '#3b82f6' : it.status === 'blocked' ? '#ef4444' : '#60a5fa';
      const strokeDash = it.confidence === 'low' ? ' stroke-dasharray="3 2"' : '';
      // Bar carries data-item-id so the frontend can open a detail card on click
      parts.push(`<rect x="${x}" y="${y + 4}" width="${w}" height="${ROW_H - 8}" fill="${fill}" fill-opacity="0.5" stroke="${fill}"${strokeDash} rx="3" class="gantt-bar" data-item-id="${itemId}" data-version="${escapeXml(row.version.id)}" style="cursor:pointer"/>`);
    } else {
      // No dates — clickable dot
      parts.push(`<circle cx="${LABEL_W + 10}" cy="${y + ROW_H / 2}" r="4" fill="#9ca3af" class="gantt-bar" data-item-id="${itemId}" data-version="${escapeXml(row.version.id)}" style="cursor:pointer"/>`);
      parts.push(`<text x="${LABEL_W + 20}" y="${y + 16}" fill="#666" font-style="italic" font-size="10">${lang === 'zh' ? '无日期' : 'no dates'}</text>`);
    }
    y += ROW_H;
  }

  // Legend
  const legendY = H - 8;
  let lx = 10;
  const legend = [
    { color: '#60a5fa', label: lang === 'zh' ? '待办' : 'todo' },
    { color: '#3b82f6', label: lang === 'zh' ? '施工中' : 'doing' },
    { color: '#9ca3af', label: lang === 'zh' ? '完成' : 'done' },
    { color: '#ef4444', label: lang === 'zh' ? '卡住' : 'blocked' },
    { color: '#d97706', label: lang === 'zh' ? '里程碑' : 'milestone' },
  ];
  for (const l of legend) {
    parts.push(`<rect x="${lx}" y="${legendY - 8}" width="10" height="8" fill="${l.color}" fill-opacity="0.5" stroke="${l.color}"/>`);
    parts.push(`<text x="${lx + 13}" y="${legendY - 1}" font-size="10" fill="#555">${l.label}</text>`);
    lx += 80;
  }

  parts.push(`</svg>`);
  return parts.join('\n');
}

// Sequential Gantt (no dates) — bars laid out by order, width = estimate
function renderSequentialGantt(data) {
  const ROW_H = 26;
  const LABEL_W = 200;
  const UNIT_W = 30; // 1 day = 30px
  const HEADER_H = 30;
  let rows = [];
  let maxRowWidth = 0;
  for (const v of data.versions) {
    rows.push({ type: 'group', label: `${v.id} · ${v.title}`, version: v });
    let cursor = 0;
    for (const it of v.items || []) {
      if (it.status === 'dropped') continue;
      const w = Math.max(1, it.estimate || 1) * UNIT_W;
      rows.push({ type: 'item', item: it, version: v, seqStart: cursor, seqWidth: w });
      cursor += w;
    }
    if (cursor > maxRowWidth) maxRowWidth = cursor;
  }
  const W = LABEL_W + maxRowWidth + 20;
  const H = HEADER_H + rows.length * ROW_H + 20;
  const parts = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="12">`);
  parts.push(`<rect width="${W}" height="${H}" fill="#fafafa"/>`);
  parts.push(`<text x="${LABEL_W + 10}" y="20" fill="#888" font-size="10">${lang === 'zh' ? '顺序视图（无日期）' : 'sequential view (no dates)'}</text>`);
  let y = HEADER_H;
  for (const row of rows) {
    if (row.type === 'group') {
      parts.push(`<rect x="0" y="${y}" width="${W}" height="${ROW_H}" fill="#eef2ff"/>`);
      parts.push(`<text x="10" y="${y + 16}" font-weight="bold" fill="#3730a3">${escapeXml(row.label)}</text>`);
      y += ROW_H;
      continue;
    }
    const it = row.item;
    const itemId = escapeXml(it.id);
    parts.push(`<text x="10" y="${y + 16}" fill="#333" class="gantt-label" data-item-id="${itemId}" style="cursor:pointer">${escapeXml(it.id + ' · ' + it.title)}</text>`);
    const x = LABEL_W + row.seqStart;
    const fill = it.status === 'done' ? '#9ca3af' : it.status === 'doing' ? '#3b82f6' : it.status === 'blocked' ? '#ef4444' : '#60a5fa';
    const strokeDash = it.confidence === 'low' ? ' stroke-dasharray="3 2"' : '';
    parts.push(`<rect x="${x}" y="${y + 4}" width="${row.seqWidth}" height="${ROW_H - 8}" fill="${fill}" fill-opacity="0.5" stroke="${fill}"${strokeDash} rx="3" class="gantt-bar" data-item-id="${itemId}" data-version="${escapeXml(row.version.id)}" style="cursor:pointer"/>`);
    parts.push(`<text x="${x + 4}" y="${y + 16}" font-size="10" fill="#fff">${it.estimate || '?'}d</text>`);
    y += ROW_H;
  }
  parts.push(`</svg>`);
  return parts.join('\n');
}

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
}

// Flatten all items across versions into a single list, each carrying its
// version id + title + a best-guess sprint file path. Used by docs-site.js
// to power the click-a-bar-see-details interaction without re-parsing JSON
// on the frontend.
function collectItems(data) {
  const out = [];
  if (!data || !Array.isArray(data.versions)) return out;
  for (const v of data.versions) {
    for (const it of v.items || []) {
      if (it.status === 'dropped') continue;
      out.push({
        id: it.id,
        title: it.title,
        version: v.id,
        versionTitle: v.title,
        versionStatus: v.status,
        versionMilestone: v.milestone || null,
        estimate: it.estimate || null,
        start: it.start || null,
        due: it.due || null,
        dependsOn: it.dependsOn || [],
        status: it.status,
        confidence: it.confidence || 'high',
        note: it._note || null,
        // sprint file guess: docs/sprints/N.md where N is parsed from version id
        // "v1.1" → 1, "v0.2" → 2 (just the minor); if version is "1.0" → 1
        sprintFile: guessSprintFile(v.id),
      });
    }
  }
  return out;
}

function guessSprintFile(versionId) {
  const m = /v?(\d+)\.(\d+)/i.exec(versionId || '');
  if (!m) return null;
  const sprintNum = parseInt(m[2], 10); // minor version = sprint number is the convention
  return `docs/sprints/${sprintNum}.md`;
}

// Export renderGanttSVG so docs-site.js can require it for the in-place view
module.exports = { renderGanttSVG, collectItems };

// ── dispatch ──
function printUsage() { console.log(t('usage')); }

function main() {
  const cmd = A.pos[0] || '';
  const rest = A.pos.slice(1);
  A.pos = rest;
  switch (cmd) {
    case 'init': cmdInit(); break;
    case 'add': cmdAdd(); break;
    case 'list': case 'ls': cmdList(); break;
    case 'show': cmdShow(); break;
    case 'bump': cmdBump(); break;
    case 'edit': cmdEdit(); break;
    case 'done': cmdDone(); break;
    case 'drop': cmdDrop(); break;
    case 'gantt': cmdGantt(); break;
    case 'check': cmdCheck(); break;
    case 'help': case '--help': case '': printUsage(); break;
    default: console.error(t('usage')); process.exit(1);
  }
}

// Only run main() when invoked directly, not when required (docs-site.js
// imports renderGanttSVG for the in-place Gantt view).
if (require.main === module) main();
