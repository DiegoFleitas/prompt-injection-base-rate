# Base-rate study — protocol (pre-registered)

**Version:** 1.2 — frozen 2026-10-26, before any data was collected.
**Status:** ready to run. Changes after data collection begins go in
`deviations.md`, not in this file.

**Question this settles:** is Lemon Juice *protection*, or a *research artifact*?
The answer is one number — how often real ingested text contains a concealed
instruction addressed to a model — compared against the tool's own false-positive
rate. Nothing else about the project matters until that comparison exists.

**Scope:** measurement only. No model is called, no agent is run, no attack is
executed. This study counts and adjudicates text.

---

## 1. Safety rules (these come before the science)

1. **Never paste sampled content into a tool-enabled model or agent.** Not into
   ChatGPT, Claude, Gemini, or this harness — with or without tools. The payloads
   being counted are instructions; feeding them to something that can act is the
   one move in this study that can actually cause harm. Adjudication is by human
   reading of a local file. If an LLM is ever used for a second opinion, it is a
   no-tools API call inside the VM with no credentials, and its output is treated
   as data.
2. **Fetch once, scan offline.** Pages are fetched as raw bytes, hashed, stored,
   and analysed locally. No live rendering in a normal browser profile.
3. **The VM is for the deferred frames only** (raw HTML rendering, CSS-hidden
   layout). F1 and the analysis need no browser. VM: no logins, no host
   credentials, no shared folders, snapshot before each batch, `--disable-javascript`
   and network blocked after fetch for any rendered pass.
4. **No auth-gated pages, no PII collection, no attachments.** PDFs and archives
   are hashed and skipped; only textual HTML/WET content is analysed.
5. **Publish aggregates, hashes and short sanitised excerpts only** — never raw
   pages, never full text. `data/` never leaves the machine.

## 2. Frames

| Frame | Source | N | Status |
| --- | --- | ---: | --- |
| **F1 — agent-ingest (primary)** | Common Crawl WET records (plain-text extraction, i.e. what a text-extraction agent pipeline ingests) | 300 | runs today |
| F2 — human-paste | URLs Diego actually read in the last two weeks, consented, already visited | 100 | optional, only if listed before annotation |
| F3 — raw HTML | comments, attributes, `<template>` — needs raw WARC | 100 | deferred to VM |
| F4 — rendered CSS-hidden | computed styles, JS disabled | 50 | deferred to VM |

**The decision uses F1 only.** F2–F4 are descriptive and cannot rescue a null F1.

### F1 sampling (deterministic)

- Crawl: chosen by seeded draw from the 6 most recent Common Crawl crawls.
- Files: the crawl's `wet.paths.gz` listing is read in full; files are drawn by
  seeded shuffle. **30 files, up to 10 records each** — sampling a single file
  would cluster the whole sample in one crawl segment.
- Records: in file order, keep records with ≥200 characters until 300 are held.
- Seed: `20261026`. Any rerun with the same seed and crawl list must produce the
  same records, byte for byte.
- Known biases: WET is not "the web" — one text extraction of crawled pages,
  skewed to link-reachable, non-paywalled content, and the sample is drawn from
  the **start** of each file (WET files are crawl-ordered rather than
  content-ordered, so the start is not a topic cluster, but it is not random
  within the file either). The report says "agent-ingest text", never "the web".

## 3. Definitions (fixed before looking)

- **D1 — concealed_any (mechanical, no judgement).** The ingested text contains at
  least one of: `Default_Ignorable_Code_Point`, `Bidi_Control`, the Unicode Tags
  block `U+E0000–E007F`, variation selectors `U+FE00–U+FE0F`/`U+E0100–U+E01EF`, or
  sneaky-bits `U+2062`/`U+2064`. Computed by code, confirmed by the annotator.
- **D2 — concealed_instruction (the number that matters).** A concealed span that
  is **both**:
  1. *directive in form* — imperative or role/authority address aimed at a model or
     assistant ("ignore…", "you are…", "reveal…", "send…", "do not mention…"), and
  2. *carries at least one action class* — URL/domain destination; credential or
     secret request; tool/command execution; suppression ("do not tell the user");
     role/authority impersonation that would change model behaviour.
