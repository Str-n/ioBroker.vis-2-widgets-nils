import React from 'react';

import { IconButton } from '@mui/material';
import {
    FlashOn,
    FlashOff,
    Lightbulb,
    LightbulbOutlined,
    PowerSettingsNew,
    PowerSettingsNewRounded,
    ToggleOn,
    ToggleOff,
} from '@mui/icons-material';

import { Icon } from '@iobroker/adapter-react-v5';
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
    'icon-on': string;
    'icon-off': string;
    color: string;
    colorOn: string;
    colorOff: string;
    background: string;
    backgroundOn: string;
    backgroundOff: string;
    readOnly: boolean | 'true';
}

interface SwitchButtonState extends VisRxWidgetState {}

function normalizeMaterialIconName(iconName?: string): string {
    return (iconName || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/_+/g, '-')
        .replace(/-+/g, '-');
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
                            name: 'color',
                            type: 'color',
                            label: 'switch_button_color',
                            default: '#9e9e9e',
                        },
                        {
                            name: 'colorOn',
                            type: 'color',
                            label: 'switch_button_color_on',
                            default: '#4caf50',
                        },
                        {
                            name: 'colorOff',
                            type: 'color',
                            label: 'switch_button_color_off',
                            default: '#9e9e9e',
                        },
                        {
                            name: 'background',
                            type: 'color',
                            label: 'switch_button_background',
                            default: '#00000000',
                        },
                        {
                            name: 'backgroundOn',
                            type: 'color',
                            label: 'switch_button_background_on',
                            default: '#4caf5033',
                        },
                        {
                            name: 'backgroundOff',
                            type: 'color',
                            label: 'switch_button_background_off',
                            default: '#9e9e9e33',
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

    private getIconElement(iconName: string | undefined, color: string): React.JSX.Element {
        const MaterialIcon = getIconFromName(iconName);

        if (MaterialIcon) {
            const IconComponent = MaterialIcon;
            return <IconComponent style={{ width: '70%', height: '70%', color }} />;
        }

        const src = iconName || 'power';
        return (
            <Icon
                src={src}
                style={{
                    width: '70%',
                    height: '70%',
                    color,
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
        const baseColor = this.state.rxData.color || '#9e9e9e';
        const color = isOn ? this.state.rxData.colorOn || baseColor : this.state.rxData.colorOff || baseColor;
        const background = isOn
            ? this.state.rxData.backgroundOn || this.state.rxData.background || '#4caf5033'
            : this.state.rxData.backgroundOff || this.state.rxData.background || '#9e9e9e33';

        const disabled = this.state.rxData.readOnly === true || this.state.rxData.readOnly === 'true';

        return (
            <IconButton
                size="small"
                color="primary"
                disabled={disabled}
                onClick={e => {
                    e.stopPropagation();
                    if (!disabled) {
                        this.props.context.setValue(oid, this.getNextValue(rawValue));
                    }
                }}
                style={{
                    width: '100%',
                    height: '100%',
                    minWidth: 0,
                    minHeight: 0,
                    borderRadius: '50%',
                    background,
                    color,
                    boxShadow: isOn
                        ? `2px 4px 10px color-mix(in srgb, ${color} 35%, transparent)`
                        : `2px 4px 10px color-mix(in srgb, ${color} 35%, transparent)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    transition: 'all 0.2s ease',
                }}
                aria-label={isOn ? 'on' : 'off'}
            >
                {this.getIconElement(iconName, color)}
            </IconButton>
        );
    }
}
