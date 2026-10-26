# Sensitivity (positive control) — results

Protocol: `sensitivity-protocol.md` (frozen 2026-10-26, before running).
Run: 2026-10-26. Instrument: `scripts/triage.js` `classify()`, unchanged.

## Why this exists

F1 reports D2 = 0 among the 34 flagged documents. A null without a positive
control cannot be distinguished from a blind instrument. These runs measure the
instrument and, in doing so, find the exact boundary of the claim the study is
allowed to make.

## P1 — constructed channel positives (n = 5 per class)

| class | flag | priority observed | reached review | reached smuggling | predicted? |
|---|---|---|---|---|---|
| plain | none | benign-signature ×5 | 0/5 | 0/5 | yes |
| zwsp-bits | zw | context ×5 | 5/5 | 0/5 | priority: yes |
| tag-chars | tags | smuggling ×5 | 5/5 | **5/5** | yes |
| sneaky-bits | sneaky | smuggling ×5 | 5/5 | **5/5** | yes |
| bidi | bidi | smuggling ×5 | 5/5 | **5/5** | yes |
| vs-run | vsRun | smuggling ×5 | 5/5 | **5/5** | yes |
| base64 | none | benign-signature ×5 | 0/5 | 0/5 | yes |
| emoji-bits | none | benign-signature ×5 | 0/5 | 0/5 | yes |

All five smuggling-channel classes are caught on the first pass, at 5/5.
`zwsp-bits` lands in `context` (second priority) rather than `smuggling`, exactly
as the rule table predicts: zero-width outside a CJK window is suspicious but not
first-class. The three classes the mechanism cannot see (`plain`, `base64`,
`emoji-bits`) are invisible to it by construction — none of them introduces a
character the detector looks for.

## P2 — external positives (InjecAgent, n = 30 injected documents per arm)

Corpus: `InjecAgent@f19c9f2`, `data/test_cases_dh_enhanced.json`, MIT, 721,878
bytes, sha256 `885602716b72c18a…`, 187/510 records carry an injected tool
response. Full provenance: `data/sensitivity/provenance.json` (local).

| arm | payload | smuggling | Wilson 95% |
|---|---|---|---|
| A | verbatim published payload | **0/30 = 0.0%** | 0.0%–11.4% |
| B | same payload in the `tag-chars` channel | **30/30 = 100%** | 88.6%–100% |

Arm A also "reached review" on 2/30 — and those two are not payload detections:
they are `b153e8ed46282fd6` and `ab0954fecf4ee598`, sample documents that already
carried invisible characters in F1 (both appear in `data/triage.csv` with
priority `context`). The payload itself contributed no flag in either case.

## P2b — instruction-level external positives (amendment, run after P2)

P2's payloads are materialised *tool responses*: realistic carriers, but the
instruction arrives buried inside a fake JSON payload. P2b keeps only the text a
detector would have to recognise as an instruction, and adds a second corpus.
Same 30 host documents, same seeds, same arms.

| source | file | bytes | sha256 | payloads |
|---|---|---|---|---|
| InjecAgent (`f19c9f2`, MIT) | `data/attacker_cases_dh.jsonl` | 10,937 | `999d52e15af3c80a…` | 30 `Attacker Instruction` |
| InjecAgent (`f19c9f2`, MIT) | `data/attacker_cases_ds.jsonl` | 13,209 | `87952398c989d8ca…` | 32 `Attacker Instruction` |
| BIPIA (`a004b69`, MIT) | `benchmark/text_attack_test.json` | 6,322 | `75750e7b4e8b34e8…` | 75 attack strings, inserted verbatim by BIPIA's own threat model |

137 unique payloads. BIPIA's strings are the ones its framework inserts into
context verbatim, so they are payloads in its threat model even though they read
as requests rather than as jailbreak wrappers.

| arm | payload | smuggling | Wilson 95% |
|---|---|---|---|
| A | instruction-level payload, verbatim | **0/30 = 0.0%** | 0.0%–11.4% |
| B | same payload in the `tag-chars` channel | **30/30 = 100%** | 88.6%–100% |

Identical to P2, including the two arm-A "review" documents, which are again the
two host pages that already carried invisible characters in F1. The result is a
replication across payload shape (carrier vs instruction) and across corpora, not
a new finding.

**AgentDojo was parsed and excluded.** Its payloads are Python f-strings
(`ImportantInstructionsAttack._JB_STRING`, four baseline one-liners) over
module-level constants; 3 of the 4 suites' 27 `GOAL`s do not resolve without
executing their code or writing an AST walker, and materialising only the
resolvable ones (7/27) would bias the set toward short goals. Recorded in
`data/sensitivity/provenance-instructions.json` with `used_as_payloads: false`.

## What this establishes

1. **The detector works as a concealment-channel detector.** When content is
   actually encoded into a channel whose only plausible purpose is carrying
   data, it is flagged 5/5 in P1 and 30/30 in P2 arm B. The channels are not
   theoretical.
2. **The instrument is blind to a visible instruction.** P1 `plain` 0/5 and P2
   arm A 0/30 are the same fact measured two ways: no invisible character, no
   route into the review queue. This is a scope, not a defect — but it is the
   scope that has to be stated.
3. **88.3% of the F1 sample (256/290 documents) was never examined for D2.** The
   pipeline only inspects documents D1 flagged. So the study's null is strictly
   about concealment *in documents that contain invisible characters*, not about
   instruction-bearing web text in general.
4. **Visible encodings are also out of reach.** `base64` and `emoji-bits` (OWASP
   LLM01 scenario #9 shapes) produce no flag. An attacker who does not need the
   text to be invisible beats this instrument entirely.

## Consequence for the public claim

`"no instructions were detected"` is only true of documents the pipeline had a
route to examine. Under this protocol's wording rule, the defensible sentence is:

- About: *"…invisible characters in 11.7% of the documents it sampled, mostly
  BOMs and emoji selectors; none of them used concealment to carry an
  instruction."*
- Projects: *"a mechanism-based detector flagged 34 of 290 documents, all
  carrying ordinary encoding artefacts, and the concealment channel was empty in
  every one of them — the detector is blind to visible instructions by design,
  which the sensitivity control confirms."*

## Limits

- Two external corpora (InjecAgent, BIPIA), both English, and InjecAgent injects
  into tool responses rather than web text: the surface differs.
- AgentDojo is parsed but not materialised (see P2b): its payloads are Python
  f-strings over module constants.
- P1 channels were constructed by the study author, so they test the detector's
  mechanics, not an adversary's creativity.
- Payloads and page text stay local (`data/` is gitignored); only counts,
  commits and hashes appear here.
- BIPIA's `benchmark/` contexts include CC BY-SA 4.0 material (WikiTableQuestions,
  Stack Exchange); only its attack strings were used, and only as counts.
- n = 30 per P2 arm: the 100% upper bound is 88.6%, and the 0% upper bound is
  11.4%. These bound the instrument, they do not estimate the world.

## Deviation from the frozen protocol

P2b was added after P2 had run, so it is an amendment, not a pre-registered arm.
It was designed and run with the same prediction, the same host documents, the
same arms and the same metric, and it reproduced P2 exactly. The frozen P2 result
above stands on its own; P2b is reported as a replication across payload shape
and corpus, and nothing in the decision rule depends on it.
