"use strict";
// AI-F5-03: fail closed on annotation state that cannot be bound to the corpus.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function splitCsv(line) {
  const out = []; let cur = "", quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === '"') { if (quoted && line[i + 1] === '"') { cur += '"'; i += 1; } else quoted = !quoted; }
    else if (line[i] === "," && !quoted) { out.push(cur); cur = ""; }
    else cur += line[i];
  }
  out.push(cur); return out;
}

function verifyLabels(labelsPath, manifestPath) {
  const lines = fs.readFileSync(labelsPath, "utf8").split(/\r?\n/).filter(Boolean);
  const header = splitCsv(lines[0]);
  const required = ["annotator", "annotated_at", "pack_sha256", "protocol"];
  const missing = required.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`labels.csv missing provenance columns: ${missing.join(", ")}`);
  const idAt = header.indexOf("id");
  const d2At = header.indexOf("d2_concealed_instruction");
  const digestAt = header.indexOf("pack_sha256");
  if (idAt < 0 || d2At < 0) throw new Error("labels.csv lacks id/d2 columns");
  const known = new Set(fs.readFileSync(manifestPath, "utf8").split(/\r?\n/).filter(Boolean).map((l) => splitCsv(l)[0]));
  let labelled = 0;
  for (const line of lines.slice(1)) {
    const cells = splitCsv(line);
    const id = cells[idAt];
    if (!id) continue;
    if (known.size && !known.has(id)) throw new Error(`label refers to unknown corpus id: ${id}`);
    if (cells[d2At] !== "") {
      labelled += 1;
      if (!cells[digestAt]) throw new Error(`label ${id} has no pack_sha256`);
    }
  }
  if (!labelled) throw new Error("no labelled rows with provenance; refusing to publish D2");
  const sha = crypto.createHash("sha256").update(fs.readFileSync(labelsPath)).digest("hex");
  const sidecar = `${labelsPath}.sha256`;
  if (fs.existsSync(sidecar)) {
    const expected = fs.readFileSync(sidecar, "utf8").trim().split(/\s+/)[0];
    if (expected !== sha) throw new Error("labels.csv integrity mismatch against recorded digest");
  } else fs.writeFileSync(sidecar, `${sha}  ${path.basename(labelsPath)}\n`);
  return { labelled, sha256: sha };
}
module.exports = { verifyLabels };
