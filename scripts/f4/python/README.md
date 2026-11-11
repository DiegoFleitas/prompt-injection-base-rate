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

Requirements: Python 3.14, `playwright` (the Chromium build in
`%LOCALAPPDATA%/ms-playwright` is reused; nothing else is downloaded).

```sh
python -m venv venv && ./venv/Scripts/python.exe -m pip install playwright
./venv/Scripts/python.exe fetch_boards.py 40
for i in 0 1 2 3; do ./venv/Scripts/python.exe render_runner2.py --shard $i --of 4 & done; wait
for i in 0 1 2 3; do ./venv/Scripts/python.exe markup_scan.py  --shard $i --of 4 & done; wait
./venv/Scripts/python.exe analyze_render2.py && ./venv/Scripts/python.exe ppv.py
./venv/Scripts/python.exe inject_test.py payloads/payloads.json    payloads/inject_results.set1.json
./venv/Scripts/python.exe inject_test.py payloads/payloads2.json   payloads/inject_results.set2.json
```

Raw captures, the per-page scan records and the corpus manifest land in the
working directory and are **not** published: they contain third-party page text.
Only aggregates, SHA-256 prefixes and lengths are written into `results/`.

Code in this directory is GPL-3.0, like the rest of the repository.
