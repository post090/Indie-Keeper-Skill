#!/usr/bin/env node
// docs-i18n.js · Docs Translation Desk: document i18n state machine (zero deps)
// ─────────────────────────────────────────────────────────────
// Reference implementation of the indie-keeper Docs Translation Desk.
// Manages README / store page / patch-notes translations the way game
// localization does: extract templates (machine) → translate (AI/human fills)
// → stamp (record fingerprint) → status (staleness at a glance).
//
// States (one cell per doc × language):
//   📌 source   the source-language file itself
//   ✅ fresh    translation exists and its stamp matches the current source
//   ⚠️ stale    source changed after the stamp → needs re-translation
//   ❓ unknown  translation exists but was never stamped
//   ❌ missing  not translated yet
//
// Usage:
//   node docs-i18n.js init [--source zh] [--primary en] [--langs en,ja]
//   node docs-i18n.js status [docId]
//   node docs-i18n.js extract [--doc docId] [--lang L] [--dry] [--force]
//   node docs-i18n.js stamp <docId|--all> [lang] [--check] [--force]
//
// Manifest: docs-manifest.json (auto-discovered in root / locales/ / .docs/, or --manifest)
// Fingerprints: docs-state.json (next to the manifest, auto-generated, committed to git)
// All commands accept --root=<project root> and --lang-ui via --lang=<en|zh>
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { detectLang, makeT } = require('../lang');

// ── argv parsing: both --name=value and --name value are accepted ──
// NOTE: --lang here is a *target language* filter for extract/stamp; the UI
// language flag is --ui-lang (keeps the two concerns from colliding).
const VALUE_FLAGS = new Set(['root', 'manifest', 'doc', 'lang', 'source', 'primary', 'langs', 'dir', 'ui-lang']);
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
const CANDIDATES = ['docs-manifest.json', 'docs/docs-manifest.json', 'locales/docs-manifest.json', '.docs/docs-manifest.json'];

// UI language: --ui-lang wins here because --lang means "target language"
const uiLang = flag('ui-lang', '') ? (/^zh/i.test(flag('ui-lang', '')) ? 'zh' : 'en') : detectLang(['--none']);

