#!/usr/bin/env python3
"""Install application files through MicroPython raw REPL. No pip/SDK required."""
import argparse
import hashlib
import json
from pathlib import Path
import time

from serial_port import SerialPort, discover

HERE = Path(__file__).resolve().parent
FILES = ('score_model.py', 'lcd.py', 'controls.py', 'touch.py', 'ui.py', 'main.py')


class RawREPL:
    def __init__(self, port):
        self.port = port
        port.write(b'\r\x03\x03')
        time.sleep(0.2)
        port.write(b'\x01')
        port.read_until(b'raw REPL; CTRL-B to exit\r\n>')
        # Soft reset in raw mode skips main.py and releases the old framebuffer.
        port.write(b'\x04')
        port.read_until(b'raw REPL; CTRL-B to exit\r\n>', timeout=6)

    def execute(self, code):
        source = code.encode()
        for offset in range(0, len(source), 128):
            self.port.write(source[offset:offset + 128])
            time.sleep(0.005)
        self.port.write(b'\x04')
        if self.port.read_until(b'OK') != b'OK':
            raise RuntimeError('Unexpected raw REPL response')
        out = self.port.read_until(b'\x04', timeout=10)[:-1]
        err = self.port.read_until(b'\x04', timeout=10)[:-1]
        self.port.read_until(b'>')
        if err:
            raise RuntimeError(err.decode(errors='replace'))
        return out.decode().strip()

    def upload(self, name, data):
        temporary = name + '.new'
        self.execute('f=open(%r,"wb")' % temporary)
        for offset in range(0, len(data), 256):
            self.execute('f.write(%r)' % data[offset:offset + 256])
        self.execute('f.close()')
        checksum = self.execute(
            'import uhashlib,ubinascii; h=uhashlib.sha256(); f=open(%r,"rb")\n'
            'while True:\n b=f.read(512)\n if not b: break\n h.update(b)\n'
            'f.close(); print(ubinascii.hexlify(h.digest()).decode())' % temporary)
        if checksum != hashlib.sha256(data).hexdigest():
            raise RuntimeError('Upload checksum mismatch: ' + name)
        self.execute('import os; os.rename(%r,%r)' % (temporary, name))
        print('Verified', name, len(data), 'bytes', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port')
    parser.add_argument('--inspect', action='store_true')
    args = parser.parse_args()
    with SerialPort(args.port or discover()) as port:
        repl = RawREPL(port)
        print(repl.execute('import os,sys,gc; print(os.uname()); print(os.listdir()); print(gc.mem_free())'))
        if args.inspect:
            port.write(b'\x02\x04')
            return
        # Keep the previous entry points on the board; all other preexisting
        # application files are left untouched. Recovery is possible via REPL.
        repl.execute('import os\nfor n in ("main.py","boot.py"):\n'
                     ' if n in os.listdir() and n+".pre-energy" not in os.listdir():\n'
                     '  os.rename(n,n+".pre-energy")\n'
                     ' elif n=="boot.py" and n in os.listdir():\n  os.remove(n)')
        for name in FILES:
            repl.upload(name, (HERE / 'firmware' / name).read_bytes())
        # Check imports before enabling the application; no framebuffer yet.
        print(repl.execute('import score_model,lcd,ui; print("Imports OK")'))
        port.write(b'\x02\x04')
        # The application reports readiness only after initializing and drawing.
        end = time.monotonic() + 12
        while time.monotonic() < end:
            line = port.read_until(timeout=12).decode(errors='replace').strip()
            if line.startswith('{'):
                packet = json.loads(line)
                if packet.get('type') == 'ready':
                    print('Display booted:', packet)
                    return
            if line:
                print(line)
        raise RuntimeError('No ready message from display')


if __name__ == '__main__':
    main()
