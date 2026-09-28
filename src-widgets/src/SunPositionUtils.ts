import { clamp, numericStateValue } from './SunlightUtils';

export const sunPositionBindings = {
    sunAzimuthOid: 'followthesun.0.current.azimuth',
    sunElevationOid: 'followthesun.0.current.altitude',
    sunriseOid: 'followthesun.0.short term.today.sunrise_time',
    solarNoonOid: 'followthesun.0.short term.today.solarnoon_time',
    sunsetOid: 'followthesun.0.short term.today.sunset_time',
    noonElevationOid: 'followthesun.0.short term.today.solarnoon_altitude',
    winterSunriseOid: 'followthesun.0.thisYear.start of winter.sunrise_time',
    winterSolarNoonOid: 'followthesun.0.thisYear.start of winter.solarnoon_time',
    winterSunsetOid: 'followthesun.0.thisYear.start of winter.sunset_time',
    winterNoonElevationOid: 'followthesun.0.thisYear.start of winter.solarnoon_altitude',
    summerSunriseOid: 'followthesun.0.thisYear.start of summer.sunrise_time',
    summerSolarNoonOid: 'followthesun.0.thisYear.start of summer.solarnoon_time',
    summerSunsetOid: 'followthesun.0.thisYear.start of summer.sunset_time',
    summerNoonElevationOid: 'followthesun.0.thisYear.start of summer.solarnoon_altitude',
    weatherBrightnessOid: '0_userdata.0.sunlight.overall.estimated',
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

export interface SunChartFrame {
    startMinute: number;
    endMinute: number;
    peak: number;
}

function eventTimestamp(value: unknown): number | undefined {
    const numeric = numericStateValue(value);
    const timestamp = numeric ?? (typeof value === 'string' ? Date.parse(value) : NaN);
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : undefined;
}

function sunDayFromEvents(
    sunrise: unknown,
    noon: unknown,
    sunset: unknown,
    peak: unknown,
): SunDay | undefined {
    const rise = eventTimestamp(sunrise);
    const midday = eventTimestamp(noon);
    const set = eventTimestamp(sunset);
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

/** Only accept today's events: yesterday's retained states must not become today's path. */
export function todayTimestamp(value: unknown, now: number): number | undefined {
    const timestamp = eventTimestamp(value);
    if (timestamp === undefined) return undefined;
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
    if (rise === undefined || midday === undefined || set === undefined) return undefined;
    return sunDayFromEvents(rise, midday, set, peak);
}

/** Parse an adapter day from any date, for example a seasonal solstice. */
export function sunDayForDate(
    sunrise: unknown,
    noon: unknown,
    sunset: unknown,
    peak: unknown,
): SunDay | undefined {
    return sunDayFromEvents(sunrise, noon, sunset, peak);
}

export function sunChartPoint(day: SunDay, time: number, elevation: number): [number, number] {
    return [
        24 + 208 * clamp((time - day.sunrise) / (day.sunset - day.sunrise), 0, 1),
        99 - 53 * clamp(elevation / Math.max(day.peak, 10), 0, 1),
    ];
}

function localMinutes(timestamp: number): number {
    const date = new Date(timestamp);
    return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

/** Shared chart bounds let seasonal paths and today's path be compared on the same scale. */
export function sunChartFrame(days: SunDay[]): SunChartFrame | undefined {
    if (!days.length) return undefined;
    const startMinute = Math.min(...days.map(day => localMinutes(day.sunrise)));
    const endMinute = Math.max(...days.map(day => localMinutes(day.sunset)));
    const peak = Math.max(...days.map(day => day.peak));
    return endMinute > startMinute && peak > 0 ? { startMinute, endMinute, peak } : undefined;
}

export function sunChartFramePoint(
    frame: SunChartFrame,
    time: number,
    elevation: number,
): [number, number] {
    return [
        24 + 208 * clamp((localMinutes(time) - frame.startMinute) / (frame.endMinute - frame.startMinute), 0, 1),
        99 - 53 * clamp(elevation / Math.max(frame.peak, 10), 0, 1),
    ];
}

/** A schematic arc interpolated through the adapter's sunrise, peak and sunset. */
export function sunPath(
    day: SunDay,
    project: (day: SunDay, time: number, elevation: number) => [number, number] = sunChartPoint,
): string {
    return Array.from({ length: 65 }, (_, index) => {
        // Sample each half separately so the measured solar noon is an exact vertex.
        const morning = index <= 32;
        const fraction = morning ? index / 32 : (index - 32) / 32;
        const start = morning ? day.sunrise : day.noon;
        const end = morning ? day.noon : day.sunset;
        const elevation = day.peak * Math.sin(((morning ? fraction : 1 - fraction) * Math.PI) / 2);
        const [x, y] = project(day, start + (end - start) * fraction, elevation);
        return `${index ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
}
