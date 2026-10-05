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

    def circle(self, x, y, radius, color):
        for i in range(0, 120, 5):
            vx, vy = VECTORS[i]
            nx, ny = VECTORS[(i + 5) % 120]
            self.lcd.line(x + int(vx * radius), y + int(vy * radius),
                          x + int(nx * radius), y + int(ny * radius), color)

    def icon(self, kind, x, y, color=TEAL, scale=1):
        d = self.lcd

        def line(a, b, c, e):
            d.line(x + a * scale, y + b * scale, x + c * scale, y + e * scale, color)
            d.line(x + a * scale, y + b * scale + 1, x + c * scale, y + e * scale + 1, color)

        def box(a, b, w, h):
            d.rect(x + a * scale, y + b * scale, w * scale, h * scale, color)

        if kind == 'sofa':
            box(5, 2, 22, 13)
            box(1, 10, 5, 11)
            box(26, 10, 5, 11)
            line(6, 16, 26, 16)
            line(5, 21, 27, 21)
            line(6, 21, 6, 24)
            line(26, 21, 26, 24)
        elif kind == 'oven':
            box(4, 2, 24, 22)
            box(8, 11, 16, 10)
            line(9, 8, 11, 8)
            line(21, 8, 23, 8)
            line(8, 0, 13, 0)
            line(19, 0, 24, 0)
            line(12, 14, 20, 14)
        elif kind == 'table':
            line(2, 7, 30, 7)
            line(5, 7, 5, 23)
            line(27, 7, 27, 23)
            line(11, 4, 21, 4)
        elif kind == 'island':
            line(1, 5, 31, 5)
            box(4, 7, 24, 16)
            line(16, 8, 16, 22)
        elif kind == 'cupboard':
            box(5, 1, 22, 23)
            line(16, 2, 16, 23)
            line(12, 10, 12, 15)
            line(20, 10, 20, 15)
        else:
            self.circle(x + 16 * scale, y + 9 * scale, 7 * scale, color)
            line(12, 15, 12, 19)
            line(20, 15, 20, 19)
            line(12, 19, 20, 19)
            line(14, 23, 18, 23)

    def room(self, controls, online, now):
        from controls import LABELS, ROOMS
        d = self.lcd
        d.fill(BG)
        self.icon('sofa' if controls.page == 1 else 'oven', 88, 18, TEAL, 2)
        # Inset arrows stay away from the least sensitive circular edge.
        for x, direction in ((25, -1), (215, 1)):
            d.line(x - direction * 5, 111, x + direction * 2, 119, MUTED)
            d.line(x + direction * 2, 119, x - direction * 5, 127, MUTED)
        if not online:
            self.text('Keine Verbindung', 114, GOLD)
        else:
            lamps = controls.visible()
            for row, lamp in enumerate(lamps):
                y = 77 + row * 32
                pending = controls.command and controls.command['lamp'] == lamp
                d.fill_rect(48, y, 144, 29, TRACK)
                if controls.press and controls.press[4] == lamp and not controls.moved:
                    d.rect(48, y, 144, 29, TEAL)
                kind = ('bulb', 'bulb', 'bulb', 'table', 'island', 'oven', 'cupboard')[lamp]
                self.icon(kind, 54, y + 2, GOLD)
                d.text(LABELS[lamp], 94, y + 11, WHITE)
                if pending:
                    d.text('...', 161, y + 11, GOLD)
                else:
                    self.circle(177, y + 15, 7, TEAL)
                    d.fill_rect(174, y + 6, 7, 7, TRACK)
                    d.vline(177, y + 6, 9, TEAL)
            if not lamps:
                unknown = any(controls.lights[i] == -1 for i in ROOMS[controls.page - 1])
                if unknown:
                    self.text('?', 108, GOLD, 3)
                else:
                    # Large check mark, plus a tiny reassuring label.
                    d.line(95, 116, 111, 132, TEAL)
                    d.line(111, 132, 147, 95, TEAL)
                    d.line(95, 117, 111, 133, TEAL)
                    d.line(111, 133, 147, 96, TEAL)
                    self.text('Alles aus!', 154, MUTED)
        for page in range(3):
            self.circle(104 + page * 16, 220, 3, TEAL if page == controls.page else MUTED)
        if now < controls.error_until:
            self.text('Nochmal tippen', 207, GOLD)
        d.show()
