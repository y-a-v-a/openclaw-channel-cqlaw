/**
 * CQlaw — OpenClaw channel plugin entry point.
 * Registers the morse-radio channel and background service with the gateway.
 */

import type { OpenClawApi } from "./openclaw-api.js";
import { handleSendText } from "./outbound.js";
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

  api.registerChannel(CHANNEL_DEFINITION, {
    sendText: handleSendText,
  });

  const service = createService(api);
  api.registerService(service);

  console.log("[cqlaw] Registration complete");
}
