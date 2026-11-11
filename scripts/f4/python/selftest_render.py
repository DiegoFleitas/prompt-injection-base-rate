"""Negative control for the browser detector: visible-only pages must yield 0 concealed spans."""
import glob, os, sys
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
JS = open(os.path.join(HERE, "render_pred.js"), encoding="utf-8").read()
EXE = sorted(glob.glob(os.path.expandvars(r"%LOCALAPPDATA%/ms-playwright/chromium-*/chrome-win64/chrome.exe")))[-1]

PAGES = {
 "plain": "<html><body><h1>Job</h1><p>We are hiring a data analyst in Montevideo.</p></body></html>",
 "styled_visible": "<html><body><div style='color:#333;background:#fff'>Visible paragraph text</div>"
                   "<span style='position:absolute;left:20px;top:40px'>Positioned but visible</span></body></html>",
 "aria_hidden_visible": "<html><body><span aria-hidden='true'>Decorative but visible text</span></body></html>",
 "emoji_zwj": "<html><body><p>We love \U0001F468\u200D\U0001F4BB builders</p></body></html>",
 "large_text": "<html><body><p style='font-size:24px'>Large visible text block</p></body></html>",
}
with sync_playwright() as pw:
    br = pw.chromium.launch(headless=True, executable_path=EXE, args=["--no-sandbox"])
    pg = br.new_context(viewport={"width": 1280, "height": 900}).new_page()
    bad = 0
    for k, h in PAGES.items():
        pg.set_content(h, wait_until="load")
        r = pg.evaluate(JS)
        exp = 1 if k == "emoji_zwj" else 0   # emoji ZWJ fires the unicode channel by design
        ok = (r.get("n_hidden", 0) == 0) and (sum((r.get("unicode") or {}).values()) == exp)
        bad += (not ok)
        print(f"{'PASS' if ok else 'FAIL':4} {k:16} hidden={r.get('n_hidden')} unicode={sum((r.get('unicode') or {}).values())}")
    br.close()
print("FAILS", bad)
sys.exit(1 if bad else 0)
