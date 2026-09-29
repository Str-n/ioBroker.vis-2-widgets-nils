# Blockly integration

Add one suppression block group immediately before the automatic OFF block, inside the timeout or schedule body. Do not place it when the timer is started.

## Recommended JavaScript block

If the global helper is installed, paste this into an ioBroker Blockly **JavaScript** block:

```js
suppressEnergyGameScoring(5000, 'Hallway motion timeout');
```

Then leave the existing OFF control block directly below it. For a nightly all-off, use a window sized for the full command loop, for example:

```js
suppressEnergyGameScoring(15000, 'Nightly All-Off');
```

## Self-contained synchronous block

Use this when no global helper is available:

```js
(function () {
    var WINDOW_MS = 5000;
    var REASON = 'Hallway motion timeout';
    var idUntil = '0_userdata.0.energyGame.suppression.until';
    var idReason = '0_userdata.0.energyGame.suppression.reason';
    if (!existsState(idUntil)) {
        log('[energyGame] suppression state missing – start energyGame.js first', 'warn');
        return;
    }
    var st = getState(idUntil);
    var cur = st && st.val !== null && st.val !== undefined ? Number(st.val) : 0;
    if (!isFinite(cur)) cur = 0;
    setState(idUntil, Math.max(cur, Date.now() + WINDOW_MS), true);
    setState(idReason, REASON, true);
})();
```

The OFF command must remain after this block. Suppression is for automatic OFF only, never for ON or manual controls. Verify the generated script has the block inside the timer callback and check the log for missing-state warnings.
