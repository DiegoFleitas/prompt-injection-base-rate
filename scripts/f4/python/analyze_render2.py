"""Aggregate render-scan shards. HASH-ONLY: never prints or stores raw concealed text.

Writes render_summary.json + hidden_index.json (sha256 prefix, length, count,
mechanism, tag, stage-2 verdict). Prints digests only.
"""
import json, glob, os, statistics, collections, hashlib, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import stage2

rows, seen = [], set()
for f in sorted(glob.glob(os.path.join(HERE, "render_scan*.jsonl"))):
    for l in open(f, encoding="utf-8"):
        try: r = json.loads(l)
        except Exception: continue
        if "error" in r or r["key"] in seen: continue
        seen.add(r["key"]); rows.append(r)

def h(s): return hashlib.sha256(s.encode("utf-8")).hexdigest()[:16]
def wilson(k, n, z=1.96):
    if n == 0: return (0.0, 0.0)
    p = k / n; d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    half = z * (p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5 / d
    return (max(0.0, c - half), min(1.0, c + half))

n = len(rows)
pred = collections.Counter()
idx = {}
for r in rows:
    for hid in r.get("hidden", []):
        t = hid.get("text", "")
        k = h(t)
        e = idx.setdefault(k, {"sha16": k, "len": len(t), "docs": 0, "mech": collections.Counter(),
                               "tags": collections.Counter(), "in_main": 0,
                               "stage2": False, "cues": []})
        e["docs"] += 1
        for w in hid.get("why", []): e["mech"][w] += 1; pred[w] += 1
        e["tags"][hid.get("tag", "")] += 1
        e["in_main"] += 1 if hid.get("in_main") else 0
        hit, cues = stage2.detect(t)
        if hit:
            e["stage2"] = True; e["cues"] = sorted(set(e["cues"]) | set(cues))
for e in idx.values():
    e["mech"] = dict(e["mech"]); e["tags"] = dict(e["tags"])

docs_hidden = [r for r in rows if r.get("n_hidden", 0) > 0]
docs_hidden_main = [r for r in rows if any(x.get("in_main") for x in r.get("hidden", []))]
docs_s2 = [r for r in rows if any(stage2.detect(x.get("text", ""))[0] for x in r.get("hidden", []))]
docs_uni = [r for r in rows if r.get("unicode")]
docs_attr = [r for r in rows if r.get("n_attr", 0) > 0]
uniq_s2 = [e for e in idx.values() if e["stage2"]]

cps = collections.Counter()
for r in rows:
    for k, v in (r.get("unicode") or {}).items(): cps[k] += v
gaps = [r.get("tc", 0) - r.get("inner", 0) for r in rows]

summary = {
    "n_docs": n,
    "docs_hidden": len(docs_hidden), "docs_hidden_ci": wilson(len(docs_hidden), n),
    "docs_hidden_main": len(docs_hidden_main), "docs_hidden_main_ci": wilson(len(docs_hidden_main), n),
    "docs_hidden_stage2": len(docs_s2), "docs_hidden_stage2_ci": wilson(len(docs_s2), n),
    "docs_unicode": len(docs_uni), "docs_unicode_ci": wilson(len(docs_uni), n),
    "docs_attr": len(docs_attr), "docs_attr_ci": wilson(len(docs_attr), n),
    "hidden_spans": sum(r.get("n_hidden", 0) for r in rows),
    "unique_hidden_strings": len(idx), "unique_stage2": len(uniq_s2),
    "predicates": dict(pred), "unicode_codepoints": dict(cps),
    "median_inner_chars": statistics.median([r.get("inner", 0) for r in rows]) if rows else 0,
    "median_tc_minus_inner": statistics.median(gaps) if gaps else 0,
    "p90_tc_minus_inner": sorted(gaps)[int(.9 * len(gaps))] if gaps else 0,
    "by_ats": {},
    "stage2_cue_counts": dict(collections.Counter(c for e in idx.values() for c in e["cues"])),
}
for a in sorted({r["ats"] for r in rows}):
    sub = [r for r in rows if r["ats"] == a]
    summary["by_ats"][a] = {"n": len(sub),
                            "hidden": sum(1 for r in sub if r.get("n_hidden", 0) > 0),
                            "stage2": sum(1 for r in sub if any(stage2.detect(x.get("text", ""))[0] for x in r.get("hidden", [])))}
json.dump(summary, open(os.path.join(HERE, "render_summary.json"), "w"), indent=1)
json.dump(sorted(idx.values(), key=lambda e: -e["docs"]), open(os.path.join(HERE, "hidden_index.json"), "w"), indent=1)

print(f"docs {n}")
print(f"hidden  {len(docs_hidden):4} {100*len(docs_hidden)/max(n,1):5.1f}%  CI {[round(x,4) for x in summary['docs_hidden_ci']]}")
print(f"in-main {len(docs_hidden_main):4} {100*len(docs_hidden_main)/max(n,1):5.1f}%  CI {[round(x,4) for x in summary['docs_hidden_main_ci']]}")
print(f"stage2  {len(docs_s2):4} {100*len(docs_s2)/max(n,1):5.1f}%  unique-strings {len(uniq_s2)}/{len(idx)}")
print(f"unicode {len(docs_uni):4}   attr {len(docs_attr):4}   spans {summary['hidden_spans']}")
print("predicates", dict(pred.most_common(10)))
print("unicode cps", dict(cps.most_common(6)))
print("by ats", summary["by_ats"])
print(f"inner chars median {summary['median_inner_chars']}  tc-inner median {summary['median_tc_minus_inner']} p90 {summary['p90_tc_minus_inner']}")
print("top hashes (sha16, len, docs, mech, in_main_docs, stage2):")
for e in sorted(idx.values(), key=lambda e: -e["docs"])[:8]:
    print(f"  {e['sha16']} len={e['len']:4} docs={e['docs']:4} {list(e['mech'])[:2]} main={e['in_main']:3} s2={e['stage2']}")
