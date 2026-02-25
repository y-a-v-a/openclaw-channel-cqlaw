import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createService } from "../src/service.js";
import type { OpenClawApi, InboundMessage } from "../src/openclaw-api.js";
import type { ChannelConfig } from "../src/config.js";
import type { FldigiPollerCallbacks } from "../src/fldigi-poller.js";
import type { ExtractedQsoFields } from "../src/qso-extract.js";

function createMockApi(): OpenClawApi & { dispatched: InboundMessage[] } {
  const dispatched: InboundMessage[] = [];
  return {
    dispatched,
    registerChannel: () => {},
    registerService: () => {},
    dispatchInbound: (msg: InboundMessage) => { dispatched.push(msg); },
  };
}

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("createService", () => {
  it("dispatches inbound text from the poller callback", async () => {
    const api = createMockApi();
    const callbackHolder: { callbacks?: FldigiPollerCallbacks } = {};
    let started = false;
    let stopped = false;
    const dupeStore = {
      initialize: () => {},
      loadExisting: () => {},
      isDupe: () => false,
    };
    const memoryStore = {
      initialize: () => {},
      addRecord: () => {},
      getByCallsign: () => [],
      getKnownCallsigns: () => [],
    };

    const service = createService(api, {
      createPoller: (_config: ChannelConfig, cb: FldigiPollerCallbacks) => {
        callbackHolder.callbacks = cb;
        return {
          async start() { started = true; },
          async stop() { stopped = true; },
        };
      },
      createDupeStore: () => dupeStore,
      createMemoryStore: () => memoryStore,
    });

    await service.start();
    callbackHolder.callbacks?.onMessage("CQ CQ DE PI4ABC", "PI4ABC", {
      timestamp: "2026-02-13T00:00:00.000Z",
      frequency: 7030000,
      detectedWpm: 20,
      snr: 18.5,
    });
    await flushAsync();

    assert.equal(api.dispatched.length, 1);
    assert.equal(api.dispatched[0].text, "CQ CQ DE PI4ABC");
    assert.equal(api.dispatched[0].peer, "PI4ABC");
    assert.equal(api.dispatched[0].channel, "morse-radio");
    assert.equal(api.dispatched[0].metadata?.detectedWpm, 20);
    assert.equal(api.dispatched[0].metadata?.snr, 18.5);
    assert.equal(api.dispatched[0].metadata?.decodeConfidence, "high");

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
      createDupeStore: () => ({
        initialize: () => {},
        loadExisting: () => {},
        isDupe: () => false,
      }),
      createMemoryStore: () => ({
        initialize: () => {},
        addRecord: () => {},
        getByCallsign: () => [],
        getKnownCallsigns: () => [],
      }),
    });

    await service.start();
    await service.stop();

    assert.equal(startCalls, 0);
  });

  it("flags dupes and low-confidence visually and includes previous contacts", async () => {
    const api = createMockApi();
    const callbackHolder: { callbacks?: FldigiPollerCallbacks } = {};
    const memoryRecords = [{
      callsign: "PI4ABC",
      timestamp: "2026-02-12T10:00:00.000Z",
      frequency: 7030000,
      band: "40m",
      rstRcvd: "579",
      name: "HANS",
      qth: "MUNICH",
      remarks: "LAST QSO",
      note: "old",
    }];

    const service = createService(api, {
      createPoller: (_config: ChannelConfig, cb: FldigiPollerCallbacks) => {
        callbackHolder.callbacks = cb;
        return { async start() {}, async stop() {} };
      },
      createDupeStore: () => ({
        initialize: () => {},
        loadExisting: () => {},
        isDupe: () => true,
      }),
      createMemoryStore: () => ({
        initialize: () => {},
        addRecord: () => {},
        getByCallsign: () => memoryRecords,
        getKnownCallsigns: () => memoryRecords.map((r) => r.callsign),
      }),
      extractFields: (): ExtractedQsoFields => ({
        callsign: { value: "PI4ABC", confidence: "low" },
      }),
    });

    await service.start();
    callbackHolder.callbacks?.onMessage("CQ CQ ???", "UNKNOWN", {
      timestamp: "2026-02-13T00:00:00.000Z",
      frequency: 7030000,
    });
    await flushAsync();

    assert.equal(api.dispatched.length, 1);
    assert.ok(api.dispatched[0].text.startsWith("[DUPE] [LOW-CONFIDENCE]"));
    assert.equal(api.dispatched[0].peer, "PI4ABC");
    assert.equal(api.dispatched[0].metadata?.dupe, true);
    assert.equal((api.dispatched[0].metadata?.previousContacts as unknown[]).length, 1);
    assert.deepEqual(api.dispatched[0].metadata?.lowConfidenceFields, []);
    assert.equal((api.dispatched[0].metadata?.previousQsoContext as Record<string, unknown>).lastName, "HANS");
  });

  it("applies fuzzy callsign matching from known memory calls", async () => {
    const api = createMockApi();
    const callbackHolder: { callbacks?: FldigiPollerCallbacks } = {};
    const known = ["PI4ABC", "DL2ABC"];

    const service = createService(api, {
      createPoller: (_config: ChannelConfig, cb: FldigiPollerCallbacks) => {
        callbackHolder.callbacks = cb;
        return { async start() {}, async stop() {} };
      },
      createDupeStore: () => ({
        initialize: () => {},
        loadExisting: () => {},
        isDupe: () => false,
      }),
      createMemoryStore: () => ({
        initialize: () => {},
        addRecord: () => {},
        getByCallsign: () => [],
        getKnownCallsigns: () => known,
      }),
      extractFields: (): ExtractedQsoFields => ({
        callsign: { value: "PI4AB?", confidence: "low" },
      }),
    });

    await service.start();
    callbackHolder.callbacks?.onMessage("PI4AB? DE TEST", "UNKNOWN", { timestamp: "2026-02-13T00:00:00.000Z" });
    await flushAsync();

    assert.equal(api.dispatched.length, 1);
    assert.equal(api.dispatched[0].peer, "PI4ABC");
    assert.equal((api.dispatched[0].metadata?.qsoFields as Record<string, unknown>).callsign !== undefined, true);
  });

  it("enriches metadata with callsign lookup profile via injected provider", async () => {
    const api = createMockApi();
    const callbackHolder: { callbacks?: FldigiPollerCallbacks } = {};

    const service = createService(api, {
      createPoller: (_config: ChannelConfig, cb: FldigiPollerCallbacks) => {
        callbackHolder.callbacks = cb;
        return { async start() {}, async stop() {} };
      },
      createDupeStore: () => ({
        initialize: () => {},
        loadExisting: () => {},
        isDupe: () => false,
      }),
      createMemoryStore: () => ({
        initialize: () => {},
        addRecord: () => {},
        getByCallsign: () => [],
        getKnownCallsigns: () => [],
      }),
      extractFields: (): ExtractedQsoFields => ({
        callsign: { value: "PI4ABC", confidence: "high" },
      }),
      callsignLookup: {
        lookup: async () => ({
          callsign: "PI4ABC",
          source: "mock",
          fullName: "Hans Vermeer",
          qth: "Rotterdam",
          country: "Netherlands",
        }),
      },
    });

    await service.start();
    callbackHolder.callbacks?.onMessage("PI4ABC DE TEST", "PI4ABC", { timestamp: "2026-02-13T00:00:00.000Z" });
    await flushAsync();

    assert.equal(api.dispatched.length, 1);
    const profile = (api.dispatched[0].metadata?.callsignProfile as Record<string, unknown>);
    assert.equal(profile.source, "mock");
    assert.equal(profile.fullName, "Hans Vermeer");
  });
});
