#!/bin/sh

set -eu

PULL_ATTEMPTS=${RELAY_PULL_ATTEMPTS:-3}
PULL_TIMEOUT_SECONDS=${RELAY_PULL_TIMEOUT_SECONDS:-600}
PULL_BACKOFF_SECONDS=${RELAY_PULL_BACKOFF_SECONDS:-15}
HEALTH_TIMEOUT_SECONDS=${RELAY_HEALTH_TIMEOUT_SECONDS:-300}
MIN_FREE_KB=${RELAY_MIN_FREE_KB:-1048576}
RELAY_IMAGE_SOURCE=${RELAY_IMAGE_SOURCE:-}

fail() {
  printf 'Relay deployment error: %s\n' "$*" >&2
  exit 1
}

require_positive_integer() {
  value_name=$1
  value=$2

  case "$value" in
    "" | *[!0-9]* | 0)
      fail "$value_name must be a positive integer"
      ;;
  esac
}

require_positive_integer RELAY_PULL_ATTEMPTS "$PULL_ATTEMPTS"
require_positive_integer RELAY_PULL_TIMEOUT_SECONDS "$PULL_TIMEOUT_SECONDS"
require_positive_integer RELAY_PULL_BACKOFF_SECONDS "$PULL_BACKOFF_SECONDS"
require_positive_integer RELAY_HEALTH_TIMEOUT_SECONDS "$HEALTH_TIMEOUT_SECONDS"
require_positive_integer RELAY_MIN_FREE_KB "$MIN_FREE_KB"

test -n "${RELAY_IMAGE:-}" || fail "RELAY_IMAGE is required"
test -n "${VM_DEPLOY_PATH:-}" || fail "VM_DEPLOY_PATH is required"
command -v docker >/dev/null 2>&1 || fail "docker is required"
command -v timeout >/dev/null 2>&1 || fail "GNU timeout is required"
docker compose version >/dev/null 2>&1 || fail "the Docker Compose plugin is required"

cd "$VM_DEPLOY_PATH"

test -s .env || fail ".env is missing or empty"
test -s compose.yaml || fail "compose.yaml is missing or empty"
test -s Caddyfile || fail "Caddyfile is missing or empty"

IMAGE_REPOSITORY=${RELAY_IMAGE%:*}
test "$IMAGE_REPOSITORY" != "$RELAY_IMAGE" || fail "RELAY_IMAGE must use an immutable tag"

PREVIOUS_IMAGE=
if test -s .release.env; then
  PREVIOUS_IMAGE=$(sed -n 's/^RELAY_IMAGE=//p' .release.env | head -n 1)
fi

cleanup_next_release() {
  rm -f .release.env.next
}

print_storage_diagnostics() {
  docker system df || true
  if test -n "${DOCKER_ROOT:-}"; then
    df -h "$DOCKER_ROOT" || true
  fi
}

prune_stale_relay_images() {
  docker image ls "$IMAGE_REPOSITORY" --format '{{.Repository}}:{{.Tag}}' 2>/dev/null |
    while IFS= read -r candidate; do
      case "$candidate" in
        "" | "$RELAY_IMAGE" | "$PREVIOUS_IMAGE" | "${IMAGE_REPOSITORY}:<none>")
          continue
          ;;
      esac

      docker image rm "$candidate" >/dev/null 2>&1 || true
    done

  if test -n "$RELAY_IMAGE_SOURCE"; then
    docker image prune --force \
      --filter "label=org.opencontainers.image.source=$RELAY_IMAGE_SOURCE" \
      >/dev/null || true
  fi
}

pull_release() {
  attempt=1

  while test "$attempt" -le "$PULL_ATTEMPTS"; do
    printf 'Pulling Relay release image (attempt %s/%s).\n' "$attempt" "$PULL_ATTEMPTS"

    if timeout "$PULL_TIMEOUT_SECONDS" \
      docker compose --env-file .release.env.next -f compose.yaml pull --quiet; then
      return 0
    else
      pull_status=$?
    fi

    if test "$attempt" -ge "$PULL_ATTEMPTS"; then
      printf 'Image pull failed after %s attempts (last exit code %s).\n' \
        "$PULL_ATTEMPTS" "$pull_status" >&2
      return "$pull_status"
    fi

    delay=$((PULL_BACKOFF_SECONDS * attempt))
    printf 'Image pull failed with exit code %s; retrying in %s seconds.\n' \
      "$pull_status" "$delay" >&2
    sleep "$delay"
    attempt=$((attempt + 1))
  done
}

prune_stale_relay_images

DOCKER_ROOT=$(docker info --format '{{.DockerRootDir}}')
test -n "$DOCKER_ROOT" || fail "Docker did not report its data-root"

AVAILABLE_KB=$(df -Pk "$DOCKER_ROOT" | awk 'NR == 2 { print $4 }')
case "$AVAILABLE_KB" in
  "" | *[!0-9]*)
    fail "could not determine free space for Docker data-root $DOCKER_ROOT"
    ;;
esac

if test "$AVAILABLE_KB" -lt "$MIN_FREE_KB"; then
  print_storage_diagnostics
  fail "Docker data-root needs at least $((MIN_FREE_KB / 1024)) MiB free; only $((AVAILABLE_KB / 1024)) MiB is available"
fi

umask 077
printf '%s\n' \
  "RELAY_IMAGE=$RELAY_IMAGE" \
  'RELAY_ENV_FILE=.env' \
  >.release.env.next

trap cleanup_next_release EXIT HUP INT TERM

docker compose --env-file .release.env.next -f compose.yaml config --quiet

if ! pull_release; then
  print_storage_diagnostics
  fail "unable to pull the release images"
fi

if docker compose \
  --env-file .release.env.next \
  -f compose.yaml \
  up --pull never -d --remove-orphans --wait --wait-timeout "$HEALTH_TIMEOUT_SECONDS"; then
  if test -s .release.env; then
    cp .release.env .release.env.previous
    chmod 600 .release.env.previous
  fi

  mv .release.env.next .release.env
  trap - EXIT HUP INT TERM

  docker compose --env-file .release.env -f compose.yaml ps
  prune_stale_relay_images
  exit 0
fi

printf 'New release failed its health checks.\n' >&2
docker compose --env-file .release.env.next -f compose.yaml ps || true
docker compose --env-file .release.env.next -f compose.yaml \
  logs --no-color --tail 100 api worker caddy || true

if test -s .release.env; then
  printf 'Restoring the previous healthy release.\n' >&2
  if ! docker compose \
    --env-file .release.env \
    -f compose.yaml \
    up --pull never -d --remove-orphans --wait --wait-timeout "$HEALTH_TIMEOUT_SECONDS"; then
    printf 'Previous release restoration also failed.\n' >&2
    docker compose --env-file .release.env -f compose.yaml ps || true
    docker compose --env-file .release.env -f compose.yaml \
      logs --no-color --tail 100 api worker caddy || true
  fi
else
  printf 'No previous release exists to restore.\n' >&2
fi

exit 1
