# Obsidian_to_Anki_Cleo

A hardened fork of [n4tt0u's Obsidian_to_Anki_Kai](https://github.com/n4tt0u/Obsidian_to_Anki_Kai), which is itself a fork of [Pseudonium's original Obsidian_to_Anki](https://github.com/Pseudonium/Obsidian_to_Anki). Almost all of the code is theirs and credit belongs to them. This fork exists to fix bugs that silently cost the user real data, and to make every future sync louder about anything weird that happens.

If Kai already works for you and you don't have a `$` anywhere in your notes, you don't need this. If you've ever lost cards on sync without knowing it, or had `Cannot read properties of undefined` errors, you need this.

---

## What's different from Kai (in plain English)

### 1. Cards no longer get silently deleted by stray `$` signs (the main reason this fork exists)

**Kai's behaviour:** The plugin builds an internal "ignore list" of regions to skip when scanning for cards (real math blocks, code blocks, frozen-fields lines, etc). Kai's inline-math regex was:

```js
/(?<!\$)\$((?=[\S])(?=[^$])[\s\S]*?\S)\$/g
```

Any `$` is treated as a math delimiter regardless of context. The body uses `[\s\S]*?` which freely crosses newlines. So a `$200k` in one card's answer pairs with a `$8,000` thirty cards later, and **the entire span between them gets marked "math, skip"**. Every card in that span is silently dropped. The sync notice still cheerfully says `✅ Successfully synced`. You only notice when you go to review the next day and half your deck is missing.

I reproduced this with a study note that had two stray `$` signs in narrative text (currency amounts in different cards). One stray `$200k` and one stray `$8,000` ate **28 cards** out of 43. Reproducible, deterministic, on stock Kai 5.0.8.

**This fork:** The inline-math regex now mirrors Obsidian's actual rendering rules: no whitespace touching either delimiter, no newline inside, no digit/letter adjacent to a delimiter (so `$200k`, `$8,000`, `between $5 and $10` are correctly treated as plain text). The inline-code regex got the same treatment (single-line only). Display math no longer crosses blank-line paragraph breaks.

### 2. The plugin tells you when something went wrong, instead of always claiming success

**Kai's behaviour:** Success notice is `✅ Successfully synced N file(s) to Anki!` regardless of whether any individual card failed, was silently dropped, or was rejected by Anki. AnkiConnect per-note failures (duplicate front field, empty field, unknown model) are sent to `console.warn` and then forgotten.

**This fork:**
- After every sync, a post-scan check walks the file for lines that LOOK like a card delimiter (`^Q:`, `^A:`, `^START`, or any literal prefix from your custom regex) and verifies each one is actually part of a matched note. Anything that fell inside a math/code ignore span without being scanned gets logged.
- AnkiConnect per-note errors are captured per-file with the front-field preview and error message.
- The sync notice now shows: `Synced N file(s) with warnings. ⚠️ X card-like line(s) were swallowed by a math/code ignore-span and were NOT synced. ❌ Y note(s) were rejected by Anki...` when any of that is non-empty.
- The status bar also goes to the error state instead of success, so it's visually obvious.
- Full diagnostics dump to dev tools console under `[Obsidian_to_Anki_Cleo] Sync diagnostics`.

### 3. Settings migrations run on every plugin load, not just when you open the settings tab

**Kai's behaviour:** The block that migrates legacy keys (`Tag` -> `Default Tags`, `Add Obsidian Tags` -> `Add Inline Tags`, etc) and backfills new defaults lives inside `SettingsTab.display()`. If you install or update Kai and immediately run sync without ever clicking into the plugin's settings tab, your on-disk `data.json` still has the old shape, and `setting-to-data.ts` crashes:

```
TypeError: Cannot read properties of undefined (reading 'split')
    at settingToData
```

The sync aborts before a single card is processed.

**This fork:** Migration and backfill logic now lives in `src/settings-migration.ts` and is called from `loadSettings()`, so every plugin start guarantees a well-formed settings object regardless of whether you've ever opened the settings UI.

### 4. Regression tests so this stuff doesn't come back

`tests/regex/regex-regression.test.js` is a zero-dependency Node script that locks in the regex behaviour, including the exact reproduction case for the bug above. Run `node tests/regex/regex-regression.test.js` and it exits non-zero if anyone (including future me) regresses the fixes.

---

## Everything else

All the user-facing functionality, the settings UI, the redesigned tag handling, frontmatter ID storage, folder decks, BRAT support, etc. is unchanged from upstream Kai. This fork is a strict superset of Kai 5.0.8 behaviour minus the bugs above.

The plugin ID (`obsidian-to-anki-plugin`) is unchanged from upstream so existing `data.json` settings, card IDs, deck mappings, and custom note types carry across cleanly when you swap. No re-sync of existing cards required.

---

## Installation

### Manual install (recommended for now)

1. Disable and uninstall any existing copy of `Obsidian_to_Anki` or `Obsidian_to_Anki_Kai` from Obsidian's Community Plugins page.
2. Create or open `<your-vault>/.obsidian/plugins/obsidian-to-anki-plugin/`.
3. Download these three files into that folder from the latest release:
   - `main.js`
   - `manifest.json`
   - `styles.css`
4. In Obsidian: Settings -> Community plugins -> hit the reload icon, then enable **Obsidian_to_Anki_Cleo**.

One-liner (run inside the plugin folder):

```bash
for f in main.js manifest.json styles.css; do
  curl -L -O "https://github.com/999cleo/Obsidian_to_Anki_Cleo/releases/latest/download/$f"
done
```

### BRAT

Works the same as Kai but with this repo's URL: `https://github.com/999cleo/Obsidian_to_Anki_Cleo`.

---

## Verifying the fix worked

After installing and syncing your file:

1. Open dev tools (`Ctrl+Shift+I` -> Console).
2. Look for `[Obsidian_to_Anki_Cleo] Sync diagnostics` entries.
3. If your file used to have currency-style `$`s and silently lost cards on Kai, you should now see all your cards appear in Anki, and the success notice should say `✅ Successfully synced N file(s) to Anki!` with no warning.
4. If you DO see a yellow warning notice after sync, expand the console entry — it lists each card-like line that was dropped with file path and line number, so you can fix the source markdown.

---

## Credit

- Original plugin: **Pseudonium** ([Obsidian_to_Anki](https://github.com/Pseudonium/Obsidian_to_Anki))
- Kai redesign: **n4tt0u** ([Obsidian_to_Anki_Kai](https://github.com/n4tt0u/Obsidian_to_Anki_Kai))
- Bug-hunt fork and safety nets: **999cleo** ([Obsidian_to_Anki_Cleo](https://github.com/999cleo/Obsidian_to_Anki_Cleo))

All upstream contributors deserve the credit for the actual product. This fork is a small set of bug fixes layered on top of their work.

## License

MIT, same as the upstream projects.
