import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { FldigiClient, XmlRpcError } from "../src/fldigi-client.js";

/**
 * Spin up a tiny HTTP server that simulates fldigi's XML-RPC responses.
 * Returns a handler-setter so each test can define its own response logic.
 */
function createMockFldigi(): {
  server: http.Server;
  port: number;
  setHandler: (fn: (body: string) => string) => void;
  start: () => Promise<number>;
  stop: () => Promise<void>;
} {
  let handler: (body: string) => string = () => "";

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf-8");
      const responseXml = handler(body);
      res.writeHead(200, { "Content-Type": "text/xml" });
      res.end(responseXml);
    });
  });

  return {
    server,
    port: 0,
    setHandler: (fn) => { handler = fn; },
    start: () =>
      new Promise<number>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          const addr = server.address();
          const port = typeof addr === "object" && addr ? addr.port : 0;
          resolve(port);
        });
      }),
    stop: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

function wrapResponse(value: string, type = "string"): string {
  return `<?xml version="1.0"?><methodResponse><params><param><value><${type}>${value}</${type}></value></param></params></methodResponse>`;
}

describe("FldigiClient", () => {
  const mock = createMockFldigi();
  let port = 0;

  // Start mock server before tests, stop after
  // Using a simpler pattern: start in each test that needs it.

  afterEach(async () => {
    if (mock.server.listening) {
      await mock.stop();
    }
  });

  it("getVersion returns the fldigi version string", async () => {
    mock.setHandler(() => wrapResponse("4.2.05"));
    port = await mock.start();
    const client = new FldigiClient({ host: "127.0.0.1", port });

    const version = await client.getVersion();
    assert.equal(version, "4.2.05");
  });

  it("connect succeeds when fldigi is reachable", async () => {
    mock.setHandler(() => wrapResponse("4.2.05"));
    port = await mock.start();
    const client = new FldigiClient({ host: "127.0.0.1", port });

    await assert.doesNotReject(() => client.connect());
  });

  it("connect throws when fldigi is unreachable", async () => {
    const client = new FldigiClient({ host: "127.0.0.1", port: 19999, timeoutMs: 500 });
    await assert.rejects(() => client.connect(), XmlRpcError);
  });

  it("getRxLength returns the buffer length as a number", async () => {
    mock.setHandler(() => wrapResponse("42", "int"));
    port = await mock.start();
    const client = new FldigiClient({ host: "127.0.0.1", port });

    const len = await client.getRxLength();
    assert.equal(len, 42);
  });

  it("getRxText returns decoded text from the RX buffer", async () => {
    mock.setHandler(() => wrapResponse("CQ CQ DE PA3XYZ K"));
    port = await mock.start();
    const client = new FldigiClient({ host: "127.0.0.1", port });

    const text = await client.getRxText(0, 100);
    assert.equal(text, "CQ CQ DE PA3XYZ K");
  });

  it("getFrequency returns frequency as a number", async () => {
    mock.setHandler(() => wrapResponse("7030000.0", "double"));
    port = await mock.start();
    const client = new FldigiClient({ host: "127.0.0.1", port });

    const freq = await client.getFrequency();
    assert.equal(freq, 7030000.0);
  });

  it("getMode returns the mode name", async () => {
    mock.setHandler(() => wrapResponse("CW"));
    port = await mock.start();
    const client = new FldigiClient({ host: "127.0.0.1", port });

    const mode = await client.getMode();
    assert.equal(mode, "CW");
  });

  it("getWpm returns speed as a number", async () => {
    mock.setHandler(() => wrapResponse("20", "int"));
    port = await mock.start();
    const client = new FldigiClient({ host: "127.0.0.1", port });

    const wpm = await client.getWpm();
    assert.equal(wpm, 20);
  });

  it("propagates XML-RPC faults as XmlRpcError", async () => {
    mock.setHandler(
      () =>
        `<?xml version="1.0"?><methodResponse><fault><value><struct>` +
        `<member><name>faultCode</name><value><int>-1</int></value></member>` +
        `<member><name>faultString</name><value><string>No such method</string></value></member>` +
        `</struct></value></fault></methodResponse>`
    );
    port = await mock.start();
    const client = new FldigiClient({ host: "127.0.0.1", port });

    await assert.rejects(() => client.getVersion(), XmlRpcError);
  });

  it("sends correct method name in the request", async () => {
    let receivedBody = "";
    mock.setHandler((body) => {
      receivedBody = body;
      return wrapResponse("ok");
    });
    port = await mock.start();
    const client = new FldigiClient({ host: "127.0.0.1", port });

    await client.getMode();
    assert.ok(receivedBody.includes("<methodName>modem.get_name</methodName>"));
  });
});
