#!/usr/bin/env node
// docs-site.js · WIKI: local browsing + single-file pack (zero deps)
// ─────────────────────────────────────────────────────────────
// Reference implementation of the indie-keeper WIKI.
// Turns docs/ plus the root documents into a small browsable website:
//   - sidebar tree (AI rule files get their own pinned group)
//   - [[wiki-links]] + backlinks (who mentions this doc)
//   - real image rendering (serve reads files · pack inlines base64)
//   - single-file pack: every doc squeezed into one HTML for offline reading
//
// Usage:
//   node docs-site.js serve [--port 4100]          local read-only WIKI
//   node docs-site.js pack [--out docs-site.html]  pack a single-file HTML
//
// All commands accept --root=<project root> (default cwd), --dir=<docs dir>
// (default docs) and --lang=<en|zh> for CLI output. The web UI has its own
// EN/中 toggle (default English, remembered in the browser).
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const { detectLang, makeT } = require('../lang');

// Optional: if schedule.js lives next to this script, import its Gantt renderer
// so the WIKI can show a Gantt view for ROADMAP. If schedule.js is absent
// (user copied docs-site.js without the schedule room), the site works normally
// minus the Gantt toggle — no hard dependency.
let renderGanttSVG = null;
let collectScheduleItems = null;
try { ({ renderGanttSVG, collectItems: collectScheduleItems } = require('./schedule.js')); } catch (e) { /* schedule room not installed */ }

// ── argv parsing: both --name=value and --name value are accepted ──
const VALUE_FLAGS = new Set(['root', 'dir', 'port', 'out', 'lang']);
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
// --dir accepts a comma-separated list: --dir docs,references
const DOCS_DIRS = flag('dir', 'docs').split(',').map(s => s.trim()).filter(Boolean);

const lang = detectLang();

const MSG = {
  siteTitle: { en: '{0} · Docs', zh: '{0} WIKI' },
  started: { en: '📖 WIKI running: http://localhost:{0}', zh: '📖 WIKI 已启动：http://localhost:{0}' },
  readonly: { en: '   read-only · Ctrl+C to stop', zh: '   只读模式 · Ctrl+C 停止' },
  portBusy: { en: 'Port {0} is taken · try another: docs-site.js serve --port {1}', zh: '端口 {0} 被占用 · 换一个：docs-site.js serve --port {1}' },
  startFail: { en: 'Failed to start: {0}', zh: '启动失败：{0}' },
  noDocs: { en: 'No documents found ({0}/ and the project root are both empty)', zh: '没找到任何文档（{0}/ 和根目录都空）' },
  packed: { en: '✓ Packed {0} doc(s) → {1} ({2} KB)', zh: '✓ 已打包 {0} 份文档 → {1}（{2} KB）' },
  packedHint: { en: '  one offline file · send it to people who install nothing', zh: '  单文件离线可用 · 直接发给不装任何工具的人' },
  unknownCmd: { en: 'Unknown command "{0}", see docs-site.js help', zh: '未知命令"{0}"，看 docs-site.js help' },
  help: {
    en: `docs-site.js · WIKI (local browsing + single-file pack)

  docs-site.js serve [--port 4100]           local read-only WIKI (wiki-links + backlinks)
  docs-site.js pack [--out docs-site.html]   pack every doc into one HTML (works offline)

  Scope: --dir directory (default docs/) + root docs (README …) + AI rule files (AGENTS.md …, listed first under Entry)
  Wiki-links: [[doc name]] or plain markdown links (.md targets become in-site links)
  Images render for real: serve reads local files · pack inlines them as base64
`,
    zh: `docs-site.js · WIKI （本地浏览 + 单文件打包）

  docs-site.js serve [--port 4100]           本地只读 WIKI （双链 + 反链）
  docs-site.js pack [--out docs-site.html]   全部文档打成一个 HTML（离线可用）

  收录范围：--dir 指定的目录（默认 docs/）+ 根文档（README 等）+ 守则文件（AGENTS.md 等，置于入口组顶部）
  双链写法：[[文档名]] 或普通 markdown 链接（.md 结尾自动转内链）
  图片真渲染：serve 直读本地文件 · pack 转 base64 内嵌
`,
  },
};
const t = makeT(MSG, lang);

// AI rule files (shown at the top of the Entry group — collect() pushes them first)
const RULE_FILES = [
  'AGENTS.md', 'CLAUDE.md', 'SOUL.md', 'GEMINI.md', 'START-HERE.md',
  '.cursorrules', '.github/copilot-instructions.md',
];
// Root-level regulars — docs that always live at the project root.
// Status docs (ROADMAP/PLAN/PROGRESS/DOCS-OVERVIEW/ARCHITECTURE) are NOT here:
// they live under docs/ (see "Repo layout convention" in onboarding.md), so the
// docs/ walk picks them up. Listing them here too would cause duplicates when
// the user passes --dir .,docs.
const ROOT_DOCS = ['README.md', 'SKILL.md', 'CHANGELOG.md'];

function fail(msg) { console.error(`✗ ${msg}`); process.exit(1); }

// ── collect documents ──
// Language-aware file collection: the web UI's EN/中 toggle switches not just
// the chrome strings but WHICH documents show in the sidebar.
//   en mode → source *.md (any sibling *.zh.md is hidden)
//   zh mode → *.zh.md when one exists beside the source, else the source *.md
// Rule files (AGENTS.md etc.) and root docs without a *.zh.md variant always
// show their source version.
// NOTE for users adopting this script for their own repo: this assumes the
// "source.md + source.zh.md side-by-side" bilingual convention (as used by
// indie-keeper's Docs Translation Desk). If your docs use a different i18n
// layout (e.g. docs/en/ + docs/zh/ subfolders, or no translations at all),
// strip the isZh / lang branches below or pass collect('en') unconditionally.
function collect(lang) {
  lang = lang || 'en';
  const files = [];
  function push(rel, group) {
    const abs = path.join(ROOT, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) files.push({ rel: rel.replace(/\\/g, '/'), abs, group, category: categorize(rel, group) });
  }
  // rules + root docs: prefer the localized variant in zh mode when it exists.
  // For root docs (README.md, SKILL.md), the Chinese version lives at docs/zh/
  // with a .zh.md suffix (e.g. docs/zh/README.zh.md) — the "集中到 docs/zh/"
  // convention for root docs. For rule files (AGENTS.md etc.) and other root
  // docs without a docs/zh/ mirror, fall back to the .zh.md side-by-side
  // convention (e.g. AGENTS.md + AGENTS.zh.md in the same folder).
  function pushLocalized(baseRel, group) {
    if (lang === 'zh') {
      const baseName = path.basename(baseRel);
      const zhRel = `docs/zh/${baseName.replace(/\.md$/, '.zh.md')}`;
      const zhAbs = path.join(ROOT, zhRel);
      if (fs.existsSync(zhAbs) && fs.statSync(zhAbs).isFile()) { push(zhRel, group); return; }
      // fall back to .zh.md side-by-side (for rule files, CHANGELOG, etc.)
      const zhSideRel = baseRel.replace(/\.md$/, '.zh.md');
      const zhSideAbs = path.join(ROOT, zhSideRel);
      if (fs.existsSync(zhSideAbs) && fs.statSync(zhSideAbs).isFile()) { push(zhSideRel, group); return; }
    }
    push(baseRel, group);
  }
  for (const rf of RULE_FILES) push(rf, 'rules');
  for (const rd of ROOT_DOCS) pushLocalized(rd, 'root');
  for (const dd of DOCS_DIRS) {
    (function walk(dir, base) {
      if (!fs.existsSync(dir)) return;
      for (const name of fs.readdirSync(dir)) {
        if (name.startsWith('.') || name === '_archive' || name === 'node_modules' || name === 'templates' || name === 'zh') continue;
        const abs = path.join(dir, name);
        const rel = `${base}/${name}`;
        const st = fs.statSync(abs);
        if (st.isDirectory()) walk(abs, rel);
        else if (name.endsWith('.md')) {
          // *.zh.md is the Chinese translation of the adjacent source .md.
          // en mode: skip *.zh.md (source .md already pushed in the same dir)
          // zh mode: push *.zh.md, skip the source .md (it has a zh variant here)
          const isZh = /\.zh\.md$/.test(name);
          if (lang === 'en' && isZh) continue;
          if (lang === 'zh' && !isZh) {
            const zhRel = rel.replace(/\.md$/, '.zh.md');
            if (fs.existsSync(path.join(ROOT, zhRel))) continue;
          }
          files.push({ rel, abs, group: 'docs', category: categorize(rel, 'docs') });
        }
      }
    })(path.join(ROOT, dd), dd);
  }
  // dedupe by absolute path (root docs can be hit by both ROOT_DOCS and the
  // walk when --dir includes "." — e.g. ./README.md vs README.md)
  const seen = new Set();
  return files.filter(f => {
    const key = path.resolve(f.abs);
    return !seen.has(key) && seen.add(key);
  });
}

