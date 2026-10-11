#!/bin/bash
# Starts the AccessLens AI server on this Mac.
# First run: creates a private Python environment and installs everything (a few minutes).
set -e
cd "$(dirname "$0")"

PY=""
for cand in python3.13 python3.12 python3.11 python3.10 python3; do
  if command -v "$cand" >/dev/null 2>&1; then
    if "$cand" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
      PY="$cand"
      break
    fi
  fi
done

if [ -z "$PY" ]; then
  echo ""
  echo "  Python 3.10 or newer is needed."
  echo "  Install it from https://www.python.org/downloads/ (or: brew install python), then run this again."
  echo ""
  exit 1
fi

if [ ! -d .venv ]; then
  echo "Setting up the AI environment with $PY (first time only)…"
  "$PY" -m venv .venv
  ./.venv/bin/python -m pip install --upgrade pip -q
  ./.venv/bin/python -m pip install -r requirements.txt
fi

exec ./.venv/bin/python server.py
