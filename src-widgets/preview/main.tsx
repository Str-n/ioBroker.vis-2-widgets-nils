import React from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider, useTheme } from '@mui/material';
import { createSmartHomeTheme } from '../src/theme/createSmartHomeTheme';
import { useSelectedTheme } from '../src/theme/themeSelection';
import { themeNames } from '../src/theme/presets';
import '../public/smarthome.css';
import './preview.css';
import english from '../src/i18n/en.json';
import { createOpenWeatherMapBindings } from '../src/WeatherUtils';

type Settings = { rxData: Record<string, any>; values: Record<string, any>; style: React.CSSProperties };
type PreviewProps = { id: string; view: string; context: Record<string, any>; customSettings: Settings };

// Widget modules inherit from this global when imported. The preview only needs
// their state/rendering API, not the editor, drag/drop, or a live socket.
class LocalVisRxWidget extends React.Component<PreviewProps, Record<string, any>> {
    static t(key: string): string {
        const translations: Record<string, string> = {
            theme_selector: 'Theme',
            trash_day: 'day',
            trash_days: 'days',
            thermostat_auto: 'Auto',
            thermostat_manual: 'Manual',
            thermostat_increase: 'Increase temperature',
            thermostat_decrease: 'Decrease temperature',
            desired_temperature: 'Set temperature',
            actual_temperature: 'Room temperature',
            high_short: 'H',
            low_short: 'L',
            precipitation: 'Precipitation',
            wind_speed: 'Wind speed',
            daylight_factor: 'Sunlight factor',
            sun_data_missing: 'Choose sun azimuth and elevation states',
            sun_below_horizon: 'The sun is below the horizon',
            configure_sunlight_windows: 'Configure windows and room polygons',
            weather_unavailable: 'Weather unavailable',
            sun_position: 'Sun position',
            direct_light: 'Direct',
            diffuse_light: 'Diffuse',
        };
        return translations[key] || (english as Record<string, string>)[key] || key.replaceAll('_', ' ');
    }
    static getLanguage(): string { return 'en'; }
    static getDerivedStateFromProps(props: PreviewProps): Record<string, unknown> {
        return { rxData: props.customSettings.rxData, values: props.customSettings.values, rxStyle: props.customSettings.style };
    }

    protected refService = React.createRef<HTMLDivElement>();

    constructor(props: PreviewProps) {
        super(props);
        this.state = {
            data: props.customSettings.rxData, rxData: props.customSettings.rxData,
            values: props.customSettings.values, style: props.customSettings.style,
            rxStyle: props.customSettings.style, editMode: false, usedInWidget: false, visible: true,
        };
    }

    componentDidMount(): void {}
    componentDidUpdate(): void {}
    componentWillUnmount(): void {}
    renderWidgetBody(_props: Record<string, unknown>): React.ReactNode { return null; }
    formatValue(value: unknown, digits?: number): string {
        if (value == null) {
            return '';
        }
        return typeof value === 'number' && digits !== undefined ? value.toFixed(digits) : String(value);
    }
    wrapContent(content: React.ReactNode): React.ReactNode { return content; }
    getWidgetView(view: string, options?: { style?: React.CSSProperties }): React.ReactNode {
        if (view === 'weather') {
            return <Weather {...this.props as any} id="carousel-weather" customSettings={{
                values: this.state.values,
                style: { width: '100%', height: '100%' },
                rxData: { ...createOpenWeatherMapBindings(), noCard: true, forecastDays: 2, locationName: 'Berlin' },
            }} />;
        }
        if (view === 'horizontal-demo') {
            return <div className="horizontal-mock-view" style={options?.style}>
                {[
                    ['Living room', 'Light', 'On'],
                    ['Kitchen', 'Temperature', '21.8 °C'],
                    ['Bedroom', 'Blinds', '35%'],
                ].map(([room, device, value]) => <article className="horizontal-mock-card" key={room}>
                    <span>{room}</span>
                    <strong>{device}</strong>
                    <b>{value}</b>
                </article>)}
            </div>;
        }
        const samples: Record<string, { eyebrow: string; title: string; value: string; color: string }> = {
            climate: { eyebrow: 'Living room', title: 'Climate', value: '21.5 °C', color: 'var(--sh-info)' },
            energy: { eyebrow: 'Today', title: 'Solar energy', value: '8.4 kWh', color: 'var(--sh-warning)' },
            security: { eyebrow: 'Home', title: 'Security', value: 'All secure', color: 'var(--sh-success)' },
        };
        const sample = samples[view] || { eyebrow: 'View', title: view, value: '', color: 'var(--sh-secondary)' };
        return <div className="mock-view" style={options?.style}>
            <span style={{ color: sample.color }}>{sample.eyebrow}</span>
            <strong>{sample.title}</strong>
            <b>{sample.value}</b>
        </div>;
    }

