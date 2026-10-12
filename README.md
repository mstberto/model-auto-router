# Model Auto Router

A small removable OpenClaw plugin that classifies eligible human turns through the configured `decisionModel` and selects a conversational model for that run. No OpenClaw patches, proxy, direct TypeSafe calls, API keys, or persistent session-model writes.

Version **1.0.13** declares support for **OpenClaw 2026.9.7 and newer** (`>=2026.9.7`), with no upper version limit. The original API review targeted 2026.9.7; newer releases are allowed to load but have not all been validated.

## Current behavior

| Tier | Default behavior |
| --- | --- |
| FAST | Override to `openai/gpt-6-luna` |
| NORMAL | No override; retain the configured baseline |
| DEEP | Override to `openai/gpt-6-astra` |

The default baseline is `openai/gpt-6-sol`. Only runs starting on `baselineModel` are eligible. An empty `agentId` (the default) applies to all eligible agents; set an agent ID to restrict scope. Each agent must have a configured or inherited Decision model. The host selects that provider using the current agent's identity.

These defaults differ from the original single-agent release, which left DEEP unchanged. Existing saved configuration overrides defaults. Model overrides do not set a thinking level.

One Decision batch assesses effort, stakes, and context completeness. FAST requires LOW probability ≥ 0.97, confidence ≥ 0.90, stakes probability ≤ 0.05, and standalone probability ≥ 0.95. HIGH effort or stakes probability ≥ 0.70 produces DEEP. Probabilities are estimates, not calibrated safety guarantees.

Manual model pins (including inherited pins), attachments, ambiguous short follow-ups, sensitive or oversized evidence, unsupported triggers, scheduled jobs, subagents, invalid decisions, errors, and timeouts produce no override. The early hook is not an authentication boundary: it accepts the host's user trigger and rejects explicit internal provenance, but cannot recover missing sender identity.

## Changes in 1.0.13

Clear short requests reach the Decision model. Follow-up and attachment text guards now target explicit references rather than broad sentence prefixes or topic words. Ordinary redaction is passed as incomplete-evidence context instead of an automatic skip. The standalone default is 0.95; existing saved threshold settings remain unchanged. Credential detection, manual pins, error fallback and routing models are unchanged. Validate the new policy with representative Jev calls before relying on it.

## Migrating from Alice Auto Router

The plugin ID is now `model-auto-router`. Existing `plugins.entries.alice-auto-router` configuration does not transfer automatically. Disable the old plugin before enabling this one so two routers cannot override the same turn. Copy the settings you want to preserve into `plugins.entries.model-auto-router.config`, including scope, models, observation mode, and content-sharing consent. Grant conversation access separately for the new plugin. This rename does not migrate or change session state.

## Installation

From this repository:

```sh
npm test
npm pack
openclaw plugins install ./model-auto-router-1.0.13.tgz
```

For an existing installation, use the supported update flow, adding `--force` where appropriate. Preserve existing plugin allowlists and Decision-provider configuration. Inspect installation errors before retrying; the included Doctor artifact declares no stored-data migrations.

Start in observation mode:

```sh
openclaw config set plugins.entries.model-auto-router.enabled true --strict-json
openclaw config set plugins.entries.model-auto-router.hooks.allowConversationAccess true --strict-json
openclaw config set plugins.entries.model-auto-router.config.enabled true --strict-json
openclaw config set plugins.entries.model-auto-router.config.observeOnly true --strict-json
openclaw config set plugins.entries.model-auto-router.config.allowDecisionContent true --strict-json
openclaw plugins reload model-auto-router
```

The content-sharing flag authorizes sending bounded conversation evidence to the configured Decision provider, including during observation. Configure that provider and the agent's `decisionModel` separately. Hosted providers can charge for each evaluation; this plugin has no credit-balance monitoring or automatic recharge.

Set `baselineModel` to match your agent defaults. Agents using another baseline are skipped, even with all-agent scope. To restrict scope:

```sh
openclaw config set plugins.entries.model-auto-router.config.agentId 'YOUR_AGENT_ID'
```

See [live validation](LIVE-VALIDATION.md) before activating:

```sh
openclaw config set plugins.entries.model-auto-router.config.observeOnly false --strict-json
openclaw plugins reload model-auto-router
```

## Configuration defaults

```json
{
  "enabled": false,
  "agentId": "",
  "baselineModel": "openai/gpt-6-sol",
  "fastModel": "openai/gpt-6-luna",
  "deepModel": "openai/gpt-6-astra",
  "observeOnly": true,
  "bufferSize": 6,
  "timeoutMs": 1500,
  "minLowEffortProbability": 0.97,
  "minConfidence": 0.9,
  "maxHighStakesProbability": 0.05,
  "minStandaloneProbability": 0.95,
  "deepProbability": 0.7,
  "allowDecisionContent": false
}
```

The manifest and `schema.mjs` define valid ranges. Registration defaults to disabled, observation enabled, and content sharing disabled. Reset, stop, and timeout cancel pending decisions; failures leave the baseline unchanged.

## Privacy and limitations

The provider receives the prepared prompt, including any host-added context, up to 8,000 characters, plus 4–6 buffered messages of up to 800 characters each. Oversized current prompts are skipped. Sensitive recent messages are replaced with omission markers. Secret filtering is best-effort. General topic words do not block evaluation. URLs, emails and long numbers are redacted; the Decision model is told when current evidence was redacted and must reject classification when omitted details could change effort or stakes. Buffers are in memory, bounded to 100 sessions, and expire after ten minutes.

Logs contain tier, reason, route, and decision metrics, without full prompts, credentials, session IDs, or raw provider errors. They report requested routing, not proof of executed model. Attachments use early image metadata plus references to attached or supplied media, which cannot detect every unrepresented attachment. Prior context can conservatively increase stakes for an otherwise simple request.

The plugin uses only `before_model_resolve`, `agent_end`, `before_reset`, and a cleanup service. It performs no background classification. Only the conversation-access hook grant is required; native plugins execute with host privileges.

## Disable or uninstall

```sh
openclaw config set plugins.entries.model-auto-router.config.enabled false --strict-json
openclaw plugins reload model-auto-router
openclaw plugins uninstall model-auto-router
```

No session-model restoration is needed. Keep the Decision provider installed if other consumers use it.

## Validation

`npm test` runs 27 dependency-free behavior tests, including per-agent identity, scope, tier routing, manual pins, cross-agent ancestry, attachment guards, privacy, cancellation, timeouts, and bounded buffers. These use mocked host/provider interfaces; they do not prove current Jev calibration or full host compatibility.

The original 1.0.10 FAST-only policy was separately exercised live on OpenClaw 2026.9.7. Its requested Luna → Astra → Astra sequence was confirmed using response timestamp model tooltips. That evidence does not establish live validation of the latest all-agent/DEEP-routing changes.

## Source references

- [OpenClaw 2026.9.7 hook contract](https://github.com/openclaw/openclaw/blob/v2026.9.7/src/plugins/hook-before-agent-start.types.ts)
- [Same-turn model selection](https://github.com/openclaw/openclaw/blob/v2026.9.7/src/agents/embedded-agent-runner/run/setup.ts)
- [Decision Runtime contract](https://github.com/openclaw/openclaw/blob/v2026.9.7/src/decisions/types.ts)
- [Community lifecycle reference](https://github.com/herval/openclaw-jev-plugin/blob/main/src/plugin.ts), consulted as a reference; not installed or copied wholesale.

## License

[MIT](LICENSE).
