import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { FldigiPoller, type ChannelStatus } from "../src/fldigi-poller.js";
import { resolveConfig } from "../src/config.js";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mock fldigi XML-RPC server that simulates a growing RX buffer.
 */
function createMockFldigi() {
  let rxBuffer = "";
  let callCount = 0;

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
      callCount++;
      const body = Buffer.concat(chunks).toString("utf-8");
      let response: string;

      if (body.includes("fldigi.version")) {
        response = wrapString("4.2.05");
      } else if (body.includes("text.get_rx_length")) {
        response = wrapInt(rxBuffer.length);
      } else if (body.includes("text.get_rx")) {
        // Parse start and length from params
        const startMatch = body.match(/<param><value><int>(\d+)<\/int><\/value><\/param>/);
        const start = startMatch ? parseInt(startMatch[1], 10) : 0;
        // Return text from start position
        response = wrapString(rxBuffer.slice(start));
      } else if (body.includes("modem.get_name")) {
        response = wrapString("CW");
      } else if (body.includes("modem.get_quality")) {
        response = wrapString("20.0");
      } else if (body.includes("modem.get_wpm")) {
        response = wrapInt(20);
      } else {
        response = wrapString("");
      }

      res.writeHead(200, { "Content-Type": "text/xml" });
      res.end(response);
    });
  });

  return {
    server,
    /** Append text to the simulated RX buffer (as if fldigi decoded it) */
    addRxText: (text: string) => { rxBuffer += text; },
    resetRxBuffer: () => { rxBuffer = ""; },
    getCallCount: () => callCount,
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

describe("FldigiPoller", () => {
  let mock: ReturnType<typeof createMockFldigi>;
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
    await wait(150); // Let it connect and do initial poll

    // Simulate fldigi decoding a CQ call
    mock.addRxText("CQ CQ DE PA3XYZ K");

    // Wait for poll + flush
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

    // Feed text in chunks without a prosign — won't flush until silence
    mock.addRxText("CQ CQ ");
    await wait(100);
    mock.addRxText("DE PA3XYZ");
    await wait(100);
    mock.addRxText(" K"); // prosign triggers flush

    await wait(200);

    assert.equal(messages.length, 1);
    assert.equal(messages[0].text, "CQ CQ DE PA3XYZ K");
  });
});
