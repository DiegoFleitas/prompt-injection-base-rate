#!/usr/bin/env node
"use strict";

/**
 * Prepares the external positive controls for the sensitivity test.
 *
 *   node scripts/sensitivity/fetch-positives.js
 *
 * Downloads the pinned corpus files (local only, never published), records the
 * commit + sha256 of each in `data/sensitivity/provenance.json`, and writes
 * `data/sensitivity/external-payloads.jsonl` with one payload per line.
 *
 * Only InjecAgent yields payload strings we can use directly: its "enhanced"
 * test cases contain the poisoned tool response verbatim. BIPIA and AgentDojo
 * publish attack *tasks* and generate the payload text from their own Python
 * frameworks, so using them would mean running third-party code — recorded as a
 * limitation in the sensitivity report instead.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const DATA = path.join(ROOT, "data", "sensitivity");
const CORPUS = path.join(DATA, "corpus");

const SOURCES = [
  {
    name: "InjecAgent",
    repo: "uiuc-kang-lab/InjecAgent",
    commit: "f19c9f2c79a41046eb13c03c51a24c567a8ffa07",
    license: "MIT",
    url: "https://raw.githubusercontent.com/uiuc-kang-lab/InjecAgent/f19c9f2c79a41046eb13c03c51a24c567a8ffa07/data/test_cases_dh_enhanced.json",
    file: "injecagent-test_cases_dh_enhanced.json",
  },
];

async function download(url, file) {
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, buf);
  return buf;
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function main() {
  fs.mkdirSync(CORPUS, { recursive: true });
  const provenance = [];
  const payloads = [];

  for (const source of SOURCES) {
    const file = path.join(CORPUS, source.file);
    const buf = await download(source.url, file);
    const records = JSON.parse(buf.toString("utf8"));
    const injected = records.filter((r) => r.Modifed === 1 && r["Tool Response"]);
    let n = 0;
    for (const record of injected) {
      payloads.push({
        id: `${source.name.toLowerCase()}-${String(n++).padStart(3, "0")}`,
        source: `${source.name}@${source.commit.slice(0, 7)}`,
        surface: "tool-response",
        payload: record["Tool Response"],
      });
    }
    provenance.push({
      name: source.name,
      repo: source.repo,
      commit: source.commit,
      license: source.license,
      url: source.url,
      file: source.file,
      bytes: buf.length,
      sha256: sha256(buf),
      records: records.length,
      injected_records: injected.length,
    });
  }

  // dedupe identical payload strings, keeping the first id
  const seen = new Set();
  const unique = payloads.filter((p) => {
    if (seen.has(p.payload)) return false;
    seen.add(p.payload);
    return true;
  });

  fs.writeFileSync(
    path.join(DATA, "external-payloads.jsonl"),
    unique.map((p) => JSON.stringify(p)).join("\n") + "\n"
  );
  fs.writeFileSync(
    path.join(DATA, "provenance.json"),
    JSON.stringify({ prepared: new Date().toISOString(), sources: provenance, unique_payloads: unique.length }, null, 2) + "\n"
  );

  for (const p of provenance) {
    console.log(`${p.name}: ${p.records} records, ${p.injected_records} injected, ${p.bytes} bytes, sha256=${p.sha256.slice(0, 16)}…`);
  }
  console.log(`unique payloads: ${unique.length} -> ${path.join(DATA, "external-payloads.jsonl")}`);
}

main().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
