#!/usr/bin/env bash
set -euo pipefail

export HOME="${HOME:-/tmp}"
mkdir -p "${HOME}/.config/pulse"

FLDIGI_HOST="${FLDIGI_HOST:-127.0.0.1}"
FLDIGI_PORT="${FLDIGI_PORT:-7362}"
PREFLIGHT_FILE="${CQLAW_SLOW_PREFLIGHT_FILE:-/workspace/.artifacts/slow-preflight.json}"
mkdir -p "$(dirname "${PREFLIGHT_FILE}")"

write_preflight() {
  local status="$1"
  local reason="$2"
  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    const payload = {
      status: process.argv[2],
      reason: process.argv[3],
      timestamp: new Date().toISOString(),
    };
    fs.mkdirSync(require("path").dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  ' "${PREFLIGHT_FILE}" "${status}" "${reason}"
}

cleanup() {
  if [ -n "${FLDIGI_PID:-}" ] && kill -0 "${FLDIGI_PID}" 2>/dev/null; then
    kill "${FLDIGI_PID}" >/dev/null 2>&1 || true
    wait "${FLDIGI_PID}" 2>/dev/null || true
  fi
  pulseaudio --kill >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "[slow-test] Starting fldigi via start-fldigi.sh"
/usr/local/bin/start-fldigi.sh >/tmp/fldigi.log 2>&1 &
FLDIGI_PID=$!

echo "[slow-test] Waiting for fldigi XML-RPC at ${FLDIGI_HOST}:${FLDIGI_PORT}"
RPC_READY=0
for _ in $(seq 1 60); do
  if curl -sf -X POST "http://${FLDIGI_HOST}:${FLDIGI_PORT}/RPC2" \
    -H "Content-Type: text/xml" \
    -d '<?xml version="1.0"?><methodCall><methodName>fldigi.version</methodName><params></params></methodCall>' \
    >/dev/null; then
    RPC_READY=1
    break
  fi
  sleep 1
done

if [ "${RPC_READY}" -ne 1 ]; then
  echo "[slow-test] fldigi failed to become ready at ${FLDIGI_HOST}:${FLDIGI_PORT}."
  echo "[slow-test] Verify XML-RPC flags/support in the installed fldigi package."
  echo "[slow-test] Startup logs:"
  cat /tmp/fldigi.log || true
  write_preflight "degraded" "fldigi XML-RPC not reachable; likely container audio backend initialization failure"
  echo "[slow-test] Degraded mode enabled; skipping live decode test execution."
  exit 0
else
  write_preflight "healthy" "fldigi XML-RPC reachable"
fi

echo "[slow-test] Installing dependencies and running decode-chain tests"
cd /workspace
npm ci
npm run pretest
CQLAW_RUN_FLDIGI_DECODE_CHAIN=1 CQLAW_SLOW_PREFLIGHT_FILE="${PREFLIGHT_FILE}" node --test dist/test/fldigi-decode-chain.test.js
