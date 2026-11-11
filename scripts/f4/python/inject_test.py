"""Held-out payload recall test.

36 payloads authored independently (subagent, no access to the detector),
each placed in 2 mechanisms on a real job-description carrier:
  - one from COVERED (mechanisms the detector models)
  - one from UNCOVERED (mechanisms it does not model)
Measures, per case: does the render channel fire, and does the detector
surface the payload text (recovery)? Then applies stage-2 (instruction shape)
to whatever was recovered -> end-to-end sensitivity.

Also runs the unicode / comment / attr channels on the same cases via the
static scanner (scan_html.py) so each channel has its own power estimate.

Usage: python inject_test.py payloads.json
"""
import json, os, re, sys, unicodedata, glob, tempfile
from playwright.sync_api import sync_playwright
import scan_html as S
import stage2

HERE = os.path.dirname(os.path.abspath(__file__))
JS = open(os.path.join(HERE, "render_pred.js"), encoding="utf-8").read()
EXE = sorted(glob.glob(os.path.expandvars(r"%LOCALAPPDATA%/ms-playwright/chromium-*/chrome-win64/chrome.exe")))[-1]

COVERED = {
 "display_none": '<div style="display:none">%s</div>',
 "visibility_hidden": '<div style="visibility:hidden">%s</div>',
 "font_size_zero": '<div style="font-size:0">%s</div>',
 "opacity_zero": '<div style="opacity:0">%s</div>',
 "white_on_white": '<div style="color:#ffffff;background-color:#ffffff">%s</div>',
 "offscreen": '<div style="position:absolute;left:-9999px;top:0">%s</div>',
 "sr_only_clip": '<div style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">%s</div>',
 "zero_height": '<div style="height:0;overflow:hidden">%s</div>',
}
UNCOVERED = {
 "font_15px": '<div style="font-size:1.5px;line-height:1.5px">%s</div>',
 "pseudo_before": '<style>.pb::before{content:"%s"}</style><span class="pb"></span>',
 "overlay_cover": '<div style="position:relative"><span>%s</span>'
                  '<div style="position:absolute;inset:0;background:#fff"></div></div>',
 "collapsed_details": '<details><summary>More</summary><div>%s</div></details>',
}

def norm(s): return re.sub(r"[^0-9a-z]+", "", unicodedata.normalize("NFKD", s).lower())[:40]

def build(carrier, frag):
    i = carrier.lower().rfind("</body>")
    return (carrier[:i] + frag + carrier[i:]) if i > 0 else carrier + frag

def main(payload_file, out_file="inject_results.json"):
    pl = json.load(open(payload_file, encoding="utf-8"))
    carriers = sorted(glob.glob(os.path.join(HERE, "raw_html", "*.html")))[:8]
    carriers = [open(c, encoding="utf-8", errors="replace").read() for c in carriers]
    cases = []
    for i, p in enumerate(pl):
        text = p["text"].replace('"', "'")
        cases.append({"pid": p["id"], "cat": p["category"], "lang": p.get("language", ""),
                      "mech": list(COVERED)[i % len(COVERED)], "frag": COVERED[list(COVERED)[i % len(COVERED)]] % text,
                      "text": p["text"], "carrier": i % len(carriers), "family": "covered"})
        cases.append({"pid": p["id"], "cat": p["category"], "lang": p.get("language", ""),
                      "mech": list(UNCOVERED)[i % len(UNCOVERED)], "frag": None,
                      "text": p["text"], "carrier": (i + 3) % len(carriers), "family": "uncovered"})
    # fill uncovered fragments (two-step so %-signs in text are safe)
    for c in cases:
        if c["frag"] is None:
            tpl = UNCOVERED[c["mech"]]
            c["frag"] = tpl.replace("%s", c["text"].replace('"', "'"), 1) if c["mech"] != "pseudo_before" \
                        else tpl.replace("%s", c["text"].replace('"', "'").replace("\\", ""), 1)

    out = []
    with sync_playwright() as pw:
        br = pw.chromium.launch(headless=True, executable_path=EXE,
                                args=["--disable-dev-shm-usage", "--no-sandbox", "--disable-gpu"])
        ctx = br.new_context(viewport={"width": 1280, "height": 900})
        page = ctx.new_page()
        for c in cases:
            html = build(carriers[c["carrier"]], c["frag"])
            rec = {k: c[k] for k in ("pid", "cat", "lang", "mech", "family")}
            try:
                page.set_content(html, wait_until="load")
                r = page.evaluate(JS)
                hidden_text = " ".join(h["text"] for h in r.get("hidden", []))
                rec["fired"] = r.get("n_hidden", 0) > 0
                rec["recovered"] = norm(c["text"]) in norm(hidden_text) if norm(c["text"]) else False
                rec["uni"] = sum((r.get("unicode") or {}).values())
                rec["attr"] = r.get("n_attr", 0)
            except Exception as e:
                rec["error"] = repr(e)[:100]
            # static channels on the same document
            fd, tmp = tempfile.mkstemp(suffix=".html"); os.close(fd)
            open(tmp, "w", encoding="utf-8").write(html)
            try:
                s = S.scan_doc(tmp)
                rec["static_render"] = s["n_flags"] > 0
                rec["static_comment"] = s["n_comments"] > 0
            except Exception as e:
                rec["static_err"] = repr(e)[:80]
            os.unlink(tmp)
            rec["stage2_on_recovered"] = stage2.detect(hidden_text)[0] if rec.get("recovered") else False
            out.append(rec)
        br.close()

    json.dump(out, open(os.path.join(HERE, out_file), "w"), ensure_ascii=False, indent=1)
    # summary
    def rate(sub, key):
        return (sum(1 for r in sub if r.get(key)), len(sub))
    for fam in ("covered", "uncovered"):
        sub = [r for r in out if r["family"] == fam]
        print(f"{fam:10} n={len(sub):2} fired={rate(sub,'fired')} recovered={rate(sub,'recovered')} "
              f"stage2={rate(sub,'stage2_on_recovered')}")
    for mech in list(COVERED) + list(UNCOVERED):
        sub = [r for r in out if r["mech"] == mech]
        if sub:
            print(f"  {mech:18} fired={rate(sub,'fired')} rec={rate(sub,'recovered')} stage2={rate(sub,'stage2_on_recovered')}")
    instr = [r for r in out if r["cat"] == "instruction"]
    data = [r for r in out if r["cat"] == "data_injection"]
    print(f"instruction n={len(instr)} stage2={rate(instr,'stage2_on_recovered')} fired={rate(instr,'fired')}")
    print(f"data_inj    n={len(data)} stage2={rate(data,'stage2_on_recovered')} fired={rate(data,'fired')}")
    print("errors", sum(1 for r in out if "error" in r))

if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "payloads.json"),
         sys.argv[2] if len(sys.argv) > 2 else "inject_results.json")
