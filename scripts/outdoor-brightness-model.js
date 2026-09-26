/* global createStateAsync, getStateAsync, setStateAsync, httpGet, schedule, log */

/**
 * Standalone ioBroker JavaScript script (javascript adapter >= 7.9).
 * Keep the original PV script running. Paste this file into a SECOND normal script.
 * Polls two free Open-Meteo APIs, reads local PV and existing OpenWeather states,
 * stores each source, and combines usable horizontal irradiance estimates.
 * Requires outbound HTTPS; no npm packages or additional API keys.
 *
 * Open-Meteo data: https://open-meteo.com/ (CC BY 4.0; free non-commercial API).
 * https://open-meteo.com/en/docs/dwd-api
 * https://open-meteo.com/en/docs/satellite-radiation-api
 * Clear-sky model: https://pvlib-python.readthedocs.io/en/stable/reference/generated/pvlib.clearsky.haurwitz.html
 *
 * Satellite data are delayed observations; DWD data are forecasts. Neither sees
 * every cloud at your house. Outlier rejection is a heuristic, not a guarantee.
 * W/m² -> lux is approximate. Below the horizon this solar model reports zero;
 * it cannot estimate twilight, moonlight or artificial lighting.
 */
const MODEL = {
    // Approximate location near 56567; replace with your home's coordinates.
    latitude: 50.45,
    longitude: 7.43,
    outputId: '0_userdata.0.sunlight.overall.estimated',
    irradianceOutputId: '0_userdata.0.sunlight.overall.irradiance_estimated',
    diagnosticRoot: '0_userdata.0.sunlight.overall',
    sourceRoot: '0_userdata.0.sunlight.sources',
    pvIrradianceId: '0_userdata.0.sunlight.solar.irradiance_estimated',
    pvLuxId: '0_userdata.0.sunlight.solar.estimated', // Diagnostic only; not a second vote.
    powerId: 'deyeidc.0.4154663299.Apo_t1',
    altitudeId: 'followthesun.0.current.altitude',
    azimuthId: 'followthesun.0.current.azimuth',
    weatherRoot: 'openweathermap.0.forecast.current',
    panelAzimuthDeg: 163,
    panelTiltDeg: 30,
    clippingW: 590, // Treat readings close to the 600 W limit as censored.
    luxPerWm2: 120,
    luxCalibration: 1,
    localMaxAgeMinutes: 25,
    satelliteMaxAgeMinutes: 50,
    weatherMaxAgeMinutes: 120,
    maxIrradiance: 1600, // Broad sanity bound, allowing cloud enhancement.
    outlierAbsoluteWm2: 100,
    outlierRelative: 0.5,
    httpTimeoutMs: 15000,
};
const SOURCE_NAMES = ['pv', 'dwd', 'satellite', 'openweather'];
const MINUTE = 60000;
const rad = degrees => (degrees * Math.PI) / 180;
const luxFrom = value => Math.round((value * MODEL.luxPerWm2 * MODEL.luxCalibration) / 100) * 100;

function numeric(value) {
    if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') {
        throw new Error('Missing numeric value');
    }
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error('Non-finite value');
    return number;
}

function checkAge(timestamp, maxMinutes, now) {
    if (!Number.isFinite(timestamp) || timestamp > now + MINUTE || now - timestamp > maxMinutes * MINUTE) {
        throw new Error('Missing, future or stale timestamp');
    }
}

async function readInput(id, maxMinutes, now) {
    const state = await getStateAsync(id);
    if (!state || state.q) throw new Error(`Missing/bad-quality input: ${id}`);
    checkAge(state.ts, maxMinutes, now);
    return { value: numeric(state.val), timestamp: state.ts };
}

function jsonGet(url) {
    return new Promise((resolve, reject) => {
        httpGet(url, { timeout: MODEL.httpTimeoutMs }, (error, response) => {
            if (error) return reject(new Error(`HTTP request failed: ${error.message || error}`));
            if (!response || response.statusCode !== 200)
                return reject(new Error(`HTTP ${response && response.statusCode}`));
            try {
                const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
                if (!data || data.error) throw new Error((data && data.reason) || 'Empty API response');
                resolve(data);
            } catch (parseError) {
                reject(parseError);
            }
        });
    });
}

function apiUrl(base, parameters) {
    return `${base}?${Object.entries(parameters)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&')}`;
}

