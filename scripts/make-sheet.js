#!/usr/bin/env node
"use strict";

/**
 * Turn a sample into blind adjudication sheets.
 *
 *   node make-sheet.js --in=data/wet-sample.jsonl --sheet=sheet --labels=labels.csv
 *
 * Writes one text file per record with every invisible code point made visible,
 * a `labels.csv` template to annotate, and — separately, so the annotator never
 * sees it — `data/detector-flags.csv` with Lemon Juice's verdict. The join
 * happens only in analyze.js, which is what keeps the prevalence number blind.
 *
 * Classification deliberately reuses the detector's own predicates
 * (`isTagChar`, `isVariationSelector`, `isSneakyBitsChar`) instead of
 * re-deriving them. The first version of this file re-derived them with a
 * hand-written character class and got it wrong in a way that classified almost
 * every character as invisible — see selftest.js, added for exactly that.
 *
 * Safety: this only reads local files and writes text. No network, no model.
 */

const fs = require("fs");
const path = require("path");

const INVISIBLE_CHAR = /\p{Default_Ignorable_Code_Point}/u;
const BIDI_CONTROL = /\p{Bidi_Control}/u;

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const NAMES = new Map([
  [0x200b, "ZWSP"],
  [0x200c, "ZWNJ"],
  [0x200d, "ZWJ"],
  [0x2060, "WJ"],
  [0xfeff, "BOM"],
  [0x00ad, "SHY"],
  [0x061c, "ALM"],
  [0x202a, "LRE"],
  [0x202b, "RLE"],
  [0x202c, "PDF"],
  [0x202d, "LRO"],
  [0x202e, "RLO"],
  [0x2066, "LRI"],
  [0x2067, "RLI"],
  [0x2068, "FSI"],
  [0x2069, "PDI"],
  [0x2062, "INVISIBLE-TIMES"],
  [0x2064, "INVISIBLE-PLUS"],
]);

/**
 * @param {string} scanner the loaded detectors.js PIScanner (may be null)
 * @returns {{classify: (ch: string) => string|null, describe: (ch: string) => string}}
 */
function makeClassifier(scanner) {
  const isTag = (cp) =>
    scanner?.isTagChar ? scanner.isTagChar(cp) : cp >= 0xe0000 && cp <= 0xe007f;
  const isVariation = (cp) =>
    scanner?.isVariationSelector
      ? scanner.isVariationSelector(cp)
      : (cp >= 0xfe00 && cp <= 0xfe0f) || (cp >= 0xe0100 && cp <= 0xe01ef);
  const isSneaky = (cp) =>
    scanner?.isSneakyBitsChar ? scanner.isSneakyBitsChar(cp) : cp === 0x2062 || cp === 0x2064;

  function classify(ch) {
    if ([...ch].length !== 1) return null;
    const cp = ch.codePointAt(0);
    if (isTag(cp)) return "TAG";
    if (isSneaky(cp)) return NAMES.get(cp) || "SNEAKY";
    if (isVariation(cp)) return "VS";
    if (BIDI_CONTROL.test(ch)) return NAMES.get(cp) || "BIDI";
    if (INVISIBLE_CHAR.test(ch)) return NAMES.get(cp) || "DEFAULT-IGNORABLE";
    return null;
  }

  function describe(ch) {
    const cp = ch.codePointAt(0);
    return `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`;
  }

  return { classify, describe };
}

