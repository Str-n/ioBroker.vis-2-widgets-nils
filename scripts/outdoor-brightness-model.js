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
 * Low light deliberately favors eligible high estimates. Twilight is an adjustable,
 * uncalibrated heuristic. W/m² -> lux is approximate; moon/artificial light are excluded.
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
    lowLightFullLux: 20000,
    lowLightEndLux: 40000,
    underestimationCost: 9, // 9:1 asymmetric loss -> ensemble quantile 0.9 (not a confidence bound).
    spikeRatio: 3,
    spikeGapLux: 5000,
    spikeConfirmationMinutes: 30,
    declineHalfLifeMinutes: 10,
    historyMaxAgeMinutes: 25, // A falling output cannot perpetually refresh an old high value.
    satelliteMinAltitude: 5, // Avoid unstable clear-sky ratios near the horizon.
    satelliteMinRatio: 0.5,
    satelliteMaxRatio: 2,
    twilightHorizonLux: 400, // Provisional conservative floor; calibrate with real lux readings.
    twilightDecayDegrees: 1.2,
    twilightEndAltitude: -8, // Smooth taper from -6° to -8°, then modelled night.
    twilightDayEndAltitude: 5,
    httpTimeoutMs: 15000,
};
const SOURCE_NAMES = ['pv', 'dwd', 'satellite', 'openweather'];
const MINUTE = 60000;
const rad = degrees => (degrees * Math.PI) / 180;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const asLux = value => value * MODEL.luxPerWm2 * MODEL.luxCalibration;
const roundLux = lux => {
    const step = lux < 100 ? 1 : lux < 1000 ? 10 : 100;
    return Math.round(lux / step) * step;
};
const luxFrom = value => roundLux(asLux(value));
const smoothstep = (low, high, value) => {
    const x = clamp((value - low) / (high - low), 0, 1);
    return x * x * (3 - 2 * x);
};
const pvWeight = (altitude, incidence) => 0.5 + 2.5 * smoothstep(5, 20, altitude) * smoothstep(0, 0.4, incidence);
const evidence = new Map();
let smoothing = null;

function numeric(value) {
    if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '') {
        throw new Error('Missing numeric value');
    }
    const number = Number(value);
    if (!Number.isFinite(number)) {
        throw new Error('Non-finite value');
    }
    return number;
}

function checkAge(timestamp, maxMinutes, now) {
    if (!Number.isFinite(timestamp) || timestamp > now + MINUTE || now - timestamp > maxMinutes * MINUTE) {
        throw new Error('Missing, future or stale timestamp');
    }
}

async function readInput(id, maxMinutes, now) {
    const state = await getStateAsync(id);
    if (!state || state.q) {
        throw new Error(`Missing/bad-quality input: ${id}`);
    }
    checkAge(state.ts, maxMinutes, now);
    return { value: numeric(state.val), timestamp: state.ts };
}

