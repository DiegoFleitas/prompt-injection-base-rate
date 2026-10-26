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

const CLUSTER_BOOTSTRAP = 2000;
const CLUSTER_SEED = 20261026;

/** mulberry32, shared family with the sampler so a seed means one thing. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Domain-clustered bootstrap for a proportion.
 *
 * Records are not independent: 290 of them come from 275 domains, with mirrored
 * and near-duplicate pages. Wilson intervals assume independence, so they are
 * overconfident. Resampling *domains* with replacement and recomputing the
 * proportion inside each resampled set gives an interval that reflects the
 * clustering. Deterministic: same seed, same interval.
 */
function clusterBootstrap(records, isHit, { bootstrap = CLUSTER_BOOTSTRAP, seed = CLUSTER_SEED } = {}) {
  const byDomain = new Map();
  for (const record of records) {
    const domain = record.domain || "unknown";
    if (!byDomain.has(domain)) byDomain.set(domain, []);
    byDomain.get(domain).push(record);
  }
  const domains = [...byDomain.keys()];
  const rng = mulberry32(seed);
  const rates = [];
  for (let b = 0; b < bootstrap; b += 1) {
    let hits = 0;
    let n = 0;
    for (let i = 0; i < domains.length; i += 1) {
      for (const record of byDomain.get(domains[Math.floor(rng() * domains.length)])) {
        n += 1;
        if (isHit(record)) hits += 1;
      }
    }
    rates.push(hits / n);
  }
  rates.sort((a, b) => a - b);
  const at = (q) => rates[Math.min(rates.length - 1, Math.max(0, Math.floor(q * rates.length)))];
  const hits = records.filter(isHit).length;
  return {
    n: records.length,
    d1: hits,
    prevalencePct: pct(records.length ? hits / records.length : 0),
    ci95Pct: [pct(at(0.025)), pct(at(0.975))],
    domains: domains.length,
  };
}

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

  // Language coverage proxy: which scripts appear. ACL/ARR responsible-research
  // checklists ask for the languages an artifact covers; a script census is a
  // cheap, honest approximation. It also explains the detector's `mixed-script`
  // finding rate: a sample this multilingual trips a mixed-script heuristic by
  // construction.
  const SCRIPT_RANGES = {
    Han: [0x3400, 0x9fff],
    "Hiragana/Katakana": [0x3040, 0x30ff],
    Hangul: [0xac00, 0xd7af],
    Cyrillic: [0x0400, 0x04ff],
    Arabic: [0x0600, 0x06ff],
    Devanagari: [0x0900, 0x097f],
    Greek: [0x0370, 0x03ff],
    Thai: [0x0e00, 0x0e7f],
  };
  const scriptCounts = {};
  let recordsWithNonLatin = 0;
  const nonLatinById = new Map();
  for (const record of records) {
    const seen = new Set();
    for (const ch of record.text) {
      const cp = ch.codePointAt(0);
      for (const [name, [lo, hi]] of Object.entries(SCRIPT_RANGES)) {
        if (cp >= lo && cp <= hi) seen.add(name);
      }
    }
    nonLatinById.set(record.id, seen.size > 0);
    if (seen.size) recordsWithNonLatin += 1;
    for (const name of seen) scriptCounts[name] = (scriptCounts[name] || 0) + 1;
  }

  // Stratified D1: does the headline hold across the script split? If most
  // concealment sits in the non-Latin half, the aggregate overstates what a
  // Latin-script reader's pipeline sees — and the responsible move is to report
  // both numbers rather than the flattering one.
  const d1Ids = new Set(candidates.map((row) => row[0]));
  const strata = {
    "non-Latin script": { n: 0, d1: 0 },
    "Latin-only": { n: 0, d1: 0 },
  };
  for (const record of records) {
    const seen = new Set();
    for (const ch of record.text) {
      const cp = ch.codePointAt(0);
      for (const [name, [lo, hi]] of Object.entries(SCRIPT_RANGES)) {
        if (cp >= lo && cp <= hi) seen.add(name);
      }
    }
    const key = seen.size ? "non-Latin script" : "Latin-only";
    strata[key].n += 1;
    if (d1Ids.has(record.id)) strata[key].d1 += 1;
  }
  const stratifiedD1 = Object.fromEntries(
    Object.entries(strata).map(([key, value]) => {
      const interval = wilson(value.d1, value.n);
      return [
        key,
        {
          n: value.n,
          d1: value.d1,
          prevalencePct: pct(interval.p),
          ci95Pct: [pct(interval.lo), pct(interval.hi)],
        },
      ];
    })
  );

  // Wilson intervals assume records are independent. They are not: 290 records
  // come from 275 domains, with mirrored and near-duplicate pages. The honest
  // interval resamples domains, not records.
  const clusterOverall = clusterBootstrap(records, (record) => d1Ids.has(record.id));
  const clusterNonLatin = clusterBootstrap(
    records.filter((record) => nonLatinById.get(record.id)),
    (record) => d1Ids.has(record.id)
  );
  const clusterLatinOnly = clusterBootstrap(
    records.filter((record) => !nonLatinById.get(record.id)),
    (record) => d1Ids.has(record.id)
  );
  const clusteredD1 = {
    note: "bootstrap resampling domains (not records), because records within a domain are not independent",
    bootstrap: CLUSTER_BOOTSTRAP,
    seed: CLUSTER_SEED,
    overall: clusterOverall,
    "non-Latin script": clusterNonLatin,
    "Latin-only": clusterLatinOnly,
  };

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
    stratifiedD1,
    clusteredD1,
    d1KindsPerRecord: kinds,
    scripts: {
      recordsWithNonLatinScript: recordsWithNonLatin,
      perScriptRecords: scriptCounts,
      note: "script census as a language-coverage proxy; languages themselves are not identified",
    },
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
      "## Language coverage (script census)",
      "",
      "Scripts, not languages: a cheap proxy for what the sample covers.",
      "",
      `Records containing a non-Latin script: **${recordsWithNonLatin}/${n} = ${pct(recordsWithNonLatin / n)}%**`,
      "",
      "| Script | Records |",
      "| --- | ---: |",
      ...Object.entries(scriptCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([script, count]) => `| ${script} | ${count} |`),
      "",
      "This multilingual sample matters for reading the detector column: a",
      "mixed-script heuristic fires on a multilingual page by construction, so its",
      "rate here says more about the sample's script mix than about threats.",
      "",
      "### D1 stratified by script",
      "",
      "The aggregate hides a split: concealment is far more common in the non-Latin",
      "half of the sample, so the headline overstates what a Latin-script pipeline",
      "typically meets.",
      "",
      "| Stratum | n | D1 | Prevalence |",
      "| --- | ---: | ---: | --- |",
      ...Object.entries(stratifiedD1).map(
        ([stratum, value]) =>
          `| ${stratum} | ${value.n} | ${value.d1} | ${value.prevalencePct}% (95% CI ${value.ci95Pct[0]}–${value.ci95Pct[1]}%) |`
      ),
      "",
      "### Intervals that account for clustering",
      "",
      "The Wilson intervals above assume the 290 records are independent. They are",
      "not: the sample holds 275 domains and includes mirrored or near-duplicate",
      "pages, so those intervals are too narrow. Resampling **domains** (not records)",
      "for a 95% interval:",
      "",
      "| Stratum | Domains | Prevalence | Clustered 95% CI |",
      "| --- | ---: | ---: | --- |",
      ...Object.entries(clusteredD1)
        .filter(([, value]) => value && typeof value === "object" && "ci95Pct" in value)
        .map(
          ([stratum, value]) =>
            `| ${stratum} | ${value.domains} | ${value.prevalencePct}% | ${value.ci95Pct[0]}–${value.ci95Pct[1]}% |`
        ),
      "",
      `Bootstrap: ${clusteredD1.bootstrap} replicas, seed ${clusteredD1.seed}. Same seed, same`,
      "interval — the number does not move between runs.",
      "",
      "D2 (concealed instruction) is not measured here: it requires the human",
      "annotation in `labels.csv` and the pre-registered rule in `scripts/analyze.js`.",
      "",
    ].join("\n")
  );

  console.log(`n=${n} domains=${domains} files=${warcFiles}`);
  console.log(`D1 ${d1}/${n} = ${pct(d1ci.p)}% (${pct(d1ci.lo)}–${pct(d1ci.hi)})`);
  console.log(`detector flagged ${flagged}/${n} = ${pct(flagci.p)}%`);
  console.log(`non-Latin script records ${recordsWithNonLatin}/${n}`);
  for (const [stratum, value] of Object.entries(stratifiedD1)) {
    console.log(`  D1 ${stratum}: ${value.d1}/${value.n} = ${value.prevalencePct}%`);
  }
  console.log(
    `clustered D1 overall: ${clusterOverall.prevalencePct}% (95% CI ${clusterOverall.ci95Pct[0]}–${clusterOverall.ci95Pct[1]}%, ${clusterOverall.domains} domains, ${CLUSTER_BOOTSTRAP} replicas)`
  );
  console.log(`wrote ${OUT}.json and ${OUT}.md`);
}

main();
