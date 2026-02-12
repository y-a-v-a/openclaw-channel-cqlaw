/**
 * Background service for the morse-radio channel.
 * Phase 1: dispatches a hardcoded test string to verify end-to-end message flow.
 * Future: hosts the fldigi polling loop and SDR process management.
 */

import type { OpenClawApi, ServiceDefinition } from "./openclaw-api.js";

const CHANNEL_ID = "morse-radio";
const TEST_PEER = "PI4ABC";
const TEST_MESSAGE = "CQ CQ DE PI4ABC";
const STARTUP_DELAY_MS = 2000;

export function createService(api: OpenClawApi): ServiceDefinition {
  let startupTimer: ReturnType<typeof setTimeout> | null = null;

  return {
    id: "morse-radio-service",

    async start() {
      console.log("[morse-radio-service] Starting...");

      // Dispatch a test message after a short delay to allow gateway initialization
      startupTimer = setTimeout(() => {
        console.log("[morse-radio-service] Dispatching test inbound message");
        api.dispatchInbound({
          text: TEST_MESSAGE,
          peer: TEST_PEER,
          channel: CHANNEL_ID,
        });
      }, STARTUP_DELAY_MS);
    },

    async stop() {
      console.log("[morse-radio-service] Stopping...");
      if (startupTimer) {
        clearTimeout(startupTimer);
        startupTimer = null;
      }
    },
  };
}
