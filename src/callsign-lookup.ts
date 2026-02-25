import { isCallsign } from "./callsign.js";
import type { ChannelConfig } from "./config.js";

export interface CallsignProfile {
  callsign: string;
  source: string;
  fullName?: string;
  qth?: string;
  state?: string;
  country?: string;
  grid?: string;
  licenseClass?: string;
  qslInfo?: string;
  email?: string;
  imageUrl?: string;
  bioUrl?: string;
  raw?: Record<string, unknown>;
}

export interface CallsignLookupProvider {
  readonly id: string;
  lookup(callsign: string): Promise<CallsignProfile | null>;
}

export interface CallsignLookupServiceOptions {
  providers: CallsignLookupProvider[];
  cacheTtlMs: number;
  now?: () => number;
}

interface CacheEntry {
  expiresAt: number;
  value: CallsignProfile | null;
}

export class CallsignLookupService {
  private readonly providers: CallsignLookupProvider[];
  private readonly cacheTtlMs: number;
  private readonly now: () => number;
  private readonly cache = new Map<string, CacheEntry>();

  constructor(options: CallsignLookupServiceOptions) {
    this.providers = options.providers;
    this.cacheTtlMs = Math.max(1_000, options.cacheTtlMs);
    this.now = options.now ?? (() => Date.now());
  }

  async lookup(callsign: string): Promise<CallsignProfile | null> {
    const upper = callsign.toUpperCase().trim();
    if (!isCallsign(upper)) {
      return null;
    }

    const cached = this.cache.get(upper);
    const now = this.now();
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    for (const provider of this.providers) {
      try {
        const result = await provider.lookup(upper);
        if (result) {
          this.cache.set(upper, {
            expiresAt: now + this.cacheTtlMs,
            value: { ...result, callsign: upper },
          });
          return result;
        }
      } catch (err) {
        console.warn(`[callsign-lookup] provider=${provider.id} failed for ${upper}: ${err instanceof Error ? err.message : err}`);
      }
    }

    this.cache.set(upper, { expiresAt: now + this.cacheTtlMs, value: null });
    return null;
  }
}

export class MockCallsignLookupProvider implements CallsignLookupProvider {
  readonly id = "mock";
  private readonly data: Map<string, Omit<CallsignProfile, "callsign" | "source">>;

  constructor(seed?: Record<string, Omit<CallsignProfile, "callsign" | "source">>) {
    const defaults: Record<string, Omit<CallsignProfile, "callsign" | "source">> = {
      "PI4ABC": {
        fullName: "Hans Vermeer",
        qth: "Rotterdam",
        country: "Netherlands",
        grid: "JO21",
        licenseClass: "A",
      },
      "W1AW": {
        fullName: "ARRL HQ",
        qth: "Newington",
        state: "CT",
        country: "United States",
        grid: "FN31",
      },
      "PA3XYZ": {
        fullName: "Demo Operator",
        qth: "Utrecht",
        country: "Netherlands",
        grid: "JO22",
      },
    };
    this.data = new Map(Object.entries(seed ?? defaults).map(([k, v]) => [k.toUpperCase(), v]));
  }

  async lookup(callsign: string): Promise<CallsignProfile | null> {
    const upper = callsign.toUpperCase().trim();
    const row = this.data.get(upper);
    if (!row) return null;
    return {
      callsign: upper,
      source: this.id,
      ...row,
    };
  }
}

export interface QrzProviderOptions {
  username: string;
  password: string;
}

export class QrzCallsignLookupProvider implements CallsignLookupProvider {
  readonly id = "qrz";
  private readonly options: QrzProviderOptions;

  constructor(options: QrzProviderOptions) {
    this.options = options;
  }

  async lookup(_callsign: string): Promise<CallsignProfile | null> {
    if (!this.options.username || !this.options.password) {
      return null;
    }
    throw new Error("QRZ provider is not implemented yet. Add XML API session + lookup flow in a follow-up task.");
  }
}

export function createCallsignLookupService(config: ChannelConfig): CallsignLookupService {
  const providers: CallsignLookupProvider[] = [];
  const providerMode = config.callsignLookup.provider;

  if (!config.callsignLookup.enabled) {
    return new CallsignLookupService({
      providers,
      cacheTtlMs: config.callsignLookup.cacheTtlSeconds * 1000,
    });
  }

  if (providerMode === "mock") {
    providers.push(new MockCallsignLookupProvider());
  } else if (providerMode === "qrz") {
    providers.push(new QrzCallsignLookupProvider(config.qrz));
  } else if (providerMode === "auto") {
    if (config.qrz.username && config.qrz.password) {
      providers.push(new QrzCallsignLookupProvider(config.qrz));
    }
    providers.push(new MockCallsignLookupProvider());
  } else {
    // Placeholders for future open providers.
    providers.push(new MockCallsignLookupProvider());
  }

  return new CallsignLookupService({
    providers,
    cacheTtlMs: config.callsignLookup.cacheTtlSeconds * 1000,
  });
}
