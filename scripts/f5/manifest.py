#!/usr/bin/env python3
"""F5 corpus manifest — headers only, no text.

    python3 scripts/f5/manifest.py --root=data/f5/corpus \
        --out=data/f5/corpus-manifest.csv \
        --salt=data/f5/salt.txt --self=data/f5/self-addresses.txt

Walks the local snapshot (Thunderbird mbox + .eml tree), hashes each message and
writes one row per unique message id. Only header-derived scalars leave this
script: month, salted sender hash, self flag, size and SHA-256. Subjects, display
names and raw addresses are never copied into the CSV or into stdout.

`id` is the first 16 hex chars of SHA-256 over the Message-ID, falling back to
the raw header block when a message has none. Rows that share an id are the same
message seen twice (mailbox + archive); the first occurrence wins and the count
is reported, not written, so the manifest stays one row per message.
"""

import argparse
import csv
import hashlib
import re
import sys
from email import policy
from email.parser import BytesParser
from email.utils import parseaddr, parsedate_to_datetime
from pathlib import Path

ENVELOPE = re.compile(rb"(?m)^From - .*$")
HEADER_END = re.compile(rb"\r?\n\r?\n")


def strip_envelope(raw):
    newline = raw.find(b"\n")
    return raw[newline + 1:] if newline >= 0 else b""


def header_block(raw):
    match = HEADER_END.search(raw)
    return raw[:match.start()] if match else raw


def iter_mbox(path):
    blob = path.read_bytes()
    starts = [m.start() for m in ENVELOPE.finditer(blob)]
    for index, start in enumerate(starts):
        end = starts[index + 1] if index + 1 < len(starts) else len(blob)
        yield strip_envelope(blob[start:end])


def iter_eml(root):
    for path in sorted(root.rglob("*.eml")):
        yield path.read_bytes()


def summarise(raw, source, salt, self_addresses):
    headers = BytesParser(policy=policy.default).parsebytes(raw, headersonly=True)
    message_id = (headers.get("Message-ID") or "").strip()
    seed = message_id.encode("utf-8") if message_id else header_block(raw)
    record_id = hashlib.sha256(seed).hexdigest()[:16]

    address = parseaddr(headers.get("From", ""))[1].strip().lower()
    from_hash = (
        hashlib.sha256((salt + address).encode("utf-8")).hexdigest()[:16]
        if address
        else ""
    )

    month = ""
    date_header = headers.get("Date") or ""
    try:
        month = parsedate_to_datetime(date_header).strftime("%Y-%m")
    except (TypeError, ValueError):
        month = ""

    return {
        "id": record_id,
        "source": source,
        "sha256": hashlib.sha256(raw).hexdigest(),
        "size": len(raw),
        "date_month": month,
        "from_hash": from_hash,
        "self": int(address in self_addresses),
        "message_id_present": int(bool(message_id)),
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, help="snapshot dir (data/f5/corpus)")
    parser.add_argument("--out", required=True, help="CSV path")
    parser.add_argument("--salt", required=True, help="local salt file")
    parser.add_argument("--self", required=True, help="self-address list")
    parser.add_argument(
        "--corpus-sha256",
        help="optional: write per-file hashes (sha256sum format) and print the "
             "aggregate snapshot digest",
    )
    args = parser.parse_args(argv)

    root = Path(args.root)
    salt = Path(args.salt).read_text(encoding="utf-8").strip()
    self_addresses = {
        line.strip().lower()
        for line in Path(args.self).read_text(encoding="utf-8").splitlines()
        if line.strip()
    }

    rows, seen, duplicates = [], set(), 0
    per_source = {"mbox": 0, "eml": 0}

    for path in sorted(root.glob("mbox/*.mbox")):
        for raw in iter_mbox(path):
            per_source["mbox"] += 1
            row = summarise(raw, "mbox", salt, self_addresses)
            if row["id"] in seen:
                duplicates += 1
                continue
            seen.add(row["id"])
            rows.append(row)

    for raw in iter_eml(root / "eml"):
        per_source["eml"] += 1
        row = summarise(raw, "eml", salt, self_addresses)
        if row["id"] in seen:
            duplicates += 1
            continue
        seen.add(row["id"])
        rows.append(row)

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=[
                "id", "source", "sha256", "size", "date_month",
                "from_hash", "self", "message_id_present",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)

    if args.corpus_sha256:
        entries = []
        for path in sorted(p for p in root.rglob("*") if p.is_file()):
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            entries.append(f"{digest}  {path.relative_to(root).as_posix()}")
        hash_file = Path(args.corpus_sha256)
        hash_file.parent.mkdir(parents=True, exist_ok=True)
        with hash_file.open("w", newline="\n", encoding="utf-8") as fh:
            fh.write("\n".join(entries) + "\n")
        snapshot = hashlib.sha256(hash_file.read_bytes()).hexdigest()
        print(f"corpus sha256   : {hash_file} ({len(entries)} files)")
        print(f"snapshot digest : {snapshot}")

    months = sorted({row["date_month"] for row in rows if row["date_month"]})
    senders = {row["from_hash"] for row in rows if row["from_hash"]}
    print(f"messages read   : {sum(per_source.values())} "
          f"(mbox {per_source['mbox']}, eml {per_source['eml']})")
    print(f"unique ids      : {len(rows)}")
    print(f"duplicate hits  : {duplicates}")
    print(f"self-sent rows  : {sum(row['self'] for row in rows)}")
    print(f"no Message-ID   : {sum(1 for row in rows if not row['message_id_present'])}")
    print(f"no month        : {sum(1 for row in rows if not row['date_month'])}")
    print(f"distinct senders: {len(senders)}")
    print(f"months          : {months[0] if months else '-'} .. {months[-1] if months else '-'}")
    print(f"written         : {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