function jsonGet(url) {
    return new Promise((resolve, reject) => {
        httpGet(url, { timeout: MODEL.httpTimeoutMs }, (error, response) => {
            if (error) {
                return reject(new Error(`HTTP request failed: ${error.message || error}`));
            }
            if (!response || response.statusCode !== 200) {
                return reject(new Error(`HTTP ${response && response.statusCode}`));
            }
            try {
                const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
                if (!data || data.error) {
                    throw new Error((data && data.reason) || 'Empty API response');
                }
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
    if (number < 0 || number > MODEL.maxIrradiance) {
        throw new Error('Irradiance outside sanity range');
    }
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
    if (data.current_units?.shortwave_radiation_instant !== 'W/m²') {
        throw new Error('Unexpected DWD unit');
    }
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
    if (data.hourly_units?.shortwave_radiation_instant !== 'W/m²') {
        throw new Error('Unexpected satellite unit');
    }
    const times = data.hourly?.time;
    const values = data.hourly?.shortwave_radiation_instant;
    if (!Array.isArray(times) || !Array.isArray(values) || times.length !== values.length) {
        throw new Error('Malformed satellite series');
    }
    // Never select future entries or convert missing observations (null) to zero.
    let latest = null;
    for (let index = 0; index < times.length; index++) {
        const timestamp = numeric(times[index]) * 1000;
        if (timestamp > now || values[index] === null || values[index] === undefined) {
            continue;
        }
        if (!latest || timestamp > latest.timestamp) {
            latest = { timestamp, value: values[index] };
        }
    }
    if (!latest) {
        throw new Error('No satellite observation yet');
    }
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
    if (azimuth.value < 0 || azimuth.value > 360) {
        throw new Error('Invalid sun azimuth');
    }
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
        weight: pvWeight(altitude, incidence),
        // Re-running the first script on the same power sample is not a new observation.
        observationTime: power.timestamp,
        clipped,
        details: { powerW: power.value, originalLux, clipped, incidence },
    };
}

function clearSky(altitude) {
    if (altitude <= 0) {
        return 0;
    }
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
    if (clouds.value < 0 || clouds.value > 100) {
        throw new Error('Invalid cloud coverage');
    }
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

// suncalc2 ships with the ioBroker javascript adapter. Use the same geometry for
// both satellite timestamps; followthesun remains the current-altitude authority.
function calculatedAltitude(timestamp) {
    const position = require('suncalc2').getPosition(new Date(timestamp), MODEL.latitude, MODEL.longitude);
    return (numeric(position.altitude) * 180) / Math.PI;
}

function alignSatellite(source, now, currentAltitude) {
    source.rawValue = source.value;
    const observationAltitude = calculatedAltitude(source.timestamp);
    const geometryNow = calculatedAltitude(now);
    if (
        observationAltitude < MODEL.satelliteMinAltitude ||
        geometryNow < MODEL.satelliteMinAltitude ||
        (currentAltitude !== null && currentAltitude < MODEL.satelliteMinAltitude)
    ) {
        source.eligible = false;
        source.status = 'Satellite excluded near horizon; time correction is unstable';
        return;
    }
    const ratio = clearSky(geometryNow) / clearSky(observationAltitude);
    if (ratio < MODEL.satelliteMinRatio || ratio > MODEL.satelliteMaxRatio) {
        source.eligible = false;
        source.status = 'Satellite correction exceeds configured ratio bounds';
        return;
    }
    source.value = radiation(source.rawValue * ratio);
    source.details = {
        ...source.details,
        rawWm2: source.rawValue,
        correctionRatio: ratio,
        observationAltitude,
        currentAltitude: geometryNow,
        correctedWm2: source.value,
    };
    source.status = 'Satellite adjusted to current solar elevation';
}

// A high observation needs two distinct, similar samples only when it is an
// isolated extreme. Re-fetching the same timestamp never confirms a spike.
function filterSpikes(candidates, reasons, now) {
    const sorted = [...candidates].sort((a, b) => b.value - a.value);
    return sorted.filter((source, index) => {
        const previous = evidence.get(source.name);
        const timestamp = source.observationTime ?? source.timestamp;
        const raw = source.rawValue ?? source.value;
        const reference =
            sorted.length > 1
                ? sorted[index === 0 ? 1 : 0].value
                : previous?.confirmed === false
                  ? previous.reference
                  : previous?.raw;
        const suspicious =
            reference !== undefined &&
            source.value > MODEL.spikeRatio * reference &&
            asLux(source.value - reference) > MODEL.spikeGapLux;
        const recent = previous && now - previous.seenAt <= MODEL.spikeConfirmationMinutes * MINUTE;
        const similar = recent && Math.abs(raw - previous.raw) <= Math.max(5, previous.raw * 0.35);
        const confirmed =
            !suspicious ||
            (similar && (timestamp > previous.timestamp || (timestamp === previous.timestamp && previous.confirmed)));
        if (!previous || timestamp !== previous.timestamp) {
            evidence.set(source.name, { timestamp, raw, reference, confirmed, seenAt: now });
        }
        if (!confirmed) {
            reasons[source.name] = 'Isolated high spike; awaiting a second distinct, similar observation';
        }
        return confirmed;
    });
}

function quantile(values, level) {
    const sorted = [...values].sort((a, b) => a - b);
    const index = (sorted.length - 1) * level;
    const lower = Math.floor(index);
    return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
}

function combine(sources, now) {
    const reasons = Object.fromEntries(
        sources
            .filter(source => !source.available || source.eligible === false)
            .map(source => [source.name, source.status]),
    );
    const available = sources.filter(source => source.available && source.eligible !== false);
    let candidates = available.filter(source => source.name !== 'openweather' && !source.clipped);
    if (candidates.length) {
        for (const source of available.filter(source => source.clipped)) {
            reasons[source.name] = 'Inverter clipping; lower-bound estimate';
        }
        if (available.some(source => source.name === 'openweather')) {
            reasons.openweather = 'Cloud heuristic reserved for fallback';
        }
    } else {
        candidates = available.filter(source => source.clipped);
        if (!candidates.length) {
            candidates = available.filter(source => source.name === 'openweather');
        } else if (available.some(source => source.name === 'openweather')) {
            reasons.openweather = 'Cloud heuristic reserved for fallback';
        }
    }
    candidates = filterSpikes(candidates, reasons, now);
    if (!candidates.length) {
        const fallback = available.find(source => source.name === 'openweather');
        if (fallback && !reasons.openweather?.includes('spike')) {
            candidates = filterSpikes([fallback], reasons, now);
            if (candidates.length) {
                delete reasons.openweather;
            }
        }
    }
    if (!candidates.length) {
        return {
            value: null,
            central: null,
            upper: null,
            preference: 0,
            used: [],
            reasons,
            status: 'No usable sources',
        };
    }
    // Continuous weighting avoids winner switches and binary median rejection.
    const weight = candidates.reduce((sum, source) => sum + source.weight, 0);
    const central = candidates.reduce((sum, source) => sum + source.value * source.weight, 0) / weight;
    const upper = quantile(
        candidates.map(source => source.value),
        MODEL.underestimationCost / (1 + MODEL.underestimationCost),
    );
    const highestLux = asLux(Math.max(...candidates.map(source => source.value)));
    const preference = clamp(
        (MODEL.lowLightEndLux - highestLux) / (MODEL.lowLightEndLux - MODEL.lowLightFullLux),
        0,
        1,
    );
    const value = Math.max(central, (1 - preference) * central + preference * upper);
    let status = candidates.length > 1 ? 'Multiple sources' : 'Single source; unverified';
    if (preference > 0 && candidates.length > 1) {
        status += '; low-light upper preference';
    }
    if (candidates[0].clipped) {
        status = 'PV clipping; lower-bound fallback';
    }
    if (candidates[0].name === 'openweather') {
        status = 'Cloud-only fallback; low reliability';
    }
    return { value, central, upper, preference, used: candidates.map(source => source.name), reasons, status };
}

function twilightLux(altitude) {
    if (altitude === null || altitude <= MODEL.twilightEndAltitude || altitude >= MODEL.twilightDayEndAltitude) {
        return 0;
    }
    if (altitude >= 0) {
        return MODEL.twilightHorizonLux * (1 - smoothstep(0, MODEL.twilightDayEndAltitude, altitude));
    }
    return (
        MODEL.twilightHorizonLux *
        Math.exp(altitude / MODEL.twilightDecayDegrees) *
        smoothstep(MODEL.twilightEndAltitude, MODEL.twilightEndAltitude + 2, altitude)
    );
}

function applyTwilight(result, altitude) {
    const floorLux = twilightLux(altitude);
    result.twilight = floorLux;
    if (altitude !== null && altitude <= 0) {
        // Daylight sources (including stale sunset sunlight) cannot supply twilight.
        for (const name of result.used) {
            result.reasons[name] = 'Sun below horizon; using labelled twilight heuristic';
        }
        result.used = [];
        result.central = result.upper = result.value = floorLux / (MODEL.luxPerWm2 * MODEL.luxCalibration);
        result.preference = 0;
        result.status =
            floorLux > 0 ? 'Twilight heuristic; uncalibrated' : 'Modelled night; moon/artificial light excluded';
    } else if (floorLux > 0) {
        result.value = Math.max(result.value ?? 0, floorLux / (MODEL.luxPerWm2 * MODEL.luxCalibration));
        result.status += '; twilight floor (uncalibrated)';
    }
    return result;
}

function smoothDecline(target, now, night, evidenceUntil = now + MODEL.historyMaxAgeMinutes * MINUTE) {
    if (target === null) {
        smoothing = null;
        return null;
    }
    const usable =
        smoothing &&
        now >= smoothing.updatedAt &&
        now - smoothing.updatedAt <= MODEL.historyMaxAgeMinutes * MINUTE &&
        now < smoothing.holdUntil;
    let value = target;
    if (!night && usable && target < smoothing.value) {
        const retention = Math.pow(0.5, (now - smoothing.updatedAt) / (MODEL.declineHalfLifeMinutes * MINUTE));
        value = target + (smoothing.value - target) * retention;
    }
    const holdUntil = Math.min(
        evidenceUntil,
        usable && target < smoothing.value ? smoothing.holdUntil : now + MODEL.historyMaxAgeMinutes * MINUTE,
    );
    smoothing = { value, updatedAt: now, holdUntil };
    return value;
}

async function restoreSmoothing(now) {
    try {
        const state = await getStateAsync(`${MODEL.diagnosticRoot}.smoothing_state`);
        const valid = await getStateAsync(`${MODEL.diagnosticRoot}.valid`);
        if (!state || state.q || valid?.val !== true || valid.q) {
            return;
        }
        const saved = JSON.parse(state.val);
        if (
            saved.version !== 2 ||
            saved.value < 0 ||
            saved.value > MODEL.maxIrradiance ||
            ![saved.value, saved.updatedAt, saved.holdUntil].every(Number.isFinite)
        ) {
            return;
        }
        checkAge(saved.updatedAt, MODEL.historyMaxAgeMinutes, now);
        if (saved.holdUntil > now && saved.holdUntil <= saved.updatedAt + MODEL.historyMaxAgeMinutes * MINUTE) {
            smoothing = saved;
        }
    } catch {
        /* Absent, old or malformed history is deliberately ignored. */
    }
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
        // Preserve existing raw series; expose time-corrected values separately.
        await write(`${root}.irradiance`, Math.round(source.rawValue ?? source.value));
        await write(`${root}.estimated`, luxFrom(source.rawValue ?? source.value));
        await write(
            `${root}.corrected_irradiance`,
            source.eligible === false ? null : Math.round(source.value * 100) / 100,
        );
        await write(`${root}.corrected_estimated`, source.eligible === false ? null : luxFrom(source.value));
        await write(`${root}.timestamp`, source.timestamp);
        await write(`${root}.observation_timestamp`, source.observationTime ?? source.timestamp);
        await write(`${root}.age_minutes`, Math.round(((now - source.timestamp) / MINUTE) * 10) / 10);
        await write(`${root}.details`, JSON.stringify(source.details));
    }
    // Unavailable values remain for inspection; available=false excludes them from use.
    if (!source.available) {
        await write(`${root}.corrected_irradiance`, null);
        await write(`${root}.corrected_estimated`, null);
    }
    await write(`${root}.available`, source.available);
    await write(`${root}.eligible`, source.available && source.eligible !== false && !result.reasons[source.name]);
    await write(`${root}.used`, result.used.includes(source.name));
    await write(`${root}.status`, result.reasons[source.name] || source.status);
}

let busy = false;
async function updateModel() {
    if (busy) {
        return;
    }
    busy = true;
    try {
        const now = Date.now();
        await write(`${MODEL.diagnosticRoot}.valid`, false);
        let altitude = null;
        let sunTimestamp = now;
        try {
            const sun = await readInput(MODEL.altitudeId, MODEL.localMaxAgeMinutes, now);
            altitude = sun.value;
            sunTimestamp = sun.timestamp;
            if (altitude < -90 || altitude > 90) {
                throw new Error('Invalid altitude');
            }
        } catch {
            altitude = null;
        }
        const withSun = collect => {
            if (altitude === null) {
                throw new Error('Sun position missing, invalid or stale');
            }
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
        const satellite = sources.find(source => source.name === 'satellite');
        if (satellite.available) {
            try {
                alignSatellite(satellite, now, altitude);
            } catch (error) {
                satellite.eligible = false;
                satellite.status = `Satellite time correction unavailable: ${error.message}`;
            }
        }
        const result = applyTwilight(combine(sources, now), altitude);
        const target = result.value;
        const expiries = sources
            .filter(source => result.used.includes(source.name))
            .map(source => {
                const maxAge =
                    source.name === 'satellite'
                        ? MODEL.satelliteMaxAgeMinutes
                        : source.name === 'openweather'
                          ? MODEL.weatherMaxAgeMinutes
                          : MODEL.localMaxAgeMinutes;
                return source.timestamp + maxAge * MINUTE;
            });
        if (altitude !== null) {
            expiries.push(sunTimestamp + MODEL.localMaxAgeMinutes * MINUTE);
        }
        const evidenceUntil = Math.min(now + MODEL.historyMaxAgeMinutes * MINUTE, ...expiries);
        result.value = smoothDecline(
            target,
            now,
            altitude !== null && altitude <= MODEL.twilightEndAltitude,
            evidenceUntil,
        );
        if (target !== null && result.value > target + 0.01) {
            result.status += '; gradual decline';
        }
        if (altitude === null) {
            result.status += '; sun position unavailable';
        }
        // Mark invalid during publication; consumers can use valid as the completion flag.
        await write(`${MODEL.diagnosticRoot}.valid`, false);
        for (const source of sources) {
            await publishSource(source, result, now);
        }
        await write(`${MODEL.diagnosticRoot}.sources_used`, JSON.stringify(result.used));
        await write(`${MODEL.diagnosticRoot}.sources_rejected`, JSON.stringify(result.reasons));
        await write(`${MODEL.diagnosticRoot}.source_count`, result.used.length);
        await write(`${MODEL.diagnosticRoot}.status`, result.status);
        for (const [name, value] of Object.entries({
            central_estimated: result.central === null ? null : luxFrom(result.central),
            upper_estimated: result.upper === null ? null : luxFrom(result.upper),
            target_estimated: target === null ? null : luxFrom(target),
            low_light_preference: result.preference,
            twilight_estimated: roundLux(result.twilight),
            sun_altitude: altitude,
        })) {
            await write(`${MODEL.diagnosticRoot}.${name}`, value);
        }
        await write(
            `${MODEL.diagnosticRoot}.smoothing_state`,
            JSON.stringify(smoothing ? { ...smoothing, version: 2 } : null),
        );
        if (result.value !== null) {
            await write(MODEL.irradianceOutputId, Math.round(result.value * 100) / 100);
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
    if (
        !Object.values(MODEL)
            .filter(value => typeof value === 'number')
            .every(Number.isFinite) ||
        MODEL.lowLightEndLux <= MODEL.lowLightFullLux ||
        MODEL.underestimationCost <= 0 ||
        MODEL.luxPerWm2 <= 0 ||
        MODEL.luxCalibration <= 0 ||
        MODEL.declineHalfLifeMinutes <= 0 ||
        MODEL.historyMaxAgeMinutes <= 0 ||
        MODEL.twilightDecayDegrees <= 0 ||
        MODEL.twilightHorizonLux < 0 ||
        MODEL.spikeRatio <= 1 ||
        MODEL.spikeGapLux <= 0 ||
        MODEL.satelliteMinRatio <= 0 ||
        MODEL.satelliteMaxRatio < MODEL.satelliteMinRatio ||
        MODEL.twilightEndAltitude > -2 ||
        MODEL.twilightDayEndAltitude <= 0 ||
        Math.abs(MODEL.latitude) > 90 ||
        Math.abs(MODEL.longitude) > 180
    ) {
        throw new Error('Invalid model configuration');
    }
    await create(MODEL.outputId, 'number', 'lx', 'value.brightness');
    await create(MODEL.irradianceOutputId, 'number', 'W/m²');
    for (const name of SOURCE_NAMES) {
        const root = `${MODEL.sourceRoot}.${name}`;
        for (const [field, type, unit] of [
            ['irradiance', 'number', 'W/m²'],
            ['estimated', 'number', 'lx'],
            ['corrected_irradiance', 'number', 'W/m²'],
            ['corrected_estimated', 'number', 'lx'],
            ['eligible', 'boolean', ''],
            ['timestamp', 'number', 'ms'],
            ['observation_timestamp', 'number', 'ms'],
            ['age_minutes', 'number', 'min'],
            ['available', 'boolean', ''],
            ['used', 'boolean', ''],
            ['status', 'string', ''],
            ['details', 'string', ''],
        ]) {
            await create(`${root}.${field}`, type, unit);
        }
    }
    for (const [field, type] of [
        ['valid', 'boolean'],
        ['status', 'string'],
        ['source_count', 'number'],
        ['sources_used', 'string'],
        ['sources_rejected', 'string'],
        ['last_success', 'number'],
        ['smoothing_state', 'string'],
    ]) {
        await create(`${MODEL.diagnosticRoot}.${field}`, type);
    }
    for (const [field, unit] of [
        ['central_estimated', 'lx'],
        ['upper_estimated', 'lx'],
        ['target_estimated', 'lx'],
        ['twilight_estimated', 'lx'],
        ['low_light_preference', ''],
        ['sun_altitude', '°'],
    ]) {
        await create(`${MODEL.diagnosticRoot}.${field}`, 'number', unit);
    }
    await restoreSmoothing(Date.now());
    // Offset from the original PV script's ten-minute boundary.
    schedule('20 */10 * * * *', updateModel);
    await updateModel();
})().catch(error => log(`Outdoor brightness model failed to start: ${error.message}`, 'error'));
