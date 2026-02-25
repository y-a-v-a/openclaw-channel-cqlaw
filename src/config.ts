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

export interface QrzConfig {
  username: string;
  password: string;
}

export interface CallsignLookupConfig {
  enabled: boolean;
  provider: "mock" | "qrz" | "hamdb" | "callook" | "hamqth" | "auto";
  cacheTtlSeconds: number;
}

export interface ChannelConfig {
  frequency: number;
  mode: string;
  fldigi: FldigiConfig;
  sdr: SdrConfig;
  tx: TxConfig;
  qrz: QrzConfig;
  callsignLookup: CallsignLookupConfig;
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

const QRZ_DEFAULTS: QrzConfig = {
  username: "",
  password: "",
};

const CALLSIGN_LOOKUP_DEFAULTS: CallsignLookupConfig = {
  enabled: true,
  provider: "mock",
  cacheTtlSeconds: 24 * 60 * 60,
};

const CONFIG_DEFAULTS: ChannelConfig = {
  frequency: 7030000,
  mode: "CW",
  fldigi: FLDIGI_DEFAULTS,
  sdr: SDR_DEFAULTS,
  tx: TX_DEFAULTS,
  qrz: QRZ_DEFAULTS,
  callsignLookup: CALLSIGN_LOOKUP_DEFAULTS,
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

  if (config.qrz.username && !config.qrz.password) {
    errors.push({ field: "qrz.password", message: "QRZ password is required when qrz.username is set (or set CQLAW_QRZ_PASSWORD)" });
  }
  if (config.qrz.password && !config.qrz.username) {
    errors.push({ field: "qrz.username", message: "QRZ username is required when qrz.password is set (or set CQLAW_QRZ_USERNAME)" });
  }

  if (!Number.isFinite(config.tx.wpm) || config.tx.wpm < 5 || config.tx.wpm > 60) {
    errors.push({ field: "tx.wpm", message: "WPM must be between 5 and 60" });
  }

  if (!Number.isFinite(config.tx.maxDurationSeconds) || config.tx.maxDurationSeconds < 1) {
    errors.push({ field: "tx.maxDurationSeconds", message: "Max TX duration must be at least 1 second" });
  }

  if (!Number.isFinite(config.callsignLookup.cacheTtlSeconds) || config.callsignLookup.cacheTtlSeconds < 1) {
    errors.push({ field: "callsignLookup.cacheTtlSeconds", message: "Callsign lookup cache TTL must be at least 1 second" });
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
  qrz?: Partial<QrzConfig>;
  callsignLookup?: Partial<CallsignLookupConfig>;
}

export function resolveConfig(partial: PartialChannelConfig, env: NodeJS.ProcessEnv = process.env): ChannelConfig {
  const envConfig = resolveEnvConfig(env);
  const callsign = partial.tx?.callsign ?? envConfig.tx?.callsign ?? TX_DEFAULTS.callsign;
  return {
    frequency: partial.frequency ?? envConfig.frequency ?? CONFIG_DEFAULTS.frequency,
    mode: partial.mode ?? envConfig.mode ?? CONFIG_DEFAULTS.mode,
    fldigi: { ...FLDIGI_DEFAULTS, ...envConfig.fldigi, ...partial.fldigi },
    sdr: { ...SDR_DEFAULTS, ...envConfig.sdr, ...partial.sdr },
    tx: { ...TX_DEFAULTS, ...envConfig.tx, ...partial.tx, callsign: callsign.toUpperCase().trim() },
    qrz: {
      ...QRZ_DEFAULTS,
      ...envConfig.qrz,
      ...partial.qrz,
      username: (partial.qrz?.username ?? envConfig.qrz?.username ?? QRZ_DEFAULTS.username).trim(),
      password: (partial.qrz?.password ?? envConfig.qrz?.password ?? QRZ_DEFAULTS.password).trim(),
    },
    callsignLookup: { ...CALLSIGN_LOOKUP_DEFAULTS, ...envConfig.callsignLookup, ...partial.callsignLookup },
  };
}

function resolveEnvConfig(env: NodeJS.ProcessEnv): PartialChannelConfig {
  const fldigi = definedValues<Partial<FldigiConfig>>({
    host: envString(env, "CQLAW_FLDIGI_HOST"),
    port: envInt(env, "CQLAW_FLDIGI_PORT"),
    pollingIntervalMs: envInt(env, "CQLAW_FLDIGI_POLLING_INTERVAL_MS"),
  });
  const sdr = definedValues<Partial<SdrConfig>>({
    enabled: envBoolean(env, "CQLAW_SDR_ENABLED"),
    device: envString(env, "CQLAW_SDR_DEVICE"),
    sampleRate: envInt(env, "CQLAW_SDR_SAMPLE_RATE"),
  });
  const tx = definedValues<Partial<TxConfig>>({
    enabled: envBoolean(env, "CQLAW_TX_ENABLED"),
    inhibit: envBoolean(env, "CQLAW_TX_INHIBIT"),
    maxDurationSeconds: envInt(env, "CQLAW_TX_MAX_DURATION_SECONDS"),
    wpm: envInt(env, "CQLAW_TX_WPM"),
    callsign: envString(env, "CQLAW_TX_CALLSIGN") ?? envString(env, "OPENCLAW_TX_CALLSIGN"),
    pttMethod: envPttMethod(env, "CQLAW_TX_PTT_METHOD"),
  });
  const qrz = definedValues<Partial<QrzConfig>>({
    username: envString(env, "CQLAW_QRZ_USERNAME"),
    password: envString(env, "CQLAW_QRZ_PASSWORD"),
  });
  const callsignLookup = definedValues<Partial<CallsignLookupConfig>>({
    enabled: envBoolean(env, "CQLAW_CALLSIGN_LOOKUP_ENABLED"),
    provider: envLookupProvider(env, "CQLAW_CALLSIGN_LOOKUP_PROVIDER"),
    cacheTtlSeconds: envInt(env, "CQLAW_CALLSIGN_LOOKUP_CACHE_TTL_SECONDS"),
  });

  return {
    frequency: envNumber(env, "CQLAW_FREQUENCY"),
    mode: envString(env, "CQLAW_MODE"),
    fldigi: Object.keys(fldigi).length > 0 ? fldigi : undefined,
    sdr: Object.keys(sdr).length > 0 ? sdr : undefined,
    tx: Object.keys(tx).length > 0 ? tx : undefined,
    qrz: Object.keys(qrz).length > 0 ? qrz : undefined,
    callsignLookup: Object.keys(callsignLookup).length > 0 ? callsignLookup : undefined,
  };
}

function envString(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const value = env[key];
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function envNumber(env: NodeJS.ProcessEnv, key: string): number | undefined {
  const value = envString(env, key);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function envInt(env: NodeJS.ProcessEnv, key: string): number | undefined {
  const value = envString(env, key);
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function envBoolean(env: NodeJS.ProcessEnv, key: string): boolean | undefined {
  const value = envString(env, key);
  if (value === undefined) return undefined;
  if (value === "1" || value.toLowerCase() === "true") return true;
  if (value === "0" || value.toLowerCase() === "false") return false;
  return undefined;
}

function envPttMethod(env: NodeJS.ProcessEnv, key: string): TxConfig["pttMethod"] | undefined {
  const value = envString(env, key);
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === "cat" || normalized === "vox" || normalized === "serial" || normalized === "none") {
    return normalized;
  }
  return undefined;
}

function envLookupProvider(env: NodeJS.ProcessEnv, key: string): CallsignLookupConfig["provider"] | undefined {
  const value = envString(env, key);
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (
    normalized === "mock" ||
    normalized === "qrz" ||
    normalized === "hamdb" ||
    normalized === "callook" ||
    normalized === "hamqth" ||
    normalized === "auto"
  ) {
    return normalized;
  }
  return undefined;
}

function definedValues<T extends Record<string, unknown>>(input: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}
