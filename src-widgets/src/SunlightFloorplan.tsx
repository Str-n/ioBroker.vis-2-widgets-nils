import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';

import Generic from './Generic';
import {
    calculateSunlightBeam,
    calculateSunlightFactors,
    inferWindowAzimuthFromRoomBoundary,
    normalizeBlindOpenFactorForWindow,
    numericStateValue,
    pointsAttribute,
    polygonArea,
    isPointInPolygon,
    smallestAngularDifference,
    snapPointToRoomBoundary,
    splitWindowIntoSashes,
    sunlightColor,
} from './SunlightUtils';
import SunlightFloorplanEditor from './SunlightFloorplanEditor';
import { parseFloorplanGeometries, type FloorplanGeometries } from './SunlightFloorplanConfig';
import egSvg from '../public/floorplans/eg.svg?raw';
import ogSvg from '../public/floorplans/og.svg?raw';
import dgSvg from '../public/floorplans/dg.svg?raw';
import basementSvg from '../public/floorplans/basement.svg?raw';
import '../public/smarthome.css';
import './SunlightFloorplan.css';

interface SunlightRxData extends Record<string, any> {
    noCard: boolean | 'true';
    floorplan: string;
    floorTopAzimuth: number | string;
    sunAzimuthOid: string;
    sunElevationOid: string;
    weatherSunFactorOid: string;
    weatherCloudinessOid: string;
    weatherConditionOid: string;
    weatherRadiationOid: string;
    sunlightSource: 'cloudiness' | 'radiation';
    cloudinessScale: 'percent' | 'fraction';
    radiationReference: number | string;
    svgUnitsPerMeter: number | string;
    maximumProjection: number | string;
    roomHeightMeters: number | string;
    floorConfigurations: string;
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
    floorPaths: Array<Array<[number, number]>>;
    clipPoints: Array<[number, number]>;
    strength: number;
    softness: number;
}

interface RenderedAmbient {
    clipPoints: Array<[number, number]>;
    opacity: number;
}

interface RenderedReflection {
    clipPoints: Array<[number, number]>;
    point: [number, number];
    radius: number;
    opacity: number;
    color: string;
}

interface RenderedLightBubble {
    clipPoints: Array<[number, number]>;
    x: number;
    y: number;
    radius: number;
    glowOpacity: number;
    roomOpacity: number;
}

function isLightStateOn(value: unknown): boolean {
    return value === true || value === 1 || value === 'true' || value === '1';
}

function positiveSetting(value: unknown, fallback: number): number {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : fallback;
}

const estimatedUsefulLampOutput = 0.55;
const luxForHalfLampImpact = 65;

