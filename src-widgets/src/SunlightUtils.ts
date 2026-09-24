export interface SunlightWindow {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    azimuth: number;
    roomPolygon: Array<[number, number]>;
    blindValue?: unknown;
    blindStateConfigured: boolean;
    blindMin: number;
    blindMax: number;
    blindInvert: boolean;
    windowHeightMeters: number;
    windowSillHeightMeters: number;
    roomHeightMeters: number;
}

export interface SunlightBeam {
    points: Array<[number, number]>;
    clipPoints: Array<[number, number]>;
    strength: number;
    softness: number;
}

export interface SunlightFactors {
    /** Total available outdoor light, normalized from 0 to 1. */
    total: number;
    /** Directional sunlight that can form a floor patch. */
    direct: number;
    /** Broad, non-directional daylight for room ambience. */
    diffuse: number;
    /** Clear-sky fraction from 0 (overcast) to 1 (clear). */
    skyClarity: number;
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function parseRoomPolygon(value: unknown): Array<[number, number]> {
    if (typeof value !== 'string') {
        return [];
    }

    const points = value
        .trim()
        .split(/\s+/)
        .map(point => point.split(',').map(Number))
        .filter(point => point.length === 2 && point.every(Number.isFinite))
        .map(point => [point[0], point[1]] as [number, number]);

    return points.length >= 3 ? points : [];
}

export function smallestAngularDifference(a: number, b: number): number {
    return ((a - b + 540) % 360) - 180;
}

export function normalizeBlindOpenFactor(value: unknown, min = 0, max = 100, invert = false): number {
    const numericValue = Number(value);
    if (value === undefined || value === null || value === '' || !Number.isFinite(numericValue) || max <= min) {
        return 1;
    }

    const percentage = (100 * (clamp(numericValue, min, max) - min)) / (max - min);
    return (invert ? 100 - percentage : percentage) / 100;
}

export function weatherSunFactorFromCloudiness(value: unknown, fraction = false): number | undefined {
    const numericValue = Number(value);
    if (value === undefined || value === null || value === '' || !Number.isFinite(numericValue)) {
        return undefined;
    }

    const cloudiness = clamp(numericValue, 0, fraction ? 1 : 100);
    return 1 - (fraction ? cloudiness : cloudiness / 100);
}

export function weatherSunFactorFromCondition(value: unknown): number | undefined {
    if (typeof value !== 'string' || !value.trim()) {
        return undefined;
    }

    const condition = value.toLocaleLowerCase();
    if (/thunder|heavy rain|snowstorm|gewitter|starkregen|schneesturm/.test(condition)) {
        return 0.03;
    }
    if (/rain|drizzle|snow|regen|schauer|schnee/.test(condition)) {
        return 0.08;
    }
    if (/overcast|heavy cloud|bedeckt|stark bewölkt|stark bewoelkt/.test(condition)) {
        return 0.12;
    }
    if (/haze|mist|fog|nebel|dunst/.test(condition)) {
        return 0.32;
    }
    if (/partly|scattered cloud|broken cloud|heiter|teilweise bewölkt|wolkig/.test(condition)) {
        return 0.5;
    }
    if (/few cloud|light cloud|leicht bewölkt|leicht bewoelkt/.test(condition)) {
        return 0.75;
    }
    if (/clear|sunny|sunshine|klar|sonnig/.test(condition)) {
        return 1;
    }
    return undefined;
}

export function weatherSunFactorFromRadiation(value: unknown, clearSkyReference = 1000): number | undefined {
    const radiation = Number(value);
    if (
        value === undefined ||
        value === null ||
        value === '' ||
        !Number.isFinite(radiation) ||
        !Number.isFinite(clearSkyReference) ||
        clearSkyReference <= 0
    ) {
        return undefined;
    }

    // A small sensor/noise floor prevents a visible daytime wash when the sensor reads only a few W/m².
    return clamp((radiation - 8) / (clearSkyReference - 8), 0, 1);
}

function availableSkyClarity(cloudiness: unknown, condition: unknown, cloudinessIsFraction: boolean): number {
    const measuredCloudiness = weatherSunFactorFromCloudiness(cloudiness, cloudinessIsFraction);
    if (measuredCloudiness !== undefined) {
        return measuredCloudiness;
    }

    return weatherSunFactorFromCondition(condition) ?? 0.65;
}

export function calculateSunlightFactors(
    directFactor: unknown,
    cloudiness: unknown,
    condition: unknown,
    cloudinessIsFraction: boolean,
    radiation: unknown,
    clearSkyReference: number,
    source: 'cloudiness' | 'radiation',
): SunlightFactors {
    const clarity = availableSkyClarity(cloudiness, condition, cloudinessIsFraction);
    const radiationFactor = weatherSunFactorFromRadiation(radiation, clearSkyReference);

    const normalizedDirect = Number(directFactor);
    const hasDirectFactor =
        directFactor !== undefined && directFactor !== null && directFactor !== '' && Number.isFinite(normalizedDirect);
    const hasWeatherObservation =
        weatherSunFactorFromCloudiness(cloudiness, cloudinessIsFraction) !== undefined ||
        weatherSunFactorFromCondition(condition) !== undefined;
    if (radiationFactor === undefined && !hasDirectFactor && !hasWeatherObservation) {
        return { total: 0, direct: 0, diffuse: 0, skyClarity: clarity };
    }

    // Measured W/m² wins when selected and available. Weather is the fallback when that sensor is not reporting.
    const usesMeasuredRadiation = source === 'radiation' && radiationFactor !== undefined;
    const total = usesMeasuredRadiation
        ? radiationFactor
        : hasDirectFactor
          ? clamp(normalizedDirect, 0, 1)
          : 0.28 + 0.72 * clarity;
    const direct = usesMeasuredRadiation
        ? total * clarity
        : hasDirectFactor
          ? clamp(normalizedDirect, 0, 1)
          : total * clarity;

    return {
        total,
        direct,
        diffuse: Math.max(0, total - direct * 0.78),
        skyClarity: clarity,
    };
}

function rgbToHex(red: number, green: number, blue: number): string {
    return `#${[red, green, blue]
        .map(value => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0'))
        .join('')}`;
}

export function sunlightColor(sunElevation: number): string {
    // Low sun is amber; the color moves continuously toward neutral daylight as the sun rises.
    const warmth = clamp(1 - Math.max(0, sunElevation) / 55, 0, 1);
    return rgbToHex(255, 244 - 145 * warmth, 220 - 290 * warmth);
}

export function normalizeBlindOpenFactorForWindow(window: SunlightWindow): number {
    const blindUnavailable =
        window.blindValue === undefined || window.blindValue === null || window.blindValue === '';
    if (window.blindStateConfigured && blindUnavailable) {
        return 0;
    }
    return normalizeBlindOpenFactor(window.blindValue, window.blindMin, window.blindMax, window.blindInvert);
}

export function calculateSunlightBeam(
    window: SunlightWindow,
    sunAzimuth: number,
    sunElevation: number,
    floorTopAzimuth: number,
    directFactor: number,
    skyClarity: number,
    svgUnitsPerMeter: number,
    maximumProjection: number,
): SunlightBeam | undefined {
    if (
        sunElevation <= 0 ||
        ![sunAzimuth, sunElevation, floorTopAzimuth, window.azimuth].every(Number.isFinite) ||
        window.roomPolygon.length < 3 ||
        ![svgUnitsPerMeter, window.windowHeightMeters, window.windowSillHeightMeters, window.roomHeightMeters].every(
            Number.isFinite,
        ) ||
        svgUnitsPerMeter <= 0 ||
        window.windowHeightMeters <= 0 ||
        window.roomHeightMeters <= 0
    ) {
        return undefined;
    }

    const angleDifference = smallestAngularDifference(window.azimuth, sunAzimuth);
    const windowFacingFactor = Math.max(0, Math.cos((angleDifference * Math.PI) / 180));
    const blindOpenFactor = normalizeBlindOpenFactorForWindow(window);
    const strength = clamp(directFactor, 0, 1) * windowFacingFactor;
    if (strength <= 0.01 || blindOpenFactor <= 0) {
        return undefined;
    }

    // The blind covers from the top down. The remaining lower strip of glass is the aperture
    // through which rays enter, so its sill and exposed top determine the floor patch limits.
    const elevationRadians = (clamp(sunElevation, 1, 85) * Math.PI) / 180;
    const openBottom = clamp(window.windowSillHeightMeters, 0, window.roomHeightMeters);
    const openTop = clamp(
        window.windowSillHeightMeters + window.windowHeightMeters * blindOpenFactor,
        openBottom,
        window.roomHeightMeters,
    );
    if (openTop <= openBottom) {
        return undefined;
    }

    const projectionPerMeter = svgUnitsPerMeter / Math.tan(elevationRadians);
    const nearDistance = clamp(openBottom * projectionPerMeter, 0, maximumProjection);
    const farDistance = clamp(openTop * projectionPerMeter, 0, maximumProjection);
    if (farDistance <= nearDistance) {
        return undefined;
    }

    const screenRelativeAzimuth = ((sunAzimuth - floorTopAzimuth) * Math.PI) / 180;
    // Bearings are clockwise from north. In SVG coordinates, x points right and y points down.
    // The indoor ray points away from the sun's horizontal bearing.
    const rayX = -Math.sin(screenRelativeAzimuth);
    const rayY = Math.cos(screenRelativeAzimuth);
    const nearDx = rayX * nearDistance;
    const nearDy = rayY * nearDistance;
    const farDx = rayX * farDistance;
    const farDy = rayY * farDistance;

    return {
        points: [
            [window.startX + nearDx, window.startY + nearDy],
            [window.endX + nearDx, window.endY + nearDy],
            [window.endX + farDx, window.endY + farDy],
            [window.startX + farDx, window.startY + farDy],
        ],
        clipPoints: window.roomPolygon,
        strength,
        softness: 0.35 + (1 - clamp(skyClarity, 0, 1)) * 5,
    };
}

export function pointsAttribute(points: Array<[number, number]>): string {
    return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}