const MSG = {
  manifestMissing: { en: 'Manifest not found: {0}', zh: '清单不存在：{0}' },
  noManifest: {
    en: 'docs-manifest.json not found (looked in: {0}).\n  Run docs-i18n.js init to generate one, or point at it with --manifest.',
    zh: '没找到 docs-manifest.json（找过：{0}）。\n  先跑 docs-i18n.js init 生成，或 --manifest 指定路径。',
  },
  missingKey: { en: 'Manifest is missing the "{0}" field ({1})', zh: '清单缺字段"{0}"（{1}）' },
  noSuchDoc: { en: 'No document "{0}" in the manifest', zh: '清单里没有文档"{0}"' },
  statusDocHead: { en: '  primary: {0}\n  source:  {1}\n', zh: '  主入口：{0}\n  源文件：{1}\n' },
  statusHead: { en: '\nTranslation status (docs × languages)\n', zh: '\n翻译状态一览（文档 × 语言）\n' },
  statusDocCol: { en: 'doc', zh: '文档' },
  legend: { en: '\n  📌source ✅fresh ⚠️stale ❓unstamped ❌missing', zh: '\n  📌源 ✅同步 ⚠️过期 ❓没记指纹 ❌没翻' },
  totals: { en: '  totals: {0} missing · {1} needing work', zh: '  合计：没翻 {0} 处 · 待更新 {1} 处' },
  nextSteps: {
    en: '\n  per-doc detail:  docs-i18n.js status <docId>\n  extract template: docs-i18n.js extract --doc <docId> --lang <L>\n  stamp when done:  docs-i18n.js stamp <docId> <lang>\n',
    zh: '\n  单文档详情：docs-i18n.js status <文档id>\n  抽模板：    docs-i18n.js extract --doc <文档id> --lang <语言>\n  翻完记指纹：docs-i18n.js stamp <文档id> <语言>\n',
  },
  shellHeader: {
    en: '[TODO {1}] Translation template · rewrite the {0} original below in {1} (match the target language\'s own voice — do not translate word by word)\n  When done: delete this whole comment block and the TODO line, then run docs-i18n.js stamp',
    zh: '[TODO {1}] 待翻模板 · 对照下面的 {0} 原文用 {1} 重写（按目标语言的调性来，别逐字直译）\n  翻完：删掉这整块注释和下面的 TODO 行，然后跑 docs-i18n.js stamp 记指纹',
  },
  shellOriginal: { en: '── {0} original ──', zh: '── {0} 原文 ──' },
  shellTodo: { en: '[TODO {0}] Write the {0} translation here, then delete this line', zh: '[TODO {0}] 在这里写 {0} 译文，写完删掉本行' },
  langNotListed: { en: 'Language "{0}" is not in the manifest. Registered: {1}', zh: '语言"{0}"不在清单里。已登记：{1}' },
  skipNoSource: { en: '  ⚠ skipped {0}: source file not written yet ({1})', zh: '  ⚠ 跳过 {0}：源文件还没写（{1}）' },
  dryPlan: { en: '\n  Dry run: would create {0} template(s), {1} existing would be skipped. Drop --dry to do it.\n', zh: '\n  预演：会建 {0} 个模板，{1} 个已存在会跳过。去掉 --dry 真建。\n' },
  extracted: {
    en: '\n  ✓ created {0} translation template(s) · skipped {1} existing\n  next: fill in translations → docs-i18n.js stamp <docId> <lang>\n',
    zh: '\n  ✓ 建了 {0} 个待翻模板 · 跳过 {1} 个已存在\n  下一步：往模板里填译文 → docs-i18n.js stamp <文档id> <语言> 记指纹\n',
  },
  stampUsage: { en: 'Usage: docs-i18n.js stamp <docId> [lang], or stamp --all', zh: '用法：docs-i18n.js stamp <文档id> [语言]，或 stamp --all' },
  stampNoSource: { en: '  ⚠ {0}: source file missing ({1}) · skipped', zh: '  ⚠ {0}：源文件不存在（{1}）· 跳过' },
  stampNoTrans: { en: '  ❌ {0}: translation missing · extract a template first', zh: '  ❌ {0}：译文不存在 · 先 extract 抽模板' },
  checkTodo: { en: '  ⚠ {0}: [TODO] markers remain (unfinished)', zh: '  ⚠ {0}：还有 [TODO] 残留（没翻完）' },
  checkUnstamped: { en: '  ❓ {0}: never stamped', zh: '  ❓ {0}：从没记过指纹' },
  checkStale: { en: '  ⚠ {0}: stale (source has changed)', zh: '  ⚠ {0}：过期了（源文件改过）' },
  checkFresh: { en: '  ✅ {0}: fresh', zh: '  ✅ {0}：同步' },
  todoBlocked: { en: '  ⛔ {0}: [TODO] markers remain — refusing to stamp unfinished work (--force to override)', zh: '  ⛔ {0}：还有 [TODO] 残留，没翻完不给记指纹（真要记用 --force）' },
  alreadyFresh: { en: '  = {0}: already fresh · skipped', zh: '  = {0}：已经同步 · 跳过' },
  stampedOne: { en: '  ✓ {0}: stamped {1}', zh: '  ✓ {0}：已记指纹 {1}' },
  checkProblems: { en: '\n  {0} problem(s) found (stale / unstamped / unfinished)\n', zh: '\n  发现 {0} 处问题（过期/没记指纹/没翻完）\n' },
  checkAllFresh: { en: '\n  ✓ everything fresh\n', zh: '\n  ✓ 全部同步\n' },
  stampSummary: { en: '\n  ✓ stamped {0} · skipped {1}{2}{3}\n', zh: '\n  ✓ 记了 {0} 份指纹 · 跳过 {1}{2}{3}\n' },
  stampBlockedPart: { en: ' · blocked {0} unfinished', zh: ' · 拦下没翻完的 {0}' },
  stampMissingPart: { en: ' · {0} missing translation(s)', zh: ' · 缺译文 {0}' },
  initExists: { en: 'docs-manifest.json already exists (--force to overwrite)', zh: 'docs-manifest.json 已存在（--force 覆盖）' },
  initComment: { en: 'Document i18n manifest · source of truth for docs-i18n.js · see the indie-keeper Docs Translation Desk manual', zh: '文档多语言清单 · docs-i18n.js 的真相源 · 说明见 indie-keeper 文档翻译部手册' },
  skipLicense: { en: 'legal text stays in its original language (open-source convention)', zh: '法律文本保留原文（开源惯例）' },
  initDone: { en: '✓ docs-manifest.json draft generated ({0} document(s) recognized)', zh: '✓ 已生成 docs-manifest.json 草稿（认出 {0} 份文档）' },
  initHint: { en: '  Review it, add target languages to langs, then: docs-i18n.js extract', zh: '  检查一遍，把要翻的语言加进 langs，然后：docs-i18n.js extract' },
  unknownCmd: { en: 'Unknown command "{0}", see docs-i18n.js help', zh: '不认识命令"{0}"，看 docs-i18n.js help' },
  descReadme: { en: 'project front page', zh: '项目门面' },
  descChangelog: { en: 'version changes / patch notes', zh: '版本变更 / patch notes' },
  descContrib: { en: 'contribution guide', zh: '贡献指南' },
  descSecurity: { en: 'security policy', zh: '安全政策' },
  descConduct: { en: 'code of conduct', zh: '行为准则' },
  help: {
    en: `docs-i18n.js · Docs Translation Desk (document i18n state machine)

  docs-i18n.js init [--source zh] [--primary en] [--langs en,ja]   scan into a draft manifest
  docs-i18n.js status [docId]                      status board / per-doc detail
  docs-i18n.js extract [--doc ID] [--lang L]       create translation templates (--dry / --force)
  docs-i18n.js stamp <docId|--all> [lang]          stamp finished work (--check = read-only, for CI)

  Flow: init → extract templates → fill translations → stamp → status all green
  Pre-release check: stamp --all --check (exit 1 if anything is stale)
`,
    zh: `docs-i18n.js · 文档翻译部（文档多语言状态机）

  docs-i18n.js init [--source zh] [--primary en] [--langs en,ja]   扫现状生成清单草稿
  docs-i18n.js status [文档id]                     翻译状态一览 / 单文档详情
  docs-i18n.js extract [--doc ID] [--lang L]       抽模板（--dry 预演 / --force 覆盖）
  docs-i18n.js stamp <文档id|--all> [语言]         翻完记指纹（--check 只查不写·CI 用）

  流程：init 登记 → extract 抽模板 → 填译文 → stamp 记指纹 → status 看表全绿
  发版前体检：stamp --all --check（有过期翻译就报错退出）
`,
  },
};
const t = makeT(MSG, uiLang);