function radiation(value) {
    const number = numeric(value);
    if (number < 0 || number > MODEL.maxIrradiance) throw new Error('Irradiance outside sanity range');
    return number;
}

async function collectDwd(now) {
    const data = await jsonGet(
        apiUrl('https://api.open-meteo.com/v1/dwd-icon', {
            latitude: MODEL.latitude,
            longitude: MODEL.longitude,
            timeformat: 'unixtime',
            current: 'shortwave_radiation_instant,diffuse_radiation_instant',
        }),
    );
    if (data.current_units?.shortwave_radiation_instant !== 'W/m²') throw new Error('Unexpected DWD unit');
    const timestamp = numeric(data.current?.time) * 1000;
    checkAge(timestamp, 25, now);
    return {
        value: radiation(data.current.shortwave_radiation_instant),
        timestamp,
        weight: 1,
        details: { kind: 'forecast', diffuseWm2: data.current.diffuse_radiation_instant },
    };
}

async function collectSatellite(now) {
    const data = await jsonGet(
        apiUrl('https://satellite-api.open-meteo.com/v1/archive', {
            latitude: MODEL.latitude,
            longitude: MODEL.longitude,
            timeformat: 'unixtime',
            hourly: 'shortwave_radiation_instant',
            models: 'satellite_radiation_seamless',
            temporal_resolution: 'native',
            past_days: 1,
        }),
    );
    if (data.hourly_units?.shortwave_radiation_instant !== 'W/m²') throw new Error('Unexpected satellite unit');
    const times = data.hourly?.time;
    const values = data.hourly?.shortwave_radiation_instant;
    if (!Array.isArray(times) || !Array.isArray(values) || times.length !== values.length) {
        throw new Error('Malformed satellite series');
    }
    // Never select future entries or convert missing observations (null) to zero.
    let latest = null;
    for (let index = 0; index < times.length; index++) {
        const timestamp = numeric(times[index]) * 1000;
        if (timestamp > now || values[index] === null || values[index] === undefined) continue;
        if (!latest || timestamp > latest.timestamp) latest = { timestamp, value: values[index] };
    }
    if (!latest) throw new Error('No satellite observation yet');
    checkAge(latest.timestamp, MODEL.satelliteMaxAgeMinutes, now);
    return {
        value: radiation(latest.value),
        timestamp: latest.timestamp,
        weight: Math.max(0.3, 1 - (now - latest.timestamp) / (MODEL.satelliteMaxAgeMinutes * MINUTE)),
        details: { kind: 'delayed satellite observation' },
    };
}

async function collectPv(now, altitude) {
    const [irradiance, power, azimuth] = await Promise.all([
        readInput(MODEL.pvIrradianceId, MODEL.localMaxAgeMinutes, now),
        readInput(MODEL.powerId, MODEL.localMaxAgeMinutes, now),
        readInput(MODEL.azimuthId, MODEL.localMaxAgeMinutes, now),
    ]);
    if (azimuth.value < 0 || azimuth.value > 360) throw new Error('Invalid sun azimuth');
    const incidence =
        Math.sin(rad(altitude)) * Math.cos(rad(MODEL.panelTiltDeg)) +
        Math.cos(rad(altitude)) *
            Math.sin(rad(MODEL.panelTiltDeg)) *
            Math.cos(rad(azimuth.value - MODEL.panelAzimuthDeg));
    const clipped = power.value >= MODEL.clippingW;
    let originalLux = null;
    try {
        originalLux = (await readInput(MODEL.pvLuxId, MODEL.localMaxAgeMinutes, now)).value;
    } catch {
        /* Optional diagnostic. */
    }
    return {
        value: radiation(irradiance.value),
        timestamp: Math.min(irradiance.timestamp, power.timestamp, azimuth.timestamp),
        weight: altitude >= 10 && incidence >= 0.2 ? 3 : 0.5,
        clipped,
        details: { powerW: power.value, originalLux, clipped, incidence },
    };
}

function clearSky(altitude) {
    if (altitude <= 0) return 0;
    const sine = Math.sin(rad(altitude));
    return 1098 * sine * Math.exp(-0.059 / sine);
}

