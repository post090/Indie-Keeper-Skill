#!/usr/bin/env node
// game-i18n.js · Game Text Desk: in-game text i18n management (zero deps)
// ─────────────────────────────────────────────────────────────
// Reference implementation of the indie-keeper Game Text Desk.
// Owns every player-facing string: UI buttons, item names, dialogue, tips.
// Four jobs:
//   scan      catch hardcoded strings that never made it into the dictionary
//   coverage  per-language dictionary coverage (who is missing how much)
//   drift     drift detection: source text changed, which translations lag behind
//   glossary  term check: "stamina" must not flip between Stamina and Energy
//
// Dictionary formats, pick one in the manifest:
//   json-per-lang  one JSON per language (assets/lang/zh.json …) · most home-grown setups
//   json-single    one file { "zh": {...}, "en": {...} }
//   csv            one CSV: key,zh,en,ja (Godot's officially recommended format)
//   Engine-managed projects (Ren'Py/Unreal): the dictionary is not ours —
//   only scan + glossary apply.
//
// Usage:
//   node game-i18n.js init                     generate a manifest draft
//   node game-i18n.js scan [--json]            hardcoded-string scan
//   node game-i18n.js coverage [--missing]     coverage
//   node game-i18n.js stamp <lang>             stamp finished translations (fingerprints)
//   node game-i18n.js drift [--check]          drift detection (--check for CI)
//   node game-i18n.js glossary [lint]          glossary / whole-dictionary term check
//
// Config: game-i18n-manifest.json · fingerprints: game-i18n-state.json (same dir, in git)
// All commands accept --root=<project root>; UI language via --ui-lang=<en|zh>
// (--lang is taken: it means a *target translation language* here)
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { detectLang, makeT } = require('../lang');

