import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CallsignLookupService,
  MockCallsignLookupProvider,
  createCallsignLookupService,
} from "../src/callsign-lookup.js";
import { resolveConfig } from "../src/config.js";

describe("CallsignLookupService", () => {
  it("returns data from mock provider for known callsign", async () => {
    const service = new CallsignLookupService({
      providers: [new MockCallsignLookupProvider()],
      cacheTtlMs: 60_000,
    });

    const result = await service.lookup("pi4abc");
    assert.equal(result?.callsign, "PI4ABC");
    assert.equal(result?.source, "mock");
    assert.equal(result?.country, "Netherlands");
  });

  it("caches lookup results within TTL", async () => {
    let calls = 0;
    const service = new CallsignLookupService({
      cacheTtlMs: 60_000,
      providers: [
        {
          id: "probe",
          lookup: async () => {
            calls += 1;
            return { callsign: "W1AW", source: "probe", qth: "Newington" };
          },
        },
      ],
    });

    const a = await service.lookup("W1AW");
    const b = await service.lookup("W1AW");
    assert.equal(a?.source, "probe");
    assert.equal(b?.source, "probe");
    assert.equal(calls, 1);
  });

  it("falls back to next provider when first provider fails", async () => {
    const service = new CallsignLookupService({
      cacheTtlMs: 60_000,
      providers: [
        {
          id: "broken",
          lookup: async () => {
            throw new Error("boom");
          },
        },
        new MockCallsignLookupProvider(),
      ],
    });

    const result = await service.lookup("W1AW");
    assert.equal(result?.source, "mock");
  });
});

describe("createCallsignLookupService", () => {
  it("creates mock-first service by default", async () => {
    const config = resolveConfig({});
    const service = createCallsignLookupService(config);
    const profile = await service.lookup("PA3XYZ");
    assert.equal(profile?.source, "mock");
  });
});
