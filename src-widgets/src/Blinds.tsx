import React, { type CSSProperties } from 'react';

import { Fab } from '@mui/material';

import type {
    RxRenderWidgetProps,
    RxWidgetInfo,
    VisRxWidgetProps,
    VisWidgetCommand,
    WidgetData,
} from '@iobroker/types-vis-2';

import BlindsBase, { type BlindsBaseRxData, type BlindsBaseState, type HelperObject } from './Components/BlindsBase';
import WindowClosed from './Components/WindowClosed';

const styles: Record<string, CSSProperties> = {
    cardContent: {
        flex: 1,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        overflow: 'visible',
        height: '100%',
    },
    fabWindowIcon: {
        position: 'relative',
        zIndex: 2,
        width: '100%',
        height: '100%',
        color: 'rgba(255, 255, 255, 0.92)',
        transition: 'transform 0.2s ease, color 0.2s ease',
    },
    fabWindow: {
        position: 'relative',
        zIndex: 1,
        width: '92%',
        height: '92%',
        overflow: 'visible',
        transition: 'transform 0.2s ease',
    },
    fabBlind: {
        position: 'absolute',
        zIndex: 1,
        top: '31%',
        left: '27%',
        width: '46%',
        maxHeight: '42%',
        background:
            'repeating-linear-gradient(to bottom, rgba(222, 232, 239, 0.9) 0 3px, rgba(194, 210, 221, 0.9) 3px 4px)',
        boxShadow: '0 0 0 1px rgba(30, 49, 61, 0.25)',
        transition: 'height 0.25s ease',
    },
    fabWindowState: {
        position: 'absolute',
        zIndex: 2,
        top: 3,
        right: 3,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 11,
        height: 11,
        border: '1px solid rgba(0, 0, 0, 0.3)',
        borderRadius: '50%',
        color: '#10202b',
        fontSize: '0.45rem',
        fontWeight: 800,
        lineHeight: 1,
    },
};

interface BlindsRxData extends BlindsBaseRxData {
    noCard: boolean;
    widgetTitle: string;
    sashCount: number;
    ratio: number;
    borderWidth: number;
    oid: string;
    oid_stop: string;
    showValue: boolean;
    min: string;
    max: string;
    invert: boolean;
    externalDialog: boolean;
    [key: `slideSensor_oid${number}`]: string;
    [key: `slideRatio${number}`]: number;
    [key: `slidePos_oid${number}`]: string;
    [key: `slideHandle_oid${number}`]: string;
}

