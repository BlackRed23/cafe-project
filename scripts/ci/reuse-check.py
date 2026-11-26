"""Optional, fail-closed reuse of fresh build/lint evidence from main pushes.

GitHub Actions artifacts are evidence, not a cache-based permission to deploy.
Other jobs (including exact-SHA regression, security and Docker) remain fresh.
"""
import argparse
import datetime as dt
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import zipfile


VERSION = 1
TTL = dt.timedelta(hours=24)
MAX_BYTES = 256 * 1024
JOBS = {
    "build": ("01 / Build + typecheck", (
        "Run npm ci",
        "Validate Prisma schema and generate local client",
        "TypeScript checks", "Production build",
    )),
    "lint": ("02 / Lint", ("Run npm ci", "ESLint (no auto-fix or suppression)")),
}
SHA = re.compile(r"[0-9a-f]{40}\Z")
WORKFLOW = ".github/workflows/ci.yml"


def command(*args):
    return subprocess.check_output(args, text=True, timeout=15).strip()


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def fingerprint(job, inputs):
    return hashlib.sha256(canonical({"version": VERSION, "job": job, "inputs": inputs})).hexdigest()


def now():
    return dt.datetime.now(dt.timezone.utc)


def recent(timestamp, current):
    try:
        age = current - dt.datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        return dt.timedelta(0) <= age <= TTL
    except (TypeError, ValueError, AttributeError):
        return False


def trusted_main(env):
    return env.get("GITHUB_EVENT_NAME") == "push" and env.get("GITHUB_REF") == "refs/heads/main"


def consumer(env, event):
    if env.get("GITHUB_EVENT_NAME") == "push":
        return env.get("GITHUB_REF") == "refs/heads/production"
    if env.get("GITHUB_EVENT_NAME") != "pull_request":
        return False
    pr = event.get("pull_request", {})
    head, base = pr.get("head", {}), pr.get("base", {})
    repo = env.get("GITHUB_REPOSITORY", "").lower()
    return bool(repo and head.get("ref") == "main" and base.get("ref") == "production"
                and (head.get("repo") or {}).get("full_name", "").lower() == repo
                and (base.get("repo") or {}).get("full_name", "").lower() == repo)


def inputs(env):
    # Whole tracked tree, not an optimistic per-directory dependency map.
    source = command("git", "rev-parse", "HEAD")
    tree = command("git", "rev-parse", "HEAD^{tree}")
    if source != env.get("GITHUB_SHA") or not SHA.fullmatch(tree):
        raise ValueError("checkout mismatch")
    if subprocess.run(["git", "diff", "--quiet", "HEAD", "--"], timeout=15).returncode:
        raise ValueError("tracked checkout changed")
    keys = ("RUNNER_OS", "RUNNER_ARCH", "RUNNER_ENVIRONMENT", "ImageOS", "ImageVersion")
    if (not all(env.get(key) for key in keys) or env["RUNNER_OS"] != "Linux"
            or env["RUNNER_ENVIRONMENT"] != "github-hosted"):
        raise ValueError("unknown runner")
    # Do not read or persist application secrets or configurable build inputs.
    # If any such environment override exists, use fresh checks instead.
    prefixes = ("VITE_", "LLM_", "NPM_CONFIG_", "TURBO_", "PRISMA_",
                "ESLINT_", "TSC_", "TS_NODE_", "BABEL_", "GIT_CONFIG_")
    overrides = {"NODE_OPTIONS", "NODE_PATH", "NODE_EXTRA_CA_CERTS",
                 "NODE_TLS_REJECT_UNAUTHORIZED", "NODE_AUTH_TOKEN",
                 "NPM_TOKEN", "NPM_AUTH_TOKEN", "BROWSERSLIST_ENV"}
    if any(key.upper().startswith(prefixes) or key.upper() in overrides for key in env):
        raise ValueError("unmodelled tool or application override")
    stable = {key: env.get(key, "") for key in
              ("CI", "NODE_ENV", "AGENT_GRAPH_READONLY", "TZ", "LANG", "LC_ALL",
               "GITHUB_ACTIONS", "GITHUB_WORKSPACE")}
    if env.get("DATABASE_URL") != "postgresql://ci_no_write:ci_no_write@127.0.0.1:1/ci_unreachable":
        raise ValueError("unknown database isolation configuration")
    return {"tree": tree, "runner": {key: env[key] for key in keys},
            "node": command("node", "--version"), "npm": command("npm", "--version"),
            "python": ".".join(map(str, sys.version_info[:3])), "env": stable,
            "database": "ci-unreachable-v1"}


