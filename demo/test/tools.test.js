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
  assert.equal(TOOLS.get_site({ name: "Hamburg Altona" }).address, exact.address);
  assert.equal(TOOLS.get_site({ name: "hamburg altona site" }).address, exact.address);
  assert.equal(TOOLS.get_site({ name: "Hamburg–Altona" }).address, exact.address);
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
