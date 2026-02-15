#!/usr/bin/env bash

set -euo pipefail

echo "[smoke] Building project"
npm run build >/dev/null

if command -v openclaw >/dev/null 2>&1; then
  echo "[smoke] Installing plugin locally with openclaw"
  openclaw plugins install -l .
else
  echo "[smoke] openclaw binary not found, skipping install check (set SMOKE_REQUIRE_OPENCLAW=1 to require)"
  if [ "${SMOKE_REQUIRE_OPENCLAW:-0}" = "1" ]; then
    echo "[smoke] openclaw is required but not installed"
    exit 1
  fi
fi

echo "[smoke] Running registration/service/outbound verification tests"
node --test \
  dist/test/register.test.js \
  dist/test/service.test.js \
  dist/test/outbound.test.js

echo "[smoke] Smoke verification passed"
