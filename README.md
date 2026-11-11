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
"English" and the stratum is small, hence the wide interval. Those intervals
assume independent records, which they are not — 290 records over 275 domains
include mirrored pages. A **domain-clustered bootstrap** gives 11.7% (8.1–15.6),
13.9% (9.4–18.7) and 3.4% (0–8.8); that is the honest version. The same script
mix explains the `mixed-script` count (191): that heuristic fires on a
multilingual page by construction, so it describes the sample rather than a
threat. Language coverage here is a script census, not language identification —
see [`RESPONSIBLE-RESEARCH.md`](RESPONSIBLE-RESEARCH.md) for that gap and the rest
of the self-audit against the ACL-ARR responsible-research checklist, and
[`NEXT-STUDY.md`](NEXT-STUDY.md) for the frame that would actually decide the
question.

D2 (a concealed *instruction*) is measured by human adjudication of the 34
candidates against a definition frozen before data collection; see `protocol.md`
§3–4 and `results/`. The pre-registered decision rule (§6) is applied by
`scripts/analyze.js`.

### F4 frame — rendered markup, 553 job postings (2026-11-10)

F1 is plain text and cannot see CSS, comments or attributes. F4 renders the page
in headless Chromium and reads computed style, so it measures the surface the
archived extension was built for. Result
([`results/render-2026-11-10.md`](results/render-2026-11-10.md), **not
pre-registered** — see `deviations.md`):

| Channel | Docs | Prevalence (95% CI) | Instruction-shaped |
| --- | ---: | --- | ---: |
| Text not visible to a reader (computed style) | 325/553 | **58.8%** (54.6–62.8%) | **0** |
| — restricted to the job-description body | 49/553 | 8.9% (6.8–11.5%) | 0 |
| Invisible Unicode code points | 40/553 | 7.2% (5.4–9.7%) | 0 (all U+2060) |
| Attributes ≥40 alphanumerics | 194/553 | 35.1% (31.2–39.1%) | 0 |
| JSON-LD / meta description | 316 · 278/553 | 57.1% · 50.3% | 5 (all false positives) |

Concealment is five times more common on rendered markup than in extracted text
(58.8% vs 11.7%) and still carries no instruction: 5,728 concealed elements reduce
to 149 distinct strings, median 25 characters, longest 49, none instruction-shaped.
The instruction count is zero at both frames, so the mechanism, not the rate, is
what F1 got wrong.

The null is bounded by the instrument, not by the corpus: two independently
authored payload sets (144 injected cases) give 94.4% recall on the CSS
mechanisms the detector models, **0/72** on four it does not (`::before`, opaque
overlay, collapsed `<details>`, 1.5px text), and 18.8% end-to-end once the
instruction stage has to recognise the phrasing. At that sensitivity, 0/553
bounds concealed instructions at **≤2.9%** (95%), not the 0.54% a perfect
classifier would give. PPV: 1.7% for the channel alone at 1% prevalence, 25.9%
gated on instruction shape, 3.2% on a 90.5%-data-injection mix.

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
node scripts/triage.js                            # sort candidates by human-review need
# annotate labels.csv: the triaged candidates + a 30-record audit
node scripts/analyze.js                           # pre-registered K1/K2/K3 verdict
```

F4 frame (Python + Playwright; renders the page, so run it in the VM per
`scripts/f4/README.md`):

```sh
python fetch_boards.py 40                    # sample + provenance, one pass
python render_runner2.py --shard 0 --of 4    # computed-style concealment
python markup_scan.py  --shard 0 --of 4      # attributes / JSON-LD / meta / template
python analyze_render2.py && python ppv.py   # aggregates + inference
```

`triage.js` is a prioritisation aid, not a label: it writes no verdicts and the
sheets are still the thing to read. On the 2026-10-26 sample it flagged 3 of the
34 candidates for close reading and 0 smuggling-channel candidates — which is
why the annotation pass is small.

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

Whether a model is actually fooled (no model calls by design); multi-turn or
tool-loop attacks; harm. One crawl, one seed, one extraction pipeline — this is
"agent-ingest text", never "the web". The markup surfaces F1 cannot see are
covered by the F4 frame above, but only for job postings, and only with the CSS
mechanisms that frame models.

**And, measured by the sensitivity control** (`results/sensitivity-report.md`):
the detector only inspects documents that carry an invisible character, so 256
of 290 sampled documents (88.3%) had no route into D2 review at all. A visible
instruction, or one encoded in base64 or emoji, is invisible to this instrument
by construction. D2 = 0 means "the concealment channel was empty in the documents
that had one" — not "no instructions were found on the web".

## Layout

| Path | Purpose |
| --- | --- |
| `protocol.md` | frozen pre-registered design, definitions, kill criterion |
| `results/` | descriptive numbers, the narrative report, and the D2 report template |
| `RESPONSIBLE-RESEARCH.md` | self-audit against the ACL-ARR responsible-research checklist |
| `NEXT-STUDY.md` | design sketch for the frame that would decide the question (agent-fetched content, markup surfaces) |
| `deviations.md` | pre-data changes and run log |
| `scripts/` | sampler, sheet generator, summarizer, analysis, selftest |
| `scripts/sensitivity/` | positive control: constructed channels (P1) + InjecAgent and BIPIA payloads (P2/P2b), see `results/sensitivity-report.md` |
| `scripts/f4/` | rendered-concealment frame — run 2026-11-10 (553 pages); result in `results/render-2026-11-10.md`, Python implementation in `scripts/f4/python/` |
| `data/`, `sheet/`, `labels.csv` | local only, git-ignored |

## License

Code GPL-3.0 (it reuses predicates from lemon-juice's detector). Protocol and
write-up CC BY 4.0 — see `NOTICE`.
