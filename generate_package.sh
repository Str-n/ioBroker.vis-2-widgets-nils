#!/usr/bin/env bash

# Build the widget and create an ioBroker package archive. An optional output
# path lets deployment scripts keep generated archives out of the worktree.

set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
WIDGET_NAME="vis-2-widgets-nils-fork"
TEMP_DIR=$(mktemp -d)
PACKAGE_ROOT="${TEMP_DIR}/package"

cleanup() {
    rm -rf -- "${TEMP_DIR}"
}
trap cleanup EXIT

cd -- "${SCRIPT_DIR}"

echo "Building widget..."
npm run build

PACKAGE_VERSION=$(node -p "require('./package.json').version")
PACKAGE_FILE="iobroker.${WIDGET_NAME}-${PACKAGE_VERSION}.tgz"
PACKAGE_PATH=${PACKAGE_OUTPUT:-"${SCRIPT_DIR}/${PACKAGE_FILE}"}

mkdir -- "${PACKAGE_ROOT}"
cp -r -- admin "${PACKAGE_ROOT}/"
cp -r -- img "${PACKAGE_ROOT}/"
cp -- io-package.json LICENSE "${PACKAGE_ROOT}/"
cp -r -- widgets "${PACKAGE_ROOT}/"

cat >"${PACKAGE_ROOT}/package.json" <<EOF
{
  "name": "iobroker.${WIDGET_NAME}",
  "version": "${PACKAGE_VERSION}",
  "description": "ioBroker vis2 widgets for Nils",
  "main": "widgets/${WIDGET_NAME}/customWidgets.js",
  "files": [
    "admin/",
    "img/",
    "io-package.json",
    "LICENSE",
    "widgets/"
  ],
  "keywords": [
    "ioBroker",
    "vis-2",
    "widgets"
  ],
  "license": "MIT"
}
EOF

tar -czf "${TEMP_DIR}/${PACKAGE_FILE}" -C "${TEMP_DIR}" package
mv -- "${TEMP_DIR}/${PACKAGE_FILE}" "${PACKAGE_PATH}"

echo "Package created: ${PACKAGE_PATH}"
