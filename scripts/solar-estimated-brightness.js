/* global createStateAsync, getStateAsync, setStateAsync, schedule, log */

/**
 * Paste this entire file into a JavaScript script in ioBroker's javascript adapter.
 * Estimates outdoor horizontal illuminance in lux and irradiance in W/m²,
 * immediately and every 10 minutes.
 * No additional libraries are required.
 *
 * Assumptions: Apo_t1 is total AC output in watts; panel rating is 840 Wp;
 * followthesun angles are degrees, azimuth clockwise from north (south = 180).
 *
 * This is a rough brightness proxy, not a lux measurement. Clouds, shadows,
 * panel temperature, dirt and inverter startup affect the result. Twilight and
 * artificial light cannot be inferred from PV output; night is reported as zero.
 * At 600 W clipping, additional sunlight is invisible to the inverter reading:
 * the estimate cannot recover it and will generally underestimate brightness.
 *
 * Model references:
 * https://pvpmc.sandia.gov/modeling-guide/2-dc-module-iv/point-value-models/pvwatts/
 * https://pvpmc.sandia.gov/modeling-guide/1-weather-design-inputs/plane-of-array-poa-irradiance/calculating-poa-irradiance/poa-sky-diffuse/isotropic-sky-diffuse-model/
 */

const CONFIG = {
    outputId: '0_userdata.0.sunlight.solar.estimated',
    irradianceOutputId: '0_userdata.0.sunlight.solar.irradiance_estimated',
    powerId: 'deyeidc.0.4154663299.Apo_t1',
    altitudeId: 'followthesun.0.current.altitude',
    azimuthId: 'followthesun.0.current.azimuth',
    panelPeakW: 840,
    inverterMaxW: 600,
    panelAzimuthDeg: 163,
    panelTiltDeg: 30, // Roof slope measured from horizontal.

    // Adjustable assumptions, not measured properties of this installation.
    performanceRatio: 0.85, // Combined temperature, wiring and inverter losses.
    diffuseFraction: 0.30, // Fraction of horizontal irradiance from diffuse sky.
    groundReflectance: 0.20,
    luxPerWm2: 120, // Approximate daylight conversion; spectrum/weather vary.
    calibrationFactor: 1.0, // Lux only: multiply by measured lux / estimated lux to calibrate.
    maxInputAgeMinutes: 30, // Increase if either adapter publishes less often.
};

const radians = degrees => (degrees * Math.PI) / 180;

async function readNumber(id) {
    const state = await getStateAsync(id);
    const value = state && state.val;
    if (
        !state ||
        (typeof value !== 'number' && typeof value !== 'string') ||
        (typeof value === 'string' && value.trim() === '') ||
        !Number.isFinite(Number(value))
    ) {
        throw new Error(`Missing or non-numeric input: ${id}`);
    }
    if (state.q) {
        throw new Error(`Input has bad quality (${state.q}): ${id}`);
    }
    // Use ts (last update), not lc (last value change): constant values are valid.
    if (!Number.isFinite(state.ts) || Date.now() - state.ts > CONFIG.maxInputAgeMinutes * 60000) {
        throw new Error(`Input is stale: ${id}`);
    }
    return Number(value);
}

function estimateIrradiance(powerW, altitudeDeg, azimuthDeg) {
    if (altitudeDeg <= 0 || powerW <= 0) {
        return 0;
    }

    const altitude = radians(altitudeDeg);
    const tilt = radians(CONFIG.panelTiltDeg);
    const azimuthDifference = radians(azimuthDeg - CONFIG.panelAzimuthDeg);
    const cosIncidence = Math.max(
        0,
        Math.sin(altitude) * Math.cos(tilt) +
            Math.cos(altitude) * Math.sin(tilt) * Math.cos(azimuthDifference),
    );

    // Estimate irradiance on the panels from their STC rating (1000 W/m²).
    // 840 Wp remains the denominator; the 600 W limit is NOT the panel rating.
    const panelIrradiance =
        (Math.min(powerW, CONFIG.inverterMaxW) / (CONFIG.panelPeakW * CONFIG.performanceRatio)) * 1000;

    // Invert a simple direct + isotropic diffuse + ground-reflected model.
    // A 5° floor regularizes the poorly constrained near-horizon correction.
    const beamRatio = cosIncidence / Math.max(Math.sin(altitude), Math.sin(radians(5)));
    const skyView = (1 + Math.cos(tilt)) / 2;
    const groundView = (1 - Math.cos(tilt)) / 2;
    const panelToHorizontalRatio =
        (1 - CONFIG.diffuseFraction) * beamRatio +
        CONFIG.diffuseFraction * skyView +
        CONFIG.groundReflectance * groundView;
    return panelIrradiance / panelToHorizontalRatio;
}

async function updateBrightness() {
    try {
        const altitude = await readNumber(CONFIG.altitudeId);
        if (altitude < -90 || altitude > 90) {
            throw new Error('Sun altitude must be between -90 and 90 degrees');
        }
        let irradiance = 0;
        if (altitude > 0) {
            const [power, azimuth] = await Promise.all([
                readNumber(CONFIG.powerId),
                readNumber(CONFIG.azimuthId),
            ]);
            if (azimuth < 0 || azimuth > 360) {
                throw new Error('Sun azimuth must be between 0 and 360 degrees, north = 0');
            }
            irradiance = estimateIrradiance(power, altitude, azimuth);
        }
        // Derive both outputs from the same unrounded estimate.
        // Round to 100 lux and whole W/m²; these are approximate values.
        const lux = Math.round((irradiance * CONFIG.luxPerWm2 * CONFIG.calibrationFactor) / 100) * 100;
        await setStateAsync(CONFIG.outputId, { val: lux, ack: true });
        await setStateAsync(CONFIG.irradianceOutputId, { val: Math.round(irradiance), ack: true });
    } catch (error) {
        // Preserve the previous value and its timestamp when inputs are unavailable.
        log(`Solar brightness was not updated: ${error.message}`, 'warn');
    }
}

(async () => {
    await createStateAsync(CONFIG.outputId, null, false, {
        name: 'Estimated outdoor brightness from solar production',
        desc: 'Approximate horizontal illuminance; underestimates during inverter clipping',
        type: 'number',
        role: 'value.brightness',
        unit: 'lx',
        min: 0,
        read: true,
        write: false,
    });
    await createStateAsync(CONFIG.irradianceOutputId, null, false, {
        name: 'Estimated horizontal solar irradiance from solar production',
        desc: 'Approximate horizontal irradiance; underestimates during inverter clipping',
        type: 'number',
        role: 'value',
        unit: 'W/m²',
        min: 0,
        read: true,
        write: false,
    });
    schedule('*/10 * * * *', updateBrightness);
    await updateBrightness();
})().catch(error => log(`Solar brightness script failed to start: ${error.message}`, 'error'));
