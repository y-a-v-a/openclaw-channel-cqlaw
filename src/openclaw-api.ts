/**
 * OpenClaw Gateway API interface.
 *
 * Defines the contract between this plugin and the OpenClaw gateway.
 * The gateway provides an implementation of this interface when loading the plugin.
 * This file contains only type definitions — no runtime dependency on OpenClaw.
 */

export interface ChannelDefinition {
  id: string;
  name: string;
  description: string;
  chatTypes: string[];
  messageTypes: string[];
}

export interface InboundMessage {
  text: string;
  peer: string;
  channel: string;
  metadata?: Record<string, unknown>;
}

export interface OutboundMessage {
  text: string;
  peer: string;
  channel: string;
}

export interface SendResult {
  success: boolean;
  error?: string;
}

export interface ServiceDefinition {
  id: string;
  start: () => Promise<void>;
  stop: () => Promise<void>;
}

export interface OutboundHandler {
  sendText: (message: OutboundMessage) => Promise<SendResult>;
}

export interface OpenClawApi {
  registerChannel: (channel: ChannelDefinition, outbound: OutboundHandler) => void;
  registerService: (service: ServiceDefinition) => void;
  dispatchInbound: (message: InboundMessage) => void;
}
