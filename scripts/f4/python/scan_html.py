"""Scan job-board HTML (as served by ATS syndication APIs) for concealment channels.

Channels:
  render_css   text present in the DOM but not visible to a sighted reader
               (display:none, visibility:hidden, font-size<=1px, opacity:0,
                color==background, off-screen positioning, clip/sr-only idiom,
                collapsed zero-height box)
  unicode      invisible codepoints inside text (Cf/Zs/VS/tag chars, soft hyphen)
  comment      prose in HTML comments
  attr         long text in aria-label/title/alt/data-* attributes

Prints aggregates only. Per-doc detail goes to html_scan.json.
"""
import json, os, re, sys, hashlib
from html.parser import HTMLParser

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw_html")

INVIS = set([0x00AD, 0x034F, 0x061C, 0x115F, 0x1160, 0x17B4, 0x17B5, 0x180E,
             0x200B, 0x200C, 0x200D, 0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E,
             0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0x2066, 0x2067, 0x2068, 0x2069,
             0x2800, 0x3164, 0xFEFF, 0xFFA0, 0xFE00, 0xFE01, 0xFE02, 0xFE03, 0xFE04, 0xFE05,
             0xFE06, 0xFE07, 0xFE08, 0xFE09, 0xFE0A, 0xFE0B, 0xFE0C, 0xFE0D, 0xFE0E, 0xFE0F]) | \
        set(range(0xE0100, 0xE01F0)) | set(range(0xE0000, 0xE0080))

TEXTISH_ATTRS = ("aria-label", "title", "alt", "placeholder", "data-text", "data-content")

# --- CSS ---
def parse_css(text):
    """Return (rules, n_unsupported). rule = (selector, specificity, order, decls)."""
    rules, bad, order = [], 0, 0
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    for m in re.finditer(r"([^{}]+)\{([^{}]*)\}", text):
        sels, body = m.group(1).strip(), m.group(2)
        decls = {}
        for d in body.split(";"):
            if ":" in d:
                k, v = d.split(":", 1)
                decls[k.strip().lower()] = v.strip().lower()
        if not decls:
            continue
        for sel in sels.split(","):
            sel = sel.strip()
            if not sel or re.search(r"[\s>+~:\[\]@]", sel.replace("::", ":")):
                bad += 1
                continue
            ids = sel.count("#"); cls = sel.count("."); tags = 1 if re.match(r"^[a-zA-Z]", sel) else 0
            order += 1
            rules.append((sel, (ids, cls, tags), order, decls))
    return rules, bad


def sel_match(sel, tag, attrs):
    cls_set = set((attrs.get("class") or "").split())
    idv = attrs.get("id") or ""
    body = sel
    if "#" in body:
        i = body.index("#"); idv_sel = body[i + 1:].split(".")[0]; body = body[:i] + body[i + 1 + len(idv_sel):]
        if idv != idv_sel: return False
    for c in (body.split(".")[1:] if "." in body else []):
        if c and c not in cls_set: return False
    tagpart = body.split(".")[0]
    if tagpart and tagpart != "*" and tagpart.lower() != tag: return False
    return True


def px(v):
    m = re.match(r"^(-?[\d.]+)\s*(px|pt|em|rem|%)?$", v.strip())
    if not m: return None
    n = float(m.group(1)); u = m.group(2) or "px"
    return n * {"px": 1, "pt": 1.333, "em": 16, "rem": 16, "%": 0.16}.get(u, 1)


def colors_equal(a, b):
    norm = lambda c: re.sub(r"\s+", "", c.lower())
    if not a or not b: return False
    a, b = norm(a), norm(b)
    if a in ("transparent", "rgba(0,0,0,0)") or b in ("transparent", "rgba(0,0,0,0)"): return True
    short = {"#fff": "#ffffff", "#000": "#000000"}
    return short.get(a, a) == short.get(b, b)


class Dom:
    __slots__ = ("tag", "attrs", "children", "parent")
    def __init__(self, tag, attrs, parent):
        self.tag, self.attrs, self.children, self.parent = tag, dict(attrs), [], parent


