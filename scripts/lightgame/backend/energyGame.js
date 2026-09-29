/**
 * ============================================================================
 *  energyGame.js  –  ioBroker Energy-Saving Gamification Backend (v1)
 * ============================================================================
 *
 *  Awards exactly 1 point when a configured physical Boolean light changes
 *  true -> false after having been continuously true for >= MIN_ON_MS,
 *  unless the single global suppression window covers the OFF event.
 *
 *  - No frontend code. VIS-2 consumes 0_userdata.0.energyGame.* only.
 *  - Pure logic lives in the CORE section (between the ENERGYGAME_CORE
 *    markers) and is extracted verbatim by the test harness.
 *  - Timezone for all "day" logic: Europe/Berlin (never server-local time).
 *
 *  Sections:
 *    1  Configuration
 *    2  Core (pure, testable, no ioBroker APIs)
 *    3  State definitions (userdata contract)
 *    4  ioBroker access helpers (defensive read / serialized write)
 *    5  State initialization (create-if-missing, never overwrite)
 *    6  Light configuration validation
 *    7  Day handling (runtime side)
 *    8  Score persistence
 *    9  Visual event emission
 *   10  OFF candidate handling (subscription + settle + evaluation)
 *   11  Logging
 *   12  Startup / shutdown
 * ============================================================================
 */
'use strict';

// ============================================================================
// SECTION 1: CONFIGURATION
// ============================================================================

/** Verbose per-OFF diagnostics (one compact JSON line per OFF candidate). */
const DEBUG = false;

/** Timezone for all local-day calculations. */
const TIME_ZONE = 'Europe/Berlin';

/** Root of all persistent userdata states. */
const BASE = '0_userdata.0.energyGame';

/** Minimum continuous ON time (ms) for an OFF to score. */
const MIN_ON_MS = 60000;

/** Settling delay (ms) before an OFF event is finally evaluated. */
const SETTLE_MS = 200;

/** Aggregation window (ms) for visual events (does NOT affect scoring). */
const EVENT_BATCH_MS = 350;

/** Interval (ms) for the convenience day-rollover check (cron is not relied on). */
const DAY_CHECK_INTERVAL_MS = 60000;

/**
 * If true, only state updates with ack=true are processed.
 * Default false: many device states change value first with ack=false
 * (command) and only confirm with ack=true afterwards; with change:'ne'
 * the value change is seen exactly once either way.
 */
const SUBSCRIBE_ACK_ONLY = false;

/**
 * Physical lights (actual-state Boolean datapoints ONLY).
 *  - id   : full ioBroker state id of the ACTUAL status (not a command-only
 *           state if a status state exists, not an alias, group, room, scene)
 *  - key  : unique short identifier (used in diagnostics)
 *  - name : display name delivered to the frontend in event.lightNames
 */
