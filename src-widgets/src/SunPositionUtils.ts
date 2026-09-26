import { clamp, numericStateValue } from './SunlightUtils';

export const sunPositionBindings = {
    sunAzimuthOid: 'followthesun.0.current.azimuth',
    sunElevationOid: 'followthesun.0.current.altitude',
    sunriseOid: 'followthesun.0.short term.today.sunrise_time',
    solarNoonOid: 'followthesun.0.short term.today.solarnoon_time',
    sunsetOid: 'followthesun.0.short term.today.sunset_time',
    noonElevationOid: 'followthesun.0.short term.today.solarnoon_altitude',
    weatherRadiationOid: '0_userdata.0.sunlight.neuwied.globalRadiationAvgWm2',
    weatherCloudinessOid: 'openweathermap.0.forecast.current.clouds',
    weatherConditionOid: 'openweathermap.0.forecast.current.state',
    weatherSunFactorOid: '',
};

export interface SunDay {
    sunrise: number;
    noon: number;
    sunset: number;
    peak: number;
}

/** Only accept today's events: yesterday's retained states must not become today's path. */
export function todayTimestamp(value: unknown, now: number): number | undefined {
    const numeric = numericStateValue(value);
    const timestamp = numeric ?? (typeof value === 'string' ? Date.parse(value) : NaN);
    if (!Number.isFinite(timestamp) || timestamp <= 0) {
        return undefined;
    }
    return new Date(timestamp).toDateString() === new Date(now).toDateString() ? timestamp : undefined;
}

export function sunDay(
    sunrise: unknown,
    noon: unknown,
    sunset: unknown,
    peak: unknown,
    now: number,
): SunDay | undefined {
    const rise = todayTimestamp(sunrise, now);
    const midday = todayTimestamp(noon, now);
    const set = todayTimestamp(sunset, now);
    const elevation = numericStateValue(peak);
    if (
        rise === undefined ||
        midday === undefined ||
        set === undefined ||
        elevation === undefined ||
        elevation <= 0 ||
        elevation > 90 ||
        !(rise < midday && midday < set)
    ) {
        return undefined;
    }
    return { sunrise: rise, noon: midday, sunset: set, peak: elevation };
}

export function sunChartPoint(day: SunDay, time: number, elevation: number): [number, number] {
    return [
        24 + 208 * clamp((time - day.sunrise) / (day.sunset - day.sunrise), 0, 1),
        99 - 53 * clamp(elevation / Math.max(day.peak, 10), 0, 1),
    ];
}

/** A schematic arc interpolated through the adapter's sunrise, peak and sunset. */
export function sunPath(day: SunDay): string {
    return Array.from({ length: 65 }, (_, index) => {
        // Sample each half separately so the measured solar noon is an exact vertex.
        const morning = index <= 32;
        const fraction = morning ? index / 32 : (index - 32) / 32;
        const start = morning ? day.sunrise : day.noon;
        const end = morning ? day.noon : day.sunset;
        const elevation = day.peak * Math.sin(((morning ? fraction : 1 - fraction) * Math.PI) / 2);
        const [x, y] = sunChartPoint(day, start + (end - start) * fraction, elevation);
        return `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
}
