import React from 'react';

import {
    Box,
    Button,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
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
    emptyFloorplanGeometry,
    parseFloorplanGeometries,
    type FloorplanGeometries,
    type FloorplanGeometry,
    type FloorplanPoint,
    type FloorplanWindowGeometry,
} from './SunlightFloorplanConfig';

interface SunlightFloorplanEditorProps {
    data: WidgetData;
    onDataChange: (newData: WidgetData) => void;
    floors: Record<string, { label: string; svg: string }>;
}

type EditorTool = 'select' | 'drawRoom' | 'drawWindow';
type WindowDragKind = 'start' | 'end' | 'move';

interface GeometryDrag {
    kind: 'vertex' | 'window';
    pointerStart: FloorplanPoint;
    roomIndex?: number;
    vertexIndex?: number;
    windowIndex?: number;
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
    return { rooms: [], windows: [] };
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

export default function SunlightFloorplanEditor(props: SunlightFloorplanEditorProps): React.JSX.Element {
    const initialFloor = String(props.data.floorplan || 'eg');
    const [open, setOpen] = React.useState(false);
    const [activeFloor, setActiveFloor] = React.useState(initialFloor);
    const [geometries, setGeometries] = React.useState<FloorplanGeometries>(() =>
        parseFloorplanGeometries(props.data.floorConfigurations),
    );
    const [selectedRoom, setSelectedRoom] = React.useState(0);
    const [selectedWindow, setSelectedWindow] = React.useState(-1);
    const [selectedVertex, setSelectedVertex] = React.useState(-1);
    const [tool, setTool] = React.useState<EditorTool>('select');
    const [roomDraft, setRoomDraft] = React.useState<FloorplanPoint[]>([]);
    const [windowDraft, setWindowDraft] = React.useState<WindowDraft | null>(null);
    const [drag, setDrag] = React.useState<GeometryDrag | null>(null);
    const svgRef = React.useRef<SVGSVGElement>(null);
    const geometriesRef = React.useRef(geometries);

    React.useEffect(() => {
        if (!open) {
            const updated = parseFloorplanGeometries(props.data.floorConfigurations);
            geometriesRef.current = updated;
            setGeometries(updated);
            setActiveFloor(String(props.data.floorplan || 'eg'));
        }
    }, [props.data.floorConfigurations, props.data.floorplan, open]);

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
        const floor = String(props.data.floorplan || 'eg');
        if (!loaded[floor]) {
            loaded[floor] = emptyGeometry();
        }
        geometriesRef.current = loaded;
        setGeometries(loaded);
        setActiveFloor(floor);
        setSelectedRoom(0);
        setSelectedWindow(-1);
        setSelectedVertex(-1);
        setTool('select');
        setOpen(true);
    }

    function changeFloor(event: SelectChangeEvent<string>): void {
        const floor = event.target.value;
        const next = { ...geometriesRef.current, [activeFloor]: currentGeometry };
        if (!next[floor]) {
            next[floor] = emptyGeometry();
        }
        setActiveFloor(floor);
        setSelectedRoom(0);
        setSelectedWindow(-1);
        setSelectedVertex(-1);
        setTool('select');
        setRoomDraft([]);
        setWindowDraft(null);
        save(next, floor);
    }

    function addRoom(): void {
        setSelectedWindow(-1);
        setSelectedVertex(-1);
        setRoomDraft([]);
        setTool('drawRoom');
    }

    function finishRoom(): void {
        if (roomDraft.length < 3) {
            return;
        }
        const rooms = [...currentGeometry.rooms, { points: roomDraft }];
        replaceGeometry({ ...currentGeometry, rooms });
        setSelectedRoom(rooms.length - 1);
        setRoomDraft([]);
        setTool('select');
    }

    function cancelRoom(): void {
        setRoomDraft([]);
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
        replaceGeometry({ ...currentGeometry, rooms, windows });
        setSelectedRoom(Math.max(0, Math.min(selectedRoom, rooms.length - 1)));
        setSelectedWindow(-1);
        setSelectedVertex(-1);
    }

    function removeVertex(): void {
        const room = currentGeometry.rooms[selectedRoom];
        if (!room || room.points.length <= 3 || selectedVertex < 0) {
            return;
        }
        const rooms = currentGeometry.rooms.map((entry, index) =>
            index === selectedRoom ? { points: entry.points.filter((_, pointIndex) => pointIndex !== selectedVertex) } : entry,
        );
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
        setWindowDraft(null);
        setTool('drawWindow');
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
        if (tool !== 'drawRoom') {
            return;
        }
        const point = eventPoint(event);
        setRoomDraft(old => [...old, point]);
    }

