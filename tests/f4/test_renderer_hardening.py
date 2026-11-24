"""Static guarantees for the F4 render channel (MISS-01 / MISS-02 / MISS-03).

Nothing here launches a browser or reads a captured page: these are source-level
assertions that keep the renderers offline and the repository free of
third-party payloads. Run from the repository root:

    python -m unittest tests.f4.test_renderer_hardening -v
"""
import ast
import os
import subprocess
import sys
import unittest

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PY_DIR = os.path.join(REPO_ROOT, "scripts", "f4", "python")
PLAYWRIGHT_SCRIPTS = (
    "render_runner2.py",
    "markup_scan.py",
    "inject_test.py",
    "selftest_render.py",
)


def read_py(name):
    with open(os.path.join(PY_DIR, name), encoding="utf-8") as fh:
        return fh.read()


def read_repo(relpath):
    with open(os.path.join(REPO_ROOT, relpath), encoding="utf-8") as fh:
        return fh.read()


class SandboxAndNetwork(unittest.TestCase):
    """MISS-01: sandbox on, JavaScript off, every non-file request aborted."""

    def test_no_sandbox_flag_in_any_renderer(self):
        for name in PLAYWRIGHT_SCRIPTS + ("safe_render.py",):
            text = read_py(name)
            self.assertNotIn('"--no-sandbox"', text, f"{name} passes --no-sandbox")
            self.assertNotIn("'--no-sandbox'", text, f"{name} passes --no-sandbox")

    def test_launch_args_keep_the_sandbox(self):
        source = read_py("safe_render.py")
        launch_args = None
        for node in ast.parse(source).body:
            if isinstance(node, ast.Assign) and any(
                isinstance(t, ast.Name) and t.id == "LAUNCH_ARGS" for t in node.targets
            ):
                launch_args = ast.literal_eval(node.value)
        self.assertIsNotNone(launch_args, "safe_render.LAUNCH_ARGS is missing")
        assert launch_args is not None
        self.assertNotIn("--no-sandbox", launch_args)
        self.assertNotIn("--single-process", launch_args)

    def test_renderers_use_the_hardened_factory(self):
        for name in PLAYWRIGHT_SCRIPTS:
            text = read_py(name)
            self.assertIn("launch_offline_chromium", text, f"{name} does not use safe_render")
            self.assertNotIn("chromium.launch(", text, f"{name} launches Chromium directly")

    def test_javascript_is_disabled(self):
        self.assertIn("javaScriptEnabled=False", read_py("safe_render.py"))
        for name in PLAYWRIGHT_SCRIPTS:
            self.assertNotIn("javaScriptEnabled=True", read_py(name))

    def test_every_non_file_request_is_aborted(self):
        text = read_py("safe_render.py")
        self.assertIn('context.route("**/*", block_everything_but_local_files)', text)
        self.assertIn("route.abort()", text)
        self.assertIn('scheme == "file"', text)

    def test_renderers_only_navigate_to_saved_local_copies(self):
        for name in ("render_runner2.py", "markup_scan.py"):
            text = read_py(name)
            self.assertIn("file_uri(local)", text, f"{name} does not load the saved copy")
            self.assertIn("m[\"file\"]", text)
            self.assertNotIn('page.goto(m["url"]', text, f"{name} still visits the live URL")
            self.assertNotIn("page.route(", text, f"{name} routes per page instead of per context")


class PinnedDependency(unittest.TestCase):
    """MISS-02: playwright is pinned; docs install from the lockfile."""

    def test_requirements_pin_playwright(self):
        lines = [
            line.split("#", 1)[0].strip()
            for line in read_repo("requirements.txt").splitlines()
        ]
        pins = [line for line in lines if line.startswith("playwright")]
        self.assertTrue(pins, "playwright is not pinned in requirements.txt")
        for line in pins:
            self.assertRegex(line, r"^playwright==\d+\.\d+(\.\d+)*$")

    def test_readme_installs_from_the_lockfile(self):
        readme = read_repo(os.path.join("scripts", "f4", "python", "README.md"))
        self.assertIn("pip install -r", readme)
        self.assertNotRegex(readme, r"pip install playwright")
        self.assertNotRegex(readme, r"pip install --user")


class OutputsStayOutsideTheRepo(unittest.TestCase):
    """MISS-03: payload-bearing outputs never land inside the working tree."""

    def test_fetch_boards_does_not_write_in_tree(self):
        text = read_py("fetch_boards.py")
        self.assertNotIn('os.path.join(HERE, "raw_html")', text)
        self.assertNotIn('os.path.join(HERE, "corpus_manifest.jsonl")', text)
        self.assertIn("f4_paths.RAW_HTML", text)
        self.assertIn("f4_paths.MANIFEST", text)

    def test_scan_scripts_write_under_the_data_root(self):
        for name in ("render_runner2.py", "markup_scan.py", "scan_html.py",
                     "analyze_render2.py", "inject_test.py"):
            text = read_py(name)
            self.assertIn("f4_paths.", text, f"{name} does not resolve the data root")

    def test_data_root_defaults_outside_repo(self):
        sys.path.insert(0, PY_DIR)
        try:
            import f4_paths
        finally:
            sys.path.pop(0)
        self.assertEqual(os.path.abspath(f4_paths.REPO_ROOT), REPO_ROOT)
        self.assertFalse(
            os.path.commonpath([f4_paths.DATA_ROOT, REPO_ROOT]) == REPO_ROOT,
            f"DATA_ROOT defaults inside the repo: {f4_paths.DATA_ROOT}",
        )

    def test_data_root_inside_repo_is_rejected(self):
        env = dict(os.environ, F4_DATA_DIR=os.path.join(REPO_ROOT, "scripts", "f4"))
        proc = subprocess.run(
            [sys.executable, "-c", "import f4_paths"],
            cwd=PY_DIR, env=env, capture_output=True, text=True,
        )
        self.assertNotEqual(proc.returncode, 0, "f4_paths accepted an in-repo data root")
        self.assertIn("inside the repository", proc.stderr)

    def test_gitignore_covers_legacy_in_tree_paths(self):
        ignored = read_repo(".gitignore")
        for entry in ("scripts/f4/python/raw_html/",
                      "scripts/f4/python/corpus_manifest.jsonl",
                      "scripts/f4/python/render_scan*.jsonl",
                      "scripts/f4/python/markup_scan*.jsonl"):
            self.assertIn(entry, ignored, f".gitignore is missing {entry}")


if __name__ == "__main__":
    unittest.main()