// ── sidebar category mapping ──
// Two-step classification (per the user's "两者结合" choice):
//   1. Subdirectory docs → matched by DIRECTORY path first (so references/room-feedback.zh.md
//      lands in "manuals", not "feedback"; docs/feedback/INBOX.md lands in "feedback")
//   2. Root-level loose docs → matched by FILENAME keywords into a type bucket
// 'rules' group is always pinned at the top under "🤖 Rules" regardless.
// Type buckets (display order): entry / plan / arch / design / art / feedback / manuals
// Files that hit none of the keywords get category = their directory path
// (subdirs) or "other" (root), rendered as "📁 path/" groups in the sidebar.

// Directory → category mapping. Checked first, in order.
// Use directory-path segments so we match folders, not substrings of filenames.
const DIR_CATEGORY = [
  ['references', 'manuals'],
  ['docs/feedback', 'feedback'],
  ['docs/decisions', 'arch'],
  ['docs/sprints', 'plan'],
  ['docs/handoff', 'plan'],
  ['game-docs', 'design'],
  ['art', 'art'],
  ['assets', 'art'],
  ['design', 'design'],
];

// Filename → category mapping. Checked second, against the bare filename
// (without .md / .zh.md extension, lowercased). Use exact-or-prefix match
// so "plan" doesn't swallow "plants" or similar.
const FILE_CATEGORY = [
  // entry: front-door docs people read first
  ['readme', 'entry'], ['start-here', 'entry'], ['agents', 'entry'],
  ['claude', 'entry'], ['soul', 'entry'], ['gemini', 'entry'],
  ['docs-overview', 'entry'], ['skill', 'entry'],
  // plan: forward-looking + status docs
  ['roadmap', 'plan'], ['plan', 'plan'], ['progress', 'plan'],
  ['schedule', 'plan'], ['handoff', 'plan'], ['todo', 'plan'],
  // arch: technical architecture + decisions
  ['architecture', 'arch'], ['design', 'arch'],
  // design: game design docs (world / characters / systems / game-design)
  ['game-design', 'design'], ['world-setting', 'design'],
  ['characters', 'design'], ['system-design', 'design'],
  // feedback
  ['inbox', 'feedback'],
];

function categorize(rel, group) {
  // Rule files (AGENTS.md, START-HERE.md, .cursorrules, …) live in the same
  // "entry" bucket as README / DOCS-OVERVIEW / SKILL — they're all front-door
  // docs people read first. No separate "Rules" group in the sidebar.
  if (group === 'rules') return 'entry';
  const lower = rel.toLowerCase();
  const segs = lower.split('/');
  const name = (segs.pop() || '').replace(/\.zh\.md$/, '').replace(/\.md$/, '');
  const dir = segs.join('/');

  // Pass 1: directory path prefix match (highest priority — folder wins over
  // filename so references/room-feedback.zh.md lands in manuals, not feedback)
  for (const [seg, cat] of DIR_CATEGORY) {
    if (dir === seg || dir.startsWith(seg + '/')) return cat;
  }

  // Pass 2: filename match against root-level loose docs
  for (const [kw, cat] of FILE_CATEGORY) {
    if (name === kw || name.startsWith(kw)) return cat;
  }

  // Fallback: subdirectory docs use their directory as the bucket name;
  // root-level docs with no match go to "other"
  if (dir) return dir;
  return 'other';
}

