/**
 * Minimal XML-RPC client using only Node built-ins.
 *
 * XML-RPC is HTTP POST with XML request/response bodies.
 * fldigi's surface area is small — we only need a handful of method calls.
 * This avoids pulling in an npm XML-RPC library for something trivially implementable.
 */

import http from "node:http";

/** Encode a single XML-RPC parameter value */
function encodeValue(value: string | number | boolean | Buffer): string {
  if (typeof value === "string") {
    return `<value><string>${escapeXml(value)}</string></value>`;
  }
  if (typeof value === "number") {
    if (Number.isInteger(value)) {
      return `<value><int>${value}</int></value>`;
    }
    return `<value><double>${value}</double></value>`;
  }
  if (typeof value === "boolean") {
    return `<value><boolean>${value ? 1 : 0}</boolean></value>`;
  }
  if (Buffer.isBuffer(value)) {
    return `<value><base64>${value.toString("base64")}</base64></value>`;
  }
  return `<value><string>${escapeXml(String(value))}</string></value>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Build an XML-RPC methodCall request body */
function buildRequest(method: string, params: Array<string | number | boolean | Buffer>): string {
  const paramXml = params.map((p) => `<param>${encodeValue(p)}</param>`).join("");
  return `<?xml version="1.0"?><methodCall><methodName>${method}</methodName><params>${paramXml}</params></methodCall>`;
}

/** Extract the text content of the first occurrence of a given XML tag */
function extractTag(xml: string, tag: string): string | null {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = xml.indexOf(open);
  if (start === -1) return null;
  const end = xml.indexOf(close, start);
  if (end === -1) return null;
  return xml.slice(start + open.length, end);
}

/** Parse the return value from an XML-RPC methodResponse */
function parseResponse(xml: string): string {
  // Check for fault first — fault responses contain a <fault> tag
  if (xml.includes("<fault>")) {
    // Extract the faultString from the struct member
    const faultMatch = xml.match(/<name>faultString<\/name>\s*<value>\s*<string>(.*?)<\/string>/);
    const faultMsg = faultMatch ? faultMatch[1] : "Unknown XML-RPC fault";
    throw new XmlRpcError(`XML-RPC fault: ${faultMsg}`);
  }

  // Extract the value — fldigi returns strings, ints, doubles, base64, or booleans.
  // For our purposes, returning the raw inner text is sufficient since callers
  // know what type they're expecting.
  const value = extractTag(xml, "value");
  if (value === null) {
    return "";
  }

  // Unwrap typed value tags if present
  for (const type of ["string", "int", "i4", "double", "boolean", "base64"]) {
    const inner = extractTag(value, type);
    if (inner !== null) return inner;
  }

  // Bare <value>text</value> (fldigi sometimes does this)
  return value;
}

export class XmlRpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XmlRpcError";
  }
}

export interface XmlRpcClientOptions {
  host: string;
  port: number;
  /** Per-request timeout in milliseconds. Default 5000. */
  timeoutMs?: number;
}

export class XmlRpcClient {
  private readonly host: string;
  private readonly port: number;
  private readonly timeoutMs: number;

  constructor(options: XmlRpcClientOptions) {
    this.host = options.host;
    this.port = options.port;
    this.timeoutMs = options.timeoutMs ?? 5000;
  }

  /** Call an XML-RPC method and return the response value as a string */
  call(method: string, ...params: Array<string | number | boolean | Buffer>): Promise<string> {
    const body = buildRequest(method, params);

    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: this.host,
          port: this.port,
          method: "POST",
          path: "/RPC2",
          headers: {
            "Content-Type": "text/xml",
            "Content-Length": Buffer.byteLength(body),
          },
          timeout: this.timeoutMs,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () => {
            try {
              const xml = Buffer.concat(chunks).toString("utf-8");
              resolve(parseResponse(xml));
            } catch (err) {
              reject(err);
            }
          });
        }
      );

      req.on("timeout", () => {
        req.destroy();
        reject(new XmlRpcError(`XML-RPC timeout after ${this.timeoutMs}ms calling ${method}`));
      });

      req.on("error", (err) => {
        reject(new XmlRpcError(`XML-RPC connection error: ${err.message}`));
      });

      req.write(body);
      req.end();
    });
  }
}

// Exported for testing
export { buildRequest, parseResponse };
