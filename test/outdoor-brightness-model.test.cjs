const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../scripts/outdoor-brightness-model.js'), 'utf8');
const root = '0_userdata.0.sunlight';
const now = Date.parse('2026-09-28T10:00:00Z');
const minute = 60000;

async function harness(options = {}) {
    let clock = now;
    const states = options.states ?? new Map();
    const put = (id, val, ts = clock) => states.set(id, { val, ts, ack: true, q: 0 });
    put(`${root}.solar.irradiance_estimated`, options.pv ?? 500);
    put(`${root}.solar.estimated`, 60000);
    put('deyeidc.0.4154663299.Apo_t1', options.power ?? 400);
    put('followthesun.0.current.altitude', options.altitude ?? 45);
    put('followthesun.0.current.azimuth', 163);
    put('openweathermap.0.forecast.current.clouds', 30);
    put('openweathermap.0.forecast.current.date', now);
    if (options.oldWeather) put('openweathermap.0.forecast.current.date', now - 180 * minute);
    if (options.missingSun) states.delete('followthesun.0.current.altitude');
    if (options.noPv) states.delete(`${root}.solar.irradiance_estimated`);
    const requests = [],
        logs = [],
        created = new Map();
    let scheduled;
    class ClockDate extends Date {
        constructor(...args) {
            super(...(args.length ? args : [clock]));
        }
        static now() {
            return clock;
        }
    }
    const context = vm.createContext({
        Date: ClockDate,
        require: module => {
            assert.equal(module, 'suncalc2');
            if (options.noSunCalc) throw new Error('module missing');
            return {
                getPosition: date => ({
                    altitude: ((options.geometry ? options.geometry(date.getTime(), clock) : 45) * Math.PI) / 180,
                }),
            };
        },
        createStateAsync: async (id, initial, force, common) => {
            created.set(id, common);
            if (!states.has(id)) put(id, initial);
        },
        getStateAsync: async id => states.get(id) ?? null,
        setStateAsync: async (id, state) => states.set(id, { ...state, ts: clock }),
        httpGet: (url, settings, callback) => {
            const request = new URL(url);
            requests.push(request);
            assert.equal(settings.timeout, 15000);
            if (options.networkError) return callback(new Error('offline'));
            const satellite = request.hostname.startsWith('satellite');
            const response = satellite
                ? {
                      hourly_units: { shortwave_radiation_instant: 'W/m²' },
                      hourly: {
                          time: [
                              (clock - (options.satelliteAge ?? 20) * minute) / 1000,
                              (clock - 10 * minute) / 1000,
                              (clock + 10 * minute) / 1000,
                          ],
                          shortwave_radiation_instant: [options.satellite ?? 510, null, 1400],
                      },
                  }
                : {
                      current_units: { shortwave_radiation_instant: options.badUnit ? 'Wh/m²' : 'W/m²' },
                      current: {
                          time: (clock - 5 * minute) / 1000,
                          shortwave_radiation_instant: options.dwd ?? 520,
                          diffuse_radiation_instant: 100,
                      },
                  };
            callback(null, { statusCode: 200, data: options.malformed ? '{broken' : JSON.stringify(response) });
        },
        schedule: (cron, callback) => {
            assert.equal(cron, '20 */10 * * * *');
            scheduled = callback;
        },
        log: (...args) => logs.push(args),
    });
    await vm.runInContext(script, context);
    assert.equal(logs.length, 0, JSON.stringify(logs));
    return {
        states,
        requests,
        context,
        created,
        put,
        options,
        advance: minutes => {
            clock += minutes * minute;
        },
        call: (name, ...args) => {
            context.args = args;
            return vm.runInContext(`${name}(...args)`, context);
        },
        reset: () => vm.runInContext('evidence.clear(); smoothing = null', context),
        update: () => scheduled(),
        value: suffix => states.get(`${root}.${suffix}`)?.val,
    };
}

