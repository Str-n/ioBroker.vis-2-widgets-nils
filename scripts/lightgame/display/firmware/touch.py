"""CST816 touch driver for the Waveshare RP2040 Touch board.
Use the vendor's event IRQ; never access I2C inside an interrupt handler.
"""
from machine import I2C, Pin
import time


class Touch:
    def __init__(self):
        self.bus = I2C(1, sda=Pin(6), scl=Pin(7), freq=100000)
        self.reset = Pin(22, Pin.OUT, value=0)
        time.sleep_ms(2)
        self.reset(1)
        time.sleep_ms(50)
        self.chip = self.bus.readfrom_mem(0x15, 0xa7, 1)[0]
        self.bus.writeto_mem(0x15, 0xfe, b'\x01')
        # EnTouch + EnChange + OnceWLP. The vendor's 0x41 drawing mode omits
        # finger-up IRQs; 0x20 is essential for separate taps and release actions.
        self.bus.writeto_mem(0x15, 0xfa, b'\x61')
        self.changed = False
        self.events = 0
        self.point = None
        self.release_pending = False
        self.irq = Pin(21, Pin.IN, Pin.PULL_UP)
        self.irq.irq(trigger=Pin.IRQ_FALLING, handler=self.signal)

    def signal(self, pin):
        self.events += 1
        self.changed = True

    def read(self):
        if self.release_pending:
            self.release_pending = False
            self.point = None
            return None
        if self.changed:
            self.changed = False
            data = self.bus.readfrom_mem(0x15, 0x02, 5)
            x = ((data[1] & 15) << 8) | data[2]
            y = ((data[3] & 15) << 8) | data[4]
            point = (x, y) if x < 240 and y < 240 else None
            if not data[0] & 15 or data[1] >> 6 == 1:
                # Deliver the final position before release so a fast swipe
                # still reaches its threshold when intermediate IRQs coalesce.
                self.release_pending = self.point is not None and point is not None
                self.point = point if self.release_pending else None
            else:
                self.point = point
        return self.point
