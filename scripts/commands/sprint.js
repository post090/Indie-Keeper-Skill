#!/usr/bin/env node
// sprint.js · Shipping Dock: sprint acceptance checklist (zero deps)
// ─────────────────────────────────────────────────────────────
// Reference implementation of the indie-keeper Shipping Dock.
// ROADMAP owns the future, sprints own the present: start a sprint
// when a version begins, every task carries acceptance criteria,
// each gets signed off (with a record of who nodded), archive on release.
//
// Files: docs/sprints/N.md (markdown + frontmatter, human-readable)
// Rigor: sprint.rigor in keeper-profile.json (light | strict, default light)
//   light   items need: title + acceptance
//   strict  items need: title + acceptance(≥2 scenarios) + impl + testing + risk + self-doubt(question)
// Sign-off trail: approve writes approvedBy (self / agent:name / human:name) — a record, not a gate.
//
// Usage:
//   node sprint.js new "<title>" [--version v0.5]    start a sprint
//   node sprint.js list                              all sprints at a glance
//   node sprint.js show [N]                          details (default: active sprint)
//   node sprint.js add "<title>" [--accept "case1 · case2"] [--from "fb #6"]
//   node sprint.js approve <id> [--by human:iseik]   sign one off (default by self)
//   node sprint.js drop <id> [--reason "..."]        cut one
//   node sprint.js lint [N]                          quality scan: missing fields / vague words
//   node sprint.js close [--version vX.Y.Z]          archive the active sprint
//
// All commands accept --root=<project root> and --lang=<en|zh>
'use strict';

const fs = require('fs');
const path = require('path');
const { detectLang, makeT } = require('../lang');

// ── argv parsing ──
const VALUE_FLAGS = new Set(['root', 'version', 'accept', 'from', 'by', 'reason', 'impl', 'test', 'risk', 'ask', 'lang']);
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
const DIR = path.join(ROOT, 'docs', 'sprints');

const lang = detectLang();

// ── item field names are bilingual on disk ──
// Files written in either language stay lint-able: writes use the current
// language, reads accept both spellings.
const FIELDS = {
  accept: { en: 'accept', zh: '验收' },
  impl: { en: 'impl', zh: '实现' },
  test: { en: 'testing', zh: '测法' },
  risk: { en: 'risk', zh: '风险' },
  ask: { en: 'self-doubt', zh: '反诘' },
  from: { en: 'source', zh: '来源' },
  wires: { en: 'wires', zh: '接线' },
  cut: { en: 'cut', zh: '已砍' },
};
function fName(key) { return FIELDS[key][lang]; }
function getField(it, key) { return it.fields[FIELDS[key].en] ?? it.fields[FIELDS[key].zh]; }
function setField(it, key, v) { it.fields[fName(key)] = v; }

