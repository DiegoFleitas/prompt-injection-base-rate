#!/usr/bin/env node
"use strict";

/**
 * Second, instruction-level positive set (P2b amendment — see
 * results/sensitivity-report.md).
 *
 * The frozen P2 used InjecAgent's materialised tool responses. Those are realistic
 * but bulky: the instruction arrives wrapped in a fake tool payload. This set
 * keeps only the text a detector would have to recognise as an instruction:
 *
 *   - InjecAgent `attacker_cases_{dh,ds}.jsonl`  -> bare `Attacker Instruction`
 *   - AgentDojo jailbreak templates *_JB_STRING / baseline one-liners,
 *     materialised with the 27 suite GOALs (no third-party code is executed:
 *     the templates are string literals and the goals are parsed out of the
 *     `injection_tasks.py` sources)
 *   - BIPIA `text_attack_test.json` -> 75 attack strings, inserted verbatim by
 *     BIPIA's own threat model
 *
 *   node scripts/sensitivity/fetch-instruction-positives.js
 *
 * Everything lands in data/sensitivity/ and stays local.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const DATA = path.join(ROOT, "data", "sensitivity");
const CORPUS = path.join(DATA, "corpus");

const INJEC = {
  repo: "uiuc-kang-lab/InjecAgent",
  commit: "f19c9f2c79a41046eb13c03c51a24c567a8ffa07",
  license: "MIT",
};
const DOJO = {
  repo: "ethz-spylab/agentdojo",
  commit: "089ed468cf3ed0322acc66b0211f26d9d90dbf60",
  license: "MIT",
};
const BIPIA = {
  repo: "microsoft/BIPIA",
  commit: "a004b69ec0dd446e0afd461d98cb5e96e120a5d0",
  license: "MIT",
};

const FILES = [
  { set: INJEC, url: `https://raw.githubusercontent.com/uiuc-kang-lab/InjecAgent/${INJEC.commit}/data/attacker_cases_dh.jsonl`, file: "injecagent-attacker_cases_dh.jsonl" },
  { set: INJEC, url: `https://raw.githubusercontent.com/uiuc-kang-lab/InjecAgent/${INJEC.commit}/data/attacker_cases_ds.jsonl`, file: "injecagent-attacker_cases_ds.jsonl" },
  { set: DOJO, url: `https://raw.githubusercontent.com/ethz-spylab/agentdojo/${DOJO.commit}/src/agentdojo/attacks/baseline_attacks.py`, file: "agentdojo-baseline_attacks.py" },
  { set: DOJO, url: `https://raw.githubusercontent.com/ethz-spylab/agentdojo/${DOJO.commit}/src/agentdojo/attacks/important_instructions_attacks.py`, file: "agentdojo-important_instructions_attacks.py" },
  { set: DOJO, url: `https://raw.githubusercontent.com/ethz-spylab/agentdojo/${DOJO.commit}/src/agentdojo/default_suites/v1/workspace/injection_tasks.py`, file: "agentdojo-workspace-injection_tasks.py" },
  { set: DOJO, url: `https://raw.githubusercontent.com/ethz-spylab/agentdojo/${DOJO.commit}/src/agentdojo/default_suites/v1/banking/injection_tasks.py`, file: "agentdojo-banking-injection_tasks.py" },
  { set: DOJO, url: `https://raw.githubusercontent.com/ethz-spylab/agentdojo/${DOJO.commit}/src/agentdojo/default_suites/v1/slack/injection_tasks.py`, file: "agentdojo-slack-injection_tasks.py" },
  { set: DOJO, url: `https://raw.githubusercontent.com/ethz-spylab/agentdojo/${DOJO.commit}/src/agentdojo/default_suites/v1/travel/injection_tasks.py`, file: "agentdojo-travel-injection_tasks.py" },
  { set: BIPIA, url: `https://raw.githubusercontent.com/microsoft/BIPIA/${BIPIA.commit}/benchmark/text_attack_test.json`, file: "bipia-text_attack_test.json" },
];

async function download(url, file) {
  if (fs.existsSync(file)) return fs.readFileSync(file);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, buf);
  return buf;
}

const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

function unescapePy(s) {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\");
}

function parseJsonl(buf, field, source) {
  return buf
    .toString("utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
    .map((r) => r[field])
    .filter((v) => typeof v === "string" && v.trim().length > 0)
    .map((payload) => ({ source, surface: "attacker-instruction", payload }));
}

/** String literals in a Python source that look like jailbreak templates. */
function pyTemplates(text) {
  const out = [];
  const jb = /_JB_STRING\s*=\s*(?:"""|''')([\s\S]*?)(?:"""|''')/.exec(text);
  if (jb) out.push(unescapePy(jb[1]));
  for (const m of text.matchAll(/["']([^"'\n]*(?:\{goal\}|\{user\}|\{model\})[^"'\n]*)["']/g)) {
    out.push(unescapePy(m[1]));
  }
  return [...new Set(out)].filter((t) => t.includes("{goal}"));
}

/** Goal strings for the injection tasks, with each class's own constants resolved.
 *  Goals that reference non-string constants (e.g. a datetime) are skipped rather
 *  than approximated. */
function pyGoals(text) {
  const goals = [];
  for (const block of text.split(/\nclass\s+\w+/)) {
    const consts = {};
    for (const m of block.matchAll(/^\s+(\w+)\s*=\s*"([^"]*)"/gm)) consts[m[1]] = m[2];
    const hit = /^\s+GOAL\s*=\s*f?"((?:[^"\\]|\\.)*)"/m.exec(block);
    if (!hit) continue;
    let goal = unescapePy(hit[1]);
    let resolvable = true;
    goal = goal.replace(/\{_(\w+)\}/g, (_, name) => {
      if (name in consts) return consts[name];
      resolvable = false;
      return "";
    });
    if (!resolvable || /\{[^}]*\}/.test(goal)) continue;
    goals.push(goal);
  }
  return goals;
}

async function main() {
  fs.mkdirSync(CORPUS, { recursive: true });
  const provenance = [];
  const payloads = [];

  for (const spec of FILES) {
    const file = path.join(CORPUS, spec.file);
    const buf = await download(spec.url, file);
    provenance.push({
      repo: spec.set.repo,
      commit: spec.set.commit,
      license: spec.set.license,
      url: spec.url,
      file: spec.file,
      bytes: buf.length,
      sha256: sha256(buf),
    });
  }

  const byFile = new Map(provenance.map((p) => [p.file, p]));

  // 1. InjecAgent: bare attacker instructions
  for (const [file, label] of [
    ["injecagent-attacker_cases_dh.jsonl", "injecagent-dh"],
    ["injecagent-attacker_cases_ds.jsonl", "injecagent-ds"],
  ]) {
    const rows = parseJsonl(fs.readFileSync(path.join(CORPUS, file)), "Attacker Instruction", label);
    payloads.push(...rows);
    byFile.get(file).extracted = rows.length;
  }

  // 2. AgentDojo: parsed for the record, NOT used as payloads.
  //    Its templates are Python f-strings and its 27 goals are f-strings over
  //    module-level constants; 3 of the 4 suites do not resolve without running
  //    their code (or an AST). Using the handful that do resolve would bias the
  //    set towards short goals, so AgentDojo is recorded and excluded.
  const templates = [];
  for (const file of ["agentdojo-baseline_attacks.py", "agentdojo-important_instructions_attacks.py"]) {
    const t = pyTemplates(fs.readFileSync(path.join(CORPUS, file), "utf8"));
    templates.push(...t);
    byFile.get(file).extracted = t.length;
  }
  const goals = [];
  for (const file of [
    "agentdojo-workspace-injection_tasks.py",
    "agentdojo-banking-injection_tasks.py",
    "agentdojo-slack-injection_tasks.py",
    "agentdojo-travel-injection_tasks.py",
  ]) {
    const g = pyGoals(fs.readFileSync(path.join(CORPUS, file), "utf8"));
    goals.push(...g);
    byFile.get(file).extracted = g.length;
  }
  for (const p of provenance) {
    if (p.repo === DOJO.repo) {
      p.used_as_payloads = false;
      p.reason = "python f-strings over module constants; not materialised";
    }
  }

  // 3. BIPIA: attack strings, inserted verbatim by BIPIA's own threat model
  const bipia = JSON.parse(fs.readFileSync(path.join(CORPUS, "bipia-text_attack_test.json"), "utf8"));
  let bipiaCount = 0;
  for (const [category, list] of Object.entries(bipia)) {
    for (const payload of list) {
      payloads.push({ source: `bipia:${category}`, surface: "verbatim-attack-string", payload });
      bipiaCount += 1;
    }
  }
  byFile.get("bipia-text_attack_test.json").extracted = bipiaCount;

  const ids = new Map();
  const unique = [];
  const seen = new Set();
  for (const p of payloads) {
    if (seen.has(p.payload)) continue;
    seen.add(p.payload);
    const n = (ids.get(p.source) || 0) + 1;
    ids.set(p.source, n);
    unique.push({ id: `${p.source}-${String(n).padStart(3, "0")}`, ...p });
  }

  fs.writeFileSync(
    path.join(DATA, "external-instructions.jsonl"),
    unique.map((p) => JSON.stringify(p)).join("\n") + "\n"
  );
  fs.writeFileSync(
    path.join(DATA, "provenance-instructions.json"),
    JSON.stringify(
      {
        prepared: new Date().toISOString(),
        templates_found: templates.length,
        goals_resolved: goals.length,
        bipia_strings: bipiaCount,
        unique_payloads: unique.length,
        files: provenance,
      },
      null,
      2
    ) + "\n"
  );

  for (const p of provenance) {
    console.log(`${p.file}: ${p.bytes} B, extracted ${p.extracted}, sha256=${p.sha256.slice(0, 16)}…`);
  }
  console.log(
    `agentdojo templates=${templates.length} goals_resolved=${goals.length} (excluded) bipia=${bipiaCount}`
  );
  console.log(`unique instruction-level payloads: ${unique.length}`);
}

main().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
