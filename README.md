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
3. Create a git-ignored `demo/env.local.js` next to `index.html` containing
   `window.OPENAI_API_KEY = "sk-...";` — the page reads the key from it (there
   is no key field in the UI). The key stays on your machine and is sent
   nowhere but api.openai.com. Without the file, Start is disabled and a hint
   points here; replay still works. (A file-not-found note in the DevTools
   console when the file is absent is harmless.)
4. Press **Start**. Watch the loop: Think (left) → Act (left, arrow) →
   Observe (right, arrow back) → … → Done.

Buttons: **Start** runs the agent · **Save run** downloads the run as JSON ·
**Load run** replays a JSON file with no API call · **Reset** clears.

## Before the talk — work-laptop checklist (do this the day before)

1. Fresh clone, open `demo/index.html`, **Load run** → `demo/runs/good-run.json`.
   This must work with no network. It is your fallback on the day.
   (Record it first with the command under *Recording a fresh good run* if it
   is not in the repo yet.)
2. Copy your `demo/env.local.js` onto the laptop (it is git-ignored, so the
   clone does not include it), **Start**. If it runs: done.
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
Node 22 (tested; `node --test` with a glob needs Node 21+). Tests cover the mock world, the loop
(with a fake `fetch`), and the saved-run validator. No key needed.

## Model settings

Top of `demo/agent.js`, `AGENT_DEFAULTS`: model id, reasoning effort,
whether to request reasoning summaries (off — may need org verification),
max cycles, and the system prompt. Nothing in the prompt or data tells the
model which option to pick; if a run makes a different choice, tune the
wording or the data, not the answer.
