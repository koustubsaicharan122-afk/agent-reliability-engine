from __future__ import annotations
import os
import uuid
import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

import store
from agent_under_test import AGENT_NAME, AGENT_SYSTEM_PROMPT, TOOLS
from scenario_generator import generate_scenarios, CATEGORIES
from harness import run_scenario
from classifier import classify_run

app = FastAPI(title="AI Agent Evaluation & Reliability Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateScenariosRequest(BaseModel):
    num_scenarios: int = 12


class RunEvaluationRequest(BaseModel):
    version_label: str = "v1"
    scenario_ids: list[str] | None = None  # None = run all stored scenarios


@app.get("/api/health")
def health():
    has_key = bool(os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY"))
    return {"ok": True, "gemini_key_configured": has_key}


@app.get("/api/agent")
def get_agent():
    return {
        "name": AGENT_NAME,
        "system_prompt": AGENT_SYSTEM_PROMPT,
        "tools": TOOLS,
    }


@app.get("/api/categories")
def get_categories():
    return CATEGORIES


@app.post("/api/scenarios/generate")
def api_generate_scenarios(req: GenerateScenariosRequest):
    try:
        scenarios = generate_scenarios(num_scenarios=req.num_scenarios)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    store.save_scenarios(scenarios)
    return {"scenarios": scenarios}


@app.get("/api/scenarios")
def api_get_scenarios():
    return {"scenarios": store.get_scenarios()}


def _run_and_classify(scenario: dict) -> dict:
    run_result = run_scenario(scenario)
    verdict = classify_run(scenario, run_result)
    return {
        "scenario_id": scenario["id"],
        "title": scenario["title"],
        "category": scenario["category"],
        "risk_tags": scenario.get("risk_tags", []),
        "expected_safe_behavior": scenario.get("expected_safe_behavior", ""),
        "user_turns": scenario.get("user_turns", []),
        "status": verdict["status"],
        "failure_mode": verdict["failure_mode"],
        "severity": verdict["severity"],
        "reasoning": verdict["reasoning"],
        "tool_loop_detected": run_result["tool_loop_detected"],
        "guardrail_violations": run_result["guardrail_violations"],
        "total_tool_calls": run_result["total_tool_calls"],
        "trace": run_result["trace"],
        "error": run_result.get("error"),
    }


def _build_scorecard(results: list[dict]) -> dict:
    total = len(results)
    passed = sum(1 for r in results if r["status"] == "pass")
    failed = total - passed
    failure_mode_breakdown: dict[str, int] = {}
    category_breakdown: dict[str, dict] = {}
    guardrail_violation_count = 0
    severity_breakdown: dict[str, int] = {}

    for r in results:
        if r["status"] == "fail":
            failure_mode_breakdown[r["failure_mode"]] = failure_mode_breakdown.get(r["failure_mode"], 0) + 1
            severity_breakdown[r["severity"]] = severity_breakdown.get(r["severity"], 0) + 1
        guardrail_violation_count += len(r.get("guardrail_violations", []))

        cat = r["category"]
        cb = category_breakdown.setdefault(cat, {"total": 0, "passed": 0, "failed": 0})
        cb["total"] += 1
        if r["status"] == "pass":
            cb["passed"] += 1
        else:
            cb["failed"] += 1

    return {
        "total": total,
        "passed": passed,
        "failed": failed,
        "pass_rate": round(passed / total, 4) if total else 0,
        "failure_mode_breakdown": failure_mode_breakdown,
        "severity_breakdown": severity_breakdown,
        "category_breakdown": category_breakdown,
        "guardrail_violation_count": guardrail_violation_count,
    }


@app.post("/api/runs")
def api_run_evaluation(req: RunEvaluationRequest):
    all_scenarios = store.get_scenarios()
    if not all_scenarios:
        raise HTTPException(status_code=400, detail="No scenarios found. Generate scenarios first.")

    if req.scenario_ids:
        scenarios = [s for s in all_scenarios if s["id"] in req.scenario_ids]
    else:
        scenarios = all_scenarios

    if not scenarios:
        raise HTTPException(status_code=400, detail="No matching scenarios to run.")

    results = []
    try:
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = {pool.submit(_run_and_classify, s): s for s in scenarios}
            for fut in as_completed(futures):
                results.append(fut.result())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Keep a stable order matching the scenario list for readability.
    order = {s["id"]: i for i, s in enumerate(scenarios)}
    results.sort(key=lambda r: order.get(r["scenario_id"], 0))

    scorecard = _build_scorecard(results)

    run = {
        "id": f"run_{uuid.uuid4().hex[:8]}",
        "version_label": req.version_label,
        "created_at": datetime.datetime.utcnow().isoformat() + "Z",
        "scorecard": scorecard,
        "results": results,
    }
    store.add_run(run)
    return run


@app.get("/api/runs")
def api_get_runs():
    runs = store.get_runs()
    # Lightweight summaries for the regression tracker, newest first.
    summaries = [
        {
            "id": r["id"],
            "version_label": r["version_label"],
            "created_at": r["created_at"],
            "scorecard": r["scorecard"],
        }
        for r in runs
    ]
    summaries.sort(key=lambda r: r["created_at"])
    return {"runs": summaries}


@app.get("/api/runs/{run_id}")
def api_get_run(run_id: str):
    run = store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


# Serve the frontend as static files, so the whole prototype runs from one process.
frontend_dir = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.isdir(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
