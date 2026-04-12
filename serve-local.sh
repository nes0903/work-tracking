#!/bin/sh
set -eu

cd "$(dirname "$0")"

if [ -f .env.local ]; then
  set -a
  . ./.env.local
  set +a
fi

node ./server.mjs
