#!/usr/bin/env node
// truth.js · Archive: source-of-truth registry + safe section edits + checkup (zero deps)
// ─────────────────────────────────────────────────────────────
// Reference implementation of the indie-keeper Archive room.
// Registry: truth-source.json (one authoritative file per kind of info)
//
// Usage:
//   node truth.js where <topic>                   topic → authoritative doc + anchor
//   node truth.js list                            list every registered topic
//   node truth.js sections <doc>                  list a doc's sections (look before update)
//   node truth.js update <doc> --section "<title>" [--parent "<heading>"] --content "..." [--append]
//                                                 safe section replace (never whole-file rewrites)
//   node truth.js check                           checkup: dead links / untracked docs / rule-file refs
//   node truth.js init                            scan current state into a draft registry
//
// All commands accept --root=<project root> (default: cwd) and --lang=<en|zh>
'use strict';

const fs = require('fs');
const path = require('path');
const { detectLang, makeT } = require('../lang');

// ── argv parsing: both --name=value and --name value are accepted ──
const VALUE_FLAGS = new Set(['section', 'parent', 'content', 'file', 'root', 'source', 'lang']);

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
const CANDIDATES = require('../project-files').truth;

// Common rule-file locations (shared with the WIKI)
const RULE_FILES = [
  'AGENTS.md', 'CLAUDE.md', 'SOUL.md', 'GEMINI.md', 'START-HERE.md',
  '.cursorrules', '.github/copilot-instructions.md',
];

const lang = detectLang();
const MSG = {
  noSource: {
    en: 'truth-source.json not found (looked in: {0}).\n  Run truth.js init to generate a draft, or point at one with --source=<path>.',
    zh: '没找到 truth-source.json（找过：{0}）。\n  先跑 truth.js init 生成草稿，或 --source=<路径> 指定。',
  },
  noTopics: { en: '{0} is missing the topics field', zh: '{0} 缺少 topics 字段' },
  whereUsage: { en: 'Usage: truth.js where <topic>\n\nRegistered topics:', zh: '用法：truth.js where <主题>\n\n已登记的主题：' },
  whereMiss: { en: 'No topic matches "{0}". Registered: {1}', zh: '没找到主题"{0}"。已登记：{1}' },
  authority: { en: '     🔒 authority: {0} (AI organizes and implements — never improvises)', zh: '     🔒 权威归属：{0}（AI 只组织和实现，不自由发挥）' },
  listHead: { en: '\nSource-of-truth registry ({0})\n', zh: '\n真相源登记表（{0}）\n' },
  sectionsUsage: { en: 'Usage: truth.js sections <doc>', zh: '用法：truth.js sections <doc>' },
  docMiss: { en: 'Document not found: {0}', zh: '找不到文档：{0}' },
  docMulti: { en: 'Multiple matches:\n{0}', zh: '多个匹配：\n{0}' },
  sectionsHead: { en: '\nSections of {0}:\n', zh: '\n{0} 的章节：\n' },
  updateUsage: {
    en: 'Usage: truth.js update <doc> --section "<title>" [--parent "<heading>"] --content "..." [--append]\n  or --file=<path> to read content from a file',
    zh: '用法：truth.js update <doc> --section "<标题>" [--parent "<上级标题>"] --content "..." [--append]\n  或 --file=<路径> 从文件读内容',
  },
  noContent: { en: 'Missing content: --content="..." or --file=<path>', zh: '缺少内容：--content="..." 或 --file=<路径>' },
  ambiguousSection: { en: 'Several sections match "{0}". Use an exact heading and --parent "<heading>" to narrow the match.', zh: '多个章节匹配“{0}”。请使用完整标题，用 --parent "<上级标题>" 限定范围。' },
  sectionMiss: { en: '✗ Section "{0}" not found. Existing sections:', zh: '✗ 没找到章节"{0}"。现有章节：' },
  replaced: { en: '✓ {0} §{1} replaced', zh: '✓ {0} §{1} 已替换' },
  appended: { en: '✓ {0} §{1} appended', zh: '✓ {0} §{1} 已追加' },
  checkHead: { en: '\nArchive checkup\n', zh: '\n档案室体检\n' },
  deadLink: { en: '  ❌ dead link: topic "{0}" → {1} does not exist', zh: '  ❌ 死链：主题"{0}" → {1} 不存在' },
  orphan: { en: '  ⚠️ untracked: {0} is not registered in the truth source', zh: '  ⚠️ 未登记：{0} 没登记进真相源' },
  ruleDead: { en: '  ❌ rule-file dead link: {0} references {1}, but the file does not exist', zh: '  ❌ 守则死链：{0} 引用了 {1}，但文件不存在' },
  allGood: { en: '  ✓ all healthy\n', zh: '  ✓ 全部健康\n' },
  problems: { en: '  {0} problem(s) in total\n', zh: '  共 {0} 个问题\n' },
  initExists: { en: 'truth-source.json already exists (--force to overwrite)', zh: 'truth-source.json 已存在（--force 覆盖）' },
  initComment: {
    en: 'Source-of-truth registry · one authoritative file per kind of info · read by truth.js where/check',
    zh: '唯一真相源登记表 · 每类信息只有一个权威文件 · truth.js where/check 读这个表',
  },
  initRuleDesc: { en: 'AI collaboration rules (the staff handbook)', zh: 'AI 协作守则（员工手册）' },
  initTodoDesc: { en: '(one-line description TODO)', zh: '（待补一句话说明）' },
  initRuleTopic: { en: 'rules', zh: '守则' },
  initDone: { en: '✓ truth-source.json draft generated ({0} entries)', zh: '✓ 已生成 truth-source.json 草稿（{0} 个条目）' },
  initHint: {
    en: '  Rename topics from file names to semantic ones (e.g. "characters" the concept, not the file), fill desc and aliases',
    zh: '  请把主题名从文件名改成语义主题（如"角色"而不是"characters"），补上 desc 和 aliases',
  },
  unknownCmd: { en: 'Unknown command "{0}", see truth.js help', zh: '未知命令"{0}"，看 truth.js help' },
  help: {
    en: `truth.js · Archive (source of truth + safe section edits + checkup)

  truth.js where <topic>      topic → authoritative doc + anchor (aliases supported)
  truth.js list               list every registered topic
  truth.js sections <doc>     list a doc's sections
  truth.js update <doc> --section "<title>" [--parent "<heading>"] --content "..." [--append] [--file=]
  truth.js check              checkup: dead links / untracked docs / rule-file refs (exit 1 on problems)
  truth.js init [--force]     scan current state into a draft registry

  Registry: truth-source.json (auto-discovered in root / docs/ / .docs/, or --source=)
`,
    zh: `truth.js · 档案室（唯一真相源 + 章节安全编辑 + 体检）

  truth.js where <主题>       主题 → 权威文档 + 锚点（支持 aliases 别名）
  truth.js list               列出全部登记
  truth.js sections <doc>     列出文档章节
  truth.js update <doc> --section "<标题>" [--parent "<上级标题>"] --content "..." [--append] [--file=]
  truth.js check              体检：死链 / 未登记文档 / 守则引用死链（有问题 exit 1）
  truth.js init [--force]     扫描现状生成登记表草稿

  登记表：truth-source.json（根 / docs/ / .docs/ 自动发现，--source= 指定）
`,
  },
};
const t = makeT(MSG, lang);