// ── argv parsing: both --name=value and --name value are accepted ──
const VALUE_FLAGS = new Set(['root', 'manifest', 'lang', 'source', 'text', 'key', 'ui-lang']);
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
function fail(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function hash(s) { return crypto.createHash('sha1').update(String(s), 'utf8').digest('hex').slice(0, 12); }

// UI language: --ui-lang wins because --lang means "target language" here
const uiLang = flag('ui-lang', '') ? (/^zh/i.test(flag('ui-lang', '')) ? 'zh' : 'en') : detectLang(['--none']);

const MSG = {
  noManifest: { en: 'game-i18n-manifest.json not found. Run game-i18n.js init to generate a draft.', zh: '没找到 game-i18n-manifest.json。先跑 game-i18n.js init 生成草稿。' },
  badManifest: { en: 'Manifest is missing sourceLang or langs', zh: 'manifest 缺 sourceLang 或 langs' },
  dictMissing: { en: 'Dictionary file not found: {0}', zh: '词典文件不存在：{0}' },
  badFormat: {
    en: 'Unknown dictionary format "{0}" (options: json-per-lang / json-single / csv).\n  Engine-managed projects omit the dictionary field; coverage/drift/stamp are then unavailable, scan and glossary still work.',
    zh: '词典格式"{0}"不认识（可选 json-per-lang / json-single / csv）。\n  引擎全托管的项目不配 dictionary，coverage/drift/stamp 不可用，scan 和 glossary 照常。',
  },
  scanNotConfigured: { en: 'scan.dirs / scan.exts in the manifest are empty — decide what to scan during onboarding first', zh: 'manifest 的 scan.dirs / scan.exts 是空的——先在问诊时定好扫哪' },
  scanHead: { en: '\nHardcoded-string scan · {0} file(s) scanned\n', zh: '\n硬编码文案扫描 · 扫了 {0} 个文件\n' },
  scanClean: { en: '  ✓ no hardcoded strings — every player-facing string lives in the dictionary\n', zh: '  ✓ 没发现硬编码文案——面向玩家的文字都进词典了\n' },
  scanFileCount: { en: '  {0} ({1} hit(s))', zh: '  {0}（{1} 处）' },
  scanLine: { en: '    line {0}: {1}', zh: '    第{0}行: {1}' },
  scanMore: { en: '    … {0} more', zh: '    …还有 {0} 处' },
  scanTotal: { en: '\n  {0} suspected hardcoded string(s) — foreign players cannot read these', zh: '\n  共 {0} 处疑似硬编码——这些文字外语玩家看不懂' },
  scanFix: { en: '  Fix: move into the dictionary + call the translation function · for strings that truly should not be translated (logs/debug), add the file to scan.skip in the manifest\n', zh: '  处理：挪进词典换成翻译函数调用 · 确实不该翻的（日志/调试）把文件加进 manifest 的 scan.skip\n' },
  covEmpty: { en: 'The {0} dictionary is empty — is the dictionary path right?', zh: '源语言 {0} 的词典是空的——词典路径配对了吗？' },
  covHead: { en: '\nDictionary coverage (baseline = {0} · {1} entries)\n', zh: '\n词典覆盖率（基准 = {0} · {1} 条）\n' },
  covMissing: { en: ' missing {0}', zh: ' 缺 {0}' },
  covExtra: { en: ' · {0} extra entr(y/ies) {1} does not have', zh: ' · 多 {0} 条 {1} 没有的' },
  covMissingHead: { en: '  entries {0} is missing:', zh: '  {0} 缺的条目：' },
  covMissingMore: { en: ' … {0} more', zh: ' …还有 {0} 条' },
  covHint: { en: '  See what is missing: game-i18n.js coverage --missing\n', zh: '  看缺哪些条：game-i18n.js coverage --missing\n' },
  stampUsage: { en: 'Usage: game-i18n.js stamp <lang> (stamp whichever language you just finished)', zh: '用法：game-i18n.js stamp <语言>（翻完哪个语言就给哪个语言记指纹）' },
  stampBadLang: { en: 'Language "{0}" is not in the manifest (or is the source language, which needs no stamp)', zh: '语言"{0}"不在 manifest 里（或就是源语言，不用记指纹）' },
  stamped: { en: '✓ {0}: stamped {1} entr(y/ies) (recorded "these translations are based on the current {2} text")', zh: '✓ {0} 记指纹 {1} 条（记下"这些译文基于当前这版 {2} 翻的"）' },
  stampNext: { en: '  from now on, whenever {0} text changes, drift can name the stale {1} entries', zh: '  以后 {0} 文案一改，drift 就能点名哪些 {1} 译文过期了' },
  driftHead: { en: '\nDrift detection (source text changed — did translations keep up?)\n', zh: '\n漂移检测（源文案改了，译文跟上没有）\n' },
  driftUnknown: { en: '  ❓ {0} → {1}: translated but never stamped', zh: '  ❓ {0} → {1}：有译文但没记过指纹' },
  driftStale: { en: '  ⚠ {0} → {1}: stale ({2} source changed) · current source="{3}"', zh: '  ⚠ {0} → {1}：过期（{2} 原文改过）· 现原文="{3}"' },
  driftMore: { en: '\n  … {0} more', zh: '\n  …还有 {0} 条' },
  driftTotals: { en: '  stale {0} · unstamped {1} · untranslated {2} (untranslated is coverage\'s job)', zh: '  过期 {0} · 没记指纹 {1} · 没翻 {2}（没翻的去看 coverage）' },
  driftClean: { en: '  ✓ every finished translation matches the current source text\n', zh: '  ✓ 所有已翻译文都和当前源文案对得上\n' },
  driftFix: { en: '  after re-translating, stamp again: game-i18n.js stamp <lang>\n', zh: '  补翻后重新记指纹：game-i18n.js stamp <语言>\n' },
  glMissing: { en: 'Glossary not found: {0} (copy templates/glossary.template.json)', zh: '术语表不存在：{0}（从 templates/glossary.template.json 抄一份）' },
  glNoTerms: { en: 'Glossary is missing the terms array', zh: '术语表缺 terms 数组' },
  glCheckUsage: { en: 'Usage: game-i18n.js glossary check --lang <L> --source "<source text>" --text "<translation>"', zh: '用法：game-i18n.js glossary check --lang <语言> --source "<原文>" --text "<译文>"' },
  glCheckWarn: { en: '  ⚠ source contains "{0}" but the translation never uses the canonical "{1}"{2}', zh: '  ⚠ 原文有「{0}」，译文里没见到标准译法「{1}」{2}' },
  glNote: { en: ' (note: {0})', zh: '（注：{0}）' },
  glCheckOk: { en: '✓ term usage matches the glossary', zh: '✓ 术语用法和术语表一致' },
  glCheckBad: { en: '{0} possible term inconsistenc(y/ies):\n', zh: '发现 {0} 处术语可能不一致：\n' },
  glLintWarn: { en: '  {0}: "{1}" should be "{2}", currently "{3}"', zh: '  {0}：「{1}」该译成「{2}」，现在是"{3}"' },
  glLintLang: { en: '\n[{0}] {1} inconsistent term(s):', zh: '\n【{0}】{1} 处术语不统一：' },
  glLintMore: { en: '\n  … {0} more', zh: '\n  …还有 {0} 条' },
  glLintOk: { en: '✓ terms consistent across the whole dictionary', zh: '✓ 全词典术语一致' },
  glLintBad: { en: '\n{0} in total — two names for the same thing confuses players', zh: '\n共 {0} 处——同一个东西俩叫法，玩家会懵' },
  glHead: { en: '\nGlossary ({0} term(s))\n', zh: '\n术语表（{0} 条）\n' },
  glMeaning: { en: '    what it is: {0}', zh: '    是什么：{0}' },
  glTermNote: { en: '    note: {0}', zh: '    注：{0}' },
  initExists: { en: 'game-i18n-manifest.json already exists (--force to overwrite)', zh: 'game-i18n-manifest.json 已存在（--force 覆盖）' },
  initComment: { en: 'Game Text Desk config · adapt after onboarding · see the indie-keeper Game Text Desk manual', zh: '游戏文案部配置 · 问诊后按项目实情改 · 说明见 indie-keeper 游戏文案部手册' },
  initFormats: { en: 'json-per-lang / json-single / csv · engine-managed projects delete this field', zh: 'json-per-lang / json-single / csv · 引擎全托管就删掉本字段' },
  initScanNote: { en: 'dirs=directories to scan · exts=file extensions · translationMarks=a line containing these already went through the translation function · skip=path prefixes never meant to be translated (logs/debug/dev tools)', zh: 'dirs=扫哪些目录 · exts=什么后缀 · translationMarks=行里出现这些就算已走翻译函数 · skip=不该翻的路径前缀（日志/调试/开发工具）' },
  initDone: { en: '✓ game-i18n-manifest.json draft generated', zh: '✓ 已生成 game-i18n-manifest.json 草稿' },
  initHint: { en: '  Adapt to the project: where the dictionary lives, its format, the translation function\'s name, what to scan', zh: '  按项目实情改：词典在哪、什么格式、翻译函数叫什么、扫哪些目录' },
  unknownCmd: { en: 'Unknown command "{0}", see game-i18n.js help', zh: '不认识命令"{0}"，看 game-i18n.js help' },
  help: {
    en: `game-i18n.js · Game Text Desk (in-game text i18n)

  game-i18n.js init                    generate a config draft
  game-i18n.js scan [--json]           hardcoded-string scan (text foreign players cannot read)
  game-i18n.js coverage [--missing]    per-language dictionary coverage
  game-i18n.js stamp <lang>            stamp finished translations (fingerprints)
  game-i18n.js drift [--check]         drift detection: which translations went stale
  game-i18n.js glossary [lint|check]   glossary / whole-dictionary check / single-line check

  Daily rhythm: new strings go into the dictionary → scan stays clean →
  stamp when translated → drift after source edits → pre-release: drift --check + glossary lint
`,
    zh: `game-i18n.js · 游戏文案部（游戏内文案多语言）

  game-i18n.js init                    生成配置草稿
  game-i18n.js scan [--json]           硬编码扫描（外语玩家看不懂的裸文案）
  game-i18n.js coverage [--missing]    各语言词典覆盖率
  game-i18n.js stamp <语言>            翻完记指纹
  game-i18n.js drift [--check]         漂移检测：源文案改了哪些译文过期
  game-i18n.js glossary [lint|check]   术语表 / 全词典术语核对 / 单句核对

  日常节奏：写代码文案进词典 → scan 保持零硬编码 → 翻完 stamp →
           改文案后 drift 看谁过期 → 发版前 drift --check + glossary lint
`,
  },
};
const t = makeT(MSG, uiLang);

// ── manifest ──

function loadManifest() {
  const explicit = flag('manifest', '');
  const p = explicit ? path.resolve(ROOT, explicit) : path.join(ROOT, 'game-i18n-manifest.json');
  if (!fs.existsSync(p)) fail(t('noManifest'));
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!m.sourceLang || !Array.isArray(m.langs)) fail(t('badManifest'));
  m._dir = path.dirname(p);
  m._statePath = path.join(m._dir, 'game-i18n-state.json');
  return m;
}

