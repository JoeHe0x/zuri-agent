#!/usr/bin/env node
import { join } from "node:path";
import { adapters as registry } from "./adapters/index.mjs";
import { createBridge } from "./bridge.mjs";
import { CHANNELS_DIR, loadConfig } from "./config.mjs";
import { createGateway } from "./gateway.mjs";
import { openStore } from "./store.mjs";

// Ids and codes only: message text stays out of default logs.
const log = (event, fields) => console.error(JSON.stringify({ event, ...fields }));

const config = loadConfig();
const adapters = {};
const gateway = createGateway({ adapters, config, log,
  bridge: createBridge(config.bridge), store: openStore(join(CHANNELS_DIR, "conversations.json")) });
for (const [id, channel] of Object.entries(config.channels)) {
  if (!channel.enabled) continue;
  if (!registry[id]) throw new Error(`Unknown channel "${id}".`);
  adapters[id] = (await registry[id]()).default(channel, process.env, { log });
  await adapters[id].start(message => gateway.handle(message));
  log("ready", { channel: id });
}
process.on("SIGINT", async () => { await Promise.all(Object.values(adapters).map(a => a.stop())); process.exit(0); });
