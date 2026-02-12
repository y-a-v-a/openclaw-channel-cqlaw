/**
 * Typed client for fldigi's XML-RPC API.
 *
 * Wraps the raw XML-RPC transport with domain-specific methods for
 * reading decoded CW text, querying status, and (later) transmitting.
 *
 * fldigi XML-RPC docs: http://www.w1hkj.com/FldigiHelp/xmlrpc_control_page.html
 */

import { XmlRpcClient, XmlRpcError } from "./xmlrpc.js";

export interface FldigiClientOptions {
  host: string;
  port: number;
  timeoutMs?: number;
}

export class FldigiClient {
  private readonly rpc: XmlRpcClient;

  constructor(options: FldigiClientOptions) {
    this.rpc = new XmlRpcClient({
      host: options.host,
      port: options.port,
      timeoutMs: options.timeoutMs,
    });
  }

  // --- Connection / version ---

  /** Check fldigi is reachable. Throws on connection failure. */
  async connect(): Promise<void> {
    await this.getVersion();
  }

  /** fldigi version string (e.g. "4.2.05") */
  async getVersion(): Promise<string> {
    return this.rpc.call("fldigi.version");
  }

  /** fldigi program name */
  async getName(): Promise<string> {
    return this.rpc.call("fldigi.name");
  }

  // --- Receive ---

  /**
   * Read all text from fldigi's RX buffer starting at the given byte offset.
   * Returns the new text since that offset.
   *
   * fldigi method: text.get_rx_length gives buffer length,
   * text.get_rx(offset, length) returns a substring.
   * We use rx.get_data which returns bytes after the given offset.
   */
  async getRxText(start: number, length: number): Promise<string> {
    return this.rpc.call("text.get_rx", start, length);
  }

  /** Total length (in bytes) of fldigi's RX text buffer. */
  async getRxLength(): Promise<number> {
    const val = await this.rpc.call("text.get_rx_length");
    return parseInt(val, 10);
  }

  // --- Frequency / mode ---

  /** Currently tuned frequency in Hz (floating point). */
  async getFrequency(): Promise<number> {
    const val = await this.rpc.call("main.get_frequency");
    return parseFloat(val);
  }

  /** Set the dial frequency in Hz. */
  async setFrequency(hz: number): Promise<void> {
    await this.rpc.call("main.set_frequency", hz);
  }

  /** Current operating mode name (e.g. "CW", "USB"). */
  async getMode(): Promise<string> {
    return this.rpc.call("modem.get_name");
  }

  /** Set the operating mode by name. */
  async setMode(mode: string): Promise<void> {
    await this.rpc.call("modem.set_by_name", mode);
  }

  // --- Signal quality ---

  /** Current S/N ratio as reported by fldigi's modem (dB). */
  async getSignalNoiseRatio(): Promise<number> {
    const val = await this.rpc.call("modem.get_quality");
    return parseFloat(val);
  }

  // --- Modem / speed ---

  /** Detected receive speed in WPM (CW modem). */
  async getWpm(): Promise<number> {
    const val = await this.rpc.call("modem.get_wpm");
    return parseInt(val, 10);
  }

  // --- Transmit (stubs for Phase 4) ---

  /** Push text into fldigi's TX buffer for transmission. */
  async sendTxText(text: string): Promise<void> {
    await this.rpc.call("text.add_tx", text);
  }

  /** Read current TX buffer contents. */
  async getTxLength(): Promise<number> {
    const val = await this.rpc.call("text.get_tx_length");
    return parseInt(val, 10);
  }

  /** Abort current transmission immediately. */
  async abortTx(): Promise<void> {
    await this.rpc.call("main.abort");
  }

  /** Set the transmit speed in WPM. */
  async setWpm(wpm: number): Promise<void> {
    await this.rpc.call("modem.set_carrier", wpm);
  }

  /** Trigger TX (start transmitting what's in the buffer). */
  async startTx(): Promise<void> {
    await this.rpc.call("main.tx");
  }

  /** Switch back to RX mode. */
  async stopTx(): Promise<void> {
    await this.rpc.call("main.rx");
  }

  /** Get the underlying XmlRpcClient for low-level access. */
  get xmlrpc(): XmlRpcClient {
    return this.rpc;
  }
}

export { XmlRpcError };
