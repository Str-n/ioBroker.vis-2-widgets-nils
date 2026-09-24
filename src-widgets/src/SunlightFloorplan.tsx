import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetState } from '@iobroker/types-vis-2';

import Generic from './Generic';
import {
    calculateSunlightBeam,
    calculateSunlightFactors,
    normalizeBlindOpenFactorForWindow,
    parseRoomPolygon,
    pointsAttribute,
    sunlightColor,
} from './SunlightUtils';
import egSvg from '../public/floorplans/eg.svg?raw';
import ogSvg from '../public/floorplans/og.svg?raw';
import dgSvg from '../public/floorplans/dg.svg?raw';
import basementSvg from '../public/floorplans/basement.svg?raw';
import '../public/smarthome.css';
import './SunlightFloorplan.css';

interface SunlightRxData extends Record<string, any> {
    noCard: boolean | 'true';
    widgetTitle: string;
    floorplan: string;
    floorTopAzimuth: number | string;
    sunAzimuthOid: string;
    sunElevationOid: string;
    weatherSunFactorOid: string;
    weatherCloudinessOid: string;
    weatherConditionOid: string;
    weatherTemperatureOid: string;
    weatherRadiationOid: string;
    sunlightSource: 'cloudiness' | 'radiation';
    cloudinessScale: 'percent' | 'fraction';
    radiationReference: number | string;
    svgUnitsPerMeter: number | string;
    maximumProjection: number | string;
    roomHeightMeters: number | string;
    windowCount: number | string;
    [key: `windowStartX${number}`]: number | string;
    [key: `windowStartY${number}`]: number | string;
    [key: `windowEndX${number}`]: number | string;
    [key: `windowEndY${number}`]: number | string;
    [key: `windowAzimuth${number}`]: number | string;
    [key: `blindOid${number}`]: string;
    [key: `blindMin${number}`]: number | string;
    [key: `blindMax${number}`]: number | string;
    [key: `blindInvert${number}`]: boolean | 'true';
    [key: `roomPolygon${number}`]: string;
    [key: `windowHeightMeters${number}`]: number | string;
    [key: `windowSillHeightMeters${number}`]: number | string;
}

type SunlightState = VisRxWidgetState;

const floorplans: Record<string, { label: string; svg: string }> = {
    eg: { label: 'EG', svg: egSvg },
    og: { label: 'OG', svg: ogSvg },
    dg: { label: 'DG', svg: dgSvg },
    basement: { label: 'Basement', svg: basementSvg },
};

interface RenderedBeam {
    points: Array<[number, number]>;
    previousPoints?: Array<[number, number]>;
    clipPoints: Array<[number, number]>;
    strength: number;
    softness: number;
}

interface RenderedAmbient {
    clipPoints: Array<[number, number]>;
    opacity: number;
}

