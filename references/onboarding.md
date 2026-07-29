# Onboarding triage manual · onboarding

The AI executes this the first time indie-keeper is activated in a project. After the triage, write the answers into `keeper-profile.json` at the project root.

## Three rules of triage

1. **Ask in batches, not an interrogation.** On first contact, ask only the "global four"; room-specific questions come when the corresponding room is built. Never more than 4 questions at once.
2. **Every question comes with context and a recommendation.** Users (especially new indie devs) often do not know "how others usually do it". The format must be: explain common practice → give a recommended default → ask the user to choose. If the user says "you decide", use the recommended value and tag it `"decidedBy": "default"` in the profile.
3. **Answers must be saved.** Everything goes into `keeper-profile.json`. Answered questions are never re-asked; to change something, edit the profile directly (or have the AI do it).

## First contact · the global four

### Q1 · Team and division of labor

> How many people are on this project? Who handles what? ("Just me" is a valid answer.)

**Why we ask**: determines whether the Archive needs "authority" annotations — certain domains (worldbuilding / art / story) are owned by a specific person, and the AI only organizes and implements, never improvises. Also determines which people show up as feedback source labels.

**Suggestion**: solo projects are most common; 2–3 person teams usually split as "setting/art by A, code/engineering by B". For hybrid teams (humans + multiple AI roles), register the AI as a team member too, with clear responsibilities.

### Q2 · The big brain dump ⭐

> What ideas, plans, and decisions do you currently have in your head, chat logs, and notes? **Dump it all out, messy is fine, I will sort it.**

**Why we ask**: this is the core ritual of onboarding. The AI's first labor is to sort the pot into three buckets:
- 💡 Undecided small ideas → Feedback Box (status=idea)
- 📋 Already-scheduled plans → ROADMAP at the corresponding version
- ✅ Confirmed settings/decisions → Archive, registered

**Sorting rule** — the single question to ask of each item: *has the user decided?*

| Bucket | Signal | Example |
|--------|--------|---------|
| ✅ confirmed | The user has adopted it as setting/decision — it's a fact now | "the protagonist's name is Lila", "the engine is Godot 4" |
| 📋 plan | The user has decided to **do** it and it has a version target (even a rough one) | "v0.4 will add double-jump", "the next patch fixes the save bug" |
| 💡 idea | Everything else — thoughts the user is still chewing on, hasn't committed to | "maybe add a double-jump?", "I'm leaning toward Lila but not sure", "considering a day/night cycle" |

