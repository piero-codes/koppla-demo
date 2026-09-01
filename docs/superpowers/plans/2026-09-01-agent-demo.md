# Agent Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single-page, open-from-disk demo in which a hand-written agent loop plans a business trip using four mocked tools and live OpenAI Responses API calls, with a two-column UI (Model / Your code), save/load replay, and a README for running it on another machine.

**Architecture:** Three plain classic scripts loaded by `demo/index.html`: `tools.js` (mock world + tool definitions), `agent.js` (`runAgent` loop + `callModel` + `validateRun`, no DOM), and an inline Vue 3 app in `index.html` (rendering, Start/Save/Load/Reset). `tools.js` and `agent.js` export via `module.exports` when run under Node so they are unit-tested with `node --test` and a fake `fetch`; the UI is verified manually via replay of a fixture and via a live run.

**Tech Stack:** Plain JavaScript (no build), Vue 3.5.42 vendored (`vue.global.prod.js`, includes the template compiler), `fetch` to `POST https://api.openai.com/v1/responses`, Node 22 built-in test runner.

Spec: `docs/superpowers/specs/2026-09-01-agent-demo-design.md`.

## Global Constraints

- Plain JavaScript only; JSDoc allowed; no TypeScript, no bundler, no build step.
- No agent frameworks or SDKs; the API is called with plain `fetch`.
- Opens from disk (`file://`). Only classic `<script src>` tags (no ES modules — Chrome blocks them on `file://`). Vue is vendored, never loaded from a CDN.
- API key is a password input kept in memory only. Never hard-coded, never written to storage, never committed.
- Model constants (from spec §6, verified against docs 2026-09-01): `model: "gpt-5.6-terra"`, `reasoning: { effort: "low" }`, `parallel_tool_calls: false`, reasoning summaries off by default (`showSummaries: false` adds `summary: "auto"` when on), `maxCycles: 10`.
- Event types are exactly: `goal`, `reasoning`, `tool_call`, `tool_result`, `done`, `error` (spec §7).
- Mock data is exactly the tables in spec §5; the model is never told which option is right.
- UI copy: columns are titled **Model** and **Your code**; status bar reads `Cycle N · Think → Act → Observe`; buttons are **Start / Save run / Load run / Reset**.
- Base font size 20 px, dark high-contrast theme.
- Commit after every task with the trailer `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

## File structure

```
koppla-demo/
  package.json                  { "scripts": { "test": "node --test \"demo/test/*.test.js\"" } }
  README.md                     how to run; work-laptop checklist; fallbacks; recording a run
  demo/
    index.html                  styles + Vue app (UI only). Loads vendor/vue, tools.js, agent.js
    tools.js                    SITES/JOURNEYS/HOTELS data, TOOLS functions, TOOL_DEFS schemas
    agent.js                    GOAL, AGENT_DEFAULTS, callModel, runAgent, validateRun
    vendor/vue.global.prod.js   Vue 3.5.42, downloaded once, committed
    runs/sample-run.json        hand-written fixture used to build/verify the UI without a key
    runs/good-run.json          real recording from a live run (Task 5); the stage fallback
    test/tools.test.js          node --test
    test/agent.test.js          node --test, fake fetch
    test/live-check.js          real API run with assertions; needs OPENAI_API_KEY
  docs/superpowers/specs/...    (exists)
```

---

### Task 1: Mock world — `tools.js`

**Files:**
- Create: `package.json`
- Create: `demo/tools.js`
- Test: `demo/test/tools.test.js`

**Interfaces:**
- Produces globals (browser) / exports (Node): `SITES`, `JOURNEYS`, `HOTELS` (arrays), `TOOLS` (object of 4 sync functions taking one args object and returning a plain object), `TOOL_DEFS` (array of 4 Responses-API function tool definitions).
- `TOOLS.get_site({name})` → `{ name, address, site_manager, lat, lon }` or `{ error }`.
- `TOOLS.find_journeys({from,to})` → `{ from, to, day: "Thursday", journeys: [{ train, departs, arrives, price_eur }] }`.
- `TOOLS.find_hotels({near})` → `{ near, hotels: [{ name, distance_km, price_eur }] }`.
- `TOOLS.send_itinerary({to,text})` → `{ status: "sent", to, text }`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "koppla-agent-demo",
  "private": true,
  "scripts": {
    "test": "node --test \"demo/test/*.test.js\""
  }
}
```

- [ ] **Step 2: Write the failing tests**