def artifact_name(job, attempt):
    return f"ci-reuse-{job}-v{VERSION}-{attempt}"


def evidence(job, env, current_inputs):
    return {"version": VERSION, "job": job, "mode": "fresh",
            "repository": env["GITHUB_REPOSITORY"].lower(), "branch": "main",
            "source_sha": env["GITHUB_SHA"], "run_id": int(env["GITHUB_RUN_ID"]),
            "attempt": int(env["GITHUB_RUN_ATTEMPT"]),
            "fingerprint": fingerprint(job, current_inputs), "inputs": current_inputs}


def trusted_run(run, env, current):
    repo = env["GITHUB_REPOSITORY"].lower()
    repo_id = int(env["GITHUB_REPOSITORY_ID"])
    return (run.get("event") == "push" and run.get("head_branch") == "main"
            and run.get("path") == WORKFLOW
            and run.get("status") == "completed" and run.get("conclusion") == "success"
            and (run.get("repository") or {}).get("id") == repo_id
            and (run.get("head_repository") or {}).get("id") == repo_id
            and (run.get("head_repository") or {}).get("full_name", "").lower() == repo
            and isinstance(run.get("id"), int) and run["id"] != int(env["GITHUB_RUN_ID"])
            and isinstance(run.get("run_attempt"), int) and run["run_attempt"] >= 1
            and bool(SHA.fullmatch(run.get("head_sha") or ""))
            and recent(run.get("created_at"), current))


def valid_job(jobs, job):
    name, required = JOBS[job]
    matches = [j for j in jobs if j.get("name") == name]
    if len(matches) != 1 or matches[0].get("conclusion") != "success":
        return False
    steps = matches[0].get("steps", [])
    required = (*required, "Record fresh CI evidence", "Upload fresh CI evidence")
    return all(sum(s.get("name") == name and s.get("conclusion") == "success"
                   for s in steps) == 1 for name in required)


def valid_artifact(artifact, run, job, env, current):
    owner = artifact.get("workflow_run") or {}
    repo_id = int(env["GITHUB_REPOSITORY_ID"])
    return (artifact.get("name") == artifact_name(job, run["run_attempt"])
            and artifact.get("expired") is False
            and isinstance(artifact.get("id"), int)
            and isinstance(artifact.get("size_in_bytes"), int)
            and 0 < artifact["size_in_bytes"] <= MAX_BYTES
            and bool(re.fullmatch(r"sha256:[0-9a-f]{64}", artifact.get("digest") or ""))
            and recent(artifact.get("created_at"), current)
            and owner.get("id") == run["id"] and owner.get("head_sha") == run["head_sha"]
            and owner.get("head_branch") == "main"
            and owner.get("repository_id") == repo_id and owner.get("head_repository_id") == repo_id)


def verified_payload(data, digest):
    if "sha256:" + hashlib.sha256(data).hexdigest() != digest:
        raise ValueError("artifact digest mismatch")
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        members = archive.infolist()
        if len(members) != 1 or members[0].filename != "evidence.json" or members[0].file_size > MAX_BYTES:
            raise ValueError("unexpected evidence archive")
        return json.loads(archive.read(members[0]))


