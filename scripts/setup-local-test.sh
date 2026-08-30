#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    echo "Local widget test setup"
    echo ""
    echo "Usage: ./scripts/setup-local-test.sh"
    echo ""
    echo "This script installs the project dependencies if needed and starts the local Vite test dashboard."
    echo "Open: http://localhost:4174/test-dashboard.html"
    exit 0
fi

if ! command -v node >/dev/null 2>&1; then
    echo "Node.js is required but not installed." >&2
    exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
    echo "npm is required but not installed." >&2
    exit 1
fi

if [[ ! -d "${ROOT_DIR}/node_modules" ]]; then
    echo "Installing root dependencies..."
    (cd "${ROOT_DIR}" && npm install)
fi

if [[ ! -d "${ROOT_DIR}/src-widgets/node_modules" ]]; then
    echo "Installing widget dependencies..."
    (cd "${ROOT_DIR}/src-widgets" && npm install)
fi

cat <<EOF

========================================
Local widget test environment
========================================
Project root: ${ROOT_DIR}
Dashboard URL: http://localhost:4174/test-dashboard.html

This environment starts the Vite dev server for quick widget checks before deployment to the Raspberry Pi.
Press Ctrl+C to stop the server.
EOF

cd "${ROOT_DIR}/src-widgets"
exec npm start -- --host 0.0.0.0 --port 4174
