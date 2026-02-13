/**
 * Background service for the morse-radio channel.
 * Hosts the fldigi polling loop and dispatches inbound decoded text to OpenClaw.
 */

import os from "node:os";
import path from "node:path";
import type { OpenClawApi, ServiceDefinition } from "./openclaw-api.js";
import { resolveConfig, validateConfig, type ChannelConfig, type PartialChannelConfig } from "./config.js";
import { FldigiPoller, type FldigiPollerCallbacks } from "./fldigi-poller.js";
import { AdifLogger, frequencyToBand } from "./adif.js";
import { scoreMessageConfidence } from "./decode-quality.js";
import { extractQsoFields, lowConfidenceFields, type ExtractedQsoFields } from "./qso-extract.js";
import { QsoMemoryStore, type QsoMemoryRecord } from "./qso-memory.js";
import { isCallsign } from "./callsign.js";
import { fuzzyMatchCallsign, type Confidence } from "./fuzzy-match.js";

interface PollerLike {
  start(): Promise<void>;
  stop(): Promise<void>;
}

interface DupeStore {
  initialize(): void;
  loadExisting(): void;
  isDupe(call: string, band: string): boolean;
}

interface MemoryStore {
  initialize(): void;
  addRecord(record: QsoMemoryRecord): void;
  getByCallsign(callsign: string): QsoMemoryRecord[];
  getKnownCallsigns(): string[];
}

export interface ServiceOptions {
  config?: PartialChannelConfig;
  createPoller?: (config: ChannelConfig, callbacks: FldigiPollerCallbacks) => PollerLike;
  adifPath?: string;
  memoryPath?: string;
  createDupeStore?: (filePath: string) => DupeStore;
  createMemoryStore?: (filePath: string) => MemoryStore;
  extractFields?: (text: string, options?: { peerHint?: string }) => ExtractedQsoFields;
}

const CHANNEL_ID = "morse-radio";
const LOW_CONFIDENCE_PREFIX = "[LOW-CONFIDENCE]";
const DUPE_PREFIX = "[DUPE]";

export function createService(api: OpenClawApi, options: ServiceOptions = {}): ServiceDefinition {
  const config = resolveConfig(options.config ?? {});
  const createPoller = options.createPoller ?? ((cfg, callbacks) => new FldigiPoller(cfg, callbacks));
  const adifPath = options.adifPath ?? path.join(os.homedir(), ".openclaw", "cqlaw", "log.adi");
  const memoryPath = options.memoryPath ?? path.join(os.homedir(), ".openclaw", "cqlaw", "qso-memory.json");
  const createDupeStore = options.createDupeStore ?? ((filePath) => new AdifLogger(filePath));
  const createMemoryStore = options.createMemoryStore ?? ((filePath) => new QsoMemoryStore(filePath));
  const extractFields = options.extractFields ?? extractQsoFields;

  const dupeStore = createDupeStore(adifPath);
  const memoryStore = createMemoryStore(memoryPath);

  let poller: PollerLike | null = null;
  let started = false;

  return {
    id: "morse-radio-service",

    async start() {
      if (started) return;
      started = true;

      const configErrors = validateConfig(config);
      if (configErrors.length > 0) {
        console.error("[morse-radio-service] Invalid config; service will remain inactive");
        for (const err of configErrors) {
          console.error(`[morse-radio-service] config.${err.field}: ${err.message}`);
        }
        return;
      }

      console.log(`[morse-radio-service] Starting with fldigi at ${config.fldigi.host}:${config.fldigi.port}`);
      dupeStore.initialize();
      dupeStore.loadExisting();
      memoryStore.initialize();

      poller = createPoller(config, {
        onMessage: (text, peer, metadata) => {
          const enriched = enrichInbound(text, peer, metadata, config, dupeStore, memoryStore, extractFields);
          api.dispatchInbound({
            text: enriched.text,
            peer: enriched.peer,
            channel: CHANNEL_ID,
            metadata: enriched.metadata,
          });
        },
        onStatusChange: (status) => {
          console.log(`[morse-radio-service] Status: ${status}`);
        },
      });

      await poller.start();
    },

    async stop() {
      if (!started) return;
      started = false;

      console.log("[morse-radio-service] Stopping...");
      if (poller) {
        await poller.stop();
        poller = null;
      }
    },
  };
}

interface EnrichedInbound {
  text: string;
  peer: string;
  metadata: Record<string, unknown>;
}

function enrichInbound(
  text: string,
  peer: string,
  metadata: Record<string, unknown>,
  config: ChannelConfig,
  dupeStore: DupeStore,
  memoryStore: MemoryStore,
  extractFields: (text: string, options?: { peerHint?: string }) => ExtractedQsoFields,
): EnrichedInbound {
  const messageConfidence = scoreMessageConfidence(text);
  const fields = extractFields(text, { peerHint: isCallsign(peer) ? peer : undefined });
  const knownCallsigns = memoryStore.getKnownCallsigns();

  if (fields.callsign && (fields.callsign.value.includes("?") || fields.callsign.confidence === "low")) {
    const matched = fuzzyMatchCallsign(fields.callsign.value, knownCallsigns, 2);
    if (matched) {
      fields.callsign = { value: matched.toUpperCase(), confidence: "medium" };
    }
  }

  const lowFields = lowConfidenceFields(fields);

  const callsign = fields.callsign?.value ?? (isCallsign(peer) ? peer.toUpperCase() : undefined);
  const band = frequencyToBand(config.frequency) ?? "unknown";
  const previousContacts = callsign ? memoryStore.getByCallsign(callsign) : [];
  const previousQsoContext = previousContacts.length > 0
    ? summarizePreviousQso(previousContacts[0])
    : undefined;
  const isDupeCall = callsign ? dupeStore.isDupe(callsign, band) : false;

  if (callsign) {
    memoryStore.addRecord({
      callsign,
      timestamp: new Date().toISOString(),
      frequency: config.frequency,
      band,
      rstRcvd: fields.rstRcvd?.value,
      name: fields.name?.value,
      qth: fields.qth?.value,
      remarks: text,
      note: "inbound",
    });
  }

  const tags: string[] = [];
  if (isDupeCall) {
    tags.push(DUPE_PREFIX);
    console.warn(`[morse-radio-service] Duplicate contact detected: ${callsign} on ${band}`);
  }
  if (messageConfidence === "low" || lowFields.length > 0) {
    tags.push(LOW_CONFIDENCE_PREFIX);
    console.warn(`[morse-radio-service] Low-confidence decode${lowFields.length ? ` (${lowFields.join(", ")})` : ""}: ${text}`);
  }

  const displayText = tags.length > 0 ? `${tags.join(" ")} ${text}` : text;
  const finalPeer = callsign ?? peer;

  return {
    text: displayText,
    peer: finalPeer,
    metadata: {
      ...metadata,
      decodeConfidence: messageConfidence as Confidence,
      lowConfidenceFields: lowFields,
      qsoFields: fields,
      dupe: isDupeCall,
      previousContacts,
      previousQsoContext,
    },
  };
}

function summarizePreviousQso(record: QsoMemoryRecord): Record<string, unknown> {
  return {
    lastContactTimestamp: record.timestamp,
    lastBand: record.band,
    lastFrequency: record.frequency,
    lastRstRcvd: record.rstRcvd,
    lastName: record.name,
    lastQth: record.qth,
    lastRemarks: record.remarks,
  };
}
