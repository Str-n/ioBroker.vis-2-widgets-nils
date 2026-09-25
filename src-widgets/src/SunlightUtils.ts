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
    wallReflection?: {
        point: [number, number];
        fraction: number;
    };
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

export function splitWindowIntoSashes(window: SunlightWindow, sashCount: number, frameGapSvg = 2): SunlightWindow[] {
    const count = Math.round(clamp(sashCount, 1, 3));
    const deltaX = window.endX - window.startX;
    const deltaY = window.endY - window.startY;
    const length = Math.hypot(deltaX, deltaY);
    if (count === 1 || length <= 0) {
        return [window];
    }

    const sashWidth = length / count;
    const gap = Math.min(Math.max(0, frameGapSvg), sashWidth * 0.4);
    return Array.from({ length: count }, (_, index) => {
        const startDistance = (length * index) / count + (index > 0 ? gap / 2 : 0);
        const endDistance = (length * (index + 1)) / count - (index < count - 1 ? gap / 2 : 0);
        return {
            ...window,
            startX: window.startX + (deltaX * startDistance) / length,
            startY: window.startY + (deltaY * startDistance) / length,
            endX: window.startX + (deltaX * endDistance) / length,
            endY: window.startY + (deltaY * endDistance) / length,
        };
    });
}

function crossProduct(aX: number, aY: number, bX: number, bY: number): number {
    return aX * bY - aY * bX;
}

function isPointInPolygon(point: [number, number], polygon: Array<[number, number]>): boolean {
    const [x, y] = point;
    let inside = false;
    for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index++) {
        const [startX, startY] = polygon[previousIndex];
        const [endX, endY] = polygon[index];
        const edgeX = endX - startX;
        const edgeY = endY - startY;
        const pointX = x - startX;
        const pointY = y - startY;
        const cross = crossProduct(edgeX, edgeY, pointX, pointY);
        if (
            Math.abs(cross) < 0.001 &&
            x >= Math.min(startX, endX) - 0.001 &&
            x <= Math.max(startX, endX) + 0.001 &&
            y >= Math.min(startY, endY) - 0.001 &&
            y <= Math.max(startY, endY) + 0.001
        ) {
            return true;
        }

        if ((startY > y) !== (endY > y) && x < ((endX - startX) * (y - startY)) / (endY - startY) + startX) {
            inside = !inside;
        }
    }
    return inside;
}

/** Infer a window's outward bearing from the nearby, parallel edge of its room polygon. */
export function inferWindowAzimuthFromRoomBoundary(
    centerX: number,
    centerY: number,
    widthX: number,
    widthY: number,
    polygon: Array<[number, number]>,
    floorTopAzimuth: number,
): number | undefined {
    const windowLength = Math.hypot(widthX, widthY);
    if (
        polygon.length < 3 ||
        ![centerX, centerY, widthX, widthY, floorTopAzimuth, windowLength].every(Number.isFinite) ||
        windowLength <= 0
    ) {
        return undefined;
    }

    let doubleArea = 0;
    for (let index = 0; index < polygon.length; index++) {
        const [x1, y1] = polygon[index];
        const [x2, y2] = polygon[(index + 1) % polygon.length];
        doubleArea += x1 * y2 - x2 * y1;
    }
    if (Math.abs(doubleArea) < 0.001) {
        return undefined;
    }

    const tangentX = widthX / windowLength;
    const tangentY = widthY / windowLength;
    let bestScore = Infinity;
    let outward: [number, number] | undefined;
    for (let index = 0; index < polygon.length; index++) {
        const [startX, startY] = polygon[index];
        const [endX, endY] = polygon[(index + 1) % polygon.length];
        const edgeX = endX - startX;
        const edgeY = endY - startY;
        const edgeLength = Math.hypot(edgeX, edgeY);
        if (edgeLength <= 0) {
            continue;
        }

        const edgeUnitX = edgeX / edgeLength;
        const edgeUnitY = edgeY / edgeLength;
        const alignment = Math.abs(tangentX * edgeUnitX + tangentY * edgeUnitY);
        if (alignment < 0.85) {
            continue;
        }

        const offsetX = centerX - startX;
        const offsetY = centerY - startY;
        const projection = offsetX * edgeUnitX + offsetY * edgeUnitY;
        if (projection < -windowLength / 2 || projection > edgeLength + windowLength / 2) {
            continue;
        }
        const perpendicularDistance = Math.abs(offsetX * edgeUnitY - offsetY * edgeUnitX);
        const score = perpendicularDistance + (1 - alignment) * windowLength * 2;
        if (score < bestScore) {
            bestScore = score;
            // Positive signed area means the polygon is clockwise in SVG coordinates.
            outward = doubleArea > 0 ? [edgeUnitY, -edgeUnitX] : [-edgeUnitY, edgeUnitX];
        }
    }

    if (!outward || bestScore > Math.max(5, windowLength * 0.08)) {
        return undefined;
    }

    const relativeBearing = (Math.atan2(outward[0], -outward[1]) * 180) / Math.PI;
    return ((floorTopAzimuth + relativeBearing) % 360 + 360) % 360;
}