- **D3 — directive_no_action.** Directive in form, no action class. Counted and
  reported, but **not** part of D2.
- Deliberately excluded from D2: SEO keyword stuffing, accessibility markup,
  watermarking/canary strings, tracking IDs, plain visible instructions.

## 4. Labeling

- The sheet shows text with invisible code points made visible (`⟦U+200B⟧`) and
  **never shows detector output** — prevalence must be measured blind.
- Labels per record: `d1` (0/1), `d2` (0/1), `d3` (0/1), `action_class` (semicolon
  list), `confidence` (low/med/high), `notes` (one line).
- One annotator. A second opinion on a random 20% is reported as agreement if one
  exists; if not, the report says "single annotator" and the limitation stands.
- 10% of records are labelled twice by the same annotator ≥24 h apart and
  reported as self-consistency. Cheap honesty about the noisiest step.

## 5. Analysis (pre-specified)

- `p_any = count(D1) / N`, Wilson 95% interval.
- `p_instr = count(D2) / N`, Wilson 95% interval; if 0, rule-of-three upper bound
  `3/N`.
- Detector flag rate = flagged / N; flagged = verdict `suspicious` or
  `likely-injection`.
- **False-positive rate** = `P(D2 = 0 | detector flagged)`, Wilson 95%.
- Signal-to-noise = `p_instr / FPR`. Report all four, never just one.

## 6. Decision rule (frozen)

Let `ub = 95% upper bound of p_instr` and `fp = detector false-positive rate`.

- **K1 — product framing dies** if `ub ≤ fp`. (Expected case: 0/300 ⇒ ub ≈ 1%.)
  Action: archive as research/teaching artifact; publish the base-rate study; no
  1.0, no consumer-protection framing.
- **K2 — ingest tool justified** if `p_instr ≥ 5 × fp` and the D2 hits concentrate
  in F1 (agent-ingest) rather than F2. Action: reframe as ingest-gate library;
  the popup becomes its demo.
- **K3 — inconclusive** otherwise. Action: run F3/F4 before deciding; do not
  redesign detectors on the way.

Stopping is fixed at N=300. No peeking then extending.

## 7. What this study does not measure

- Whether a model is actually fooled (no model calls by design).
- CSS-hidden and comment/attribute concealment in F1 (WET is text, not DOM).
- Multi-turn, multimodal, or agent-tool-loop attacks.
- Harm. It measures how often the text exists, not what it would do.
- The web. It measures one crawl's text extraction.

## 8. Artifacts

- `data/wet-sample.jsonl` — records, private, not published.
- `sheet/` — blind adjudication sheets.
- `labels.csv` — the annotations.
- `data/detector-flags.csv` — tool output, joined only at analysis time.
- `report.md` — the aggregate result and the K1/K2/K3 verdict.

## 9. Changes before data collection (v1.0 → v1.2)

All changes are pre-data and are recorded here rather than in `deviations.md`.

1. **FPR needs at least 10 flags.** With 0 or 1 flagged records the false-positive
   point estimate is 0 or 1 by construction, which would make K2 fire trivially
   (`0 ≥ 5 × 0`). Below 10 flags the verdict is **K3 inconclusive**, with the
   reason stated — not a forced K1/K2.
2. **D1 classification reuses the detector's predicates** (`isTagChar`,
   `isVariationSelector`, `isSneakyBitsChar`) instead of a hand-written character
   class. The first implementation re-derived the variation-selector range as
   `/[\uFE00-\uFE0F\uE0100-\uE01EF]/u`, which JavaScript parses as `\uE010` + `"0"`
   and turns into the range `0x30–0xE01E` — classifying nearly every character as
   invisible, i.e. a ~100% D1 prevalence. `selftest.js` now fails if that
   regresses, and it is run before every sampling batch.
3. **Sample spreads across 30 WET files, ≤10 records each.** The first fetch took
   300 records from a single file (records are read in file order), which
   clustered the entire sample in one crawl segment. Fixed in the sampler and in
   section 2; the first run is discarded and not used.
4. **D2 ⊆ D1 in this frame.** WET carries no markup, so a concealed span can only
   be a concealed character sequence. That bounds `p_instr ≤ p_any` analytically
   and reduces annotation to the D1-positive records plus a random audit.
