# Responsible-research checklist

A self-audit against the **ACL Rolling Review "Responsible NLP Research"
checklist** (<https://aclrollingreview.org/responsibleNLPresearch/>), which asks
authors to answer binary questions about limitations, risks, artifacts,
experiments, annotators and AI-assistant use.

This repository is not a paper submission, so the checklist is applied as a
self-audit: every answer says where the evidence lives, and "No" or "Partial"
comes with a justification rather than a defence. Status: **Yes**, **Partial**,
**No**, **N/A**.

Last pass: 2026-10-26, after the sensitivity control
(`results/sensitivity-report.md`) was added. Every section that changed is marked
**[updated]**.

## A. For every submission

**A1. Limitations described? — Yes. [updated]** `protocol.md` §7 ("What this study
does not measure"), `results/preliminary-report.md` §3, `NEXT-STUDY.md`, and the
README's "What this does not measure". Explicitly named: no model is called; WET
cannot see comments, attributes or CSS-hidden text; one crawl, one seed, one
extraction pipeline.

The sensitivity control added a limitation that was previously implicit and is
now measured: **the detector only inspects documents that already contain an
invisible character, so 256 of 290 sampled documents (88.3%) had no route into D2
review at all**. A visible instruction, or one encoded in base64 or emoji, cannot
be flagged by this instrument. The public claim is scoped accordingly.

**A2. Risks discussed? — Partial. [updated]** Discussed in `README.md`, the
preliminary report and `results/sensitivity-report.md`:

- *Dual use.* The study characterizes where concealment appears on the web. It
  publishes aggregates only — no payloads, no raw pages, no attack tooling — so
  the information is more useful to defenders and reviewers than to attackers.
  An attacker gains nothing from "11.7% of WET records contain a BOM".
- *Third-party payloads.* The positive control uses published attack corpora
  (InjecAgent, BIPIA) under their MIT licences. The payload text is stored only in
  git-ignored `data/`, is never reprinted, and was never executed against a model
  — it is inserted into sampled documents and scanned by a local classifier. The
  report publishes counts, class names, commits and sha256 digests.
- *Interpretation risk.* The headline could be misread as "prompt injection is
  not a problem", and the sensitivity control makes the opposite misreading
  possible too ("the detector is fine"). The report states both directions: the
  instrument is a concealment-channel detector with a measured blind spot.
- *Groups affected.* Sampled pages are public web content, many in non-Latin
  scripts (79.7% of records). No demographic attributes are inferred, and no raw
  text is published, so no group is exposed to new harm by this release.

Gap: there is no formal harm assessment beyond the paragraphs above. Accepted —
the release is aggregates only.

## B. Scientific artifacts

**B1. Creators cited? — Yes. [updated]** Common Crawl (`CC-MAIN-2026-25`, WET
files, terms at <https://commoncrawl.org/terms-of-use>); OWASP LLM01: Prompt
Injection for the threat taxonomy; the ACL-ARR checklist itself for this document.
The detector used for the flag column is `lemon-juice` v0.11.0 (GPL-3.0,
referenced in the README).

Positive-control corpora, pinned by commit and recorded with sha256 in
`data/sensitivity/provenance*.json`:

- **InjecAgent** — Zhan et al., `uiuc-kang-lab/InjecAgent` @ `f19c9f2`, MIT.
- **BIPIA** — Yi et al., `microsoft/BIPIA` @ `a004b69`, MIT.
- **AgentDojo** — Debenedetti et al., `ethz-spylab/agentdojo` @ `089ed46`, MIT.
  Parsed for the record but **not used as payloads** (its payloads are Python
  f-strings over module constants that do not materialise without executing its
  code or writing an AST walker; see the sensitivity report).

**B2. Licenses / terms discussed? — Yes. [updated]** Common Crawl data is used
under its terms of use and **not redistributed**: `data/`, `sheet/` and
`labels.csv` are git-ignored. The third-party payload corpora are MIT; their
payload text stays in git-ignored `data/`, and only counts, commits and sha256
digests are published. BIPIA's benchmark contexts include CC BY-SA 4.0 material
(WikiTableQuestions, Stack Exchange); only its attack strings were used, and only
as counts. This repository's code is GPL-3.0 (it reuses predicates from a GPL-3.0
project) and its protocol/results are CC BY 4.0 — see `LICENSE` and `NOTICE`.

**B3. Intended use stated and compatible? — Yes.** Research measurement only.
No deployment, no security product, no derivative dataset published. Anyone
re-raising the numbers is asked to keep the "agent-ingest text", not "the web"
framing and the D2 caveat. There is no practical way to re-identify pages from
aggregates, and the raw sample stays local.

**B4. Checked for personal data / offensive content? — No, with justification.**
The sample is public web text and will contain names, contact details and
offensive material somewhere. No systematic PII scan was run, because **no text
is published**: results are counts, hashes are local, and the adjudication sheets
(which do show the text) never leave the machine. Commitment: if an excerpt is
ever published, it is manually reviewed and redacted first. The same rule covers
the positive-control payloads.

**B5. Artifact documentation (coverage, languages)? — Partial.** Frames,
sampling parameters, crawl, seed, domain count and character distribution are in
`results/`. A script census is reported (Han 205, Hiragana/Katakana 40, Cyrillic
19, Hangul 10, Greek 7 records; 231/290 records contain a non-Latin script).
**Languages are not identified** — script is a proxy, and it is the biggest
documentation gap in this study. The positive-control payloads are English, so
they do not validate the non-Latin stratum at all.

**B6. Relevant statistics reported? — Yes. [updated]** N, distinct domains, WET
files, character percentiles, per-mechanism record counts, Wilson 95% intervals,
the full sampling parameters, and — for the sensitivity control — per-class
detection counts, the injection design (30 documents per arm, seed `20261027`) and
Wilson intervals for both arms.

## C. Computational experiments

**C1. Parameters / compute reported? — N/A for models; Yes for compute.** No
model is used anywhere, including the positive control: payloads are inserted and
scanned by `scripts/triage.js`. Everything runs on CPU in seconds with Node.js; no
GPU, no external service.

**C2. Experimental setup / hyperparameters? — Yes. [updated]** Main study seed
`20261026`, sampling parameters (`--n=300 --per-file=10 --max-files=30`, ≥200
characters), detector version. Sensitivity control: seeds `20261026` (P1, P2/P2b
injection) and `20261027` (P2/P2b host sampling), two arms (payload verbatim vs
tag-encoded), fixed channel classes, no tuning after the fact. There is no
hyperparameter search: every parameter is fixed a priori and logged in
`deviations.md`; the one post-hoc addition (P2b) is declared as an amendment in
the sensitivity report.

**C3. Descriptive statistics and variance? — Partial. [updated]** Proportions come
with Wilson 95% intervals, but those assume independent records — and this sample
is clustered (290 records over 275 domains, with mirrored and near-duplicate
pages), so the Wilson intervals are too narrow. A **domain-clustered bootstrap**
(resampling domains, 2,000 replicas, seed `20261026`) is reported alongside:
overall 11.7% (8.1–15.6), non-Latin 13.9% (9.4–18.7), Latin-only 3.4% (0–8.8).

D2 has no rate: 0/34, with the sensitivity control showing that this is a
statement about the concealment channel, not about instruction-bearing web text.
The control itself is n=30 per arm, so its intervals are wide by design: 0/30
means "at most ~11%", 30/30 means "at least ~89%". Sampling variability **across
crawls** is still unmeasured — one crawl was used.

**C4. Existing packages reported? — Yes.** Nothing beyond the Node.js standard
library (version recorded in the run log); no NLP or ML packages. The detector is
imported from `lemon-juice` at v0.11.0. `scripts/sensitivity/` downloads the
pinned corpus files with `fetch` and parses them with `JSON.parse`; it executes no
third-party code.

## D. Human annotators / participants

**D1. Instructions reported? — N/A for participants; Yes for annotation.** No
human participants. The annotation task and label definitions are in `protocol.md`
§3–4; `make-sheet.js` emits exactly the sheet the annotator sees. The sensitivity
review page (`build-review-page` output) marks every invisible character with its
codepoint and asks one question per document.

**D2. Recruitment / payment? — No participants.** The annotator is the author,
unpaid.

**D3. Consent discussed? — N/A.** Data is public web content obtained through
Common Crawl under its terms of use; no crowdworkers, no interaction with data
subjects, no private data requested.

**D4. Ethics review? — No, determined not applicable.** No human subjects, no
intervention, no private data, no interaction with individuals. Recorded here
rather than omitted.

**D5. Annotator demographics? — Yes, trivially.** Single annotator: the author,
based in Uruguay. There is no annotator population to describe, which is itself a
limitation on the D2 judgement.

**D6. What the annotation actually covers. [updated]** Of the 34 flagged
documents, **3 were read closely and labelled benign** (`labels.csv`), and **31
matched a mechanical benign signature** (BOM at offset 0, variation selector after
an emoji, zero-width inside CJK text). The 31 were screened, not read end to end.
This is why the public sentence says "none of them used concealment to carry an
instruction" rather than "no instructions were detected": one claim is about the
channel in documents that had one, the other would be about the whole sample.

## E. AI assistants

**E1. AI-assistant use disclosed? — Yes, and it is substantial. [updated]** This
work was built with heavy AI-assistant involvement: most of the implementation
(sampler, triage, analysis, sensitivity harness), most of the first drafts of the
prose, and the sensitivity design were produced with an AI assistant; the human
author set the questions, made the scoping calls, reviewed the outputs and owns
every claim in this repository. It is disclosed here in those words rather than as
"used for drafting", because the honest description is closer to co-production.

Two constraints applied throughout, and they matter for a study about prompt
injection:

- **No sampled page text was ever given to a model**, and no payload text either.
  The safety rule in `protocol.md` §1 is the reason; adjudication is human reading
  of local files, and the sensitivity harness inserts and scans text locally.
- **Every number in `results/` is produced by the checked-in scripts**, and the
  assistant's drafts were not trusted as evidence: where a draft was wrong it is
  recorded in `deviations.md` (for example, a mis-parsed character class that
  would have reported ~100% prevalence). The human author reviewed each claim
  before it was published.

## Decision-rule applicability (A1-adjacent, recorded post hoc)

The pre-registered K1/K2 comparison in `protocol.md` §6 needs a **false-positive
rate**, and an FPR needs flags: `analyze.js` requires at least 10. On this frame
the detector flagged **0 of 290** records, so:

- the FPR is **undefined**, not small;
- K1 and K2 are therefore not just unmet but **inapplicable**;
- the returned verdict is **K3 (structural)**, and `analyze.js` says so
  explicitly rather than reporting the same "need more data" message it uses for
  a small number of flags.

This is a limitation of the decision rule, not a loophole: the rule assumed a
detector with an operating point. What it actually demonstrates is that on
agent-ingest text the tool never reaches a verdict, which is itself the finding.
A future version of the protocol should pre-register a comparator that works when
the detector is silent — for example "prevalence below the practical floor for a
human review queue" — instead of an FPR ratio.

**[updated]** The sensitivity control is the partial substitute that was available
without a new frame: it cannot produce an FPR, but it does say what the instrument
would have caught if the channel had carried anything, and it names the documents
the instrument never inspects. That is the closest this design can get to an
operating characteristic.

## Known gaps, in one place

1. **D2 is scoped, not measured across the frame.** 3 of 34 flagged documents were
   read closely, 31 screened mechanically, and 256 of 290 documents were never in
   scope for D2 at all.
2. **Visible-instruction prevalence is unmeasured.** A separate study with a
   different instrument (human reading or a classifier validated against human
   labels) is required; the sensitivity control proves this one cannot see it.
3. Languages are not identified; only scripts.
4. Sampling variability across crawls is unmeasured — one crawl, one draw.
5. No formal dual-use harm assessment beyond the A2 paragraphs.
6. No PII scan, justified by not publishing text.
7. The pre-registered K1/K2 rule is inapplicable on F1 (0 flags ⇒ no FPR); see
   "Decision-rule applicability".
8. Intervals are corrected for **domain** clustering only. Correlation inside a
   domain (near-duplicate pages from one template) is not modelled, and
   between-crawl variance is unmeasured.
9. The positive control uses English payloads from two corpora on a tool-response
   surface; it validates the mechanism, not the language or surface distribution.
