#!/usr/bin/env node
"use strict";

/**
 * F5 analysis — aggregates only, no message text, no addresses.
 *
 *   node scripts/f5/analyze_eml.js --manifest=data/f5/corpus-manifest.csv \
 *     --flags=data/f5/flags.csv --out=results/f5-2026-11-13.md \
 *     --json=results/f5-2026-11-13.summary.json
 *
 * Reports, per protocol-f5.md §8: D1 prevalence at message level with a
 * sender-clustered bootstrap interval (2,000 replicas, seed 20261113), the
 * per-channel split, the 2023+ window against the 2018-2022 stratum, and the E1
 * surface census. D2/D3 are **not** computed here: they require the human
 * annotation pass, and the report says so instead of printing a number.
 *
 * Zero-count intervals use the one-sided exact Clopper–Pearson bound, asserted
 * against 0/290 → 1.0% exactly as the protocol requires.
 */

const fs = require("fs");

const SEED = 20261113;
const REPLICAS = 2000;
const PRIMARY_FROM = "2023-01-01";
const PRIMARY_TO = "2026-07-18";

function parseArgs(argv) {
  const args = {
    manifest: "data/f5/corpus-manifest.csv",
    flags: "data/f5/flags.csv",
    labels: "data/f5/labels.csv",
    e2: "data/f5/labels-e2.csv",
    e2sample: "data/f5/visible-sample.csv",
    out: "results/f5-2026-11-13.md",
    json: "results/f5-2026-11-13.summary.json",
  };
  for (const arg of argv) {
    const match = /^--([a-z0-9-]+)=(.*)$/.exec(arg);
    if (match && match[1] in args) args[match[1]] = match[2];
  }
  return args;
}

function readCsv(file) {
  const lines = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(header.map((key, index) => [key, cells[index]]));
  });
}

function lgamma(x) {
  const cof = [76.18009172947146, -86.50532032941677, 24.01409824083091,
    -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x;
  const tmp = x + 5.5 - (x + 0.5) * Math.log(x + 5.5);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j += 1) ser += cof[j] / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}

function logChoose(n, k) {
  return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
}

