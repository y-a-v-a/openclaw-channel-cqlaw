/**
 * Integration tests using a mock XML-RPC server to exercise the full
 * fldigi polling pipeline: connection, text streaming, reconnection,
 * timeout handling, and edge cases.
 *
 * Covers TASKS.md 6.7.1–6.7.6.
 */

import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { FldigiPoller, type ChannelStatus } from "../src/fldigi-poller.js";
import { resolveConfig, type ChannelConfig } from "../src/config.js";
import { createMockFldigi, type MockFldigi } from "./mock-fldigi.js";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface CapturedMessage {
  text: string;
  peer: string;
  metadata: Record<string, unknown>;
}

/** Set up a poller connected to a mock fldigi, ready for testing */
async function setupPollerWithMock(
  mock: MockFldigi,
  overrides?: Partial<{ pollingIntervalMs: number; timeoutMs: number }>
) {
  const port = await mock.start();
  const messages: CapturedMessage[] = [];
  const statuses: ChannelStatus[] = [];

  const config = resolveConfig({
    fldigi: {
      port,
      pollingIntervalMs: overrides?.pollingIntervalMs ?? 50,
    },
  });

  const poller = new FldigiPoller(config, {
    onMessage: (text, peer, metadata) =>
      messages.push({ text, peer, metadata }),
    onStatusChange: (s) => statuses.push(s),
  });

  return { poller, messages, statuses, config, port };
}