function firstTitle(abs) {
  try {
    let lines = fs.readFileSync(abs, 'utf8').replace(/\r\n?/g, '\n').split('\n');
    // frontmatter at the top (--- fenced metadata): prefer its title:, else skip it
    if (lines[0] && lines[0].trim() === '---') {
      const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
      if (end > 0) {
        const fmTitle = lines.slice(1, end).map(l => /^title:\s*(.+)$/.exec(l.trim())).find(Boolean);
        if (fmTitle) return fmTitle[1].trim();
        lines = lines.slice(end + 1);
      }
    }
    const first = lines.find(l => l.trim());
    return (first || '').replace(/^#+\s*/, '').trim();
  } catch { return ''; }
}

// ── wiki-links & backlinks ──
// Two reference styles count: [[target]] (wiki) and [text](path.md) (markdown)

function nameIndex(files) {
  const idx = {};
  for (const f of files) {
    const noExt = f.rel.replace(/\.md$/, '');
    idx[noExt.split('/').pop().toLowerCase()] = f.rel;
    idx[noExt.toLowerCase()] = f.rel;
    idx[f.rel.toLowerCase()] = f.rel;
  }
  return idx;
}

function buildBacklinks(files) {
  const back = {};
  const idx = nameIndex(files);
  for (const f of files) {
    let text; try { text = fs.readFileSync(f.abs, 'utf8'); } catch { continue; }
    const targets = new Set();
    for (const m of text.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
      const t2 = idx[m[1].trim().toLowerCase()];
      if (t2) targets.add(t2);
    }
    for (const m of text.matchAll(/\]\(([^)#\s]+\.md)\)/g)) {
      const raw = m[1].replace(/^\.\//, '');
      const t2 = idx[raw.toLowerCase()] || idx[raw.replace(/\.md$/, '').toLowerCase()];
      if (t2) targets.add(t2);
    }
    for (const t2 of targets) {
      if (t2 === f.rel) continue;
      (back[t2] = back[t2] || []).push(f.rel);
    }
  }
  return back;
}

// ── image assets ──
// Index every image in the project: lookup by relative path, filename as a
// fallback (Obsidian embeds often carry just the filename)

const IMG_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico', '.avif']);
const IMG_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.avif': 'image/avif',
};
let IMG_IDX = null;
function imageIndex() {
  if (IMG_IDX) return IMG_IDX;
  IMG_IDX = { byRel: {}, byName: {} };
  (function walk(dir, base) {
    let names; try { names = fs.readdirSync(dir); } catch { return; }
    for (const name of names) {
      if (name.startsWith('.') || name === 'node_modules' || name === '_archive') continue;
      const abs = path.join(dir, name);
      const rel = base ? `${base}/${name}` : name;
      let st; try { st = fs.statSync(abs); } catch { continue; }
      if (st.isDirectory()) walk(abs, rel);
      else if (IMG_EXTS.has(path.extname(name).toLowerCase())) {
        IMG_IDX.byRel[rel.toLowerCase()] = rel;
        if (!(name.toLowerCase() in IMG_IDX.byName)) IMG_IDX.byName[name.toLowerCase()] = rel;
      }
    }
  })(ROOT, '');
  return IMG_IDX;
}

function resolveImage(docRel, src) {
  const ii = imageIndex();
  let s = src.replace(/^\.\//, '').replace(/\\/g, '/');
  try { s = decodeURIComponent(s); } catch { /* look up as-is */ }
  // resolve relative to the doc's directory → project root → bare filename
  const docDir = docRel.includes('/') ? docRel.slice(0, docRel.lastIndexOf('/')) : '';
  const joined = path.posix.normalize(docDir ? `${docDir}/${s}` : s);
  return ii.byRel[joined.toLowerCase()] || ii.byRel[s.toLowerCase()] || ii.byName[s.split('/').pop().toLowerCase()] || null;
}

// Load schedule.json (best effort) — returns parsed data or null. Used by the
// /api/doc route to attach a Gantt SVG when rendering ROADMAP.md. Same search
// order as schedule.js: root, docs/, .docs/.
function tryLoadSchedule() {
  for (const c of ['schedule.json', 'docs/schedule.json', '.docs/schedule.json']) {
    const p = path.join(ROOT, c);
    if (fs.existsSync(p)) {
      try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
    }
  }
  return null;
}

function imgTag(alt, src, ctx) {
  const a = String(alt).replace(/"/g, '&quot;');
  if (/^https?:/i.test(src)) return `<img src="${src.replace(/"/g, '&quot;')}" alt="${a}" loading="lazy">`;
  const rel = ctx && ctx.docRel != null ? resolveImage(ctx.docRel, src) : null;
  if (!rel) return `<span class="img">🖼 ${alt || src}</span>`;
  if (ctx.embed) {
    // pack: inline as base64 so the single file still shows images offline
    try {
      const mime = IMG_MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream';
      const b64 = fs.readFileSync(path.join(ROOT, rel)).toString('base64');
      return `<img src="data:${mime};base64,${b64}" alt="${a}" loading="lazy">`;
    } catch { return `<span class="img">🖼 ${alt || src}</span>`; }
  }
  return `<img src="/asset/${rel.split('/').map(encodeURIComponent).join('/')}" alt="${a}" loading="lazy">`;
}

// ── mini markdown renderer (just enough: headings/bold/code/lists/tables/quotes/links/wiki-links/images) ──

function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function inline(s, idx, ctx) {
  s = esc(s);
  // stash inline code first so nothing inside gets re-processed
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\x00${codes.length - 1}\x00`; });
  // Obsidian embeds ![[file]]: images render for real, other files show a placeholder
  s = s.replace(/!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g, (_, file) => {
    const f = file.trim();
    return IMG_EXTS.has(path.extname(f).toLowerCase()) ? imgTag(f, f, ctx) : `<span class="img">🖼 ${f}</span>`;
  });
  // wiki-links [[target]] / [[target|label]] (same syntax as Obsidian).
  // When no explicit label is given, show only the basename (drop the dir prefix)
  // so [[docs/HANDOFF.md]] renders as "HANDOFF.md", not "docs/HANDOFF.md".
  s = s.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g, (_, target, label) => {
    const t2 = idx[target.trim().toLowerCase()];
    const text = label || path.basename(target.trim());
    return t2 ? `<a href="#doc=${encodeURIComponent(t2)}" class="wiki">${esc(text)}</a>` : `<span class="wiki dead">${esc(text)}</span>`;
  });
  // images: local ones render for real (serve reads files · pack inlines base64), remote ones link straight
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_, alt, src) => imgTag(alt, src, ctx));
  // markdown links: .md targets become hash routes, the rest open externally
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
    if (/\.md(#.*)?$/.test(href) && !/^https?:/.test(href)) {
      const clean = href.replace(/^\.\//, '').replace(/#.*$/, '');
      const t2 = idx[clean.toLowerCase()] || idx[clean.replace(/\.md$/, '').toLowerCase()];
      if (t2) return `<a href="#doc=${encodeURIComponent(t2)}">${text}</a>`;
    }
    return `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\*([^*]+)\*/g, '<i>$1</i>');
  // NOTE: codes[] already holds escaped text (the whole line was escaped up top);
  // escaping again here would show literal &lt;topic&gt; on the page
  s = s.replace(/\x00(\d+)\x00/g, (_, n) => `<code>${codes[+n]}</code>`);
  return s;
}

function render(md, idx, ctx) {
  let lines = md.replace(/\r\n?/g, '\n').split('\n'); // normalize Windows CRLF first or trailing \r wrecks every regex
  const out = [];
  // Obsidian frontmatter (--- fenced metadata at the top): show as meta chips instead of dropping it
  if (lines[0] && lines[0].trim() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    if (end > 0) {
      const chips = [];
      for (const l of lines.slice(1, end)) {
        const c = l.indexOf(':');
        if (c < 0) continue;
        const k = l.slice(0, c).trim(); const v = l.slice(c + 1).trim();
        if (!k || !v || v === 'null') continue;
        chips.push(`<span class="fm"><b>${esc(k)}</b> ${esc(v)}</span>`);
      }
      if (chips.length) out.push(`<div class="fmbar">${chips.join('')}</div>`);
      lines = lines.slice(end + 1);
    }
  }
  const toc = [];
  let inFence = false, fenceBuf = [], inTable = false;
  const listStack = []; // 'ul' / 'ol' stack (unordered + ordered nesting)
  let para = [];        // adjacent plain lines merge into one paragraph

  function flushPara() { if (para.length) { out.push(`<p>${para.map(x => inline(x, idx, ctx)).join(' ')}</p>`); para = []; } }
  function closeList(depth) { while (listStack.length > (depth || 0)) out.push(`</${listStack.pop()}>`); }
  function closeTable() { if (inTable) { out.push('</table>'); inTable = false; } }

  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*```/.test(l)) {
      flushPara();
      if (inFence) { out.push(`<pre><code>${esc(fenceBuf.join('\n'))}</code></pre>`); fenceBuf = []; inFence = false; }
      else { closeList(); closeTable(); inFence = true; }
      continue;
    }
    if (inFence) { fenceBuf.push(l); continue; }

    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara(); closeList(); closeTable();
      const lvl = h[1].length;
      const id = 'h' + toc.length;
      toc.push({ lvl, text: h[2].replace(/[*`]/g, ''), id });
      out.push(`<h${lvl} id="${id}">${inline(h[2], idx, ctx)}</h${lvl}>`);
      continue;
    }
    if (/^\s*\|/.test(l)) {
      flushPara();
      if (/^\s*\|[\s:|-]+\|\s*$/.test(l)) continue; // separator row
      const cells = l.trim().replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim(), idx, ctx));
      if (!inTable) { closeList(); out.push('<table>'); inTable = true; out.push('<tr>' + cells.map(c => `<th>${c}</th>`).join('') + '</tr>'); }
      else out.push('<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>');
      continue;
    }
    closeTable();
    if (/^\s*>/.test(l)) { flushPara(); closeList(); out.push(`<blockquote>${inline(l.replace(/^\s*>\s?/, ''), idx, ctx)}</blockquote>`); continue; }
    // list items: - / * unordered, 1. ordered, both nest by indentation
    const li = l.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (li) {
      flushPara();
      const depth = Math.floor(li[1].length / 2) + 1;
      const tag = /\d/.test(li[2]) ? 'ol' : 'ul';
      while (listStack.length > depth) out.push(`</${listStack.pop()}>`);
      if (listStack.length === depth && listStack[depth - 1] !== tag) { out.push(`</${listStack.pop()}>`); }
      while (listStack.length < depth) { listStack.push(tag); out.push(`<${tag}>`); }
      out.push(`<li>${inline(li[3], idx, ctx)}</li>`);
      continue;
    }
    if (/^\s*---+\s*$/.test(l)) { flushPara(); closeList(); out.push('<hr>'); continue; }
    if (l.trim() === '') { flushPara(); closeList(); continue; }
    // plain text line: buffer it, adjacent lines merge into a paragraph (markdown convention)
    para.push(l.trim());
  }
  if (inFence) out.push(`<pre><code>${esc(fenceBuf.join('\n'))}</code></pre>`);
  flushPara(); closeList(); closeTable();
  return { html: out.join('\n'), toc };
}

