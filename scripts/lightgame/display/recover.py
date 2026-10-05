#!/usr/bin/env python3
"""Catch MicroPython immediately after USB reconnect, before a faulty main starts."""
import sys
sys.dont_write_bytecode = True
import glob
import os
import time
from flash import main as flash_main

if os.geteuid() != 0:
    raise SystemExit('Run with sudo so the newly enumerated USB port can be opened immediately.')
print('Unplug the display now, then reconnect it. Waiting up to 120 seconds...', flush=True)
end = time.monotonic() + 120
pattern = '/dev/serial/by-id/usb-MicroPython_Board_in_FS_mode_e4629cc3231b4a29-if00'
while glob.glob(pattern) and time.monotonic() < end:
    time.sleep(0.02)
while not glob.glob(pattern) and time.monotonic() < end:
    time.sleep(0.02)
if time.monotonic() >= end:
    raise SystemExit('No reconnect detected. Run again and unplug/reconnect while this script waits.')
print('Device detected; interrupting startup and installing the repaired firmware...', flush=True)
sys.argv = [sys.argv[0], '--port', pattern]
# Restore just the invoking user's serial access for the local bridge.
uid = os.environ.get('SUDO_UID')
if uid and uid.isdigit():
    import subprocess
    subprocess.run(['setfacl', '-m', 'u:' + uid + ':rw', os.path.realpath(pattern)], check=True)
flash_main()
print('Recovery complete. The normal bridge can now be restarted.', flush=True)
