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
