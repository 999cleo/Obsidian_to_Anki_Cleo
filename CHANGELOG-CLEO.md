# Obsidian_to_Anki_Kai (Cleo's hardened fork)

This is a hardened fork of [n4tt0u's Obsidian_to_Anki_Kai](https://github.com/n4tt0u/Obsidian_to_Anki_Kai), which itself is a fork of [Pseudonium's original](https://github.com/Pseudonium/Obsidian_to_Anki). All credit for the design and the bulk of the source goes to them.

This fork exists to fix a class of **silent data loss** in the sync pipeline.

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
