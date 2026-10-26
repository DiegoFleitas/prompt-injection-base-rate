# D2 report — template (fill after annotation)

**Status:** template, not filled. Delete this line and the bracketed prompts when
the 34 candidates are adjudicated.

## Procedure

- Date: [YYYY-MM-DD]
- Records labelled: [n] / 290. Candidates: [34]. Audit sample (non-candidates): [30].
- Annotator: [single annotator: the author / plus a second opinion on n records].
- Definitions: `protocol.md` §3–4, fixed before data collection. D2 = concealed
  span that is directive **and** carries an action class; D3 = directive, no
  action; anything else is not counted.
- Blind: the annotator saw `sheet/<id>.txt` only; detector flags were joined at
  analysis time.

## Counts

Produced by `node scripts/analyze.js` (do not hand-copy — paste its table):

| Quantity | Value |
| --- | --- |
| D1 (mechanical, confirmed) | [x / 290, CI] |
| **D2 (concealed instruction)** | **[x / 34 candidates, CI over 290]** |
| D3 (directive, no action) | [x / 34] |
| Detector flagged | 0 / 290 |

## The D2 positives, if any

One row per positive. **No raw page text** — id, mechanism, and a one-line
paraphrase of the action. This list is the whole result; keep it exact.

| id | mechanism | action class | paraphrase (no quoted payload) |
| --- | --- | --- | --- |
| [id] | [e.g. ZWSP run] | [URL / credential / command / silence] | [one line] |

## Decision

Paste the `analyze.js` verdict. Expected, and already documented in
`RESPONSIBLE-RESEARCH.md` ("Decision-rule applicability"):

> **K3 (structural)** — the detector has no operating point on this frame, so
> neither K1 nor K2 is evaluable.

If D2 > 0, state what the count is and that the formal rule still cannot fire
(FPR undefined at 0 flags). Do **not** upgrade to K1/K2 by substituting a guessed
FPR.

## What this changes

- If D2 = 0: nothing in the conclusion changes; the descriptive result is now
  complete and the study says so without a caveat.
- If D2 > 0: report the prevalence, list the positives, and note that the
  comparison the design wanted (prevalence vs FPR) remains unavailable. That is a
  reason to run F4, not a reason to declare victory.

## Limitations of this label

- One annotator; self-consistency only if the delayed re-label pass was done.
- D2 ⊆ D1 by construction in this frame (WET has no markup): the 256 records
  without an invisible code point cannot contain D2, so "D2 = 0/290" means
  "none among 34 candidates", not "none anywhere on those pages".
- The definition requires an action class; a directive without one is D3 and not
  counted. If a reviewer would count those, say how the number would change.
