export const ANKI_ICON: string = `<path fill="currentColor" stroke="currentColor" d="M 27.00,3.53 C 18.43,6.28 16.05,10.38 16.00,19.00 16.00,19.00 16.00,80.00 16.00,80.00 16.00,82.44 15.87,85.73 16.74,88.00 20.66,98.22 32.23,97.00 41.00,97.00 41.00,97.00 69.00,97.00 69.00,97.00 76.63,96.99 82.81,95.84 86.35,88.00 88.64,82.94 88.00,72.79 88.00,67.00 88.00,67.00 88.00,24.00 88.00,24.00 87.99,16.51 87.72,10.42 80.98,5.65 76.04,2.15 69.73,3.00 64.00,3.00 64.00,3.00 27.00,3.53 27.00,3.53 Z M 68.89,15.71 C 74.04,15.96 71.96,19.20 74.01,22.68 74.01,22.68 76.72,25.74 76.72,25.74 80.91,30.85 74.53,31.03 71.92,34.29 70.70,35.81 70.05,38.73 67.81,39.09 65.64,39.43 63.83,37.03 61.83,36.00 59.14,34.63 56.30,35.24 55.08,33.40 53.56,31.11 56.11,28.55 56.20,25.00 56.24,23.28 55.32,20.97 56.20,19.35 57.67,16.66 60.89,18.51 64.00,17.71 64.00,17.71 68.89,15.71 68.89,15.71 Z M 43.06,43.86 C 49.81,45.71 48.65,51.49 53.21,53.94 56.13,55.51 59.53,53.51 62.94,54.44 64.83,54.96 66.30,56.05 66.54,58.11 67.10,62.74 60.87,66.31 60.69,71.00 60.57,74.03 64.97,81.26 61.40,83.96 57.63,86.82 51.36,80.81 47.00,82.22 43.96,83.20 40.23,88.11 36.11,87.55 29.79,86.71 33.95,77.99 32.40,74.18 30.78,70.20 24.67,68.95 23.17,64.97 22.34,62.79 23.39,61.30 25.15,60.09 28.29,57.92 32.74,58.49 35.44,55.57 39.11,51.60 36.60,45.74 43.06,43.86 Z" />`

import { basename } from 'path'

// --- Robust ignore-region regexes ---------------------------------------
// The original Kai/Pseudonium regexes were sloppy and crossed newlines, which
// caused them to swallow huge chunks of file content into `ignore_spans` and
// silently drop legitimate cards. For example `$200k` paired with a later `$8,000`
// inside a different card would form a single "math span" hundreds of lines long.
//
// The replacements below mirror Obsidian's actual rendering rules:
//   * inline math: $...$ where the body has no newline, no other $, and no
//     whitespace touching either delimiter. Currency-style "$5" / "5$" is
//     explicitly excluded via lookarounds, since Obsidian treats those as text.
//   * inline code: `...` on a single line (Obsidian inline code cannot wrap).
//   * display math/code stay multi-line as before, but display math now also
//     refuses to match across paragraph breaks of blank lines (which were
//     never valid Obsidian math anyway).

// Inline math: $non-ws ... non-ws$ with no newline and no other $ in the body,
// not preceded by a digit/letter or $ (avoids $200k currency), not followed by
// a digit (avoids text like "between $5 and $10").
export const OBS_INLINE_MATH_REGEXP: RegExp =
    /(?<![\d\w\$])\$(?=\S)([^\n$]+?)(?<=\S)\$(?![\d\w])/g

// Display math: $$ ... $$ allowed to span lines but not separated by a blank line.
// Body can start/end on a newline (multiline blocks are valid), but the regex
// rejects matches where the body contains a blank-line paragraph break, which
// is never legitimate display math.
export const OBS_DISPLAY_MATH_REGEXP: RegExp = /\$\$(?:(?!\n\s*\n)[\s\S])*?\$\$/g

// Inline code: `...` on the same line only.
export const OBS_CODE_REGEXP: RegExp = /(?<!`)`(?=[^`])[^\n`]*?`/g

// Display code: ``` ... ``` (fenced). Multi-line is correct here.
export const OBS_DISPLAY_CODE_REGEXP: RegExp = /```[\s\S]*?```/g

export const CODE_CSS_URL = `https://cdn.jsdelivr.net/npm/highlightjs-themes@1.0.0/arta.css`

export function escapeRegex(str: string): string {
    // Got from stackoverflow - https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript
    return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

// Normalise an Obsidian embed/link target to the literal on-disk filename.
//
// Obsidian writes two embed shapes depending on the "Use [[Wikilinks]]" setting
// and how the file was inserted:
//   - Wikilink:  ![[Pasted image 1.png]]   -> link = "Pasted image 1.png" (literal spaces)
//   - Markdown:  ![](Pasted%20image%201.png) -> link = "Pasted%20image%201.png" (percent-encoded)
//
// If the percent-encoded form is passed through untouched, the file gets stored
// in Anki's media collection under a name containing a literal "%20" while the
// <img src> Anki later resolves gets its "%20" decoded back to a space, so the
// lookup misses and the image renders broken. Decoding here makes locate /
// store / reference all agree on the same literal filename. Decoding a string
// with no percent-escapes is a no-op, so wikilink embeds are unaffected. A
// malformed escape (e.g. a real "%" in the filename) throws, in which case we
// fall back to the original string rather than break the sync.
export function decodeMediaLink(link: string): string {
    try {
        return decodeURIComponent(link)
    } catch (_) {
        return link
    }
}

// Compute the exact filename Anki will store a media file under, given an
// Obsidian embed/link target.
//
// Recent Anki normalises media filenames on store: it strips the directory,
// and (observed on Linux desktop) LOWERCASES the whole basename, so storing
// "Pasted image 1.png" actually lands the file as "pasted image 1.png". On a
// case-sensitive filesystem the card's <img src="Pasted image 1.png"> then
// fails to resolve and the image renders broken. (Older Anki preserved case,
// which is why images embedded long ago still work while recent ones break.)
//
// We make the sync deterministic across Anki versions by lowercasing the name
// we BOTH store the file under AND reference in <img src>/[sound:] ourselves.
// Because we control both sides, they always agree: an already-lowercase name
// is a no-op for Anki's own normalisation, so it matches whether or not the
// running Anki lowercases. decodeMediaLink first so percent-encoded embeds are
// handled too (see above).
export function ankiMediaName(link: string): string {
    return basename(decodeMediaLink(link)).toLowerCase()
}
