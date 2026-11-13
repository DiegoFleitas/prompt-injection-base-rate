#!/usr/bin/env node
"use strict";

/**
 * F5 triage sheet — what the human reads, and nothing else.
 *
 *   node scripts/f5/make_sheet.js --text=data/f5/text --flags=data/f5/flags.csv \
 *     --out=data/f5/sheet --csv=data/f5/triage.csv --labels=data/f5/labels.csv
 *
 * One sheet per D1 candidate, invisible code points replaced by markers via F1's
 * `visualize()`, sorted by how much judgement the message needs
 * (`smuggling` > `context` > `benign-signature`). No detector verdict and no
 * sender address is written: the sheet carries the month and the salted hash
 * only. `triage.csv` is text-free; `labels.csv` is a blank template the human
 * fills by hand (protocol §1: no LLM pre-labelling).
 */

const fs = require("fs");
const path = require("path");

const { makeClassifier, invisibleSummary, visualize } = require("../make-sheet.js");
const detector = require(path.join(__dirname, "..", "..", "..", "lemon-juice", "detectors.js"));

const classifier = makeClassifier(detector);
const RANK = { smuggling: 0, context: 1, "benign-signature": 2 };
const MAX_CHARS = 8000;
const HEAD_CHARS = 800;
const CONTEXT_CHARS = 320;
const MAX_WINDOWS = 5;
const CHANNEL_ORDER = ["plain", "plain_quoted", "html"];

function parseArgs(argv) {
  const args = {
    text: "data/f5/text",
    flags: "data/f5/flags.csv",
    out: "data/f5/sheet",
    csv: "data/f5/triage.csv",
    labels: "data/f5/labels.csv",
  };
  for (const arg of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (match && match[1] in args) args[match[1]] = match[2];
  }
  return args;
}

function readFlags(file) {
  const lines = fs.readFileSync(file, "utf8").trim().split("\n");
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(header.map((key, index) => [key, cells[index]]));
  });
}

/**
 * Code-point offsets of the invisible characters, so a window can be cut
 * around each one. Iterates code points (variation selectors in the E0100
 * plane are surrogate pairs) and advances by the UTF-16 width.
 */
function markerPositions(text, classifier) {
  const positions = [];
  let index = 0;
  for (const ch of text) {
    if (classifier.classify(ch)) positions.push(index);
    index += ch.length;
  }
  return positions;
}

/**
 * Excerpt that actually shows the markers.
 *
 * A head-only slice hides them: 497 of 644 marker-bearing channels carried
 * every marker past char 8000, so the annotator read boilerplate CSS and never
 * saw the character the scanner flagged. The excerpt is the message opening
 * plus up to five windows centred on markers, with byte offsets instead of
 * filler. A channel with no markers keeps the plain head slice.
 */
