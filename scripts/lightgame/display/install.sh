#!/usr/bin/env bash
set -euo pipefail
DISPLAY_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MODE="${1:---help}"
if [[ $# -gt 0 ]]; then shift; fi

case "$MODE" in
    --flash)
        exec python3 "$DISPLAY_DIR/flash.py" "$@"
        ;;
    --test)
        exec python3 -m unittest discover -s "$DISPLAY_DIR/tests" -v
        ;;
    --local)
        CONFIG_SOURCE="$DISPLAY_DIR/bridge.example.json"
        if [[ $# -gt 0 ]]; then
            if [[ $# -ne 2 || $1 != --config ]]; then
                echo 'Expected --local [--config FILE]' >&2
                exit 1
            fi
            CONFIG_SOURCE="$(realpath -- "$2")"
        fi
        python3 -m json.tool "$CONFIG_SOURCE" >/dev/null
        systemctl --user stop energy-game-display-local.service 2>/dev/null || true
        exec systemd-run --user --unit=energy-game-display-local --collect \
            --property=Restart=on-failure /usr/bin/python3 -u "$DISPLAY_DIR/bridge.py" \
            --config "$CONFIG_SOURCE"
        ;;
    --service)
        if [[ $EUID -ne 0 ]]; then
            echo "Service installation needs root: sudo $0 --service [--config FILE]" >&2
            exit 1
        fi
        CONFIG_SOURCE=""
        if [[ $# -gt 0 ]]; then
            if [[ $# -ne 2 || $1 != --config ]]; then
                echo 'Expected --service [--config FILE]' >&2
                exit 1
            fi
            CONFIG_SOURCE="$2"
        fi
        command -v python3 >/dev/null
        command -v systemctl >/dev/null
        python3 -c 'from zoneinfo import ZoneInfo; ZoneInfo("Europe/Berlin")'
        if [[ -n "$CONFIG_SOURCE" ]]; then
            python3 -m json.tool "$CONFIG_SOURCE" >/dev/null
        fi
        getent group dialout >/dev/null || groupadd --system dialout
        if ! id energy-display >/dev/null 2>&1; then
            useradd --system --gid dialout --no-create-home --home-dir /nonexistent \
                --shell /usr/sbin/nologin energy-display
        fi
        install -d -m 755 /opt/energy-game-display
        install -m 644 "$DISPLAY_DIR/bridge.py" "$DISPLAY_DIR/serial_port.py" "$DISPLAY_DIR/lamps.py" /opt/energy-game-display/
        if [[ -n "$CONFIG_SOURCE" ]]; then
            install -m 640 -o root -g dialout "$CONFIG_SOURCE" /etc/energy-game-display.json
        elif [[ ! -f /etc/energy-game-display.json ]]; then
            install -m 640 -o root -g dialout "$DISPLAY_DIR/bridge.example.json" /etc/energy-game-display.json
        fi
        install -m 644 "$DISPLAY_DIR/energy-game-display.service" /etc/systemd/system/
        systemctl daemon-reload
        systemctl enable energy-game-display.service
        systemctl restart energy-game-display.service
        systemctl --no-pager --full status energy-game-display.service
        echo 'The service reconnects automatically when the programmed display is plugged in.'
        ;;
    --help|-h)
        cat <<'HELP'
Energy Game / Waveshare RP2040-Touch-LCD-1.28 (Linux, Python >= 3.9)

  ./install.sh --flash [--port /dev/serial/by-id/...]   Program attached MicroPython board
  ./install.sh --test                                Run dependency-free tests
  ./install.sh --local [--config FILE]                Run bridge on this machine now
  sudo ./install.sh --service [--config FILE]         Install/start persistent USB bridge

No pip packages or compiler are required. Flash on the machine with the USB cable;
install the service on the always-on host where the display will remain connected.
--local starts a temporary user service; it does not enable a service at boot.
If serial access is denied: sudo setfacl -m u:$(id -un):rw /dev/ttyACM0
See README.md for UF2 recovery, configuration, verification and uninstall commands.
HELP
        ;;
    *) echo "Unknown mode: $MODE. Use --help." >&2; exit 1 ;;
esac
