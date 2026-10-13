import test from 'node:test';
import assert from 'node:assert/strict';
import { registerRouter, pickTier, DEFAULTS, settings, minimize } from '../router.mjs';
import { CONFIG_SCHEMA } from '../schema.mjs';
import { readFileSync } from 'node:fs';
const answer = (effort = 'LOW', stakes = .001, standalone = .999) => ({ status: 'ok', result: { answers: {
  effort: { type: 'choice', choice: effort, probabilities: { LOW: effort === 'LOW' ? .99 : .005, MEDIUM: effort === 'MEDIUM' ? .99 : .005, HIGH: effort === 'HIGH' ? .99 : .005 }, confidence: .99 },
  highStakes: { type: 'boolean', probabilityTrue: stakes }, standalone: { type: 'boolean', probabilityTrue: standalone },
} } });
function fixture(config = {}, evaluate = async () => answer()) {
  const hooks = new Map(), services = [], calls = [], logs = [], rows = new Map();
  const ctx = { agentId: 'agent-one', sessionKey: 'agent:agent-one:dashboard:new', sessionId: 's1', runId: 'r1', trigger: 'user', messageProvider: 'webchat', modelProviderId: 'openai', modelId: 'gpt-6-sol' };
  let clock = 0, entry = { sessionId: 's1' }, sweep;
  const handle = registerRouter({ pluginConfig: { enabled: true, observeOnly: false, allowDecisionContent: true, ...config }, logger: { info: text => logs.push(text) }, on: (name, handler) => hooks.set(name, handler), registerService: service => services.push(service), runtime: { agent: { session: { getSessionEntry: ({ sessionKey }) => rows.has(sessionKey) ? rows.get(sessionKey) : entry } }, decisions: { evaluate: (batch, options) => { calls.push({ batch, options }); return evaluate(batch, options); } } } }, { now: () => clock, scheduleSweep: fn => { sweep = fn; return () => {}; } });
  services[0]?.start();
  return { ctx, hooks, services, calls, logs, rows, handle,
    route: (prompt = 'Turn on the office lamp', event = {}, context = {}) => hooks.get('before_model_resolve')?.({ prompt, ...event }, { ...ctx, ...context }),
    entry: value => { entry = value; }, advance: ms => { clock += ms; sweep?.(); },
  };
}
const luna = { providerOverride: 'openai', modelOverride: 'gpt-6-luna' };
test('fresh dashboard routes without admission, sender, or recent history', async () => {
  const f = fixture(); assert.deepEqual(await f.route(), luna);
  assert.deepEqual(f.calls[0].batch.state.recentMessages, []);
  assert.equal(f.calls[0].batch.state.request, 'Turn on the office lamp');
  assert.equal(f.calls[0].options.agentId, 'agent-one');
  assert.ok(f.calls[0].options.signal instanceof AbortSignal);
  assert.deepEqual([...f.hooks.keys()].sort(), ['agent_end', 'before_model_resolve', 'before_reset']);
});
test('empty agentId routes all agents while preserving per-agent identity', async () => {
  for (const agentId of ['agent-one', 'agent-two', 'agent-three']) {
    const f = fixture();

    const result = await f.route(
      'Turn on the office lamp',
      {},
      {
        agentId,
        sessionKey: `agent:${agentId}:dashboard:new`
      }
    );

    assert.deepEqual(result, luna);
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0].options.agentId, agentId);
  }
});
test('configured agentId restricts routing to that agent', async () => {
  const allowed = fixture({ agentId: 'agent-one' });
  assert.deepEqual(await allowed.route(), luna);
  assert.equal(allowed.calls.length, 1);

  const blocked = fixture({ agentId: 'agent-one' });
  assert.equal(
    await blocked.route(
      'Turn on the office lamp',
      {},
      {
        agentId: 'agent-two',
        sessionKey: 'agent:agent-two:dashboard:new'
      }
    ),
    undefined
  );
  assert.equal(blocked.calls.length, 0);
});
test('prepared prompt is direct evidence without parsing host envelopes', async () => {
  const f = fixture(); const prompt = 'Prepared channel context\nWhat color do blue and yellow make?';
  assert.deepEqual(await f.route(prompt), luna); assert.equal(f.calls[0].batch.state.request, prompt);
});
test('FAST routes to Luna, NORMAL retains Sol, and DEEP routes to Astra', async () => {
  const fast = fixture({}, async () => answer('LOW'));
  assert.deepEqual(await fast.route(), {
    providerOverride: 'openai',
    modelOverride: 'gpt-6-luna'
  });

  const normal = fixture({}, async () => answer('MEDIUM'));
  assert.equal(await normal.route(), undefined);

  const deep = fixture({}, async () => answer('HIGH'));
  assert.deepEqual(await deep.route(), {
    providerOverride: 'openai',
    modelOverride: 'gpt-6-astra'
  });

  const highStakes = fixture({}, async () => answer('LOW', .95));
  assert.equal(await highStakes.route(), undefined);

  const ambiguous = fixture({}, async () => answer('LOW', .001, .5));
  assert.equal(await ambiguous.route(), undefined);
});
test('malformed, contradictory, missing confidence and unnormalized output cannot route', () => {
  for (const change of [a => { delete a.result.answers.effort.confidence; }, a => { a.result.answers.effort.choice = 'MEDIUM'; }, a => { a.result.answers.effort.probabilities.LOW = 1; a.result.answers.effort.probabilities.HIGH = 1; }, a => { a.result.answers.highStakes.probabilityTrue = NaN; }]) {
    const a = answer(); change(a); assert.equal(pickTier(a, DEFAULTS).tier, 'NORMAL');
  }
  assert.equal(pickTier({ status: 'unavailable' }, DEFAULTS).tier, 'NORMAL');
});
test('explicit and inherited same-model pins, unknown entries, and changed pins are honored', async () => {
  for (const entry of [undefined, { sessionId: 'other' }, { sessionId: 's1', modelOverride: 'gpt-6-astra' }, { sessionId: 's1', modelOverride: 'gpt-6-luna' }, { sessionId: 's1', modelSelectionLocked: true }, { sessionId: 's1', modelOverrideSource: 'user' }, { sessionId: 's1', parentSessionId: 'unresolvable' }]) {
    const f = fixture(); f.entry(entry); assert.equal(await f.route(), undefined); assert.equal(f.calls.length, 0);
  }
  const f = fixture(); f.entry({ sessionId: 's1', parentSessionKey: 'agent:agent-one:main' });
  f.rows.set('agent:agent-one:main', { sessionId: 'parent', modelOverride: 'gpt-6-astra' });
  assert.equal(await f.route(), undefined); assert.equal(f.calls.length, 0);
  let g; g = fixture({}, async () => { g.entry({ sessionId: 's1', modelOverride: 'gpt-6-astra' }); return answer(); });
  assert.equal(await g.route(), undefined);
});
test('scope, trigger, explicit internal provenance, child runs and nonbaseline choices skip', async () => {
  for (const ctx of [{ trigger: 'heartbeat' }, { trigger: undefined }, { runId: undefined }, { sessionId: undefined }, { sessionKey: 'agent:other:main' }, { inputProvenance: { kind: 'internal_system' } }, { sessionKey: 'agent:agent-one:subagent:child' }, { jobId: 'cron' }, { modelId: 'gpt-6-luna' }, { modelId: 'gpt-6-astra' }]) {
    const f = fixture(); assert.equal(await f.route(undefined, {}, ctx), undefined); assert.equal(f.calls.length, 0);
  }
});
test('session ancestry cannot cross agent boundaries', async () => {
  const f = fixture();

  f.entry({
    sessionId: 's1',
    parentSessionKey: 'agent:agent-two:main'
  });

  f.rows.set('agent:agent-two:main', {
    sessionId: 'parent'
  });

  assert.equal(await f.route(), undefined);
  assert.equal(f.calls.length, 0);
});
test('attachments, explicit model commands, short followups and oversized prompts skip', async () => {
  for (const [prompt, event] of [['Explain this picture please', { attachments: [{ kind: 'image' }] }], ['/model openai/gpt-6-astra Tell me a joke', {}], ['Do that please', {}], ['What about it?', {}], ['Yes', {}], ['x'.repeat(8001), {}]]) {
    const f = fixture(); assert.equal(await f.route(prompt, event), undefined); assert.equal(f.calls.length, 0);
  }
});
test('secret-like evidence is withheld and logs never contain prompts or errors', async () => {
  const secret = 'My API key is sk-abcdefghijklmnopqrstuvwxyz'; const f = fixture();
  assert.equal(await f.route(secret), undefined); assert.equal(f.calls.length, 0); assert.ok(!f.logs.join('').includes(secret));
  const g = fixture({}, async () => { throw new Error(secret); }); assert.equal(await g.route(), undefined); assert.ok(!g.logs.join('').includes(secret));
});
test('observation and content-sharing switches retain model', async () => {
  const f = fixture({ observeOnly: true }); assert.equal(await f.route(), undefined); assert.equal(f.calls.length, 1); assert.match(f.logs.at(-1), /observe-only-fast/);
  const g = fixture({ allowDecisionContent: false }); assert.equal(await g.route(), undefined); assert.equal(g.calls.length, 0);
  const h = fixture({ enabled: false }); assert.equal(h.hooks.size, 0);
});
test('supplemental buffer keeps at most six messages and final assistant text only', async () => {
  const f = fixture();
  for (let i = 0; i < 5; i++) {
    const ctx = { ...f.ctx, runId: `r${i}` }; await f.route('Tell me a short friendly joke', {}, ctx);
    f.hooks.get('agent_end')({ success: true, messages: [{ role: 'assistant', content: [{ type: 'thinking', text: 'PRIVATE THOUGHT' }, { type: 'text', text: 'A harmless joke.' }] }] }, ctx);
  }
  assert.equal(f.handle.stats().messages, 6);
  assert.ok(!JSON.stringify(f.calls).includes('PRIVATE THOUGHT'));
  assert.ok(f.calls.at(-1).batch.state.recentMessages.some(m => m.role === 'assistant'));
});
test('a separate instance still evaluates first turn with an empty supplemental buffer', async () => {
  const root = fixture(); await root.route(); const prepared = fixture();
  assert.deepEqual(await prepared.route(), luna); assert.deepEqual(prepared.calls[0].batch.state.recentMessages, []);
});
test('retry deduplication and session generation changes prevent stale context', async () => {
  const f = fixture(); await f.route(); assert.equal(await f.route(), undefined); assert.equal(f.calls.length, 1);
  f.entry({ sessionId: 's2' }); await f.route(undefined, {}, { sessionId: 's2', runId: 'new' });
  assert.deepEqual(f.calls.at(-1).batch.state.recentMessages, []);
});
test('timeout returns even when provider ignores cancellation', async () => {
  const f = fixture({ timeoutMs: 100 }, () => new Promise(() => {}));
  assert.equal(await f.route(), undefined); assert.equal(f.calls[0].options.signal.aborted, true);
});
test('reset and disable cancel in-flight requests without late overrides', async () => {
  for (const action of ['reset', 'stop']) {
    const f = fixture({}, () => new Promise(() => {})); const pending = f.route();
    if (action === 'reset') f.hooks.get('before_reset')({}, f.ctx); else f.services[0].stop();
    assert.equal(await pending, undefined); assert.equal(f.calls[0].options.signal.aborted, true); assert.equal(f.handle.stats().sessions, 0);
  }
});
test('overlap cancels earlier decision and does not override either turn', async () => {
  const f = fixture({}, () => new Promise(() => {})); const first = f.route();
  assert.equal(await f.route('What color is the clear daytime sky?', {}, { runId: 'r2' }), undefined);
  assert.equal(await first, undefined); assert.equal(f.calls.length, 1);
});
test('expired buffer is discarded', async () => {
  const f = fixture(); await f.route(); f.advance(600001); assert.equal(f.handle.stats().sessions, 0);
});
test('configuration and manifest schema match; evidence bounds are explicit', () => {
  assert.deepEqual(
    JSON.parse(
      readFileSync(
        new URL('../openclaw.plugin.json', import.meta.url)
      )
    ).configSchema,
    CONFIG_SCHEMA
  );

  assert.equal(settings().agentId, '');
  assert.equal(settings({ agentId: '' }).agentId, '');
  assert.equal(settings({ agentId: 'agent-one' }).agentId, 'agent-one');
  assert.equal(settings({ agentId: 'agent-two' }).agentId, 'agent-two');

  assert.throws(() => settings({ agentId: 'Bad Agent!' }));
  assert.throws(() => settings({ bufferSize: 7 }));
  assert.throws(() => settings({ minConfidence: NaN }));

  assert.equal(minimize('x'.repeat(801)).unsafe, true);
});

