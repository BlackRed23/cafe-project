#!/usr/bin/env python3
"""Deploy the CI-verified Git revision to existing production Render services."""

import datetime as dt
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.render.com/v1"
PENDING = {"created", "queued", "build_in_progress", "pre_deploy_in_progress", "update_in_progress"}
FAILED = {"build_failed", "pre_deploy_failed", "update_failed", "canceled"}
SHA = re.compile(r"[0-9a-f]{40}\Z")
ID = re.compile(r"srv-[A-Za-z0-9-]+\Z")


class DeployError(Exception):
    pass


def request(method, url, token=None, body=None, timeout=20):
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                 headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read(1024 * 1024)
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        raise DeployError(f"HTTP {exc.code} from {urllib.parse.urlsplit(url).path}") from None
    except (urllib.error.URLError, TimeoutError, ValueError) as exc:
        raise DeployError(f"Request failed for {urllib.parse.urlsplit(url).path}: {type(exc).__name__}") from None


def api(method, path, token, body=None):
    return request(method, API + path, token, body)


def sha_of(deploy):
    return (deploy.get("commit") or {}).get("id")


def validate(env):
    keys = ["RENDER_API_KEY", "RENDER_API_SERVICE_ID", "RENDER_AGENT_SERVICE_ID",
            "RENDER_WEB_SERVICE_ID", "CI_PUBLIC_API_URL", "CI_DEPLOY_BRANCH",
            "GITHUB_SHA", "GITHUB_REPOSITORY", "GH_TOKEN", "GITHUB_EVENT_PATH"]
    missing = [key for key in keys if not env.get(key)]
    if missing:
        raise DeployError("Missing configuration: " + ", ".join(missing))
    if env["CI_DEPLOY_BRANCH"] != "production":
        raise DeployError("CI_DEPLOY_BRANCH must be production")
    if env.get("GITHUB_EVENT_NAME") != "push" or env.get("GITHUB_REF") != "refs/heads/production":
        raise DeployError("Render deployment requires a production push")
    ids = [env[f"RENDER_{name}_SERVICE_ID"] for name in ("API", "AGENT", "WEB")]
    if len(set(ids)) != 3 or any(not ID.fullmatch(value) for value in ids):
        raise DeployError("Render service IDs must be distinct valid srv IDs")
    if not SHA.fullmatch(env["GITHUB_SHA"]):
        raise DeployError("Invalid GITHUB_SHA")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", env["GITHUB_REPOSITORY"]):
        raise DeployError("Invalid GITHUB_REPOSITORY")
    url = urllib.parse.urlsplit(env["CI_PUBLIC_API_URL"])
    if url.scheme != "https" or not url.hostname or url.hostname in ("localhost", "127.0.0.1"):
        raise DeployError("CI_PUBLIC_API_URL must be public HTTPS")
    return ids


def current_head(env):
    repo = urllib.parse.quote(env["GITHUB_REPOSITORY"], safe="/")
    branch = urllib.parse.quote(env["CI_DEPLOY_BRANCH"], safe="")
    data = request("GET", f"https://api.github.com/repos/{repo}/branches/{branch}", env["GH_TOKEN"])
    return data["commit"]["sha"]


def check_source(env):
    if current_head(env) != env["GITHUB_SHA"]:
        raise DeployError("Source revision superseded on deploy branch")


def check_schema(env):
    with open(env["GITHUB_EVENT_PATH"], encoding="utf-8") as stream:
        before = json.load(stream).get("before")
    if not before or not SHA.fullmatch(before) or before == "0" * 40:
        raise DeployError("Cannot establish push base for schema change check; manual review required")
    result = subprocess.run(["git", "diff", "--name-only", before, env["GITHUB_SHA"]],
                            capture_output=True, text=True, check=False)
    if result.returncode:
        raise DeployError("Cannot inspect source diff for schema changes")
    paths = result.stdout.splitlines()
    if any(re.search(r"(^|/)(migrations?/|schema\.prisma$|schema\.(sql|ts)$|.*\.sql$)",
                     path.replace("\\", "/"), re.I) for path in paths):
        raise DeployError("Schema-changing revision requires separately reviewed migration and rollback plan")