test('creates sources, preserves PV inputs, and combines one vote per provider', async () => {
    const h = await harness();
    assert.equal(h.requests.length, 2);
    assert.equal(h.requests[1].searchParams.get('temporal_resolution'), 'native');
    assert.equal(h.requests[0].searchParams.get('timeformat'), 'unixtime');
    assert.equal(h.created.get(`${root}.overall.irradiance_estimated`).unit, 'W/m²');
    assert.equal(h.created.get(`${root}.overall.estimated`).unit, 'lx');
    assert.equal(h.value('solar.irradiance_estimated'), 500);
    assert.equal(h.value('overall.valid'), true);
    assert.equal(h.value('overall.source_count'), 3);
    assert.ok(h.value('overall.irradiance_estimated') >= 500 && h.value('overall.irradiance_estimated') <= 520);
    assert.equal(h.value('sources.openweather.available'), true);
    assert.equal(h.value('sources.openweather.used'), false);
    assert.ok(Math.abs(h.value('overall.estimated') - h.value('overall.irradiance_estimated') * 120) <= 110);
});

test('ignores null/future satellite entries and rejects stale observations', async () => {
    const h = await harness({ satelliteAge: 80 });
    assert.equal(h.value('sources.satellite.available'), false);
    assert.match(h.value('sources.satellite.status'), /stale/);
    assert.equal(h.value('overall.source_count'), 2);
});

test('holds an isolated high spike for confirmation', async () => {
    const h = await harness({ pv: 100, dwd: 110, satellite: 1400 });
    assert.equal(h.value('sources.satellite.available'), true);
    assert.equal(h.value('sources.satellite.used'), false);
    assert.match(h.value('sources.satellite.status'), /spike/);
    assert.ok(h.value('overall.irradiance_estimated') <= 520);
});

test('excludes clipped PV from the blend, retaining it as a separate datapoint', async () => {
    const h = await harness({ power: 600, pv: 300, satellite: 800, dwd: 820 });
    assert.equal(h.value('sources.pv.irradiance'), 300);
    assert.equal(h.value('sources.pv.used'), false);
    assert.match(h.value('sources.pv.status'), /clipping/);
    assert.ok(h.value('overall.irradiance_estimated') >= 800);
});

test('an isolated high extreme does not override another source immediately', async () => {
    const h = await harness({ satelliteAge: 80, dwd: 1100, pv: 100 });
    assert.equal(h.value('overall.irradiance_estimated'), 100);
    assert.match(h.value('sources.dwd.status'), /spike/);
});

test('network outage uses local PV, then marks all-invalid cycles without overwriting last good output', async () => {
    const h = await harness({ networkError: true, oldWeather: true });
    assert.equal(h.value('overall.irradiance_estimated'), 500);
    h.states.delete(`${root}.solar.irradiance_estimated`);
    await h.update();
    assert.equal(h.value('overall.valid'), false);
    assert.equal(h.value('overall.irradiance_estimated'), 500);
    assert.equal(h.value('overall.source_count'), 0);
});

test('cloud-only and clipped-PV fallbacks are explicitly labelled', async () => {
    const cloud = await harness({ networkError: true, noPv: true });
    assert.match(cloud.value('overall.status'), /Cloud-only/);
    const clipped = await harness({ networkError: true, power: 600 });
    assert.match(clipped.value('overall.status'), /lower-bound/);
});

test('night writes zero even when network and PV are unavailable', async () => {
    const h = await harness({ altitude: -9, networkError: true, noPv: true });
    assert.equal(h.value('overall.estimated'), 0);
    assert.equal(h.value('overall.irradiance_estimated'), 0);
    assert.equal(h.value('overall.valid'), true);
    assert.equal(h.value('overall.source_count'), 0);
});

test('missing sun state still allows independent API collection', async () => {
    const h = await harness({ missingSun: true });
    assert.equal(h.requests.length, 2);
    assert.equal(h.value('sources.pv.available'), false);
    assert.equal(h.value('sources.openweather.available'), false);
    assert.equal(h.value('overall.valid'), true);
    assert.match(h.value('overall.status'), /sun position unavailable/);
});

test('malformed responses and wrong units are isolated from healthy sources', async () => {
    const malformed = await harness({ malformed: true });
    assert.equal(malformed.value('overall.irradiance_estimated'), 500);
    assert.equal(malformed.value('sources.dwd.available'), false);
    const units = await harness({ badUnit: true });
    assert.equal(units.value('sources.dwd.available'), false);
    assert.match(units.value('sources.dwd.status'), /unit/);
});

