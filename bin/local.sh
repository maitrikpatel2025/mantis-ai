#!/bin/bash
set -e

PACKAGE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEV_DIR="${1:-/tmp/mantis-ai.local}"
ENV_BACKUP="/tmp/env.$(uuidgen)"

HAS_ENV=false
if [ -f "$DEV_DIR/.env" ]; then
  mv "$DEV_DIR/.env" "$ENV_BACKUP"
  HAS_ENV=true
fi

rm -rf "$DEV_DIR"
mkdir -p "$DEV_DIR"
cd "$DEV_DIR"

# init may fail at npm install if the package isn't published yet — that's fine,
# we replace the dep with a local file link below and reinstall ourselves.
node "$PACKAGE_DIR/bin/cli.js" init || true

sed -i '' "s|\"mantis-ai\": \".*\"|\"mantis-ai\": \"file:$PACKAGE_DIR\"|" package.json

rm -rf node_modules package-lock.json
npm install --install-links


if [ "$HAS_ENV" = true ]; then
  mv "$ENV_BACKUP" .env
  echo "Restored .env from previous build"
else
  npm run setup
fi
