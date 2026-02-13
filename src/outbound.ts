/**
 * Outbound message handler for the morse-radio channel.
 * Routes agent text through the Transmitter for CW transmission via fldigi.
 */

import type { OutboundMessage, SendResult } from "./openclaw-api.js";
import type { Transmitter } from "./transmitter.js";
import type { TxIntent } from "./cw-format.js";
import { isCallsign } from "./callsign.js";

const VALID_INTENTS: ReadonlySet<TxIntent> = new Set(["cq", "reply", "signoff", "default"]);

function resolveIntent(metadata: Record<string, unknown> | undefined): TxIntent {
  const candidate = metadata?.txIntent;
  if (typeof candidate === "string" && VALID_INTENTS.has(candidate as TxIntent)) {
    return candidate as TxIntent;
  }
  return "default";
}

function resolvePeerCall(peer: string): string | undefined {
  const upper = peer.toUpperCase().trim();
  return isCallsign(upper) ? upper : undefined;
}

/**
 * Create an outbound sendText handler bound to a Transmitter instance.
 * If no transmitter is provided (e.g. TX not configured), falls back to a log stub.
 */
export function createSendTextHandler(
  transmitter: Transmitter | null,
  getDetectedWpm?: () => number | undefined
): (message: OutboundMessage) => Promise<SendResult> {
  if (!transmitter) {
    return async (message: OutboundMessage): Promise<SendResult> => {
      console.log(`[CW-TX-STUB] ${message.peer}: ${message.text}`);
      return { success: true };
    };
  }

  return async (message: OutboundMessage): Promise<SendResult> => {
    const rxWpm = getDetectedWpm?.();
    const intent = resolveIntent(message.metadata);
    const peerCall = resolvePeerCall(message.peer);
    const result = await transmitter.send(message.text, rxWpm, intent, peerCall);
    return { success: result.success, error: result.error };
  };
}
