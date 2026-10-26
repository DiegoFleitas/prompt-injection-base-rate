# prompt-injection-base-rate

How often does real ingested web text contain a **concealed instruction addressed
to a model** — and is that rarer or more common than a detector's false-positive
rate?

This repository measures it. It exists because a browser extension
([lemon-juice](https://github.com/DiegoFleitas/lemon-juice), now archived) was
built to flag concealed prompt injection, and nobody had checked whether the
threat it targeted was common enough to justify the tool. It wasn't — see
[the result](#result) and the postmortem linked from that repository.

## Result

F1 frame — 290 plain-text extractions from Common Crawl (`CC-MAIN-2026-25`,
29 WET files, 275 domains, seed `20261026`):

| Quantity | Value |
| --- | --- |
| Records with ≥1 invisible code point (D1) | **34 / 290 = 11.7%** (95% CI 8.5–15.9%) |
| Detector flagged at `suspicious` or worse | **0 / 290** (95% CI 0.0–1.3%) |
| Detector verdicts | 93 clean, 197 `noise` |
| Dominant finding type | `mixed-script` (191 of 290 records) |

The 34 D1 records are almost entirely benign mechanisms: 17 BOMs, 9 zero-width
spaces used for CJK line-breaking, 6 emoji variation selectors, 1 word joiner,
and one Hangul filler. No Tags-block payloads, no smuggling channels, no bidi
overrides.

**Concealment is a property of the web, not a signal of an attack.** A detector
keyed on it has no operating point on real traffic: it is either silent or it is
reporting that a page is not monolingual Latin.

One caveat that explains the last row of the table, and that materially changes how
the headline should be read: the sample is multilingual — **231 of 290 records
(79.7%) contain a non-Latin script**, mostly Han (205) — and concealment is
concentrated in that half. Stratified:

| Stratum | n | D1 records | Prevalence |
| --- | ---: | ---: | --- |
| non-Latin script | 231 | 32 | 13.9% (95% CI 10–18.9%) |
| Latin-only | 59 | 2 | 3.4% (95% CI 0.9–11.5%) |

So the headline 11.7% overstates what a Latin-script pipeline meets; **3.4% is
the closer number for an English-language agent**, though "Latin script" is not
"English" and the stratum is small, hence the wide interval. The same script mix
explains the `mixed-script` count (191): that heuristic fires on a multilingual
page by construction, so it describes the sample rather than a threat. Language
coverage here is a script census, not language identification — see
[`RESPONSIBLE-RESEARCH.md`](RESPONSIBLE-RESEARCH.md) for that gap and the rest of
the self-audit against the ACL-ARR responsible-research checklist.

D2 (a concealed *instruction*) is measured by human adjudication of the 34
candidates against a definition frozen before data collection; see `protocol.md`
§3–4 and `results/`. The pre-registered decision rule (§6) is applied by
`scripts/analyze.js`.

## Method in one paragraph

Common Crawl WET is plain-text extraction of real pages — approximately what a
text-extraction agent pipeline ingests. Records are sampled deterministically
(seeded crawl draw, 30 files, ≤10 records each, ≥200 characters), classified
mechanically for invisible code points, and then adjudicated by a human against
a definition fixed before any data was collected. The protocol is frozen;
pre-data changes are logged in `deviations.md`.

## Reproduce

```sh
node scripts/selftest.js                          # classifier + interval maths
node scripts/fetch-wet-sample.js --n=300 --per-file=10 --max-files=30
node scripts/make-sheet.js                        # sheets + flags + candidates
node scripts/summarize.js                         # descriptive numbers (no labels)
# annotate labels.csv: 34 candidates + a 30-record audit
node scripts/analyze.js                           # pre-registered K1/K2/K3 verdict
```

No model is called, anywhere. No network beyond fetching the corpus files. No
raw page text is published: `data/` and `sheet/` are git-ignored, and results are
aggregates.

## Safety rules (from `protocol.md` §1)

1. **Never paste sampled content into a tool-enabled model or agent.** The
   payloads are instructions; that is the one move here that can cause harm.
2. Fetch once, scan offline; no live rendering in a normal browser profile.
3. The VM is only for deferred frames (raw HTML, CSS-hidden layout).
4. No auth-gated pages, no PII, no attachments.
5. Publish aggregates and hashes, never raw pages.

## What this does not measure

Whether a model is actually fooled (no model calls by design); CSS-hidden,
comment or attribute concealment in F1 (WET is text, not DOM); multi-turn or
tool-loop attacks; harm. One crawl, one seed, one extraction pipeline — this is
"agent-ingest text", never "the web".

## Layout

| Path | Purpose |
| --- | --- |
| `protocol.md` | frozen pre-registered design, definitions, kill criterion |
| `results/` | descriptive numbers, the narrative report, and the D2 report template |
| `RESPONSIBLE-RESEARCH.md` | self-audit against the ACL-ARR responsible-research checklist |
| `deviations.md` | pre-data changes and run log |
| `scripts/` | sampler, sheet generator, summarizer, analysis, selftest |
| `scripts/f4/` | **scaffold, unrun**: rendered-concealment frame (VM + Playwright) |
| `data/`, `sheet/`, `labels.csv` | local only, git-ignored |

## License

Code GPL-3.0 (it reuses predicates from lemon-juice's detector). Protocol and
write-up CC BY 4.0 — see `NOTICE`.