const LIGHTS = [
    {
        id: 'hm-rpc.1.001618A99C5D43.2.STATE',
        key: 'guestRoom',
        name: 'Gästezimmer',
    },
    {
        id: 'hm-rpc.1.001618A99C5D43.6.STATE',
        key: 'bathroomEg',
        name: 'Badezimmer unten',
    },
    {
        id: '0_userdata.0.dev.fakebool',
        key: 'hallwayfake',
        name: 'Hallway',
    },
        {
        id: 'hm-rpc.1.001618A99C5D66.6.STATE',
        key: 'livingRoom',
        name: 'Wohnzimmer',
    },
    {
        id: 'hm-rpc.1.001618A99C5D66.2.STATE',
        key: 'livingRoom2',
        name: 'Wohnzimmer 2',
    },
    {
        id: 'hm-rpc.1.001618A99C5D66.26.STATE',
        key: 'livingRoom3',
        name: 'Wohnzimmer 3',
    },
    {
        id: 'hm-rpc.1.001618A99C5D66.14.STATE',
        key: 'diningRoom',
        name: 'Esszimmer',
    },
    {
        id: 'shelly.0.SHSW-1#244CAB43A85F#1.Relay0.Switch',
        key: 'kitchenIsland',
        name: 'Kücheninsel',
    },
    {
        id: 'hm-rpc.1.001618A99C5D66.18.STATE',
        key: 'kitchen',
        name: 'Küche',
    },
    {
        id: 'hm-rpc.1.001618A99C5D66.22.STATE',
        key: 'kitchenCabinet',
        name: 'Küchenschrank',
    },
    {
        id: 'hm-rpc.1.001618A99C5D43.10.STATE',
        key: 'hallway',
        name: 'Flur unten',   
    },
    {
        id: 'hm-rpc.1.001618A99C5D43.14.STATE',
        key: 'hallway2',
        name: 'Flur unten',   
    },
    {
        id: 'hm-rpc.1.001618A99C5BEF.10.STATE',
        key: 'bathroomOG',
        name: 'Badezimmer oben',   
    },
    {
        id: 'hm-rpc.1.001618A99C5BEF.2.STATE',
        key: 'parrentsBedroom',
        name: 'Elternschlafzimmer',   
    },
    {
        id: 'hm-rpc.1.001618A99C5BEF.6.STATE',
        key: 'girlsBedroom',
        name: 'Mädchenzimmer',   
    },
    {
        id: 'hm-rpc.1.001618A99C5BEF.14.STATE',
        key: 'jontesRoom',
        name: 'Jontes Zimmer',   
    },
    {
        id: 'hm-rpc.1.001618A99C5BEF.22.STATE',
        key: 'hallwayOG',
        name: 'Flur oben',   
    },
    {
        id: 'hm-rpc.1.001618A99C5D43.26.STATE',
        key: 'outsideTerrasse',
        name: 'Außen Terrasse',   
    },
    {
        id: 'hm-rpc.1.001618A99C5BEF.26.STATE',
        key: 'gustavRoom',
        name: 'Gustavs Zimmer',   
    },
    {
        id: 'hm-rpc.1.001618A99C5BEF.30.STATE',
        key: 'hallwayDG',
        name: 'Flur Dachgeschoss',   
    },
    //{
    //    id: '',
    //    key: '',
    //    name: '',   
    //},
    //{
    //    id: '',
    //    key: '',
    //    name: '',   
    //}


];

// ============================================================================
// SECTION 2: CORE  (pure logic – no ioBroker APIs, no globals, no I/O)
// ============================================================================
// === ENERGYGAME_CORE_BEGIN ===
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
// === ENERGYGAME_CORE_END ===

// ============================================================================
// SECTION 3: STATE DEFINITIONS (userdata contract)
// ============================================================================
const ID = {
    scoreDaily: `${BASE}.score.daily`,
    scoreOverall: `${BASE}.score.overall`,
    scoreHighScore: `${BASE}.score.highScore`,
    dayKey: `${BASE}.day.key`,
    dayHighScoreToday: `${BASE}.day.highScoreToday`,
    dayRecordBrokenAt: `${BASE}.day.recordBrokenAt`,
    suppressionUntil: `${BASE}.suppression.until`,
    suppressionReason: `${BASE}.suppression.reason`,
    eventSequence: `${BASE}.event.sequence`,
    eventDelta: `${BASE}.event.delta`,
    eventKind: `${BASE}.event.kind`,
    eventLightCount: `${BASE}.event.lightCount`,
    eventLightNames: `${BASE}.event.lightNames`,
    eventTimestamp: `${BASE}.event.timestamp`,
    eventJson: `${BASE}.event.json`,
    infoConfigStatus: `${BASE}.info.configStatus`,
    infoStartedAt: `${BASE}.info.startedAt`,
    infoLastPointAt: `${BASE}.info.lastPointAt`,
    infoLastRolloverAt: `${BASE}.info.lastRolloverAt`,
};

