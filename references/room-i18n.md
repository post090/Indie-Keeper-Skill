# Docs Translation Desk (document i18n state machine)

Solves one pain point: "the source changed, the translation went stale, and nobody knew." Manages **player/user-facing docs**: README, store-page copy (Steam/itch), release notes — not in-game text (that is code-level i18n, out of this Skill's scope).

## Core mechanism

Manage docs the way game localization does, in three separated stages: **extract template (machine) → translate (AI/human) → stamp (machine)**.

- **Extract template** (`extract`): generate a translation file from the source — the original text is pasted verbatim, with a `[TODO]` placeholder after each block
- **Translate**: the AI or a human replaces `[TODO]` with the translation, deleting the placeholder marker
- **Stamp** (`stamp`): once the translation is final, record "this was translated against the current version of the source" (using the source content hash as a fingerprint). When the source changes later, the fingerprint no longer matches and you immediately know the translation is stale

### Registration (docs-manifest.json)

```json
{
  "sourceLang": "zh",
  "primaryLang": "en",
  "i18nDir": "i18n-docs",
  "langs": ["zh", "en", "ja"],
  "docs": [
    { "id": "readme", "primary": "README.md", "source": "i18n-docs/README.zh.md", "desc": "project front page" }
  ],
  "skip": [
    { "id": "license", "primary": "LICENSE", "reason": "legal text stays in its original language" }
  ]
}
```

Path convention: the source-language file lives at `source`; the primary entry language (usually en) takes the original position at `primary`; other languages live at `<i18nDir>/<name>.<lang>.md`. When the source language equals the primary language, `source` and `primary` point to the same file.

### Four actions

```bash
node docs-i18n.js init                      # scan existing README/CHANGELOG into a draft manifest
node docs-i18n.js extract --doc readme --lang ja   # extract template: generate a translation file (original + [TODO] placeholders)
# …the AI/human replaces [TODO] with the translation, deleting the marker…
node docs-i18n.js stamp readme ja           # stamp: record "this translation is based on which version of the source"
node docs-i18n.js status                    # board: per-doc per-language status
```

Status is determined entirely by fingerprints (source content hash). The four states `status` outputs:
- ✅ **fresh** (in sync): translation exists and the fingerprint matches — the source has not changed, safe to use
- ⚠️ **stale** (out of date): the source changed, the fingerprint no longer matches — the translation needs redoing
- ❓ **unknown** (unstamped): translation exists but was never stamped (no one knows which version of the source it was based on)
- ❌ **missing** (untranslated): no translation for this language yet

One safeguard: if `[TODO` markers remain in the translation, `stamp` refuses to stamp (`--force` overrides) — **unfinished work cannot count as finished**.

### CI gate

`stamp --all --check`: read-only, exits 1 if anything is stale / unstamped / has TODO. Attached to step 3 of the release flow, guaranteeing no stale translations ship.

## Room build flow

1. Triage: source language, target languages, who translates (AI-only / AI translates human reviews), what stays untranslated (LICENSE etc. goes to skip)
2. `init` generates a draft → user confirms → `extract` the first batch of templates
3. **Renovation caution**: when translation files already exist, before the first stamp, confirm with the user one by one "does this translation currently match the source?" — stamping a stale translation as fresh is the one mistake the system can never detect afterwards; it is the only unrecoverable error in the whole system

## AI daily discipline

- After editing a source-language doc, immediately run `status` to see the blast radius and queue the now-stale items into current work
- When the AI translates itself, follow the full flow: extract template → fill translation → stamp. **An unstamped translation is as good as untranslated.**
- Rewrite in the target language's own voice; do not translate word by word. Store-page copy should get a human final review (per profile's `i18n.translator`)
