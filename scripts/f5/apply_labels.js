#!/usr/bin/env node
"use strict";

/**
 * Apply the annotator's letters to labels.csv.
 *
 *   node scripts/f5/apply_labels.js --answers="A=B,B=U,C=S" [--notes="A=emoji artifact"]
 *
 * The pack (`data/f5/pack-10min.md`) labels each record A, B, C...; this maps a
 * letter to its id and writes the protocol's columns:
 *
 *   B -> d2_concealed_instruction = 0
 *   S -> d2_concealed_instruction = 1
 *   U -> d2 left blank, notes prefixed "unclear"
 *
 * It is a transcription aid, not a classifier: it knows no keywords and never
 * guesses. Running it twice with the same letters is idempotent. Blank cells for
 * unmentioned letters are left untouched, so a partial pass stays partial.
 */

const fs = require("fs");
const path = require("path");

const HEADER = /^## ([A-Z]) — `([0-9a-f]+)`/;

function parseArgs(argv) {
  const args = {
    pack: "data/f5/pack-10min.md",
    labels: "data/f5/labels.csv",
    answers: "",
    notes: "",
  };
  for (const arg of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (match && match[1] in args) args[match[1]] = match[2];
  }
  return args;
}

function readLetters(file) {
  const text = fs.readFileSync(file, "utf8");
  const map = new Map();
  for (const line of text.split("\n")) {
    const match = HEADER.exec(line);
    if (match) map.set(match[1], match[2]);
  }
  return map;
}

function parsePairs(value, what) {
  const pairs = new Map();
  for (const piece of value.split(",").map((item) => item.trim()).filter(Boolean)) {
    const [key, ...rest] = piece.split("=");
    if (!key || !rest.length) throw new Error(`${what}: expected KEY=value, got "${piece}"`);
    pairs.set(key.trim(), rest.join("=").trim());
  }
  return pairs;
}

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

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.answers) throw new Error("--answers is required, e.g. A=B,B=U,C=S");

  const letters = readLetters(args.pack);
  const answers = parsePairs(args.answers, "answers");
  const notes = args.notes ? parsePairs(args.notes, "notes") : new Map();

  const lines = fs.readFileSync(args.labels, "utf8").replace(/\r\n/g, "\n").split("\n");
  const header = splitCsv(lines[0]);
  const col = (name) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`labels.csv has no column ${name}`);
    return index;
  };
  const idAt = col("id");
  const d2At = col("d2_concealed_instruction");
  const d3At = col("d3_directive_no_action");
  const classAt = col("action_class");
  const notesAt = col("notes");

  const applied = [];
  const warnings = [];
  for (const [letter, answer] of answers) {
    const id = letters.get(letter);
    if (!id) {
      warnings.push(`pack has no record ${letter}`);
      continue;
    }
    const value = answer.toUpperCase();
    const [letterCode, ...actionParts] = value.split(":");
    if (!["B", "S", "U"].includes(letterCode)) {
      warnings.push(`${letter}=${answer} is not B, S or U`);
      continue;
    }
    const rowIndex = lines.findIndex((line, index) => index > 0 && splitCsv(line)[idAt] === id);
    if (rowIndex < 0) {
      warnings.push(`${letter} (${id}) is not in labels.csv`);
      continue;
    }
    const cells = splitCsv(lines[rowIndex]);
    while (cells.length < header.length) cells.push("");
    // D2 is the instruction; D3 (directive, no action) is a separate judgement
    // the annotator makes, so it is never filled in from a letter.
    if (letterCode === "B") {
      cells[d2At] = "0";
    } else if (letterCode === "S") {
      cells[d2At] = "1";
      const action = actionParts.join(":").replace(/^S=?/i, "").trim();
      if (action) cells[classAt] = action;
    } else {
      cells[d2At] = "";
    }
    if (notes.has(letter)) cells[notesAt] = notes.get(letter);
    else if (letterCode === "U") cells[notesAt] = "unclear";
    lines[rowIndex] = cells
      .map((cell) => (/[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
      .join(",");
    applied.push(`${letter}=${value} (${id})`);
  }

  fs.writeFileSync(args.labels, lines.join("\n"));
  console.log(`applied   : ${applied.length ? applied.join(", ") : "nothing"}`);
  if (warnings.length) console.log(`warnings  : ${warnings.join("; ")}`);
  console.log(`labels    : ${path.resolve(args.labels)}`);
  console.log("next      : node scripts/f5/analyze_eml.js");
}

if (require.main === module) main();
