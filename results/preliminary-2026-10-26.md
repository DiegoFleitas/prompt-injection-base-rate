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

D2 (concealed instruction) is not measured here: it requires the human
annotation in `labels.csv` and the pre-registered rule in `scripts/analyze.js`.