class P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Dom("#root", {}, None); self.stack = [self.root]
        self.styles = []; self.in_style = False; self.comments = []; self.raw = []
    def handle_starttag(self, tag, attrs):
        if tag in ("br", "img", "hr", "meta", "link", "input", "source"):
            self.stack[-1].children.append(Dom(tag, attrs, self.stack[-1])); return
        if tag == "style": self.in_style = True; self.styles.append("")
        d = Dom(tag, attrs, self.stack[-1]); self.stack[-1].children.append(d); self.stack.append(d)
    def handle_endtag(self, tag):
        if tag == "style": self.in_style = False
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]; break
    def handle_data(self, data):
        if self.in_style: self.styles[-1] += data; return
        self.raw.append(data)
        clean = "".join(ch for ch in data if ord(ch) not in INVIS)
        if clean.strip(): self.stack[-1].children.append(clean)
    def handle_comment(self, data):
        if len(data.strip()) >= 20: self.comments.append(data.strip())


def subtree_text(node, skip_hidden=True, eff=None):
    out = []
    for c in node.children:
        if isinstance(c, str):
            out.append(c)
        elif c.tag not in ("style", "script"):
            if skip_hidden and eff is not None:
                e = effective(c, eff)
                if e.get("_hidden"): continue
            out.append(subtree_text(c, skip_hidden, eff))
    return " ".join(x for x in out if x)


INHERIT = ("color", "font-size", "visibility", "background-color")


def effective(node, parent_eff, rules=None, matched_cache=None):
    e = {k: parent_eff.get(k) for k in INHERIT}
    e["_hidden"] = parent_eff.get("_hidden", False)
    e["_vis_hidden"] = parent_eff.get("_vis_hidden", False)
    e["_why"] = parent_eff.get("_why")
    decls_all = []
    if rules:
        for sel, spec, order, decls in rules:
            if sel_match(sel, node.tag, node.attrs):
                decls_all.append((spec, order, decls))
        decls_all.sort(key=lambda t: (t[0], t[1]))
    for _, _, d in decls_all:
        e.update(d)
    inline = node.attrs.get("style")
    if inline:
        for d in inline.split(";"):
            if ":" in d:
                k, v = d.split(":", 1)
                e[k.strip().lower()] = v.strip().lower()
    if node.attrs.get("hidden") is not None:
        e["display"] = "none"
    # concealment predicates
    why = []
    if e.get("display", "") == "none": why.append("display_none")
    if e.get("visibility", "") in ("hidden", "collapse"): why.append("visibility_hidden")
    fs = px(e.get("font-size") or "")
    if fs is not None and fs <= 1.0: why.append("tiny_font")
    op = e.get("opacity")
    if op not in (None, ""):
        try:
            if float(op) == 0: why.append("opacity0")
        except ValueError: pass
    col = (e.get("color") or "").strip()
    bg = (e.get("background-color") or e.get("background") or "").strip()
    if col and (col in ("transparent", "rgba(0,0,0,0)") or "alpha=0" in col):
        why.append("transparent_color")
    elif col and bg and colors_equal(col, bg):
        why.append("color_eq_bg")
    ti = px(e.get("text-indent") or "")
    if ti is not None and ti <= -500: why.append("text_indent_offscreen")
    pos = e.get("position", "")
    for k in ("left", "top", "margin-left", "margin-top"):
        v = px(e.get(k) or "")
        if v is not None and v <= -500 and (pos in ("absolute", "fixed") or "margin" in k):
            why.append(f"{k}_offscreen"); break
    clip = (e.get("clip") or "").replace(" ", "")
    cp = (e.get("clip-path") or "").replace(" ", "")
    if "rect(0,0,0,0)" in clip or "rect(1px,1px,1px,1px)" in clip or "inset(50%)" in cp or "inset(100%)" in cp:
        why.append("clip_rect")
    w, h = px(e.get("width") or ""), px(e.get("height") or "")
    if e.get("overflow", "") == "hidden" and w is not None and h is not None and w <= 1.5 and h <= 1.5:
        why.append("sr_only_box")
    if e.get("overflow", "") == "hidden" and h is not None and h <= 0.5 and (w is None or w > 1.5):
        why.append("zero_height")
    if why: e["_hidden"] = True; e["_why"] = why
    vis_hidden_here = e.get("visibility", "") in ("hidden", "collapse")
    if (vis_hidden_here or e["_vis_hidden"]) and e.get("_hidden"):
        e["_vis_hidden"] = True
    if not vis_hidden_here and e["_vis_hidden"] and e.get("visibility") == "visible" \
            and all(w in ("visibility_hidden",) for w in (e.get("_why") or [])):
        e["_hidden"] = False; e["_vis_hidden"] = False; e["_why"] = None
    return e


