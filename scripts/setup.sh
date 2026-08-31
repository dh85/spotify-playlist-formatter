#!/usr/bin/env bash
set -euo pipefail

npm ci

case "$(uname -s)" in
  Linux)
    npx playwright install --with-deps chromium
    ;;
  Darwin)
    npx playwright install chromium
    ;;
  *)
    echo "Unsupported OS: $(uname -s)" >&2
    exit 1
    ;;
esac
