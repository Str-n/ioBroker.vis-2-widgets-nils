"""Dependency-free Linux USB CDC serial transport, with an exclusive process lock."""
import fcntl
import glob
import os
import select
import termios
import time
import tty


def discover():
    ports = glob.glob('/dev/serial/by-id/usb-MicroPython_*')
    if len(ports) != 1:
        raise OSError('Expected one MicroPython device; pass --port /dev/serial/by-id/...')
    return ports[0]


class SerialPort:
    def __init__(self, path):
        self.fd = os.open(path, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
        try:
            fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            tty.setraw(self.fd)
            attrs = termios.tcgetattr(self.fd)
            attrs[4] = attrs[5] = termios.B115200
            attrs[2] |= termios.CLOCAL | termios.CREAD
            termios.tcsetattr(self.fd, termios.TCSANOW, attrs)
        except BaseException:
            os.close(self.fd)
            raise
        self.pending = bytearray()

    def write(self, data, timeout=3):
        end = time.monotonic() + timeout
        while data:
            remaining = end - time.monotonic()
            if remaining <= 0 or not select.select([], [self.fd], [], remaining)[1]:
                raise TimeoutError('Serial write timed out')
            count = os.write(self.fd, data)
            if not count:
                raise OSError('Serial disconnected')
            data = data[count:]

    def read_until(self, marker=b'\n', timeout=3):
        end = time.monotonic() + timeout
        while True:
            index = self.pending.find(marker)
            if index >= 0:
                result = bytes(self.pending[:index + len(marker)])
                del self.pending[:index + len(marker)]
                return result
            if len(self.pending) > 262144:
                raise ValueError('Oversized serial response')
            remaining = end - time.monotonic()
            if remaining <= 0 or not select.select([self.fd], [], [], remaining)[0]:
                raise TimeoutError('Serial response timed out')
            data = os.read(self.fd, 4096)
            if not data:
                raise OSError('Serial disconnected')
            self.pending.extend(data)

    def close(self):
        os.close(self.fd)

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