// ── page shell (shared by serve and pack) ──
// Theme tri-state: follow system (default) → light → dark, topbar button cycles, saved in the browser
// UI language: EN/中 toggle in the topbar (default English), saved in the browser

function shell({ title, embedded, stamp }) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
:root{--bg:#f6f8fb;--panel:#fff;--ink:#25344a;--dim:#84929f;--line:#e2e9f1;
  --accent:#3273c5;--accent2:#1d5a9e;--link:#2a6fc0;--code-bg:#edf2f8;
  --pre-bg:#1e2a3a;--pre-ink:#dce6f2;--hover:#e7eef7;--shadow:rgba(37,52,74,.12)}
:root[data-theme=dark]{--bg:#0f1620;--panel:#151f2d;--ink:#c6d2df;--dim:#68798d;--line:#233248;
  --accent:#3a72b5;--accent2:#7fa5cc;--link:#7aa3d4;--code-bg:#1b2839;
  --pre-bg:#0b111a;--pre-ink:#bfcddc;--hover:#1d2c40;--shadow:rgba(0,0,0,.5)}
@media(prefers-color-scheme:dark){:root:not([data-theme=light]):not([data-theme=dark]){
  --bg:#0f1620;--panel:#151f2d;--ink:#c6d2df;--dim:#68798d;--line:#233248;
  --accent:#3a72b5;--accent2:#7fa5cc;--link:#7aa3d4;--code-bg:#1b2839;
  --pre-bg:#0b111a;--pre-ink:#bfcddc;--hover:#1d2c40;--shadow:rgba(0,0,0,.5)}}
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{font-family:system-ui,"PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--ink);
  display:flex;height:100vh;overflow:hidden;font-size:15px;line-height:1.75}
#side{width:280px;flex:none;background:var(--panel);border-right:1px solid var(--line);display:flex;flex-direction:column;height:100%}
#brand{padding:16px 20px 10px;border-bottom:1px solid var(--line)}
#brand h1{margin:0;font-size:16px;cursor:pointer;letter-spacing:.5px}#brand h1:hover{color:var(--accent)}
#brand p{margin:4px 0 0;font-size:12px;color:var(--dim)}
#search{margin:12px 16px;padding:8px 12px;border:1px solid var(--line);border-radius:10px;font-size:13px;
  background:var(--bg);color:var(--ink);width:calc(100% - 32px);outline:none}
#search:focus{border-color:var(--accent)}
#tree{overflow:auto;flex:1;padding:4px 8px 24px}
.grp{font-size:11px;color:var(--dim);letter-spacing:1px;padding:14px 12px 4px;font-weight:700;cursor:pointer;user-select:none}
.grp:hover{color:var(--accent)}
.grp .car{display:inline-block;width:12px;transition:transform .15s}
.grp.closed .car{transform:rotate(-90deg)}
.gbody.closed{display:none}
.item{display:block;padding:6px 12px;border-radius:8px;cursor:pointer;color:var(--ink);text-decoration:none;
  font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.item:hover{background:var(--hover)}
.item.on{background:var(--accent);color:#fff}
.item small{display:block;color:var(--dim);font-size:11px;overflow:hidden;text-overflow:ellipsis}
.item.on small{color:#e8f1ff}
#stamp{padding:10px 20px;border-top:1px solid var(--line);font-size:11px;color:var(--dim);text-align:center}
#main{flex:1;overflow:auto;height:100%}
#topbar{position:sticky;top:0;z-index:30;display:flex;gap:8px;align-items:center;padding:10px 20px;
  background:var(--bg);border-bottom:1px solid var(--line)}
#topbar button{border:1px solid var(--line);background:var(--panel);border-radius:8px;padding:6px 10px;
  font-size:15px;line-height:1;cursor:pointer;color:var(--ink);font-family:inherit;min-width:34px}
#topbar button:hover{background:var(--hover);border-color:var(--accent2)}
#topbar button:disabled{opacity:.4;cursor:not-allowed}
#btnHome,#btnBack,#btnLang{padding:6px 9px}
#crumb{font-size:12.5px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#btnTheme{margin-left:auto}
#wrap{max-width:880px;margin:0 auto;padding:24px 48px 120px}
#layout{display:flex;gap:36px}
#content{flex:1;min-width:0}
#toc{width:190px;flex:none;position:sticky;top:64px;align-self:flex-start;font-size:12.5px;
  max-height:calc(100vh - 110px);overflow:auto;border-left:1px solid var(--line);padding-left:14px}
#toc .t{color:var(--dim);letter-spacing:1px;font-size:11px;margin-bottom:8px;font-weight:700}
#toc a{display:block;color:var(--dim);text-decoration:none;padding:3px 0;line-height:1.4;
  border-left:2px solid transparent;margin-left:-15px;padding-left:13px;cursor:pointer}
#toc a:hover{color:var(--accent)}
#toc a.active{color:var(--accent);border-left-color:var(--accent);font-weight:600}
#toc a.l3,#toc a.l4{padding-left:24px;font-size:12px}
#content h1{font-size:25px;border-bottom:2px solid var(--accent);padding-bottom:10px;margin:.2em 0 .8em}
#content h2{font-size:20px;margin:1.6em 0 .6em;border-bottom:1px solid var(--line);padding-bottom:4px}
#content h3{font-size:16px;margin:1.3em 0 .5em;color:var(--accent2)}
#content h4{font-size:14.5px;margin:1.1em 0 .4em;color:var(--accent2)}
#content p{margin:.6em 0}
#content ul,#content ol{margin:.5em 0;padding-left:1.5em}#content li{margin:.25em 0}
#content code{background:var(--code-bg);padding:2px 6px;border-radius:5px;font-size:.88em;
  font-family:Consolas,"SF Mono",monospace;color:var(--accent2)}
#content pre{background:var(--pre-bg);color:var(--pre-ink);padding:14px 18px;border-radius:12px;
  overflow:auto;font-size:13px;line-height:1.6;margin:1em 0}
#content pre code{background:none;color:inherit;padding:0}
#content blockquote{margin:1em 0;padding:8px 16px;background:var(--panel);border-left:4px solid var(--accent);
  border-radius:0 8px 8px 0;color:var(--dim)}
#content table{border-collapse:collapse;width:100%;margin:1em 0;font-size:13.5px;background:var(--panel);
  border-radius:10px;overflow:hidden;box-shadow:0 1px 0 var(--line)}
#content th{background:var(--accent2);color:#fff;padding:9px 12px;text-align:left;font-weight:600}
#content td{padding:8px 12px;border-top:1px solid var(--line);vertical-align:top}
#content hr{border:none;border-top:1px dashed var(--line);margin:2em 0}
#content img{max-width:100%;border-radius:10px;box-shadow:0 2px 10px var(--shadow);margin:.4em 0;display:block}
#content a{color:var(--link);text-decoration:none}#content a:hover{text-decoration:underline}
#content a.wiki{background:var(--code-bg);padding:1px 7px;border-radius:6px;color:var(--accent2);font-weight:600;text-decoration:none}
#content a.wiki:hover{background:var(--hover)}
#content a.wiki::before{content:"🔗 ";font-size:.85em}
.wiki.dead{color:var(--dim);border-bottom:1px dashed var(--dim);padding:1px 7px}
.img{color:var(--dim);font-size:.9em}
.fmbar{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 18px}
.fmbar .fm{background:var(--code-bg);border:1px solid var(--line);border-radius:20px;padding:3px 12px;
  font-size:12px;color:var(--dim)}
.fmbar .fm b{color:var(--accent2);font-weight:600;margin-right:4px}
#ganttSection{margin:32px 0 16px;border:1px solid var(--line);border-radius:12px;background:var(--panel);overflow:hidden}
#ganttHead{display:flex;align-items:center;gap:10px;padding:12px 18px;cursor:pointer;user-select:none;
  background:linear-gradient(to right,var(--code-bg),transparent)}
