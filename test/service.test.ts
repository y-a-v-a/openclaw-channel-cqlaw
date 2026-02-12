import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { createService } from "../src/service.js";
import { resolveConfig } from "../src/config.js";
import type { OpenClawApi, InboundMessage } from "../src/openclaw-api.js";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createMockApi(): OpenClawApi & { dispatched: InboundMessage[] } {
  const dispatched: InboundMessage[] = [];
  return {
    dispatched,
    registerChannel: () => {},
    registerService: () => {},
    dispatchInbound: (msg: InboundMessage) => { dispatched.push(msg); },
  };
}

/**
 * Mock fldigi XML-RPC server that simulates a growing RX buffer.
 */
function createMockFldigi() {
  let rxBuffer = "";

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
        response = wrapString("4.2.05");
      } else if (body.includes("text.get_rx_length")) {
        response = wrapInt(rxBuffer.length);
      } else if (body.includes("text.get_rx")) {
        const startMatch = body.match(/<param><value><int>(\d+)<\/int><\/value><\/param>/);
        const start = startMatch ? parseInt(startMatch[1], 10) : 0;
        response = wrapString(rxBuffer.slice(start));
      } else if (body.includes("modem.get_wpm")) {
        response = wrapInt(22);
      } else if (body.includes("modem.get_quality")) {
        response = wrapString("15.5");
      } else {
        response = wrapString("");
      }

      res.writeHead(200, { "Content-Type": "text/xml" });
      res.end(response);
    });
  });

  return {
    server,
    addRxText: (text: string) => { rxBuffer += text; },
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

describe("createService", () => {
  let mock: ReturnType<typeof createMockFldigi>;
  let service: ReturnType<typeof createService> | null = null;

  afterEach(async () => {
    if (service) {
      await service.stop();
      service = null;
    }
    if (mock?.server.listening) {
      await mock.stop();
    }
  });

  it("dispatches decoded CW text to the gateway via dispatchInbound", async () => {
    mock = createMockFldigi();
    const port = await mock.start();
    const api = createMockApi();
    const config = resolveConfig({ fldigi: { port, pollingIntervalMs: 50 } });

    service = createService(api, config);
    await service.start();
    await wait(150);

    mock.addRxText("CQ CQ DE PA3XYZ K");
    await wait(300);

    assert.equal(api.dispatched.length, 1);
    assert.equal(api.dispatched[0].text, "CQ CQ DE PA3XYZ K");
    assert.equal(api.dispatched[0].channel, "morse-radio");
  });

  it("tags the peer with the extracted callsign", async () => {
    mock = createMockFldigi();
    const port = await mock.start();
    const api = createMockApi();
    const config = resolveConfig({ fldigi: { port, pollingIntervalMs: 50 } });

    service = createService(api, config);
    await service.start();
    await wait(150);

    mock.addRxText("PA3XYZ DE DL2ABC K");
    await wait(300);

    assert.equal(api.dispatched.length, 1);
    assert.equal(api.dispatched[0].peer, "DL2ABC");
  });

  it("includes metadata with dispatched messages", async () => {
    mock = createMockFldigi();
    const port = await mock.start();
    const api = createMockApi();
    const config = resolveConfig({
      frequency: 7030000,
      fldigi: { port, pollingIntervalMs: 50 },
    });

    service = createService(api, config);
    await service.start();
    await wait(150);

    mock.addRxText("CQ CQ DE PA3XYZ K");
    await wait(300);

    assert.equal(api.dispatched.length, 1);
    const meta = api.dispatched[0].metadata!;
    assert.equal(meta.frequency, 7030000);
    assert.equal(meta.wpm, 22);
    assert.equal(meta.snr, 15.5);
    assert.equal(typeof meta.timestamp, "string");
  });

  it("stops cleanly without dispatching after stop", async () => {
    mock = createMockFldigi();
    const port = await mock.start();
    const api = createMockApi();
    const config = resolveConfig({ fldigi: { port, pollingIntervalMs: 50 } });

    service = createService(api, config);
    await service.start();
    await wait(150);
    await service.stop();
    service = null;

    mock.addRxText("CQ CQ DE PA3XYZ K");
    await wait(300);

    assert.equal(api.dispatched.length, 0);
  });
});
