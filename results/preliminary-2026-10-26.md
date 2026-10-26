# Descriptive numbers — 2026-10-26

Frame: F1-wet (Common Crawl plain-text extraction)

| Quantity | Value |
| --- | --- |
| Records | 290 |
| Distinct domains | 275 |
| WET files | 29 |
| Characters (p50 / p90 / max) | 1480 / 5616 / 54589 |
| **D1 — records with an invisible code point** | **34/290 = 11.7%** (95% CI 8.5–15.9%) |
| Detector flagged at suspicious or worse | 0/290 = 0% (95% CI 0–1.3%) |

Per-record mechanism counts:

| Mechanism | Records |
| --- | ---: |
| `BOM` | 17 |
| `ZWSP` | 9 |
| `VS` | 6 |
| `WJ` | 1 |
| `DEFAULT-IGNORABLE` | 1 |

Detector verdicts: clean 93, noise 197

Detector finding types: mixed-script 191, invisible 28, encoded-spaced-hex 1

## Language coverage (script census)

Scripts, not languages: a cheap proxy for what the sample covers.

Records containing a non-Latin script: **231/290 = 79.7%**

| Script | Records |
| --- | ---: |
| Han | 205 |
| Hiragana/Katakana | 40 |
| Cyrillic | 19 |
| Hangul | 10 |
| Greek | 7 |

This multilingual sample matters for reading the detector column: a
mixed-script heuristic fires on a multilingual page by construction, so its
rate here says more about the sample's script mix than about threats.

### D1 stratified by script

The aggregate hides a split: concealment is far more common in the non-Latin
half of the sample, so the headline overstates what a Latin-script pipeline
typically meets.

| Stratum | n | D1 | Prevalence |
| --- | ---: | ---: | --- |
| non-Latin script | 231 | 32 | 13.9% (95% CI 10–18.9%) |
| Latin-only | 59 | 2 | 3.4% (95% CI 0.9–11.5%) |

### Intervals that account for clustering

The Wilson intervals above assume the 290 records are independent. They are
not: the sample holds 275 domains and includes mirrored or near-duplicate
pages, so those intervals are too narrow. Resampling **domains** (not records)
for a 95% interval:

| Stratum | Domains | Prevalence | Clustered 95% CI |
| --- | ---: | ---: | --- |
| overall | 275 | 11.7% | 8.1–15.6% |
| non-Latin script | 220 | 13.9% | 9.4–18.7% |
| Latin-only | 55 | 3.4% | 0–8.8% |

Bootstrap: 2000 replicas, seed 20261026. Same seed, same
interval — the number does not move between runs.

D2 (concealed instruction) is not measured here: it requires the human
annotation in `labels.csv` and the pre-registered rule in `scripts/analyze.js`.
