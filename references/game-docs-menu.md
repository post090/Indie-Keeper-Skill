# Game docs menu · game-docs-menu

When building the Archive, the AI uses this menu to **recommend** design docs worth creating for the project.

## Three recommendation principles

1. **By organ, not by genre**: do not ask "what genre is your game"; ask "does your game have these organs". Genres are endless; organs are about a dozen.
2. **An empty doc is a liability**: only build docs the user **is about to write content into**, at most 1–2 at a time. A pile of empty skeletons just becomes untracked files in the checkup report.
3. **Register equivalents, do not rebuild**: if the user already has "settings.txt", register it in the source of truth (or help migrate to the template structure), do not start over.

## When the user asks for a doc not on this menu

The menu is a **recommendation, not a boundary**. Users will ask for docs that don't fit any organ above — a community-guidelines page, a lore wiki, a press-kit, a modding guide, an internal workflow doc. That's fine. The menu exists to help the AI **recommend**, not to gatekeep what the user can create. When the user asks for something off-menu:

1. **Ask one question first**: "what's this for?" — the answer decides where it lives and whether it needs a template. Don't interrogate; one question, then build.
2. **Place it where it belongs**: follow the project's existing directory structure. Game-design docs go in `docs/design/`, decisions go in `docs/decisions/`, root-level human-entry docs go at the root. If no existing folder fits, ask the user where they want it — don't invent a new top-level directory without asking.
3. **Don't force a template**: if no template in `templates/game-docs/` fits, create a plain doc with just a title and an AI quick-read header (one line / current phase / next step / blocker). Never shoehorn an unrelated template onto the content.
4. **Register it in the source of truth**: every new doc gets registered in `truth-source.json` under a sensible topic id, same as on-menu docs. Run `keeper truth check` after.
5. **Respect authority annotations**: if the doc's domain is marked with an owner in the division-of-labor table (e.g. "worldbuilding — maru's call"), the AI only organizes and implements — never improvises content in that domain.

The rule of thumb: **the menu recommends, the user decides, the AI registers and keeps it tidy.**

## Common parts (almost every game benefits from)

| Doc | One-liner | Template |
|-----|-----------|----------|
| Game design overview `game-design.md` | Core loop: what the player does every minute, and why they want to keep going | [game-design](../templates/game-docs/game-design.template.md) |
| Art / UI spec `art-ui-spec.md` | Pin the style: palette, proportions, fonts, common UI parts — prevents asset drift (especially important in the age of AI-generated assets) | — |
| Code architecture `architecture.md` | Module breakdown + data flow, the map for AI-assisted coding | — |
| Decision log `decisions/` | One issue per file, records "why we chose this then" (ADR convention) | — |

## Organ parts (lookup by feature)

Ask the user: "does your game have —"

| Organ | If yes → recommended doc | Notes |
|-------|--------------------------|-------|
| **Tells a story** (plot, endings) | World setting `world-setting.md` | Tone / rules / history / taboos — guardrails for the AI when writing text |
| **Named characters** | Character setting `characters.md` | Character card set: role / personality / speech style / relationships |
| **Numeric growth or economy** (levels, gold, drop rates, recipes) | Economy `economy.md` | Resource production/consumption table + growth-curve intent, prevents runaway inflation |
| **Levels or puzzles** (stage-by-stage) | Level design `level-design.md` | Level rhythm table + teaching curve (which level introduces which mechanic) |
| **Multi-scene / free-roam map** | Scene design `scene-design.md` | Per scene: visual composition / interactables / entrances and exits |
| **Branching story or multiple endings** | Branch flow `story-flow.md` | Branch tree + ending conditions, prevents narrative dead-ends |
| **Multiplayer** | Netcode `netcode.md` | Sync strategy + authoritative arbitration rules |
| **In-house tools** (editor, workshop, configurator) | Tool design `tools/<name>.md` | Who uses the tool, what repetitive labor it solves |
| **External assets** (bought/free art, audio, fonts) | Asset sources list `asset-sources.md` ⭐ | **Legal doc**: every asset records source / license / attribution requirement. Must be checked before launch; nothing hurts more than a takedown |

## Single-system design docs (long-term, high-frequency)

What gets written most often once a game deepens is actually **single-system design docs**: combat system, crafting system, affinity system, save system… one doc per system, using a unified skeleton: [system-design template](../templates/game-docs/system-design.template.md).

Naming convention: `docs/design/<system>.md`; once written, register it in the source of truth; tag the corresponding ROADMAP task with `design: docs/design/<system>.md`.

## Example recommendation script

> Your game has a story, characters, and the player walks across multiple scenes — I recommend starting with these three: world setting, character setting, scene design. You also mentioned using a sound pack bought on itch — I strongly suggest also creating an asset-sources list (Steam launch checks licenses; recording now is zero-cost, catching up later is painful). The game-design overview can wait until the core loop is clearer. Which one should we build first?

Key points: recommendations come with reasons, give priority, at most 3 at a time, let the user decide.
