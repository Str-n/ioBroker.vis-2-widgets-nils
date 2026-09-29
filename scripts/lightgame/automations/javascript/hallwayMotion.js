/**
 * hallwayMotion.js – motion-controlled hallway light with automatic OFF
 * Requires suppressEnergyGameScoring() (global/energyGameHelpers.js).
 */
'use strict';

const MOTION_ID = 'REPLACE_WITH_MOTION_SENSOR_STATE';   // boolean, true = motion
const LIGHT_CMD_ID = 'REPLACE_WITH_LIGHT_COMMAND_STATE'; // boolean command state
const LIGHT_STATUS_ID = 'REPLACE_WITH_LIGHT_STATUS_STATE'; // actual status (same id as in energyGame LIGHTS; may equal LIGHT_CMD_ID)
const LUX_ID = null;                                       // optional: 'REPLACE_WITH_LUX_STATE'
const LUX_MAX = 50;                                        // only switch on when darker than this
const OFF_DELAY_MS = 3 * 60 * 1000;                        // 3 minutes without motion
const SUPPRESS_WINDOW_MS = 5000;                           // covers command + device status update

let offTimer = null;
let switchedOnByAutomation = false;

async function isDarkEnough() {
    if (!LUX_ID) return true;
    const st = await getStateAsync(LUX_ID);
    return !st || st.val === null || Number(st.val) <= LUX_MAX;
}

function cancelOffTimer() {
    if (offTimer) {
        clearTimeout(offTimer);
        offTimer = null;
    }
}

function scheduleOffTimer() {
    cancelOffTimer();
    offTimer = setTimeout(() => {
        offTimer = null;
        automaticOff().catch(e => log(`hallwayMotion: automatic OFF failed: ${e}`, 'error'));
    }, OFF_DELAY_MS);
}

async function automaticOff() {
    const status = await getStateAsync(LIGHT_STATUS_ID);
    if (!status || status.val !== true) {
        switchedOnByAutomation = false;
        return; // already off (e.g. switched off manually -> that OFF scored on its own merit)
    }

    // 1) Suppress scoring – IMMEDIATELY before the automatic OFF, and awaited.
    await suppressEnergyGameScoring(SUPPRESS_WINDOW_MS, 'Hallway motion timeout');

    // 2) Issue the OFF command.
    await setStateAsync(LIGHT_CMD_ID, false, false);
    switchedOnByAutomation = false;
}

on({ id: MOTION_ID, change: 'ne' }, async obj => {
    try {
        if (obj.state.val === true) {
            // Motion started: switch on if needed, (re)start the timer. No suppression here!
            cancelOffTimer();
            const status = await getStateAsync(LIGHT_STATUS_ID);
            if ((!status || status.val !== true) && await isDarkEnough()) {
                await setStateAsync(LIGHT_CMD_ID, true, false);
                switchedOnByAutomation = true;
            }
        } else {
            // Motion ended: start the countdown. Still no suppression – a human may
            // switch the light off during the countdown and should score.
            scheduleOffTimer();
        }
    } catch (e) {
        log(`hallwayMotion: handler failed: ${e}`, 'error');
    }
});

// Housekeeping: if the light is switched off by anyone else, drop the timer.
on({ id: LIGHT_STATUS_ID, change: 'ne' }, obj => {
    if (obj.state.val === false) {
        cancelOffTimer();
        switchedOnByAutomation = false;
    }
});

onStop(() => cancelOffTimer());

