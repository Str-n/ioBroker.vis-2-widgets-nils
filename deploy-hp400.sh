#!/usr/bin/env bash

# Build the widget package locally, copy it to the HP400, and install it in the
# production ioBroker container.

set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
REMOTE=${HP400_SSH_TARGET:-pi@192.168.178.40}
CONTAINER=${HP400_IOBROKER_CONTAINER:-smarthome-iobroker-1}
WIDGET_NAME=vis-2-widgets-nils-fork

usage() {
    cat <<'EOF'
Deploy this widget package to ioBroker running in the HP400 Docker container.

Usage: ./deploy-hp400.sh

Environment overrides:
  HP400_SSH_TARGET            SSH target (default: pi@192.168.178.40)
  HP400_IOBROKER_CONTAINER    Docker container (default: smarthome-iobroker-1)
EOF
}

case "${1:-}" in
    -h|--help)
        usage
        exit 0
        ;;
    '')
        ;;
    *)
        usage >&2
        exit 2
        ;;
esac

for command in npm node scp ssh; do
    command -v "${command}" >/dev/null 2>&1 || {
        echo "Required command not found: ${command}" >&2
        exit 1
    }
done

PACKAGE_VERSION=$(node -p "require('${SCRIPT_DIR}/package.json').version")
PACKAGE_FILE="iobroker.${WIDGET_NAME}-${PACKAGE_VERSION}.tgz"
TEMP_DIR=$(mktemp -d)
PACKAGE_PATH="${TEMP_DIR}/${PACKAGE_FILE}"
REMOTE_PACKAGE="/tmp/${PACKAGE_FILE}"

cleanup_local() {
    rm -rf -- "${TEMP_DIR}"
}
trap cleanup_local EXIT

echo "Building ${WIDGET_NAME}@${PACKAGE_VERSION}..."
PACKAGE_OUTPUT=${PACKAGE_PATH} "${SCRIPT_DIR}/generate_package.sh"

if [[ ! -s ${PACKAGE_PATH} ]]; then
    echo "Package was not created: ${PACKAGE_PATH}" >&2
    exit 1
fi

echo "Copying package to ${REMOTE}:${REMOTE_PACKAGE}..."
scp -- "${PACKAGE_PATH}" "${REMOTE}:${REMOTE_PACKAGE}"

echo "Installing package in ${CONTAINER} on ${REMOTE}..."
ssh "${REMOTE}" "bash -s -- $(printf '%q' "${CONTAINER}") $(printf '%q' "${PACKAGE_FILE}") $(printf '%q' "${WIDGET_NAME}")" <<'REMOTE_SCRIPT'
set -Eeuo pipefail

container=$1
package_file=$2
widget_name=$3
host_package="/tmp/${package_file}"
container_package="/tmp/${package_file}"

cleanup_remote() {
    sudo docker exec "${container}" rm -f -- "${container_package}" >/dev/null 2>&1 || true
    rm -f -- "${host_package}"
}
trap cleanup_remote EXIT

[[ -s ${host_package} ]] || {
    echo "Package was not copied to the HP400: ${host_package}" >&2
    exit 1
}

[[ $(sudo docker inspect --format '{{.State.Running}}' "${container}") == true ]] || {
    echo "ioBroker container is not running: ${container}" >&2
    exit 1
}

sudo docker cp "${host_package}" "${container}:${container_package}"
sudo docker exec -u iobroker "${container}" bash -lc '
    set -e
    cd /opt/iobroker
    iobroker url "$1"
    iobroker restart vis-2
    iobroker message vis-2.0 rebuild
    iobroker upload "$2" --debug
' _ "${container_package}" "${widget_name}"

echo "Installed ${widget_name} in ${container}."
REMOTE_SCRIPT

echo "Deployment complete: ${WIDGET_NAME}@${PACKAGE_VERSION} on ${REMOTE}."
