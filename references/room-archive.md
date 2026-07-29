# Archive (document governance)

Solves two pain points: "where is this information written?" and "the AI edited a doc and clobbered another section".

## Core mechanism

### Single source of truth (truth-source.json)

One JSON registry. The rule is simple: **each kind of information has exactly one authoritative file.**

```json
{
  "version": 1,
  "scanDir": "docs",
  "topics": {
    "characters": { "file": "docs/design/characters.md", "desc": "all character cards", "aliases": ["人设", "chars"], "authority": "name of the member in charge of setting" },
    "rules": { "file": "AGENTS.md", "desc": "AI collaboration rules" },
    "decisions": { "file": "docs/decisions", "desc": "ADR directory (directory-level registration covers all files beneath)" }
  }
}
```

Field notes:
- `aliases`: alternate names — `where` queries match both English and Chinese
- `authority`: authoritative owner. **For topics with an authority set, the AI only organizes and implements — it does not improvise.** Ask the owner before changing anything.
- `anchor`: optional, points directly to a section
- Directory-level registration: when `file` points to a directory, every file beneath is considered registered (checkup no longer reports them as untracked)

### Safe section edits (update)

The AI never rewrites a whole file — it only does "replace / append the content under <heading>":

```bash
node truth.js sections ROADMAP.md                       # list sections first
node truth.js update ROADMAP.md --section "v0.5" --content "..."
node truth.js update PROGRESS.md --section "log" --append --content "..."
```

Splits by markdown headings (a `#` inside a code block does not count as a heading), touches only the target section, leaves everything else intact. When the section is not found, lists all section names to help you correct it.

### Checkup (check)

Three checks; any failure exits 1 (CI-attachable):
1. **Dead links**: a registered file path does not exist
2. **Orphans**: a .md under `scanDir` that no topic has registered
3. **Rule-file dead links**: .md paths referenced inside AGENTS.md / CLAUDE.md etc. do not exist — rule-file rot is the most damaging to the AI, so it has the highest priority

### AI quick-read header (convention, not a tool)

Maintain four lines at the top of every important doc:

```markdown
## 📌 AI quick-read
- one line: …
- current phase: …
- next step: …
- blocker: … (write "none" if there isn't one)
```

The AI reads these four lines first when picking up work; update them after every major change (via `update --section "AI quick-read"`).

## Room build flow

1. **Renovation** (existing docs): run `truth.js init` to generate a draft → the AI renames topics from filenames to semantic topics, fills desc/aliases → ask the user to confirm authority ownership → `check` passes
2. **Furnish from scratch**: build 1–2 docs following the [game-docs-menu.md](game-docs-menu.md) recommendations, register as you build — do not scaffold empty frames in advance

## AI daily discipline

- Look up info via `where` first; do not grep wildly
- Editing a registered doc goes through `update` (section replacement) only; register a new doc the moment it is created
- For topics marked with `authority`, ask the owner before touching
- Run `check` after work; an untracked doc is handled by **registering it into the source of truth** (or reporting it to the user), a dead link is handled by fixing the registry — **neither is handled by deleting files** (see the document safety red lines in SKILL.md)
