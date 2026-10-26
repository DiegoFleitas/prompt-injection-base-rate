#!/usr/bin/env node
"use strict";

/**
 * F4 step 2 — render saved pages and record concealed channels.
 *
 *   node scripts/f4/render-hidden.js --pages=data/f4/pages --out=data/f4/findings.jsonl
 *
 * Requires Playwright + Chromium in the VM (`npm i --no-save playwright` then
 * `npx playwright install chromium`). JavaScript is disabled and every HTTP(S)
 * request is aborted, so a saved page cannot execute or phone home.
 *
 * Channels recorded: HTML comments, attributes (alt/title/aria/label/data-*,
 * meta description), JSON-LD and <template> text, and text hidden by computed
 * style. Presence only — no judgement about intent.
 */

const fs = require("fs");
const path = require("path");

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}

const PAGES = arg("pages", path.join("data", "f4", "pages"));
const OUT = arg("out", path.join("data", "f4", "findings.jsonl"));
const VIEWPORT = { width: 1280, height: 900 };
const MIN_TEXT = 8;

/** Runs inside the page. Static DOM only: no timers, no fetches. */
function collectChannels() {
  const out = { comments: [], attributes: [], jsonld: [], template: [], hiddenText: [] };
  const MIN = 8;

  const walker = document.createTreeWalker(document, NodeFilter.SHOW_COMMENT);
  let node = walker.nextNode();
  while (node) {
    const text = (node.nodeValue || "").trim();
    if (text.length >= MIN) {
      out.comments.push({ parent: node.parentElement?.tagName.toLowerCase() || null, text: text.slice(0, 500) });
    }
    node = walker.nextNode();
  }

  const ATTRS = ["alt", "title", "aria-label", "aria-description"];
  for (const el of document.querySelectorAll("*")) {
    for (const attrName of ATTRS) {
      const value = el.getAttribute(attrName);
      if (value && value.trim().length >= MIN) {
        out.attributes.push({
          tag: el.tagName.toLowerCase(),
          attr: attrName,
          text: value.trim().slice(0, 500),
        });
      }
    }
    for (const attr of el.attributes || []) {
      if (attr.name.startsWith("data-") && attr.value.trim().length >= MIN) {
        out.attributes.push({
          tag: el.tagName.toLowerCase(),
          attr: attr.name,
          text: attr.value.trim().slice(0, 500),
        });
      }
    }
  }
  for (const meta of document.querySelectorAll('meta[name="description"], meta[name="keywords"]')) {
    const text = (meta.getAttribute("content") || "").trim();
    if (text.length >= MIN) out.attributes.push({ tag: "meta", attr: "content", text: text.slice(0, 500) });
  }

  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    const text = (script.textContent || "").trim();
    if (text.length >= MIN) out.jsonld.push(text.slice(0, 500));
  }

  for (const template of document.querySelectorAll("template")) {
    const text = (template.content?.textContent || "").replace(/\s+/g, " ").trim();
    if (text.length >= MIN) out.template.push(text.slice(0, 500));
  }

  const view = document.defaultView;
  const seen = new Set();
  for (const el of document.querySelectorAll("body *")) {
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (text.length < MIN || seen.has(text)) continue;
    seen.add(text);
    const style = view.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const reasons = [];
    if (style.display === "none") reasons.push("display-none");
    if (style.visibility === "hidden") reasons.push("visibility-hidden");
    if (Number(style.opacity) === 0) reasons.push("opacity-0");
    if (parseFloat(style.fontSize) <= 1) reasons.push("tiny-font");
    if (rect.width > 0 && rect.height > 0) {
      if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= view.innerWidth) reasons.push("offscreen");
    }
    if (/inset\(50%\)|rect\(0(px)?,? ?0(px)?,? ?0(px)?,? ?0(px)?\)/.test(style.clipPath + " " + style.clip)) {
      reasons.push("clipped");
    }
    if (reasons.length) {
      out.hiddenText.push({ tag: el.tagName.toLowerCase(), reasons, text: text.slice(0, 500) });
    }
  }

  return out;
}

async function main() {
  let chromium;
  try {
    ({ chromium } = require("playwright"));
  } catch {
    console.error("Playwright is not installed. In the VM: npm i --no-save playwright && npx playwright install chromium");
    process.exitCode = 1;
    return;
  }

  const manifest = fs
    .readFileSync(path.join(PAGES, "manifest.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .filter((entry) => entry.file);

  const browser = await chromium.launch();
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: VIEWPORT });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const output = fs.createWriteStream(OUT, { flags: "w" });

  for (const entry of manifest) {
    const filePath = path.join(PAGES, "html", entry.file);
    const page = await context.newPage();
    let blocked = 0;
    // Allow only the local file; abort every network request.
    await page.route(/^https?:/, (route) => {
      blocked += 1;
      return route.abort();
    });
    try {
      await page.goto(`file://${path.resolve(filePath)}`, { waitUntil: "load", timeout: 20000 });
      const channels = await page.evaluate(collectChannels);
      output.write(
        `${JSON.stringify({
          id: entry.id,
          uri: entry.uri,
          blockedRequests: blocked,
          ...channels,
        })}\n`
      );
      console.error(
        `${entry.id}: comments=${channels.comments.length} attrs=${channels.attributes.length} hidden=${channels.hiddenText.length} blocked=${blocked}`
      );
    } catch (error) {
      output.write(`${JSON.stringify({ id: entry.id, uri: entry.uri, error: error.message })}\n`);
      console.error(`${entry.id}: failed (${error.message})`);
    } finally {
      await page.close();
    }
  }

  output.end();
  await browser.close();
  console.log(`wrote ${OUT}`);
}

main().catch((error) => {
  console.error(`failed: ${error.message}`);
  process.exitCode = 1;
});