test('manifest declares the inspection artifact and no stored-data migrations', () => {
  const manifest = JSON.parse(readFileSync(new URL('../openclaw.plugin.json', import.meta.url)));
  assert.deepEqual(manifest.doctorContract, { configRepair: true, resolveSessionStoreAgentIds: false, sessionRouteStateOwners: false, stateMigrations: [] });
});

test('Doctor compatibility inspection leaves configuration unchanged', async () => {
  const { normalizeCompatibilityConfig, stateMigrations } = await import('../doctor-contract-api.js');
  const config = { plugins: { entries: { 'model-auto-router': { config: { enabled: true } } } } };
  const before = structuredClone(config);
  assert.deepEqual(normalizeCompatibilityConfig({ cfg: config }), { config, changes: [] });
  assert.deepEqual(config, before);
  assert.deepEqual(stateMigrations, []);
});

test('clear short requests and ordinary sentence prefixes reach the Decision model', async () => {
  for (const prompt of ['2+2', 'Hi', 'Please calculate 2 plus 2.', 'Why is the sky blue?', 'Same question: what is RSVP?', 'What is a file extension?', 'What is a credit card?', 'What is an API key?']) {
    const f = fixture();
    assert.deepEqual(await f.route(prompt), luna, prompt);
    assert.equal(f.calls.length, 1, prompt);
  }
});
test('actual attachment references and complete ambiguous followups still skip', async () => {
  for (const prompt of ['Analyze this image', 'Read the attached file', 'Use that attachment', 'Continue.', 'Why?', 'Do it please', 'What about that?']) {
    const f = fixture();
    assert.equal(await f.route(prompt), undefined, prompt);
    assert.equal(f.calls.length, 0, prompt);
  }
});
test('ordinary redaction reaches Jev with explicit missing-content evidence', async () => {
  const f = fixture({}, async () => answer('LOW', .001, .5));
  assert.equal(await f.route('Summarize https://example.com/private'), undefined);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].batch.state.requestContentRedacted, true);
  assert.ok(!JSON.stringify(f.calls).includes('https://example.com/private'));
});
test('credential assignments and SSNs are withheld despite relaxed topic filtering', async () => {
  for (const prompt of ['password: hunter2', 'My secret is hunter2', 'My SSN is 123-45-6789']) {
    const f = fixture();
    assert.equal(await f.route(prompt), undefined);
    assert.equal(f.calls.length, 0);
  }
});
test('standalone threshold is 0.95 while effort, stakes and confidence remain strict', () => {
  assert.equal(pickTier(answer('LOW', .03, .95), DEFAULTS).tier, 'FAST');
  assert.equal(pickTier(answer('LOW', .03, .94), DEFAULTS).tier, 'NORMAL');
  assert.equal(pickTier(answer('LOW', .06, .99), DEFAULTS).tier, 'NORMAL');
});

