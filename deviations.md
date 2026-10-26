# Deviations and run log

Pre-registered protocol: `study-protocol.md` v1.2, frozen 2026-10-26 **before**
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

## Known limitations carried forward

- 0 flags of 290 means FPR is not estimable; the pre-registered rule returns K3
  rather than a decision.
- WET cannot see comments, attributes, or CSS-hidden text; frames F3/F4 remain
  unrun and are VM-only.
- One crawl, one PRNG seed, one extraction pipeline. Reported as "agent-ingest
  text", never "the web".
