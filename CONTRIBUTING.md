# Contributing

Run `npm test` and `npm pack --dry-run` before submitting a change. Keep host interactions on supported OpenClaw plugin APIs and verify them against the targeted release. Do not commit credentials, private transcripts, production configuration, or generated release archives.

Add behavior tests for meaningful routing or lifecycle changes. Document model defaults and data-sharing changes explicitly. Never infer live provider behavior from mocked tests. Compatibility ranges must follow actual host review and validation.
