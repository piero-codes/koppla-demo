const test = require("node:test");
const assert = require("node:assert/strict");
const { TOOLS, TOOL_DEFS } = require("../tools.js");
const { GOAL, AGENT_DEFAULTS, runAgent, validateRun, messageText, summaryText } = require("../agent.js");

// --- fixtures -------------------------------------------------------------

/** Scripted fetch: each call consumes the next entry; records request bodies. */
function fakeFetch(script) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const next = script.shift();
    if (next instanceof Error) throw next;
    const status = next.status || 200;
    return { ok: status < 400, status, json: async () => next.body };
  };
  fn.calls = calls;
  return fn;
}

const msg = (id, text) => ({ type: "message", id, role: "assistant", status: "completed",
  content: [{ type: "output_text", text, annotations: [] }] });
const reasoning = (id, summary = []) => ({ type: "reasoning", id, summary: summary.map(t => ({ type: "summary_text", text: t })) });
const fc = (callId, name, args) => ({ type: "function_call", id: "fc_" + callId, call_id: callId, name, arguments: JSON.stringify(args) });

const toolTurn = (callId, name, args, text, summary) => ({ body: { id: "resp_" + callId, status: "completed",
  output: [reasoning("rs_" + callId, summary), ...(text ? [msg("msg_" + callId, text)] : []), fc(callId, name, args)] } });
const doneTurn = (text) => ({ body: { id: "resp_done", status: "completed", output: [reasoning("rs_done"), msg("msg_done", text)] } });

const baseOpts = (fetchFn, extra = {}) => ({ apiKey: "sk-test", tools: TOOLS, toolDefs: TOOL_DEFS, fetchFn, ...extra });
const collect = () => { const events = []; return { events, emit: e => events.push(e) }; };

// --- tests ----------------------------------------------------------------

test("GOAL and defaults match the spec", () => {
  assert.match(GOAL, /Hamburg-Altona/);
  assert.match(GOAL, /80 €/);
  assert.equal(AGENT_DEFAULTS.model, "gpt-5.6-terra");
  assert.equal(AGENT_DEFAULTS.reasoningEffort, "low");
  assert.equal(AGENT_DEFAULTS.showSummaries, false);
  assert.equal(AGENT_DEFAULTS.maxCycles, 10);
  assert.equal(AGENT_DEFAULTS.endpoint, "https://api.openai.com/v1/responses");
  assert.match(AGENT_DEFAULTS.instructions, /Koppla/);
});

test("one tool cycle then done: emits goal, reasoning, tool_call, tool_result, done", async () => {
  const fetchFn = fakeFetch([
    toolTurn("call_1", "get_site", { name: "Hamburg-Altona" }, "I need the site address first."),
    doneTurn("All done."),
  ]);
  const { events, emit } = collect();
  await runAgent(GOAL, emit, baseOpts(fetchFn));

  assert.deepEqual(events.map(e => e.type), ["goal", "reasoning", "tool_call", "tool_result", "done"]);
  assert.equal(events[0].text, GOAL);
  assert.deepEqual(events[1], { type: "reasoning", cycle: 1, text: "I need the site address first." });
  assert.deepEqual(events[2], { type: "tool_call", cycle: 1, id: "call_1", name: "get_site", args: { name: "Hamburg-Altona" } });
  assert.equal(events[3].type, "tool_result");
  assert.equal(events[3].id, "call_1");
  assert.equal(events[3].name, "get_site");
  assert.equal(events[3].output.address, "Harkortstraße 12, 22765 Hamburg");
  assert.deepEqual(events[4], { type: "done", cycle: 2, text: "All done." });
});