#ganttHead:hover{background:var(--hover)}
#ganttHead .car{display:inline-block;width:12px;transition:transform .15s;color:var(--dim)}
#ganttSection.closed .car{transform:rotate(-90deg)}
#ganttHead .ttl{font-weight:600;color:var(--ink);font-size:14px}
#ganttHead .hint{font-size:12px;color:var(--dim);margin-left:auto}
#ganttBody{padding:16px 18px 20px;border-top:1px solid var(--line)}
#ganttSection.closed #ganttBody{display:none}
#ganttTools{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}
#ganttTools button{border:1px solid var(--line);background:var(--panel);border-radius:6px;padding:3px 9px;
  font-size:12px;cursor:pointer;color:var(--ink);font-family:inherit;line-height:1.5}
#ganttTools button:hover{background:var(--hover);border-color:var(--accent)}
#ganttZoom{margin-left:8px;font-size:11px;color:var(--dim)}
#ganttScroll{overflow:auto;max-height:560px;border:1px solid var(--line);border-radius:8px;background:#fafafa}
#ganttScroll svg{display:block;transform-origin:top left;transition:transform .1s}
#ganttScroll .gantt-bar:hover,#ganttScroll .gantt-label:hover{filter:brightness(.92);outline:1px solid var(--accent)}
#ganttCard{position:fixed;z-index:80;max-width:340px;background:var(--panel);border:1px solid var(--accent);
  border-radius:10px;box-shadow:0 8px 24px var(--shadow);padding:14px 16px;font-size:13px}
#ganttCard .ch{display:flex;align-items:center;gap:8px;margin-bottom:8px}
#ganttCard .ch .id{font-weight:700;color:var(--accent2);font-family:ui-monospace,monospace}
#ganttCard .ch .st{margin-left:auto;font-size:11px;padding:2px 8px;border-radius:10px;background:var(--code-bg);color:var(--ink)}
#ganttCard .ttl{font-weight:600;margin-bottom:8px;color:var(--ink)}
#ganttCard .row{display:flex;gap:8px;margin:3px 0;color:var(--dim);font-size:12px}
#ganttCard .row b{color:var(--ink);font-weight:600;min-width:64px;display:inline-block}
#ganttCard .note{margin:8px 0;padding:8px 10px;background:var(--code-bg);border-radius:6px;color:var(--ink);font-size:12px;line-height:1.6}
#ganttCard .act{margin-top:10px;display:flex;gap:8px}
#ganttCard .act a,#ganttCard .act button{flex:1;text-align:center;padding:6px 10px;border-radius:6px;font-size:12px;
  cursor:pointer;border:1px solid var(--accent);background:var(--accent);color:#fff;text-decoration:none;font-family:inherit}
#ganttCard .act button{background:var(--panel);color:var(--accent)}
#ganttCard .act a:hover{background:var(--accent2)}
#ganttCard .close{position:absolute;top:6px;right:8px;cursor:pointer;color:var(--dim);border:none;background:none;font-size:16px}
#backlinks{margin-top:48px;padding:16px 20px;background:var(--panel);border-radius:12px;border:1px solid var(--line)}
#backlinks .t{font-size:12px;color:var(--dim);letter-spacing:1px;margin-bottom:10px;font-weight:700}
#backlinks a{display:inline-block;margin:3px 8px 3px 0;padding:4px 12px;background:var(--code-bg);
  border-radius:20px;font-size:13px;color:var(--accent2);text-decoration:none}
#backlinks a:hover{background:var(--hover)}
#pager{display:flex;gap:12px;margin-top:40px;border-top:1px dashed var(--line);padding-top:20px}
#pager a{flex:1;border:1px solid var(--line);border-radius:10px;padding:12px 16px;text-decoration:none;
  background:var(--panel);color:var(--ink);min-width:0}
#pager a:hover{border-color:var(--accent2);background:var(--hover)}
#pager a .dir{font-size:11px;color:var(--dim);display:block;margin-bottom:3px}
#pager a .nm{font-size:14px;color:var(--accent2);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block}
#pager a.next{text-align:right}#pager a.ph{visibility:hidden}
#empty{color:var(--dim);text-align:center;margin-top:80px}
#burger{display:none}
#fab{display:none;position:fixed;right:18px;bottom:18px;z-index:55;width:52px;height:52px;border-radius:50%;
  background:var(--accent);color:#fff;border:none;font-size:22px;box-shadow:0 4px 14px var(--shadow);
  align-items:center;justify-content:center;cursor:pointer}
#sheet{display:none;position:fixed;inset:0;z-index:56}
#sheet.show{display:block}
#sheet .mask{position:absolute;inset:0;background:rgba(0,0,0,.4)}
#sheet .panel{position:absolute;left:0;right:0;bottom:0;background:var(--panel);border-radius:18px 18px 0 0;
  max-height:70vh;overflow:auto;padding:8px 0 20px;box-shadow:0 -4px 20px var(--shadow)}
#sheet .grip{width:40px;height:4px;background:var(--line);border-radius:2px;margin:10px auto 6px}
#sheet .ttl{padding:4px 20px 10px;font-size:13px;font-weight:700;color:var(--accent2);border-bottom:1px solid var(--line)}
#sheet a{display:block;padding:11px 20px;color:var(--ink);text-decoration:none;font-size:14px;border-bottom:1px solid var(--line);cursor:pointer}
#sheet a.l3,#sheet a.l4{padding-left:36px;font-size:13px;color:var(--dim)}
::-webkit-scrollbar{width:10px;height:10px}::-webkit-scrollbar-thumb{background:var(--line);border-radius:8px}
#scrim{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:49}
@media(max-width:900px){
  #side{position:fixed;left:0;top:0;bottom:0;z-index:50;width:78%;max-width:320px;
    transform:translateX(-100%);transition:transform .25s ease;box-shadow:2px 0 16px var(--shadow)}
  body.sb #side{transform:translateX(0)}
  body.sb #scrim{display:block}
  #burger{display:inline-flex}
  #toc{display:none}
  #fab{display:flex}
  #wrap{padding:16px 18px 80px}
  #content h1{font-size:22px}
}
</style></head><body>
<div id="scrim" onclick="document.body.classList.remove('sb')"></div>
<nav id="side">
  <div id="brand"><h1 onclick="goHome()">📚 ${esc(title)}</h1><p id="brandSub"></p></div>
  <input id="search">
  <div id="tree"></div>
  ${stamp ? `<div id="stamp" data-stamp="${esc(stamp)}"></div>` : ''}
</nav>
<main id="main">
  <div id="topbar">
    <button id="burger" onclick="document.body.classList.toggle('sb')">☰</button>
    <button id="btnHome" onclick="goHome()"></button>
    <button id="btnBack" onclick="goBack()" disabled></button>
    <span id="crumb"></span>
    <button id="btnTheme" onclick="cycleTheme()"></button>
    <button id="btnLang" onclick="toggleLang()"></button>
  </div>
  <div id="wrap"><div id="layout">
    <article id="content"><div id="empty"></div></article>
    <nav id="toc"></nav>
  </div></div>
</main>
<button id="fab" onclick="document.getElementById('sheet').classList.add('show')">📑</button>
<div id="sheet"><div class="mask" onclick="closeSheet()"></div><div class="panel"><div class="grip"></div><div class="ttl"></div><div id="sheetList"></div></div></div>
<script>
const EMBEDDED = ${embedded ? 'true' : 'false'};
const DATA = ${embedded ? '__DATA__' : 'null'};