/** common definitions; `def` is used ONLY when the state is first created. */
const STATE_DEFS = [
    { id: ID.scoreDaily, name: 'Daily score', type: 'number', role: 'value', def: 0, write: true },
    { id: ID.scoreOverall, name: 'Overall score', type: 'number', role: 'value', def: 0, write: true },
    { id: ID.scoreHighScore, name: 'Best daily score', type: 'number', role: 'value', def: 0, write: true },

    { id: ID.dayKey, name: 'Local day key (Europe/Berlin)', type: 'string', role: 'text', def: '', write: true },
    { id: ID.dayHighScoreToday, name: 'High score exceeded today', type: 'boolean', role: 'indicator', def: false, write: true },
    { id: ID.dayRecordBrokenAt, name: 'Record first broken at', type: 'number', role: 'value.time', def: 0, write: true },

    { id: ID.suppressionUntil, name: 'Scoring suppression until (epoch ms)', type: 'number', role: 'value.time', def: 0, write: true },
    { id: ID.suppressionReason, name: 'Scoring suppression reason', type: 'string', role: 'text', def: '', write: true },

    { id: ID.eventSequence, name: 'Visual event sequence', type: 'number', role: 'value', def: 0, write: false },
    { id: ID.eventDelta, name: 'Visual event delta', type: 'number', role: 'value', def: 0, write: false },
    { id: ID.eventKind, name: 'Visual event kind', type: 'string', role: 'text', def: '', write: false },
    { id: ID.eventLightCount, name: 'Visual event light count', type: 'number', role: 'value', def: 0, write: false },
    { id: ID.eventLightNames, name: 'Visual event light names (JSON array)', type: 'string', role: 'json', def: '[]', write: false },
    { id: ID.eventTimestamp, name: 'Visual event timestamp', type: 'number', role: 'value.time', def: 0, write: false },
    { id: ID.eventJson, name: 'Visual event (atomic JSON)', type: 'string', role: 'json', def: '{}', write: false },

    { id: ID.infoConfigStatus, name: 'Light configuration status (JSON)', type: 'string', role: 'json', def: '{}', write: false },
    { id: ID.infoStartedAt, name: 'Script started at', type: 'number', role: 'value.time', def: 0, write: false },
    { id: ID.infoLastPointAt, name: 'Last point at', type: 'number', role: 'value.time', def: 0, write: false },
    { id: ID.infoLastRolloverAt, name: 'Last day rollover at', type: 'number', role: 'value.time', def: 0, write: false },
];

// ============================================================================
// SECTION 4: ioBroker ACCESS HELPERS
// ============================================================================
const core = energyGameCore;

async function safeGetObject(id) {
    try {
        const obj = await getObjectAsync(id);
        return obj || null;
    } catch (e) {
        return null;
    }
}

async function safeGetState(id) {
    try {
        const st = await getStateAsync(id);
        return st || null;
    } catch (e) {
        return null;
    }
}

async function readNumber(id, fallback) {
    const st = await safeGetState(id);
    if (!st || st.val === null || st.val === undefined) return fallback;
    const n = Number(st.val);
    return Number.isFinite(n) ? n : fallback;
}

async function readString(id, fallback) {
    const st = await safeGetState(id);
    if (!st || st.val === null || st.val === undefined) return fallback;
    return String(st.val);
}

async function readBoolean(id, fallback) {
    const st = await safeGetState(id);
    if (!st || st.val === null || st.val === undefined) return fallback;
    return st.val === true || st.val === 'true';
}

/**
 * All userdata writes go through ONE serialized promise chain so that
 * ordering is deterministic (e.g. event.sequence is always written last,
 * and consecutive visual events can never interleave).
 */
let writeChain = Promise.resolve();

function enqueueWrite(label, fn) {
    writeChain = writeChain
        .then(fn)
        .catch(err => logMsg('error', `write failed (${label}): ${err && err.message ? err.message : err}`));
    return writeChain;
}

function writeState(id, val) {
    return enqueueWrite(id, () => setStateAsync(id, val, true));
}