function renderFloorplan(
    svg: string,
    beams: RenderedBeam[],
    ambient: RenderedAmbient[],
    reflections: RenderedReflection[],
    lightBubbles: RenderedLightBubble[],
    id: string,
    color: string,
): string {
    svg = svg.replace(/preserveAspectRatio="[^"]*"/, 'preserveAspectRatio="xMidYMid meet"');
    if (!beams.length && !ambient.length && !reflections.length && !lightBubbles.length) {
        return svg;
    }

    const safeId = `sun-${Array.from(id, char => char.codePointAt(0)!.toString(16)).join('-')}`;
    const ambientDefinitions = ambient
        .map(
            (room, index) =>
                `<clipPath id="${safeId}-sun-room-ambient-${index}" clipPathUnits="userSpaceOnUse"><polygon points="${pointsAttribute(room.clipPoints)}" /></clipPath><radialGradient id="${safeId}-sun-diffuse-${index}" cx="45%" cy="42%" r="85%"><stop offset="0" stop-color="#e8f1f2" stop-opacity="0.9" /><stop offset="1" stop-color="#b4ced8" stop-opacity="0.22" /></radialGradient>`,
        )
        .join('');
    const reflectionDefinitions = reflections
        .map(
            (reflection, index) =>
                `<clipPath id="${safeId}-sun-reflection-room-${index}" clipPathUnits="userSpaceOnUse"><polygon points="${pointsAttribute(reflection.clipPoints)}" /></clipPath><radialGradient id="${safeId}-sun-reflection-${index}" gradientUnits="userSpaceOnUse" cx="${reflection.point[0].toFixed(2)}" cy="${reflection.point[1].toFixed(2)}" r="${reflection.radius.toFixed(2)}"><stop offset="0" stop-color="${reflection.color}" stop-opacity="0.76" /><stop offset="0.38" stop-color="${reflection.color}" stop-opacity="0.34" /><stop offset="1" stop-color="${reflection.color}" stop-opacity="0" /></radialGradient>`,
        )
        .join('');
    const lightDefinitions = lightBubbles
        .map(
            (light, index) =>
                `<clipPath id="${safeId}-light-room-${index}" clipPathUnits="userSpaceOnUse"><polygon points="${pointsAttribute(light.clipPoints)}" /></clipPath><radialGradient id="${safeId}-light-glow-${index}" gradientUnits="userSpaceOnUse" cx="${light.x.toFixed(2)}" cy="${light.y.toFixed(2)}" r="${light.radius.toFixed(2)}"><stop offset="0" stop-color="#ffe9b5" stop-opacity="0.94" /><stop offset="0.28" stop-color="#ffd27e" stop-opacity="0.68" /><stop offset="0.7" stop-color="#ffbf68" stop-opacity="0.25" /><stop offset="1" stop-color="#ffb45c" stop-opacity="0" /></radialGradient>`,
        )
        .join('');
    const beamDefinitions = beams
        .map((beam, index) => {
            const nearX = (beam.points[0][0] + beam.points[1][0]) / 2;
            const nearY = (beam.points[0][1] + beam.points[1][1]) / 2;
            const farX = (beam.points[2][0] + beam.points[3][0]) / 2;
            const farY = (beam.points[2][1] + beam.points[3][1]) / 2;
            const coreSoftness = Math.max(0.6, beam.softness * 0.26);
            const minX = Math.min(...beam.points.map(point => point[0]));
            const minY = Math.min(...beam.points.map(point => point[1]));
            const width = Math.max(...beam.points.map(point => point[0])) - minX;
            const height = Math.max(...beam.points.map(point => point[1])) - minY;
            const glowPadding = beam.softness * 3;
            const corePadding = coreSoftness * 3;
            return `<clipPath id="${safeId}-sun-room-${index}" clipPathUnits="userSpaceOnUse"><polygon points="${pointsAttribute(beam.clipPoints)}" /></clipPath><linearGradient id="${safeId}-sun-direct-${index}" gradientUnits="userSpaceOnUse" x1="${nearX.toFixed(2)}" y1="${nearY.toFixed(2)}" x2="${farX.toFixed(2)}" y2="${farY.toFixed(2)}"><stop offset="0" stop-color="${color}" stop-opacity="0.96" /><stop offset="1" stop-color="${color}" stop-opacity="0.5" /></linearGradient><filter id="${safeId}-sun-soft-${index}" filterUnits="userSpaceOnUse" x="${(minX - glowPadding).toFixed(2)}" y="${(minY - glowPadding).toFixed(2)}" width="${(width + glowPadding * 2).toFixed(2)}" height="${(height + glowPadding * 2).toFixed(2)}"><feGaussianBlur stdDeviation="${beam.softness.toFixed(2)}" /></filter><filter id="${safeId}-sun-core-${index}" filterUnits="userSpaceOnUse" x="${(minX - corePadding).toFixed(2)}" y="${(minY - corePadding).toFixed(2)}" width="${(width + corePadding * 2).toFixed(2)}" height="${(height + corePadding * 2).toFixed(2)}"><feGaussianBlur stdDeviation="${coreSoftness.toFixed(2)}" /></filter>`;
        })
        .join('');
    const ambientOverlays = ambient
        .map(
            (room, index) =>
                `<polygon class="sh-sunlight-floorplan__ambient" points="${pointsAttribute(room.clipPoints)}" clip-path="url(#${safeId}-sun-room-ambient-${index})" fill="url(#${safeId}-sun-diffuse-${index})" opacity="${room.opacity.toFixed(3)}" />`,
        )
        .join('');
    const reflectedOverlays = reflections
        .map(
            (reflection, index) =>
                `<polygon class="sh-sunlight-floorplan__reflection" points="${pointsAttribute(reflection.clipPoints)}" clip-path="url(#${safeId}-sun-reflection-room-${index})" fill="url(#${safeId}-sun-reflection-${index})" opacity="${reflection.opacity.toFixed(3)}" />`,
        )
        .join('');
    const lightOverlays = lightBubbles
        .map(
            (light, index) =>
                `<polygon class="sh-sunlight-floorplan__light-room" points="${pointsAttribute(light.clipPoints)}" clip-path="url(#${safeId}-light-room-${index})" fill="#ffd99a" opacity="${light.roomOpacity.toFixed(3)}" /><circle class="sh-sunlight-floorplan__light-glow" cx="${light.x.toFixed(2)}" cy="${light.y.toFixed(2)}" r="${light.radius.toFixed(2)}" clip-path="url(#${safeId}-light-room-${index})" fill="url(#${safeId}-light-glow-${index})" opacity="${light.glowOpacity.toFixed(3)}" />`,
        )
        .join('');
    const beamOverlays = beams
        .map((beam, index) => {
            const path = beam.floorPaths.map(points => `M${pointsAttribute(points).replace(/ /g, 'L')}Z`).join('');
            const opacity = Math.min(0.86, Math.sqrt(beam.strength) * 0.94);
            if (!path) {
                return '';
            }
            return `<path class="sh-sunlight-floorplan__beam-glow" d="${path}" clip-path="url(#${safeId}-sun-room-${index})" filter="url(#${safeId}-sun-soft-${index})" fill="url(#${safeId}-sun-direct-${index})" opacity="${(opacity * 0.28).toFixed(3)}" /><path class="sh-sunlight-floorplan__beam" d="${path}" clip-path="url(#${safeId}-sun-room-${index})" filter="url(#${safeId}-sun-core-${index})" fill="url(#${safeId}-sun-direct-${index})" opacity="${opacity.toFixed(3)}" />`;
        })
        .join('');

    const withDefinitions = svg.replace(
        /(<svg\b[^>]*>)/,
        `$1<defs>${ambientDefinitions}${reflectionDefinitions}${lightDefinitions}${beamDefinitions}</defs>`,
    );
    return withDefinitions.replace(
        '<g class="sh-floorplan-walls">',
        `${ambientOverlays}${lightOverlays}${reflectedOverlays}${beamOverlays}<g class="sh-floorplan-walls">`,
    );
}