test("request body: model, instructions, tools, no parallel calls, low effort, no summary by default", async () => {
  const fetchFn = fakeFetch([doneTurn("ok")]);
  await runAgent(GOAL, () => {}, baseOpts(fetchFn));
  const { url, headers, body } = fetchFn.calls[0];
  assert.equal(url, "https://api.openai.com/v1/responses");
  assert.equal(headers.Authorization, "Bearer sk-test");
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(body.model, "gpt-5.6-terra");
  assert.equal(body.instructions, AGENT_DEFAULTS.instructions);
  assert.deepEqual(body.tools, TOOL_DEFS);
  assert.equal(body.parallel_tool_calls, false);
  assert.deepEqual(body.reasoning, { effort: "low" });
  assert.deepEqual(body.input, [{ role: "user", content: GOAL }]);
});

test("history grows: second request carries first output items plus function_call_output", async () => {
  const turn1 = toolTurn("call_1", "get_site", { name: "Hamburg-Altona" }, "Looking up the site.");
  const fetchFn = fakeFetch([turn1, doneTurn("done")]);
  await runAgent(GOAL, () => {}, baseOpts(fetchFn));
  const input2 = fetchFn.calls[1].body.input;
  assert.deepEqual(input2[0], { role: "user", content: GOAL });
  assert.deepEqual(input2.slice(1, 4), turn1.body.output, "reasoning, message and function_call items are passed back verbatim");
  assert.equal(input2[4].type, "function_call_output");
  assert.equal(input2[4].call_id, "call_1");
  assert.deepEqual(JSON.parse(input2[4].output), TOOLS.get_site({ name: "Hamburg-Altona" }));
  assert.equal(input2.length, 5);
});

test("showSummaries adds summary:auto and falls back to the summary when there is no preamble text", async () => {
  const fetchFn = fakeFetch([
    toolTurn("call_1", "get_site", { name: "Hamburg-Altona" }, "", ["Checking the site record."]),
    doneTurn("done"),
  ]);
  const { events, emit } = collect();
  await runAgent(GOAL, emit, baseOpts(fetchFn, { showSummaries: true }));
  assert.deepEqual(fetchFn.calls[0].body.reasoning, { effort: "low", summary: "auto" });
  assert.equal(events[1].text, "Checking the site record.");
});

test("no preamble and summaries off: reasoning text is empty string", async () => {
  const fetchFn = fakeFetch([toolTurn("call_1", "get_site", { name: "x" }, "", ["hidden"]), doneTurn("done")]);
  const { events, emit } = collect();
  await runAgent(GOAL, emit, baseOpts(fetchFn));
  assert.equal(events[1].text, "");
});

test("unknown tool name yields an error output and the loop continues", async () => {
  const fetchFn = fakeFetch([toolTurn("call_1", "teleport", { where: "Mars" }, "Trying."), doneTurn("gave up on Mars")]);
  const { events, emit } = collect();
  await runAgent(GOAL, emit, baseOpts(fetchFn));
  assert.deepEqual(events[3].output, { error: "unknown tool teleport" });
  assert.equal(events[4].type, "done");
});

test("HTTP error becomes an error event carrying the API message", async () => {
  const fetchFn = fakeFetch([{ status: 401, body: { error: { message: "Incorrect API key provided", type: "invalid_request_error" } } }]);
  const { events, emit } = collect();
  await runAgent(GOAL, emit, baseOpts(fetchFn));
  assert.deepEqual(events.map(e => e.type), ["goal", "error"]);
  assert.equal(events[1].message, "Incorrect API key provided");
});

test("HTTP error without JSON body falls back to the status code", async () => {
  const fetchFn = async () => ({ ok: false, status: 502, json: async () => { throw new Error("not json"); } });
  const { events, emit } = collect();
  await runAgent(GOAL, emit, baseOpts(fetchFn));
  assert.equal(events[1].message, "HTTP 502");
});

test("200 response missing output array (incomplete status) becomes an error event", async () => {
  const fetchFn = fakeFetch([{ body: { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } } }]);
  const { events, emit } = collect();
  await runAgent(GOAL, emit, baseOpts(fetchFn));
  assert.deepEqual(events.map(e => e.type), ["goal", "error"]);
  assert.equal(events[1].message, "Unexpected response (status incomplete)");
});

