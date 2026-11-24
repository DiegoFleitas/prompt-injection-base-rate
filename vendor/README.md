# vendor/ — pinned third-party code

`detectors.js` is the `PIScanner` from
[`DiegoFleitas/lemon-juice`](https://github.com/DiegoFleitas/lemon-juice),
committed here so the research scripts execute no code from outside this
repository (SR-02).

| Field | Value |
| --- | --- |
| Upstream | `https://github.com/DiegoFleitas/lemon-juice` |
| Tag | `v0.11.0` |
| Commit | `3ee8494677e9debca5222cd9812d2f1799093ede` |
| File | `detectors.js` (verbatim copy, 2132 lines) |
| SHA-256 | `1ff4876e422240fe37527c266646bc2370793fb20d7971244b1af7eed6dbadee` |
| License | GPL-3.0 (see `LICENSE` and `NOTICE` at the repo root) |

`tests/f5/detector_provenance.test.js` fails if the file's SHA-256 stops
matching this table, so an upgrade cannot land silently.

## Upgrading

1. Check out the new upstream tag and copy `detectors.js` to
   `vendor/detectors.js` byte for byte (no reformatting, no edits).
2. Update the tag, commit, line count and SHA-256 in the table above.
3. Update `PINNED_SHA256` in `tests/f5/detector_provenance.test.js`.
4. Run `npm test` and re-record any result the detector's verdicts feed.
