# Deviations and run log

Pre-registered protocol: `protocol.md` v1.2, frozen 2026-10-26 **before**
any data was collected. Anything below happened before or during collection and
is recorded here rather than by editing the protocol.

## Before data collection (bundled into protocol §9)

1. FPR-based verdict requires ≥10 flags; below that the verdict is K3.
2. D1 classification reuses the detector's predicates; `selftest.js` guards it.
3. Sampling spreads across 30 WET files, ≤10 records each. The first 300-record
   fetch read a **single** file (records are taken in file order) — a clustered
   sample from one crawl segment. That run was discarded and is not used.
4. D2 ⊆ D1 in the WET frame (no markup, so concealment is character-level only),
   which bounds `p_instr ≤ p_any` and scopes annotation.

## Run log — F1 sample, 2026-10-26

| | |
| --- | --- |
| command | `node fetch-wet-sample.js --n=300 --per-file=10 --max-files=30` |
| crawl | `CC-MAIN-2026-25` (seeded draw from the 6 most recent) |
| seed | 20261026 |
| files read | 29 of 30 |
| files skipped | 1 — `…/segments/1780687572537.33/wet/CC-MAIN-20260610052232-20260610082232-00420.warc.wet.gz` returned HTTP 503 on all three attempts |
| records | **290** (target 300; shortfall accepted rather than changing the seed or the file list) |
| distinct domains | 275 |
| median chars | 1,480 (max 54,589) |

Shortfall handling: the protocol fixes N=300 and forbids peeking-then-extending.
Falling short by 10 records does not justify a re-draw — re-drawing would be
selection. The shortfall is recorded and the analysis uses the actual N.

## During collection

- `selftest.js` run before sampling: passed.
- D1 computed mechanically at sheet-generation time (34/290). This is the
  machine half of the definition; the annotator confirms it in `labels.csv`.
- D2 not yet adjudicated at the time of `preliminary-report.md`.
- No protocol changes were made after the first record was fetched.

## Additions after the first descriptive report

These add documentation and one corrected reading; no analytic decision changed.

1. **Script census added to `summarize.js`** because the ACL-ARR responsible
   research checklist (B5) asks for language coverage. Result: 231/290 records
   (79.7%) contain a non-Latin script — Han 205, Hiragana/Katakana 40, Cyrillic
   19, Hangul 10, Greek 7. Languages are still not identified.
2. **Reading of `mixed-script` corrected in the README**: with 79.7% of the
   sample in non-Latin scripts, that heuristic fires by construction, so its
   count describes the sample's script mix rather than any threat. The earlier
   prose implied otherwise by leaving the connection implicit.
3. **`RESPONSIBLE-RESEARCH.md` added**: an item-by-item self-audit against the
   ACL-ARR checklist, including the gaps (D2 unmeasured, languages unidentified,
   one crawl, no formal dual-use assessment, no PII scan — justified by not
   publishing text) and the AI-assistant disclosure (E1).
4. **D1 stratified by script, added to `summarize.js` and the README.** The
   aggregate rate is 11.7%, but it is concentrated in the non-Latin half of the
   sample: 32/231 = 13.9% (95% CI 10–18.9%) versus 2/59 = 3.4% (95% CI 0.9–11.5%)
   among Latin-only records. Reporting only the aggregate would overstate what a
   Latin-script (closest proxy for English) pipeline meets. This is a reporting
   correction, not a change to the pre-registered decision rule; the detector flag
   rate is 0/290 in every stratum, so K3 is unaffected.
5. **Decision-rule applicability recorded.** Because 0/290 records were flagged,
   the false-positive rate is undefined rather than small, so K1/K2 are not just
   unmet but *inapplicable*. `analyze.js` now reports this as **K3 (structural)**
   with its own message, and `RESPONSIBLE-RESEARCH.md` records it as a limitation
   of the rule. No protocol edit: the rule is frozen, and the inapplicability is
   a result about the detector, not a change to the criterion.
6. **F4 scaffold added, unrun** (`scripts/f4/`, with its own README and safety
   checklist). The protocol already lists F4 as a deferred frame; this only makes
   the instrumentation reviewable before anyone runs it. It needs a VM with
   Playwright; no number exists yet and none is claimed.
7. **D2 report template added** (`results/annotation-template.md`) so the
   annotation pass has a fixed output shape — including the instruction not to
   substitute a guessed FPR if the formal rule cannot fire.
8. **Triage helper added** (`scripts/triage.js`) to prioritise the 34 candidates
   by how much human judgement they need. It writes no labels and keeps the blind
   pass intact. Result on this sample: 3 `context` (zero-width outside a CJK
   window), 31 `benign-signature`, **0 `smuggling`** (no Tags, sneaky-bit or bidi
   candidates). That is a strong prior that D2 will be 0, and it is recorded here
   *before* the annotation so it cannot be presented as a post-hoc discovery.