function fail(msg) { console.error(`✗ ${msg}`); process.exit(1); }

function findSourcePath() {
  const explicit = flag('source', '');
  if (explicit) return path.resolve(ROOT, explicit);
  for (const c of CANDIDATES) {
    const p = path.join(ROOT, c);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function loadSource() {
  const p = findSourcePath();
  if (!p || !fs.existsSync(p)) {
    fail(t('noSource', CANDIDATES.join(', ')));
  }
  const s = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!s.topics || typeof s.topics !== 'object') fail(t('noTopics', p));
  s._path = p;
  return s;
}

// ── where ────────────────────────────────────────────────────

function cmdWhere(args) {
  const src = loadSource();
  const query = args.join(' ');
  if (!query) {
    console.log(t('whereUsage'));
    console.log('  ' + Object.keys(src.topics).join(' · '));
    return;
  }
  const q = query.toLowerCase();
  const hits = Object.entries(src.topics).filter(([topic, tp]) => {
    const keys = [topic, ...(tp.aliases || [])];
    return keys.some(k => k.toLowerCase().includes(q) || q.includes(k.toLowerCase()));
  });
  if (!hits.length) {
    console.log(t('whereMiss', query, Object.keys(src.topics).join(' · ')));
    process.exit(1);
  }
  console.log('');
  for (const [topic, tp] of hits) {
    console.log(`  📄 ${topic} → ${tp.file}${tp.anchor ? ` §${tp.anchor}` : ''}`);
    if (tp.desc) console.log(`     ${tp.desc}`);
    if (tp.authority) console.log(t('authority', tp.authority));
    console.log('');
  }
}

// ── list ─────────────────────────────────────────────────────

function cmdList() {
  const src = loadSource();
  console.log(t('listHead', path.relative(ROOT, src._path)));
  const w = Math.max(...Object.keys(src.topics).map(k => k.length), 4);
  for (const [topic, tp] of Object.entries(src.topics)) {
    const auth = tp.authority ? ` 🔒${tp.authority}` : '';
    console.log(`  ${topic.padEnd(w + 2)} ${tp.file}${tp.anchor ? ` §${tp.anchor}` : ''}${auth}`);
  }
  console.log('');
}

// ── section parsing (shared by update / sections) ────────────

function parseSections(text) {
  const lines = text.split('\n');
  const sections = [];
  let cur = { level: 0, title: '', headingLine: null, lines: [] };
  let fence = '';
  for (const l of lines) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(l.replace(/\r$/, ''));
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1].startsWith(fence) && !marker[2].trim()) fence = '';
    }
    // strip a trailing \r before matching (Windows CRLF); keep the line itself intact
    const m = !fence && l.replace(/\r$/, '').match(/^(#{1,6})\s+(.*)$/);
    if (m) {
      sections.push(cur);
      cur = { level: m[1].length, title: m[2].trim(), headingLine: l, lines: [] };
    } else {
      cur.lines.push(l);
    }
  }
  sections.push(cur);
  return sections;
}

