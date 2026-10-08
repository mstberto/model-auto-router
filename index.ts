import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { registerRouter } from "./router.mjs";
import { CONFIG_SCHEMA } from "./schema.mjs";
export default definePluginEntry({
  id: "model-auto-router",
  name: "Model Auto Router",
  description: "Conservative per-run routing using the configured decisionModel; no session writes.",
  configSchema: { jsonSchema: CONFIG_SCHEMA },
  register(api) {
    registerRouter(api);
  },
});
