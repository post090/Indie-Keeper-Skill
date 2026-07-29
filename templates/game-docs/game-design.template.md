# 🎮 Game design overview · <game name>

> This doc is the single source of truth for gameplay. Change gameplay here first, then in code.

## 📌 AI quick-read

- one line: (one line on what the player does and where the fun is)
- current phase: (prototype / vertical slice / content fill / polish)
- next step: (the single most important thing to validate or build right now)
- blocker: (an unresolved design question; write "none" if there isn't one)

## Core loop

What does the player do every minute? Draw it out (text is fine):

```
action A → gain B → trade B for C → C unlocks a stronger A → …
```

- How long is one loop?
- Why does the player want to start the next loop? (Be specific about the hook — "it's fun" is not an answer)

## Core experience

- What feeling do you want the player to have? (comforting / tense / achievement / collection urge … pick primary and secondary)
- Reference anchors: which parts of which games? Be explicit about what you **do not** want it to feel like.

## System list

| System | One-liner | Status | Design doc |
|--------|-----------|--------|------------|
| (e.g. crafting) | (player turns raw materials into products) | ✅ done / 🔧 in progress / ⬜ not started | docs/design/xxx.md |

## Player journey (optional · fill in during content phase)

First 5 minutes / first hour / around completion — what state is the player in, what's keeping them engaged?

## Deliberately not doing

Explicitly excluded features and directions, to prevent future-you or the AI from getting ideas. Each item gets one line on why.
