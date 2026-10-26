#!/usr/bin/env node
"use strict";

/**
 * Aggregate the mechanical numbers — no human labels involved.
 *
 *   node scripts/summarize.js --out=results/preliminary-<date>
 *
 * Writes `<out>.json` (canonical, machine-readable) and `<out>.md` (the same
 * numbers written out). Reads only the local sample and the detector flags.
 * The pre-registered decision lives in scripts/analyze.js and needs labels; this
 * is the descriptive half, and it is what `results/preliminary-report.md` cites.
 */

const fs = require("fs");
const path = require("path");

const { wilson } = require("./analyze.js");

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const SAMPLE = arg("sample", path.join("data", "wet-sample.jsonl"));
const FLAGS = arg("flags", path.join("data", "detector-flags.csv"));
const CANDIDATES = arg("candidates", path.join("data", "d1-candidates.csv"));
const DATE = arg("date", new Date().toISOString().slice(0, 10));
const OUT = arg("out", path.join("results", `preliminary-${DATE}`));

const pct = (x) => Math.round(1000 * x) / 10;

function readJsonl(file) {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function readCsv(file) {
  return fs.existsSync(file)
    ? fs
        .readFileSync(file, "utf8")
        .trim()
        .split("\n")
        .slice(1)
        .map((line) => line.split(","))
    : [];
}

function main() {
  const records = readJsonl(SAMPLE);
  const flags = readCsv(FLAGS);
  const candidates = readCsv(CANDIDATES);

  const n = records.length;
  const chars = records.map((r) => r.chars).sort((a, b) => a - b);
  const domains = new Set(records.map((r) => r.domain)).size;
  const warcFiles = new Set(records.map((r) => r.warc_path)).size;

  const verdicts = {};
  const types = {};
  let flagged = 0;
  for (const row of flags) {
    verdicts[row[1]] = (verdicts[row[1]] || 0) + 1;
    if (row[2] === "1") flagged += 1;
    for (const type of (row[3] || "").split("|").filter(Boolean)) {
      types[type] = (types[type] || 0) + 1;
    }
  }

  // Per-record kind counts (a record can contain several kinds).
  const kinds = {};
  for (const row of candidates) {
    for (const part of (row[3] || "").split("|").filter(Boolean)) {
      const kind = part.split("x")[0].replace(/ U\+[0-9A-F]+$/, "");
      kinds[kind] = (kinds[kind] || 0) + 1;
    }
  }

  const d1 = candidates.length;
  const d1ci = wilson(d1, n);
  const flagci = wilson(flagged, n);

  const summary = {
    generatedAt: new Date().toISOString(),
    frame: "F1-wet (Common Crawl plain-text extraction)",
    n,
    domains,
    warcFiles,
    chars: {
      p50: chars[Math.floor(n / 2)],
      p90: chars[Math.floor(n * 0.9)],
      max: chars[n - 1],
    },
    d1: { count: d1, prevalencePct: pct(d1ci.p), ci95Pct: [pct(d1ci.lo), pct(d1ci.hi)] },
    d1KindsPerRecord: kinds,
    detector: {
      flagged,
      flagRatePct: pct(flagci.p),
      ci95Pct: [pct(flagci.lo), pct(flagci.hi)],
      verdicts,
      findingTypes: types,
    },
    note: "D1 is mechanical (invisible code points). D2 needs human labels; see scripts/analyze.js.",
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(`${OUT}.json`, JSON.stringify(summary, null, 2) + "\n");
  fs.writeFileSync(
    `${OUT}.md`,
    [
      `# Descriptive numbers — ${DATE}`,
      "",
      `Frame: ${summary.frame}`,
      "",
      "| Quantity | Value |",
      "| --- | --- |",
      `| Records | ${n} |`,
      `| Distinct domains | ${domains} |`,
      `| WET files | ${warcFiles} |`,
      `| Characters (p50 / p90 / max) | ${chars[Math.floor(n / 2)]} / ${chars[Math.floor(n * 0.9)]} / ${chars[n - 1]} |`,
      `| **D1 — records with an invisible code point** | **${d1}/${n} = ${pct(d1ci.p)}%** (95% CI ${pct(d1ci.lo)}–${pct(d1ci.hi)}%) |`,
      `| Detector flagged at suspicious or worse | ${flagged}/${n} = ${pct(flagci.p)}% (95% CI ${pct(flagci.lo)}–${pct(flagci.hi)}%) |`,
      "",
      "Per-record mechanism counts:",
      "",
      "| Mechanism | Records |",
      "| --- | ---: |",
      ...Object.entries(kinds)
        .sort((a, b) => b[1] - a[1])
        .map(([kind, count]) => `| \`${kind}\` | ${count} |`),
      "",
      "Detector verdicts: " +
        Object.entries(verdicts)
          .map(([verdict, count]) => `${verdict} ${count}`)
          .join(", "),
      "",
      "Detector finding types: " +
        (Object.entries(types)
          .sort((a, b) => b[1] - a[1])
          .map(([type, count]) => `${type} ${count}`)
          .join(", ") || "none"),
      "",
      "D2 (concealed instruction) is not measured here: it requires the human",
      "annotation in `labels.csv` and the pre-registered rule in `scripts/analyze.js`.",
      "",
    ].join("\n")
  );

  console.log(`n=${n} domains=${domains} files=${warcFiles}`);
  console.log(`D1 ${d1}/${n} = ${pct(d1ci.p)}% (${pct(d1ci.lo)}–${pct(d1ci.hi)})`);
  console.log(`detector flagged ${flagged}/${n} = ${pct(flagci.p)}%`);
  console.log(`wrote ${OUT}.json and ${OUT}.md`);
}

main();
