#!/usr/bin/env node
"use strict";

/**
 * E2 sample — the visible-instruction arm the protocol froze but nobody drew.
 *
 *   node scripts/f5/sample_visible.js --manifest=data/f5/corpus-manifest.csv \
 *     --out=data/f5/visible-sample.csv [--n=100] [--seed=20261113]
 *
 * Protocol-f5.md §9: 100 messages, stratified by era, single annotator. The two
 * eras are the same ones the D1 analysis uses (primary 2023-01-01 → 2026-07-18,
 * stratum 2018-05 → 2022-12), and they are allocated proportionally: 100 over
 * 714/607 is 54 primary + 46 stratum. Every eligible message has one draw,
 * ordered by sha256(seed:id), so the sample is reproducible from the manifest
 * alone and no message is re-drawn.
 *
 * Writes ids, era, source and month only — no sender, no subject, no text. The
 * file is local (`data/f5/` is git-ignored) and is the input to
 * make_visible_pack.js.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const PRIMARY_FROM = "2023-01";
const PRIMARY_TO = "2026-07";

function parseArgs(argv) {
  const args = {
    manifest: "data/f5/corpus-manifest.csv",
    out: "data/f5/visible-sample.csv",
    n: 100,
    seed: 20261113,
  };
  for (const arg of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (match && match[1] in args) args[match[1]] = match[2];
  }
  args.n = Number(args.n);
  return args;
}

function readCsv(file) {
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(header.map((key, index) => [key, cells[index]]));
  });
}

const drawKey = (seed, id) => crypto.createHash("sha256").update(`${seed}:${id}`).digest("hex");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const eligible = readCsv(args.manifest).filter((row) => row.self === "0");

  const eraOf = (row) => (row.date_month >= PRIMARY_FROM && row.date_month <= PRIMARY_TO ? "primary" : "stratum");
  const strata = { primary: [], stratum: [] };
  for (const row of eligible) strata[eraOf(row)].push(row);
  for (const rows of Object.values(strata)) {
    rows.sort((a, b) => drawKey(args.seed, a.id).localeCompare(drawKey(args.seed, b.id)));
  }

  const total = eligible.length;
  const primaryN = Math.round((args.n * strata.primary.length) / total);
  const allocation = { primary: primaryN, stratum: args.n - primaryN };

  const rows = [];
  const drawn = {};
  for (const era of ["primary", "stratum"]) {
    const take = Math.min(allocation[era], strata[era].length);
    if (take < allocation[era]) {
      throw new Error(`${era} has only ${strata[era].length} messages, cannot draw ${allocation[era]}`);
    }
    drawn[era] = strata[era].slice(0, take).map((row) => ({ id: row.id, era, source: row.source, month: row.date_month }));
  }

  // Interleave the eras so any prefix of the sample stays era-balanced: an
  // annotator who stops at 30 has ~16 primary + 14 stratum, not 30 of one era.
  for (let i = 0; i < Math.max(drawn.primary.length, drawn.stratum.length); i += 1) {
    if (drawn.primary[i]) rows.push(drawn.primary[i]);
    if (drawn.stratum[i]) rows.push(drawn.stratum[i]);
  }

  fs.writeFileSync(
    args.out,
    ["id,era,source,month"].concat(rows.map((row) => `${row.id},${row.era},${row.source},${row.month}`)).join("\n") + "\n"
  );

  console.log(`eligible        : ${total}`);
  console.log(`strata          : primary ${strata.primary.length}, stratum ${strata.stratum.length}`);
  console.log(`draw            : ${rows.length} (${allocation.primary} primary + ${allocation.stratum} stratum)`);
  console.log(`seed            : ${args.seed}`);
  console.log(`sample          : ${args.out}`);
}

if (require.main === module) main();
