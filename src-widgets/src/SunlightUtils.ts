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

export function normalizeBlindOpenFactor(
    value: unknown,
    min = 0,
    max = 100,
    invert = false,
): number {
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
    const percent = fraction ? cloudiness * 100 : cloudiness;
    return clamp(1 - percent / 100, 0.05, 1);
}

export function weatherSunFactorFromCondition(value: unknown): number | undefined {
    if (typeof value !== 'string' || !value.trim()) {
        return undefined;
    }

    const condition = value.toLocaleLowerCase();
    if (/rain|drizzle|thunder|snow|regen|schauer|gewitter|schnee/.test(condition)) {
        return 0.05;
    }
    if (/overcast|heavy cloud|bedeckt|stark bewölkt|stark bewoelkt/.test(condition)) {
        return 0.15;
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

    return clamp(radiation / clearSkyReference, 0, 1);
}

export function weatherSunFactor(
    directFactor: unknown,
    cloudiness: unknown,
    condition: unknown,
    cloudinessIsFraction = false,
    radiation?: unknown,
    clearSkyReference = 1000,
    source: 'cloudiness' | 'radiation' = 'cloudiness',
): number {
    const directValue = Number(directFactor);
    if (directFactor !== undefined && directFactor !== null && directFactor !== '' && Number.isFinite(directValue)) {
        return clamp(directValue, 0, 1);
    }

    if (source === 'radiation') {
        return weatherSunFactorFromRadiation(radiation, clearSkyReference) ?? 0;
    }

    return weatherSunFactorFromCloudiness(cloudiness, cloudinessIsFraction) ?? weatherSunFactorFromCondition(condition) ?? 0.65;
}

export function calculateSunlightBeam(
    window: SunlightWindow,
    sunAzimuth: number,
    sunElevation: number,
    floorTopAzimuth: number,
    weatherFactor: number,
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
    const blindUnavailable =
        window.blindValue === undefined || window.blindValue === null || window.blindValue === '';
    const blindOpenFactor =
        window.blindStateConfigured && blindUnavailable
            ? 0
            : normalizeBlindOpenFactor(window.blindValue, window.blindMin, window.blindMax, window.blindInvert);
    const strength = clamp(weatherFactor, 0, 1) * windowFacingFactor;
    if (strength <= 0.01) {
        return undefined;
    }
    if (blindOpenFactor <= 0) {
        return undefined;
    }

    const elevationRadians = (clamp(sunElevation, 5, 85) * Math.PI) / 180;
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
    };
}

export function pointsAttribute(points: Array<[number, number]>): string {
    return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}
