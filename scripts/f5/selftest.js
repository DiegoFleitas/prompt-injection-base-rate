#!/usr/bin/env node
"use strict";

/**
 * F5 self-test for the scanner's two passes.
 *
 *   node scripts/f5/selftest.js
 *
 * The instrument is reused, not re-implemented: D1 comes from F1's
 * `makeClassifier` + `invisibleSummary` (scripts/make-sheet.js) and the ordering
 * comes from `triage.classify` (scripts/triage.js). This file only proves that
 * the wiring catches what it must and stays silent on clean text.
 *
 * No network, no model, no fixture files, no message text.
 */

const assert = require("assert/strict");
const { scanRecord } = require("./scan_eml.js");
const { cpUpper } = require("./analyze_eml.js");

// 1. Ordinary text must produce zero rows.
const clean = scanRecord({
  plain: "Hola, gracias por tu postulación. Saludos.",
  plain_quoted: "",
  html: "<p>Hola</p>",
});
assert.deepEqual(clean, [], "clean message must not flag");

// 2. A zero-width space in the plain channel must be a D1 hit on that channel.
const zwsp = scanRecord({ plain: "hola \u200b mundo", plain_quoted: "", html: "" });
assert.equal(zwsp.length, 1, "exactly one row for one mechanism");
assert.equal(zwsp[0].class, "D1");
assert.equal(zwsp[0].channel, "plain");
assert.equal(zwsp[0].mechanism, "ZWSP");
assert.equal(zwsp[0].count, 1);

// 3. A Tag-block character is smuggling priority, not a benign signature.
const tags = scanRecord({ plain: "hola \u{E0041}\u{E0042}", plain_quoted: "", html: "" });
assert.ok(tags.some((row) => row.class === "D1" && row.priority === "smuggling"),
  "Tags-block chars must sort as smuggling");

// 4. HTML-only concealment must be caught by the E1 pass without a D1 row.
const hidden = scanRecord({
  plain: "",
  plain_quoted: "",
  html: '<div style="display:none">promo</div><p>visible</p>',
});
assert.ok(hidden.some((row) => row.class === "E1" && row.mechanism === "display:none"),
  "display:none must be counted");
assert.equal(hidden.filter((row) => row.class === "D1").length, 0,
  "display:none is not an invisible code point");

// 5. Quoted lines are scanned as their own channel, never merged into plain.
const quoted = scanRecord({ plain: "respuesta", plain_quoted: "> cita\u200b", html: "" });
assert.ok(quoted.some((row) => row.channel === "plain_quoted" && row.class === "D1"));

// 6. No row may carry text: the columns are fixed.
for (const row of [...zwsp, ...tags, ...hidden, ...quoted]) {
  assert.deepEqual(Object.keys(row).sort(),
    ["channel", "class", "count", "mechanism", "priority"]);
}

// 7. The zero-count convention must match the one the protocol asserts.
assert.ok(Math.abs(cpUpper(0, 290) - 0.01027) < 0.0005,
  `0/290 one-sided bound drifted: ${cpUpper(0, 290)}`);
assert.ok(cpUpper(0, 1321) < 0.003, "zero bound must shrink with n");

console.log("selftest: all assertions passed");
