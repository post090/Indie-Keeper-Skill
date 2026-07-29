# keeper CLI · the manual for humans

This manual is for **humans** — what you type in the terminal when using keeper. For how the AI uses each room's script, see the room manuals; here we cover everyday human use.

## Install into your project

1. Copy the entire `scripts/` folder into your project, suggested location `tools/keeper/`
2. Register one line in `package.json`:

```json
{ "scripts": { "keeper": "node tools/keeper/keeper.js" } }
```

3. From now on it is `npm run keeper -- <command>`. If that is too long, configure a bin or shell alias so you can just type `keeper <command>`

Typing `keeper` with no arguments shows the splash — a little robot housekeeper and the houses it looks after, with the title being **your game's name** (read from keeper-profile.json).

## The daily three

| Command | When to type it |
|---------|-----------------|
| `keeper hello` | **Type this first every time you start work.** A 30-second shift handover: version, git status, open feedback, current sprint progress, truth-source registry count, ending with a cheat sheet of common commands |
| `keeper status` | When you want a quick glance at workspace health: git change details, feedback counts by state, sprint progress |
| `keeper where <topic>` | "Which file is this setting written in?" — goes straight to the authoritative doc, no full-text search. e.g. `keeper where characters` |

These three are the habits validated as most useful across two previous projects' CLIs: hello on startup, where when lost, status before bed.

## Handover note (HANDOFF.md)

The sprint manages "what to do this shift"; the handover note manages "how far we got, what the next shift should avoid". Conventional path: `docs/HANDOFF.md` (root `HANDOFF.md` also recognized).

- Every time you start work, `keeper hello` reports whether the handover note exists — if it does, read it before touching anything
- At the end of a shift, write "unfinished items / pitfalls hit / suggested route for the next shift" into `docs/HANDOFF.md`
- On sprint `close`, you are reminded to deal with the handover note: archive it into `docs/sprints/_archive/` or delete it

The handover note is archived per shift, not kept as a long-term doc; for long-term records, use the source of truth or the sprint.

## High-frequency room commands

```bash
# Archive —— document order
keeper truth list                # full truth-source registry
keeper truth check               # checkup: dead links / untracked docs
keeper truth section <file> <section>  # safely read a section

# Feedback Box —— feedback does not evaporate
keeper fb add "jump feels floaty" --from playtest-group --tag balance
keeper fb list                   # inbox overview (grouped by state)
keeper fb plan 6                 # advance #6 one state (idea→designed→…)
keeper fb done 6 --version v0.3.2  # finished, record which version fixed it

# WIKI —— docs become a mini website
keeper site serve                # spin up locally (wiki links / backlinks / search / night mode)
keeper site pack                 # pack into a single HTML, viewable by anyone

# Docs Translation Desk —— translations do not go stale
keeper docs status               # see which translations are stale at a glance
keeper docs stamp <lang> <file>  # stamp after translating

# Game Text Desk —— in-game text
keeper game scan                 # how many hardcoded strings are not in the dictionary
keeper game coverage             # per-language translation coverage
keeper game drift --check        # source changed but translation did not follow (CI-usable)
keeper game glossary list        # homebrew term glossary (stamina called "Soul" etc.)

# Shipping Dock —— versioning has rhythm
keeper ver show                  # versions everywhere + consistency
keeper ver next                  # dry-run: auto-compute next bump from git log (feat→minor, fix→patch)
keeper ver bump                  # no arg → uses auto-computed level; or explicit: patch|minor|major
keeper sprint show               # current sprint details
keeper sprint lint               # acceptance-list quality check (anti-sloppiness)

# Shipping Dock · Release —— preflight + changelog + platform guides (opt-in)
keeper release preflight commit  # run before git commit (debug residue / credentials / syntax)
keeper release preflight push    # run before git push (+ tests + branch + behind-remote)
keeper release preflight build   # run before packaging a build (+ version + translations + sprint)
keeper release changelog init    # create CHANGELOG.md (Keep a Changelog format)
keeper release changelog add "Added X"   # append a bullet under [Unreleased]
keeper release changelog draft           # draft [Unreleased] from conventional commits (--apply to write in)
keeper release changelog cut 0.2.0       # slice [Unreleased] → [0.2.0] - <today>
keeper release github guide      # GitHub release workflow setup + gh CLI commands
keeper release itch init         # generate itch.toml template
keeper release steam guide       # Steam upload setup + steamcmd commands

# Shipping Dock · Branches —— naming policy + protected-branch guard
keeper branch check              # current branch vs policy (--strict exits 1 on violations)
keeper branch new feature login ui   # create feature/login-ui and switch to it
keeper branch policy             # print the active policy (keeper-profile.json → branch)
```

Every command has `help`: `keeper truth help`, `keeper fb help`…

## Language

Output defaults to English. For Chinese, two ways:

- Ad-hoc: append `--lang zh` to any command
- Permanent: write `"language": "zh"` in keeper-profile.json

## Cannot find a command?

Type `keeper` or `keeper help` to see the full table. The mechanism behind each room (why it is designed this way, what the data files look like) is in the `references/room-*.md` room manuals.
