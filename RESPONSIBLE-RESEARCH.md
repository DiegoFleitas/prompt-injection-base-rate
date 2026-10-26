# Responsible-research checklist

A self-audit against the **ACL Rolling Review "Responsible NLP Research"
checklist** (<https://aclrollingreview.org/responsibleNLPresearch/>), which asks
authors to answer binary questions about limitations, risks, artifacts,
experiments, annotators and AI-assistant use.

This repository is not a paper submission, so the checklist is applied as a
self-audit: every answer says where the evidence lives, and "No" or "Partial"
comes with a justification rather than a defence. Status: **Yes**, **Partial**,
**No**, **N/A**.

## A. For every submission

**A1. Limitations described? — Yes.** `protocol.md` §7 ("What this study does not
measure"), `results/preliminary-report.md` §3, and the README's "What this does
not measure". Explicitly named: no model is called; WET cannot see comments,
attributes or CSS-hidden text; one crawl, one seed, one extraction pipeline;
D2 unmeasured until annotation.

**A2. Risks discussed? — Partial.** Discussed in `README.md` and the preliminary
report:

- *Dual use.* The study characterizes where concealment appears on the web. It
  publishes aggregates only — no payloads, no raw pages, no attack tooling — so
  the information is more useful to defenders and reviewers than to attackers.
  An attacker gains nothing from "11.7% of WET records contain a BOM".
- *Interpretation risk.* The headline could be misread as "prompt injection is
  not a problem". The report separates mechanism from attack every time it
  reports a number, and the decision rule is pre-registered.
- *Groups affected.* Sampled pages are public web content, many in non-Latin
  scripts (79.7% of records). No demographic attributes are inferred, and no raw
  text is published, so no group is exposed to new harm by this release.

Gap: there is no formal harm assessment beyond the paragraphs above. Accepted —
the release is aggregates only.

## B. Scientific artifacts

**B1. Creators cited? — Yes.** Common Crawl (`CC-MAIN-2026-25`, WET files, terms
at <https://commoncrawl.org/terms-of-use>); OWASP LLM01: Prompt Injection for the
threat taxonomy; the ACL-ARR checklist itself for this document. The detector
used for the flag column is `lemon-juice` v0.11.0 (GPL-3.0, referenced in the
README).

**B2. Licenses / terms discussed? — Yes.** Common Crawl data is used under its
terms of use and **not redistributed**: `data/`, `sheet/` and `labels.csv` are
git-ignored. This repository's code is GPL-3.0 (it reuses predicates from a
GPL-3.0 project) and its protocol/results are CC BY 4.0 — see `LICENSE` and
`NOTICE`.

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
ever published, it is manually reviewed and redacted first.

**B5. Artifact documentation (coverage, languages)? — Partial.** Frames,
sampling parameters, crawl, seed, domain count and character distribution are in
`results/`. A script census is now reported (Han 205, Hiragana/Katakana 40,
Cyrillic 19, Hangul 10, Greek 7 records; 231/290 records contain a non-Latin
script). **Languages are not identified** — script is a proxy, and it is the
biggest documentation gap in this study.

**B6. Relevant statistics reported? — Yes.** N, distinct domains, WET files,
character percentiles, per-mechanism record counts, Wilson 95% intervals, and the
full sampling parameters (N, per-file cap, max files, minimum characters, seed).
No train/dev/test splits: there is no model and no training.

## C. Computational experiments

**C1. Parameters / compute reported? — N/A for models; Yes for compute.** No
model is used. The analysis runs on CPU in seconds with Node.js; no GPU, no
external service.

**C2. Experimental setup / hyperparameters? — Yes.** Seed `20261026`, sampling
parameters (`--n=300 --per-file=10 --max-files=30`, ≥200 characters), and the
detector version. There is no hyperparameter search: every parameter is fixed a
priori and logged in `deviations.md`.

**C3. Descriptive statistics and variance? — Partial.** Proportions come with
Wilson 95% intervals, but those assume independent records — and this sample is
clustered (290 records over 275 domains, with mirrored and near-duplicate pages),
so the Wilson intervals are too narrow. A **domain-clustered bootstrap**
(resampling domains, 2,000 replicas, seed `20261026`) is reported alongside:
overall 11.7% (8.1–15.6), non-Latin 13.9% (9.4–18.7), Latin-only 3.4% (0–8.8).
Sampling variability **across crawls** is still unmeasured — one crawl was used —
and D2 has no estimate yet.

**C4. Existing packages reported? — Yes.** Nothing beyond the Node.js standard
library (version recorded in the run log); no NLP or ML packages. The detector is
imported from `lemon-juice` at v0.11.0.

## D. Human annotators / participants

**D1. Instructions reported? — N/A for participants; Yes for annotation.** No
human participants. The annotation task and label definitions are in `protocol.md`
§3–4; `make-sheet.js` emits exactly the sheet the annotator sees.

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

## E. AI assistants

**E1. AI-assistant use disclosed? — Yes.** AI assistants were used in this work:
for drafting, for code review, and for implementation support in the scripts.
Two constraints applied throughout, and they matter for a study about prompt
injection:

- **No sampled page text was ever given to a model.** The safety rule in
  `protocol.md` §1 is the reason; adjudication is human reading of local files.
- **Every number in `results/` is produced by the checked-in scripts**, not by an
  assistant, and the human author reviewed each claim. Where an assistant's draft
  was wrong, it is recorded in `deviations.md` (for example, a mis-parsed
  character class that would have reported ~100% prevalence).

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

## Known gaps, in one place

1. D2 is unmeasured until the 34 candidates are annotated.
2. Languages are not identified; only scripts.
3. Sampling variability across crawls is unmeasured — one crawl, one draw.
4. No formal dual-use harm assessment beyond the A2 paragraphs.
5. No PII scan, justified by not publishing text.
6. The pre-registered K1/K2 rule is inapplicable on F1 (0 flags ⇒ no FPR); see
   "Decision-rule applicability".
7. Intervals are corrected for **domain** clustering only. Correlation inside a
   domain (near-duplicate pages from one template) is not modelled, and
   between-crawl variance is unmeasured.
