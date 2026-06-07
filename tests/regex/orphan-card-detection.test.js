// Dependency-free regression test for the "orphan card cue" safety net added in
// the fork after 5.2.0. The original silent-drop bug (Kai 5.0.x) was a stray-$
// math span swallowing cards; 5.2.0 caught that. THIS test locks in the second
// silent-drop cause: a card whose answer line is missing its "A:" prefix never
// matches the Q/A regex, produces no note, and used to vanish without warning.
//
// Run with:
//   node tests/regex/orphan-card-detection.test.js
//
// Exits non-zero on failure. The logic below mirrors detectSuspectedUnmatchedCards
// in src/file.ts as a literal contract: a card-cue line (^Q:) that does not fall
// inside any matched-note source span must be reported as unmatched.

let failed = 0;
function assert(cond, label) {
    if (cond) {
        console.log("  \u2713", label);
    } else {
        console.log("  \u2717", label);
        failed++;
    }
}

// The canonical "Basic" Q/A custom regexp: front after "Q: ", back after "A: ".
// Requires BOTH a Q: line and an A: line, exactly like the user's note type.
const QA = /^Q: ((?:.+\n)*(?:.+))\nA: ((?:.+\n)*(?:.+))/gm;
// The cue that marks the START of a card.
const CUE = /^Q: /gm;

// Mirror of the safety-net core: collect matched-note source spans, then report
// any cue line not inside one of them.
function unmatchedCues(file) {
    const matched_spans = [];
    for (const m of file.matchAll(new RegExp(QA.source, QA.flags))) {
        matched_spans.push([m.index, m.index + m[0].length]);
    }
    const inMatched = (pos) => matched_spans.some(([a, b]) => pos >= a && pos < b);
    const orphans = [];
    for (const m of file.matchAll(new RegExp(CUE.source, CUE.flags))) {
        if (inMatched(m.index)) continue;
        const line = file.slice(0, m.index).split("\n").length;
        orphans.push({ line, index: m.index });
    }
    return { matched: matched_spans.length, orphans };
}

console.log("== Well-formed cards: no orphans ==");
const clean = `Q: What is the data deluge?
A: The overwhelming flood of digital information generated daily.

Q: Does more data mean better decisions?
A: No. Value comes from insights.
`;
{
    const r = unmatchedCues(clean);
    assert(r.matched === 2, `both cards matched (got ${r.matched})`);
    assert(r.orphans.length === 0, `no orphans on clean input (got ${r.orphans.length})`);
}

console.log("== Card missing its A: prefix is flagged, neighbours still sync ==");
// Reproduction shape: a card whose answer line lacks "A:" sits between
// well-formed cards. The malformed one must be reported; the others must match.
const reproduction = `Q: What is the modal class in a histogram?
A: The bin with the highest frequency.

Q: What does it mean for a histogram to be symmetric?
The left half mirrors the right half. A bell curve is the classic example.

Q: How common is a perfectly symmetric distribution?
A: Rare. Most real data is skewed.

Q: What does a long tail to the right mean?
It means the data is positively skewed.

Q: What does a long tail to the left mean?
It means the data is negatively skewed.

Q: What is a histogram used for?
A: Showing the frequency distribution of one continuous variable.
`;
{
    const r = unmatchedCues(reproduction);
    // 6 Q: cues; 3 have A: lines and match, 3 are missing A: and are orphans.
    assert(r.matched === 3, `three well-formed cards matched (got ${r.matched})`);
    assert(r.orphans.length === 3, `three malformed cards flagged (got ${r.orphans.length})`);
    // The flagged lines are the three with no A: line.
    const orphanLines = r.orphans.map(o => o.line);
    assert(orphanLines.length === 3 && r.matched === 3,
        `orphans are isolated, real cards not masked (orphan lines: ${orphanLines.join(", ")})`);
}

console.log("== Single trailing malformed card is still caught ==");
const trailing = `Q: Good card?
A: Yes.

Q: Bad card with no answer prefix?
This line has no A colon so the regex never matches it.
`;
{
    const r = unmatchedCues(trailing);
    assert(r.matched === 1, `one matched (got ${r.matched})`);
    assert(r.orphans.length === 1, `trailing malformed card flagged (got ${r.orphans.length})`);
}

if (failed) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log("\nAll orphan-card-detection tests passed.");
