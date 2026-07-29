# Game Text Desk (in-game text i18n)

Manages every line of player-facing text in the game: UI buttons, item names, dialogue, tooltips.
Division of labor with the Docs Translation Desk: **the Docs Translation Desk handles "whole documents for humans to read"** (README / store page / patch notes),
**the Game Text Desk handles "short in-game text strings"**. The glossary is shared by both (see below).

Reference script: `scripts/commands/game-i18n.js` (zero deps) · Config: `game-i18n-manifest.json`

## What each engine usually looks like (triage cheat sheet)

| Engine | Conventional practice | Dictionary form | How this room fits |
|--------|----------------------|-----------------|-------------------|
| Godot | Built-in support, official CSV recommendation, code uses `tr("KEY")` | CSV | Pick csv for the dictionary format, set translationMarks to `tr(` |
| Unity | Official Localization package (String Tables); small projects often roll their own JSON dictionary | Engine asset or JSON | Roll your own JSON for full features; with the official package, use only scan + glossary |
| Ren'Py (visual novels) | Built-in, most effortless — one command auto-extracts dialogue into translation files | Native .rpy format | Engine owns the dictionary, use only scan + glossary |
| RPG Maker | Not supported by default, community plugins | Varies by plugin, usually JSON/CSV | Configure per the plugin's dictionary format |
| Unreal | Built-in Localization Dashboard, FText auto-collected | Engine-managed | Engine owns the dictionary, use only scan + glossary |
| HTML/JS custom | No standard, everyone rolls their own | Usually JSON | Full features, pick json-per-lang or json-single |

Pattern: when the dictionary format lands in plain text, it is one of two kinds — JSON or CSV, both supported by the script.
For fully engine-managed setups (Ren'Py / Unreal), the dictionary is not this room's concern, but **hardcode scanning and the glossary are still useful**.

## Room-build triage (three questions)

1. **Is there a localization plan?** How far along is it?
   - Definitely doing it → continue
   - No / unsure → **do not build the room**, but leave one piece of advice: keep text centralized, do not scatter hardcodes in the code
     — even if it is only Chinese for now. Whether a future translation is a one-day move or a three-week archaeological dig depends entirely on this
2. **Does the game already have an i18n mechanism?**
   - Yes → inventory and plug in: dictionary format, location, translation function name. **Never bulldoze what works**
   - No → use the engine-recommended defaults (table above)
3. **What engine / tech stack?** Determines the recommended dictionary format and scan rules (directories, extensions, comment style)

Triage results go into `game-i18n-manifest.json` (template at templates/game-i18n-manifest.template.json).

## Four mechanisms

### scan · hardcode scan

Catches naked text scattered in code that never made it into the dictionary — text foreign players will never see.
- Scans line by line for CJK characters inside string literals (comments are stripped first, no false positives)
- If the line contains a translation-function marker (`t(`, `tr(`, etc., configured in the manifest) → already collected, skip
- Word-boundary aware: when `t(` is configured, `alert(` ending in `t(` does not count
- Paths that are "not supposed to be translated anyway" like logs / debug / dev tools → add to `scan.skip`
- Any hit exits 1, CI-attachable to prevent regressions

### coverage · coverage

Diffs against the source-language dictionary: `en is missing 37 entries`, with a progress bar. `--missing` lists them.

### stamp + drift · stamping and drift detection

Same idea as the Docs Translation Desk, at per-string granularity:
- After finishing a language, run `stamp en` — records "these translations are based on the current source text" (content fingerprint)
- When the source text changes, the fingerprint no longer matches, and `drift` names names: `ui.start → en is stale (source changed)`
- This catches what coverage cannot: **the key is there, but the content is already old**
- `drift --check` for CI / pre-release, exits 1 if anything is stale

The fingerprint store `game-i18n-state.json` goes into git.

### glossary · glossary (shared project-wide)

**The glossary is essentially "this game's homebrew dictionary"** — every game has its own jargon:
in your game the action resource might not be called stamina but "Soul", and then in the game, store page, patch notes, and all languages it can only ever be "Soul". Translation consistency is its second function;
its first function is to set rules for everyone (**especially the AI**).

```json
{
  "terms": [
    {
      "zh": "灵魂",
      "meaning": "action resource, consumed on deployment (similar to other games' stamina/energy)",
      "en": "Soul",
      "ja": "ソウル",
      "note": "lore: characters are driven by souls, deliberately avoiding the generic word"
    }
  ]
}
```

- The language-code field = the single canonical term in that language; `meaning` uses analogy to explain "what is this" —
  anyone who does not know this game (and the AI) gets up to speed on the jargon through it, and once understood will naturally not misuse it
- `glossary lint`: scans the whole dictionary; if the source text contains a term, the translation must use the canonical rendering, catching
  " Soul one moment, energy the next"
- `glossary check --lang en --source "<source>" --text "<translation>"`: spot-check a single line while translating
- **One glossary.json shared project-wide**: both the Game Text Desk and the Docs Translation Desk consult it,
  so the in-game text, store page, and patch notes stay mutually consistent

## AI daily discipline

- **Before writing any player-facing text, consult the glossary** — game text, store page, patch notes,
  achievement names, all count. Use this game's own terms, not generic words
- When you coin a new term (invent a new name) → register it in glossary.json on the spot, do not let it spread by word of mouth
- When writing code, put text directly into the dictionary, never hardcode; run `scan` after work to keep zero hardcodes
- When you change source-language text → run `drift` to see which translations went stale; after re-translating, `stamp` again
- Pre-release triple-check: `scan` + `drift --check` + `glossary lint`
- After finishing a translation, run `glossary check` before submitting

## Room build flow

1. Three triage questions (above) → `init` generates a manifest draft → adjust to reality
2. Renovation of an existing dictionary: once the format matches, run `coverage` to see the current state,
   then confirm with the user which translations currently match the source → stamp per language (same renovation caution as the Docs Translation Desk:
   stamping a stale translation as fresh is the one unrecoverable mistake)
3. Start the glossary from templates/glossary.template.json, and together with the user register every piece of existing jargon
