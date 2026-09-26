import React from 'react';
import type { RxRenderWidgetProps, RxWidgetInfo } from '@iobroker/types-vis-2';
import Generic from './Generic';
import { calculateSunlightFactors, clamp, numericStateValue } from './SunlightUtils';
import { sunChartPoint, sunDay, sunPath, sunPositionBindings, todayTimestamp } from './SunPositionUtils';
import '../public/smarthome.css';
import './SunPosition.css';

interface SunPositionData extends Record<string, any> {
    noCard: boolean | 'true';
    sunlightSource: 'radiation' | 'cloudiness';
    radiationReference: number | string;
    cloudinessScale: 'percent' | 'fraction';
}

export default class SunPosition extends Generic<SunPositionData> {
    static smartHomeTheme = true;

    private clockTimer: ReturnType<typeof setInterval> | undefined;

    componentDidMount(): void {
        super.componentDidMount();
        // Advance along the time axis and invalidate yesterday's path even when states are silent.
        this.clockTimer = setInterval(() => this.forceUpdate(), 30_000);
    }

    componentWillUnmount(): void {
        clearInterval(this.clockTimer);
        super.componentWillUnmount();
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplNils2SunPosition',
            visSet: 'vis-2-widgets-nils-fork',
            visName: 'Sun position',
            visWidgetLabel: 'sun_position',
            visPrev: 'widgets/vis-2-widgets-nils-fork/img/prev_sun_position.svg',
            visDefaultStyle: { width: 370, height: 150, position: 'relative' },
            visAttrs: [
                {
                    name: 'common',
                    fields: [{ name: 'noCard', label: 'without_card', type: 'checkbox', default: false }],
                },
                {
                    name: 'sun_data',
                    label: 'sun_data',
                    fields: [
                        ...Object.entries(sunPositionBindings)
                            .filter(([name]) => !name.startsWith('weather'))
                            .map(([name, value]) => ({
                                name,
                                type: 'id' as const,
                                default: value,
                                label:
                                    (
                                        {
                                            sunAzimuthOid: 'sun_azimuth_oid',
                                            sunElevationOid: 'sun_elevation_oid',
                                        } as Record<string, string>
                                    )[name] || `sun_position_${name}`,
                            })),
                    ],
                },
                {
                    name: 'sun_position_weather',
                    label: 'sun_position_weather',
                    fields: [
                        {
                            name: 'sunlightSource',
                            label: 'sunlight_weather_source',
                            type: 'select',
                            default: 'radiation',
                            options: [
                                { value: 'radiation', label: 'outdoor_radiation' },
                                { value: 'cloudiness', label: 'weather_cloudiness' },
                            ],
                        },
                        {
                            name: 'weatherRadiationOid',
                            label: 'outdoor_radiation_oid',
                            type: 'id',
                            default: sunPositionBindings.weatherRadiationOid,
                        },
                        {
                            name: 'radiationReference',
                            label: 'radiation_reference_wm2',
                            type: 'number',
                            min: 1,
                            default: 1000,
                        },
                        {
                            name: 'weatherCloudinessOid',
                            label: 'weather_cloudiness_oid',
                            type: 'id',
                            default: sunPositionBindings.weatherCloudinessOid,
                        },
                        {
                            name: 'cloudinessScale',
                            label: 'cloudiness_scale',
                            type: 'select',
                            default: 'percent',
                            options: [
                                { value: 'percent', label: 'percent' },
                                { value: 'fraction', label: 'fraction_0_1' },
                            ],
                        },
                        {
                            name: 'weatherConditionOid',
                            label: 'weather_condition_oid',
                            type: 'id',
                            default: sunPositionBindings.weatherConditionOid,
                        },
                        {
                            name: 'weatherSunFactorOid',
                            label: 'weather_sun_factor_oid',
                            type: 'id',
                            default: '',
                            tooltip: 'weather_sun_factor_oid_help',
                        },
                    ],
                },
            ],
        };
    }

    getWidgetInfo(): RxWidgetInfo {
        return SunPosition.getWidgetInfo();
    }

    private translated(key: string): string {
        return Generic.t(key).replace('vis_2_widgets_nils_', '');
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const data = this.state.rxData;
        const value = (name: keyof typeof sunPositionBindings): unknown => this.state.values[`${data[name]}.val`];
        const now = Date.now();
        const day = sunDay(
            value('sunriseOid'),
            value('solarNoonOid'),
            value('sunsetOid'),
            value('noonElevationOid'),
            now,
        );
        const rawElevation = numericStateValue(value('sunElevationOid'));
        const elevation = rawElevation !== undefined && Math.abs(rawElevation) <= 90 ? rawElevation : undefined;
        const rawAzimuth = numericStateValue(value('sunAzimuthOid'));
        const azimuth = rawAzimuth === undefined ? undefined : ((rawAzimuth % 360) + 360) % 360;
        const radiation = numericStateValue(value('weatherRadiationOid'));
        const clouds = numericStateValue(value('weatherCloudinessOid'));
        const cloudPercent =
            clouds === undefined ? undefined : clamp(clouds * (data.cloudinessScale === 'fraction' ? 100 : 1), 0, 100);
        const factors = calculateSunlightFactors(
            value('weatherSunFactorOid'),
            value('weatherCloudinessOid'),
            value('weatherConditionOid'),
            data.cloudinessScale === 'fraction',
            radiation,
            Number(data.radiationReference) || 1000,
            data.sunlightSource === 'cloudiness' ? 'cloudiness' : 'radiation',
        );
        const night = elevation !== undefined && elevation <= 0;
        const marker =
            day && elevation !== undefined && !night && now >= day.sunrise && now <= day.sunset
                ? sunChartPoint(day, now, elevation)
                : undefined;
        const path = day ? sunPath(day) : '';
        const id = `sun-position-${Array.from(this.props.id, char => char.codePointAt(0)!.toString(16)).join('-')}`;
        const t = (key: string): string => this.translated(key);
        const time = (input: unknown): string => {
            const timestamp = todayTimestamp(input, now);
            return timestamp === undefined
                ? '–'
                : new Intl.DateTimeFormat(Generic.getLanguage(), { hour: '2-digit', minute: '2-digit' }).format(
                      timestamp,
                  );
        };
        const degrees = (input: number | undefined): string =>
            input === undefined ? '–' : `${this.formatValue(input, 0)}°`;
        const status =
            elevation === undefined ? 'sun_position_unavailable' : night ? 'sun_position_night' : 'sun_position_today';

        return (
            <div
                className={`sh-sun-position${data.noCard === true || data.noCard === 'true' ? ' sh-sun-position--bare' : ''}${night ? ' sh-sun-position--night' : ''}`}
            >
                <svg
                    viewBox="0 0 370 150"
                    role="img"
                    aria-labelledby={`${id}-title ${id}-description`}
                >
                    <title id={`${id}-title`}>{t('sun_position')}</title>
                    <desc
                        id={`${id}-description`}
                    >{`${t(status)}. ${t('sun_position_azimuth')}: ${degrees(azimuth)}. ${t('sun_position_elevation')}: ${degrees(elevation)}. ${t('sun_position_path_help')}`}</desc>
                    <defs>
                        <linearGradient
                            id={`${id}-fill`}
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                        >
                            <stop
                                offset="0"
                                stopColor="var(--sun-accent)"
                                stopOpacity="0.22"
                            />
                            <stop
                                offset="1"
                                stopColor="var(--sun-accent)"
                                stopOpacity="0.02"
                            />
                        </linearGradient>
                        <radialGradient id={`${id}-glow`}>
                            <stop
                                offset="0"
                                stopColor="var(--sun-accent)"
                                stopOpacity="0.65"
                            />
                            <stop
                                offset="1"
                                stopColor="var(--sun-accent)"
                                stopOpacity="0"
                            />
                        </radialGradient>
                        <clipPath id={`${id}-elapsed`}>
                            <rect
                                x="0"
                                y="30"
                                width={day ? sunChartPoint(day, now, 0)[0] : 0}
                                height="75"
                            />
                        </clipPath>
                    </defs>
                    <text
                        x="14"
                        y="23"
                        className="sh-sun-position__title"
                    >
                        {t('sun_position')}
                    </text>
                    <text
                        x="356"
                        y="23"
                        textAnchor="end"
                        className="sh-sun-position__muted"
                    >
                        {t(status)}
                    </text>
                    <path
                        d="M250 39V115"
                        className="sh-sun-position__divider"
                    />
                    <path
                        d="M24 99H232"
                        className="sh-sun-position__divider"
                    />
                    {day ? (
                        <>
                            <path
                                d={`${path} L232,99 L24,99 Z`}
                                fill={`url(#${id}-fill)`}
                            />
                            <path
                                d={path}
                                className="sh-sun-position__path"
                            />
                            <path
                                d={path}
                                className="sh-sun-position__elapsed"
                                clipPath={`url(#${id}-elapsed)`}
                            />
                            <text
                                x={sunChartPoint(day, day.noon, day.peak)[0]}
                                y="37"
                                textAnchor="middle"
                                className="sh-sun-position__muted"
                            >
                                {degrees(day.peak)}
                            </text>
                            <circle
                                cx="24"
                                cy="99"
                                r="2.5"
                                fill="var(--sun-accent)"
                            />
                            <circle
                                cx="232"
                                cy="99"
                                r="2.5"
                                fill="var(--sun-accent)"
                            />
                        </>
                    ) : (
                        <text
                            x="128"
                            y="72"
                            textAnchor="middle"
                            className="sh-sun-position__muted"
                        >
                            {t('sun_position_path_unavailable')}
                        </text>
                    )}
                    {marker ? (
                        <g
                            className="sh-sun-position__marker"
                            transform={`translate(${marker[0]}, ${marker[1]})`}
                        >
                            <path
                                d={`M0 0V${99 - marker[1]}`}
                                className="sh-sun-position__guide"
                            />
                            <circle
                                r={16 + factors.total * 9}
                                fill={`url(#${id}-glow)`}
                                opacity={0.3 + factors.direct * 0.7}
                            />
                            <g
                                stroke="var(--sun-accent)"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                            >
                                {[0, 45, 90, 135].map(angle => (
                                    <path
                                        key={angle}
                                        d="M0 -12V-9M0 9V12"
                                        transform={`rotate(${angle})`}
                                    />
                                ))}
                            </g>
                            <circle
                                r="6"
                                fill="var(--sun-accent)"
                            />
                            {cloudPercent !== undefined && cloudPercent > 20 ? (
                                <path
                                    d="M-1 8C-5 8-5 2-1 2C-1-4 8-4 9 2C15 1 16 8 11 8Z"
                                    fill="var(--sh-text-secondary)"
                                    opacity={cloudPercent / 100}
                                />
                            ) : null}
                        </g>
                    ) : null}
                    <text
                        x="18"
                        y="117"
                        className="sh-sun-position__time"
                    >
                        ↑ {time(value('sunriseOid'))}
                        <title>{t('sun_position_sunriseOid')}</title>
                    </text>
                    <text
                        x="238"
                        y="117"
                        textAnchor="end"
                        className="sh-sun-position__time"
                    >
                        {time(value('sunsetOid'))} ↓<title>{t('sun_position_sunsetOid')}</title>
                    </text>
                    <text
                        x="266"
                        y="48"
                        className="sh-sun-position__muted"
                    >
                        {t('brightness')}
                    </text>
                    <text
                        x="266"
                        y="69"
                        className="sh-sun-position__metric"
                    >
                        {radiation === undefined || radiation < 0 ? '–' : this.formatValue(radiation, 0)}
                        <tspan className="sh-sun-position__unit"> W/m²</tspan>
                    </text>
                    <text
                        x="266"
                        y="91"
                        className="sh-sun-position__muted"
                    >
                        {t('weather_cloudiness')}
                    </text>
                    <text
                        x="266"
                        y="112"
                        className="sh-sun-position__metric"
                    >
                        {cloudPercent === undefined ? '–' : this.formatValue(cloudPercent, 0)}
                        <tspan className="sh-sun-position__unit"> %</tspan>
                    </text>
                    <text
                        x="14"
                        y="141"
                        className="sh-sun-position__muted"
                    >
                        {t('sun_position_azimuth')}{' '}
                        <tspan className="sh-sun-position__reading">{degrees(azimuth)}</tspan>
                    </text>
                    <text
                        x="238"
                        y="141"
                        textAnchor="end"
                        className="sh-sun-position__muted"
                    >
                        {t('sun_position_elevation')}{' '}
                        <tspan className="sh-sun-position__reading">{degrees(elevation)}</tspan>
                    </text>
                </svg>
            </div>
        );
    }
}
