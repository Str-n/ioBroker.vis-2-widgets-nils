export type FloorplanPoint = [number, number];

export interface FloorplanRoomGeometry {
    points: FloorplanPoint[];
}

export interface FloorplanWindowGeometry {
    centerX: number;
    centerY: number;
    widthX: number;
    widthY: number;
    roomIndex: number;
    windowHeightMeters: number;
    windowSillHeightMeters: number;
    windowSashCount: number;
    blindOid: string;
    blindMin: number;
    blindMax: number;
    blindInvert: boolean;
}

export interface FloorplanLightBubbleGeometry {
    x: number;
    y: number;
    roomIndex: number;
    statusOid: string;
    brightnessLumens: number;
}

export interface FloorplanGeometry {
    rooms: FloorplanRoomGeometry[];
    windows: FloorplanWindowGeometry[];
    lightBubbles: FloorplanLightBubbleGeometry[];
}

export type FloorplanGeometries = Record<string, FloorplanGeometry>;

export const emptyFloorplanGeometry: FloorplanGeometry = { rooms: [], windows: [], lightBubbles: [] };

function finiteNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePoints(value: unknown): FloorplanPoint[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter(
            (point): point is [unknown, unknown] =>
                Array.isArray(point) && point.length === 2 && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])),
        )
        .map(point => [Number(point[0]), Number(point[1])] as FloorplanPoint);
}

function parseFloorGeometry(value: unknown): FloorplanGeometry {
    if (!value || typeof value !== 'object') {
        return { rooms: [], windows: [], lightBubbles: [] };
    }

    const source = value as Record<string, unknown>;
    const rooms = Array.isArray(source.rooms)
        ? source.rooms
              .map(room => ({
                  points: parsePoints(room && typeof room === 'object' ? (room as Record<string, unknown>).points : undefined),
              }))
              .filter(room => room.points.length >= 3)
        : [];
    const windows = Array.isArray(source.windows)
        ? source.windows
              .map(window => {
                  const value = window && typeof window === 'object' ? (window as Record<string, unknown>) : {};
                  return {
                      centerX: finiteNumber(value.centerX, 0),
                      centerY: finiteNumber(value.centerY, 0),
                      widthX: finiteNumber(value.widthX, 0),
                      widthY: finiteNumber(value.widthY, 0),
                      roomIndex: Math.max(1, Math.round(finiteNumber(value.roomIndex, 1))),
                      windowHeightMeters: Math.max(0.1, finiteNumber(value.windowHeightMeters, 1.35)),
                      windowSillHeightMeters: Math.max(0, finiteNumber(value.windowSillHeightMeters, 0.9)),
                      windowSashCount: Math.max(1, Math.min(3, Math.round(finiteNumber(value.windowSashCount, 1)))),
                      blindOid: typeof value.blindOid === 'string' ? value.blindOid : '',
                      blindMin: finiteNumber(value.blindMin, 0),
                      blindMax: finiteNumber(value.blindMax, 100),
                      blindInvert: value.blindInvert === true || value.blindInvert === 'true',
                  };
              })
        : [];
    const lightBubbles = Array.isArray(source.lightBubbles)
        ? source.lightBubbles
              .map(light => {
                  const value = light && typeof light === 'object' ? (light as Record<string, unknown>) : {};
                  return {
                      x: finiteNumber(value.x, 0),
                      y: finiteNumber(value.y, 0),
                      roomIndex: Math.max(1, Math.round(finiteNumber(value.roomIndex, 1))),
                      statusOid: typeof value.statusOid === 'string' ? value.statusOid : '',
                      brightnessLumens: Math.max(100, Math.min(5000, finiteNumber(value.brightnessLumens, 800))),
                  };
              })
        : [];

    return { rooms, windows, lightBubbles };
}

export function parseFloorplanGeometries(value: unknown): FloorplanGeometries {
    let parsed: unknown = value;
    if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value);
        } catch {
            return {};
        }
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([floor, geometry]) => [floor, parseFloorGeometry(geometry)]),
    );
}
