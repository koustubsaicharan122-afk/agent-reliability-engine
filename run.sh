#!/usr/bin/env bash
# Prototype launcher: installs deps (if needed) and starts the app on http://localhost:8000
set -e
cd "$(dirname "$0")/backend"

if [ ! -f ".env" ]; then
  echo "No .env file found in backend/. Create one with:"
  echo "  ANTHROPIC_API_KEY=sk-ant-..."
  echo "or export ANTHROPIC_API_KEY in your shell before running this script."
fi

python3 -m venv .venv 2>/dev/null || true
source .venv/bin/activate
pip install -q -r requirements.txt

echo "Starting AI Agent Evaluation & Reliability Engine at http://localhost:8000"
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