    function beginWindowDraw(event: React.PointerEvent<SVGSVGElement>): void {
        if (tool !== 'drawWindow') {
            return;
        }
        event.preventDefault();
        svgRef.current?.setPointerCapture(event.pointerId);
        const point = eventPoint(event);
        setWindowDraft({ start: point, end: point });
    }

    function beginVertexDrag(event: React.PointerEvent<SVGCircleElement>, roomIndex: number, vertexIndex: number): void {
        if (tool !== 'select') {
            return;
        }
        event.stopPropagation();
        event.preventDefault();
        svgRef.current?.setPointerCapture(event.pointerId);
        setSelectedRoom(roomIndex);
        setSelectedVertex(vertexIndex);
        setDrag({ kind: 'vertex', pointerStart: eventPoint(event as unknown as React.PointerEvent<SVGSVGElement>), roomIndex, vertexIndex });
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
        const pointerStart = eventPoint(event as unknown as React.PointerEvent<SVGSVGElement>);
        setSelectedWindow(windowIndex);
        setDrag({
            kind: 'window',
            pointerStart,
            windowIndex,
            windowDragKind,
            originalWindow: currentGeometry.windows[windowIndex],
        });
    }

    function onMapPointerMove(event: React.PointerEvent<SVGSVGElement>): void {
        const point = eventPoint(event);
        if (tool === 'drawWindow' && windowDraft) {
            setWindowDraft({ ...windowDraft, end: point });
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
        const windows = base.windows.map((window, index) => (index === drag.windowIndex ? updated : window));
        replaceGeometry({ ...base, windows }, false);
    }

    function finishPointer(event: React.PointerEvent<SVGSVGElement>): void {
        if (tool === 'drawWindow' && windowDraft) {
            const end = eventPoint(event);
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
                replaceGeometry({ ...currentGeometry, windows });
                setSelectedWindow(windows.length - 1);
            }
            setWindowDraft(null);
            setTool('select');
        } else if (drag) {
            save(geometriesRef.current);
        }
        setDrag(null);
    }

    function updateWindowField<K extends keyof FloorplanWindowGeometry>(
        key: K,
        value: FloorplanWindowGeometry[K],
    ): void {
        if (selectedWindow < 0) {
            return;
        }
        updateWindow(selectedWindow, window => ({ ...window, [key]: value }));
    }

    const selectedWindowGeometry = currentGeometry.windows[selectedWindow];
    const selectedRoomGeometry = currentGeometry.rooms[selectedRoom];
    const selectedWindowEndpoints = selectedWindowGeometry ? windowEndpoints(selectedWindowGeometry) : undefined;
    const currentViewBox = viewBox.split(/[\s,]+/).map(Number);
    const svgWidth = currentViewBox[2] || 756;
    const svgHeight = currentViewBox[3] || 699;

