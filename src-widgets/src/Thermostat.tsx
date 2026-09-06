import React from 'react';

import {
    Box,
    Button,
    Dialog,
    DialogContent,
    DialogTitle,
    IconButton,
    Slider,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
    Tooltip,
} from '@mui/material';

import {
    WbSunny as WbSunnyIcon,
    PowerSettingsNew as PowerSettingsNewIcon,
    Air as AirIcon,
    ThermostatAuto as ThermostatAutoIcon,
    PanTool as PanToolIcon,
    AcUnit as AcUnitIcon,
    Dry as DryIcon,
    Park as ParkIcon,
    Houseboat as HouseboatIcon,
    Add,
    Remove,
    WaterDropOutlined,
    // ShowChart, // History is disabled until the runtime chart crash is fixed.
    Close as IconClose,
    Thermostat as ThermostatIcon,
    Celebration as CelebrationIcon,
    ElectricBolt as BoostIcon,
    Close,
} from '@mui/icons-material';

import { Icon } from '@iobroker/gui-components';
import type {
    RxRenderWidgetProps,
    RxWidgetInfo,
    VisRxWidgetProps,
    VisRxWidgetState,
    VisRxWidgetStateValues,
} from '@iobroker/types-vis-2';

import ObjectChart from './Components/ObjectChart';
import Generic from './Generic';
import './Thermostat.css';

const BUTTONS: Record<string, React.JSX.Element> = {
    AUTO: <ThermostatAutoIcon style={{ width: 24, height: 24 }} />,
    MANUAL: <PanToolIcon style={{ width: 24, height: 24 }} />,
    VACATION: <HouseboatIcon style={{ width: 24, height: 24 }} />,
    COOL: <AcUnitIcon style={{ width: 24, height: 24 }} />,
    COOLING: <AcUnitIcon style={{ width: 24, height: 24 }} />,
    DRY: <DryIcon style={{ width: 24, height: 24 }} />,
    ECO: <ParkIcon style={{ width: 24, height: 24 }} />,
    FAN_ONLY: <AirIcon style={{ width: 24, height: 24 }} />,
    HEAT: <WbSunnyIcon style={{ width: 24, height: 24 }} />,
    HEATING: <WbSunnyIcon style={{ width: 24, height: 24 }} />,
    OFF: <PowerSettingsNewIcon style={{ width: 24, height: 24 }} />,
};

const styles: Record<string, any> = {
    tooltip: {
        pointerEvents: 'none',
    },
};

function getModes(modeObj: ioBroker.StateObject): { value: string; label: string; icon?: React.JSX.Element }[] | null {
    let modes = modeObj?.common?.states;
    if (Array.isArray(modes)) {
        const result: Record<string, string> = {};
        modes.forEach(m => (result[m] = m));
        modes = result;
    }
    const result: { value: string; label: string; icon?: React.JSX.Element }[] = [];
    if (modes) {
        Object.keys(modes).forEach(m => {
            const mode: { value: string; label: string; icon?: React.JSX.Element } = {
                value: m,
                label: (modes as Record<string, string>)[m],
            };
            mode.icon = BUTTONS[((modes as Record<string, string>)[m] || '').toUpperCase()];
            result.push(mode);
        });
    }

    return result.length ? result : null;
}

interface ThermostatRxData {
    noCard: boolean;
    widgetTitle: string;
    'oid-temp-set': string;
    'oid-temp-actual': string;
    'oid-humidity': string;
    unit: string;
    'oid-power': string;
    'oid-mode': string;
    'oid-set-point-mode': string;
    'oid-boost': string;
    'oid-party': string;
    step: string;
    timeout: number;
    externalDialog: boolean;
    count: number | string;
    [key: `hide${number}`]: boolean | 'true';
    [key: `title${number}`]: string;
    [key: `tooltip${number}`]: string;
    [key: `icon${number}`]: string;
    [key: `iconSmall${number}`]: string;
    [key: `color${number}`]: string;
    [key: `noText${number}`]: boolean | 'true';
    [key: `noIcon${number}`]: boolean | 'true';
    [key: `value${number}`]: string;
}

interface ThermostatState extends VisRxWidgetState {
    showDialog: boolean;
    // external dialog
    dialog: boolean;
    dialogTab: number;

    modeObject: { common: ioBroker.StateCommon; _id: string } | undefined;
    tempObject: { common: ioBroker.StateCommon; _id: string } | null | undefined;
    tempStateObject: { common: ioBroker.StateCommon; _id: string } | null | undefined;
    humidityObject: { common: ioBroker.StateCommon; _id: string } | null | undefined;
    isChart?: boolean;
    modes:
        | {
              value: string;
              label: string | null;
              icon?: React.JSX.Element | true | string;
              tooltip: string;
              original: string;
              color?: string;
          }[]
        | undefined
        | null;
    min: number | undefined | null;
    max: number | undefined | null;
}