function firstRoomBoundaryHit(
    start: [number, number],
    end: [number, number],
    polygon: Array<[number, number]>,
): { point: [number, number]; distanceFraction: number } | undefined {
    const directionX = end[0] - start[0];
    const directionY = end[1] - start[1];
    let closestFraction = Infinity;

    for (let index = 0; index < polygon.length; index++) {
        const edgeStart = polygon[index];
        const edgeEnd = polygon[(index + 1) % polygon.length];
        const edgeX = edgeEnd[0] - edgeStart[0];
        const edgeY = edgeEnd[1] - edgeStart[1];
        const denominator = crossProduct(directionX, directionY, edgeX, edgeY);
        if (Math.abs(denominator) < 0.000001) {
            continue;
        }

        const offsetX = edgeStart[0] - start[0];
        const offsetY = edgeStart[1] - start[1];
        const rayFraction = crossProduct(offsetX, offsetY, edgeX, edgeY) / denominator;
        const edgeFraction = crossProduct(offsetX, offsetY, directionX, directionY) / denominator;
        if (
            rayFraction > 0.0001 &&
            rayFraction <= 1 &&
            edgeFraction >= -0.0001 &&
            edgeFraction <= 1.0001 &&
            rayFraction < closestFraction
        ) {
            closestFraction = rayFraction;
        }
    }

    if (!Number.isFinite(closestFraction)) {
        return undefined;
    }
    return {
        point: [start[0] + directionX * closestFraction, start[1] + directionY * closestFraction],
        distanceFraction: closestFraction,
    };
}

function estimateWallReflection(
    window: SunlightWindow,
    points: Array<[number, number]>,
    nearDistance: number,
    farDistance: number,
): SunlightBeam['wallReflection'] {
    const raySamples = 9;
    let validRays = 0;
    let reflectedFractionTotal = 0;
    let weightedHitX = 0;
    let weightedHitY = 0;
    const roomPolygon = window.roomPolygon;

    for (let index = 0; index < raySamples; index++) {
        const across = (index + 0.5) / raySamples;
        const start: [number, number] = [
            window.startX + (window.endX - window.startX) * across,
            window.startY + (window.endY - window.startY) * across,
        ];
        const end: [number, number] = [
            points[3][0] + (points[2][0] - points[3][0]) * across,
            points[3][1] + (points[2][1] - points[3][1]) * across,
        ];
        if (!isPointInPolygon(start, roomPolygon)) {
            continue;
        }
        validRays++;

        const hit = firstRoomBoundaryHit(start, end, roomPolygon);
        if (!hit) {
            continue;
        }

        // Measure reflection against the floor projection, while tracing from the window itself.
        // At low sun angles the lower ray can reach the wall before it reaches the floor.
        const distanceToHit = hit.distanceFraction * farDistance;
        const reflectedFraction = clamp(
            (farDistance - Math.max(nearDistance, distanceToHit)) / (farDistance - nearDistance),
            0,
            1,
        );
        if (reflectedFraction <= 0) {
            continue;
        }
        reflectedFractionTotal += reflectedFraction;
        weightedHitX += hit.point[0] * reflectedFraction;
        weightedHitY += hit.point[1] * reflectedFraction;
    }

    const fraction = validRays ? reflectedFractionTotal / validRays : 0;
    if (fraction < 0.015 || reflectedFractionTotal <= 0) {
        return undefined;
    }
    return {
        point: [weightedHitX / reflectedFractionTotal, weightedHitY / reflectedFractionTotal],
        fraction: clamp(fraction, 0, 1),
    };
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

    const points: Array<[number, number]> = [
        [window.startX + nearDx, window.startY + nearDy],
        [window.endX + nearDx, window.endY + nearDy],
        [window.endX + farDx, window.endY + farDy],
        [window.startX + farDx, window.startY + farDy],
    ];

    return {
        points,
        clipPoints: window.roomPolygon,
        strength,
        softness: 13 + (1 - clamp(skyClarity, 0, 1)) * 9,
        wallReflection: estimateWallReflection(window, points, nearDistance, farDistance),
    };
}

export function pointsAttribute(points: Array<[number, number]>): string {
    return points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}
