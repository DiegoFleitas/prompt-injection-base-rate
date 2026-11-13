#!/usr/bin/env node
"use strict";

/**
 * F5 annotation pack — the 10-minute human read, cut from the triage sheets.
 *
 *   node scripts/f5/make_pack.js --sheet=data/f5/sheet --triage=data/f5/triage.csv \
 *     --out=data/f5/pack-10min.md [--n=7] [--priority=smuggling]
 *
 * Two problems this has to solve, both measured before it was written:
 *
 * 1. The sheets used to show the first 8000 chars and nothing else, so 497 of
 *    644 marker-bearing channels showed the annotator boilerplate CSS with no
 *    marker in sight. The pack cuts windows around the markers instead.
 * 2. A marker run can be hundreds long (a template padding a cell with ZWNJ),
 *    so showing every character produced an 83 KB pack. Runs of four or more
 *    collapse to two markers plus a count.
 *
 * Records are drawn one per (sender, channel) so seven reads are not seven
 * copies of one sender's template. Ids and counts go to stdout; snippets go to
 * the file only, so a run log cannot leak message text.
 */

const fs = require("fs");
const path = require("path");

const BLOCK = /^---- (\w+) \((\d+) chars, (\d+) invisible\) ----$/;
const WINDOW = /^\[…(\d+)…\]$/;
const MARKER = /⟦[A-Z]+:U\+[0-9A-F]+⟧/g;
const SNIPPET_WIDTH = 220;
const RANK = { smuggling: 0, context: 1, "benign-signature": 2 };

