import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSendTextHandler } from "../src/outbound.js";

describe("createSendTextHandler", () => {
  it("returns a stub handler when no transmitter is provided", async () => {
    const handler = createSendTextHandler(null);
    const result = await handler({
      text: "CQ CQ DE PA3XYZ K",
      peer: "PA3XYZ",
      channel: "morse-radio",
    });
    assert.equal(result.success, true);
  });
});
