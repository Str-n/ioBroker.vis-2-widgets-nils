/**
 * nightlyAllOff.js – nightly automatic all-off at 23:30
 * Requires suppressEnergyGameScoring() (global/energyGameHelpers.js).
 */
'use strict';

/** Command states to switch off (may be the same ids as the status states). */
const NIGHT_OFF_LIGHTS = [
    'REPLACE_WITH_LIGHT_COMMAND_STATE_1',
    'REPLACE_WITH_LIGHT_COMMAND_STATE_2',
    'REPLACE_WITH_LIGHT_COMMAND_STATE_3',
    // ...
];

/** Optional pacing between commands to avoid flooding slow gateways (ms). */
const COMMAND_SPACING_MS = 100;

/**
 * Window = spacing for all commands + generous device round-trip.
 * With 20 lights at 100 ms spacing this is 2 s of commands + 8 s margin.
 */
const SUPPRESS_WINDOW_MS = Math.max(10000, NIGHT_OFF_LIGHTS.length * COMMAND_SPACING_MS + 8000);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function nightlyHousekeeping() {
    // Anything that is NOT an automatic light OFF belongs here, BEFORE suppression:
    // - close blinds, set heating to night mode, send a summary notification, ...
    // (intentionally empty in this example)
}

async function nightlyAllOff() {
    await nightlyHousekeeping();

    // 1) Determine which lights are actually on (only those need commands).
    const toSwitchOff = [];
    for (const id of NIGHT_OFF_LIGHTS) {
        if (!existsState(id)) {
            log(`nightlyAllOff: state ${id} does not exist – skipped`, 'warn');
            continue;
        }
        const st = await getStateAsync(id);
        if (st && st.val === true) toSwitchOff.push(id);
    }
    if (toSwitchOff.length === 0) {
        log('nightlyAllOff: nothing to switch off');
        return;
    }

    // 2) Suppress scoring ONCE, immediately before the OFF commands, awaited.
    await suppressEnergyGameScoring(SUPPRESS_WINDOW_MS, `Nightly All-Off (${toSwitchOff.length} lights)`);

    // 3) Issue the OFF commands.
    for (const id of toSwitchOff) {
        await setStateAsync(id, false, false);
        if (COMMAND_SPACING_MS > 0) await sleep(COMMAND_SPACING_MS);
    }
    log(`nightlyAllOff: switched off ${toSwitchOff.length} light(s)`);
}

schedule('30 23 * * *', () => {
    nightlyAllOff().catch(e => log(`nightlyAllOff failed: ${e}`, 'error'));
});

