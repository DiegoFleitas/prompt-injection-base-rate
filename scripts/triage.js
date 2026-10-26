#!/usr/bin/env node
"use strict";

/**
 * Triage helper for the D2 annotation pass.
 *
 *   node scripts/triage.js --sample=data/wet-sample.jsonl \
 *     --candidates=data/d1-candidates.csv --out=data/triage.csv
 *
 * It does **not** write labels and it does not decide D2. It sorts the candidates
 * by how likely they are to need human judgement and records the evidence for
 * that sort, so the annotator spends attention where it matters. The blind pass
 * still happens: this file is local, `labels.csv` is filled by a human, and the
 * detector output stays hidden until analysis.
 *
 * Priority rules, all mechanical:
 *  - `smuggling` — Unicode Tags, sneaky bits, bidi controls, or a variation-
 *    selector run (the channels whose only plausible purpose is carrying data).
 *  - `context`    — zero-width/word-joiner not adjacent to CJK/Hangul/Kana text,
 *    i.e. the benign line-breaking explanation is unavailable.
 *  - `benign-signature` — BOM at offset 0, VS16 after an emoji, or a zero-width
 *    character inside CJK text. Still needs a human glance, but last.
 */

const fs = require("fs");
const path = require("path");

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const SAMPLE = arg("sample", path.join("data", "wet-sample.jsonl"));
const CANDIDATES = arg("candidates", path.join("data", "d1-candidates.csv"));
const OUT = arg("out", path.join("data", "triage.csv"));

const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u1100-\u11ff]/;
const EMOJI = /[\p{Extended_Pictographic}]/u;
const TAGS = (cp) => cp >= 0xe0000 && cp <= 0xe007f;
const VS = (cp) => (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef);
const SNEAKY = (cp) => cp === 0x2062 || cp === 0x2064;
const BIDI = (cp) =>
  (cp >= 0x202a && cp <= 0x202e) || (cp >= 0x2066 && cp <= 0x2069) || cp === 0x200e || cp === 0x200f;
const ZW = (cp) => cp === 0x200b || cp === 0x200c || cp === 0x200d || cp === 0x2060 || cp === 0xfeff;

function classify(record) {
  const text = record.text;
  const chars = [...text];
  const flags = { tags: 0, sneaky: 0, bidi: 0, vsRun: 0, vsTotal: 0, zw: 0, bomOffset0: false };
  let vsStreak = 0;

  for (let i = 0; i < chars.length; i += 1) {
    const cp = chars[i].codePointAt(0);
    if (TAGS(cp)) flags.tags += 1;
    if (SNEAKY(cp)) flags.sneaky += 1;
    if (BIDI(cp)) flags.bidi += 1;
    if (VS(cp)) {
      flags.vsTotal += 1;
      vsStreak += 1;
      flags.vsRun = Math.max(flags.vsRun, vsStreak);
    } else {
      vsStreak = 0;
    }
    if (ZW(cp)) {
      flags.zw += 1;
      if (cp === 0xfeff && i === 0) flags.bomOffset0 = true;
    }
  }

  // Zero-width characters with CJK/Hangul/Kana in their neighbourhood have a
  // benign line-breaking explanation; without it, they need a look.
  let zwNeedsContext = false;
  if (flags.zw > 0 && !flags.bomOffset0) {
    const positions = [];
    chars.forEach((ch, index) => {
      if (ZW(ch.codePointAt(0)) && !(ch.codePointAt(0) === 0xfeff && index === 0)) positions.push(index);
    });
    zwNeedsContext = positions.some((index) => {
      const window = chars.slice(Math.max(0, index - 30), index + 30).join("");
      return !CJK.test(window);
    });
  }

  const reasons = [];
  let priority = "benign-signature";
  if (flags.tags || flags.sneaky || flags.bidi || flags.vsRun >= 3) {
    priority = "smuggling";
    if (flags.tags) reasons.push(`${flags.tags} Tags-block chars`);
    if (flags.sneaky) reasons.push(`${flags.sneaky} sneaky-bit chars`);
    if (flags.bidi) reasons.push(`${flags.bidi} bidi controls`);
    if (flags.vsRun >= 3) reasons.push(`variation-selector run of ${flags.vsRun}`);
  } else if (zwNeedsContext) {
    priority = "context";
    reasons.push("zero-width outside a CJK window");
  } else {
    if (flags.bomOffset0) reasons.push("BOM at offset 0");
    if (flags.vsTotal) reasons.push(`${flags.vsTotal} variation selector(s), no run`);
    if (flags.zw && !flags.bomOffset0) reasons.push("zero-width inside a CJK window");
    if (flags.zw && flags.bomOffset0) reasons.push("zero-width plus BOM");
    if (!reasons.length) reasons.push("mechanism only");
  }

  // Emoji adjacency is the benign explanation for a lone VS16.
  const vsAfterEmoji = chars.some((ch, index) => {
    const cp = ch.codePointAt(0);
    return VS(cp) && index > 0 && EMOJI.test(chars[index - 1]);
  });
  if (priority === "benign-signature" && vsAfterEmoji) reasons.push("VS16 follows an emoji");

  return { priority, reasons, flags };
}

/** One-line evidence with invisibles marked, capped; never used for publication. */
function evidence(record) {
  const chars = [...record.text];
  let count = 0;
  let out = "";
  for (let i = 0; i < chars.length && count < 3; i += 1) {
    const cp = chars[i].codePointAt(0);
    const isInvisible = TAGS(cp) || VS(cp) || SNEAKY(cp) || BIDI(cp) || ZW(cp);
    if (!isInvisible) continue;
    count += 1;
    const before = chars.slice(Math.max(0, i - 12), i).join("");
    out += `…${before}⟦U+${cp.toString(16).toUpperCase()}⟧`;
  }
  return out.replace(/[\r\n]+/g, " ").slice(0, 220);
}

function main() {
  const records = new Map(
    fs
      .readFileSync(SAMPLE, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .map((record) => [record.id, record])
  );
  const candidates = fs
    .readFileSync(CANDIDATES, "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => {
      const [id, domain, count] = line.split(",");
      return { id, domain, count: Number(count) };
    });

  const rows = [];
  for (const candidate of candidates) {
    const record = records.get(candidate.id);
    if (!record) continue;
    const { priority, reasons } = classify(record);
    rows.push({
      id: candidate.id,
      domain: candidate.domain,
      invisible_count: candidate.count,
      priority,
      reasons: reasons.join("; "),
      evidence: evidence(record),
    });
  }

  const order = { smuggling: 0, context: 1, "benign-signature": 2 };
  rows.sort((a, b) => order[a.priority] - order[b.priority] || b.invisible_count - a.invisible_count);

  const header = ["id", "domain", "invisible_count", "priority", "reasons", "evidence"];
  const escape = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(
    OUT,
    [header.join(","), ...rows.map((row) => header.map((key) => escape(row[key])).join(","))].join("\n") + "\n"
  );

  const counts = rows.reduce((acc, row) => {
    acc[row.priority] = (acc[row.priority] || 0) + 1;
    return acc;
  }, {});
  console.log(`candidates: ${rows.length}`);
  for (const [priority, count] of Object.entries(counts)) console.log(`  ${priority}: ${count}`);
  console.log(`\nwrote ${OUT} — sorted smuggling-first. This is a triage list, not a label:`);
  console.log("labels.csv still needs a human, and the sheet is still the thing to read.");
}

if (require.main === module) main();

module.exports = { classify };
