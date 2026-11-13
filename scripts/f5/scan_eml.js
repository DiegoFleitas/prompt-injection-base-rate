#!/usr/bin/env node
"use strict";

/**
 * F5 scanner — two passes over the decoded records, no text in the output.
 *
 *   node scripts/f5/scan_eml.js --text=data/f5/text --out=data/f5/flags.csv [--limit=5]
 *
 * Pass D1 (invisible code points) reuses F1's instrument unchanged:
 * `makeClassifier(detector)` + `invisibleSummary()` from scripts/make-sheet.js,
 * the same pair scripts/selftest.js validates. Ordering within D1 reuses
 * `triage.classify()` from scripts/triage.js, whose job is prioritising
 * candidates for the human, not deciding them.
 *
 * Pass E1 (machine-only surfaces) is a channel census over the raw HTML source:
 * hidden preheaders, display:none, visibility:hidden, hidden inputs, alt/title
 * text and tracking parameters. A surface count is not an attack signal — F1 and
 * F4 both found ubiquitous benign surfaces, and the report says so. `preheader`
 * deliberately overlaps `display:none`: it counts hidden blocks that contain
 * text, which is the shape a preheader has; the overlap is reported, not hidden.
 */

const fs = require("fs");
const path = require("path");

const { makeClassifier, invisibleSummary } = require("../make-sheet.js");
const triage = require("../triage.js");
const detector = require(path.join(__dirname, "..", "..", "..", "lemon-juice", "detectors.js"));

const classifier = makeClassifier(detector);

const CHANNELS = ["plain", "plain_quoted", "html"];

const SURFACES = [
  ["html-comment", /<!--[\s\S]*?-->/g],
  ["display:none", /display\s*:\s*none/gi],
  ["visibility:hidden", /visibility\s*:\s*hidden/gi],
  ["hidden-input", /<input[^>]*type\s*=\s*["']hidden["']/gi],
  ["alt-text", /\balt\s*=\s*["'][^"']+["']/gi],
  ["title-text", /\btitle\s*=\s*["'][^"']+["']/gi],
  ["tracking-param", /(?:utm_[a-z]+=|mc_eid=|_hsenc=|fbclid=|gclid=)/gi],
  ["preheader", /display\s*:\s*none[^>]{0,400}>[\s\S]{0,300}?<\/(?:div|span|p)>/gi],
];

function surfaceCounts(html) {
  return SURFACES
    .map(([name, pattern]) => [name, (html.match(pattern) || []).length])
    .filter(([, count]) => count > 0);
}

function scanRecord(record) {
  const rows = [];
  for (const channel of CHANNELS) {
    const text = record[channel] || "";
    if (!text) continue;
    const summary = invisibleSummary(text, classifier);
    if (summary.total) {
      const { priority } = triage.classify({ text });
      for (const [key, count] of summary.parts) {
        rows.push({
          channel,
          mechanism: key.split(" ")[0],
          count,
          class: "D1",
          priority,
        });
      }
    }
    if (channel === "html") {
      for (const [mechanism, count] of surfaceCounts(text)) {
        rows.push({ channel, mechanism, count, class: "E1", priority: "census" });
      }
    }
  }
  return rows;
}

function parseArgs(argv) {
  const args = { text: "data/f5/text", out: "data/f5/flags.csv", limit: 0 };
  for (const arg of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (!match) continue;
    if (match[1] === "limit") args.limit = Number(match[2]);
    else if (match[1] in args) args[match[1]] = match[2];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const files = fs.readdirSync(args.text).filter((name) => name.endsWith(".json")).sort();
  const selected = args.limit ? files.slice(0, args.limit) : files;

  const lines = ["id,channel,mechanism,count,class,priority"];
  let flagged = 0;
  let d1Rows = 0;
  let e1Rows = 0;

  for (const name of selected) {
    const record = JSON.parse(fs.readFileSync(path.join(args.text, name), "utf8"));
    const rows = scanRecord(record);
    if (rows.length) flagged += 1;
    for (const row of rows) {
      if (row.class === "D1") d1Rows += 1;
      else e1Rows += 1;
      lines.push([
        name.replace(/\.json$/, ""),
        row.channel,
        row.mechanism,
        row.count,
        row.class,
        row.priority,
      ].join(","));
    }
  }

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, lines.join("\n") + "\n");

  console.log(`records scanned : ${selected.length}`);
  console.log(`records flagged : ${flagged}`);
  console.log(`D1 rows         : ${d1Rows}`);
  console.log(`E1 rows         : ${e1Rows}`);
  console.log(`written         : ${args.out}`);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { scanRecord, surfaceCounts, SURFACES };
}

if (require.main === module) main();