def scan_doc(path):
    src = open(path, encoding="utf-8", errors="replace").read()
    p = P(); p.feed(src)
    rules, bad_rules = parse_css("\n".join(p.styles)) if p.styles else ([], 0)

    flags = []

    def walk(node, eff, depth):
        for c in node.children:
            if isinstance(c, str) or c.tag in ("style", "script"):
                continue
            e = effective(c, eff, rules)
            if e.get("_hidden") and not eff.get("_hidden"):
                txt = " ".join(subtree_text(c, skip_hidden=False).split())
                if len(re.sub(r"[^0-9A-Za-z\u00C0-\uFFFF]", "", txt)) >= 3:
                    flags.append({"channel": "render_css", "why": e.get("_why"),
                                  "tag": c.tag, "text": txt[:400]})
            walk(c, e, depth + 1)

    walk(p.root, {}, 0)
    body_text = " ".join(subtree_text(p.root, skip_hidden=False).split())

    # unicode channel (raw text before invisible-codepoint stripping)
    uni = {}
    for ch in "".join(p.raw):
        if ord(ch) in INVIS: uni[hex(ord(ch))] = uni.get(hex(ord(ch)), 0) + 1

    # attr channel
    attr_hits = []
    def walkattrs(node):
        for c in node.children:
            if isinstance(c, str): continue
            for a in TEXTISH_ATTRS:
                v = c.attrs.get(a) or ""
                if len(re.sub(r"[^0-9A-Za-z]", "", v)) >= 40:
                    attr_hits.append({"attr": a, "tag": c.tag, "len": len(v), "text": v[:200]})
            walkattrs(c)
    walkattrs(p.root)

    return {"bytes": len(src), "chars_text": len(body_text),
            "n_flags": len(flags), "flags": flags[:12],
            "hidden_chars": sum(len(f["text"]) for f in flags),
            "unicode": uni, "n_unicode": sum(uni.values()),
            "comments": p.comments[:5], "n_comments": len(p.comments),
            "attr_hits": attr_hits[:5], "n_attr": len(attr_hits),
            "css_rules": len(rules), "css_unsupported": bad_rules}


def main():
    man = [json.loads(l) for l in open(os.path.join(HERE, "corpus_manifest.jsonl"), encoding="utf-8")]
    out = []
    for r in man:
        try:
            s = scan_doc(os.path.join(RAW, r["file"]))
        except Exception as e:
            s = {"error": repr(e)[:120]}
        s.update({k: r[k] for k in ("key", "ats", "board", "job_id", "url", "title")})
        out.append(s)
    json.dump(out, open(os.path.join(HERE, "html_scan.json"), "w"), ensure_ascii=False, indent=1)

    n = len(out)
    ok = [o for o in out if "error" not in o]
    def docs(pred): return sum(1 for o in ok if pred(o))
    print(f"{'docs':12} {n}")
    print(f"{'scanned':12} {len(ok)}")
    print(f"{'render_css':12} {docs(lambda o: o['n_flags'] > 0)}")
    print(f"{'unicode':12} {docs(lambda o: o['n_unicode'] > 0)}")
    print(f"{'comment':12} {docs(lambda o: o['n_comments'] > 0)}")
    print(f"{'attr':12} {docs(lambda o: o['n_attr'] > 0)}")
    print("-- predicates --")
    from collections import Counter
    c = Counter()
    for o in ok:
        for f in o["flags"]:
            for w in (f["why"] or []): c[w] += 1
    for k, v in c.most_common(12): print(f"  {k:22} {v}")
    print("-- css coverage --")
    print("  rules parsed", sum(o["css_rules"] for o in ok), "unsupported sels", sum(o["css_unsupported"] for o in ok),
          "docs with <style>", docs(lambda o: o["css_rules"] > 0))
    from statistics import median
    fm = [o["n_flags"] for o in ok if o["n_flags"]]
    print("  med flags/doc(hit)", median(fm) if fm else 0, "docs with >5 flags", docs(lambda o: o['n_flags'] > 5))


if __name__ == "__main__":
    main()
