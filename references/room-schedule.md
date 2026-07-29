# Schedule (version dates + effort estimates)

Solves two pain points: "when does this ship?" and "plans without dates slip silently".

## Core mechanism

### Two-layer planning (ROADMAP vs schedule)

| File | What it is | Form |
|------|------------|------|
| `ROADMAP.md` | **The narrative**: version themes, goals, what each release means to players | Human-readable markdown |
| `schedule.json` | **The calendar**: structured dates, estimates, dependencies, confidence | JSON, the source of truth the CLI and the WIKI Gantt read |

The split is deliberate: ROADMAP is for reading ("what's the v0.5 story?"), schedule.json is for computing ("does v0.5 slip if task 0.5.2 takes 5 days instead of 3?"). The two stay in sync by convention — when a version's theme changes, update ROADMAP; when a date or estimate changes, update schedule.json.

### schedule.json structure

```json
{
  "version": 1,
  "versions": [
    {
      "id": "v0.1",
      "title": "first playable",
      "status": "in-progress",
      "milestone": "2026-08-15",
      "items": [
        {
          "id": "0.1.1",
          "title": "player movement",
          "estimate": 3,
          "start": "2026-08-01",
          "due": "2026-08-04",
          "dependsOn": [],
          "status": "doing",
          "confidence": "high"
        }
      ]
    }
  ]
}
```

Field notes:
- `version.status`: `planned` / `in-progress` / `shipped` / `paused`
- `item.status`: `todo` / `doing` / `done` / `blocked` / `dropped`
- `estimate`: integer days. A wild guess is still useful — `0.1.1` taking 3 days vs 30 days changes the plan entirely
- `dependsOn`: list of sibling item ids in the same version. The Gantt wires them with arrows; `check` catches dangling refs
- `confidence`: `high` / `low`. The Gantt renders `low` bars with a dashed outline so the human sees the uncertainty at a glance
- `milestone`: the version's target ship date. Slipping it is honest — update the date, let the Gantt re-render, never let the schedule lie about reality

### Adding and bumping items

```bash
node schedule.js init                                       # create an empty schedule.json
node schedule.js add "player movement" --version v0.1 --estimate 3 --start 2026-08-01 --due 2026-08-04
node schedule.js add "camera follow" --version v0.1 --estimate 2 --depends 0.1.1 --confidence low
node schedule.js list --version v0.1
node schedule.js bump 0.1.1 --status doing
node schedule.js edit 0.1.1 --estimate 5                    # reality changed — update the estimate
node schedule.js done 0.1.1
node schedule.js drop 0.1.3                                 # withdrew this item, reason kept in the title
```

Item ids are auto-assigned per version (`<version-id>.<n>`), so `add` doesn't need you to invent one.

### Gantt view (in the WIKI)

`keeper site serve` renders the schedule as an interactive Gantt inside the ROADMAP page (not a separate view that covers the whole screen — a same-page expandable section):

- **Task bars** clickable → detail card with a jump link to the sprint doc
- **Dependencies** drawn as arrows between bars
- **Confidence**: `low` bars get a dashed outline so uncertain estimates are visible at a glance
- **Zoom controls**: +/- / reset / full-width
- **`keeper schedule gantt --out schedule.svg`** exports a standalone SVG for sharing offline

### Checkup (check)

```bash
node schedule.js check
```

Three checks; any failure exits 1 (CI-attachable):
1. **Duplicate item ids** — two items share the same id (breaks `dependsOn` resolution)
2. **Dangling dependencies** — `dependsOn` points at an id that doesn't exist
3. **Due before start** — an item's `due` date is earlier than its `start` date

## Room build flow

1. `schedule.js init` creates `schedule.json` (suggest `docs/schedule.json`)
2. Add the versions you already have in ROADMAP (just id + title + status + milestone — items come as they get scheduled)
3. When a ROADMAP task gets a version assignment, `add` it here with an estimate the same day. An item without an estimate is still more useful than no entry.
4. Slot this room next to the Shipping Dock — once versions have target dates, the Gantt becomes the single most useful planning view

## AI daily discipline

- **Add to the schedule the moment a task gets a version assignment.** "I'll add it later" is how the schedule drifts from reality.
- **Estimates are honest, not optimistic.** Mark `confidence: low` when it's a wild guess — the Gantt's dashed outline tells the human "this bar might lie".
- **When a milestone slips, update the date in `schedule.json` and let the Gantt re-render.** Never leave the schedule lying about reality. ROADMAP's narrative stays stable; the calendar moves.
- **Run `keeper schedule check` after edits** — catches duplicate ids, dangling dependencies, and due-before-start inversions.
- **Dependencies are for sequencing, not guilt.** If 0.5.3 depends on 0.5.2 and 0.5.2 slips, the Gantt shows the cascade — that's information, not a verdict.
- **`done` and `drop` are both terminal.** Dropped items stay in the file (status=dropped) so the history of "we considered this and decided not to" is preserved — never delete items.
