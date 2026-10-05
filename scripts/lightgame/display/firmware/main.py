"""Boot application. Newline-delimited JSON on USB CDC, protocol version 1."""
import gc
import json
import select
import sys
import time
from score_model import ScoreModel
from ui import UI
from lcd import LCD
from controls import Controls
from touch import Touch


def main():
    time.sleep_ms(1500)  # Recovery window for Ctrl-C before peripheral startup.
    gc.collect()  # Compile all modules before allocating the 115,200-byte framebuffer.
    lcd = LCD()
    ui = UI(lcd)
    controls = Controls()
    try:
        touch = Touch()
    except OSError:
        touch = None
    gc.collect()
    gc.threshold(12000)  # Collect short-lived animation/JSON objects before RAM fills.
    model = ScoreModel()
    poll = select.poll()
    poll.register(sys.stdin, select.POLLIN)
    line = ''
    overflow = False
    last_rx = time.ticks_ms()
    started = time.ticks_add(last_rx, -2000)
    last_frame = time.ticks_add(last_rx, -1000)
    last_tick = last_rx
    uptime = 0
    ui.draw(model)
    print(json.dumps({'v': 1, 'type': 'ready', 'app': 'energy-display', 'touch': touch.chip if touch else None, 'free': gc.mem_free()}))
    while True:
        now = time.ticks_ms()
        uptime += time.ticks_diff(now, last_tick)
        last_tick = now
        dirty = False
        # Bound work per frame; malformed or incomplete input cannot block rendering.
        for _ in range(768):
            if not poll.poll(0):
                break
            char = sys.stdin.read(1)
            if char == '\n':
                if line and not overflow:
                    try:
                        packet = json.loads(line)
                        if not isinstance(packet, dict):
                            raise ValueError('expected object')
                        animated = model.update(packet)
                        controls.update(packet, uptime)
                        if animated:
                            started = now
                            controls.page = 0
                        last_rx = now
                        dirty = True
                        print(json.dumps({'v': 1, 'type': 'ack', 'id': packet.get('id'),
                                          'daily': model.daily, 'high': model.high,
                                          'online': model.online, 'delta': model.delta,
                                          'animated': animated,
                                          'command': controls.command, 'page': controls.page,
                                          'touch_events': touch.events if touch else 0,
                                          'free': gc.mem_free()}))
                    except (ValueError, TypeError, KeyError) as exc:
                        print(json.dumps({'v': 1, 'type': 'error', 'message': str(exc)}))
                line = ''
                overflow = False
            elif char != '\r' and not overflow:
                if len(line) < 1024:
                    line += char
                else:
                    overflow = True
        if model.online and time.ticks_diff(now, last_rx) > 12000:
            model.online = False
            dirty = True
        elapsed = time.ticks_diff(now, started)
        if touch:
            try:
                old = (controls.page, controls.command, bool(controls.press), controls.moved)
                controls.touch(touch.read(), uptime, model.online)
                dirty |= old != (controls.page, controls.command, bool(controls.press), controls.moved)
            except OSError:
                controls.press = None  # A bus error must never count as a release/tap.
                touch.point = None
        old_page = controls.page
        controls.tick(uptime, model.online)
        dirty |= old_page != controls.page
        # Draw at ~25fps during bursts, at 1fps when idle; no flash writes per point.
        if dirty or time.ticks_diff(now, last_frame) >= (40 if elapsed < 1600 else 1000):
            if controls.page:
                ui.room(controls, model.online, uptime)
            else:
                ui.draw(model, elapsed)
            last_frame = now
        time.sleep_ms(5)


main()
