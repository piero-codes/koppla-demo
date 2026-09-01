# "What is an agent?" — Lunch & Learn demo — design

Date: 2026-09-01
Status: approved in brainstorming, ready for implementation planning

## 1. Purpose

A 15-minute Lunch & Learn at Koppla (construction software, ~40 people, mostly
non-technical) explaining what an AI agent is. Earlier sessions covered what an
LLM is (tokens, context) and a quick look at Claude Code. This session explains
the **agent loop** and **tools** at a conceptual level, with a live visual demo.
The audience never sees code, only the running UI.

Two deliverables, one repo:

- **Part A (this spec):** a single-page demo — a travel-planning agent. Tools
  return mocked data; every decision comes from a live OpenAI call. *The world
  is fake, the agent is real.*
- **Part B (brief in §9):** an HTML slide deck built with `frontend-slides`
  after Part A is finished.

The repo is built on a personal Mac, pushed to GitHub, and cloned onto a work
laptop for the talk. Everything must run there without setup.

## 2. Decisions made during brainstorming

| Topic | Decision | Why |
|---|---|---|
| Reasoning display | Reasoning model at low effort; the visible "Think" step is the plain-text preamble the model writes before each tool call. Reasoning summaries off by default, one-line toggle as fallback. | Summaries may be empty for easy steps and may need org verification; the preamble is the model's own words and appears every cycle. |
| Tool parameters | No filter params (`arrive_by`, `max_price` dropped). Tools return all options. | If code filtered, the judgement calls would not be the model's. |
| Parallel tool calls | `parallel_tool_calls: false` | Clean Think → Act → Observe per cycle; matches the slide. |
| Permission gate | None. `send_itinerary` runs like any tool. | Keep the demo purely about the loop. Slides 7/8 adjusted (§9). |
| Pacing | No Next button, no manual pacing. Cards appear as events happen; "thinking…" indicator while waiting. Within a cycle the tools run synchronously, so the UI reveals consecutive cards with a short automatic stagger (~0.8 s) — otherwise Think, Act and Observe would paint in one frame and the loop would be invisible live. | Simpler; the latency *is* the model thinking; the stagger keeps Think → Act → Observe visible. |
| History | Loop keeps the `input` list itself and appends output items + tool results each cycle (no `previous_response_id`). | Shows the context growing; provider-agnostic; slide-able. |
| Code structure | Three separate blocks in one file: `tools`, `runAgent(goal, emit)`, Vue app. | Loop is pure, testable from the console, and readable on a slide. |
| Portability | Vue vendored (no CDN). A known-good run committed for offline replay. | Work laptop may block CDNs or the API. |
| Mock data | Realistic volume (7 journeys, 8 hotels, 4 sites) with **exactly one option satisfying all constraints** (plus at most a dominated runner-up). | Realism without run-to-run variance. |

## 3. Repository layout

```
koppla-demo/
  README.md                       how to run; work-laptop checklist; fallbacks
  .gitignore                      .superpowers/
  package.json                    only a "test" script (node --test); no dependencies
  docs/superpowers/specs/         this file
  demo/
    index.html                    styles + Vue app (UI only); loads the three scripts below
    tools.js                      mock data, TOOLS functions, TOOL_DEFS schemas
    agent.js                      GOAL, model constants, callModel, runAgent, validateRun
    vendor/vue.global.prod.js     pinned Vue 3 production build
    runs/sample-run.json          hand-written fixture for building/checking the UI
    runs/good-run.json            real recording for offline replay
    test/                         node --test unit tests + live-check.js (real API)
  slides/                         Part B output (later)
```

The three scripts are plain classic `<script src>` files (no ES modules — they
are blocked on `file://`). `tools.js` and `agent.js` also `module.exports`
under Node so the loop and tools are unit-tested without a browser, and
`agent.js` is the file to show on a slide. (Brainstorming said "one file"; the
split keeps every constraint — opens from disk, no build — and buys tests.)

Constraints: plain JavaScript (JSDoc types allowed, no build step), no agent
frameworks or SDKs, plain `fetch` to the API. Opens from disk via `file://`.
The API key is a password input kept in memory only — never hard-coded, never
persisted.

