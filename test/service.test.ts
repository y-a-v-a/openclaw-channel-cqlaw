import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../src/service.js";
import type { OpenClawApi, InboundMessage } from "../src/openclaw-api.js";
import type { ChannelConfig } from "../src/config.js";
import type { FldigiPollerCallbacks } from "../src/fldigi-poller.js";

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
  it("dispatches inbound text from the poller callback", async () => {
    const api = createMockApi();
    const callbackHolder: { callbacks?: FldigiPollerCallbacks } = {};
    let started = false;
    let stopped = false;

    const service = createService(api, {
      createPoller: (_config: ChannelConfig, cb: FldigiPollerCallbacks) => {
        callbackHolder.callbacks = cb;
        return {
          async start() { started = true; },
          async stop() { stopped = true; },
        };
      },
    });

    await service.start();
    callbackHolder.callbacks?.onMessage("CQ CQ DE PI4ABC", "PI4ABC", {
      timestamp: "2026-02-13T00:00:00.000Z",
      frequency: 7030000,
      detectedWpm: 20,
      snr: 18.5,
    });

    assert.equal(api.dispatched.length, 1);
    assert.equal(api.dispatched[0].text, "CQ CQ DE PI4ABC");
    assert.equal(api.dispatched[0].peer, "PI4ABC");
    assert.equal(api.dispatched[0].channel, "morse-radio");
    assert.equal(api.dispatched[0].metadata?.detectedWpm, 20);
    assert.equal(api.dispatched[0].metadata?.snr, 18.5);

    await service.stop();
    assert.equal(started, true);
    assert.equal(stopped, true);
  });

  it("does not start poller when config is invalid", async () => {
    const api = createMockApi();
    let startCalls = 0;

    const service = createService(api, {
      config: { fldigi: { host: "" } },
      createPoller: (_config: ChannelConfig, _cb: FldigiPollerCallbacks) => ({
        async start() { startCalls++; },
        async stop() {},
      }),
    });

    await service.start();
    await service.stop();

    assert.equal(startCalls, 0);
  });
});
