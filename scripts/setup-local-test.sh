#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPACT_WIDGET_ID="tplNils2ThermostatCompact"
COMPACT_WIDGET_SOURCE="${ROOT_DIR}/src-widgets/src/ThermostatCompact.tsx"
PREVIEW_SOURCE="${ROOT_DIR}/src-widgets/preview/main.tsx"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    echo "Local widget test setup"
    echo ""
    echo "Usage: ./scripts/setup-local-test.sh"
    echo ""
    echo "This script validates and previews SwitchButton and ThermostatCompact with local mock states."
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

if ! grep -Fq "id: '${COMPACT_WIDGET_ID}'" "${COMPACT_WIDGET_SOURCE}"; then
    echo "ThermostatCompact must keep the persisted widget ID ${COMPACT_WIDGET_ID}." >&2
    exit 1
fi

if ! grep -Fq "import('../src/ThermostatCompact')" "${PREVIEW_SOURCE}"; then
    echo "ThermostatCompact is missing from the local test dashboard." >&2
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
Widgets: SwitchButton, ThermostatCompact (${COMPACT_WIDGET_ID})

This environment starts the Vite dev server for quick widget checks before deployment to the Raspberry Pi.
Press Ctrl+C to stop the server.
EOF

cd "${ROOT_DIR}/src-widgets"
exec npm start -- --force --strictPort
