# Shipping Dock (version sync + sprint acceptance + release)

Solves two pain points: "version numbers written all over the place" and "acceptance is verbal".

## Core mechanism

### Version sync (version-sync.js)

A project's version number is often scattered across multiple files (package.json / build.gradle / Godot export_presets / VERSION…), and hand-editing always misses one. `version-manifest.json` registers each location with a placeholder:

```json
{
  "targets": [
    { "file": "package.json", "patterns": ["\"version\": \"{{version}}\""] },
    { "file": "android/app/build.gradle", "patterns": ["versionName \"{{version}}\"", "versionCode {{code}}"] }
  ],
  "blockMajor": true
}
```

- `{{version}}` = X.Y.Z; `{{code}}` = major×10000 + minor×100 + patch (Android-style monotonic build number)
- `show` shows versions everywhere + consistency; `bump patch|minor` changes them all in sync; `check` for CI (inconsistency exits 1)
- `blockMajor` defaults on: staying on 0.x before launch is common discipline; to bump major use `--allow-major`
- bump only edits files, **never auto-commits** — review and commit yourself, per the "reversible before you act" red line

### Sprint acceptance (sprint.js)

Timeline division of labor: ROADMAP manages the future, **Sprint manages the present**, PROGRESS manages the past. When a version kicks off:

```bash
node sprint.js new "workshop overhaul" --version v0.5
node sprint.js add "asset manager" --accept "drag in an image to register · delete has confirm" --from "fb #3"
node sprint.js approve 1.1 --by human:someone     # acceptance leaves a record (default self)
node sprint.js close --version v0.5.0              # archive after all clear + backfill ship
```

- The file is `docs/sprints/N.md`, pure markdown, humans can read and edit directly
- **Acceptance leaves a record, not a gate**: `approvedBy: self / agent:name / human:name` is a record; who nods follows the profile's `review.mode`; if the user says "just pass this one", listen to the user
- `lint` quality check: light checks "is there an acceptance criterion"; strict adds implementation/test-method/risk/counter-question (must be a question) + **filler-word check** (vague phrases like "optimized" / "related issue" are flagged); if an item lists "wiring: file:symbol" it is verified in code — fighting AI sloppiness
- On `approve`, quality-check problems are **advisory only, not blocking**

### Release pipeline (release.js)

Releases are where small mistakes compound: a `console.log` slips into a commit, a credential file gets staged, a version bump misses a file, translations ship stale. The release pipeline is a set of **preflight checks** that catch these before each irreversible step, plus a changelog and platform-specific guides. It is **opt-in at triage** (`release.platforms`) — the default is no platform integration; only what the user confirms gets installed.

#### Preflight (three stages)

Each stage scans the project state and reports problems (❌ blocking) + warnings (⚠️ informational). Problems cause exit 1; warnings don't. Preflight never auto-fixes — it tells you what to fix.

| Stage | Run before | What it checks |
|-------|------------|----------------|
| `keeper release preflight commit` | `git commit` | debug residue in staged source (`console.log` / `debugger` / `TODO` / `FIXME`) · credential files in staging (`.env` / `*.key` / `*.pem` / `id_rsa` / `*.keystore`) · `node --check` on staged `.js` · docs translation sync (if Docs Translation Desk installed) · truth check (if Archive installed) |
| `keeper release preflight push` | `git push` | all commit checks · test suite (e2e or `npm test`) · behind-remote (warns if local needs pull) · branch confirm (warns on `main`/`master`) · PROGRESS.md recency (warns if last entry >3 days old) · `keeper sync` |
| `keeper release preflight build` | packaging a build | version consistency (`keeper ver check`) · translations fresh · sprint acceptance complete (warns on pending items) · clean worktree (no uncommitted changes) · release notes file present (`CHANGELOG.md` / `docs/releases/`) · `keeper stale` all green |

The AI runs the matching preflight before each irreversible action. Warnings are advisory — the user can override; problems must be fixed or explicitly accepted.

#### Version auto-bump (version-sync.js · `next`)

Version level no longer needs AI to hand-pick — it's computed from git history:

```bash
keeper ver next          # dry-run: shows the recommended bump + breakdown
keeper ver bump          # no arg → uses the auto-computed level
keeper ver bump minor    # explicit level still works
```

