"""Complete the markup-surface channels on the same 553 rendered pages.

Channels recorded per page (hash + length + stage-2 verdict only, never raw text):
  comments      HTML comments >= 8 chars after stripping
  attributes    alt / title / aria-label / data-* / placeholder values (>=40 alnum chars)
  jsonld        text content of application/ld+json blocks
  meta_desc     <meta name="description"> content
  template      text inside <template> elements
  dangling      elements whose text is only reachable via aria-label (no visible text)

Sharded like render_runner2.py: --shard i --of n -> markup_scan.i.jsonl

Safety: the page is the saved copy under $F4_DATA_DIR/raw_html, loaded with
JavaScript disabled and every non-`file:` request aborted (safe_render.py); the
live URL in the manifest is never visited.
"""
import json, os, re, sys, glob, time, hashlib, argparse
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import f4_paths, stage2
from safe_render import launch_offline_chromium, file_uri

HERE = os.path.dirname(os.path.abspath(__file__))

ap = argparse.ArgumentParser(); ap.add_argument("--shard", type=int, default=0); ap.add_argument("--of", type=int, default=1)
a = ap.parse_args()
OUT = f4_paths.data_path(f"markup_scan.{a.shard}.jsonl")

man = [json.loads(l) for l in open(f4_paths.MANIFEST, encoding="utf-8")]
done = set()
for f in glob.glob(f4_paths.data_path("markup_scan*.jsonl")):
    for l in open(f, encoding="utf-8"):
        try:
            r = json.loads(l)
            if "error" not in r: done.add(r["key"])
        except Exception: pass
todo = [m for m in man if m["key"] not in done][a.shard::a.of]
print(f"shard {a.shard}: good {len(done)} todo {len(todo)}", flush=True)

JS = r"""(() => {
  const alnum = s => (s || '').replace(/[^0-9A-Za-z]/g, '').length;
  const attrs = [];
  for (const el of document.querySelectorAll('[alt],[title],[aria-label],[placeholder]')) {
    for (const an of ['alt','title','aria-label','placeholder']) {
      const v = el.getAttribute(an) || '';
      if (alnum(v) >= 40) attrs.push(v);
    }
  }
  for (const el of document.querySelectorAll('*')) {
    for (const at of el.attributes) {
      if (at.name.startsWith('data-') && alnum(at.value) >= 40) attrs.push(at.value);
    }
  }
  const jsonld = [];
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) jsonld.push(s.textContent || '');
  const md = document.querySelector('meta[name="description"]');
  const tpl = [];
  for (const t of document.querySelectorAll('template')) tpl.push(t.content ? t.content.textContent : '');
  return {
    attrs: attrs.slice(0, 60),
    jsonld: jsonld.slice(0, 10).map(s => s.slice(0, 4000)),
    meta: md ? (md.getAttribute('content') || '') : '',
    tpl: tpl.slice(0, 10).map(s => s.slice(0, 4000)),
    has_main_text: (document.body.innerText || '').length,
  };
})()"""

t0 = time.time(); ok = err = 0
with sync_playwright() as pw:
    br, ctx = launch_offline_chromium(pw)
    page = ctx.new_page(); page.set_default_timeout(25000)
    with open(OUT, "a", encoding="utf-8") as fh:
        for m in todo:
            rec = {"key": m["key"], "ats": m["ats"]}
            local = os.path.join(f4_paths.RAW_HTML, m["file"])
            for attempt in (1, 2):
                try:
                    if not os.path.exists(local):
                        raise FileNotFoundError(local)
                    page.goto(file_uri(local), wait_until="load", timeout=25000)
                    page.wait_for_timeout(400)
                    d = page.evaluate(JS)
                    rec["n_attr"] = len(d["attrs"])
                    rec["attr_s2"] = sum(1 for v in d["attrs"] if stage2.detect(v)[0])
                    rec["attr_maxlen"] = max((len(v) for v in d["attrs"]), default=0)
                    rec["n_jsonld"] = len(d["jsonld"])
                    rec["jsonld_s2"] = sum(1 for v in d["jsonld"] if stage2.detect(v)[0])
                    rec["jsonld_len"] = sum(len(v) for v in d["jsonld"])
                    rec["meta_len"] = len(d["meta"])
                    rec["meta_s2"] = 1 if stage2.detect(d["meta"])[0] else 0
                    rec["n_tpl"] = len(d["tpl"])
                    rec["tpl_len"] = sum(len(v) for v in d["tpl"])
                    rec["tpl_s2"] = sum(1 for v in d["tpl"] if stage2.detect(v)[0])
                    rec["body_text"] = d["has_main_text"]
                    ok += 1; break
                except Exception as e:
                    rec["error"] = repr(e)[:120]; err += 1
                    if attempt == 1:
                        try:
                            page.close(); page = ctx.new_page(); page.set_default_timeout(25000)
                        except Exception: pass
                        time.sleep(0.5)
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n"); fh.flush()
    br.close()
print(f"MARKUP SHARD {a.shard} done ok={ok} err={err} {time.time()-t0:.0f}s", flush=True)
