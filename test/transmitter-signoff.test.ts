import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Transmitter, type TransmitLog } from "../src/transmitter.js";
import { resolveConfig } from "../src/config.js";

class FakeFldigiClient {
  public txTexts: string[] = [];

  async setWpm(_wpm: number): Promise<void> {}
  async sendTxText(text: string): Promise<void> {
    this.txTexts.push(text);
  }
  async startTx(): Promise<void> {}
  async stopTx(): Promise<void> {}
  async abortTx(): Promise<void> {}
  async getTxLength(): Promise<number> {
    return 0;
  }
  async getRxLength(): Promise<number> {
    return 0;
  }
}

function createCallbacks() {
  const logs: TransmitLog[] = [];
  const ids: string[] = [];
  return {
    logs,
    ids,
    callbacks: {
      onTransmitLog: (log: TransmitLog) => logs.push(log),
      onLegalId: (callsign: string) => ids.push(callsign),
    },
  };
}

describe("Transmitter signoff identification", () => {
  let tx: Transmitter | null = null;

  afterEach(() => {
    tx?.destroy();
    tx = null;
  });

  it("ensures signoff ends with station callsign and SK", async () => {
    const client = new FakeFldigiClient();
    const config = resolveConfig({
      tx: { enabled: true, callsign: "PA3XYZ", wpm: 20 },
    });
    const { callbacks } = createCallbacks();

    tx = new Transmitter(client as any, config, callbacks);
    (tx as any).listenStartTime = Date.now() - 15_000;

    const result = await tx.send("TNX FER QSO 73", undefined, "signoff", "DL2ABC");
    assert.equal(result.success, true);
    assert.ok(result.transmitted?.endsWith("DE PA3XYZ SK"));
    assert.equal(client.txTexts.length, 2);
    assert.equal(client.txTexts[0], "QRL?");
    assert.ok(client.txTexts[1].endsWith("DE PA3XYZ SK"));
  });

  it("does not duplicate terminal DE CALLSIGN SK when already present", async () => {
    const client = new FakeFldigiClient();
    const config = resolveConfig({
      tx: { enabled: true, callsign: "PA3XYZ", wpm: 20 },
    });
    const { callbacks } = createCallbacks();

    tx = new Transmitter(client as any, config, callbacks);
    (tx as any).listenStartTime = Date.now() - 15_000;

    const result = await tx.send("TNX 73 DE PA3XYZ SK", undefined, "signoff", "DL2ABC");
    assert.equal(result.success, true);
    const transmitted = result.transmitted ?? "";
    const terminalIdCount = (transmitted.match(/DE PA3XYZ SK/g) || []).length;
    assert.equal(terminalIdCount, 1);
  });
});
