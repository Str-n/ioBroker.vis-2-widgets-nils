# Energy Game round display

MicroPython application for **Waveshare RP2040-Touch-LCD-1.28**, plus a dependency-free
Linux USB bridge and installer. Large daily score, teal progress ring towards the
best daily score, smaller gold high score, animated particle bursts and rising `+N`
on increases, gold record celebration, and a visible stale/offline indicator.

## Hardware and data flow

This board has **neither Wi-Fi nor Bluetooth**. Its RP2040 cannot connect wirelessly
without another radio. The implemented connection uses the USB cable to the
always-on host **hp400 / 192.168.178.40**. The board renders everything locally;
that host must be running to supply live scores. A USB power supply alone shows
`WARTE AUF HOST`. No Wi-Fi password is needed for this configuration.

```text
energyGame.js -> existing ioBroker simple-api (:8087)
             -> Python bridge on hp400 -> USB serial -> RP2040 display
```

The bridge reads `score.daily`, `score.highScore`, and `day.key` under
`0_userdata.0.energyGame` in one `getBulk` request every 0.5 seconds. This is
polling, with typical update latency below one second. Increases within one poll
are combined into one `+N` animation. The bridge only reads ioBroker; it never
writes game states or switches lights. It needs no new adapters, MQTT topics,
server-side script, npm packages, Python packages, or compiler.

On startup/reconnection, the current score is loaded silently. Duplicate packets,
decreases, and Berlin midnight rollovers do not trigger celebrations. Missing or
invalid API data produces `OFFLINE / ALT`, retaining the last confirmed values.
Missing heartbeats for 12 seconds do the same. New record styling is triggered
whenever the daily score exceeds the previous high score. Display values are not
written to flash on each point, and after a power cycle the board waits for fresh
data. The ring fills at the high score and is capped at a full circle.

## Install

Requirements: Linux, Python 3.9+ with timezone data, and systemd for the host service.
The RP2040 needs MicroPython with `framebuf`; its existing Waveshare MicroPython
1.19.1 firmware was verified on the connected board. Do not use a Pico W firmware
image: it cannot add a radio to this hardware.

From this directory, with USB attached to the programming computer:

```bash
./install.sh --test
./install.sh --flash
```

To keep it live on the current programming computer:

```bash
./install.sh --local
journalctl --user -u energy-game-display-local.service -n 20 --no-pager
```

This runs a temporary user service in the background, until stopped or the user
session ends; it is not enabled at boot. Stop it before reflashing or running the
device demo, or before moving the display:

```bash
systemctl --user stop energy-game-display-local.service
```

The programmer auto-detects a single MicroPython board. With multiple devices, use
`./install.sh --flash --port /dev/serial/by-id/usb-MicroPython_...`.
If access is denied, run `sudo setfacl -m u:$(id -un):rw /dev/ttyACM0`.
This temporary permission may need reapplying after unplugging the device.

The installer saves the old `main.py` and `boot.py`, if present, as
`*.pre-energy` on the board, uploads each new file with SHA-256 verification,
checks imports, and checks the running application's `ready` message. Other
existing files are left alone. Re-running installation preserves the original
backups. All application sources are in `firmware/`.

Edit a copy of `bridge.example.json` if using another host or board. `port` is a
stable USB serial ID; set it to `null` to autodetect a single MicroPython device.
The supplied ID is `e4629cc3231b4a29`. `api_url` points to the simple-api adapter,
**not** the VIS web port. For authenticated APIs, add `api_token` with a bearer
token. Use HTTPS for authenticated remote connections; the system trust store
must trust the server certificate. Tokens are never put in URLs or logs.

Copy this directory to the always-on host, then run there:

```bash
sudo ./install.sh --service --config bridge.example.json
```

This installs `/opt/energy-game-display/{bridge.py,serial_port.py}`, configuration
at `/etc/energy-game-display.json`, and `energy-game-display.service`. It creates
the unprivileged `energy-display` system user with serial access through `dialout`.
The service starts on boot and reconnects when USB or the API returns. Without
`--config`, an existing installed configuration is preserved. Explicit `--config`
replaces it. Re-running `--service` updates the bridge and restarts it.

**Move the USB cable from the programming laptop to hp400 after flashing.**
The service can be installed before moving the cable; it waits and retries.

## Verify and maintain

On the USB host:

```bash
systemctl status energy-game-display.service
sudo journalctl -u energy-game-display.service -n 30 --no-pager
```

Successful score delivery logs `Confirmed on display: today=... high=...` after
the RP2040 acknowledges the values. To test interactively, first stop that
service to release the exclusive serial lock:

```bash
sudo systemctl stop energy-game-display.service
sudo setfacl -m u:$(id -un):rw /dev/ttyACM0
python3 bridge.py --config bridge.example.json --read-only
python3 bridge.py --config bridge.example.json --once
python3 device_demo.py --config bridge.example.json
sudo systemctl start energy-game-display.service
```

`device_demo.py` briefly sends synthetic scores to the display to exercise both
animations, duplicates and offline recovery, then restores current live values.
It never writes to ioBroker. On a programming laptop without the service,
`python3 bridge.py --config bridge.example.json` runs the bridge until Ctrl+C.

If the board is on another USB port, `/dev/serial/by-id/` avoids ttyACM numbering
changes. If it still reports access denied, check that its tty device belongs to
`dialout` and has group read/write access. The unrelated USB serial device on
hp400 is deliberately not auto-selected.

To update firmware later, stop the bridge, rerun `--flash`, then restart the
service. `python3 flash.py --inspect` reports firmware and free memory and reboots
the existing app. If MicroPython is missing or the REPL cannot be recovered, hold
BOOT while tapping RESET, then copy the vendor's RP2040 Touch board UF2 to the
`RPI-RP2` volume. This bootloader recovery requires access to the board's buttons.

Uninstall the bridge (does not change the firmware):

```bash
sudo systemctl disable --now energy-game-display.service
sudo rm /etc/systemd/system/energy-game-display.service
sudo systemctl daemon-reload
sudo rm -r /opt/energy-game-display
sudo rm /etc/energy-game-display.json
sudo userdel energy-display
```

## Sources and pinout

- [Waveshare board specifications](https://www.waveshare.com/wiki/RP2040-Touch-LCD-1.28)
- [Official hardware examples](https://github.com/waveshareteam/RP2040-Touch-LCD-1.28/tree/5f28bf9d543f040f8cff6cce9229cabf0e08bcf5/python)
- [ioBroker simple-api API](https://github.com/ioBroker/ioBroker.simple-api#usage)

The LCD uses SPI1 SCK=10, MOSI=11, CS=9, DC=8, RESET=13, BACKLIGHT=25.
**The non-touch RP2040-LCD-1.28 uses different reset/backlight pins.**
Touch and IMU inputs are not used by this application.
