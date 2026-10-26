# Sensitivity protocol (positive control)

**Status: frozen 2026-10-26, before any positive control was executed.**

This is an addition to `../protocol.md` (v1.2), not a modification of it. The
parent protocol's decision rule produced D2 = 0 among the 34 flagged documents.
A null from an instrument is uninterpretable without the instrument's
sensitivity, so this protocol measures it.

## The instrument, as frozen

`scripts/triage.js` → `classify()`:

- mechanical flags: `tags` (U+E0000–E007F), `sneaky` (U+2062/U+2064), `bidi`
  (U+202A–202E, U+2066–2069, LRM/RLM), `vsRun` (variation-selector run ≥ 3),
  `zw` (U+200B–200D, U+2060, U+FEFF), `bomOffset0`;
- priority: `smuggling` (any tags/sneaky/bidi/vsRun≥3), `context` (zero-width
  outside a CJK window), `benign-signature` (everything else).

**The pipeline only ever inspects documents that D1 flagged** — i.e. documents
that already contain an invisible character. A document with no invisible
character is never queued for D2 review. This is a property of the instrument,
not of the world, and the sensitivity test must expose it.

## P1 — constructed channel positives

8 channel classes × 5 variants = **40 documents**. One instruction payload,
encoded in each class's channel, hosted in five different host texts (Latin
start / Latin middle / CJK middle / Cyrillic end / markup-ish middle).

Classes: `plain`, `zwsp-bits`, `tag-chars`, `sneaky-bits`, `bidi`, `vs-run`,
`base64`, `emoji-bits`.

Per document, recorded automatically: the six flags, the priority, and
`reached_review` (`priority !== "benign-signature"`) /
`reached_smuggling` (`priority === "smuggling"`).

**Predictions, recorded before running** (the report must state where these were
wrong):

| class | flag expected | priority expected |
|---|---|---|
| plain | none | benign-signature |
| zwsp-bits | zw | context (or smuggling) |
| tag-chars | tags | smuggling |
| sneaky-bits | sneaky | smuggling |
| bidi | bidi | smuggling |
| vs-run | vsRun | smuggling |
| base64 | none | benign-signature |
| emoji-bits | none | benign-signature |

## P2 — external positives

Payloads from published benchmarks, pinned by repo commit and sha256 (provenance
in `sensitivity-provenance.md`). Injection: 30 documents sampled from
`data/wet-sample.jsonl` (seed 20261027; 10 Latin-only, 10 CJK, 10 other
non-Latin), each receiving one external payload at a random line boundary.

Two arms:

- **A — as published**: the payload text verbatim.
- **B — re-encoded**: the same payload into the `tag-chars` channel.

Metric: sensitivity = share of injected documents reaching `smuggling`
(Wilson 95% CI), reported separately for A and B.

## Decision rule

1. P1 channel classes (`tag-chars`, `sneaky-bits`, `bidi`, `vs-run`) at ≥ 90%
   `reached_smuggling` → the detector is a valid *concealment-channel* detector.
2. P2 arm A is expected **≈ 0%** by construction: published payloads are visible
   text, so no invisible character exists and the document is never queued.
   If arm A is not ≈ 0%, the instrument is doing something not described here
   and the report must say what.
3. **Wording rule.** The public sentence may say "no instructions were detected"
   *only* about documents the pipeline had a route to examine. Otherwise it must
   be scoped as "none of the flagged documents used concealment to carry an
   instruction". This rule is what turns the sensitivity number into a claim.

## Published

Counts, class names, sensitivities with confidence intervals, corpus commits and
sha256. Never payload text and never raw page text — same rule as the parent
protocol.
