# F4 — Python implementation (run 2026-11-10)

These are the scripts that produced `results/render-2026-11-10.md`. They are a
second implementation of the frame described one directory up, not a replacement
for it: the JS scaffold renders saved HTML with JavaScript disabled, this one
loads the live page with JavaScript enabled and reads computed style.

| Script | Role |
| --- | --- |
| `fetch_boards.py` | sample the population (3 ATS families, 40/board systematic) and write the provenance manifest — no browser |
| `render_pred.js` | the concealment predicates, evaluated in the page: computed style per element, ancestors flagged once, ≥3 own characters |
| `render_runner2.py` | sharded Playwright pass over the manifest; writes one JSONL per shard, resumable |
| `scan_html.py` + `selftest.py` | static channels (unicode, comments, attributes) on server-delivered HTML, with a 20-case self-test |
| `markup_scan.py` | attributes / JSON-LD / meta description / `<template>` on the rendered page |
| `stage2.py` | instruction-shape classifier (EN/ES/PT/FR/DE) applied to concealed text only |
| `inject_test.py` | held-out recall harness: payloads × mechanisms on real job descriptions |
| `analyze_render2.py` | aggregates, Wilson intervals, hash-only concealed-string index |
| `ppv.py` | PPV and the sensitivity-adjusted prevalence bound |
| `selftest_render.py` | negative controls for the browser predicates (visible text, aria-hidden-but-visible, inherited colour) |
| `payloads/` | the two independent payload sets used for the recall numbers |

Requirements: Python 3.14 and the pinned `playwright==1.56.0` from
[`requirements.txt`](../../../requirements.txt). Install it into the venv from
that file — never as a global or unpinned `pip install` — and fetch the browser
with `playwright install chromium` (or point `F4_CHROMIUM` at an existing
Chromium binary).

```sh
python -m venv venv && ./venv/Scripts/python.exe -m pip install -r ../../../requirements.txt
./venv/Scripts/python.exe -m playwright install chromium
./venv/Scripts/python.exe fetch_boards.py 40
for i in 0 1 2 3; do ./venv/Scripts/python.exe render_runner2.py --shard $i --of 4 & done; wait
for i in 0 1 2 3; do ./venv/Scripts/python.exe markup_scan.py  --shard $i --of 4 & done; wait
./venv/Scripts/python.exe analyze_render2.py && ./venv/Scripts/python.exe ppv.py
./venv/Scripts/python.exe inject_test.py payloads/payloads.json    payloads/inject_results.set1.json
./venv/Scripts/python.exe inject_test.py payloads/payloads2.json   payloads/inject_results.set2.json
```

### Where the data goes, and how the browser runs

Raw captures, the corpus manifest and the per-page scan records contain
third-party page text and are **not** published. They are written outside the
repository, under `$F4_DATA_DIR` (default `~/f4-data`); pointing `F4_DATA_DIR`
inside the repo is a hard error (`f4_paths.py`). `.gitignore` also lists every
historical in-tree location as a backstop.

`render_runner2.py`, `markup_scan.py`, `inject_test.py` and `selftest_render.py`
share one browser factory (`safe_render.py`): Chromium's sandbox stays on (no
`--no-sandbox`), JavaScript is disabled, and a context-wide route aborts every
request whose scheme is not `file:` — so the scans render the saved local copy
and never re-fetch the live URL or let a page beacon. The static checks for
these properties are in [`tests/f4/test_renderer_hardening.py`](../../../tests/f4/test_renderer_hardening.py).
Only aggregates, SHA-256 prefixes and lengths are written into `results/`.

Code in this directory is GPL-3.0, like the rest of the repository.