async function collectOpenWeather(now, altitude) {
    const [clouds, date] = await Promise.all([
        readInput(`${MODEL.weatherRoot}.clouds`, MODEL.weatherMaxAgeMinutes, now),
        readInput(`${MODEL.weatherRoot}.date`, MODEL.weatherMaxAgeMinutes, now),
    ]);
    // The adapter converts OpenWeather's observation date from seconds to milliseconds.
    checkAge(date.value, MODEL.weatherMaxAgeMinutes, now);
    if (clouds.value < 0 || clouds.value > 100) throw new Error('Invalid cloud coverage');
    const clear = clearSky(altitude);
    // Deliberately crude cloud transmission assumption. Not a radiation measurement.
    const value = clear * (1 - 0.75 * Math.pow(clouds.value / 100, 3.4));
    return {
        value,
        timestamp: Math.min(clouds.timestamp, date.timestamp, date.value),
        weight: 0.25,
        details: { cloudsPercent: clouds.value, clearSkyWm2: clear, kind: 'cloud heuristic; fallback only' },
    };
}

const median = values => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

function combine(sources) {
    const reasons = Object.fromEntries(
        sources.filter(source => !source.available).map(source => [source.name, source.status]),
    );
    const available = sources.filter(source => source.available);
    let candidates = available.filter(source => source.name !== 'openweather' && !source.clipped);
    if (candidates.length) {
        for (const source of available.filter(source => source.clipped))
            reasons[source.name] = 'Inverter clipping; lower-bound estimate';
        if (available.some(source => source.name === 'openweather'))
            reasons.openweather = 'Cloud heuristic reserved for fallback';
    } else {
        // Prefer a clipped local lower-bound estimate to a cloud-only guess.
        candidates = available.filter(source => source.clipped);
        if (!candidates.length) candidates = available.filter(source => source.name === 'openweather');
        else if (available.some(source => source.name === 'openweather'))
            reasons.openweather = 'Cloud heuristic reserved for fallback';
    }
    if (!candidates.length) return { value: null, used: [], reasons, status: 'No usable sources' };
    if (candidates.length >= 3) {
        const center = median(candidates.map(source => source.value));
        const mad = median(candidates.map(source => Math.abs(source.value - center)));
        const threshold = Math.max(MODEL.outlierAbsoluteWm2, center * MODEL.outlierRelative, 3 * 1.4826 * mad);
        candidates = candidates.filter(source => {
            if (Math.abs(source.value - center) <= threshold) return true;
            reasons[source.name] =
                `Outlier: differs from median ${Math.round(center)} by more than ${Math.round(threshold)} W/m²`;
            return false;
        });
    }
    let status = candidates.length >= 2 ? 'Multiple sources' : 'Single source; unverified';
    if (candidates.length === 2) {
        const center = median(candidates.map(source => source.value));
        if (
            Math.abs(candidates[0].value - candidates[1].value) >
            Math.max(MODEL.outlierAbsoluteWm2, center * MODEL.outlierRelative)
        ) {
            // Two readings cannot establish which is an outlier. Do not invent consensus.
            candidates.sort((a, b) => b.weight - a.weight || b.timestamp - a.timestamp);
            reasons[candidates[1].name] = 'Disagreement; selected source with higher configured reliability';
            candidates = candidates.slice(0, 1);
            status = 'Sources disagree; single-source fallback';
        }
    }
    if (candidates[0].clipped) status = 'PV clipping; lower-bound fallback';
    if (candidates[0].name === 'openweather') status = 'Cloud-only fallback; low reliability';
    const weight = candidates.reduce((sum, source) => sum + source.weight, 0);
    return {
        value: candidates.reduce((sum, source) => sum + source.value * source.weight, 0) / weight,
        used: candidates.map(source => source.name),
        reasons,
        status,
    };
}

async function write(id, value) {
    await setStateAsync(id, { val: value, ack: true });
}

async function create(id, type, unit = '', role = 'value') {
    await createStateAsync(id, null, false, { name: id.split('.').pop(), type, role, unit, read: true, write: false });
}

async function publishSource(source, result, now) {
    const root = `${MODEL.sourceRoot}.${source.name}`;
    if (source.available) {
        await write(`${root}.irradiance`, Math.round(source.value));
        await write(`${root}.estimated`, luxFrom(source.value));
        await write(`${root}.timestamp`, source.timestamp);
        await write(`${root}.age_minutes`, Math.round(((now - source.timestamp) / MINUTE) * 10) / 10);
        await write(`${root}.details`, JSON.stringify(source.details));
    }
    // Unavailable values remain for inspection; available=false excludes them from use.
    await write(`${root}.available`, source.available);
    await write(`${root}.used`, result.used.includes(source.name));
    await write(`${root}.status`, result.reasons[source.name] || source.status);
}

