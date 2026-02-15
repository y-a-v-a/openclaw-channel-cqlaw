/**
 * Mock fldigi XML-RPC server for integration testing.
 *
 * Simulates fldigi's XML-RPC interface with a controllable RX buffer,
 * configurable delays, and fault injection for testing error paths.
 */

import http from "node:http";

// --- XML-RPC response helpers ---

function wrapString(s: string): string {
  return `<?xml version="1.0"?><methodResponse><params><param><value><string>${s}</string></value></param></params></methodResponse>`;
}

function wrapInt(n: number): string {
  return `<?xml version="1.0"?><methodResponse><params><param><value><int>${n}</int></value></param></params></methodResponse>`;
}

function wrapFault(code: number, message: string): string {
  return `<?xml version="1.0"?><methodResponse><fault><value><struct>` +
    `<member><name>faultCode</name><value><int>${code}</int></value></member>` +
    `<member><name>faultString</name><value><string>${message}</string></value></member>` +
    `</struct></value></fault></methodResponse>`;
}

// --- Mock server ---

export interface MockFldigiOptions {
  /** Artificial delay (ms) before responding to each request. Default 0. */
  responseDelayMs?: number;
  /** fldigi version string to report. Default "4.2.05". */
  version?: string;
  /** CW modem WPM to report. Default 20. */
  wpm?: number;
  /** Signal quality (S/N dB) to report. Default 20.0. */
  snr?: number;
}

export interface MockFldigi {
  server: http.Server;
  /** Append text to the simulated RX buffer (as if fldigi decoded it) */
  addRxText: (text: string) => void;
  /** Clear the RX buffer (simulates fldigi restart) */
  resetRxBuffer: () => void;
  /** Get total XML-RPC calls received */
  getCallCount: () => number;
  /** Get the method names of all received calls, in order */
  getCallLog: () => string[];
  /** Set artificial response delay (ms) — use to simulate slow/timeout */
  setResponseDelay: (ms: number) => void;
  /** Make the server reject all requests (simulates fldigi crash) */
  setRejectAll: (reject: boolean) => void;
  /** Set a per-method fault response (null to clear) */
  setFault: (method: string, fault: { code: number; message: string } | null) => void;
  /** Start listening, returns the assigned port */
  start: () => Promise<number>;
  /** Stop the server */
  stop: () => Promise<void>;
  /** Current RX buffer contents */
  getRxBuffer: () => string;
}

export function createMockFldigi(options: MockFldigiOptions = {}): MockFldigi {
  let rxBuffer = "";
  let callCount = 0;
  const callLog: string[] = [];
  let responseDelayMs = options.responseDelayMs ?? 0;
  let rejectAll = false;
  const faults = new Map<string, { code: number; message: string }>();

  const version = options.version ?? "4.2.05";
  const wpm = options.wpm ?? 20;
  const snr = options.snr ?? 20.0;

  const server = http.createServer((req, res) => {
    if (rejectAll) {
      req.destroy();
      return;
    }

    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      callCount++;
      const body = Buffer.concat(chunks).toString("utf-8");

      // Extract method name for logging
      const methodMatch = body.match(/<methodName>([^<]+)<\/methodName>/);
      const method = methodMatch ? methodMatch[1] : "unknown";
      callLog.push(method);

      // Helper: schedule or immediately send a response
      const scheduleSend = (fn: () => void) => {
        if (responseDelayMs > 0) {
          setTimeout(fn, responseDelayMs);
        } else {
          fn();
        }
      };

      // Check for per-method fault injection
      const fault = faults.get(method);
      if (fault) {
        scheduleSend(() => {
          res.writeHead(200, { "Content-Type": "text/xml" });
          res.end(wrapFault(fault.code, fault.message));
        });
        return;
      }

      let response: string;

      if (body.includes("fldigi.version")) {
        response = wrapString(version);
      } else if (body.includes("text.get_rx_length")) {
        response = wrapInt(rxBuffer.length);
      } else if (body.includes("text.get_rx")) {
        const startMatch = body.match(/<param><value><int>(\d+)<\/int><\/value><\/param>/);
        const start = startMatch ? parseInt(startMatch[1], 10) : 0;
        response = wrapString(rxBuffer.slice(start));
      } else if (body.includes("modem.get_name")) {
        response = wrapString("CW");
      } else if (body.includes("modem.get_quality")) {
        response = wrapString(String(snr));
      } else if (body.includes("modem.get_wpm")) {
        response = wrapInt(wpm);
      } else {
        response = wrapString("");
      }

      scheduleSend(() => {
        res.writeHead(200, { "Content-Type": "text/xml" });
        res.end(response);
      });
    });
  });

  return {
    server,
    addRxText: (text: string) => { rxBuffer += text; },
    resetRxBuffer: () => { rxBuffer = ""; },
    getCallCount: () => callCount,
    getCallLog: () => [...callLog],
    setResponseDelay: (ms: number) => { responseDelayMs = ms; },
    setRejectAll: (reject: boolean) => { rejectAll = reject; },
    setFault: (method: string, fault: { code: number; message: string } | null) => {
      if (fault) {
        faults.set(method, fault);
      } else {
        faults.delete(method);
      }
    },
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
    getRxBuffer: () => rxBuffer,
  };
}
