import React from 'react';

// Use style/color on these icons: their bundled MUI sx processor may be newer than the host vis theme.
import { AirRounded, CloudOutlined, WaterDropRounded } from '@mui/icons-material';
import { Box, Tooltip, Typography } from '@mui/material';

import type {
    RxRenderWidgetProps,
    RxWidgetInfo,
    RxWidgetInfoAttributesField,
    VisRxWidgetState,
    WidgetData,
} from '@iobroker/types-vis-2';

import Generic from './Generic';
import { createOpenWeatherMapBindings } from './WeatherUtils';

const setOpenWeatherMapBindings = (
    _field: RxWidgetInfoAttributesField,
    data: WidgetData,
    changeData: (newData: WidgetData) => void,
): Promise<void> => {
    changeData({
        ...data,
        ...createOpenWeatherMapBindings(String(data.instance || 'openweathermap.0')),
    });
    return Promise.resolve();
};

interface WeatherRxData extends Record<string, any> {
    noCard: boolean | 'true';
    widgetTitle: string;
    instance: string;
    locationName: string;
    oidTemperatureOverride: string;
    forecastDays: number | string;
    temperatureDigits: number | string;
    advanced: boolean | 'true';
}

type WeatherState = VisRxWidgetState;

interface ForecastDay {
    date?: number;
    icon?: string;
    description?: string;
    min?: number;
    max?: number;
    precipitation?: number;
}