// ── UI language: EN/中 toggle (default English · saved in the browser) ──
const L = {
  en: {
    sub: 'indie-keeper WIKI', search: '🔍 Search…',
    home: '🏠', back: '←', langBtn: '🌐',
    homeTitle: 'Home', backTitle: 'Back', langTitle: 'Switch to 中文',
    themeTitle: 'Theme: system / light / dark',
    tAuto: '🌗', tLight: '☀️', tDark: '🌙',
    toc: 'ON THIS PAGE', pick: '← Pick a doc on the left', notFound: 'Doc not found: ',
    backlinks: '🕸️ Referenced by', prev: '← Previous', next: 'Next →', packedAt: 'Packed at ',
  },
  zh: {
    sub: 'indie-keeper WIKI', search: '🔍 搜索…',
    home: '🏠', back: '←', langBtn: '🌐',
    homeTitle: '主页', backTitle: '返回', langTitle: 'Switch to EN',
    themeTitle: '配色：跟随系统 / 白天 / 夜间',
    tAuto: '🌗', tLight: '☀️', tDark: '🌙',
    toc: '本页目录', pick: '← 从左边选一篇', notFound: '没找到文档：',
    backlinks: '🕸️ 被这些文档引用', prev: '← 上一篇', next: '下一篇 →', packedAt: '打包于 ',
  },
};
function curLang() { try { return localStorage.getItem('keeper-site-lang') || 'en'; } catch (e) { return 'en'; } }
function T() { return L[curLang()]; }

// ── sidebar category labels + display order ──
// Computed by the backend's categorize() function and shipped with each
// tree entry as f.category. Buckets follow CATEGORY_ORDER; unknown
// categories (subdirectory fallbacks) come after, alphabetically.
const CATEGORY_LABELS = {
  en: {
    entry: '🚪 Entry', plan: '📅 Plan & status',
    arch: '🏛️ Architecture', design: '🎲 Design', art: '🎨 Art',
    feedback: '💬 Feedback', manuals: '📚 Manuals', other: '📁 Other',
  },
  zh: {
    entry: '🚪 入口', plan: '📅 计划与状态',
    arch: '🏛️ 架构', design: '🎲 设计', art: '🎨 美术',
    feedback: '💬 反馈', manuals: '📚 手册', other: '📁 其他',
  },
};
const CATEGORY_ORDER = ['entry', 'plan', 'arch', 'design', 'art', 'feedback', 'manuals'];
function toggleLang() {
  const next = curLang() === 'en' ? 'zh' : 'en';
  try { localStorage.setItem('keeper-site-lang', next); } catch (e) {}
  // language switch changes which files exist in the tree (source .md vs *.zh.md),
  // so the cache and TREE must be rebuilt from the server
  for (const k in CACHE) delete CACHE[k];
  HIST.length = 0;
  boot();
}
function applyLang() {
  const s = T();
  document.documentElement.lang = curLang() === 'zh' ? 'zh' : 'en';
  document.getElementById('brandSub').textContent = s.sub;
  document.getElementById('search').placeholder = s.search;
  document.getElementById('btnHome').textContent = s.home;
  document.getElementById('btnHome').title = s.homeTitle;
  document.getElementById('btnBack').textContent = s.back;
  document.getElementById('btnBack').title = s.backTitle;
  document.getElementById('btnLang').textContent = s.langBtn;
  document.getElementById('btnLang').title = s.langTitle;
  document.getElementById('btnTheme').title = s.themeTitle;
  const stampEl = document.getElementById('stamp');
  if (stampEl) stampEl.textContent = s.packedAt + stampEl.getAttribute('data-stamp');
  const empty = document.getElementById('empty');
  if (empty) empty.textContent = s.pick;
  applyTheme(curTheme());
  renderTree((document.getElementById('search').value || '').toLowerCase().trim());
  if (location.hash.match(/#doc=/)) route(); // rebuild dynamic labels (toc/backlinks/pager)
}

// ── theme tri-state: auto (follow system · default) → light → dark ──
const THEMES = ['auto', 'light', 'dark'];
function applyTheme(t) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
  const lbl = { auto: T().tAuto, light: T().tLight, dark: T().tDark };
  document.getElementById('btnTheme').textContent = lbl[t];
}
function curTheme() { try { return localStorage.getItem('keeper-theme') || 'auto'; } catch (e) { return 'auto'; } }
function cycleTheme() {
  const next = THEMES[(THEMES.indexOf(curTheme()) + 1) % THEMES.length];
  try { localStorage.setItem('keeper-theme', next); } catch (e) {}
  applyTheme(next);
}

let TREE = [], TITLES = {}, ORDER = [];
const CACHE = {}, HIST = [];
let HOME = null;
function el(t, attrs, text) { const e = document.createElement(t); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); if (text) e.textContent = text; return e; }
function escT(s) { return String(s).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }); }

async function getTree() { if (EMBEDDED) return DATA.tree; return (await (await fetch('/api/tree?lang=' + curLang())).json()).tree; }
async function getDoc(rel) {
  if (CACHE[rel]) return CACHE[rel];
  const d = EMBEDDED ? DATA.docs[rel] : await (await fetch('/api/doc?rel=' + encodeURIComponent(rel) + '&lang=' + curLang())).json();
  CACHE[rel] = d; return d;
}

function collapsedSet() {
  try { return new Set(JSON.parse(localStorage.getItem('keeper-site-collapsed') || '[]')); } catch (e) { return new Set(); }
}
function saveCollapsed(s) {
  try { localStorage.setItem('keeper-site-collapsed', JSON.stringify(Array.from(s))); } catch (e) {}
}

function renderTree(filter) {
  const tree = document.getElementById('tree'); tree.innerHTML = '';
  const collapsed = collapsedSet();
  const lang = curLang();
  const L = CATEGORY_LABELS[lang] || CATEGORY_LABELS.en;
  // Group files by category (computed by the backend's categorize() function).
  // Known type buckets follow CATEGORY_ORDER; unknown categories (subdirectory
  // fallbacks) come after, alphabetically.
  const byCat = {};
  for (const f of TREE) {
    if (filter && !f.rel.toLowerCase().includes(filter) && !(f.title || '').toLowerCase().includes(filter)) continue;
    const cat = f.category || 'other';
    (byCat[cat] = byCat[cat] || []).push(f);
  }
  function addItem(box, f) {
    const a = el('a', { class: 'item', href: '#doc=' + encodeURIComponent(f.rel), 'data-rel': f.rel });
    const name = f.rel.split('/').pop().replace(/\\.md$/, '');
    // bare numeric filenames (sprints etc.) say nothing — promote the title, demote the number
    let big = name, small = f.title && f.title !== name ? f.title : '';
    if (/^\\d+$/.test(name) && f.title) { big = f.title; small = '#' + name; }
    a.innerHTML = escT(big) + (small ? '<small>' + escT(small) + '</small>' : '');
    box.appendChild(a);
  }
  // collapsible group: header click folds the body (state saved · search keeps all open)
  function addGroup(key, label, items) {
    const isClosed = !filter && collapsed.has(key);
    const head = el('div', { class: 'grp' + (isClosed ? ' closed' : '') });
    head.innerHTML = '<span class="car">▾</span>' + escT(label);
    const body = el('div', { class: 'gbody' + (isClosed ? ' closed' : '') });
    head.onclick = function () {
      const s = collapsedSet();
      if (s.has(key)) s.delete(key); else s.add(key);
      saveCollapsed(s);
      head.classList.toggle('closed');
      body.classList.toggle('closed');
    };
    items.forEach(function (f) { addItem(body, f); });
    tree.appendChild(head); tree.appendChild(body);
  }
  // Render in CATEGORY_ORDER; then any unknown categories (subdirectory paths)
  // in alphabetical order, each labeled "📁 path/".
  const known = new Set(CATEGORY_ORDER);
  const others = Object.keys(byCat).filter(function (c) { return !known.has(c); }).sort();
  for (const cat of CATEGORY_ORDER) {
    if (!byCat[cat]) continue;
    addGroup(cat, L[cat] || cat, byCat[cat]);
  }
  for (const cat of others) {
    addGroup(cat, '📁 ' + cat + '/', byCat[cat]);
  }
}

