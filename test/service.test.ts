import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../src/service.js";
import type { OpenClawApi, InboundMessage } from "../src/openclaw-api.js";

function createMockApi(): OpenClawApi & { dispatched: InboundMessage[] } {
  const dispatched: InboundMessage[] = [];
  return {
    dispatched,
    registerChannel: () => {},
    registerService: () => {},
    dispatchInbound: (msg: InboundMessage) => { dispatched.push(msg); },
  };
}

describe("createService", () => {
  it("dispatches a test inbound message after startup delay", async () => {
    const api = createMockApi();
    const service = createService(api);

    await service.start();

    // Wait for the startup delay (2s) plus a small buffer
    await new Promise(resolve => setTimeout(resolve, 2500));

    assert.equal(api.dispatched.length, 1);
    assert.equal(api.dispatched[0].text, "CQ CQ DE PI4ABC");
    assert.equal(api.dispatched[0].peer, "PI4ABC");
    assert.equal(api.dispatched[0].channel, "morse-radio");

    await service.stop();
  });

  it("does not dispatch if stopped before delay elapses", async () => {
    const api = createMockApi();
    const service = createService(api);

    await service.start();
    await service.stop();

    // Wait past the startup delay to confirm nothing was dispatched
    await new Promise(resolve => setTimeout(resolve, 2500));

    assert.equal(api.dispatched.length, 0);
  });
});