function WeatherIcon({ src, label, size }: { src?: string; label?: string; size: number }): React.JSX.Element {
    const [failed, setFailed] = React.useState(false);

    React.useEffect(() => setFailed(false), [src]);

    if (!src || failed) {
        return (
            <CloudOutlined
                aria-label={label}
                color="disabled"
                style={{ width: size, height: size }}
            />
        );
    }

    return (
        <Box
            component="img"
            src={src}
            alt={label || ''}
            onError={() => setFailed(true)}
            sx={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
        />
    );
}

export default class Weather extends Generic<WeatherRxData, WeatherState> {
    static getWidgetInfo(): RxWidgetInfo {
        const defaults = createOpenWeatherMapBindings();
        const advancedFields: RxWidgetInfoAttributesField[] = Object.entries(defaults).map(([name, value]) => ({
            name,
            label: name,
            type: 'id',
            default: value,
            hidden: '!data.advanced',
        }));

        return {
            id: 'tplNils2Weather',
            visSet: 'vis-2-widgets-nils-fork',
            visName: 'Compact weather',
            visWidgetLabel: 'compact_weather',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        {
                            name: 'noCard',
                            label: 'without_card',
                            type: 'checkbox',
                        },
                        {
                            name: 'widgetTitle',
                            label: 'name',
                            default: 'Weather',
                            hidden: 'data.noCard === true',
                        },
                        {
                            name: 'instance',
                            label: 'openweathermap_instance',
                            type: 'instance',
                            adapter: 'openweathermap',
                            default: 'openweathermap.0',
                            onChange: setOpenWeatherMapBindings,
                        },
                        {
                            name: 'locationName',
                            label: 'weather_location_name',
                            type: 'text',
                            default: '',
                        },
                        {
                            name: 'oidTemperatureOverride',
                            label: 'current_temperature_override',
                            type: 'id',
                            default: '',
                        },
                        {
                            name: 'forecastDays',
                            label: 'forecast_days',
                            type: 'slider',
                            min: 1,
                            max: 2,
                            step: 1,
                            default: 2,
                        },
                        {
                            name: 'temperatureDigits',
                            label: 'temperature_digits',
                            type: 'number',
                            min: 0,
                            max: 1,
                            default: 0,
                        },
                        {
                            name: 'advanced',
                            label: 'advanced_weather_bindings',
                            type: 'checkbox',
                        },
                    ],
                },
                {
                    name: 'weather_data',
                    label: 'weather_data',
                    fields: advancedFields,
                },
            ],
            visDefaultStyle: {
                width: 370,
                height: 150,
                position: 'relative',
            },
            visPrev: 'widgets/vis-2-widgets-nils-fork/img/prev_weather.svg',
        };
    }

    getWidgetInfo(): RxWidgetInfo {
        return Weather.getWidgetInfo();
    }

    private stateValue(field: string): unknown {
        const oid = this.state.rxData[field];
        return oid ? this.state.values[`${oid}.val`] : undefined;
    }

    private numericValue(field: string): number | undefined {
        const value = this.stateValue(field);
        if (value === null || value === undefined || value === '') {
            return undefined;
        }
        const number = Number(value);
        return Number.isFinite(number) ? number : undefined;
    }

    private textValue(field: string): string | undefined {
        const value = this.stateValue(field);
        return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
            ? String(value) || undefined
            : undefined;
    }

    private formatTemperature(value?: number): string {
        if (value === undefined) {
            return '–';
        }
        const digits = Math.min(1, Math.max(0, Number(this.state.rxData.temperatureDigits) || 0)) as 0 | 1;
        return `${this.formatValue(value, digits)}°`;
    }

    private formatPrecipitation(value?: number): string {
        if (value === undefined) {
            return '–';
        }
        return `${this.formatValue(value, value > 0 && value < 10 ? 1 : 0)} mm`;
    }

    private formatDay(value?: number): string {
        if (value === undefined) {
            return '–';
        }
        const date = new Date(value < 1_000_000_000_000 ? value * 1_000 : value);
        if (Number.isNaN(date.getTime())) {
            return '–';
        }
        return new Intl.DateTimeFormat(Generic.getLanguage(), { weekday: 'short' }).format(date);
    }

    private getDay(day: number): ForecastDay {
        return {
            date: this.numericValue(`oidDay${day}Date`),
            icon: this.textValue(`oidDay${day}Icon`),
            description: this.textValue(`oidDay${day}Description`),
            min: this.numericValue(`oidDay${day}TemperatureMin`),
            max: this.numericValue(`oidDay${day}TemperatureMax`),
            precipitation: this.numericValue(`oidDay${day}Precipitation`),
        };
    }

    private translated(key: string): string {
        return Generic.t(key).replace('vis_2_widgets_nils_', '');
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element | React.JSX.Element[] | null {
        super.renderWidgetBody(props);

        const forecastCount = Math.min(2, Math.max(1, Number(this.state.rxData.forecastDays) || 2));
        const forecast = Array.from({ length: forecastCount }, (_, index) => this.getDay(index + 1));
        const firstForecast = forecast[0];
        const currentTemperature =
            this.numericValue('oidTemperatureOverride') ?? this.numericValue('oidCurrentTemperature');
        const currentMin = this.numericValue('oidCurrentTemperatureMin');
        const currentMax = this.numericValue('oidCurrentTemperatureMax');
        const description =
            this.textValue('oidCurrentDescription') || firstForecast.description || this.translated('weatherForecast');
        const icon = this.textValue('oidCurrentIcon') || firstForecast.icon;
        const precipitation = this.numericValue('oidCurrentPrecipitation');
        const wind = this.numericValue('oidCurrentWindSpeed');
        const location = String(this.state.rxData.locationName || '').trim();
        const hasCurrent = currentTemperature !== undefined;
        const noCard =
            this.state.rxData.noCard === true || this.state.rxData.noCard === 'true' || props.widget.usedInWidget;

        const content = (
            <Box
                sx={{
                    boxSizing: 'border-box',
                    display: 'flex',
                    width: '100%',
                    height: noCard || !this.state.rxData.widgetTitle ? '100%' : 'calc(100% - 32px)',
                    minHeight: 76,
                    overflow: 'hidden',
                    color: 'text.primary',
                }}
            >
                <Box
                    sx={{
                        boxSizing: 'border-box',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        flex: '1 1 44%',
                        minWidth: 118,
                        px: 1.25,
                        py: 0.75,
                    }}
                >
                    <Tooltip
                        title={description}
                        placement="top"
                    >
                        <Typography
                            variant="caption"
                            noWrap
                            sx={{ color: 'text.secondary', lineHeight: 1.2 }}
                        >
                            {location ? `${location} · ${description}` : description}
                        </Typography>
                    </Tooltip>

                    <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 0.75, minHeight: 44 }}>
                        <WeatherIcon
                            src={icon}
                            label={description}
                            size={48}
                        />
                        <Box sx={{ minWidth: 0 }}>
                            <Typography
                                component="div"
                                sx={{
                                    fontSize: hasCurrent ? 30 : 20,
                                    fontWeight: 500,
                                    lineHeight: 1,
                                    letterSpacing: '-0.04em',
                                }}
                            >
                                {hasCurrent
                                    ? this.formatTemperature(currentTemperature)
                                    : `${this.formatTemperature(currentMax)} / ${this.formatTemperature(currentMin)}`}
                            </Typography>
                            {hasCurrent ? (
                                <Typography
                                    variant="caption"
                                    sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}
                                >
                                    {this.translated('high_short')} {this.formatTemperature(currentMax)} ·{' '}
                                    {this.translated('low_short')} {this.formatTemperature(currentMin)}
                                </Typography>
                            ) : null}
                        </Box>
                    </Box>

                    <Box
                        sx={{
                            display: 'flex',
                            flexDirection: 'row',
                            gap: 1.25,
                            color: 'text.secondary',
                            minHeight: 18,
                        }}
                    >
                        <Tooltip title={this.translated('precipitation')}>
                            <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 0.35 }}>
                                <WaterDropRounded
                                    color="info"
                                    style={{ fontSize: 15 }}
                                />
                                <Typography variant="caption">{this.formatPrecipitation(precipitation)}</Typography>
                            </Box>
                        </Tooltip>
                        <Tooltip title={this.translated('wind_speed')}>
                            <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 0.35 }}>
                                <AirRounded style={{ fontSize: 16 }} />
                                <Typography variant="caption">
                                    {wind === undefined ? '–' : `${Math.round(wind)} km/h`}
                                </Typography>
                            </Box>
                        </Tooltip>
                    </Box>
                </Box>

                <Box
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${forecastCount}, minmax(72px, 1fr))`,
                        flex: '1 1 56%',
                        minWidth: 0,
                        borderLeft: 1,
                        borderColor: 'divider',
                    }}
                >
                    {forecast.map((day, index) => (
                        <Tooltip
                            key={index}
                            title={day.description || ''}
                            placement="top"
                        >
                            <Box
                                sx={{
                                    boxSizing: 'border-box',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'space-around',
                                    minWidth: 0,
                                    px: 0.35,
                                    py: 0.65,
                                    borderLeft: index ? 1 : 0,
                                    borderColor: 'divider',
                                }}
                            >
                                <Typography
                                    variant="caption"
                                    noWrap
                                    sx={{ width: '100%', textAlign: 'center', fontWeight: 600 }}
                                >
                                    {this.formatDay(day.date)}
                                </Typography>
                                <WeatherIcon
                                    src={day.icon}
                                    label={day.description}
                                    size={34}
                                />
                                <Typography
                                    variant="caption"
                                    noWrap
                                    sx={{ fontWeight: 600, lineHeight: 1.1 }}
                                >
                                    {this.formatTemperature(day.max)}{' '}
                                    <Box
                                        component="span"
                                        sx={{ color: 'text.secondary', fontWeight: 400 }}
                                    >
                                        {this.formatTemperature(day.min)}
                                    </Box>
                                </Typography>
                                <Box
                                    sx={{
                                        display: 'flex',
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        gap: 0.2,
                                        color: 'text.secondary',
                                    }}
                                >
                                    <WaterDropRounded
                                        color="info"
                                        style={{ fontSize: 11 }}
                                    />
                                    <Typography sx={{ fontSize: 10, lineHeight: 1 }}>
                                        {this.formatPrecipitation(day.precipitation)}
                                    </Typography>
                                </Box>
                            </Box>
                        </Tooltip>
                    ))}
                </Box>
            </Box>
        );

        if (noCard) {
            return content;
        }

        return this.wrapContent(content, null, { padding: 0, height: 'calc(100% - 16px)' });
    }
}
