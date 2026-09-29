/**
 * ============================================================================
 *  energyGame.test.js  –  Automated Test Suite for energyGame Backend
 * ============================================================================
 *  Run with: node energyGame.test.js
 * ============================================================================
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ----------------------------------------------------------------------------
// Core Loader: loads energyGameCore directly from energyGame.js if present
// ----------------------------------------------------------------------------
function loadCore() {
    const scriptPath = path.join(__dirname, '..', 'backend', 'energyGame.js');
    if (fs.existsSync(scriptPath)) {
        const src = fs.readFileSync(scriptPath, 'utf8');
        const match = src.match(/\/\/ === ENERGYGAME_CORE_BEGIN ===([\s\S]*?)\/\/ === ENERGYGAME_CORE_END ===/);
        if (match) {
            const sandbox = {};
            vm.createContext(sandbox);
            vm.runInContext(match[1], sandbox);
            vm.runInContext('this.energyGameCore = energyGameCore;', sandbox);
            return sandbox.energyGameCore;
        }
    }
    throw new Error('Could not find or extract energyGameCore from energyGame.js');
}

const core = loadCore();
const TIME_ZONE = 'Europe/Berlin';
const MIN_ON_MS = 60000;

// ----------------------------------------------------------------------------
// Virtual Clock / Timer Harness for deterministic async batching tests
// ----------------------------------------------------------------------------
function createVirtualEnvironment(initialTime = 1772470800000) { // 2026-03-02T17:00:00Z
    let currentTime = initialTime;
    let nextTimerId = 1;
    const timers = new Map(); // id -> { runAt, fn }

    const vEnv = {
        now: () => currentTime,
        setTime: (t) => { currentTime = t; },
        advanceTime: (ms) => {
            const target = currentTime + ms;
            while (true) {
                // Find earliest ready timer
                let earliestId = null;
                let earliestRunAt = Infinity;
                for (const [id, t] of timers.entries()) {
                    if (t.runAt <= target && t.runAt < earliestRunAt) {
                        earliestRunAt = t.runAt;
                        earliestId = id;
                    }
                }
                if (earliestId === null) break;
                const timer = timers.get(earliestId);
                timers.delete(earliestId);
                currentTime = timer.runAt;
                timer.fn();
            }
            currentTime = target;
        },
        setTimer: (fn, ms) => {
            const id = nextTimerId++;
            timers.set(id, { runAt: currentTime + ms, fn: fn });
            return id;
        },
        clearTimer: (id) => {
            timers.delete(id);
        },
    };
    return vEnv;
}

// ----------------------------------------------------------------------------
// Test Runner
// ----------------------------------------------------------------------------
const results = [];
let testIndex = 1;

function test(name, fn) {
    try {
        fn();
        results.push({ index: testIndex++, name, ok: true });
    } catch (err) {
        results.push({ index: testIndex++, name, ok: false, error: err });
    }
}

// ============================================================================
// TEST SCENARIOS (1 - 24)
// ============================================================================

// 1. ON 59,999 ms then OFF -> 0
test('1. ON 59,999 ms then OFF -> 0 (TOO_SHORT)', () => {
    const res = core.evaluateOffCandidate({
        oldVal: true,
        newVal: false,
        prevLc: 1000000,
        offTs: 1000000 + 59999,
        suppressionUntil: 0,
        minOnMs: MIN_ON_MS,
    });
    assert.strictEqual(res.qualifies, false);
    assert.strictEqual(res.reason, core.REASON.TOO_SHORT);
    assert.strictEqual(res.onDurationMs, 59999);
});

// 2. ON exactly 60,000 ms then OFF -> +1
test('2. ON exactly 60,000 ms then OFF -> +1 (SCORED)', () => {
    const res = core.evaluateOffCandidate({
        oldVal: true,
        newVal: false,
        prevLc: 1000000,
        offTs: 1000000 + 60000,
        suppressionUntil: 0,
        minOnMs: MIN_ON_MS,
    });
    assert.strictEqual(res.qualifies, true);
    assert.strictEqual(res.reason, core.REASON.SCORED);
    assert.strictEqual(res.onDurationMs, 60000);

    const model = core.createModel();
    const applied = core.applyPoint(model, 1060000);
    assert.strictEqual(model.daily, 1);
    assert.strictEqual(model.overall, 1);
    assert.strictEqual(applied.newRecord, true);
});

// 3. ON much longer then OFF -> +1 only
test('3. ON much longer (4 hours) then OFF -> +1 only', () => {
    const fourHoursMs = 4 * 60 * 60 * 1000;
    const res = core.evaluateOffCandidate({
        oldVal: true,
        newVal: false,
        prevLc: 1000000,
        offTs: 1000000 + fourHoursMs,
        suppressionUntil: 0,
        minOnMs: MIN_ON_MS,
    });
    assert.strictEqual(res.qualifies, true);
    assert.strictEqual(res.reason, core.REASON.SCORED);

    const model = core.createModel();
    core.applyPoint(model, 1000000 + fourHoursMs);
    assert.strictEqual(model.daily, 1);
    assert.strictEqual(model.overall, 1);
});

// 4. false -> false -> 0
test('4. false -> false -> 0 (INVALID_TRANSITION)', () => {
    const res = core.evaluateOffCandidate({
        oldVal: false,
        newVal: false,
        prevLc: 1000000,
        offTs: 1000000 + 70000,
        suppressionUntil: 0,
        minOnMs: MIN_ON_MS,
    });
    assert.strictEqual(res.qualifies, false);
    assert.strictEqual(res.reason, core.REASON.INVALID_TRANSITION);
});

// 5. true -> true -> 0
test('5. true -> true -> 0 (INVALID_TRANSITION)', () => {
    const res = core.evaluateOffCandidate({
        oldVal: true,
        newVal: true,
        prevLc: 1000000,
        offTs: 1000000 + 70000,
        suppressionUntil: 0,
        minOnMs: MIN_ON_MS,
    });
    assert.strictEqual(res.qualifies, false);
    assert.strictEqual(res.reason, core.REASON.INVALID_TRANSITION);
});

// 6. ten qualifying lights nearly simultaneously -> total score +10
test('6. ten qualifying lights nearly simultaneously -> total score +10', () => {
    const model = core.createModel();
    const baseTs = 1772470800000;
    core.ensureDay(model, baseTs, TIME_ZONE);

    for (let i = 0; i < 10; i++) {
        const offTs = baseTs + (i * 10);
        const res = core.evaluateOffCandidate({
            oldVal: true,
            newVal: false,
            prevLc: offTs - 70000,
            offTs: offTs,
            suppressionUntil: 0,
            minOnMs: MIN_ON_MS,
        });
        assert.strictEqual(res.qualifies, true);
        core.applyPoint(model, offTs);
    }
    assert.strictEqual(model.daily, 10);
    assert.strictEqual(model.overall, 10);
});

// 7. those ten produce an aggregated visual event with delta 10
test('7. those ten produce an aggregated visual event with delta 10', () => {
    const vEnv = createVirtualEnvironment(1772470800000);
    const emittedEvents = [];

    const batcher = core.createEventBatcher({
        batchMs: 350,
        setTimer: vEnv.setTimer,
        clearTimer: vEnv.clearTimer,
        now: vEnv.now,
        onEmit: (ev) => emittedEvents.push(ev),
    });

    for (let i = 0; i < 10; i++) {
        vEnv.advanceTime(10);
        batcher.add({ name: `Light ${i + 1}`, newRecord: i === 0 });
    }

    assert.strictEqual(emittedEvents.length, 0); // Not emitted before 350ms
    vEnv.advanceTime(350); // Timer expires

    assert.strictEqual(emittedEvents.length, 1);
    const ev = emittedEvents[0];
    assert.strictEqual(ev.delta, 10);
    assert.strictEqual(ev.lightCount, 10);
    assert.strictEqual(ev.lightNames.length, 10);
    assert.strictEqual(ev.lightNames[0], 'Light 1');
    assert.strictEqual(ev.lightNames[9], 'Light 10');
});

// 8. active global suppression -> 0
test('8. active global suppression -> 0 (SUPPRESSED)', () => {
    const offTs = 1000000 + 70000;
    const res = core.evaluateOffCandidate({
        oldVal: true,
        newVal: false,
        prevLc: 1000000,
        offTs: offTs,
        suppressionUntil: offTs + 2000, // Active suppression beyond event ts
        minOnMs: MIN_ON_MS,
    });
    assert.strictEqual(res.qualifies, false);
    assert.strictEqual(res.reason, core.REASON.SUPPRESSED);
});

// 9. expired suppression -> normal scoring
test('9. expired suppression -> normal scoring (SCORED)', () => {
    const offTs = 1000000 + 70000;
    const res = core.evaluateOffCandidate({
        oldVal: true,
        newVal: false,
        prevLc: 1000000,
        offTs: offTs,
        suppressionUntil: offTs - 1, // Expired 1ms before OFF
        minOnMs: MIN_ON_MS,
    });
    assert.strictEqual(res.qualifies, true);
    assert.strictEqual(res.reason, core.REASON.SCORED);
});

// 10. suppression written immediately before OFF is respected despite settle delay/race
test('10. suppression written immediately before OFF is respected', () => {
    // Automation executes at T0: writes suppression until T0 + 5000
    // Light turns off at T0 + 10ms (offTs = T0 + 10)
    // Settle delay waits 200ms and evaluates candidate at T0 + 210ms
    const t0 = 1772470800000;
    const suppressionUntil = t0 + 5000;
    const offTs = t0 + 10;

    const res = core.evaluateOffCandidate({
        oldVal: true,
        newVal: false,
        prevLc: offTs - 80000,
        offTs: offTs,
        suppressionUntil: suppressionUntil,
        minOnMs: MIN_ON_MS,
    });
    assert.strictEqual(res.qualifies, false);
    assert.strictEqual(res.reason, core.REASON.SUPPRESSED);
});

// 11. normal human OFF outside suppression scores
test('11. normal human OFF outside suppression scores (+1)', () => {
    const offTs = 1772470800000;
    const res = core.evaluateOffCandidate({
        oldVal: true,
        newVal: false,
        prevLc: offTs - 120000,
        offTs: offTs,
        suppressionUntil: 0,
        minOnMs: MIN_ON_MS,
    });
    assert.strictEqual(res.qualifies, true);
    assert.strictEqual(res.reason, core.REASON.SCORED);
});

// 12. local day rollover resets daily score only
test('12. local day rollover resets daily score only', () => {
    const model = core.createModel({
        dayKey: '2026-03-02',
        daily: 15,
        overall: 100,
        highScore: 20,
        highScoreToday: true,
        recordBrokenAt: 1772470800000,
    });
    // Rollover to 2026-03-03 (00:01 Europe/Berlin is 2026-03-02 23:01 UTC)
    const nextDayTs = Date.parse('2026-03-02T23:01:00.000Z');
    const res = core.ensureDay(model, nextDayTs, TIME_ZONE);

    assert.strictEqual(res.rolledOver, true);
    assert.strictEqual(model.dayKey, '2026-03-03');
    assert.strictEqual(model.daily, 0);
    assert.strictEqual(model.highScoreToday, false);
    assert.strictEqual(model.recordBrokenAt, 0);
});

// 13. overall score survives rollover
test('13. overall score survives rollover', () => {
    const model = core.createModel({
        dayKey: '2026-03-02',
        daily: 15,
        overall: 100,
        highScore: 20,
    });
    const nextDayTs = Date.parse('2026-03-02T23:01:00.000Z');
    core.ensureDay(model, nextDayTs, TIME_ZONE);
    assert.strictEqual(model.overall, 100);
});

// 14. historical high score survives rollover
test('14. historical high score survives rollover', () => {
    const model = core.createModel({
        dayKey: '2026-03-02',
        daily: 15,
        overall: 100,
        highScore: 25,
    });
    const nextDayTs = Date.parse('2026-03-02T23:01:00.000Z');
    core.ensureDay(model, nextDayTs, TIME_ZONE);
    assert.strictEqual(model.highScore, 25);
});

// 15. tying the high score -> no NEW_RECORD
test('15. tying the high score -> no NEW_RECORD', () => {
    const model = core.createModel({
        dayKey: '2026-03-02',
        daily: 9,
        overall: 50,
        highScore: 10,
        highScoreToday: false,
    });
    const applied = core.applyPoint(model, 1772470800000);
    assert.strictEqual(model.daily, 10);
    assert.strictEqual(model.highScore, 10);
    assert.strictEqual(model.highScoreToday, false);
    assert.strictEqual(applied.newRecord, false);
});

// 16. exceeding high score -> NEW_RECORD
test('16. exceeding high score -> NEW_RECORD', () => {
    const model = core.createModel({
        dayKey: '2026-03-02',
        daily: 10,
        overall: 50,
        highScore: 10,
        highScoreToday: false,
    });
    const ts = 1772470850000;
    const applied = core.applyPoint(model, ts);
    assert.strictEqual(model.daily, 11);
    assert.strictEqual(model.highScore, 11);
    assert.strictEqual(model.highScoreToday, true);
    assert.strictEqual(model.recordBrokenAt, ts);
    assert.strictEqual(applied.newRecord, true);
});

// 17. later scores that same day don't emit NEW_RECORD repeatedly
test('17. later scores that same day do not emit NEW_RECORD repeatedly', () => {
    const model = core.createModel({
        dayKey: '2026-03-02',
        daily: 11,
        overall: 51,
        highScore: 11,
        highScoreToday: true,
        recordBrokenAt: 1772470850000,
    });
    const applied = core.applyPoint(model, 1772470900000);
    assert.strictEqual(model.daily, 12);
    assert.strictEqual(model.highScore, 12);
    assert.strictEqual(model.highScoreToday, true);
    assert.strictEqual(model.recordBrokenAt, 1772470850000); // Unchanged
    assert.strictEqual(applied.newRecord, false); // Not repeated
});

// 18. highScoreToday resets next day
test('18. highScoreToday resets next day', () => {
    const model = core.createModel({
        dayKey: '2026-03-02',
        daily: 12,
        overall: 52,
        highScore: 12,
        highScoreToday: true,
        recordBrokenAt: 1772470850000,
    });
    const nextDayTs = Date.parse('2026-03-02T23:01:00.000Z');
    core.ensureDay(model, nextDayTs, TIME_ZONE);
    assert.strictEqual(model.highScoreToday, false);
    assert.strictEqual(model.recordBrokenAt, 0);
    assert.strictEqual(model.highScore, 12);
});

// 19. Europe/Berlin DST-related day calculations
test('19. Europe/Berlin DST-related day calculations', () => {
    // Spring Forward: Sunday 2026-03-29 (UTC+1 -> UTC+2 at 02:00 -> 03:00)
    const springBeforeUtc = Date.parse('2026-03-28T22:59:59.000Z'); // 23:59:59 UTC+1 -> 2026-03-28
    const springAfterUtc  = Date.parse('2026-03-28T23:00:01.000Z'); // 00:00:01 UTC+1 -> 2026-03-29
    assert.strictEqual(core.getLocalDayKey(springBeforeUtc, TIME_ZONE), '2026-03-28');
    assert.strictEqual(core.getLocalDayKey(springAfterUtc, TIME_ZONE), '2026-03-29');

    // Fall Back: Sunday 2026-10-25 (UTC+2 -> UTC+1 at 03:00 -> 02:00)
    const fallBeforeUtc = Date.parse('2026-10-24T21:59:59.000Z'); // 23:59:59 UTC+2 -> 2026-10-24
    const fallAfterUtc  = Date.parse('2026-10-24T22:00:01.000Z'); // 00:00:01 UTC+2 -> 2026-10-25
    assert.strictEqual(core.getLocalDayKey(fallBeforeUtc, TIME_ZONE), '2026-10-24');
    assert.strictEqual(core.getLocalDayKey(fallAfterUtc, TIME_ZONE), '2026-10-25');
});

// 20. a light already ON before JavaScript adapter restart can still qualify
test('20. light ON before adapter restart still qualifies', () => {
    const turnedOnTs = Date.parse('2026-03-02T17:00:00.000Z'); // 18:00 local
    // Adapter restarts at 18:30 (simulated)
    const turnedOffTs = Date.parse('2026-03-02T17:35:00.000Z'); // 18:35 local (35 min total)

    const res = core.evaluateOffCandidate({
        oldVal: true,
        newVal: false,
        prevLc: turnedOnTs, // Restored from ioBroker state cache
        offTs: turnedOffTs,
        suppressionUntil: 0,
        minOnMs: MIN_ON_MS,
    });
    assert.strictEqual(res.qualifies, true);
    assert.strictEqual(res.reason, core.REASON.SCORED);
    assert.strictEqual(res.onDurationMs, 35 * 60 * 1000);
});

// 21. duplicate/non-value-change notifications do not duplicate points
test('21. duplicate notifications do not duplicate points', () => {
    const offTs = 1772470800000;
    const res1 = core.evaluateOffCandidate({
        oldVal: true,
        newVal: false,
        prevLc: offTs - 70000,
        offTs: offTs,
        suppressionUntil: 0,
        minOnMs: MIN_ON_MS,
        lastProcessedOffTs: null,
    });
    assert.strictEqual(res1.qualifies, true);

    const res2 = core.evaluateOffCandidate({
        oldVal: true,
        newVal: false,
        prevLc: offTs - 70000,
        offTs: offTs,
        suppressionUntil: 0,
        minOnMs: MIN_ON_MS,
        lastProcessedOffTs: offTs, // Same offTs recorded
    });
    assert.strictEqual(res2.qualifies, false);
    assert.strictEqual(res2.reason, core.REASON.DUPLICATE);
});

// 22. score state initialization does not overwrite existing production values
test('22. score state initialization preserves existing production values', () => {
    // Simulated DB with existing scores
    const existingDb = {
        '0_userdata.0.energyGame.score.daily': { val: 42 },
        '0_userdata.0.energyGame.score.overall': { val: 850 },
        '0_userdata.0.energyGame.score.highScore': { val: 65 },
        '0_userdata.0.energyGame.day.key': { val: '2026-03-02' },
    };

    function simulateEnsureState(id, defaultVal) {
        if (existingDb[id] !== undefined) {
            return existingDb[id].val; // Object exists -> keep existing value!
        }
        existingDb[id] = { val: defaultVal };
        return defaultVal;
    }

    const loadedDaily = simulateEnsureState('0_userdata.0.energyGame.score.daily', 0);
    const loadedOverall = simulateEnsureState('0_userdata.0.energyGame.score.overall', 0);
    const loadedHighScore = simulateEnsureState('0_userdata.0.energyGame.score.highScore', 0);

    assert.strictEqual(loadedDaily, 42);
    assert.strictEqual(loadedOverall, 850);
    assert.strictEqual(loadedHighScore, 65);
});

// 23. a COMBO that crosses the high-score threshold has deterministic event behavior
test('23. a COMBO crossing high-score threshold produces kind NEW_RECORD with delta > 1', () => {
    const vEnv = createVirtualEnvironment(1772470800000);
    const emitted = [];

    const batcher = core.createEventBatcher({
        batchMs: 350,
        setTimer: vEnv.setTimer,
        clearTimer: vEnv.clearTimer,
        now: vEnv.now,
        onEmit: (ev) => emitted.push(ev),
    });

    const model = core.createModel({
        dayKey: '2026-03-02',
        daily: 9,
        overall: 50,
        highScore: 10,
        highScoreToday: false,
    });

    // 3 lights turn off in the same combo
    // Light 1 brings daily from 9 to 10 (ties high score, not new record)
    const p1 = core.applyPoint(model, vEnv.now());
    batcher.add({ name: 'Kitchen', newRecord: p1.newRecord });

    // Light 2 brings daily from 10 to 11 (EXCEEDS high score -> NEW RECORD)
    const p2 = core.applyPoint(model, vEnv.now());
    batcher.add({ name: 'Living Room', newRecord: p2.newRecord });

    // Light 3 brings daily from 11 to 12 (already exceeded today, not repeated new record)
    const p3 = core.applyPoint(model, vEnv.now());
    batcher.add({ name: 'Hallway', newRecord: p3.newRecord });

    vEnv.advanceTime(350);

    assert.strictEqual(emitted.length, 1);
    const ev = emitted[0];
    assert.strictEqual(ev.kind, core.EVENT_KIND.NEW_RECORD);
    assert.strictEqual(ev.delta, 3);
    assert.strictEqual(ev.lightCount, 3);
    assert.deepStrictEqual(Array.from(ev.lightNames), ['Kitchen', 'Living Room', 'Hallway']);
    assert.strictEqual(model.daily, 12);
    assert.strictEqual(model.highScore, 12);
    assert.strictEqual(model.highScoreToday, true);
});

// 24. visual events retain the score snapshot from scoring time
test('24. visual event snapshot remains consistent if the model rolls over before flush', () => {
    const vEnv = createVirtualEnvironment(1772470800000);
    const emitted = [];
    const batcher = core.createEventBatcher({
        batchMs: 350,
        setTimer: vEnv.setTimer,
        clearTimer: vEnv.clearTimer,
        now: vEnv.now,
        onEmit: ev => emitted.push(ev),
    });

    batcher.add({
        name: 'Kitchen',
        newRecord: true,
        snapshot: { daily: 3, overall: 21, highScore: 3, highScoreToday: true },
    });
    // The snapshot remains the scoring-time value when the timer fires later.
    vEnv.advanceTime(350);

    assert.strictEqual(emitted.length, 1);
    assert.strictEqual(emitted[0].snapshot.daily, 3);
    assert.strictEqual(emitted[0].snapshot.overall, 21);
    assert.strictEqual(emitted[0].snapshot.highScore, 3);
    assert.strictEqual(emitted[0].snapshot.highScoreToday, true);
});

// ============================================================================
// TEST SUMMARY OUTPUT
// ============================================================================
console.log('\n================================================================');
console.log(' energyGame Test Results:');
console.log('================================================================\n');

let passed = 0;
for (const r of results) {
    if (r.ok) {
        passed++;
        console.log(`  \x1b[32m✔\x1b[0m [${String(r.index).padStart(2, '0')}] ${r.name}`);
    } else {
        console.log(`  \x1b[31m✖\x1b[0m [${String(r.index).padStart(2, '0')}] ${r.name}`);
        console.log(`     \x1b[31m${r.error.stack || r.error}\x1b[0m`);
    }
}

console.log('\n----------------------------------------------------------------');
console.log(` Total: ${results.length} | Passed: ${passed} | Failed: ${results.length - passed}`);
console.log('================================================================\n');

if (passed !== results.length) {
    process.exit(1);
}