test('zero radiation is valid; empty values, bad quality and stale local readings are not', async () => {
    const h = await harness({ pv: 0, satellite: 0, dwd: 0 });
    assert.equal(h.value('overall.irradiance_estimated'), 0);
    h.put(`${root}.solar.irradiance_estimated`, '');
    await h.update();
    assert.equal(h.value('sources.pv.available'), false);
    h.put(`${root}.solar.irradiance_estimated`, 500, now - 26 * minute);
    await h.update();
    assert.equal(h.value('sources.pv.available'), false);
    h.put(`${root}.solar.irradiance_estimated`, 500);
    h.states.get(`${root}.solar.irradiance_estimated`).q = 64;
    await h.update();
    assert.equal(h.value('sources.pv.available'), false);
});

test('configuration guard prevents feedback into the PV input', async () => {
    const h = await harness();
    vm.runInContext('MODEL.outputId = MODEL.pvIrradianceId', h.context);
    const changed = script.replace(
        "outputId: '0_userdata.0.sunlight.overall.estimated'",
        "outputId: '0_userdata.0.sunlight.solar.irradiance_estimated'",
    );
    const logs = [];
    await vm.runInNewContext(changed, { log: message => logs.push(message) });
    assert.match(logs[0], /must differ/);
});

function source(name, value, timestamp = now, extra = {}) {
    return { name, value, timestamp, available: true, status: 'Available', weight: 1, ...extra };
}

test('CSV morning/evening cases prefer high valid estimates in low light', async () => {
    for (const [pv, dwd, satellite, expected] of [
        [3400, 14100, 12000, 13680],
        [3000, 9500, 5700, 8740],
        [3800, 17400, 9300, 15780],
        [16100, 4400, 5100, 13900],
        [3500, 800, 2300, 3260],
    ]) {
        const h = await harness({ pv: pv / 120, dwd: dwd / 120, satellite: satellite / 120 });
        if (pv === 16100) {
            assert.match(h.value('sources.pv.status'), /spike/);
            h.advance(10);
            h.put(`${root}.solar.irradiance_estimated`, pv / 120);
            h.put('deyeidc.0.4154663299.Apo_t1', 400);
            await h.update();
        }
        assert.ok(
            Math.abs(h.value('overall.estimated') - expected) <= 50,
            `${pv}, ${dwd}, ${satellite}: ${h.value('overall.estimated')}`,
        );
        assert.equal(h.value('overall.low_light_preference'), 1);
        assert.ok(h.value('overall.target_estimated') >= h.value('overall.central_estimated'));
    }
});

test('two low-light estimates prefer the higher value instead of a fixed-weight winner', async () => {
    const h = await harness({ pv: 50, dwd: 100, satelliteAge: 80 });
    assert.equal(h.value('overall.irradiance_estimated'), 95);
    assert.equal(h.value('overall.source_count'), 2);
});

test('upper preference fades continuously and cannot lower the central value', async () => {
    const h = await harness();
    h.reset();
    for (const [lux, expectedPreference] of [
        [19000, 1],
        [20000, 1],
        [30000, 0.5],
        [40000, 0],
        [41000, 0],
    ]) {
        const result = h.call(
            'combine',
            [source('pv', lux / 240), source('dwd', lux / 160), source('satellite', lux / 120)],
            now,
        );
        assert.equal(result.preference, expectedPreference);
        assert.ok(result.value >= result.central);
    }
    const a = h.call('combine', [source('pv', 90), source('dwd', 120), source('satellite', 20000 / 120 - 0.001)], now);
    const b = h.call('combine', [source('pv', 90), source('dwd', 120), source('satellite', 20000 / 120 + 0.001)], now);
    assert.ok(Math.abs(a.value - b.value) < 0.01);
});

test('PV weight has no jumps at the old 10 degree and 0.2 incidence thresholds', async () => {
    const h = await harness();
    for (const [a, b] of [
        [
            [9.999, 0.3],
            [10.001, 0.3],
        ],
        [
            [15, 0.19999],
            [15, 0.20001],
        ],
    ]) {
        assert.ok(Math.abs(h.call('pvWeight', ...a) - h.call('pvWeight', ...b)) < 0.002);
    }
    assert.equal(h.call('pvWeight', 2, -0.1), 0.5);
    assert.equal(h.call('pvWeight', 25, 0.8), 3);
});

