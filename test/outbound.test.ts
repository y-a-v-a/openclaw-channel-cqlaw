import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSendTextHandler } from "../src/outbound.js";

describe("createSendTextHandler", () => {
  it("returns a stub handler when no transmitter is provided", async () => {
    const handler = createSendTextHandler(null);
    const result = await handler({
      text: "CQ CQ DE PA3XYZ K",
      peer: "PA3XYZ",
      channel: "morse-radio",
    });
    assert.equal(result.success, true);
  });

  it("logs outbound text via stub for smoke visibility", async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (message?: unknown, ...optional: unknown[]) => {
      logs.push(String(message ?? ""));
      if (optional.length > 0) {
        logs.push(optional.map((part) => String(part)).join(" "));
      }
    };

    try {
      const handler = createSendTextHandler(null);
      const result = await handler({
        text: "TNX FER QSO 73",
        peer: "PI4ABC",
        channel: "morse-radio",
      });
      assert.equal(result.success, true);
    } finally {
      console.log = originalLog;
    }

    assert.ok(logs.some((line) => line.includes("[CW-TX-STUB]")));
    assert.ok(logs.some((line) => line.includes("TNX FER QSO 73")));
  });

  it("falls back to default intent when metadata txIntent is invalid", async () => {
    const calls: Array<{ text: string; intent: string; peerCall?: string }> = [];
    const handler = createSendTextHandler({
      send: async (text: string, _wpm?: number, intent?: string, peerCall?: string) => {
        calls.push({ text, intent: intent ?? "default", peerCall });
        return { success: true, transmitted: text };
      },
    } as any);

    const result = await handler({
      text: "TEST",
      peer: "PA3XYZ",
      channel: "morse-radio",
      metadata: { txIntent: "bogus" },
    });

    assert.equal(result.success, true);
    assert.equal(calls[0].intent, "default");
  });

  it("does not pass malformed peer as callsign", async () => {
    const calls: Array<{ peerCall?: string }> = [];
    const handler = createSendTextHandler({
      send: async (_text: string, _wpm?: number, _intent?: string, peerCall?: string) => {
        calls.push({ peerCall });
        return { success: true };
      },
    } as any);

    await handler({
      text: "TEST",
      peer: "dl2abc && rm -rf /",
      channel: "morse-radio",
    });

    assert.equal(calls[0].peerCall, undefined);
  });
});