function normTitle(s) { return String(s).replace(/^#+\s*/, '').replace(/^[§\s]+/, '').trim(); }

function findSectionIndex(sections, query, parent) {
  const q = normTitle(query);
  const ancestors = [];
  const matches = [];
  for (const [index, section] of sections.entries()) {
    if (!section.headingLine) continue;
    while (ancestors.length && ancestors[ancestors.length - 1].level >= section.level) ancestors.pop();
    const title = normTitle(section.title);
    if (title.includes(q) && (!parent || ancestors.some(s => normTitle(s.title) === normTitle(parent)))) {
      matches.push({ index, title });
    }
    ancestors.push(section);
  }
  const exact = matches.filter(m => m.title === q);
  const candidates = exact.length ? exact : matches;
  if (candidates.length > 1) fail(t('ambiguousSection', query));
  return candidates.length ? candidates[0].index : -1;
}

function rebuild(sections) {
  const out = [];
  for (const s of sections) {
    if (s.headingLine !== null) out.push(s.headingLine);
    out.push(...s.lines);
  }
  return out.join('\n');
}

// Doc lookup: relative path / under docs/ / bare-name fuzzy match
function resolveDoc(name) {
  let p = path.isAbsolute(name) ? name : path.join(ROOT, name);
  if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  p = path.join(ROOT, 'docs', name);
  if (fs.existsSync(p)) return p;
  const hits = [];
  (function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir)) {
      if (f.startsWith('.') || f === 'node_modules' || f === '_archive') continue;
      const abs = path.join(dir, f);
      const st = fs.statSync(abs);
      if (st.isDirectory()) walk(abs);
      else if (f.endsWith('.md') && (f === name || abs.includes(name))) hits.push(abs);
    }
  })(path.join(ROOT, 'docs'));
  if (hits.length === 1) return hits[0];
  if (hits.length > 1) fail(t('docMulti', hits.map(h => '  ' + path.relative(ROOT, h)).join('\n')));
  return null;
}

function cmdSections(args) {
  const name = args[0];
  if (!name) fail(t('sectionsUsage'));
  const p = resolveDoc(name);
  if (!p) fail(t('docMiss', name));
  const sections = parseSections(fs.readFileSync(p, 'utf8'));
  console.log(t('sectionsHead', path.relative(ROOT, p)));
  for (const s of sections) {
    if (s.headingLine) console.log('  ' + '  '.repeat(Math.max(0, s.level - 1)) + s.title);
  }
  console.log('');
}

function cmdUpdate(args) {
  const name = args[0];
  const section = flag('section', '');
  const contentFile = flag('file', '');
  let content = flag('content', '');
  const append = A.bools.has('append');

  if (!name || !section) fail(t('updateUsage'));
  if (contentFile) content = fs.readFileSync(path.resolve(ROOT, contentFile), 'utf8');
  if (!content) fail(t('noContent'));
  if (!contentFile) content = content.replace(/\\n/g, '\n');

  const p = resolveDoc(name);
  if (!p) fail(t('docMiss', name));
  const text = fs.readFileSync(p, 'utf8');
  const sections = parseSections(text);
  const idx = findSectionIndex(sections, section, flag('parent', ''));
  if (idx < 0) {
    console.error(t('sectionMiss', section));
    for (const s of sections) if (s.headingLine) console.error('    ' + s.title);
    process.exit(1);
  }
  const sec = sections[idx];
  const newLines = content.split('\n');
  if (append) {
    while (sec.lines.length && sec.lines[sec.lines.length - 1].trim() === '') sec.lines.pop();
    sec.lines.push('', ...newLines, '');
  } else {
    sec.lines = ['', ...newLines, ''];
  }
  fs.writeFileSync(p, rebuild(sections), 'utf8');
  console.log(t(append ? 'appended' : 'replaced', path.relative(ROOT, p), sec.title));
}

