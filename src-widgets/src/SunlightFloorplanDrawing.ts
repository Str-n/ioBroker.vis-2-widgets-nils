import {
    isValidRoomPolygon,
    normalizeBlindOpenFactorForWindow,
    numericStateValue,
    pointsAttribute,
} from './SunlightUtils';
import type { FloorplanPoint, FloorplanWindowGeometry } from './SunlightFloorplanConfig';

export interface FloorplanWall {
    kind: 'outer' | 'inner';
    points: FloorplanPoint[];
    closed: boolean;
}

export interface FloorplanDrawing {
    version: 1;
    viewBox: [number, number, number, number];
    walls: FloorplanWall[];
}

export interface FloorplanDefinition {
    label: string;
    svg?: string;
    drawing?: FloorplanDrawing;
    /** Legacy variants share the original floor's room and device configuration. */
    configurationKey?: string;
}

export function isValidWall(wall: FloorplanWall): boolean {
    return (
        (wall.kind === 'outer' || wall.kind === 'inner') &&
        typeof wall.closed === 'boolean' &&
        wall.points.length >= 2 &&
        wall.points.length <= 64 &&
        wall.points.every(
            point =>
                Array.isArray(point) &&
                point.length === 2 &&
                point.every(value => typeof value === 'number' && Number.isFinite(value)),
        ) &&
        wall.points.every(
            (point, index) =>
                index === 0 ||
                Math.hypot(point[0] - wall.points[index - 1][0], point[1] - wall.points[index - 1][1]) > 0.01,
        ) &&
        (!wall.closed || isValidRoomPolygon(wall.points))
    );
}

/** Reject malformed drawings as a whole; never silently discard a building's walls. */
export function parseFloorplanDrawing(value: unknown): FloorplanDrawing | undefined {
    if (!value || typeof value !== 'object') {
        return undefined;
    }
    const drawing = value as FloorplanDrawing;
    if (
        drawing.version !== 1 ||
        !Array.isArray(drawing.viewBox) ||
        drawing.viewBox.length !== 4 ||
        !drawing.viewBox.every(value => typeof value === 'number' && Number.isFinite(value)) ||
        drawing.viewBox[2] <= 0 ||
        drawing.viewBox[3] <= 0 ||
        !Array.isArray(drawing.walls) ||
        drawing.walls.length > 256 ||
        drawing.walls.some(wall => !wall || !Array.isArray(wall.points) || !isValidWall(wall))
    ) {
        return undefined;
    }
    return {
        version: 1,
        viewBox: [...drawing.viewBox],
        walls: drawing.walls.map(wall => ({
            kind: wall.kind,
            closed: wall.closed,
            points: wall.points.map(point => [...point]),
        })),
    };
}

export function wallPath(wall: FloorplanWall): string {
    return `M${wall.points.map(point => point.join(',')).join('L')}${wall.closed ? 'Z' : ''}`;
}

interface WallSegment {
    start: FloorplanPoint;
    end: FloorplanPoint;
    kind: FloorplanWall['kind'];
}

export interface WindowOpening extends WallSegment {
    window: FloorplanWindowGeometry;
    index: number;
    wallIndex: number;
    edgeIndex: number;
}

/** Split wall segments at window coordinates without changing saved geometry. */
export function floorplanWallSegments(
    drawing: FloorplanDrawing,
    windows: FloorplanWindowGeometry[],
): {
    segments: WallSegment[];
    openings: WindowOpening[];
} {
    const segments: WallSegment[] = [];
    const openings: WindowOpening[] = [];
    const assigned = new Set<number>();
    for (const [wallIndex, wall] of drawing.walls.entries()) {
        const count = wall.points.length - (wall.closed ? 0 : 1);
        for (let i = 0; i < count; i++) {
            const start = wall.points[i];
            const end = wall.points[(i + 1) % wall.points.length];
            const dx = end[0] - start[0];
            const dy = end[1] - start[1];
            const length = Math.hypot(dx, dy);
            if (length < 0.01) {
                continue;
            }
            const at = (distance: number): FloorplanPoint => [
                start[0] + (dx * distance) / length,
                start[1] + (dy * distance) / length,
            ];
            const cuts = windows
                .flatMap((window, index) => {
                    if (assigned.has(index) || Math.hypot(window.widthX, window.widthY) < 1) {
                        return [];
                    }
                    const endpoints: FloorplanPoint[] = [
                        [window.centerX - window.widthX / 2, window.centerY - window.widthY / 2],
                        [window.centerX + window.widthX / 2, window.centerY + window.widthY / 2],
                    ];
                    const distances = endpoints
                        .map(p => ((p[0] - start[0]) * dx + (p[1] - start[1]) * dy) / length)
                        .sort((a, b) => a - b);
                    const tolerance = 5;
                    if (
                        endpoints.some(
                            p => Math.abs((p[0] - start[0]) * dy - (p[1] - start[1]) * dx) / length > tolerance,
                        ) ||
                        distances[0] < -tolerance ||
                        distances[1] > length + tolerance
                    ) {
                        return [];
                    }
                    return [{ from: Math.max(0, distances[0]), to: Math.min(length, distances[1]), window, index }];
                })
                .sort((a, b) => a.from - b.from);
            let cursor = 0;
            for (const cut of cuts) {
                if (cut.to <= cursor || cut.from < cursor - 0.01) {
                    continue;
                }
                if (cut.from > cursor) {
                    segments.push({ start: at(cursor), end: at(cut.from), kind: wall.kind });
                }
                openings.push({
                    start: at(cut.from),
                    end: at(cut.to),
                    kind: wall.kind,
                    window: cut.window,
                    index: cut.index,
                    wallIndex,
                    edgeIndex: i,
                });
                assigned.add(cut.index);
                cursor = cut.to;
            }
            if (cursor < length) {
                segments.push({ start: at(cursor), end, kind: wall.kind });
            }
        }
    }
    return { segments, openings };
}

