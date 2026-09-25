import React from 'react';

import {
    Alert,
    Box,
    Button,
    Checkbox,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    TextField,
    Typography,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import type { WidgetData } from '@iobroker/types-vis-2';

import Generic from './Generic';
import {
    inferWindowAzimuthFromRoomBoundary,
    isPointInPolygon,
    isValidRoomPolygon,
    roomInteriorPoint,
    snapPointToRoomBoundary,
} from './SunlightUtils';
import {
    emptyFloorplanGeometry,
    parseFloorplanGeometries,
    type FloorplanGeometries,
    type FloorplanGeometry,
    type FloorplanLightBubbleGeometry,
    type FloorplanPoint,
    type FloorplanWindowGeometry,
} from './SunlightFloorplanConfig';

interface SunlightFloorplanEditorProps {
    data: WidgetData;
    onDataChange: (newData: WidgetData) => void;
    floors: Record<string, { label: string; svg: string }>;
}

type EditorTool = 'select' | 'drawRoom' | 'drawWindow' | 'placeLight';
type WindowDragKind = 'start' | 'end' | 'move';

interface GeometryDrag {
    kind: 'vertex' | 'window' | 'light';
    pointerStart: FloorplanPoint;
    roomIndex?: number;
    vertexIndex?: number;
    windowIndex?: number;
    lightIndex?: number;
    windowDragKind?: WindowDragKind;
    originalWindow?: FloorplanWindowGeometry;
}

interface WindowDraft {
    start: FloorplanPoint;
    end: FloorplanPoint;
}

function windowEndpoints(window: FloorplanWindowGeometry): [FloorplanPoint, FloorplanPoint] {
    return [
        [window.centerX - window.widthX / 2, window.centerY - window.widthY / 2],
        [window.centerX + window.widthX / 2, window.centerY + window.widthY / 2],
    ];
}

function windowFromEndpoints(
    start: FloorplanPoint,
    end: FloorplanPoint,
    original: FloorplanWindowGeometry,
): FloorplanWindowGeometry {
    return {
        ...original,
        centerX: (start[0] + end[0]) / 2,
        centerY: (start[1] + end[1]) / 2,
        widthX: end[0] - start[0],
        widthY: end[1] - start[1],
    };
}

function emptyGeometry(): FloorplanGeometry {
    return { rooms: [], windows: [], lightBubbles: [] };
}

function svgContents(svg: string): string {
    const openTagEnd = svg.indexOf('>');
    const closeTagStart = svg.lastIndexOf('</svg>');
    return openTagEnd >= 0 && closeTagStart > openTagEnd ? svg.slice(openTagEnd + 1, closeTagStart) : '';
}

function svgViewBox(svg: string): string {
    return svg.match(/\bviewBox="([^"]+)"/)?.[1] || '0 0 756 699';
}

function pointsAttribute(points: FloorplanPoint[]): string {
    return points.map(point => `${point[0]},${point[1]}`).join(' ');
}

function constrainOrthogonally(point: FloorplanPoint, anchor: FloorplanPoint): FloorplanPoint {
    const deltaX = point[0] - anchor[0];
    const deltaY = point[1] - anchor[1];
    return Math.abs(deltaX) >= Math.abs(deltaY) ? [point[0], anchor[1]] : [anchor[0], point[1]];
}

function closeOrthogonalRoom(points: FloorplanPoint[]): FloorplanPoint[] {
    if (points.length < 3) {
        return points;
    }
    const first = points[0];
    const last = points[points.length - 1];
    if (first[0] === last[0] || first[1] === last[1]) {
        return points;
    }

    const previous = points[points.length - 2];
    const lastEdgeIsHorizontal = previous[1] === last[1];
    const closingCorner: FloorplanPoint = lastEdgeIsHorizontal ? [last[0], first[1]] : [first[0], last[1]];
    return [...points, closingCorner];
}

function GeometryNumberField(props: {
    label: string;
    value: number;
    onCommit: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    helperText?: string;
}): React.JSX.Element {
    const [draft, setDraft] = React.useState(String(props.value));
    React.useEffect(() => setDraft(String(props.value)), [props.value]);
    return (
        <TextField
            size="small"
            type="number"
            label={props.label}
            value={draft}
            slotProps={{ htmlInput: { min: props.min, max: props.max, step: props.step ?? 'any' } }}
            helperText={props.helperText}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
                if (event.key === 'Enter') {
                    event.currentTarget.querySelector('input')?.blur();
                }
            }}
            onBlur={() => {
                const value = draft.trim() ? Number(draft) : NaN;
                const valid = Number.isFinite(value)
                    ? Math.max(props.min ?? -Infinity, Math.min(props.max ?? Infinity, value))
                    : props.value;
                setDraft(String(valid));
                if (valid !== props.value) {
                    props.onCommit(valid);
                }
            }}
        />
    );
}