`demo/test/tools.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { SITES, JOURNEYS, HOTELS, TOOLS, TOOL_DEFS } = require("../tools.js");

const toMinutes = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

test("get_site finds Hamburg-Altona case-insensitively and by substring", () => {
  const exact = TOOLS.get_site({ name: "Hamburg-Altona" });
  assert.equal(exact.address, "Harkortstraße 12, 22765 Hamburg");
  assert.equal(exact.site_manager, "Petra Lindqvist");
  assert.equal(TOOLS.get_site({ name: "hamburg-altona" }).address, exact.address);
  assert.equal(TOOLS.get_site({ name: "Hamburg-Altona construction site" }).address, exact.address);
});

test("get_site returns an error object for unknown or empty names", () => {
  assert.deepEqual(TOOLS.get_site({ name: "Atlantis" }), { error: "No site named Atlantis" });
  assert.ok(TOOLS.get_site({ name: "" }).error);
  assert.ok(TOOLS.get_site({}).error);
});

test("there are four sites", () => {
  assert.equal(SITES.length, 4);
  assert.deepEqual(SITES.map(s => s.name), ["Hamburg-Altona", "Hamburg-Harburg", "Berlin-Spandau", "München-Riem"]);
});

test("find_journeys echoes inputs and returns all 7 rows regardless of input", () => {
  const r = TOOLS.find_journeys({ from: "Berlin", to: "Hamburg" });
  assert.equal(r.from, "Berlin");
  assert.equal(r.to, "Hamburg");
  assert.equal(r.day, "Thursday");
  assert.equal(r.journeys.length, 7);
  assert.deepEqual(r.journeys, JOURNEYS);
  assert.notEqual(r.journeys, JOURNEYS, "must be a copy");
});

test("exactly one journey arrives by 09:00 within 80 €, and it is ICE 1601", () => {
  const valid = JOURNEYS.filter(j => toMinutes(j.arrives) <= toMinutes("09:00") && j.price_eur <= 80);
  assert.deepEqual(valid.map(j => j.train), ["ICE 1601"]);
  assert.equal(valid[0].price_eur, 69);
  assert.equal(valid[0].arrives, "08:45");
});

test("find_hotels echoes input and returns all 8 rows", () => {
  const r = TOOLS.find_hotels({ near: "Harkortstraße 12, 22765 Hamburg" });
  assert.equal(r.near, "Harkortstraße 12, 22765 Hamburg");
  assert.equal(r.hotels.length, 8);
  assert.deepEqual(r.hotels, HOTELS);
});

test("hotels within 2 km and ≤120 €: Altona Park and a dominated runner-up only", () => {
  const valid = HOTELS.filter(h => h.distance_km <= 2 && h.price_eur <= 120);
  assert.deepEqual(valid.map(h => h.name).sort(), ["Hafen Suites", "Hotel Altona Park"]);
  const pick = valid.find(h => h.name === "Hotel Altona Park");
  const other = valid.find(h => h.name === "Hafen Suites");
  assert.ok(pick.price_eur < other.price_eur && pick.distance_km < other.distance_km, "pick must dominate");
});

test("send_itinerary returns sent with echo", () => {
  assert.deepEqual(TOOLS.send_itinerary({ to: "Jonas", text: "hi" }), { status: "sent", to: "Jonas", text: "hi" });
});

test("TOOL_DEFS describe exactly the four tools with strict schemas", () => {
  assert.deepEqual(TOOL_DEFS.map(t => t.name), ["get_site", "find_journeys", "find_hotels", "send_itinerary"]);
  for (const def of TOOL_DEFS) {
    assert.equal(def.type, "function");
    assert.equal(def.strict, true);
    assert.equal(def.parameters.type, "object");
    assert.equal(def.parameters.additionalProperties, false);
    assert.deepEqual(def.parameters.required, Object.keys(def.parameters.properties));
    assert.ok(typeof TOOLS[def.name] === "function", `TOOLS.${def.name} missing`);
    assert.ok(def.description.length > 20);
  }
  assert.deepEqual(Object.keys(TOOL_DEFS[0].parameters.properties), ["name"]);
  assert.deepEqual(Object.keys(TOOL_DEFS[1].parameters.properties), ["from", "to"]);
  assert.deepEqual(Object.keys(TOOL_DEFS[2].parameters.properties), ["near"]);
  assert.deepEqual(Object.keys(TOOL_DEFS[3].parameters.properties), ["to", "text"]);
});

test("descriptions do not leak the answers", () => {
  const all = JSON.stringify(TOOL_DEFS);
  for (const leak of ["1601", "Altona Park", "69", "95"]) assert.ok(!all.includes(leak), `leaks ${leak}`);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../tools.js'`

- [ ] **Step 4: Write `demo/tools.js`**

```js
// tools.js — the "world" the agent acts in. Four mocked tools plus the
// definitions the model sees. Classic script: defines globals in the browser,
// exports for Node (tests). Inputs are echoed but never used to filter —
// every judgement call has to be the model's.

const SITES = [
  { name: "Hamburg-Altona",  address: "Harkortstraße 12, 22765 Hamburg",     site_manager: "Petra Lindqvist", lat: 53.552, lon: 9.935 },
  { name: "Hamburg-Harburg", address: "Schloßmühlendamm 4, 21073 Hamburg",   site_manager: "Tobias Renner",   lat: 53.460, lon: 9.983 },
  { name: "Berlin-Spandau",  address: "Brunsbütteler Damm 75, 13581 Berlin", site_manager: "Aylin Kaya",      lat: 52.535, lon: 13.185 },
  { name: "München-Riem",    address: "Willy-Brandt-Allee 9, 81829 München", site_manager: "Marco Ferretti",  lat: 48.135, lon: 11.698 },
];

// Berlin Hbf → Hamburg Hbf, Thursday. Exactly one row arrives by 09:00 for ≤ 80 €.
const JOURNEYS = [
  { train: "ICE 501",  departs: "05:30", arrives: "07:12", price_eur: 109 },
  { train: "IC 2073",  departs: "05:48", arrives: "08:52", price_eur: 84 },
  { train: "ICE 803",  departs: "06:25", arrives: "08:10", price_eur: 95 },
  { train: "ICE 1601", departs: "06:55", arrives: "08:45", price_eur: 69 },
  { train: "RE 4",     departs: "06:20", arrives: "09:12", price_eur: 39 },
  { train: "FLX 1234", departs: "07:05", arrives: "09:40", price_eur: 24 },
  { train: "ICE 1607", departs: "07:55", arrives: "09:45", price_eur: 59 },
];

// Near Harkortstraße 12. Two rows fit ≤ 2 km and ≤ 120 €; Altona Park dominates.
const HOTELS = [
  { name: "Hotel Altona Park",  distance_km: 1.2, price_eur: 95 },
  { name: "Elbblick Boutique",  distance_km: 0.8, price_eur: 130 },
  { name: "Hafen Suites",       distance_km: 1.9, price_eur: 118 },
  { name: "B&B Ottensen",       distance_km: 1.6, price_eur: 121 },
  { name: "Grand Elbe",         distance_km: 1.4, price_eur: 210 },
  { name: "Ibis Altona",        distance_km: 2.1, price_eur: 89 },
  { name: "Pension Fischmarkt", distance_km: 2.8, price_eur: 65 },
  { name: "Motel Nord",         distance_km: 3.5, price_eur: 79 },
];

/** @type {Record<string, (args: any) => object>} */
const TOOLS = {
  get_site({ name } = {}) {
    const q = String(name || "").trim().toLowerCase();
    if (!q) return { error: "No site named " + (name ?? "") };
    const site = SITES.find(s => {
      const n = s.name.toLowerCase();
      return n.includes(q) || q.includes(n);
    });
    return site ? { ...site } : { error: `No site named ${name}` };
  },
  find_journeys({ from, to } = {}) {
    return { from, to, day: "Thursday", journeys: JOURNEYS.map(j => ({ ...j })) };
  },
  find_hotels({ near } = {}) {
    return { near, hotels: HOTELS.map(h => ({ ...h })) };
  },
  send_itinerary({ to, text } = {}) {
    return { status: "sent", to, text };
  },
};

const str = (description) => ({ type: "string", description });

// These descriptions are exactly what the model sees — and what slide 5 shows.
const TOOL_DEFS = [
  {
    type: "function",
    name: "get_site",
    description: "Look up a Koppla construction site by name. Returns its street address and site manager.",
    parameters: {
      type: "object",
      properties: { name: str("Site name, e.g. Hamburg-Altona") },
      required: ["name"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "find_journeys",
    description: "Find train connections between two cities for Thursday morning. Returns all available options; check arrival times and prices yourself.",
    parameters: {
      type: "object",
      properties: { from: str("Departure city"), to: str("Destination city") },
      required: ["from", "to"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "find_hotels",
    description: "Find hotels near a street address (use the address returned by get_site). Returns all options with distance and price; apply any budget or distance limits yourself.",
    parameters: {
      type: "object",
      properties: { near: str("Street address to search around") },
      required: ["near"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "send_itinerary",
    description: "Send a travel itinerary as a message. `to` is the recipient's name.",
    parameters: {
      type: "object",
      properties: { to: str("Recipient's name"), text: str("The itinerary, as plain text") },
      required: ["to", "text"],
      additionalProperties: false,
    },
    strict: true,
  },
];

if (typeof module !== "undefined") module.exports = { SITES, JOURNEYS, HOTELS, TOOLS, TOOL_DEFS };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all tests in `tools.test.js` PASS (10 passing).

- [ ] **Step 6: Commit**

```bash
git add package.json demo/tools.js demo/test/tools.test.js
git commit -m "feat: mock world — four tools, data and tool definitions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: The agent loop — `agent.js`