// ============================================================================
// SECTION 5: STATE INITIALIZATION (create if missing, never overwrite)
// ============================================================================
async function ensureStateExists(def) {
    const existing = await safeGetObject(def.id);
    if (existing) {
        // Never touch an existing object or its value.
        const st = await safeGetState(def.id);
        if (!st || st.val === null || st.val === undefined) {
            // Object exists but holds no value: seed default (not an overwrite).
            await setStateAsync(def.id, def.def, true);
            logMsg('debug', `seeded null state ${def.id} with default`);
        }
        return false;
    }
    const common = {
        name: def.name,
        type: def.type,
        role: def.role,
        read: true,
        write: def.write,
        def: def.def,
    };
    try {
        await createStateAsync(def.id, def.def, false, common);
    } catch (e) {
        // Flagged API note: very old JS adapters may require the parent
        // folder 0_userdata.0.energyGame to exist. Create it once in Admin.
        throw new Error(`createState failed for ${def.id}: ${e && e.message ? e.message : e}. ` +
            `If this mentions a missing parent, create folder ${BASE} manually in Admin > Objects.`);
    }
    // Some adapter versions ignore initialValue when def is present; make sure a value exists.
    const st = await safeGetState(def.id);
    if (!st || st.val === null || st.val === undefined) {
        await setStateAsync(def.id, def.def, true);
    }
    return true;
}

async function initStates() {
    let created = 0;
    for (const def of STATE_DEFS) {
        if (await ensureStateExists(def)) created++;
    }
    return created;
}

async function loadModel() {
    const model = core.createModel({
        dayKey: await readString(ID.dayKey, ''),
        daily: await readNumber(ID.scoreDaily, 0),
        overall: await readNumber(ID.scoreOverall, 0),
        highScore: await readNumber(ID.scoreHighScore, 0),
        highScoreToday: await readBoolean(ID.dayHighScoreToday, false),
        recordBrokenAt: await readNumber(ID.dayRecordBrokenAt, 0),
        eventSequence: await readNumber(ID.eventSequence, 0),
    });
    return model;
}

// ============================================================================
// SECTION 6: LIGHT CONFIGURATION VALIDATION
// ============================================================================
const CONFIG_ERROR_STATUSES = new Set([
    'INVALID_ENTRY', 'PLACEHOLDER', 'DUPLICATE_ID', 'DUPLICATE_KEY',
    'MISSING', 'NOT_A_STATE', 'NOT_BOOLEAN',
]);

async function validateLightConfig(lights) {
    const report = [];
    const valid = [];
    const seenIds = new Set();
    const seenKeys = new Set();

    for (let i = 0; i < lights.length; i++) {
        const l = lights[i] || {};
        const r = { key: l.key, id: l.id, name: l.name, status: 'OK', message: '' };
        report.push(r);

        if (typeof l.id !== 'string' || !l.id.trim() || typeof l.key !== 'string' || !l.key.trim()) {
            r.status = 'INVALID_ENTRY';
            r.message = `LIGHTS[${i}] needs non-empty string id and key`;
            continue;
        }
        if (l.id.startsWith('REPLACE_WITH')) {
            r.status = 'PLACEHOLDER';
            r.message = 'placeholder id not replaced';
            continue;
        }
        if (seenIds.has(l.id)) {
            r.status = 'DUPLICATE_ID';
            r.message = 'same state id configured twice';
            continue;
        }
        if (seenKeys.has(l.key)) {
            r.status = 'DUPLICATE_KEY';
            r.message = 'same key configured twice';
            continue;
        }
        seenIds.add(l.id);
        seenKeys.add(l.key);

        const obj = await safeGetObject(l.id);
        if (!obj) {
            r.status = 'MISSING';
            r.message = 'object does not exist';
            continue;
        }
        if (obj.type !== 'state') {
            r.status = 'NOT_A_STATE';
            r.message = `object type is '${obj.type}'`;
            continue;
        }
        const common = obj.common || {};
        if (common.type !== 'boolean') {
            r.status = 'NOT_BOOLEAN';
            r.message = `common.type is '${common.type}' (v1 supports boolean only)`;
            continue;
        }

        // Non-fatal warnings (still valid, but likely misconfigured):
        const warnings = [];
        if (l.id.startsWith('alias.')) warnings.push('alias id – prefer the physical device state');
        if (/^scene\./.test(l.id) || /(^|\.)scenes?(\.|$)/i.test(l.id)) warnings.push('looks like a scene');
        if (/(^|\.)(all|group|room)s?[A-Z_.]/.test(l.id) || /allLights|_all_/i.test(l.id)) warnings.push('looks like a group/room object');
        if (common.write === true && common.read === false) warnings.push('write-only command state – use the status state if available');
        if (typeof common.role === 'string' && /^scene/.test(common.role)) warnings.push(`role '${common.role}' is a scene role`);
        if (warnings.length) {
            r.status = 'WARNING';
            r.message = warnings.join('; ');
        }
        valid.push({ id: l.id, key: l.key, name: typeof l.name === 'string' && l.name ? l.name : l.key });
    }

    return { valid, report };
}

