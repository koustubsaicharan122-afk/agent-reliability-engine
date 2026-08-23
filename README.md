# AI Agent Evaluation & Reliability Engine (prototype)

A working prototype of the hackathon problem statement "AI Agent Evaluation and
Reliability Engine": it auto-generates realistic and adversarial test
scenarios for an AI agent, runs the agent against them in a sandbox with
mocked tools, classifies failures into a taxonomy, specifically probes
destructive-action guardrails, and tracks a reliability scorecard across runs.

Built on **Google Gemini** (`google-genai` SDK).

## What's in here

| Component from the brief | File |
|---|---|
| Agent under test | `backend/agent_under_test.py` — a mock e-commerce support agent ("Northwind SupportOps") with 6 tools, two of them irreversible (`issue_refund`, `delete_account`) that are supposed to be gated behind identity verification |
| Scenario Generation Engine | `backend/scenario_generator.py` — reads the agent's system prompt + tool schema, asks Gemini to generate scenarios across 7 categories (normal, destructive-pressure, ambiguous, tool-loop bait, hallucination bait, prompt injection, goal drift) |
| Sandboxed Execution & Replay Harness | `backend/harness.py` — runs the agent against each scenario's scripted turns with mocked tools, captures a full JSON trace |
| Failure Mode Classifier | `backend/classifier.py` — Gemini-as-judge turns each trace into a pass/fail verdict + failure-mode taxonomy + severity |
| Destructive Action Guardrail Tester | built into `agent_under_test.py` (deterministic gating check) + `destructive_pressure` scenario category + classifier override (a real guardrail violation always forces `fail` / `critical`, the judge can't downgrade it) |
| Reliability Scorecard & Regression Tracker | `backend/main.py` (`_build_scorecard`) + frontend dashboard + `/api/runs` history |
| UI | `frontend/index.html` + `frontend/app.js` — single-page dashboard (no build step) |

Everything is one FastAPI process; the frontend is served as static files from
the same app, so there's only one thing to run.

## Setup

Requires Python 3.10+.

1. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)
   — it should look like `AIzaSy...`. (If what you have looks different, e.g.
   an OAuth-style token, double check it's an **API key**, not some other
   Google credential — this app expects the plain API-key auth style.)
2. `cd backend && cp .env.example .env` and put your key in `.env`:
   ```
   GEMINI_API_KEY=AIzaSy...
   ```
3. From the project root: `./run.sh` — this creates a venv, installs
   dependencies, and starts the server at http://localhost:8000.

Open http://localhost:8000 in a browser.

## Using it

1. **Generate scenarios** — pick how many (default 12), click "Generate
   scenarios". Gemini reads the agent's tools/prompt and writes a mixed batch
   of normal + adversarial test cases.
2. **Run evaluation** — give the run a version label (e.g. `v1`), click "Run
   evaluation". Every scenario is executed against the agent in the sandbox
   (mocked tools only — nothing real is touched) and graded.
3. **Scorecard** — pass rate, failure-mode breakdown, guardrail violation
   count, pass/fail by category.
4. **Regression tracker** — run evaluation again after changing the agent
   (e.g. edit `AGENT_SYSTEM_PROMPT` in `agent_under_test.py` to intentionally
   weaken a rule) with a new version label like `v2`, and watch the trend
   line and guardrail-violation count move.
5. **Scenario results** — click any scenario to see the full replay trace:
   every user turn, tool call (with args + mocked result), and the judge's
   reasoning.

## Swapping in a real agent

`agent_under_test.py` is the only file that defines what's being evaluated
(system prompt, tool schema, mock tool implementations). Everything else —
scenario generation, the harness, the classifier, the scorecard — treats it
as a black box. To evaluate a different or real agent, replace this file's
`AGENT_SYSTEM_PROMPT`, `TOOLS`, and `execute_tool()` (point the latter at
real or staging tool implementations, or keep mocking them for safety).

## Verifying it without spending API calls

`backend/_dry_run_test.py` exercises the full pipeline (tool-call loop,
guardrail detection, tool-loop detection, classifier parsing + the
never-let-the-judge-downgrade-a-guardrail-violation safety override, scenario
JSON parsing, and the whole FastAPI flow incl. the run-history store) against
hand-built fake Gemini responses — no network or API key needed:

```
cd backend && python3 _dry_run_test.py
```

This is how the logic was verified in the environment this prototype was
built in, since that sandbox's network policy didn't allow live calls out to
Google's API — it's worth running once in your own environment too as a
smoke test before you start spending real API calls on scenario runs.

## Notes / limitations (it's a prototype)

- Storage is flat JSON files (`backend/data/`), not a real database — fine for
  a demo, swap for Postgres/SQLite if this goes further.
- Scenario replay is deterministic in the sense that user turns are scripted,
  not a live simulated user — the agent's responses and tool calls are still
  live model output each run, so exact repeat runs can vary.
- No auth, no multi-tenant support, no rate limiting — single-user local
  prototype.
- Evaluation runs are synchronous (the request blocks until all scenarios
  finish); fine for ~10-20 scenarios, would want a job queue for larger
  suites.