function goHome() { if (HOME) location.hash = '#doc=' + encodeURIComponent(HOME); }
function goBack() {
  if (HIST.length < 2) return;
  HIST.pop();
  const prev = HIST[HIST.length - 1];
  location.hash = '#doc=' + encodeURIComponent(prev);
}
function updateBack() { document.getElementById('btnBack').disabled = HIST.length < 2; }
function jumpTo(id) { const e = document.getElementById(id); if (e) e.scrollIntoView({ behavior: 'smooth' }); }
function closeSheet() { document.getElementById('sheet').classList.remove('show'); }

async function route() {
  const m = location.hash.match(/#doc=([^&]+)/); if (!m) return;
  const rel = decodeURIComponent(m[1]);
  document.body.classList.remove('sb');
  const d = await getDoc(rel);
  const c = document.getElementById('content');
  if (!d || d.error) { c.innerHTML = '<div id=empty>' + escT(T().notFound) + escT(rel) + '</div>'; return; }
  if (HIST[HIST.length - 1] !== rel) HIST.push(rel);
  updateBack();
  document.getElementById('crumb').textContent = rel;
  document.querySelectorAll('.item').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-rel') === rel); });
  c.innerHTML = d.html;
  // Inline Gantt section: if the doc came with a Gantt SVG (ROADMAP.md +
  // schedule.json present), append a collapsible section UNDER the prose.
  // The prose stays visible — Gantt is a companion view, not a replacement.
  if (d.gantt && d.gantt.svg) {
    const lang = curLang();
    const sec = el('div', { id: 'ganttSection', class: 'closed' });
    const head = el('div', { id: 'ganttHead' });
    const lblGantt = lang === 'zh' ? '📊 甘特视图' : '📊 Gantt view';
    const lblHint = lang === 'zh' ? '点任务条看详情' : 'click a bar for details';
    head.innerHTML = '<span class="car">▾</span><span class="ttl">' + escT(lblGantt) + '</span>' +
                     '<span class="hint">' + escT(lblHint) + '</span>';
    const body = el('div', { id: 'ganttBody' });
    const tools = el('div', { id: 'ganttTools' });
    const lblZoom = lang === 'zh' ? '缩放' : 'zoom';
    const lblReset = lang === 'zh' ? '还原' : 'reset';
    const lblExpand = lang === 'zh' ? '全宽' : 'fit';
    tools.innerHTML = '<button id="gZoomOut" title="-">−</button>' +
                      '<span id="ganttZoom">100%</span>' +
                      '<button id="gZoomIn" title="+">+</button>' +
                      '<button id="gReset">' + escT(lblReset) + '</button>' +
                      '<button id="gExpand">' + escT(lblExpand) + '</button>';
    const scroll = el('div', { id: 'ganttScroll' });
    scroll.innerHTML = d.gantt.svg;
    body.appendChild(tools);
    body.appendChild(scroll);
    sec.appendChild(head);
    sec.appendChild(body);
    c.appendChild(sec);

    // Toggle open/close by clicking the header
    head.onclick = function () { sec.classList.toggle('closed'); };

    // Zoom: scale the SVG via CSS transform. Keep transform-origin top-left so
    // the scroll container's overflow stays meaningful.
    let zoom = 1;
    const svgEl = scroll.querySelector('svg');
    const zoomLabel = document.getElementById('ganttZoom');
    function applyZoom() {
      if (svgEl) svgEl.style.transform = 'scale(' + zoom + ')';
      zoomLabel.textContent = Math.round(zoom * 100) + '%';
    }
    document.getElementById('gZoomIn').onclick = function () { zoom = Math.min(3, zoom + 0.2); applyZoom(); };
    document.getElementById('gZoomOut').onclick = function () { zoom = Math.max(0.4, zoom - 0.2); applyZoom(); };
    document.getElementById('gReset').onclick = function () { zoom = 1; applyZoom(); };
    document.getElementById('gExpand').onclick = function () {
      // "fit" = scale to make the SVG width match the scroll container width
      if (!svgEl) return;
      const sw = svgEl.viewBox.baseVal.width || svgEl.getBoundingClientRect().width;
      const cw = scroll.clientWidth - 4;
      if (sw > 0 && cw > 0) { zoom = Math.max(0.4, Math.min(3, cw / sw)); applyZoom(); }
    };

    // Click-a-bar → detail card. Event delegation on the scroll container so
    // it works for both <rect> and <circle> bars, plus the <text> labels.
    const items = (d.gantt.items || []).reduce(function (m, it) { m[it.id] = it; return m; }, {});
    let card = null;
    function closeCard() { if (card) { card.remove(); card = null; } }
    function showCard(itemId, ev) {
      const it = items[itemId];
      if (!it) return;
      closeCard();
      card = el('div', { id: 'ganttCard' });
      const lang = curLang();
      const L = lang === 'zh' ? {
        est: '工期', dates: '日期', dep: '依赖', conf: '把握度',
        ver: '版本', ms: '里程碑', sprintBtn: '查看 Sprint 文档',
        noSprint: '无对应 Sprint 文档', close: '×',
      } : {
        est: 'effort', dates: 'dates', dep: 'depends on', conf: 'confidence',
        ver: 'version', ms: 'milestone', sprintBtn: 'View sprint doc',
        noSprint: 'no matching sprint doc', close: '×',
      };
      const statusLabel = it.status;
      const confLabel = it.confidence === 'low' ? (lang === 'zh' ? '低（瞎猜）' : 'low (wild guess)') : (lang === 'zh' ? '高' : 'high');
      const datesStr = (it.start && it.due) ? (it.start + ' → ' + it.due) : (lang === 'zh' ? '未排' : 'unscheduled');
      const estStr = it.estimate != null ? (it.estimate + (lang === 'zh' ? ' 天' : ' d')) : '?';
      const depStr = it.dependsOn && it.dependsOn.length ? it.dependsOn.join(', ') : (lang === 'zh' ? '无' : 'none');
      const msStr = it.versionMilestone || (lang === 'zh' ? '无' : 'none');
      // sprint link: only render if the sprint file is in the sidebar (curDocs)
      const sprintHref = it.sprintFile && TITLES[it.sprintFile]
        ? '<a href="#doc=' + encodeURIComponent(it.sprintFile) + '">' + escT(L.sprintBtn) + '</a>'
        : '<button disabled title="' + escT(L.noSprint) + '">' + escT(L.noSprint) + '</button>';
      card.innerHTML =
        '<button class="close">' + escT(L.close) + '</button>' +
        '<div class="ch"><span class="id">' + escT(it.id) + '</span>' +
          '<span class="st">' + escT(statusLabel) + '</span></div>' +
        '<div class="ttl">' + escT(it.title) + '</div>' +
        '<div class="row"><b>' + escT(L.ver) + '</b><span>' + escT(it.version + ' · ' + it.versionTitle) + '</span></div>' +
        '<div class="row"><b>' + escT(L.est) + '</b><span>' + escT(estStr) + '</span></div>' +
        '<div class="row"><b>' + escT(L.dates) + '</b><span>' + escT(datesStr) + '</span></div>' +
        '<div class="row"><b>' + escT(L.dep) + '</b><span>' + escT(depStr) + '</span></div>' +
        '<div class="row"><b>' + escT(L.conf) + '</b><span>' + escT(confLabel) + '</span></div>' +
        '<div class="row"><b>' + escT(L.ms) + '</b><span>' + escT(msStr) + '</span></div>' +
        (it.note ? '<div class="note">' + escT(it.note) + '</div>' : '') +
        '<div class="act">' + sprintHref + '<button class="close-btn">' + escT(lang === 'zh' ? '关闭' : 'Close') + '</button></div>';
      document.body.appendChild(card);
      // Position near the click, clamped to viewport
      const x = Math.min(ev.clientX + 12, window.innerWidth - 360);
      const y = Math.min(ev.clientY + 12, window.innerHeight - card.offsetHeight - 12);
      card.style.left = x + 'px';
      card.style.top = y + 'px';
      card.querySelector('.close').onclick = closeCard;
      card.querySelector('.close-btn').onclick = closeCard;
    }
    scroll.addEventListener('click', function (e) {
      const t = e.target.closest('[data-item-id]');
      if (!t) return;
      e.preventDefault();
      showCard(t.getAttribute('data-item-id'), e);
    });
    // Close card on outside click or Esc
    document.addEventListener('click', function (e) {
      if (!card) return;
      if (e.target.closest('#ganttCard') || e.target.closest('[data-item-id]')) return;
      closeCard();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeCard(); });
  }
  // right-side page toc + mobile bottom sheet (same data)
  const toc = document.getElementById('toc'), sheetList = document.getElementById('sheetList');
  document.querySelector('#sheet .ttl').textContent = T().toc;
  if (d.toc && d.toc.length) {
    const mk = d.toc.map(function (t) { return '<a class="l' + t.lvl + '" data-id="' + t.id + '">' + escT(t.text) + '</a>'; }).join('');
    toc.innerHTML = '<div class=t>' + escT(T().toc) + '</div>' + mk;
    sheetList.innerHTML = mk;
    toc.querySelectorAll('a').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); jumpTo(a.dataset.id); }; });
    sheetList.querySelectorAll('a').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); closeSheet(); jumpTo(a.dataset.id); }; });
  } else { toc.innerHTML = ''; sheetList.innerHTML = ''; }
  // backlink pills
  if (d.backlinks && d.backlinks.length) {
    const bl = el('div', { id: 'backlinks' });
    bl.innerHTML = '<div class=t>' + escT(T().backlinks) + '</div>' + d.backlinks.map(function (b) {
      return '<a href="#doc=' + encodeURIComponent(b) + '">' + escT(b.split('/').pop().replace(/\\.md$/, '')) + '</a>';
    }).join('');
    c.appendChild(bl);
  }
  // previous / next (sidebar order)
  const idx = ORDER.indexOf(rel);
  const prev = idx > 0 ? ORDER[idx - 1] : null;
  const next = idx >= 0 && idx < ORDER.length - 1 ? ORDER[idx + 1] : null;
  if (prev || next) {
    const nm = function (r) { return escT(TITLES[r] || r.split('/').pop().replace(/\\.md$/, '')); };
    const pg = el('div', { id: 'pager' });
    pg.innerHTML =
      (prev ? '<a class="prev" href="#doc=' + encodeURIComponent(prev) + '"><span class="dir">' + escT(T().prev) + '</span><span class="nm">' + nm(prev) + '</span></a>' : '<a class="prev ph"></a>') +
      (next ? '<a class="next" href="#doc=' + encodeURIComponent(next) + '"><span class="dir">' + escT(T().next) + '</span><span class="nm">' + nm(next) + '</span></a>' : '<a class="next ph"></a>');
    c.appendChild(pg);
  }
  document.getElementById('main').scrollTop = 0;
}

