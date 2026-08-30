import React from 'react';

import { Button, Dialog, DialogContent, DialogTitle, IconButton } from '@mui/material';
import { Close as IconClose, Thermostat as ThermostatIcon } from '@mui/icons-material';

import type { RxRenderWidgetProps, RxWidgetInfo } from '@iobroker/types-vis-2';

import Generic from './Generic';
import Thermostat from './Thermostat';
import './ThermostatCompact.css';

export default class ThermostatCompact extends Thermostat {
    static getWidgetInfo(): RxWidgetInfo {
        return {
            ...Thermostat.getWidgetInfo(),
            id: 'tplNils2ThermostatCompact',
            visName: 'Thermostat Compact',
            visWidgetLabel: 'thermostat compact',
            visDefaultStyle: {
                position: 'relative',
                width: '100%',
                height: 42,
                display: 'inline-block',
            },
        };
    }

    getWidgetInfo(): RxWidgetInfo {
        return ThermostatCompact.getWidgetInfo();
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element[] | React.JSX.Element | null {
        const currentValue =
            this.state.values[`${this.state.rxData['oid-temp-actual']}.val`] ??
            this.state.values[`${this.state.rxData['oid-temp-set']}.val`] ??
            null;

        const unit = this.state.rxData.unit || this.state.tempStateObject?.common?.unit || this.state.tempObject?.common?.unit || '';
        const label =
            currentValue === null || currentValue === undefined
                ? Generic.t('temperature')
                : `${this.formatValue(currentValue)}${unit}`;
        const humidity = this.state.values[`${this.state.rxData['oid-humidity']}.val`];
        const humidityLabel =
            humidity === null || humidity === undefined
                ? Generic.t('humidity')
                : `${this.formatValue(humidity)}${this.state.humidityObject?.common?.unit || '%'}`;

        const fullContent = super.renderWidgetBody({
            ...props,
            widget: {
                ...props.widget,
                usedInWidget: true,
            },
        } as RxRenderWidgetProps);

        return (
            <>
                <Button
                    variant="contained"
                    color="primary"
                    size="small"
                    startIcon={<ThermostatIcon style={{ width: 18, height: 18 }} />}
                    onClick={() => this.setState({ dialog: true })}
                    className={`thermostat-compact-button${
                        this.state.rxData['oid-humidity'] && this.state.rxData['oid-humidity'] !== 'nothing_selected'
                            ? ' thermostat-compact-button--with-humidity'
                            : ''
                    }`}
                >
                    {label}
                    {this.state.rxData['oid-humidity'] && this.state.rxData['oid-humidity'] !== 'nothing_selected' ? (
                        <span style={{ fontSize: 10, fontWeight: 'normal' }}>{humidityLabel}</span>
                    ) : null}
                </Button>

                <Dialog
                    open={!!this.state.dialog}
                    onClose={() => this.setState({ dialog: false })}
                    maxWidth="lg"
                    fullWidth
                >
                    <DialogTitle>
                        {this.state.rxData.widgetTitle || Generic.t('thermostat')}
                        <IconButton
                            style={{ float: 'right', zIndex: 2 }}
                            onClick={() => this.setState({ dialog: false })}
                        >
                            <IconClose />
                        </IconButton>
                    </DialogTitle>
                    <DialogContent style={{ minWidth: 180, minHeight: 180 }}>{fullContent}</DialogContent>
                </Dialog>
            </>
        );
    }
}
