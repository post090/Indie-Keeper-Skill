---
name: indie-keeper
description: An AI housekeeper system for indie game projects — document governance (single source of truth), a feedback inbox tied to a version roadmap, a local WIKI, a document i18n state machine, and version sync + sprint acceptance. Use it when a solo dev or small team needs to "get the project under control": project management, messy docs, feedback triage, translations going stale, version numbers drifting, release flow, sprint sign-off, or when the user explicitly says "use indie-keeper". On first contact run the onboarding triage; behave per keeper-profile.json — never assume a one-size-fits-all template.
---

# indie-keeper · an AI housekeeper for indie game projects

A solo dev (or small team) making a game usually has no project manager, no localization lead, and no QA.
This Skill lets the AI wear those hats: **docs stay orderly, feedback has a paper trail, translations never silently rot, releases have a rhythm.**

Three design principles run through every operation:

1. **Triage first, build second** — every project has its own habits; never assume a "standard practice". All key choices are confirmed through triage and stored in `keeper-profile.json`.
2. **Progressive adoption** — the seven rooms are independent. Install only what you need. Never force the whole bundle.
3. **Conventions, not gates** — every flow is a default behavior for the AI, not a checkpoint. If the user says "just pass this one", listen to the user.

## Core concept map

```
Triage desk (first onboarding)
   ↓ answers stored in the profile
keeper-profile.json (project profile · every room consults it)
   ↓
┌─ Archive          single source of truth + safe section edits + checkup
├─ Feedback Box     feedback lifecycle → ROADMAP version roadmap
├─ WIKI             local browsing (wiki links / backlinks) + single-file pack + AI rule files
├─ Docs Translation Desk   document i18n state machine (extract template / stamp / status board)
├─ Game Text Desk   in-game text i18n (hardcode scan / coverage / drift / glossary)
├─ Shipping Dock    multi-file version sync + sprint acceptance + release pipeline
└─ Schedule         version dates + effort estimates → Gantt view in WIKI
```

How a single piece of feedback is handed off across rooms:
Player feedback enters the **Feedback Box** → gets scheduled into a **ROADMAP** version → at sprint kickoff becomes a **Sprint** acceptance item →
once done, **ship** releases it → patch notes go to the **Docs Translation Desk** for localization (wording checks the **glossary**) → the Feedback Box is backfilled with "resolved in vX.Y".

## AI onboarding flow

Every time this Skill is activated in a project:

1. **Find the profile**: check the project root for `keeper-profile.json`.
   - **Present** → read it, behave per profile, do not re-ask answered questions. When the project has the keeper scripts installed, run `keeper hello` for a shift-handover quick board (open feedback / current sprint / git status on one screen).
   - **Missing** → enter onboarding triage; read [references/onboarding.md](references/onboarding.md) and execute.
2. **Determine mode**:
   - **Furnish from scratch**: project has no doc structure yet → build only the rooms the user asked for, per triage results.
   - **Renovate**: project already has docs/, README, AGENTS.md, etc. → **inventory first**, register existing docs into the source of truth, fill only the gaps, never bulldoze.
