// Config keys are compatible across router releases; no repair or data migration is needed.
// Exposing this read-only normalizer lets OpenClaw inspect pending upgrade configuration.
export function normalizeCompatibilityConfig({ cfg }) {
  return { config: cfg, changes: [] };
}
export const stateMigrations = [];
