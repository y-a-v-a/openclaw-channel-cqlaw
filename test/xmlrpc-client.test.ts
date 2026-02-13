import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { XmlRpcClient, XmlRpcError } from "../src/xmlrpc.js";

function createServer(handler: (body: string) => { status?: number; payload: string }) {
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf-8");
      const result = handler(body);
      res.writeHead(result.status ?? 200, { "Content-Type": "text/xml" });
      res.end(result.payload);
    });
  });

  return {
    server,
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

function xmlStringResponse(value: string): string {
  return `<?xml version="1.0"?><methodResponse><params><param><value><string>${value}</string></value></param></params></methodResponse>`;
}

describe("XmlRpcClient transport hardening", () => {
  let closer: (() => Promise<void>) | null = null;

  afterEach(async () => {
    if (closer) {
      await closer();
      closer = null;
    }
  });

  it("rejects non-2xx responses", async () => {
    const mock = createServer(() => ({ status: 500, payload: "boom" }));
    const port = await mock.start();
    closer = mock.stop;
    const client = new XmlRpcClient({ host: "127.0.0.1", port, timeoutMs: 1000 });

    await assert.rejects(() => client.call("fldigi.version"), XmlRpcError);
  });

  it("rejects oversized response bodies", async () => {
    const big = "A".repeat(1_050_000);
    const mock = createServer(() => ({ payload: xmlStringResponse(big) }));
    const port = await mock.start();
    closer = mock.stop;
    const client = new XmlRpcClient({ host: "127.0.0.1", port, timeoutMs: 1000 });

    await assert.rejects(() => client.call("fldigi.version"), XmlRpcError);
  });

  it("unescapes xml entities in returned strings", async () => {
    const mock = createServer(() => ({ payload: xmlStringResponse("A &amp; B &lt;C&gt;") }));
    const port = await mock.start();
    closer = mock.stop;
    const client = new XmlRpcClient({ host: "127.0.0.1", port, timeoutMs: 1000 });

    const value = await client.call("fldigi.version");
    assert.equal(value, "A & B <C>");
  });
});
