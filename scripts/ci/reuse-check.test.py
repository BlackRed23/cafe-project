"""Offline tests for the CI reuse policy; no GitHub or Render API calls."""
import datetime as dt
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest import mock
import zipfile

SPEC = importlib.util.spec_from_file_location("reuse_check", Path(__file__).with_name("reuse-check.py"))
reuse = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(reuse)


class FakeGitHub:
    def __init__(self, run, artifact, steps, archive, tree):
        self.run = run
        self.artifact = artifact
        self.steps = steps
        self.archive = archive
        self.tree = tree

    def get(self, path):
        if path.startswith("/actions/workflows/"):
            return {"workflow_runs": [self.run] if self.run else []}
        if path.startswith("/git/commits/"):
            return {"tree": {"sha": self.tree}}
        if "/artifacts?" in path:
            return {"artifacts": [self.artifact] if self.artifact else []}
        if "/jobs?" in path:
            return {"jobs": self.steps}
        raise AssertionError(path)

    def download(self, artifact_id):
        return self.archive


class ReuseTests(unittest.TestCase):
    def setUp(self):
        self.current = dt.datetime(2026, 11, 27, 12, tzinfo=dt.timezone.utc)
        self.env = {"GITHUB_REPOSITORY": "BlackRed23/cafe-project",
                    "GITHUB_REPOSITORY_ID": "123", "GITHUB_RUN_ID": "2",
                    "GITHUB_RUN_ATTEMPT": "1", "GITHUB_SHA": "b" * 40,
                    "GITHUB_EVENT_NAME": "push", "GITHUB_REF": "refs/heads/production"}
        self.inputs = {"tree": "c" * 40, "node": "v24.21.0", "npm": "11.6.2",
                       "runner": {"ImageVersion": "20261125.1"}, "env": {"CI": "true"}}
        self.run = {"id": 1, "run_attempt": 1, "event": "push", "head_branch": "main",
                    "head_sha": "a" * 40, "path": reuse.WORKFLOW, "status": "completed",
                    "conclusion": "success", "created_at": self.current.isoformat(),
                    "repository": {"id": 123},
                    "head_repository": {"id": 123, "full_name": "BlackRed23/cafe-project"}}
        self.job = "build"
        self.make_artifact()

    def make_artifact(self, payload=None):
        origin = dict(self.env, GITHUB_SHA=self.run["head_sha"], GITHUB_RUN_ID=str(self.run["id"]),
                      GITHUB_RUN_ATTEMPT=str(self.run["run_attempt"]))
        if payload is None:
            payload = reuse.evidence(self.job, origin, self.inputs)
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w") as output:
            output.writestr("evidence.json", json.dumps(payload))
        self.archive = archive.getvalue()
        self.artifact = {"id": 10, "name": reuse.artifact_name(self.job, self.run["run_attempt"]),
                         "expired": False, "size_in_bytes": len(self.archive),
                         "digest": "sha256:" + hashlib.sha256(self.archive).hexdigest(),
                         "created_at": self.current.isoformat(),
                         "workflow_run": {"id": self.run["id"], "head_sha": self.run["head_sha"],
                                          "head_branch": "main", "repository_id": 123,
                                          "head_repository_id": 123}}
        name, steps = reuse.JOBS[self.job]
        self.jobs = [{"name": name, "conclusion": "success",
                      "steps": [{"name": step, "conclusion": "success"} for step in
                                (*steps, "Record fresh CI evidence", "Upload fresh CI evidence")]}]

    def lookup(self, **overrides):
        params = dict(run=self.run, artifact=self.artifact, steps=self.jobs, archive=self.archive,
                      tree=self.inputs["tree"])
        params.update(overrides)
        return reuse.find_reuse(FakeGitHub(**params), self.job, self.env, self.inputs, self.current)

    def test_no_previous_run(self):
        self.assertIsNone(self.lookup(run=None))

    def test_same_tree_different_commit(self):
        self.assertNotEqual(self.env["GITHUB_SHA"], self.run["head_sha"])
        self.assertEqual(self.lookup(), 1)

    def test_lint_reuse(self):
        self.job = "lint"
        self.make_artifact()
        self.assertEqual(self.lookup(), 1)

    def test_changed_tree(self):
        self.assertIsNone(self.lookup(tree="d" * 40))

    def test_changed_inputs(self):
        # The complete tree covers source, shared deps, lockfile, workflow,
        # test policy and pinned bundle. Toolchain/environment also matter.
        for field, value in [("node", "v24.22.0"), ("npm", "11.7.0"),
                             ("runner", {"ImageVersion": "20261126.1"}),
                             ("env", {"CI": "false"})]:
            with self.subTest(field=field):
                old = self.inputs[field]
                self.inputs[field] = value
                self.assertIsNone(self.lookup())
                self.inputs[field] = old

    def test_run_not_successful(self):
        for conclusion in ("failure", "cancelled", "skipped", "neutral"):
            with self.subTest(conclusion=conclusion):
                self.run["conclusion"] = conclusion
                self.assertIsNone(self.lookup())

    def test_expired_run(self):
        self.run["created_at"] = (self.current - dt.timedelta(hours=25)).isoformat()
        self.assertIsNone(self.lookup())

    def test_expired_artifact(self):
        self.artifact["expired"] = True
        self.assertIsNone(self.lookup())

    def test_missing_artifact(self):
        self.assertIsNone(self.lookup(artifact=None))

    def test_corrupted_artifact(self):
        with self.assertRaisesRegex(ValueError, "digest mismatch"):
            self.lookup(archive=self.archive + b"x")

    def test_fingerprint_tampering(self):
        payload = json.loads(zipfile.ZipFile(io.BytesIO(self.archive)).read("evidence.json"))
        payload["fingerprint"] = "0" * 64
        self.make_artifact(payload)
        self.assertIsNone(self.lookup())

    def test_untrusted_run(self):
        for field, value in [("event", "pull_request"), ("head_branch", "production"),
                             ("path", ".github/workflows/other.yml"),
                             ("head_repository", {"id": 456, "full_name": "fork/cafe-project"})]:
            with self.subTest(field=field):
                old = self.run[field]
                self.run[field] = value
                self.assertIsNone(self.lookup())
                self.run[field] = old

    def test_artifact_wrong_run(self):
        self.artifact["workflow_run"]["id"] = 999
        self.assertIsNone(self.lookup())

    def test_wrong_attempt(self):
        self.run["run_attempt"] = 2
        self.assertIsNone(self.lookup())

    def test_skipped_job(self):
        self.jobs[0]["conclusion"] = "skipped"
        self.assertIsNone(self.lookup())

    def test_skipped_required_step(self):
        self.jobs[0]["steps"][1]["conclusion"] = "skipped"
        self.assertIsNone(self.lookup())

    def test_failed_upload(self):
        self.jobs[0]["steps"][-1]["conclusion"] = "failure"
        self.assertIsNone(self.lookup())

    def test_consumer_routing(self):
        repo = {"full_name": self.env["GITHUB_REPOSITORY"]}
        pr = {"pull_request": {"head": {"ref": "main", "repo": repo},
                               "base": {"ref": "production", "repo": repo}}}
        self.assertTrue(reuse.consumer(self.env, {}))
        self.assertFalse(reuse.consumer(dict(self.env, GITHUB_REF="refs/heads/main"), {}))
        env = dict(self.env, GITHUB_EVENT_NAME="pull_request")
        self.assertTrue(reuse.consumer(env, pr))
        pr["pull_request"]["head"]["repo"] = {"full_name": "fork/cafe-project"}
        self.assertFalse(reuse.consumer(env, pr))
        for event in ("release", "schedule", "workflow_dispatch"):
            self.assertFalse(reuse.consumer(dict(self.env, GITHUB_EVENT_NAME=event), {}))

    def test_lookup_error_falls_back_to_fresh(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "output"
            summary = Path(directory) / "summary"
            env = dict(self.env, GITHUB_OUTPUT=str(output), GITHUB_STEP_SUMMARY=str(summary))
            with mock.patch.dict(os.environ, env, clear=True), \
                    mock.patch.object(reuse.sys, "argv", ["reuse-check.py", "lookup", "build"]), \
                    mock.patch.object(reuse, "GitHub", side_effect=OSError("unavailable")):
                self.assertEqual(reuse.main(), 0)
            self.assertEqual(output.read_text(), "reused=false\n")

    def test_scope_excludes_regression_security_docker_and_cd(self):
        self.assertEqual(set(reuse.JOBS), {"build", "lint"})

    def test_real_git_tree_invalidation_for_each_input_class(self):
        # Isolated fixture, never change the project checkout or its Git config.
        files = ("apps/api/src/service.ts", "packages/types/index.ts", "package-lock.json",
                 ".github/workflows/ci.yml", "scripts/ci/run-regression.cjs",
                 "scripts/ci/regression-release.json", "apps/api/Dockerfile",
                 "packages/eslint-config/base.js")
        with tempfile.TemporaryDirectory() as directory:
            def git(*args):
                return subprocess.check_output(["git", "-C", directory, *args], text=True,
                                               stderr=subprocess.DEVNULL).strip()
            git("init", "-q")
            for name in files:
                path = Path(directory, name)
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("original\n")
            git("add", ".")
            original = git("write-tree")
            for name in files:
                with self.subTest(input=name):
                    path = Path(directory, name)
                    path.write_text("changed\n")
                    git("add", name)
                    changed = git("write-tree")
                    self.assertNotEqual(original, changed)
                    self.assertNotEqual(reuse.fingerprint("build", {"tree": original}),
                                        reuse.fingerprint("build", {"tree": changed}))
                    path.write_text("original\n")
                    git("add", name)
                    self.assertEqual(original, git("write-tree"))

    def test_runtime_input_guards(self):
        env = dict(self.env, RUNNER_OS="Linux", RUNNER_ARCH="X64",
                   RUNNER_ENVIRONMENT="github-hosted", ImageOS="ubuntu24",
                   ImageVersion="20261125.1", CI="true", GITHUB_ACTIONS="true",
                   AGENT_GRAPH_READONLY="YES",
                   DATABASE_URL="postgresql://ci_no_write:ci_no_write@127.0.0.1:1/ci_unreachable")
        def command(*args):
            return {("git", "rev-parse", "HEAD"): env["GITHUB_SHA"],
                    ("git", "rev-parse", "HEAD^{tree}"): "c" * 40,
                    ("node", "--version"): "v24.21.0",
                    ("npm", "--version"): "11.6.2"}[args]
        with mock.patch.object(reuse, "command", side_effect=command), \
                mock.patch.object(reuse.subprocess, "run", return_value=mock.Mock(returncode=0)):
            baseline = reuse.inputs(env)
            self.assertEqual(baseline["tree"], "c" * 40)
            self.assertEqual(baseline["node"], "v24.21.0")
            for change in ({"ImageVersion": "20261126.1"}, {"NODE_ENV": "production"}):
                self.assertNotEqual(reuse.fingerprint("build", baseline),
                                    reuse.fingerprint("build", reuse.inputs(dict(env, **change))))
            for change in ({"RUNNER_ENVIRONMENT": "self-hosted"}, {"ImageVersion": ""},
                           {"VITE_API_URL": "https://invalid.example"},
                           {"NODE_OPTIONS": "--max-old-space-size=1024"},
                           {"PRISMA_ENGINES_MIRROR": "https://invalid.example"},
                           {"DATABASE_URL": "postgresql://other"},
                           {"LLM_API_KEY": "synthetic-test-value"}):
                with self.subTest(change=list(change)):
                    with self.assertRaises(ValueError):
                        reuse.inputs(dict(env, **change))

    def test_production_quality_gates_are_fresh_and_fail_closed(self):
        workflow = Path(__file__).resolve().parents[2] / ".github/workflows/ci.yml"
        source = workflow.read_text(encoding="utf-8")
        regression = source.split("\n  test:\n", 1)[1].split("\n  security:\n", 1)[0]
        security = source.split("\n  security:\n", 1)[1].split("\n  production-release-gate:\n", 1)[0]
        gate = source.split("\n  production-release-gate:\n", 1)[1].split("\n  docker:\n", 1)[0]
        docker = source.split("\n  docker:\n", 1)[1].split("\n  render-deploy:\n", 1)[0]
        deploy = source.split("\n  render-deploy:\n", 1)[1]
        self.assertIn('if [[ "$EVENT" == push && "$REF_NAME" == production ]]; then tier=full; fi', regression)
        self.assertIn('node scripts/ci/run-regression.cjs "$tier"', regression)
        self.assertIn('npm audit --omit=dev --audit-level=high', security)
        self.assertIn("scanners: vuln,secret,misconfig", security)
        self.assertIn("exit-code: '1'", security)
        self.assertIn("needs: [build, lint, test, security]", gate)
        self.assertIn('run: test "$TIER" = full', gate)
        self.assertIn("needs: [build, lint, test, security]", docker)
        self.assertIn("cache-from: type=gha,scope=", docker)
        self.assertIn("github.event_name == 'push' && github.ref_name == 'production'", docker)
        self.assertIn("needs: [build, lint, test, security, docker, production-release-gate]", deploy)
        for condition in ("github.event_name == 'push'", "github.ref_name == 'production'",
                          "vars.CI_DEPLOY_BRANCH == 'production'", "vars.CI_ENABLE_STAGING == 'true'"):
            self.assertIn(condition, deploy)
        for block in (regression, security, gate, docker, deploy):
            self.assertNotIn("reuse-check.py", block)
            self.assertNotIn("continue-on-error: true", block)
        self.assertNotIn("always()", deploy)


if __name__ == "__main__":
    unittest.main()