test('spike confirmation requires distinct recent observations, never repeated polls', async () => {
    const h = await harness();
    h.reset();
    const candidates = timestamp => [source('pv', 20), source('dwd', 30), source('satellite', 300, timestamp)];
    let result = h.call('combine', candidates(now), now);
    assert.equal(result.used.includes('satellite'), false);
    result = h.call('combine', candidates(now), now + 10 * minute);
    assert.equal(result.used.includes('satellite'), false);
    result = h.call('combine', candidates(now + 10 * minute), now + 10 * minute);
    assert.equal(result.used.includes('satellite'), true);
    // Confirmation is not immortal if the source does not publish again.
    result = h.call('combine', candidates(now + 10 * minute), now + 41 * minute);
    assert.equal(result.used.includes('satellite'), false);
});

test('another high source corroborates a real rise immediately', async () => {
    const h = await harness();
    h.reset();
    const result = h.call('combine', [source('pv', 15), source('dwd', 140), source('satellite', 160)], now);
    assert.equal(result.used.length, 3);
    assert.ok(result.value >= 150);
});

test('satellite alignment raises morning and lowers evening values while preserving raw series', async () => {
    for (const rising of [true, false]) {
        const h = await harness({
            pv: 200,
            dwd: 200,
            satellite: 200,
            geometry: (time, current) => (time < current ? (rising ? 20 : 40) : 30),
        });
        assert.equal(h.value('sources.satellite.irradiance'), 200);
        const corrected = h.value('sources.satellite.corrected_irradiance');
        assert.ok(rising ? corrected > 200 : corrected < 200);
        assert.equal(h.value('sources.satellite.eligible'), true);
        assert.ok(JSON.parse(h.value('sources.satellite.details')).correctionRatio > 0);
    }
});

test('near-horizon, unbounded or unavailable solar corrections cannot vote', async () => {
    for (const options of [
        { geometry: time => (time < now ? 3 : 8) },
        { geometry: time => (time < now ? 6 : 40) },
        { noSunCalc: true },
    ]) {
        const h = await harness(options);
        assert.equal(h.value('sources.satellite.available'), true);
        assert.equal(h.value('sources.satellite.eligible'), false);
        assert.equal(h.value('sources.satellite.used'), false);
        assert.equal(h.value('sources.satellite.corrected_irradiance'), null);
        assert.equal(h.value('sources.satellite.irradiance'), 510);
    }
});

test('declines use actual elapsed time, rises are immediate, and history expires', async () => {
    const h = await harness();
    h.reset();
    assert.equal(h.call('smoothDecline', 100, now, false), 100);
    assert.equal(h.call('smoothDecline', 20, now + 10 * minute, false), 60);
    assert.equal(h.call('smoothDecline', 20, now + 20 * minute, false), 40);
    assert.equal(h.call('smoothDecline', 20, now + 26 * minute, false), 20);
    assert.equal(h.call('smoothDecline', 120, now + 27 * minute, false), 120);
    assert.equal(h.call('smoothDecline', 0, now + 28 * minute, true), 0);
    h.reset();
    h.call('smoothDecline', 100, now, false);
    assert.ok(Math.abs(h.call('smoothDecline', 0, now + 5 * minute, false) - 100 / Math.sqrt(2)) < 1e-8);
    assert.equal(h.call('smoothDecline', null, now + 6 * minute, false), null);
    assert.equal(h.call('smoothDecline', 10, now + 7 * minute, false), 10);
});

test('integrated updates expose target and final smoothed values separately', async () => {
    const h = await harness({ networkError: true, pv: 200 });
    h.advance(10);
    h.put(`${root}.solar.irradiance_estimated`, 100);
    await h.update();
    assert.equal(h.value('overall.irradiance_estimated'), 150);
    assert.equal(h.value('overall.target_estimated'), 12000);
    assert.equal(h.value('overall.estimated'), 18000);
    assert.match(h.value('overall.status'), /gradual decline/);
    h.advance(1);
    h.put(`${root}.solar.irradiance_estimated`, 250);
    await h.update();
    assert.equal(h.value('overall.irradiance_estimated'), 250);
});

test('a failed cycle invalidates history instead of using a stale high value', async () => {
    const h = await harness({ networkError: true, oldWeather: true });
    h.states.delete(`${root}.solar.irradiance_estimated`);
    h.advance(10);
    await h.update();
    assert.equal(h.value('overall.valid'), false);
    assert.equal(h.value('overall.smoothing_state'), 'null');
    h.put(`${root}.solar.irradiance_estimated`, 20);
    await h.update();
    assert.equal(h.value('overall.irradiance_estimated'), 20);
});

