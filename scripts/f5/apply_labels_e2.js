#!/usr/bin/env node
"use strict";

/**
 * Apply the E2 letters to labels-e2.csv.
 *
 *   node scripts/f5/apply_labels_e2.js --answers="1=N,2=Y:forward,3=U"
 *
 * The pack numbers records 01..100 across its parts; this maps a number to the
 * message id and writes the E2 columns:
 *
 *   N       -> e2_visible_instruction = 0
 *   Y:class -> e2_visible_instruction = 1, action_class = class
 *   U       -> blank, notes = "unclear"
 *
 * The labels file is created from the sample on first use, so every sampled id
 * has a row from the start. Idempotent; unmentioned numbers are left untouched,
 * so a partial read stays partial.
 */

const fs = require("fs");
const path = require("path");

const BLOCK = /^## (\d{2,3}) — `([0-9a-f]+)`/;
const HEADER = ["id", "era", "e2_visible_instruction", "action_class", "confidence", "notes"];

function parseArgs(argv) {
  const args = {
    sample: "data/f5/visible-sample.csv",
    pack: "data/f5/pack-e2-1.md",
    labels: "data/f5/labels-e2.csv",
    answers: "",
    range: "",
    answer: "",
    clear: "",
  };
  for (const arg of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (match && match[1] in args) args[match[1]] = match[2];
  }
  return args;
}

/** Every pack part next to the one given (pack-e2-1.md, pack-e2-2.md, ...). */
function packParts(file) {
  const dir = path.dirname(file);
  const stem = path.basename(file).replace(/-\d+\.md$/, "");
  return fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(`${stem}-`) && name.endsWith(".md"))
    .sort()
    .map((name) => path.join(dir, name));
}

function numberToId(files) {
  const map = new Map();
  for (const file of files) {
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const match = BLOCK.exec(line);
      if (match) map.set(Number(match[1]), match[2]);
    }
  }
  return map;
}

/** Minimal CSV split/join: fields here are ids, words and short notes. */
function splitCsv(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

const joinCsv = (cells) =>
  cells.map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(",");

function ensureLabels(file, sample) {
  if (fs.existsSync(file)) return;
  const rows = fs.readFileSync(sample, "utf8").trim().split("\n").slice(1);
  const lines = [HEADER.join(",")];
  for (const row of rows) {
    const [id, era] = row.split(",");
    lines.push([id, era, "", "", "", ""].join(","));
  }
  fs.writeFileSync(file, lines.join("\n") + "\n");
  console.log(`created  : ${file} (${rows.length} rows)`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureLabels(args.labels, args.sample);

  // One answer for a whole run of blocks: --range=1-30 --answer=N
  let answers = args.answers;
  if (args.range && args.answer) {
    const match = /^(\d+)-(\d+)$/.exec(args.range);
    if (!match) throw new Error("--range must look like 1-30");
    const from = Number(match[1]);
    const to = Number(match[2]);
    if (to < from) throw new Error(`--range end (${to}) is before its start (${from})`);
    answers = [];
    for (let n = from; n <= to; n += 1) answers.push(`${n}=${args.answer}`);
    answers = answers.join(",");
  }
  if (!answers && !args.clear) {
    console.log("nothing to apply: pass --answers=\"1=N,2=Y:forward\", --range=1-30 --answer=N, or --clear=31-100");
    return;
  }

  const ids = numberToId(packParts(args.pack));

  // Clearing is a first-class operation: a label written on a block nobody
  // read has to be removable without hand-editing rows.
  if (args.clear) {
    const match = /^(\d+)-(\d+)$/.exec(args.clear);
    if (!match) throw new Error("--clear must look like 31-100");
    const cleared = [];
    const lines = fs.readFileSync(args.labels, "utf8").replace(/\r\n/g, "\n").split("\n");
    const header = splitCsv(lines[0]);
    const at = Object.fromEntries(HEADER.map((name) => [name, header.indexOf(name)]));
    for (let n = Number(match[1]); n <= Number(match[2]); n += 1) {
      const id = ids.get(n);
      if (!id) continue;
      const rowIndex = lines.findIndex((line, index) => index > 0 && splitCsv(line)[at.id] === id);
      if (rowIndex < 0) continue;
      const cells = splitCsv(lines[rowIndex]);
      cells[at.e2_visible_instruction] = "";
      cells[at.action_class] = "";
      lines[rowIndex] = joinCsv(cells);
      cleared.push(n);
    }
    fs.writeFileSync(args.labels, lines.join("\n"));
    console.log(`cleared  : ${cleared.length ? `${cleared[0]}-${cleared[cleared.length - 1]}` : "nothing"}`);
    return;
  }
  const pairs = answers
    .split(",")
    .map((piece) => piece.trim())
    .filter(Boolean)
    .map((piece) => {
      const [number, ...rest] = piece.split("=");
      return [Number(number), rest.join("=").trim()];
    });

  const lines = fs.readFileSync(args.labels, "utf8").replace(/\r\n/g, "\n").split("\n");
  const header = splitCsv(lines[0]);
  const at = Object.fromEntries(HEADER.map((name) => [name, header.indexOf(name)]));
  if (Object.values(at).some((index) => index < 0)) throw new Error(`labels header missing: ${header}`);

  const applied = [];
  const warnings = [];
  for (const [number, raw] of pairs) {
    const id = ids.get(number);
    if (!id) {
      warnings.push(`no record ${number}`);
      continue;
    }
    const value = raw.trim();
    const [code, ...actionParts] = value.split(":");
    const kind = code.toUpperCase();
    if (!["N", "Y", "U"].includes(kind)) {
      warnings.push(`${number}=${raw} is not N, Y:<action> or U`);
      continue;
    }
    const rowIndex = lines.findIndex((line, index) => index > 0 && splitCsv(line)[at.id] === id);
    if (rowIndex < 0) {
      warnings.push(`${number} (${id}) not in labels file`);
      continue;
    }
    const cells = splitCsv(lines[rowIndex]);
    while (cells.length < header.length) cells.push("");
    if (kind === "N") {
      cells[at.e2_visible_instruction] = "0";
      cells[at.action_class] = "";
    } else if (kind === "Y") {
      cells[at.e2_visible_instruction] = "1";
      cells[at.action_class] = actionParts.join(":").trim();
    } else {
      cells[at.e2_visible_instruction] = "";
      cells[at.notes] = cells[at.notes] || "unclear";
    }
    lines[rowIndex] = joinCsv(cells);
    applied.push(`${number}=${value}`);
  }

  fs.writeFileSync(args.labels, lines.join("\n"));
  console.log(`applied  : ${applied.length ? applied.join(", ") : "nothing"}`);
  if (warnings.length) console.log(`warnings : ${warnings.join("; ")}`);
  console.log(`labels   : ${path.resolve(args.labels)}`);
}

if (require.main === module) main();
