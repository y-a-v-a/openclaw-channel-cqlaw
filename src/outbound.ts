/**
 * Outbound message handler for the morse-radio channel.
 * Phase 1: stub that logs agent responses.
 * Future: sends text to fldigi for CW transmission.
 */

import type { OutboundMessage, SendResult } from "./openclaw-api.js";

export function handleSendText(message: OutboundMessage): Promise<SendResult> {
  // TODO: Phase 4 — send via fldigi main.tx_text XML-RPC
  console.log(`[CW-TX-STUB] ${message.peer}: ${message.text}`);
  return Promise.resolve({ success: true });
}