// ── check ────────────────────────────────────────────────────

function listMdFiles(dir, base, out) {
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith('.') || f === 'node_modules' || f === '_archive' || f === 'zh') continue;
    const abs = path.join(dir, f);
    const rel = base ? `${base}/${f}` : f;
    const st = fs.statSync(abs);
    if (st.isDirectory()) listMdFiles(abs, rel, out);
    else if (f.endsWith('.md')) out.push(rel);
  }
  return out;
}

function cmdCheck() {
  const src = loadSource();
  let problems = 0;
  console.log(t('checkHead'));

  // 1. dead links: registered file no longer exists
  //    Normalize backslashes → forward slashes so a Windows user writing
  //    "docs\lore.md" in JSON doesn't get a false dead-link on POSIX.
  for (const [topic, tp] of Object.entries(src.topics)) {
    const rel = tp.file.replace(/\\/g, '/');
    if (!fs.existsSync(path.join(ROOT, rel))) {
      problems++;
      console.log(t('deadLink', topic, tp.file));
    }
  }

  // 2. untracked: .md under docs/ not registered by any topic (directory-level entries count)
  const registered = Object.values(src.topics).map(tp => tp.file.replace(/\\/g, '/'));
  const scanDir = src.scanDir || 'docs';
  const all = listMdFiles(path.join(ROOT, scanDir), scanDir, []);
  for (const rel of all) {
    const covered = registered.some(r => rel === r || rel.startsWith(r.replace(/\/$/, '') + '/'));
    if (!covered) { problems++; console.log(t('orphan', rel)); }
  }

  // 3. rule-file references: relative paths cited in rule files must exist
  for (const rf of RULE_FILES) {
    const p = path.join(ROOT, rf);
    if (!fs.existsSync(p)) continue;
    const text = fs.readFileSync(p, 'utf8');
    // markdown links + bare paths (docs/xxx.md style)
    const refs = new Set();
    for (const m of text.matchAll(/\]\(([^)#\s]+\.md)\)/g)) refs.add(m[1]);
    for (const m of text.matchAll(/(?:^|[\s`(])((?:docs|\.github)\/[\w\-./\u4e00-\u9fa5]+\.md)/gm)) refs.add(m[1]);
    for (const ref of refs) {
      if (ref.startsWith('http')) continue;
      if (!fs.existsSync(path.join(ROOT, ref)) && !fs.existsSync(path.join(path.dirname(p), ref))) {
        problems++;
        console.log(t('ruleDead', rf, ref));
      }
    }
  }

  console.log('');
  if (problems === 0) console.log(t('allGood'));
  else { console.log(t('problems', problems)); process.exit(1); }
}

// ── init ─────────────────────────────────────────────────────

function cmdInit() {
  const out = path.join(ROOT, 'truth-source.json');
  if (fs.existsSync(out) && !A.bools.has('force')) fail(t('initExists'));
  const topics = {};
  // auto-register rule files
  for (const rf of RULE_FILES) {
    if (fs.existsSync(path.join(ROOT, rf))) { topics[t('initRuleTopic')] = { file: rf, desc: t('initRuleDesc') }; break; }
  }
  // one placeholder per .md under docs/ (topic name = file name; rename to semantic topics)
  for (const rel of listMdFiles(path.join(ROOT, 'docs'), 'docs', [])) {
    const base = path.basename(rel, '.md');
    topics[base] = { file: rel, desc: t('initTodoDesc') };
  }
  const draft = {
    _comment: t('initComment'),
    version: 1,
    scanDir: 'docs',
    topics,
  };
  fs.writeFileSync(out, JSON.stringify(draft, null, 2) + '\n', 'utf8');
  console.log(t('initDone', Object.keys(topics).length));
  console.log(t('initHint'));
}

// ── main ─────────────────────────────────────────────────────

function main() {
  const cmd = A.pos[0];
  const rest = A.pos.slice(1);
  if (!cmd || cmd === 'help') { console.log(t('help')); return; }
  const table = { where: cmdWhere, list: cmdList, sections: cmdSections, update: cmdUpdate, check: cmdCheck, init: cmdInit };
  if (!table[cmd]) fail(t('unknownCmd', cmd));
  table[cmd](rest);
}

main();
