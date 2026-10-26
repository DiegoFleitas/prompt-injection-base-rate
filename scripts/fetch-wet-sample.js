#!/usr/bin/env node
"use strict";

/**
 * F1 frame sampler — Common Crawl WET records.
 *
 * Fetches a deterministic sample of plain-text extractions (what a
 * text-extraction agent pipeline ingests), stops reading as soon as the quota is
 * met, and writes JSONL. No browser, no rendering, no JS execution: this only
 * ever moves bytes into a local file.
 *
 *   node fetch-wet-sample.js --n=300 --seed=20261026 --out=data/wet-sample.jsonl
 *
 * The protocol is in study-protocol.md sections 2–3. Same seed + same crawl
 * listing must reproduce the same records.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const INDEX_URL = "https://index.commoncrawl.org/collinfo.json";
const DATA_BASE = "https://data.commoncrawl.org/";

// mulberry32 — same PRNG family as the repo's bench, so a seed means one thing.
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

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const N = Number(arg("n", "300"));
const SEED = Number(arg("seed", "20261026"));
const MIN_CHARS = Number(arg("min-chars", "200"));
const OUT = arg("out", path.join("data", "wet-sample.jsonl"));
const CRAWL = arg("crawl", "");
const MAX_FILES = Number(arg("max-files", "30"));
// Records per file. Sampling one file only would cluster the sample in a single
// crawl segment; spreading across files costs a few dozen small requests and
// removes the largest bias. Position within a file is still "near the start",
// which the protocol states as a known bias (WET files are crawl-ordered, not
// content-ordered, so the start is not a topic cluster).
const PER_FILE = Number(arg("per-file", String(Math.ceil(N / MAX_FILES))));

function shuffle(items, rng) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { "user-agent": "lemon-juice-base-rate/1.0" } });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.json();
}

/** Six most recent crawls, so a seeded draw does not land on a decade-old crawl. */
async function crawlChoices() {
  const crawls = await fetchJson(INDEX_URL);
  return crawls.slice(0, 6).map((c) => c.id);
}

/** Full wet.paths listing for one crawl, decompressed in memory (small). */
async function wetPaths(crawlId) {
  const url = `${DATA_BASE}crawl-data/${crawlId}/wet.paths.gz`;
  const response = await fetch(url, { headers: { "user-agent": "lemon-juice-base-rate/1.0" } });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  const gz = Buffer.from(await response.arrayBuffer());
  return zlib
    .gunzipSync(gz)
    .toString("utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/**
 * Stream one WET file, parse records, stop as soon as we have `wanted` more.
 * A WET file is a sequence of WARC records: header lines, a blank line, then the
 * extracted text, then the next `WARC/1.0` line.
 */
async function readWetFile(warcPath, wanted, onRecord) {
  const controller = new AbortController();
  const url = `${DATA_BASE}${warcPath}`;
  const response = await fetch(url, {
    signal: controller.signal,
    headers: { "user-agent": "lemon-juice-base-rate/1.0" },
  });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);

  const gunzip = zlib.createGunzip();
  const stream = require("stream");
  const source = stream.Readable.fromWeb(response.body);
  // Aborting mid-stream is the normal exit path (we stop as soon as the quota is
  // met), so the abort error surfaces as an 'error' event on both streams. It is
  // not a failure; swallow it and let the caller count what it already has.
  const ignoreAbort = (error) => {
    if (error && error.name !== "AbortError" && error.code !== "ERR_STREAM_PREMATURE_CLOSE") {
      console.error(`  stream warning: ${error.message}`);
    }
  };
  source.on("error", ignoreAbort);
  gunzip.on("error", ignoreAbort);
  source.pipe(gunzip);

  let headers = new Map();
  let body = [];
  let inHeaders = true;
  let taken = 0;

  const flush = () => {
    const uri = headers.get("warc-target-uri") || "";
    const text = body.join("\n").trim();
    headers = new Map();
    body = [];
    inHeaders = true;
    if (!uri || text.length < MIN_CHARS) return false;
    taken += 1;
    onRecord({ uri, text });
    return taken >= wanted;
  };

  let buffer = "";
  try {
    for await (const chunk of gunzip) {
      buffer += chunk.toString("utf8");
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        if (line.startsWith("WARC/")) {
          if (flush()) {
            controller.abort();
            return taken;
          }
          continue;
        }
        if (inHeaders) {
          if (line === "") {
            inHeaders = false;
            continue;
          }
          const match = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
          if (match) headers.set(match[1].toLowerCase(), match[2]);
        } else {
          body.push(line);
        }
      }
    }
  } catch (error) {
    if (error.name !== "AbortError") throw error;
  }
  flush();
  return taken;
}

function sha256(text) {
  return require("crypto").createHash("sha256").update(text).digest("hex");
}

function domainOf(uri) {
  try {
    return new URL(uri).hostname;
  } catch {
    return "";
  }
}

/** Retry a flaky fetch a couple of times before giving up on a file. */
async function withRetry(fn, retries = 2) {
  let last;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (attempt === retries) break;
      const wait = 800 * (attempt + 1);
      console.error(`  retrying in ${wait} ms (${error.message})`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  throw last;
}

async function main() {
  const rng = mulberry32(SEED);
  const choices = await crawlChoices();
  const crawlId = CRAWL || choices[Math.floor(rng() * choices.length)];
  console.error(`crawl: ${crawlId} (of ${choices.join(", ")})`);

  const paths = await wetPaths(crawlId);
  console.error(`wet files: ${paths.length}`);
  const picked = shuffle(paths, rng).slice(0, MAX_FILES);

  const records = [];
  const skipped = [];
  for (const warcPath of picked) {
    if (records.length >= N) break;
    // Spread the sample across files: take at most PER_FILE from each. One file
    // alone would cluster the sample in a single crawl segment.
    const wanted = Math.min(PER_FILE, N - records.length);
    console.error(`reading ${warcPath} (need ${wanted})`);
    let taken = 0;
    try {
      taken = await withRetry(() =>
        readWetFile(warcPath, wanted, ({ uri, text }) => {
          records.push({
            id: sha256(`${uri}\n${text}`).slice(0, 16),
            frame: "F1-wet",
            crawl: crawlId,
            warc_path: warcPath,
            uri,
            domain: domainOf(uri),
            chars: text.length,
            sha256: sha256(text),
            text,
          });
        })
      );
    } catch (error) {
      // One unavailable object must not throw away the records already read.
      console.error(`  SKIPPED (${error.message})`);
      skipped.push(warcPath);
      continue;
    }
    console.error(`  +${taken} records (total ${records.length}/${N})`);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, records.map((record) => JSON.stringify(record)).join("\n") + "\n");

  console.error("");
  console.error(`wrote ${records.length} records to ${OUT}`);
  console.error(
    `seed ${SEED}, crawl ${crawlId}, min-chars ${MIN_CHARS}, files ${picked.length - skipped.length}/${picked.length}`
  );
  if (skipped.length) {
    console.error(`skipped ${skipped.length} unavailable file(s):`);
    for (const warcPath of skipped) console.error(`  ${warcPath}`);
  }
  if (records.length < N) {
    console.error(
      `WARNING: only ${records.length}/${N} records — raise --max-files/--per-file and rerun, or record the shortfall in deviations.md`
    );
  }
}

main().catch((error) => {
  console.error(`failed: ${error.message}`);
  process.exitCode = 1;
});
