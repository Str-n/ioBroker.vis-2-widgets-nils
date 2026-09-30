import React, { type CSSProperties } from 'react';

import { Dialog, DialogContent, DialogTitle, IconButton, useTheme, type Theme } from '@mui/material';

import {
    Close as IconClose,
    DeviceThermostat as ThermostatIcon,
    Opacity as HumidityIcon,
    ShowChart,
} from '@mui/icons-material';

import ReactEchartsCore from 'echarts-for-react/esm/core';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
    GridComponent,
    ToolboxComponent,
    TooltipComponent,
    TitleComponent,
    TimelineComponent,
    LegendComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsOption, LineSeriesOption } from 'echarts';
import type { TimeAxisBaseOption } from 'echarts/types/src/coord/axisCommonTypes';

import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from '@iobroker/types-vis-2';
import { Icon } from '@iobroker/gui-components';

import ObjectChart from './Components/ObjectChart';
import Generic from './Generic';
import '../public/smarthome.css';
import './Actual.css';

echarts.use([
    TimelineComponent,
    ToolboxComponent,
    TitleComponent,
    TooltipComponent,
    GridComponent,
    LineChart,
    LegendComponent,
    CanvasRenderer,
]);

// Canvas charts need resolved theme colors; CSS variables style the card itself.
function ActualTheme({ children }: { children: (theme: Theme) => React.ReactNode }): React.JSX.Element {
    return <>{children(useTheme())}</>;
}

type RxData = {
    noCard: boolean | 'true';
    widgetTitle: string;
    timeInterval: number;
    updateInterval: string;
    'oid-main': string;
    'title-main': string;
    'icon-main': string;
    'unit-main': string;
    noChart: boolean | 'true';
    'color-main': string;
    'font-size-main': string;
    'font-style-main': 'normal' | 'italic';
    digits_after_comma_main?: 0 | 1;
    'oid-secondary': string;
    'title-secondary': string;
    'icon-secondary': string;
    'unit-secondary': string;
    'noChart-secondary': boolean | 'true';
    'color-secondary': string;
    'font-size-secondary': string;
    'font-style-secondary': 'normal' | 'italic';
    'noData-secondary': boolean | 'true';
    digits_after_comma_secondary?: 0 | 1;
};

interface ActualState extends VisRxWidgetState {
    showDialog: boolean;
    dialogTab: number;
    objects: {
        main?: { common: ioBroker.StateCommon; _id: string };
        secondary?: { common: ioBroker.StateCommon; _id: string };
    };
    isChart: boolean;
    chartData: {
        [oid: string]: {
            data: { value: [ts: number, val: number] }[];
            min: number;
            max: number;
        } | null;
    };
}

export default class Actual extends Generic<RxData, ActualState> {
    static smartHomeTheme = true;
    private mainTimer: ReturnType<typeof setInterval> | undefined;
    private updateTimeout: ReturnType<typeof setTimeout> | undefined;
    private lastRxData: string | undefined;

    constructor(props: VisRxWidgetProps) {
        super(props);
        this.state = {
            ...this.state,
            showDialog: false,
            dialogTab: 0,
            isChart: false,
            chartData: {},
        };
    }

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplNils2Actual',
            visSet: 'vis-2-widgets-nils-fork',

            visSetLabel: 'set_label', // Label of this widget set
            visSetColor: '#0783ff', // Color of this widget set