const MSG = {
  newUsage: { en: 'Usage: sprint.js new "<title>" [--version v0.5]', zh: '用法：sprint.js new "<标题>" [--version v0.5]' },
  stillOpen: { en: 'sprint {0} ({1}) is still in progress. Close it first, or just add into it.', zh: 'sprint {0}（{1}）还在进行中。先 close 它，或直接往里 add。' },
  started: { en: '✓ sprint {0} started: {1}', zh: '✓ sprint {0} 已开工：{1}' },
  startedVer: { en: ' · targeting {0}', zh: ' · 目标 {0}' },
  startedHint: { en: '  add tasks: sprint.js add "<title>" --accept "case1 · case2"', zh: '  加任务：sprint.js add "<标题>" --accept "场景1 · 场景2"' },
  noSprints: { en: '(no sprints yet · start one with sprint.js new)', zh: '（还没有 sprint · sprint.js new 起一个）' },
  noSuchSprint: { en: 'No sprint {0}', zh: '没有 sprint {0}' },
  noActive: { en: 'No sprint in progress', zh: '没有进行中的 sprint' },
  noActiveNew: { en: 'No sprint in progress. Run sprint.js new first.', zh: '没有进行中的 sprint。先 sprint.js new。' },
  pendingHead: { en: '  pending:', zh: '  待验收：' },
  approvedHead: { en: '  accepted:', zh: '  已验收：' },
  addUsage: { en: 'Usage: sprint.js add "<title>" [--accept "case1 · case2"] [--from "fb #6"]', zh: '用法：sprint.js add "<标题>" [--accept "场景1 · 场景2"] [--from "fb #6"]' },
  addedTo: { en: '✓ {0} · {1} added to sprint {2}', zh: '✓ {0} · {1} 已加入 sprint {2}' },
  noAccept: { en: '  ⚠ no acceptance criteria yet (--accept) · lint will flag it', zh: '  ⚠ 还没写验收标准（--accept）· lint 会报' },
  strictNeeds: { en: '  strict rigor also wants: --impl --test --risk --ask (lint checks them)', zh: '  strict 档还需要：--impl --test --risk --ask（lint 会查）' },
  approveUsage: { en: 'Usage: sprint.js approve <id> [--by human:iseik]', zh: '用法：sprint.js approve <id> [--by human:小车]' },
  notPending: { en: '{0} is not in the pending list (run show to see it)', zh: '待验收里没有 {0}（show 看当前清单）' },
  lintWarn: { en: '  ⚠ {0} has lint problems (approving anyway · informational only):', zh: '  ⚠ {0} 有质检问题（照常验收·仅提示）：' },
  approved: { en: '✓ {0} · {1} accepted ✍{2}', zh: '✓ {0} · {1} 已验收 ✍{2}' },
  allDone: { en: '  🎉 sprint {0} fully accepted · ready to close', zh: '  🎉 sprint {0} 全部验收完 · 可以 close 了' },
  dropUsage: { en: 'Usage: sprint.js drop <id> [--reason "..."]', zh: '用法：sprint.js drop <id> [--reason "..."]' },
  notPendingShort: { en: '{0} is not in the pending list', zh: '待验收里没有 {0}' },
  noReason: { en: '(no reason recorded)', zh: '（未留原因）' },
  droppedMsg: { en: '✓ {0} cut', zh: '✓ {0} 已砍' },
  droppedReason: { en: ' · reason: {0}', zh: ' · 原因：{0}' },
  wireMissing: { en: 'wires: {0} does not exist — was it ever actually hooked up?', zh: '「接线」写的 {0} 不存在——是不是根本没接上？' },
  wireNoSymbol: { en: 'wires: "{1}" not found in {0} — double-check it is really wired in', zh: '「接线」在 {0} 里找不到"{1}"——检查一下是不是没真的接进去' },
  missAccept: { en: 'missing acceptance field (how do we know it is done?)', zh: '缺「验收」字段（怎么算做完？）' },
  fewScenarios: { en: 'fewer than 2 acceptance scenarios (strict rigor · separate with ·)', zh: '验收场景少于 2 个（strict 档 · 用 · 分隔多场景）' },
  missField: { en: 'missing "{0}" field (strict rigor)', zh: '缺「{0}」字段（strict 档）' },
  askNotQuestion: { en: 'self-doubt must be a question (self-challenge ending with ?)', zh: '「反诘」必须是疑问句（以 ? 结尾的自我质疑）' },
  vagueWord: { en: '"{0}" contains the vague phrase "{1}" (be specific: what changed, which file, which scenario)', zh: '「{0}」含敷衍词"{1}"（写具体：改了什么、动了哪个文件、什么场景）' },
  lintHead: { en: '\nsprint {0} lint ({1} rigor)\n', zh: '\nsprint {0} 质检（{1} 档）\n' },
  lintTotal: { en: '\n  {0} problem(s) in total\n', zh: '\n  共 {0} 个问题\n' },
  lintClean: { en: '\n  ✓ all clean\n', zh: '\n  ✓ 全部干净\n' },
  closePending: { en: '  ⚠ {0} item(s) still pending:', zh: '  ⚠ 还有 {0} 条待验收：' },
  closeBlocked: { en: 'approve or drop everything before closing', zh: '全部 approve 或 drop 后再 close' },
  closed: { en: '✓ sprint {0} archived', zh: '✓ sprint {0} 已归档' },
  closedVer: { en: ' · shipping with {0}', zh: ' · 随 {0} 发货' },
  closeHint: { en: '  do not forget: tick ✅ on the ROADMAP version · backfill finished fb items (feedback.js done) · deal with HANDOFF.md (archive to docs/sprints/_archive/ or delete it)', zh: '  别忘了：ROADMAP 对应版本标 ✅ · 意见箱把做完的 fb 回填（feedback.js done）· 处理 HANDOFF.md（归档进 docs/sprints/_archive/ 或删掉）' },
  unknownCmd: { en: 'Unknown command "{0}", see sprint.js help', zh: '未知命令"{0}"，看 sprint.js help' },
  help: {
    en: `sprint.js · sprint acceptance checklist (ROADMAP owns the future · sprints own the present)

  sprint.js new "<title>" [--version v0.5]   start a sprint
  sprint.js list / show [N]                  summary / details
  sprint.js add "<title>" --accept "case1 · case2" [--from "fb #6"]
  sprint.js approve <id> [--by human:name]   sign off (records approvedBy · default self)
  sprint.js drop <id> [--reason "..."]       cut an item
  sprint.js lint [N]                         quality scan (missing fields/vague words · exit 1 on problems)
  sprint.js close [--version vX.Y.Z]         archive + backfill ship version

  Rigor: keeper-profile.json → sprint.rigor (light = title+acceptance · strict = all fields + self-doubt)
  Files: docs/sprints/N.md (markdown · directly human-editable)
`,
    zh: `sprint.js · Sprint 验收清单（ROADMAP 管未来 · Sprint 管现在）

  sprint.js new "<标题>" [--version v0.5]    起新 sprint
  sprint.js list / show [N]                  摘要 / 详情
  sprint.js add "<标题>" --accept "场景1 · 场景2" [--from "fb #6"]
  sprint.js approve <id> [--by human:某人]    验收（留痕 approvedBy · 默认 self）
  sprint.js drop <id> [--reason "..."]        砍单
  sprint.js lint [N]                          质检（缺字段/敷衍词 · 有问题 exit 1）
  sprint.js close [--version vX.Y.Z]          归档 + 回填 ship 版本

  严格度：keeper-profile.json → sprint.rigor（light=标题+验收 · strict=全字段+反诘）
  文件：docs/sprints/N.md（markdown · 人可直接读改）
`,
  },
};
const t = makeT(MSG, lang);

