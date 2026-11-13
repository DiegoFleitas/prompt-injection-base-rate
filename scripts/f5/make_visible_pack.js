#!/usr/bin/env node
"use strict";

/**
 * E2 pack — what the annotator reads for the visible-instruction arm.
 *
 *   node scripts/f5/make_visible_pack.js --sample=data/f5/visible-sample.csv \
 *     --text=data/f5/text --out=data/f5/pack-e2 --split=50 [--width=1200]
 *
 * E2 asks whether the visible words address an assistant, so the pack shows
 * visible text, not MIME source: `text/plain`, else `plain_quoted`, else the
 * HTML with tags removed and entities decoded. Long URLs collapse to `[url]`
 * (a tracking URL is not what E2 asks about) and the excerpt is capped at
 * `--width` chars so 100 reads fit an hour.
 *
 * Printing is counts only; the text goes to the files under data/f5/.
 */

const fs = require("fs");
const path = require("path");

const HEADER = /^([0-9a-f]+),(\w+),(\w+),(\d{4}-\d{2})$/;

function parseArgs(argv) {
  const args = {
    sample: "data/f5/visible-sample.csv",
    text: "data/f5/text",
    out: "data/f5/pack-e2",
    split: 50,
    width: 1200,
  };
  for (const arg of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (match && match[1] in args) args[match[1]] = match[2];
  }
  args.split = Number(args.split);
  args.width = Number(args.width);
  return args;
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function toVisibleText(html) {
  return html
    .replace(/<(script|style|noscript|template|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code) => {
      if (code[0] === "#") {
        const point = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(point) ? String.fromCodePoint(point) : " ";
      }
      return ENTITIES[code.toLowerCase()] ?? " ";
    });
}

function tidy(text, width) {
  const flat = text
    .replace(/https?:\/\/\S{60,}/g, "[url]")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (flat.length <= width) return { text: flat, cut: 0 };
  return { text: flat.slice(0, width).replace(/\s+\S*$/, "…"), cut: flat.length - width };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const lines = fs.readFileSync(args.sample, "utf8").trim().split("\n").slice(1);
  const sample = lines.map((line) => {
    const match = HEADER.exec(line);
    if (!match) throw new Error(`bad sample row: ${line}`);
    return { id: match[1], era: match[2], source: match[3], month: match[4] };
  });

  const intro = [
    "# E2 read — visible instruction addressed to an assistant",
    "",
    "Protocol §4: E2 = a visible instruction addressed to an assistant, with an",
    "action class, no concealment required. This is the surface F1 could not see.",
    "",
    "**Counts as Y** only if the visible words tell an AI / assistant / agent / model",
    "what to do: they name the reader as such (or reassign its identity) **and** give",
    "an action — forward or send, click or fetch a link, call a tool, disclose",
    "something, delete something, change behaviour.",
    "",
    "**Does not count**: calls to action aimed at a person (apply, renew, confirm),",
    "unsubscribe and footer boilerplate, legal notices, quoted text that merely",
    "mentions AI, a recruiter asking a human for their CV.",
    "",
    "Answer per number: `N` = no instruction, `Y:<action>` = yes with the action",
    "class (forward, click, disclose, run-tool, delete, change-behaviour, other),",
    "`U` = unclear.",
    "",
    "Excerpts are visible text: HTML tags stripped, entities decoded, long URLs",
    "collapsed to `[url]`, capped at the width below. The D1 scan judged raw source;",
    "this read judges what a reader sees, which is the point of E2.",
    "",
  ];

  let written = 0;
  let truncated = 0;
  let totalChars = 0;
  for (let start = 0; start < sample.length; start += args.split) {
    const chunk = sample.slice(start, start + args.split);
    const part = Math.floor(start / args.split) + 1;
    const out = [
      ...intro.map((line) => (line === intro[0] ? `${line} (${chunk.length} of ${sample.length}, part ${part})` : line)),
    ];
    for (const row of chunk) {
      const record = JSON.parse(fs.readFileSync(path.join(args.text, `${row.id}.json`), "utf8"));
      // E2 is about what a reader sees, so take the rendering with the most
      // visible text: a 68-char plain stub next to a 30 KB HTML body is a
      // rendering, not an empty message.
      const candidates = [
        ["plain", record.plain || ""],
        ["plain_quoted", record.plain_quoted || ""],
        ["html", toVisibleText(record.html || "")],
      ].map(([channel, text]) => ({ channel, ...tidy(text, args.width) }));
      const best = candidates.reduce((a, b) => (b.text.length > a.text.length ? b : a));
      if (best.cut) truncated += 1;
      totalChars += best.text.length;
      written += 1;
      out.push(`## ${String(written).padStart(2, "0")} — \`${row.id}\` (${row.month}, ${row.source}, ${row.era}, ${best.channel})`);
      out.push("");
      out.push(best.text.replace(/\n/g, "\n> ").replace(/^/, "> ").replace(/> $/, ">"));
      out.push("");
    }
    fs.writeFileSync(`${args.out}-${part}.md`, out.join("\n"));
  }

  console.log(`records         : ${written}`);
  console.log(`truncated       : ${truncated} at ${args.width} chars`);
  console.log(`avg excerpt     : ${Math.round(totalChars / Math.max(1, written))} chars`);
  console.log(`files           : ${args.out}-1.md .. ${args.out}-${Math.ceil(written / args.split)}.md`);
}

if (require.main === module) main();
