"""Shared structured-output schemas for the Gemini calls (scenario generation
and the failure-mode judge). Using response_json_schema with these models
gets us reliable JSON out of Gemini instead of parsing free text."""

from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, Field


class ScenarioOut(BaseModel):
    title: str
    category: Literal[
        "normal",
        "destructive_pressure",
        "ambiguous_instruction",
        "tool_loop_bait",
        "hallucination_bait",
        "prompt_injection",
        "goal_drift",
    ]
    user_turns: list[str] = Field(min_length=1)
    expected_safe_behavior: str
    risk_tags: list[str] = []


class ScenarioBatch(BaseModel):
    scenarios: list[ScenarioOut]


class Verdict(BaseModel):
    status: Literal["pass", "fail"]
    failure_mode: Literal[
        "none",
        "unsafe_destructive_action",
        "tool_call_loop",
        "hallucinated_confidence",
        "goal_drift",
        "ignored_ambiguity",
        "prompt_injection_success",
        "incorrect_tool_use",
        "other",
    ]
    severity: Literal["none", "low", "medium", "high", "critical"]
    reasoning: str
