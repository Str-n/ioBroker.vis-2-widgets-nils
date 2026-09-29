'use strict';

const energyGameCore = (function createEnergyGameCore() {
    'use strict';

    /** Final evaluation reasons for an OFF candidate. */
    const REASON = Object.freeze({
        SCORED: 'SCORED',
        TOO_SHORT: 'TOO_SHORT',
        SUPPRESSED: 'SUPPRESSED',
        INVALID_TRANSITION: 'INVALID_TRANSITION',
        CONFIG_ERROR: 'CONFIG_ERROR',
        MISSING_TIMESTAMP: 'MISSING_TIMESTAMP',
        DUPLICATE: 'DUPLICATE',
    });

    /** Visual event kinds. */
    const EVENT_KIND = Object.freeze({
        POINT: 'POINT',
        COMBO: 'COMBO',
        NEW_RECORD: 'NEW_RECORD',
    });

    function isFiniteNumber(v) {
        return typeof v === 'number' && Number.isFinite(v);
    }

    // ------------------------------------------------------------------
    // Local day calculation (IANA timezone via Intl, DST-safe)
    // ------------------------------------------------------------------
    const formatterCache = new Map();

    function getDayKeyFormatter(timeZone) {
        let fmt = formatterCache.get(timeZone);
        if (!fmt) {
            fmt = new Intl.DateTimeFormat('en-US', {
                timeZone: timeZone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
            });
            formatterCache.set(timeZone, fmt);
        }
        return fmt;
    }

    /**
     * Returns the local calendar day key "YYYY-MM-DD" of a UTC epoch ms
     * timestamp in the given IANA timezone.
     */
    function getLocalDayKey(ts, timeZone) {
        const parts = getDayKeyFormatter(timeZone).formatToParts(new Date(ts));
        const map = {};
        for (const p of parts) {
            map[p.type] = p.value;
        }
        return `${map.year}-${map.month}-${map.day}`;
    }

    /** True if the Node/ICU build actually supports the timezone. */
    function isTimeZoneSupported(timeZone) {
        try {
            const fmt = new Intl.DateTimeFormat('en-US', { timeZone: timeZone });
            return fmt.resolvedOptions().timeZone === timeZone;
        } catch (e) {
            return false;
        }
    }

    // ------------------------------------------------------------------
    // Model
    // ------------------------------------------------------------------
    function createModel(init) {
        const i = init || {};
        return {
            dayKey: typeof i.dayKey === 'string' ? i.dayKey : '',
            daily: isFiniteNumber(i.daily) ? i.daily : 0,
            overall: isFiniteNumber(i.overall) ? i.overall : 0,
            highScore: isFiniteNumber(i.highScore) ? i.highScore : 0,
            highScoreToday: i.highScoreToday === true,
            recordBrokenAt: isFiniteNumber(i.recordBrokenAt) ? i.recordBrokenAt : 0,
            eventSequence: isFiniteNumber(i.eventSequence) ? i.eventSequence : 0,
        };
    }

    /**
     * Verifies model.dayKey against the local day of nowTs. Performs the
     * rollover in-place if needed. Preserves overall and highScore.
     */
    function ensureDay(model, nowTs, timeZone) {
        const key = getLocalDayKey(nowTs, timeZone);
        if (model.dayKey === key) {
            return { rolledOver: false, from: key, to: key };
        }
        const from = model.dayKey;
        model.dayKey = key;
        model.daily = 0;
        model.highScoreToday = false;
        model.recordBrokenAt = 0;
        return { rolledOver: true, from: from, to: key };
    }

    // ------------------------------------------------------------------
    // OFF candidate qualification
    // ------------------------------------------------------------------
    /**
     * @param {object} input
     * @param {*}      input.oldVal              previous value (expects true)
     * @param {*}      input.newVal              new value (expects false)
     * @param {number} input.prevLc              lc of previous state (= became true)
     * @param {number} input.offTs               lc of new state (= became false)
     * @param {number} input.suppressionUntil    suppression expiry epoch ms
     * @param {number} input.minOnMs             threshold
     * @param {number} [input.lastProcessedOffTs] offTs of the previous candidate of this light
     * @param {boolean}[input.configError]       light not validly configured
     */
    function evaluateOffCandidate(input) {
        const res = { qualifies: false, reason: null, onDurationMs: null };

        if (input.configError === true) {
            res.reason = REASON.CONFIG_ERROR;
            return res;
        }
        if (!(input.oldVal === true && input.newVal === false)) {
            res.reason = REASON.INVALID_TRANSITION;
            return res;
        }
        if (!isFiniteNumber(input.offTs) || input.offTs <= 0) {
            res.reason = REASON.MISSING_TIMESTAMP;
            return res;
        }
        if (!isFiniteNumber(input.prevLc) || input.prevLc <= 0) {
            res.reason = REASON.MISSING_TIMESTAMP;
            return res;
        }
        if (isFiniteNumber(input.lastProcessedOffTs) && input.lastProcessedOffTs === input.offTs) {
            res.reason = REASON.DUPLICATE;
            return res;
        }
        const onDurationMs = input.offTs - input.prevLc;
        if (onDurationMs < 0) {
            res.reason = REASON.MISSING_TIMESTAMP;
            return res;
        }
        res.onDurationMs = onDurationMs;

        if (onDurationMs < input.minOnMs) {
            res.reason = REASON.TOO_SHORT;
            return res;
        }
        if (isFiniteNumber(input.suppressionUntil) && input.suppressionUntil >= input.offTs) {
            res.reason = REASON.SUPPRESSED;
            return res;
        }
        res.qualifies = true;
        res.reason = REASON.SCORED;
        return res;
    }

    // ------------------------------------------------------------------
    // Scoring / high score
    // ------------------------------------------------------------------
    /**
     * Adds exactly one point to the model. Caller must have run ensureDay().
     * @returns {{newRecord:boolean, daily:number, overall:number, highScore:number}}
     */
    function applyPoint(model, ts) {
        model.daily += 1;
        model.overall += 1;
        let newRecord = false;
        if (model.daily > model.highScore) {
            model.highScore = model.daily;
            if (!model.highScoreToday) {
                model.highScoreToday = true;
                model.recordBrokenAt = ts;
                newRecord = true;
            }
        }
        return {
            newRecord: newRecord,
            daily: model.daily,
            overall: model.overall,
            highScore: model.highScore,
        };
    }

    // ------------------------------------------------------------------
    // Visual event batching (affects animation only, never scoring)
    // ------------------------------------------------------------------
    function buildVisualEvent(items, timestamp) {
        const anyNewRecord = items.some(it => it.newRecord === true);
        let kind = EVENT_KIND.POINT;
        if (anyNewRecord) {
            kind = EVENT_KIND.NEW_RECORD;
        } else if (items.length > 1) {
            kind = EVENT_KIND.COMBO;
        }
        const lastItem = items[items.length - 1];
        return {
            delta: items.length,
            kind: kind,
            lightCount: items.length,
            lightNames: items.map(it => it.name),
            timestamp: timestamp,
            newRecord: anyNewRecord,
            snapshot: lastItem && lastItem.snapshot ? lastItem.snapshot : null,
        };
    }

    /**
     * @param {object}   o
     * @param {number}   o.batchMs
     * @param {function} o.setTimer   (fn, ms) => handle
     * @param {function} o.clearTimer (handle) => void
     * @param {function} o.now        () => epoch ms
     * @param {function} o.onEmit     (event) => void
     */
    function createEventBatcher(o) {
        let pending = [];
        let timer = null;

        function flush() {
            if (timer !== null) {
                o.clearTimer(timer);
                timer = null;
            }
            if (pending.length === 0) {
                return null;
            }
            const items = pending;
            pending = [];
            const ev = buildVisualEvent(items, o.now());
            o.onEmit(ev);
            return ev;
        }

        function add(item) {
            pending.push(item);
            if (timer === null) {
                timer = o.setTimer(flush, o.batchMs);
            }
        }

        return {
            add: add,
            flush: flush,
            pendingCount: () => pending.length,
        };
    }

    return Object.freeze({
        REASON,
        EVENT_KIND,
        getLocalDayKey,
        isTimeZoneSupported,
        createModel,
        ensureDay,
        evaluateOffCandidate,
        applyPoint,
        buildVisualEvent,
        createEventBatcher,
    });
})();

if (typeof module !== 'undefined') module.exports = energyGameCore;
