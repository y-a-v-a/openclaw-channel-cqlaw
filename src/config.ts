import { isCallsign } from "./callsign.js";

/**
 * Channel configuration schema for the CQlaw morse radio plugin.
 * All settings for frequency, fldigi connection, SDR, and transmit control.
 */

export interface FldigiConfig {
  host: string;
  port: number;
  pollingIntervalMs: number;
}

export interface SdrConfig {
  enabled: boolean;
  device: string;
  sampleRate: number;
}

export interface TxConfig {
  enabled: boolean;
  inhibit: boolean;
  maxDurationSeconds: number;
  wpm: number;
  callsign: string;
  pttMethod: "cat" | "vox" | "serial" | "none";
}

export interface ChannelConfig {
  frequency: number;
  mode: string;
  fldigi: FldigiConfig;
  sdr: SdrConfig;
  tx: TxConfig;
}

const FLDIGI_DEFAULTS: FldigiConfig = {
  host: "127.0.0.1",
  port: 7362,
  pollingIntervalMs: 250,
};

const SDR_DEFAULTS: SdrConfig = {
  enabled: false,
  device: "",
  sampleRate: 48000,
};

const TX_DEFAULTS: TxConfig = {
  enabled: false,
  inhibit: false,
  maxDurationSeconds: 120,
  wpm: 20,
  callsign: "",
  pttMethod: "none",
};

const CONFIG_DEFAULTS: ChannelConfig = {
  frequency: 7030000,
  mode: "CW",
  fldigi: FLDIGI_DEFAULTS,
  sdr: SDR_DEFAULTS,
  tx: TX_DEFAULTS,
};

export interface ConfigValidationError {
  field: string;
  message: string;
}

/**
 * Validate that a config object has sane values.
 * Returns an empty array if valid, or a list of problems.
 */
export function validateConfig(config: ChannelConfig): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];

  if (!Number.isFinite(config.frequency) || config.frequency <= 0) {
    errors.push({ field: "frequency", message: "Frequency must be a positive number (Hz)" });
  }

  if (!config.mode) {
    errors.push({ field: "mode", message: "Mode is required (e.g. 'CW')" });
  }

  if (!config.fldigi.host || config.fldigi.host.trim() === "") {
    errors.push({ field: "fldigi.host", message: "fldigi.host is required" });
  }

  if (!Number.isInteger(config.fldigi.port) || config.fldigi.port < 1 || config.fldigi.port > 65535) {
    errors.push({ field: "fldigi.port", message: "Port must be between 1 and 65535" });
  }

  if (!Number.isFinite(config.fldigi.pollingIntervalMs) || config.fldigi.pollingIntervalMs < 50) {
    errors.push({ field: "fldigi.pollingIntervalMs", message: "Polling interval must be at least 50ms" });
  }

  if (config.tx.enabled && !config.tx.callsign) {
    errors.push({ field: "tx.callsign", message: "Callsign is required when TX is enabled" });
  } else if (config.tx.callsign && !isCallsign(config.tx.callsign)) {
    errors.push({ field: "tx.callsign", message: "Callsign must match amateur radio format (e.g. PA3XYZ)" });
  }

  if (!Number.isFinite(config.tx.wpm) || config.tx.wpm < 5 || config.tx.wpm > 60) {
    errors.push({ field: "tx.wpm", message: "WPM must be between 5 and 60" });
  }

  if (!Number.isFinite(config.tx.maxDurationSeconds) || config.tx.maxDurationSeconds < 1) {
    errors.push({ field: "tx.maxDurationSeconds", message: "Max TX duration must be at least 1 second" });
  }

  return errors;
}

/**
 * Merge partial user config with defaults, producing a complete ChannelConfig.
 */
export interface PartialChannelConfig {
  frequency?: number;
  mode?: string;
  fldigi?: Partial<FldigiConfig>;
  sdr?: Partial<SdrConfig>;
  tx?: Partial<TxConfig>;
}

export function resolveConfig(partial: PartialChannelConfig): ChannelConfig {
  const callsign = partial.tx?.callsign ?? TX_DEFAULTS.callsign;
  return {
    frequency: partial.frequency ?? CONFIG_DEFAULTS.frequency,
    mode: partial.mode ?? CONFIG_DEFAULTS.mode,
    fldigi: { ...FLDIGI_DEFAULTS, ...partial.fldigi },
    sdr: { ...SDR_DEFAULTS, ...partial.sdr },
    tx: { ...TX_DEFAULTS, ...partial.tx, callsign: callsign.toUpperCase().trim() },
  };
}