describe("Mock XML-RPC integration tests", () => {
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

  // --- 6.7.2: Normal flow ---

  describe("normal message flow", () => {
    it("dispatches a steady stream of decoded messages", async () => {
      mock = createMockFldigi();
      const { poller: p, messages } = await setupPollerWithMock(mock);
      poller = p;

      await poller.start();
      await wait(150);

      // Send three separate transmissions
      mock.addRxText("CQ CQ DE PA3XYZ K");
      await wait(200);

      mock.addRxText("PA3XYZ DE DL2ABC RST 599 K");
      await wait(200);

      mock.addRxText("DL2ABC DE PA3XYZ TU 73 SK");
      await wait(200);

      assert.equal(messages.length, 3);
      assert.equal(messages[0].text, "CQ CQ DE PA3XYZ K");
      assert.equal(messages[0].peer, "PA3XYZ");
      assert.equal(messages[1].text, "PA3XYZ DE DL2ABC RST 599 K");
      assert.equal(messages[1].peer, "DL2ABC");
      assert.equal(messages[2].text, "DL2ABC DE PA3XYZ TU 73 SK");
      assert.equal(messages[2].peer, "PA3XYZ");
    });

    it("includes signal metadata in dispatched messages", async () => {
      mock = createMockFldigi({ wpm: 22, snr: 15.5 });
      const { poller: p, messages } = await setupPollerWithMock(mock);
      poller = p;

      await poller.start();
      await wait(150);

      mock.addRxText("TEST K");
      await wait(200);

      assert.equal(messages.length, 1);
      assert.equal(messages[0].metadata.detectedWpm, 22);
      assert.equal(messages[0].metadata.snr, 15.5);
      assert.ok(messages[0].metadata.timestamp);
    });
  });

  // --- 6.7.3: Fldigi restart mid-QSO ---

  describe("fldigi restart recovery", () => {
    it("recovers when fldigi RX buffer resets mid-session", async () => {
      mock = createMockFldigi();
      const { poller: p, messages, statuses } = await setupPollerWithMock(mock);
      poller = p;

      await poller.start();
      await wait(150);

      // First message
      mock.addRxText("CQ CQ DE PA3XYZ K");
      await wait(200);
      assert.equal(messages.length, 1);

      // Simulate fldigi restart — buffer resets to empty
      mock.resetRxBuffer();
      await wait(200);

      // New text after restart
      mock.addRxText("CQ CQ DE DL2ABC K");
      await wait(200);

      assert.equal(messages.length, 2);
      assert.equal(messages[1].text, "CQ CQ DE DL2ABC K");
      assert.equal(messages[1].peer, "DL2ABC");
    });

    it("reconnects after fldigi becomes unreachable then returns", async () => {
      mock = createMockFldigi();
      const { poller: p, messages, statuses } = await setupPollerWithMock(mock);
      poller = p;

      await poller.start();
      await wait(150);
      assert.ok(statuses.includes("connected"));

      // Simulate fldigi crash — reject all connections
      mock.setRejectAll(true);
      await wait(400);

      assert.ok(
        statuses.includes("reconnecting"),
        "should enter reconnecting state after fldigi becomes unreachable"
      );

      // Simulate fldigi coming back
      mock.setRejectAll(false);
      mock.resetRxBuffer();
      await wait(2000);

      // Verify it reconnected
      const reconnected = statuses.filter((s) => s === "connected").length >= 2;
      assert.ok(reconnected, "should reconnect after fldigi returns");

      // Verify it can still receive messages
      mock.addRxText("BACK ONLINE K");
      await wait(200);

      assert.ok(
        messages.some((m) => m.text.includes("BACK ONLINE")),
        "should dispatch messages after reconnection"
      );
    });
  });

  // --- 6.7.4: XML-RPC timeout ---

  describe("XML-RPC timeout handling", () => {
    it("handles slow responses without crashing", async () => {
      mock = createMockFldigi({ responseDelayMs: 100 });
      const { poller: p, messages, statuses } = await setupPollerWithMock(mock, {
        pollingIntervalMs: 50,
      });
      poller = p;

      await poller.start();
      await wait(500);

      // Slow but not timing out — should still connect
      assert.ok(statuses.includes("connected"));

      mock.addRxText("SLOW BUT OK K");
      await wait(500);

      assert.ok(
        messages.some((m) => m.text.includes("SLOW BUT OK")),
        "should still deliver messages despite slow responses"
      );
    });

    it("enters reconnecting state on request timeout", async () => {
      mock = createMockFldigi();
      const { poller: p, statuses } = await setupPollerWithMock(mock);
      poller = p;

      await poller.start();
      await wait(150);
      assert.ok(statuses.includes("connected"), "should initially connect");

      // Make responses slower than the 5s XML-RPC timeout
      mock.setResponseDelay(6000);

      // Wait for the timeout to fire (5s + margin)
      await wait(6000);

      assert.ok(
        statuses.includes("reconnecting"),
        "should enter reconnecting state after XML-RPC timeout"
      );
    });
  });

  // --- 6.7.5: Empty buffer for extended periods ---

  describe("empty buffer handling", () => {
    it("continues polling without spurious dispatches during silence", async () => {
      mock = createMockFldigi();
      const { poller: p, messages, statuses } = await setupPollerWithMock(mock);
      poller = p;

      await poller.start();
      await wait(150);
      assert.ok(statuses.includes("connected"));

      // Wait with no RX text — should not produce any messages
      await wait(500);
      assert.equal(messages.length, 0, "no messages should be dispatched during silence");

      // Verify polling is still active by checking call count
      const callsBefore = mock.getCallCount();
      await wait(200);
      const callsAfter = mock.getCallCount();
      assert.ok(
        callsAfter > callsBefore,
        "polling should continue during silence"
      );
    });

    it("dispatches correctly after a long silent period", async () => {
      mock = createMockFldigi();
      const { poller: p, messages } = await setupPollerWithMock(mock);
      poller = p;

      await poller.start();
      await wait(150);

      // Long silence
      await wait(500);
      assert.equal(messages.length, 0);

      // Then a message arrives
      mock.addRxText("CQ CQ DE W1AW K");
      await wait(200);

      assert.equal(messages.length, 1);
      assert.equal(messages[0].text, "CQ CQ DE W1AW K");
    });
  });

  // --- 6.7.6: Burst of rapid text ---

  describe("rapid text burst handling", () => {
    it("handles a fast contest exchange arriving in one poll", async () => {
      mock = createMockFldigi();
      const { poller: p, messages } = await setupPollerWithMock(mock);
      poller = p;

      await poller.start();
      await wait(150);

      // Entire fast contest exchange arrives between two polls
      mock.addRxText("DL2ABC 5NN 14 K");
      await wait(200);

      assert.equal(messages.length, 1);
      assert.equal(messages[0].text, "DL2ABC 5NN 14 K");
    });

    it("handles multiple messages arriving in rapid succession", async () => {
      mock = createMockFldigi();
      const { poller: p, messages } = await setupPollerWithMock(mock);
      poller = p;

      await poller.start();
      await wait(150);

      // Two complete messages arrive back-to-back (both prosign-terminated)
      mock.addRxText("CQ CQ DE PA3XYZ K");

      // Wait just long enough for one poll cycle to pick it up
      await wait(100);

      mock.addRxText("PA3XYZ DE DL2ABC K");
      await wait(200);

      assert.equal(messages.length, 2);
      assert.equal(messages[0].text, "CQ CQ DE PA3XYZ K");
      assert.equal(messages[1].text, "PA3XYZ DE DL2ABC K");
    });

    it("buffers partial text and flushes on prosign", async () => {
      mock = createMockFldigi();
      const { poller: p, messages } = await setupPollerWithMock(mock);
      poller = p;

      await poller.start();
      await wait(150);

      // Text arrives in small bursts across multiple polls
      mock.addRxText("CQ ");
      await wait(80);
      mock.addRxText("CQ ");
      await wait(80);
      mock.addRxText("CQ ");
      await wait(80);
      mock.addRxText("DE ");
      await wait(80);
      mock.addRxText("PA3XYZ ");
      await wait(80);
      mock.addRxText("PA3XYZ ");
      await wait(80);
      mock.addRxText("K");
      await wait(200);

      assert.equal(messages.length, 1);
      assert.equal(messages[0].text, "CQ CQ CQ DE PA3XYZ PA3XYZ K");
      assert.equal(messages[0].peer, "PA3XYZ");
    });
  });
});
