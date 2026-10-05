"""Circular energy dial: large score, progress ring, rising bonus and starburst."""
import math
import framebuf
from lcd import rgb

BG = rgb(4, 12, 22)
TRACK = rgb(15, 37, 48)
MUTED = rgb(105, 142, 154)
WHITE = rgb(235, 255, 250)
TEAL = rgb(39, 235, 177)
GOLD = rgb(255, 201, 75)

# Compact 5x7 numerals. These use only 70 bytes of glyph data.
DIGITS = (
    (14, 17, 19, 21, 25, 17, 14), (4, 12, 4, 4, 4, 4, 14),
    (14, 17, 1, 2, 4, 8, 31), (30, 1, 1, 14, 1, 1, 30),
    (2, 6, 10, 18, 31, 2, 2), (31, 16, 16, 30, 1, 1, 30),
    (14, 16, 16, 30, 17, 17, 14), (31, 1, 2, 4, 8, 8, 8),
    (14, 17, 17, 14, 17, 17, 14), (14, 17, 17, 15, 1, 1, 14),
)
VECTORS = tuple((math.sin(i * math.pi / 60), -math.cos(i * math.pi / 60)) for i in range(120))


class UI:
    def __init__(self, lcd):
        self.lcd = lcd
        self.glyph = framebuf.FrameBuffer(bytearray(8), 8, 8, framebuf.MONO_HLSB)

    def text(self, message, y, color=MUTED, scale=1):
        x = (240 - len(message) * 8 * scale) // 2
        if scale == 1:
            self.lcd.text(message, x, y, color)
            return
        for ch in message:
            self.glyph.fill(0)
            self.glyph.text(ch, 0, 0, 1)
            for gy in range(8):
                for gx in range(8):
                    if self.glyph.pixel(gx, gy):
                        self.lcd.fill_rect(x + gx * scale, y + gy * scale, scale, scale, color)
            x += 8 * scale

    def number(self, value, color):
        text = str(value)
        scale = min(9, 180 // (len(text) * 6 - 1))
        x = (240 - (len(text) * 6 - 1) * scale) // 2
        y = 114 - (7 * scale) // 2
        for digit in text:
            for row, bits in enumerate(DIGITS[int(digit)]):
                for col in range(5):
                    if bits & (16 >> col):
                        self.lcd.fill_rect(x + col * scale, y + row * scale, scale, scale, color)
            x += 6 * scale

    def draw(self, model, elapsed=9999):
        d = self.lcd
        d.fill(BG)
        active = elapsed < 1500
        accent = GOLD if active and model.record else TEAL
        progress = min(120, int(120 * (model.daily or 0) / max(1, model.high)))
        for i, (vx, vy) in enumerate(VECTORS):
            color = accent if i < progress else TRACK
            d.line(120 + int(vx * 109), 120 + int(vy * 109),
                   120 + int(vx * 114), 120 + int(vy * 114), color)
        # Small lightning emblem.
        d.line(124, 25, 115, 36, accent)
        d.line(115, 36, 124, 36, accent)
        d.line(124, 36, 116, 47, accent)
        self.text('ENERGY GAME', 52, MUTED)
        self.text('HEUTE', 69, accent)
        if model.daily is None:
            self.text('--', 96, WHITE, 3)
        else:
            self.number(model.daily, accent if active and elapsed < 220 else WHITE)
        if active:
            t = elapsed / 1500
            for i in range(28):
                vx, vy = VECTORS[(i * 37) % 120]
                radius = 32 + t * (75 + i % 5 * 7)
                x, y = 120 + int(vx * radius), 114 + int(vy * radius)
                d.line(x, y, x - int(vx * 7), y - int(vy * 7), accent if i % 3 else WHITE)
            self.text('+' + str(model.delta), 165 - int(17 * t), accent, 2)
            self.text('BEST ' + str(model.high), 183, GOLD)
            if model.record:
                self.text('NEUER REKORD!', 191, GOLD)
        else:
            d.hline(84, 154, 72, TRACK)
            self.text('HIGH SCORE', 167, MUTED)
            self.text(str(model.high) if model.daily is not None else '--', 182, GOLD, 2)
        status = 'LIVE / USB' if model.online else ('WARTE AUF HOST' if model.daily is None else 'OFFLINE / ALT')
        self.text(status, 209, MUTED if model.online else GOLD)
        d.show()
