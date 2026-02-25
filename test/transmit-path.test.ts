import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { FldigiClient } from "../src/fldigi-client.js";
import { createSendTextHandler } from "../src/outbound.js";
import { resolveConfig } from "../src/config.js";
import { Transmitter } from "../src/transmitter.js";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createTxMockFldigi() {
  let txData = "";
  let rxLength = 0;
  let txLength = 0;
  let wpmSet: number | null = null;
  const methodsCalled: string[] = [];

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
      const methodMatch = body.match(/<methodName>([^<]+)<\/methodName>/);
      const method = methodMatch ? methodMatch[1] : "unknown";
      methodsCalled.push(method);

      let response = wrapString("");
      if (method === "fldigi.version") {
        response = wrapString("4.2.05");
      } else if (method === "text.add_tx") {
        const match = body.match(/<string>(.*?)<\/string>/);
        const value = match ? match[1] : "";
        txData = value;
        txLength = value.length > 0 ? txLength || value.length : 0;
      } else if (method === "main.get_tx_data" || method === "text.get_tx") {
        response = wrapString(txData);
      } else if (method === "text.get_rx_length") {
        response = wrapInt(rxLength);
      } else if (method === "text.get_tx_length") {
        response = wrapInt(txLength);
      } else if (method === "modem.set_wpm") {
        const match = body.match(/<int>(\d+)<\/int>/);
        if (match) wpmSet = parseInt(match[1], 10);
      }

      res.writeHead(200, { "Content-Type": "text/xml" });
      res.end(response);
    });
  });

  return {
    server,
    getTxData: () => txData,
    getMethodsCalled: () => [...methodsCalled],
    getWpmSet: () => wpmSet,
    setRxLength: (value: number) => { rxLength = value; },
    setTxLength: (value: number) => { txLength = value; },
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

describe("Transmit path integration (outbound -> transmitter -> fldigi XML-RPC)", () => {
  let mock: ReturnType<typeof createTxMockFldigi>;

  afterEach(async () => {
    if (mock?.server.listening) {
      await mock.stop();
    }
  });

  it("feeds outbound.sendText and captures transmitted data via getTxData", async () => {
    mock = createTxMockFldigi();
    const port = await mock.start();
    const config = resolveConfig({
      fldigi: { port },
      tx: { enabled: true, callsign: "PA3XYZ", wpm: 20, pttMethod: "none" },
    });
    const client = new FldigiClient({ host: "127.0.0.1", port });
    const tx = new Transmitter(client, config, { onTransmitLog: () => {}, onLegalId: () => {} });
    (tx as any).listenStartTime = Date.now() - 15_000;
    const sendText = createSendTextHandler(tx, () => 22);

    const result = await sendText({
      channel: "morse-radio",
      peer: "DL2ABC",
      text: "tnx fer qso 73",
      metadata: { txIntent: "reply" },
    });

    assert.equal(result.success, true);
    const txData = await client.getTxData();
    assert.ok(txData.includes("DL2ABC DE PA3XYZ"));
    assert.ok(txData.includes("TNX FER QSO 73"));
    assert.ok(txData.endsWith("KN") || txData.endsWith("DE PA3XYZ KN"));
  });

  it("matches TX WPM to detected RX WPM and keeps keying in test buffer only", async () => {
    mock = createTxMockFldigi();
    const port = await mock.start();
    const config = resolveConfig({
      fldigi: { port },
      tx: { enabled: true, callsign: "PA3XYZ", pttMethod: "none", wpm: 18 },
    });
    const client = new FldigiClient({ host: "127.0.0.1", port });
    const tx = new Transmitter(client, config, { onTransmitLog: () => {}, onLegalId: () => {} });
    (tx as any).listenStartTime = Date.now() - 15_000;
    const sendText = createSendTextHandler(tx, () => 23);

    const result = await sendText({
      channel: "morse-radio",
      peer: "W1AW",
      text: "TEST",
      metadata: { txIntent: "default" },
    });
    assert.equal(result.success, true);
    assert.equal(mock.getWpmSet(), 22);

    const called = mock.getMethodsCalled();
    assert.ok(called.includes("main.tx"));
    assert.ok(!called.some((m) => m.startsWith("rig.") || m.includes("ptt")));
  });

  it("enforces safety guards (inhibit + max-duration abort + legal ID)", async () => {
    mock = createTxMockFldigi();
    const port = await mock.start();

    // Inhibit guard
    const inhibitedConfig = resolveConfig({
      fldigi: { port },
      tx: { enabled: true, callsign: "PA3XYZ", inhibit: true, pttMethod: "none" },
    });
    const inhibitedClient = new FldigiClient({ host: "127.0.0.1", port });
    const inhibitedTx = new Transmitter(inhibitedClient, inhibitedConfig, { onTransmitLog: () => {}, onLegalId: () => {} });
    (inhibitedTx as any).listenStartTime = Date.now() - 15_000;
    const inhibitedSend = createSendTextHandler(inhibitedTx);
    const inhibitedResult = await inhibitedSend({
      channel: "morse-radio",
      peer: "DL2ABC",
      text: "TEST",
    });
    assert.equal(inhibitedResult.success, false);

    // Max duration + legal ID on first transmission
    const config = resolveConfig({
      fldigi: { port },
      tx: { enabled: true, callsign: "PA3XYZ", maxDurationSeconds: 1, pttMethod: "none", wpm: 20 },
    });
    const client = new FldigiClient({ host: "127.0.0.1", port });
    const tx = new Transmitter(client, config, { onTransmitLog: () => {}, onLegalId: () => {} });
    (tx as any).listenStartTime = Date.now() - 15_000;
    mock.setTxLength(20); // Keep TX "active" so duration watchdog can fire.

    const sendText = createSendTextHandler(tx);
    const result = await sendText({
      channel: "morse-radio",
      peer: "DL2ABC",
      text: "TNX 73",
      metadata: { txIntent: "signoff" },
    });
    assert.equal(result.success, true);

    const txData = await client.getTxData();
    assert.ok(txData.includes("DE PA3XYZ"));

    await wait(1_200);
    assert.ok(mock.getMethodsCalled().includes("main.abort"));
  });
});