**Files:**
- Create: `demo/agent.js`
- Test: `demo/test/agent.test.js`

**Interfaces:**
- Consumes: `TOOLS`, `TOOL_DEFS` from Task 1 (passed in via options — `agent.js` never references them directly).
- Produces globals/exports: `GOAL` (string), `AGENT_DEFAULTS` (object), `EVENT_TYPES` (Set), `messageText(output)`, `summaryText(output)`, `callModel(input, opts)`, `runAgent(goal, emit, options)`, `validateRun(data)`.
- `runAgent(goal, emit, { apiKey, tools, toolDefs, fetchFn?, model?, reasoningEffort?, showSummaries?, maxCycles?, endpoint?, instructions? })` → `Promise<void>`. Calls `emit(event)` with events of the shapes in spec §7 (without `t`; the UI adds `t`). Never throws — any failure becomes an `error` event.
- `validateRun(data)` → returns `data` if it is a non-empty array whose items all have a known `type`, else throws `Error` with a message starting `Not a saved run`.

- [ ] **Step 1: Write the failing tests**

`demo/test/agent.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: `agent.test.js` FAILS with `Cannot find module '../agent.js'`; `tools.test.js` still passes.

- [ ] **Step 3: Write `demo/agent.js`**

```js
// agent.js — the agent loop. No DOM, no Vue, no knowledge of what the tools
// contain. runAgent(goal, emit, options) talks to the OpenAI Responses API with
// plain fetch and reports what happens through emit(event).

const GOAL =
  "Jonas needs to be at the Hamburg-Altona construction site on Thursday by 9:00 and stay one night. " +
  "Train budget 80 €, hotel budget 120 €/night, hotel within 2 km of the site. Send him the itinerary.";

const AGENT_DEFAULTS = {
  model: "gpt-5.6-terra",
  reasoningEffort: "low",
  showSummaries: false,     // adds reasoning.summary = "auto"; may need org verification
  maxCycles: 10,
  endpoint: "https://api.openai.com/v1/responses",
  instructions:
    "You are a travel assistant for Koppla, a construction software company. " +
    "Plan trips for colleagues using the tools available. " +
    "Before every tool call, write one or two plain-language sentences saying what you will do next and why — " +
    "mention any option you are ruling out and the reason. " +
    "Respect every constraint in the request. " +
    "When the itinerary has been sent, reply with a short summary and stop.",
};

const EVENT_TYPES = new Set(["goal", "reasoning", "tool_call", "tool_result", "done", "error"]);

/** Text the model wrote (message items) — the visible "Think" step. */
function messageText(output) {
  return output
    .filter(item => item.type === "message")
    .flatMap(m => m.content || [])
    .filter(part => part.type === "output_text")
    .map(part => part.text)
    .join("\n")
    .trim();
}

/** Reasoning summary text, if the API returned any. */
function summaryText(output) {
  return output
    .filter(item => item.type === "reasoning")
    .flatMap(r => r.summary || [])
    .map(part => part.text)
    .join("\n")
    .trim();
}

