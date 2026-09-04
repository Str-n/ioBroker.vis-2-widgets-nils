import React from 'react';

import { Fab, Popover, Slider } from '@mui/material';
import {
    Brightness6,
    DeviceThermostat,
    FlashOn,
    FlashOff,
    Lightbulb,
    LightbulbOutlined,
    PowerSettingsNew,
    PowerSettingsNewRounded,
    ToggleOn,
    ToggleOff,
} from '@mui/icons-material';

import { Icon } from '@iobroker/gui-components';
import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetState } from '@iobroker/types-vis-2';

import Generic from './Generic';

const MATERIAL_ICON_MAP: Record<string, React.ElementType> = {
    flashon: FlashOn,
    flash_off: FlashOff,
    'flash-off': FlashOff,
    flashonoutlined: FlashOn,
    bulb: Lightbulb,
    lightbulb: Lightbulb,
    'lightbulb-outlined': LightbulbOutlined,
    lightbulboutlined: LightbulbOutlined,
    power: PowerSettingsNew,
    power_settings_new: PowerSettingsNew,
    'power-settings-new': PowerSettingsNew,
    power_settings_new_rounded: PowerSettingsNewRounded,
    'power-settings-new-rounded': PowerSettingsNewRounded,
    toggleon: ToggleOn,
    toggle_off: ToggleOff,
    'toggle-off': ToggleOff,
    toggleoff: ToggleOff,
};

interface SwitchButtonRxData {
    oid: string;
    brightness?: string;
    color_temperature?: string;
    color_temperature_scale?: number | string;
    'icon-on'?: string;
    'icon-off'?: string;
    color?: string;
    colorOn?: string;
    colorOff?: string;
    background?: string;
    backgroundOn?: string;
    backgroundOff?: string;
    readOnly: boolean | 'true';
}

type LightControl = 'brightness' | 'color_temperature';

interface SwitchButtonState extends VisRxWidgetState {
    controlsOpen?: boolean;
    controlObjects?: Partial<Record<LightControl, ioBroker.StateObject>>;
    controlValues?: Partial<Record<LightControl, number>>;
}

const LONG_PRESS_DELAY = 600;

function normalizeMaterialIconName(iconName?: string): string {
    return (iconName || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/_+/g, '-').replace(/-+/g, '-');
}

function getIconFromName(iconName?: string): React.ElementType | null {
    if (!iconName) {
        return PowerSettingsNew;
    }

    const normalized = normalizeMaterialIconName(iconName);
    const directMatch = MATERIAL_ICON_MAP[normalized];
    if (directMatch) {
        return directMatch;
    }

    const stripped = normalized.replace(/^mdi:/, '').replace(/^material-icons:/, '');
    if (stripped && MATERIAL_ICON_MAP[stripped]) {
        return MATERIAL_ICON_MAP[stripped];
    }

    return null;
}

