#!/bin/sh
set -eu
cd "$(dirname "$0")"
# tsx and esbuild do not emit decorator metadata, so Nest cannot inject constructors.
pnpm exec tsc -p tsconfig.json --pretty false --watch --preserveWatchOutput &
compiler=$!
trap 'kill "$compiler"' EXIT INT TERM
while [ ! -f dist/main.js ]; do sleep 0.2; done
exec node --watch dist/main.js