    render(): React.ReactNode {
        const widget = { data: this.state.rxData, style: this.state.style, usedInWidget: false };
        return <div ref={this.refService} className="widget-surface" style={this.state.style}>
            {this.renderWidgetBody({ className: '', overlayClassNames: [], style: { ...this.state.style }, id: this.props.id, refService: this.refService, widget })}
        </div>;
    }
}

(window as any).visRxWidget = LocalVisRxWidget;
const [{ default: SwitchButton }, { default: LabeledSwitchButton }, { default: ThermostatCompact }, { default: Thermostat }, { default: Blinds }, { default: EnergyGamePreview }, { default: StackCardCarousel }, { default: HorizontalScrollView }, { default: Weather }, { default: SunlightFloorplan }, { default: Trash }, { default: ThemeSelector }] = await Promise.all([
    import('../src/SwitchButton'), import('../src/LabeledSwitchButton'), import('../src/ThermostatCompact'), import('../src/Thermostat'), import('../src/Blinds'), import('../src/dev/EnergyGamePreview'), import('../src/StackCardCarousel'), import('../src/HorizontalScrollView'), import('../src/Weather'), import('../src/SunlightFloorplan'), import('../src/Trash'), import('../src/ThemeSelector'),
]);

const { default: SunlightFloorplanEditor } = await import('../src/SunlightFloorplanEditor');
const sunlightPreviewGeometry = {
    eg: {
        rooms: [
            { points: [[7.7288049, 6.7245844], [748.51664, 7.1971841], [748.68714, 409.96694], [455.59287, 409.80419], [454.9311, 295.80379], [6.5534834, 295.2866]] },
            { points: [[455.5, 408.5], [748.5, 408.5], [748.5, 691.5], [455.5, 691.5]] },
            { points: [[181.5, 526.5], [271.5, 526.5], [271.5, 691.5], [181.5, 691.5]] },
        ],
        windows: [
            { centerX: 8, centerY: 154, widthX: 0, widthY: 252, roomIndex: 1, windowHeightMeters: 1.35, windowSillHeightMeters: 0.9, windowSashCount: 3, blindOid: 'preview.sunlight.blindPosition', blindMin: 0, blindMax: 100, blindInvert: false },
            { centerX: 90, centerY: 8, widthX: 140, widthY: 0, roomIndex: 1, windowHeightMeters: 1.35, windowSillHeightMeters: 0.9, windowSashCount: 2, blindOid: 'preview.sunlight.blindPosition', blindMin: 0, blindMax: 100, blindInvert: false },
            { centerX: 370, centerY: 8, widthX: 140, widthY: 0, roomIndex: 1, windowHeightMeters: 1.35, windowSillHeightMeters: 0.9, windowSashCount: 2, blindOid: 'preview.sunlight.blindPosition', blindMin: 0, blindMax: 100, blindInvert: false },
            { centerX: 630, centerY: 8, widthX: 140, widthY: 0, roomIndex: 1, windowHeightMeters: 1.35, windowSillHeightMeters: 0.9, windowSashCount: 2, blindOid: 'preview.sunlight.blindPosition', blindMin: 0, blindMax: 100, blindInvert: false },
            { centerX: 748, centerY: 210, widthX: 0, widthY: 240, roomIndex: 1, windowHeightMeters: 1.35, windowSillHeightMeters: 0.9, windowSashCount: 3, blindOid: 'preview.sunlight.blindPosition', blindMin: 0, blindMax: 100, blindInvert: false },
            { centerX: 748, centerY: 550, widthX: 0, widthY: 140, roomIndex: 2, windowHeightMeters: 1.35, windowSillHeightMeters: 0.9, windowSashCount: 2, blindOid: 'preview.sunlight.blindPosition', blindMin: 0, blindMax: 100, blindInvert: false },
            { centerX: 181.5, centerY: 600.5, widthX: 0, widthY: 80, roomIndex: 3, windowHeightMeters: 1.35, windowSillHeightMeters: 0.9, windowSashCount: 1, blindOid: 'preview.sunlight.blindPosition', blindMin: 0, blindMax: 100, blindInvert: false },
        ],
        lightBubbles: [
            { x: 230, y: 140, roomIndex: 1, statusOid: 'preview.sunlight.livingRoomLight', brightnessLumens: 800 },
            { x: 610, y: 535, roomIndex: 2, statusOid: 'preview.sunlight.bottomRightLight', brightnessLumens: 800 },
            { x: 225, y: 605, roomIndex: 3, statusOid: 'preview.sunlight.smallRoomLight', brightnessLumens: 800 },
        ],
    },
};
const sunlightPreviewFloors = Object.fromEntries(await Promise.all(
    Object.entries(import.meta.glob('../public/floorplans/*.svg', { query: '?raw', import: 'default' }))
        .map(async ([path, load]) => {
            const key = path.split('/').pop()!.replace('.svg', '');
            return [key, { label: key.toUpperCase(), svg: await load() as string }];
        }),
));