9. **Intervals re-estimated with a domain-clustered bootstrap** (`summarize.js`,
   2,000 replicas, seed `20261026`). The Wilson intervals assumed independent
   records; with 290 records over 275 domains and mirrored pages they were too
   narrow. Clustered: overall 11.7% (8.1–15.6), non-Latin 13.9% (9.4–18.7),
   Latin-only 3.4% (0–8.8). Reporting correction, not an analytic change.
10. **`NEXT-STUDY.md` added**: the frame that would actually decide the question
    (agent task URLs, targeted retrieval corpora, tool outputs, markup surfaces),
    with the design requirements F1 taught us — language ID instead of script,
    site-type stratification, clustered intervals, and a comparator that works
    when the detector is silent.
11. **Sensitivity control added after the study ran**: `results/sensitivity-protocol.md`
    was frozen before any positive control was executed, but the control as a whole
    is an addition to `protocol.md` v1.2, not part of the original design. P2b (bare
    instruction payloads from InjecAgent + BIPIA) was run after P2 and is declared
    as an amendment in the report; P2 stands on its own. Consequence recorded in
    the report, the README and `RESPONSIBLE-RESEARCH.md`: D2 = 0 is scoped to
    documents that contain an invisible character, and 256 of 290 documents were
    never in D2 scope at all.
12. **D2 coverage recorded as it was (2026-11-13)**: `labels.csv` contains 3 rows,
    not 34. The 3 triaged `context` candidates were read end to end; the 31
    `benign-signature` candidates were screened by mechanism (89 invisible
    characters, each matching a known rendering or text-assembly signature) and not
    read. The 30-record D1 audit and the 10% same-annotator re-label in protocol §4
    were not executed. The README's "human adjudication of the 34 candidates" was
    corrected to match. Consequence: D2 = 0/34 is conditional on the screen; the
    close-read result is 0/3 (one-sided 95% UB 63.2%). Recorded in
    `results/d2-report.md`.
13. **Zero-count interval convention fixed (2026-11-13)**: the F1 detector row read
    0.0–1.3% (the 3.84/n normal approximation) while F4 read 0.54% for the same
    kind of zero (one-sided exact). The convention is one-sided exact
    Clopper–Pearson throughout: 0/290 → 1.0%, 0/553 → 0.54%, 0/34 → 8.4%, 0/3 →
    63.2%. Reporting correction only; no decision rule changed.

## Known limitations carried forward

- 0 flags of 290 means FPR is not estimable; the pre-registered rule returns K3
  rather than a decision. The sensitivity control bounds what the detector would
  have caught, but it cannot substitute for an FPR.
- The instrument only inspects documents with an invisible character: visible
  instructions and visible encodings (base64, emoji) are outside its reach by
  construction, and 88.3% of the sample was never examined for D2.
- D2 rests on 3 close reads plus 31 signature screens: no D1 audit, no second
  annotator, no agreement statistic (see `results/d2-report.md`).
- WET cannot see comments, attributes, or CSS-hidden text; F3 remains unrun, and
  F4 ran on job postings only (run log below).
- One crawl, one PRNG seed, one extraction pipeline. Reported as "agent-ingest
  text", never "the web".
- Languages are not identified, only scripts.
## Run log — F4 sample, 2026-11-10 (not pre-registered)

F1's standard does not hold here: this frame was designed, run and written up in
one pass. Recorded so the difference is not discovered later.

| | |
| --- | --- |
| population | 553 job postings, 14 employers, three ATS families (Greenhouse 320, Ashby 153, Lever 80) |
| sampling | systematic, 40 per board, id-sorted from each board's own API ordering |
| fetch | 2026-11-10, unauthenticated syndication APIs, one pass; per-page SHA-256 in `results/render-2026-11-10.manifest.jsonl` |
| instrument | headless Chromium 156, 1280×900, computed style per element; 13 concealment predicates; Unicode + attributes + JSON-LD + meta description + `<template>` |
| units | 5,728 concealed elements → 149 distinct strings (sha16 + length only) |

Deviations from the scaffold (`scripts/f4/`):

1. **JavaScript enabled.** The scaffold disables JS and renders saved HTML. These
   ATS pages are client-rendered, so a JS-disabled run would measure a different,
   smaller frame. The frame here is "what an agent's browser sees", which is the
   decision this study is about — but it is not the scaffold's frame.
2. **Population is job postings**, not a sample of F1 URIs: the question moved
   from "the web" to content an agent ingests for matching.
3. **Python implementation** (`scripts/f4/python/`) rather than `render-hidden.js`.
   The channel list is a superset of the scaffold's except for JSON-LD `@graph`
   nesting, which is treated as flat text.