export default class Blinds extends BlindsBase<BlindsRxData, BlindsBaseState> {
    private lastRxData: string | undefined;
    private updateTimeout: ReturnType<typeof setTimeout> | undefined;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = { ...this.state, objects: [] };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplNils2Blinds',
            visSet: 'vis-2-widgets-nils-fork',
            visName: 'Blinds',
            visWidgetLabel: 'blinds', // Label of widget
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        {
                            name: 'noCard',
                            label: 'without_card',
                            type: 'checkbox',
                            hidden: '!!data.externalDialog',
                        },
                        {
                            name: 'widgetTitle',
                            label: 'name',
                            hidden: '!!data.noCard',
                        },
                        {
                            name: 'sashCount',
                            type: 'number',
                            default: 1,
                            label: 'sash_count',
                        },
                        {
                            name: 'ratio',
                            type: 'slider',
                            min: 0.1,
                            max: 3,
                            step: 0.1,
                            label: 'window_ratio',
                            default: 1,
                        },
                        {
                            name: 'borderWidth',
                            type: 'slider',
                            min: 0,
                            max: 100,
                            step: 0.1,
                            label: 'border_width',
                            default: 0.1,
                        },
                        {
                            name: 'oid',
                            type: 'id',
                            default: '',
                            label: 'blinds_position_oid',
                            noInit: true,
                            onChange: async (field, data, changeData, socket) => {
                                if (data[field.name!]) {
                                    const object = await socket.getObject(data[field.name!]);
                                    if (object?.common) {
                                        let changed = false;

                                        // try to find stop button
                                        const id = object._id.split('.');
                                        id.pop();
                                        const states = await socket.getObjectViewSystem(
                                            'state',
                                            `${id.join('.')}.`,
                                            `${id.join('.')}.\u9999`,
                                        );
                                        if (states) {
                                            Object.values(states).forEach(state => {
                                                if (state?.common?.role?.includes('stop')) {
                                                    data.blinds_stop_oid = state._id;
                                                    changed = true;
                                                }
                                            });
                                        }

                                        changed && changeData(data);
                                    }
                                }
                            },
                        },
                        {
                            name: 'oid_stop',
                            type: 'id',
                            default: '',
                            label: 'blinds_stop_oid',
                            noInit: true,
                            hidden: (data: WidgetData) => !data.oid,
                        },
                        {
                            label: 'show_value',
                            type: 'checkbox',
                            name: 'showValue',
                            hidden: (data: WidgetData) => !data.oid,
                            default: true,
                        },
                        {
                            label: 'min_position',
                            type: 'number',
                            hidden: (data: WidgetData) => !data.oid,
                            name: 'min',
                        },
                        {
                            label: 'max_position',
                            type: 'number',
                            hidden: (data: WidgetData) => !data.oid,
                            name: 'max',
                        },
                        {
                            label: 'invert_position',
                            type: 'checkbox',
                            hidden: (data: WidgetData) => !data.oid,
                            name: 'invert',
                        },
                        {
                            name: 'externalDialog',
                            label: 'use_as_dialog',
                            type: 'checkbox',
                            tooltip: 'use_as_dialog_tooltip',
                        },
                        /*{
                            name: 'timeout',
                            type: 'slider',
                            label: 'controlTimeout',
                            min: 0,
                            max: 2000,
                        },*/
                    ],
                },
                {
                    name: 'sashes',
                    label: 'sash',
                    indexFrom: 1,
                    indexTo: 'sashCount',
                    fields: [
                        {
                            name: 'slideSensor_oid',
                            type: 'id',
                            label: 'slide_sensor_oid',
                            noInit: true,
                        },
                        {
                            name: 'slideHandle_oid',
                            type: 'id',
                            label: 'handle_sensor_oid',
                            noInit: true,
                        },
                        {
                            name: 'slideType',
                            type: 'select',
                            label: 'sash_type',
                            options: [
                                { value: '', label: 'sash_none' },
                                { value: 'left', label: 'left' },
                                { value: 'right', label: 'right' },
                                { value: 'top', label: 'top' },
                                { value: 'bottom', label: 'bottom' },
                            ],
                        },
                        {
                            name: 'slideRatio',
                            type: 'slider',
                            label: 'slide_ratio',
                            default: 1,
                            min: 0.1,
                            max: 4,
                            step: 0.1,
                            hidden: (data: WidgetData) => data.sashCount < 2,
                        },
                        {
                            name: 'slidePos_oid',
                            type: 'id',
                            default: '',
                            label: 'blinds_position_oid',
                            hidden: (data: WidgetData) => !!data.oid,
                            noInit: true,
                            onChange: async (field, data, changeData, socket) => {
                                if (data[field.name!]) {
                                    const object = await socket.getObject(data[field.name!]);
                                    const index = field.name!.match(/(\d+)$/)![1];
                                    if (object?.common) {
                                        let changed = false;
                                        // try to find stop button
                                        const id = object._id.split('.');
                                        id.pop();
                                        const states = await socket.getObjectViewSystem(
                                            'state',
                                            `${id.join('.')}.`,
                                            `${id.join('.')}.\u9999`,
                                        );
                                        if (states) {
                                            Object.values(states).forEach(state => {
                                                if (state?.common?.role?.includes('stop')) {
                                                    data[`slideStop_oid${index}`] = state._id;
                                                    changed = true;
                                                }
                                            });
                                        }
                                        changed && changeData(data);
                                    }
                                }
                            },
                        },
                        {
                            name: 'slideStop_oid',
                            type: 'id',
                            default: '',
                            label: 'blinds_stop_oid',
                            noInit: true,
                            hidden: (data, index) => !!data.oid || !data[`slidePos_oid${index}`],
                        },
                        {
                            label: 'min_position',
                            type: 'number',
                            hidden: (data, index) => !!data.oid || !data[`slidePos_oid${index}`],
                            name: 'slideMin',
                        },
                        {
                            label: 'max_position',
                            type: 'number',
                            hidden: (data, index) => !!data.oid || !data[`slidePos_oid${index}`],
                            name: 'slideMax',
                        },
                        {
                            label: 'invert_position',
                            type: 'checkbox',
                            hidden: (data, index) => !!data.oid || !data[`slidePos_oid${index}`],
                            name: 'slideInvert',
                        },
                    ],
                },
            ],
            visDefaultStyle: {
                width: '40px',
                height: '40px',
                position: 'absolute',
            },
            visPrev: 'widgets/vis-2-widgets-nils-fork/img/prev_blinds.png',
        } as const;
    }

    getWidgetInfo(): RxWidgetInfo {
        return Blinds.getWidgetInfo();
    }

    private getWindowState(): 'open' | 'closed' | 'unknown' {
        let hasClosedState = false;

        for (let index = 1; index <= (this.state.rxData.sashCount || 1); index++) {
            const handleOid = this.state.rxData[`slideHandle_oid${index}`];
            const sensorOid = this.state.rxData[`slideSensor_oid${index}`];
            const oid = handleOid || sensorOid;
            if (!oid) {
                continue;
            }

            let value = this.state.values[`${oid}.val`];
            if (value === undefined || value === null) {
                continue;
            }

            // Handle sensors use the opposite numbering to the sash sensor.
            if (handleOid) {
                if (value === 2 || value === '2') {
                    value = 1;
                } else if (value === 1 || value === '1') {
                    value = 2;
                }
            }

            if (
                value === 1 ||
                value === 2 ||
                value === '1' ||
                value === '2' ||
                value === true ||
                value === 'true' ||
                value === 'open' ||
                value === 'opened' ||
                value === 'tilt' ||
                value === 'tilted'
            ) {
                return 'open';
            }

            if (
                value === 0 ||
                value === '0' ||
                value === false ||
                value === 'false' ||
                value === 'close' ||
                value === 'closed'
            ) {
                hasClosedState = true;
            }
        }

        return hasClosedState ? 'closed' : 'unknown';
    }

    private renderWindowFab(positionPercent: number | null, hasControl: boolean): React.JSX.Element {
        const windowState = this.getWindowState();
        const isOpen = windowState === 'open';
        const closedPercent = positionPercent === null ? null : Math.max(0, Math.min(100, 100 - positionPercent));
        const stateLabel = windowState === 'unknown' ? '?' : isOpen ? 'O' : 'C';
        const ariaLabel = [
            this.state.rxData.widgetTitle || 'Blinds',
            positionPercent === null ? null : `${positionPercent}% position`,
            windowState === 'unknown' ? null : `window ${isOpen ? 'open' : 'closed'}`,
        ]
            .filter(Boolean)
            .join(', ');

        return (
            <Fab
                size="small"
                color="primary"
                aria-label={ariaLabel}
                onClick={
                    hasControl
                        ? e => {
                              e.preventDefault();
                              e.stopPropagation();
                              this.lastClick = Date.now();
                              this.setState({ showBlindsDialog: true });
                          }
                        : undefined
                }
                sx={{
                    width: '100%',
                    height: '100%',
                    minWidth: 0,
                    minHeight: 0,
                    padding: 0,
                    position: 'relative',
                }}
            >
                <div
                    style={{
                        ...styles.fabWindow,
                        ...(isOpen ? { transform: 'perspective(48px) rotateY(-20deg)' } : undefined),
                    }}
                >
                    {closedPercent !== null ? (
                        <div
                            style={{
                                ...styles.fabBlind,
                                height: `${closedPercent * 0.42}%`,
                            }}
                        />
                    ) : null}
                    <WindowClosed
                        style={{
                            ...styles.fabWindowIcon,
                            ...(isOpen ? { color: '#b9f2ce' } : undefined),
                        }}
                    />
                </div>
                {windowState !== 'unknown' ? (
                    <span
                        aria-hidden="true"
                        style={{
                            ...styles.fabWindowState,
                            background: isOpen ? '#7be0a2' : '#dce7ed',
                        }}
                    >
                        {stateLabel}
                    </span>
                ) : null}
            </Fab>
        );
    }

    async propertiesUpdate(): Promise<void> {
        const actualRxData = JSON.stringify(this.state.rxData);
        if (this.lastRxData === actualRxData) {
            return;
        }

        this.lastRxData = actualRxData;
        const objects: (HelperObject | null | string)[] = [];
        const ids: string[] = [];
        for (let index = 1; index <= this.state.rxData.sashCount; index++) {
            if (
                this.state.rxData[`slidePos_oid${index}`] &&
                this.state.rxData[`slidePos_oid${index}`] !== 'nothing_selected'
            ) {
                ids.push(this.state.rxData[`slidePos_oid${index}`]);
            }
        }
        if (this.state.rxData.oid && this.state.rxData.oid !== 'nothing_selected') {
            ids.push(this.state.rxData.oid);
        }
        const _objects: Record<string, ioBroker.StateObject> = ids.length
            ? ((await this.props.context.socket.getObjectsById(ids)) as Record<string, ioBroker.StateObject>)
            : {};
        const _object = _objects[this.state.rxData.oid] || null;
        const main = _object?.common || ({} as ioBroker.StateCommon);

        // try to find icons for all OIDs
        for (let index = 1; index <= this.state.rxData.sashCount; index++) {
            if (
                this.state.rxData[`slidePos_oid${index}`] &&
                this.state.rxData[`slidePos_oid${index}`] !== 'nothing_selected'
            ) {
                // read object itself
                const object = _objects[this.state.rxData[`slidePos_oid${index}`]];
                objects[index] = {
                    common: object?.common || ({} as ioBroker.StateCommon),
                    _id: this.state.rxData[`slidePos_oid${index}`],
                    widgetType: 'blinds',
                };
            }
        }

        if (
            JSON.stringify(objects) !== JSON.stringify(this.state.objects) ||
            JSON.stringify(main) !== JSON.stringify(this.state.main)
        ) {
            this.setState({ objects, main });
        }
    }

    async componentDidMount(): Promise<void> {
        super.componentDidMount();
        await this.propertiesUpdate();
    }

    async onRxDataChanged(): Promise<void> {
        await this.propertiesUpdate();
    }

    onCommand(command: VisWidgetCommand): any {
        const result = super.onCommand(command);
        if (result === false) {
            if (command === 'openDialog') {
                this.setState({ showBlindsDialog: true });
                return true;
            }
            if (command === 'closeDialog') {
                this.setState({ showBlindsDialog: false });
                return true;
            }
        }

        return result;
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element | React.JSX.Element[] | null {
        super.renderWidgetBody(props);

        // The FAB shadow extends slightly beyond the widget bounds.
        props.style.overflow = 'visible';
        props.style.overflowX = 'visible';
        props.style.overflowY = 'visible';

        const actualRxData = JSON.stringify(this.state.rxData);
        if (this.lastRxData !== actualRxData) {
            this.updateTimeout ||= setTimeout(async () => {
                this.updateTimeout = undefined;
                await this.propertiesUpdate();
            }, 50);
        }

        const data = this.getMinMaxPosition(0);
        const positionPercent = data.hasControl ? Math.round(data.shutterPos) : null;

        const content = (
            <div style={styles.cardContent}>
                {this.renderBlindsDialog()}
                {this.renderWindowFab(positionPercent, data.hasControl)}
            </div>
        );

        if (this.state.rxData.externalDialog && !this.props.editMode) {
            return this.renderBlindsDialog();
        }

        if (this.state.rxData.noCard || props.widget.usedInWidget) {
            return content;
        }

        return this.wrapContent(
            content,
            this.state.rxData.showValue && data.hasControl ? <span>{data.shutterPos}%</span> : null,
        );
    }
}