/** Render flat window symbols in the wall openings. */
function renderFlatWindow(
    { start, end, kind, window, index }: WindowOpening,
    stateValue: (oid: string) => unknown,
): string {
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const angle = (Math.atan2(end[1] - start[1], end[0] - start[0]) * 180) / Math.PI;
    const halfWall = kind === 'outer' ? 1.25 : 0.75;
    const inset = Math.min(3, length * 0.08);
    const paneTop = -Math.max(0.15, halfWall - 0.2);
    const paneBottom = -paneTop;
    const paneDepth = paneBottom - paneTop;
    const paneStart = inset;
    const paneEnd = length - inset;
    const paneLength = Math.max(0, paneEnd - paneStart);
    const opening = pointsAttribute([
        [0, -halfWall],
        [length, -halfWall],
        [length, halfWall],
        [0, halfWall],
    ]);
    const pane = pointsAttribute([
        [paneStart, paneTop],
        [paneEnd, paneTop],
        [paneEnd, paneBottom],
        [paneStart, paneBottom],
    ]);
    const paneEdges = `M${paneStart},${paneTop}L${paneEnd},${paneTop}L${paneEnd},${paneBottom}L${paneStart},${paneBottom}Z`;
    const revealEdges = `M0,${-halfWall}L0,${halfWall}M${length},${-halfWall}L${length},${halfWall}M0,${-halfWall}L${length},${-halfWall}M0,${halfWall}L${length},${halfWall}`;
    const oid = window.blindOid.trim();
    const configured = Boolean(oid && oid !== 'nothing_selected');
    const value = stateValue(oid);
    const known = configured && numericStateValue(value) !== undefined && window.blindMax > window.blindMin;
    const open = normalizeBlindOpenFactorForWindow({
        blindValue: value,
        blindStateConfigured: configured,
        blindMin: window.blindMin,
        blindMax: window.blindMax,
        blindInvert: window.blindInvert,
    });
    const closedDepth = paneDepth * (1 - open);
    const blind =
        known && closedDepth > 0
            ? `<polygon class="sh-floorplan-blind" points="${pointsAttribute([
                  [paneStart, paneTop],
                  [paneEnd, paneTop],
                  [paneEnd, paneTop + closedDepth],
                  [paneStart, paneTop + closedDepth],
              ])}" />${Array.from(
                  { length: Math.floor(closedDepth / 1.2) },
                  (_, i) =>
                      `<path class="sh-floorplan-blind-slat" d="M${paneStart},${paneTop + (i + 1) * 1.2}L${paneEnd},${paneTop + (i + 1) * 1.2}" />`,
              ).join('')}`
            : '';
    const sashes = Array.from({ length: window.windowSashCount - 1 }, (_, i) => {
        const x = paneStart + (paneLength * (i + 1)) / window.windowSashCount;
        return `<path class="sh-floorplan-window-mullion" d="M${x},${paneTop}L${x},${paneBottom}" />`;
    }).join('');
    return `<g class="sh-floorplan-window" data-window="${index}" data-blind-open="${known ? open : configured ? 'unknown' : 'unbound'}" transform="translate(${start.join(' ')}) rotate(${angle})"><polygon class="sh-floorplan-window-well" points="${opening}" /><path class="sh-floorplan-window-reveal" d="${revealEdges}" /><polygon class="sh-floorplan-window-glass" points="${pane}" />${blind}<path class="sh-floorplan-window-frame${configured && !known ? ' sh-floorplan-window-frame--unknown' : ''}" d="${paneEdges}" />${sashes}<path class="sh-floorplan-window-glint" d="M${paneStart + 1},${paneTop + 0.5}L${paneStart + Math.max(1, paneLength * 0.28)},${paneTop + 0.5}" /></g>`;
}

/** All generated markup comes from validated numeric geometry and fixed class names. */
export function renderFloorplanDrawing(
    drawing: FloorplanDrawing,
    windows: FloorplanWindowGeometry[] = [],
    stateValue: (oid: string) => unknown = () => undefined,
): string {
    const fills = drawing.walls
        .filter(wall => wall.kind === 'outer' && wall.closed)
        .map(wall => `<path class="sh-floorplan-fill" d="${wallPath(wall)}" />`)
        .join('');
    let openings: WindowOpening[] = [];
    let segments: WallSegment[] = [];
    if (windows.length) {
        ({ segments, openings } = floorplanWallSegments(drawing, windows));
    } else {
        segments = drawing.walls.flatMap(wall => {
            const count = wall.points.length - (wall.closed ? 0 : 1);
            return Array.from({ length: count }, (_, i) => ({
                start: wall.points[i],
                end: wall.points[(i + 1) % wall.points.length],
                kind: wall.kind,
            }));
        });
    }
    // End wall strokes at real openings.
    const walls = segments
        .map(
            segment =>
                `<path class="sh-floorplan-${segment.kind === 'outer' ? 'outline' : 'partitions'} sh-floorplan-cut-wall" d="M${segment.start.join(',')}L${segment.end.join(',')}" />`,
        )
        .join('');
    const windowOpenings = openings.map(opening => renderFlatWindow(opening, stateValue)).join('');
    const renderedViewBox = drawing.viewBox.join(' ');
    return `<svg xmlns="http://www.w3.org/2000/svg" class="sh-floorplan-svg" viewBox="${renderedViewBox}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${fills}<g class="sh-floorplan-walls">${walls}${windowOpenings}</g></svg>`;
}
