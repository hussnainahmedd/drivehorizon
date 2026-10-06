#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PORT="${HARBORLINE_PORT:-4173}"

if [[ ! -f "$ROOT/dist/index.html" ]]; then
  printf 'Building Harborline for the first time…\n'
  npm --prefix "$ROOT" install
  npm --prefix "$ROOT" run build
fi

printf '\n  HARBORLINE — Coastal Courier\n  http://localhost:%s\n\n  Press Ctrl+C to stop the local server.\n\n' "$PORT"
python3 -m http.server "$PORT" --bind 127.0.0.1 --directory "$ROOT/dist" &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
trap 'exit 0' INT TERM
sleep 0.5
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  printf 'Port %s is already in use. Try: HARBORLINE_PORT=4180 ./start.sh\n' "$PORT" >&2
  exit 1
fi

if [[ "${1:-}" != '--no-open' ]] && command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:$PORT" >/dev/null 2>&1 &
fi
wait "$SERVER_PID"
