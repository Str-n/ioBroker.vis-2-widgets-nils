#!/usr/bin/env python3
"""Exercise display effects using synthetic USB packets; never writes to ioBroker."""
import argparse
import json
from pathlib import Path
import time
from bridge import Source, exchange
from serial_port import SerialPort, discover


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    source = Source(config)
    real = source.read()
    with SerialPort(config.get('port') or discover()) as port:
        try:
            exchange(port, dict(real, animate=False), 100)
            point = dict(real, daily=real['daily'] + 1, high=max(real['daily'] + 1, real['high']))
            ack = exchange(port, point, 101)
            assert ack['animated'] is True and ack['delta'] == 1, ack
            print('Point burst:', ack, flush=True)
            time.sleep(2)
            duplicate = exchange(port, point, 102)
            assert duplicate['animated'] is False, duplicate
            record = dict(real, daily=real['high'] + 1, high=real['high'] + 1)
            ack = exchange(port, record, 103)
            assert ack['animated'] is True, ack
            print('New record burst:', ack, flush=True)
            time.sleep(2)
            offline = exchange(port, {'v': 1, 'type': 'offline'}, 104)
            assert offline['online'] is False, offline
            print('Offline indicator:', offline, flush=True)
            time.sleep(1)
        finally:
            restored = exchange(port, dict(source.read(), animate=False), 105)
            assert restored['animated'] is False, restored
            print('Restored live scores:', restored, flush=True)


if __name__ == '__main__':
    main()