function parseArgs(argv) {
  const args = {
    sheet: "data/f5/sheet",
    triage: "data/f5/triage.csv",
    out: "data/f5/pack-10min.md",
    n: 7,
    priority: "smuggling",
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

/** Split one sheet into channel blocks, and each block into marker windows. */
function parseSheet(text) {
  const lines = text.split("\n");
  const blocks = [];
  let sender = "";
  let current = null;
  let window = null;

  const flushWindow = () => {
    if (current && window) {
      window.text = window.lines.join("\n");
      if (window.isHead && !window.text.includes("⟦")) window.text = "";
      if (window.text) current.windows.push(window);
    }
    window = null;
  };
  const flushBlock = () => {
    flushWindow();
    if (current) blocks.push(current);
    current = null;
  };

  for (const line of lines) {
    if (line.startsWith("sender: ") && !sender) sender = line.slice(8).trim();
    const block = BLOCK.exec(line);
    if (block) {
      flushBlock();
      current = {
        channel: block[1],
        chars: Number(block[2]),
        invisible: Number(block[3]),
        windows: [],
      };
      window = { offset: undefined, isHead: true, lines: [] };
      continue;
    }
    if (!current) continue;
    const marker = WINDOW.exec(line);
    if (marker) {
      flushWindow();
      window = { offset: Number(marker[1]), isHead: false, lines: [] };
      continue;
    }
    if (/^\[excerpted \d+ of \d+ chars/.test(line) || /^\[truncated at \d+ chars\]$/.test(line)) {
      continue;
    }
    if (window) window.lines.push(line);
  }
  flushBlock();

  for (const block of blocks) {
    block.windows.sort((a, b) => (a.offset || 0) - (b.offset || 0));
  }
  return { sender, blocks: blocks.filter((block) => block.windows.length) };
}

const countMarkers = (text) => (text.match(MARKER) || []).length;

/** A run of 4+ identical markers becomes two markers and a count. */
function collapseRuns(text) {
  return text.replace(/(?:⟦[A-Z]+:U\+[0-9A-F]+⟧){4,}/g, (run) => {
    const items = run.match(MARKER);
    const kind = items[0].slice(1, items[0].indexOf(":"));
    return `${items[0]}${items[1]}⟦…${kind} ×${items.length - 2}⟧`;
  });
}

/** Cut around the first marker, never through a half-written marker. */
function cut(text) {
  const flat = text.replace(/\s*\n\s*/g, " ").trim();
  const at = flat.indexOf("⟦");
  if (at < 0) return flat.slice(0, SNIPPET_WIDTH * 2);
  let start = Math.max(0, at - SNIPPET_WIDTH);
  let end = Math.min(flat.length, at + SNIPPET_WIDTH);
  if (start > 0) {
    const firstEnd = flat.indexOf("⟧", start);
    if (firstEnd >= 0 && firstEnd < at) start = firstEnd + 1;
  }
  if (end < flat.length) {
    const lastOpen = flat.lastIndexOf("⟦", end);
    if (lastOpen > at) end = lastOpen;
  }
  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const rows = readCsv(args.triage);

  const candidates = rows.map((row) => {
    const sheet = fs.readFileSync(path.join(args.sheet, `${row.id}.txt`), "utf8");
    const parsed = parseSheet(sheet);
    const block = [...parsed.blocks].sort((a, b) => b.invisible - a.invisible)[0] || null;
    return {
      id: row.id,
      month: row.month,
      priority: row.priority,
      sender: parsed.sender,
      block,
      density: block ? block.invisible : 0,
    };
  });

  // One record per sender: D1 turned out to be a sender property (one address
  // owns all 109 smuggling records, another owns 317 of the 457 benign ones),
  // so seven records from one template measure one template. Groups are ranked
  // by how much judgement their densest member needs, then round-robin.
  const rankOf = (candidate) => RANK[candidate.priority] ?? 9;
  const groups = new Map();
  for (const candidate of candidates) {
    if (!groups.has(candidate.sender)) groups.set(candidate.sender, []);
    groups.get(candidate.sender).push(candidate);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => rankOf(a) - rankOf(b) || b.density - a.density || a.id.localeCompare(b.id));
  }
  const queue = [...groups.values()].sort(
    (a, b) => rankOf(a[0]) - rankOf(b[0]) || b[0].density - a[0].density
  );

  const chosen = [];
  while (chosen.length < args.n && queue.some((group) => group.length)) {
    for (const group of queue) {
      if (chosen.length >= args.n) break;
      if (group.length) chosen.push(group.shift());
    }
  }

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const out = [
    `# 10-minute visual check — ${chosen.length} records`,
    "",
    "One record per sender, hardest class first, densest first, so the sample",
    "is not the same template seven times.",
    "",
    "Each block: id, what the scanner saw, then windows with invisible",
    "characters made visible as ⟦KIND:U+XXXX⟧. A run of four or more collapses",
    "to two markers plus ⟦…×N⟧. Read only the snippets.",
    "",
    "Answer per letter. In `data/f5/labels.csv`, for that record's id:",
    "  B = benign     -> d2_concealed_instruction = 0, notes = 3 words why",
    "  S = suspicious -> d2_concealed_instruction = 1, action_class = what it asks",
    "  U = unclear    -> leave d2 blank, notes = unclear + 3 words",
    "",
    "Labels stay local. Do not paste message text into any model.",
    "",
  ];

  let shown = 0;
  chosen.forEach((candidate, index) => {
    const total = candidate.block ? candidate.block.invisible : 0;
    const channel = candidate.block ? candidate.block.channel : "no markers";
    out.push(
      `## ${letters[index]} — \`${candidate.id}\` (${candidate.month}, ${candidate.priority}, ` +
        `${channel}, ${total} marker${total === 1 ? "" : "s"})`
    );
    out.push("");
    if (!candidate.block) return;
    const windows = [...candidate.block.windows]
      .sort((a, b) => countMarkers(b.text) - countMarkers(a.text))
      .slice(0, 2)
      .sort((a, b) => (a.offset || 0) - (b.offset || 0));
    for (const window of windows) {
      const text = cut(collapseRuns(window.text));
      shown += countMarkers(text);
      out.push(`> (${window.offset === undefined ? "head" : `@${window.offset}`}) ${text}`);
      out.push("");
    }
  });

  fs.writeFileSync(args.out, out.join("\n"));
  console.log(`pack records    : ${chosen.length} (${groups.size} sender groups)`);
  console.log(`markers shown   : ${shown}`);
  console.log(`pack            : ${args.out}`);
}

if (require.main === module) main();
