/**
 * Background service for the morse-radio channel.
 * Hosts the fldigi polling loop and dispatches inbound decoded text to OpenClaw.
 */

import type { OpenClawApi, ServiceDefinition } from "./openclaw-api.js";
import { resolveConfig, validateConfig, type ChannelConfig, type PartialChannelConfig } from "./config.js";
import { FldigiPoller, type FldigiPollerCallbacks } from "./fldigi-poller.js";

interface PollerLike {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface ServiceOptions {
  config?: PartialChannelConfig;
  createPoller?: (config: ChannelConfig, callbacks: FldigiPollerCallbacks) => PollerLike;
}

const CHANNEL_ID = "morse-radio";

export function createService(api: OpenClawApi, options: ServiceOptions = {}): ServiceDefinition {
  const config = resolveConfig(options.config ?? {});
  const createPoller = options.createPoller ?? ((cfg, callbacks) => new FldigiPoller(cfg, callbacks));
  let poller: PollerLike | null = null;
  let started = false;

  return {
    id: "morse-radio-service",

    async start() {
      if (started) return;
      started = true;

      const configErrors = validateConfig(config);
      if (configErrors.length > 0) {
        console.error("[morse-radio-service] Invalid config; service will remain inactive");
        for (const err of configErrors) {
          console.error(`[morse-radio-service] config.${err.field}: ${err.message}`);
        }
        return;
      }

      console.log(`[morse-radio-service] Starting with fldigi at ${config.fldigi.host}:${config.fldigi.port}`);

      poller = createPoller(config, {
        onMessage: (text, peer, metadata) => {
          api.dispatchInbound({
            text,
            peer,
            channel: CHANNEL_ID,
            metadata,
          });
        },
        onStatusChange: (status) => {
          console.log(`[morse-radio-service] Status: ${status}`);
        },
      });

      await poller.start();
    },

    async stop() {
      if (!started) return;
      started = false;

      console.log("[morse-radio-service] Stopping...");
      if (poller) {
        await poller.stop();
        poller = null;
      }
    },
  };
}