def service_info(service_id, token, repo, branch):
    service = api("GET", f"/services/{service_id}", token)
    normalized = service.get("repo", "").rstrip("/").removesuffix(".git").lower()
    if normalized != f"https://github.com/{repo}".lower() or service.get("branch") != branch:
        raise DeployError(f"{service_id}: wrong Git repository or branch")
    if service.get("imagePath") or service.get("image") or not service.get("repo"):
        raise DeployError(f"{service_id}: not Git-backed")
    if (service.get("autoDeployTrigger", "off" if service.get("autoDeploy") == "no" else "unknown") != "off"
            or service.get("autoDeploy") not in (None, "no")):
        raise DeployError(f"{service_id}: Auto-Deploy must be disabled")
    url = service.get("serviceDetails", {}).get("url") or service.get("url")
    if not url or urllib.parse.urlsplit(url).scheme != "https":
        raise DeployError(f"{service_id}: missing public HTTPS service URL")
    return url.rstrip("/")


def deploys(service_id, token):
    entries = api("GET", f"/services/{service_id}/deploys?limit=20", token)
    return [item.get("deploy", item) for item in entries]


def live_deploy(service_id, token):
    entries = deploys(service_id, token)
    if entries and entries[0].get("status") in PENDING:
        raise DeployError(f"{service_id}: another deployment is in progress")
    live = next((item for item in entries if item.get("status") == "live" and sha_of(item)), None)
    previous = [item for item in entries if item.get("id") != (live or {}).get("id")
                and sha_of(item) and item.get("status") in {"live", "deactivated"}]
    if not live or not previous:
        raise DeployError(f"{service_id}: current live and recoverable previous deployment required")
    return live


def wait_deploy(service_id, deploy_id, token, expected_sha, seconds=600):
    deadline = time.monotonic() + seconds
    while True:
        item = api("GET", f"/services/{service_id}/deploys/{deploy_id}", token)
        status = item.get("status")
        if status == "live":
            if sha_of(item) != expected_sha:
                raise DeployError(f"{service_id}: live deployment has wrong commit")
            return item
        if status in FAILED or status not in PENDING:
            raise DeployError(f"{service_id}: deployment status {status}")
        if time.monotonic() >= deadline:
            raise DeployError(f"{service_id}: deployment timeout")
        time.sleep(min(10, max(0, deadline - time.monotonic())))


def health(name, url):
    target = urllib.parse.urljoin(url + "/", "health" if name != "web" else "")
    if name == "web":
        target = url + "/"
    response = request("GET", target)
    if name == "api" and not (response.get("success") is True and response.get("data", {}).get("status") == "OK"):
        raise DeployError("API /health did not return expected success response")
    if name == "agent" and response.get("status") != "OK":
        raise DeployError("Agent /health did not return OK")
    return {"url": target, "status": "healthy"}


def web_health(url):
    req = urllib.request.Request(url + "/", headers={"Accept": "text/html"})
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            content = response.read(1024 * 1024).decode("utf-8", "replace")
            if response.status != 200 or "text/html" not in response.headers.get("Content-Type", "") or "<html" not in content.lower():
                raise DeployError("Web root did not return successful HTML")
    except (urllib.error.URLError, TimeoutError) as exc:
        raise DeployError(f"Web health request failed: {type(exc).__name__}") from None
    return {"url": url + "/", "status": "healthy"}


def evidence(record):
    print(json.dumps(record, sort_keys=True))
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as stream:
            stream.write("### Production Render deployment evidence\n\n```json\n")
            stream.write(json.dumps(record, indent=2, sort_keys=True))
            stream.write("\n```\n")