let busy = false;
async function updateModel() {
    if (busy) return;
    busy = true;
    try {
        const now = Date.now();
        await write(`${MODEL.diagnosticRoot}.valid`, false);
        let altitude = null;
        try {
            altitude = (await readInput(MODEL.altitudeId, MODEL.localMaxAgeMinutes, now)).value;
            if (altitude < -90 || altitude > 90) throw new Error('Invalid altitude');
        } catch (error) {
            altitude = null;
        }
        const withSun = collect => {
            if (altitude === null) throw new Error('Sun position missing, invalid or stale');
            return collect(now, altitude);
        };
        const collectors = [
            () => withSun(collectPv),
            () => collectDwd(now),
            () => collectSatellite(now),
            () => withSun(collectOpenWeather),
        ];
        const settled = await Promise.allSettled(collectors.map(collect => Promise.resolve().then(collect)));
        const sources = settled.map((result, index) =>
            result.status === 'fulfilled'
                ? { ...result.value, name: SOURCE_NAMES[index], available: true, status: 'Available' }
                : { name: SOURCE_NAMES[index], available: false, status: result.reason.message },
        );
        const result =
            altitude !== null && altitude <= 0
                ? {
                      value: 0,
                      used: [],
                      reasons: Object.fromEntries(sources.map(source => [source.name, 'Sun below horizon'])),
                      status: 'Sun below horizon; twilight not modelled',
                  }
                : combine(sources);
        if (altitude === null) result.status += '; sun position unavailable';
        // Mark invalid during publication; consumers can use valid as the completion flag.
        await write(`${MODEL.diagnosticRoot}.valid`, false);
        for (const source of sources) await publishSource(source, result, now);
        await write(`${MODEL.diagnosticRoot}.sources_used`, JSON.stringify(result.used));
        await write(`${MODEL.diagnosticRoot}.sources_rejected`, JSON.stringify(result.reasons));
        await write(`${MODEL.diagnosticRoot}.source_count`, result.used.length);
        await write(`${MODEL.diagnosticRoot}.status`, result.status);
        if (result.value !== null) {
            await write(MODEL.irradianceOutputId, Math.round(result.value));
            await write(MODEL.outputId, luxFrom(result.value));
            await write(`${MODEL.diagnosticRoot}.last_success`, Date.now());
            await write(`${MODEL.diagnosticRoot}.valid`, true);
        }
    } catch (error) {
        log(`Outdoor brightness model: ${error.message}`, 'warn');
        try {
            await write(`${MODEL.diagnosticRoot}.valid`, false);
        } catch {
            /* Original error already logged. */
        }
    } finally {
        busy = false;
    }
}

(async () => {
    // Prevent accidental feedback if configuration is edited later.
    const inputs = [MODEL.pvIrradianceId, MODEL.pvLuxId, MODEL.powerId, MODEL.altitudeId, MODEL.azimuthId];
    if (
        inputs.includes(MODEL.outputId) ||
        inputs.includes(MODEL.irradianceOutputId) ||
        MODEL.outputId === MODEL.irradianceOutputId
    ) {
        throw new Error('Combined outputs must differ from each other and all input IDs');
    }
    await create(MODEL.outputId, 'number', 'lx', 'value.brightness');
    await create(MODEL.irradianceOutputId, 'number', 'W/m²');
    for (const name of SOURCE_NAMES) {
        const root = `${MODEL.sourceRoot}.${name}`;
        for (const [field, type, unit] of [
            ['irradiance', 'number', 'W/m²'],
            ['estimated', 'number', 'lx'],
            ['timestamp', 'number', 'ms'],
            ['age_minutes', 'number', 'min'],
            ['available', 'boolean', ''],
            ['used', 'boolean', ''],
            ['status', 'string', ''],
            ['details', 'string', ''],
        ])
            await create(`${root}.${field}`, type, unit);
    }
    for (const [field, type] of [
        ['valid', 'boolean'],
        ['status', 'string'],
        ['source_count', 'number'],
        ['sources_used', 'string'],
        ['sources_rejected', 'string'],
        ['last_success', 'number'],
    ])
        await create(`${MODEL.diagnosticRoot}.${field}`, type);
    // Offset from the original PV script's ten-minute boundary.
    schedule('20 */10 * * * *', updateModel);
    await updateModel();
})().catch(error => log(`Outdoor brightness model failed to start: ${error.message}`, 'error'));
