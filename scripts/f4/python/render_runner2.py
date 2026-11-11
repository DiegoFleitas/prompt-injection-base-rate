"""Render-channel scanner over real job-posting pages (headless Chromium / Playwright).

Population: the 553 job postings sampled in corpus_manifest.jsonl (3 ATS families).
Unit: the rendered page as a headless browser sees it. Detector: render_pred.js.
Parallel shards: --shard i --of n  -> writes render_scan.i.jsonl (resumable).
"""
import json, os, sys, time, glob, argparse
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
JS = open(os.path.join(HERE, "render_pred.js"), encoding="utf-8").read()
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36")
EXE = sorted(glob.glob(os.path.expandvars(r"%LOCALAPPDATA%/ms-playwright/chromium-*/chrome-win64/chrome.exe")))[-1]

ap = argparse.ArgumentParser()
ap.add_argument("--shard", type=int, default=0)
ap.add_argument("--of", type=int, default=1)
a = ap.parse_args()
OUT = os.path.join(HERE, f"render_scan.{a.shard}.jsonl")

man = [json.loads(l) for l in open(os.path.join(HERE, "corpus_manifest.jsonl"), encoding="utf-8")]
done = set()
for f in glob.glob(os.path.join(HERE, "render_scan*.jsonl")):
    for l in open(f, encoding="utf-8"):
        try:
            r = json.loads(l)
            if "error" not in r: done.add(r["key"])
        except Exception: pass
todo = [m for m in man if m["key"] not in done][a.shard::a.of]
print(f"shard {a.shard}/{a.of}: good {len(done)} todo {len(todo)}", flush=True)

t0 = time.time(); ok = err = 0
with sync_playwright() as p:
    br = p.chromium.launch(headless=True, executable_path=EXE,
                           args=["--disable-dev-shm-usage", "--no-sandbox", "--disable-gpu"])
    ctx = br.new_context(user_agent=UA, viewport={"width": 1280, "height": 900}, locale="en-US")
    page = ctx.new_page(); page.set_default_timeout(25000)
    with open(OUT, "a", encoding="utf-8") as fh:
        for i, m in enumerate(todo):
            rec = {"key": m["key"], "ats": m["ats"], "board": m["board"]}
            for attempt in (1, 2):
                try:
                    page.goto(m["url"], wait_until="domcontentloaded", timeout=25000)
                    page.wait_for_timeout(500)
                    r = page.evaluate(JS)
                    if r.get("inner", 0) < 400:
                        page.wait_for_timeout(1800); r = page.evaluate(JS)
                    rec.update(r); ok += 1; break
                except Exception as e:
                    rec["error"] = repr(e)[:140]; err += 1
                    if attempt == 1:
                        try:
                            page.close(); page = ctx.new_page(); page.set_default_timeout(25000)
                        except Exception: pass
                        time.sleep(0.5)
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n"); fh.flush()
    br.close()
print(f"SHARD {a.shard} DONE ok={ok} err={err} {time.time()-t0:.0f}s", flush=True)
