/**
 * ============================================================================
 *  global/energyGameHelpers.js – shared helper for automations
 * ============================================================================
 *  suppressEnergyGameScoring(windowMs, reason)
 *
 *  Opens (or extends) the ONE global scoring suppression window of the
 *  energyGame backend. Call it IMMEDIATELY BEFORE issuing automatic OFF
 *  commands and `await` it, so the suppression write is stored by the
 *  js-controller before the OFF command leaves this script.
 *
 *  - Window is an expiry timestamp: nothing to clear afterwards, a crash
 *    can never leave scoring disabled.
 *  - Overlapping calls only EXTEND the window (max), never shorten it.
 *  - Window must cover: this write -> OFF command -> device round-trip ->
 *    device status update (lc). 5 s is fine for local devices, use
 *    10 s+ for slow group commands (e.g. large Zigbee/Hue groups).
 *
 *  @param {number} windowMs  suppression window length in ms (default 5000)
 *  @param {string} reason    short human-readable diagnostic reason
 *  @returns {Promise<number|null>} expiry timestamp (epoch ms), null if the
 *                                  energyGame states do not exist (yet)
 * ============================================================================
 */
async function suppressEnergyGameScoring(windowMs, reason) {
    const ID_UNTIL = '0_userdata.0.energyGame.suppression.until';
    const ID_REASON = '0_userdata.0.energyGame.suppression.reason';

    const ms = (typeof windowMs === 'number' && Number.isFinite(windowMs) && windowMs > 0) ? windowMs : 5000;
    const text = (typeof reason === 'string' && reason.trim()) ? reason.trim().slice(0, 120) : 'automation';

    // Guard: energyGame backend not installed/started yet -> do nothing, but say so once.
    if (!existsState(ID_UNTIL) || !existsState(ID_REASON)) {
        log(`[energyGame] suppressEnergyGameScoring(): ${ID_UNTIL} missing – start energyGame.js first (reason: ${text})`, 'warn');
        return null;
    }

    let current = 0;
    try {
        const st = await getStateAsync(ID_UNTIL);
        if (st && st.val !== null && st.val !== undefined) {
            const n = Number(st.val);
            if (Number.isFinite(n)) current = n;
        }
    } catch (e) {
        // treat as 0 – we will still write a fresh window below
    }

    const until = Math.max(current, Date.now() + ms);

    // Order: until first (logic), reason second (diagnostics). Both awaited.
    await setStateAsync(ID_UNTIL, until, true);
    await setStateAsync(ID_REASON, text, true);
    return until;
}