export default class SwitchButton extends Generic<SwitchButtonRxData, SwitchButtonState> {
    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplNils2SwitchButton',
            visSet: 'vis-2-widgets-nils-fork',
            visName: 'Switch button',
            visWidgetLabel: 'switch_button',
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        {
                            name: 'oid',
                            type: 'id',
                            label: 'switch_button_oid',
                        },
                        {
                            name: 'brightness',
                            type: 'id',
                            label: 'brightness',
                        },
                        {
                            name: 'color_temperature',
                            type: 'id',
                            label: 'color_temperature',
                        },
                        {
                            name: 'color_temperature_scale',
                            type: 'number',
                            min: 0.01,
                            max: 1000,
                            default: 1,
                            label: 'color_temperature_scale',
                            hidden: '!data.color_temperature || data.color_temperature === "nothing_selected"',
                        },
                        {
                            name: 'color',
                            type: 'color',
                            label: 'switch_button_color',
                        },
                        {
                            name: 'colorOn',
                            type: 'color',
                            label: 'switch_button_color_on',
                        },
                        {
                            name: 'colorOff',
                            type: 'color',
                            label: 'switch_button_color_off',
                        },
                        {
                            name: 'background',
                            type: 'color',
                            label: 'switch_button_background',
                        },
                        {
                            name: 'backgroundOn',
                            type: 'color',
                            label: 'switch_button_background_on',
                        },
                        {
                            name: 'backgroundOff',
                            type: 'color',
                            label: 'switch_button_background_off',
                        },
                        {
                            name: 'readOnly',
                            type: 'checkbox',
                            label: 'read_only',
                            noBinding: false,
                        },
                        {
                            name: 'icon-on',
                            type: 'icon64',
                            label: 'switch_button_on_icon',
                        },
                        {
                            name: 'icon-off',
                            type: 'icon64',
                            label: 'switch_button_off_icon',
                        },
                    ],
                },
            ],
            visDefaultStyle: {
                position: 'absolute',
                width: 40,
                height: 40,
                display: 'inline-block',
            },
            visPrev: 'widgets/vis-2-widgets-nils-fork/img/prev_switch_button.png',
        };
    }

    getWidgetInfo(): RxWidgetInfo {
        return SwitchButton.getWidgetInfo();
    }

    private readonly fabRef = React.createRef<HTMLButtonElement>();

    private longPressTimer: ReturnType<typeof setTimeout> | null = null;

    private longPressTriggered = false;

    async componentDidMount(): Promise<void> {
        super.componentDidMount();
        await this.readControlObjects();
    }

    componentWillUnmount(): void {
        this.cancelLongPress();
        super.componentWillUnmount();
    }

    async onRxDataChanged(): Promise<void> {
        this.cancelLongPress();
        await this.readControlObjects();
    }

    private getControlId(control: LightControl): string | undefined {
        const id = this.state.rxData[control];
        return id && id !== 'nothing_selected' ? id : undefined;
    }

    private async readControlObjects(): Promise<void> {
        const controls: LightControl[] = ['brightness', 'color_temperature'];
        const ids = controls.map(control => this.getControlId(control)).filter((id): id is string => !!id);
        const objects =
            (ids.length
                ? ((await this.props.context.socket.getObjectsById(ids)) as
                      | Record<string, ioBroker.StateObject>
                      | undefined)
                : {}) || {};
        const controlObjects: Partial<Record<LightControl, ioBroker.StateObject>> = {};

        controls.forEach(control => {
            const id = this.getControlId(control);
            if (id && objects[id]) {
                controlObjects[control] = objects[id];
            }
        });
        this.setState({ controlObjects });
    }

    private cancelLongPress = (): void => {
        if (this.longPressTimer) {
            clearTimeout(this.longPressTimer);
            this.longPressTimer = null;
        }
    };

    private getControlScale(control: LightControl): number {
        if (control !== 'color_temperature') {
            return 1;
        }

        const scale = Number(this.state.rxData.color_temperature_scale);
        return Number.isFinite(scale) && scale > 0 ? scale : 1;
    }

    private getControlRange(control: LightControl): { min: number; max: number; step: number; unit: string } {
        const common = this.state.controlObjects?.[control]?.common;
        const defaultRange =
            control === 'brightness' ? { min: 0, max: 100, step: 1 } : { min: 2700, max: 6500, step: 50 };
        const scale = this.getControlScale(control);
        const rawMin = typeof common?.min === 'number' ? common.min : defaultRange.min / scale;
        const rawMax = typeof common?.max === 'number' && common.max > rawMin ? common.max : defaultRange.max / scale;
        const rawStep = typeof common?.step === 'number' && common.step > 0 ? common.step : defaultRange.step / scale;
        const min = rawMin * scale;
        const max = rawMax * scale;
        const step = rawStep * scale;
        const unit = typeof common?.unit === 'string' ? common.unit : control === 'brightness' ? '%' : 'K';
        return { min, max, step, unit };
    }

    private getControlValue(control: LightControl): number {
        const range = this.getControlRange(control);
        const value = Number(this.state.values[`${this.getControlId(control)}.val`]) * this.getControlScale(control);
        return Number.isFinite(value) ? Math.min(range.max, Math.max(range.min, value)) : range.min;
    }

    private openControls = (rawValue: unknown): void => {
        const controls = (['brightness', 'color_temperature'] as LightControl[]).filter(control =>
            this.getControlId(control),
        );
        if (!controls.length) {
            return;
        }

        this.longPressTriggered = true;
        if (!this.isOn(rawValue)) {
            this.props.context.setValue(this.state.rxData.oid, this.getNextValue(rawValue));
        }
        this.setState({
            controlsOpen: true,
            controlValues: Object.fromEntries(controls.map(control => [control, this.getControlValue(control)])),
        });
    };

    private startLongPress = (rawValue: unknown): void => {
        this.cancelLongPress();
        this.longPressTriggered = false;
        this.longPressTimer = setTimeout(() => {
            this.longPressTimer = null;
            this.openControls(rawValue);
        }, LONG_PRESS_DELAY);
    };

    private renderControl(control: LightControl): React.JSX.Element | null {
        const id = this.getControlId(control);
        if (!id) {
            return null;
        }

        const range = this.getControlRange(control);
        const value = this.state.controlValues?.[control] ?? this.getControlValue(control);
        const label = control === 'brightness' ? Generic.t('brightness') : Generic.t('color_temperature');
        const ControlIcon = control === 'brightness' ? Brightness6 : DeviceThermostat;

        return (
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: '24px minmax(150px, 1fr)',
                    columnGap: 12,
                    alignItems: 'center',
                }}
            >
                <ControlIcon
                    color="action"
                    aria-hidden="true"
                />
                <div>
                    <span style={{ display: 'block', fontSize: '0.75rem', lineHeight: 1.66, opacity: 0.7 }}>
                        {label}
                    </span>
                    <Slider
                        size="small"
                        min={range.min}
                        max={range.max}
                        step={range.step}
                        value={value}
                        valueLabelDisplay="auto"
                        valueLabelFormat={sliderValue => `${sliderValue}${range.unit}`}
                        aria-label={label}
                        onChange={(_event, newValue) => {
                            if (typeof newValue === 'number') {
                                this.setState({ controlValues: { ...this.state.controlValues, [control]: newValue } });
                            }
                        }}
                        onChangeCommitted={(_event, newValue) => {
                            if (typeof newValue === 'number') {
                                this.props.context.setValue(id, newValue / this.getControlScale(control));
                            }
                        }}
                    />
                </div>
            </div>
        );
    }

    private isOn(value: unknown): boolean {
        if (value === true || value === 'true') {
            return true;
        }
        if (value === false || value === 'false') {
            return false;
        }
        if (typeof value === 'number') {
            return value !== 0;
        }
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            if (normalized === '0' || normalized === 'false') {
                return false;
            }
            if (normalized === '1' || normalized === 'true') {
                return true;
            }
        }
        return Boolean(value);
    }

    private getNextValue(currentValue: unknown): boolean | number {
        const isOn = this.isOn(currentValue);
        if (typeof currentValue === 'number') {
            return isOn ? 0 : 1;
        }
        if (typeof currentValue === 'string') {
            const normalized = currentValue.trim().toLowerCase();
            if (normalized === '0' || normalized === '1') {
                return isOn ? 0 : 1;
            }
        }
        return !isOn;
    }

    private getIconElement(iconName: string | undefined): React.JSX.Element {
        const MaterialIcon = getIconFromName(iconName);

        if (MaterialIcon) {
            const IconComponent = MaterialIcon;
            return <IconComponent style={{ width: '70%', height: '70%' }} />;
        }

        const src = iconName || 'power';
        return (
            <Icon
                src={src}
                style={{
                    width: '70%',
                    height: '70%',
                    color: 'currentColor',
                }}
            />
        );
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element | null {
        super.renderWidgetBody(props);

        // The button's shadow extends beyond the widget bounds and must remain visible.
        props.style.overflow = 'visible';
        props.style.overflowX = 'visible';
        props.style.overflowY = 'visible';

        const oid = this.state.rxData.oid;
        if (!oid) {
            return null;
        }

        const rawValue = this.state.values[`${oid}.val`];
        const isOn = this.isOn(rawValue);
        const iconName = isOn ? this.state.rxData['icon-on'] : this.state.rxData['icon-off'];
        const color = (isOn ? this.state.rxData.colorOn : this.state.rxData.colorOff) || this.state.rxData.color;
        const background =
            (isOn ? this.state.rxData.backgroundOn : this.state.rxData.backgroundOff) || this.state.rxData.background;

        const disabled = this.state.rxData.readOnly === true || this.state.rxData.readOnly === 'true';
        const hasControls = !!(this.getControlId('brightness') || this.getControlId('color_temperature'));

        return (
            <>
                <Fab
                    ref={this.fabRef}
                    size="small"
                    color={isOn ? 'primary' : 'default'}
                    disabled={disabled}
                    onPointerDown={e => {
                        e.stopPropagation();
                        if (!disabled && hasControls && e.button === 0) {
                            e.currentTarget.setPointerCapture(e.pointerId);
                            this.startLongPress(rawValue);
                        }
                    }}
                    onPointerUp={this.cancelLongPress}
                    onPointerCancel={this.cancelLongPress}
                    onPointerLeave={this.cancelLongPress}
                    onContextMenu={e => {
                        if (hasControls) {
                            e.preventDefault();
                        }
                    }}
                    onClick={e => {
                        e.stopPropagation();
                        if (this.longPressTriggered) {
                            this.longPressTriggered = false;
                            return;
                        }
                        if (!disabled) {
                            this.props.context.setValue(oid, this.getNextValue(rawValue));
                        }
                    }}
                    sx={{
                        width: '100%',
                        height: '100%',
                        minWidth: 0,
                        minHeight: 0,
                        ...(background ? { backgroundColor: background } : {}),
                        ...(background ? { '&:hover': { backgroundColor: background } } : {}),
                        ...(color ? { color } : {}),
                        padding: 0,
                        touchAction: 'manipulation',
                    }}
                    aria-label={isOn ? 'on' : 'off'}
                    aria-haspopup={hasControls ? 'dialog' : undefined}
                    aria-expanded={hasControls ? !!this.state.controlsOpen : undefined}
                >
                    {this.getIconElement(iconName)}
                    {this.getControlId('brightness') ? (
                        <span
                            aria-hidden="true"
                            style={{
                                position: 'absolute',
                                right: '4%',
                                bottom: '4%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '30%',
                                height: '30%',
                                minWidth: 10,
                                minHeight: 10,
                                maxWidth: 18,
                                maxHeight: 18,
                                borderRadius: '50%',
                                color: '#fff',
                                backgroundColor: 'rgba(0, 0, 0, 0.58)',
                                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.35)',
                                pointerEvents: 'none',
                            }}
                        >
                            <Brightness6 style={{ width: '72%', height: '72%' }} />
                        </span>
                    ) : null}
                </Fab>
                <Popover
                    open={!!this.state.controlsOpen}
                    anchorEl={this.fabRef.current}
                    onClose={() => this.setState({ controlsOpen: false })}
                    anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
                    transformOrigin={{ vertical: 'top', horizontal: 'center' }}
                    slotProps={{
                        paper: {
                            elevation: 6,
                            style: { marginTop: 8, padding: 16, minWidth: 230, borderRadius: 8 },
                            onPointerDown: (event: React.PointerEvent<HTMLElement>) => event.stopPropagation(),
                        },
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {this.renderControl('brightness')}
                        {this.renderControl('color_temperature')}
                    </div>
                </Popover>
            </>
        );
    }
}
