export const CONFIG_SCHEMA = {
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "enabled": {
      "type": "boolean",
      "default": false
    },
    "agentId": {
      "type": "string",
      "pattern": "^$|^[a-z0-9][a-z0-9_-]*$",
      "default": ""
    },
    "baselineModel": {
      "type": "string",
      "pattern": "^[a-z0-9][a-z0-9_-]*/[^\\s/]+$",
      "default": "openai/gpt-6-sol"
    },
    "fastModel": {
      "type": "string",
      "pattern": "^[a-z0-9][a-z0-9_-]*/[^\\s/]+$",
      "default": "openai/gpt-6-luna"
    },
    "deepModel": {
      "type": "string",
      "pattern": "^[a-z0-9][a-z0-9_-]*/[^\\s/]+$",
      "default": "openai/gpt-6-astra"
    },
    "observeOnly": {
      "type": "boolean",
      "default": true
    },
    "bufferSize": {
      "type": "integer",
      "minimum": 4,
      "maximum": 6,
      "default": 6
    },
    "timeoutMs": {
      "type": "integer",
      "minimum": 100,
      "maximum": 2500,
      "default": 1500
    },
    "minLowEffortProbability": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "default": 0.97
    },
    "minConfidence": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "default": 0.9
    },
    "maxHighStakesProbability": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "default": 0.05
    },
    "minStandaloneProbability": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "default": 0.98
    },
    "deepProbability": {
      "type": "number",
      "minimum": 0,
      "maximum": 1,
      "default": 0.7
    },
    "allowDecisionContent": {
      "type": "boolean",
      "default": false
    }
  }
};
