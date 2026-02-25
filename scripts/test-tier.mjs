#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const tiers = {
  fast: [
    "dist/test/adif.test.js",
    "dist/test/adif-rotation.test.js",
    "dist/test/callsign.test.js",
    "dist/test/callsign-lookup.test.js",
    "dist/test/config.test.js",
    "dist/test/contest.test.js",
    "dist/test/contest-scoring.test.js",
    "dist/test/contest-session.test.js",
    "dist/test/context-reconstruct.test.js",
    "dist/test/decode-quality.test.js",
    "dist/test/fuzzy-match.test.js",
    "dist/test/qso-extract.test.js",
    "dist/test/qso-memory.test.js",
    "dist/test/sentence-buffer.test.js",
  ],
  medium: [
    "dist/test/register.test.js",
    "dist/test/service.test.js",
    "dist/test/outbound.test.js",
    "dist/test/xmlrpc-client.test.js",
    "dist/test/fldigi-client.test.js",
    "dist/test/fldigi-poller.test.js",
    "dist/test/transmitter.test.js",
    "dist/test/transmitter-signoff.test.js",
  ],
};

const tier = process.argv[2];
if (!tier || !Object.hasOwn(tiers, tier)) {
  console.error("Usage: node scripts/test-tier.mjs <fast|medium>");
  process.exit(1);
}

const selected = tiers[tier];
const result = spawnSync("node", ["--test", ...selected], { stdio: "inherit" });
process.exit(result.status ?? 1);