const objects: Record<string, Record<string, any>> = {
    'preview.light.brightness': { _id: 'preview.light.brightness', type: 'state', common: { type: 'number', min: 0, max: 100, step: 1, unit: '%' } },
    'preview.light.temperature': { _id: 'preview.light.temperature', type: 'state', common: { type: 'number', min: 220, max: 650, step: 5, unit: 'K' } },
    'preview.temperature.set': { _id: 'preview.temperature.set', type: 'state', common: { type: 'number', min: 12, max: 30, step: 0.5, unit: '°C' } },
    'preview.temperature.actual': { _id: 'preview.temperature.actual', type: 'state', common: { type: 'number', unit: '°C' } },
    'preview.humidity': { _id: 'preview.humidity', type: 'state', common: { type: 'number', unit: '%' } },
    'preview.blinds.position': { _id: 'preview.blinds.position', type: 'state', common: { type: 'number', min: 0, max: 100, unit: '%' } },
};

function App(): React.JSX.Element {
    const theme = useTheme();
    const themeId = useSelectedTheme();
    const weatherBindings = createOpenWeatherMapBindings('openweathermap.0');
    const [sunlightConfiguration, setSunlightConfiguration] = React.useState({
        floorplan: 'eg', floorConfigurations: JSON.stringify(sunlightPreviewGeometry),
    });
    const sunlightData = {
        'preview.sun.azimuth.val': 108,
        'preview.sun.elevation.val': 25,
        'preview.weather.cloudiness.val': 25,
        'preview.weather.radiation.val': 720,
        'preview.weather.condition.val': 'Partly cloudy',
        'preview.weather.temperature.val': 18.4,
        'preview.sunlight.blindPosition.val': 50,
        'preview.sunlight.livingRoomLight.val': true,
        'preview.sunlight.bottomRightLight.val': false,
        'preview.sunlight.smallRoomLight.val': true,
    };
    const weatherValues = {
        [`${weatherBindings.oidCurrentTemperature}.val`]: 18.4,
        [`${weatherBindings.oidCurrentTemperatureMin}.val`]: 12,
        [`${weatherBindings.oidCurrentTemperatureMax}.val`]: 21,
        [`${weatherBindings.oidCurrentDescription}.val`]: 'Partly cloudy',
        [`${weatherBindings.oidCurrentPrecipitation}.val`]: 0.4,
        [`${weatherBindings.oidCurrentWindSpeed}.val`]: 14,
        ...Object.fromEntries([
            [new Date(2026, 8, 5, 12).getTime(), 11, 20, 0],
            [new Date(2026, 8, 6, 12).getTime(), 10, 19, 2.4],
        ].flatMap(([date, min, max, precipitation], index) => {
            const day = index + 1;
            return [
                [`${weatherBindings[`oidDay${day}Date`]}.val`, date],
                [`${weatherBindings[`oidDay${day}Description`]}.val`, index ? 'Rain showers' : 'Partly cloudy'],
                [`${weatherBindings[`oidDay${day}TemperatureMin`]}.val`, min],
                [`${weatherBindings[`oidDay${day}TemperatureMax`]}.val`, max],
                [`${weatherBindings[`oidDay${day}Precipitation`]}.val`, precipitation],
            ];
        })),
    };
    const initialValues = { 'preview.SET_POINT_MODE.val': 0, 'preview.green.val': true, 'preview.blue.val': false, 'preview.numeric.val': 1, 'preview.readonly.val': true, 'preview.separate-command.val': false, 'preview.separate-status.val': true, 'preview.always-on.val': false, 'preview.always-off.val': true, 'preview.light.val': false, 'preview.light.brightness.val': 72, 'preview.light.temperature.val': 320, 'preview.temperature.set.val': 21.5, 'preview.temperature.actual.val': 20.8, 'preview.outdoor.temperature.val': 19.2, 'preview.humidity.val': 46, 'preview.blinds.position.val': 35, ...sunlightData, ...weatherValues, ...Object.fromEntries(['green', 'brown', 'black', 'blue'].flatMap((color, index) => [[`trashschedule.0.type.${color}.daysLeft.val`, index + 1], [`trashschedule.0.type.${color}.completed.val`, color === 'brown']])) };
    const [values, setValues] = React.useState<Record<string, any>>(initialValues);
    const context = React.useMemo(() => ({
        socket: {
            getObject: async (id: string) => objects[id] || null,
            getObjectsById: async (ids: string[]) => Object.fromEntries(ids.filter(id => objects[id]).map(id => [id, objects[id]])),
            subscribeState: async () => undefined,
            unsubscribeState: () => undefined,
        },
        setValue: (id: string, value: unknown) => setValues(old => ({ ...old, [`${id}.val`]: value })),
        systemConfig: { common: { dateFormat: 'DD.MM.YYYY', isFloatComma: false } },
        theme, themeType: theme.palette.mode, views: {
            preview: { settings: {}, widgets: {} },
            'horizontal-demo': { settings: { sizex: 760, sizey: 190 }, widgets: {} },
        },
    }), [theme]);
    const commonProps = {
        view: 'preview', context, editMode: false, runtime: true, isRelative: true, selectedWidgets: [],
        relativeWidgetOrder: [], moveAllowed: false, selectedGroup: null, tpl: '', viewsActiveFilter: null,
        askView: () => undefined, onIgnoreMouseEvents: () => undefined, onWidgetsChanged: () => undefined,
        mouseDownOnView: () => undefined, refParent: React.createRef<HTMLElement>(),
    };
    const buttons = [
        ['On', 'preview.green', 'lightbulb', 'lightbulb-outlined', '#66df8b', false],
        ['Off', 'preview.blue', 'flashon', 'flash-off', '#61a9ff', false],
        ['Numeric', 'preview.numeric', 'toggleon', 'toggle-off', '#c084fc', false],
        ['Read only', 'preview.readonly', 'power-settings-new-rounded', 'power', '#fbbf24', true],
    ] as const;

    return <main className="sh-app">
        <header><span className="eyebrow">Local source preview</span><h1>Material widgets</h1><p>Edit <code>src-widgets/src</code> and this page refreshes immediately. These controls use local mock ioBroker states.</p></header>
        <section className="theme-preview" aria-label="Theme palette">
            <div className="section-heading"><div><h2>{themeNames[themeId]}</h2><p>Choose a theme. Your choice is remembered in this browser.</p></div></div>
            <ThemeSelector {...commonProps as any} id="theme-selector" customSettings={{ values, style: { width: 220, height: 76 }, rxData: {} }} />
            <div className="theme-swatches">{[
                ['App', '--sh-bg'], ['Surface', '--sh-surface'], ['Control', '--sh-surface-2'],
                ['Active', '--sh-secondary'], ['Light on', '--sh-control-on'], ['Healthy', '--sh-success'],
            ].map(([label, token]) => <div key={token}><span style={{ background: `var(${token})` }} /><b>{label}</b></div>)}</div>
        </section>
        <section>
            <div className="section-heading"><div><h2>Switch buttons</h2><p>Click a button to toggle it. Long-press the light control to open its sliders.</p></div><button className="reset" onClick={() => setValues(initialValues)}>Reset states</button></div>
            <div className="button-grid">{buttons.map(([title, oid, iconOn, iconOff, colorOn, readOnly], index) =>
                <article className="preview-card" key={oid}>
                    <SwitchButton {...commonProps as any} id={`switch-${index}`} customSettings={{ values, style: { width: 76, height: 76 }, rxData: {
                        oid, 'icon-on': iconOn, 'icon-off': iconOff, color: '#94a3b8', colorOn, colorOff: '#8a96a8',
                        background: 'transparent', backgroundOn: `${colorOn}28`, backgroundOff: '#64748b24', readOnly,
                    } }} />
                    <strong>{title}</strong><code>{String(values[`${oid}.val`])}</code>
                </article>)}
                {[
                    { id: 'default-light', oid: 'preview.green', iconOn: 'lightbulb', iconOff: 'lightbulb-outlined', title: 'Shared light colors' },
                    { id: 'default-switch', oid: 'preview.numeric', iconOn: 'power', iconOff: 'power', title: 'Shared switch colors' },
                ].map(example => <article className="preview-card" key={example.id} data-preview={example.id}>
                    <SwitchButton {...commonProps as any} id={example.id} customSettings={{ values, style: { width: 76, height: 76 }, rxData: {
                        oid: example.oid, 'icon-on': example.iconOn, 'icon-off': example.iconOff, readOnly: false,
                    } }} />
                    <strong>{example.title}</strong>
                </article>)}
                <article className="preview-card" data-preview="separate-status">
                    <SwitchButton {...commonProps as any} id="switch-separate-status" customSettings={{ values, style: { width: 76, height: 76 }, rxData: {
                        oid: 'preview.separate-command', 'status-oid': 'preview.separate-status',
                        'icon-on': 'power', 'icon-off': 'power', colorOn: '#66df8b', readOnly: false,
                    } }} />
                    <strong>Separate status</strong><code>write: {String(values['preview.separate-command.val'])} · status: {String(values['preview.separate-status.val'])}</code>
                </article>
                <article className="preview-card" data-preview="always-on">
                    <SwitchButton {...commonProps as any} id="switch-always-on" customSettings={{ values, style: { width: 76, height: 76 }, rxData: {
                        oid: 'preview.always-on', action: 'on', 'icon-on': 'toggleon', 'icon-off': 'toggle-off', readOnly: false,
                    } }} />
                    <strong>Always on</strong><code>{String(values['preview.always-on.val'])}</code>
                </article>
                <article className="preview-card" data-preview="always-off">
                    <SwitchButton {...commonProps as any} id="switch-always-off" customSettings={{ values, style: { width: 76, height: 76 }, rxData: {
                        oid: 'preview.always-off', action: 'off', 'icon-on': 'toggleon', 'icon-off': 'toggle-off', readOnly: false,
                    } }} />
                    <strong>Always off</strong><code>{String(values['preview.always-off.val'])}</code>
                </article>
                <article className="preview-card">
                    <SwitchButton {...commonProps as any} id="switch-light-controls" customSettings={{ values, style: { width: 76, height: 76 }, rxData: {
                        oid: 'preview.light', brightness: 'preview.light.brightness', color_temperature: 'preview.light.temperature', color_temperature_scale: 10,
                        'icon-on': 'lightbulb', 'icon-off': 'lightbulb-outlined', color: '#94a3b8', colorOn: '#fbbf24', colorOff: '#8a96a8',
                        background: 'transparent', backgroundOn: '#fbbf2428', backgroundOff: '#64748b24', readOnly: false,
                    } }} />
                    <strong>Light controls</strong><code>{String(values['preview.light.val'])} · {values['preview.light.brightness.val']}% · {values['preview.light.temperature.val'] * 10}K</code>
                </article>
                <article className="preview-card">
                    <LabeledSwitchButton {...commonProps as any} id="labeled-switch" customSettings={{ values, style: { width: 96, height: 88 }, rxData: {
                        oid: 'preview.light', brightness: 'preview.light.brightness', color_temperature: 'preview.light.temperature', color_temperature_scale: 10,
                        'icon-on': 'lightbulb', 'icon-off': 'lightbulb-outlined', colorOn: '#fbbf24', readOnly: false,
                        textLine1: 'Living room', textLine2: 'Light',
                    } }} />
                    <code>{String(values['preview.light.val'])}</code>
                </article>
            </div>
        </section>
        <section>
            <div className="section-heading"><div><h2>Trash collection</h2><p>Visible below 7 days. Click a bin to toggle “moved out”; gray with a check means completed.</p></div></div>
            <div className="button-grid">{['green', 'brown', 'black', 'blue'].map(color => {
                const base = `trashschedule.0.type.${color}`;
                return <article className="preview-card" key={color} data-preview={`trash-${color}`}>
                    <Trash {...commonProps as any} id={`trash-${color}`} customSettings={{ values, style: { width: 56, height: 56 }, rxData: {
                        oidDaysLeft: `${base}.daysLeft`, oidCompleted: `${base}.completed`, binColor: color,
                    } }} />
                    <strong>{color}</strong>
                    <label>Days left <input aria-label={`${color} days left`} type="number" value={values[`${base}.daysLeft.val`]}
                        onChange={event => context.setValue(`${base}.daysLeft`, event.target.value)} style={{ width: 60 }} /></label>
                    <output>{String(values[`${base}.completed.val`])}</output>
                </article>;
            })}
                <article className="preview-card" data-preview="trash-combined">
                    <Trash {...commonProps as any} id="trash-combined" customSettings={{ values, style: { width: 56, height: 56 }, rxData: {
                        binCount: 4,
                        ...Object.fromEntries(['green', 'brown', 'black', 'blue'].flatMap((color, index) => {
                            const suffix = index === 0 ? '' : String(index + 1);
                            return [[`oidDaysLeft${suffix}`, `trashschedule.0.type.${color}.daysLeft`],
                                [`oidCompleted${suffix}`, `trashschedule.0.type.${color}.completed`], [`binColor${suffix}`, color]];
                        })),
                    } }} />
                    <strong>Next collection</strong><span>Uses the four bins shown here</span>
                </article>
            </div>
        </section>
        <section>
            <div className="section-heading"><div><h2>Thermostat</h2><p>Setpoint capped at 25°C. Auto writes 0; Manual writes 1.</p></div></div>
            <article className="thermostat-card" data-preview="thermostat" style={{ padding: 16, gridTemplateColumns: 'minmax(0, 1fr)', background: 'var(--sh-surface-2)' }}>
                <Thermostat {...commonProps as any} id="thermostat" customSettings={{ values, style: { width: 560, maxWidth: '100%', height: 260 }, rxData: {
                    noCard: true, 'oid-temp-set': 'preview.temperature.set', 'oid-temp-actual': 'preview.temperature.actual',
                    'oid-humidity': 'preview.humidity', 'oid-set-point-mode': 'preview.SET_POINT_MODE', step: '0.5', unit: '°C',
                } }} />
                <output data-preview="thermostat-values">{JSON.stringify({ setpoint: values['preview.temperature.set.val'], mode: values['preview.SET_POINT_MODE.val'] })}</output>
            </article>
        </section>
        <section>
            <div className="section-heading"><div><h2>Compact thermostat button</h2><p>The real compact widget, backed by local temperature data.</p></div></div>
            <article className="thermostat-card"><ThermostatCompact {...commonProps as any} id="thermostat-compact" customSettings={{ values, style: { width: 180, height: 42 }, rxData: {
                noCard: true, widgetTitle: 'Living room', 'oid-temp-set': 'preview.temperature.set', 'oid-temp-actual': 'preview.temperature.actual',
                'oid-humidity': 'preview.humidity', 'oid-set-point-mode': 'preview.SET_POINT_MODE', 'oid-power': '', 'oid-mode': '', 'oid-boost': '', 'oid-party': '', unit: '°C', step: '0.5', timeout: 500, externalDialog: false, count: 0,
            } }} /></article>
        </section>
        <section>
            <div className="section-heading"><div><h2>Compact weather</h2><p>OpenWeatherMap conditions, a local temperature override and a two-day outlook.</p></div></div>
            <div className="weather-examples sh-app">
                {[
                    { id: 'weather', title: 'SmartHome card', width: 480, height: 200, days: 2, noCard: false, missing: false },
                    { id: 'weather-compact', title: 'Existing 370 × 150 size', width: 370, height: 150, days: 2, noCard: false, missing: false },
                    { id: 'weather-narrow', title: 'Narrow · single forecast', width: 280, height: 300, days: 1, noCard: false, missing: false },
                    { id: 'weather-missing', title: 'Embedded · unavailable data', width: 370, height: 150, days: 2, noCard: true, missing: true },
                ].map(example => <div key={example.id}>
                    <p>{example.title}</p>
                    <Weather {...commonProps as any} id={example.id} customSettings={{
                        values: example.missing ? {} : values,
                        style: { width: example.width, height: example.height, maxWidth: '100%' },
                        rxData: {
                            noCard: example.noCard, widgetTitle: 'Weather', instance: 'openweathermap.0', locationName: 'Berlin',
                            oidTemperatureOverride: 'preview.outdoor.temperature', forecastDays: example.days,
                            temperatureDigits: 0, advanced: false, ...weatherBindings,
                        },
                    }} />
                </div>)}
            </div>
        </section>
        <section>
            <div className="section-heading"><div><h2>Blinds</h2><p>Click the window to open its control dialog.</p></div></div>
            <article className="thermostat-card" style={{ minHeight: 120 }}><Blinds {...commonProps as any} id="blinds" customSettings={{ values, style: { width: 64, height: 64 }, rxData: {
                noCard: true, widgetTitle: 'Living room window', sashCount: 1, ratio: 1.35, borderWidth: 3,
                oid: 'preview.blinds.position', oid_stop: '', showValue: true, min: '0', max: '100', invert: false,
                externalDialog: false, timeout: 0, slideSensor_oid1: '', slideRatio1: 1, slidePos_oid1: '', slideHandle_oid1: '', slideType1: '',
            } }} /></article>
        </section>
        <section>
            <div className="section-heading"><div><h2>Sunlight floor plan</h2><p>Measured solar radiation drives diffuse room light and sun patches. Blinds change the exposed window band and shadow length.</p></div><button className="reset" onClick={() => setValues(old => ({ ...old, ...sunlightData }))}>Reset sunlight</button></div>
            <article className="thermostat-card sunlight-preview-card">
                <SunlightFloorplan {...commonProps as any} id="sunlight-floorplan-preview" customSettings={{
                    values,
                    style: { width: 700, maxWidth: '100%', height: 620 },
                    rxData: {
                        floorplan: sunlightConfiguration.floorplan, floorTopAzimuth: 163,
                        sunAzimuthOid: 'preview.sun.azimuth', sunElevationOid: 'preview.sun.elevation',
                        weatherCloudinessOid: 'preview.weather.cloudiness', weatherConditionOid: 'preview.weather.condition',
                        weatherRadiationOid: 'preview.weather.radiation',
                        sunlightSource: 'radiation', radiationReference: 1000, cloudinessScale: 'percent',
                        svgUnitsPerMeter: 62, roomHeightMeters: 2.5, maximumProjection: 650,
                        floorConfigurations: sunlightConfiguration.floorConfigurations,}
                }} />
                <SunlightFloorplanEditor
                    data={sunlightConfiguration}
                    onDataChange={data => setSunlightConfiguration({ floorplan: String(data.floorplan), floorConfigurations: String(data.floorConfigurations) })}
                    floors={sunlightPreviewFloors}
                />
                <div className="sunlight-preview-controls">
                    <label>Sun azimuth <output>{values['preview.sun.azimuth.val']}°</output><input type="range" min="0" max="359" value={values['preview.sun.azimuth.val']} onChange={event => context.setValue('preview.sun.azimuth', Number(event.target.value))} /></label>
                    <label>Sun elevation <output>{values['preview.sun.elevation.val']}°</output><input type="range" min="-5" max="80" value={values['preview.sun.elevation.val']} onChange={event => context.setValue('preview.sun.elevation', Number(event.target.value))} /></label>
                    <label>Cloudiness <output>{values['preview.weather.cloudiness.val']}%</output><input type="range" min="0" max="100" value={values['preview.weather.cloudiness.val']} onChange={event => context.setValue('preview.weather.cloudiness', Number(event.target.value))} /></label>
                    <label>Solar radiation <output>{values['preview.weather.radiation.val']} W/m²</output><input type="range" min="0" max="1000" step="10" value={values['preview.weather.radiation.val']} onChange={event => context.setValue('preview.weather.radiation', Number(event.target.value))} /></label>
                    <label>Blind open <output>{values['preview.sunlight.blindPosition.val']}%</output><input type="range" min="0" max="100" value={values['preview.sunlight.blindPosition.val']} onChange={event => context.setValue('preview.sunlight.blindPosition', Number(event.target.value))} /></label>
                    <label className="light-toggle"><input type="checkbox" checked={Boolean(values['preview.sunlight.livingRoomLight.val'])} onChange={event => context.setValue('preview.sunlight.livingRoomLight', event.target.checked)} />Living room light</label>
                    <label className="light-toggle"><input type="checkbox" checked={Boolean(values['preview.sunlight.bottomRightLight.val'])} onChange={event => context.setValue('preview.sunlight.bottomRightLight', event.target.checked)} />Bottom right light</label>
                    <label className="light-toggle"><input type="checkbox" checked={Boolean(values['preview.sunlight.smallRoomLight.val'])} onChange={event => context.setValue('preview.sunlight.smallRoomLight', event.target.checked)} />Small room light</label>
                </div>
            </article>
        </section>
        <section>
            <div className="section-heading"><div><h2>Energy game</h2><p>Exercise the score states, event animations, record celebration, and reduced-motion mode.</p></div></div>
            <article className="thermostat-card"><EnergyGamePreview /></article>
        </section>
        <section>
            <div className="section-heading"><div><h2>Stack card carousel</h2><p>Swipe the card or use the controls to move between embedded views.</p></div></div>
            <article className="thermostat-card carousel-preview"><StackCardCarousel {...commonProps as any} id="stack-card-carousel" customSettings={{ values, style: { width: 420, height: 320 }, rxData: {
                count: 3, view1: 'weather', view2: 'climate', view3: 'security',
            } }} /></article>
        </section>
        <section>
            <div className="section-heading"><div><h2>Horizontal scroll view</h2><p>Drag or use a trackpad to scroll through a wide embedded view.</p></div></div>
            <article className="thermostat-card horizontal-scroll-preview"><HorizontalScrollView {...commonProps as any} id="horizontal-scroll-view" customSettings={{ values, style: { width: 420, height: 210, maxWidth: '100%' }, rxData: {
                view: 'horizontal-demo',
            } }} /></article>
        </section>
    </main>;
}

function PreviewTheme(): React.JSX.Element {
    const themeId = useSelectedTheme();
    const theme = React.useMemo(() => createSmartHomeTheme({}, themeId), [themeId]);
    return <ThemeProvider theme={theme}><CssBaseline /><App /></ThemeProvider>;
}
createRoot(document.getElementById('root')!).render(<PreviewTheme />);