// ============================================================================
// SECTION 7: DAY HANDLING (runtime side)
// ============================================================================
let model = null;

/** Synchronous check; writes are queued. Returns the ensureDay() result. */
function ensureCurrentDay(nowTs) {
    const res = core.ensureDay(model, nowTs, TIME_ZONE);
    if (res.rolledOver) {
        logMsg('info', `day rollover ${res.from || '(none)'} -> ${res.to}: daily reset to 0 (overall ${model.overall}, highScore ${model.highScore} preserved)`);
        writeState(ID.dayKey, model.dayKey);
        writeState(ID.scoreDaily, model.daily);
        writeState(ID.dayHighScoreToday, model.highScoreToday);
        writeState(ID.dayRecordBrokenAt, model.recordBrokenAt);
        writeState(ID.infoLastRolloverAt, nowTs);
    }
    return res;
}

// ============================================================================
// SECTION 8: SCORE PERSISTENCE
// ============================================================================
function persistScore(nowTs) {
    writeState(ID.scoreDaily, model.daily);
    writeState(ID.scoreOverall, model.overall);
    writeState(ID.scoreHighScore, model.highScore);
    writeState(ID.dayHighScoreToday, model.highScoreToday);
    writeState(ID.dayRecordBrokenAt, model.recordBrokenAt);
    writeState(ID.infoLastPointAt, nowTs);
}

// ============================================================================
// SECTION 9: VISUAL EVENT EMISSION
// ============================================================================
let batcher = null;

function emitVisualEvent(ev) {
    model.eventSequence += 1;
    const seq = model.eventSequence;
    const snap = ev.snapshot || {
        daily: model.daily,
        overall: model.overall,
        highScore: model.highScore,
        highScoreToday: model.highScoreToday,
    };
    const payload = {
        sequence: seq,
        delta: ev.delta,
        kind: ev.kind,
        lightCount: ev.lightCount,
        lightNames: ev.lightNames,
        timestamp: ev.timestamp,
        dailyAfter: snap.daily,
        overallAfter: snap.overall,
        highScoreAfter: snap.highScore,
        highScoreToday: snap.highScoreToday,
    };
    // Details first, sequence LAST (all through the serialized write chain).
    writeState(ID.eventDelta, payload.delta);
    writeState(ID.eventKind, payload.kind);
    writeState(ID.eventLightCount, payload.lightCount);
    writeState(ID.eventLightNames, JSON.stringify(payload.lightNames));
    writeState(ID.eventTimestamp, payload.timestamp);
    writeState(ID.eventJson, JSON.stringify(payload));
    writeState(ID.eventSequence, seq);

    if (ev.kind === core.EVENT_KIND.NEW_RECORD) {
        logMsg('info', `NEW RECORD: daily ${snap.daily} (event #${seq}, ${ev.lightCount} light(s): ${ev.lightNames.join(', ')})`);
    } else {
        logMsg('debug', `visual event #${seq}: ${ev.kind} +${ev.delta} [${ev.lightNames.join(', ')}]`);
    }
}

