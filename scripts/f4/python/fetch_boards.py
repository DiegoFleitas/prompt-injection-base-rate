"""Fetch a matched corpus for the base-rate study: job-board pages an agent ingests.

Sampling: systematic from the API's own ordering (id-sorted), cap per board.
Provenance recorded per posting: ats, board, job id, url, title, fetched_at,
content sha256, byte size. Raw HTML kept for re-adjudication.

Usage: python fetch_boards.py [cap_per_board]
Prints digests only.
"""
import json, os, sys, time, hashlib, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "raw_html"); os.makedirs(RAW, exist_ok=True)
MAN = os.path.join(HERE, "corpus_manifest.jsonl")
UA = {"User-Agent": "Mozilla/5.0 (academic base-rate measurement; local)"}
CAP = int(sys.argv[1]) if len(sys.argv) > 1 else 40

BOARDS = [("greenhouse", b) for b in
          ["stripe", "databricks", "anthropic", "coinbase", "gitlab", "robinhood", "figma", "instacart"]] + \
         [("lever", b) for b in ["palantir", "spotify"]] + \
         [("ashby", b) for b in ["openai", "notion", "vanta", "linear"]]


def get(url, timeout=40):
    for a in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read()
        except Exception as e:
            if a == 2:
                print("FETCHFAIL", url[:90], repr(e)[:80])
                return None
            time.sleep(3)


def gh(board):
    b = get(f"https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true")
    if not b: return []
    out = []
    for j in json.loads(b)["jobs"]:
        out.append({"id": str(j["id"]), "url": j.get("absolute_url", ""),
                    "title": (j.get("title") or "").strip(),
                    "html": j.get("content") or ""})
    return out


def lever(board):
    b = get(f"https://api.lever.co/v0/postings/{board}?mode=json")
    if not b: return []
    out = []
    for j in json.loads(b):
        html = (j.get("description") or "") + (j.get("descriptionBody") or "") + \
               "".join(j.get("lists", []) and [x.get("content", "") for x in j.get("lists", [])] or [])
        out.append({"id": str(j.get("id")), "url": j.get("hostedUrl", ""),
                    "title": (j.get("text") or "").strip(), "html": html})
    return out


def ashby(board):
    b = get(f"https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true")
    if not b: return []
    out = []
    for j in json.loads(b).get("jobs", []):
        out.append({"id": str(j.get("id")), "url": j.get("jobUrl", ""),
                    "title": (j.get("title") or "").strip(),
                    "html": j.get("descriptionHtml") or ""})
    return out


FETCH = {"greenhouse": gh, "lever": lever, "ashby": ashby}
done = set()
if os.path.exists(MAN):
    for line in open(MAN, encoding="utf-8"):
        try: done.add(json.loads(line)["key"])
        except Exception: pass

n_new = 0
with open(MAN, "a", encoding="utf-8") as man:
    for ats, board in BOARDS:
        try:
            rows = sorted([r for r in FETCH[ats](board) if r["html"]], key=lambda r: r["id"])
        except Exception as e:
            print("BOARDFAIL", ats, board, repr(e)[:80]); continue
        if not rows:
            print("EMPTY", ats, board); continue
        k = max(1, len(rows) // CAP)                      # systematic
        picked = rows[::k][:CAP]
        for r in picked:
            key = f"{ats}:{board}:{r['id']}"
            if key in done: continue
            body = r["html"].encode("utf-8")
            fn = f"{ats}_{board}_{r['id']}.html"
            open(os.path.join(RAW, fn), "wb").write(body)
            rec = {"key": key, "ats": ats, "board": board, "job_id": r["id"],
                   "url": r["url"], "title": r["title"], "file": fn,
                   "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest(),
                   "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
            man.write(json.dumps(rec, ensure_ascii=False) + "\n"); man.flush()
            n_new += 1
        print("BOARD", ats, board, "avail", len(rows), "picked", len(picked))

tot = sum(1 for _ in open(MAN, encoding="utf-8"))
print("NEW", n_new, "TOTAL", tot)
