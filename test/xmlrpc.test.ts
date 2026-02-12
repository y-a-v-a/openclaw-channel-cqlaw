import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildRequest, parseResponse, XmlRpcError } from "../src/xmlrpc.js";

describe("buildRequest", () => {
  it("encodes a method call with no params", () => {
    const xml = buildRequest("fldigi.version", []);
    assert.ok(xml.includes("<methodName>fldigi.version</methodName>"));
    assert.ok(xml.includes("<params></params>"));
  });

  it("encodes string params", () => {
    const xml = buildRequest("text.get_rx", ["hello"]);
    assert.ok(xml.includes("<string>hello</string>"));
  });

  it("encodes integer params", () => {
    const xml = buildRequest("text.get_rx", [42]);
    assert.ok(xml.includes("<int>42</int>"));
  });

  it("encodes float params", () => {
    const xml = buildRequest("main.set_frequency", [7030000.5]);
    assert.ok(xml.includes("<double>7030000.5</double>"));
  });

  it("encodes boolean params", () => {
    const xml = buildRequest("test.bool", [true]);
    assert.ok(xml.includes("<boolean>1</boolean>"));
  });

  it("escapes XML special characters in strings", () => {
    const xml = buildRequest("test", ["<foo>&bar"]);
    assert.ok(xml.includes("&lt;foo&gt;&amp;bar"));
  });

  it("encodes multiple params", () => {
    const xml = buildRequest("text.get_rx", [0, 100]);
    assert.ok(xml.includes("<param><value><int>0</int></value></param>"));
    assert.ok(xml.includes("<param><value><int>100</int></value></param>"));
  });
});

describe("parseResponse", () => {
  it("parses a string response", () => {
    const xml = `<?xml version="1.0"?>
      <methodResponse><params><param>
        <value><string>4.2.05</string></value>
      </param></params></methodResponse>`;
    assert.equal(parseResponse(xml), "4.2.05");
  });

  it("parses an int response", () => {
    const xml = `<?xml version="1.0"?>
      <methodResponse><params><param>
        <value><int>1234</int></value>
      </param></params></methodResponse>`;
    assert.equal(parseResponse(xml), "1234");
  });

  it("parses a double response", () => {
    const xml = `<?xml version="1.0"?>
      <methodResponse><params><param>
        <value><double>7030000.0</double></value>
      </param></params></methodResponse>`;
    assert.equal(parseResponse(xml), "7030000.0");
  });

  it("parses a bare value response (no type tag)", () => {
    const xml = `<?xml version="1.0"?>
      <methodResponse><params><param>
        <value>CQ CQ DE PA3XYZ</value>
      </param></params></methodResponse>`;
    assert.equal(parseResponse(xml), "CQ CQ DE PA3XYZ");
  });

  it("returns empty string for empty response", () => {
    const xml = `<?xml version="1.0"?>
      <methodResponse><params><param>
        <value><string></string></value>
      </param></params></methodResponse>`;
    assert.equal(parseResponse(xml), "");
  });

  it("throws on XML-RPC fault", () => {
    const xml = `<?xml version="1.0"?>
      <methodResponse><fault><value><struct>
        <member><name>faultCode</name><value><int>1</int></value></member>
        <member><name>faultString</name><value><string>Unknown method</string></value></member>
      </struct></value></fault></methodResponse>`;
    assert.throws(() => parseResponse(xml), XmlRpcError);
  });
});
