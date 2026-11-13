# prompt-injection-base-rate

How often does real ingested web text contain a **concealed instruction addressed
to a model** — and is that rarer or more common than a detector's false-positive
rate?

This repository measures it. It exists because a browser extension
([lemon-juice](https://github.com/DiegoFleitas/lemon-juice), now archived) was
built to flag concealed prompt injection, and nobody had checked whether the
threat it targeted was common enough to justify the tool. It wasn't — see
[the result](#result) and the postmortem linked from that repository.

## In one screen

**Answer.** In 290 crawled documents, 34 (11.7%) carried an invisible code point.
None of the 3 read end to end carried an instruction; the other 31 matched a benign
mechanism signature (BOM at offset 0, zero-width inside a CJK run, VS16 after an
emoji, word joiner, filler), which is a screen, not a reading. The detector fired
on 0 of 290. Concealment is a property of the web; it is not a signal of an attack.

**Scope.** This is not a base rate for prompt injection. The instrument opens
only documents that contain an invisible character (256 of 290 were never
examined), and it cannot see a visible instruction, base64, emoji encoding,
comments, attributes or CSS. F4 covers the markup surfaces, but only on 553 job
postings, and it is exploratory.

**Evidence tiers.** F1 is pre-registered (`protocol.md`); the sensitivity control
is a post-hoc addition (`results/sensitivity-report.md`); F4 is exploratory
(`deviations.md`); F5 is pre-registered (`protocol-f5.md`, frozen before any
message body was decoded) and publishes its mechanism counts with the instruction
rate **unmeasured**.

## Result

F1 frame — 290 plain-text extractions from Common Crawl (`CC-MAIN-2026-25`,
29 WET files, 275 domains, seed `20261026`):

| Quantity | Value |
| --- | --- |
| Records with ≥1 invisible code point (D1) | **34 / 290 = 11.7%** (95% CI 8.5–15.9%) |
| Candidates read end to end | 3 / 34 |
| — of which D2 | **0 / 3** (one-sided 95% UB 63.2%) |
| Candidates screened by a benign mechanism signature | 31 / 34 |
| **D2 — concealed instruction, all 34 candidates** | **0 / 34** (one-sided 95% UB 8.4%) |
| Detector flagged at `suspicious` or worse | **0 / 290** (95% CI 0.0–1.0%) |
| Detector verdicts | 93 clean, 197 `noise` |
| Dominant finding type | `mixed-script` (191 of 290 records) |

Intervals for zero counts are one-sided exact Clopper–Pearson throughout, the
convention already used by F4: `0/290 → 1.0%`, `0/34 → 8.4%`, `0/3 → 63.2%`
(rule-of-three cross-checks: 1.0% and 8.8%; at 0/3 it is 100% and carries no
information). The detector-flag row records what the tool did on the sample; it is
not a prevalence of instructions. The denominator for an instruction rate is the
34 documents where concealment could exist, not the 290 — and `0/34` treats the 31
signature-screened candidates as negative. Only 3 of the 34 were read closely; see
[`results/d2-report.md`](results/d2-report.md).

The 34 D1 records by dominant mechanism: 17 BOM, 9 zero-width space, 6 emoji
variation selector, 1 word joiner, one Hangul filler. No Tags-block payloads, no
smuggling channels, no bidi overrides.

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

D2 (a concealed *instruction*) is a human judgement against a definition frozen
before data collection (`protocol.md` §3–4). It was applied to the 3 candidates
that matched no benign mechanism signature, and all 3 were negative. The other 31
matched a signature that explains every invisible character (BOM at offset 0,
zero-width inside a CJK run, VS16 after an emoji, word joiner, or one filler) and
were screened by that signature rather than read. D2 = 0/34 is therefore
conditional on the screen, and 0/3 read closely has a one-sided 95% upper bound of
63.2% — the null is a statement about the channel, not a precise rate. Coverage and
the labelling gaps are in [`results/d2-report.md`](results/d2-report.md); the
pre-registered decision rule (§6) is applied by `scripts/analyze.js`.

### F4 frame — rendered markup, 553 job postings (2026-11-10, exploratory)

F1 is plain text and cannot see CSS, comments or attributes. F4 renders the page
in headless Chromium and reads computed style, so it measures the surface the
archived extension was built for. It is **exploratory, not pre-registered** —
designed, run and written up in one pass on 553 postings from 14 employers and
three ATS families, i.e. content an agent screens, not a sample of the web. Result
([`results/render-2026-11-10.md`](results/render-2026-11-10.md); deviations in
[`deviations.md`](deviations.md#run-log--f4-sample-2026-11-10-not-pre-registered)):

| Channel | Docs | Prevalence (95% CI) | Instruction-shaped |
| --- | ---: | --- | ---: |
| Text not visible to a reader (computed style) | 325/553 | **58.8%** (54.6–62.8%) | **0** |
| — restricted to the job-description body | 49/553 | 8.9% (6.8–11.5%) | 0 |
| Invisible Unicode code points | 40/553 | 7.2% (5.4–9.7%) | 0 (all U+2060) |
| Attributes ≥40 alphanumerics | 194/553 | 35.1% (31.2–39.1%) | 0 |
| JSON-LD / meta description | 316 · 278/553 | 57.1% · 50.3% | 5 (all false positives) |

Concealment is far more common on rendered markup than in extracted text (58.8% vs
11.7%), but the two are not like-for-like: different populations (job postings vs a
crawl), different units (pages vs WET records) and different channels (CSS state vs
invisible Unicode). Neither carries an instruction: 5,728 concealed elements reduce
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

### F5 frame — job-related mail on disk, 1,338 messages (2026-11-13, pre-registered)

F1 and F4 sample what an agent reads from the web. F5 asks the same question of
mail an agent would read on the user's behalf: 1,005 messages from a Thunderbird
`Trabajo` mbox plus 385 `.eml` job alerts, deduplicated by `Message-ID` to
**1,338** unique messages from 48 sender addresses. Everything is processed
locally — no body reached a model, and no text is published
([`protocol-f5.md`](protocol-f5.md), [`results/f5-2026-11-13.md`](results/f5-2026-11-13.md)).

| Quantity | Value |
| --- | --- |
| Unique messages after dedup | 1,338 (1,390 read, 52 in both sources) |
| Eligible, self-sent excluded | 1,321 over 47 sender clusters |
| D1 — ≥1 invisible code point, message level | **653 / 1,321 = 49.4%** |
| — sender-clustered 95% interval | **21.7–86.5%** (two senders own 65% of messages) |
| — `text/html` source channel | 644 / 1,321 = 48.8% |
| — `text/plain` body | **11 / 1,321 = 0.83%** |
| Primary window 2023-01 → 2026-07 | 559 / 714 = 78.3% |
| Stratum 2018-05 → 2022-12 | 94 / 607 = 15.5% |
| E1 machine-only surfaces (alt, comments, `display:none`, tracking) | 1,290 / 1,321 = 97.7% |
| D2 — concealed instruction | **unmeasured** |

The mechanism split is the result: invisible characters live in the HTML source of
mail templates (BOM, bidi marks, ZWJ/ZWNJ) and almost never in the body text a
reader sees — 48.8% against 0.83%. The message-level rate is not usable as a
prevalence: two senders account for 65% of the corpus and the sender-clustered
interval says so. The era gap holds inside both sources (77.2% vs 15.5% in the
mbox alone) but spans 41 sender clusters against 9, so it is reported as a
stratification, not a trend.

The positives are a template property, not a message property: the `smuggling`
class (109 records) is a **single** sender, `context` (87) is 5 senders, and
`benign-signature` (457) is 12, one of which owns 317. The report publishes that
table (`## Where the positives sit`) so the headline rate cannot be read as a
statement about mail in general, and so the annotation pass is priced per sender
rather than per message.

D2 was not adjudicated. The protocol requires a human reading pass over the 109
`smuggling` candidates, and that pass was not run. The report says `unmeasured`
rather than 0, because those are different claims: one is a bound, the other is a
reading nobody did. The pack for that pass (`data/f5/pack-10min.md`, local-only)
is cut from the triage sheets and shows one record per sender with the flagged
characters in context.

## Method in one paragraph

Common Crawl WET is plain-text extraction of real pages — approximately what a
text-extraction agent pipeline ingests. Records are sampled deterministically
(seeded crawl draw, 30 files, ≤10 records each, ≥200 characters) and classified
mechanically for invisible code points, which leaves 34 candidates. Those were
triaged: 31 match a benign mechanism signature (BOM at offset 0, zero-width inside
a CJK run, VS16 after an emoji, word joiner, one filler) that accounts for every
invisible character in them, and the 3 that match none were read end to end against
a definition fixed before data was collected. One annotator (the author); the
planned 30-record D1 audit and the 10% re-label were not executed — recorded in
[`deviations.md`](deviations.md) and [`results/d2-report.md`](results/d2-report.md).
The protocol is frozen; pre-data changes are logged in `deviations.md`.

## Reproduce

```sh
node scripts/selftest.js                          # classifier + interval maths
node scripts/fetch-wet-sample.js --n=300 --per-file=10 --max-files=30
node scripts/make-sheet.js                        # sheets + flags + candidates
node scripts/summarize.js                         # descriptive numbers (no labels)
node scripts/triage.js                            # sort candidates by human-review need
# annotate labels.csv: the triaged candidates + a 30-record audit
node scripts/analyze.js                           # K3 verdict; fails closed while candidates are unlabelled
```

F4 frame (Python + Playwright; renders the page, so run it in the VM per
`scripts/f4/README.md`):

```sh
python fetch_boards.py 40                    # sample + provenance, one pass
python render_runner2.py --shard 0 --of 4    # computed-style concealment
python markup_scan.py  --shard 0 --of 4      # attributes / JSON-LD / meta / template
python analyze_render2.py && python ppv.py   # aggregates + inference
```

F5 frame (mail; local-only, no network, no model — every command reads
`data/f5/`, which is git-ignored):

```sh
python scripts/f5/manifest.py --root=data/f5/corpus --out=data/f5/corpus-manifest.csv \
  --salt=data/f5/salt.txt --self=data/f5/self-addresses.txt --corpus-sha256=data/f5/corpus.sha256
python scripts/f5/extract_eml.py --root=data/f5/corpus --out=data/f5/text \
  --index=data/f5/index.csv --salt=data/f5/salt.txt --self=data/f5/self-addresses.txt
python -m unittest discover -s tests/f5 -t . -v     # 6 python tests
node --test tests/f5/make_sheet.test.js               # 6 sheet-excerpt tests
node scripts/f5/selftest.js                          # wiring + interval maths
node scripts/f5/scan_eml.js --text=data/f5/text --out=data/f5/flags.csv
node scripts/f5/make_sheet.js --text=data/f5/text --flags=data/f5/flags.csv \
  --out=data/f5/sheet --csv=data/f5/triage.csv --labels=data/f5/labels.csv
node scripts/f5/make_pack.js --n=7                    # data/f5/pack-10min.md
node scripts/f5/apply_labels.js --answers="A=B,B=U"    # human letters -> labels.csv
node scripts/f5/analyze_eml.js --manifest=data/f5/corpus-manifest.csv \
  --flags=data/f5/flags.csv --out=results/f5-2026-11-13.md \
  --json=results/f5-2026-11-13.summary.json
```

The manifest verifies with `cd data/f5/corpus && sha256sum -c ../corpus.sha256`
(894/894 OK). Analysis is deterministic: rerunning it reproduces
`results/f5-2026-11-13.summary.json` byte for byte (2,000-replica bootstrap, seed
`20261113`).

`analyze_eml.js` reads `data/f5/labels.csv` (`--labels=`, default path). With no
`0`/`1` in the D2 column the report prints `unmeasured`; with some it prints
`partial (n of 653)` and the zero-hit bound for that n, and the frame stays
`unmeasured` because §8's two denominators are not complete. Only a human writes
that file: the script never guesses a label, and a blank cell is never read as
zero.

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
mechanisms that frame models. F5 adds one inbox to that list: 47 sender clusters,
mail already on one disk, HTML judged as source rather than rendered, and an
instruction rate that was **not measured** rather than measured at zero.

**And, measured by the sensitivity control** (`results/sensitivity-report.md`):
the detector only inspects documents that carry an invisible character, so 256
of 290 sampled documents (88.3%) had no route into D2 review at all. A visible
instruction, or one encoded in base64 or emoji, is invisible to this instrument
by construction. D2 = 0 means "the concealment channel was empty in the documents
that had one" — not "no instructions were found on the web".

## How this was made

**AI assistance.** Most of the implementation and most first drafts of the prose
were produced with an AI assistant; the disclosure is in
[`RESPONSIBLE-RESEARCH.md`](RESPONSIBLE-RESEARCH.md) section E1, in the author's
words. The author set the questions, made the scoping calls and owns every claim;
numbers were recomputed from the local data before publication, and the drafts were
not treated as evidence. The prose style is a consequence of that process; it is not
evidence either way about the numbers.

**Annotation.** One annotator, the author, unpaid; no second opinion and no
inter-annotator agreement. Protocol §4's 30-record D1 audit and 10% same-annotator
re-label were not executed. Both gaps are in `deviations.md` and
`RESPONSIBLE-RESEARCH.md` section D6, and they bound what D2 = 0 can mean.

## How to cite

F1 (pre-registered): "34 of 290 Common Crawl records contained an invisible code
point (11.7%); the concealment channel carried no instruction in the 34 documents
where it could exist (3 read closely, 31 screened by a benign mechanism signature;
0/3, one-sided 95% upper bound 63.2%)." Do not shorten it to "no prompt injection
in 290 pages".

F4 (exploratory): "553 job postings from 14 employers across three ATS families;
0 concealed instructions found; the ≤2.9% figure is a sensitivity-adjusted upper
bound, not a prevalence estimate." It must not be cited as a web-wide rate.

`CITATION.cff` carries the same caveat in repository metadata.

## Layout

| Path | Purpose |
| --- | --- |
| `protocol.md` | frozen pre-registered design, definitions, kill criterion |
| `results/` | descriptive numbers, the narrative reports, and D2 coverage |
| `results/d2-report.md` | D2 coverage: what was read, what was signature-screened, what was not labelled |
| `CITATION.cff` | citation metadata, including the exploratory-F4 caveat |
| `RESPONSIBLE-RESEARCH.md` | self-audit against the ACL-ARR responsible-research checklist |
| `NEXT-STUDY.md` | design sketch for the frame that would decide the question (agent-fetched content, markup surfaces) |
| `deviations.md` | pre-data changes and run log |
| `scripts/` | sampler, sheet generator, summarizer, analysis, selftest |
| `scripts/sensitivity/` | positive control: constructed channels (P1) + InjecAgent and BIPIA payloads (P2/P2b), see `results/sensitivity-report.md` |
| `scripts/f4/` | rendered-concealment frame — run 2026-11-10 (553 pages); result in `results/render-2026-11-10.md`, Python implementation in `scripts/f4/python/` |
| `protocol-f5.md` | F5 mail frame, frozen 2026-11-13 before any body was decoded |
| `scripts/f5/` | mail frame: manifest, MIME extractor, scanner, sheet, analysis |
| `results/f5-2026-11-13.md` | F5 mechanism counts and clustered intervals; D2 unmeasured |
| `data/`, `sheet/`, `labels.csv` | local only, git-ignored |

## License

Code GPL-3.0 (it reuses predicates from lemon-juice's detector). Protocol and
write-up CC BY 4.0 — see `NOTICE`.
