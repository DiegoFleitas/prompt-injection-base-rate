# vendor/ — pinned third-party code

`detectors.js` is the `PIScanner` from
[`DiegoFleitas/lemon-juice`](https://github.com/DiegoFleitas/lemon-juice),
committed here so the research scripts execute no code from outside this
repository (SR-02).

| Field | Value |
| --- | --- |
| Upstream | `https://github.com/DiegoFleitas/lemon-juice` (a git repository, not a package registry or a remote API) |
| Tag | `v0.11.0` |
| Commit | `3ee8494677e9debca5222cd9812d2f1799093ede` |
| File | `detectors.js` (verbatim copy, 2132 lines) |
| SHA-256 | `1ff4876e422240fe37527c266646bc2370793fb20d7971244b1af7eed6dbadee` |
| License | GPL-3.0 (see `LICENSE` and `NOTICE` at the repo root) |
| Loaded by | `require()` of the local file only — `scripts/selftest.js`, `scripts/f5/make_sheet.js`, `scripts/f5/scan_eml.js`, `tests/f5/*`, and `scripts/make-sheet.js --detector` (default `vendor/detectors.js`) |
| Network endpoint | none — the detector is pure local JavaScript; it makes no HTTP call and takes no API key |

`tests/f5/detector_provenance.test.js` fails if the file's SHA-256 stops
matching this table, or if any `detectors.js` require in the tree resolves
outside this repository, so an upgrade cannot land silently.

## Runtime and dependencies

The detector is not a remote service and not an npm dependency: it runs on the
Node.js standard library. The Node version the recorded results were produced on
is pinned in `.nvmrc` (`24.16.0`); `package.json` keeps `engines.node >= 20` as
the supported floor. The only declared runtime dependency is `playwright`, pinned
to `1.56.0` in both `package.json`/`package-lock.json` (install with `npm ci`)
and `requirements.txt` (`pip install -r`).

## Missing detector

The detector is **required**: `scripts/make-sheet.js` aborts with exit code 2 if
it cannot be loaded, rather than silently publishing a D1 column measured
without it. `--allow-missing-detector` is the explicit opt-out; with it the flag
column is not written at all and the TAG/VS/SNEAKY predicates use
`make-sheet.js`'s own built-in fallbacks.

## Upgrading

1. Check out the new upstream tag and copy `detectors.js` to
   `vendor/detectors.js` byte for byte (no reformatting, no edits).
2. Update the tag, commit, line count and SHA-256 in the table above.
3. Update `PINNED_SHA256` in `tests/f5/detector_provenance.test.js`.
4. Run `npm test` and re-record any result the detector's verdicts feed.
