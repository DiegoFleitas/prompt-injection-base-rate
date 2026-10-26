# F4 — rendered concealment (scaffold, unrun)

The F1 frame measures plain-text extraction: it cannot see comments, attributes
or CSS-hidden text. F4 is the frame those surfaces live in, and the one the
archived extension was actually built for.

**Status: scaffold. Nothing here has been run.** It needs Playwright and the VM.
Treat the first run as a debugging session, not a measurement — and follow the
safety rules before touching a live page.

## Why this frame matters

If the tool had any plausible value, it was here: a page can carry instructions
in `<!-- comments -->`, `alt`/`aria-label`/`title` attributes, JSON-LD, `<template>`
content or text hidden with CSS, and a human reading the rendered page sees none
of it. F1 showed concealment-by-characters is common and benign. F4 asks a
different question: **how often is there rendered concealment at all, and does
any of it carry an instruction with an action?**

## Safety (non-negotiable; same rules as `protocol.md` §1)

1. **VM only.** No logins, no host credentials, no shared folders, snapshot before
   the batch.
2. **Fetch once, render offline.** `fetch-pages.js` saves HTML with no browser.
   `render-hidden.js` loads the saved file with JavaScript disabled and all
   HTTP(S) requests aborted, so no script and no beacon runs.
3. **Never paste page text into a model.** Adjudication is human reading of local
   files, exactly as in F1.
4. **One request per URL**, robots.txt respected on a best-effort basis (see the
   limitation in `fetch-pages.js`), no auth-gated pages.

## Steps

```sh
# in the VM, from the repo root
node scripts/f4/fetch-pages.js --n=50 --out=data/f4/pages
npm i --no-save playwright && npx playwright install chromium
node scripts/f4/render-hidden.js --pages=data/f4/pages --out=data/f4/findings.jsonl
node scripts/f4/summarize-f4.js --findings=data/f4/findings.jsonl --out=results/f4-<date>.md
```

`data/` is git-ignored: raw pages never leave the machine.

## What each script does

- **`fetch-pages.js`** — samples N URIs from the F1 sample (`data/wet-sample.jsonl`),
  fetches each once, saves the HTML plus a manifest line (uri, status, bytes,
  sha256, robots decision). No browser, no JS.
- **`render-hidden.js`** — Playwright/Chromium, JavaScript **disabled**, all
  HTTP(S) routed to abort. For each saved page it records four channels:
  comments, attributes (`alt`, `title`, `aria-label`, `data-*`, `meta
  description`), JSON-LD and `<template>` text, and text hidden by computed style
  (`display:none`, `visibility:hidden`, `opacity:0`, ≤1 px font, off-screen,
  clipped).
- **`summarize-f4.js`** — page-level prevalence per channel with Wilson intervals,
  plus text-length distribution. No detector join yet; that is deliberately left
  for the next step so the first number is independent of the tool being studied.

## Before trusting any number from this

- [ ] Verify on 3 hand-made fixtures (a hidden `<p>`, a comment payload, an
      `aria-label` payload) that each channel fires once and only once.
- [ ] Confirm no HTTP requests occur during rendering: block routes and assert
      the request log is empty except the `file://` navigation.
- [ ] Confirm JavaScript is actually off (`navigator`-less page; a `<script>`
      that would alter the DOM must not).
- [ ] Run on 5 pages, hand-check the channels against the browser inspector, and
      only then run the batch.
- [ ] Record the run in `deviations.md`, including what was skipped and why.

## Known limitations, before the first run

- A static saved page is not the live page: content injected by script after load
  is absent (which is what disabling JS is for, and also what makes this frame
  narrower than "what a browser agent sees").
- CSS that hides text only under certain viewport widths depends on the viewport
  the render uses; record it.
- robots.txt handling is a single `Disallow: /` check, not a full parser.
- This frame measures **presence of concealment**, not intent. D2-style
  adjudication still has to happen by hand.