/** One line describing every invisible code point present, with counts. */
function invisibleSummary(text, classifier) {
  const counts = new Map();
  for (const ch of text) {
    const kind = classifier.classify(ch);
    if (!kind) continue;
    const key = `${kind} ${classifier.describe(ch)}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  return { total, parts: [...counts.entries()] };
}

/** Replace invisible characters with a visible marker so a human can see them. */
function visualize(text, classifier) {
  let out = "";
  for (const ch of text) {
    const kind = classifier.classify(ch);
    out += kind ? `⟦${kind}:${classifier.describe(ch)}⟧` : ch;
  }
  return out;
}

function sheetText(record, summary, classifier, maxDisplay) {
  const truncated = record.text.length > maxDisplay;
  const body = visualize(record.text.slice(0, maxDisplay), classifier);
  return [
    `id: ${record.id}`,
    `frame: ${record.frame}`,
    `domain: ${record.domain}`,
    `chars: ${record.chars}`,
    `invisible code points: ${summary.total} (${summary.parts.map(([k, n]) => `${k} x${n}`).join(", ") || "none"})`,
    "",
    "---- text, invisible code points made visible ----",
    body,
    truncated ? `\n[truncated at ${maxDisplay} chars]` : "",
    "",
  ].join("\n");
}

function loadDetector(file) {
  try {
    return require(file);
  } catch (error) {
    console.error(`warning: detector not loadable (${error.message}); D1 falls back`);
    return null;
  }
}

function main() {
  const input = arg("in", path.join("data", "wet-sample.jsonl"));
  const sheetDir = arg("sheet", "sheet");
  const labels = arg("labels", "labels.csv");
  const flags = arg("flags", path.join("data", "detector-flags.csv"));
  const detectorFile = arg("detector", path.join("..", "lemon-juice", "detectors.js"));
  const maxDisplay = Number(arg("max-display", "6000"));

  const records = fs
    .readFileSync(input, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const scanner = loadDetector(detectorFile);
  const classifier = makeClassifier(scanner);

  fs.mkdirSync(sheetDir, { recursive: true });
  fs.mkdirSync(path.dirname(flags), { recursive: true });

  const flagRows = ["id,verdict,flagged,types"];
  const candidateRows = ["id,domain,invisible_count,kinds"];
  let withInvisible = 0;
  let flagged = 0;

  for (const record of records) {
    const summary = invisibleSummary(record.text, classifier);
    if (summary.total > 0) withInvisible += 1;
    if (summary.total > 0) {
      candidateRows.push(
        [
          record.id,
          record.domain,
          summary.total,
          summary.parts.map(([kind, count]) => `${kind}x${count}`).join("|"),
        ].join(",")
      );
    }
    fs.writeFileSync(
      path.join(sheetDir, `${record.id}.txt`),
      sheetText(record, summary, classifier, maxDisplay)
    );

    if (scanner) {
      const findings = scanner.applyContextualPromotion(scanner.scanText(record.text));
      const verdict = scanner.pageVerdict(findings);
      const isFlagged = verdict === "suspicious" || verdict === "likely-injection" ? 1 : 0;
      if (isFlagged) flagged += 1;
      const types = [...new Set(findings.map((f) => f.type))].sort().join("|");
      flagRows.push([record.id, verdict, isFlagged, types].join(","));
    }
  }

  if (scanner) fs.writeFileSync(flags, flagRows.join("\n") + "\n");
  fs.writeFileSync(path.join(path.dirname(flags), "d1-candidates.csv"), candidateRows.join("\n") + "\n");

  if (!fs.existsSync(labels)) {
    fs.writeFileSync(
      labels,
      [
        "id,d1_invisible,d2_concealed_instruction,d3_directive_no_action,action_class,confidence,notes",
      ]
        .concat(records.map((record) => `${record.id},,,,,,`))
        .join("\n") + "\n"
    );
  }

  console.log(`records:            ${records.length}`);
  console.log(`with invisible:     ${withInvisible} (mechanical D1, to be confirmed)`);
  if (scanner) console.log(`detector flagged:   ${flagged} (in ${flags}, hidden from the sheet)`);
  console.log(`sheets:             ${sheetDir}/ (${records.length} files)`);
  console.log(`labels template:    ${labels}`);
  console.log("");
  console.log("Annotate labels.csv by reading the sheets. Do not open the flags file");
  console.log("until analysis — the prevalence number has to be blind.");
}

module.exports = { makeClassifier, invisibleSummary, visualize, sheetText };

if (require.main === module) main();