function createRuntimeBatcher() {
    return core.createEventBatcher({
        batchMs: EVENT_BATCH_MS,
        setTimer: (fn, ms) => setTimeout(fn, ms),
        clearTimer: h => clearTimeout(h),
        now: () => Date.now(),
        onEmit: emitVisualEvent,
    });
}

// ============================================================================
// SECTION 10: OFF CANDIDATE HANDLING
// ============================================================================
const lightsById = new Map();          // id -> {id,key,name}
const lastOffTsByLight = new Map();    // id -> offTs of last evaluated candidate

async function readSuppression() {
    return {
        until: await readNumber(ID.suppressionUntil, 0),
        reason: await readString(ID.suppressionReason, ''),
    };
}

/** Subscription callback: capture facts immediately, evaluate after settle. */
function onLightStateChange(obj) {
    const light = lightsById.get(obj.id);
    if (!light) return;

    const newState = obj.state || obj.newState || null;
    const oldState = obj.oldState || null;

    const candidate = {
        light: light,
        oldVal: oldState ? oldState.val : undefined,
        newVal: newState ? newState.val : undefined,
        prevLc: oldState ? (oldState.lc || oldState.ts) : undefined,
        offTs: newState ? (newState.lc || newState.ts) : undefined,
        ack: newState ? newState.ack : undefined,
        receivedAt: Date.now(),
    };

    // Only OFF transitions are candidates. (change:'ne' already filters equal values.)
    if (candidate.newVal !== false) return;

    setTimeout(() => {
        evaluateCandidate(candidate).catch(err =>
            logMsg('error', `evaluation failed for ${light.key}: ${err && err.stack ? err.stack : err}`));
    }, SETTLE_MS);
}

async function evaluateCandidate(c) {
    const nowTs = Date.now();

    // 1) Day verification BEFORE any scoring.
    ensureCurrentDay(nowTs);

    // 2) Fresh suppression lookup AFTER the settle delay.
    const suppression = await readSuppression();

    // 3) Pure qualification.
    const result = core.evaluateOffCandidate({
        oldVal: c.oldVal,
        newVal: c.newVal,
        prevLc: c.prevLc,
        offTs: c.offTs,
        suppressionUntil: suppression.until,
        minOnMs: MIN_ON_MS,
        lastProcessedOffTs: lastOffTsByLight.get(c.light.id),
    });
    if (typeof c.offTs === 'number' && result.reason !== core.REASON.DUPLICATE) {
        lastOffTsByLight.set(c.light.id, c.offTs);
    }

    // 4) Apply exactly one point (synchronous on the in-memory model).
    let applied = null;
    if (result.qualifies) {
        // The suppression read yielded to the event loop; use one fresh timestamp
        // for the day check, score, persistence, and visual snapshot.
        const applyTs = Date.now();
        ensureCurrentDay(applyTs);
        applied = core.applyPoint(model, applyTs);
        persistScore(applyTs);
        batcher.add({
            name: c.light.name,
            key: c.light.key,
            id: c.light.id,
            ts: applyTs,
            newRecord: applied.newRecord,
            snapshot: {
                daily: model.daily,
                overall: model.overall,
                highScore: model.highScore,
                highScoreToday: model.highScoreToday,
            },
        });
    }

    // 5) Diagnostics.
    logCandidate(c, suppression, result, applied);
}

// ============================================================================
// SECTION 11: LOGGING
// ============================================================================
function logMsg(level, msg) {
    if (level === 'debug' && !DEBUG) return;
    // In DEBUG mode debug lines are logged as info so they are visible
    // without changing the adapter log level.
    log(`[energyGame] ${msg}`, level === 'debug' ? 'info' : level);
}