function fail(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// ── manifest & fingerprint store ──

function loadManifest() {
  const explicit = flag('manifest', '');
  let p = null;
  if (explicit) {
    p = path.resolve(ROOT, explicit);
    if (!fs.existsSync(p)) fail(t('manifestMissing', explicit));
  } else {
    p = CANDIDATES.map(c => path.join(ROOT, c)).find(c => fs.existsSync(c)) || null;
  }
  if (!p) fail(t('noManifest', CANDIDATES.join(', ')));
  const m = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const key of ['sourceLang', 'primaryLang', 'i18nDir', 'langs', 'docs']) {
    if (!(key in m)) fail(t('missingKey', key, p));
  }
  m._path = p;
  m._statePath = path.join(path.dirname(p), 'docs-state.json');
  return m;
}

function loadState(manifest) {
  if (!fs.existsSync(manifest._statePath)) return {};
  try { return JSON.parse(fs.readFileSync(manifest._statePath, 'utf8')); } catch { return {}; }
}

function saveState(manifest, state) {
  fs.writeFileSync(manifest._statePath, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function hashContent(s) {
  return crypto.createHash('sha1').update(s, 'utf8').digest('hex').slice(0, 12);
}

// Where translations live: source lang → doc.source; primary lang → doc.primary
// (in place); everything else → <i18nDir>/<name>.<lang><ext> when i18nDir is set,
// or next to the source file (<sourceDir>/<name>.<lang><ext>) when i18nDir is empty.
// The empty-i18nDir mode supports the "bilingual files side by side" convention
// (e.g. README.md + README.zh.md in the same folder, references/cli.md + cli.zh.md).
// A doc can override the translation path via doc.translations[lang] (relative
// to ROOT) — used when a doc's translation lives in a different place than the
// default convention (e.g. root docs whose zh version is centralized under docs/zh/).
function translatedPath(manifest, doc, lang) {
  if (doc.translations && doc.translations[lang]) return path.join(ROOT, doc.translations[lang]);
  const ext = path.extname(doc.source);
  const base = path.basename(doc.source);
  const suffix = `.${manifest.sourceLang}${ext}`;
  const srcBase = base.endsWith(suffix) ? base.slice(0, -suffix.length) : base.slice(0, -ext.length);
  if (lang === manifest.sourceLang) return path.join(ROOT, doc.source);
  if (lang === manifest.primaryLang) return path.join(ROOT, doc.primary);
  const dir = manifest.i18nDir
    ? path.join(ROOT, manifest.i18nDir)
    : path.join(ROOT, path.dirname(doc.source));
  return path.join(dir, `${srcBase}.${lang}${ext}`);
}

function docStatus(manifest, state, doc) {
  const srcPath = path.join(ROOT, doc.source);
  const srcExists = fs.existsSync(srcPath);
  const srcHash = srcExists ? hashContent(fs.readFileSync(srcPath, 'utf8')) : null;
  const result = {};
  for (const lang of manifest.langs) {
    if (lang === manifest.sourceLang) {
      result[lang] = { state: srcExists ? 'source' : 'missing' };
      continue;
    }
    const tp = translatedPath(manifest, doc, lang);
    if (!fs.existsSync(tp)) { result[lang] = { state: 'missing' }; continue; }
    const recorded = (state[`${doc.id}:${lang}`] || {}).srcHash;
    if (recorded && recorded === srcHash) result[lang] = { state: 'fresh' };
    else if (recorded) result[lang] = { state: 'stale' };
    else result[lang] = { state: 'unknown' };
  }
  return result;
}

const ICON = { source: '📌', fresh: '✅', stale: '⚠️', missing: '❌', unknown: '❓' };

// ── status ──

function cmdStatus(args) {
  const manifest = loadManifest();
  const state = loadState(manifest);
  const docArg = args[0] || '';

  if (docArg) {
    const doc = manifest.docs.find(d => d.id === docArg);
    if (!doc) fail(t('noSuchDoc', docArg));
    const st = docStatus(manifest, state, doc);
    console.log(`\n${doc.id}${doc.desc ? ` · ${doc.desc}` : ''}`);
    console.log(t('statusDocHead', doc.primary, doc.source));
    for (const lang of manifest.langs) {
      console.log(`  ${ICON[st[lang].state] || '?'} ${lang.padEnd(8)} ${st[lang].state}`);
    }
    console.log('');
    return;
  }

  console.log(t('statusHead'));
  const header = manifest.langs.map(l => l.slice(0, 5).padEnd(6)).join('');
  console.log('  ' + t('statusDocCol').padEnd(14) + header);
  console.log('  ' + '─'.repeat(14 + manifest.langs.length * 6));

  let missing = 0, needWork = 0;
  for (const doc of manifest.docs) {
    const st = docStatus(manifest, state, doc);
    const cells = manifest.langs.map(l => {
      const s = st[l].state;
      if (s === 'missing') missing++;
      if (s === 'stale' || s === 'unknown') needWork++;
      return (ICON[s] || '?').padEnd(6);
    });
    console.log('  ' + doc.id.padEnd(14) + cells.join(''));
  }
  console.log(t('legend'));
  console.log(t('totals', missing, needWork));
  console.log(t('nextSteps'));
}

// ── extract ──

function buildShell(srcText, sourceLang, lang) {
  const ref = srcText.split('\n').map(l => `  ${l}`).join('\n');
  return `<!-- ─────────────────────────────────────────────
  ${t('shellHeader', sourceLang, lang)}

  ${t('shellOriginal', sourceLang)}
${ref}
  ───────────────────────────────────────────── -->

${t('shellTodo', lang)}
`;
}

function cmdExtract() {
  const manifest = loadManifest();
  const onlyDoc = flag('doc', '');
  const onlyLang = flag('lang', '');
  const dry = A.bools.has('dry');
  const force = A.bools.has('force');

  if (onlyLang && !manifest.langs.includes(onlyLang)) {
    fail(t('langNotListed', onlyLang, manifest.langs.join(', ')));
  }
  let docs = manifest.docs;
  if (onlyDoc) {
    docs = docs.filter(d => d.id === onlyDoc);
    if (!docs.length) fail(t('noSuchDoc', onlyDoc));
  }
  const targetLangs = onlyLang ? [onlyLang] : manifest.langs.filter(l => l !== manifest.sourceLang);

  let created = 0, skipped = 0, planned = 0;
  const log = [];
  for (const doc of docs) {
    const srcPath = path.join(ROOT, doc.source);
    if (!fs.existsSync(srcPath)) {
      log.push(t('skipNoSource', doc.id, doc.source));
      continue;
    }
    const srcText = fs.readFileSync(srcPath, 'utf8');
    for (const lang of targetLangs) {
      if (lang === manifest.sourceLang) continue;
      const target = translatedPath(manifest, doc, lang);
      const rel = path.relative(ROOT, target);
      if (fs.existsSync(target) && !force) { skipped++; continue; }
      planned++;
      if (dry) { log.push(`  + ${rel}`); continue; }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, buildShell(srcText, manifest.sourceLang, lang), 'utf8');
      created++;
      log.push(`  ✓ ${rel}`);
    }
  }
  if (log.length) console.log('\n' + log.join('\n'));
  if (dry) console.log(t('dryPlan', planned, skipped));
  else console.log(t('extracted', created, skipped));
}

// ── stamp ──

function cmdStamp(args) {
  const manifest = loadManifest();
  const all = A.bools.has('all');
  const check = A.bools.has('check');
  const force = A.bools.has('force');
  const docArg = args[0] || '';
  const langArg = args[1] || '';

  if (!all && !docArg) fail(t('stampUsage'));

  let docs = manifest.docs;
  if (docArg) {
    docs = docs.filter(d => d.id === docArg);
    if (!docs.length) fail(t('noSuchDoc', docArg));
  }

  const state = loadState(manifest);
  let stamped = 0, skipped = 0, todoBlocked = 0, missing = 0, problems = 0;
  const log = [];

  for (const doc of docs) {
    const srcPath = path.join(ROOT, doc.source);
    if (!fs.existsSync(srcPath)) { log.push(t('stampNoSource', doc.id, doc.source)); continue; }
    const srcHash = hashContent(fs.readFileSync(srcPath, 'utf8'));
    const langs = langArg ? [langArg] : manifest.langs.filter(l => l !== manifest.sourceLang);

    for (const lang of langs) {
      if (lang === manifest.sourceLang) continue;
      const tp = translatedPath(manifest, doc, lang);
      const rel = path.relative(ROOT, tp);
      const key = `${doc.id}:${lang}`;

      if (!fs.existsSync(tp)) {
        if (langArg) { missing++; log.push(t('stampNoTrans', rel)); }
        continue;
      }
      const content = fs.readFileSync(tp, 'utf8');
      // A real unfinished placeholder sits at the start of a line (the extract
      // command writes "[TODO <lang>] ..." on its own line, and the comment
      // block above it also indents the same marker). Inline mentions inside
      // documentation (e.g. "每段后面跟个 `[TODO]` 占位") must NOT count.
      const hasTodo = content.split('\n').some(l => l.trim().startsWith('[TODO'));

      if (check) {
        const recorded = (state[key] || {}).srcHash;
        if (hasTodo) { problems++; log.push(t('checkTodo', rel)); }
        else if (!recorded) { problems++; log.push(t('checkUnstamped', rel)); }
        else if (recorded !== srcHash) { problems++; log.push(t('checkStale', rel)); }
        else log.push(t('checkFresh', rel));
        continue;
      }
      if (hasTodo && !force) {
        todoBlocked++;
        log.push(t('todoBlocked', rel));
        continue;
      }
      if ((state[key] || {}).srcHash === srcHash) { skipped++; log.push(t('alreadyFresh', rel)); continue; }
      state[key] = { srcHash, stampedAt: new Date().toISOString().slice(0, 16).replace('T', ' ') };
      stamped++;
      log.push(t('stampedOne', rel, srcHash));
    }
  }

  if (log.length) console.log('\n' + log.join('\n'));
  if (check) {
    if (problems > 0) { console.log(t('checkProblems', problems)); process.exit(1); }
    console.log(t('checkAllFresh'));
    return;
  }
  if (stamped > 0) saveState(manifest, state);
  console.log(t('stampSummary', stamped, skipped,
    todoBlocked ? t('stampBlockedPart', todoBlocked) : '',
    missing ? t('stampMissingPart', missing) : ''));
  if (todoBlocked > 0 || missing > 0) process.exit(1);
}

// ── init ──

const COMMON_DOCS = [
  { id: 'readme', primary: 'README.md', descKey: 'descReadme' },
  { id: 'changelog', primary: 'CHANGELOG.md', descKey: 'descChangelog' },
  { id: 'contributing', primary: 'CONTRIBUTING.md', alt: '.github/CONTRIBUTING.md', descKey: 'descContrib' },
  { id: 'security', primary: 'SECURITY.md', alt: '.github/SECURITY.md', descKey: 'descSecurity' },
  { id: 'code_of_conduct', primary: 'CODE_OF_CONDUCT.md', alt: '.github/CODE_OF_CONDUCT.md', descKey: 'descConduct' },
];

function cmdInit() {
  const sourceLang = flag('source', 'zh');
  const primaryLang = flag('primary', sourceLang);
  const i18nDir = flag('dir', 'i18n-docs');
  const extraLangs = flag('langs', '').split(',').filter(Boolean);
  const out = path.join(ROOT, 'docs-manifest.json');
  if (fs.existsSync(out) && !A.bools.has('force')) fail(t('initExists'));

  const docs = [];
  for (const d of COMMON_DOCS) {
    const hit = fs.existsSync(path.join(ROOT, d.primary)) ? d.primary
      : (d.alt && fs.existsSync(path.join(ROOT, d.alt))) ? d.alt : null;
    if (!hit) continue;
    const ext = path.extname(hit);
    const base = path.basename(hit, ext);
    docs.push({
      id: d.id,
      primary: hit,
      source: sourceLang === primaryLang ? hit : `${i18nDir}/${base}.${sourceLang}${ext}`,
      desc: t(d.descKey),
    });
  }
  const manifest = {
    _comment: t('initComment'),
    version: 1,
    sourceLang,
    primaryLang,
    i18nDir,
    langs: [...new Set([sourceLang, primaryLang, ...extraLangs])],
    docs,
    skip: [{ id: 'license', primary: 'LICENSE', reason: t('skipLicense') }],
  };
  fs.writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(t('initDone', docs.length));
  console.log(t('initHint'));
}

// ── main ──

function main() {
  const cmd = A.pos[0];
  const rest = A.pos.slice(1);
  if (!cmd || cmd === 'help') { console.log(t('help')); return; }
  const table = { init: cmdInit, status: cmdStatus, extract: cmdExtract, stamp: cmdStamp };
  if (!table[cmd]) fail(t('unknownCmd', cmd));
  table[cmd](rest);
}

main();
