import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { Transmitter, type TransmitLog } from "../src/transmitter.js";
import { FldigiClient } from "../src/fldigi-client.js";
import { resolveConfig } from "../src/config.js";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mock fldigi server that records what was sent to it.
 */
function createMockFldigi() {
  const txBuffer: string[] = [];
  const methodsCalled: string[] = [];
  let wpmSet: number | null = null;
  let rxLength = 0;

  function wrapString(s: string): string {
    return `<?xml version="1.0"?><methodResponse><params><param><value><string>${s}</string></value></param></params></methodResponse>`;
  }
  function wrapInt(n: number): string {
    return `<?xml version="1.0"?><methodResponse><params><param><value><int>${n}</int></value></param></params></methodResponse>`;
  }

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf-8");
      let response: string;

      if (body.includes("fldigi.version")) {
        methodsCalled.push("fldigi.version");
        response = wrapString("4.2.05");
      } else if (body.includes("text.add_tx")) {
        methodsCalled.push("text.add_tx");
        // Extract the text param
        const match = body.match(/<string>(.*?)<\/string>/);
        if (match) txBuffer.push(match[1]);
        response = wrapString("");
      } else if (body.includes("main.tx")) {
        methodsCalled.push("main.tx");
        response = wrapString("");
      } else if (body.includes("main.rx")) {
        methodsCalled.push("main.rx");
        response = wrapString("");
      } else if (body.includes("main.abort")) {
        methodsCalled.push("main.abort");
        response = wrapString("");
      } else if (body.includes("modem.set_wpm")) {
        methodsCalled.push("modem.set_wpm");
        const match = body.match(/<int>(\d+)<\/int>/);
        if (match) wpmSet = parseInt(match[1], 10);
        response = wrapString("");
      } else if (body.includes("text.get_rx_length")) {
        methodsCalled.push("text.get_rx_length");
        response = wrapInt(rxLength);
      } else if (body.includes("text.get_tx_length")) {
        methodsCalled.push("text.get_tx_length");
        response = wrapInt(0);
      } else {
        response = wrapString("");
      }

      res.writeHead(200, { "Content-Type": "text/xml" });
      res.end(response);
    });
  });

  return {
    server,
    getTxBuffer: () => txBuffer,
    getMethodsCalled: () => methodsCalled,
    getWpmSet: () => wpmSet,
    setRxLength: (n: number) => { rxLength = n; },
    start: (): Promise<number> =>
      new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          const addr = server.address();
          resolve(typeof addr === "object" && addr ? addr.port : 0);
        });
      }),
    stop: (): Promise<void> =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}

function createCallbacks() {
  const logs: TransmitLog[] = [];
  const ids: string[] = [];
  return {
    logs,
    ids,
    callbacks: {
      onTransmitLog: (log: TransmitLog) => logs.push(log),
      onLegalId: (callsign: string) => ids.push(callsign),
    },
  };
}

