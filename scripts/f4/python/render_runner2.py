"""Render-channel scanner over saved job-posting pages (headless Chromium / Playwright).

Population: the 553 job postings in $F4_DATA_DIR/corpus_manifest.jsonl (3 ATS families).
Unit: the locally saved page as a headless browser sees it. Detector: render_pred.js.
Safety: pages are loaded from the saved copy under $F4_DATA_DIR/raw_html with
JavaScript disabled and every non-`file:` request aborted (see safe_render.py);
the browser is never pointed at the live URL, and the sandbox stays on.
Parallel shards: --shard i --of n  -> writes render_scan.i.jsonl (resumable).
"""
import json, os, sys, time, glob, argparse
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import f4_paths
from safe_render import launch_offline_chromium, file_uri

HERE = os.path.dirname(os.path.abspath(__file__))
JS = open(os.path.join(HERE, "render_pred.js"), encoding="utf-8").read()

ap = argparse.ArgumentParser()
ap.add_argument("--shard", type=int, default=0)
ap.add_argument("--of", type=int, default=1)
a = ap.parse_args()
OUT = f4_paths.data_path(f"render_scan.{a.shard}.jsonl")

man = [json.loads(l) for l in open(f4_paths.MANIFEST, encoding="utf-8")]
done = set()
for f in glob.glob(f4_paths.data_path("render_scan*.jsonl")):
    for l in open(f, encoding="utf-8"):
        try:
            r = json.loads(l)
            if "error" not in r: done.add(r["key"])
        except Exception: pass
todo = [m for m in man if m["key"] not in done][a.shard::a.of]
print(f"shard {a.shard}/{a.of}: good {len(done)} todo {len(todo)}", flush=True)

t0 = time.time(); ok = err = 0
with sync_playwright() as p:
    br, ctx = launch_offline_chromium(p)
    page = ctx.new_page(); page.set_default_timeout(25000)
    with open(OUT, "a", encoding="utf-8") as fh:
        for i, m in enumerate(todo):
            rec = {"key": m["key"], "ats": m["ats"], "board": m["board"]}
            local = os.path.join(f4_paths.RAW_HTML, m["file"])
            for attempt in (1, 2):
                try:
                    if not os.path.exists(local):
                        raise FileNotFoundError(local)
                    page.goto(file_uri(local), wait_until="load", timeout=25000)
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
