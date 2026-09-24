import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetState } from '@iobroker/types-vis-2';

import Generic from './Generic';
import {
    calculateSunlightBeam,
    parseRoomPolygon,
    pointsAttribute,
    weatherSunFactor,
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
    clipPoints: Array<[number, number]>;
    strength: number;
}

function renderFloorplan(svg: string, beams: RenderedBeam[], id: string): string {
    if (!beams.length) {
        return svg;
    }

    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const definitions = beams
        .map(
            (beam, index) =>
                `<clipPath id="${safeId}-sun-room-${index}" clipPathUnits="userSpaceOnUse"><polygon points="${pointsAttribute(beam.clipPoints)}" /></clipPath>`,
        )
        .join('');
    const overlays = beams
        .map(
            (beam, index) =>
                `<polygon class="sh-sunlight-floorplan__beam" points="${pointsAttribute(beam.points)}" clip-path="url(#${safeId}-sun-room-${index})" fill="rgba(255,190,87,${(beam.strength * 0.78).toFixed(3)})" />`,
        )
        .join('');

    const withDefinitions = svg.replace(/(<svg\b[^>]*>)/, `$1<defs>${definitions}</defs>`);
    return withDefinitions.replace('<g class="sh-floorplan-walls">', `${overlays}<g class="sh-floorplan-walls">`);
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
    id: string;
    title: string;
    floorName: string;
    sunAzimuth?: number;
    sunElevation?: number;
    sunlightStrength: number;
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
                    {props.temperature === undefined ? null : <strong>{props.temperature.toFixed(1)}°</strong>}
                    <span>{props.labels.daylight}: {Math.round(props.sunlightStrength * 100)}%</span>
                </div>
            </header>
            {status ? <div className="sh-sunlight-floorplan__status" role="status">{status}</div> : null}
            <div className="sh-sunlight-floorplan__drawing">
                <div dangerouslySetInnerHTML={{ __html: renderFloorplan(props.svg, props.beams, props.id) }} />
            </div>
        </section>
    );
}

export default class SunlightFloorplan extends Generic<SunlightRxData, SunlightState> {
    static smartHomeTheme = true;

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
                            default: 'cloudiness',
                        },
                        {
                            name: 'weatherRadiationOid',
                            label: 'outdoor_radiation_oid',
                            type: 'id',
                            default: '0_userdata.0.sunlight.outdoorRadiation',
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
                        { name: 'blindOid', label: 'blinds_position_oid', type: 'id', default: '' },
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
                            label: 'invert',
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
        const factor = weatherSunFactor(
            this.stateValue(data.weatherSunFactorOid),
            this.stateValue(data.weatherCloudinessOid),
            condition,
            data.cloudinessScale === 'fraction',
            this.stateValue(data.weatherRadiationOid),
            Number(data.radiationReference) || 1000,
            data.sunlightSource === 'radiation' ? 'radiation' : 'cloudiness',
        );
        const windowCount = Math.min(16, Math.max(0, Number(data.windowCount) || 0));
        const svgUnitsPerMeter = Math.max(1, Number(data.svgUnitsPerMeter) || 50);
        const maximumProjection = Math.max(1, Number(data.maximumProjection) || 650);
        const roomHeightMeters = Math.max(1, Number(data.roomHeightMeters) || 2.5);
        const floorTopAzimuth = Number(data.floorTopAzimuth ?? 163);
        const beams: RenderedBeam[] = [];
        let configuredWindowCount = 0;

        if (sunAzimuth !== undefined && sunElevation !== undefined) {
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

                const beam = calculateSunlightBeam(
                    {
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
                    },
                    sunAzimuth,
                    sunElevation,
                    floorTopAzimuth,
                    factor,
                    svgUnitsPerMeter,
                    maximumProjection,
                );
                if (beam) {
                    beams.push(beam);
                }
            }
        }

        const noCard = Boolean(data.noCard === true || data.noCard === 'true' || props.widget.usedInWidget);
        return (
            <SunlightFloorplanContent
                svg={floor.svg}
                beams={beams}
                id={props.id}
                title={String(data.widgetTitle || this.translated('sunlight_floorplan'))}
                floorName={floor.label}
                sunAzimuth={sunAzimuth}
                sunElevation={sunElevation}
                sunlightStrength={beams.reduce((strongest, beam) => Math.max(strongest, beam.strength), 0)}
                weatherCondition={condition}
                temperature={temperature}
                windowCount={windowCount}
                configuredWindowCount={configuredWindowCount}
                noCard={noCard}
                labels={{
                    daylight: this.translated('daylight_factor'),
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
