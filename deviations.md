# Deviations and run log

Pre-registered protocol: `protocol.md` v1.2, frozen 2026-10-26 **before**
any data was collected. Anything below happened before or during collection and
is recorded here rather than by editing the protocol.

## Before data collection (bundled into protocol Â§9)

1. FPR-based verdict requires â‰¥10 flags; below that the verdict is K3.
2. D1 classification reuses the detector's predicates; `selftest.js` guards it.
3. Sampling spreads across 30 WET files, â‰¤10 records each. The first 300-record
   fetch read a **single** file (records are taken in file order) â€” a clustered
   sample from one crawl segment. That run was discarded and is not used.
4. D2 âŠ† D1 in the WET frame (no markup, so concealment is character-level only),
   which bounds `p_instr â‰¤ p_any` and scopes annotation.

## Run log â€” F1 sample, 2026-10-26

| | |
| --- | --- |
| command | `node fetch-wet-sample.js --n=300 --per-file=10 --max-files=30` |
| crawl | `CC-MAIN-2026-25` (seeded draw from the 6 most recent) |
| seed | 20261026 |
| files read | 29 of 30 |
| files skipped | 1 â€” `â€¦/segments/1780687572537.33/wet/CC-MAIN-20260610052232-20260610082232-00420.warc.wet.gz` returned HTTP 503 on all three attempts |
| records | **290** (target 300; shortfall accepted rather than changing the seed or the file list) |
| distinct domains | 275 |
| median chars | 1,480 (max 54,589) |

Shortfall handling: the protocol fixes N=300 and forbids peeking-then-extending.
Falling short by 10 records does not justify a re-draw â€” re-drawing would be
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

## Known limitations carried forward

- 0 flags of 290 means FPR is not estimable; the pre-registered rule returns K3
  rather than a decision.
- WET cannot see comments, attributes, or CSS-hidden text; frames F3/F4 remain
  unrun and are VM-only.
- One crawl, one PRNG seed, one extraction pipeline. Reported as "agent-ingest
  text", never "the web".
- Languages are not identified, only scripts.
