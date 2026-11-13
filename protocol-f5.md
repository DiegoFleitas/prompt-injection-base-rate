# F5 — job-email frame: protocol (pre-registered)

Frozen 2026-11-13, before any message body was decoded, rendered or read by a
human or a model. What already happened is stated precisely: the snapshot
manifest parsed **headers only** (`BytesParser(..., headersonly=True)`) and read
message bytes solely to compute SHA-256. No body was decoded, no subject or
address left the machine, and no model saw any of it.

| | |
| --- | --- |
| snapshot | `data/f5/corpus/` — 894 files, 203 MB, digest `8d1c4bb1ee5e4f953dc5b32a936f2b2e0beaddf18d5bf45b18a8f62f73837cbb` |
| manifest | `data/f5/corpus-manifest.csv` — 1,338 rows |
| verified with | `cd data/f5/corpus && sha256sum -c ../corpus.sha256` → 894/894 OK |
| frame | F5, agent-facing concealment in job-related mail |

## 1. Safety and ethics

1. **No email text goes to a model or an agent.** Not to Hermes, not to an API,
   not with tools disabled. Adjudication is a human reading a local file. This is
   `protocol.md` §1 applied to a corpus that contains third-party PII.
2. Raw mail never enters git. `data/` is ignored; the snapshot, decoded text,
   sheets and labels stay under `data/f5/`.
3. No subjects, display names, addresses or domains in results. Sender identity
   is a salted SHA-256 prefix (`data/f5/salt.txt`, generated locally, never
   committed). Any cell with `n < 5` is suppressed.
4. Attachments are never opened or executed. MIME type, size and SHA-256 only.
5. Human annotation only. No LLM pre-labelling and no keyword classifier dressed
   up as a label; the triage rule may prioritise, never decide.
6. The corpus is one person's received correspondence. It is processed locally,
   reported in aggregate, and not used to attempt re-identification.

## 2. Population

Job-related mail already on disk, as of the 2026-11-13 snapshot:

| Source | Content | Messages |
| --- | --- | ---: |
| Thunderbird `Trabajo` mbox | live IMAP cache, copied | 1,005 |
| WSL job-alert archive (`gmail-to-markdown/archive`) | `.eml`, 2026-02..2026-07 | 385 |
| **union after Message-ID dedup** | 52 messages appear in both | **1,338** |

**This is a convenience census of one inbox, not a probability sample of job
mail.** Every result says so. Excluded by design: `INBOX` (1.76 GB), `Sent`,
drafts/trash, `SAS` and `proyecto` folders, all attachment contents, and the 59
Windows `.eml` copies used only as an overlap check.

Five sender addresses account for the bulk of both sources, and messages from one
sender are near-duplicates of one template. The honest unit count is **48 sender
addresses**, not 1,338 messages.

## 3. Unit and clusters

- **Unit** — one message after dedup, excluding self-sent mail (17 rows), i.e.
  **n = 1,321**.
- **Cluster** — the sender address, as a salted hash. **48 clusters.**
- Both interval levels are reported. The message-level figure is descriptive; the
  sender-clustered one is what generalises, and it is wide.

Zero-hit one-sided 95% bounds under this protocol, computed before looking:

| Level | n | Zero-hit bound |
| --- | ---: | ---: |
| Message, union | 1,338 | 0.224% |
| Message, excluding self-sent | 1,321 | 0.227% |
| mbox only | 1,005 | 0.298% |
| archive only | 385 | 0.775% |
| Visible-instruction sample | 100 | 2.951% |
| Sender addresses | 48 | **6.05%** |

The 0.22% never travels alone.

## 4. Definitions (D1–D3 unchanged from F1; E1–E2 new)

- **D1** — at least one invisible code point (zero-width, bidi control, tag
  character, variation-selector run, sneaky bits).
- **D2** — a concealed span that is both directive in form and carries an action
  class.
- **D3** — directive in form, no action class.
- **E1** — machine-only surfaces: hidden preheader, `display:none`,
  visibility/zero-size hiding, HTML comments, `alt`/`title` text, tracking
  parameters. A channel census, not an attack signal.
- **E2** — a visible instruction addressed to an assistant, with an action class,
  no concealment required. This is the surface F1 could not see at all.

## 5. Channels

1. `text/plain` body — primary. Quoted lines (`>`) are stripped into a secondary
   `plain_quoted` channel, so a quoted payload still counts without inflating
   prevalence.
2. `text/html` source — raw, tags included.
3. Selected headers — `Subject`, display name, `X-*`.
4. Attachment filenames — metadata only, never contents.

## 6. Instrument

Python 3.12+ stdlib MIME decode (`email`, QP/base64, declared charset,
`errors="replace"`, decode failures recorded as `errors:charset`). The Node
scanner reuses `scripts/triage.js`'s `classify()` and the `lemon-juice`
predicates **unchanged**. No new regexes are introduced for this frame.

## 7. Sampling and stop rule

The file list and hashes are frozen in `data/f5/corpus.sha256` before the first
body is read. No folders are added after seeing results. No message is re-drawn.
The analysis stops at the snapshot; the mbox is a live IMAP cache and is only
ever read through the copy.

Primary window **2023-01-01 → 2026-07-18**; messages from 2018-05..2022-12-31 are
reported as a separate stratum and never pooled with the primary estimate.

## 8. Analysis (pre-specified)

1. Proportions with **one-sided exact Clopper–Pearson** upper bounds for zero
   counts (bisection on the binomial CDF, asserted against `0/290 → 1.0%`).
2. **Sender-clustered bootstrap**: resample `from_hash` clusters with replacement,
   2,000 replicas, seed `20261113`, report the 2.5–97.5 percentile.
3. Tables: D1 prevalence per channel, D2 among D1 candidates and among all
   messages, E1 surface census, E2 from the human arm, per-era split, both bounds.
4. No false-positive rate: this frame has no detector comparison.

## 9. Decisions fixed at freeze (2026-11-13)

| Decision | Value |
| --- | --- |
| Primary window | 2023-01-01 → 2026-07-18; 2018–2022 separate stratum |
| Folder scope | `Trabajo` mbox + job-alert archive only |
| Visible-instruction arm | 100 messages, stratified by era, single annotator |
| Publication | aggregates in this repo + README section |
| Retention | delete `data/f5/text/` after the run; keep flags, labels, hashes |
| Self-sent mail | excluded from the received corpus (17 rows) |

## 10. Artifacts

Local only: `data/f5/{corpus,corpus.sha256,corpus-manifest.csv,text/,flags.csv,
triage.csv,sheet/,labels.csv,salt.txt,self-addresses.txt}`.
Published: `results/f5-<date>.md` and `results/f5-<date>.summary.json` — counts,
months, hashes and intervals. The decoded-text directory is deleted after the run
and the deletion is recorded in `deviations.md`.

## 11. What this frame does not measure

- Email on the internet, or job mail beyond this inbox. One person, one mailbox.
- Rendered HTML concealment (F4's computed-style approach) — deferred as its own
  study; the raw-MIME arm cannot judge `display:none` output.
- Attachment contents, images, or anything requiring a click.
- Prevalence of *successful* injection. Nothing here executes mail content.
