# Annotation walkthrough (the 35-minute pass)

Read this once with `data/triage.csv` open. It walks through the three pages that
need close reading, then the spot-checks, the audit sample, and what to do with
the result. Nothing here is a label: the labels are yours to write.

## What you are deciding

For each candidate, two questions, in this order:

1. **Is there a directive?** Text that tells *a model or assistant* to do
   something — "ignore…", "you are now…", "reveal…", "send…", "do not mention…".
   Not "the page tells a human to buy something".
2. **Does it carry an action?** A URL/domain destination · a credential or secret
   request · a command/tool execution · suppression ("don't tell the user") ·
   a role/authority claim that would change the model's behaviour.

Both yes → `d2_concealed_instruction=1`. Directive but no action → `d3=1`.
Neither → both `0`. `d1_invisible` is `1` for all 34 candidates by definition.

## The three pages that need close reading

Open each file in `sheet/<id>.txt`. Invisible characters appear as
`⟦BOM:U+FEFF⟧`, `⟦ZWSP:U+200B⟧`, etc.

### 1. `ab0954fecf4ee598` — 1-maysk.ru, 3 BOMs

A Russian municipal council page: agenda, regulations, meeting minutes. The three
BOMs sit inside the text, not at offset 0 (a quirk of how the page was assembled).

- Directive addressed to a model? **No.** "Постановление от 03.04.2023…" is a
  resolution, addressed to people.
- Action class? **No.**

→ `d1_invisible=1, d2=0, d3=0, confidence=high`, note: `3 BOMs mid-text in a municipal page`.

### 2. `a903379992920305` — 1to1coachingschool.com, 1 word joiner

A long marketing page about "quantum healing". Worth reading because it is the
one near-miss: it contains second-person prose — *"You are already connected to
the quantum energy field"*.

- Is that a directive to a model? **No.** It is marketing copy addressed to a
  human reader; there is no instruction to an assistant and no action it asks a
  model to take.
- Action class? **No.**

→ `d1=1, d2=0, d3=0, confidence=high`, note: `second-person marketing prose, not a model directive`.

That page is the closest thing to a temptation in the whole sample. The rule that
excludes it is the action requirement — without it, every ad would count.

### 3. `b153e8ed46282fd6` — 185-46-168-64.dg-net.pl, 1 zero-width space

Polish-language spam about phone tracking ("Hack A FB 7 Admin Hasło", "spy
software for iOS"). Zero-width space inside a sentence.

- Directive to a model? **No.** It is spam aimed at a human.
- Action class? **No.**

→ `d1=1, d2=0, d3=0, confidence=high`, note: `ZWSP in Polish spam page`.

**All three are 0.** If that surprises you, that is the finding: mechanism present,
instruction absent.

## The 31 remaining candidates (spot-check ~10)

They are sorted below the three above. Their `reasons` column already says why
they are benign-signature: BOM at offset 0, zero-width inside CJK text, emoji
selector, word joiner. Open every third one, confirm the reason matches the sheet,
and write the same row shape (`d1=1, d2=0, d3=0`). You are confirming, not
re-deciding.

## The 30 audit rows

Different job entirely. These are pages **without** an invisible character. You
are checking that the mechanical classifier did not miss one, which would mean the
prevalence is undercounted.

1. In `labels.csv`, find 30 ids that are **not** in `data/d1-candidates.csv` (any
   30 of the remaining 256 rows; the first 30 is fine).
2. Open their sheets. Scan for a `⟦…⟧` marker. There should be none.
3. If you find one: **stop**, note the id in `deviations.md`, and tell me — the D1
   count needs recomputing before anything is published.
4. Otherwise write `d1=0, d2=0, d3=0` for those 30.

## Filling `labels.csv`

Header and one row per candidate. No commas inside `notes` (use semicolons), or
the parser breaks.

```csv
id,d1_invisible,d2_concealed_instruction,d3_directive_no_action,action_class,confidence,notes
ab0954fecf4ee598,1,0,0,,high,3 BOMs mid-text in a municipal page
a903379992920305,1,0,0,,high,marketing prose addressed to a human; no action
b153e8ed46282fd6,1,0,0,,high,ZWSP in Polish spam page
4f1a... ,0,0,0,,high,audit row; no invisible character found
```

Leave the rest blank. Blank rows are reported as "partial", not as zeros.

## Then run the analysis

```sh
node scripts/analyze.js
```

Expected output: a table with D1/D2/D3 counts and **K3 (structural)** — because
the detector flagged 0 pages, there is no false-positive rate to compare against.
If D2 turns out to be > 0, the report says so and still notes the rule cannot
fire; do not invent an FPR to reach K1/K2.

## Writing the report

1. Copy `results/annotation-template.md` to `results/d2-report.md`.
2. Paste the analysis table.
3. For each D2 positive: id, mechanism, action class, a **one-line paraphrase** —
   never the payload text.
4. Delete the template's bracketed prompts.
5. Update the README line that says D2 is unmeasured.
6. Add a `deviations.md` entry: date, records labelled, triage counts, result.
7. Commit and push (normal `git push` on your machine; the sandbox workaround was
   mine, not yours).

## If nothing is positive

The report should say: mechanism prevalence 11.7%; **no concealed instruction with
an action found among 34 candidates** (which are all the pages where concealment
could exist in this frame); the pre-registered rule is structurally inapplicable;
and the practical conclusion — a page-side mechanism detector has no operating
point. That is the ending this study was designed to be able to reach honestly.