function logCandidate(c, suppression, result, applied) {
    if (!DEBUG) return;
    const rec = {
        light: c.light.name,
        key: c.light.key,
        id: c.light.id,
        oldVal: c.oldVal,
        newVal: c.newVal,
        ack: c.ack,
        prevLc: c.prevLc,
        prevLcIso: typeof c.prevLc === 'number' ? new Date(c.prevLc).toISOString() : null,
        offTs: c.offTs,
        offTsIso: typeof c.offTs === 'number' ? new Date(c.offTs).toISOString() : null,
        onDurationMs: result.onDurationMs,
        suppressionUntil: suppression.until,
        suppressionActiveForEvent: typeof c.offTs === 'number' && suppression.until >= c.offTs,
        suppressionReason: suppression.reason,
        qualified: result.qualifies,
        reason: result.reason,
        dayKey: model.dayKey,
        dailyAfter: model.daily,
        overallAfter: model.overall,
        highScoreAfter: model.highScore,
        newRecord: applied ? applied.newRecord : false,
    };
    logMsg('debug', `OFF ${JSON.stringify(rec)}`);
}

// ============================================================================
// SECTION 12: STARTUP / SHUTDOWN
// ============================================================================
let dayCheckInterval = null;

async function main() {
    const startTs = Date.now();

    if (!core.isTimeZoneSupported(TIME_ZONE)) {
        logMsg('error', `timezone '${TIME_ZONE}' is not supported by this Node.js/ICU build. ` +
            `Day calculations would be wrong. Install full-icu / use a Node build with full ICU. Script stops.`);
        return;
    }

    // Persistent states
    const created = await initStates();
    model = await loadModel();
    logMsg('info', `states ready (${created} created). Loaded: day=${model.dayKey || '(none)'} daily=${model.daily} overall=${model.overall} highScore=${model.highScore} highScoreToday=${model.highScoreToday} seq=${model.eventSequence}`);

    // Day verification on startup
    ensureCurrentDay(startTs);
    writeState(ID.infoStartedAt, startTs);

    // Light configuration
    const { valid, report } = await validateLightConfig(LIGHTS);
    const invalid = report.filter(r => CONFIG_ERROR_STATUSES.has(r.status));
    const warned = report.filter(r => r.status === 'WARNING');
    for (const r of invalid) logMsg('error', `light config ${r.status}: ${r.key || '?'} (${r.id || '?'}) – ${r.message}`);
    for (const r of warned) logMsg('warn', `light config WARNING: ${r.key} (${r.id}) – ${r.message}`);
    writeState(ID.infoConfigStatus, JSON.stringify({
        validCount: valid.length,
        invalidCount: invalid.length,
        checkedAt: startTs,
        lights: report,
    }));

    lightsById.clear();
    for (const l of valid) lightsById.set(l.id, l);

    batcher = createRuntimeBatcher();

    if (valid.length === 0) {
        logMsg('error', 'no valid lights configured – nothing will be scored. Fix LIGHTS and restart the script.');
    } else {
        const subscription = { id: valid.map(l => l.id), change: 'ne' };
        if (SUBSCRIBE_ACK_ONLY) subscription.ack = true;
        on(subscription, onLightStateChange);
        logMsg('info', `subscribed to ${valid.length} light(s): ${valid.map(l => l.key).join(', ')}`);
    }

    // Convenience midnight handling (not relied upon; every scoring path re-checks).
    dayCheckInterval = setInterval(() => {
        try {
            ensureCurrentDay(Date.now());
        } catch (e) {
            logMsg('error', `day check failed: ${e && e.message ? e.message : e}`);
        }
    }, DAY_CHECK_INTERVAL_MS);

    logMsg('info', `running: tz=${TIME_ZONE} minOn=${MIN_ON_MS}ms settle=${SETTLE_MS}ms batch=${EVENT_BATCH_MS}ms debug=${DEBUG}`);
}

onStop(callback => {
    try {
        if (dayCheckInterval) clearInterval(dayCheckInterval);
        if (batcher) batcher.flush();   // pending visual event -> emit now (score already persisted)
    } catch (e) {
        // ignore
    }
    writeChain.then(() => callback()).catch(() => callback());
}, 2000);

main().catch(err => logMsg('error', `startup failed: ${err && err.stack ? err.stack : err}`));
