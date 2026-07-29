# ⚙️ System design · <system name>

> One design doc per system. Once written, register it in the source of truth; tag the corresponding ROADMAP task with `design:` pointing to this file.

## 📌 AI quick-read

- one line: (what this system has the player do)
- current phase: (in design / pending review / in construction / shipped vX.Y)
- next step:
- blocker:

## Why this system exists

Which part of the core loop does it serve? What does the player lose without it? (If you can't answer, cut it.)

## Player-perspective flow

The complete operation flow as seen by the player: enter → operate → feedback → exit. A UI sketch helps (text description is also fine).

## Rules and numbers

- Core rules: (what's the input, what's the output, what are the constraints)
- Numbers table: (it's fine to pick initial values by gut, just mark them "tune pending"; if there's a separate numbers doc, link to it)

## Data and saves

What new data fields does this add? How does the save structure change? How are old saves migrated?

## Interface with other systems

| Related system | Relationship |
|----------------|--------------|
| (e.g. economy) | (this system consumes gold and produces recipes) |

## Boundaries and deliberately not doing

What's explicitly excluded from v1, to prevent scope creep during construction.

## Acceptance scenarios

Write 2–3 concrete scenarios: "player does X, should see Y". These become the acceptance field of Sprint items directly.