test("200 response missing output array with a top-level error uses its message", async () => {
  const fetchFn = fakeFetch([{ body: { error: { message: "boom" } } }]);
  const { events, emit } = collect();
  await runAgent(GOAL, emit, baseOpts(fetchFn));
  assert.deepEqual(events.map(e => e.type), ["goal", "error"]);
  assert.equal(events[1].message, "boom");
});

test("network failure becomes a friendly error event", async () => {
  const fetchFn = fakeFetch([new TypeError("Failed to fetch")]);
  const { events, emit } = collect();
  await runAgent(GOAL, emit, baseOpts(fetchFn));
  assert.equal(events[1].type, "error");
  assert.match(events[1].message, /Could not reach api\.openai\.com/);
});

test("stops with an error after maxCycles", async () => {
  const script = Array.from({ length: 3 }, (_, i) => toolTurn("call_" + i, "get_site", { name: "Hamburg-Altona" }, "again"));
  const fetchFn = fakeFetch(script);
  const { events, emit } = collect();
  await runAgent(GOAL, emit, baseOpts(fetchFn, { maxCycles: 3 }));
  assert.equal(events.filter(e => e.type === "tool_call").length, 3);
  assert.equal(events.at(-1).type, "error");
  assert.equal(events.at(-1).message, "Stopped after 3 cycles");
});

test("multiple function calls in one response are all executed and matched by call_id", async () => {
  const two = { body: { id: "r", status: "completed", output: [
    msg("m", "Doing two things."),
    fc("call_a", "find_journeys", { from: "Berlin", to: "Hamburg" }),
    fc("call_b", "find_hotels", { near: "Harkortstraße 12" }),
  ] } };
  const fetchFn = fakeFetch([two, doneTurn("done")]);
  const { events, emit } = collect();
  await runAgent(GOAL, emit, baseOpts(fetchFn));
  const results = events.filter(e => e.type === "tool_result");
  assert.deepEqual(results.map(r => [r.id, r.name]), [["call_a", "find_journeys"], ["call_b", "find_hotels"]]);
  const outputs = fetchFn.calls[1].body.input.filter(i => i.type === "function_call_output").map(i => i.call_id);
  assert.deepEqual(outputs, ["call_a", "call_b"]);
});

test("messageText and summaryText extract and join text parts", () => {
  const output = [reasoning("r", ["s1", "s2"]), msg("m1", "a"), msg("m2", "b")];
  assert.equal(messageText(output), "a\nb");
  assert.equal(summaryText(output), "s1\ns2");
  assert.equal(messageText([]), "");
});

test("validateRun accepts a real-looking run and rejects junk", () => {
  const run = [{ type: "goal", text: "g", t: 0 }, { type: "done", cycle: 1, text: "d", t: 5 }];
  assert.equal(validateRun(run), run);
  assert.throws(() => validateRun({}), /Not a saved run/);
  assert.throws(() => validateRun([]), /Not a saved run/);
  assert.throws(() => validateRun([{ type: "banana" }]), /Not a saved run.*banana/);
  assert.throws(() => validateRun([null]), /Not a saved run/);
});

test("default fetchFn survives a this-sensitive global fetch (browser Illegal invocation regression)", async (t) => {
  const realFetch = globalThis.fetch;
  const script = [doneTurn("ok")];
  globalThis.fetch = function (url, init) {
    if (this !== globalThis && this !== undefined) throw new TypeError("Illegal invocation");
    const next = script.shift();
    return Promise.resolve({ ok: true, status: 200, json: async () => next.body });
  };
  t.after(() => { globalThis.fetch = realFetch; });
  const { events, emit } = collect();
  await runAgent(GOAL, emit, { apiKey: "sk-test", tools: TOOLS, toolDefs: TOOL_DEFS });
  assert.deepEqual(events.map(e => e.type), ["goal", "done"]);
});