            visWidgetLabel: 'actual_value_with_chart', // Label of widget
            visName: 'Actual values',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        {
                            name: 'noCard',
                            label: 'without_card',
                            type: 'checkbox',
                            noBinding: false,
                        },
                        {
                            name: 'widgetTitle',
                            label: 'name',
                            hidden: 'data.noCard === true',
                        },
                        {
                            name: 'timeInterval',
                            label: 'chart_time_interval',
                            tooltip: 'hours',
                            type: 'slider',
                            min: 0,
                            max: 48,
                            step: 1,
                            default: 12,
                        },
                        {
                            name: 'updateInterval',
                            label: 'chart_update_interval',
                            tooltip: 'seconds',
                            type: 'slider',
                            min: 10,
                            max: 360,
                            step: 1,
                            default: 60,
                        },
                    ],
                },
                {
                    name: 'main',
                    label: 'main_object',
                    fields: [
                        {
                            label: 'oid',
                            name: 'oid-main',
                            type: 'id',
                        },
                        {
                            label: 'title',
                            name: 'title-main',
                            type: 'text',
                            noButton: true,
                            hidden: '!data["oid-main"] || data["oid-main"] === "nothing_selected"',
                        },
                        {
                            label: 'icon',
                            name: 'icon-main',
                            type: 'icon64',
                            hidden: '!data["oid-main"] || data["oid-main"] === "nothing_selected"',
                        },
                        {
                            label: 'unit',
                            name: 'unit-main',
                            type: 'text',
                            noButton: true,
                            hidden: '!data["oid-main"] || data["oid-main"] === "nothing_selected"',
                        },
                        {
                            label: 'hide_chart',
                            name: 'noChart',
                            noBinding: false,
                            type: 'checkbox',
                            hidden: '!data["oid-main"] || data["oid-main"] === "nothing_selected"',
                        },
                        {
                            label: 'color',
                            name: 'color-main',
                            type: 'color',
                            hidden: '!data["oid-main"] || data["oid-main"] === "nothing_selected"',
                        },
                        {
                            label: 'font_size',
                            name: 'font-size-main',
                            type: 'slider',
                            min: 1,
                            max: 100,
                            hidden: '!data["oid-main"] || data["oid-main"] === "nothing_selected"',
                        },
                        {
                            label: 'font_style',
                            name: 'font-style-main',
                            type: 'select',
                            noTranslation: true,
                            options: [
                                { value: 'normal', label: 'normal' },
                                { value: 'italic', label: 'italic' },
                            ],
                            hidden: '!data["oid-main"] || data["oid-main"] === "nothing_selected"',
                        },
                        {
                            label: 'digits_after_comma',
                            name: 'digits_after_comma_main',
                            type: 'number',
                            min: 0,
                            max: 10,
                            hidden: '!data["oid-main"] || data["oid-main"] === "nothing_selected"',
                        },
                    ],
                },
                {
                    name: 'secondary',
                    label: 'secondary_object',
                    fields: [
                        {
                            label: 'oid',
                            name: 'oid-secondary',
                            type: 'id',
                        },
                        {
                            label: 'title',
                            name: 'title-secondary',
                            type: 'text',
                            noButton: true,
                            hidden: '!data["oid-secondary"] || data["oid-secondary"] === "nothing_selected"',
                        },
                        {
                            label: 'icon',
                            name: 'icon-secondary',
                            type: 'icon64',
                            hidden: '!data["oid-secondary"] || data["oid-secondary"] === "nothing_selected"',
                        },
                        {
                            label: 'unit',
                            name: 'unit-secondary',
                            type: 'text',
                            noButton: true,
                            hidden: '!data["oid-secondary"] || data["oid-secondary"] === "nothing_selected"',
                        },
                        {
                            label: 'hide_chart',
                            name: 'noChart-secondary',
                            noBinding: false,
                            type: 'checkbox',
                            hidden: '!data["oid-secondary"] || data["oid-secondary"] === "nothing_selected"',
                        },
                        {
                            label: 'color',
                            name: 'color-secondary',
                            type: 'color',
                            hidden: '!data["oid-secondary"] || data["oid-secondary"] === "nothing_selected"',
                        },
                        {
                            label: 'font_size',
                            name: 'font-size-secondary',
                            type: 'slider',
                            min: 1,
                            max: 100,
                            hidden: '!data["oid-secondary"] || data["oid-secondary"] === "nothing_selected"',
                        },
                        {
                            label: 'font_style',
                            name: 'font-style-secondary',
                            type: 'select',
                            noTranslation: true,
                            options: [
                                { value: 'normal', label: 'normal' },
                                { value: 'italic', label: 'italic' },
                            ],
                            hidden: '!data["oid-secondary"] || data["oid-secondary"] === "nothing_selected"',
                        },
                        {
                            label: 'digits_after_comma',
                            name: 'digits_after_comma_secondary',
                            type: 'number',
                            min: 0,
                            max: 10,
                            hidden: '!data["oid-secondary"] || data["oid-secondary"] === "nothing_selected"',
                        },
                    ],
                },
            ],
            visDefaultStyle: {
                width: '100%',
                height: 120,
                position: 'relative',
            },
            visPrev: 'widgets/vis-2-widgets-nils-fork/img/prev_actual.svg',
        } as const;
    }

    getWidgetInfo(): RxWidgetInfo {
        return Actual.getWidgetInfo();
    }

    async getIcon(id: string, object: ioBroker.Object): Promise<void> {
        if (!object.common.icon && (object.type === 'state' || object.type === 'channel')) {
            const idArray = id.split('.');

            // read channel
            const parentObject = await this.props.context.socket.getObject(idArray.slice(0, -1).join('.'));
            if (!parentObject?.common?.icon && (object.type === 'state' || object.type === 'channel')) {
                const grandParentObject = await this.props.context.socket.getObject(idArray.slice(0, -2).join('.'));
                if (grandParentObject?.common?.icon) {
                    object.common.icon = grandParentObject.common.icon;
                    if (grandParentObject.type === 'instance' || grandParentObject.type === 'adapter') {
                        object.common.icon = `../${grandParentObject.common.name}.admin/${object.common.icon}`;
                    }
                }
            } else if (parentObject?.common?.icon) {
                object.common.icon = parentObject.common.icon;
                if (parentObject.type === 'instance' || parentObject.type === 'adapter') {
                    object.common.icon = `../${parentObject.common.name}.admin/${object.common.icon}`;
                }
            }
        }
        if (object.common.icon && object.common.icon.startsWith('/')) {
            const parts = id.split('.');
            // add instance name
            object.common.icon = `../adapter/${parts[0]}${object.common.icon}`;
        }
    }

    async propertiesUpdate(): Promise<void> {
        const actualRxData = JSON.stringify(this.state.rxData);
        if (this.lastRxData === actualRxData) {
            return;
        }

        this.lastRxData = actualRxData;

        const objects: {
            main?: { common: ioBroker.StateCommon; _id: string };
            secondary?: { common: ioBroker.StateCommon; _id: string };
        } = {};
        const ids: string[] = [];
        if (this.state.rxData['oid-main'] && this.state.rxData['oid-main'] !== 'nothing_selected') {
            ids.push(this.state.rxData['oid-main']);
        }
        if (this.state.rxData['oid-secondary'] && this.state.rxData['oid-secondary'] !== 'nothing_selected') {
            ids.push(this.state.rxData['oid-secondary']);
        }

        const _objects = ids.length ? (await this.props.context.socket.getObjectsById(ids)) || {} : {};

        // try to find icons for all OIDs
        if (this.state.rxData['oid-main'] && this.state.rxData['oid-main'] !== 'nothing_selected') {
            // read object itself
            const object = _objects[this.state.rxData['oid-main']];
            if (!object) {
                objects.main = { common: {} as ioBroker.StateCommon, _id: '' };
            } else {
                object.common ||= {} as ioBroker.StateCommon;
                await this.getIcon(this.state.rxData['oid-main'], object);
                objects.main = { common: object.common as ioBroker.StateCommon, _id: object._id };
            }
        }

        if (this.state.rxData['oid-secondary'] && this.state.rxData['oid-secondary'] !== 'nothing_selected') {
            // read object itself
            const object = _objects[this.state.rxData['oid-secondary']];
            if (!object) {
                objects.secondary = { common: {} as ioBroker.StateCommon, _id: '' };
            } else {
                object.common = object.common || {};
                await this.getIcon(this.state.rxData['oid-secondary'], object);
                objects.secondary = { common: object.common as ioBroker.StateCommon, _id: object._id };
            }
        }

        const defaultHistory = this.props.context.systemConfig?.common?.defaultHistory;
        const mainHistoryInstance = Generic.getHistoryInstance(objects.main, defaultHistory);
        const secondaryHistoryInstance = Generic.getHistoryInstance(objects.secondary, defaultHistory);

        const isChart =
            (this.state.rxData.noChart !== true && this.state.rxData.noChart !== 'true' && !!mainHistoryInstance) ||
            (this.state.rxData['noChart-secondary'] !== true &&
                this.state.rxData['noChart-secondary'] !== 'true' &&
                !!secondaryHistoryInstance);

        const newState: Partial<ActualState> = { objects, isChart };

        if (this.mainTimer) {
            clearInterval(this.mainTimer);
            this.mainTimer = undefined;
        }
        let changed = false;

        if (
            this.state.rxData.noChart !== true &&
            this.state.rxData.noChart !== 'true' &&
            mainHistoryInstance &&
            objects.main?.common?.custom?.[mainHistoryInstance]
        ) {
            await this.readHistory(objects.main._id, mainHistoryInstance);
            this.mainTimer ||= setInterval(
                async () => {
                    await this.readHistory(this.state.objects.main!._id, mainHistoryInstance);
                    if (
                        this.state.rxData['noChart-secondary'] !== true &&
                        this.state.rxData['noChart-secondary'] !== 'true' &&
                        secondaryHistoryInstance &&
                        this.state.objects.secondary?.common?.custom?.[secondaryHistoryInstance]
                    ) {
                        await this.readHistory(this.state.objects.secondary._id, secondaryHistoryInstance);
                    }
                },
                parseInt(this.state.rxData.updateInterval, 10) * 1000 || 60000,
            ); // every minute by default
        } else if (this.state.chartData[this.state.rxData['oid-main']]) {
            // delete chart data
            this.state.chartData[this.state.rxData['oid-main']] = null;
            changed = true;
        }
        if (
            this.state.rxData['noChart-secondary'] !== true &&
            this.state.rxData['noChart-secondary'] !== 'true' &&
            secondaryHistoryInstance &&
            objects.secondary?.common?.custom?.[secondaryHistoryInstance]
        ) {
            await this.readHistory(objects.secondary._id, secondaryHistoryInstance);
            this.mainTimer ||= setInterval(
                () => this.readHistory(this.state.objects.secondary!._id, secondaryHistoryInstance),
                parseInt(this.state.rxData.updateInterval, 10) * 1000 || 60000,
            ); // every minute by default
        } else if (this.state.chartData[this.state.rxData['oid-secondary']]) {
            // delete chart data
            this.state.chartData[this.state.rxData['oid-secondary']] = null;
            changed = true;
        }

        if (
            changed ||
            JSON.stringify(objects) !== JSON.stringify(this.state.objects) ||
            isChart !== this.state.isChart
        ) {
            this.setState(newState as Actual['state']);
        }
    }

    static convertData(
        values: ioBroker.State[],
        chart: {
            min?: number;
            max?: number;
        },
    ): { value: [ts: number, val: number] }[] {
        const data: { value: [ts: number, val: number] }[] = [];
        if (!values?.length) {
            return data;
        }
        for (let i = 0; i < values.length; i++) {
            if (values[i].val === true) {
                values[i].val = 1;
            } else if (values[i].val === false) {
                values[i].val = 0;
            }

            data.push({ value: [values[i].ts, values[i].val as number] });
        }

        if (chart.min === undefined || chart.max === undefined) {
            chart.min = values[0].ts;
            chart.max = values[values.length - 1].ts;
        }

        return data;
    }

    readHistory = (id: string, historyInstance: string): Promise<void> => {
        const timeInterval = this.state.rxData.timeInterval || 12;
        const now = new Date();
        now.setHours(now.getHours() - timeInterval);
        now.setMinutes(0);
        now.setSeconds(0);
        now.setMilliseconds(0);
        const start = now.getTime();
        const end = Date.now();

        const options: ioBroker.GetHistoryOptions = {
            instance: historyInstance,
            start,
            end,
            step: 1800000, // 30 minutes
            from: false,
            ack: false,
            q: false,
            addId: false,
            aggregate: 'minmax',
        };

        let chart: ioBroker.State[];
        return this.props.context.socket
            .getHistory(id, options)
            .then(_chart => {
                chart = _chart;
                return this.props.context.socket.getState(id);
            })
            .then(state => {
                // sort
                if (chart?.[0] && chart[0].ts !== start) {
                    chart.unshift({ ts: start, val: null } as ioBroker.State);
                }
                if (chart) {
                    chart.sort((a, b) => (a.ts > b.ts ? 1 : a.ts < b.ts ? -1 : 0)).filter(e => e.val !== null);
                    if (state && state.val !== null && state.val !== undefined) {
                        chart.push({ ts: Date.now(), val: state.val } as ioBroker.State);
                    }

                    const _chart: { min?: number; max?: number } = {};
                    const data = Actual.convertData(chart, _chart);
                    const chartData = this.state.chartData;
                    chartData[id] = { data, min: _chart.min!, max: _chart.max! };
                    this.setState({ chartData });
                }
            })
            .catch(e => console.error(`Cannot read history: ${e}`));
    };

    async componentDidMount(): Promise<void> {
        super.componentDidMount();
        await this.propertiesUpdate();
    }

    componentWillUnmount(): void {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
            this.updateTimeout = undefined;
        }
        if (this.mainTimer) {
            clearInterval(this.mainTimer);
            this.mainTimer = undefined;
        }
        super.componentWillUnmount();
    }

    async onRxDataChanged(): Promise<void> {
        await this.propertiesUpdate();
    }

    static getColor(color: string, opacity: number): string {
        return echarts.color.modifyAlpha(color, opacity) || color;
    }

    getOptions(theme: Theme): EChartsOption {
        const series: LineSeriesOption[] = [];
        if (
            this.state.chartData[this.state.rxData['oid-main']] &&
            this.state.rxData.noChart !== true &&
            this.state.rxData.noChart !== 'true'
        ) {
            let name = this.state.rxData['title-main'] || Generic.getText(this.state.objects?.main?.common?.name || '');
            if (!name) {
                if (this.state.objects?.main?.common?.role?.includes('temperature')) {
                    name = Generic.t('temperature').replace('vis_2_widgets_nils_', '');
                }
            }
            const mainColor = Actual.getColor(this.state.rxData['color-main'] || theme.palette.warning.main, 0.65);
            const mainBackgroundColor = Actual.getColor(
                this.state.rxData['color-main'] || theme.palette.warning.main,
                0.14,
            );

            series.push({
                areaStyle: {
                    color: mainBackgroundColor,
                },
                lineStyle: {
                    color: mainColor,
                },
                type: 'line',
                smooth: true,
                showSymbol: false,
                // itemStyle: { normal: { areaStyle: { type: 'default' } } },
                data: this.state.chartData[this.state.rxData['oid-main']]!.data,
                // areaStyle: { type: 'default' },
                name,
            });
        }
        if (
            this.state.chartData[this.state.rxData['oid-secondary']] &&
            this.state.rxData['noChart-secondary'] !== true &&
            this.state.rxData['noChart-secondary'] !== 'true' &&
            this.state.rxData['noData-secondary'] !== true &&
            this.state.rxData['noData-secondary'] !== 'true'
        ) {
            let name =
                this.state.rxData['title-secondary'] ||
                Generic.getText(this.state.objects?.secondary?.common?.name || '');
            if (!name) {
                if (this.state.objects?.secondary?.common?.role?.includes('humidity')) {
                    name = Generic.t('humidity').replace('vis_2_widgets_nils_', '');
                }
            }
            const secondaryColor = Actual.getColor(
                this.state.rxData['color-secondary'] || theme.palette.info.main,
                0.65,
            );
            const secondaryBackgroundColor = Actual.getColor(
                this.state.rxData['color-secondary'] || theme.palette.info.main,
                0.14,
            );

            series.push({
                areaStyle: {
                    color: secondaryBackgroundColor,
                },
                lineStyle: {
                    color: secondaryColor,
                },
                type: 'line',
                smooth: true,
                showSymbol: false,
                data: this.state.chartData[this.state.rxData['oid-secondary']]!.data,
                name,
            });
        }

        const xAxis: TimeAxisBaseOption = {
            show: false,
            // @ts-expect-error wrong typing
            boundaryGap: false,
            type: 'time',
        };

        return {
            animation: false,
            backgroundColor: 'transparent',
            grid: {
                show: false,
                left: 0,
                top: 0,
                right: 0,
                bottom: 0,
            },
            legend: undefined,
            calculable: true,
            // @ts-expect-error wrong typing
            xAxis,
            yAxis: {
                show: false,
            },
            series,
        };
    }

    renderDialog(theme: Theme): React.ReactNode {
        if (!this.state.showDialog) {
            return null;
        }
        const mainColor = Actual.getColor(this.state.rxData['color-main'] || theme.palette.warning.main, 0.65);
        const mainBackgroundColor = Actual.getColor(
            this.state.rxData['color-main'] || theme.palette.warning.main,
            0.14,
        );
        const secondaryColor = Actual.getColor(this.state.rxData['color-secondary'] || theme.palette.info.main, 0.65);
        const secondaryBackgroundColor = Actual.getColor(
            this.state.rxData['color-secondary'] || theme.palette.info.main,
            0.14,
        );

        return (
            <Dialog
                className="sh-actual-dialog"
                sx={{
                    '& .MuiDialog-paper': {
                        height: '100%',
                        borderRadius: 'var(--sh-radius-card)',
                        border: '1px solid var(--sh-divider)',
                    },
                }}
                aria-labelledby={`${this.props.id}-history-title`}
                maxWidth="lg"
                fullWidth
                open
                onClose={() => this.setState({ showDialog: false })}
            >
                <DialogTitle
                    id={`${this.props.id}-history-title`}
                    className="sh-actual-dialog__title"
                >
                    {this.state.rxData.widgetTitle || Generic.t('actual_value_with_chart')}
                    <IconButton
                        aria-label={Generic.t('close')}
                        onClick={() => this.setState({ showDialog: false })}
                    >
                        <IconClose />
                    </IconButton>
                </DialogTitle>
                <DialogContent>
                    <ObjectChart
                        t={(key: string) => Generic.t(key)}
                        lang={Generic.getLanguage()}
                        socket={this.props.context.socket}
                        obj={this.state.objects?.main || this.state.objects?.secondary}
                        obj2={this.state.objects?.main ? this.state.objects?.secondary : null}
                        unit={
                            this.state.objects?.main
                                ? this.state.rxData['unit-main'] || this.state.objects.main.common?.unit || ''
                                : this.state.rxData['unit-secondary'] ||
                                  this.state.objects?.secondary?.common?.unit ||
                                  ''
                        }
                        unit2={this.state.rxData['unit-secondary'] || this.state.objects?.secondary?.common?.unit || ''}
                        title={
                            this.state.objects?.main
                                ? this.state.rxData['title-main'] ||
                                  Generic.getText(this.state.objects.main.common?.name)
                                : this.state.rxData['title-secondary'] ||
                                  Generic.getText(this.state.objects?.secondary?.common?.name || '')
                        }
                        title2={
                            this.state.rxData['title-secondary'] ||
                            Generic.getText(this.state.objects?.secondary?.common?.name || '')
                        }
                        objLineType="line"
                        obj2LineType="line"
                        objColor={this.state.objects?.main ? mainColor : secondaryColor}
                        obj2Color={secondaryColor}
                        objBackgroundColor={this.state.objects?.main ? mainBackgroundColor : secondaryBackgroundColor}
                        obj2BackgroundColor={secondaryBackgroundColor}
                        themeType={theme.palette.mode}
                        historyInstance={Generic.getHistoryInstance(
                            this.state.objects.main || this.state.objects.secondary,
                            this.props.context.systemConfig?.common?.defaultHistory || 'history.0',
                        )}
                        historyInstance2={Generic.getHistoryInstance(
                            this.state.objects.secondary,
                            this.props.context.systemConfig?.common?.defaultHistory || 'history.0',
                        )}
                        noToolbar={false}
                        systemConfig={this.props.context.systemConfig}
                        dateFormat={this.props.context.systemConfig.common.dateFormat}
                        chartTitle=""
                    />
                </DialogContent>
            </Dialog>
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element | React.JSX.Element[] | null {
        super.renderWidgetBody(props);

        const actualRxData = JSON.stringify(this.state.rxData);
        if (this.lastRxData !== actualRxData) {
            this.updateTimeout ||= setTimeout(async () => {
                this.updateTimeout = undefined;
                await this.propertiesUpdate();
            }, 50);
        }

        return <ActualTheme>{theme => this.renderThemedBody(props, theme)}</ActualTheme>;
    }

    private renderReading(kind: 'main' | 'secondary'): React.ReactNode {
        const data = this.state.rxData;
        const oid = data[`oid-${kind}`];
        if (!oid || oid === 'nothing_selected') {
            return null;
        }
        const common = this.state.objects?.[kind]?.common;
        const raw = this.state.values[`${oid}.val`];
        const value =
            raw === undefined || raw === null ? '–' : this.formatValue(raw, data[`digits_after_comma_${kind}`]);
        const title = data[`title-${kind}`] || Generic.getText(common?.name || '') || Generic.t(`${kind}_object`);
        const unit = data[`unit-${kind}`] || common?.unit || '';
        const icon = data[`icon-${kind}`] || common?.icon;
        const fontSize = parseInt(data[`font-size-${kind}`], 10) || undefined;
        const color = data[`color-${kind}`];
        const sensorIcon =
            common?.role?.includes('temperature') || unit.includes('°') ? (
                <ThermostatIcon />
            ) : common?.role?.includes('humidity') ? (
                <HumidityIcon />
            ) : null;

        return (
            <div
                className={`sh-actual__reading sh-actual__reading--${kind}`}
                style={{ color }}
                title={`${title}: ${value} ${unit}`}
            >
                <span
                    className="sh-actual__icon"
                    style={{ color }}
                    aria-hidden="true"
                >
                    {icon ? (
                        <Icon
                            src={icon}
                            style={{ width: 22, height: 22 }}
                        />
                    ) : (
                        sensorIcon
                    )}
                </span>
                <div className="sh-actual__measurement">
                    <div className="sh-actual__label">{title}</div>
                    <div
                        className="sh-actual__number"
                        style={{ fontSize, fontStyle: data[`font-style-${kind}`] }}
                    >
                        <span
                            className="sh-actual__value"
                            key={String(value)}
                        >
                            {value}
                        </span>
                        {unit ? <span className="sh-actual__unit">{unit}</span> : null}
                    </div>
                </div>
            </div>
        );
    }

    private renderThemedBody(props: RxRenderWidgetProps, theme: Theme): React.JSX.Element {
        const data = this.state.rxData;
        const bare = data.noCard === true || data.noCard === 'true' || props.widget.usedInWidget;
        const canOpen = this.state.isChart && !this.props.editMode && !this.state.editMode;
        const options = this.getOptions(theme);
        const hasChart = Array.isArray(options.series) && options.series.length > 0;
        const openHistory = (): void => this.setState({ showDialog: true });

        return (
            <>
                <div
                    className={`sh-theme sh-actual${bare ? ' sh-actual--bare' : ' sh-surface'}${hasChart ? ' sh-actual--chart' : ''}${canOpen ? ' sh-actual--interactive sh-focusable' : ''}`}
                    role={canOpen ? 'button' : undefined}
                    tabIndex={canOpen ? 0 : undefined}
                    aria-label={
                        canOpen
                            ? `${data.widgetTitle || Generic.t('actual_value_with_chart')}: ${Generic.t('actual_show_history')}`
                            : undefined
                    }
                    aria-haspopup={canOpen ? 'dialog' : undefined}
                    aria-describedby={canOpen ? `${this.props.id}-actual-readings` : undefined}
                    onClick={
                        canOpen
                            ? event => {
                                  event.stopPropagation();
                                  openHistory();
                              }
                            : undefined
                    }
                    onKeyDown={
                        canOpen
                            ? event => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      openHistory();
                                  }
                              }
                            : undefined
                    }
                    style={
                        {
                            '--actual-main-color': data['color-main'] || theme.palette.warning.main,
                            '--actual-secondary-color': data['color-secondary'] || theme.palette.info.main,
                        } as CSSProperties
                    }
                >
                    {!bare && data.widgetTitle ? (
                        <div className="sh-actual__header">
                            <span className="sh-actual__title">{data.widgetTitle}</span>
                            {canOpen ? (
                                <ShowChart
                                    className="sh-actual__history-icon"
                                    aria-hidden="true"
                                />
                            ) : null}
                        </div>
                    ) : null}
                    <div
                        className="sh-actual__readings"
                        id={`${this.props.id}-actual-readings`}
                    >
                        {this.renderReading('main')}
                        {this.renderReading('secondary')}
                    </div>
                    {hasChart ? (
                        <div
                            className="sh-actual__chart"
                            aria-hidden="true"
                        >
                            <ReactEchartsCore
                                echarts={echarts}
                                option={options}
                                notMerge
                                lazyUpdate
                                theme={theme.palette.mode === 'dark' ? 'dark' : undefined}
                                style={{ height: '100%', width: '100%' }}
                            />
                        </div>
                    ) : null}
                </div>
                {this.renderDialog(theme)}
            </>
        );
    }
}
