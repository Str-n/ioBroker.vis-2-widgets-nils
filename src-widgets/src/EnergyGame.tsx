import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';

import Generic from './Generic';
import EnergyGameView, { ensureEnergyGameStyles, type EnergyGamePalette } from './EnergyGameView';
import {
    EVENT_DURATION_MS,
    EventSequenceTracker,
    SNAPSHOT_DELAY_MS,
    classifyEventKind,
    parseBoolean,
    parseEventJson,
    parseLightNames,
    parsePositiveInt,
    parseScore,
    parseSequence,
    prefersReducedMotion,
    resolveEventTransition,
    type VisualEvent,
} from './EnergyGameUtils';

interface EnergyGameRxData {
    noCard: boolean;
    widgetTitle: string;
    oid_daily: string;
    oid_overall: string;
    oid_high_score: string;
    oid_high_score_today: string;
    oid_record_broken_at: string;
    oid_seq: string;
    oid_delta: string;
    oid_kind: string;
    oid_light_count: string;
    oid_light_names: string;
    oid_event_timestamp: string;
    oid_event_json: string;
    label_daily: string;
    label_overall: string;
    label_record: string;
    label_unit: string;
    animations: boolean;
    show_light_names: boolean;
    record_sparkles: boolean;
    compact: boolean;
    accent_color: string;
}

interface EnergyGameState extends VisRxWidgetState {
    activeEvent: VisualEvent | null;
    pendingEvent: VisualEvent | null;
    reducedMotion: boolean;
    size: { width: number; height: number };
}

const BASE = '0_userdata.0.energyGame';

function tr(key: string, ...args: (string | number)[]): string {
    return Generic.t(key, ...args.map(String));
}