/** One call to the Responses API. Returns the parsed response; throws on failure. */
async function callModel(input, opts) {
  const body = {
    model: opts.model,
    instructions: opts.instructions,
    input,
    tools: opts.toolDefs,
    parallel_tool_calls: false,
    reasoning: { effort: opts.reasoningEffort, ...(opts.showSummaries ? { summary: "auto" } : {}) },
  };
  let res;
  try {
    res = await opts.fetchFn(opts.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new Error("Could not reach api.openai.com — check the connection, or Load a saved run.");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err.error && err.error.message) || `HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * The loop. Think → Act → Observe until the model answers without a tool call.
 * @param {string} goal
 * @param {(event: object) => void} emit
 * @param {{ apiKey: string, tools: Record<string, Function>, toolDefs: object[], fetchFn?: Function }} options
 */
async function runAgent(goal, emit, options) {
  const opts = { ...AGENT_DEFAULTS, fetchFn: globalThis.fetch, ...options };
  const input = [{ role: "user", content: goal }];
  emit({ type: "goal", text: goal });
  try {
    for (let cycle = 1; cycle <= opts.maxCycles; cycle++) {
      const res = await callModel(input, opts);
      const text = messageText(res.output);
      const calls = res.output.filter(item => item.type === "function_call");
      if (calls.length === 0) { emit({ type: "done", cycle, text }); return; }

      emit({ type: "reasoning", cycle, text: text || (opts.showSummaries ? summaryText(res.output) : "") });
      input.push(...res.output);                       // keep the history, reasoning items included
      for (const call of calls) {
        const args = JSON.parse(call.arguments);
        emit({ type: "tool_call", cycle, id: call.call_id, name: call.name, args });
        const fn = opts.tools[call.name];
        const output = fn ? fn(args) : { error: `unknown tool ${call.name}` };
        emit({ type: "tool_result", cycle, id: call.call_id, name: call.name, output });
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(output) });
      }
    }
    emit({ type: "error", message: `Stopped after ${opts.maxCycles} cycles` });
  } catch (e) {
    emit({ type: "error", message: e.message });
  }
}

/** Checks a parsed JSON file looks like a saved run. Returns it or throws. */
function validateRun(data) {
  if (!Array.isArray(data) || data.length === 0) throw new Error("Not a saved run: expected a non-empty array of events");
  data.forEach((e, i) => {
    if (!e || typeof e !== "object" || !EVENT_TYPES.has(e.type)) {
      throw new Error(`Not a saved run: item ${i} has unknown type ${e && e.type}`);
    }
  });
  return data;
}

if (typeof module !== "undefined") {
  module.exports = { GOAL, AGENT_DEFAULTS, EVENT_TYPES, messageText, summaryText, callModel, runAgent, validateRun };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: all tests PASS (10 in tools, 14 in agent).

- [ ] **Step 5: Commit**

```bash
git add demo/agent.js demo/test/agent.test.js
git commit -m "feat: hand-written agent loop over the Responses API

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Live check script against the real API

**Files:**
- Create: `demo/test/live-check.js`

**Interfaces:**
- Consumes: `TOOLS`, `TOOL_DEFS` (Task 1); `GOAL`, `runAgent` (Task 2).
- Produces: a CLI. `OPENAI_API_KEY=sk-... node demo/test/live-check.js [--save <path>]` prints every event as JSON lines, then a checklist; exit code 0 if all checks pass, 1 otherwise, 2 if the key is missing. `--save` writes the events (with `t`) to the given path.

- [ ] **Step 1: Write `demo/test/live-check.js`**

```js
#!/usr/bin/env node
// Real run against the OpenAI API with the acceptance checks from the spec.
// Usage: OPENAI_API_KEY=sk-... node demo/test/live-check.js [--save demo/runs/good-run.json]
const fs = require("node:fs");
const { TOOLS, TOOL_DEFS } = require("../tools.js");
const { GOAL, runAgent } = require("../agent.js");

async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) { console.error("Set OPENAI_API_KEY in the environment."); process.exit(2); }
  const saveIdx = process.argv.indexOf("--save");
  const savePath = saveIdx > -1 ? process.argv[saveIdx + 1] : null;

  const events = [];
  const t0 = Date.now();
  await runAgent(GOAL, e => {
    const ev = { ...e, t: Date.now() - t0 };
    events.push(ev);
    console.log(JSON.stringify(ev));
  }, { apiKey, tools: TOOLS, toolDefs: TOOL_DEFS });

  const order = events.filter(e => e.type === "tool_call").map(e => e.name);
  const done = events.find(e => e.type === "done");
  const sent = events.find(e => e.type === "tool_result" && e.name === "send_itinerary");
  const finalText = ((sent && sent.output.text) || "") + "\n" + ((done && done.text) || "");
  const reasoningTexts = events.filter(e => e.type === "reasoning").map(e => e.text);

  const checks = {
    "no error event": !events.some(e => e.type === "error"),
    "tool order get_site → find_journeys → find_hotels → send_itinerary": JSON.stringify(order) === JSON.stringify(["get_site", "find_journeys", "find_hotels", "send_itinerary"]),
    "every reasoning card has text": reasoningTexts.length > 0 && reasoningTexts.every(t => t.trim().length > 0),
    "picked ICE 1601 (08:45, 69 €)": /ICE 1601|08:45/.test(finalText),
    "picked Hotel Altona Park": /Altona Park/.test(finalText),
    "done summary present": Boolean(done && done.text.trim()),
  };

  console.log("\n--- checks ---");
  let ok = true;
  for (const [name, pass] of Object.entries(checks)) {
    console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
    ok = ok && pass;
  }
  console.log(`elapsed: ${((Date.now() - t0) / 1000).toFixed(1)} s, cycles: ${done ? done.cycle : "-"}`);

  if (savePath) {
    fs.writeFileSync(savePath, JSON.stringify(events, null, 2) + "\n");
    console.log(`saved ${events.length} events to ${savePath}`);
  }
  process.exit(ok ? 0 : 1);
}

main();
```

- [ ] **Step 2: Verify the script refuses to run without a key**

Run: `node demo/test/live-check.js; echo "exit $?"`
Expected: `Set OPENAI_API_KEY in the environment.` and `exit 2`.

- [ ] **Step 3: Run it for real, three times (requires the user's key)**

Run: `OPENAI_API_KEY=sk-... node demo/test/live-check.js` three times.

If `OPENAI_API_KEY` is not available to the implementer, **do not skip silently**: mark this step as "needs the user to run" in the task report and continue with Task 4 (the UI can be built and verified with the fixture). The user runs it as `! OPENAI_API_KEY=sk-... node demo/test/live-check.js`.

Expected: all six checks `PASS` on all three runs, `cycles: 5` (four tool cycles + the done turn).

If a check fails, tune in this order and re-run — never encode the answer:
- model skips `get_site` → strengthen `find_hotels`' description ("Requires the street address returned by get_site").
- empty reasoning text on some cycle → add to `instructions`: "Always write the sentence as a normal message before the tool call, even when the next step is obvious." If it still happens, set `showSummaries: true` and test on this account.
- wrong pick → check the data tables against spec §5 first (a typo there is the usual cause).
- 401 → key; 4xx mentioning `gpt-5.6-terra` → check https://developers.openai.com/api/docs/models and update `AGENT_DEFAULTS.model`.

- [ ] **Step 4: Commit**

```bash
git add demo/test/live-check.js
git commit -m "test: live acceptance check against the real API

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: The UI — `index.html`, vendored Vue, fixture run

**Files:**
- Create: `demo/vendor/vue.global.prod.js` (downloaded)
- Create: `demo/runs/sample-run.json` (hand-written fixture)
- Create: `demo/index.html`

**Interfaces:**
- Consumes globals: `TOOLS`, `TOOL_DEFS` (Task 1); `GOAL`, `runAgent`, `validateRun` (Task 2); `Vue` (vendor).
- Produces: the page. No exports.

- [ ] **Step 1: Vendor Vue**

```bash
mkdir -p demo/vendor demo/runs
curl -L -o demo/vendor/vue.global.prod.js https://unpkg.com/vue@3.5.42/dist/vue.global.prod.js
head -c 200 demo/vendor/vue.global.prod.js; echo; ls -la demo/vendor
```
Expected: the file starts with `/**` or `var Vue=function(` and is roughly 150–170 KB. It must be the `vue.global.prod.js` build (includes the template compiler; `vue.runtime.global.prod.js` would not compile in-DOM templates).

- [ ] **Step 2: Write the fixture `demo/runs/sample-run.json`**

A plausible full run so the UI can be built and checked without a key. Replaced by a real recording as `good-run.json` in Task 5 (keep both).

```json
[
  { "type": "goal", "text": "Jonas needs to be at the Hamburg-Altona construction site on Thursday by 9:00 and stay one night. Train budget 80 €, hotel budget 120 €/night, hotel within 2 km of the site. Send him the itinerary.", "t": 0 },
  { "type": "reasoning", "cycle": 1, "text": "I need the exact address of the Hamburg-Altona site before I can look for trains and hotels nearby.", "t": 2100 },
  { "type": "tool_call", "cycle": 1, "id": "call_1", "name": "get_site", "args": { "name": "Hamburg-Altona" }, "t": 2101 },
  { "type": "tool_result", "cycle": 1, "id": "call_1", "name": "get_site", "output": { "name": "Hamburg-Altona", "address": "Harkortstraße 12, 22765 Hamburg", "site_manager": "Petra Lindqvist", "lat": 53.552, "lon": 9.935 }, "t": 2102 },
  { "type": "reasoning", "cycle": 2, "text": "Now I'll look for trains from Berlin to Hamburg. Jonas must arrive by 9:00 and the budget is 80 €.", "t": 4600 },
  { "type": "tool_call", "cycle": 2, "id": "call_2", "name": "find_journeys", "args": { "from": "Berlin", "to": "Hamburg" }, "t": 4601 },
  { "type": "tool_result", "cycle": 2, "id": "call_2", "name": "find_journeys", "output": { "from": "Berlin", "to": "Hamburg", "day": "Thursday", "journeys": [
    { "train": "ICE 501", "departs": "05:30", "arrives": "07:12", "price_eur": 109 },
    { "train": "IC 2073", "departs": "05:48", "arrives": "08:52", "price_eur": 84 },
    { "train": "ICE 803", "departs": "06:25", "arrives": "08:10", "price_eur": 95 },
    { "train": "ICE 1601", "departs": "06:55", "arrives": "08:45", "price_eur": 69 },
    { "train": "RE 4", "departs": "06:20", "arrives": "09:12", "price_eur": 39 },
    { "train": "FLX 1234", "departs": "07:05", "arrives": "09:40", "price_eur": 24 },
    { "train": "ICE 1607", "departs": "07:55", "arrives": "09:45", "price_eur": 59 }
  ] }, "t": 4602 },
  { "type": "reasoning", "cycle": 3, "text": "The RE 4, FLX 1234 and ICE 1607 all arrive after 9:00, and the ICE 501, IC 2073 and ICE 803 are over the 80 € budget. ICE 1601 at 69 € arriving 08:45 is the one that fits. Next, hotels near the site.", "t": 8200 },
  { "type": "tool_call", "cycle": 3, "id": "call_3", "name": "find_hotels", "args": { "near": "Harkortstraße 12, 22765 Hamburg" }, "t": 8201 },
  { "type": "tool_result", "cycle": 3, "id": "call_3", "name": "find_hotels", "output": { "near": "Harkortstraße 12, 22765 Hamburg", "hotels": [
    { "name": "Hotel Altona Park", "distance_km": 1.2, "price_eur": 95 },
    { "name": "Elbblick Boutique", "distance_km": 0.8, "price_eur": 130 },
    { "name": "Hafen Suites", "distance_km": 1.9, "price_eur": 118 },
    { "name": "B&B Ottensen", "distance_km": 1.6, "price_eur": 121 },
    { "name": "Grand Elbe", "distance_km": 1.4, "price_eur": 210 },
    { "name": "Ibis Altona", "distance_km": 2.1, "price_eur": 89 },
    { "name": "Pension Fischmarkt", "distance_km": 2.8, "price_eur": 65 },
    { "name": "Motel Nord", "distance_km": 3.5, "price_eur": 79 }
  ] }, "t": 8202 },
  { "type": "reasoning", "cycle": 4, "text": "Elbblick, B&B Ottensen and Grand Elbe are over 120 €; Ibis Altona, Pension Fischmarkt and Motel Nord are more than 2 km away. Hotel Altona Park at 1.2 km and 95 € is the best fit. I'll send Jonas the itinerary.", "t": 12900 },
  { "type": "tool_call", "cycle": 4, "id": "call_4", "name": "send_itinerary", "args": { "to": "Jonas", "text": "Thursday: ICE 1601, Berlin Hbf 06:55 → Hamburg Hbf 08:45 (69 €). Hotel Altona Park, 1.2 km from the site, 95 €/night. Site: Harkortstraße 12, 22765 Hamburg — site manager Petra Lindqvist." }, "t": 12901 },
  { "type": "tool_result", "cycle": 4, "id": "call_4", "name": "send_itinerary", "output": { "status": "sent", "to": "Jonas", "text": "Thursday: ICE 1601, Berlin Hbf 06:55 → Hamburg Hbf 08:45 (69 €). Hotel Altona Park, 1.2 km from the site, 95 €/night. Site: Harkortstraße 12, 22765 Hamburg — site manager Petra Lindqvist." }, "t": 12902 },
  { "type": "done", "cycle": 5, "text": "Itinerary sent to Jonas: ICE 1601 arriving Hamburg 08:45 for 69 € and one night at Hotel Altona Park (1.2 km, 95 €). Both within budget.", "t": 15400 }
]
```

Verify it parses and validates:
```bash
node -e 'const {validateRun}=require("./demo/agent.js"); console.log(validateRun(require("./demo/runs/sample-run.json")).length, "events ok")'
```
Expected: `14 events ok`.

- [ ] **Step 3: Write `demo/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>What is an agent? — Koppla demo</title>
<style>
  :root {
    --bg: #0f1117; --panel: #161923; --line: #2a2d3a; --text: #e8e8ec; --muted: #9aa0ad;
    --think: #c9a3ff; --think-bg: #1e1a2e; --think-line: #4a3b7a;
    --act: #ffd27a; --act-bg: #1a1d27; --act-line: #3a3d4a;
    --obs: #7fd6a8; --obs-bg: #12211a; --obs-line: #2f6b4a;
    --done-bg: #1b2a3a; --done-line: #2f6fed;
    --err: #ff8a8a; --err-bg: #2e1616; --err-line: #7a3b3b;
    --accent: #2f6fed;
  }
  * { box-sizing: border-box; }
  html { font-size: 20px; }
  body { margin: 0; background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.45; }
  #app { max-width: 1600px; margin: 0 auto; padding: 1rem 1.5rem 3rem; }

  header { display: flex; justify-content: space-between; gap: 1.5rem; align-items: flex-start; padding-bottom: 0.9rem; border-bottom: 1px solid var(--line); }
  .goal { max-width: 60%; font-size: 1.05rem; }
  .label { display: block; font-size: 0.65rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-bottom: 0.2rem; }
  .controls { display: flex; flex-direction: column; align-items: flex-end; gap: 0.45rem; }
  .controls input[type=password] { width: 22rem; background: var(--panel); border: 1px solid var(--act-line); color: var(--text); padding: 0.4rem 0.6rem; border-radius: 6px; font-size: 0.8rem; }
  .buttons { display: flex; gap: 0.4rem; }
  button { background: var(--panel); border: 1px solid var(--act-line); color: var(--text); padding: 0.45rem 0.9rem; border-radius: 6px; font-size: 0.8rem; cursor: pointer; }
  button.primary { background: var(--accent); border-color: var(--accent); font-weight: 600; }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  .hint { font-size: 0.7rem; color: var(--muted); }

  .statusbar { display: flex; justify-content: space-between; align-items: center; padding: 0.7rem 0; color: var(--muted); font-size: 0.85rem; }
  .statusbar strong { color: var(--text); font-size: 1.1rem; }
  .indicator { padding: 0.15rem 0.7rem; border-radius: 999px; font-size: 0.7rem; border: 1px solid var(--line); }
  .indicator.running { color: var(--think); border-color: var(--think-line); animation: pulse 1.2s ease-in-out infinite; }
  .indicator.replaying { color: var(--act); border-color: var(--act-line); }
  .indicator.done { color: var(--obs); border-color: var(--obs-line); }
  .indicator.error { color: var(--err); border-color: var(--err-line); }
  @keyframes pulse { 50% { opacity: 0.45; } }

  main { display: grid; grid-template-columns: 1fr 4rem 1fr; column-gap: 0.5rem; row-gap: 0.6rem; align-items: start; }
  .colhead { font-size: 0.65rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); padding-bottom: 0.3rem; }
  .colhead.left { color: var(--think); } .colhead.right { color: var(--obs); }

  .card { border-radius: 10px; padding: 0.7rem 0.9rem; font-size: 0.9rem; animation: appear 0.25s ease-out; }
  @keyframes appear { from { opacity: 0; transform: translateY(6px); } }
  .tag { display: block; font-size: 0.6rem; letter-spacing: 0.1em; text-transform: uppercase; opacity: 0.8; margin-bottom: 0.25rem; }
  .think { background: var(--think-bg); border: 1px solid var(--think-line); } .think .tag { color: var(--think); }
  .act { background: var(--act-bg); border: 1px solid var(--act-line); font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.8rem; word-break: break-word; } .act .tag { color: var(--act); } .act b { color: var(--act); }
  .observe { background: var(--obs-bg); border: 1px solid var(--obs-line); } .observe .tag { color: var(--obs); }
  .done { background: var(--done-bg); border: 1px solid var(--done-line); } .done .tag { color: #8fb3ff; }
  .error { background: var(--err-bg); border: 1px solid var(--err-line); color: var(--err); grid-column: 1 / -1; }
  .cell.empty { min-height: 0; }

  .gutter { display: flex; align-items: center; justify-content: center; min-height: 3rem; font-size: 1.6rem; }
  .arrow.right { color: var(--act); animation: slideRight 0.9s ease-out; }
  .arrow.left { color: var(--obs); animation: slideLeft 0.9s ease-out; }
  @keyframes slideRight { from { transform: translateX(-2rem); opacity: 0; } }
  @keyframes slideLeft { from { transform: translateX(2rem); opacity: 0; } }

  table { width: 100%; border-collapse: collapse; font-size: 0.8rem; margin-top: 0.3rem; }
  th, td { text-align: left; padding: 0.15rem 0.4rem; border-bottom: 1px solid var(--obs-line); }
  th { color: var(--obs); font-weight: 600; font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.06em; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 0.15rem 0.8rem; margin: 0.3rem 0 0; font-size: 0.85rem; }
  dt { color: var(--muted); } dd { margin: 0; }
  pre { white-space: pre-wrap; font-family: inherit; margin: 0.3rem 0 0; }
  .sent { color: var(--obs); font-weight: 600; margin-top: 0.4rem; }
  .cursor { display: inline-block; width: 0.5rem; height: 1rem; background: var(--think); vertical-align: text-bottom; margin-left: 2px; animation: blink 1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  .empty-state { grid-column: 1 / -1; color: var(--muted); text-align: center; padding: 3rem 0; font-size: 0.9rem; }
</style>
</head>
<body>
<div id="app">
  <header>
    <div class="goal"><span class="label">Goal</span>{{ goal }}</div>
    <div class="controls">
      <input type="password" v-model="apiKey" placeholder="OpenAI API key (kept in memory only)" autocomplete="off" spellcheck="false">
      <div class="buttons">
        <button class="primary" :disabled="!apiKey || busy" @click="start">Start</button>
        <button :disabled="events.length === 0 || busy" @click="saveRun">Save run</button>
        <button :disabled="busy" @click="$refs.file.click()">Load run</button>
        <input ref="file" type="file" accept=".json,application/json" hidden @change="loadRun">
        <button :disabled="status === 'running'" @click="reset">Reset</button>
      </div>
      <div class="hint" v-if="!apiKey">Enter an API key to Start, or Load a saved run.</div>
    </div>
  </header>

  <div class="statusbar">
    <div>Cycle <strong>{{ cycle }}</strong> · Think → Act → Observe</div>
    <div class="indicator" :class="status">{{ statusLabel }}</div>
  </div>

  <main>
    <div class="colhead left">Model</div>
    <div class="colhead"></div>
    <div class="colhead right">Your code</div>

    <div v-if="rows.length === 0" class="empty-state">Press Start to run the agent, or Load a saved run.</div>

    <template v-for="row in rows" :key="row.key">
      <template v-if="row.error">
        <div class="card error"><span class="tag">Error</span>{{ row.error.message }}</div>
      </template>
      <template v-else>
        <!-- Think row -->
        <div class="cell" v-if="row.reasoning">
          <div class="card think"><span class="tag">Think</span><typewriter :text="row.reasoning.text || '(no explanation given)'"></typewriter></div>
        </div>
        <div class="cell empty" v-if="row.reasoning"></div>
        <div class="cell empty" v-if="row.reasoning"></div>

        <!-- Act / Observe row -->
        <div class="cell" v-if="row.call">
          <div class="card act"><span class="tag">Act · tool request</span><b>{{ row.call.name }}</b>({{ fmtArgs(row.call.args) }})</div>
        </div>
        <div class="cell gutter" v-if="row.call">
          <span v-if="row.result" class="arrow left">⬅</span>
          <span v-else class="arrow right">➜</span>
        </div>
        <div class="cell" v-if="row.call">
          <div class="card observe" v-if="row.result">
            <span class="tag">Observe · result of {{ row.result.name }}</span>
            <tool-result :name="row.result.name" :output="row.result.output"></tool-result>
          </div>
        </div>

        <!-- Done row -->
        <div class="cell" v-if="row.done">
          <div class="card done"><span class="tag">Done</span><typewriter :text="row.done.text"></typewriter></div>
        </div>
        <div class="cell empty" v-if="row.done"></div>
        <div class="cell empty" v-if="row.done"></div>
      </template>
    </template>
  </main>
</div>

<script src="vendor/vue.global.prod.js"></script>
<script src="tools.js"></script>
<script src="agent.js"></script>
<script>
  const REPLAY_DELAY_MS = 1500;
  const MAX_TYPE_MS = 3000;        // a whole card finishes typing within this
  const CHAR_MS = 33;              // ~30 chars/s ceiling

  const Typewriter = {
    props: { text: { type: String, default: "" } },
    data() { return { shown: "" }; },
    mounted() {
      const delay = Math.min(CHAR_MS, MAX_TYPE_MS / Math.max(1, this.text.length));
      let i = 0;
      const tick = () => {
        i += 1;
        this.shown = this.text.slice(0, i);
        if (i < this.text.length) this.timer = setTimeout(tick, delay);
      };
      tick();
    },
    unmounted() { clearTimeout(this.timer); },
    template: `<span>{{ shown }}<span v-if="shown.length < text.length" class="cursor"></span></span>`,
  };

  const ToolResult = {
    props: { name: String, output: Object },
    template: `
      <div>
        <div v-if="output && output.error" class="error-text">⚠ {{ output.error }}</div>
        <table v-else-if="name === 'find_journeys'">
          <tr><th>Train</th><th>Departs</th><th>Arrives</th><th>Price</th></tr>
          <tr v-for="j in output.journeys" :key="j.train"><td>{{ j.train }}</td><td>{{ j.departs }}</td><td>{{ j.arrives }}</td><td class="num">{{ j.price_eur }} €</td></tr>
        </table>
        <table v-else-if="name === 'find_hotels'">
          <tr><th>Hotel</th><th>Distance</th><th>Per night</th></tr>
          <tr v-for="h in output.hotels" :key="h.name"><td>{{ h.name }}</td><td class="num">{{ h.distance_km.toFixed(1) }} km</td><td class="num">{{ h.price_eur }} €</td></tr>
        </table>
        <dl v-else-if="name === 'get_site'">
          <dt>Site</dt><dd>{{ output.name }}</dd>
          <dt>Address</dt><dd>{{ output.address }}</dd>
          <dt>Site manager</dt><dd>{{ output.site_manager }}</dd>
        </dl>
        <div v-else-if="name === 'send_itinerary'">
          <pre>{{ output.text }}</pre>
          <div class="sent">✓ sent to {{ output.to }}</div>
        </div>
        <pre v-else>{{ JSON.stringify(output, null, 2) }}</pre>
      </div>`,
  };

  Vue.createApp({
    components: { typewriter: Typewriter, "tool-result": ToolResult },
    data() {
      return { goal: GOAL, apiKey: "", events: [], status: "idle", runId: 0 };
    },
    computed: {
      busy() { return this.status === "running" || this.status === "replaying"; },
      cycle() { return this.events.reduce((m, e) => Math.max(m, e.cycle || 0), 0); },
      statusLabel() {
        return { idle: "ready", running: "thinking…", replaying: "replaying…", done: "done", error: "error" }[this.status];
      },
      rows() {
        const byCycle = new Map();
        const rows = [];
        for (const e of this.events) {
          if (e.type === "goal") continue;
          if (e.type === "error") { rows.push({ key: "error-" + rows.length, error: e }); continue; }
          let row = byCycle.get(e.cycle);
          if (!row) { row = { key: "cycle-" + e.cycle, cycle: e.cycle }; byCycle.set(e.cycle, row); rows.push(row); }
          if (e.type === "reasoning") row.reasoning = e;
          else if (e.type === "tool_call") row.call = e;
          else if (e.type === "tool_result") row.result = e;
          else if (e.type === "done") row.done = e;
        }
        return rows;
      },
    },
    methods: {
      fmtArgs(args) {
        return Object.entries(args || {})
          .map(([k, v]) => `${k}: ${JSON.stringify(typeof v === "string" && v.length > 120 ? v.slice(0, 120) + "…" : v)}`)
          .join(", ");
      },
      async start() {
        const runId = ++this.runId;
        this.events = [];
        this.status = "running";
        const t0 = Date.now();
        await runAgent(this.goal, e => { if (runId === this.runId) this.events.push({ ...e, t: Date.now() - t0 }); },
          { apiKey: this.apiKey, tools: TOOLS, toolDefs: TOOL_DEFS });
        if (runId === this.runId) this.status = this.events.some(e => e.type === "error") ? "error" : "done";
      },
      saveRun() {
        const blob = new Blob([JSON.stringify(this.events, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `run-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      },
      async loadRun(ev) {
        const file = ev.target.files[0];
        ev.target.value = "";
        if (!file) return;
        let data;
        try { data = validateRun(JSON.parse(await file.text())); }
        catch (e) { this.events = [{ type: "error", message: e.message, t: 0 }]; this.status = "error"; return; }
        const runId = ++this.runId;
        this.events = [];
        this.status = "replaying";
        for (const e of data) {
          if (runId !== this.runId) return;
          this.events.push(e);
          await new Promise(r => setTimeout(r, REPLAY_DELAY_MS));
        }
        if (runId === this.runId) this.status = data.some(e => e.type === "error") ? "error" : "done";
      },
      reset() {
        this.runId += 1;
        this.events = [];
        this.status = "idle";
      },
    },
  }).mount("#app");
</script>
</body>
</html>
```

- [ ] **Step 4: Manual check via replay (no key needed)**

Open `demo/index.html` directly from disk (double-click, or `open demo/index.html` on macOS). Then:

1. Page renders: goal in the header, key field, four buttons (Start disabled with the hint), status `Cycle 0 · Think → Act → Observe` / `ready`, empty-state text.
2. Click **Load run**, pick `demo/runs/sample-run.json`. Expected: indicator `replaying…`; cards appear every 1.5 s; Think cards type themselves; Act cards show `get_site({ name: "Hamburg-Altona" })` with a ➜ arrow; when the result arrives the arrow becomes ⬅ and the Observe card shows a key/value list (get_site), a 7-row table (journeys), an 8-row table (hotels), the itinerary text + "✓ sent to Jonas"; cycle counter reaches 5; Done card; indicator `done`.
3. Click **Reset** mid-replay: cards clear, status `ready`, no further cards appear.
4. Load a non-run file (e.g. `package.json`): a red full-width Error card reading `Not a saved run: …`.
5. Open DevTools console: no errors or warnings.
6. Resize to 1280×720: nothing overflows horizontally; the tables remain readable.

If `Load run` fails on `file://` in the browser being used, note it — the `<input type=file>` + `file.text()` path works in Chrome, Safari and Firefox from disk; if it doesn't, fall back to `python3 -m http.server` for the check and record that in the README.

- [ ] **Step 5: Manual check of the live path (needs the key — otherwise defer to Task 5)**

Enter the key, click **Start**. Expected: indicator `thinking…` pulsing, cards appear as each API call returns, four cycles, Done. Then **Save run** downloads `run-<timestamp>.json`; **Reset**; **Load run** with that file replays identically.

- [ ] **Step 6: Commit**

```bash
git add demo/index.html demo/vendor/vue.global.prod.js demo/runs/sample-run.json
git commit -m "feat: two-column demo UI with replay

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: README, real recording, portability check

**Files:**
- Create: `README.md`
- Create: `demo/runs/good-run.json` (recorded — needs the key)

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write `README.md`**

````markdown
# What is an agent? — Koppla Lunch & Learn demo

A travel-planning agent you can watch think. The tools are fake (fixed data);
every decision — which tool to call, which train, which hotel — comes from a
live OpenAI model call. Built for a 15-minute talk; the audience sees only the
running page.

```
demo/index.html     the demo — open it from disk
demo/tools.js       the mocked "world": four tools and their descriptions
demo/agent.js       the agent loop (~25 lines of runAgent) and the API call
demo/runs/          saved runs for offline replay
slides/             the deck (built separately with frontend-slides)
```

## Run it

1. Clone the repo. No install, no build.
2. Open `demo/index.html` in Chrome, Safari or Firefox (double-click it).
3. Paste an OpenAI API key into the field. It stays in memory only — never
   stored, never sent anywhere but api.openai.com.
4. Press **Start**. Watch the loop: Think (left) → Act (left, arrow) →
   Observe (right, arrow back) → … → Done.

Buttons: **Start** runs the agent · **Save run** downloads the run as JSON ·
**Load run** replays a JSON file with no API call · **Reset** clears.

## Before the talk — work-laptop checklist (do this the day before)

1. Fresh clone, open `demo/index.html`, **Load run** → `demo/runs/good-run.json`.
   This must work with no network. It is your fallback on the day.
2. Enter the key, **Start**. If it runs: done.
3. If Start fails with "Could not reach api.openai.com" (a proxy or browser
   policy blocking calls from a page opened from disk), serve the folder
   instead — no install needed:
   ```
   cd demo && python3 -m http.server 8000
   ```
   then open http://localhost:8000/ and try again.
4. If it still fails, present with **Load run** and `good-run.json`. The
   cards, pacing and typewriter are identical; only the "thinking…" wait is
   replaced by a fixed 1.5 s delay.

Keep a second browser tab with `good-run.json` already loaded during the talk.

## Recording a fresh good run

```
OPENAI_API_KEY=sk-... node demo/test/live-check.js --save demo/runs/good-run.json
```
This runs the real loop, prints every event, and checks the acceptance
criteria (tool order, non-empty reasoning, ICE 1601 and Hotel Altona Park
picked). Run it a few times; all checks should pass every time.

## Tests

```
npm test
```
Node 18+ (uses the built-in test runner). Tests cover the mock world, the loop
(with a fake `fetch`), and the saved-run validator. No key needed.

## Model settings

Top of `demo/agent.js`, `AGENT_DEFAULTS`: model id, reasoning effort,
whether to request reasoning summaries (off — may need org verification),
max cycles, and the system prompt. Nothing in the prompt or data tells the
model which option to pick; if a run makes a different choice, tune the
wording or the data, not the answer.
````

- [ ] **Step 2: Record the real run (needs the key)**

Run: `OPENAI_API_KEY=sk-... node demo/test/live-check.js --save demo/runs/good-run.json`
Expected: all checks PASS, `saved N events to demo/runs/good-run.json`.

If the key is not available to the implementer, stop here, report "Task 5 step 2–4 need the user's key", and leave `good-run.json` absent. The user runs the command above with `!`, then `git add demo/runs/good-run.json && git commit`.

- [ ] **Step 3: Replay the real recording offline**

Open `demo/index.html`, DevTools → Network → **Offline**, **Load run** → `demo/runs/good-run.json`. Expected: full replay, no console errors, Done card matches the recorded summary.

- [ ] **Step 4: Fresh-clone check**

```bash
rm -rf /tmp/koppla-clone && git clone -q "$(pwd)" /tmp/koppla-clone && cd /tmp/koppla-clone && npm test && ls demo/vendor demo/runs
```
Expected: tests pass; `vue.global.prod.js`, `sample-run.json`, `good-run.json` listed. Open `/tmp/koppla-clone/demo/index.html` and replay `good-run.json` once more.

- [ ] **Step 5: Commit**

```bash
git add README.md demo/runs/good-run.json
git commit -m "docs: README with work-laptop checklist; record known-good run

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## After this plan

Part B (slides) is a separate session: run `/frontend-slides:frontend-slides` with the brief in spec §9, pasting the four tool descriptions from `demo/tools.js` and the goal from `demo/agent.js`, output into `slides/`. Then push the repo to GitHub.
