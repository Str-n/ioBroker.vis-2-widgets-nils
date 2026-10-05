"""Touch navigation independent of the LCD and I2C driver."""
ROOMS = ((0, 1, 2), (3, 4, 5, 6))
LABELS = ('1', '2', '3', 'Tisch', 'Insel', 'Kueche', 'Schrank')


class Controls:
    def __init__(self):
        self.page = 0
        self.lights = [-1] * 7
        self.session = None
        self.command = None
        self.serial = 0
        self.last_touch = 0
        self.pending_since = 0
        self.error_until = 0
        self.press = None
        self.moved = False
        self.swiped = False

    def update(self, packet, now):
        session = packet.get('session')
        if session != self.session:
            self.session = session
            self.command = None
            self.press = None
        lights = packet.get('lights', [-1] * 7)
        if isinstance(lights, list) and len(lights) == 7 and all(type(v) is int and v in (-1, 0, 1) for v in lights):
            self.lights = lights
        else:
            self.lights = [-1] * 7
        result = packet.get('result', {})
        if self.command:
            if result.get('id') == self.command['id'] and result.get('ok') is False:
                self.command = None
                self.error_until = now + 2500
            elif self.lights[self.command['lamp']] == 0:
                self.command = None

    def visible(self):
        if not self.page:
            return []
        return [i for i in ROOMS[self.page - 1] if self.lights[i] == 1 or (self.command and self.command["lamp"] == i and self.lights[i] != 0)]

    def hit(self, x, y):
        if 48 <= x <= 192 and 77 <= y < 205:
            index = (y - 77) // 32
            lamps = self.visible()
            if index < len(lamps):
                return lamps[index]
        return None

    def touch(self, point, now, online):
        """Act only on release; freeze the lamp identity at touch-down."""
        if point is not None:
            x, y = point
            self.last_touch = now
            if self.press is None:
                self.press = (x, y, x, y, self.hit(x, y), self.page)
                self.moved = False
                self.swiped = False
            else:
                ox, oy, _, _, key, page = self.press
                self.moved |= abs(x - ox) > 14 or abs(y - oy) > 14
                self.press = (ox, oy, x, y, key, page)
                dx, dy = x - ox, y - oy
                if not self.swiped and abs(dx) >= 30 and abs(dx) > abs(dy) * 1.4:
                    self.page = (self.page + (1 if dx < 0 else -1)) % 3
                    self.swiped = True
            return
        if self.press is None:
            return
        ox, oy, x, y, key, page = self.press
        self.press = None
        self.last_touch = now
        if self.swiped:
            return  # One swipe, one page; lifting cannot also tap a lamp.
        if not self.moved:
            if not self.page:
                self.page = 1
            elif y < 72:  # Room icon is also the home button.
                self.page = 0
            elif x < 40:
                self.page = (self.page - 1) % 3
            elif x > 200:
                self.page = (self.page + 1) % 3
            elif online and self.session and not self.command and page == self.page and key is not None and self.hit(x, y) == key:
                self.serial += 1
                self.command = {'id': self.serial, 'lamp': key, 'session': self.session}
                self.pending_since = now

    def tick(self, now, online):
        if not online:
            self.lights = [-1] * 7
            self.command = None
        if self.command and now - self.pending_since > 6500:
            self.command = None
            self.error_until = now + 2500
        if self.page and self.press is None and not self.command and now - self.last_touch > 15000:
            self.page = 0
