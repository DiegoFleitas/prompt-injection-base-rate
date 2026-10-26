#!/usr/bin/env node
"use strict";

/**
 * Base-rate analysis — joins blind labels with detector flags and applies the
 * pre-registered decision rule from study-protocol.md section 6.
 *
 *   node analyze.js --sample=data/wet-sample.jsonl --labels=labels.csv \
 *                   --flags=data/detector-flags.csv --out=report.md
 *
 * Reads local files only. No network, no model. Prints the verdict sentence and
 * the four numbers it is allowed to depend on.
 */

const fs = require("fs");
const path = require("path");

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const SAMPLE = arg("sample", path.join("data", "wet-sample.jsonl"));
const LABELS = arg("labels", "labels.csv");
const FLAGS = arg("flags", path.join("data", "detector-flags.csv"));
const OUT = arg("out", "report.md");

/** Wilson score interval for a binomial proportion. */
function wilson(k, n, z = 1.96) {
  if (!n) return { p: 0, lo: 0, hi: 1 };
  const p = k / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { p, lo: Math.max(0, (centre - spread) / denom), hi: Math.min(1, (centre + spread) / denom) };
}

const pct = (x) => `${(100 * x).toFixed(1)}%`;
const fmt = (interval) => `${pct(interval.p)} (95% CI ${pct(interval.lo)}–${pct(interval.hi)})`;

function parseCsv(text) {
  const lines = text.trim().split("\n");
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    // Minimal CSV: notes may contain commas, so split from the right for the tail.
    const cells = line.split(",");
    const row = {};
    header.forEach((key, index) => {
      row[key] = index < header.length - 1 ? cells[index] : cells.slice(index).join(",");
    });
    return row;
  });
}

function readIf(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

function main() {
  const sample = readIf(SAMPLE)
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  if (!sample.length) {
    console.error(`no sample records at ${SAMPLE} — run fetch-wet-sample.js first`);
    process.exit(1);
  }
  const sampleById = new Map(sample.map((record) => [record.id, record]));

  const labelRows = readIf(LABELS) ? parseCsv(readIf(LABELS)) : [];
  const labelled = labelRows.filter((row) => row.id && (row.d2_concealed_instruction === "0" || row.d2_concealed_instruction === "1"));

  const flagRows = readIf(FLAGS) ? parseCsv(readIf(FLAGS)) : [];
  const flagByid = new Map(flagRows.map((row) => [row.id, row]));

  const n = labelled.length;
  const d1 = labelled.filter((row) => row.d1_invisible === "1").length;
  const d2 = labelled.filter((row) => row.d2_concealed_instruction === "1").length;
  const d3 = labelled.filter((row) => row.d3_directive_no_action === "1").length;

  const flaggedRows = labelled.filter((row) => flagByid.get(row.id)?.flagged === "1");
  const falsePositives = flaggedRows.filter((row) => row.d2_concealed_instruction !== "1").length;

  const pInstr = wilson(d2, n);
  const pAny = wilson(d1, n);
  const fp = wilson(falsePositives, flaggedRows.length);

  // Rule of three: with zero hits, the 95% upper bound is about 3/n.
  const ruleOfThree = n ? Math.min(1, 3 / n) : 1;
  const upperBound = d2 === 0 ? ruleOfThree : pInstr.hi;
  const fpPoint = flaggedRows.length ? falsePositives / flaggedRows.length : 0;
  const snr = fpPoint > 0 ? pInstr.p / fpPoint : null;

  // FPR cannot be estimated from a handful of flags: with 0 or 1 flags the point
  // estimate is 0 or 1 by construction, which would make K2 fire trivially
  // (0 ≥ 5 × 0). Protocol precondition: no FPR-based verdict below 10 flags.
  const MIN_FLAGS_FOR_FPR = 10;
  const canEstimateFpr = flaggedRows.length >= MIN_FLAGS_FOR_FPR;

  let verdict;
  let rule;
  if (!n) {
    verdict = "INCOMPLETE — no labelled records yet.";
    rule = "Finish labels.csv first.";
  } else if (!canEstimateFpr && flaggedRows.length === 0) {
    // This is not "inconclusive because we need more data" in the ordinary
    // sense: the detector emitted no flags at all, so it has no operating point
    // on this frame and no FPR exists to compare against. Recorded separately so
    // the K3 is not mistaken for a near-miss.
    verdict =
      "K3 (structural) — the detector has no operating point on this frame, so neither K1 nor K2 is evaluable.";
    rule = `0 of ${n} records were flagged, so FPR is undefined rather than small. The decision rule needs a detector that fires; report the descriptive result and treat K1/K2 as inapplicable unless F3/F4 produce flags.`;
  } else if (!canEstimateFpr) {
    verdict = "K3 — inconclusive: too few detector flags to estimate a false-positive rate.";
    rule = `only ${flaggedRows.length} flagged record(s); at least ${MIN_FLAGS_FOR_FPR} are needed for an FPR-based decision. Run F3/F4 or a larger F1 sample before deciding.`;
  } else if (upperBound <= fpPoint) {
    verdict = "K1 — the consumer-protection framing dies on its own numbers.";
    rule = `upper bound of concealed-instruction prevalence (${pct(upperBound)}) ≤ detector FPR (${pct(fpPoint)}).`;
  } else if (pInstr.p >= 5 * fpPoint && d2 > 0) {
    verdict = "K2 — an ingest-boundary tool is justified; continue as a library, not a consumer shield.";
    rule = `prevalence (${pct(pInstr.p)}) ≥ 5 × FPR (${pct(fpPoint)}).`;
  } else {
    verdict = "K3 — inconclusive. Run F3/F4 before deciding; do not redesign detectors on the way.";
    rule = `upper bound (${pct(upperBound)}) > FPR (${pct(fpPoint)}), and the point estimate is not ≥ 5×.`;
  }

  const report = [
    "# Base-rate study — report",
    "",
    `Records sampled: **${sample.length}** · labelled: **${n}** · notes label: **${labelled.length === sample.length ? "complete" : "partial"}**`,
    "",
    "| Quantity | Value |",
    "| --- | --- |",
    `| D1 concealed text (mechanical) | ${d1}/${n} — ${fmt(pAny)} |`,
    `| **D2 concealed instruction** | **${d2}/${n} — ${fmt(pInstr)}** |`,
    `| D2 95% upper bound used | ${pct(upperBound)} |`,
    `| D3 directive, no action | ${d3}/${n} |`,
    `| Detector flagged | ${flaggedRows.length}/${n} |`,
    `| Detector false positives | ${falsePositives}/${flaggedRows.length || 0} — ${fmt(fp)} |`,
    `| Signal / noise | ${snr === null ? "n/a (no flags)" : snr.toFixed(2)} |`,
    "",
    "## Verdict (pre-registered rule, section 6)",
    "",
    `**${verdict}**`,
    "",
    `Because ${rule}`,
    "",
    "## Read this before quoting it",
    "",
    "- F1 is Common Crawl WET: one text extraction of crawled pages. It is not",
    "  \"the web\", and it cannot see comments, attributes or CSS-hidden text.",
    "- D2 is a human judgement against a fixed definition; single annotator unless",
    "  a second opinion was recorded. The definition is the result's weakest joint.",
    "- A zero count is a statement about this sample, not proof of impossibility:",
    "  the upper bound is what the argument rests on.",
    "",
  ].join("\n");

  fs.writeFileSync(OUT, report);
  console.log(report);
  console.log(`report: ${OUT}`);
}

module.exports = { wilson, parseCsv };

if (require.main === module) main();
