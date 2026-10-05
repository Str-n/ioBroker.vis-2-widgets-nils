#!/usr/bin/env python3
"""ioBroker scores and allowlisted lamp OFF commands over RP2040 USB."""
import argparse
from datetime import datetime
import json
import logging
from pathlib import Path
import signal
import secrets
import time
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from serial_port import SerialPort, discover
from lamps import LAMPS

LOG = logging.getLogger('energy-display')
SUFFIXES = ('score.daily', 'score.highScore', 'day.key')
BERLIN = ZoneInfo('Europe/Berlin')


def integer(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError('Score is not numeric')
    if not 0 <= value <= 999999999 or int(value) != value:
        raise ValueError('Score is not a non-negative integer')
    return int(value)


def snapshot(rows, base, now=None):
    """Validate all required states and hide yesterday's score at Berlin midnight."""
    if not isinstance(rows, list):
        raise ValueError('Expected simple-api getBulk array')
    states = {item['id']: item for item in rows if isinstance(item, dict) and 'id' in item}
    required = []
    for suffix in SUFFIXES:
        state = states.get(base + '.' + suffix)
        if not state or state.get('val') is None or state.get('q', 0) != 0:
            raise ValueError('Missing or invalid state: ' + suffix)
        required.append(state)
    daily_state, high_state, day_state = required
    daily, high = integer(daily_state['val']), integer(high_state['val'])
    day = day_state['val']
    if not isinstance(day, str) or datetime.strptime(day, '%Y-%m-%d').strftime('%Y-%m-%d') != day:
        raise ValueError('Invalid backend day key')
    today = (now or datetime.now(BERLIN)).astimezone(BERLIN).strftime('%Y-%m-%d')
    if day > today:
        raise ValueError('Backend day is in the future; check the host clock')
    timestamp = daily_state.get('ts')
    if isinstance(timestamp, bool) or not isinstance(timestamp, (int, float)) or timestamp <= 0:
        raise ValueError('Missing daily score timestamp')
    written_day = datetime.fromtimestamp(timestamp / 1000, BERLIN).strftime('%Y-%m-%d')
    # Backend writes day.key just before resetting score.daily. Avoid displaying
    # the previous day's score in that brief non-atomic window, or while the
    # backend's once-per-minute rollover check has not run yet.
    if day != today or written_day != today:
        daily = 0
    return {'v': 1, 'type': 'score', 'day': today, 'daily': daily, 'high': max(high, daily)}


class Source:
    def __init__(self, config):
        base = config.get('state_base', '0_userdata.0.energyGame')
        url = config['api_url'].rstrip('/')
        parsed = urlparse(url)
        if parsed.scheme not in ('http', 'https') or not parsed.netloc or parsed.query or parsed.fragment:
            raise ValueError('api_url must be an HTTP(S) base URL without query/fragment')
        ids = ','.join([base + '.' + suffix for suffix in SUFFIXES] + list(LAMPS))
        self.api_url = url
        self.url = url + '/getBulk/' + quote(ids, safe=',.')
        self.base = base
        self.headers = {'Accept': 'application/json'}
        # Optional bearer token stays in the local config, never in URLs/logs.
        if config.get('api_token'):
            self.headers['Authorization'] = 'Bearer ' + config['api_token']

    def read(self):
        with urlopen(Request(self.url, headers=self.headers), timeout=3) as response:
            data = response.read(65537)
        if len(data) > 65536:
            raise ValueError('API response too large')
        rows = json.loads(data)
        packet = snapshot(rows, self.base)
        states = {item['id']: item for item in rows if isinstance(item, dict) and 'id' in item}
        packet['lights'] = []
        for lamp in LAMPS:
            state = states.get(lamp, {})
            value = state.get('val')
            packet['lights'].append(int(value) if type(value) is bool and state.get('ack') is True and state.get('q', 0) == 0 else -1)
        return packet

    def turn_off(self, lamp):
        if type(lamp) is not int or not 0 <= lamp < len(LAMPS):
            raise ValueError('Lamp outside allowlist')
        path = quote(LAMPS[lamp], safe='')  # Shelly IDs contain #, not URL fragments.
        with urlopen(Request(self.api_url + '/get/' + path, headers=self.headers), timeout=3) as response:
            state = json.loads(response.read(16384))
        common = state.get('common', {})
        if common.get('type') != 'boolean' or common.get('write') is not True:
            raise ValueError('Lamp is not a writable Boolean state')
        if state.get('ack') is not True or state.get('q', 0) != 0 or type(state.get('val')) is not bool:
            raise ValueError('Lamp state not confirmed')
        if state['val'] is False:
            return  # Already off: no write and no synthetic points.
        url = self.api_url + '/set/' + path + '?value=false&type=boolean&ack=false'
        with urlopen(Request(url, headers=self.headers), timeout=3) as response:
            result = json.loads(response.read(16384))
        if not isinstance(result, dict) or result.get('error'):
            raise ValueError('ioBroker rejected OFF')
        LOG.info('Requested OFF: %s', LAMPS[lamp])


class Commands:
    def __init__(self, source):
        self.source = source
        self.session = secrets.token_hex(6)
        self.last_id = 0
        self.result = None

    def handle(self, command):
        if not isinstance(command, dict) or command.get('session') != self.session:
            return
        number = command.get('id')
        if type(number) is not int or number <= self.last_id:
            return  # Never retry a physical write after an ambiguous response.
        self.last_id = number
        self.result = {'id': number, 'ok': False}
        try:
            self.source.turn_off(command.get('lamp'))
            self.result['ok'] = True
        except Exception as exc:
            LOG.warning('OFF failed: %s', type(exc).__name__)


def exchange(port, packet, counter):
    packet = dict(packet, id=counter)
    port.write(json.dumps(packet, separators=(',', ':')).encode() + b'\n')
    end = time.monotonic() + 3
    while time.monotonic() < end:
        line = port.read_until(timeout=max(0.01, end - time.monotonic()))
        try:
            response = json.loads(line)
        except (ValueError, UnicodeError):
            continue  # Startup banner, if the device has just booted.
        if not isinstance(response, dict):
            continue
        if response.get('type') == 'error':
            raise ValueError('Display rejected packet: ' + str(response.get('message')))
        if response.get('type') == 'ack' and response.get('id') == counter:
            if response.get('online') != (packet['type'] == 'score'):
                raise ValueError('Unexpected device connection status')
            if packet['type'] == 'score' and (response.get('daily'), response.get('high')) != (packet['daily'], packet['high']):
                raise ValueError('Device score acknowledgement mismatch')
            return response
    raise TimeoutError('No matching acknowledgement from display')


def run(config, once=False):
    source = Source(config)
    commands = Commands(source)
    interval = float(config.get('poll_seconds', 0.5))
    if not 0.2 <= interval <= 5:
        raise ValueError('poll_seconds must be between 0.2 and 5')
    port = None
    previous = None
    healthy = False
    counter = 0
    last_sent = 0
    last_error = None
    last_page = None
    try:
        while True:
            begin = time.monotonic()
            try:
                packet = source.read()
            except Exception as exc:
                healthy = False
                previous = None
                packet = {'v': 1, 'type': 'offline'}
                message = 'ioBroker unavailable: ' + type(exc).__name__
                if message != last_error:
                    LOG.warning(message)
                    last_error = message
                if once:
                    raise
            try:
                if port is None:
                    port = SerialPort(config.get('port') or discover())
                    commands = Commands(source)
                    previous = None
                    healthy = False
                    last_sent = 0
                    LOG.info('USB display connected')
                if packet != previous or begin - last_sent >= interval or once:
                    outgoing = dict(packet, animate=healthy, session=commands.session)
                    if commands.result:
                        outgoing['result'] = commands.result
                    counter += 1
                    ack = exchange(port, outgoing, counter)
                    if ack.get('page') != last_page:
                        last_page = ack.get('page')
                        LOG.info('Display page=%s touch_events=%s', last_page, ack.get('touch_events'))
                    if packet['type'] == 'score' and not once:
                        commands.handle(ack.get('command'))
                    if packet['type'] == 'score':
                        if not healthy or packet != previous:
                            LOG.info('Confirmed on display: today=%s high=%s day=%s',
                                     ack['daily'], ack['high'], packet['day'])
                        healthy = True
                        last_error = None
                    previous = packet
                    last_sent = begin
                    if once:
                        return ack
            except (OSError, ValueError, TimeoutError) as exc:
                if port:
                    port.close()
                    port = None
                healthy = False
                message = 'USB unavailable: ' + str(exc)
                if message != last_error:
                    LOG.warning(message)
                    last_error = message
                if once:
                    raise
                time.sleep(2)
            time.sleep(max(0, interval - (time.monotonic() - begin)))
    finally:
        if port:
            port.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--once', action='store_true', help='Read live scores, send and verify one device acknowledgement')
    parser.add_argument('--read-only', action='store_true', help='Read live API scores without opening USB')
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    if args.read_only:
        print(json.dumps(Source(config).read()))
    else:
        try:
            result = run(config, args.once)
            if result:
                print(json.dumps(result))
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
