/**
 * Background service for the morse-radio channel.
 * Hosts the fldigi polling loop and dispatches decoded CW messages
 * to the gateway as inbound messages.
 */

import type { OpenClawApi, ServiceDefinition } from "./openclaw-api.js";
import type { ChannelConfig } from "./config.js";
import { FldigiPoller } from "./fldigi-poller.js";

const CHANNEL_ID = "morse-radio";

export function createService(api: OpenClawApi, config: ChannelConfig): ServiceDefinition {
  let poller: FldigiPoller | null = null;

  return {
    id: "morse-radio-service",

    async start() {
      console.log("[morse-radio-service] Starting...");

      poller = new FldigiPoller(config, {
        onMessage: (text, peer, metadata) => {
          console.log(`[morse-radio-service] RX from ${peer}: ${text}`);
          api.dispatchInbound({
            text,
            peer,
            channel: CHANNEL_ID,
            metadata,
          });
        },
        onStatusChange: (status) => {
          console.log(`[morse-radio-service] Channel status: ${status}`);
        },
      });

      await poller.start();
    },

    async stop() {
      console.log("[morse-radio-service] Stopping...");
      if (poller) {
        await poller.stop();
        poller = null;
      }
    },
  };
}