def valid_evidence(payload, run, job, env, current_inputs):
    expected_env = dict(env, GITHUB_SHA=run["head_sha"], GITHUB_RUN_ID=str(run["id"]),
                        GITHUB_RUN_ATTEMPT=str(run["run_attempt"]))
    return payload == evidence(job, expected_env, current_inputs)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class GitHub:
    def __init__(self, env):
        repo = env["GITHUB_REPOSITORY"]
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repo):
            raise ValueError("invalid repository")
        self.base = "https://api.github.com/repos/" + repo
        self.headers = {"Accept": "application/vnd.github+json",
                        "Authorization": "Bearer " + env["GH_TOKEN"],
                        "X-GitHub-Api-Version": "2022-11-28",
                        "User-Agent": "cafe-ci-reuse"}
        self.opener = urllib.request.build_opener(NoRedirect())

    def get(self, path):
        with self.opener.open(urllib.request.Request(self.base + path, headers=self.headers),
                              timeout=8) as response:
            return json.load(response)

    def download(self, artifact_id):
        request = urllib.request.Request(self.base + f"/actions/artifacts/{artifact_id}/zip",
                                         headers=self.headers)
        try:
            with self.opener.open(request, timeout=8) as response:
                data = response.read(MAX_BYTES + 1)
        except urllib.error.HTTPError as error:
            location = error.headers.get("Location", "")
            if error.code != 302 or urllib.parse.urlsplit(location).scheme != "https":
                raise
            # Never forward GH_TOKEN to the signed storage URL.
            with self.opener.open(location, timeout=8) as response:
                data = response.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError("evidence too large")
        return data


def find_reuse(client, job, env, current_inputs, current):
    query = "/actions/workflows/ci.yml/runs?branch=main&event=push&status=success&per_page=5"
    for run in client.get(query).get("workflow_runs", []):
        if not trusted_run(run, env, current):
            continue
        commit = client.get(f"/git/commits/{run['head_sha']}")
        if (commit.get("tree") or {}).get("sha") != current_inputs["tree"]:
            continue
        prefix = f"/actions/runs/{run['id']}"
        name = artifact_name(job, run["run_attempt"])
        artifacts = client.get(prefix + "/artifacts?name=" + name).get("artifacts", [])
        if len(artifacts) != 1 or not valid_artifact(artifacts[0], run, job, env, current):
            continue
        jobs = client.get(prefix + f"/attempts/{run['run_attempt']}/jobs?per_page=100").get("jobs", [])
        if not valid_job(jobs, job):
            continue
        artifact = artifacts[0]
        payload = verified_payload(client.download(artifact["id"]), artifact["digest"])
        if valid_evidence(payload, run, job, env, current_inputs):
            return run["id"]
    return None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("lookup", "record"))
    parser.add_argument("job", choices=tuple(JOBS))
    args = parser.parse_args()
    env = os.environ
    if args.mode == "record":
        if not trusted_main(env):
            return 1
        try:
            payload = evidence(args.job, env, inputs(env))
            path = Path(env["RUNNER_TEMP"]) / f"ci-reuse-{args.job}" / "evidence.json"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(canonical(payload))
            return 0
        except Exception as error:
            print("Optional CI evidence not recorded:", type(error).__name__)
            return 1

    run_id = None
    try:
        event = {}
        if env.get("GITHUB_EVENT_NAME") == "pull_request":
            event = json.loads(Path(env["GITHUB_EVENT_PATH"]).read_text(encoding="utf-8"))
        if consumer(env, event):
            run_id = find_reuse(GitHub(env), args.job, env, inputs(env), now())
    except Exception as error:
        # An API outage, malformed evidence or environment drift is a cache miss.
        # Never include exception URLs, tokens, or response bodies in the log.
        print("CI evidence unavailable; running fresh:", type(error).__name__)
    with open(env["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
        output.write("reused=" + ("true" if run_id else "false") + "\n")
    message = f"{args.job}: REUSED fresh verified main run {run_id}" if run_id else f"{args.job}: FRESH checks required"
    print(message)
    with open(env["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as summary:
        summary.write(message + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
