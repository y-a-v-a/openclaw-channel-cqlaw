/**
 * Outbound message handler for the morse-radio channel.
 * Routes agent text through the Transmitter for CW transmission via fldigi.
 */

import type { OutboundMessage, SendResult } from "./openclaw-api.js";
import type { Transmitter } from "./transmitter.js";

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
    const result = await transmitter.send(message.text, rxWpm);
    return { success: result.success, error: result.error };
  };
}