    return (
        <>
            <Button variant="outlined" size="small" onClick={openEditor}>
                {Generic.t('open_floorplan_editor')}
            </Button>
            <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xl" fullWidth>
                <DialogTitle>{Generic.t('floorplan_editor_title')}</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' }, alignItems: 'flex-start' }}>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography variant="body2" sx={{ mb: 1 }}>
                                {tool === 'drawRoom'
                                    ? Generic.t('floorplan_editor_draw_room_help')
                                    : tool === 'drawWindow'
                                      ? Generic.t('floorplan_editor_draw_window_help')
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
                                onPointerUp={finishPointer}
                                onPointerCancel={finishPointer}
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    maxHeight: '72vh',
                                    border: '1px solid #9e9e9e',
                                    background: '#fff',
                                    touchAction: 'none',
                                    pointerEvents: 'auto',
                                    cursor: tool === 'drawRoom' || tool === 'drawWindow' ? 'crosshair' : 'default',
                                }}
                            >
                                <g dangerouslySetInnerHTML={{ __html: currentSvgContents }} />
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
                                                if (tool !== 'drawRoom') {
                                                    event.stopPropagation();
                                                    setSelectedRoom(roomIndex);
                                                    setSelectedWindow(-1);
                                                    setSelectedVertex(-1);
                                                }
                                            }}
                                        />
                                        {roomIndex === selectedRoom && tool === 'select' && room.points.map((point, vertexIndex) => (
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
                                                onPointerDown={event => beginVertexDrag(event, roomIndex, vertexIndex)}
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
                                        {roomDraft.length > 1 ? (
                                            <polyline
                                                points={pointsAttribute(roomDraft)}
                                                fill="none"
                                                stroke="#d32f2f"
                                                strokeWidth={2}
                                                strokeDasharray="6 4"
                                                vectorEffect="non-scaling-stroke"
                                            />
                                        ) : null}
                                        {roomDraft.map((point, index) => (
                                            <circle key={`draft-${index}`} cx={point[0]} cy={point[1]} r={4} fill="#d32f2f" />
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
                                                        onPointerDown={event => beginWindowDrag(event, windowIndex, 'start')}
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
                                                        onPointerDown={event => beginWindowDrag(event, windowIndex, 'end')}
                                                    />
                                                </>
                                            ) : null}
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
                        <Stack spacing={1.5} sx={{ width: { xs: '100%', md: 310 }, maxHeight: '72vh', overflow: 'auto', p: 0.5 }}>
                            <FormControl size="small" fullWidth>
                                <InputLabel>{Generic.t('floorplan_editor_floor')}</InputLabel>
                                <Select label={Generic.t('floorplan_editor_floor')} value={activeFloor} onChange={changeFloor}>
                                    {Object.entries(props.floors).map(([floorKey, floor]) => (
                                        <MenuItem key={floorKey} value={floorKey}>{floor.label}</MenuItem>
                                    ))}
                                </Select>
                            </FormControl>

                            <Typography variant="subtitle2">{Generic.t('floorplan_editor_rooms')}</Typography>
                            <Stack direction="row" spacing={1}>
                                <FormControl size="small" fullWidth disabled={!currentGeometry.rooms.length || tool === 'drawRoom'}>
                                    <InputLabel>{Generic.t('floorplan_editor_room')}</InputLabel>
                                    <Select
                                        label={Generic.t('floorplan_editor_room')}
                                        value={currentGeometry.rooms.length ? selectedRoom : ''}
                                        onChange={event => {
                                            setSelectedRoom(Number(event.target.value));
                                            setSelectedVertex(-1);
                                            setSelectedWindow(-1);
                                        }}
                                    >
                                        {currentGeometry.rooms.map((_, index) => (
                                            <MenuItem key={index} value={index}>{`${Generic.t('floorplan_editor_room')} ${index + 1}`}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <Button variant="outlined" onClick={addRoom} disabled={currentGeometry.rooms.length >= 16 || tool === 'drawWindow'}>
                                    {Generic.t('add')}
                                </Button>
                            </Stack>
                            {tool === 'drawRoom' ? (
                                <Stack direction="row" spacing={1}>
                                    <Button variant="contained" onClick={finishRoom} disabled={roomDraft.length < 3}>
                                        {Generic.t('floorplan_editor_finish_room')}
                                    </Button>
                                    <Button onClick={cancelRoom}>{Generic.t('cancel')}</Button>
                                </Stack>
                            ) : (
                                <Stack direction="row" spacing={1}>
                                    <Button variant="outlined" onClick={removeRoom} disabled={!selectedRoomGeometry}>
                                        {Generic.t('floorplan_editor_remove_room')}
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        onClick={addVertex}
                                        disabled={!selectedRoomGeometry || selectedVertex < 0 || selectedRoomGeometry.points.length >= 64}
                                    >
                                        {Generic.t('floorplan_editor_add_vertex')}
                                    </Button>
                                    <Button
                                        variant="outlined"
                                        onClick={removeVertex}
                                        disabled={!selectedRoomGeometry || selectedVertex < 0 || selectedRoomGeometry.points.length <= 3}
                                    >
                                        {Generic.t('floorplan_editor_remove_vertex')}
                                    </Button>
                                </Stack>
                            )}

                            <Typography variant="subtitle2" sx={{ mt: 1 }}>{Generic.t('floorplan_editor_windows')}</Typography>
                            <Stack direction="row" spacing={1}>
                                <FormControl size="small" fullWidth disabled={!currentGeometry.windows.length || tool !== 'select'}>
                                    <InputLabel>{Generic.t('floorplan_editor_window')}</InputLabel>
                                    <Select
                                        label={Generic.t('floorplan_editor_window')}
                                        value={selectedWindow >= 0 ? selectedWindow : ''}
                                        onChange={event => {
                                            const index = Number(event.target.value);
                                            setSelectedWindow(index);
                                            const window = currentGeometry.windows[index];
                                            if (window) {
                                                setSelectedRoom(Math.max(0, window.roomIndex - 1));
                                            }
                                        }}
                                    >
                                        {currentGeometry.windows.map((_, index) => (
                                            <MenuItem key={index} value={index}>{`${Generic.t('floorplan_editor_window')} ${index + 1}`}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                                <Button
                                    variant="outlined"
                                    onClick={addWindow}
                                    disabled={!currentGeometry.rooms.length || currentGeometry.windows.length >= 16 || tool !== 'select'}
                                >
                                    {Generic.t('add')}
                                </Button>
                            </Stack>
                            {tool === 'drawWindow' ? (
                                <Button onClick={() => { setWindowDraft(null); setTool('select'); }}>
                                    {Generic.t('cancel')}
                                </Button>
                            ) : null}
                            {selectedWindowGeometry && selectedWindowEndpoints ? (
                                <>
                                    <Stack direction="row" spacing={1}>
                                        <Button
                                            variant="outlined"
                                            onClick={removeWindow}
                                            disabled={selectedWindow < 0}
                                        >
                                            {Generic.t('floorplan_editor_remove_window')}
                                        </Button>
                                        <FormControl size="small" sx={{ minWidth: 110 }}>
                                            <InputLabel>{Generic.t('floorplan_editor_room')}</InputLabel>
                                            <Select
                                                label={Generic.t('floorplan_editor_room')}
                                                value={selectedWindowGeometry.roomIndex - 1}
                                                onChange={event => updateWindowField('roomIndex', Number(event.target.value) + 1)}
                                            >
                                                {currentGeometry.rooms.map((_, index) => (
                                                    <MenuItem key={index} value={index}>{index + 1}</MenuItem>
                                                ))}
                                            </Select>
                                        </FormControl>
                                    </Stack>
                                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                                        <TextField size="small" type="number" label={Generic.t('window_center_x')} value={selectedWindowGeometry.centerX} onChange={event => updateWindowField('centerX', Number(event.target.value))} />
                                        <TextField size="small" type="number" label={Generic.t('window_center_y')} value={selectedWindowGeometry.centerY} onChange={event => updateWindowField('centerY', Number(event.target.value))} />
                                        <TextField size="small" type="number" label={Generic.t('window_width_x')} value={selectedWindowGeometry.widthX} onChange={event => updateWindowField('widthX', Number(event.target.value))} />
                                        <TextField size="small" type="number" label={Generic.t('window_width_y')} value={selectedWindowGeometry.widthY} onChange={event => updateWindowField('widthY', Number(event.target.value))} />
                                        <TextField size="small" type="number" label={Generic.t('window_height_meters')} value={selectedWindowGeometry.windowHeightMeters} onChange={event => updateWindowField('windowHeightMeters', Number(event.target.value))} />
                                        <TextField size="small" type="number" label={Generic.t('window_sill_height_meters')} value={selectedWindowGeometry.windowSillHeightMeters} onChange={event => updateWindowField('windowSillHeightMeters', Number(event.target.value))} />
                                    </Box>
                                    <FormControl size="small" fullWidth>
                                        <InputLabel>{Generic.t('window_sash_count')}</InputLabel>
                                        <Select
                                            label={Generic.t('window_sash_count')}
                                            value={selectedWindowGeometry.windowSashCount}
                                            onChange={event => updateWindowField('windowSashCount', Number(event.target.value))}
                                        >
                                            {[1, 2, 3].map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}
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
                                            <TextField size="small" type="number" label={Generic.t('blind_minimum')} value={selectedWindowGeometry.blindMin} onChange={event => updateWindowField('blindMin', Number(event.target.value))} />
                                            <TextField size="small" type="number" label={Generic.t('blind_maximum')} value={selectedWindowGeometry.blindMax} onChange={event => updateWindowField('blindMax', Number(event.target.value))} />
                                            <Button
                                                variant={selectedWindowGeometry.blindInvert ? 'contained' : 'outlined'}
                                                onClick={() => updateWindowField('blindInvert', !selectedWindowGeometry.blindInvert)}
                                            >
                                                {Generic.t('blind_invert')}
                                            </Button>
                                        </Box>
                                    ) : null}
                                </>
                            ) : null}
                            <Typography variant="caption" color="text.secondary">
                                {`${Math.round(svgWidth)} × ${Math.round(svgHeight)} ${Generic.t('svg_units')}`}
                            </Typography>
                        </Stack>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => { save(geometriesRef.current); setOpen(false); }} variant="contained">
                        {Generic.t('done')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
