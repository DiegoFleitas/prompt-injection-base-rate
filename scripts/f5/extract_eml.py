#!/usr/bin/env python3
"""F5 MIME extractor — local-only decode of the mail snapshot.

    python3 scripts/f5/extract_eml.py --root=data/f5/corpus \
        --out=data/f5/text --index=data/f5/index.csv \
        --salt=data/f5/salt.txt --self=data/f5/self-addresses.txt [--limit=3]

Writes one JSON per message under `--out` and one text-free row per message in
`--index`. Everything stays inside `data/f5/` (git-ignored): decoded bodies never
leave the machine and are deleted after the analysis run per `protocol-f5.md` §10.

Decoding rules, fixed before the first body was read: declared charset with
`errors="replace"`, `LookupError` falls back to UTF-8 and is recorded, quoted
`>` lines move to a secondary `plain_quoted` channel, attachments are hashed and
never extracted.
"""

import argparse
import csv
import hashlib
import json
import mailbox
import re
import sys
from email import policy
from email.parser import BytesParser
from email.utils import parsedate_to_datetime
from pathlib import Path

QUOTE = re.compile(r"^\s*>")


def record_id(rec, message_id):
    """Stable id: Message-ID when present, else a hash of the salted headers."""
    seed = message_id or json.dumps(rec["headers"], sort_keys=True)
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()[:16]


def extract(source, salt, self_addresses):
    """source: raw bytes, a path to an .eml, or a parsed Message."""
    if isinstance(source, bytes):
        msg = BytesParser(policy=policy.default).parsebytes(source)
    elif isinstance(source, (str, Path)):
        with open(source, "rb") as fh:
            msg = BytesParser(policy=policy.default).parse(fh)
    else:
        msg = source

    out = {"plain": [], "plain_quoted": [], "html": [], "headers": {},
           "attachments": [], "errors": []}

    address = (msg.get("From") or "").lower().rsplit("<", 1)[-1].strip("> \t")
    out["headers"]["from_hash"] = hashlib.sha256(
        (salt + address).encode("utf-8")).hexdigest()[:16]
    out["headers"]["self"] = int(address in self_addresses)
    date_header = msg.get("Date") or ""
    try:
        out["headers"]["month"] = parsedate_to_datetime(
            date_header).strftime("%Y-%m")
    except (TypeError, ValueError):
        out["headers"]["month"] = ""
        out["errors"].append("date:unparseable")

    for part in msg.walk():
        if part.is_multipart():
            continue
        ctype = part.get_content_type()
        payload = part.get_payload(decode=True)
        if not isinstance(payload, bytes):
            payload = b""
        if part.get_content_disposition() == "attachment":
            out["attachments"].append({
                "ctype": ctype,
                "bytes": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest()[:16],
            })
            continue
        charset = part.get_content_charset() or "utf-8"
        try:
            text = payload.decode(charset, errors="replace")
        except LookupError:
            text = payload.decode("utf-8", errors="replace")
            out["errors"].append(f"charset:{charset}")
        if ctype == "text/plain":
            body, quoted = [], []
            for line in text.splitlines():
                (quoted if QUOTE.match(line) else body).append(line)
            out["plain"].append("\n".join(body))
            if quoted:
                out["plain_quoted"].append("\n".join(quoted))
        elif ctype == "text/html":
            out["html"].append(text)

    for key in ("plain", "plain_quoted", "html"):
        out[key] = "\n".join(chunk for chunk in out[key] if chunk)
    return out


def write_record(rec, message_id, out_dir):
    rid = record_id(rec, message_id)
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    Path(out_dir, f"{rid}.json").write_text(
        json.dumps(rec, ensure_ascii=False), encoding="utf-8")
    return rid


def iter_messages(root):
    """Yield (source, Message) for the frozen snapshot, mbox first."""
    root = Path(root)
    for path in sorted(root.glob("mbox/*.mbox")):
        box = mailbox.mbox(str(path), create=False)
        try:
            for key in box.keys():
                yield "mbox", box.get_message(key)
        finally:
            box.close()
    for path in sorted((root / "eml").rglob("*.eml")):
        yield "eml", BytesParser(policy=policy.default).parsebytes(path.read_bytes())


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True)
    parser.add_argument("--out", required=True, help="decoded text dir (data/f5/text)")
    parser.add_argument("--index", required=True, help="text-free index CSV")
    parser.add_argument("--salt", required=True)
    parser.add_argument("--self", required=True)
    parser.add_argument("--limit", type=int, default=0, help="smoke run only")
    args = parser.parse_args(argv)

    salt = Path(args.salt).read_text(encoding="utf-8").strip()
    self_addresses = {
        line.strip().lower()
        for line in Path(args.self).read_text(encoding="utf-8").splitlines()
        if line.strip()
    }

    index_path = Path(args.index)
    index_path.parent.mkdir(parents=True, exist_ok=True)
    fields = ["id", "source", "month", "from_hash", "self",
              "plain_chars", "quoted_chars", "html_chars", "attachments", "errors"]

    written = errors = duplicates = 0
    seen = set()
    with index_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fields)
        writer.writeheader()
        for source, msg in iter_messages(args.root):
            if args.limit and written >= args.limit:
                break
            rec = extract(msg, salt, self_addresses)
            rid = record_id(rec, msg.get("Message-ID"))
            if rid in seen:
                duplicates += 1
                continue
            seen.add(rid)
            write_record(rec, msg.get("Message-ID"), args.out)
            writer.writerow({
                "id": rid,
                "source": source,
                "month": rec["headers"]["month"],
                "from_hash": rec["headers"]["from_hash"],
                "self": rec["headers"]["self"],
                "plain_chars": len(rec["plain"]),
                "quoted_chars": len(rec["plain_quoted"]),
                "html_chars": len(rec["html"]),
                "attachments": len(rec["attachments"]),
                "errors": ";".join(rec["errors"]),
            })
            written += 1
            errors += len(rec["errors"])

    print(f"records written : {written}")
    print(f"duplicates skipped: {duplicates}")
    print(f"decode errors   : {errors}")
    print(f"text dir        : {args.out}")
    print(f"index           : {index_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