export default class Thermostat extends Generic<ThermostatRxData, ThermostatState> {
    private lastRxData = '';
    private customStyle: React.CSSProperties = {};
    private updateTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = {
            ...this.state,
            showDialog: false,
            dialogTab: 0,
        };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplNils2Thermostat',
            visSet: 'vis-2-widgets-nils-fork',
            visWidgetLabel: 'thermostat', // Label of widget
            visName: 'Thermostat',
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
                            hidden: '!!data.noCard || !!data.externalDialog',
                        },
                        {
                            name: 'oid-temp-set',
                            type: 'id',
                            label: 'temperature_oid',
                            onChange: async (field, data, changeData, socket) => {
                                if (data[field.name!]) {
                                    const object = await socket.getObject(data[field.name!]);
                                    if (object?.common) {
                                        const id = data[field.name!].split('.');
                                        id.pop();
                                        const states: Record<string, ioBroker.StateObject> =
                                            await socket.getObjectViewSystem(
                                                'state',
                                                `${id.join('.')}.`,
                                                `${id.join('.')}.\u9999`,
                                            );
                                        if (states) {
                                            let changed = false;
                                            const values = Object.values(states);
                                            for (const state of values) {
                                                const role = state.common.role;
                                                if (state._id.endsWith('.SET_POINT_MODE')) {
                                                    data['oid-set-point-mode'] = state._id;
                                                    changed = true;
                                                } else if (role && role.includes('value.temperature')) {
                                                    data['oid-temp-actual'] = state._id;
                                                    changed = true;
                                                } else if (role?.includes('power')) {
                                                    data['oid-power'] = state._id;
                                                    changed = true;
                                                } else if (role?.includes('boost')) {
                                                    data['oid-boost'] = state._id;
                                                    changed = true;
                                                } else if (role?.includes('party')) {
                                                    data['oid-party'] = state._id;
                                                    changed = true;
                                                } else if (role?.includes('mode')) {
                                                    const modes = getModes(state);
                                                    if (modes) {
                                                        for (let i = 0; i < modes.length; i++) {
                                                            const mode = modes[i];
                                                            if (!data[`title${i + 1}`] || i + 1 > data.count) {
                                                                changed = true;
                                                                data[`title${i + 1}`] = mode.label;
                                                            }
                                                            if (!data[`value${i + 1}`] || i + 1 > data.count) {
                                                                data[`value${i + 1}`] = mode.value;
                                                                changed = true;
                                                            }
                                                        }
                                                        if (data.count !== modes.length) {
                                                            changed = true;
                                                            data.count = modes.length;
                                                        }
                                                    }
                                                    data['oid-mode'] = state._id;
                                                    changed = true;
                                                }
                                            }

                                            changed && changeData(data);
                                        }
                                    }
                                }
                            },
                        },
                        {
                            name: 'oid-temp-actual',
                            type: 'id',
                            label: 'actual_oid',
                        },
                        {
                            name: 'oid-humidity',
                            type: 'id',
                            label: 'humidity_oid',
                        },
                        {
                            name: 'unit',
                            label: 'unit',
                        },
                        {
                            name: 'oid-power',
                            type: 'id',
                            label: 'power_oid',
                        },
                        {
                            name: 'oid-set-point-mode',
                            type: 'id',
                            label: 'thermostat_set_point_mode',
                        },
                        {
                            name: 'oid-mode',
                            type: 'id',
                            label: 'mode_oid',
                            onChange: async (field, data, changeData, socket) => {
                                if (data[field.name!]) {
                                    const object = await socket.getObject(data[field.name!]);
                                    const modes = object?.type === 'state' ? getModes(object) : null;
                                    if (modes) {
                                        let changed = false;

                                        modes.forEach((mode, i) => {
                                            if (!data[`title${i + 1}`] || i + 1 > data.count) {
                                                changed = true;
                                                data[`title${i + 1}`] = mode.label;
                                            }
                                            if (!data[`value${i + 1}`] || i + 1 > data.count) {
                                                data[`value${i + 1}`] = mode.value;
                                                changed = true;
                                            }
                                        });
                                        if (data.count !== modes.length) {
                                            changed = true;
                                            data.count = modes.length;
                                        }
                                        changed && changeData(data);
                                    }
                                }
                            },
                        },
                        {
                            name: 'oid-boost',
                            type: 'id',
                            label: 'mode_boost',
                        },
                        {
                            name: 'oid-party',
                            type: 'id',
                            label: 'mode_party',
                        },
                        {
                            name: 'step',
                            type: 'select',
                            disabled: '!data["oid-temp-set"]',
                            label: 'step',
                            noTranslation: true,
                            options: ['0.5', '1'],
                            default: '1',
                        },
                        {
                            name: 'timeout',
                            label: 'controlTimeout',
                            tooltip: 'timeout_tooltip',
                            type: 'slider',
                            min: 0,
                            max: 2000,
                            default: 500,
                        },
                        {
                            name: 'externalDialog',
                            label: 'use_as_dialog',
                            type: 'checkbox',
                            tooltip: 'use_as_dialog_tooltip',
                        },
                        {
                            name: 'count',
                            type: 'slider',
                            min: 1,
                            max: 9,
                            label: 'modes_count',
                            default: 2,
                            hidden: '!data["oid-mode"]',
                        },
                    ],
                },
                {
                    name: 'modes',
                    label: 'group_modes',
                    indexFrom: 1,
                    indexTo: 'count',
                    hidden: '!data["oid-mode"]',
                    fields: [
                        {
                            name: 'hide',
                            type: 'checkbox',
                            label: 'hide',
                            // explicitly allow
                            noBinding: false,
                        },
                        {
                            name: 'title',
                            label: 'title',
                            hidden: 'data["hide" + index] === true',
                        },
                        {
                            name: 'tooltip',
                            label: 'tooltip',
                            hidden: 'data["hide" + index] === true || !!data["title" + index]',
                        },
                        {
                            name: 'icon',
                            type: 'image',
                            label: 'icon',
                            hidden: 'data["hide" + index] === true || !!data["iconSmall" + index]',
                        },
                        {
                            name: 'iconSmall',
                            type: 'icon64',
                            label: 'small_icon',
                            hidden: 'data["hide" + index] === true || !!data["icon" + index]',
                        },
                        {
                            name: 'color',
                            type: 'color',
                            label: 'color',
                            hidden: 'data["hide" + index] === true',
                        },
                        {
                            name: 'noText',
                            type: 'checkbox',
                            label: 'no_text',
                            noBinding: false,
                            hidden: 'data["hide" + index] === true || data["noIcon" + index] === true',
                        },
                        {
                            name: 'noIcon',
                            type: 'checkbox',
                            label: 'no_icon',
                            noBinding: false,
                            hidden: 'data["hide" + index] === true || data["noText" + index] === true || !data["title" + index]',
                        },
                        {
                            name: 'value',
                            type: 'text',
                            label: 'value',
                            hidden: 'data["hide" + index] === true',
                        },
                    ],
                },
            ],
            visDefaultStyle: {
                width: '100%',
                height: 320,
                position: 'relative',
            },
            visPrev: 'widgets/vis-2-widgets-nils-fork/img/prev_thermostat.png',
        };
    }

    async thermostatReadObjects(): Promise<void> {
        const actualRxData = JSON.stringify(this.state.rxData);
        if (this.lastRxData === actualRxData) {
            return;
        }

        const newState: Partial<ThermostatState> = {};
        this.lastRxData = actualRxData;
        const ids = [];
        if (this.state.rxData['oid-mode'] && this.state.rxData['oid-mode'] !== 'nothing_selected') {
            ids.push(this.state.rxData['oid-mode']);
        }
        if (this.state.rxData['oid-temp-set'] && this.state.rxData['oid-temp-set'] !== 'nothing_selected') {
            ids.push(this.state.rxData['oid-temp-set']);
        }
        if (this.state.rxData['oid-temp-actual'] && this.state.rxData['oid-temp-actual'] !== 'nothing_selected') {
            ids.push(this.state.rxData['oid-temp-actual']);
        }
        if (this.state.rxData['oid-humidity'] && this.state.rxData['oid-humidity'] !== 'nothing_selected') {
            ids.push(this.state.rxData['oid-humidity']);
        }
        const _objects: Record<string, ioBroker.StateObject> = ids.length
            ? ((await this.props.context.socket.getObjectsById(ids)) as Record<string, ioBroker.StateObject>)
            : {};

        if (this.state.rxData['oid-mode'] && this.state.rxData['oid-mode'] !== 'nothing_selected') {
            const modeObj = _objects[this.state.rxData['oid-mode']];
            if (modeObj) {
                newState.modeObject = { common: modeObj.common, _id: modeObj._id };
                // convert the array to the object
                const modes = getModes(modeObj);
                newState.modes = [];
                const max = parseInt(this.state.rxData.count as string, 10) || 10;

                modes?.forEach((m, i) => {
                    if (
                        this.state.rxData[`hide${i + 1}`] === true ||
                        this.state.rxData[`hide${i + 1}`] === 'true' ||
                        i >= max
                    ) {
                        return;
                    }
                    const icon: string | true | undefined =
                        this.state.rxData[`noIcon${i + 1}`] !== true && this.state.rxData[`noIcon${i + 1}`] !== 'true'
                            ? this.state.rxData[`icon${i + 1}`] ||
                              this.state.rxData[`iconSmall${i + 1}`] ||
                              !!BUTTONS[(m.label || '').toUpperCase()]
                            : undefined;

                    const mode: {
                        value: string;
                        label: string | null;
                        icon?: React.JSX.Element | true | string;
                        tooltip: string;
                        original: string;
                        color?: string;
                    } = {
                        value: this.state.rxData[`value${i + 1}`] || m.value,
                        tooltip: this.state.rxData[`tooltip${i + 1}`] || m.label,
                        icon,
                        original: m.label,
                        label:
                            icon &&
                            (this.state.rxData[`noText${i + 1}`] === true ||
                                this.state.rxData[`noText${i + 1}`] === 'true')
                                ? null
                                : this.state.rxData[`title${i + 1}`] || m.label,
                        color: this.state.rxData[`color${i + 1}`],
                    };

                    // if icon present, and it is a standard icon and no title provided
                    if (
                        mode.label &&
                        !(
                            this.state.rxData[`noText${i + 1}`] === true ||
                            this.state.rxData[`noText${i + 1}`] === 'true'
                        ) &&
                        mode.icon === true &&
                        !this.state.rxData[`title${i + 1}`]
                    ) {
                        mode.label = null;
                    }
                    newState.modes!.push(mode);
                });

                for (let i = modes?.length || 0; i < max; i++) {
                    if (this.state.rxData[`hide${i + 1}`] === true || this.state.rxData[`hide${i + 1}`] === 'true') {
                        continue;
                    }
                    const icon =
                        this.state.rxData[`noIcon${i + 1}`] !== true && this.state.rxData[`noIcon${i + 1}`] !== 'true'
                            ? this.state.rxData[`icon${i + 1}`] ||
                              this.state.rxData[`iconSmall${i + 1}`] ||
                              !!BUTTONS[(this.state.rxData[`title${i + 1}`] || '').toUpperCase()]
                            : undefined;

                    newState.modes.push({
                        tooltip: this.state.rxData[`tooltip${i + 1}`],
                        icon,
                        original: this.state.rxData[`title${i + 1}`],
                        label:
                            icon &&
                            (this.state.rxData[`noText${i + 1}`] === true ||
                                this.state.rxData[`noText${i + 1}`] === 'true')
                                ? null
                                : this.state.rxData[`title${i + 1}`],
                        value: this.state.rxData[`value${i + 1}`],
                        color: this.state.rxData[`color${i + 1}`],
                    });
                }
            } else {
                newState.modes = null;
            }
        } else {
            newState.modes = null;
        }

        if (this.state.rxData['oid-temp-set'] && this.state.rxData['oid-temp-set'] !== 'nothing_selected') {
            const tempObj = _objects[this.state.rxData['oid-temp-set']];
            newState.min = tempObj?.common?.min === undefined ? 12 : tempObj.common.min;
            newState.max = Math.min(25, tempObj?.common?.max ?? 25);
            newState.min = Math.min(newState.min, newState.max);
            newState.tempObject = tempObj ? { common: tempObj.common, _id: tempObj._id } : null;
        } else {
            newState.tempObject = null;
            newState.max = null;
            newState.min = null;
        }

        if (this.state.rxData['oid-temp-actual'] && this.state.rxData['oid-temp-actual'] !== 'nothing_selected') {
            const tempStateObj = _objects[this.state.rxData['oid-temp-actual']];
            newState.tempStateObject = tempStateObj ? { common: tempStateObj.common, _id: tempStateObj._id } : null;
        } else {
            newState.tempStateObject = null;
        }
        if (this.state.rxData['oid-humidity'] && this.state.rxData['oid-humidity'] !== 'nothing_selected') {
            const humidityObject = _objects[this.state.rxData['oid-humidity']];
            newState.humidityObject = humidityObject
                ? { common: humidityObject.common, _id: humidityObject._id }
                : null;
        } else {
            newState.humidityObject = null;
        }
        const defaultHistory = this.props.context.systemConfig?.common?.defaultHistory;
        const mainHistoryInstance = Generic.getHistoryInstance(newState.tempObject, defaultHistory);
        const secondaryHistoryInstance = Generic.getHistoryInstance(newState.tempStateObject, defaultHistory);

        newState.isChart = !!mainHistoryInstance || !!secondaryHistoryInstance;

        // If changed any attribute
        if (
            Object.keys(newState).find(
                key =>
                    JSON.stringify((this.state as Record<string, any>)[key]) !==
                    JSON.stringify((newState as Record<string, any>)[key]),
            )
        ) {
            this.setState(newState as any);
        }
    }

    async componentDidMount(): Promise<void> {
        super.componentDidMount();
        await this.thermostatReadObjects();
    }

    async onRxDataChanged(): Promise<void> {
        await this.thermostatReadObjects();
    }

    getWidgetInfo(): RxWidgetInfo {
        return Thermostat.getWidgetInfo();
    }

    formatValue(value: null | string | undefined | number | boolean, round?: number): string {
        if (typeof value === 'number') {
            if (round === 0) {
                value = Math.round(value);
            } else {
                value = Math.round(value * 100) / 100;
            }
            if (this.props.context.systemConfig?.common) {
                if (this.props.context.systemConfig.common.isFloatComma) {
                    value = value.toString().replace('.', ',');
                }
            }
        }

        return value === undefined || value === null ? '' : value.toString();
    }

    renderChartDialog(): React.ReactNode {
        if (!this.state.showDialog) {
            return null;
        }

        return (
            <Dialog
                sx={{ '& .MuiDialog-paper': { height: '100%' } }}
                maxWidth="lg"
                fullWidth
                open={!0}
                onClose={() => this.setState({ showDialog: false })}
            >
                <DialogTitle>
                    {this.state.rxData.widgetTitle}
                    <IconButton
                        style={{ float: 'right' }}
                        onClick={() => this.setState({ showDialog: false })}
                    >
                        <IconClose />
                    </IconButton>
                </DialogTitle>
                <DialogContent>
                    {this.state.dialogTab === 1 && (
                        <div style={{ height: '100%' }}>
                            <ObjectChart
                                t={(key: string): string => Generic.t(key)}
                                lang={Generic.getLanguage()}
                                socket={this.props.context.socket}
                                obj={this.state.tempStateObject || this.state.tempObject}
                                obj2={!this.state.tempStateObject ? null : this.state.tempObject}
                                objLineType={this.state.tempStateObject ? 'line' : 'step'}
                                obj2LineType="step"
                                themeType={this.props.context.themeType}
                                historyInstance={Generic.getHistoryInstance(
                                    this.state.tempStateObject || this.state.tempObject,
                                    this.props.context.systemConfig?.common?.defaultHistory || 'history.0',
                                )}
                                historyInstance2={Generic.getHistoryInstance(
                                    this.state.tempStateObject,
                                    this.props.context.systemConfig?.common?.defaultHistory || 'history.0',
                                )}
                                noToolbar={false}
                                systemConfig={this.props.context.systemConfig}
                                dateFormat={this.props.context.systemConfig.common.dateFormat}
                            />
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        );
    }

    thermIsWithPowerButton(): boolean {
        return !!this.state.rxData['oid-power'] && this.state.rxData['oid-power'] !== 'nothing_selected';
    }

    thermIsWithModeButtons(): boolean {
        return (
            (this.state.modes?.length || this.state.rxData['oid-party'] || this.state.rxData['oid-boost']) &&
            // if no power button or power is on
            (!this.state.rxData['oid-power'] || this.state.values[`${this.state.rxData['oid-power']}.val`])
        );
    }

    onCommand(command: 'openDialog' | 'closeDialog'): any {
        const result = super.onCommand(command);
        if (result === false) {
            if (command === 'openDialog') {
                this.setState({ dialog: true });
                return true;
            }
            if (command === 'closeDialog') {
                this.setState({ dialog: false });
                return true;
            }
        }

        return result;
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element[] | React.JSX.Element | null {
        super.renderWidgetBody(props);

        this.customStyle = {};
        if (this.state.rxStyle) {
            if (this.state.rxStyle['font-weight']) {
                this.customStyle.fontWeight = this.state.rxStyle['font-weight'];
            }
            if (this.state.rxStyle['font-size']) {
                this.customStyle.fontSize = this.state.rxStyle['font-size'];
            }
            if (this.state.rxStyle['font-family']) {
                this.customStyle.fontFamily = this.state.rxStyle['font-family'];
            }
            if (this.state.rxStyle['font-style']) {
                this.customStyle.fontStyle = this.state.rxStyle['font-style'];
            }
            if (this.state.rxStyle['word-spacing']) {
                this.customStyle.wordSpacing = this.state.rxStyle['word-spacing'];
            }
            if (this.state.rxStyle['letter-spacing']) {
                this.customStyle.letterSpacing = this.state.rxStyle['letter-spacing'];
            }
        }

        const withCard = !this.state.rxData.noCard && !props.widget.usedInWidget;
        const withTitle = this.state.rxData.widgetTitle && withCard;

        const actualRxData = JSON.stringify(this.state.rxData);
        if (this.lastRxData !== actualRxData) {
            this.updateTimeout ||= setTimeout(async () => {
                this.updateTimeout = null;
                await this.thermostatReadObjects();
            }, 50);
        }

        const min = this.state.min ?? 12;
        const max = Math.min(25, this.state.max ?? 25);
        const step = Number(this.state.rxData.step) || 0.5;
        const rawValue = this.state.values[`${this.state.rxData['oid-temp-set']}.val`];
        const tempValue = rawValue === null || rawValue === undefined || rawValue === '' ? null : Number(rawValue);
        const hasTemperature = tempValue !== null && Number.isFinite(tempValue);
        const sliderValue = hasTemperature ? Math.max(min, Math.min(max, tempValue)) : min;
        const actualTemp = this.state.values[`${this.state.rxData['oid-temp-actual']}.val`];
        const humidity = this.state.values[`${this.state.rxData['oid-humidity']}.val`];
        const unit = this.state.rxData.unit || this.state.tempObject?.common?.unit || '°C';
        const modeId =
            this.state.rxData['oid-set-point-mode'] && this.state.rxData['oid-set-point-mode'] !== 'nothing_selected'
                ? this.state.rxData['oid-set-point-mode']
                : this.state.rxData['oid-mode']?.endsWith('.SET_POINT_MODE')
                  ? this.state.rxData['oid-mode']
                  : '';
        const modeValue = this.state.values[`${modeId}.val`];
        const selectedMode = modeValue === 0 || modeValue === '0' ? 0 : modeValue === 1 || modeValue === '1' ? 1 : null;
        const updateTemperature = (value: number, commit = false): void => {
            const next = Math.max(min, Math.min(max, Math.round(value / step) * step));
            this.setState(state => ({ values: { ...state.values, [`${state.rxData['oid-temp-set']}.val`]: next } }));
            if (commit) {
                this.props.context.setValue(this.state.rxData['oid-temp-set'], next);
            }
        };
        const thermIsWithModeButtons = this.thermIsWithModeButtons();
        const thermIsWithPowerButton = this.thermIsWithPowerButton();

        let modesButton: React.JSX.Element[] = [];
        if (thermIsWithModeButtons) {
            if (this.state.modes?.length && modeId !== this.state.rxData['oid-mode']) {
                modesButton = this.state.modes.map((mode, i) => {
                    const icon =
                        mode.icon === true ? (
                            BUTTONS[(mode.original || '').toUpperCase()]
                        ) : mode.icon ? (
                            <Icon
                                src={mode.icon}
                                style={{ width: 24, height: 24 }}
                            />
                        ) : null;
                    let currentValueStr = this.state.values[`${this.state.rxData['oid-mode']}.val`];

                    if (currentValueStr === null || currentValueStr === undefined) {
                        currentValueStr = 'null';
                    } else {
                        currentValueStr = currentValueStr.toString();
                    }

                    return icon && !mode.label ? (
                        <Tooltip
                            key={`${i}_${mode.value}`}
                            title={mode.tooltip}
                            slotProps={{ popper: { sx: styles.tooltip } }}
                        >
                            <IconButton
                                color={currentValueStr === mode.value ? 'primary' : 'inherit'}
                                style={
                                    currentValueStr === mode.value || !mode.color ? undefined : { color: mode.color }
                                }
                                onClick={() => {
                                    let value: string | boolean | number = mode.value;
                                    if (this.state.modeObject?.common?.type === 'number') {
                                        value = parseFloat(value);
                                    } else if (this.state.modeObject?.common?.type === 'boolean') {
                                        // @ts-expect-error is Ok
                                        value = value === 'true' || value === true || value === '1' || value === 1;
                                    }
                                    const values: VisRxWidgetStateValues = JSON.parse(
                                        JSON.stringify(this.state.values),
                                    );
                                    values[`${this.state.rxData['oid-mode']}.val`] = value;
                                    this.setState({ values });
                                    this.props.context.setValue(this.state.rxData['oid-mode'], value);
                                }}
                            >
                                {icon}
                            </IconButton>
                        </Tooltip>
                    ) : (
                        <Button
                            key={`${i}_${mode.value}`}
                            color={currentValueStr === mode.value ? 'primary' : 'inherit'}
                            // style={currentValueStr === mode.value || !mode.color ? undefined : { color: mode.color }}
                            onClick={() => {
                                let value: string | boolean | number = mode.value;
                                if (this.state.modeObject?.common?.type === 'number') {
                                    value = parseFloat(value);
                                } else if (this.state.modeObject?.common?.type === 'boolean') {
                                    // @ts-expect-error is OK
                                    value = value === 'true' || value === true || value === '1' || value === 1;
                                }
                                const values: VisRxWidgetStateValues = JSON.parse(JSON.stringify(this.state.values));
                                values[`${this.state.rxData['oid-mode']}.val`] = value;
                                this.setState({ values });
                                this.props.context.setValue(this.state.rxData['oid-mode'], value);
                            }}
                            startIcon={icon}
                        >
                            {mode.label}
                        </Button>
                    );
                });
            }

            if (this.state.rxData['oid-party']) {
                let currentValueStr = this.state.values[`${this.state.rxData['oid-party']}.val`];
                if (currentValueStr === null || currentValueStr === undefined) {
                    currentValueStr = false;
                } else {
                    currentValueStr = currentValueStr === '1' || currentValueStr === 'true' || currentValueStr === true;
                }
                modesButton.push(
                    <Button
                        key="party"
                        color={currentValueStr ? 'primary' : 'inherit'}
                        onClick={() => {
                            let _currentValueStr = this.state.values[`${this.state.rxData['oid-party']}.val`];
                            if (_currentValueStr === null || _currentValueStr === undefined) {
                                _currentValueStr = false;
                            } else {
                                _currentValueStr =
                                    _currentValueStr === '1' ||
                                    _currentValueStr === 'true' ||
                                    _currentValueStr === true;
                            }
                            const values: VisRxWidgetStateValues = JSON.parse(JSON.stringify(this.state.values));
                            values[`${this.state.rxData['oid-party']}.val`] = !_currentValueStr;
                            this.setState({ values });
                            this.props.context.setValue(this.state.rxData['oid-party'], !_currentValueStr);
                        }}
                        startIcon={<CelebrationIcon />}
                    >
                        {Generic.t('Party')}
                    </Button>,
                );
            }
            if (this.state.rxData['oid-boost']) {
                let currentValueStr = this.state.values[`${this.state.rxData['oid-boost']}.val`];
                if (currentValueStr === null || currentValueStr === undefined) {
                    currentValueStr = false;
                } else {
                    currentValueStr = currentValueStr === '1' || currentValueStr === 'true' || currentValueStr === true;
                }
                modesButton.push(
                    <Button
                        key="boost"
                        color={currentValueStr ? 'primary' : 'inherit'}
                        onClick={() => {
                            let _currentValueStr = this.state.values[`${this.state.rxData['oid-boost']}.val`];
                            if (_currentValueStr === null || _currentValueStr === undefined) {
                                _currentValueStr = false;
                            } else {
                                _currentValueStr =
                                    _currentValueStr === '1' ||
                                    _currentValueStr === 'true' ||
                                    _currentValueStr === true;
                            }
                            const values: VisRxWidgetStateValues = JSON.parse(JSON.stringify(this.state.values));
                            values[`${this.state.rxData['oid-boost']}.val`] = !_currentValueStr;
                            this.setState({ values });
                            this.props.context.setValue(this.state.rxData['oid-boost'], !_currentValueStr);
                        }}
                        startIcon={<BoostIcon />}
                    >
                        {Generic.t('Boost')}
                    </Button>,
                );
            }
        }

        if (thermIsWithPowerButton) {
            modesButton.push(
                <Tooltip
                    key="power"
                    title={Generic.t('power').replace('vis_2_widgets_nils_', '')}
                    slotProps={{ popper: { sx: styles.tooltip } }}
                >
                    <IconButton
                        color={this.state.values[`${this.state.rxData['oid-power']}.val`] ? 'primary' : 'inherit'}
                        onClick={() => {
                            const values: VisRxWidgetStateValues = JSON.parse(JSON.stringify(this.state.values));
                            const id: `${string}.val` = `${this.state.rxData['oid-power']}.val`;
                            values[id] = !values[id];
                            this.setState({ values });
                            this.props.context.setValue(this.state.rxData['oid-power'], values[id]);
                        }}
                    >
                        <PowerSettingsNewIcon />
                    </IconButton>
                </Tooltip>,
            );
        }

        const content = (
            <Box
                className="thermostat-controls"
                sx={{
                    height: withTitle ? 'calc(100% - 36px)' : '100%',
                    minHeight: 0,
                    overflow: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    color: 'text.primary',
                    fontVariantNumeric: 'tabular-nums',
                    '& .MuiButton-root, & .MuiToggleButton-root, & .MuiIconButton-root': {
                        minHeight: 48,
                        borderRadius: '14px',
                    },
                    '& .MuiIconButton-root': { minWidth: 48 },
                }}
            >
                <Box className="thermostat-layout">
                    <Box className="thermostat-gauge">
                        <Box
                            component="svg"
                            viewBox="0 0 200 154"
                            aria-hidden="true"
                            sx={{ width: '100%', height: '100%', overflow: 'visible' }}
                        >
                            <Box
                                component="path"
                                d="M 30 132 A 80 80 0 1 1 170 132"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="8"
                                strokeLinecap="round"
                                sx={{ color: 'divider' }}
                            />
                            <Box
                                component="path"
                                d="M 30 132 A 80 80 0 1 1 170 132"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="8"
                                strokeLinecap="round"
                                pathLength="100"
                                strokeDasharray={`${hasTemperature && max > min ? ((sliderValue - min) / (max - min)) * 100 : 0} 100`}
                                sx={{ color: 'primary.main' }}
                            />
                        </Box>
                        <Box className="thermostat-gauge-value">
                            <Typography
                                variant="caption"
                                color="text.secondary"
                            >
                                {Generic.t('desired_temperature')}
                            </Typography>
                            <Typography
                                className="thermostat-setpoint"
                                sx={{ fontWeight: 500, lineHeight: 1.3, ...this.customStyle }}
                            >
                                {hasTemperature ? this.formatValue(tempValue) : '–'}
                                <Box
                                    component="span"
                                    sx={{ fontSize: 18, ml: 0.5, color: 'text.secondary' }}
                                >
                                    {unit}
                                </Box>
                            </Typography>
                        </Box>
                        <Box
                            sx={{
                                position: 'absolute',
                                bottom: 0,
                                left: 24,
                                right: 24,
                                display: 'flex',
                                justifyContent: 'space-between',
                                color: 'text.secondary',
                                fontSize: 12,
                            }}
                        >
                            <span>{this.formatValue(min)}°</span>
                            <span>{this.formatValue(max)}°</span>
                        </Box>
                    </Box>
                    <Box className="thermostat-adjustments">
                        <Box className="thermostat-sensors">
                            {this.state.rxData['oid-temp-actual'] &&
                            this.state.rxData['oid-temp-actual'] !== 'nothing_selected' ? (
                                <Box
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1,
                                        bgcolor: 'action.hover',
                                        borderRadius: '16px',
                                        px: 1,
                                        minWidth: 0,
                                        py: 1,
                                    }}
                                >
                                    {/* Icon bundles may use a newer MUI than the host: avoid their sx processor. */}
                                    <ThermostatIcon color="info" />
                                    <Box>
                                        <Typography
                                            variant="caption"
                                            color="text.secondary"
                                        >
                                            {Generic.t('actual_temperature')}
                                        </Typography>
                                        <Typography variant="body2">
                                            {this.formatValue(actualTemp) || '–'} {unit}
                                        </Typography>
                                    </Box>
                                </Box>
                            ) : null}
                            {this.state.rxData['oid-humidity'] &&
                            this.state.rxData['oid-humidity'] !== 'nothing_selected' ? (
                                <Box
                                    sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 1,
                                        bgcolor: 'action.hover',
                                        borderRadius: '16px',
                                        px: 1,
                                        minWidth: 0,
                                        py: 1,
                                    }}
                                >
                                    <WaterDropOutlined color="info" />
                                    <Box>
                                        <Typography
                                            variant="caption"
                                            color="text.secondary"
                                        >
                                            {Generic.t('humidity')}
                                        </Typography>
                                        <Typography variant="body2">
                                            {this.formatValue(humidity) || '–'}{' '}
                                            {this.state.humidityObject?.common?.unit || '%'}
                                        </Typography>
                                    </Box>
                                </Box>
                            ) : null}
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 48 }}>
                            <IconButton
                                aria-label={Generic.t('thermostat_decrease')}
                                disabled={!this.state.tempObject || !hasTemperature || sliderValue <= min}
                                onClick={() => updateTemperature(sliderValue - step, true)}
                            >
                                <Remove />
                            </IconButton>
                            <Slider
                                aria-label={Generic.t('desired_temperature')}
                                min={min}
                                max={max}
                                step={step}
                                value={sliderValue}
                                disabled={!this.state.tempObject || min >= max}
                                valueLabelDisplay="auto"
                                getAriaValueText={value => `${this.formatValue(value)} ${unit}`}
                                onChange={(_event, value) => updateTemperature(value)}
                                onChangeCommitted={(_event, value) => updateTemperature(value, true)}
                            />
                            <IconButton
                                aria-label={Generic.t('thermostat_increase')}
                                disabled={!this.state.tempObject || !hasTemperature || sliderValue >= max}
                                onClick={() => updateTemperature(sliderValue + step, true)}
                            >
                                <Add />
                            </IconButton>
                        </Box>
                        {modeId ? (
                            <ToggleButtonGroup
                                exclusive
                                fullWidth
                                value={selectedMode}
                                aria-label={Generic.t('thermostat_set_point_mode')}
                                sx={{ mt: 1, bgcolor: 'action.hover', borderRadius: '14px' }}
                                onChange={(_event, value: number | null) => {
                                    if (value === null) {
                                        return;
                                    }
                                    this.setState(state => ({ values: { ...state.values, [`${modeId}.val`]: value } }));
                                    this.props.context.setValue(modeId, value);
                                }}
                            >
                                <ToggleButton
                                    value={0}
                                    color="primary"
                                    sx={{ gap: 1, textTransform: 'none' }}
                                >
                                    <ThermostatAutoIcon fontSize="small" />
                                    {Generic.t('thermostat_auto')}
                                </ToggleButton>
                                <ToggleButton
                                    value={1}
                                    color="primary"
                                    sx={{ gap: 1, textTransform: 'none' }}
                                >
                                    <PanToolIcon fontSize="small" />
                                    {Generic.t('thermostat_manual')}
                                </ToggleButton>
                            </ToggleButtonGroup>
                        ) : null}
                    </Box>
                </Box>
                {modesButton.length ? (
                    <Box
                        sx={{
                            display: 'flex',
                            justifyContent: 'center',
                            flexWrap: 'wrap',
                            gap: 1,
                            borderTop: 1,
                            borderColor: 'divider',
                            pt: 1,
                        }}
                    >
                        {modesButton}
                        {/* History temporarily disabled: opening the chart crashes in the vis-2 runtime.
                        Keep the action and renderChartDialog implementation for a future fix.
                        {this.state.isChart ? (
                            <Button
                                startIcon={<ShowChart />}
                                color="inherit"
                                onClick={() => this.setState({ showDialog: true, dialogTab: 1 })}
                            >
                                {Generic.t('thermostat_history')}
                            </Button>
                        ) : null} */}
                    </Box>
                ) : null}
                {/* History temporarily disabled: {this.renderChartDialog()} */}
            </Box>
        );

        if (this.state.rxData.externalDialog && !this.props.editMode) {
            return this.state.dialog ? (
                <Dialog
                    open={!0}
                    className="thermostat-dialog"
                    onClose={() => this.setState({ dialog: false })}
                >
                    <DialogTitle className="thermostat-dialog-title">
                        <span>{this.state.rxData.widgetTitle}</span>
                        <IconButton
                            aria-label={Generic.t('close')}
                            style={{ minWidth: 48, minHeight: 48 }}
                            onClick={() => this.setState({ dialog: false })}
                        >
                            <Close />
                        </IconButton>
                    </DialogTitle>
                    <DialogContent sx={{ width: 560, maxWidth: '100%', boxSizing: 'border-box' }}>
                        {content}
                    </DialogContent>
                </Dialog>
            ) : null;
        }

        if (!withCard) {
            return content;
        }

        return this.wrapContent(content, null, {
            borderRadius: 20,
            backgroundColor: this.props.context.theme?.palette.background.paper,
        });
    }
}
