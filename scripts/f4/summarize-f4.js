#!/usr/bin/env node
"use strict";

/**
 * F4 step 3 — page-level prevalence per concealment channel, with Wilson intervals.
 *
 *   node scripts/f4/summarize-f4.js --findings=data/f4/findings.jsonl --out=results/f4-2026-10-26
 *
 * Presence only: this says how often a channel appears, not whether it carries an
 * instruction. That adjudication is the same human pass as F1's D2. No detector
 * is joined here on purpose, so the first number is independent of the tool the
 * study is about.
 */

const fs = require("fs");
const path = require("path");

const { wilson } = require("../analyze.js");

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const FINDINGS = arg("findings", path.join("data", "f4", "findings.jsonl"));
const OUT = arg("out", path.join("results", `f4-${new Date().toISOString().slice(0, 10)}`));

const CHANNELS = ["comments", "attributes", "jsonld", "template", "hiddenText"];
const pct = (x) => Math.round(1000 * x) / 10;

function readJsonl(file) {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function main() {
  const rows = readJsonl(FINDINGS).filter((row) => !row.error);
  const n = rows.length;

  const perChannel = {};
  for (const channel of CHANNELS) {
    const hits = rows.filter((row) => (row[channel] || []).length > 0).length;
    const interval = wilson(hits, n);
    perChannel[channel] = {
      pages: hits,
      prevalencePct: pct(interval.p),
      ci95Pct: [pct(interval.lo), pct(interval.hi)],
    };
  }

  const anyConcealment = rows.filter((row) =>
    CHANNELS.some((channel) => (row[channel] || []).length > 0)
  ).length;
  const anyInterval = wilson(anyConcealment, n);

  const hiddenTextLengths = rows
    .flatMap((row) => (row.hiddenText || []).map((item) => item.text.length))
    .sort((a, b) => a - b);

  const summary = {
    generatedAt: new Date().toISOString(),
    frame: "F4-rendered (saved HTML, JavaScript disabled, network blocked)",
    pages: n,
    blockedRequests: rows.reduce((sum, row) => sum + (row.blockedRequests || 0), 0),
    anyConcealment: {
      pages: anyConcealment,
      prevalencePct: pct(anyInterval.p),
      ci95Pct: [pct(anyInterval.lo), pct(anyInterval.hi)],
    },
    perChannel,
    hiddenTextLengths: {
      items: hiddenTextLengths.length,
      p50: hiddenTextLengths.length ? hiddenTextLengths[Math.floor(hiddenTextLengths.length / 2)] : null,
      max: hiddenTextLengths.length ? hiddenTextLengths[hiddenTextLengths.length - 1] : null,
    },
    note: "Presence, not intent. D2-style adjudication is a separate human pass.",
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(`${OUT}.json`, JSON.stringify(summary, null, 2) + "\n");
  fs.writeFileSync(
    `${OUT}.md`,
    [
      "# F4 — rendered concealment (presence)",
      "",
      `Frame: ${summary.frame}`,
      "",
      `Pages rendered: **${n}** · blocked HTTP requests during rendering: **${summary.blockedRequests}** (should be 0)`,
      "",
      `Pages with any concealment channel: **${anyConcealment}/${n} = ${pct(anyInterval.p)}%** (95% CI ${pct(anyInterval.lo)}–${pct(anyInterval.hi)}%)`,
      "",
      "| Channel | Pages | Prevalence | 95% CI |",
      "| --- | ---: | ---: | --- |",
      ...CHANNELS.map(
        (channel) =>
          `| ${channel} | ${perChannel[channel].pages} | ${perChannel[channel].prevalencePct}% | ${perChannel[channel].ci95Pct[0]}–${perChannel[channel].ci95Pct[1]}% |`
      ),
      "",
      `Hidden-text items: ${summary.hiddenTextLengths.items} (median length ${summary.hiddenTextLengths.p50 ?? "n/a"}, max ${summary.hiddenTextLengths.max ?? "n/a"})`,
      "",
      "Presence is not intent: a comment or an `aria-label` is normal web markup until",
      "its text is adjudicated like F1's D2. Do not quote this table as an attack rate.",
      "",
    ].join("\n")
  );

  console.log(`pages=${n} anyConcealment=${anyConcealment}/${n} (${pct(anyInterval.p)}%)`);
  for (const channel of CHANNELS) {
    console.log(`  ${channel}: ${perChannel[channel].pages}/${n}`);
  }
  console.log(`wrote ${OUT}.json and ${OUT}.md`);
}

main();
