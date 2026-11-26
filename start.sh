#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

PORT="${PORT:-3000}"

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is required but not found in PATH."
  exit 1
fi

# Auto-install frontend dependencies on fresh clone
if [ ! -d "web/node_modules" ]; then
  echo "Installing frontend dependencies in web/ (first run)..."
  (cd web && npm install)
fi

# Auto-build frontend bundle if missing or outdated
NEEDS_BUILD=0
if [ ! -f "web/dist/index.html" ]; then
  NEEDS_BUILD=1
elif [ -n "$(find web/src web/index.html -newer web/dist/index.html 2>/dev/null | head -n 1)" ]; then
  NEEDS_BUILD=1
fi

if [ "${NEEDS_BUILD}" -eq 1 ]; then
  echo "Building frontend bundle (web/dist)..."
  (cd web && npm run build)
fi

echo "========================================================"
echo "      OPOLE-IZO — Isometric Living City Application     "
echo "========================================================"
echo "Starting Caching Reverse Proxy & Web Server on port ${PORT}..."
echo "Open in browser: http://localhost:${PORT}"
echo "Press Ctrl+C to stop."
echo "========================================================"

exec node server/proxy.js