Logic: scans `git log <last-tag>..HEAD` for [conventional commits](https://www.conventionalcommits.org/):
- `BREAKING CHANGE` or `type!:` → major
- `feat:` → minor
- `fix:` / `perf:` → patch
- everything else → patch (conservative)

`blockMajor` (default on) downgrades major → minor while on 0.x. If no version tag exists, scans all commits.

#### Changelog (Keep a Changelog format)

`CHANGELOG.md` follows the [Keep a Changelog](https://keepachangelog.com/) convention. The `[Unreleased]` section accumulates entries between releases; `cut` slices it into a versioned section with today's date.

```bash
keeper release changelog init                          # create CHANGELOG.md (refuses if exists, --force to overwrite)
keeper release changelog add "Added new feature X"     # append a bullet under [Unreleased]
keeper release changelog draft                         # draft [Unreleased] from conventional commits since the last tag (--apply to write in)
keeper release changelog cut 0.2.0                     # slice [Unreleased] → [0.2.0] - <today>
keeper release changelog show                          # print the file
```

- `add` inserts under the first `### Category` heading found under `[Unreleased]` (Added / Changed / Fixed / …); if no category heading exists, inserts a plain bullet.
- `cut` prepends a fresh `[Unreleased]` section, so the next cycle starts clean.
- The template includes a `## [0.1.0] - 1970-01-01` stub — replace it with your actual first release.

#### Platform guides (opt-in)

Platform integration is **off by default**; turned on at triage via `release.platforms: ["github", "itch", "steam"]`. Each platform has an `init` (generates a template file) + a `guide` (prints setup + upload instructions).

**GitHub** (`keeper release github`):
- `release-notes` — drafts release notes from PROGRESS.md + sprint accepted items (use `--out=<file>` to write, else stdout)
- `workflow-template` — generates `.github/workflows/release.yml` (build on tag push, attaches artifact, auto-generates notes via `softprops/action-gh-release`)
- `guide` — prints `gh` CLI commands for creating releases, uploading artifacts, watching workflow runs, tagging

**itch.io** (`keeper release itch`):
- `init` — generates `itch.toml` (entry point + cover + screenshots)
- `guide` — walks through itch.io account setup, butler CLI install/login, `butler push build/ user/game:channel`, CI auto-upload with `BUTLER_API_KEY`

**Steam** (`keeper release steam`):
- `init` — generates `steam_upload.vdf` (App ID + depots + file mappings)
- `guide` — walks through Steamworks partner setup ($100 entry fee), steamcmd install/login, `steamcmd +login bot +runscript steam_upload.vdf`, CI auto-upload, Steam Guard, the 1–5 day review window

The CLI **never calls `gh` / `butler` / `steamcmd` directly** — it prints the commands for the user/AI to run. Zero-dependency principle + cross-platform stability.

#### Release sequence (putting it together)

With the pipeline installed, a release is a fixed sequence; the AI executes each step, pausing for preflight:

1. `keeper sprint lint` + approve all items → `keeper sprint close --version vX.Y.Z`
2. `keeper release preflight build` — confirm version consistency + sprint accepted + clean tree + release notes ready
3. `keeper ver next` (preview) → `keeper ver bump` (apply, auto-level from git log)
4. `keeper release changelog cut <X.Y.Z>` — slice `[Unreleased]` into the versioned section
5. `keeper release preflight commit` → `git commit -m "chore(release): vX.Y.Z"` → `keeper release preflight push` → `git push`
6. Platform publish (if installed): `git tag vX.Y.Z && git push origin vX.Y.Z` triggers the GitHub workflow; or manually `butler push` / `steamcmd +runscript`
7. Cleanup: mark the corresponding ROADMAP version ✅; `keeper fb done <id> --version vX.Y.Z` backfill; archive HANDOFF.md

**Pushing requires user confirmation** (no autonomous outbound actions); credentials go through environment variables or gitignored files, never written into any registry file.

## Room build flow

1. The AI scans files containing version numbers, drafts version-manifest for user confirmation (onboarding has the checklist)
2. Triage sets `sprint.rigor` (light/strict), `review.mode`, and `release.platforms` (which platforms to install guides for — default none)
3. Before the first release, walk through the release sequence once; after that it is muscle memory
4. If `release.platforms` includes any platform, run its `init` to generate the template file, then walk through the `guide` once with the user

## AI daily discipline

- Version numbers only change via `bump`, never hand-edit a single file; use `ver next` to preview the auto-computed level before bumping
- "Done" for an item means its acceptance fields are satisfied, not a feeling; in strict mode, self-check for filler words when writing fields
- Before each `git commit` / `git push` / build packaging, run the matching `keeper release preflight <stage>` — don't skip it just because "it's probably fine"
- After `close`, immediately do step 7 cleanup — do not let it pile up
- Append to `CHANGELOG.md` as you ship (small entries as they happen, not a brain-dump at release time)
