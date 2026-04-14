#!/bin/sh
set -eu

cd "$(dirname "$0")"

if [ -f .env.local ]; then
  set -a
  . ./.env.local
  set +a
fi

node ./server.mjs &
WEBHOOK_PID=$!

cleanup() {
  kill "$WEBHOOK_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

npm run dev