export default class EnergyGame extends Generic<EnergyGameRxData, EnergyGameState> {
    private readonly tracker = new EventSequenceTracker();
    private snapshotTimer: ReturnType<typeof setTimeout> | null = null;
    private eventTimer: ReturnType<typeof setTimeout> | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private motionQuery: MediaQueryList | null = null;
    private readonly rootRef = React.createRef<HTMLDivElement>();
    private unmounted = false;
    private wasConnected: boolean | null = null;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = {
            ...this.state,
            activeEvent: null,
            pendingEvent: null,
            reducedMotion: prefersReducedMotion(),
            size: { width: 0, height: 0 },
        };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplNils2EnergyGame',
            visSet: 'vis-2-widgets-nils-fork',
            visName: 'EnergyGame',
            visWidgetLabel: 'energy_game',
            visAttrs: [
                {
                    name: 'common',
                    fields: [{ name: 'noCard', label: 'without_card', type: 'checkbox' }],
                },
                {
                    name: 'eg_scores',
                    label: 'group_eg_scores',
                    fields: [
                        { name: 'oid_daily', type: 'id', label: 'eg_oid_daily', default: `${BASE}.score.daily` },
                        { name: 'oid_overall', type: 'id', label: 'eg_oid_overall', default: `${BASE}.score.overall` },
                        {
                            name: 'oid_high_score',
                            type: 'id',
                            label: 'eg_oid_high_score',
                            default: `${BASE}.score.highScore`,
                        },
                        {
                            name: 'oid_high_score_today',
                            type: 'id',
                            label: 'eg_oid_high_score_today',
                            default: `${BASE}.day.highScoreToday`,
                        },
                        {
                            name: 'oid_record_broken_at',
                            type: 'id',
                            label: 'eg_oid_record_broken_at',
                            default: `${BASE}.day.recordBrokenAt`,
                        },
                    ],
                },
                {
                    name: 'eg_event',
                    label: 'group_eg_event',
                    fields: [
                        { name: 'oid_seq', type: 'id', label: 'eg_oid_seq', default: `${BASE}.event.sequence` },
                        { name: 'oid_delta', type: 'id', label: 'eg_oid_delta', default: `${BASE}.event.delta` },
                        { name: 'oid_kind', type: 'id', label: 'eg_oid_kind', default: `${BASE}.event.kind` },
                        {
                            name: 'oid_light_count',
                            type: 'id',
                            label: 'eg_oid_light_count',
                            default: `${BASE}.event.lightCount`,
                        },
                        {
                            name: 'oid_light_names',
                            type: 'id',
                            label: 'eg_oid_light_names',
                            default: `${BASE}.event.lightNames`,
                        },
                        {
                            name: 'oid_event_timestamp',
                            type: 'id',
                            label: 'eg_oid_event_timestamp',
                            default: `${BASE}.event.timestamp`,
                        },
                        {
                            name: 'oid_event_json',
                            type: 'id',
                            label: 'eg_oid_event_json',
                            default: `${BASE}.event.json`,
                        },
                    ],
                },
                {
                    name: 'eg_labels',
                    label: 'group_eg_labels',
                    fields: [
                        { name: 'label_daily', type: 'text', label: 'eg_label_daily' },
                        { name: 'label_overall', type: 'text', label: 'eg_label_overall' },
                        { name: 'label_record', type: 'text', label: 'eg_label_record' },
                        { name: 'label_unit', type: 'text', label: 'eg_label_unit' },
                    ],
                },
                {
                    name: 'eg_behavior',
                    label: 'group_eg_behavior',
                    fields: [
                        { name: 'animations', type: 'checkbox', label: 'eg_animations', default: true },
                        { name: 'show_light_names', type: 'checkbox', label: 'eg_show_light_names', default: true },
                        { name: 'record_sparkles', type: 'checkbox', label: 'eg_record_sparkles', default: true },
                        { name: 'compact', type: 'checkbox', label: 'eg_compact', default: false },
                    ],
                },
                {
                    name: 'eg_appearance',
                    label: 'group_eg_appearance',
                    fields: [{ name: 'accent_color', type: 'color', label: 'eg_accent_color' }],
                },
            ],
            visDefaultStyle: { width: 400, height: 260, position: 'relative' },
            visPrev: 'widgets/vis-2-widgets-nils-fork/img/prev_energy_game.svg',
        };
    }

    getWidgetInfo(): RxWidgetInfo {
        return EnergyGame.getWidgetInfo();
    }

    componentDidMount(): void {
        super.componentDidMount();
        ensureEnergyGameStyles();
        const element = this.rootRef.current;
        if (element) {
            this.applySize(element.clientWidth, element.clientHeight);
            if (typeof ResizeObserver !== 'undefined') {
                this.resizeObserver = new ResizeObserver(entries => {
                    const rect = entries[0]?.contentRect;
                    if (rect) {
                        this.applySize(rect.width, rect.height);
                    }
                });
                this.resizeObserver.observe(element);
            }
        }
        if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
            this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
            const listener = this.onMotionChange;
            if (typeof this.motionQuery.addEventListener === 'function') {
                this.motionQuery.addEventListener('change', listener);
            } else if (typeof this.motionQuery.addListener === 'function') {
                this.motionQuery.addListener(listener);
            }
        }
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', this.onVisibilityChange);
        }
        const socket = this.getSocket();
        if (socket?.registerConnectionHandler) {
            socket.registerConnectionHandler(this.onConnectionChange);
        }
        this.checkSequence();
    }

    componentDidUpdate(
        prevProps: Readonly<EnergyGame['props']>,
        prevState: Readonly<EnergyGameState & { rxData: EnergyGameRxData }>,
    ): void {
        super.componentDidUpdate(prevProps, prevState);
        if (prevState.rxData?.oid_seq !== this.state.rxData?.oid_seq) {
            this.tracker.reset();
            this.cancelTransient();
        }
        this.checkSequence();
    }

    componentWillUnmount(): void {
        this.unmounted = true;
        this.cancelTransient();
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        if (this.motionQuery) {
            if (typeof this.motionQuery.removeEventListener === 'function') {
                this.motionQuery.removeEventListener('change', this.onMotionChange);
            } else if (typeof this.motionQuery.removeListener === 'function') {
                this.motionQuery.removeListener(this.onMotionChange);
            }
        }
        this.motionQuery = null;
        if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this.onVisibilityChange);
        }
        const socket = this.getSocket();
        if (socket?.unregisterConnectionHandler) {
            socket.unregisterConnectionHandler(this.onConnectionChange);
        }
        super.componentWillUnmount();
    }

    private getSocket(): any {
        return (this.props as any).context?.socket || (this.props as any).socket || null;
    }

    private applySize(width: number, height: number): void {
        if (this.unmounted) {
            return;
        }
        const size = { width: Math.round(width), height: Math.round(height) };
        if (Math.abs(size.width - this.state.size.width) > 2 || Math.abs(size.height - this.state.size.height) > 2) {
            this.setState({ size });
        }
    }

    private readValue(attr: keyof EnergyGameRxData): unknown {
        const oid = this.state.rxData?.[attr];
        return typeof oid === 'string' && oid ? this.getPropertyValue(attr) : undefined;
    }

    private cancelTransient(): void {
        if (this.snapshotTimer) {
            clearTimeout(this.snapshotTimer);
            this.snapshotTimer = null;
        }
        if (this.eventTimer) {
            clearTimeout(this.eventTimer);
            this.eventTimer = null;
        }
        if (!this.unmounted && (this.state.activeEvent || this.state.pendingEvent)) {
            this.setState({ activeEvent: null, pendingEvent: null });
        }
    }

    private readonly onMotionChange = (): void => {
        if (!this.unmounted) {
            this.setState({ reducedMotion: prefersReducedMotion() });
        }
    };

    private readonly onVisibilityChange = (): void => {
        if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
            this.tracker.requestRebaseline();
            this.cancelTransient();
        }
    };

    private readonly onConnectionChange = (connected: boolean): void => {
        if (connected && this.wasConnected === false) {
            this.tracker.requestRebaseline();
            this.cancelTransient();
        }
        this.wasConnected = connected;
    };

    private checkSequence(): void {
        const decision = this.tracker.observe(parseSequence(this.readValue('oid_seq')));
        if (
            !decision.animate ||
            decision.sequence === null ||
            this.state.rxData?.animations === false ||
            (this.props as any).editMode
        ) {
            return;
        }
        this.scheduleSnapshot(decision.sequence);
    }

    private scheduleSnapshot(sequence: number): void {
        if (this.snapshotTimer) {
            clearTimeout(this.snapshotTimer);
        }
        this.snapshotTimer = setTimeout(() => {
            this.snapshotTimer = null;
            if (!this.unmounted) {
                this.captureEvent(sequence);
            }
        }, SNAPSHOT_DELAY_MS);
    }

    private captureEvent(sequence: number): void {
        let delta = parsePositiveInt(this.readValue('oid_delta'));
        let kind: unknown = this.readValue('oid_kind');
        let lightCount = parsePositiveInt(this.readValue('oid_light_count'));
        let lightNames = parseLightNames(this.readValue('oid_light_names'));
        const snapshot = parseEventJson(this.readValue('oid_event_json'));
        if (snapshot?.sequence === sequence) {
            delta = snapshot.delta ?? delta;
            kind = snapshot.kind ?? kind;
            lightCount = snapshot.lightCount ?? lightCount;
            lightNames = snapshot.lightNames.length ? snapshot.lightNames : lightNames;
        }
        this.enqueueEvent({
            sequence,
            kind: classifyEventKind(kind, delta),
            delta,
            lightCount,
            lightNames,
            receivedAt: Date.now(),
        });
    }

    private enqueueEvent(incoming: VisualEvent): void {
        const next = resolveEventTransition(this.state.activeEvent, this.state.pendingEvent, incoming);
        this.setState({ activeEvent: next.active, pendingEvent: next.pending });
        if (next.restarted) {
            this.startEventTimer(next.active);
        }
    }

    private startEventTimer(active: VisualEvent): void {
        if (this.eventTimer) {
            clearTimeout(this.eventTimer);
        }
        this.eventTimer = setTimeout(() => {
            this.eventTimer = null;
            if (this.unmounted) {
                return;
            }
            const pending = this.state.pendingEvent;
            if (pending) {
                this.setState({ activeEvent: pending, pendingEvent: null });
                this.startEventTimer(pending);
            } else {
                this.setState({ activeEvent: null });
            }
        }, EVENT_DURATION_MS[active.kind]);
    }

    private buildPalette(): EnergyGamePalette {
        const theme = (this.props as any).context?.theme;
        const mode: 'light' | 'dark' =
            theme?.palette?.mode || ((this.props as any).themeType === 'dark' ? 'dark' : 'light');
        const dark = mode === 'dark';
        const custom = this.state.rxData?.accent_color;
        return {
            mode,
            text: theme?.palette?.text?.primary || (dark ? '#f5f7fa' : '#111827'),
            textSecondary: theme?.palette?.text?.secondary || (dark ? 'rgba(245,247,250,.65)' : 'rgba(17,24,39,.6)'),
            accent: typeof custom === 'string' && custom.trim() ? custom : dark ? '#4fd6ff' : '#0369a1',
            gold: dark ? '#ffc857' : '#b7791f',
        };
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element | React.JSX.Element[] | null {
        super.renderWidgetBody(props);
        const rx = this.state.rxData;
        const inEditor = !!(this.props as any).editMode;
        const content = (
            <div
                ref={this.rootRef}
                style={{ width: '100%', height: '100%', position: 'relative' }}
            >
                <EnergyGameView
                    daily={parseScore(this.readValue('oid_daily'))}
                    overall={parseScore(this.readValue('oid_overall'))}
                    highScore={parseScore(this.readValue('oid_high_score'))}
                    highScoreToday={parseBoolean(this.readValue('oid_high_score_today'))}
                    recordBrokenAt={parsePositiveInt(this.readValue('oid_record_broken_at'))}
                    activeEvent={inEditor ? null : this.state.activeEvent}
                    labels={{
                        title: rx.widgetTitle || tr('eg_energy_saver'),
                        daily: rx.label_daily || tr('eg_today'),
                        overall: rx.label_overall || tr('eg_all_time'),
                        record: rx.label_record || tr('eg_record'),
                        unit: rx.label_unit || tr('eg_energy'),
                    }}
                    showTitle={false}
                    animationsEnabled={rx.animations !== false}
                    reducedMotion={this.state.reducedMotion}
                    showLightNames={rx.show_light_names !== false}
                    recordSparkles={rx.record_sparkles !== false}
                    compact={!!rx.compact}
                    palette={this.buildPalette()}
                    lang={String((this.props as any).context?.lang || Generic.getLanguage() || 'en')}
                    width={this.state.size.width}
                    height={this.state.size.height}
                    t={tr}
                />
            </div>
        );
        if (rx.noCard || props.widget.usedInWidget) {
            return content;
        }
        return this.wrapContent(
            content,
            null,
            { padding: 0, height: '100%', boxSizing: 'border-box' },
            { display: 'none' },
        );
    }
}
