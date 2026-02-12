import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SentenceBuffer } from "../src/sentence-buffer.js";

/** Helper: collect flushed messages into an array */
function createBuffer(options?: { silenceThresholdMs?: number }) {
  const flushed: string[] = [];
  const buffer = new SentenceBuffer((msg) => flushed.push(msg), options);
  return { buffer, flushed };
}

/** Helper: wait for a specified duration */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("SentenceBuffer", () => {
  // --- character accumulation ---

  it("accumulates pushed text in the pending buffer", () => {
    const { buffer } = createBuffer();
    buffer.push("CQ ");
    buffer.push("CQ ");
    buffer.push("DE ");
    assert.equal(buffer.pending, "CQ CQ DE ");
    buffer.reset();
  });

  it("ignores empty pushes", () => {
    const { buffer } = createBuffer();
    buffer.push("");
    buffer.push("");
    assert.equal(buffer.pending, "");
    buffer.reset();
  });

  // --- prosign-based flush ---

  it("flushes immediately on AR prosign", () => {
    const { buffer, flushed } = createBuffer();
    buffer.push("CQ CQ DE PA3XYZ AR");
    assert.equal(flushed.length, 1);
    assert.equal(flushed[0], "CQ CQ DE PA3XYZ AR");
    assert.equal(buffer.pending, "");
    buffer.reset();
  });

  it("flushes immediately on SK prosign", () => {
    const { buffer, flushed } = createBuffer();
    buffer.push("TU 73 DE PA3XYZ SK");
    assert.equal(flushed.length, 1);
    assert.equal(flushed[0], "TU 73 DE PA3XYZ SK");
    buffer.reset();
  });

  it("flushes immediately on standalone K", () => {
    const { buffer, flushed } = createBuffer();
    buffer.push("CQ CQ DE PA3XYZ K");
    assert.equal(flushed.length, 1);
    assert.equal(flushed[0], "CQ CQ DE PA3XYZ K");
    buffer.reset();
  });

  it("flushes immediately on KN prosign", () => {
    const { buffer, flushed } = createBuffer();
    buffer.push("PA3XYZ DE DL2ABC KN");
    assert.equal(flushed.length, 1);
    assert.equal(flushed[0], "PA3XYZ DE DL2ABC KN");
    buffer.reset();
  });

  it("flushes immediately on BK prosign", () => {
    const { buffer, flushed } = createBuffer();
    buffer.push("PA3XYZ DE DL2ABC BK");
    assert.equal(flushed.length, 1);
    assert.equal(flushed[0], "PA3XYZ DE DL2ABC BK");
    buffer.reset();
  });

  it("does not flush on K embedded in a word", () => {
    const { buffer, flushed } = createBuffer();
    buffer.push("OK");
    assert.equal(flushed.length, 0);
    assert.equal(buffer.pending, "OK");
    buffer.reset();
  });

  it("prosign detection is case-insensitive", () => {
    const { buffer, flushed } = createBuffer();
    buffer.push("cq cq de pa3xyz k");
    assert.equal(flushed.length, 1);
    assert.equal(flushed[0], "cq cq de pa3xyz k");
    buffer.reset();
  });

  // --- silence-based flush ---

  it("flushes after silence threshold when no prosign is present", async () => {
    const { buffer, flushed } = createBuffer({ silenceThresholdMs: 100 });
    buffer.push("HELLO WORLD");
    assert.equal(flushed.length, 0);

    await wait(200);

    assert.equal(flushed.length, 1);
    assert.equal(flushed[0], "HELLO WORLD");
    buffer.reset();
  });

  it("resets silence timer on each push", async () => {
    const { buffer, flushed } = createBuffer({ silenceThresholdMs: 150 });
    buffer.push("HELLO ");
    await wait(100);
    buffer.push("WORLD");
    // Should NOT have flushed yet — timer was reset
    assert.equal(flushed.length, 0);

    await wait(200);

    assert.equal(flushed.length, 1);
    assert.equal(flushed[0], "HELLO WORLD");
    buffer.reset();
  });

  it("does not flush an empty buffer on silence timeout", async () => {
    const { buffer, flushed } = createBuffer({ silenceThresholdMs: 50 });
    // push and immediately flush via prosign, leaving buffer empty
    buffer.push("TEST K");
    assert.equal(flushed.length, 1);

    await wait(100);
    // no second flush should have happened
    assert.equal(flushed.length, 1);
    buffer.reset();
  });

  // --- whitespace normalization ---

  it("collapses multiple spaces to single space", () => {
    const { buffer, flushed } = createBuffer();
    buffer.push("CQ   CQ    DE   PA3XYZ K");
    assert.equal(flushed[0], "CQ CQ DE PA3XYZ K");
    buffer.reset();
  });

  it("strips leading and trailing whitespace on flush", () => {
    const { buffer, flushed } = createBuffer();
    buffer.push("  CQ CQ DE PA3XYZ  ");
    buffer.flush();
    assert.equal(flushed[0], "CQ CQ DE PA3XYZ");
    buffer.reset();
  });

  // --- rapid burst ---

  it("accumulates a rapid burst into a single message", async () => {
    const { buffer, flushed } = createBuffer({ silenceThresholdMs: 100 });
    const chunks = ["CQ ", "CQ ", "DE ", "PA3", "XYZ"];
    for (const chunk of chunks) {
      buffer.push(chunk);
    }
    assert.equal(flushed.length, 0, "should not flush without prosign or silence");

    await wait(200);

    assert.equal(flushed.length, 1);
    assert.equal(flushed[0], "CQ CQ DE PA3XYZ");
    buffer.reset();
  });

  // --- manual flush ---

  it("flush() dispatches current buffer and clears it", () => {
    const { buffer, flushed } = createBuffer();
    buffer.push("PARTIAL MESSAGE");
    buffer.flush();
    assert.equal(flushed.length, 1);
    assert.equal(flushed[0], "PARTIAL MESSAGE");
    assert.equal(buffer.pending, "");
  });

  // --- reset ---

  it("reset() discards buffer and cancels timers", async () => {
    const { buffer, flushed } = createBuffer({ silenceThresholdMs: 50 });
    buffer.push("SHOULD BE DISCARDED");
    buffer.reset();

    await wait(100);

    assert.equal(flushed.length, 0);
    assert.equal(buffer.pending, "");
  });
});