export default function SunlightFloorplanEditor(props: SunlightFloorplanEditorProps): React.JSX.Element {
    const editorId = React.useId();
    const requestedFloor = String(props.data.floorplan || 'eg');
    const initialFloor = Object.prototype.hasOwnProperty.call(props.floors, requestedFloor)
        ? requestedFloor
        : Object.keys(props.floors)[0];
    const [open, setOpen] = React.useState(false);
    const [activeFloor, setActiveFloor] = React.useState(initialFloor);
    const [geometries, setGeometries] = React.useState<FloorplanGeometries>(() =>
        parseFloorplanGeometries(props.data.floorConfigurations),
    );
    const [selectedRoom, setSelectedRoom] = React.useState(0);
    const [selectedWindow, setSelectedWindow] = React.useState(-1);
    const [selectedLight, setSelectedLight] = React.useState(-1);
    const [selectedVertex, setSelectedVertex] = React.useState(-1);
    const [tool, setTool] = React.useState<EditorTool>('select');
    const [orthogonalDrawing, setOrthogonalDrawing] = React.useState(false);
    const [roomDraft, setRoomDraft] = React.useState<FloorplanPoint[]>([]);
    const [roomHover, setRoomHover] = React.useState<FloorplanPoint | null>(null);
    const [windowDraft, setWindowDraft] = React.useState<WindowDraft | null>(null);
    const [drag, setDrag] = React.useState<GeometryDrag | null>(null);
    const [geometryError, setGeometryError] = React.useState('');
    const dragSnapshot = React.useRef<FloorplanGeometry | null>(null);
    const svgRef = React.useRef<SVGSVGElement>(null);
    const geometriesRef = React.useRef(geometries);

    React.useEffect(() => {
        if (!open) {
            const updated = parseFloorplanGeometries(props.data.floorConfigurations);
            geometriesRef.current = updated;
            setGeometries(updated);
            setActiveFloor(initialFloor);
        }
    }, [props.data.floorConfigurations, initialFloor, open]);

    const currentFloor = props.floors[activeFloor] || props.floors.eg || Object.values(props.floors)[0];
    const currentGeometry = geometries[activeFloor] || emptyFloorplanGeometry;
    const viewBox = currentFloor ? svgViewBox(currentFloor.svg) : '0 0 756 699';
    const currentSvgContents = currentFloor ? svgContents(currentFloor.svg) : '';

    function save(next: FloorplanGeometries, floor = activeFloor): void {
        geometriesRef.current = next;
        setGeometries(next);
        props.onDataChange({
            ...props.data,
            floorplan: floor,
            floorConfigurations: JSON.stringify(next),
        });
    }

    function replaceGeometry(nextGeometry: FloorplanGeometry, shouldSave = true): void {
        const next = { ...geometriesRef.current, [activeFloor]: nextGeometry };
        geometriesRef.current = next;
        setGeometries(next);
        if (shouldSave) {
            save(next);
        }
    }

    function updateWindow(index: number, update: (window: FloorplanWindowGeometry) => FloorplanWindowGeometry): void {
        const nextGeometry = {
            ...currentGeometry,
            windows: currentGeometry.windows.map((window, windowIndex) =>
                windowIndex === index ? update(window) : window,
            ),
        };
        replaceGeometry(nextGeometry);
    }

    function eventPoint(event: React.PointerEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>): FloorplanPoint {
        const svg = svgRef.current;
        const matrix = svg?.getScreenCTM();
        if (!svg || !matrix) {
            return [0, 0];
        }
        const point = svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const transformed = point.matrixTransform(matrix.inverse());
        return [transformed.x, transformed.y];
    }

    function openEditor(): void {
        const loaded = parseFloorplanGeometries(props.data.floorConfigurations);
        const floor = initialFloor;
        if (!loaded[floor]) {
            loaded[floor] = emptyGeometry();
        }
        geometriesRef.current = loaded;
        setGeometries(loaded);
        setActiveFloor(floor);
        setSelectedRoom(0);
        setSelectedWindow(-1);
        setSelectedLight(-1);
        setSelectedVertex(-1);
        setTool('select');
        setRoomDraft([]);
        setRoomHover(null);
        setWindowDraft(null);
        setDrag(null);
        setGeometryError('');
        setOpen(true);
    }

    function changeFloor(event: SelectChangeEvent<string>): void {
        const floor = event.target.value;
        setDrag(null);
        dragSnapshot.current = null;
        setGeometryError('');
        const next = { ...geometriesRef.current, [activeFloor]: currentGeometry };
        if (!next[floor]) {
            next[floor] = emptyGeometry();
        }
        setActiveFloor(floor);
        setSelectedRoom(0);
        setSelectedWindow(-1);
        setSelectedLight(-1);
        setSelectedVertex(-1);
        setTool('select');
        setRoomDraft([]);
        setRoomHover(null);
        setWindowDraft(null);
        save(next, floor);
    }

    function addRoom(): void {
        setGeometryError('');
        setSelectedWindow(-1);
        setSelectedLight(-1);
        setSelectedVertex(-1);
        setRoomDraft([]);
        setRoomHover(null);
        setTool('drawRoom');
    }

    function finishRoom(): void {
        if (roomDraft.length < 3) {
            return;
        }
        const points = orthogonalDrawing ? closeOrthogonalRoom(roomDraft) : roomDraft;
        if (!isValidRoomPolygon(points)) {
            setGeometryError(Generic.t('floorplan_editor_invalid_room'));
            return;
        }
        setGeometryError('');
        const rooms = [...currentGeometry.rooms, { points }];
        replaceGeometry({ ...currentGeometry, rooms });
        setSelectedRoom(rooms.length - 1);
        setSelectedLight(-1);
        setRoomDraft([]);
        setRoomHover(null);
        setTool('select');
    }

    function cancelRoom(): void {
        setGeometryError('');
        setRoomDraft([]);
        setRoomHover(null);
        setTool('select');
    }

    function removeRoom(): void {
        if (!currentGeometry.rooms.length) {
            return;
        }
        const rooms = currentGeometry.rooms.filter((_, index) => index !== selectedRoom);
        const windows = currentGeometry.windows
            .filter(window => window.roomIndex !== selectedRoom + 1)
            .map(window => ({
                ...window,
                roomIndex: window.roomIndex > selectedRoom + 1 ? window.roomIndex - 1 : window.roomIndex,
            }));
        const lightBubbles = currentGeometry.lightBubbles
            .filter(light => light.roomIndex !== selectedRoom + 1)
            .map(light => ({
                ...light,
                roomIndex: light.roomIndex > selectedRoom + 1 ? light.roomIndex - 1 : light.roomIndex,
            }));
        replaceGeometry({ ...currentGeometry, rooms, windows, lightBubbles });
        setSelectedRoom(Math.max(0, Math.min(selectedRoom, rooms.length - 1)));
        setSelectedWindow(-1);
        setSelectedLight(-1);
        setSelectedVertex(-1);
    }

    function removeVertex(): void {
        const room = currentGeometry.rooms[selectedRoom];
        if (!room || room.points.length <= 3 || selectedVertex < 0) {
            return;
        }
        const rooms = currentGeometry.rooms.map((entry, index) =>
            index === selectedRoom
                ? { points: entry.points.filter((_, pointIndex) => pointIndex !== selectedVertex) }
                : entry,
        );
        if (!isValidRoomPolygon(rooms[selectedRoom].points)) {
            setGeometryError(Generic.t('floorplan_editor_invalid_room'));
            return;
        }
        replaceGeometry({ ...currentGeometry, rooms });
        setSelectedVertex(-1);
    }

    function addVertex(): void {
        const room = currentGeometry.rooms[selectedRoom];
        if (!room || selectedVertex < 0 || room.points.length >= 64) {
            return;
        }
        const nextVertex = (selectedVertex + 1) % room.points.length;
        const currentPoint = room.points[selectedVertex];
        const nextPoint = room.points[nextVertex];
        const midpoint: FloorplanPoint = [(currentPoint[0] + nextPoint[0]) / 2, (currentPoint[1] + nextPoint[1]) / 2];
        const rooms = currentGeometry.rooms.map((entry, index) => {
            if (index !== selectedRoom) {
                return entry;
            }
            const points = [...entry.points];
            points.splice(nextVertex, 0, midpoint);
            return { points };
        });
        replaceGeometry({ ...currentGeometry, rooms });
        setSelectedVertex(nextVertex);
    }

    function addWindow(): void {
        if (!currentGeometry.rooms.length) {
            return;
        }
        setSelectedVertex(-1);
        setSelectedWindow(-1);
        setSelectedLight(-1);
        setWindowDraft(null);
        setTool('drawWindow');
    }

    function addLightBubble(): void {
        if (!currentGeometry.rooms.length || currentGeometry.lightBubbles.length >= 32) {
            return;
        }
        setSelectedVertex(-1);
        setSelectedWindow(-1);
        setSelectedLight(-1);
        setRoomHover(null);
        setTool('placeLight');
    }

    function removeLightBubble(): void {
        if (selectedLight < 0) {
            return;
        }
        const lightBubbles = currentGeometry.lightBubbles.filter((_, index) => index !== selectedLight);
        replaceGeometry({ ...currentGeometry, lightBubbles });
        setSelectedLight(Math.min(selectedLight, lightBubbles.length - 1));
    }

    function removeWindow(): void {
        if (selectedWindow < 0) {
            return;
        }
        const windows = currentGeometry.windows.filter((_, index) => index !== selectedWindow);
        replaceGeometry({ ...currentGeometry, windows });
        setSelectedWindow(Math.min(selectedWindow, windows.length - 1));
    }

    function onMapClick(event: React.MouseEvent<SVGSVGElement>): void {
        const point = eventPoint(event);
        if (tool === 'placeLight') {
            const room = currentGeometry.rooms[selectedRoom];
            if (!room || !isPointInPolygon(point, room.points)) {
                return;
            }
            const lightBubbles = [
                ...currentGeometry.lightBubbles,
                {
                    x: point[0],
                    y: point[1],
                    roomIndex: selectedRoom + 1,
                    statusOid: '',
                    brightnessLumens: 800,
                },
            ];
            replaceGeometry({ ...currentGeometry, lightBubbles });
            setSelectedLight(lightBubbles.length - 1);
            setTool('select');
            return;
        }
        if (tool !== 'drawRoom') {
            return;
        }
        if (roomDraft.length >= 64) {
            return;
        }
        const previous = roomDraft[roomDraft.length - 1];
        if (previous && Math.hypot(previous[0] - point[0], previous[1] - point[1]) < 0.5) {
            return;
        }
        setGeometryError('');
        setRoomDraft([...roomDraft, orthogonalDrawing && previous ? constrainOrthogonally(point, previous) : point]);
        setRoomHover(null);
    }

    function beginWindowDraw(event: React.PointerEvent<SVGSVGElement>): void {
        if (tool !== 'drawWindow') {
            return;
        }
        event.preventDefault();
        svgRef.current?.setPointerCapture(event.pointerId);
        const point = snapPointToRoomBoundary(eventPoint(event), currentGeometry.rooms[selectedRoom]?.points || [], 10);
        setGeometryError('');
        setWindowDraft({ start: point, end: point });
    }

    function beginVertexDrag(
        event: React.PointerEvent<SVGCircleElement>,
        roomIndex: number,
        vertexIndex: number,
    ): void {
        if (tool !== 'select') {
            return;
        }
        event.stopPropagation();
        event.preventDefault();
        svgRef.current?.setPointerCapture(event.pointerId);
        dragSnapshot.current = currentGeometry;
        setSelectedRoom(roomIndex);
        setSelectedWindow(-1);
        setSelectedLight(-1);
        setSelectedVertex(vertexIndex);
        setDrag({
            kind: 'vertex',
            pointerStart: eventPoint(event as unknown as React.PointerEvent<SVGSVGElement>),
            roomIndex,
            vertexIndex,
        });
    }

    function beginWindowDrag(
        event: React.PointerEvent<SVGElement>,
        windowIndex: number,
        windowDragKind: WindowDragKind,
    ): void {
        if (tool !== 'select') {
            return;
        }
        event.stopPropagation();
        event.preventDefault();
        svgRef.current?.setPointerCapture(event.pointerId);
        dragSnapshot.current = currentGeometry;
        setSelectedRoom(currentGeometry.windows[windowIndex].roomIndex - 1);
        const pointerStart = eventPoint(event as unknown as React.PointerEvent<SVGSVGElement>);
        setSelectedWindow(windowIndex);
        setSelectedLight(-1);
        setSelectedVertex(-1);
        setDrag({
            kind: 'window',
            pointerStart,
            windowIndex,
            windowDragKind,
            originalWindow: currentGeometry.windows[windowIndex],
        });
    }

    function beginLightDrag(event: React.PointerEvent<SVGElement>, lightIndex: number): void {
        if (tool !== 'select') {
            return;
        }
        event.stopPropagation();
        event.preventDefault();
        svgRef.current?.setPointerCapture(event.pointerId);
        dragSnapshot.current = currentGeometry;
        setSelectedLight(lightIndex);
        setSelectedWindow(-1);
        setSelectedVertex(-1);
        setSelectedRoom(Math.max(0, currentGeometry.lightBubbles[lightIndex].roomIndex - 1));
        setDrag({
            kind: 'light',
            pointerStart: eventPoint(event as unknown as React.PointerEvent<SVGSVGElement>),
            lightIndex,
        });
    }

    function onMapPointerMove(event: React.PointerEvent<SVGSVGElement>): void {
        const point = eventPoint(event);
        if (tool === 'drawWindow' && windowDraft) {
            setWindowDraft({
                ...windowDraft,
                end: snapPointToRoomBoundary(
                    orthogonalDrawing ? constrainOrthogonally(point, windowDraft.start) : point,
                    currentGeometry.rooms[selectedRoom]?.points || [],
                    10,
                ),
            });
            return;
        }
        if (tool === 'drawRoom') {
            setRoomHover(point);
            return;
        }
        if (!drag) {
            return;
        }

        const base = geometriesRef.current[activeFloor] || emptyGeometry();
        if (drag.kind === 'vertex' && drag.roomIndex !== undefined && drag.vertexIndex !== undefined) {
            const rooms = base.rooms.map((room, roomIndex) =>
                roomIndex === drag.roomIndex
                    ? {
                          points: room.points.map((vertex, vertexIndex) =>
                              vertexIndex === drag.vertexIndex ? point : vertex,
                          ),
                      }
                    : room,
            );
            replaceGeometry({ ...base, rooms }, false);
            return;
        }

        if (drag.kind === 'light' && drag.lightIndex !== undefined) {
            const currentLight = base.lightBubbles[drag.lightIndex];
            const assignedRoom = currentLight && base.rooms[currentLight.roomIndex - 1];
            if (!assignedRoom || !isPointInPolygon(point, assignedRoom.points)) {
                return;
            }
            const lightBubbles = base.lightBubbles.map((light, index) =>
                index === drag.lightIndex ? { ...light, x: point[0], y: point[1] } : light,
            );
            replaceGeometry({ ...base, lightBubbles }, false);
            return;
        }

        const original = drag.originalWindow;
        if (!original || drag.windowIndex === undefined || !drag.windowDragKind) {
            return;
        }
        const [start, end] = windowEndpoints(original);
        let updated: FloorplanWindowGeometry;
        if (drag.windowDragKind === 'move') {
            const deltaX = point[0] - drag.pointerStart[0];
            const deltaY = point[1] - drag.pointerStart[1];
            updated = { ...original, centerX: original.centerX + deltaX, centerY: original.centerY + deltaY };
        } else if (drag.windowDragKind === 'start') {
            updated = windowFromEndpoints(point, end, original);
        } else {
            updated = windowFromEndpoints(start, point, original);
        }
        const boundary = base.rooms[updated.roomIndex - 1]?.points || [];
        const [updatedStart, updatedEnd] = windowEndpoints(updated);
        updated = windowFromEndpoints(
            snapPointToRoomBoundary(updatedStart, boundary, 10),
            snapPointToRoomBoundary(updatedEnd, boundary, 10),
            updated,
        );
        const windows = base.windows.map((window, index) => (index === drag.windowIndex ? updated : window));
        replaceGeometry({ ...base, windows }, false);
    }

    function finishPointer(event: React.PointerEvent<SVGSVGElement>): void {
        if (tool === 'drawWindow' && windowDraft) {
            const pointerEnd = eventPoint(event);
            const end = snapPointToRoomBoundary(
                orthogonalDrawing ? constrainOrthogonally(pointerEnd, windowDraft.start) : pointerEnd,
                currentGeometry.rooms[selectedRoom]?.points || [],
                10,
            );
            const deltaX = end[0] - windowDraft.start[0];
            const deltaY = end[1] - windowDraft.start[1];
            if (Math.hypot(deltaX, deltaY) >= 2) {
                const windows = [
                    ...currentGeometry.windows,
                    {
                        centerX: (end[0] + windowDraft.start[0]) / 2,
                        centerY: (end[1] + windowDraft.start[1]) / 2,
                        widthX: deltaX,
                        widthY: deltaY,
                        roomIndex: selectedRoom + 1,
                        windowHeightMeters: 1.35,
                        windowSillHeightMeters: 0.9,
                        windowSashCount: 1,
                        blindOid: '',
                        blindMin: 0,
                        blindMax: 100,
                        blindInvert: false,
                    },
                ];
                const placed = windows[windows.length - 1];
                if (
                    inferWindowAzimuthFromRoomBoundary(
                        placed.centerX,
                        placed.centerY,
                        placed.widthX,
                        placed.widthY,
                        currentGeometry.rooms[selectedRoom]?.points || [],
                        0,
                    ) === undefined
                ) {
                    setGeometryError(Generic.t('floorplan_editor_invalid_window'));
                    setWindowDraft(null);
                    return;
                }
                replaceGeometry({ ...currentGeometry, windows });
                setSelectedWindow(windows.length - 1);
            }
            setWindowDraft(null);
            setTool('select');
        } else if (drag) {
            const geometry = geometriesRef.current[activeFloor];
            if (geometry.rooms.some(room => !isValidRoomPolygon(room.points))) {
                if (dragSnapshot.current) {
                    replaceGeometry(dragSnapshot.current, false);
                }
                setGeometryError(Generic.t('floorplan_editor_invalid_room'));
            } else {
                save(geometriesRef.current);
                setGeometryError('');
            }
        }
        if (svgRef.current?.hasPointerCapture(event.pointerId)) {
            svgRef.current.releasePointerCapture(event.pointerId);
        }
        dragSnapshot.current = null;
        setDrag(null);
    }

    function cancelPointer(): void {
        if (dragSnapshot.current) {
            replaceGeometry(dragSnapshot.current, false);
        }
        dragSnapshot.current = null;
        setDrag(null);
        setWindowDraft(null);
    }

    function closeEditor(): void {
        cancelPointer();
        save(geometriesRef.current);
        setOpen(false);
    }

    function updateWindowField<K extends keyof FloorplanWindowGeometry>(
        key: K,
        value: FloorplanWindowGeometry[K],
    ): void {
        if (selectedWindow < 0) {
            return;
        }
        updateWindow(selectedWindow, window => ({ ...window, [key]: value }));
        if (key === 'roomIndex') {
            setSelectedRoom(Number(value) - 1);
        }
    }

    function updateLightField<K extends keyof FloorplanLightBubbleGeometry>(
        key: K,
        value: FloorplanLightBubbleGeometry[K],
    ): void {
        if (selectedLight < 0) {
            return;
        }
        const lightBubbles = currentGeometry.lightBubbles.map((light, index) => {
            if (index !== selectedLight) {
                return light;
            }
            const updated = { ...light, [key]: value };
            const room = currentGeometry.rooms[updated.roomIndex - 1];
            if (key === 'roomIndex' && room && !isPointInPolygon([updated.x, updated.y], room.points)) {
                [updated.x, updated.y] = roomInteriorPoint(room.points);
                setSelectedRoom(updated.roomIndex - 1);
            }
            return updated;
        });
        replaceGeometry({ ...currentGeometry, lightBubbles });
    }

    const selectedWindowGeometry = currentGeometry.windows[selectedWindow];
    const windowNeedsWall =
        selectedWindowGeometry &&
        inferWindowAzimuthFromRoomBoundary(
            selectedWindowGeometry.centerX,
            selectedWindowGeometry.centerY,
            selectedWindowGeometry.widthX,
            selectedWindowGeometry.widthY,
            currentGeometry.rooms[selectedWindowGeometry.roomIndex - 1]?.points || [],
            0,
        ) === undefined;
    const selectedLightGeometry = currentGeometry.lightBubbles[selectedLight];
    const selectedRoomGeometry = currentGeometry.rooms[selectedRoom];
    const selectedWindowEndpoints = selectedWindowGeometry ? windowEndpoints(selectedWindowGeometry) : undefined;
    const roomPreviewPoints = roomHover
        ? [
              ...roomDraft,
              orthogonalDrawing && roomDraft.length
                  ? constrainOrthogonally(roomHover, roomDraft[roomDraft.length - 1])
                  : roomHover,
          ]
        : roomDraft;
    const currentViewBox = viewBox.split(/[\s,]+/).map(Number);
    const svgWidth = currentViewBox[2] || 756;
    const svgHeight = currentViewBox[3] || 699;

    return (
        <>
            <Button
                variant="outlined"
                size="small"
                onClick={openEditor}
            >
                {Generic.t('open_floorplan_editor')}
            </Button>
            <Dialog
                open={open}
                onClose={(_event, reason) => {
                    if (reason === 'escapeKeyDown' && (tool !== 'select' || drag)) {
                        cancelPointer();
                        cancelRoom();
                        return;
                    }
                    closeEditor();
                }}
                maxWidth="xl"
                fullWidth
                aria-labelledby={`${editorId}-title`}
            >
                <DialogTitle id={`${editorId}-title`}>{Generic.t('floorplan_editor_title')}</DialogTitle>
                <DialogContent>
                    {geometryError ? (
                        <Alert
                            severity="warning"
                            sx={{ mb: 1 }}
                        >
                            {geometryError}
                        </Alert>
                    ) : null}
                    <Box
                        sx={{
                            display: 'flex',
                            gap: 2,
                            flexDirection: { xs: 'column', md: 'row' },
                            alignItems: 'flex-start',
                        }}
                    >
                        <Box sx={{ minWidth: 0, flex: 1, width: '100%' }}>
                            <Typography
                                variant="body2"
                                sx={{ mb: 1 }}
                            >
                                {tool === 'drawRoom'
                                    ? Generic.t('floorplan_editor_draw_room_help')
                                    : tool === 'drawWindow'
                                      ? Generic.t('floorplan_editor_draw_window_help')
                                      : tool === 'placeLight'
                                        ? Generic.t('floorplan_editor_place_light_help')
                                        : Generic.t('floorplan_editor_drag_help')}
                            </Typography>
                            <svg
                                ref={svgRef}
                                className="sh-floorplan-svg"
                                viewBox={viewBox}
                                preserveAspectRatio="xMidYMid meet"
                                onClick={onMapClick}
                                onPointerDown={beginWindowDraw}
                                onPointerMove={onMapPointerMove}
                                onPointerLeave={() => setRoomHover(null)}
                                onPointerUp={finishPointer}
                                onPointerCancel={cancelPointer}
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    maxHeight: '72vh',
                                    border: '1px solid #9e9e9e',
                                    background: 'var(--sh-surface, #f5f5f5)',
                                    touchAction: 'none',
                                    pointerEvents: 'auto',
                                    cursor:
                                        tool === 'drawRoom' || tool === 'drawWindow' || tool === 'placeLight'
                                            ? 'crosshair'
                                            : 'default',
                                }}
                            >
                                <g
                                    pointerEvents="none"
                                    dangerouslySetInnerHTML={{ __html: currentSvgContents }}
                                />
                                {currentGeometry.rooms.map((room, roomIndex) => (
                                    <g key={`room-${roomIndex}`}>
                                        <polygon
                                            points={pointsAttribute(room.points)}
                                            fill={roomIndex === selectedRoom ? '#42a5f5' : '#80cbc4'}
                                            fillOpacity={roomIndex === selectedRoom ? 0.25 : 0.13}
                                            stroke={roomIndex === selectedRoom ? '#1565c0' : '#00897b'}
                                            strokeWidth={roomIndex === selectedRoom ? 2 : 1.4}
                                            vectorEffect="non-scaling-stroke"
                                            onClick={event => {
                                                if (tool === 'select') {
                                                    event.stopPropagation();
                                                    setSelectedRoom(roomIndex);
                                                    setSelectedWindow(-1);
                                                    setSelectedLight(-1);
                                                    setSelectedVertex(-1);
                                                }
                                            }}
                                        />
                                        {roomIndex === selectedRoom &&
                                            tool === 'select' &&
                                            room.points.map((point, vertexIndex) => (
                                                <circle
                                                    key={`room-${roomIndex}-vertex-${vertexIndex}`}
                                                    cx={point[0]}
                                                    cy={point[1]}
                                                    r={5}
                                                    fill={selectedVertex === vertexIndex ? '#d32f2f' : '#fff'}
                                                    stroke="#1565c0"
                                                    strokeWidth={2}
                                                    vectorEffect="non-scaling-stroke"
                                                    style={{ cursor: 'move' }}
                                                    onPointerDown={event =>
                                                        beginVertexDrag(event, roomIndex, vertexIndex)
                                                    }
                                                    onClick={event => {
                                                        event.stopPropagation();
                                                        setSelectedVertex(vertexIndex);
                                                    }}
                                                />
                                            ))}
                                    </g>
                                ))}
                                {roomDraft.length ? (
                                    <g pointerEvents="none">
                                        {roomPreviewPoints.length > 1 ? (
                                            <polyline
                                                points={pointsAttribute(roomPreviewPoints)}
                                                fill="none"
                                                stroke="#d32f2f"
                                                strokeWidth={2}
                                                strokeDasharray="6 4"
                                                vectorEffect="non-scaling-stroke"
                                            />
                                        ) : null}
                                        {roomDraft.map((point, index) => (
                                            <circle
                                                key={`draft-${index}`}
                                                cx={point[0]}
                                                cy={point[1]}
                                                r={4}
                                                fill="#d32f2f"
                                            />
                                        ))}
                                    </g>
                                ) : null}
                                {currentGeometry.windows.map((window, windowIndex) => {
                                    const [start, end] = windowEndpoints(window);
                                    const active = windowIndex === selectedWindow;
                                    const roomColor = window.roomIndex === selectedRoom + 1 ? '#ef6c00' : '#616161';
                                    return (
                                        <g key={`window-${windowIndex}`}>
                                            <line
                                                x1={start[0]}
                                                y1={start[1]}
                                                x2={end[0]}
                                                y2={end[1]}
                                                stroke={active ? '#d32f2f' : roomColor}
                                                strokeWidth={active ? 4 : 3}
                                                vectorEffect="non-scaling-stroke"
                                                style={{ cursor: 'move' }}
                                                onPointerDown={event => beginWindowDrag(event, windowIndex, 'move')}
                                                onClick={event => {
                                                    if (tool === 'select') {
                                                        event.stopPropagation();
                                                        setSelectedWindow(windowIndex);
                                                        setSelectedLight(-1);
                                                        setSelectedRoom(Math.max(0, window.roomIndex - 1));
                                                    }
                                                }}
                                            />
                                            {active ? (
                                                <>
                                                    <circle
                                                        cx={start[0]}
                                                        cy={start[1]}
                                                        r={6}
                                                        fill="#fff"
                                                        stroke="#d32f2f"
                                                        strokeWidth={2}
                                                        vectorEffect="non-scaling-stroke"
                                                        style={{ cursor: 'crosshair' }}
                                                        onPointerDown={event =>
                                                            beginWindowDrag(event, windowIndex, 'start')
                                                        }
                                                    />
                                                    <circle
                                                        cx={end[0]}
                                                        cy={end[1]}
                                                        r={6}
                                                        fill="#fff"
                                                        stroke="#d32f2f"
                                                        strokeWidth={2}
                                                        vectorEffect="non-scaling-stroke"
                                                        style={{ cursor: 'crosshair' }}
                                                        onPointerDown={event =>
                                                            beginWindowDrag(event, windowIndex, 'end')
                                                        }
                                                    />
                                                </>
                                            ) : null}
                                        </g>
                                    );
                                })}
                                {currentGeometry.lightBubbles.map((light, lightIndex) => {
                                    const active = lightIndex === selectedLight;
                                    return (
                                        <g
                                            key={`light-${lightIndex}`}
                                            style={{ cursor: tool === 'select' ? 'move' : 'crosshair' }}
                                            onPointerDown={event => beginLightDrag(event, lightIndex)}
                                            onClick={event => {
                                                if (tool === 'select') {
                                                    event.stopPropagation();
                                                    setSelectedLight(lightIndex);
                                                    setSelectedWindow(-1);
                                                    setSelectedRoom(Math.max(0, light.roomIndex - 1));
                                                    setSelectedVertex(-1);
                                                }
                                            }}
                                        >
                                            <circle
                                                cx={light.x}
                                                cy={light.y}
                                                r={active ? 9 : 7}
                                                fill="#ffd27e"
                                                stroke={active ? '#d32f2f' : '#8d5c00'}
                                                strokeWidth={active ? 2.5 : 1.5}
                                                vectorEffect="non-scaling-stroke"
                                            />
                                            <circle
                                                cx={light.x}
                                                cy={light.y}
                                                r={2.5}
                                                fill="#fff9e6"
                                                pointerEvents="none"
                                            />
                                        </g>
                                    );
                                })}
                                {windowDraft ? (
                                    <line
                                        x1={windowDraft.start[0]}
                                        y1={windowDraft.start[1]}
                                        x2={windowDraft.end[0]}
                                        y2={windowDraft.end[1]}
                                        stroke="#d32f2f"
                                        strokeWidth={4}
                                        strokeDasharray="6 4"
                                        vectorEffect="non-scaling-stroke"
                                        pointerEvents="none"
                                    />
                                ) : null}
                            </svg>
                        </Box>
                        <Stack
                            spacing={1.5}
                            sx={{ width: { xs: '100%', md: 310 }, maxHeight: '72vh', overflow: 'auto', p: 0.5 }}
                        >
                            <FormControl
                                size="small"
                                fullWidth
                            >
                                <InputLabel id={`${editorId}-field-0`}>
                                    {Generic.t('floorplan_editor_floor')}
                                </InputLabel>
                                <Select
                                    labelId={`${editorId}-field-0`}
                                    label={Generic.t('floorplan_editor_floor')}
                                    value={activeFloor}
                                    onChange={changeFloor}
                                >
                                    {Object.entries(props.floors).map(([floorKey, floor]) => (
                                        <MenuItem
                                            key={floorKey}
                                            value={floorKey}
                                        >
                                            {floor.label}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <Box>
                                <FormControlLabel
                                    control={
                                        <Checkbox
                                            checked={orthogonalDrawing}
                                            onChange={event => setOrthogonalDrawing(event.target.checked)}
                                        />
                                    }
                                    label={Generic.t('floorplan_editor_orthogonal_drawing')}
                                />
                                <Typography
                                    variant="caption"
                                    color="text.secondary"
                                    component="div"
                                >
                                    {Generic.t('floorplan_editor_orthogonal_help')}
                                </Typography>
                            </Box>

                            <Typography variant="subtitle2">{Generic.t('floorplan_editor_rooms')}</Typography>
                            <Stack
                                direction="row"
                                spacing={1}
                            >
                                <FormControl
                                    size="small"
                                    fullWidth
                                    disabled={!currentGeometry.rooms.length || tool !== 'select'}
                                >
                                    <InputLabel id={`${editorId}-field-1`}>
                                        {Generic.t('floorplan_editor_room')}
                                    </InputLabel>
                                    <Select
                                        labelId={`${editorId}-field-1`}
                                        label={Generic.t('floorplan_editor_room')}
                                        value={currentGeometry.rooms.length ? selectedRoom : ''}
                                        onChange={event => {
                                            setSelectedRoom(Number(event.target.value));
                                            setSelectedVertex(-1);
                                            setSelectedWindow(-1);
                                            setSelectedLight(-1);
                                        }}
                                    >
                                        {currentGeometry.rooms.map((_, index) => (
                                            <MenuItem
                                                key={index}
                                                value={index}
                                            >{`${Generic.t('floorplan_editor_room')} ${index + 1}`}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <Button
                                    variant="outlined"
                                    onClick={addRoom}
                                    disabled={currentGeometry.rooms.length >= 16 || tool !== 'select'}
                                >
                                    {Generic.t('add')}
                                </Button>
                            </Stack>
                            {tool === 'drawRoom' ? (
                                <Stack
                                    direction="row"
                                    spacing={1}
                                >
                                    <Button
                                        variant="contained"
                                        onClick={finishRoom}
                                        disabled={roomDraft.length < 3}
                                    >
                                        {Generic.t('floorplan_editor_finish_room')}
                                    </Button>
                                    <Button onClick={cancelRoom}>{Generic.t('cancel')}</Button>
                                </Stack>
                            ) : (
                                <Stack
                                    direction="row"
                                    spacing={1}
                                >
                                    <Button
                                        variant="outlined"
                                        onClick={removeRoom}
                                        disabled={!selectedRoomGeometry || tool !== 'select'}
                                    >
                                        {Generic.t('floorplan_editor_remove_room')}
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        onClick={addVertex}
                                        disabled={
                                            !selectedRoomGeometry ||
                                            selectedVertex < 0 ||
                                            selectedRoomGeometry.points.length >= 64
                                        }
                                    >
                                        {Generic.t('floorplan_editor_add_vertex')}
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        onClick={removeVertex}
                                        disabled={
                                            !selectedRoomGeometry ||
                                            selectedVertex < 0 ||
                                            selectedRoomGeometry.points.length <= 3
                                        }
                                    >
                                        {Generic.t('floorplan_editor_remove_vertex')}
                                    </Button>
                                </Stack>
                            )}

                            <Typography
                                variant="subtitle2"
                                sx={{ mt: 1 }}
                            >
                                {Generic.t('floorplan_editor_windows')}
                            </Typography>
                            <Stack
                                direction="row"
                                spacing={1}
                            >
                                <FormControl
                                    size="small"
                                    fullWidth
                                    disabled={!currentGeometry.windows.length || tool !== 'select'}
                                >
                                    <InputLabel id={`${editorId}-field-2`}>
                                        {Generic.t('floorplan_editor_window')}
                                    </InputLabel>
                                    <Select
                                        labelId={`${editorId}-field-2`}
                                        label={Generic.t('floorplan_editor_window')}
                                        value={selectedWindow >= 0 ? selectedWindow : ''}
                                        onChange={event => {
                                            const index = Number(event.target.value);
                                            setSelectedWindow(index);
                                            setSelectedLight(-1);
                                            setSelectedVertex(-1);
                                            const window = currentGeometry.windows[index];
                                            if (window) {
                                                setSelectedRoom(Math.max(0, window.roomIndex - 1));
                                            }
                                        }}
                                    >
                                        {currentGeometry.windows.map((_, index) => (
                                            <MenuItem
                                                key={index}
                                                value={index}
                                            >{`${Generic.t('floorplan_editor_window')} ${index + 1}`}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <Button
                                    variant="outlined"
                                    onClick={addWindow}
                                    disabled={
                                        !currentGeometry.rooms.length ||
                                        currentGeometry.windows.length >= 16 ||
                                        tool !== 'select'
                                    }
                                >
                                    {Generic.t('add')}
                                </Button>
                            </Stack>
                            {tool === 'drawWindow' ? (
                                <Button
                                    onClick={() => {
                                        setWindowDraft(null);
                                        setTool('select');
                                    }}
                                >
                                    {Generic.t('cancel')}
                                </Button>
                            ) : null}
                            {windowNeedsWall ? (
                                <Alert severity="warning">{Generic.t('floorplan_editor_invalid_window')}</Alert>
                            ) : null}
                            {selectedWindowGeometry && selectedWindowEndpoints ? (
                                <>
                                    <Stack
                                        direction="row"
                                        spacing={1}
                                    >
                                        <Button
                                            variant="outlined"
                                            onClick={removeWindow}
                                            disabled={selectedWindow < 0}
                                        >
                                            {Generic.t('floorplan_editor_remove_window')}
                                        </Button>
                                        <FormControl
                                            size="small"
                                            sx={{ minWidth: 110 }}
                                        >
                                            <InputLabel id={`${editorId}-field-3`}>
                                                {Generic.t('floorplan_editor_room')}
                                            </InputLabel>
                                            <Select
                                                labelId={`${editorId}-field-3`}
                                                label={Generic.t('floorplan_editor_room')}
                                                value={selectedWindowGeometry.roomIndex - 1}
                                                onChange={event =>
                                                    updateWindowField('roomIndex', Number(event.target.value) + 1)
                                                }
                                            >
                                                {currentGeometry.rooms.map((_, index) => (
                                                    <MenuItem
                                                        key={index}
                                                        value={index}
                                                    >
                                                        {index + 1}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Stack>
                                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                                        <GeometryNumberField
                                            key={`${selectedWindow}-centerX`}
                                            label={Generic.t('window_center_x')}
                                            value={selectedWindowGeometry.centerX}
                                            onCommit={value => updateWindowField('centerX', value)}
                                        />
                                        <GeometryNumberField
                                            key={`${selectedWindow}-centerY`}
                                            label={Generic.t('window_center_y')}
                                            value={selectedWindowGeometry.centerY}
                                            onCommit={value => updateWindowField('centerY', value)}
                                        />
                                        <GeometryNumberField
                                            key={`${selectedWindow}-widthX`}
                                            label={Generic.t('window_width_x')}
                                            value={selectedWindowGeometry.widthX}
                                            onCommit={value => updateWindowField('widthX', value)}
                                        />
                                        <GeometryNumberField
                                            key={`${selectedWindow}-widthY`}
                                            label={Generic.t('window_width_y')}
                                            value={selectedWindowGeometry.widthY}
                                            onCommit={value => updateWindowField('widthY', value)}
                                        />
                                        <GeometryNumberField
                                            key={`${selectedWindow}-windowHeightMeters`}
                                            label={Generic.t('window_height_meters')}
                                            value={selectedWindowGeometry.windowHeightMeters}
                                            min={0.1}
                                            onCommit={value => updateWindowField('windowHeightMeters', value)}
                                        />
                                        <GeometryNumberField
                                            key={`${selectedWindow}-windowSillHeightMeters`}
                                            label={Generic.t('window_sill_height_meters')}
                                            value={selectedWindowGeometry.windowSillHeightMeters}
                                            min={0}
                                            onCommit={value => updateWindowField('windowSillHeightMeters', value)}
                                        />
                                    </Box>
                                    <FormControl
                                        size="small"
                                        fullWidth
                                    >
                                        <InputLabel id={`${editorId}-field-4`}>
                                            {Generic.t('window_sash_count')}
                                        </InputLabel>
                                        <Select
                                            labelId={`${editorId}-field-4`}
                                            label={Generic.t('window_sash_count')}
                                            value={selectedWindowGeometry.windowSashCount}
                                            onChange={event =>
                                                updateWindowField('windowSashCount', Number(event.target.value))
                                            }
                                        >
                                            {[1, 2, 3].map(value => (
                                                <MenuItem
                                                    key={value}
                                                    value={value}
                                                >
                                                    {value}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                    <TextField
                                        size="small"
                                        label={Generic.t('blinds_position_oid')}
                                        value={selectedWindowGeometry.blindOid}
                                        onChange={event => updateWindowField('blindOid', event.target.value)}
                                    />
                                    {selectedWindowGeometry.blindOid ? (
                                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                                            <GeometryNumberField
                                                key={`${selectedWindow}-blindMin`}
                                                label={Generic.t('blind_minimum')}
                                                value={selectedWindowGeometry.blindMin}
                                                onCommit={value => updateWindowField('blindMin', value)}
                                            />
                                            <GeometryNumberField
                                                key={`${selectedWindow}-blindMax`}
                                                label={Generic.t('blind_maximum')}
                                                value={selectedWindowGeometry.blindMax}
                                                onCommit={value => updateWindowField('blindMax', value)}
                                            />
                                            <Button
                                                variant={selectedWindowGeometry.blindInvert ? 'contained' : 'outlined'}
                                                onClick={() =>
                                                    updateWindowField(
                                                        'blindInvert',
                                                        !selectedWindowGeometry.blindInvert,
                                                    )
                                                }
                                            >
                                                {Generic.t('blind_invert')}
                                            </Button>
                                        </Box>
                                    ) : null}
                                </>
                            ) : null}
                            <Typography
                                variant="subtitle2"
                                sx={{ mt: 1 }}
                            >
                                {Generic.t('light_bubbles')}
                            </Typography>
                            <Stack
                                direction="row"
                                spacing={1}
                            >
                                <FormControl
                                    size="small"
                                    fullWidth
                                    disabled={!currentGeometry.lightBubbles.length || tool !== 'select'}
                                >
                                    <InputLabel id={`${editorId}-field-5`}>{Generic.t('light_bubble')}</InputLabel>
                                    <Select
                                        labelId={`${editorId}-field-5`}
                                        label={Generic.t('light_bubble')}
                                        value={selectedLight >= 0 ? selectedLight : ''}
                                        onChange={event => {
                                            const index = Number(event.target.value);
                                            const light = currentGeometry.lightBubbles[index];
                                            setSelectedLight(index);
                                            setSelectedWindow(-1);
                                            setSelectedVertex(-1);
                                            if (light) {
                                                setSelectedRoom(Math.max(0, light.roomIndex - 1));
                                            }
                                        }}
                                    >
                                        {currentGeometry.lightBubbles.map((_, index) => (
                                            <MenuItem
                                                key={index}
                                                value={index}
                                            >{`${Generic.t('light_bubble')} ${index + 1}`}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <Button
                                    variant="outlined"
                                    onClick={addLightBubble}
                                    disabled={
                                        !currentGeometry.rooms.length ||
                                        currentGeometry.lightBubbles.length >= 32 ||
                                        tool !== 'select'
                                    }
                                >
                                    {Generic.t('add')}
                                </Button>
                            </Stack>
                            {tool === 'placeLight' ? (
                                <Button onClick={() => setTool('select')}>{Generic.t('cancel')}</Button>
                            ) : null}
                            {selectedLightGeometry ? (
                                <>
                                    <Stack
                                        direction="row"
                                        spacing={1}
                                    >
                                        <Button
                                            variant="outlined"
                                            onClick={removeLightBubble}
                                        >
                                            {Generic.t('light_bubble_remove')}
                                        </Button>
                                        <FormControl
                                            size="small"
                                            sx={{ minWidth: 110 }}
                                        >
                                            <InputLabel id={`${editorId}-field-6`}>
                                                {Generic.t('floorplan_editor_room')}
                                            </InputLabel>
                                            <Select
                                                labelId={`${editorId}-field-6`}
                                                label={Generic.t('floorplan_editor_room')}
                                                value={selectedLightGeometry.roomIndex - 1}
                                                onChange={event =>
                                                    updateLightField('roomIndex', Number(event.target.value) + 1)
                                                }
                                            >
                                                {currentGeometry.rooms.map((_, index) => (
                                                    <MenuItem
                                                        key={index}
                                                        value={index}
                                                    >
                                                        {index + 1}
                                                    </MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Stack>
                                    <TextField
                                        size="small"
                                        label={Generic.t('light_bubble_status_oid')}
                                        value={selectedLightGeometry.statusOid}
                                        onChange={event => updateLightField('statusOid', event.target.value)}
                                    />
                                    <GeometryNumberField
                                        key={`light-${selectedLight}`}
                                        label={Generic.t('light_bubble_brightness')}
                                        value={selectedLightGeometry.brightnessLumens}
                                        min={100}
                                        max={5000}
                                        step={50}
                                        helperText={Generic.t('light_bubble_brightness_help')}
                                        onCommit={value => updateLightField('brightnessLumens', value)}
                                    />
                                </>
                            ) : null}
                            <Typography
                                variant="caption"
                                color="text.secondary"
                            >
                                {`${Math.round(svgWidth)} × ${Math.round(svgHeight)} ${Generic.t('svg_units')}`}
                            </Typography>
                        </Stack>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={closeEditor}
                        variant="contained"
                    >
                        {Generic.t('done')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