// highlight the toc entry that matches the scroll position
function initScrollSpy() {
  document.getElementById('main').addEventListener('scroll', function () {
    const heads = document.querySelectorAll('#content h1,#content h2,#content h3');
    let cur = null;
    heads.forEach(function (h) { if (h.getBoundingClientRect().top < 120) cur = h.id; });
    document.querySelectorAll('#toc a').forEach(function (a) { a.classList.toggle('active', a.dataset.id === cur); });
  });
}

async function boot() {
  TREE = await getTree();
  ORDER = TREE.map(function (f) { return f.rel; });
  TREE.forEach(function (f) { TITLES[f.rel] = f.title; });
  HOME = ORDER.find(function (r) { return /README\\.md$/i.test(r); }) || ORDER[0];
  applyLang();
  initScrollSpy();
  document.getElementById('search').oninput = function (e) { renderTree(e.target.value.toLowerCase().trim()); };
  window.addEventListener('hashchange', route);
  if (location.hash.match(/#doc=/)) route(); else goHome();
}
boot();
</script></body></html>`;
}

// ── serve ──

function cmdServe() {
  const port = parseInt(flag('port', '4100'), 10);
  const title = t('siteTitle', path.basename(ROOT));
  const PAGE = shell({ title, embedded: false });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const files = collect(url.searchParams.get('lang') || 'en');
    if (url.pathname === '/api/tree') {
      const tree = files.map(f => ({ rel: f.rel, group: f.group, category: f.category, title: firstTitle(f.abs) }));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ tree }));
    }
    if (url.pathname === '/api/doc') {
      const rel = url.searchParams.get('rel') || '';
      const hit = files.find(f => f.rel === rel);
      res.writeHead(hit ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8' });
      if (!hit) return res.end('{"error":"not found"}');
      const idx = nameIndex(files);
      const back = buildBacklinks(files);
      const r = render(fs.readFileSync(hit.abs, 'utf8'), idx, { docRel: hit.rel, embed: false });
      // If this is ROADMAP.md and a schedule.json exists with the Gantt
      // renderer available, attach a Gantt SVG + flat item list so the UI
      // can render an inline collapsible Gantt with clickable bars.
      const sched = tryLoadSchedule();
      const isRoadmap = /(^|\/)roadmap\.md$/i.test(hit.rel);
      const gantt = (renderGanttSVG && collectScheduleItems && sched && isRoadmap)
        ? { svg: renderGanttSVG(sched), items: collectScheduleItems(sched) }
        : null;
      return res.end(JSON.stringify({ rel, html: r.html, toc: r.toc, backlinks: back[rel] || [], gantt }));
    }
    // image passthrough: /asset/<project-relative path> (only files present in
    // the image index are served — no directory traversal)
    if (url.pathname.startsWith('/asset/')) {
      const rel = decodeURIComponent(url.pathname.slice('/asset/'.length));
      const safe = imageIndex().byRel[rel.toLowerCase()];
      if (!safe) { res.writeHead(404); return res.end('not found'); }
      const mime = IMG_MIME[path.extname(safe).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'max-age=60' });
      return res.end(fs.readFileSync(path.join(ROOT, safe)));
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
  });

  server.listen(port, () => {
    console.log(t('started', port));
    console.log(t('readonly'));
  });
  server.on('error', e => {
    if (e.code === 'EADDRINUSE') fail(t('portBusy', port, port + 1));
    fail(t('startFail', e.message));
  });
}

// ── pack ──

function cmdPack() {
  const out = flag('out', 'docs-site.html');
  const files = collect(lang === 'zh' ? 'zh' : 'en');
  if (!files.length) fail(t('noDocs', DOCS_DIRS.join(', ')));
  const idx = nameIndex(files);
  const back = buildBacklinks(files);
  const data = { tree: [], docs: {} };
  for (const f of files) {
    data.tree.push({ rel: f.rel, group: f.group, category: f.category, title: firstTitle(f.abs) });
    const r = render(fs.readFileSync(f.abs, 'utf8'), idx, { docRel: f.rel, embed: true });
    data.docs[f.rel] = { rel: f.rel, html: r.html, toc: r.toc, backlinks: back[f.rel] || [] };
  }
  const title = t('siteTitle', path.basename(ROOT));
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  // break up </script> inside the JSON so it cannot close the tag early
  const json = JSON.stringify(data).replace(/<\//g, '<\\/');
  const html = shell({ title, embedded: true, stamp }).replace('__DATA__', json);
  const outPath = path.resolve(ROOT, out);
  fs.writeFileSync(outPath, html, 'utf8');
  const kb = Math.round(fs.statSync(outPath).size / 1024);
  console.log(t('packed', files.length, path.relative(ROOT, outPath), kb));
  console.log(t('packedHint'));
}

// ── main ──

function main() {
  const cmd = A.pos[0];
  if (!cmd || cmd === 'help') { console.log(t('help')); return; }
  const table = { serve: cmdServe, pack: cmdPack };
  if (!table[cmd]) fail(t('unknownCmd', cmd));
  table[cmd]();
}

main();