test('fresh smoothing history survives restart; expired and corrupt history do not', async () => {
    const seed = (saved, valid = true) =>
        new Map([
            [`${root}.overall.smoothing_state`, { val: JSON.stringify(saved), ts: now, q: 0 }],
            [`${root}.overall.valid`, { val: valid, ts: now, q: 0 }],
        ]);
    const saved = { version: 2, value: 100, updatedAt: now - 10 * minute, holdUntil: now + 15 * minute };
    const fresh = await harness({ states: seed(saved), pv: 20, networkError: true });
    assert.equal(fresh.value('overall.irradiance_estimated'), 60);
    for (const s of [
        { ...saved, holdUntil: now - 1 },
        { ...saved, value: 'bad' },
        { ...saved, version: 1 },
    ]) {
        const h = await harness({ states: seed(s), pv: 20, networkError: true });
        assert.equal(h.value('overall.irradiance_estimated'), 20);
    }
    const invalid = await harness({ states: seed(saved, false), pv: 20, networkError: true });
    assert.equal(invalid.value('overall.irradiance_estimated'), 20);
});

test('twilight stays positive below the horizon and is explicitly labelled', async () => {
    for (const altitude of [-1, -3, -5, -7]) {
        const h = await harness({ altitude, networkError: true, noPv: true });
        assert.ok(h.value('overall.estimated') > 0);
        assert.equal(h.value('overall.source_count'), 0);
        assert.match(h.value('overall.status'), /Twilight heuristic; uncalibrated/);
        assert.equal(h.value('overall.valid'), true);
    }
    const h = await harness();
    assert.ok(Math.abs(h.call('twilightLux', -0.00001) - h.call('twilightLux', 0.00001)) < 0.01);
    assert.equal(h.call('twilightLux', -8), 0);
    assert.equal(h.call('twilightLux', 5), 0);
});

test('source failures clear corrected values and mark last raw readings unusable', async () => {
    const h = await harness();
    h.options.networkError = true;
    await h.update();
    assert.equal(h.value('sources.satellite.irradiance'), 510);
    assert.equal(h.value('sources.satellite.corrected_estimated'), null);
    assert.equal(h.value('sources.satellite.available'), false);
    assert.equal(h.value('sources.satellite.eligible'), false);
});

test('a single-source spike cannot confirm itself through repeated polling', async () => {
    const h = await harness();
    h.reset();
    h.call('combine', [source('pv', 10)], now);
    const first = h.call('combine', [source('pv', 100, now + minute)], now + minute);
    assert.equal(first.value, null);
    const repeated = h.call('combine', [source('pv', 100, now + minute)], now + 2 * minute);
    assert.equal(repeated.value, null);
    const confirmed = h.call('combine', [source('pv', 100, now + 3 * minute)], now + 3 * minute);
    assert.equal(confirmed.value, 100);
});

test('smoothing cannot extend the freshness deadline of its source evidence', async () => {
    const h = await harness();
    h.reset();
    h.call('smoothDecline', 100, now, false, now + 5 * minute);
    assert.equal(h.call('smoothDecline', 10, now + 6 * minute, false, now + 25 * minute), 10);
});

test('cloud fallback remains available when the only primary source is an unconfirmed spike', async () => {
    const h = await harness({ networkError: true, pv: 10 });
    h.advance(10);
    h.put(`${root}.solar.irradiance_estimated`, 100);
    await h.update();
    assert.match(h.value('sources.pv.status'), /spike/);
    assert.equal(h.value('sources.openweather.used'), true);
    assert.match(h.value('overall.status'), /Cloud-only/);
});

test('recomputing PV irradiance from the same inverter sample cannot confirm a spike', async () => {
    const h = await harness({ pv: 200, dwd: 30, satellite: 40 });
    assert.match(h.value('sources.pv.status'), /spike/);
    h.advance(10);
    h.put(`${root}.solar.irradiance_estimated`, 200);
    await h.update();
    assert.equal(h.value('sources.pv.used'), false);
    h.put('deyeidc.0.4154663299.Apo_t1', 400);
    await h.update();
    assert.equal(h.value('sources.pv.used'), true);
});