## 4. Goal and system prompt

Goal (hard-coded, displayed in the header):

> Jonas needs to be at the Hamburg-Altona construction site on Thursday by
> 9:00 and stay one night. Train budget 80 €, hotel budget 120 €/night, hotel
> within 2 km of the site. Send him the itinerary.

System prompt (draft; tune during testing, never to name the "right" answers):

> You are a travel assistant for Koppla, a construction software company. Plan
> trips for colleagues using the tools available. Before every tool call, write
> one or two plain-language sentences saying what you will do next and why —
> mention any option you are ruling out and the reason. Respect every
> constraint in the request. When the itinerary has been sent, reply with a
> short summary and stop.

## 5. Tools and mock data

`tools` is an object of four plain functions. `toolDefs` is the matching array
of function definitions sent to the API. The descriptions below are the exact
text the model sees and the text slide 5 shows.

| Tool | Params | Description given to the model |
|---|---|---|
| `get_site` | `{ name }` | Look up a Koppla construction site by name. Returns its street address and site manager. |
| `find_journeys` | `{ from, to }` | Find train connections between two cities for Thursday morning. Returns all available options; check arrival times and prices yourself. |
| `find_hotels` | `{ near }` | Find hotels near a street address (use the address returned by `get_site`). Returns all options with distance and price; apply any budget or distance limits yourself. |
| `send_itinerary` | `{ to, text }` | Send a travel itinerary as a message. `to` is the recipient's name. |

All params are required strings. Mocks are synchronous and deterministic.

**`get_site`** — case-insensitive lookup by name (substring match is fine).
Unknown name → `{ error: "No site named <name>" }`.

| name | address | site_manager | lat, lon |
|---|---|---|---|
| Hamburg-Altona | Harkortstraße 12, 22765 Hamburg | Petra Lindqvist | 53.552, 9.935 |
| Hamburg-Harburg | Schloßmühlendamm 4, 21073 Hamburg | Tobias Renner | 53.460, 9.983 |
| Berlin-Spandau | Brunsbütteler Damm 75, 13581 Berlin | Aylin Kaya | 52.535, 13.185 |
| München-Riem | Willy-Brandt-Allee 9, 81829 München | Marco Ferretti | 48.135, 11.698 |

**`find_journeys`** — ignores inputs except to echo `from`/`to`; always returns
these 7 rows (Berlin Hbf → Hamburg Hbf, Thursday). Fields:
`{ train, departs, arrives, price_eur }`.

| train | departs | arrives | price_eur | (design note) |
|---|---|---|---|---|
| ICE 501 | 05:30 | 07:12 | 109 | over budget |
| IC 2073 | 05:48 | 08:52 | 84 | over budget by 4 € |
| ICE 803 | 06:25 | 08:10 | 95 | over budget |
| ICE 1601 | 06:55 | 08:45 | 69 | **the only valid pick** |
| RE 4 | 06:20 | 09:12 | 39 | arrives too late |
| FLX 1234 | 07:05 | 09:40 | 24 | too late |
| ICE 1607 | 07:55 | 09:45 | 59 | too late |

**`find_hotels`** — ignores input except to echo `near`; always returns these
8 rows. Fields: `{ name, distance_km, price_eur }`.

| name | distance_km | price_eur | (design note) |
|---|---|---|---|
| Hotel Altona Park | 1.2 | 95 | **the pick** |
| Elbblick Boutique | 0.8 | 130 | over budget |
| Hafen Suites | 1.9 | 118 | valid, dominated by the pick |
| B&B Ottensen | 1.6 | 121 | over budget by 1 € |
| Grand Elbe | 1.4 | 210 | over budget |
| Ibis Altona | 2.1 | 89 | too far by 100 m |
| Pension Fischmarkt | 2.8 | 65 | too far |
| Motel Nord | 3.5 | 79 | too far |

**`send_itinerary`** — returns `{ status: "sent", to, text }`.

Design notes are not included in the data or descriptions. The model must not
be told which options to pick.

## 6. The agent loop and the API call