def run(env, clock=time.time):
    names = ("api", "agent", "web")
    record = {"environment": "production", "source_sha": env.get("GITHUB_SHA"), "services": {},
              "rollback": {}, "rubric_target_seconds": 900}
    affected = []
    try:
        ids = validate(env)
        token = env["RENDER_API_KEY"]
        check_schema(env)
        check_source(env)
        api_url = urllib.parse.urlsplit(env["CI_PUBLIC_API_URL"])
        for name, sid in zip(names, ids):
            url = service_info(sid, token, env["GITHUB_REPOSITORY"], env["CI_DEPLOY_BRANCH"])
            if name == "api" and url.rstrip("/") != f"{api_url.scheme}://{api_url.netloc}":
                raise DeployError("CI_PUBLIC_API_URL does not match Render API service origin")
            old = live_deploy(sid, token)
            record["services"][name] = {"service_id": sid, "url": url, "previous_deploy_id": old["id"],
                                         "previous_sha": sha_of(old), "status": "pending"}
        for name in names:
            check_source(env)
            item = record["services"][name]
            item["status"] = "requesting"
            affected.append(name)
            created = api("POST", f"/services/{item['service_id']}/deploys", token,
                          {"commitId": env["GITHUB_SHA"]})
            item["deploy_id"] = created["id"]
            item["status"] = created.get("status")
            live = wait_deploy(item["service_id"], created["id"], token, env["GITHUB_SHA"])
            item["status"] = live["status"]
        for name in names:
            item = record["services"][name]
            item["health"] = web_health(item["url"]) if name == "web" else health(name, item["url"])
            active = live_deploy(item["service_id"], token)
            if active["id"] != item["deploy_id"] or sha_of(active) != env["GITHUB_SHA"]:
                raise DeployError(f"{name}: active deployment mismatch")
        check_source(env)
        with open(env["GITHUB_EVENT_PATH"], encoding="utf-8") as stream:
            timestamp = json.load(stream)["head_commit"]["timestamp"]
        start = dt.datetime.fromisoformat(timestamp.replace("Z", "+00:00")).timestamp()
        elapsed = clock() - start
        if elapsed < 0:
            raise DeployError("Commit timestamp is newer than healthy deployment clock")
        record["commit_to_healthy_seconds"] = round(elapsed, 1)
        record["within_900_seconds"] = elapsed <= 900
        record["result"] = "healthy"
        return 0, record
    except (DeployError, KeyError, TypeError, ValueError) as exc:
        record["error"] = str(exc)
        record["result"] = "failed"
        for name in reversed(affected):
            item = record["services"][name]
            sid = item["service_id"]
            try:
                if not item.get("deploy_id"):
                    raise DeployError("deploy request outcome unknown; manual recovery required")
                # Do not roll back while Render may still switch the active deploy.
                candidate = api("GET", f"/services/{sid}/deploys/{item['deploy_id']}", token)
                if candidate.get("status") in PENDING:
                    candidate = wait_until_terminal(sid, item["deploy_id"], token)
                item["status"] = candidate.get("status")
                active = live_deploy(sid, token)
                if active["id"] == item["previous_deploy_id"] and sha_of(active) == item["previous_sha"]:
                    record["rollback"][name] = "already restored"
                    continue
                if active["id"] != item["deploy_id"]:
                    raise DeployError("unexpected active deployment; manual recovery required")
                rollback = api("POST", f"/services/{sid}/rollback", token,
                               {"deployId": item["previous_deploy_id"]})
                restored = wait_deploy(sid, rollback["id"], token, item["previous_sha"])
                active = live_deploy(sid, token)
                if active["id"] != restored["id"] or sha_of(active) != item["previous_sha"]:
                    raise DeployError("restored deployment is not active")
                item["rollback_health"] = web_health(item["url"]) if name == "web" else health(name, item["url"])
                record["rollback"][name] = {"deploy_id": restored["id"], "status": "restored",
                                              "sha": sha_of(restored)}
            except (DeployError, KeyError, TypeError, ValueError) as rollback_error:
                record["rollback"][name] = {"status": "manual recovery required", "error": str(rollback_error)}
        return 1, record


def wait_until_terminal(service_id, deploy_id, token, seconds=600):
    deadline = time.monotonic() + seconds
    while True:
        item = api("GET", f"/services/{service_id}/deploys/{deploy_id}", token)
        if item.get("status") not in PENDING:
            return item
        if time.monotonic() >= deadline:
            raise DeployError("in-progress deployment did not settle; manual recovery required")
        time.sleep(min(10, max(0, deadline - time.monotonic())))


if __name__ == "__main__":
    code, result = run(os.environ)
    evidence(result)
    sys.exit(code)