function fail(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function pad(n) { return n < 10 ? '0' + n : '' + n; }
function today() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

// ── rigor (keeper-profile.json) ──

function loadRigor() {
  try {
    const p = path.join(ROOT, 'keeper-profile.json');
    if (fs.existsSync(p)) {
      const prof = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (prof.sprint && prof.sprint.rigor === 'strict') return 'strict';
    }
  } catch { /* unreadable → default */ }
  return 'light';
}

// ── frontmatter (minimal YAML: key: value) ──

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

function parseFm(content) {
  const m = content.match(FM_RE);
  if (!m) return { fm: {}, body: content };
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const c = line.indexOf(':');
    if (c < 0) continue;
    const k = line.slice(0, c).trim();
    const v = line.slice(c + 1).trim();
    fm[k] = v === 'null' ? null : v;
  }
  return { fm, body: m[2] };
}

function fmText(fm) {
  return '---\n' + Object.entries(fm).map(([k, v]) => `${k}: ${v === null ? 'null' : v}`).join('\n') + '\n---\n';
}

// ── sprint file I/O ──

function listNumbers() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter(f => /^\d+\.md$/.test(f)).map(f => parseInt(f, 10)).sort((a, b) => a - b);
}

// Item format:
// - [ ] N.M · title
//   - accept: case1 · case2       (or 验收：… — both spellings parse)
//   - impl: …        (strict)
//   - testing: …     (strict)
//   - risk: …        (strict)
//   - self-doubt: …? (strict · must be a question)
//   - source: fb #6
//   - approvedBy: human:iseik (written on approve)
//   - ship: vX.Y.Z (written on close)
function parseItems(body) {
  const pending = [], approved = [];
  let bucket = null, cur = null;
  for (const line of body.split(/\r?\n/)) {
    if (/^##\s*(待验收|pending)/i.test(line)) { bucket = pending; cur = null; continue; }
    if (/^##\s*(已验收|accepted)/i.test(line)) { bucket = approved; cur = null; continue; }
    if (/^##/.test(line)) { bucket = null; cur = null; continue; }
    if (!bucket) continue;
    const item = line.match(/^- \[([ x])\]\s+(\S+)\s*·\s*(.*)$/);
    if (item) {
      cur = { id: item[2], title: item[3].trim(), checked: item[1] === 'x', fields: {} };
      bucket.push(cur);
      continue;
    }
    const field = cur && line.match(/^\s+-\s*([^：:]+)[：:]\s*(.*)$/);
    if (field) cur.fields[field[1].trim()] = field[2].trim();
  }
  return { pending, approved };
}

function readSprint(n) {
  const file = path.join(DIR, `${n}.md`);
  if (!fs.existsSync(file)) return null;
  const { fm, body } = parseFm(fs.readFileSync(file, 'utf8'));
  return { n, file, fm, body, items: parseItems(body) };
}

function findCurrent() {
  const nums = listNumbers();
  for (let i = nums.length - 1; i >= 0; i--) {
    const sp = readSprint(nums[i]);
    if (sp && sp.fm.status === 'in-progress') return sp;
  }
  return null;
}

function itemText(it) {
  const lines = [`- [${it.checked ? 'x' : ' '}] ${it.id} · ${it.title}`];
  for (const [k, v] of Object.entries(it.fields)) lines.push(`  - ${k}${lang === 'zh' ? '：' : ': '}${v}`);
  return lines.join('\n');
}

function writeSprint(sp) {
  const pendingText = sp.items.pending.map(itemText).join('\n');
  const approvedText = sp.items.approved.map(itemText).join('\n');
  const heads = lang === 'zh' ? ['待验收', '已验收'] : ['pending', 'accepted'];
  // keep existing section language when the file already uses one
  if (/^##\s*待验收/m.test(sp.body || '')) { heads[0] = '待验收'; heads[1] = '已验收'; }
  else if (/^##\s*pending/mi.test(sp.body || '')) { heads[0] = 'pending'; heads[1] = 'accepted'; }
  const body = `\n## ${heads[0]}\n\n${pendingText}${pendingText ? '\n' : ''}\n## ${heads[1]}\n\n${approvedText}${approvedText ? '\n' : ''}`;
  fs.writeFileSync(sp.file, fmText(sp.fm) + body, 'utf8');
}

// ── commands ──

function cmdNew(args) {
  const title = args.join(' ');
  if (!title) fail(t('newUsage'));
  const cur = findCurrent();
  if (cur) fail(t('stillOpen', cur.n, cur.fm.title));
  fs.mkdirSync(DIR, { recursive: true });
  const nums = listNumbers();
  const n = nums.length ? nums[nums.length - 1] + 1 : 1;
  const sp = {
    n, file: path.join(DIR, `${n}.md`),
    fm: { title, status: 'in-progress', version: flag('version', 'null'), started: today(), closed: null },
    items: { pending: [], approved: [] },
  };
  writeSprint(sp);
  console.log(t('started', n, title) + (flag('version', '') ? t('startedVer', flag('version', '')) : ''));
  console.log(t('startedHint'));
}

function cmdList() {
  const nums = listNumbers();
  if (!nums.length) { console.log(t('noSprints')); return; }
  console.log('');
  for (const n of nums) {
    const sp = readSprint(n);
    const total = sp.items.pending.length + sp.items.approved.length;
    const icon = sp.fm.status === 'in-progress' ? '🔧' : sp.fm.status === 'archived' ? '📦' : '❓';
    console.log(`  ${icon} sprint ${n} · ${sp.fm.title} [${sp.fm.status}] ${sp.items.approved.length}/${total}${sp.fm.version && sp.fm.version !== 'null' ? ` · ${sp.fm.version}` : ''}`);
  }
  console.log('');
}

function cmdShow(args) {
  const sp = args[0] ? readSprint(parseInt(args[0], 10)) : findCurrent();
  if (!sp) fail(args[0] ? t('noSuchSprint', args[0]) : t('noActive'));
  const total = sp.items.pending.length + sp.items.approved.length;
  console.log(`\nsprint ${sp.n} · ${sp.fm.title} [${sp.fm.status}] · ${sp.items.approved.length}/${total}\n`);
  if (sp.items.pending.length) {
    console.log(t('pendingHead'));
    for (const it of sp.items.pending) {
      console.log(`  [ ] ${it.id} · ${it.title}`);
      for (const [k, v] of Object.entries(it.fields)) console.log(`        ${k}: ${v}`);
    }
  }
  if (sp.items.approved.length) {
    console.log(t('approvedHead'));
    for (const it of sp.items.approved) {
      const by = it.fields['approvedBy'] ? ` ✍${it.fields['approvedBy']}` : '';
      console.log(`  [x] ${it.id} · ${it.title}${by}`);
    }
  }
  console.log('');
}

function cmdAdd(args) {
  const title = args.join(' ');
  if (!title) fail(t('addUsage'));
  const sp = findCurrent();
  if (!sp) fail(t('noActiveNew'));
  const seq = sp.items.pending.length + sp.items.approved.length + 1;
  const id = `${sp.n}.${seq}`;
  const it = { id, title, checked: false, fields: {} };
  if (flag('accept', '')) setField(it, 'accept', flag('accept', ''));
  if (flag('impl', '')) setField(it, 'impl', flag('impl', ''));
  if (flag('test', '')) setField(it, 'test', flag('test', ''));
  if (flag('risk', '')) setField(it, 'risk', flag('risk', ''));
  if (flag('ask', '')) setField(it, 'ask', flag('ask', ''));
  if (flag('from', '')) setField(it, 'from', flag('from', ''));
  sp.items.pending.push(it);
  writeSprint(sp);
  console.log(t('addedTo', id, title, sp.n));
  if (!getField(it, 'accept')) console.log(t('noAccept'));
  const rigor = loadRigor();
  if (rigor === 'strict') console.log(t('strictNeeds'));
}

function cmdApprove(args) {
  const id = args[0];
  if (!id) fail(t('approveUsage'));
  const sp = findCurrent();
  if (!sp) fail(t('noActive'));
  const i = sp.items.pending.findIndex(it => it.id === id);
  if (i < 0) fail(t('notPending', id));
  const it = sp.items.pending[i];
  // pre-approval lint (informational only · the trail is a record, not a gate)
  const problems = lintItem(it, loadRigor());
  if (problems.length) {
    console.log(t('lintWarn', id));
    for (const p of problems) console.log(`    - ${p}`);
  }
  it.checked = true;
  it.fields['approvedBy'] = flag('by', 'self');
  it.fields['approvedAt'] = today();
  sp.items.pending.splice(i, 1);
  sp.items.approved.push(it);
  writeSprint(sp);
  console.log(t('approved', id, it.title, it.fields['approvedBy']));
  if (!sp.items.pending.length) console.log(t('allDone', sp.n));
}

function cmdDrop(args) {
  const id = args[0];
  if (!id) fail(t('dropUsage'));
  const sp = findCurrent();
  if (!sp) fail(t('noActive'));
  const i = sp.items.pending.findIndex(it => it.id === id);
  if (i < 0) fail(t('notPendingShort', id));
  const it = sp.items.pending[i];
  setField(it, 'cut', flag('reason', t('noReason')));
  sp.items.pending.splice(i, 1);
  sp.items.approved.push({ ...it, checked: false, title: `~~${it.title}~~` });
  writeSprint(sp);
  console.log(t('droppedMsg', id) + (flag('reason', '') ? t('droppedReason', flag('reason', '')) : ''));
}

// ── lint ──

// Vague phrases: their presence means the field says nothing concrete
// (anti hand-waving; the zh list catches zh docs, the en list catches en docs)
const VAGUE = [
  '优化了', '完善了', '提升了体验', '增强了稳定性', '修复了相关问题', '调整了逻辑', '相关问题', '一些问题', '更好的', '若干', '等等',
  'improved the', 'optimized the', 'enhanced stability', 'fixed related issues', 'various issues', 'better experience', 'some issues', 'etc.',
];

// Wire check: an item declares where the feature actually plugs in
// ("wires: path/file.js:symbol", ; separates several, symbol optional) —
// guards against "AI says done, code was never hooked up".
function lintWires(it) {
  const wires = getField(it, 'wires');
  if (!wires) return [];
  const problems = [];
  for (const w of wires.split(/[;；]/).map(s => s.trim()).filter(Boolean)) {
    const colon = w.lastIndexOf(':');
    const file = colon > 1 ? w.slice(0, colon) : w;
    const symbol = colon > 1 ? w.slice(colon + 1) : '';
    const p = path.join(ROOT, file);
    if (!fs.existsSync(p)) { problems.push(t('wireMissing', file)); continue; }
    if (symbol && !fs.readFileSync(p, 'utf8').includes(symbol)) {
      problems.push(t('wireNoSymbol', file, symbol));
    }
  }
  return problems;
}

function lintItem(it, rigor) {
  const problems = [];
  const accept = getField(it, 'accept') || '';
  if (!accept) problems.push(t('missAccept'));
  else if (rigor === 'strict' && accept.split('·').length < 2) problems.push(t('fewScenarios'));
  if (rigor === 'strict') {
    for (const f of ['impl', 'test', 'risk', 'ask']) {
      if (!getField(it, f)) problems.push(t('missField', fName(f)));
    }
    const ask = getField(it, 'ask') || '';
    if (ask && !/[？?]$/.test(ask)) problems.push(t('askNotQuestion'));
  }
  problems.push(...lintWires(it));
  for (const [k, v] of Object.entries(it.fields)) {
    for (const w of VAGUE) {
      if (v.includes(w)) { problems.push(t('vagueWord', k, w)); break; }
    }
  }
  return problems;
}

function cmdLint(args) {
  const sp = args[0] ? readSprint(parseInt(args[0], 10)) : findCurrent();
  if (!sp) fail(args[0] ? t('noSuchSprint', args[0]) : t('noActive'));
  const rigor = loadRigor();
  console.log(t('lintHead', sp.n, rigor));
  let total = 0;
  for (const it of [...sp.items.pending, ...sp.items.approved]) {
    if (getField(it, 'cut')) continue;
    const problems = lintItem(it, rigor);
    if (!problems.length) { console.log(`  ✅ ${it.id} · ${it.title}`); continue; }
    total += problems.length;
    console.log(`  ⚠ ${it.id} · ${it.title}`);
    for (const p of problems) console.log(`     - ${p}`);
  }
  console.log(total ? t('lintTotal', total) : t('lintClean'));
  if (total) process.exit(1);
}

function cmdClose() {
  const sp = findCurrent();
  if (!sp) fail(t('noActive'));
  if (sp.items.pending.length) {
    console.log(t('closePending', sp.items.pending.length));
    for (const it of sp.items.pending) console.log(`    [ ] ${it.id} · ${it.title}`);
    fail(t('closeBlocked'));
  }
  const version = flag('version', '');
  sp.fm.status = 'archived';
  sp.fm.closed = today();
  if (version) {
    sp.fm.version = version;
    for (const it of sp.items.approved) if (!getField(it, 'cut')) it.fields['ship'] = version;
  }
  writeSprint(sp);
  console.log(t('closed', sp.n) + (version ? t('closedVer', version) : ''));
  console.log(t('closeHint'));
}

// ── main ──

function main() {
  const cmd = A.pos[0];
  const rest = A.pos.slice(1);
  if (!cmd || cmd === 'help') { console.log(t('help')); return; }
  const table = { new: cmdNew, list: cmdList, show: cmdShow, add: cmdAdd, approve: cmdApprove, drop: cmdDrop, lint: cmdLint, close: cmdClose };
  if (!table[cmd]) fail(t('unknownCmd', cmd));
  table[cmd](rest);
}

main();
