#!/usr/bin/env bash
# Convenience wrapper: load .env, run the benchmark, refresh the website data.
# Usage: ./scripts/run_live.sh            (all enabled models)
#        ./scripts/run_live.sh --smoke    (cheap sanity check)
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  # Export vars from .env, tolerating surrounding quotes around values.
  set -a
  # shellcheck disable=SC1090
  source <(sed -E 's/^([A-Za-z_][A-Za-z0-9_]*)=["'\'']?([^"'\'']*)["'\'']?$/\1=\2/' .env)
  set +a
fi

if [ -z "${OPENROUTER_API_KEY:-}" ]; then
  echo "OPENROUTER_API_KEY is not set. Copy .env.example to .env and add your key." >&2
  exit 1
fi

python3 run.py "$@"
python3 scripts/build_site.py
echo "Done. Open docs/index.html or push to GitHub Pages."