// ── dictionary loading (three formats → { lang: { key: text } }) ──

function flatten(obj, prefix, out) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = String(v);
  }
  return out;
}

// minimal CSV parser (handles quoted cells and embedded "")
function parseCsv(src) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (q) {
      if (c === '"' && n === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function loadDicts(m) {
  const d = m.dictionary || {};
  const dicts = {};
  if (d.format === 'json-per-lang') {
    for (const lang of m.langs) {
      const p = path.join(ROOT, d.path, `${lang}.json`);
      dicts[lang] = fs.existsSync(p) ? flatten(JSON.parse(fs.readFileSync(p, 'utf8')), '', {}) : {};
    }
  } else if (d.format === 'json-single') {
    const p = path.join(ROOT, d.path);
    if (!fs.existsSync(p)) fail(t('dictMissing', d.path));
    const all = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const lang of m.langs) dicts[lang] = all[lang] ? flatten(all[lang], '', {}) : {};
  } else if (d.format === 'csv') {
    const p = path.join(ROOT, d.path);
    if (!fs.existsSync(p)) fail(t('dictMissing', d.path));
    const rows = parseCsv(fs.readFileSync(p, 'utf8'));
    const header = rows[0].map(h => h.trim());
    for (const lang of m.langs) dicts[lang] = {};
    for (let i = 1; i < rows.length; i++) {
      const key = (rows[i][0] || '').trim();
      if (!key) continue;
      for (let c = 1; c < header.length; c++) {
        const lang = header[c];
        if (dicts[lang] && rows[i][c]) dicts[lang][key] = rows[i][c];
      }
    }
  } else {
    fail(t('badFormat', d.format));
  }
  return dicts;
}

// ── scan ──

const CJK = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/; // CJK counts as "probably untranslated text"

// strip // and /* */ comments (line count preserved); whole-line # too (Godot/Python style)
function stripComments(src) {
  const out = [];
  let block = false;
  for (const line of src.split('\n')) {
    if (!block && /^\s*#/.test(line)) { out.push(''); continue; }
    let buf = '', i = 0;
    while (i < line.length) {
      if (block) {
        if (line[i] === '*' && line[i + 1] === '/') { block = false; buf += '  '; i += 2; }
        else { buf += ' '; i++; }
      } else if (line[i] === '/' && line[i + 1] === '*') { block = true; buf += '  '; i += 2; }
      else if (line[i] === '/' && line[i + 1] === '/') break;
      else { buf += line[i]; i++; }
    }
    out.push(buf);
  }
  return out.join('\n');
}

function walk(dir, exts, out) {
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { if (f.name !== 'node_modules' && f.name !== '.git') walk(p, exts, out); }
    else if (exts.some(e => f.name.endsWith(e))) out.push(p);
  }
  return out;
}

function cmdScan() {
  const m = loadManifest();
  const scan = m.scan || {};
  const dirs = scan.dirs || [];
  const exts = scan.exts || [];
  const marks = scan.translationMarks || [];
  const skip = scan.skip || [];
  if (!dirs.length || !exts.length) fail(t('scanNotConfigured'));

  // compile marks into word-boundary regexes: with t( configured, alert( must not sneak past
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const markRes = marks.map(mk => new RegExp('(^|[^\\w$.])' + esc(mk)));

  const files = [];
  for (const d of dirs) walk(path.join(ROOT, d), exts, files);

  const hits = [];
  for (const fp of files) {
    const rel = path.relative(ROOT, fp).replace(/\\/g, '/');
    if (skip.some(s => rel.startsWith(s))) continue;
    const lines = stripComments(fs.readFileSync(fp, 'utf8')).split('\n');
    lines.forEach((ln, i) => {
      if (!CJK.test(ln)) return;
      // only strings inside literals count as text
      if (!/['"`][^'"`]*[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af][^'"`]*['"`]/.test(ln)) return;
      // lines already going through the translation function pass
      if (markRes.some(re => re.test(ln))) return;
      hits.push({ file: rel, line: i + 1, text: ln.trim().slice(0, 80) });
    });
  }

  if (A.bools.has('json')) { console.log(JSON.stringify({ files: files.length, hits }, null, 2)); process.exitCode = hits.length ? 1 : 0; return; }

  console.log(t('scanHead', files.length));
  if (!hits.length) {
    console.log(t('scanClean'));
    return;
  }
  const byFile = {};
  for (const h of hits) (byFile[h.file] = byFile[h.file] || []).push(h);
  for (const [f, list] of Object.entries(byFile).sort((a, b) => b[1].length - a[1].length)) {
    console.log(t('scanFileCount', f, list.length));
    for (const h of list.slice(0, 5)) console.log(t('scanLine', h.line, h.text));
    if (list.length > 5) console.log(t('scanMore', list.length - 5));
  }
  console.log(t('scanTotal', hits.length));
  console.log(t('scanFix'));
  process.exitCode = 1;
}

// ── coverage ──

function bar(pct, w = 20) { const n = Math.round(pct / 100 * w); return '█'.repeat(n) + '░'.repeat(w - n); }

function cmdCoverage() {
  const m = loadManifest();
  const dicts = loadDicts(m);
  const base = dicts[m.sourceLang] || {};
  const baseKeys = Object.keys(base);
  if (!baseKeys.length) fail(t('covEmpty', m.sourceLang));

  console.log(t('covHead', m.sourceLang, baseKeys.length));
  for (const lang of m.langs) {
    if (lang === m.sourceLang) continue;
    const have = baseKeys.filter(k => dicts[lang] && dicts[lang][k]).length;
    const pct = Math.round(have / baseKeys.length * 100);
    const extra = Object.keys(dicts[lang] || {}).filter(k => !base[k]).length;
    console.log(`  ${lang.padEnd(6)} ${bar(pct)} ${String(pct).padStart(3)}%（${have}/${baseKeys.length}）${baseKeys.length - have ? t('covMissing', baseKeys.length - have) : ''}${extra ? t('covExtra', extra, m.sourceLang) : ''}`);
  }
  console.log('');
  if (A.bools.has('missing')) {
    for (const lang of m.langs) {
      if (lang === m.sourceLang) continue;
      const missing = baseKeys.filter(k => !(dicts[lang] && dicts[lang][k]));
      if (!missing.length) continue;
      console.log(t('covMissingHead', lang));
      console.log('    ' + missing.slice(0, 30).join(', ') + (missing.length > 30 ? t('covMissingMore', missing.length - 30) : ''));
      console.log('');
    }
  } else {
    console.log(t('covHint'));
  }
}

// ── stamp / drift ──

function loadState(m) {
  if (!fs.existsSync(m._statePath)) return {};
  try { return JSON.parse(fs.readFileSync(m._statePath, 'utf8')); } catch { return {}; }
}
function saveState(m, st) { fs.writeFileSync(m._statePath, JSON.stringify(st, null, 2) + '\n', 'utf8'); }

function cmdStamp(args) {
  const m = loadManifest();
  const lang = args[0] || flag('lang', '');
  if (!lang) fail(t('stampUsage'));
  if (!m.langs.includes(lang) || lang === m.sourceLang) fail(t('stampBadLang', lang));
  const dicts = loadDicts(m);
  const base = dicts[m.sourceLang] || {};
  const st = loadState(m);
  let stamped = 0;
  for (const [k, srcText] of Object.entries(base)) {
    if (!(dicts[lang] && dicts[lang][k])) continue; // untranslated → no stamp
    if (!st[k]) st[k] = { src: '', langs: {} };
    st[k].src = hash(srcText);
    st[k].langs[lang] = hash(srcText);
    stamped++;
  }
  saveState(m, st);
  console.log(t('stamped', lang, stamped, m.sourceLang));
  console.log(t('stampNext', m.sourceLang, lang));
}

function cmdDrift() {
  const m = loadManifest();
  const check = A.bools.has('check');
  const dicts = loadDicts(m);
  const base = dicts[m.sourceLang] || {};
  const st = loadState(m);

  let stale = 0, missing = 0, unknown = 0;
  const lines = [];
  for (const [k, srcText] of Object.entries(base)) {
    const cur = hash(srcText);
    for (const lang of m.langs) {
      if (lang === m.sourceLang) continue;
      const has = dicts[lang] && dicts[lang][k];
      const rec = st[k] && st[k].langs && st[k].langs[lang];
      if (!has) { missing++; continue; } // untranslated is coverage's job; just count
      if (!rec) { unknown++; lines.push(t('driftUnknown', k, lang)); }
      else if (rec !== cur) { stale++; lines.push(t('driftStale', k, lang, m.sourceLang, String(srcText).slice(0, 40))); }
    }
  }

  console.log(t('driftHead'));
  if (lines.length) console.log(lines.slice(0, 40).join('\n') + (lines.length > 40 ? t('driftMore', lines.length - 40) : '') + '\n');
  console.log(t('driftTotals', stale, unknown, missing));
  if (stale + unknown === 0) console.log(t('driftClean'));
  else console.log(t('driftFix'));
  if (check && (stale + unknown) > 0) process.exit(1);
}

// ── glossary ──

function loadGlossary(m) {
  const p = path.join(ROOT, m.glossary || 'glossary.json');
  if (!fs.existsSync(p)) fail(t('glMissing', m.glossary || 'glossary.json'));
  const g = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!Array.isArray(g.terms)) fail(t('glNoTerms'));
  return g;
}

