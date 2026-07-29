# Feedback Box + Roadmap (feedback → version planning)

Solves two pain points: "feedback that was mentioned once evaporates" and "the plan lives only in your head".

## Core mechanism

### Feedback lifecycle (feedback.json)

Any remark, one command into the inbox, walks a seven-state life:

```
💡 idea (just raised) → 📐 designed (written into a design doc) → 📋 planned (scheduled in ROADMAP)
→ 🔧 doing (under construction this version) → ✅ done (finished, version backfilled)
                                ⚪ dropped (withdrawn, reason kept)
```

```bash
node feedback.js add "tips fade too fast" --from playtester-A --tag ui
node feedback.js plan 6                # auto-advance to the next state
node feedback.js link 6 --to "ROADMAP v0.5@docs/ROADMAP.md"
node feedback.js done 6 --version v0.5.0 --commit abc123 --summary "tips duration is now configurable"
```

Storage is two-layer: `feedback.json` is the structured source of truth; `INBOX.md` is regenerated after every operation (a table grouped by state, human-readable, **do not hand-edit**).

### Three timeline files

| File | What it manages | Form |
|------|----------------|------|
| `ROADMAP.md` | **The future**: version staging, one theme per release | Version overview table + one section per release ([template](../templates/ROADMAP.template.md)) |
| `sprints/N.md` | **The present**: acceptance checklist for the current version | See the Sprint mechanism in the Shipping Dock |
| `PROGRESS.md` | **The past**: historical log | Append-only by time, never rewritten |

### Linking rules (traceability depends on them)

- Every ROADMAP task tags its origin: `| 5.3 | tips duration configurable | fb #6 | ⬜ |`
- When feedback is promoted to planned, use `link` to pin its ROADMAP location
- After release, `done` backfills the version number and commit
- So "who raised it → which version it was scheduled into → which commit finished it" is traceable end-to-end via a single id. The person who raised the feedback can literally watch their words turn into something in the game — and that makes anyone want to keep contributing feedback

## Room build flow

1. `feedback.js init` creates the inbox (default `docs/feedback/`)
2. Build a roadmap from the [ROADMAP template](../templates/ROADMAP.template.md); set the version cadence per triage
3. Results from the onboarding "big brain dump" triage land here: small ideas go to `add`, already-scheduled items go into ROADMAP and link to each other

## AI daily discipline

- Any feedback the user relays, **log it to the inbox on the spot**, tag `--from` — do not let it evaporate
- States do not skip: an idea going straight to done means the recording step was missed; fill in the intermediate state
- After release, backfill immediately: every piece of feedback finished this release goes to `done --version`
- ROADMAP edits go through section replacement (`truth.js update ROADMAP.md --section "v0.5"`); never rewrite the whole file