`runAgent(goal, emit)` is a standalone async function, ~20–30 lines, no Vue,
no DOM. `emit` receives event objects (§7).

```
input = [{ role: "user", content: goal }]
for cycle in 1..MAX_CYCLES:
  res   = await callModel(input)
  text  = concatenated output_text of message items in res.output
  calls = items in res.output with type "function_call"
  if calls is empty:
    emit({ type: "done", cycle, text }); return
  emit({ type: "reasoning", cycle, text })
  input.push(...res.output)                       // history incl. reasoning items
  for call in calls:                              // always one, kept general
    args   = JSON.parse(call.arguments)
    emit({ type: "tool_call", cycle, id: call.call_id, name: call.name, args })
    output = tools[call.name](args)
    emit({ type: "tool_result", cycle, id: call.call_id, name: call.name, output })
    input.push({ type: "function_call_output", call_id: call.call_id,
                 output: JSON.stringify(output) })
emit({ type: "error", message: "Stopped after MAX_CYCLES cycles" })
```

`callModel(input)` is one `fetch` to `POST https://api.openai.com/v1/responses`
with `Authorization: Bearer <key>` and a JSON body built from a constants block
at the top of the script:

```
MODEL          = "gpt-5.6-terra"                // verified in docs 2026-09-01
REASONING      = { effort: "low" }            // + summary: "auto" when SHOW_SUMMARIES
SHOW_SUMMARIES = false
PARALLEL_CALLS = false                         // parallel_tool_calls
MAX_CYCLES     = 10
INSTRUCTIONS   = <system prompt from §4>
tools          = toolDefs
```

Implementation must check the current OpenAI docs (Responses API, function
calling, reasoning parameter, passing reasoning items back between calls)
before writing `callModel`; the shapes above are intent, not gospel.

Behaviour details:

- Non-2xx → throw with the API's `error.message`; network failure → throw with a
  "Could not reach api.openai.com" message. `runAgent` catches and emits
  `error`, then stops.
- If a response has function calls but no message text, `reasoning.text` is
  `""`. When `SHOW_SUMMARIES` is on and a reasoning item has summary text, use
  that instead of the empty string. The console test checks this case.
- Unknown tool name from the model → tool output `{ error: "unknown tool" }`,
  loop continues (the model can recover).

## 7. Events

One in-memory array, every entry `{ type, t, ...payload }` where `t` is ms
since Start (recorded for the file; replay uses a fixed delay).

| type | payload |
|---|---|
| `goal` | `text` |
| `reasoning` | `cycle, text` |
| `tool_call` | `cycle, id, name, args` |
| `tool_result` | `cycle, id, name, output` |
| `done` | `cycle, text` |
| `error` | `message` |

This array is what the UI renders, what Save writes, and what Load replays.

## 8. UI

Vue 3 (vendored runtime build) app in the same file. State: `apiKey`, `events`,
`status` (`idle | running | replaying | done | error`), `cycle`. Methods:
`start()` (runs `runAgent` with `emit = e => events.push(e)`), `saveRun()`,
`loadRun(file)`, `reset()`.

Layout, top to bottom:

- **Header**: the goal text; password input for the key; buttons
  **Start / Save run / Load run / Reset**. Start disabled until the key is
  non-empty, with a hint. Save disabled until there are events.
- **Status bar**: left `Cycle N · Think → Act → Observe`; right a live indicator:
  pulsing "thinking…" while a fetch is in flight, "replaying…", "done", or
  "error".
- **Two columns**: **Model** (left) and **Your code** (right), in a CSS grid
  with one row per cycle so an Act card and its Observe card sit side by side.
  - `reasoning` → Think card, left. Typewriter effect ~30 chars/s; empty text
    renders "(no explanation given)".
  - `tool_call` → Act card, left, monospace `name(args)`, then an arrow
    animates left → right.
  - `tool_result` → Observe card, right. `get_site` as a key/value list;
    `find_journeys` and `find_hotels` as small tables (columns as in §5);
    `send_itinerary` as the message text plus "sent ✓". Then an arrow animates
    right → left.
  - `done` → highlighted Done card, left, full text.
  - `error` → red card spanning both columns.
