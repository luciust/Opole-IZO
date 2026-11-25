#!/usr/bin/env bash
set -e

PORT="${PORT:-3000}"

echo "========================================================"
echo "      OPOLE-IZO — Isometric Living City Application     "
echo "========================================================"
echo "Starting Caching Reverse Proxy & Web Server on port ${PORT}..."
echo "Open in browser: http://localhost:${PORT}"
echo "Press Ctrl+C to stop."
echo "========================================================"

exec node server/proxy.js