test('Astra requires clear HIGH effort, confidence and context at threshold boundaries', () => {
  const decision = (high, confidence, standalone, choice = 'HIGH', stakes = .99) => {
    const a = answer('HIGH', stakes, standalone);
    a.result.answers.effort = { type: 'choice', choice, probabilities: { LOW: 0, MEDIUM: 1 - high, HIGH: high }, confidence };
    return a;
  };
  assert.equal(pickTier(decision(.90, .90, .95), DEFAULTS).tier, 'DEEP');
  for (const a of [decision(.899, .90, .95), decision(.90, .899, .95), decision(.90, .90, .949), decision(.99, undefined, .99), decision(.99, .99, .99, 'MEDIUM')]) {
    assert.equal(pickTier(a, DEFAULTS).tier, 'NORMAL');
  }
  assert.equal(pickTier(decision(.95, .95, .95, 'HIGH', .01), DEFAULTS).tier, 'DEEP');
  assert.equal(pickTier(answer('LOW', .99, .99), DEFAULTS).tier, 'NORMAL');
  assert.equal(pickTier(answer('MEDIUM', .99, .99), DEFAULTS).tier, 'NORMAL');
});
test('high-effort but unclear requests retain baseline through the hook', async () => {
  const f = fixture({}, async () => answer('HIGH', .99, .94));
  assert.equal(await f.route('Design a complex migration plan'), undefined);
  assert.equal(f.calls.length, 1);
});
