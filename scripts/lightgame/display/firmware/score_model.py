"""Small, hardware-independent validator/state machine (also tested on CPython)."""


def score(value):
    if type(value) is not int or value < 0 or value > 999999999:
        raise ValueError("invalid score")
    return value


class ScoreModel:
    def __init__(self):
        self.daily = None
        self.high = 0
        self.day = ""
        self.online = False
        self.delta = 0
        self.record = False

    def update(self, packet):
        if packet.get("v") != 1:
            raise ValueError("unsupported protocol")
        if packet.get("type") == "offline":
            self.online = False
            return False
        if packet.get("type") != "score":
            raise ValueError("unknown packet")
        daily, high = score(packet.get("daily")), score(packet.get("high"))
        day = packet.get("day")
        if not isinstance(day, str) or len(day) != 10 or day[4] != "-" or day[7] != "-":
            raise ValueError("invalid day")
        # A boot, reconnection or midnight reset establishes a new baseline.
        # Repeated heartbeats must never replay an old celebration.
        animate = (self.online and self.daily is not None and self.day == day
                   and daily > self.daily and packet.get("animate", True) is True)
        if animate:
            self.delta = daily - self.daily
            self.record = daily > self.high
        self.daily, self.high, self.day = daily, max(high, daily), day
        self.online = True
        return animate