describe("Transmitter", () => {
  let mock: ReturnType<typeof createMockFldigi>;
  let tx: Transmitter | null = null;

  afterEach(async () => {
    tx?.destroy();
    tx = null;
    if (mock?.server.listening) {
      await mock.stop();
    }
  });

  it("refuses to transmit when TX is disabled", async () => {
    mock = createMockFldigi();
    const port = await mock.start();
    const config = resolveConfig({ fldigi: { port }, tx: { enabled: false } });
    const client = new FldigiClient({ host: "127.0.0.1", port });
    const { callbacks } = createCallbacks();

    tx = new Transmitter(client, config, callbacks);
    const result = await tx.send("CQ CQ DE PA3XYZ K");

    assert.equal(result.success, false);
    assert.ok(result.error?.includes("disabled"));
  });

  it("refuses to transmit when inhibited", async () => {
    mock = createMockFldigi();
    const port = await mock.start();
    const config = resolveConfig({ fldigi: { port }, tx: { enabled: true, callsign: "PA3XYZ", inhibit: true } });
    const client = new FldigiClient({ host: "127.0.0.1", port });
    const { callbacks } = createCallbacks();

    tx = new Transmitter(client, config, callbacks);
    const result = await tx.send("CQ CQ DE PA3XYZ K");

    assert.equal(result.success, false);
    assert.ok(result.error?.includes("inhibit"));
  });

  it("refuses to transmit without a callsign", async () => {
    mock = createMockFldigi();
    const port = await mock.start();
    const config = resolveConfig({ fldigi: { port }, tx: { enabled: true, callsign: "" } });
    const client = new FldigiClient({ host: "127.0.0.1", port });
    const { callbacks } = createCallbacks();

    tx = new Transmitter(client, config, callbacks);
    const result = await tx.send("CQ CQ K");

    assert.equal(result.success, false);
    assert.ok(result.error?.includes("callsign"));
  });

  it("refuses to transmit before listen-before-transmit period", async () => {
    mock = createMockFldigi();
    const port = await mock.start();
    const config = resolveConfig({ fldigi: { port }, tx: { enabled: true, callsign: "PA3XYZ" } });
    const client = new FldigiClient({ host: "127.0.0.1", port });
    const { callbacks } = createCallbacks();

    tx = new Transmitter(client, config, callbacks);
    // Mark listen start as NOW — not enough time has passed
    tx.markListenStart();
    const result = await tx.send("CQ CQ K");

    assert.equal(result.success, false);
    assert.ok(result.error?.includes("Listen-before-transmit"));
  });

  it("transmits successfully when all checks pass", async () => {
    mock = createMockFldigi();
    const port = await mock.start();
    const config = resolveConfig({ fldigi: { port }, tx: { enabled: true, callsign: "PA3XYZ", wpm: 20 } });
    const client = new FldigiClient({ host: "127.0.0.1", port });
    const { logs, callbacks } = createCallbacks();

    tx = new Transmitter(client, config, callbacks);
    // Backdate listen start so the guard passes
    (tx as any).listenStartTime = Date.now() - 15000;

    const result = await tx.send("CQ CQ DE PA3XYZ K");

    assert.equal(result.success, true);
    assert.ok(result.transmitted?.includes("CQ CQ DE PA3XYZ K"));
    assert.equal(logs.length, 1);
    assert.equal(logs[0].wpm, 20);
    assert.ok(mock.getTxBuffer().length > 0);
    assert.ok(mock.getMethodsCalled().includes("text.add_tx"));
    assert.ok(mock.getMethodsCalled().includes("main.tx"));
  });

  it("sanitizes text: uppercases and strips invalid chars", async () => {
    mock = createMockFldigi();
    const port = await mock.start();
    const config = resolveConfig({ fldigi: { port }, tx: { enabled: true, callsign: "PA3XYZ", wpm: 20 } });
    const client = new FldigiClient({ host: "127.0.0.1", port });
    const { callbacks } = createCallbacks();

    tx = new Transmitter(client, config, callbacks);
    (tx as any).listenStartTime = Date.now() - 15000;

    const result = await tx.send("hello™ world®");

    assert.equal(result.success, true);
    assert.ok(result.transmitted?.startsWith("HELLO WORLD"));
  });

  it("refuses empty text after sanitization", async () => {
    mock = createMockFldigi();
    const port = await mock.start();
    const config = resolveConfig({ fldigi: { port }, tx: { enabled: true, callsign: "PA3XYZ" } });
    const client = new FldigiClient({ host: "127.0.0.1", port });
    const { callbacks } = createCallbacks();

    tx = new Transmitter(client, config, callbacks);
    (tx as any).listenStartTime = Date.now() - 15000;

    const result = await tx.send("™®©");

    assert.equal(result.success, false);
    assert.ok(result.error?.includes("empty"));
  });

  it("matches TX WPM to detected RX WPM (rounds down to even)", async () => {
    mock = createMockFldigi();
    const port = await mock.start();
    const config = resolveConfig({ fldigi: { port }, tx: { enabled: true, callsign: "PA3XYZ", wpm: 20 } });
    const client = new FldigiClient({ host: "127.0.0.1", port });
    const { callbacks } = createCallbacks();

    tx = new Transmitter(client, config, callbacks);
    (tx as any).listenStartTime = Date.now() - 15000;

    await tx.send("TEST K", 23);

    // 23 WPM → rounds down to 22
    assert.equal(mock.getWpmSet(), 22);
  });

  it("uses default WPM when no RX WPM detected", async () => {
    mock = createMockFldigi();
    const port = await mock.start();
    const config = resolveConfig({ fldigi: { port }, tx: { enabled: true, callsign: "PA3XYZ", wpm: 18 } });
    const client = new FldigiClient({ host: "127.0.0.1", port });
    const { callbacks } = createCallbacks();

    tx = new Transmitter(client, config, callbacks);
    (tx as any).listenStartTime = Date.now() - 15000;

    await tx.send("TEST K");

    assert.equal(mock.getWpmSet(), 18);
  });

  it("appends legal ID (DE CALLSIGN) on first transmission", async () => {
    mock = createMockFldigi();
    const port = await mock.start();
    const config = resolveConfig({ fldigi: { port }, tx: { enabled: true, callsign: "PA3XYZ", wpm: 20 } });
    const client = new FldigiClient({ host: "127.0.0.1", port });
    const { ids, callbacks } = createCallbacks();

    tx = new Transmitter(client, config, callbacks);
    (tx as any).listenStartTime = Date.now() - 15000;

    const result = await tx.send("CQ CQ K");

    assert.ok(result.transmitted?.includes("DE PA3XYZ"));
    assert.equal(ids.length, 1);
    assert.equal(ids[0], "PA3XYZ");
  });

  it("enforces cooldown between transmissions", async () => {
    mock = createMockFldigi();
    const port = await mock.start();
    const config = resolveConfig({ fldigi: { port }, tx: { enabled: true, callsign: "PA3XYZ", wpm: 20 } });
    const client = new FldigiClient({ host: "127.0.0.1", port });
    const { callbacks } = createCallbacks();

    tx = new Transmitter(client, config, callbacks);
    (tx as any).listenStartTime = Date.now() - 15000;

    const first = await tx.send("FIRST K");
    assert.equal(first.success, true);

    // Immediately try again — should be blocked by cooldown
    const second = await tx.send("SECOND K");
    assert.equal(second.success, false);
    assert.ok(second.error?.includes("cooldown"));
  });

  it("emergencyStop sets inhibit and calls abort", async () => {
    mock = createMockFldigi();
    const port = await mock.start();
    const config = resolveConfig({ fldigi: { port }, tx: { enabled: true, callsign: "PA3XYZ", wpm: 20 } });
    const client = new FldigiClient({ host: "127.0.0.1", port });
    const { callbacks } = createCallbacks();

    tx = new Transmitter(client, config, callbacks);
    await tx.emergencyStop();

    // TX should now be inhibited
    (tx as any).listenStartTime = Date.now() - 15000;
    const result = await tx.send("TEST K");
    assert.equal(result.success, false);
    assert.ok(result.error?.includes("inhibit"));
    assert.ok(mock.getMethodsCalled().includes("main.abort"));
  });

  it("clearInhibit allows TX again after emergency stop", async () => {
    mock = createMockFldigi();
    const port = await mock.start();
    const config = resolveConfig({ fldigi: { port }, tx: { enabled: true, callsign: "PA3XYZ", wpm: 20 } });
    const client = new FldigiClient({ host: "127.0.0.1", port });
    const { callbacks } = createCallbacks();

    tx = new Transmitter(client, config, callbacks);
    (tx as any).listenStartTime = Date.now() - 15000;
    await tx.emergencyStop();
    tx.clearInhibit();

    const result = await tx.send("TEST K");
    assert.equal(result.success, true);
  });

  it("always returns to RX after QRL check", async () => {
    mock = createMockFldigi();
    const port = await mock.start();
    const config = resolveConfig({ fldigi: { port }, tx: { enabled: true, callsign: "PA3XYZ" } });
    const client = new FldigiClient({ host: "127.0.0.1", port });
    const { callbacks } = createCallbacks();

    tx = new Transmitter(client, config, callbacks);
    const clear = await tx.checkQrl();

    assert.equal(typeof clear, "boolean");
    assert.ok(mock.getMethodsCalled().includes("main.rx"));
  });

  it("serializes concurrent sends so cooldown is enforced", async () => {
    mock = createMockFldigi();
    const port = await mock.start();
    const config = resolveConfig({ fldigi: { port }, tx: { enabled: true, callsign: "PA3XYZ", wpm: 20 } });
    const client = new FldigiClient({ host: "127.0.0.1", port });
    const { callbacks } = createCallbacks();

    tx = new Transmitter(client, config, callbacks);
    (tx as any).listenStartTime = Date.now() - 15000;

    const [a, b] = await Promise.all([tx.send("FIRST K"), tx.send("SECOND K")]);
    const successes = [a.success, b.success].filter(Boolean).length;
    const failures = [a, b].filter((r) => !r.success);

    assert.equal(successes, 1);
    assert.equal(failures.length, 1);
    assert.ok(failures[0].error?.includes("cooldown"));
  });
});
