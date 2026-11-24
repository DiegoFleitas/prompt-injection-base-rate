"use strict";

/**
 * SR-02 regression tests — no code is executed from outside this repository,
 * and the vendored detector is pinned by content hash.
 *
 * The defect they pin down: four call sites required
 * `../../lemon-juice/detectors.js`, a path above the repository root, and the
 * legacy `scripts/make-sheet.js` default still pointed there. The detector is
 * now vendored at `vendor/detectors.js`; these tests fail if any loader path
 * escapes the repo or if the vendored bytes change without the pin table
 * (`vendor/README.md`) being updated.
 */

const test = require("node:test");
const assert = require("node:assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const REPO_ROOT = path.join(__dirname, "..", "..");
const VENDORED_DETECTOR = path.join(REPO_ROOT, "vendor", "detectors.js");
const PINNED_SHA256 = "1ff4876e422240fe37527c266646bc2370793fb20d7971244b1af7eed6dbadee";

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function isInsideRepo(target) {
  const relative = path.relative(REPO_ROOT, target);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === "data" || entry.name === ".git") return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(js|py)$/.test(entry.name) ? [full] : [];
  });
}

test("the vendored detector matches its pinned SHA-256", () => {
  assert.equal(sha256(VENDORED_DETECTOR), PINNED_SHA256);
});

test("the vendored detector loads and exposes the scanner API", () => {
  const detector = require(VENDORED_DETECTOR);
  assert.equal(typeof detector.scanText, "function");
  assert.equal(typeof detector.pageVerdict, "function");
  assert.equal(typeof detector.applyContextualPromotion, "function");
});

test("every detectors.js require in the tree resolves inside the repository", () => {
  const loaders = [];
  for (const file of sourceFiles(REPO_ROOT)) {
    const text = fs.readFileSync(file, "utf8");
    for (const match of text.matchAll(/require\(\s*path\.join\(\s*__dirname\s*,([^)]*)\)\s*\)|require\(\s*["']([^"']*detectors\.js)["']\s*\)/g)) {
      const literal = match[2];
      if (literal) {
        loaders.push({ file, target: path.resolve(path.dirname(file), literal) });
        continue;
      }
      const segments = [...match[1].matchAll(/"([^"]*)"/g)].map((part) => part[1]);
      loaders.push({ file, target: path.resolve(path.dirname(file), ...segments) });
    }
  }
  assert.ok(loaders.length >= 4, `expected at least 4 detector loaders, found ${loaders.length}`);
  for (const { file, target } of loaders) {
    assert.ok(
      isInsideRepo(target),
      `${path.relative(REPO_ROOT, file)} loads a detector outside the repo: ${target}`
    );
  }
});

test("make-sheet.js defaults its detector to the vendored copy", () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, "scripts", "make-sheet.js"), "utf8");
  assert.match(source, /arg\(\s*"detector"\s*,\s*path\.join\(\s*"vendor"\s*,\s*"detectors\.js"\s*\)\s*\)/);
  assert.doesNotMatch(source, /lemon-juice/);
});