function SunlightFloorplanContent(props: {
    svg: string;
    beams: RenderedBeam[];
    ambient: RenderedAmbient[];
    reflections: RenderedReflection[];
    lightBubbles: RenderedLightBubble[];
    id: string;
    sunAzimuth?: number;
    sunElevation?: number;
    windowCount: number;
    configuredWindowCount: number;
    noCard: boolean;
    labels: {
        configureWindows: string;
        floorplan: string;
    };
}): React.JSX.Element {
    const hasSunPosition = props.sunAzimuth !== undefined && props.sunElevation !== undefined;
    const isNight = props.sunElevation !== undefined && props.sunElevation <= 0;
    const hasUnconfiguredWindows = props.windowCount === 0 || props.configuredWindowCount < props.windowCount;
    const status = !isNight && hasSunPosition && hasUnconfiguredWindows ? props.labels.configureWindows : undefined;

    return (
        <section className={`sh-sunlight-floorplan${props.noCard ? ' sh-sunlight-floorplan--bare' : ''}`}>
            {status ? (
                <div
                    className="sh-sunlight-floorplan__status"
                    role="status"
                >
                    {status}
                </div>
            ) : null}
            <div
                className="sh-sunlight-floorplan__drawing"
                role="img"
                aria-label={props.labels.floorplan}
            >
                <div
                    dangerouslySetInnerHTML={{
                        __html: renderFloorplan(
                            props.svg,
                            props.beams,
                            props.ambient,
                            props.reflections,
                            props.lightBubbles,
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

    private configuredStateValues = new Map<string, unknown>();
    private subscribedStateOids = new Set<string>();
    private geometrySource: unknown;
    private geometries: FloorplanGeometries = {};

    private floorGeometries(): FloorplanGeometries {
        const source = this.state.rxData.floorConfigurations;
        if (source !== this.geometrySource) {
            this.geometrySource = source;
            this.geometries = parseFloorplanGeometries(source);
        }
        return this.geometries;
    }

    private onConfiguredStateChange = (id: string, state: ioBroker.State | null | undefined): void => {
        if (!this.subscribedStateOids.has(id)) {
            return;
        }
        if (state) {
            this.configuredStateValues.set(id, state.val);
        } else {
            this.configuredStateValues.set(id, undefined);
        }
        this.forceUpdate();
    };

    componentDidMount(): void {
        super.componentDidMount();
        this.updateConfiguredStateSubscriptions();
    }

    componentDidUpdate(prevProps: VisRxWidgetProps, prevState: typeof this.state): void {
        super.componentDidUpdate(prevProps, prevState);
        if (prevState.rxData.floorConfigurations !== this.state.rxData.floorConfigurations) {
            this.updateConfiguredStateSubscriptions();
        }
    }

    componentWillUnmount(): void {
        const subscribedOids = [...this.subscribedStateOids];
        if (subscribedOids.length) {
            this.props.context.socket.unsubscribeState(subscribedOids, this.onConfiguredStateChange);
        }
        this.subscribedStateOids.clear();
        this.configuredStateValues.clear();
        super.componentWillUnmount();
    }

    private updateConfiguredStateSubscriptions(): void {
        const geometries = this.floorGeometries();
        const configuredOids = new Set(
            Object.values(geometries)
                .flatMap(geometry => [
                    ...geometry.windows.map(window => window.blindOid.trim()),
                    ...geometry.lightBubbles.map(light => light.statusOid.trim()),
                ])
                .filter(oid => oid && oid !== 'nothing_selected'),
        );
        const removedOids = [...this.subscribedStateOids].filter(oid => !configuredOids.has(oid));
        if (removedOids.length) {
            this.props.context.socket.unsubscribeState(removedOids, this.onConfiguredStateChange);
            removedOids.forEach(oid => {
                this.subscribedStateOids.delete(oid);
                this.configuredStateValues.delete(oid);
            });
        }

        const addedOids = [...configuredOids].filter(oid => !this.subscribedStateOids.has(oid));
        if (addedOids.length) {
            addedOids.forEach(oid => this.subscribedStateOids.add(oid));
            void this.props.context.socket.subscribeState(addedOids, this.onConfiguredStateChange).catch(error => {
                console.warn('SunlightFloorplan: could not subscribe to configured states', error);
            });
        }
    }

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
                        {
                            name: 'floorplan',
                            label: 'floor_plan',
                            type: 'select',
                            options: Object.entries(floorplans).map(([value, floor]) => ({
                                value,
                                label: floor.label,
                            })),
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
                        {
                            name: 'floorConfigurations',
                            label: 'floorplan_geometry_editor',
                            type: 'custom',
                            default: '{}',
                            component: (_field, data, onDataChange) => (
                                <SunlightFloorplanEditor
                                    data={data}
                                    onDataChange={onDataChange}
                                    floors={floorplans}
                                />
                            ),
                        },
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
        if (!oid) {
            return undefined;
        }
        return this.configuredStateValues.has(oid)
            ? this.configuredStateValues.get(oid)
            : this.state.values[`${oid}.val`];
    }

    private numericValue(oid: string): number | undefined {
        return numericStateValue(this.stateValue(oid));
    }

    private translated(key: string): string {
        return Generic.t(key).replace('vis_2_widgets_nils_', '');
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);

        const data = this.state.rxData;
        const floorKey = Object.prototype.hasOwnProperty.call(floorplans, data.floorplan) ? data.floorplan : 'eg';
        const floor = floorplans[floorKey];
        const sunAzimuth = this.numericValue(data.sunAzimuthOid);
        const sunElevation = this.numericValue(data.sunElevationOid);
        const conditionValue = this.stateValue(data.weatherConditionOid);
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
        const floorGeometry = this.floorGeometries()[floorKey] || {
            rooms: [],
            windows: [],
            lightBubbles: [],
        };
        const windowCount = floorGeometry.windows.length;
        const svgUnitsPerMeter = positiveSetting(data.svgUnitsPerMeter, 50);
        const maximumProjection = positiveSetting(data.maximumProjection, 650);
        const roomHeightMeters = positiveSetting(data.roomHeightMeters, 2.5);
        const configuredAzimuth = Number(data.floorTopAzimuth ?? 163);
        const floorTopAzimuth = Number.isFinite(configuredAzimuth) ? configuredAzimuth : 163;
        const beams: RenderedBeam[] = [];
        const ambientByRoom = new Map<string, RenderedAmbient>();
        const daylightByRoom = new Map<string, number>();
        const reflections: RenderedReflection[] = [];
        let configuredWindowCount = 0;
        const solarAmbientFactor =
            sunElevation === undefined ? 1 : Math.max(0, Math.min(1, (sunElevation + 0.5) / 2.5));

        for (let index = 1; index <= windowCount; index++) {
            const configuredWindow = floorGeometry.windows[index - 1];
            const roomIndex = configuredWindow.roomIndex;
            const roomPolygon = floorGeometry.rooms[roomIndex - 1]?.points || [];
            const centerX = configuredWindow.centerX;
            const centerY = configuredWindow.centerY;
            const widthX = configuredWindow.widthX;
            const widthY = configuredWindow.widthY;
            const hasNewGeometry =
                [centerX, centerY, widthX, widthY].every(Number.isFinite) && Math.hypot(widthX, widthY) > 0;
            const tolerance = Math.max(5, Math.hypot(widthX, widthY) * 0.08);
            const [startX, startY] = snapPointToRoomBoundary(
                [centerX - widthX / 2, centerY - widthY / 2],
                roomPolygon,
                tolerance,
            );
            const [endX, endY] = snapPointToRoomBoundary(
                [centerX + widthX / 2, centerY + widthY / 2],
                roomPolygon,
                tolerance,
            );
            const windowAzimuth = inferWindowAzimuthFromRoomBoundary(
                centerX,
                centerY,
                widthX,
                widthY,
                roomPolygon,
                floorTopAzimuth,
            );
            if (
                !hasNewGeometry ||
                ![startX, startY, endX, endY].every(Number.isFinite) ||
                windowAzimuth === undefined ||
                !Number.isFinite(windowAzimuth) ||
                roomPolygon.length < 3
            ) {
                continue;
            }
            configuredWindowCount++;

            const blindOid = configuredWindow.blindOid.trim();
            const window: Parameters<typeof calculateSunlightBeam>[0] = {
                startX,
                startY,
                endX,
                endY,
                azimuth: windowAzimuth,
                roomPolygon,
                blindValue: this.stateValue(blindOid),
                blindStateConfigured: Boolean(blindOid && blindOid !== 'nothing_selected'),
                blindMin: configuredWindow.blindMin,
                blindMax: configuredWindow.blindMax,
                blindInvert: configuredWindow.blindInvert,
                windowHeightMeters: configuredWindow.windowHeightMeters,
                windowSillHeightMeters: configuredWindow.windowSillHeightMeters,
                roomHeightMeters,
            };
            const openFraction = normalizeBlindOpenFactorForWindow(window);
            const roomKey = roomPolygon.map(point => `${point[0]},${point[1]}`).join(' ');
            const roomAreaMeters = Math.max(1, polygonArea(roomPolygon) / svgUnitsPerMeter ** 2);
            const apertureArea =
                (Math.hypot(endX - startX, endY - startY) / svgUnitsPerMeter) *
                Math.max(
                    0,
                    Math.min(
                        configuredWindow.windowHeightMeters * openFraction,
                        roomHeightMeters - configuredWindow.windowSillHeightMeters,
                    ),
                );
            const glazingRatio = apertureArea / roomAreaMeters;
            const facing =
                sunAzimuth === undefined
                    ? 0
                    : Math.max(0, Math.cos((smallestAngularDifference(windowAzimuth, sunAzimuth) * Math.PI) / 180));
            const belowDirectSunlightCutoff =
                sunElevation !== undefined && sunElevation < configuredWindow.directSunlightElevationCutoffDegrees;
            const indirectSunlight =
                factors.diffuse + factors.direct * (belowDirectSunlightCutoff ? 0.08 : facing * 0.08);
            const diffuseEnergy = indirectSunlight * solarAmbientFactor;
            const roomDiffuse = 0.34 * (1 - Math.exp(-glazingRatio * 5 * diffuseEnergy));
            if (roomDiffuse > 0.001) {
                const previous = ambientByRoom.get(roomKey);
                ambientByRoom.set(roomKey, {
                    clipPoints: roomPolygon,
                    opacity: 1 - (1 - (previous?.opacity || 0)) * (1 - roomDiffuse),
                });
            }
            const directDaylight = belowDirectSunlightCutoff ? factors.direct * 0.08 : factors.direct * facing;
            const windowDaylight = glazingRatio * 9 * (factors.diffuse + directDaylight) * solarAmbientFactor;
            daylightByRoom.set(roomKey, (daylightByRoom.get(roomKey) || 0) + windowDaylight);

            if (!belowDirectSunlightCutoff && sunAzimuth !== undefined && sunElevation !== undefined) {
                const sashCount = Math.max(1, Math.min(3, configuredWindow.windowSashCount));
                const wholeWindowLength = Math.hypot(window.endX - window.startX, window.endY - window.startY);
                splitWindowIntoSashes(window, sashCount, Math.max(1, svgUnitsPerMeter * 0.025)).forEach(sash => {
                    const beam = calculateSunlightBeam(
                        sash,
                        sunAzimuth,
                        sunElevation,
                        floorTopAzimuth,
                        factors.direct,
                        factors.skyClarity,
                        svgUnitsPerMeter,
                        maximumProjection,
                    );
                    if (beam) {
                        beams.push(beam);

                        if (beam.wallReflection && wholeWindowLength > 0) {
                            const sashFraction =
                                Math.hypot(sash.endX - sash.startX, sash.endY - sash.startY) / wholeWindowLength;
                            const reflectedEnergy =
                                beam.strength * beam.wallReflection.fraction * openFraction * sashFraction;
                            if (reflectedEnergy > 0.005) {
                                reflections.push({
                                    clipPoints: roomPolygon,
                                    point: beam.wallReflection.point,
                                    radius: svgUnitsPerMeter * (1.65 + beam.wallReflection.fraction * 0.6),
                                    opacity: Math.min(0.42, reflectedEnergy * 1.8),
                                    color: sunlightColor(sunElevation),
                                });

                                const reflectedAmbient = Math.min(0.06, reflectedEnergy * 0.16);
                                const previousAmbient = ambientByRoom.get(roomKey);
                                ambientByRoom.set(roomKey, {
                                    clipPoints: roomPolygon,
                                    opacity: 1 - (1 - (previousAmbient?.opacity || 0)) * (1 - reflectedAmbient),
                                });
                            }
                        }
                    }
                });
            }
        }

        const noCard = Boolean(data.noCard === true || data.noCard === 'true' || props.widget.usedInWidget);
        const ambient = [...ambientByRoom.values()].map(room => ({ ...room, opacity: Math.min(0.36, room.opacity) }));
        const lightBubbles: RenderedLightBubble[] = [];
        for (const light of floorGeometry.lightBubbles) {
            const statusOid = light.statusOid.trim();
            if (!statusOid || statusOid === 'nothing_selected' || !isLightStateOn(this.stateValue(statusOid))) {
                continue;
            }
            const roomPolygon = floorGeometry.rooms[light.roomIndex - 1]?.points;
            if (!roomPolygon || roomPolygon.length < 3 || !isPointInPolygon([light.x, light.y], roomPolygon)) {
                continue;
            }
            const roomKey = roomPolygon.map(point => `${point[0]},${point[1]}`).join(' ');
            const roomAreaMeters = Math.max(1, polygonArea(roomPolygon) / (svgUnitsPerMeter * svgUnitsPerMeter));
            const effectiveLux = (light.brightnessLumens * estimatedUsefulLampOutput) / roomAreaMeters;
            const perceivedBrightness = effectiveLux / (effectiveLux + luxForHalfLampImpact);
            const daylight = 1 - Math.exp(-(daylightByRoom.get(roomKey) || 0));
            // Let electric light register clearly in dim rooms, while sunlight progressively dominates it.
            const daylightRelevance = Math.max(0.06, 1 - 0.92 * Math.pow(daylight, 1.25));
            lightBubbles.push({
                clipPoints: roomPolygon,
                x: light.x,
                y: light.y,
                radius:
                    svgUnitsPerMeter * Math.max(1.2, Math.min(5, 0.8 + 1.6 * Math.sqrt(light.brightnessLumens / 800))),
                glowOpacity: Math.min(
                    0.58,
                    0.65 * Math.sqrt(light.brightnessLumens / (light.brightnessLumens + 800)) * daylightRelevance,
                ),
                roomOpacity: Math.min(0.18, 0.22 * perceivedBrightness * daylightRelevance),
            });
        }
        return (
            <SunlightFloorplanContent
                svg={floor.svg}
                beams={beams}
                ambient={ambient}
                reflections={reflections}
                lightBubbles={lightBubbles}
                id={props.id}
                sunAzimuth={sunAzimuth}
                sunElevation={sunElevation}
                windowCount={windowCount}
                configuredWindowCount={configuredWindowCount}
                noCard={noCard}
                labels={{
                    configureWindows: this.translated('configure_sunlight_windows'),
                    floorplan: `${this.translated('sunlight_floorplan')} · ${floor.label}`,
                }}
            />
        );
    }
}
