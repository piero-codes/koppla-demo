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

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9äöüß]/g, "");

/** @type {Record<string, (args: any) => object>} */
const TOOLS = {
  get_site({ name } = {}) {
    const q = String(name || "").trim().toLowerCase();
    if (!q) return { error: "No site named " + (name ?? "") };
    const nq = norm(q);
    const site = SITES.find(s => {
      const n = norm(s.name);
      return n.includes(nq) || nq.includes(n);
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
