/**
 * CQlaw — OpenClaw channel plugin entry point.
 * Registers the morse-radio channel and background service with the gateway.
 */

import type { OpenClawApi } from "./openclaw-api.js";
import { createSendTextHandler } from "./outbound.js";
import { createService } from "./service.js";
import { resolveConfig } from "./config.js";
import { FldigiClient } from "./fldigi-client.js";
import { Transmitter, type TransmitLog } from "./transmitter.js";

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
  const txClient = new FldigiClient({
    host: config.fldigi.host,
    port: config.fldigi.port,
    timeoutMs: 5000,
  });
  const transmitter = new Transmitter(txClient, config, {
    onTransmitLog: (log: TransmitLog) => {
      console.log(
        `[transmitter] log ts=${log.timestamp} wpm=${log.wpm} dur=${log.durationSeconds}s freq=${log.frequency} call=${log.callsign} text="${log.text}"`,
      );
    },
    onLegalId: (callsign: string) => {
      console.log(`[transmitter] legal-id ${callsign}`);
    },
  });

  let pollerRef: { getDetectedWpm?: () => number | undefined } | null = null;
  const sendText = createSendTextHandler(transmitter, () => pollerRef?.getDetectedWpm?.());

  api.registerChannel(CHANNEL_DEFINITION, {
    sendText,
  });

  const service = createService(api, {
    config,
    onPollerCreated: (poller) => {
      pollerRef = poller;
    },
    onStatusChange: (status) => {
      if (status === "connected") {
        transmitter.markListenStart();
      }
    },
  });
  api.registerService(service);

  console.log("[cqlaw] Registration complete");
}