function renderFloorplan(svg: string, beams: RenderedBeam[], ambient: RenderedAmbient[], id: string, color: string): string {
    if (!beams.length && !ambient.length) {
        return svg;
    }

    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const ambientDefinitions = ambient
        .map(
            (room, index) =>
                `<clipPath id="${safeId}-sun-room-ambient-${index}" clipPathUnits="userSpaceOnUse"><polygon points="${pointsAttribute(room.clipPoints)}" /></clipPath><radialGradient id="${safeId}-sun-diffuse-${index}" cx="45%" cy="42%" r="85%"><stop offset="0" stop-color="#e5f4ff" stop-opacity="0.9" /><stop offset="1" stop-color="#93caff" stop-opacity="0.34" /></radialGradient>`,
        )
        .join('');
    const beamDefinitions = beams
        .map((beam, index) => {
            const nearX = (beam.points[0][0] + beam.points[1][0]) / 2;
            const nearY = (beam.points[0][1] + beam.points[1][1]) / 2;
            const farX = (beam.points[2][0] + beam.points[3][0]) / 2;
            const farY = (beam.points[2][1] + beam.points[3][1]) / 2;
            return `<clipPath id="${safeId}-sun-room-${index}" clipPathUnits="userSpaceOnUse"><polygon points="${pointsAttribute(beam.clipPoints)}" /></clipPath><linearGradient id="${safeId}-sun-direct-${index}" gradientUnits="userSpaceOnUse" x1="${nearX.toFixed(2)}" y1="${nearY.toFixed(2)}" x2="${farX.toFixed(2)}" y2="${farY.toFixed(2)}"><stop offset="0" stop-color="${color}" stop-opacity="0.96" /><stop offset="1" stop-color="${color}" stop-opacity="0.42" /></linearGradient><filter id="${safeId}-sun-soft-${index}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${beam.softness.toFixed(2)}" /></filter>`;
        })
        .join('');
    const ambientOverlays = ambient
        .map(
            (room, index) =>
                `<polygon class="sh-sunlight-floorplan__ambient" points="${pointsAttribute(room.clipPoints)}" clip-path="url(#${safeId}-sun-room-ambient-${index})" fill="url(#${safeId}-sun-diffuse-${index})" opacity="${room.opacity.toFixed(3)}" />`,
        )
        .join('');
    const beamOverlays = beams
        .map(
            (beam, index) => {
                const points = pointsAttribute(beam.points);
                const animation =
                    beam.previousPoints && pointsAttribute(beam.previousPoints) !== points
                        ? `<animate attributeName="points" from="${pointsAttribute(beam.previousPoints)}" to="${points}" dur="450ms" fill="freeze" />`
                        : '';
                return `<polygon class="sh-sunlight-floorplan__beam" points="${points}" clip-path="url(#${safeId}-sun-room-${index})" filter="url(#${safeId}-sun-soft-${index})" fill="url(#${safeId}-sun-direct-${index})" opacity="${Math.min(0.96, Math.sqrt(beam.strength) * 1.18).toFixed(3)}">${animation}</polygon>`;
            },
        )
        .join('');

    const withDefinitions = svg.replace(/(<svg\b[^>]*>)/, `$1<defs>${ambientDefinitions}${beamDefinitions}</defs>`);
    return withDefinitions.replace(
        '<g class="sh-floorplan-walls">',
        `${ambientOverlays}${beamOverlays}<g class="sh-floorplan-walls">`,
    );
}

function formatDegrees(value: number | undefined): string {
    return value === undefined ? '–' : `${Math.round(value)}°`;
}

function cardinalDirection(azimuth: number | undefined): string {
    if (azimuth === undefined) {
        return '–';
    }
    return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(azimuth / 45) % 8];
}

