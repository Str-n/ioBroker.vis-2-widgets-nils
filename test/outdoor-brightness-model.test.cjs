const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const script = fs.readFileSync(path.join(__dirname, '../scripts/outdoor-brightness-model.js'), 'utf8');
const root = '0_userdata.0.sunlight';
const now = Date.now();
const minute = 60000;

async function harness(options = {}) {
    const states = new Map();
    const put = (id, val, ts = now) => states.set(id, { val, ts, ack: true, q: 0 });
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
    const context = vm.createContext({
        createStateAsync: async (id, initial, force, common) => {
            created.set(id, common);
            if (!states.has(id)) put(id, initial);
        },
        getStateAsync: async id => states.get(id) ?? null,
        setStateAsync: async (id, state) => states.set(id, { ...state, ts: now }),
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
                              (now - (options.satelliteAge ?? 20) * minute) / 1000,
                              (now - 10 * minute) / 1000,
                              (now + 10 * minute) / 1000,
                          ],
                          shortwave_radiation_instant: [options.satellite ?? 510, null, 1400],
                      },
                  }
                : {
                      current_units: { shortwave_radiation_instant: options.badUnit ? 'Wh/m²' : 'W/m²' },
                      current: {
                          time: (now - 5 * minute) / 1000,
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

test('rejects an isolated extreme using the median and MAD', async () => {
    const h = await harness({ satellite: 1400 });
    assert.equal(h.value('sources.satellite.available'), true);
    assert.equal(h.value('sources.satellite.used'), false);
    assert.match(h.value('sources.satellite.status'), /Outlier/);
    assert.ok(h.value('overall.irradiance_estimated') <= 520);
});

test('excludes clipped PV from the blend, retaining it as a separate datapoint', async () => {
    const h = await harness({ power: 600, pv: 300, satellite: 800, dwd: 820 });
    assert.equal(h.value('sources.pv.irradiance'), 300);
    assert.equal(h.value('sources.pv.used'), false);
    assert.match(h.value('sources.pv.status'), /clipping/);
    assert.ok(h.value('overall.irradiance_estimated') >= 800);
});

test('two conflicting sources produce an explicit reliability fallback', async () => {
    const h = await harness({ satelliteAge: 80, dwd: 1100, pv: 100 });
    assert.equal(h.value('overall.irradiance_estimated'), 100);
    assert.match(h.value('overall.status'), /disagree/);
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
    const h = await harness({ altitude: -5, networkError: true, noPv: true });
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
