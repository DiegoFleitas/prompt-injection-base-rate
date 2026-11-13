# D2 report — what was read, what was screened

**Status: descriptive, single annotator (the author), no second opinion.** This is
the document `README.md` refers to for D2. Definitions are frozen in
[`../protocol.md`](../protocol.md) §3–4; the deviations are in
[`../deviations.md`](../deviations.md). Aggregates only: no page text appears here.

## Coverage

| Quantity | Value |
| --- | ---: |
| F1 records | 290 |
| Documents with ≥1 invisible code point (D1 candidates) | 34 |
| Candidates read end to end | **3** |
| Candidates screened by a benign mechanism signature | 31 |
| Candidates labelled `d2 = 1` | 0 |
| Non-candidate records audit-labelled (protocol §4 planned 30) | **0** |
| Records re-labelled ≥24 h apart (protocol §4 planned 10%) | **0** |

The 3 read are the candidates whose invisible characters matched no benign
signature (triaged `context`): 3 BOMs mid-text on a municipal page, 1 word joiner
in second-person marketing prose, and 1 zero-width space in Polish spam. All three
were labelled `d1 = 1, d2 = 0, d3 = 0`, confidence high, in `labels.csv`.

The 31 screened carry 89 invisible characters between them — 13 records with one,
8 with two, 4 with three, 3 with five, and one each with 18, 8 and 7. The triage
grouped them as: zero-width inside a CJK run (24), VS16 after an emoji (6), and one
record where the rule found only a mechanism (2 characters). None was read end to
end; the classification is a signature match, not a reading.

## Result

| Quantity | Value |
| --- | --- |
| D2 among the 3 read end to end | **0/3** — one-sided 95% UB **63.2%** |
| D2 among all 34 candidates | **0/34** — one-sided 95% UB **8.4%** (conditional) |
| D3 (directive, no action) | 0/3 labelled |
| Detector flags at `suspicious` or worse | 0/290 |

The `0/34` figure treats the 31 signature-screened candidates as negative. That is
an argument from mechanism, not from reading. If only the three close reads count,
the bound is 63.2% and the null says almost nothing about instruction prevalence.

**Residual risk in the screen.** One screened record carries 18 VS16 variation
selectors. Variation-selector runs are a documented smuggling channel; this one is
classified benign because each selector follows an emoji, which is the standard
emoji-presentation use. It was not read end to end. A reviewer who does not accept
that signature should treat D2 as `0/3`, not `0/34`.

## Decision rule

`scripts/analyze.js` returns **K3 (structural)**: the detector flagged 0 of 290
records, so the false-positive rate is undefined and K1/K2 cannot be evaluated.
That is a limitation of the pre-registered rule, not evidence for either framing.

## What this does not establish

- **No visible-instruction prevalence.** The pipeline never inspects 256 of 290
  records (`results/sensitivity-report.md`).
- **No D1 audit.** A classifier miss in the 256 unlabelled records would raise the
  11.7% prevalence; the planned 30-row audit was not executed.
- **No agreement statistic.** One annotator, no κ, no self-consistency check.
- **Not "the web".** One crawl, one seed, one extraction pipeline.

## Provenance

Numbers recomputed on 2026-11-13 from `labels.csv` (3 rows), `data/triage.csv`
(34 candidates: 3 `context`, 31 `benign-signature`) and `data/d1-candidates.csv`
(34 rows). Those files and `data/` stay local; this report carries counts only.
