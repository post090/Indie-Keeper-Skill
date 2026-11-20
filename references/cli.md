# keeper CLI · the manual for humans

This manual is for **humans** — what you type in the terminal when using keeper. For how the AI uses each room's script, see the room manuals; here we cover everyday human use.

## Install into your project

1. Copy the entire `scripts/` folder into your project, suggested location `tools/keeper/`
   For a project using `"type": "module"`, put `{"type":"commonjs"}` in `tools/keeper/package.json`.
2. Register one line in `package.json`:

```json
{ "scripts": { "keeper": "node tools/keeper/keeper.js" } }
```

3. From now on it is `npm run keeper -- <command>`. If that is too long, configure a bin or shell alias so you can just type `keeper <command>`

From another directory, select the project with `keeper --root <path> hello`. Use `keeper sync --check` to run checks without refreshing the entry page.

In an interactive terminal, `keeper`, `keeper help` and `keeper hello` show an ASCII housekeeper and your game's name from `keeper-profile.json`. Wide color terminals get the full wordmark. Narrow terminals, `NO_COLOR` and `TERM=dumb` use a compact monochrome mark. Redirected output, CI and JSON commands omit the artwork.

## The daily three

| Command | When to type it |
|---------|-----------------|
| `keeper hello` | **Type this first every time you start work.** A 30-second shift handover: package.json version (when present), git status, open feedback, current sprint progress, truth-source registry count, ending with a cheat sheet of common commands |
| `keeper status` | When you want a quick glance at workspace health: git change details, feedback counts by state, sprint progress |
| `keeper where <topic>` | "Which file is this setting written in?" — goes straight to the authoritative doc, no full-text search. e.g. `keeper where characters` |

These three are the habits validated as most useful across two previous projects' CLIs: hello on startup, where when lost, status before bed.

## Handover note (HANDOFF.md)

The sprint manages "what to do this shift"; the handover note manages "how far we got, what the next shift should avoid". Conventional path: `docs/HANDOFF.md` (root `HANDOFF.md` also recognized).

- `keeper hello` shows the handoff path. To surface the current decision, add a `## Handoff brief` section with four one-line bullets labelled `Next:`, `Why:`, `Decision:` and `Evidence:`. Cite a durable decision source and the tested commit, report or command. Older notes stay readable at the displayed path.
- At shift end, refresh those four lines and record unfinished work and pitfalls below them. For a formal Sprint entry, use `sprint add --formal --covers …` and `sprint approve <id> --record …` as described in [Shipping Dock](room-shipping.md).
- On sprint `close`, you are reminded to deal with the handover note: archive it into `docs/sprints/_archive/` or delete it

The handover note is archived per shift, not kept as a long-term doc; for long-term records, use the source of truth or the sprint.

## High-frequency room commands

```bash
# Archive —— document order
keeper truth list                # full truth-source registry
keeper truth check               # checkup: dead links / untracked docs
keeper truth sections <file>      # list headings for a section update

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
keeper docs stamp <docId> <lang>  # stamp after translating

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

- Use `--lang zh` for Chinese output. For `docs` and `game`, use `--ui-lang zh` for the interface and `--lang` for the target translation language.
- Permanent: write `"language": "zh"` in keeper-profile.json

## Cannot find a command?

Type `keeper` or `keeper help` to see the full table. The mechanism behind each room (why it is designed this way, what the data files look like) is in the `references/room-*.md` room manuals.
