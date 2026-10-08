# Live validation

Start with `observeOnly: true`, a configured Decision provider, content sharing enabled, and an unpinned session on the configured baseline. Do not execute consequential actions for testing.

1. Fresh chat: “What does RSVP stand for?” Desired classification: FAST.
2. Fresh chat: “What is 12 plus 7?” Desired classification: FAST.
3. Fresh chat: “Design a production database migration plan with rollback, backups, and minimal downtime.” Desired classification: DEEP or NORMAL, never FAST.
4. Fresh chat: “Do that please.” Expected no override, usually `context-ambiguity` without a provider call.
5. Attach a harmless image and ask for a description. Expected `attachments`, unchanged.
6. Explicitly select a different model, then repeat a harmless question. Expected unchanged. Also test explicitly pinning the baseline itself; it must remain unchanged.
7. With all-agent scope, repeat harmless tests on a second eligible agent. With restricted scope, the other agent must receive no evaluation or override.

Observation always leaves the model unchanged. NORMAL is safe even for harmless requests when thresholds are not met; do not repeatedly retry until a desired tier appears.

After observation passes, turn observation off. Check each assistant response's actual model in the GUI timestamp tooltip, not only the composer picker or router logs. Confirm FAST uses the configured FAST model, DEEP uses the configured DEEP model, and NORMAL retains the baseline, without changing the picker between turns. Verify persistent session model pins remain unchanged.

These are representative functional checks, not a comprehensive safety or probability-calibration evaluation.
