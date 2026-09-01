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
  const data = await res.json();
  if (!Array.isArray(data.output)) {
    throw new Error((data.error && data.error.message) || `Unexpected response (status ${data.status})`);
  }
  return data;
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
