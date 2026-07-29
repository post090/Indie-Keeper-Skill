# WIKI (local browsing + single-file pack)

Solves two pain points: "too many docs to look at" and "rule files scattered and unread". Pure observation deck — **read-only, never modifies any file**.

## Core mechanism

### Local browsing (serve)

```bash
node docs-site.js serve --port 4100
```

Spin up a read-only WIKI with zero dependencies:
- Left sidebar tree, three groups: **◆ Rules** (AGENTS.md / CLAUDE.md / SOUL.md etc., auto-discovered, pinned to top), **◇ Root docs** (README / CHANGELOG / ROADMAP…), **▸ Docs** (`--dir` can swap the directory, default docs/)
- **Search box** at the top of the sidebar, filters by filename and title as you type
- `[[wiki links]]` for jumps: `[[characters]]` and `[[characters|character list]]` both work; plain markdown links to .md are also auto-converted to internal links
- **Backlinks**: every doc lists "which docs reference me" at the bottom — check backlinks before changing lore, so you know who will be affected
- Dead wiki links render dashed (target missing), so broken links are visible at a glance
- Right-side **this-page outline**, the current section highlights as you scroll; **prev/next** is auto-appended at the bottom
- Top bar has Home / Back (browsing history stack) buttons; on mobile the sidebar collapses into a hamburger menu, and a floating button in the bottom-right opens the this-page outline

### Three color schemes

Top bar cycles with one click: **◐ auto** (follows system, default) → **○ day** (white-blue) → **● night** (dark-blue).
The choice is stored in the browser (localStorage), and both serve and pack honor it. The UI uses geometric symbols, no emoji.

### Single-file pack (pack)

```bash
node docs-site.js pack --out docs-site.html
```

All docs (including rule files) are rendered and packed into **one HTML file** — wiki links, backlinks, tree, search, color-scheme toggle all preserved; the sidebar footer prints the pack time. Send it over chat, put it on a phone, read it offline — for collaborators who install nothing (e.g. an artist who only draws).

### Inclusion rules

- Auto-skipped: `.dot-directories`, `_archive/` (the archive zone, paired with the safety red lines), `node_modules/`
- Images render as placeholders (not inlined, to keep the single file small)
- The renderer supports: headings / bold-italic / inline code / code blocks / lists (nested) / tables / blockquotes / horizontal rules; all text is escaped before rendering, so a `#` inside a code block is never mistaken for a heading
- **Language-aware collection**: if a doc has a sibling `foo.zh.md` next to its source `foo.md`, the EN/中 toggle in the topbar switches which one shows in the sidebar (en → source `.md`, zh → `.zh.md`). Files without a `.zh.md` variant always show their source version. This follows indie-keeper's "source.md + source.zh.md side-by-side" bilingual convention; if your repo uses a different i18n layout (e.g. `docs/en/` + `docs/zh/` subfolders, or no translations), this auto-filter still won't lose files — the worst case is both languages show up listed, which you can suppress by editing the `collect()` function in `scripts/commands/docs-site.js`.

## Room build flow

The WIKI has no state, no config file — usable any time:
1. If you have docs, you can run it; `serve` to show the user first
2. When the user wants to distribute, `pack`; the output `docs-site.html` is recommended for `.gitignore` (regenerable any time, no need to bloat version control)

## AI daily discipline

- User says "show me / send me the docs" → reach for `pack` first; do not paste ten .md files one by one
- When writing docs, use `[[wiki links]]` generously to connect related docs — backlinks are a free knowledge network
- This tool is read-only; if you find a content issue, fix it back in the Archive (truth.js), do not act here
