"""Tiny JSON-file persistence layer. Good enough for a prototype; swap for a
real DB (Postgres/SQLite) if this goes further than a demo."""

from __future__ import annotations
import json
import os
import threading

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
SCENARIOS_FILE = os.path.join(DATA_DIR, "scenarios.json")
RUNS_FILE = os.path.join(DATA_DIR, "runs.json")

_lock = threading.Lock()


def _ensure():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(SCENARIOS_FILE):
        _write(SCENARIOS_FILE, [])
    if not os.path.exists(RUNS_FILE):
        _write(RUNS_FILE, [])


def _read(path):
    with open(path) as f:
        return json.load(f)


def _write(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2, default=str)


def get_scenarios() -> list[dict]:
    _ensure()
    return _read(SCENARIOS_FILE)


def save_scenarios(scenarios: list[dict]):
    _ensure()
    with _lock:
        _write(SCENARIOS_FILE, scenarios)


def get_runs() -> list[dict]:
    _ensure()
    return _read(RUNS_FILE)


def get_run(run_id: str) -> dict | None:
    return next((r for r in get_runs() if r["id"] == run_id), None)


def add_run(run: dict):
    _ensure()
    with _lock:
        runs = _read(RUNS_FILE)
        runs.append(run)
        _write(RUNS_FILE, runs)