4. **Comments measured on a 101-page subsample only** (80 nodes, none
   instruction-shaped). Not a full-corpus channel in this run.
5. **No raw page text is stored or published.** Concealed strings exist as
   SHA-256 prefix and length; titles are dropped from the manifest.

Interpretation rule applied to the five stage-2 hits on JSON-LD and meta
description: all sit in schema.org `JobPosting` objects, none carries a
second-person directive, role-play frame, wrapper tag, assistant turn or
"ignore" clause. Adjudicated as false positives on job prose, not instructions.

### Addendum — F4 board identities withheld, 2026-11-13

The published manifest named the fourteen employers sampled: `board`, `url`, and
the board segment of `key`. That is a statement about the author's job search,
not about the frame. `results/render-2026-11-10.manifest.jsonl` now carries
`board_hash` — `sha256(salt + ats + ":" + board)[:12]`, salt in
`data/f4/board-salt.txt`, untracked — and no URL.
`scripts/f4/python/redact_manifest.py` reproduces the redaction from the local
copy, and `fetch_boards.py` reads its board list from `data/f4/boards.txt`
instead of a literal.

Preserved: 553 rows, 14 distinct hashes, three ATS families, per-page SHA-256,
byte size and `fetched_at`, so every number in the report stays checkable. Lost:
re-fetching a board from the repository alone. Rows still group by employer for
anyone holding the salt.

## Run log — F5 freeze, 2026-11-13 (pre-registered, before any body was read)

| | |
| --- | --- |
| protocol | `protocol-f5.md`, SHA-256 `76f3ef1fee9fbddc4fd4d3c62c2da19019dffcb9ffd7cbbb69b8d3141e516d1e` |
| corpus snapshot | `data/f5/corpus.sha256` — 894 files, aggregate digest `8d1c4bb1ee5e4f953dc5b32a936f2b2e0beaddf18d5bf45b18a8f62f73837cbb` |
| manifest | 1,338 unique messages (1,390 read, 52 duplicates), 48 senders, 17 self-sent |
| window | 2023-01-01 → 2026-07-18 primary; 2018-05..2022-12-31 separate stratum |

**No message body was decoded, rendered or read before this hash was recorded.**
Precisely: the Task 0 manifest parsed headers only (`headersonly=True`) and read
message bytes solely to compute SHA-256; the snapshot digest covers those same
bytes.

Deviations from the plan as written:

1. **`.gitignore` was not edited.** The root file already ignores `data/`, so a
   `data/f5/` line would be redundant; `git status` shows no file under `data/f5/`.
2. **The freeze sentence was corrected.** The plan asked for "No message body was
   read before this hash was recorded". Byte-level hashing necessarily reads the
   body, so the accurate sentence above replaces it. This discloses exactly what
   touched the bytes instead of overclaiming.
3. **The self-address list came from the Thunderbird identity**
   (`mail.identity.id1.useremail`), not from typing, so the `self` flag does not
   rest on a typo. The address stays in `data/f5/self-addresses.txt` and appears
   in no tracked file.
4. **Sender count is 48, not 44.** The earlier 44 was mbox-only. The
   sender-clustered zero bound moves 6.58% → 6.05%, as the plan anticipated it
   would move "only slightly".
5. **17 self-sent rows found.** Excluding them moves the message-level zero bound
   0.224% → 0.227%; both levels are reported.

## Publication decision — F5 without D2, 2026-11-13

The mechanism counts (D1, E1) are published in `results/f5-2026-11-13.md` while
the instruction rate (D2) is `unmeasured`. D2 requires a human reading pass over
the 109 `smuggling` candidates — 1,016 KB of sheets — and that pass was not run.
The alternatives were to publish a model-screened number, which would change what
the frame measures, or to publish no instruction number at all. The second option
is taken, and the absence is stated in the report, the README and the summary JSON
(`d2_d3.status = "unmeasured"`).

Consequence: F5 supports no claim about concealed instructions in mail. It
supports claims about where invisible characters live in mail — HTML source at
48.8% against plain body at 0.83% — at one-inbox scope, with the sender-clustered
interval (21.7–86.5%) attached.

## Addendum — F5 instrument location, 2026-11-13 (before the first scan)

