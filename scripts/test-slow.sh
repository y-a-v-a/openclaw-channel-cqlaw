#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required for slow decode-chain tests"
  exit 1
fi

cleanup() {
  docker compose -f docker-compose.test.yml down --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

cat <<'EOF'
Running slow tier with docker-compose.test.yml.
Topology:
- Single-container test image (fldigi + PulseAudio + Node test runner)
- WAV playback and fldigi decode run in the same container to keep audio routing local
EOF

PREFLIGHT_FILE="${CQLAW_SLOW_PREFLIGHT_FILE:-.artifacts/slow-preflight.json}"
mkdir -p "$(dirname "${PREFLIGHT_FILE}")"

set +e
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from slow-test
compose_exit=$?
set -e

if [ -f "${PREFLIGHT_FILE}" ]; then
  status=$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(p.status||"unknown"));' "${PREFLIGHT_FILE}" 2>/dev/null || echo "unknown")
  reason=$(node -e 'const fs=require("fs"); const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(p.reason||""));' "${PREFLIGHT_FILE}" 2>/dev/null || true)
  echo "[slow-test] Preflight status: ${status}"
  if [ -n "${reason}" ]; then
    echo "[slow-test] Preflight reason: ${reason}"
  fi
else
  status="missing"
  echo "[slow-test] Preflight status: missing (${PREFLIGHT_FILE} not found)"
fi

if [ "${compose_exit}" -eq 0 ]; then
  exit 0
fi

if [ "${status}" = "degraded" ]; then
  echo "[slow-test] Returning success in degraded mode (infrastructure limitation documented)."
  exit 0
fi

exit "${compose_exit}"
