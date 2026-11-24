"""Where the F4 pipeline keeps payload-bearing data.

Raw captures, the corpus manifest and the per-page scan records contain
third-party page text, so none of them may live inside the repository (a stray
`git add -A` would commit other people's content). Everything goes under
`DATA_ROOT`:

* default: `~/f4-data` (outside the working tree by construction);
* override: `F4_DATA_DIR` — pointing it at the repository is a hard error.

Code stays in `scripts/f4/python/`; only derived aggregates are ever copied
into `results/`.
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))


def _is_inside_repo(path):
    try:
        return os.path.commonpath([os.path.abspath(path), REPO_ROOT]) == REPO_ROOT
    except ValueError:            # different drive on Windows: cannot be inside
        return False


def _resolve_data_root():
    configured = os.environ.get("F4_DATA_DIR") or os.path.join(os.path.expanduser("~"), "f4-data")
    root = os.path.abspath(configured)
    if _is_inside_repo(root):
        raise SystemExit(
            f"F4_DATA_DIR points inside the repository ({root}); "
            "raw captures and scan records must stay outside it"
        )
    return root


DATA_ROOT = _resolve_data_root()
RAW_HTML = os.path.join(DATA_ROOT, "raw_html")
MANIFEST = os.path.join(DATA_ROOT, "corpus_manifest.jsonl")


def ensure_data_dirs():
    """Create the data root and the raw-HTML directory, returning the root."""
    os.makedirs(RAW_HTML, exist_ok=True)
    return DATA_ROOT


def data_path(filename):
    """Absolute path for a payload-bearing output file under DATA_ROOT."""
    return os.path.join(DATA_ROOT, filename)
