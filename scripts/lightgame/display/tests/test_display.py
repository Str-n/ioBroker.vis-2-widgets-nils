"""Behavioral tests for resets, duplicate frames, validation and USB framing."""
from datetime import datetime
import importlib.util
import json
import os
from pathlib import Path
import pty
import sys
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / 'firmware'))
from bridge import snapshot, exchange
from score_model import ScoreModel
from serial_port import SerialPort

BASE = '0_userdata.0.energyGame'
BERLIN = ZoneInfo('Europe/Berlin')
NOW = datetime(2026, 10, 5, 12, tzinfo=BERLIN)


def packet(daily=22, high=52, day='2026-10-05', **kwargs):
    return dict(v=1, type='score', daily=daily, high=high, day=day, **kwargs)


def rows(daily=22, high=52, day='2026-10-05', timestamp=None):
    return [dict(id=BASE + '.' + key, val=value, ts=timestamp or NOW.timestamp() * 1000)
            for key, value in [('score.daily', daily), ('score.highScore', high), ('day.key', day)]]


class ModelTests(unittest.TestCase):
    def test_boot_and_duplicate_do_not_celebrate(self):
        model = ScoreModel()
        self.assertFalse(model.update(packet()))
        self.assertFalse(model.update(packet()))
        self.assertEqual(model.daily, 22)

    def test_increase_and_record(self):
        model = ScoreModel()
        model.update(packet())
        self.assertTrue(model.update(packet(25)))
        self.assertEqual(model.delta, 3)
        self.assertFalse(model.record)
        self.assertTrue(model.update(packet(53, 53)))
        self.assertTrue(model.record)
        self.assertEqual(model.delta, 28)
        self.assertFalse(model.update(packet(53, 53)))
        self.assertEqual(model.delta, 28, 'Heartbeat must not erase an active bonus label')

    def test_midnight_and_reconnect_baselines(self):
        model = ScoreModel()
        model.update(packet())
        self.assertFalse(model.update(packet(0, day='2026-10-06')))
        self.assertTrue(model.update(packet(1, day='2026-10-06')))
        model.update(dict(v=1, type='offline'))
        self.assertFalse(model.update(packet(5, day='2026-10-06')))
        self.assertFalse(model.update(packet(6, day='2026-10-06', animate=False)))
        self.assertTrue(model.update(packet(7, day='2026-10-06')))

    def test_bad_packet_preserves_previous_score(self):
        model = ScoreModel()
        model.update(packet())
        for value in (-1, True, 2.5, '2', 1000000000, None):
            with self.assertRaises(ValueError):
                model.update(packet(value))
            self.assertEqual(model.daily, 22)


class SourceTests(unittest.TestCase):
    def test_live_snapshot(self):
        self.assertEqual(snapshot(rows(), BASE, NOW), packet())

    def test_missing_or_bad_states_fail_closed(self):
        with self.assertRaises(ValueError):
            snapshot(rows()[:2], BASE, NOW)
        for value in (True, '22', -1, float('nan')):
            with self.assertRaises(ValueError):
                snapshot(rows(daily=value), BASE, NOW)
        invalid = rows()
        invalid[0]['q'] = 64
        with self.assertRaises(ValueError):
            snapshot(invalid, BASE, NOW)

    def test_rollover_before_backend_and_between_writes(self):
        yesterday = datetime(2026, 10, 4, 23, 59, tzinfo=BERLIN).timestamp() * 1000
        for key in ('2026-10-04', '2026-10-05'):
            result = snapshot(rows(day=key, timestamp=yesterday), BASE, NOW)
            self.assertEqual(result['daily'], 0)
            self.assertEqual(result['high'], 52)
            self.assertEqual(result['day'], '2026-10-05')

    def test_berlin_day_across_dst(self):
        # UTC October 24, but already October 25 in Berlin (DST ends that day).
        now = datetime.fromisoformat('2026-10-24T22:30:00+00:00')
        data = rows(day='2026-10-25', timestamp=now.timestamp() * 1000)
        self.assertEqual(snapshot(data, BASE, now)['daily'], 22)
        data[2]['val'] = '2026-10-26'
        with self.assertRaises(ValueError):
            snapshot(data, BASE, now)


class SerialTests(unittest.TestCase):
    def test_fragmented_ack_and_exclusive_access(self):
        master, slave = pty.openpty()
        self.addCleanup(os.close, master)
        self.addCleanup(os.close, slave)
        path = os.ttyname(slave)
        with SerialPort(path) as port:
            with self.assertRaises(BlockingIOError):
                SerialPort(path)

            def device():
                data = b''
                while b'\n' not in data:
                    data += os.read(master, 4096)
                received = json.loads(data)
                ack = json.dumps(dict(v=1, type='ack', id=received['id'], daily=22, high=52, online=True)).encode() + b'\n'
                os.write(master, b'MicroPython startup\r\n' + ack[:10])
                os.write(master, ack[10:])

            worker = threading.Thread(target=device, daemon=True)
            worker.start()
            self.assertEqual(exchange(port, packet(), 123)['daily'], 22)
            worker.join(timeout=1)
            self.assertFalse(worker.is_alive())


class LCDTests(unittest.TestCase):
    def test_old_firmware_spi_cannot_steal_lcd_control_pin(self):
        modes = {}
        transfers = []

        class Pin:
            OUT = 'output'

            def __init__(self, number, mode=None, value=None):
                self.number = number
                if mode is not None:
                    modes[number] = mode

            def __call__(self, value):
                if modes.get(self.number) != self.OUT:
                    raise AssertionError('LCD control pin was reclaimed by SPI')

        class SPI:
            def __init__(self, *args, **kwargs):
                # The actual installed 1.19 Waveshare firmware configures GPIO8
                # as SPI1 MISO even when passed miso=None.
                modes[8] = 'spi'

            def write(self, value):
                transfers.append(len(value))

        class PWM:
            def __init__(self, pin):
                pass

            def freq(self, hz):
                pass

            def duty_u16(self, duty):
                pass

        class FrameBuffer:
            def __init__(self, *args):
                pass

            def fill(self, color):
                pass

        modules = {'machine': SimpleNamespace(Pin=Pin, SPI=SPI, PWM=PWM),
                   'framebuf': SimpleNamespace(FrameBuffer=FrameBuffer, RGB565=1),
                   'time': SimpleNamespace(sleep_ms=lambda _: None)}
        with patch.dict(sys.modules, modules):
            spec = importlib.util.spec_from_file_location('lcd_under_test', ROOT / 'firmware/lcd.py')
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            module.LCD()
        self.assertIn(240 * 240 * 2, transfers)


if __name__ == '__main__':
    unittest.main()
