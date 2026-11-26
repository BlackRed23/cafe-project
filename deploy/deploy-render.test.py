"""Offline Render deployment contract tests. No network calls."""

import importlib.util
import itertools
import os
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("deploy_render", os.path.join(os.path.dirname(__file__), "deploy-render.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

SHA = "a" * 40
OLD = "b" * 40
OLDER = "c" * 40


def deployment(identifier, sha, status="live"):
    return {"id": identifier, "commit": {"id": sha}, "status": status}


class FakeRender:
    def __init__(self, fault=None):
        self.fault = fault
        self.ids = {"srv-api": "api", "srv-agent": "agent", "srv-web": "web"}
        self.active = {sid: deployment(f"{name}-old", OLD) for sid, name in self.ids.items()}
        self.history = {sid: [self.active[sid], deployment(f"{name}-older", OLDER, "deactivated")]
                        for sid, name in self.ids.items()}
        self.created = []
        self.rolled = []

    def api(self, method, path, token, body=None):
        if self.fault == "auth":
            raise module.DeployError("HTTP 401")
        parts = path.split("/")
        sid = parts[2]
        name = self.ids[sid]
        if len(parts) == 3:
            return {"id": sid, "repo": "https://github.com/acme/cafe", "branch": "production",
                    "autoDeployTrigger": "off", "serviceDetails": {"url": f"https://{name}.onrender.com"}}
        if len(parts) == 4 and method == "GET":
            return [{"deploy": item} for item in self.history[sid]]
        if len(parts) == 5:
            match = next(item for item in self.history[sid] if item["id"] == parts[4])
            if self.fault == "timeout" and name == "agent" and match["id"] == "agent-new":
                return deployment(match["id"], SHA, "queued")
            return match
        if path.endswith("/deploys"):
            self.created.append(name)
            status = "build_failed" if self.fault == "deploy" and name == "agent" else "live"
            sha = OLD if self.fault == "wrong_commit" and name == "api" else SHA
            new = deployment(f"{name}-new", sha, status)
            self.history[sid].insert(0, new)
            if status == "live":
                self.active[sid]["status"] = "deactivated"
                self.active[sid] = new
            return new
        if path.endswith("/rollback"):
            self.rolled.append(name)
            if self.fault == "rollback" and name == "agent":
                raise module.DeployError("HTTP 500")
            old = next(item for item in self.history[sid] if item["id"] == body["deployId"])
            self.active[sid]["status"] = "deactivated"
            restored = deployment(f"{name}-restored", old["commit"]["id"])
            self.history[sid].insert(0, restored)
            self.active[sid] = restored
            return restored
        raise AssertionError((method, path))


class RenderTests(unittest.TestCase):
    def setUp(self):
        self.env = {"RENDER_API_KEY": "test-token", "RENDER_API_SERVICE_ID": "srv-api",
                    "RENDER_AGENT_SERVICE_ID": "srv-agent", "RENDER_WEB_SERVICE_ID": "srv-web",
                    "CI_PUBLIC_API_URL": "https://api.onrender.com/api", "CI_DEPLOY_BRANCH": "production",
                    "GITHUB_SHA": SHA, "GITHUB_REPOSITORY": "acme/cafe", "GH_TOKEN": "test-token",
                    "GITHUB_EVENT_PATH": "unused", "GITHUB_EVENT_NAME": "push",
                    "GITHUB_REF": "refs/heads/production"}

    def execute(self, fault=None, health_failure=False):
        fake = FakeRender(fault)
        def smoke(name, url):
            if health_failure and name == "agent":
                raise module.DeployError("Agent unhealthy")
            return {"status": "healthy"}
        with patch.object(module, "api", fake.api), patch.object(module, "check_schema"), \
             patch.object(module, "current_head", return_value=SHA), \
             patch.object(module, "health", side_effect=smoke), \
             patch.object(module, "web_health", return_value={"status": "healthy"}), \
             patch.object(module, "wait_until_terminal", side_effect=lambda sid, did, token: deployment(did, SHA, "canceled")), \
             patch.object(module, "time") as fake_time, \
             patch("builtins.open", unittest.mock.mock_open(read_data='{"head_commit":{"timestamp":"2026-11-26T00:00:00Z"}}')):
            fake_time.time.return_value = 1795651200 + 120
            fake_time.monotonic.side_effect = itertools.chain([0, 0], itertools.repeat(700)) if fault == "timeout" else None
            if fault != "timeout":
                fake_time.monotonic.return_value = 0
            code, record = module.run(self.env, clock=lambda: 1795651200 + 120)
        return fake, code, record

    def test_success_and_latency(self):
        fake, code, result = self.execute()
        self.assertEqual(code, 0)
        self.assertEqual(fake.created, ["api", "agent", "web"])
        self.assertEqual(result["commit_to_healthy_seconds"], 120)
        self.assertTrue(result["within_900_seconds"])

    def test_missing_configuration(self):
        self.env.pop("RENDER_API_KEY")
        with self.assertRaisesRegex(module.DeployError, "Missing configuration"):
            module.validate(self.env)

    def test_wrong_deploy_branch_is_blocked(self):
        self.env["CI_DEPLOY_BRANCH"] = "main"
        with self.assertRaisesRegex(module.DeployError, "CI_DEPLOY_BRANCH must be production"):
            module.validate(self.env)

    def test_main_push_is_blocked(self):
        self.env["GITHUB_REF"] = "refs/heads/main"
        with self.assertRaisesRegex(module.DeployError, "production push"):
            module.validate(self.env)

    def test_production_pull_request_is_blocked(self):
        self.env["GITHUB_EVENT_NAME"] = "pull_request"
        with self.assertRaisesRegex(module.DeployError, "production push"):
            module.validate(self.env)

    def test_invalid_authentication(self):
        fake, code, result = self.execute("auth")
        self.assertEqual(code, 1)
        self.assertEqual(fake.created, [])
        self.assertIn("401", result["error"])

    def test_wrong_commit_rolls_back(self):
        fake, code, result = self.execute("wrong_commit")
        self.assertEqual(code, 1)
        self.assertEqual(fake.created, ["api"])
        self.assertIn("api", fake.rolled)

    def test_timeout_stops_later_deploys(self):
        fake, code, result = self.execute("timeout")
        self.assertEqual(code, 1)
        self.assertEqual(fake.created, ["api", "agent"])
        self.assertNotIn("web", fake.created)

    def test_deploy_failure_rolls_back_prior_service(self):
        fake, code, result = self.execute("deploy")
        self.assertEqual(code, 1)
        self.assertEqual(fake.created, ["api", "agent"])
        self.assertIn("api", fake.rolled)

    def test_smoke_failure_rolls_back_partial_release(self):
        fake, code, result = self.execute(health_failure=True)
        self.assertEqual(code, 1)
        self.assertEqual(fake.rolled, ["web", "agent", "api"])

    def test_rollback_failure_reports_manual_recovery(self):
        fake, code, result = self.execute("rollback", health_failure=True)
        self.assertEqual(code, 1)
        self.assertEqual(result["rollback"]["agent"]["status"], "manual recovery required")

    def test_schema_change_block(self):
        with tempfile.NamedTemporaryFile(mode="w", delete=False, encoding="utf-8") as event:
            event.write('{"before":"' + OLD + '"}')
            self.env["GITHUB_EVENT_PATH"] = event.name
        try:
            with patch.object(module.subprocess, "run", return_value=unittest.mock.Mock(returncode=0, stdout="packages/database/prisma/schema.prisma\n")):
                with self.assertRaisesRegex(module.DeployError, "Schema-changing"):
                    module.check_schema(self.env)
        finally:
            os.unlink(event.name)


if __name__ == "__main__":
    unittest.main()