Edge cases:
- "I want to add X" with no version → 💡 idea (decided to want it, but not decided to do it yet)
- "X is done" (past tense) → ✅ confirmed (it shipped, it's reality now)
- "X is in the design doc" → ✅ confirmed (already adopted as setting)
- "X will be in v0.5" → 📋 plan
- "X is a maybe" / "I'm thinking about…" / "what if we…" → 💡 idea

When ambiguous, ask the user "is this decided, or are you still thinking about it?" — don't guess. Miscategorizing a confirmed setting as an idea means the AI might "helpfully" revise it later; miscategorizing an idea as confirmed bakes in something the user hadn't committed to. Both are costly.

**After sorting, show the user the sorted list and ask them to verify.** The result of this step is the first proof of the system's value.

### Q3 · Release platforms

> Which platforms do you plan to release on? (itch.io / Steam / mobile / web / not sure yet)

**Why we ask**: determines which files the Shipping Dock syncs version numbers across (e.g. Android's build.gradle), whether the Docs Translation Desk needs to manage store-page copy, and how far the release flow goes.

**Suggestion**: itch.io is the most common indie first release (zero barrier); Steam has a one-time entry fee and needs multilingual store-page assets; "not sure yet" is completely valid — the Shipping Dock can be built later.

### Q4 · Repo shape

> What form does your code repository take?

**Context, three common patterns**:
- **Single private**: most common for commercial games; CI produces builds for release. Most solo projects start and stay here. (Recommended default)
- **Single public**: open-source game; the code is the promotion; the issue tracker is part of the Feedback Box.
- **Dual repos**: private repo for daily dev, public repo for releases only. For "code stays private but the project wants a public face". Highest maintenance cost.

## Menu sign-off · what to install

After the global four, present **three menus in sequence** (one batch per menu, never more than 4 questions at once). Each item comes with a one-line "what it solves" + recommended default. The user picks what they want; answers go into `keeper-profile.json`. Disabled items: the AI does not pitch them later, the CLI does not display their commands, and related logic degrades gracefully (see [Compatibility notes](#compatibility-notes) below).

This is the **single most important step for keeping the project lean** — indie-keeper ships 7 rooms + 7 skeleton docs + 2 conventions, but most projects need only a subset. Forcing the whole bundle on a one-person project defeats the purpose.

### Menu A · Rooms (7 items, one multi-select)

> Which rooms do you want installed? Each room is independent — install only what solves a real pain.

| Room | Solves | Default |
|------|--------|---------|
| **Archive** | "Which file is this setting in?" / AI clobbers docs | ✅ on |
| **Feedback Box** | Feedback evaporates / plans live in your head | ✅ on |
| **WIKI** | Too many docs to browse / rule files scattered | ✅ on |
| **Docs Translation Desk** | Source changes, translations go stale | ⬜ off (only if localization planned) |
| **Game Text Desk** | Hardcoded in-game text / inconsistent terms | ⬜ off (only if localization planned) |
| **Shipping Dock** | Version numbers drift / acceptance is verbal | ✅ on (ready before first real release) |
| **Schedule** | "When does this ship?" / plans without dates slip | ⬜ off (slots in when versions have dates) |

Write answers to `rooms.*` in the profile. Disabled rooms: the AI does not pitch them; if the user hits the corresponding pain later, mention the room once and let them opt in.

### Menu B · Project skeleton docs (7 items, one multi-select)

> Which skeleton docs should I create at the project root / under `docs/`? Each is a one-time seed that orients newcomers without making them grep the whole repo.

| Doc | Purpose | Default |
|-----|---------|---------|
| **AGENTS.md** (root) | AI employee handbook (tech stack, conventions, traps) | ✅ on (always — any AI working on the project reads it first) |
| **START-HERE.md** (root) | Human entry page (what's new, pending decisions, doc map) | ✅ on (opt out via `startHere.enabled: false` if README already does the job) |
| **docs/PLAN.md** | Current + next sprint task list | ✅ on |
| **docs/PROGRESS.md** | Reverse-chrono progress log | ✅ on |
| **docs/DOCS-OVERVIEW.md** | Repo-wide doc map + reading order | ✅ on |
| **docs/ARCHITECTURE.md** | Technical architecture (modules / data flow / decisions) | ✅ on |
| **docs/UIUX-SPEC.md** | UI/UX architecture (design system / interaction / a11y) | ✅ on if project has UI; ⬜ off for pure-text/CLI (opt out via `entryDocs.uiuxSpec: false`) |

Write answers to `startHere.enabled` and `entryDocs.*` in the profile. Disabled docs: not created, not re-pitched in later sessions.

### Menu C · Conventions (2 items, establish-and-document)

> These aren't on/off switches — they're conventions the AI establishes and writes into `AGENTS.md`. Confirm with the user so they know what will happen.

| Convention | What the AI does | Default |
|------------|------------------|---------|
| **Repo layout** | Identity docs at root, status docs under `docs/`, scripts under `scripts/` — guide the user toward a tidy root | ✅ establish (adapt folder names to the project's framework) |
| **Testing** | Naming + layering + maintenance rules for tests, tailored to the stack — written into `AGENTS.md` | ✅ establish (skip only for pure-doc projects with no code) |

No profile field for these — they're practices, not switches. The AI establishes them during triage and records them in `AGENTS.md`. If the user says "skip testing convention", the AI doesn't write that section.

### Compatibility notes

Disabled rooms/docs degrade gracefully:
- **Room off**: CLI doesn't list the room's commands; `keeper hello` doesn't show its status; the room's manual is still readable in `references/` but the AI doesn't pitch it.
- **START-HERE off** (`startHere.enabled: false`): triage doesn't create the file; `keeper hello` skips the staleness reminder; `keeper start-here refresh` errors gracefully with "START-HERE.md not found"; WIKI still lists it if one happens to exist (read-only).
- **Entry doc off** (`entryDocs.*: false`): not created, not re-pitched. `keeper hello`'s "docs to maintain" section skips it. If a disabled doc is later created by hand, the AI registers it in truth-source but doesn't nag.
- **Schedule off but Shipping on**: ROADMAP works normally; `keeper hello` doesn't show schedule status; the WIKI Gantt view is absent (schedule.js not required).
- **PROGRESS off**: `keeper hello` skips the progress-based staleness check; `keeper progress add` errors gracefully with "PROGRESS.md not found — create it or re-enable via entryDocs.progress".

## Additional triage when building rooms

Only ask when the user decides to build the corresponding room.

### When building the Archive

- What docs does the project already have? (The AI scans docs/, root *.md, AGENTS.md/CLAUDE.md rule files first, lists the inventory for the user to confirm — rather than making the user recite a list)
- Are there domains that need "authority" annotation? (Reuse the Q1 division of labor if present)
- What game-design docs are missing? Recommend using the "organ lookup" in [game-docs-menu.md](game-docs-menu.md) — at most 3 at a time, only build what will be written immediately, register equivalents instead of rebuilding.

### When building the Feedback Box

- Who/what are the feedback sources? (Playtester friends, community, issue tracker… determines the `from` label set)
- What version cadence does the ROADMAP use? (Suggestion: most indie games go in small 0.x steps; themed names like "v0.5 workshop overhaul" suit projects with no fixed schedule better than date-based ones)

### When building the WIKI

- Just for local viewing, or also for packing and sending to collaborators who install nothing? (Determines whether serve or pack takes priority)

### When building the Docs Translation Desk

- What is the source language? What are the target languages?
- Who translates? (Suggestion: AI-only with human spot-checks is the most common practice today; important store pages should get a human final review. Determines the stamping-flow strictness)
- Which docs are not translated? (Suggestion: LICENSE staying in its original language is open-source convention)

### When building the Game Text Desk (three questions, see [room-game-i18n.md](room-game-i18n.md))

- **Is there a localization plan?** No / unsure → do not build the room, but leave one piece of advice: keep text centralized, do not scatter hardcodes — whether a future translation is a one-day move or a three-week archaeological dig depends on this.
- **Does the game already have an i18n mechanism?** Yes → inventory and plug in (dictionary format / location / translation function), never bulldoze; No → use engine-recommended defaults (the manual has an engine cheat sheet).
- **What engine / tech stack?** Determines the dictionary format (JSON/CSV/engine-managed) and scan rules.
- While at it, start the glossary: what homebrew terms does the game already have? (e.g. the action resource is not called stamina but "Soul") → register them in glossary.json; the AI follows it for all future text.

### When building the Shipping Dock

- Which files contain version numbers? (The AI scans first: package.json / build.gradle / pyproject.toml / Godot export_presets / VERSION files… lists them for the user to confirm)
- Version-number cadence? (Suggestion: staying on 0.x before launch is common discipline, avoids the "1.0" psychological burden; `blockMajor` defaults on)
- **Sprint rigor** (`sprint.rigor`):
  - `light` (recommended default): item = title + how to accept, two fields.
  - `strict`: full fields + filler-word check + wiring check. Suggestion: projects where AI writes a high proportion of code should use strict — it catches "the AI said it's done but the code was never wired up".
- **Acceptance mode** (`review.mode`):
  > When a task is finished, whose nod counts?
  - `self`: AI self-verifies (solo fast iteration)
  - `peer`: one agent does, another agent verifies
  - `human`: a human nod is required (pick this for subjective work)
  - `mixed`: small things self, big things human (recommended for most real projects)

  Emphasize: this is a default flow, not a gate; to switch temporarily, just say so.
- **Release pipeline** (`release.*`, opt-in — default off):
  > Which parts of release choreography do you want the CLI to help with? (You can pick none — this is all optional.)
  - `preflight`: the AI runs `keeper release preflight commit/push/build` before each irreversible step, catching debug residue / credential leaks / version drift / stale translations. (Recommended default — this is cheap insurance.)
  - `changelog`: `keeper release changelog init/add/cut/show` maintains a `CHANGELOG.md` in Keep a Changelog format. (Recommended if you don't already have a changelog habit.)
  - `autoVersion`: `keeper ver next` auto-computes the bump level from conventional commits; `keeper ver bump` (no arg) applies it. (Default on — turn off if you hand-pick every bump.)
  - `commitConvention`: "Should commits follow conventional commits (feat/fix/chore…)?" — defaults to `conventional` because that's what `ver next` parses; set `freeform` if the project already has its own style.
  - `platforms`: "Which platforms do you want setup guides + templates for?" (multi-select — `github` / `itch` / `steam`. Default none; pick what you actually plan to ship to.)
    - GitHub: generates `.github/workflows/release.yml` + `gh` CLI guide. Pick if the repo is on GitHub and you want tag-triggered builds.
    - itch.io: generates `itch.toml` + butler guide. Pick for indie first release (zero barrier).
    - Steam: generates `steam_upload.vdf` + steamcmd guide. Pick only if you've paid the Steamworks entry fee.

  The CLI never calls `gh` / `butler` / `steamcmd` directly — it prints the commands. Zero credentials stored.

### When building the Schedule

- Do versions have target dates? (Suggestion: solo projects often resist fixed dates — that's fine, the Schedule handles dateless versions too, laying them out by sequence. But if there's any external deadline — a festival, a publisher milestone, a "before I run out of savings" date — write it down here as a version milestone)
- What's the unit of estimate? (Recommended: working days. Avoid story points unless the user already uses them — the point is honesty, not agile ceremony)
- Who sets the dates? (For solo: the user. For teams: usually the lead. This is a default, not a gate — anyone can move a date later by editing schedule.json)

## After triage: create AGENTS.md + START-HERE.md + core entry docs

Once `keeper-profile.json` is written, create **seven files** (skip any the user opted out of via `entryDocs`). Where they live follows the [Repo layout convention](#repo-layout-convention) below — the short version: identity docs at root, status docs under `docs/`.

1. **`AGENTS.md`** (project root) — the AI employee handbook (tech stack, file layout, conventions, known traps, boundaries). Any AI working on the project reads it first. See the "AI rule files (AGENTS.md)" section in [SKILL.md](../SKILL.md). Keep it maintained as conventions evolve and traps are discovered.

2. **`START-HERE.md`** (project root) — the human entry page (what's new, pending decisions, document map, who does what). The for-humans counterpart to AGENTS.md. See the "Human entry page (START-HERE.md)" section in [SKILL.md](../SKILL.md). Keep it updated every session — if progress was made but START-HERE.md wasn't updated, update it before ending the session. **When START-HERE.md mentions other docs by name, write them as wiki links** (`[[ROADMAP]]`, `[[sprints/1]]`, `[[references/cli]]`) so the WIKI renders cross-links and the backlinks panel picks them up. Set `startHere.enabled: false` in the profile if the user doesn't want this page at all.

3. **`docs/PLAN.md`** — current + next sprint task list. See "Core entry docs" in [SKILL.md](../SKILL.md). Seed from the first `in-progress` or `planned` version in ROADMAP.

4. **`docs/PROGRESS.md`** — reverse-chronological progress log. Start with one entry: "Project onboarded into indie-keeper" (date + one line). Append a line to the top every time something ships.

5. **`docs/DOCS-OVERVIEW.md`** — repo-wide document map + suggested reading order. Derive from the truth-source registry: every registered topic becomes a row.

6. **`docs/ARCHITECTURE.md`** — technical architecture (design principles, file layout, modules, data flow, key decisions). Seed from Q4 + room builds.

7. **`docs/UIUX-SPEC.md`** — UI/UX architecture (design principles, visual system, interaction patterns, information architecture, accessibility). The interface counterpart to ARCHITECTURE.md. Seed from triage: if the project has any UI (web/Unity Canvas/Godot Control/etc.), establish the design system skeleton; pure-text/CLI projects opt out via `entryDocs.uiuxSpec: false`. **UI/UX is a typical authority domain** — if a team member owns UI/UX, they call the shots; the AI only drafts and implements.

Register all seven in the source of truth (`"rules"`, `"start-here"`, `"plan"`, `"progress"`, `"docs-overview"`, `"architecture"`, `"uiux-spec"` topics) so `check` covers them.

## Repo layout convention

A tidy root is a project's front door. During triage, guide the user toward this layout (adapt names to the project's framework — Unity projects keep `Assets/`, web projects keep `src/`, etc.; the convention is about *not scattering*, not about exact folder names):

```
project-root/
├── README.md            ← identity (always root, like package.json)
├── AGENTS.md            ← identity (AI rule file)
├── START-HERE.md        ← identity (human entry)
├── keeper-profile.json  ← identity (project fingerprint)
├── package.json / equivalent
├── docs/                ← ALL narrative & status docs live here
│   ├── zh/              ← Chinese versions of root docs (README.zh.md, SKILL.zh.md)
│   │                      (keeps root tidy: only English source at root, zh under docs/zh/)
│   ├── ROADMAP.md       ← version themes/goals
│   ├── PLAN.md          ← current sprint task list
│   ├── PROGRESS.md      ← progress log (reverse-chrono)
│   ├── DOCS-OVERVIEW.md ← document map
│   ├── ARCHITECTURE.md  ← technical architecture
│   ├── UIUX-SPEC.md     ← UI/UX architecture (if entryDocs.uiuxSpec)
│   ├── truth-source.json    ← source-of-truth registry
│   ├── docs-manifest.json   ← i18n config (if Translation Desk installed)
│   ├── docs-state.json      ← i18n fingerprints (auto-generated)
│   ├── schedule.json        ← version dates/effort (if Schedule installed)
│   ├── sprints/         ← sprint plans + acceptance records
│   ├── feedback/        ← feedback box data
│   ├── decisions/       ← ADRs (architecture decision records)
│   ├── design/          ← design docs (game design, world, characters, systems)
│   ├── tech/            ← tech docs (engine choice, performance, tooling)
│   ├── uiux/            ← UI/UX docs (wireframes, interaction, accessibility)
│   └── HANDOFF.md       ← session handoff memo (for the next AI)
├── references/          ← room manuals (en source + .zh.md side-by-side)
├── templates/           ← data file templates + game doc skeletons (en + .zh side-by-side)
└── scripts/             ← keeper CLI + room scripts
    ├── keeper.js        ← CLI entry
    ├── lang.js          ← shared i18n helper
    ├── lib/             ← shared library helpers
    ├── commands/        ← one file per room (truth/feedback/docs-site/…)
    └── tests/           ← test scripts (see Testing convention below)
```

**Rules of thumb**:
- **Root is for identity only.** If a file isn't `README` / `AGENTS` / `START-HERE` / `LICENSE` / `package.json` / `.gitignore` / the project's framework entry — it probably belongs under `docs/`.
- **Don't scatter.** Status docs (`ROADMAP` / `PLAN` / `PROGRESS`) go to `docs/`, not root. Design docs go to `docs/design/`, not loose in root or `docs/`.
- **Bilingual layout.** Root docs (README, SKILL) keep only the English source at root; their Chinese versions go to `docs/zh/` (e.g. `docs/zh/README.zh.md`) — this keeps the root tidy. Room manuals in `references/` and templates in `templates/` keep their `.zh.md` side-by-side with the English source, because those directories are self-contained units (moving the zh version out would break the "copy the folder and you have everything" property). `docs-manifest.json`'s `translations` field records the non-default path for root docs.
- **The WIKI auto-discovers.** `keeper site serve` walks `--dir` (default `docs,references`) + root identity docs. Files under `templates/` are never listed (they're blanks, not docs). Files under `node_modules` / `.`-prefixed dirs / `_archive` are also skipped.
- **When in doubt, ask.** If the user brings a doc that doesn't fit any existing folder, ask what it's for, then place it under the matching `docs/<subdir>/` (create the subdir if needed) and register it in `truth-source.json`.

## Testing convention

indie-keeper does **not** ship a test room or a test runner — solo projects use wildly different stacks (Unity Test Framework, Godot Testing, jest, pytest, manual QA sheets…), and forcing one would hurt more than help. Instead, the AI establishes a **naming + layering + maintenance convention** during triage, tailored to the project's stack.

**What the AI should establish during triage** (write the decisions into `AGENTS.md`, under a "Testing" section):

1. **Stack & runner.** What testing framework the project uses (or will use). If none yet, recommend the lightest one for the stack (e.g. Unity Test Framework for Unity, `node:assert` for Node CLIs, manual QA checklists for pure-doc projects). Keep it zero-extra-dependency when possible.

2. **Naming convention.** Test files mirror the file they test, with a `.test` / `_test` / `Spec` suffix — pick one and stick to it. Example: `PlayerController.cs` → `PlayerControllerTests.cs`, or `lib/feed.js` → `lib/feed.test.js`. Collocate tests next to source, or under a `tests/` mirror — pick one layout and stick to it.

3. **Layers.** At minimum, distinguish:
   - **Unit tests** — pure logic, no I/O, fast. Most tests should be here.
   - **Integration tests** — cross-module or with real I/O (file system, network, engine). Slower; tag them so they can be run separately.
   - **Acceptance / playthrough tests** — manual or scripted; tied to sprint acceptance. Living in `docs/sprints/N.md` as a checklist counts.
   Tag or folder-separate them so running "just unit tests" is one command.

4. **What to test (priority order).**
   - Logic that handles money / saves / progression (data loss = trust loss).
   - Logic with branching (state machines, dialogue, quests).
   - Public APIs of shared modules (the things other code calls).
   - Bug fixes — add a regression test when fixing a bug, so it can't come back.
   - Skip: trivial getters/setters, pure-UI formatting, one-off scripts.

5. **Maintenance rule.** Tests are code — they go in the same repo, get reviewed in the same PR, and break the build when they fail. Stale tests that no longer match the code are worse than no tests; delete or update them when the code changes. The AI should run the test suite before declaring a task "done" in a sprint.

6. **Living in AGENTS.md.** The agreed stack, naming, layers, and run command live in `AGENTS.md` so every future AI session follows the same convention instead of reinventing it.

## keeper-profile.json field definitions

```json
{
  "version": 1,
  "createdAt": "YYYY-MM-DD",
  "project": {
    "name": "game name",
    "platforms": ["itch", "steam", "android", "web"]
  },
  "team": [
    { "name": "someone", "role": "code/release", "authority": [] },
    { "name": "someone", "role": "worldbuilding/art", "authority": ["setting", "art"] }
  ],
  "repo": {
    "layout": "single-private | single-public | dual",
    "notes": "for dual: note which is the dev repo and which is the public one"
  },
  "rooms": {
    "archive": true,
    "feedback": true,
    "site": false,
    "i18n": false,
    "gametext": false,
    "shipping": true,
    "schedule": false
  },
  "startHere": {
    "enabled": true
  },
  "entryDocs": {
    "plan": true,
    "progress": true,
    "docsOverview": true,
    "architecture": true,
    "uiuxSpec": true
  },
  "versioning": {
    "scheme": "zero-x | semver",
    "blockMajor": true
  },
  "sprint": { "rigor": "light | strict" },
  "review": {
    "mode": "self | peer | human | mixed",
    "notes": "for mixed, write the boundary, e.g.: gameplay/art = human, rest = self"
  },
  "i18n": {
    "sourceLang": "zh",
    "langs": ["en", "ja"],
    "translator": "ai-with-human-review | ai-only | human"
  },
  "decidedBy": {
    "repo.layout": "user | default"
  }
}
```

Field notes:
- `team[].authority`: domains this member has final say on. In these domains **the AI only organizes and implements — it does not improvise**.
- `rooms.*`: which rooms are enabled. The AI does not pitch disabled rooms; mention them only when the user hits the corresponding pain point.
- `startHere.enabled`: when `false`, skip creating `START-HERE.md` at triage and skip the staleness reminder in `keeper hello`. Default `true`. Flip it off when the user says they don't want a human-entry page.
- `entryDocs.*`: which core entry docs to create at triage. Each defaults to `true`. Flip one to `false` when the user explicitly opts out (e.g. a one-week project doesn't need `PROGRESS.md`). The AI does not re-pitch disabled docs in later sessions.
- `decidedBy`: records which choices were made by the user vs. inherited from recommended defaults — the latter are worth revisiting as the user grows.

## Renovation checklist

When the project already has docs/flows, inventory in this order (scan first yourself, then ask the user to confirm — do not ask the user what you can answer yourself).
**The entire inventory is read-only**: only register, only report — never move/rename/delete any existing file (see the document safety red lines in SKILL.md). List duplicates or suspected-stale docs for the user to decide.

1. Scan the root and `.github/`: README, CHANGELOG, LICENSE, rule files (AGENTS.md etc.)
2. Scan `docs/` (or equivalent): topic-group existing docs → draft the truth-source registry
3. See where the current plan is recorded: ROADMAP / TODO / issue list / project board → discuss migrating or coexisting
4. Find files containing version numbers → draft version-manifest
5. If translation files exist → draft docs-manifest; **before the first stamp, confirm with the user which translations currently match the source** (to avoid stamping stale translations as fresh)