function cmdGlossary(args) {
  const m = loadManifest();
  const g = loadGlossary(m);
  const sub = args[0] || 'list';
  const src = m.sourceLang;

  if (sub === 'check') {
    // check one translated line: --lang ja --source "消耗 5 点体力" --text "スタミナを5消費"
    const lang = flag('lang', '');
    const srcText = flag('source', '');
    const text = flag('text', '');
    if (!lang || !srcText || !text) fail(t('glCheckUsage'));
    const warns = [];
    for (const term of g.terms) {
      if (!term[src] || !term[lang]) continue;
      if (srcText.includes(term[src]) && !text.toLowerCase().includes(String(term[lang]).toLowerCase())) {
        warns.push(t('glCheckWarn', term[src], term[lang], term.note ? t('glNote', term.note) : ''));
      }
    }
    if (!warns.length) console.log(t('glCheckOk'));
    else { console.log(t('glCheckBad', warns.length) + warns.join('\n')); process.exit(1); }
    return;
  }

  if (sub === 'lint') {
    // scan the whole dictionary: source entries containing a term must use the canonical translation
    const dicts = loadDicts(m);
    const base = dicts[src] || {};
    let total = 0;
    for (const lang of m.langs) {
      if (lang === src) continue;
      const warns = [];
      for (const [k, sv] of Object.entries(base)) {
        const tv = dicts[lang] && dicts[lang][k];
        if (!tv) continue;
        for (const term of g.terms) {
          if (!term[src] || !term[lang]) continue;
          if (sv.includes(term[src]) && !tv.toLowerCase().includes(String(term[lang]).toLowerCase())) {
            warns.push(t('glLintWarn', k, term[src], term[lang], tv.slice(0, 40)));
          }
        }
      }
      if (warns.length) {
        console.log(t('glLintLang', lang, warns.length));
        console.log(warns.slice(0, 20).join('\n') + (warns.length > 20 ? t('glLintMore', warns.length - 20) : ''));
        total += warns.length;
      }
    }
    if (!total) console.log(t('glLintOk'));
    else { console.log(t('glLintBad', total)); process.exit(1); }
    return;
  }

  // list (default)
  console.log(t('glHead', g.terms.length));
  for (const term of g.terms) {
    const cols = m.langs.filter(l => term[l]).map(l => `${l}=${term[l]}`).join(' · ');
    console.log(`  ${cols}`);
    if (term.meaning) console.log(t('glMeaning', term.meaning));
    if (term.note) console.log(t('glTermNote', term.note));
  }
  console.log('');
}

// ── init ──

function cmdInit() {
  const out = path.join(ROOT, 'game-i18n-manifest.json');
  if (fs.existsSync(out) && !A.bools.has('force')) fail(t('initExists'));
  const draft = {
    _comment: t('initComment'),
    sourceLang: 'zh',
    langs: ['zh', 'en'],
    dictionary: { format: 'json-per-lang', path: 'assets/lang', _formats: t('initFormats') },
    scan: {
      dirs: ['src'],
      exts: ['.js'],
      translationMarks: ['t(', 'tr('],
      skip: [],
      _note: t('initScanNote'),
    },
    glossary: 'glossary.json',
  };
  fs.writeFileSync(out, JSON.stringify(draft, null, 2) + '\n', 'utf8');
  console.log(t('initDone'));
  console.log(t('initHint'));
}

// ── main ──

function main() {
  const cmd = A.pos[0];
  const rest = A.pos.slice(1);
  if (!cmd || cmd === 'help') { console.log(t('help')); return; }
  const table = { init: cmdInit, scan: cmdScan, coverage: cmdCoverage, stamp: cmdStamp, drift: cmdDrift, glossary: cmdGlossary };
  if (!table[cmd]) fail(t('unknownCmd', cmd));
  table[cmd](rest);
}

main();
