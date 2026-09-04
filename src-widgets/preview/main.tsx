import React from 'react';
import { createRoot } from 'react-dom/client';
import { createTheme, CssBaseline, ThemeProvider } from '@mui/material';
import './preview.css';

type Settings = { rxData: Record<string, any>; values: Record<string, any>; style: React.CSSProperties };
type PreviewProps = { id: string; view: string; context: Record<string, any>; customSettings: Settings };

// Widget modules inherit from this global when imported. The preview only needs
// their state/rendering API, not the editor, drag/drop, or a live socket.
class LocalVisRxWidget extends React.Component<PreviewProps, Record<string, any>> {
    static t(key: string): string { return key.replaceAll('_', ' '); }
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
    formatValue(value: unknown): string { return value == null ? '' : String(value); }
    wrapContent(content: React.ReactNode): React.ReactNode { return content; }

    render(): React.ReactNode {
        const widget = { data: this.state.rxData, style: this.state.style, usedInWidget: false };
        return <div ref={this.refService} className="widget-surface" style={this.state.style}>
            {this.renderWidgetBody({ className: '', overlayClassNames: [], style: { ...this.state.style }, id: this.props.id, refService: this.refService, widget })}
        </div>;
    }
}

(window as any).visRxWidget = LocalVisRxWidget;
const [{ default: SwitchButton }, { default: ThermostatCompact }, { default: Blinds }, { default: EnergyGamePreview }] = await Promise.all([
    import('../src/SwitchButton'), import('../src/ThermostatCompact'), import('../src/Blinds'), import('../src/dev/EnergyGamePreview'),
]);

const objects: Record<string, Record<string, any>> = {
    'preview.temperature.set': { _id: 'preview.temperature.set', type: 'state', common: { type: 'number', min: 12, max: 30, step: 0.5, unit: '°C' } },
    'preview.temperature.actual': { _id: 'preview.temperature.actual', type: 'state', common: { type: 'number', unit: '°C' } },
    'preview.humidity': { _id: 'preview.humidity', type: 'state', common: { type: 'number', unit: '%' } },
    'preview.blinds.position': { _id: 'preview.blinds.position', type: 'state', common: { type: 'number', min: 0, max: 100, unit: '%' } },
};

function App(): React.JSX.Element {
    const initialValues = { 'preview.green.val': true, 'preview.blue.val': false, 'preview.numeric.val': 1, 'preview.readonly.val': true, 'preview.temperature.set.val': 21.5, 'preview.temperature.actual.val': 20.8, 'preview.humidity.val': 46, 'preview.blinds.position.val': 35 };
    const [values, setValues] = React.useState<Record<string, any>>(initialValues);
    const context = React.useMemo(() => ({
        socket: {
            getObject: async (id: string) => objects[id] || null,
            getObjectsById: async (ids: string[]) => Object.fromEntries(ids.filter(id => objects[id]).map(id => [id, objects[id]])),
        },
        setValue: (id: string, value: unknown) => setValues(old => ({ ...old, [`${id}.val`]: value })),
        systemConfig: { common: { dateFormat: 'DD.MM.YYYY', isFloatComma: false } },
        themeType: 'dark', views: { preview: { widgets: {} } },
    }), []);
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

    return <main>
        <header><span className="eyebrow">Local source preview</span><h1>Material widgets</h1><p>Edit <code>src-widgets/src</code> and this page refreshes immediately. These controls use local mock ioBroker states.</p></header>
        <section>
            <div className="section-heading"><div><h2>Switch buttons</h2><p>Click a button to toggle its mock value.</p></div><button className="reset" onClick={() => setValues(initialValues)}>Reset states</button></div>
            <div className="button-grid">{buttons.map(([title, oid, iconOn, iconOff, colorOn, readOnly], index) =>
                <article className="preview-card" key={oid}>
                    <SwitchButton {...commonProps as any} id={`switch-${index}`} customSettings={{ values, style: { width: 76, height: 76 }, rxData: {
                        oid, 'icon-on': iconOn, 'icon-off': iconOff, color: '#94a3b8', colorOn, colorOff: '#8a96a8',
                        background: 'transparent', backgroundOn: `${colorOn}28`, backgroundOff: '#64748b24', readOnly,
                    } }} />
                    <strong>{title}</strong><code>{String(values[`${oid}.val`])}</code>
                </article>)}</div>
        </section>
        <section>
            <div className="section-heading"><div><h2>Compact thermostat button</h2><p>The real compact widget, backed by local temperature data.</p></div></div>
            <article className="thermostat-card"><ThermostatCompact {...commonProps as any} id="thermostat-compact" customSettings={{ values, style: { width: 180, height: 42 }, rxData: {
                noCard: true, widgetTitle: 'Living room', 'oid-temp-set': 'preview.temperature.set', 'oid-temp-actual': 'preview.temperature.actual',
                'oid-humidity': 'preview.humidity', 'oid-power': '', 'oid-mode': '', 'oid-boost': '', 'oid-party': '', unit: '°C', step: '0.5', timeout: 500, externalDialog: false, count: 0,
            } }} /></article>
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
            <div className="section-heading"><div><h2>Energy game</h2><p>Exercise the score states, event animations, record celebration, and reduced-motion mode.</p></div></div>
            <article className="thermostat-card"><EnergyGamePreview /></article>
        </section>
    </main>;
}

const theme = createTheme({ palette: { mode: 'dark', primary: { main: '#5b8cff' }, background: { default: '#0a0d14', paper: '#141923' } } });
createRoot(document.getElementById('root')!).render(<ThemeProvider theme={theme}><CssBaseline /><App /></ThemeProvider>);
