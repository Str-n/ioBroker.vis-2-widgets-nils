"""GC9A01A on Waveshare RP2040-*Touch*-LCD-1.28 (not the non-touch board).

Register values and pin assignment verified against the manufacturer's demo:
https://github.com/waveshareteam/RP2040-Touch-LCD-1.28
commit 5f28bf9d543f040f8cff6cce9229cabf0e08bcf5, python/RP2040-LCD-1.28.py.
The init table is hardware configuration data; this driver is independently written.
"""
from machine import Pin, SPI, PWM
import framebuf
import time

INIT = (
    (0xef, b''), (0xeb, b'\x14'), (0xfe, b''), (0xef, b''), (0xeb, b'\x14'),
    (0x84, b'\x40'), (0x85, b'\xff'), (0x86, b'\xff'), (0x87, b'\xff'),
    (0x88, b'\x0a'), (0x89, b'\x21'), (0x8a, b'\x00'), (0x8b, b'\x80'),
    (0x8c, b'\x01'), (0x8d, b'\x01'), (0x8e, b'\xff'), (0x8f, b'\xff'),
    (0xb6, b'\x00\x20'), (0x36, b'\x98'), (0x3a, b'\x05'),
    (0x90, b'\x08\x08\x08\x08'), (0xbd, b'\x06'), (0xbc, b'\x00'),
    (0xff, b'\x60\x01\x04'), (0xc3, b'\x13'), (0xc4, b'\x13'), (0xc9, b'\x22'),
    (0xbe, b'\x11'), (0xe1, b'\x10\x0e'), (0xdf, b'\x21\x0c\x02'),
    (0xf0, b'\x45\x09\x08\x08\x26\x2a'), (0xf1, b'\x43\x70\x72\x36\x37\x6f'),
    (0xf2, b'\x45\x09\x08\x08\x26\x2a'), (0xf3, b'\x43\x70\x72\x36\x37\x6f'),
    (0xed, b'\x1b\x0b'), (0xae, b'\x77'), (0xcd, b'\x63'),
    (0x70, b'\x07\x07\x04\x0e\x0f\x09\x07\x08\x03'), (0xe8, b'\x34'),
    (0x62, b'\x18\x0d\x71\xed\x70\x70\x18\x0f\x71\xef\x70\x70'),
    (0x63, b'\x18\x11\x71\xf1\x70\x70\x18\x13\x71\xf3\x70\x70'),
    (0x64, b'\x28\x29\xf1\x01\xf1\x00\x07'),
    (0x66, b'\x3c\x00\xcd\x67\x45\x45\x10\x00\x00\x00'),
    (0x67, b'\x00\x3c\x00\x00\x00\x01\x54\x10\x32\x98'),
    (0x74, b'\x10\x85\x80\x00\x00\x4e\x00'), (0x98, b'\x3e\x07'),
    (0x35, b''), (0x21, b''), (0x11, b''), (0x29, b''),
)


def rgb(r, g, b):
    # BGR panel, little-endian framebuf, big-endian SPI pixel stream.
    value = ((b & 248) << 8) | ((g & 252) << 3) | (r >> 3)
    return ((value & 255) << 8) | (value >> 8)


class LCD(framebuf.FrameBuffer):
    def __init__(self):
        self.backlight = PWM(Pin(25))
        self.backlight.freq(5000)
        self.backlight.duty_u16(0)
        self.cs, self.reset = Pin(9, Pin.OUT, value=1), Pin(13, Pin.OUT)
        # SPI1's default MISO is GPIO8, which this board uses for LCD DC.
        # Explicitly disable MISO or SPI initialization steals the DC pin.
        self.spi = SPI(1, baudrate=62_500_000, polarity=0, phase=0,
                       sck=Pin(10), mosi=Pin(11), miso=None)
        # Waveshare MicroPython 1.19 still configures its default MISO even with
        # miso=None. Reclaim GPIO8 *after* SPI construction (vendor driver order).
        self.dc = Pin(8, Pin.OUT, value=1)
        self.buffer = bytearray(240 * 240 * 2)
        super().__init__(self.buffer, 240, 240, framebuf.RGB565)
        self.reset(1)
        time.sleep_ms(10)
        self.reset(0)
        time.sleep_ms(10)
        self.reset(1)
        time.sleep_ms(120)
        for command, data in INIT:
            self.command(command, data)
            if command == 0x11:
                time.sleep_ms(120)
        self.fill(0)
        self.show()
        self.backlight.duty_u16(42000)

    def command(self, command, data=b''):
        self.cs(0)
        self.dc(0)
        self.spi.write(bytes((command,)))
        if data:
            self.dc(1)
            self.spi.write(data)
        self.cs(1)

    def show(self):
        self.command(0x2a, b'\x00\x00\x00\xef')
        self.command(0x2b, b'\x00\x00\x00\xef')
        self.command(0x2c)
        self.dc(1)
        self.cs(0)
        self.spi.write(self.buffer)
        self.cs(1)
