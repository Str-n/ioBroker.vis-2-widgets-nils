import React from 'react';

import { Button, Dialog, DialogContent, DialogTitle, IconButton } from '@mui/material';
import { Close as IconClose } from '@mui/icons-material';

import type { RxRenderWidgetProps, RxWidgetInfo } from '@iobroker/types-vis-2';

import Generic from './Generic';
import Thermostat from './Thermostat';
import '../public/smarthome.css';
import './ThermostatCompact.css';

export default class ThermostatCompact extends Thermostat {
    static getWidgetInfo(): RxWidgetInfo {
        return {
            ...Thermostat.getWidgetInfo(),
            // Keep the original template ID: it is persisted in existing vis-2 projects.
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

        const unit =
            this.state.rxData.unit ||
            this.state.tempStateObject?.common?.unit ||
            this.state.tempObject?.common?.unit ||
            '';
        const label =
            currentValue === null || currentValue === undefined
                ? Generic.t('temperature')
                : `${this.formatValue(currentValue)}${unit}`;
        const humidity = this.state.values[`${this.state.rxData['oid-humidity']}.val`];
        const humidityLabel =
            humidity === null || humidity === undefined ? Generic.t('humidity') : `${this.formatValue(humidity)}%`;

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
                    data-sh-device="sensor"
                    size="small"
                    onClick={() => this.setState({ dialog: true })}
                    className={`sh-colors sh-control thermostat-compact-button${
                        this.state.rxData['oid-humidity'] && this.state.rxData['oid-humidity'] !== 'nothing_selected'
                            ? ' thermostat-compact-button--with-humidity'
                            : ''
                    }`}
                >
                    <span className="thermostat-compact-label">
                        <span>{label}</span>
                        {this.state.rxData['oid-humidity'] &&
                        this.state.rxData['oid-humidity'] !== 'nothing_selected' ? (
                            <span
                                className="thermostat-compact-humidity"
                                style={{ fontSize: 10, fontWeight: 'normal' }}
                            >
                                {humidityLabel}
                            </span>
                        ) : null}
                    </span>
                </Button>

                <Dialog
                    open={!!this.state.dialog}
                    className="thermostat-dialog"
                    onClose={() => this.setState({ dialog: false })}
                    maxWidth="sm"
                    sx={{ '& .MuiDialog-paper': { borderRadius: '20px' } }}
                    fullWidth
                >
                    <DialogTitle className="thermostat-dialog-title">
                        <span>{this.state.rxData.widgetTitle || Generic.t('thermostat')}</span>
                        <IconButton
                            aria-label={Generic.t('close')}
                            style={{ minWidth: 48, minHeight: 48 }}
                            onClick={() => this.setState({ dialog: false })}
                        >
                            <IconClose />
                        </IconButton>
                    </DialogTitle>
                    <DialogContent>{fullContent}</DialogContent>
                </Dialog>
            </>
        );
    }
}