3. **How it lands** (confirmed at triage):
   - Copy the zero-dependency Node scripts from `scripts/` into the target project (suggested `tools/keeper/`), register `"keeper": "node tools/keeper/keeper.js"` in package.json — then the whole project has one door: `keeper hello` for shift handover, `keeper truth where <topic>`, `keeper game scan` (keeper.js is the unified entry, with three daily commands built in — hello / status / where — and forwards the rest; each room's script can also run standalone; human manual at [references/cli.md](references/cli.md)). The scripts are CommonJS (`require`). If the target project's package.json has `"type": "module"`, add a tiny `tools/keeper/package.json` with `{"type": "commonjs"}` so Node resolves the keeper dir as CJS (the nearest package.json wins) — otherwise `require` throws `ReferenceError: require is not defined in ES module scope`.
   - Or port equivalent implementations using the project's existing stack (Python / Shell / …) following the mechanisms in [references/](references/).
   - In script-free mode, maintain the authoritative records by hand. The editing rules below apply to each mode.

## Rooms at a glance

| Room | What it solves | Data source of truth | Reference script | Detailed manual |
|------|---------------|---------------------|------------------|-----------------|
| 1 Archive | "Where is the lore written?" / AI edits clobber docs | `truth-source.json` | `scripts/commands/truth.js` | [room-archive.md](references/room-archive.md) |
| 2 Feedback Box | Feedback evaporates / plans live only in your head | `feedback.json` + `ROADMAP.md` | `scripts/commands/feedback.js` | [room-feedback.md](references/room-feedback.md) |
| 3 WIKI | Too many docs to browse / rule files scattered | (read-only, stateless) | `scripts/commands/docs-site.js` | [room-site.md](references/room-site.md) |
| 4 Docs Translation Desk | Source changes, translations go stale, nobody notices | `docs-manifest.json` + `docs-state.json` | `scripts/commands/docs-i18n.js` | [room-i18n.md](references/room-i18n.md) |
| 5 Game Text Desk | Hardcoded in-game text / stale translations / inconsistent terms | `game-i18n-manifest.json` + `glossary.json` | `scripts/commands/game-i18n.js` | [room-game-i18n.md](references/room-game-i18n.md) |
| 6 Shipping Dock | Version numbers drift / acceptance is verbal / releases are chaotic | `version-manifest.json` + `sprints/N.md` + `CHANGELOG.md` | `scripts/commands/version-sync.js` + `sprint.js` + `release.js` + `branch.js` | [room-shipping.md](references/room-shipping.md) |
| 7 Schedule | "When does this ship?" / plans without dates slip silently | `schedule.json` | `scripts/commands/schedule.js` | [room-schedule.md](references/room-schedule.md) |

**Suggested build order** (non-binding): most projects benefit most from starting with **Archive** + **Feedback Box**; build **Docs Translation Desk** and **Game Text Desk** only when there is a localization plan (the Game Text Desk triage includes "the one piece of advice you should heed even with no plan"); **WIKI** is an observation deck — install it once docs pile up; **Shipping Dock** should be ready before the first real release; **Schedule** slots in next to the Shipping Dock once versions have target dates — its Gantt view renders inside the WIKI.

## 🔴 Document safety red lines (observed unconditionally, unaffected by triage config)

The point of governance is to protect documents — never let governance itself become the destruction. These take priority over any room's flow:

1. **Never delete the user's original files.** "Organizing docs" = registering them in the source of truth + building references, **not** moving, renaming, or deleting. When a duplicate or stale doc is found, report it to the user and await instruction — do not clean up on your own.
2. **Archive instead of delete.** A doc that must be retired is, with user consent, moved into an `_archive/` directory (the WIKI and checkup ignore it by default) — never physically deleted.
3. **Destructive operations need per-item authorization.** Overwrite-class actions (`init --force`, `extract --force`), bulk moves/renames, directory reorganizations — list the affected files before acting, execute only after user confirmation. One authorization covers one action only; it does not carry forward.
4. **Edit the smallest relevant section or record.** With scripts installed, use the corresponding command for managed data and section edits. Without scripts, edit the source record (for example `feedback.json`), parse the JSON and review the diff. Generated views and translation fingerprints are tool output. Leave unavailable checks pending and keep their source evidence.
5. **Never run recursive deletes.** (`rm -rf`, `Remove-Item -Recurse`, etc.) Not for any reason, including "cleaning up test files" — even single-file deletes require user confirmation.
6. **Reversible before you act.** When the project is under git, confirm the working tree is clean before large operations (if there are uncommitted changes, remind the user to commit or stash first) so everything can be rolled back.

## AI daily conduct

Once rooms are installed, the AI abides by these long-term in this project:

**Document discipline (Archive)**
- Look up info via the source of truth first (`keeper where <topic>`); do not grep wildly.
- Editing a registered doc goes through **section replacement only** (`keeper truth update <doc> --section "<heading>"`); never full-file rewrite.
- Register new docs into `truth-source.json` once created; run `keeper truth check` after work.
- Maintain an "AI quick-read header" at the top of every important doc (one line / current phase / next step / blocker).

**Feedback discipline (Feedback Box)**
- Any feedback/idea the user relays, **log it to the inbox on the spot**, tag the source and label — do not let it evaporate.
- When planning a version, promote mature feedback into ROADMAP tasks and pin an id (`fb #N`).
- After release, backfill: mark completed feedback ✅ with the version number.

**Translation discipline (Docs Translation Desk)**
- After editing a source-language doc, immediately run `keeper docs status` to see which translations went stale.
- Translation flow: extract template → fill translation → stamp — no skipping steps. **An unstamped translation is as good as untranslated.**
- Pre-release: run `keeper docs stamp --all --check` to confirm no stale translations ship.

**Game text discipline (Game Text Desk)**
- **Before writing any player-facing text, consult the glossary** (`glossary.json`) — use this game's own terms, not generic words; log any newly coined term.
- Text goes straight into the dictionary, never hardcoded; run `keeper game scan` after work to keep zero hardcodes.
- Pre-release triple-check: `keeper game scan` + `keeper game drift --check` + `keeper game glossary lint`.

**Version discipline (Shipping Dock)**
- With scripts, use `keeper ver bump`. In script-free mode update the approved version in every target of `version-manifest.json` together and compare the values.
- Version level can be auto-computed from git history: `keeper ver next` previews, `keeper ver bump` (no arg) applies — `feat:` → minor, `fix:`/`perf:` → patch, `BREAKING` → major (downgraded to minor if `blockMajor` on 0.x).
- Acceptance follows `keeper-profile.json`'s `review.mode` (see below).
- A sprint item is done when its acceptance fields are satisfied — not when it feels done.

**Release pipeline discipline (Shipping Dock · Release)**
- Before `git commit`: `keeper release preflight commit` — scans staged files for debug residue (`console.log` / `debugger` / `TODO`), credential files (`.env` / `*.key` / `*.pem`), runs `node --check` on staged `.js`, and (if Archive/Docs Translation Desk installed) truth check + docs sync.
- Before `git push`: `keeper release preflight push` — all commit checks + test suite + behind-remote + branch confirm (warns on `main`/`master`) + PROGRESS.md recency + `keeper sync --check`.
- Before packaging a build: `keeper release preflight build` — version consistency + translations + sprint acceptance + clean worktree + release notes present + `keeper stale`.
- Problems (❌) block; warnings (⚠️) inform. Preflight never auto-fixes — it tells you what to fix.
- CHANGELOG lives in `CHANGELOG.md` (Keep a Changelog format): `keeper release changelog add "<text>"` appends to `[Unreleased]`; `keeper release changelog cut <X.Y.Z>` slices `[Unreleased]` into a versioned section with today's date.
- Platform publishing is **opt-in at triage** (`release.platforms`): `keeper release github/itch/steam` prints setup guides + generates templates (`release.yml` / `itch.toml` / `steam_upload.vdf`). The CLI never calls `gh` / `butler` / `steamcmd` directly — it hands you the commands to run.

**Schedule discipline (Schedule)**
- Dates and estimates live in `schedule.json` — the ROADMAP is the narrative (themes/goals), the schedule is the calendar.
- Add an item to the schedule the moment it gets a version assignment; an item without an estimate is still more useful than no entry.
- `keeper schedule check` after edits — catches duplicate ids, dangling dependencies, and due-before-start inversions.
- When a milestone slips, update the date in `schedule.json` and let the WIKI Gantt re-render — never leave the schedule lying about reality.
- Confidence field (`high`/`low`) is honest: mark `low` when the estimate is a wild guess; the Gantt renders those bars with a dashed outline so the human sees the uncertainty.

## Acceptance modes (review.mode)

The profile chooses who reviews. Small tasks may self-check. Plan formal items with `--formal --covers`, source and criteria, then attach a run record for the tested commit. For a human decision, plan `--human-review` and retain its original receipt. `--by` always names the recorder. See [Shipping Dock](references/room-shipping.md).

| Mode | Flow | Suited for |
|------|------|------------|
| `self` | AI finishes, checks acceptance fields itself, marks ✅ | Solo fast iteration, many small changes |
| `peer` | One agent does → another agent verifies | Prevents "player-coach" conflicts |
| `human` | AI finishes, marks "awaiting acceptance" → human nods to ✅ | Subjective work: gameplay / art / story |
| `mixed` | By item size: small = self, large = human | The steady state for most projects |

Paired rigor levels (`sprint.rigor`):
- **light** (default): items need only "title + how to accept" — two fields.
- **strict**: full fields (implementation / test method / ≥2 acceptance scenarios / risk / counter-question) + filler-word check + wiring check (if an item lists "wiring: file:symbol", verify it in code — catches "said it's done but never wired up"). Recommended for projects where AI writes a high proportion of code.

## AI rule files (AGENTS.md)

Every project should have an AI rule file — it is the "AI employee handbook" that tells any AI working on the project what the tech stack is, where things live, and what traps to avoid. indie-keeper's convention is `AGENTS.md` (recognized by Claude Code, Cursor, and other AI tools that read rule files).

### Create it during triage

After the onboarding triage writes `keeper-profile.json`, **create `AGENTS.md` at the project root** if one does not already exist (or adopt the user's existing rule file name — `CLAUDE.md`, `.cursorrules`, etc.). Seed it from the triage answers:

- **Tech stack** (from Q4 + room builds): language, framework, engine, dependencies
- **File layout**: where the source of truth, profile, manifest, sprints, feedback live
- **Conventions discovered during triage**: naming, commit style, line endings, anything the user corrected the AI on
- **Known traps**: anything the AI got wrong once and should not repeat (record these as they come up — this file is living, not write-once)
- **Boundaries**: what the project does not do (reuse the profile's authority annotations)

### Keep it maintained

This file is **living, not write-once**. The AI updates it whenever:
- A new convention is established or an old one changes
- A trap is discovered (the AI got something wrong → record it so the next session does not repeat it)
- A new room is built (add its files to the layout section)
- The tech stack changes

Register the rule file in the source of truth under the `"rules"` topic so `check` covers it.

### Auto-inclusion

The WIKI auto-includes `AGENTS.md` (and `CLAUDE.md`, `SOUL.md`, `GEMINI.md`, `START-HERE.md`, `.cursorrules`, `.github/copilot-instructions.md`, etc.), grouped under "🤖 Rules" at the top — the AI employee handbook belongs at the door.

### When the user already has one

If the project already has an AI rule file, **do not overwrite it**. Read it, adopt its name, and merge in the sections above (tech stack, traps, etc.) — ask the user before changing anything that looks intentional.

## Human entry page (START-HERE.md)

Every project should have a human-readable entry page — `START-HERE.md` at the root. It is the **for-humans** counterpart to AGENTS.md: where AGENTS.md tells the AI what to do, START-HERE.md tells the **person** what's going on. Solo devs use it to recall where they left off; small-team leads use it to brief members; collaborators use it to orient without reading the whole repo.

### Create it during triage

Right after creating `AGENTS.md`, **create `START-HERE.md` at the project root** if one does not already exist. Seed it from the triage answers:

- **What this is**: one paragraph — what the project is, what stage it's at
- **What's new**: latest progress (a few lines — what just happened, what's the current focus)
- **Pending decisions**: things waiting on a human nod (link to ROADMAP for details)
- **Document map**: a table of "which file answers what question" (reuse the truth-source registry — every registered topic becomes a row)
- **How to browse docs**: the `keeper site serve` / `keeper site pack` commands
- **Who does what**: the division of labor (from Q1)
- **How to file feedback**: `keeper fb add "<text>"`

**Reference other docs as wiki links.** Whenever START-HERE.md mentions another doc by name (ROADMAP, a sprint file, a reference manual, AGENTS.md, etc.), write it as a wiki link — `[[ROADMAP]]`, `[[sprints/1]]`, `[[references/cli]]` — so the WIKI renders it as a clickable cross-link and the backlinks panel picks it up. Bare `ROADMAP.md` works in plain text but loses the cross-link.

### Keep it maintained

This file is **living, not write-once**. The AI updates it whenever:
- Progress is made — finishing a sprint item, shipping a version, closing a feedback loop (update "What's new", keep it short, a few lines, not a changelog)
- A pending decision is resolved or a new one appears (update "Pending decisions")
- A new doc is registered or a major doc is added (update "Document map")
- The division of labor changes (update "Who does what")

The rule: **`keeper hello` nags the AI to check START-HERE.md every shift handover** — if progress was made but START-HERE.md wasn't updated, update it before ending the session. This is the reminder hook: the CLI prints a "is START-HERE stale?" line so the AI cannot conveniently forget.

Register START-HERE.md in the source of truth under the `"start-here"` topic so `check` covers it.

### Opt out

Some users don't want a human-entry page — maybe the README already does the job, maybe it's a one-file library, maybe they just don't want the maintenance. Set `startHere.enabled: false` in `keeper-profile.json` to switch the whole feature off:

- The triage does **not** create `START-HERE.md`
- `keeper hello` does **not** print the staleness reminder
- The WIKI still lists START-HERE.md if one happens to exist (read-only), but nothing forces it to exist or stay fresh

Default is `true` — most projects benefit from an obvious entry page. Flip it off only when the user explicitly says so.

### When the user already has one

If the project already has a human-entry file (a `README` that serves this purpose, a `docs/overview.md`, etc.), **do not create a duplicate**. Read it, and either adopt it as the START-HERE or ask the user which they prefer. The goal is one obvious entry page, not two.

### Auto-inclusion

The WIKI includes `START-HERE.md` in the root-docs group at the top of the sidebar — the front door is visible from the moment you open the site.

## Core entry docs (create during triage)

Keep `AGENTS.md` and `START-HERE.md` at the root. Create the five enabled status and design documents below in `docs/`. Adopt existing documents in place. Entry commands look at the root first, then `docs/`. If both copies exist, reconcile ownership before editing.

| Doc | Purpose | vs. its neighbors |
|-----|---------|-------------------|
| `PLAN.md` | Current + next sprint task list ("what to do in the next 2–3 weeks") | ROADMAP is the **narrative** (version themes/goals); PLAN is the **task list** (concrete items for the current + next sprint) |
| `PROGRESS.md` | Reverse-chronological progress log (full history trail, one line per entry) | START-HERE's "What's new" is a **snapshot** (latest 2–3 lines); PROGRESS is the **full history** |
| `DOCS-OVERVIEW.md` | Repo-wide document map + suggested reading order (global view) | START-HERE's doc map is the **today view** ("what to read now"); DOCS-OVERVIEW is the **global view** ("what docs exist, in what order") |
| `ARCHITECTURE.md` | Technical architecture: design principles, file layout, modules, data flow, key decisions | Architecture here means module/data-flow level, not just code architecture |
| `UIUX-SPEC.md` | UI/UX architecture: design system, interaction patterns, information architecture, accessibility | ARCHITECTURE is the **technical** architecture (modules/data flow); UIUX-SPEC is the **interface** architecture (visual system / interaction / IA) |

### Seeding rules

- **`PLAN.md`**: pull the current sprint's tasks from the first version in ROADMAP that's `in-progress` or `planned`. If sprints/ already has files, sync with the latest. Two sections: "Current sprint" + "Next sprint" (next sprint can be a one-liner placeholder until planned).
- **`PROGRESS.md`**: start with one entry — "Project onboarded into indie-keeper" (date + one line). From then on, **append a line to the top** every time something ships, a sprint closes, or a version tags.
- **`DOCS-OVERVIEW.md`**: derive from the truth-source registry — every registered topic becomes a row, grouped by category (entry / plan / manuals / config / templates). Add a "suggested reading order" line at the top of each category.
- **`ARCHITECTURE.md`**: seed from the triage's Q4 (repo shape) + tech stack discovered during room builds. Sections: design principles, file layout, module breakdown, data flow, key decisions (link to ADRs in `docs/decisions/` if any).
- **`UIUX-SPEC.md`**: seed from triage — if the project has any UI (web / Unity Canvas / Godot Control / etc.), establish the design-system skeleton (colors / typography / spacing / component states / interaction timings / accessibility). Pure-text/CLI projects opt out via `entryDocs.uiuxSpec: false`. **UI/UX is a typical authority domain** — the owner calls the shots; the AI only drafts and implements.

### Maintenance

- **`PLAN.md`**: rolling. Every new sprint → move "Current sprint" content into `PROGRESS.md` as a dated entry, promote "Next sprint" to current, draft a fresh "Next sprint".
- **`PROGRESS.md`**: append-only, never delete. One line per entry: `YYYY-MM-DD · one sentence · optional [[link]]`.
- **`DOCS-OVERVIEW.md`**: stable, update only when a new doc is registered or a category reshuffles.
- **`ARCHITECTURE.md`**: stable, update when a module is added/removed or a major decision lands (write the decision as an ADR first, then link it here).
- **`UIUX-SPEC.md`**: stable, update when the design system changes (colors / components / interaction patterns adjusted). For major visual decisions, write the rationale as an ADR first, then link it here.

### Auto-inclusion

The WIKI discovers these documents under its `docs/` scan directory and recognizes legacy root entries. For sidebar categories see [room-site.md](references/room-site.md).

### Opt out

If the user explicitly says they don't want one of these (e.g. "PROGRESS.md is overkill for a one-week project"), skip it — but record the opt-out in `keeper-profile.json` under `entryDocs: { plan: false, progress: false, ... }` so the AI doesn't re-pitch it next session. Default is all-true; flip off only when the user says so.

## Directory structure (the Skill itself)

```
indie-keeper/
├── SKILL.md                    ← you are reading this
├── references/                 ← per-room mechanism manuals (en source + .zh.md side-by-side)
│   ├── onboarding.md / .zh.md
│   ├── cli.md / .zh.md
│   ├── game-docs-menu.md / .zh.md
│   ├── room-archive.md / .zh.md
│   ├── room-feedback.md / .zh.md
│   ├── room-site.md / .zh.md
│   ├── room-i18n.md / .zh.md
│   ├── room-game-i18n.md / .zh.md
│   ├── room-shipping.md / .zh.md
│   └── room-schedule.md / .zh.md
├── scripts/                    ← zero-dependency Node reference implementations (copy / port)
│   ├── keeper.js               ← unified entry + hello/status/where + daily commands
│   ├── lang.js                 ← bilingual output helper (--lang > profile > default en)
│   ├── project-files.js        ← registry locations
│   └── commands/               ← room commands (truth / feedback / docs-site / docs-i18n /
│                                 game-i18n / version-sync / sprint / release / branch / schedule)
├── templates/                  ← blank templates and samples for each data file + UIUX-SPEC template
└── docs/                       ← this repo's own status docs (internal, Chinese)
    ├── zh/                     ← Chinese versions of root docs (README.zh.md, SKILL.zh.md)
    ├── ROADMAP.md / PLAN.md / PROGRESS.md / ARCHITECTURE.md / DOCS-OVERVIEW.md
    ├── truth-source.json / docs-manifest.json / docs-state.json / schedule.json
    ├── sprints/ / decisions/ / feedback/
    └── HANDOFF.md
```

## Boundaries (what this Skill does not do)

- Does not bind to any hosting platform's private practices by default; platform integration (GitHub / itch / steam) is **opt-in at triage** — only the platforms the user confirms get their guides and templates generated. The CLI never calls `gh` / `butler` / `steamcmd` directly; it prints the commands for the user to run.
- Does not touch credentials: token/key storage is advisory only (environment variables or a gitignored file), never written into any registry file.
- Does not make product decisions for the user: in fields where the division table marks an authoritative owner (e.g. "world-setting is decided by member X"), the AI only organizes and implements — it does not improvise.
