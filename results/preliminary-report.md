# Preliminary report â€” descriptive only (no human labels yet)

**Status:** descriptive. This is **not** the pre-registered decision. The decision
needs the 34 candidate records adjudicated for D2 (see Â§4). Numbers here are
mechanical (D1) or the detector's own output.

**Sample:** F1 agent-ingest frame. Common Crawl `CC-MAIN-2026-25`, 29 WET files
(one skipped after retries â€” HTTP 503), 10 records per file, seed `20261026`.
**290 records, 275 distinct domains**, median 1,480 characters (max 54,589).
Per protocol Â§9: the earlier 300-record single-file run is discarded.

## 1. Concealment mechanisms are common â€” and mostly legitimate

| Quantity | Value |
| --- | --- |
| Records with â‰¥1 invisible code point (D1) | **34 / 290 = 11.7%** (95% CI 8.5â€“15.9%) |
| Detector flagged at `suspicious` or worse | **0 / 290** (95% CI 0.0â€“1.3%) |
| Verdict `clean` | 93 (32.1%) |
| Verdict `noise` | 197 (67.9%) |

What the 34 D1 records actually contain:

| Mechanism | Records | Benign explanation |
| --- | ---: | --- |
| `U+FEFF` BOM | 17 | document start marker; not concealment |
| `U+200B` ZWSP | 9 | CJK line-breaking; common in real text |
| `U+FE0F` VS16 | 6 | emoji presentation selector |
| `U+2060` WORD JOINER | 1 | rendering control |
| `U+3164` HANGUL FILLER | 1 | the only one that looks like deliberate invisible text |

No Tags-block, no variation-selector *smuggling* payloads, no sneaky-bits, no bidi
overrides. The mechanisms whose only plausible purpose is concealment are absent
from this sample.

## 2. The detector has no operating point on real text

- **0 of 290 pages reach verdict level.** On random agent-ingest text, the tool
  is silent at `suspicious`+.
- **68% land in `noise`**, and the dominant finding is `mixed-script` (191 of 290
  records). That finding means "this page is not monolingual Latin script" â€” which
  on the international web is normal, not suspicious.
- Other finding types: `invisible` (28), `encoded-spaced-hex` (1).

Read plainly: on real traffic the tool either says nothing or says *"this page is
multilingual"*. That is a specificity problem in the noise tier, not a
false-positive problem at the verdict tier â€” the verdict tier simply never fires.

## 3. What this does not conclude

- **D2 is not measured.** Whether any of the 34 concealed spots carries an
  instruction addressed to a model is exactly what the annotation decides. The
  mechanisms present make D2 = 0 plausible, but "plausible" is not measured.
- **FPR is not estimable** at 0 flags (protocol Â§9.1), so the K1/K2 comparison
  cannot be run yet. Current pre-registered status: **K3 â€” inconclusive**.
- WET is text extraction: HTML comments, attributes and CSS-hidden text are
  invisible to this frame *by construction*. The CSS-hidden frame (F4) is still
  unmeasured.
- One crawl, one PRNG seed, one extraction pipeline. This is a sample of
  agent-ingest text, not "the web".

## 4. What remains (the part only a human can do)

~30â€“45 minutes of reading:

1. **Adjudicate the 34 candidates** â€” `data/d1-candidates.csv` lists them; each
   has a sheet in `sheet/<id>.txt` with invisible characters marked `âŸ¦ZWSP:U+200BâŸ§`.
   For each: is there a concealed *instruction* (D2), a directive with no action
   (D3), and which action class?
2. **Audit 30 random non-candidates** for classifier misses (D1 is mechanical; a
   miss here would mean D1 is undercounted). `labels.csv` has all 290 rows;
   fill the 34 + 30, leave the rest blank.
3. **Then** run `node scripts/analyze.js`. It joins labels with `data/detector-flags.csv`
   and applies the pre-registered K1/K2/K3 rule. Do not open the flags file
   before finishing step 1.

Expected outcome, stated in advance so it cannot be reinterpreted later: with D2
near zero, the pre-registered rule returns **K3** (FPR not estimable), and the
*descriptive* result in Â§2 is what argues against the consumer-protection
framing. If D2 turns out non-trivial, that changes the decision and the report
will say so.
