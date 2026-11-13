"use strict";

/**
 * Regression tests for the sheet excerpting that the F5 annotation pass reads.
 *
 * The defect they pin down: sheets were cut at the first 8000 chars, and 497 of
 * 644 marker-bearing channels carried every marker past that point, so the
 * annotator saw boilerplate CSS and no flagged character. A pack built from
 * those sheets showed two records with no snippet at all.
 */

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");

const { makeClassifier, invisibleSummary } = require(path.join(__dirname, "..", "..", "scripts", "make-sheet.js"));
const detector = require(path.join(__dirname, "..", "..", "..", "lemon-juice", "detectors.js"));
const { excerpt, markerPositions } = require(path.join(__dirname, "..", "..", "scripts", "f5", "make_sheet.js"));

const classifier = makeClassifier(detector);
const ZWSP = "\u200b";
const VS16 = "\ufe0f";
const VS_ASTRAL = "\u{e0100}";

test("a marker past char 8000 still reaches the excerpt", () => {
  const text = "a".repeat(9000) + `look ${ZWSP}here`;
  const summary = invisibleSummary(text, classifier);
  assert.equal(summary.total, 1);
  const { shown } = excerpt(text, classifier, summary);
  assert.match(shown, /⟦ZWSP:U\+200B⟧/);
  assert.ok(shown.length < 2000, `excerpt grew to ${shown.length} chars`);
});

test("a channel without markers keeps the plain head slice", () => {
  const text = "plain words only";
  const summary = invisibleSummary(text, classifier);
  const { shown, note } = excerpt(text, classifier, summary);
  assert.equal(shown, text);
  assert.equal(note, "");
});

test("a long run collapses into a single window, not one window per marker", () => {
  const text = `${"x".repeat(5000)}glassdoor ${ZWSP.repeat(400)} renew`;
  const summary = invisibleSummary(text, classifier);
  assert.equal(summary.total, 400);
  const { shown, note } = excerpt(text, classifier, summary);
  assert.equal((shown.match(/⟦/g) || []).length, 400);
  assert.match(note, /1 marker window/);
});

test("markers inside the opening are not repeated as a window", () => {
  const text = `glassdoor ${ZWSP.repeat(400)} renew`;
  const summary = invisibleSummary(text, classifier);
  const { shown, note } = excerpt(text, classifier, summary);
  assert.equal((shown.match(/⟦/g) || []).length, 400);
  assert.match(note, /every marker inside the opening/);
});

test("code-point offsets advance by UTF-16 width for astral variation selectors", () => {
  const text = `ab${VS_ASTRAL}cd${VS16}`;
  assert.deepEqual(markerPositions(text, classifier), [2, 6]);
});

test("windows never split a marker in half", () => {
  const text = "x".repeat(500) + ZWSP + "y".repeat(500);
  const summary = invisibleSummary(text, classifier);
  const { shown } = excerpt(text, classifier, summary);
  const open = (shown.match(/⟦/g) || []).length;
  const close = (shown.match(/⟧/g) || []).length;
  assert.equal(open, close);
});
