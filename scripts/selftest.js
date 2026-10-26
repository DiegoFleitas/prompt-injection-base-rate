#!/usr/bin/env node
"use strict";

/**
 * Self-test for the study's classifier and analysis maths.
 *
 *   node selftest.js
 *
 * Exists because the first version of make-sheet.js classified almost every
 * character as invisible: a hand-written character class
 * `/[\uFE00-\uFE0F\uE0100-\uE01EF]/u` parses `\uE0100` as `\uE010` + "0", which
 * turns part of the class into the range 0x30â€“0xE01E. That bug would have
 * reported ~100% concealed-text prevalence. A three-line test prevents it.
 *
 * No network, no model, no fixture files.
 */

const assert = require("assert/strict");
const path = require("path");

const { makeClassifier, invisibleSummary, visualize } = require("./make-sheet.js");
const { wilson } = require("./analyze.js");

const detector = require(path.join(__dirname, "..", "..", "lemon-juice", "detectors.js"));
const classifier = makeClassifier(detector);

function kindOf(ch) {
  return classifier.classify(ch);
}

// Ordinary characters must never be classified as invisible. This is the exact
// bug above: "s", "a", "0", "F" and "â˜…" were all "VS" under the broken class.
for (const ch of ["s", "a", "0", "F", "-", " ", "â˜…", "7", "Ã©", "ä¸­"]) {
  assert.equal(kindOf(ch), null, `${JSON.stringify(ch)} must not be invisible`);
}

// Real invisible characters must be classified, with the right kind.
assert.equal(kindOf("\u200B"), "ZWSP", "ZWSP");
assert.equal(kindOf("\u200D"), "ZWJ", "ZWJ");
assert.equal(kindOf("\u202E"), "RLO", "bidi override");
assert.equal(kindOf("\uFE0F"), "VS", "VS16");
assert.equal(kindOf("\u{E0100}"), "VS", "VS17 (astral)");
assert.equal(kindOf("\u{E0041}"), "TAG", "Unicode Tags");
assert.equal(kindOf("\u2062"), "INVISIBLE-TIMES", "sneaky bits 0");
assert.equal(kindOf("\u2064"), "INVISIBLE-PLUS", "sneaky bits 1");

// Multi-character strings are not single code points and must be rejected.
assert.equal(kindOf("ab"), null, "multi-char input");

// A summary must count, not just detect.
const text = "hello\u200Bworld\u200B\u200D";
const summary = invisibleSummary(text, classifier);
assert.equal(summary.total, 3, "three invisible code points");
assert.equal(summary.parts.length, 2, "two distinct kinds");

// Visualization must keep the visible text intact and mark the hidden ones.
const shown = visualize("a\u200Bb", classifier);
assert.ok(shown.startsWith("a"), "visible prefix preserved");
assert.ok(shown.endsWith("b"), "visible suffix preserved");
assert.ok(shown.includes("ZWSP"), "invisible marked");

// Wilson interval sanity: 0/300 upper bound is about 1%, 300/300 lower bound 99%.
const zero = wilson(0, 300);
assert.ok(zero.p === 0 && zero.hi > 0.005 && zero.hi < 0.02, `0/300 hi=${zero.hi}`);
const all = wilson(300, 300);
assert.ok(all.lo > 0.98, "300/300 lower bound");
const half = wilson(150, 300);
assert.ok(Math.abs(half.p - 0.5) < 1e-9 && half.lo < 0.5 && half.hi > 0.5, "50% interval");
assert.equal(wilson(0, 0).hi, 1, "empty sample");

console.log("selftest: all assertions passed");

