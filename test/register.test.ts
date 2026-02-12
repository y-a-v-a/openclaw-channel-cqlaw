import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "../src/index.js";
import type { OpenClawApi, ChannelDefinition, OutboundHandler, ServiceDefinition } from "../src/openclaw-api.js";

describe("register", () => {
  it("registers a channel and a service with the gateway", () => {
    const channels: { def: ChannelDefinition; handler: OutboundHandler }[] = [];
    const services: ServiceDefinition[] = [];

    const api: OpenClawApi = {
      registerChannel: (def, handler) => { channels.push({ def, handler }); },
      registerService: (svc) => { services.push(svc); },
      dispatchInbound: () => {},
    };

    register(api);

    assert.equal(channels.length, 1);
    assert.equal(channels[0].def.id, "morse-radio");
    assert.equal(channels[0].def.chatTypes[0], "direct");
    assert.equal(channels[0].def.messageTypes[0], "text");

    assert.equal(services.length, 1);
    assert.equal(services[0].id, "morse-radio-service");
  });
});
