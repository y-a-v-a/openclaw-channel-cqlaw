import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateConfig, resolveConfig } from "../src/config.js";
import type { ChannelConfig } from "../src/config.js";

describe("resolveConfig", () => {
  it("returns full defaults when given empty partial", () => {
    const config = resolveConfig({});
    assert.equal(config.frequency, 7030000);
    assert.equal(config.mode, "CW");
    assert.equal(config.fldigi.host, "127.0.0.1");
    assert.equal(config.fldigi.port, 7362);
    assert.equal(config.fldigi.pollingIntervalMs, 250);
    assert.equal(config.sdr.enabled, false);
    assert.equal(config.tx.enabled, false);
    assert.equal(config.tx.wpm, 20);
    assert.equal(config.callsignLookup.enabled, true);
    assert.equal(config.callsignLookup.provider, "mock");
  });

  it("overrides specific fields while keeping defaults for the rest", () => {
    const config = resolveConfig({
      frequency: 14030000,
      fldigi: { port: 8000 },
    });
    assert.equal(config.frequency, 14030000);
    assert.equal(config.fldigi.port, 8000);
    assert.equal(config.fldigi.host, "127.0.0.1");
    assert.equal(config.mode, "CW");
  });

  it("loads sensitive fields from environment variables", () => {
    const config = resolveConfig({}, {
      CQLAW_TX_CALLSIGN: " pa3xyz ",
      CQLAW_QRZ_USERNAME: "demo-user",
      CQLAW_QRZ_PASSWORD: "secret-pass",
      CQLAW_CALLSIGN_LOOKUP_PROVIDER: "auto",
      CQLAW_CALLSIGN_LOOKUP_CACHE_TTL_SECONDS: "600",
    } as NodeJS.ProcessEnv);

    assert.equal(config.tx.callsign, "PA3XYZ");
    assert.equal(config.qrz.username, "demo-user");
    assert.equal(config.qrz.password, "secret-pass");
    assert.equal(config.callsignLookup.provider, "auto");
    assert.equal(config.callsignLookup.cacheTtlSeconds, 600);
  });
});

describe("validateConfig", () => {
  function validConfig(): ChannelConfig {
    return resolveConfig({});
  }

  it("returns no errors for a valid default config", () => {
    const errors = validateConfig(validConfig());
    assert.equal(errors.length, 0);
  });

  it("rejects zero frequency", () => {
    const config = { ...validConfig(), frequency: 0 };
    const errors = validateConfig(config);
    assert.ok(errors.some(e => e.field === "frequency"));
  });

  it("rejects negative frequency", () => {
    const config = { ...validConfig(), frequency: -100 };
    const errors = validateConfig(config);
    assert.ok(errors.some(e => e.field === "frequency"));
  });

  it("rejects empty mode", () => {
    const config = { ...validConfig(), mode: "" };
    const errors = validateConfig(config);
    assert.ok(errors.some(e => e.field === "mode"));
  });

  it("rejects invalid port", () => {
    const config = { ...validConfig(), fldigi: { ...validConfig().fldigi, port: 0 } };
    const errors = validateConfig(config);
    assert.ok(errors.some(e => e.field === "fldigi.port"));
  });

  it("rejects polling interval below 50ms", () => {
    const config = { ...validConfig(), fldigi: { ...validConfig().fldigi, pollingIntervalMs: 10 } };
    const errors = validateConfig(config);
    assert.ok(errors.some(e => e.field === "fldigi.pollingIntervalMs"));
  });

  it("requires callsign when TX is enabled", () => {
    const config = { ...validConfig(), tx: { ...validConfig().tx, enabled: true, callsign: "" } };
    const errors = validateConfig(config);
    assert.ok(errors.some(e => e.field === "tx.callsign"));
  });

  it("allows TX enabled with callsign set", () => {
    const config = { ...validConfig(), tx: { ...validConfig().tx, enabled: true, callsign: "PA3XYZ" } };
    const errors = validateConfig(config);
    assert.ok(!errors.some(e => e.field === "tx.callsign"));
  });

  it("rejects invalid callsign format", () => {
    const config = { ...validConfig(), tx: { ...validConfig().tx, enabled: true, callsign: "NOT_A_CALL" } };
    const errors = validateConfig(config);
    assert.ok(errors.some(e => e.field === "tx.callsign"));
  });

  it("normalizes callsign to uppercase in resolved config", () => {
    const config = resolveConfig({ tx: { callsign: " pa3xyz " } });
    assert.equal(config.tx.callsign, "PA3XYZ");
  });

  it("rejects WPM outside valid range", () => {
    const config = { ...validConfig(), tx: { ...validConfig().tx, wpm: 3 } };
    const errors = validateConfig(config);
    assert.ok(errors.some(e => e.field === "tx.wpm"));
  });

  it("requires QRZ password when QRZ username is set", () => {
    const config = { ...validConfig(), qrz: { username: "pa3xyz", password: "" } };
    const errors = validateConfig(config);
    assert.ok(errors.some(e => e.field === "qrz.password"));
  });

  it("requires QRZ username when QRZ password is set", () => {
    const config = { ...validConfig(), qrz: { username: "", password: "secret" } };
    const errors = validateConfig(config);
    assert.ok(errors.some(e => e.field === "qrz.username"));
  });

  it("rejects invalid callsign lookup cache TTL", () => {
    const config = { ...validConfig(), callsignLookup: { ...validConfig().callsignLookup, cacheTtlSeconds: 0 } };
    const errors = validateConfig(config);
    assert.ok(errors.some(e => e.field === "callsignLookup.cacheTtlSeconds"));
  });
});
