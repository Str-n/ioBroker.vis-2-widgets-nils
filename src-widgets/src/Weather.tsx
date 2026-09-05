import React from 'react';

// Use style/color on these icons: their bundled MUI sx processor may be newer than the host vis theme.
import { AirRounded, CloudOutlined, WaterDropRounded } from '@mui/icons-material';
import { Box, Tooltip } from '@mui/material';

import type {
    RxRenderWidgetProps,
    RxWidgetInfo,
    RxWidgetInfoAttributesField,
    VisRxWidgetState,
    WidgetData,
} from '@iobroker/types-vis-2';

import Generic from './Generic';
import { createOpenWeatherMapBindings } from './WeatherUtils';
import '../public/smarthome.css';
import './Weather.css';

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
                style={{ width: size, height: size, color: 'var(--sh-text-secondary)' }}
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
                width: 480,
                height: 200,
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

        // The carousel/container owns the border and shadow. Weather only supplies
        // its tonal background, or stays transparent when embedded.
        return (
            <div className={`sh-theme sh-weather${noCard ? ' sh-weather--bare' : ''}`}>
                <div className="sh-weather__layout">
                    <div className="sh-weather__current">
                        <div className="sh-weather__description">
                            {location ? <span className="sh-weather__location">{location}</span> : null}
                            <span>{description}</span>
                        </div>
                        <div className="sh-weather__reading">
                            <WeatherIcon
                                src={icon}
                                label={description}
                                size={48}
                            />
                            <span className={`sh-weather__value${hasCurrent ? '' : ' sh-weather__value--range'}`}>
                                {hasCurrent
                                    ? this.formatTemperature(currentTemperature)
                                    : `${this.formatTemperature(currentMax)} / ${this.formatTemperature(currentMin)}`}
                            </span>
                        </div>
                        {hasCurrent ? (
                            <div className="sh-weather__meta">
                                {this.translated('high_short')} {this.formatTemperature(currentMax)} ·{' '}
                                {this.translated('low_short')} {this.formatTemperature(currentMin)}
                            </div>
                        ) : null}
                        <div className="sh-weather__details">
                            <span
                                className="sh-weather__detail"
                                aria-label={`${this.translated('precipitation')}: ${this.formatPrecipitation(precipitation)}`}
                            >
                                <WaterDropRounded
                                    aria-hidden="true"
                                    style={{ fontSize: 16, color: 'var(--sh-info)' }}
                                />
                                {this.formatPrecipitation(precipitation)}
                            </span>
                            <span
                                className="sh-weather__detail"
                                aria-label={`${this.translated('wind_speed')}: ${wind === undefined ? '–' : `${Math.round(wind)} km/h`}`}
                            >
                                <AirRounded
                                    aria-hidden="true"
                                    style={{ fontSize: 16, color: 'var(--sh-info)' }}
                                />
                                {wind === undefined ? '–' : `${Math.round(wind)} km/h`}
                            </span>
                        </div>
                    </div>
                    <div
                        className="sh-weather__forecast"
                        style={{ gridTemplateColumns: `repeat(${forecastCount}, minmax(0, 1fr))` }}
                    >
                        {forecast.map((day, index) => (
                            <Tooltip
                                key={index}
                                title={day.description || ''}
                                placement="top"
                            >
                                <div className="sh-weather__day">
                                    <span className="sh-weather__day-name">{this.formatDay(day.date)}</span>
                                    <WeatherIcon
                                        src={day.icon}
                                        label={day.description}
                                        size={40}
                                    />
                                    <div className="sh-weather__temperatures">
                                        <span>{this.formatTemperature(day.max)}</span>
                                        <span className="sh-weather__low">{this.formatTemperature(day.min)}</span>
                                    </div>
                                    <span
                                        className="sh-weather__detail"
                                        aria-label={`${this.translated('precipitation')}: ${this.formatPrecipitation(day.precipitation)}`}
                                    >
                                        <WaterDropRounded
                                            aria-hidden="true"
                                            style={{ fontSize: 16, color: 'var(--sh-info)' }}
                                        />
                                        {this.formatPrecipitation(day.precipitation)}
                                    </span>
                                </div>
                            </Tooltip>
                        ))}
                    </div>
                </div>
            </div>
        );
    }
}
