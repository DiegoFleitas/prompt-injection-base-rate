"""PPV arithmetic for the two detector designs, from measured prevalence + FPR + sensitivity.

Inputs: render_summary.json (prevalence, FPR), inject_results.json (sensitivity).
Prints a digest table. MODELED numbers are labeled; MEASURED ones carry n and CI.
"""
import json, os, math, sys

HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(os.path.join(HERE, "render_summary.json"), encoding="utf-8"))
n = S["n_docs"]

def ppv(p, sens, fpr):
    den = p * sens + (1 - p) * fpr
    return (p * sens / den) if den else float("nan")

def rule3(nn): return 3.0 / nn

def rate_from_inject():
    f = os.path.join(HERE, "inject_results.json")
    if not os.path.exists(f): return None
    rows = json.load(open(f, encoding="utf-8"))
    out = {}
    for fam in ("covered", "uncovered"):
        sub = [r for r in rows if r["family"] == fam]
        out[fam] = {"n": len(sub), "fired": sum(1 for r in sub if r.get("fired")),
                    "recovered": sum(1 for r in sub if r.get("recovered"))}
    instr = [r for r in rows if r["cat"] == "instruction"]
    data = [r for r in rows if r["cat"] == "data_injection"]
    other = [r for r in rows if r["cat"] == "other"]
    out["instr"] = {"n": len(instr), "s2": sum(1 for r in instr if r.get("stage2_on_recovered")),
                    "fired": sum(1 for r in instr if r.get("fired"))}
    out["data"] = {"n": len(data), "s2": sum(1 for r in data if r.get("stage2_on_recovered"))}
    out["other"] = {"n": len(other), "s2": sum(1 for r in other if r.get("stage2_on_recovered"))}
    out["all"] = {"n": len(rows)}
    return out

fpr_A = S["docs_hidden"] / n                     # concealment-only, doc level (MEASURED)
fpr_B = rule3(n)                                  # concealment AND instruction, 0 observed -> 95% UB
inj = rate_from_inject()
sens_B_ub = None
if inj:
    sens_B_ub = inj["instr"]["s2"] / max(inj["instr"]["n"], 1)

print(f"MEASURED  n={n}  concealment doc-rate {fpr_A:.3f}  instruction-carrying {S['docs_hidden_stage2']}/{n} "
      f"(95% UB {fpr_B:.4f})")
if inj:
    print(f"HELD-OUT  n={inj['all']['n']} cases: covered-mech fired {inj['covered']['fired']}/{inj['covered']['n']}, "
          f"recovered {inj['covered']['recovered']}/{inj['covered']['n']}; uncovered-mech fired "
          f"{inj['uncovered']['fired']}/{inj['uncovered']['n']}")
    print(f"HELD-OUT  instruction payloads end-to-end {inj['instr']['s2']}/{inj['instr']['n']}; "
          f"data-injection end-to-end {inj['data']['s2']}/{inj['data']['n']}")
print()
print(f"{'prevalence':>10} {'design':>26} {'sens':>6} {'FPR':>7} {'PPV':>7}")
for p in (0.01, 0.001, fpr_B):
    print(f"{p:10.4f} {'concealment only (channel)':>26} {1.0:6.2f} {fpr_A:7.3f} {ppv(p, 1.0, fpr_A):7.3f}")
    if sens_B_ub is not None:
        print(f"{p:10.4f} {'concealment + stage-2':>26} {sens_B_ub:6.2f} {fpr_B:7.4f} {ppv(p, sens_B_ub, fpr_B):7.3f}")
if inj:
    mix = 0.905 * (inj["data"]["s2"] / max(inj["data"]["n"], 1)) + 0.095 * sens_B_ub
    print(f"\nZhang-mixture sensitivity (90.5% data injection, 9.5% instruction) = {mix:.3f} (MODELED)")
    for p in (0.01, 0.001):
        print(f"  p={p:.3f} stage-2 with mixture sens {mix:.3f}, FPR {fpr_B:.4f} -> PPV {ppv(p, mix, fpr_B):.3f}")
print(f"\nrejecting a 1% instruction base rate with 0/{n}: P(0|p=0.01) = {math.exp(n*math.log(0.99)):.4f}")
