import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { FldigiPoller, type ChannelStatus } from "../src/fldigi-poller.js";
import { resolveConfig } from "../src/config.js";
import { createMockFldigi, type MockFldigi } from "./mock-fldigi.js";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("FldigiPoller", () => {
  let mock: MockFldigi;
  let poller: FldigiPoller | null = null;

  afterEach(async () => {
    if (poller) {
      await poller.stop();
      poller = null;
    }
    if (mock?.server.listening) {
      await mock.stop();
    }
  });

  it("connects to fldigi and starts polling", async () => {
    mock = createMockFldigi();
    const port = await mock.start();
    const statuses: ChannelStatus[] = [];
    const messages: Array<{ text: string; peer: string }> = [];

    const config = resolveConfig({ fldigi: { port, pollingIntervalMs: 50 } });
    poller = new FldigiPoller(config, {
      onMessage: (text, peer) => messages.push({ text, peer }),
      onStatusChange: (s) => statuses.push(s),
    });

    await poller.start();
    await wait(100);

    assert.ok(statuses.includes("connected"));
  });

  it("dispatches messages when RX text arrives and ends with prosign", async () => {
    mock = createMockFldigi();
    const port = await mock.start();
    const messages: Array<{ text: string; peer: string; metadata: Record<string, unknown> }> = [];

    const config = resolveConfig({ fldigi: { port, pollingIntervalMs: 50 } });
    poller = new FldigiPoller(config, {
      onMessage: (text, peer, metadata) => messages.push({ text, peer, metadata }),
      onStatusChange: () => {},
    });

    await poller.start();
    await wait(150);

    mock.addRxText("CQ CQ DE PA3XYZ K");
    await wait(200);

    assert.equal(messages.length, 1);
    assert.equal(messages[0].text, "CQ CQ DE PA3XYZ K");
    assert.equal(messages[0].peer, "PA3XYZ");
    assert.equal(messages[0].metadata.detectedWpm, 20);
    assert.equal(messages[0].metadata.snr, 20);
  });

  it("extracts peer from directed exchange", async () => {
    mock = createMockFldigi();
    const port = await mock.start();
    const messages: Array<{ text: string; peer: string }> = [];

    const config = resolveConfig({ fldigi: { port, pollingIntervalMs: 50 } });
    poller = new FldigiPoller(config, {
      onMessage: (text, peer) => messages.push({ text, peer }),
      onStatusChange: () => {},
    });

    await poller.start();
    await wait(150);

    mock.addRxText("PA3XYZ DE DL2ABC K");
    await wait(200);

    assert.equal(messages.length, 1);
    assert.equal(messages[0].peer, "DL2ABC");
  });

  it("enters reconnecting state when fldigi is unreachable", async () => {
    const statuses: ChannelStatus[] = [];

    const config = resolveConfig({ fldigi: { port: 19876, pollingIntervalMs: 50 } });
    poller = new FldigiPoller(config, {
      onMessage: () => {},
      onStatusChange: (s) => statuses.push(s),
    });

    await poller.start();
    await wait(300);

    assert.ok(statuses.includes("reconnecting"));
  });

  it("accumulates text across multiple polls before flushing", async () => {
    mock = createMockFldigi();
    const port = await mock.start();
    const messages: Array<{ text: string; peer: string }> = [];

    const config = resolveConfig({ fldigi: { port, pollingIntervalMs: 50 } });
    poller = new FldigiPoller(config, {
      onMessage: (text, peer) => messages.push({ text, peer }),
      onStatusChange: () => {},
    });

    await poller.start();
    await wait(150);

    mock.addRxText("CQ CQ ");
    await wait(100);
    mock.addRxText("DE PA3XYZ");
    await wait(100);
    mock.addRxText(" K");

    await wait(200);

    assert.equal(messages.length, 1);
    assert.equal(messages[0].text, "CQ CQ DE PA3XYZ K");
  });
});
