import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT), str(ROOT / 'firmware')]
from controls import Controls
from bridge import Source, Commands
from lamps import LAMPS


def state(lights=None):
    return {'session': 'test', 'lights': lights or [1, 1, 0, 1, 1, 1, 1]}


def tap(c, x, y, t=100):
    c.touch((x, y), t, True)
    c.touch(None, t + 50, True)


class ControlsTests(unittest.TestCase):
    def test_first_tap_only_opens_and_only_on_lamps_visible(self):
        c = Controls()
        c.update(state(), 0)
        tap(c, 100, 100)
        self.assertEqual(c.page, 1)
        self.assertEqual(c.visible(), [0, 1])
        self.assertIsNone(c.command)
        tap(c, 100, 90)
        self.assertEqual(c.command['lamp'], 0)

    def test_swipe_never_switches_light_and_lists_are_room_specific(self):
        c = Controls()
        c.update(state(), 0)
        c.page = 1
        c.touch((170, 90), 1, True)
        c.touch((65, 92), 2, True)
        c.touch(None, 3, True)
        self.assertEqual(c.page, 2)
        self.assertEqual(c.visible(), [3, 4, 5, 6])
        self.assertIsNone(c.command)

    def test_short_swipe_changes_page_before_release_exactly_once(self):
        c = Controls()
        c.update(state(), 0)
        c.page = 1
        c.touch((150, 110), 10, True)
        c.touch((119, 112), 20, True)
        self.assertEqual(c.page, 2)
        c.touch((65, 113), 30, True)
        c.touch(None, 40, True)
        self.assertEqual(c.page, 2)
        self.assertIsNone(c.command)
        c.touch((90, 110), 50, True)
        c.touch((121, 108), 60, True)
        self.assertEqual(c.page, 1)
        c.touch(None, 70, True)
        self.assertEqual(c.page, 1)

    def test_list_change_during_press_cannot_target_different_lamp(self):
        c = Controls()
        c.update(state(), 0)
        c.page = 1
        c.touch((100, 90), 1, True)
        c.update(state([0, 1, 0, 0, 0, 0, 0]), 2)
        c.touch(None, 3, True)
        self.assertIsNone(c.command)

    def test_pending_waits_for_actual_off_and_blocks_second_command(self):
        c = Controls()
        c.update(state(), 0)
        c.page = 1
        tap(c, 100, 90)
        request = c.command
        c.update(state([-1, 1, 0, 0, 0, 0, 0]), 200)
        self.assertEqual(c.visible(), [0, 1])
        tap(c, 100, 125, 300)
        self.assertEqual(c.command, request)
        c.update(state([0, 1, 0, 0, 0, 0, 0]), 400)
        self.assertIsNone(c.command)
        self.assertEqual(c.visible(), [1])

    def test_disconnect_session_timeout_and_inactivity(self):
        c = Controls()
        c.update(state(), 0)
        c.page = 1
        tap(c, 100, 90)
        c.tick(200, False)
        self.assertIsNone(c.command)
        self.assertEqual(c.visible(), [])
        c.update(state(), 300)
        tap(c, 100, 90, 400)
        c.tick(8000, True)
        self.assertIsNone(c.command)
        self.assertGreater(c.error_until, 8000)
        c.tick(20000, True)
        self.assertEqual(c.page, 0)


class Response:
    def __init__(self, data):
        self.data = data
    def __enter__(self):
        return self
    def __exit__(self, *args):
        pass
    def read(self, limit):
        return json.dumps(self.data).encode()


class CommandTests(unittest.TestCase):
    def test_off_url_is_allowlisted_encoded_boolean_and_unacknowledged(self):
        source = Source({'api_url': 'http://example.test:8087'})
        lamp = {'val': True, 'ack': True, 'q': 0, 'common': {'type': 'boolean', 'write': True}}
        with patch('bridge.urlopen', side_effect=[Response(lamp), Response({'id': LAMPS[4], 'value': False})]) as fetch:
            source.turn_off(4)
            request = fetch.call_args_list[-1].args[0]
            self.assertIn('%23', request.full_url)
            self.assertIn('value=false&type=boolean&ack=false', request.full_url)
        for invalid in (True, -1, 7, '4', None):
            with patch('bridge.urlopen') as fetch:
                with self.assertRaises(ValueError):
                    source.turn_off(invalid)
                fetch.assert_not_called()

    def test_unknown_or_unconfirmed_lamp_cannot_be_written(self):
        source = Source({'api_url': 'http://example.test'})
        for lamp in ({'val': True, 'ack': False, 'common': {'type': 'boolean', 'write': True}},
                     {'val': True, 'ack': True, 'common': {'type': 'boolean', 'write': False}}):
            with patch('bridge.urlopen', return_value=Response(lamp)) as fetch:
                with self.assertRaises(ValueError):
                    source.turn_off(0)
                self.assertEqual(fetch.call_count, 1)

    def test_duplicate_and_previous_session_never_repeat_a_write(self):
        source = Source({'api_url': 'http://example.test'})
        commands = Commands(source)
        cmd = {'session': commands.session, 'id': 1, 'lamp': 0}
        with patch.object(source, 'turn_off', side_effect=TimeoutError) as off:
            commands.handle(cmd)
            commands.handle(cmd)
            commands.handle(dict(cmd, id=2, session='old'))
            self.assertEqual(off.call_count, 1)
            self.assertFalse(commands.result['ok'])


class TouchDriverTests(unittest.TestCase):
    def test_idle_never_polls_i2c_and_release_is_explicit(self):
        import importlib.util
        from types import SimpleNamespace
        reads = []
        point = bytearray((1, 0, 100, 0, 120))

        class Bus:
            def __init__(self, bus, *, sda, scl, freq):
                pass
            def readfrom_mem(self, addr, reg, count):
                reads.append(reg)
                return b'\xb5' if reg == 0xa7 else bytes(point)
            def writeto_mem(self, address, register, data):
                if register == 0xfa:
                    self.irq_flags = data[0]

        class Pin:
            IN, OUT, PULL_UP, IRQ_FALLING = range(4)
            def __init__(self, *args, **kwargs):
                pass
            def __call__(self, value):
                pass
            def irq(self, **kwargs):
                pass

        with patch.dict(sys.modules, {'machine': SimpleNamespace(I2C=Bus, Pin=Pin),
                                      'time': SimpleNamespace(sleep_ms=lambda _: None)}):
            spec = importlib.util.spec_from_file_location('touch_under_test', ROOT / 'firmware/touch.py')
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            touch = module.Touch()
            for _ in range(100):
                self.assertIsNone(touch.read())
            self.assertEqual(reads, [0xa7])
            touch.signal(None)
            self.assertEqual(touch.read(), (100, 120))
            self.assertEqual(touch.read(), (100, 120))
            self.assertEqual(reads, [0xa7, 2])
            point[0] = 0
            # The real chip raises a release IRQ only with EnChange enabled.
            if touch.bus.irq_flags & 0x20:
                touch.signal(None)
            self.assertEqual(touch.read(), (100, 120))  # Final position, then release.
            self.assertIsNone(touch.read())
