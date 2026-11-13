"""Redact board identities from a fetch manifest before publication.

The published manifest keeps every provenance scalar that makes the run
checkable (ats, job id, fetched_at, byte size, per-page SHA-256) and drops the
three fields that name an employer: `board`, `url` and the board segment inside
`key`. The board becomes `board_hash`, a salted SHA-256 prefix, so rows still
group by employer for anyone holding the local salt and group by nothing for
everyone else.

Usage:
    python redact_manifest.py --in=data/f4/manifest.raw.jsonl \\
        --out=results/render-2026-11-10.manifest.jsonl \\
        --salt=data/f4/board-salt.txt

The salt is generated locally and never committed, same rule as F5's sender
salt. Without it the hash is not reversible; with it the board list is exactly
the one in data/f4/boards.txt.
"""
import argparse
import hashlib
import json
import sys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", dest="dst", required=True)
    ap.add_argument("--salt", required=True)
    args = ap.parse_args()

    with open(args.salt, encoding="utf-8") as fh:
        salt = fh.read().strip()
    if len(salt) < 32:
        print("REFUSING: salt shorter than 32 chars", file=sys.stderr)
        return 2

    rows = []
    with open(args.src, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            board = rec.pop("board", "")
            rec.pop("url", None)
            key = rec.get("key", "")
            parts = key.split(":")
            rec["key"] = f"{rec.get('ats', parts[0])}:{rec.get('job_id', parts[-1])}"
            digest = hashlib.sha256(f"{salt}{rec.get('ats', '')}:{board}".encode("utf-8"))
            rec["board_hash"] = digest.hexdigest()[:12]
            rows.append(
                {
                    "key": rec["key"],
                    "ats": rec.get("ats", ""),
                    "job_id": rec.get("job_id", ""),
                    "board_hash": rec["board_hash"],
                    "bytes": rec.get("bytes"),
                    "sha256": rec.get("sha256", ""),
                    "fetched_at": rec.get("fetched_at", ""),
                }
            )

    with open(args.dst, "w", encoding="utf-8", newline="\n") as fh:
        for rec in rows:
            fh.write(json.dumps(rec, ensure_ascii=False) + "\n")

    boards = {r["board_hash"] for r in rows}
    ats = sorted({r["ats"] for r in rows})
    print(f"rows {len(rows)} boards {len(boards)} ats {','.join(ats)}")
    print(f"wrote {args.dst}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
