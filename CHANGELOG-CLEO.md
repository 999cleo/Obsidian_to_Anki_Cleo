# Obsidian_to_Anki_Kai (Cleo's hardened fork)

This is a hardened fork of [n4tt0u's Obsidian_to_Anki_Kai](https://github.com/n4tt0u/Obsidian_to_Anki_Kai), which itself is a fork of [Pseudonium's original](https://github.com/Pseudonium/Obsidian_to_Anki). All credit for the design and the bulk of the source goes to them.

This fork exists to fix a class of **silent data loss** in the sync pipeline.

---

## 5.5.0 - Fix broken images from Anki's filename case normalisation

Images embedded with capitalised filenames (e.g. `Pasted image 1.png`, Obsidian's default) silently rendered as **broken images** in Anki on Linux/macOS, even though the file was uploaded and present in Anki's media folder.

Root cause: recent Anki **lowercases** media filenames when it stores them. Storing `Pasted image 1.png` actually lands the file as `pasted image 1.png`. The plugin wrote the card reference as `<img src="Pasted image 1.png">` (original case). On a case-sensitive filesystem `Pasted` does not equal `pasted`, so the reference fails to resolve and the image breaks. Older Anki preserved case, which is why images embedded long ago still work while recently-synced ones break, with nothing changed on the user's side except an Anki update.

This was verified directly against AnkiConnect: `storeMediaFile("Pasted image 1.png", ...)` returns `"pasted image 1.png"`, and `storeMediaFile("CAPS_test.png", ...)` returns `"caps_test.png"`.

What changed:

- New `ankiMediaName(link)` helper (`src/constants.ts`) = `basename(decodeMediaLink(link)).toLowerCase()`. It produces the exact name Anki will store the file under: directory stripped, percent-encoding decoded, lowercased.
- The plugin now uses this single name on BOTH sides: it stores the media under `ankiMediaName(...)` (`src/files-manager.ts`) and writes the same `ankiMediaName(...)` into `<img src>` / `[sound:]` (`src/format.ts`). Because the plugin controls both, they always agree, and an already-lowercase name is a no-op for Anki's own normalisation, so it works whether or not the running Anki version lowercases.
- The file is still LOCATED on disk via the original-case decoded link (the vault is case-sensitive), so lookup of the real file is unaffected.
- Media extension classification is now case-insensitive, so uppercase extensions like `.PNG` / `.MP3` are recognised instead of being skipped as "unsupported".
- New zero-dep regression test `tests/regex/media-link-case.test.js`.

### Fixing your existing broken cards

Existing cards still reference the original-case name. Either re-sync the affected notes after updating (force a rescan if smart scan is on: edit and save the note, or disable smart scan for one sync), or run a one-off fix that rewrites card references to lowercase where the lowercase file already exists in `collection.media`. After 5.5.0 all new syncs are consistent.

---

## 5.4.0 - Fix broken images from percent-encoded embed links

Images embedded with Obsidian's markdown-style syntax silently rendered as **broken images** in Anki, even though they displayed fine in Obsidian.

Root cause: Obsidian writes two embed shapes depending on the "Use [[Wikilinks]]" setting and how a file was inserted:

- Wikilink: `![[Pasted image 1.png]]` -> link is `Pasted image 1.png` (literal spaces)
- Markdown: `![](Pasted%20image%201.png)` -> link is `Pasted%20image%201.png` (percent-encoded spaces)

The plugin stored the media file in Anki's collection under the raw link name (`Pasted%20image%201.png`, with a literal `%20`) and wrote the same raw name into `<img src>`. When Anki's media server resolves an `<img src>`, it decodes `%20` back to a space and looks for `Pasted image 1.png`, which does not exist under that name, so the image renders broken. Wikilink embeds happened to work, which is why only some images broke.

What changed:

- New `decodeMediaLink` helper (`src/constants.ts`) normalises an embed target to its literal on-disk filename via `decodeURIComponent`, with a try/catch fallback so a real `%` in a filename never breaks the sync. Decoding a string with no escapes is a no-op, so wikilink embeds are unaffected.
- `getAndFormatMedias` (`src/format.ts`) now decodes the link before registering it for upload, before building `[sound:...]`, and before building `<img src>`, so the stored name, the referenced name, and Anki's resolved name all agree.
- New media-failure diagnostic: when an embed target cannot be located in the vault, it is recorded in `scan_diagnostics.media_failures` and surfaced in the post-sync warning Notice (`N media file(s) could not be located...`) with filenames in the DevTools console, instead of silently producing a broken card.
- New zero-dep regression test `tests/regex/media-link-decode.test.js` locks the behaviour: wikilink embeds still work, percent-encoded embeds are repaired, subfolders and unicode filenames decode correctly, and malformed escapes fall back without throwing.

Note on existing broken cards: re-syncing repairs them only if the note's file is re-scanned. If you have **smart scan** enabled and the `.md` file has not changed since the partial sync, force a rescan (edit and save the file, or disable smart scan for one sync) so the corrected `<img src>` and media upload are re-sent.

---

## 5.3.0 - Catch malformed cards that never matched (missing `A:` and friends)

5.2.0's safety net only flagged a card-cue line when it fell **inside a math/code ignore-span** (the stray-`$` currency bug). But a card can silently vanish for a second reason that the net walked straight past:

> If a card's answer line is **missing its `A:` prefix**, the Q/A note regex needs both a `Q:` line and an `A:` line, so it never matches. No match means no note, no `<!--ID-->` written, and no warning. The sync notice still said success.

Real reproduction: a 33-card study note synced 30 cards and silently dropped 3, all of them cards where the `A:` had been left off the answer line. They looked almost identical to the synced cards in the editor.

What changed:

- The scanner now records the **exact source span** of every note it actually matches (`matched_note_spans`), replacing the old `id_indexes` +/-400-character heuristic that could mask an orphaned cue sitting next to a real card.
- `detectSuspectedUnmatchedCards` now flags **any** card-cue line that produced no note, not just ones swallowed by a math/code span. The reason string distinguishes the two causes: stray-`$`/backtick swallow vs "card start did not match the note pattern (answer line probably missing its `A:` prefix)".
- Cues that legitimately sit inside trusted ignore spans (deck line, tag line, frozen-fields, explicit Begin/End Note blocks) are still not reported, so no false alarms.
- The post-sync warning Notice text was broadened to name the malformed-card cause, and the per-card line numbers and reasons are dumped to the DevTools console as before.
- New zero-dep regression test `tests/regex/orphan-card-detection.test.js` locks the behaviour: well-formed cards produce zero orphans, a card missing `A:` is flagged, and its well-formed neighbours still match.

Net effect: a card that won't sync now produces a visible warning with the exact line number, instead of disappearing.

---

## The bug this fork fixes

The plugin builds an `ignore_spans` list of byte ranges it should NOT scan for cards: math, code, frozen-fields lines, deck/tag headers, etc.

The inline-math regex was:

```js
/(?<!\$)\$((?=[\S])(?=[^$])[\s\S]*?\S)\$/g
```

`[\s\S]*?` is "anything, including newlines, lazy". Plain `$` is treated as a math delimiter regardless of context. So if your note contains plain English with two `$` somewhere, e.g. **a dollar amount in one card and another dollar amount many cards later**, the regex pairs them and marks the entire span between them as "math, do not scan".

Real-world reproduction (a study note with currency amounts that triggered this fork):

> "Q: Why don't most businesses use cash accounting?
> A: Cash often moves at a different time to the actual business activity. If you make a **$200k** scale in June..."
>
> ... about **5,300 characters** of unrelated cards later ...
>
> "Q: \[Slide 41 Practice\] A company receives an invoice for **$8,000** of electricity..."

That `$200k` paired with `$8,000` formed a single 5,356-char "math span", swallowing **28 cards**. They never went to Anki. The sync notice still said "Successfully synced". The cards looked perfectly normal in the .md file.

Same class of bug exists in the inline-code regex (`/(?<!`)`(?=[^`])[\s\S]*?`/g`) which would pair a stray backtick across paragraphs.