`protocol-f5.md` §6 named `scripts/triage.js`'s `classify()` as the reused
instrument. That is wrong about this codebase: `triage.js` sorts *records* into
smuggling/context/benign-signature and carries its own copy of the character
predicates, whereas F1's D1 instrument is `makeClassifier(detector)` +
`invisibleSummary()` in `scripts/make-sheet.js` — the pair `scripts/selftest.js`
validates. F5 scans with `make-sheet.js` and uses `triage.js` only for ordering,
which is what protocol §5 permits ("the triage rule may prioritise; it may not
decide").

No definition, threshold or channel changed, and the predicates are the same
lemon-juice ones. Recorded before the first flag was computed.

First scan, same day after the freeze: 653 of 1,338 records carry at least one D1
row — 644 in the `html` source channel, 11 in `plain`. Priority split: 109
smuggling, 87 context, 457 benign-signature. E1 surfaces appear in 1,297 records.
The channel split is recorded here, before adjudication, so the report cannot
imply a different shape later. Whether the HTML-dominant count is template noise
or something else is what the human pass decides.

## Retention executed — 2026-11-13

`data/f5/text/` (1,338 decoded messages, 110 MB) was deleted after the analysis
run, per protocol §10. Kept: `corpus/` (the snapshot), `corpus.sha256`,
`corpus-manifest.csv`, `index.csv` (text-free), `flags.csv`, `triage.csv`,
`sheet/`, `labels.csv`, `salt.txt`. Re-extraction is reproducible from the
snapshot in about six seconds, so the deletion costs nothing that cannot be
regenerated locally.

## Addendum — F5 sheet excerpting, 2026-11-13 (before the first label)

`make_sheet.js` cut every channel at the first 8,000 characters and stopped.
Measured after the sheets existed: of **644** marker-bearing channels, **147**
showed at least one marker and **497** showed none — every flagged character sat
past the cut. A human pass over those sheets would have recorded "no concealed
instruction" for records whose flagged character was never displayed: an unread
zero, not a measurement. The annotation pack inherited the defect and printed
two of seven records with no snippet at all.

Fixed in `scripts/f5/make_sheet.js`: the sheet now shows the message opening
(800 chars) plus up to five windows of ±320 characters centred on the first
markers, opening and windows deduplicated, and each window labelled with its
offset. Marker-bearing channels: **644 of 644** now show at least one marker.
Channels without markers keep the head slice, unchanged.
`tests/f5/make_sheet.test.js` (6 tests) pins the property that failed: a marker
past char 8,000 reaches the excerpt, a run coalesces into one window, offsets
count code points (astral variation selectors included), and no window splits a
marker.

Sheets were regenerated from the snapshot. `flags.csv` was not touched, so D1 is
unchanged — `analyze_eml.js` reprints 653/1,321 with the same interval. No label
existed when the instrument changed: `labels.csv` is still 653 blank rows.

`scripts/f5/make_pack.js` is now committed (it had been a scratch script) and
draws one record per sender instead of the top of one class. Reason, measured:
`smuggling` (109 records) is a **single** sender, `context` (87) is 5,
`benign-signature` (457) is 12 — seven records from the smuggling class would
have been one template read seven times. The 7-record pack now spans seven
senders. The concentration is published as a table in
`results/f5-2026-11-13.md` (`## Where the positives sit`), because a
message-level count over this corpus is largely a count of templates.

## Addendum — E2 arm drawn, 2026-11-13 (before any E2 label)

Protocol §9 froze the visible-instruction arm at 100 messages stratified by era;
nobody had drawn it. It is drawn now, by `scripts/f5/sample_visible.js`, and the
choices that make it reproducible are recorded here before a single label exists.

- **Draw.** Seed `20261113`, order `sha256(seed:id)` over the 1,321 eligible
  messages, allocated proportionally to the two eras: **54 primary + 46 stratum**
  (714/607). The sample file interleaves the eras, so an annotator who stops at
  30 has 15 + 15, not 30 of one era. No message is re-drawn; the sample is
  reproducible from the manifest alone.
- **What E2 reads.** E2 asks about visible words, so the pack shows visible text:
  `text/plain`, else `plain_quoted`, else the HTML with tags removed and entities
  decoded. A short plain stub next to a 30 KB HTML body counts as a rendering,
  not an empty message, so the channel with the most visible text wins. Long URLs
  collapse to `[url]` and the excerpt is capped at 1,200 chars. D1 judged raw
  source; E2 judges what a reader sees — the two are deliberately different
  artifacts and the pack says so in its header.
- **Judgement rule, written before the read.** Y only if the visible words name
  the reader as an assistant/agent/model (or reassign its identity) *and* give an
  action; calls to action aimed at a person, unsubscribe/footer boilerplate,
  legal notices and quoted mentions of AI do not count.
- **Labels.** `data/f5/labels-e2.csv`, 100 rows, blank. `analyze_eml.js` reports
  E2 as `not drawn` / `drawn, not read` / `partial (n of 100)` / `measured`, with
  per-era counts and the zero-hit one-sided bound for the number actually read.
  A blank cell is `unread`, never zero.

At the moment of writing, every E2 row is blank; the report prints
`E2 — drawn, not read`.