function SunlightFloorplanContent(props: {
    svg: string;
    beams: RenderedBeam[];
    ambient: RenderedAmbient[];
    id: string;
    title: string;
    floorName: string;
    sunAzimuth?: number;
    sunElevation?: number;
    diffuseStrength: number;
    directFactor: number;
    radiation?: number;
    weatherCondition?: string;
    temperature?: number;
    windowCount: number;
    configuredWindowCount: number;
    noCard: boolean;
    labels: Record<string, string>;
}): React.JSX.Element {
    const [now, setNow] = React.useState(() => new Date());

    React.useEffect(() => {
        const timer = window.setInterval(() => setNow(new Date()), 60_000);
        return () => window.clearInterval(timer);
    }, []);

    const status =
        props.sunAzimuth === undefined || props.sunElevation === undefined
            ? props.labels.sunDataMissing
            : props.sunElevation <= 0
              ? props.labels.sunBelowHorizon
              : props.windowCount === 0 || props.configuredWindowCount < props.windowCount
                ? props.labels.configureWindows
                : undefined;

    return (
        <section className={`sh-sunlight-floorplan${props.noCard ? ' sh-sunlight-floorplan--bare' : ''}`}>
            <header className="sh-sunlight-floorplan__header">
                <div className="sh-sunlight-floorplan__time">
                    <strong>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
                    <span>{now.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                </div>
                <div className="sh-sunlight-floorplan__summary">
                    <span className="sh-sunlight-floorplan__eyebrow">{props.floorName}</span>
                    <strong>{props.title}</strong>
                    <span>{props.weatherCondition || props.labels.weatherUnavailable}</span>
                </div>
                <div className="sh-sunlight-floorplan__sun" aria-label={props.labels.sunPosition}>
                    <span className="sh-sunlight-floorplan__sun-icon" aria-hidden="true">☀</span>
                    <strong>{cardinalDirection(props.sunAzimuth)}</strong>
                    <span>{formatDegrees(props.sunAzimuth)} · {formatDegrees(props.sunElevation)}</span>
                </div>
                <div className="sh-sunlight-floorplan__weather">
                    {props.radiation === undefined ? (
                        props.temperature === undefined ? null : <strong>{props.temperature.toFixed(1)}°</strong>
                    ) : (
                        <strong>{Math.round(props.radiation)} W/m²</strong>
                    )}
                    <span>{props.labels.direct}: {Math.round(props.directFactor * 100)}%</span>
                    <span>{props.labels.diffuse}: {Math.round(props.diffuseStrength * 100)}%</span>
                </div>
            </header>
            {status ? <div className="sh-sunlight-floorplan__status" role="status">{status}</div> : null}
            <div className="sh-sunlight-floorplan__drawing">
                <div
                    dangerouslySetInnerHTML={{
                        __html: renderFloorplan(
                            props.svg,
                            props.beams,
                            props.ambient,
                            props.id,
                            sunlightColor(props.sunElevation ?? 40),
                        ),
                    }}
                />
            </div>
        </section>
    );
}

export default class SunlightFloorplan extends Generic<SunlightRxData, SunlightState> {
    static smartHomeTheme = true;

    private previousBeamPoints = new Map<number, Array<[number, number]>>();

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplNils2SunlightFloorplan',
            visSet: 'vis-2-widgets-nils-fork',
            visName: 'Sunlight floor plan',
            visWidgetLabel: 'sunlight_floorplan',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        { name: 'noCard', label: 'without_card', type: 'checkbox', default: false },
                        { name: 'widgetTitle', label: 'name', default: 'Sunlight' },
                        {
                            name: 'floorplan',
                            label: 'floor_plan',
                            type: 'select',
                            options: Object.entries(floorplans).map(([value, floor]) => ({ value, label: floor.label })),
                            default: 'eg',
                        },
                        {
                            name: 'floorTopAzimuth',
                            label: 'floor_top_azimuth',
                            type: 'number',
                            min: 0,
                            max: 359,
                            default: 163,
                            tooltip: 'floor_top_azimuth_help',
                        },
                        {
                            name: 'svgUnitsPerMeter',
                            label: 'sunlight_svg_units_per_meter',
                            type: 'number',
                            min: 1,
                            default: 50,
                        },
                        {
                            name: 'maximumProjection',
                            label: 'sunlight_maximum_projection',
                            type: 'number',
                            min: 1,
                            default: 650,
                        },
                        {
                            name: 'roomHeightMeters',
                            label: 'sunlight_room_height',
                            type: 'number',
                            min: 1,
                            step: 0.05,
                            default: 2.5,
                        },
                        { name: 'windowCount', label: 'windows_count', type: 'slider', min: 0, max: 16, step: 1, default: 0 },
                    ],
                },
                {
                    name: 'sun_data',
                    label: 'sun_data',
                    fields: [
                        {
                            name: 'sunAzimuthOid',
                            label: 'sun_azimuth_oid',
                            type: 'id',
                            default: '',
                            tooltip: 'sun_azimuth_oid_help',
                        },
                        {
                            name: 'sunElevationOid',
                            label: 'sun_elevation_oid',
                            type: 'id',
                            default: '',
                            tooltip: 'sun_elevation_oid_help',
                        },
                        {
                            name: 'sunlightSource',
                            label: 'sunlight_weather_source',
                            type: 'select',
                            options: [
                                { value: 'cloudiness', label: 'weather_cloudiness' },
                                { value: 'radiation', label: 'outdoor_radiation' },
                            ],
                            default: 'radiation',
                        },
                        {
                            name: 'weatherRadiationOid',
                            label: 'outdoor_radiation_oid',
                            type: 'id',
                            default: '0_userdata.0.sunlight.neuwied.globalRadiationAvgWm2',
                            hidden: 'data.sunlightSource !== "radiation"',
                        },
                        {
                            name: 'radiationReference',
                            label: 'radiation_reference_wm2',
                            type: 'number',
                            min: 1,
                            default: 1000,
                            hidden: 'data.sunlightSource !== "radiation"',
                            tooltip: 'radiation_reference_wm2_help',
                        },
                        {
                            name: 'weatherSunFactorOid',
                            label: 'weather_sun_factor_oid',
                            type: 'id',
                            default: '',
                            tooltip: 'weather_sun_factor_oid_help',
                        },
                        {
                            name: 'weatherCloudinessOid',
                            label: 'weather_cloudiness_oid',
                            type: 'id',
                            default: '',
                        },
                        {
                            name: 'cloudinessScale',
                            label: 'cloudiness_scale',
                            type: 'select',
                            options: [
                                { value: 'percent', label: 'percent' },
                                { value: 'fraction', label: 'fraction_0_1' },
                            ],
                            default: 'percent',
                        },
                        {
                            name: 'weatherConditionOid',
                            label: 'weather_condition_oid',
                            type: 'id',
                            default: '',
                        },
                        {
                            name: 'weatherTemperatureOid',
                            label: 'weather_temperature_oid',
                            type: 'id',
                            default: '',
                        },
                    ],
                },
                {
                    name: 'windows',
                    label: 'sunlight_windows',
                    indexFrom: 1,
                    indexTo: 'windowCount',
                    fields: [
                        { name: 'windowStartX', label: 'window_start_x', type: 'number', default: 0 },
                        { name: 'windowStartY', label: 'window_start_y', type: 'number', default: 0 },
                        { name: 'windowEndX', label: 'window_end_x', type: 'number', default: 0 },
                        { name: 'windowEndY', label: 'window_end_y', type: 'number', default: 0 },
                        { name: 'windowAzimuth', label: 'window_azimuth', type: 'number', min: 0, max: 359, default: 163 },
                        { name: 'windowHeightMeters', label: 'window_height_meters', type: 'number', min: 0.1, step: 0.05, default: 1.35 },
                        { name: 'windowSillHeightMeters', label: 'window_sill_height_meters', type: 'number', min: 0, step: 0.05, default: 0.9 },
                        {
                            name: 'roomPolygon',
                            label: 'window_room_polygon',
                            type: 'text',
                            tooltip: 'window_room_polygon_help',
                        },
                        {
                            name: 'blindOid',
                            label: 'blinds_position_oid',
                            type: 'id',
                            default: '',
                            tooltip: 'blinds_position_help',
                        },
                        {
                            name: 'blindMin',
                            label: 'blind_minimum',
                            type: 'number',
                            default: 0,
                            hidden: (data, index) => !data[`blindOid${index}`],
                        },
                        {
                            name: 'blindMax',
                            label: 'blind_maximum',
                            type: 'number',
                            default: 100,
                            hidden: (data, index) => !data[`blindOid${index}`],
                        },
                        {
                            name: 'blindInvert',
                            label: 'blind_invert',
                            type: 'checkbox',
                            default: false,
                            hidden: (data, index) => !data[`blindOid${index}`],
                        },
                    ],
                },
            ],
            visDefaultStyle: { width: 700, height: 760, position: 'relative' },
            visPrev: 'widgets/vis-2-widgets-nils-fork/img/prev_sunlight_floorplan.svg',
        };
    }

    getWidgetInfo(): RxWidgetInfo {
        return SunlightFloorplan.getWidgetInfo();
    }

    private stateValue(oid: string): unknown {
        return oid ? this.state.values[`${oid}.val`] : undefined;
    }

    private numericValue(oid: string): number | undefined {
        const value = this.stateValue(oid);
        if (value === undefined || value === null || value === '') {
            return undefined;
        }
        const number = Number(value);
        return Number.isFinite(number) ? number : undefined;
    }

    private translated(key: string): string {
        return Generic.t(key).replace('vis_2_widgets_nils_', '');
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);

        const data = this.state.rxData;
        const floor = floorplans[data.floorplan] || floorplans.eg;
        const sunAzimuth = this.numericValue(data.sunAzimuthOid);
        const sunElevation = this.numericValue(data.sunElevationOid);
        const conditionValue = this.stateValue(data.weatherConditionOid);
        const temperature = this.numericValue(data.weatherTemperatureOid);
        const condition = typeof conditionValue === 'string' ? conditionValue : undefined;
        const radiation = this.numericValue(data.weatherRadiationOid);
        const factors = calculateSunlightFactors(
            this.stateValue(data.weatherSunFactorOid),
            this.stateValue(data.weatherCloudinessOid),
            condition,
            data.cloudinessScale === 'fraction',
            radiation,
            Number(data.radiationReference) || 1000,
            data.sunlightSource === 'cloudiness' ? 'cloudiness' : 'radiation',
        );
        const windowCount = Math.min(16, Math.max(0, Number(data.windowCount) || 0));
        const svgUnitsPerMeter = Math.max(1, Number(data.svgUnitsPerMeter) || 50);
        const maximumProjection = Math.max(1, Number(data.maximumProjection) || 650);
        const roomHeightMeters = Math.max(1, Number(data.roomHeightMeters) || 2.5);
        const floorTopAzimuth = Number(data.floorTopAzimuth ?? 163);
        const beams: RenderedBeam[] = [];
        const ambientByRoom = new Map<string, RenderedAmbient>();
        let configuredWindowCount = 0;
        const solarAmbientFactor =
            sunElevation === undefined ? 1 : Math.max(0, Math.min(1, (sunElevation + 0.5) / 2.5));

        const activeWindowIndices = new Set<number>();
        for (let index = 1; index <= windowCount; index++) {
            const startX = Number(data[`windowStartX${index}`]);
            const startY = Number(data[`windowStartY${index}`]);
            const endX = Number(data[`windowEndX${index}`]);
            const endY = Number(data[`windowEndY${index}`]);
            const windowAzimuth = Number(data[`windowAzimuth${index}`]);
            const roomPolygon = parseRoomPolygon(data[`roomPolygon${index}`]);
            const blindOid = data[`blindOid${index}`];
            if (![startX, startY, endX, endY, windowAzimuth].every(Number.isFinite) || roomPolygon.length < 3) {
                continue;
            }
            configuredWindowCount++;

            const window: Parameters<typeof calculateSunlightBeam>[0] = {
                startX,
                startY,
                endX,
                endY,
                azimuth: windowAzimuth,
                roomPolygon,
                blindValue: this.stateValue(blindOid),
                blindStateConfigured: Boolean(blindOid),
                blindMin: Number(data[`blindMin${index}`] ?? 0),
                blindMax: Number(data[`blindMax${index}`] ?? 100),
                blindInvert: data[`blindInvert${index}`] === true || data[`blindInvert${index}`] === 'true',
                windowHeightMeters: Number(data[`windowHeightMeters${index}`] ?? 1.35),
                windowSillHeightMeters: Number(data[`windowSillHeightMeters${index}`] ?? 0.9),
                roomHeightMeters,
            };
            const openFraction = normalizeBlindOpenFactorForWindow(window);
            const roomKey = roomPolygon.map(point => `${point[0]},${point[1]}`).join(' ');
            const roomDiffuse = Math.min(
                0.38,
                (factors.diffuse * 1.1 + factors.direct * 0.05) * (0.1 + 0.9 * openFraction) * solarAmbientFactor,
            );
            if (roomDiffuse > 0.005) {
                const previous = ambientByRoom.get(roomKey);
                ambientByRoom.set(roomKey, {
                    clipPoints: roomPolygon,
                    opacity: 1 - (1 - (previous?.opacity || 0)) * (1 - roomDiffuse),
                });
            }

            if (sunAzimuth !== undefined && sunElevation !== undefined) {
                const beam = calculateSunlightBeam(
                    window,
                    sunAzimuth,
                    sunElevation,
                    floorTopAzimuth,
                    factors.direct,
                    factors.skyClarity,
                    svgUnitsPerMeter,
                    maximumProjection,
                );
                if (beam) {
                    beams.push({ ...beam, previousPoints: this.previousBeamPoints.get(index) });
                    this.previousBeamPoints.set(index, beam.points);
                    activeWindowIndices.add(index);
                }
            }
        }
        for (const index of this.previousBeamPoints.keys()) {
            if (!activeWindowIndices.has(index)) {
                this.previousBeamPoints.delete(index);
            }
        }

        const noCard = Boolean(data.noCard === true || data.noCard === 'true' || props.widget.usedInWidget);
        const ambient = [...ambientByRoom.values()];
        return (
            <SunlightFloorplanContent
                svg={floor.svg}
                beams={beams}
                ambient={ambient}
                id={props.id}
                title={String(data.widgetTitle || this.translated('sunlight_floorplan'))}
                floorName={floor.label}
                sunAzimuth={sunAzimuth}
                sunElevation={sunElevation}
                directFactor={factors.direct}
                diffuseStrength={factors.diffuse}
                radiation={radiation}
                weatherCondition={condition}
                temperature={temperature}
                windowCount={windowCount}
                configuredWindowCount={configuredWindowCount}
                noCard={noCard}
                labels={{
                    direct: this.translated('direct_light'),
                    diffuse: this.translated('diffuse_light'),
                    sunDataMissing: this.translated('sun_data_missing'),
                    sunBelowHorizon: this.translated('sun_below_horizon'),
                    configureWindows: this.translated('configure_sunlight_windows'),
                    weatherUnavailable: this.translated('weather_unavailable'),
                    sunPosition: this.translated('sun_position'),
                }}
            />
        );
    }
}