## What this fork changes

**1. Inline math regex now requires real math semantics** (`src/constants.ts`)

```js
/(?<![\d\w\$])\$(?=\S)([^\n$]+?)(?<=\S)\$(?![\d\w])/g
```

- No newline inside the body (math is single-line in Obsidian inline mode).
- No other `$` inside the body.
- No whitespace touching either delimiter (Obsidian rule).
- Not preceded by a digit/letter (avoids `$200k` as opening).
- Not followed by a digit/letter (avoids `5$` as closing).

**2. Inline code regex is now single-line** (`src/constants.ts`)

```js
/(?<!`)`(?=[^`])[^\n`]*?`/g
```

**3. Display math no longer crosses paragraph breaks** (`src/constants.ts`)

```js
/\$\$([^\n][\s\S]*?[^\n])?\$\$/g
```

**4. Post-scan safety net: detect cards silently swallowed by ignore-spans** (`src/file.ts`, `detectSuspectedUnmatchedCards`)

After all custom regexes have run, walk the file looking for lines that LOOK like a card delimiter (`^Q:`, `^A:`, `^START`, or any literal prefix from the user's custom regex), and check whether each one falls inside a math/code ignore-span without being part of a matched note. Anything that does is recorded in per-file diagnostics. This is the safety net against future regex regressions, plus weird user content the math/code logic doesn't anticipate.

**5. AnkiConnect per-note failures are now surfaced, not silenced** (`src/files-manager.ts`)

When `addNote` inside a `multi` call returns an error (duplicate front field, empty field, unknown model), the old code logged a `console.warn` and pushed `null` into `note_ids`. `writeIDs` then skipped the null silently. Now each failure is captured into `scan_diagnostics.add_failures` with the failing front-field preview and error message.

**6. Sync notice now reflects reality** (`main.ts`)

Old notice: `✅ Successfully synced N file(s) to Anki!` always, even when cards were dropped.

New notice when diagnostics are non-empty:

> Synced N file(s) with warnings. ⚠️ X card-like line(s) appear to have been swallowed by a math/code ignore-span and were NOT synced. ❌ Y note(s) were rejected by Anki...

Full per-file diagnostics are dumped to the developer console under `[Obsidian_to_Anki_Kai] Sync diagnostics`.

The status bar item also goes to the error state instead of success, so it's visually obvious.

## Installation

See the install/uninstall steps in the original repo's README. This fork is a drop-in replacement for the same plugin folder.

## Credit

- Original plugin: Pseudonium
- Kai redesign: n4tt0u
- This safety-net fork: 999cleo