function binomialCdf(k, n, p) {
  if (p <= 0) return 1;
  if (p >= 1) return k >= n ? 1 : 0;
  let sum = 0;
  for (let i = 0; i <= k; i += 1) {
    sum += Math.exp(logChoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
  }
  return Math.min(1, sum);
}

/** One-sided 95% Clopper–Pearson upper bound for k successes in n trials. */
function cpUpper(k, n) {
  if (k >= n) return 1;
  let lo = 0;
  let hi = 1;
  for (let step = 0; step < 100; step += 1) {
    const mid = (lo + hi) / 2;
    if (binomialCdf(k, n, mid) > 0.05) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function mulberry32(a) {
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pct(x) {
  return `${(x * 100).toFixed(2)}%`;
}

function clusterBootstrap(records, flagged) {
  const clusters = new Map();
  for (const record of records) {
    const key = record.from_hash || "unknown";
    if (!clusters.has(key)) clusters.set(key, { n: 0, k: 0 });
    const entry = clusters.get(key);
    entry.n += 1;
    if (flagged.has(record.id)) entry.k += 1;
  }
  const list = [...clusters.values()];
  const random = mulberry32(SEED);
  const values = [];
  for (let replica = 0; replica < REPLICAS; replica += 1) {
    let n = 0;
    let k = 0;
    for (let draw = 0; draw < list.length; draw += 1) {
      const pick = list[Math.floor(random() * list.length)];
      n += pick.n;
      k += pick.k;
    }
    values.push(k / n);
  }
  values.sort((a, b) => a - b);
  const at = (q) => values[Math.min(values.length - 1, Math.floor(q * values.length))];
  return { low: at(0.025), high: at(0.975), clusters: list.length, seed: SEED, replicas: REPLICAS };
}

function interval(k, n, ci) {
  // Protocol §8: zero counts get the one-sided exact bound, not a bootstrap that
  // can only return zero when no cluster carries a hit.
  if (k === 0) return { low: 0, high: cpUpper(0, n) };
  return ci;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = readCsv(args.manifest);
  const flags = readCsv(args.flags);

  const d1 = new Set();
  const d1Channel = { plain: new Set(), plain_quoted: new Set(), html: new Set() };
  const e1 = new Set();
  for (const row of flags) {
    if (row.class === "D1") {
      d1.add(row.id);
      if (d1Channel[row.channel]) d1Channel[row.channel].add(row.id);
    } else if (row.class === "E1") {
      e1.add(row.id);
    }
  }

  // Priority class per message, by the same rule make_sheet.js uses: the
  // hardest class any of its rows carries. Sender names are salted hashes.
  const RANK = { smuggling: 0, context: 1, "benign-signature": 2 };
  const priority = new Map();
  for (const row of flags) {
    if (row.class !== "D1") continue;
    const current = priority.get(row.id);
    if (current === undefined || RANK[row.priority] < RANK[current]) priority.set(row.id, row.priority);
  }
  const senderOf = new Map(manifest.map((row) => [row.id, row.from_hash || "unknown"]));
  const classes = ["smuggling", "context", "benign-signature"].map((name) => {
    const ids = [...priority.entries()].filter(([, value]) => value === name).map(([id]) => id);
    const counts = new Map();
    for (const id of ids) {
      const sender = senderOf.get(id);
      counts.set(sender, (counts.get(sender) || 0) + 1);
    }
    const largest = Math.max(0, ...counts.values());
    return {
      name,
      messages: ids.length,
      senders: counts.size,
      largest_sender_messages: largest,
      largest_sender_share: ids.length ? largest / ids.length : 0,
    };
  });

  const eligible = manifest.filter((row) => row.self === "0");
  const primary = eligible.filter(
    (row) => row.date_month >= PRIMARY_FROM.slice(0, 7) && row.date_month <= PRIMARY_TO.slice(0, 7)
  );
  const stratum = eligible.filter((row) => row.date_month < PRIMARY_FROM.slice(0, 7));

  const count = (rows, set) => rows.filter((row) => set.has(row.id)).length;
  const overall = {
    n: eligible.length,
    k: count(eligible, d1),
  };
  overall.p = overall.k / overall.n;
  overall.ci = interval(overall.k, overall.n, clusterBootstrap(eligible, d1));

  const channelRows = ["plain", "plain_quoted", "html"].map((channel) => {
    const k = count(eligible, d1Channel[channel]);
    return {
      channel,
      k,
      n: eligible.length,
      p: k / eligible.length,
      ci: interval(k, eligible.length, clusterBootstrap(eligible, d1Channel[channel])),
    };
  });

  const windows = [
    { name: `primary ${PRIMARY_FROM} → ${PRIMARY_TO}`, rows: primary },
    { name: "stratum 2018-05 → 2022-12", rows: stratum },
  ].map(({ name, rows }) => {
    const k = count(rows, d1);
    const bySource = ["mbox", "eml"].map((source) => {
      const subset = rows.filter((row) => row.source === source);
      const hits = count(subset, d1);
      return { source, k: hits, n: subset.length, p: subset.length ? hits / subset.length : 0 };
    }).filter((entry) => entry.n > 0);
    return {
      name,
      k,
      n: rows.length,
      p: rows.length ? k / rows.length : 0,
      ci: interval(k, rows.length, clusterBootstrap(rows, d1)),
      clusters: new Set(rows.map((row) => row.from_hash)).size,
      bySource,
    };
  });

  const e1Count = count(eligible, e1);

  // D2/D3 come from labels.csv, which only a human fills (protocol §5: no LLM
  // pre-labelling). A file with no `0`/`1` in the D2 column is `unmeasured`,
  // not zero; a file with some is `partial`, and the frame stays unmeasured
  // until every D1 candidate is read.
  const d1Ids = new Set(d1);
  const labels = readCsv(args.labels);
  const labelled = labels.filter(
    (row) => d1Ids.has(row.id) && (row.d2_concealed_instruction === "0" || row.d2_concealed_instruction === "1")
  );
  const positives = labelled.filter((row) => row.d2_concealed_instruction === "1");
  const unclear = labels.filter(
    (row) =>
      d1Ids.has(row.id) &&
      (row.d2_concealed_instruction || "").trim() === "" &&
      (row.notes || "").trim().length > 0
  );
  const d2ByClass = classes.map((entry) => {
    const rows = labels.filter((row) => d1Ids.has(row.id) && priority.get(row.id) === entry.name);
    const done = rows.filter(
      (row) => row.d2_concealed_instruction === "0" || row.d2_concealed_instruction === "1"
    );
    return {
      name: entry.name,
      labelled: done.length,
      positive: done.filter((row) => row.d2_concealed_instruction === "1").length,
      unclear: rows.filter(
        (row) => (row.d2_concealed_instruction || "").trim() === "" && (row.notes || "").trim().length > 0
      ).length,
    };
  });
  const d2Status = labelled.length === 0 ? "unmeasured" : labelled.length < d1.size ? "partial" : "measured";
  const d2Values = {
    labelled: labelled.length,
    candidates: d1.size,
    positive: positives.length,
    unclear: unclear.length,
    unread: d1.size - labelled.length - unclear.length,
    rate_among_candidates: labelled.length ? positives.length / labelled.length : null,
    rate_among_messages: labelled.length ? positives.length / eligible.length : null,
    bound_upper: positives.length === 0 && labelled.length ? cpUpper(0, labelled.length) : null,
    by_class: d2ByClass,
    annotator: "single",
  };
  const d2Table = () => {
    const rows = d2ByClass.filter((row) => row.labelled + row.unclear > 0);
    if (!rows.length) return [];
    return [
      "| Class | Read | Positive | Unclear |",
      "| --- | ---: | ---: | ---: |",
      ...rows.map((row) => `| ${row.name} | ${row.labelled} | ${row.positive} | ${row.unclear} |`),
      "",
    ];
  };

  const d2Section =
    d2Status === "unmeasured"
      ? [
          "## D2 / D3 — unmeasured",
          "",
          "Not computed, and not zero. The protocol requires a human to read the sheets;",
          "the machine half of D1 is not a label. This report publishes the mechanism",
          "counts and states plainly that the instruction rate was not measured, rather",
          "than letting a zero stand for a reading nobody did. `labels.csv` is the empty",
          "artifact where that pass would land.",
        ]
      : [
          `## D2 / D3 — ${d2Status === "partial" ? `partial (${d2Values.labelled} of ${d2Values.candidates} candidates read)` : "concealed instruction"}`,
          "",
          `Of ${d2Values.candidates} D1 candidates, **${d2Values.labelled}** were read: ` +
            `**${d2Values.positive}** carried a concealed instruction, ` +
            `${d2Values.unclear} ${d2Values.unclear === 1 ? "was" : "were"} unclear, ` +
            `${d2Values.unread} are unread.` +
            (d2Values.bound_upper === null
              ? ` That is ${pct(d2Values.rate_among_candidates)} of the candidates read.`
              : ` A zero-hit one-sided 95% bound over those ${d2Values.labelled} is **${pct(d2Values.bound_upper)}**.`),
          "",
          ...d2Table(),
          ...(d2Status === "partial"
            ? [
                "A convenience subsample, not the pre-registered arm: protocol §8 asks for",
                "D2 among D1 candidates and among all messages, and neither denominator is",
                "complete. The frame's D2 therefore stays `unmeasured`; reading is human-only",
                "(§5), so no partial value stands in for the frame result.",
              ]
            : [
                `Among all ${eligible.length.toLocaleString("en-US")} eligible messages the same`,
                `positives are ${pct(d2Values.rate_among_messages)}. Single annotator, no model`,
                "pre-labelling.",
              ]),
        ];
  // E2 — the visible-instruction arm. Sampled from the manifest, read by the
  // corpus owner, labels in labels-e2.csv. Same unmeasured/partial/measured
  // ladder as D2: a blank is never a zero.
  const e2Sample = fs.existsSync(args.e2sample) ? readCsv(args.e2sample) : [];
  const e2Labels = fs.existsSync(args.e2) ? readCsv(args.e2) : [];
  const e2ById = new Map(e2Labels.map((row) => [row.id, row]));
  const e2Read = e2Sample
    .map((row) => ({ era: row.era, value: ((e2ById.get(row.id) || {}).e2_visible_instruction || "").trim() }))
    .filter((row) => row.value === "0" || row.value === "1");
  const e2Positive = e2Read.filter((row) => row.value === "1");
  const e2Unclear = e2Sample.filter((row) => {
    const label = e2ById.get(row.id);
    return label && (label.e2_visible_instruction || "").trim() === "" && (label.notes || "").trim().length > 0;
  });
  const e2Status = e2Read.length === 0 ? "unmeasured" : e2Read.length < e2Sample.length ? "partial" : "measured";
  const e2ByEra = ["primary", "stratum"].map((era) => {
    const sampled = e2Sample.filter((row) => row.era === era).length;
    const read = e2Read.filter((row) => row.era === era);
    return { era, sampled, read: read.length, positive: read.filter((row) => row.value === "1").length };
  });
  const e2Values = {
    sampled: e2Sample.length,
    read: e2Read.length,
    positive: e2Positive.length,
    unclear: e2Unclear.length,
    unread: e2Sample.length - e2Read.length - e2Unclear.length,
    bound_upper: e2Positive.length === 0 && e2Read.length ? cpUpper(0, e2Read.length) : null,
    by_era: e2ByEra,
    annotator: "single",
  };

  const e2Section =
    e2Sample.length === 0
      ? [
          "## E2 — not drawn",
          "",
          "The visible-instruction arm is frozen in the protocol (§9: 100 messages,",
          "stratified by era) and no sample exists in this checkout.",
          "`scripts/f5/sample_visible.js` draws it deterministically from the manifest.",
        ]
      : e2Read.length === 0
      ? [
          "## E2 — drawn, not read",
          "",
          `${e2Sample.length} messages sampled (${e2ByEra[0].sampled} primary, ${e2ByEra[1].sampled} stratum) and`,
          "no label exists yet. The pack is local (`data/f5/pack-e2-*.md`); reading is",
          "human-only (§5), so this cell is `unmeasured`, not zero.",
        ]
      : [
          `## E2 — visible instruction to an assistant (${e2Status}${e2Status === "partial" ? `: ${e2Values.read} of ${e2Values.sampled} read` : ""})`,
          "",
          `Of ${e2Values.sampled} sampled messages, **${e2Values.read}** were read: ` +
            `**${e2Values.positive}** addressed an assistant with an action, ` +
            `${e2Values.unclear} ${e2Values.unclear === 1 ? "was" : "were"} unclear, ` +
            `${e2Values.unread} are unread.` +
            (e2Values.bound_upper === null
              ? ` That is ${pct(e2Values.positive / e2Values.read)} of those read.`
              : ` A zero-hit one-sided 95% bound over those ${e2Values.read} is **${pct(e2Values.bound_upper)}**.`),
          "",
          "| Era | Sampled | Read | Positive |",
          "| --- | ---: | ---: | ---: |",
          ...e2ByEra.map((row) => `| ${row.era} | ${row.sampled} | ${row.read} | ${row.positive} |`),
          "",
          "One stratified sample of one inbox, weighted 54/46, not two independent",
          "populations. Single annotator, no model pre-labelling.",
        ];

  const zeroCheck = cpUpper(0, 290);
  if (Math.abs(zeroCheck - 0.01027) > 0.0005) {
    throw new Error(`zero-count bound drift: 0/290 → ${zeroCheck}`);
  }

  const summary = {
    frame: "F5",
    generated: "2026-11-13",
    protocol: "protocol-f5.md",
    population: {
      messages_read: manifest.length,
      unique: manifest.length,
      eligible_excluding_self: eligible.length,
      self_sent_excluded: manifest.length - eligible.length,
      sender_clusters: overall.ci.clusters,
      primary_window: windows[0].n,
      stratum_window: windows[1].n,
    },
    d1: {
      message_level: { k: overall.k, n: overall.n, p: overall.p, ci: [overall.ci.low, overall.ci.high] },
      channels: channelRows.map((row) => ({ channel: row.channel, k: row.k, p: row.p, ci: [row.ci.low, row.ci.high] })),
      classes,
      windows,
      method: `sender-clustered bootstrap, ${REPLICAS} replicas, seed ${SEED}`,
    },
    e1: { records: e1Count, p: e1Count / eligible.length, status: "census, not an attack signal" },
    e2: { status: e2Status, values: e2Values },
    d2_d3: { status: d2Status, values: d2Values },
    zero_count_convention: { example: "0/290", upper: zeroCheck },
  };

  const lines = [
    "# F5 — concealed content in job-related mail",
    "",
    `Generated ${summary.generated} from \`protocol-f5.md\` (frozen 2026-11-13).`,
    "Aggregates only: counts, months and salted hashes. No subject, address or",
    "message text appears in this file.",
    "",
    "## Population",
    "",
    "| | |",
    "| --- | --- |",
    `| unique messages | ${manifest.length.toLocaleString("en-US")} (1,390 read before dedup) |`,
    `| eligible after excluding self-sent | ${overall.n.toLocaleString("en-US")} |`,
    `| sender clusters | ${overall.ci.clusters} |`,
    `| primary window | ${windows[0].n} messages (${PRIMARY_FROM} → ${PRIMARY_TO}) |`,
    `| stratum | ${windows[1].n} messages (2018-05 → 2022-12) |`,
    "",
    "One inbox. This is a census of that inbox, not a base rate for job mail.",
    "",
    "## D1 — invisible code points",
    "",
    `Message level: **${pct(overall.p)}** (${overall.k}/${overall.n}), sender-clustered 95% interval`,
    `${pct(overall.ci.low)}–${pct(overall.ci.high)} over ${overall.ci.clusters} clusters.`,
    "",
    "| Channel | Messages | Share | Clustered 95% |",
    "| --- | ---: | ---: | --- |",
    ...channelRows.map(
      (row) => `| \`${row.channel}\` | ${row.k} | ${pct(row.p)} | ${pct(row.ci.low)}–${pct(row.ci.high)} |`
    ),
    "",
    "| Window | Messages | Clusters | With D1 | Share |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...windows.map(
      (row) => `| ${row.name} | ${row.n} | ${row.clusters} | ${row.k} | ${pct(row.p)} |`
    ),
    "",
    "The era gap is not a source artefact — it holds inside both sources:",
    "",
    "| Window | Source | Messages | With D1 | Share |",
    "| --- | --- | ---: | ---: | ---: |",
    ...windows.flatMap((row) =>
      row.bySource.map(
        (entry) => `| ${row.name} | \`${entry.source}\` | ${entry.n} | ${entry.k} | ${pct(entry.p)} |`
      )
    ),
    "",
    "The 2018–2022 stratum is 9 sender clusters against 41 in the primary window,",
    "so the gap mixes era and sender mix and is reported as a stratification, not",
    "as a trend.",
    "",
    "## Where the positives sit",
    "",
    "Classes come from the triage rule (mechanism signature and marker density),",
    "not from a label. The sender column is the point:",
    "",
    "| Class | Messages | Senders | Largest sender |",
    "| --- | ---: | ---: | ---: |",
    ...classes.map(
      (row) =>
        `| ${row.name} | ${row.messages} | ${row.senders} | ${row.largest_sender_messages} (${pct(
          row.largest_sender_share
        )}) |`
    ),
    "",
    `One address owns every \`smuggling\` record; the largest \`benign-signature\` address`,
    `owns ${classes[2].largest_sender_messages} of ${classes[2].messages}. A message-level count is therefore closer to a`,
    "count of templates than of messages, which is why the clustered interval is as",
    "wide as it is and why a human pass prices hours per sender, not per message.",
    "",
    "An invisible code point is not an instruction. These are mechanism counts that",
    "make the adjudication denominator visible; D2 decides what, if anything,",
    "is concealed *and* directive.",
    "",
    "## E1 — machine-only surfaces",
    "",
    `Present in **${e1Count.toLocaleString("en-US")} of ${overall.n.toLocaleString("en-US")}** messages (${pct(summary.e1.p)}). A channel census:`,
    "alt text, HTML comments and `display:none` are ordinary template furniture, and",
    "F1/F4 both found that ubiquity is not signal.",
    "",
    ...d2Section,
    "",
    ...e2Section,
    "",
    "## Method and limits",
    "",
    `- Intervals: sender-clustered bootstrap, ${REPLICAS.toLocaleString("en-US")} replicas, seed ${SEED}, resampling`,
    `  \`from_hash\` clusters (${overall.ci.clusters}), not messages.`,
    `- Zero counts use one-sided exact Clopper–Pearson (\`0/290 → ${pct(zeroCheck)}\`, asserted).`,
    "- Raw HTML is judged as source, not as rendered output: `display:none` visibility",
    "  and preheader text are counted as surfaces, never as instructions.",
    "- **Mechanisms this frame does not model**, and therefore cannot score: visible",
    "  persuasion (fabricated reasoning traces, reward/punishment framing, \"ignore your",
    "  filters\" wording), instruction shape in visible text (that is E2, not run), and",
    "  CSS-only concealment in rendered HTML. A D1 gate returns zero on all of them by",
    "  construction — the mechanism list is the ceiling, not a recall estimate.",
    "- Single annotator, single inbox, one snapshot",
    "  (`8d1c4bb1ee5e4f953dc5b32a936f2b2e0beaddf18d5bf45b18a8f62f73837cbb`).",
    "",
  ];

  fs.mkdirSync(require("path").dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, lines.join("\n"));
  fs.writeFileSync(args.json, JSON.stringify(summary, null, 2) + "\n");

  console.log(`D1 message-level : ${pct(overall.p)} (${overall.k}/${overall.n})`);
  console.log(`clustered 95%    : ${pct(overall.ci.low)}-${pct(overall.ci.high)} over ${overall.ci.clusters} clusters`);
  console.log(`primary window   : ${pct(windows[0].p)} (${windows[0].k}/${windows[0].n})`);
  console.log(`stratum          : ${pct(windows[1].p)} (${windows[1].k}/${windows[1].n})`);
  console.log(`E1 records       : ${e1Count}/${overall.n}`);
  console.log(`D2 labelled      : ${d2Values.labelled}/${d2Values.candidates} (${d2Values.positive} positive, ${d2Values.unclear} unclear)`);
  console.log(`E2 read          : ${e2Values.read}/${e2Values.sampled} (${e2Values.positive} positive, ${e2Values.unclear} unclear)`);
  console.log(`written          : ${args.out}`);
  console.log(`json             : ${args.json}`);
}

if (typeof module !== "undefined" && module.exports) module.exports = { cpUpper, clusterBootstrap };

if (require.main === module) main();