- Live runs reveal queued events with a short stagger (`LIVE_STAGGER_MS`,
  ~0.8 s) between consecutive cards; the page auto-scrolls to the newest card.
- Typography: base 20 px, dark high-contrast theme, readable on a projector.
  No settings, no chat input.

Save: downloads `run-<timestamp>.json` containing the events array. Load: file
input; validates the file is an array whose entries have known `type`s, then
pushes them into `events` with a 1.5 s delay between entries (same cards, same
typewriter, no API call). `runs/good-run.json` is committed after the first
successful run.

## 9. Part B — brief for `/frontend-slides:frontend-slides`

Run after Part A is done, output in `slides/`. Paste this brief:

> I'm giving a 15-minute Lunch & Learn at Koppla (construction software, ~40
> people, mostly non-technical) titled "What is an AI agent?". Previous sessions
> covered what an LLM is (tokens, context) and a quick look at Claude Code.
> Tone: friendly, plain language, one idea per slide, no code. The live demo
> runs in a separate browser tab, so the deck needs a clear "switch to demo"
> slide. The deck must open from disk on another machine (no CDN dependencies).
>
> Slides:
> 1. Title.
> 2. Recap: an LLM predicts text. Claude Code edits files and runs commands.
>    How does a text predictor end up *doing* things?
> 3. Chatbot vs agent — consultant you call for advice vs assistant you hand a
>    goal to. "A chatbot answers, an agent acts."
> 4. The loop — an **interactive** diagram: Goal → Think → Act (use a tool) →
>    Observe result → back to Think → Done. Clicking or pressing advances a
>    highlight around the loop.
> 5. What a tool is: a capability someone else built and described in plain
>    words. The model doesn't run it; it *writes a request*, the system
>    executes and pastes the result back. Show the four tool descriptions from
>    the demo exactly as given to the model: [paste the four descriptions from
>    §5].
> 6. The autonomy ladder — **interactive**: autocomplete → chat → fixed
>    workflow → agent that picks its own steps. Clicking each rung shows a
>    one-line example.
> 7. "Switch to demo" — the goal text [paste from §4] and a reminder: watch for
>    the loop repeating, and the moments it rules an option out because of a
>    constraint.
> 8. Where it goes wrong: loops forever, wrong tool, confident on a bad
>    assumption. Guardrails: permissions, human in the loop — Claude Code asking
>    before it edits a file (from the previous session) is the everyday example.
> 9. What this means for Koppla: the question shifts from "what can the model
>    say" to "what tools do we give it, and what do we let it do alone."
> 10. Questions.

## 10. Acceptance

1. Open `demo/index.html` from disk, enter a key, Start: 4 Think → Act →
   Observe cycles (`get_site`, `find_journeys`, `find_hotels`,
   `send_itinerary`), each with a non-empty Think card; the model visibly rules
   out the late trains and the over-budget/too-far hotels; picks ICE 1601 (69 €)
   and Hotel Altona Park (95 €); then a Done summary.
2. Run it three times; picks and tool order are consistent. If not, tune the
   system prompt, tool descriptions, or data — never hard-code the answer.
3. Save the run, reload the page, Load it with the network off: identical
   cards.
4. Fresh clone on another machine: opens from disk, replay works offline.
   README covers the work-laptop check and the two fallbacks (local static
   server; Load run).

## 11. Testing plan

1. **Console test first** (before UI): call `runAgent(goal, console.log)` from
   the browser console on a bare page; verify the acceptance list above and
   that a `file://` origin can reach the API (if not, note the static-server
   fallback in the README as required, not optional).
2. **Manual UI check** at projector size (1280×720 and 1920×1080).
3. **Replay test** with browser offline mode.

## 12. Risks

- **`file://` + API CORS on the work laptop** — proxy/policy may block it.
  Mitigations: `python3 -m http.server` fallback; committed replay.
- **Reasoning model skips the preamble** — GPT-5-era models document "tool
  call preambles" and follow the instruction; verify in the console test; the
  summary toggle is the fallback.
- **Run-to-run variance** — single valid option per constraint set is the main
  defence; tune wording, never the answer.
