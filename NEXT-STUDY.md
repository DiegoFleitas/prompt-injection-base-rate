# Next study — the frame that would actually decide it

The F1 study measured extracted web text. It answered "is concealment rare in
crawled text?" (no) but not "is this worth defending against for an agent?" — for
that, the frame has to be the content agents actually ingest, with markup intact.

This document is a design sketch, not a protocol. If it becomes a study, the
protocol gets pre-registered before data collection, like F1 did.

## Why F1 cannot answer the decision

- **Wrong population.** Agents fetch targeted content (docs, issue trackers,
  search results, wikis, tool outputs), not random crawl segments. The rate there
  is plausibly lower, which would strengthen the negative result — but it is
  unmeasured.
- **Spam skew.** 79.7% of F1 records contained a non-Latin script, largely CJK
  SEO and gambling pages. The aggregate 11.7% is a property of that soup; the
  Latin-only stratum was 3.4%.
- **Text only.** WET strips comments, attributes and CSS, which are precisely the
  surfaces the archived extension was built to inspect.
- **Over-narrow intervals.** 290 records over 275 domains are not independent; the
  clustered bootstrap (results file) widens the interval, and the same correction
  belongs in any follow-up.

## Proposed frames

| Frame | Source | Why this frame |
| --- | --- | --- |
| G1 — agent task pages | URL sets from public agent benchmarks: WebArena, Mind2Web, WebVoyager | These are pages agents were actually evaluated on, not crawl segments |
| G2 — retrieval corpora | Docs sites (MDN, RFCs, vendor docs), GitHub issues/PRs, StackOverflow, wikis | The content a browsing or coding agent ingests most |
| G3 — tool outputs | Search-result snippets, MCP tool results, email bodies, RSS | Where untrusted text enters the context with tools attached |
| G4 — markup channels | Raw HTML (WARC) or fetched pages rendered offline with JS off | Comments, attributes, JSON-LD, CSS-hidden text — the F4 scaffold |

G1–G3 answer "how often"; G4 answers "on which surfaces". A study needs both to
say anything about a page-side defence.

## Design requirements (learned from F1)

1. **Language ID, not script.** "Latin script" is not "Spanish". Use a language
   classifier and report Spanish/Portuguese separately — the region's question.
2. **Site-type stratification.** Docs / forum / editorial / e-commerce / spam.
   Report each stratum; never only the pooled number.
3. **Domain-clustered intervals.** Bootstrap by domain, as `summarize.js` now does.
4. **Markup frame with rendering isolated.** Saved HTML, JS disabled, network
   blocked; the F4 scaffold already enforces this.
5. **Pre-register the comparator.** F1's K1/K2 rule needed a false-positive rate
   from a detector that never fired, so it could not run. A follow-up should
   pre-register a comparator that works when the detector is silent — e.g.
   "prevalence below the threshold that justifies a human review queue".
6. **No model calls; aggregation only.** Same safety rules as F1.

## What would count as a real finding

- Any D2 positive in G1–G3: a concealed instruction with an action, in content an
  agent ingests. Even one, properly adjudicated, is worth reporting.
- A materially higher rate in G3 (tool outputs) than G2 (docs): evidence that the
  risk concentrates where tools are attached, which is the argument for
  agent-side controls.
- A rate that stays near zero across G1–G3 after language and site-type
  stratification: the strongest possible version of the current conclusion, and
  the one that should end page-side detection as a research direction.

## Effort

A week for G2 + G4 at n≈200: URL list, fetch once, render offline, adjudicate.
G1 is a day's work on top if the benchmark URL sets are redistributable. G3 needs
a cooperating pipeline (or a synthetic stand-in, which is weaker evidence).
