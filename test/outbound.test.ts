import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleSendText } from "../src/outbound.js";

describe("handleSendText", () => {
  it("returns success for any message (stub)", async () => {
    const result = await handleSendText({
      text: "CQ CQ DE PA3XYZ K",
      peer: "PA3XYZ",
      channel: "morse-radio",
    });
    assert.equal(result.success, true);
  });
});
