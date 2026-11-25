#!/usr/bin/env bash
set -euo pipefail

# Runs only on a prepared, user-managed staging server. Never run against the
# shared dev/production database without independent operator confirmation.
owner="${1:-}"
tag="${2:-}"
[[ "$owner" =~ ^[a-z0-9][a-z0-9._-]*$ ]] || { echo 'Invalid GHCR owner' >&2; exit 2; }
[[ "$tag" =~ ^[a-f0-9]{40}$ ]] || { echo 'Image tag must be exact Git commit SHA' >&2; exit 2; }
dir=/opt/cafe/staging
cd "$dir"
exec 9>.deploy.lock
flock -n 9 || { echo 'Another staging deployment is in progress' >&2; exit 2; }
[[ -f .env ]] || { echo 'Missing staging .env; nothing deployed' >&2; exit 2; }
grep -qx 'STAGING_DB_READY=YES' .env || {
  echo 'STAGING_DB_READY=YES is required after verifying the configured DB is safe' >&2
  exit 2
}
if grep -Eq '^[[:space:]]*DATABASE_URL=.*(cafe_postgres|/cafedb([?[:space:]]|$))' .env; then
  echo 'Refusing an obvious shared cafe_postgres/cafedb target' >&2
  exit 2
fi

compose=(docker compose -p cafe-staging --env-file .env -f compose.staging.yml)
export IMAGE_OWNER="$owner" IMAGE_TAG="$tag"
"${compose[@]}" config --quiet

if [[ -f .last-successful-release ]]; then
  read -r prev_owner prev_tag < .last-successful-release
else
  prev_owner="$(cat .last-successful-owner 2>/dev/null || true)"
  prev_tag="$(cat .last-successful-tag 2>/dev/null || true)"
fi
health() {
  for _ in $(seq 1 30); do
    if curl --fail --silent --show-error --max-time 4 http://127.0.0.1:5155/health >/dev/null 2>&1 &&
       curl --fail --silent --show-error --max-time 4 http://127.0.0.1:5100/health >/dev/null 2>&1 &&
       curl --fail --silent --show-error --max-time 4 http://127.0.0.1:8081/ >/dev/null 2>&1; then
      return 0
    fi
    sleep 3
  done
  return 1
}
verify_release_images() {
  local service cid actual expected
  for service in agent api web; do
    cid="$("${compose[@]}" ps -q "$service")"
    [[ -n "$cid" ]] || return 1
    actual="$(docker inspect --format '{{.Config.Image}}' "$cid")"
    expected="ghcr.io/$IMAGE_OWNER/cafe-$service:$IMAGE_TAG"
    if [[ "$actual" != "$expected" ]]; then
      echo "Wrong image running for $service; expected commit image" >&2
      return 1
    fi
  done
}
rollback() {
  echo 'Staging health/startup failed; attempting rollback to previous successful image tag' >&2
  if [[ "$prev_owner" =~ ^[a-z0-9][a-z0-9._-]*$ && "$prev_tag" =~ ^[a-f0-9]{40}$ ]]; then
    export IMAGE_OWNER="$prev_owner" IMAGE_TAG="$prev_tag"
    if ! "${compose[@]}" up -d --no-deps agent api web || ! health || ! verify_release_images; then
      echo 'Rollback verification FAILED: manual intervention required' >&2
    else
      echo "STAGING_ROLLBACK_PASS tag=$prev_tag" >&2
    fi
  else
    echo 'No prior successful release; manual inspection required' >&2
  fi
}

# Remote GHCR authentication is configured by the server operator (read-only).
"${compose[@]}" pull agent api web
if ! "${compose[@]}" up -d --no-deps agent api web; then
  rollback
  exit 1
fi
if ! health || ! verify_release_images; then
  rollback
  exit 1
fi

release_record="$(mktemp .last-successful-release.XXXXXX)"
trap 'rm -f -- "$release_record"' EXIT
printf '%s %s\n' "$owner" "$tag" > "$release_record"
mv -f -- "$release_record" .last-successful-release
printf '%s\t%s\t%s\n' "$(date -u +%FT%TZ)" "$owner" "$tag" >> deployments.tsv
echo "STAGING_DEPLOY_PASS tag=$tag api=healthy agent=healthy web=healthy"
