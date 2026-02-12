import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { formatForCw } from "../src/cw-format.js";

const OWN = "PA3XYZ";
const PEER = "DL2ABC";

describe("formatForCw", () => {
  describe("CQ calls", () => {
    it("appends DE <ownCall> and K", () => {
      assert.equal(
        formatForCw("CQ CQ CQ", "cq", OWN),
        "CQ CQ CQ DE PA3XYZ K",
      );
    });

    it("does not duplicate DE <ownCall> if already present", () => {
      assert.equal(
        formatForCw("CQ CQ CQ DE PA3XYZ PA3XYZ", "cq", OWN),
        "CQ CQ CQ DE PA3XYZ PA3XYZ K",
      );
    });

    it("ignores peerCall for CQ", () => {
      assert.equal(
        formatForCw("CQ CQ CQ", "cq", OWN, PEER),
        "CQ CQ CQ DE PA3XYZ K",
      );
    });
  });

  describe("reply intent", () => {
    it("prepends addressing and appends KN", () => {
      assert.equal(
        formatForCw("UR RST 599 599", "reply", OWN, PEER),
        "DL2ABC DE PA3XYZ UR RST 599 599 KN",
      );
    });

    it("does not duplicate addressing if already present", () => {
      assert.equal(
        formatForCw("DL2ABC DE PA3XYZ UR RST 599 599", "reply", OWN, PEER),
        "DL2ABC DE PA3XYZ UR RST 599 599 KN",
      );
    });

    it("skips addressing when no peerCall", () => {
      assert.equal(
        formatForCw("UR RST 599 599", "reply", OWN),
        "UR RST 599 599 KN",
      );
    });
  });

  describe("signoff intent", () => {
    it("prepends addressing and appends SK", () => {
      assert.equal(
        formatForCw("TNX FER QSO 73", "signoff", OWN, PEER),
        "DL2ABC DE PA3XYZ TNX FER QSO 73 SK",
      );
    });
  });

  describe("default intent", () => {
    it("prepends addressing and appends KN as safe default", () => {
      assert.equal(
        formatForCw("TEST", "default", OWN, PEER),
        "DL2ABC DE PA3XYZ TEST KN",
      );
    });
  });

  describe("does not duplicate closing prosign", () => {
    it("skips KN if text already ends with KN", () => {
      assert.equal(
        formatForCw("UR RST 599 KN", "reply", OWN),
        "UR RST 599 KN",
      );
    });

    it("skips SK if text already ends with SK", () => {
      assert.equal(formatForCw("73 SK", "signoff", OWN), "73 SK");
    });

    it("skips K if CQ text already ends with K", () => {
      assert.equal(
        formatForCw("CQ CQ DE PA3XYZ K", "cq", OWN),
        "CQ CQ DE PA3XYZ K",
      );
    });

    it("does not add KN when text already ends with K", () => {
      assert.equal(
        formatForCw("UR RST 599 K", "default", OWN),
        "UR RST 599 K",
      );
    });

    it("does not add K when text already ends with AR", () => {
      assert.equal(
        formatForCw("CQ CQ DE PA3XYZ AR", "cq", OWN),
        "CQ CQ DE PA3XYZ AR",
      );
    });
  });
});
