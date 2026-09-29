import React from 'react';
import { PowerSettingsNew, WaterDropOutlined, Air, HelpOutlined, DeviceThermostat } from '@mui/icons-material';
import type { RxRenderWidgetProps, RxWidgetInfo } from '@iobroker/types-vis-2';
import Generic from './Generic';
import '../public/smarthome.css';
import './Dehumidifier.css';

interface DehumidifierData {
    powerOid: string;
    levelOid: string;
    temperatureOid: string;
    humidityOid: string;
    readOnly?: boolean | 'true';
}

export const dehumidifierBindings = {
    powerOid: '0_userdata.0.Feuchtigkeit.Power_Mode',
    levelOid: '0_userdata.0.Feuchtigkeit.Power_Mode_Level',
    temperatureOid: '0_userdata.0.Feuchtigkeit.T_in',
    humidityOid: '0_userdata.0.Feuchtigkeit.rel_humidity_basement',
};

function LevelBars({ level }: { level: number }): React.JSX.Element {
    return (
        <span
            className="sh-dehumidifier__bars"
            aria-hidden="true"
        >
            {[1, 2, 3].map(bar => (
                <span
                    key={bar}
                    data-filled={bar <= level}
                />
            ))}
        </span>
    );
}

export default class Dehumidifier extends Generic<DehumidifierData> {
    static smartHomeTheme = true;

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplNils2Dehumidifier',
            visSet: 'vis-2-widgets-nils-fork',
            visName: 'Dehumidifier',
            visWidgetLabel: 'dehumidifier',
            visPrev: 'widgets/vis-2-widgets-nils-fork/img/prev_dehumidifier.svg',
            visDefaultStyle: { width: 240, height: 144, position: 'absolute' },
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        {
                            name: 'powerOid',
                            type: 'id',
                            label: 'dehumidifier_power_oid',
                            default: dehumidifierBindings.powerOid,
                        },
                        {
                            name: 'levelOid',
                            type: 'id',
                            label: 'dehumidifier_level_oid',
                            default: dehumidifierBindings.levelOid,
                        },
                        { name: 'readOnly', type: 'checkbox', label: 'read_only', default: false },
                        {
                            name: 'temperatureOid',
                            type: 'id',
                            label: 'dehumidifier_temperature',
                            default: dehumidifierBindings.temperatureOid,
                        },
                        {
                            name: 'humidityOid',
                            type: 'id',
                            label: 'dehumidifier_humidity',
                            default: dehumidifierBindings.humidityOid,
                        },
                    ],
                },
            ],
        };
    }

    getWidgetInfo(): RxWidgetInfo {
        return Dehumidifier.getWidgetInfo();
    }

    private canControl(level: number): boolean {
        const { powerOid, levelOid, readOnly } = this.state.rxData;
        return (
            !this.state.editMode &&
            !this.props.editMode &&
            readOnly !== true &&
            readOnly !== 'true' &&
            !!powerOid &&
            powerOid !== 'nothing_selected' &&
            (level === 0 || (!!levelOid && levelOid !== 'nothing_selected' && levelOid !== powerOid))
        );
    }

    private selectLevel = (level: number): void => {
        if (!this.canControl(level)) {
            return;
        }
        const { powerOid, levelOid } = this.state.rxData;
        if (level !== 0) {
            this.props.context.setValue(levelOid, level);
        }
        this.props.context.setValue(powerOid, level !== 0);
    };

    private formatReading(oid: string, humidity = false): string {
        const raw = this.state.values[`${oid}.val`];
        if (typeof raw !== 'number' && (typeof raw !== 'string' || !raw.trim())) {
            return '–';
        }
        const value = Number(raw);
        if (!Number.isFinite(value) || (humidity && (value < 0 || value > 100))) {
            return '–';
        }
        return new Intl.NumberFormat(Generic.getLanguage(), {
            minimumFractionDigits: humidity ? 0 : 1,
            maximumFractionDigits: humidity ? 0 : 1,
        }).format(value);
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const { powerOid, levelOid, temperatureOid, humidityOid } = this.state.rxData;
        const power = this.state.values[`${powerOid}.val`];
        const rawLevel = this.state.values[`${levelOid}.val`];
        const running = power === true || power === 'true' || power === 1 || power === '1';
        const off = power === false || power === 'false' || power === 0 || power === '0';
        const level = [1, 2, 3].find(value => rawLevel === value || rawLevel === String(value));
        const labels = ['dehumidifier_off', 'dehumidifier_low', 'dehumidifier_medium', 'dehumidifier_high'];
        const status = off
            ? Generic.t(labels[0])
            : running
              ? `${Generic.t('dehumidifier_running')} · ${Generic.t(level ? labels[level] : 'dehumidifier_unknown_level')}`
              : Generic.t('dehumidifier_unavailable');

        return (
            <div
                className="sh-theme sh-surface sh-dehumidifier"
                data-running={running}
                data-level={running ? level : undefined}
            >
                <div
                    className="sh-dehumidifier__status"
                    role="status"
                    aria-label={status}
                    title={status}
                >
                    <span
                        className="sh-dehumidifier__device"
                        aria-hidden="true"
                    >
                        <WaterDropOutlined />
                        <span className="sh-dehumidifier__indicator">
                            {running ? <Air /> : off ? <PowerSettingsNew /> : <HelpOutlined />}
                        </span>
                    </span>
                    <span
                        className="sh-dehumidifier__flow"
                        aria-hidden="true"
                    >
                        <Air />
                    </span>
                    {running && !level ? (
                        <HelpOutlined aria-hidden="true" />
                    ) : (
                        <LevelBars level={running ? (level ?? 0) : 0} />
                    )}
                </div>
                <div className="sh-dehumidifier__readings">
                    <span
                        className="sh-dehumidifier__reading"
                        title={Generic.t('dehumidifier_temperature')}
                        aria-label={`${Generic.t('dehumidifier_temperature')}: ${this.formatReading(temperatureOid)} °C`}
                    >
                        <DeviceThermostat aria-hidden="true" />
                        <span className="sh-dehumidifier__temperature">{this.formatReading(temperatureOid)} °C</span>
                    </span>
                    <span
                        className="sh-dehumidifier__reading"
                        title={Generic.t('dehumidifier_humidity')}
                        aria-label={`${Generic.t('dehumidifier_humidity')}: ${this.formatReading(humidityOid, true)} %`}
                    >
                        <WaterDropOutlined aria-hidden="true" />
                        <span className="sh-dehumidifier__humidity">{this.formatReading(humidityOid, true)} %</span>
                    </span>
                </div>
                <div
                    className="sh-dehumidifier__controls"
                    role="group"
                    aria-label={Generic.t('dehumidifier')}
                >
                    {labels.map((label, value) => (
                        <button
                            key={label}
                            type="button"
                            className="sh-dehumidifier__button sh-focusable"
                            aria-label={Generic.t(label)}
                            title={Generic.t(label)}
                            aria-pressed={value === 0 ? off : running && level === value}
                            disabled={!this.canControl(value)}
                            onClick={() => this.selectLevel(value)}
                        >
                            {value === 0 ? <PowerSettingsNew aria-hidden="true" /> : <LevelBars level={value} />}
                        </button>
                    ))}
                </div>
            </div>
        );
    }
}