function excerpt(text, classifier, summary) {
  if (!summary.total) {
    const shown = text.slice(0, MAX_CHARS);
    return {
      shown,
      note: text.length > MAX_CHARS ? `\n[truncated at ${MAX_CHARS} chars]` : "",
    };
  }

  const windows = [];
  const headEnd = Math.min(HEAD_CHARS, text.length);
  for (const pos of markerPositions(text, classifier)) {
    const end = Math.min(text.length, pos + CONTEXT_CHARS);
    // markers already inside the opening are not repeated in a window
    if (end <= headEnd) continue;
    const start = Math.max(headEnd, pos - CONTEXT_CHARS);
    const last = windows[windows.length - 1];
    if (last && start <= last.end) {
      last.end = Math.max(last.end, end);
      continue;
    }
    if (windows.length >= MAX_WINDOWS) break;
    windows.push({ start, end });
  }

  // never cut a surrogate pair in half at the head boundary
  let head = text.slice(0, headEnd);
  if (head.length && head.charCodeAt(head.length - 1) >= 0xd800 && head.charCodeAt(head.length - 1) <= 0xdbff) {
    head = head.slice(0, -1);
  }
  const parts = [visualize(head, classifier)];
  let used = head.length;
  for (const window of windows) {
    const size = window.end - window.start;
    if (used + size > MAX_CHARS) break;
    parts.push(`[…${window.start}…]\n${visualize(text.slice(window.start, window.end), classifier)}`);
    used += size;
  }
  const note = windows.length
    ? `\n[excerpted ${used} of ${text.length} chars, ${windows.length} marker window(s)]`
    : `\n[excerpted ${used} of ${text.length} chars, every marker inside the opening]`;
  return { shown: parts.join("\n\n"), note };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const flags = readFlags(args.flags).filter((row) => row.class === "D1");

  const byId = new Map();
  for (const row of flags) {
    if (!byId.has(row.id)) byId.set(row.id, []);
    byId.get(row.id).push(row);
  }

  const candidates = [...byId.entries()]
    .map(([id, rows]) => ({
      id,
      priority: rows.map((row) => row.priority).sort((a, b) => RANK[a] - RANK[b])[0],
      mechanisms: [...new Set(rows.map((row) => row.mechanism))].sort(),
      channels: [...new Set(rows.map((row) => row.channel))],
    }))
    .sort((a, b) => RANK[a.priority] - RANK[b.priority] || a.id.localeCompare(b.id));

  fs.mkdirSync(args.out, { recursive: true });
  const triageRows = ["id,month,priority,channels,mechanisms,plain_chars,quoted_chars,html_chars"];

  for (const candidate of candidates) {
    const record = JSON.parse(
      fs.readFileSync(path.join(args.text, `${candidate.id}.json`), "utf8")
    );
    const blocks = [];
    for (const channel of CHANNEL_ORDER) {
      const text = record[channel] || "";
      if (!text) continue;
      const summary = invisibleSummary(text, classifier);
      const { shown, note } = excerpt(text, classifier, summary);
      blocks.push(
        `---- ${channel} (${text.length} chars, ${summary.total} invisible) ----\n` +
          shown +
          note
      );
    }

    const sheet = [
      `id: ${candidate.id}`,
      `month: ${record.headers?.month || ""}`,
      `sender: ${record.headers?.from_hash || ""}`,
      `priority: ${candidate.priority}`,
      `mechanisms: ${candidate.mechanisms.join(", ")}`,
      "",
      "Read the message. Record d2_concealed_instruction / d3_directive_no_action,",
      "action_class, confidence and notes in labels.csv. Do not paste message text.",
      "",
      ...blocks,
      "",
    ].join("\n");
    fs.writeFileSync(path.join(args.out, `${candidate.id}.txt`), sheet);

    triageRows.push([
      candidate.id,
      record.headers?.month || "",
      candidate.priority,
      candidate.channels.join("|"),
      candidate.mechanisms.join("|"),
      (record.plain || "").length,
      (record.plain_quoted || "").length,
      (record.html || "").length,
    ].join(","));
  }

  fs.mkdirSync(path.dirname(args.csv), { recursive: true });
  fs.writeFileSync(args.csv, triageRows.join("\n") + "\n");

  if (!fs.existsSync(args.labels)) {
    fs.writeFileSync(
      args.labels,
      ["id,d1_invisible,d2_concealed_instruction,d3_directive_no_action,action_class,confidence,notes"]
        .concat(candidates.map((candidate) => `${candidate.id},1,,,,,`))
        .join("\n") + "\n"
    );
  }

  const counts = ["smuggling", "context", "benign-signature"].map((priority) => {
    const n = candidates.filter((candidate) => candidate.priority === priority).length;
    return `${priority}: ${n}`;
  });
  console.log(`D1 candidates   : ${candidates.length}`);
  console.log(`priority split  : ${counts.join(", ")}`);
  console.log(`sheets          : ${args.out}/`);
  console.log(`triage csv      : ${args.csv}`);
  console.log(`labels template : ${args.labels}`);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { main, excerpt, markerPositions };
}

if (require.main === module) main();
