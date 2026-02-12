/**
 * CQlaw — OpenClaw channel plugin entry point.
 * Registers the morse-radio channel and background service with the gateway.
 */

import type { OpenClawApi } from "./openclaw-api.js";
import { resolveConfig } from "./config.js";
import { createSendTextHandler } from "./outbound.js";
import { createService } from "./service.js";

const CHANNEL_DEFINITION = {
  id: "morse-radio",
  name: "Morse Radio",
  description: "CW/Morse code via SDR radio and fldigi",
  chatTypes: ["direct"],
  messageTypes: ["text"],
};

export function register(api: OpenClawApi): void {
  console.log("[cqlaw] Registering morse-radio channel");

  const config = resolveConfig({});

  // TX stub for now — the service will replace this with a real Transmitter
  // once the fldigi connection is established
  const sendText = createSendTextHandler(null);

  api.registerChannel(CHANNEL_DEFINITION, {
    sendText,
  });

  const service = createService(api, config);
  api.registerService(service);

  console.log("[cqlaw] Registration complete");
}
