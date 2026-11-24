"""Sandboxed, offline Chromium for the F4 render channel.

Every F4 scan renders HTML that was fetched from a third-party job board, so the
browser must never execute page script and never open a network connection:

* the Chromium sandbox stays ON — `--no-sandbox` is deliberately not passed;
* the context is created with `javaScriptEnabled=False`;
* one context-wide route aborts every request whose scheme is not `file:`, so a
  saved page cannot beacon, fetch a subresource or navigate off-machine.

Pages are therefore always loaded from a local saved copy via `file_uri()`.
The static assertions that keep this true live in
`tests/f4/test_renderer_hardening.py`.
"""
import os
from pathlib import Path
from urllib.parse import urlparse

# Small allowances only; the security-relevant flag is the *absence* of
# --no-sandbox, so the renderer keeps Chromium's default sandbox.
LAUNCH_ARGS = ["--disable-dev-shm-usage", "--disable-gpu"]

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36")

VIEWPORT = {"width": 1280, "height": 900}


def chromium_executable():
    """Optional override; None means Playwright's own bundled Chromium."""
    return os.environ.get("F4_CHROMIUM") or None


def block_everything_but_local_files(route):
    """Route handler: only `file:` requests may proceed."""
    if urlparse(route.request.url).scheme == "file":
        return route.continue_()
    return route.abort()


def launch_offline_chromium(playwright):
    """Launch Chromium with the sandbox on and JS/network off.

    Returns `(browser, context)`; the caller closes the browser.
    """
    browser = playwright.chromium.launch(
        headless=True,
        executable_path=chromium_executable(),
        args=LAUNCH_ARGS,
    )
    context = browser.new_context(
        user_agent=UA,
        viewport=VIEWPORT,
        locale="en-US",
        javaScriptEnabled=False,
    )
    context.route("**/*", block_everything_but_local_files)
    return browser, context


def file_uri(path):
    """`file://` URI for a saved page; never a remote URL."""
    return Path(path).resolve().as_uri()
