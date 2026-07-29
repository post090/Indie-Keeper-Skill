# Changelog

All notable changes to this project are documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), versions follow [SemVer](https://semver.org/).

## [Unreleased]

<!-- Add new entries here as you ship. Use `keeper release changelog add "<text>"` to append. -->
<!-- Categories: Added / Changed / Deprecated / Removed / Fixed / Security -->

## [0.1.0] - 2026-07-29

First public release. indie-keeper is an AI housekeeper Skill for indie game devs — seven independent rooms + a project skeleton + conventions baked into AGENTS.md, adopt only what you need. Zero dependencies (just Node.js).

### Added
- **Seven rooms**: Archive (truth-source registry + section-level safe edits), Feedback Box (lifecycle → ROADMAP), WIKI (docs/ as a mini website with bidirectional links + backlinks + single-file pack), Docs Translation Desk (fingerprint-based stale detection), Game Text Desk (hardcode scan + glossary + drift), Shipping Dock (version sync + sprint acceptance + release pipeline), Schedule (version dates + Gantt view in WIKI)
- **Project skeleton**: AGENTS.md, START-HERE.md, PLAN.md, PROGRESS.md, DOCS-OVERVIEW.md, ARCHITECTURE.md, UIUX-SPEC.md — each opt-out via `entryDocs.*`
- **Release pipeline** (new, not yet battle-tested): `keeper release preflight commit/push/build` catches debug residue / credential leaks / version drift / stale translations before each irreversible step; `keeper release changelog init/add/cut/show` maintains a Keep a Changelog file; `keeper release github/itch/steam` prints setup guides + generates templates (opt-in at triage). The CLI never calls `gh`/`butler`/`steamcmd` directly.
- **Version auto-bump**: `keeper ver next` computes the next bump level from conventional commits (`feat:`→minor, `fix:`→patch, `BREAKING`→major); `keeper ver bump` (no arg) applies it
- **Bilingual**: every user-facing string has en + zh versions; `--lang` flag or `language` in profile
- **CLI daily three**: `keeper hello` (shift handover), `keeper where <topic>` (truth-source lookup), `keeper status` (workspace health)
- **End-of-session sweep**: `keeper sync` refreshes START-HERE + runs all checks; `keeper stale` detects stale translations / dead links / untracked docs / stale PLAN items; `keeper refs <keyword>` scans related docs before editing
- **Safety red lines**: never delete originals, archive-instead-of-delete, per-item authorization for destructive ops, smallest-cut edits, no recursive deletes, reversible-before-you-act
- **Onboarding triage**: batched questions with context + recommended defaults; answers go into `keeper-profile.json`; existing projects get "renovation" (inventory first, no bulldozing)
- MIT license
