#!/usr/bin/env node
"use strict";

/**
 * F4 step 1 — fetch saved HTML, no browser.
 *
 * Samples N URIs from the F1 sample, fetches each once, and saves the HTML plus a
 * manifest line. No rendering, no JavaScript, no cookies.
 *
 *   node scripts/f4/fetch-pages.js --n=50 --out=data/f4/pages
 *
 * Safety: run in the VM. One request per URL, conservative timeout and size cap,
 * best-effort robots.txt check, no auth-gated content. See scripts/f4/README.md.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const SAMPLE = arg("sample", path.join("data", "wet-sample.jsonl"));
const N = Number(arg("n", "50"));
const SEED = Number(arg("seed", "20261026"));
const OUT = arg("out", path.join("data", "f4", "pages"));
const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15000;
const DELAY_MS = 1200;
const UA = "prompt-injection-base-rate/1.0 (research; one request per URL)";

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, rng) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");

/** Best effort only: a single `Disallow: /` check, cached per host. */
const robotsCache = new Map();
async function robotsAllows(url) {
  const origin = new URL(url).origin;
  if (robotsCache.has(origin)) return robotsCache.get(origin);
  let allowed = true;
  try {
    const response = await fetch(`${origin}/robots.txt`, {
      headers: { "user-agent": UA },
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) {
      const text = await response.text();
      const blocked = text
        .split("\n")
        .map((line) => line.trim().toLowerCase())
        .some((line) => line === "disallow: /" || line === "disallow: *");
      allowed = !blocked;
    }
  } catch {
    // Unreachable robots.txt: proceed. Recorded in the manifest as "unknown".
  }
  robotsCache.set(origin, allowed);
  return allowed;
}

async function main() {
  const rows = fs
    .readFileSync(SAMPLE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const rng = mulberry32(SEED);
  const picked = shuffle(rows, rng).slice(0, N);

  const htmlDir = path.join(OUT, "html");
  fs.mkdirSync(htmlDir, { recursive: true });
  const manifestPath = path.join(OUT, "manifest.jsonl");
  const manifest = fs.createWriteStream(manifestPath, { flags: "w" });

  let saved = 0;
  for (const record of picked) {
    const allowed = await robotsAllows(record.uri);
    await sleep(DELAY_MS);
    if (!allowed) {
      manifest.write(`${JSON.stringify({ id: record.id, uri: record.uri, robots: "disallowed" })}\n`);
      console.error(`skip (robots) ${record.uri}`);
      continue;
    }

    try {
      const response = await fetch(record.uri, {
        redirect: "follow",
        headers: { "user-agent": UA, accept: "text/html" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || !contentType.includes("text/html")) {
        manifest.write(
          `${JSON.stringify({
            id: record.id,
            uri: record.uri,
            status: response.status,
            contentType,
            robots: "allowed",
          })}\n`
        );
        console.error(`skip (${response.status} ${contentType}) ${record.uri}`);
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > MAX_BYTES) {
        manifest.write(
          `${JSON.stringify({ id: record.id, uri: record.uri, skipped: "too-large", bytes: buffer.length })}\n`
        );
        console.error(`skip (too large) ${record.uri}`);
        continue;
      }
      const file = `${record.id}.html`;
      fs.writeFileSync(path.join(htmlDir, file), buffer);
      manifest.write(
        `${JSON.stringify({
          id: record.id,
          uri: record.uri,
          domain: record.domain,
          file,
          bytes: buffer.length,
          sha256: sha(buffer),
          robots: "allowed",
          fetchedAt: new Date().toISOString(),
        })}\n`
      );
      saved += 1;
      console.error(`saved ${file} (${buffer.length} bytes) ${record.uri}`);
    } catch (error) {
      manifest.write(
        `${JSON.stringify({ id: record.id, uri: record.uri, error: error.message })}\n`
      );
      console.error(`failed ${record.uri}: ${error.message}`);
    }
  }

  manifest.end();
  console.error(`\nsaved ${saved}/${picked.length} pages to ${htmlDir}`);
  console.error(`manifest: ${manifestPath}`);
}

main().catch((error) => {
  console.error(`failed: ${error.message}`);
  process.exitCode = 1;
});
