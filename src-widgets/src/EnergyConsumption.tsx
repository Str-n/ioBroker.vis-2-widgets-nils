import React from 'react';
import type { RxRenderWidgetProps, RxWidgetInfo } from '@iobroker/types-vis-2';
import Generic from './Generic';
import { energyConsumptionBindings, energyFlow, powerReading } from './EnergyConsumptionUtils';
import '../public/smarthome.css';
import './EnergyConsumption.css';

interface EnergyConsumptionData extends Record<string, any> {
    gridOid: string;
    solarOid: string;
    gridUnit: 'W' | 'kW';
    solarUnit: 'W' | 'kW';
    invertGrid: boolean | 'true';
    noCard: boolean | 'true';
}

export default class EnergyConsumption extends Generic<EnergyConsumptionData> {
    static smartHomeTheme = true;

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplNils2EnergyConsumption',
            visSet: 'vis-2-widgets-nils-fork',
            visName: 'Energy consumption',
            visWidgetLabel: 'energy_consumption',
            visPrev: 'widgets/vis-2-widgets-nils-fork/img/prev_energy_consumption.svg',
            visDefaultStyle: { width: 370, height: 150, position: 'relative' },
            visAttrs: [
                {
                    name: 'common',
                    fields: [{ name: 'noCard', label: 'without_card', type: 'checkbox', default: false }],
                },
                {
                    name: 'energy_inputs',
                    label: 'energy_inputs',
                    fields: [
                        {
                            name: 'gridOid',
                            label: 'energy_grid_oid',
                            type: 'id',
                            default: energyConsumptionBindings.gridOid,
                            tooltip: 'energy_grid_help',
                        },
                        {
                            name: 'gridUnit',
                            label: 'energy_grid_unit',
                            type: 'select',
                            default: 'W',
                            options: ['W', 'kW'],
                        },
                        { name: 'invertGrid', label: 'energy_invert_grid', type: 'checkbox', default: false },
                        {
                            name: 'solarOid',
                            label: 'energy_solar_oid',
                            type: 'id',
                            default: energyConsumptionBindings.solarOid,
                        },
                        {
                            name: 'solarUnit',
                            label: 'energy_solar_unit',
                            type: 'select',
                            default: 'W',
                            options: ['W', 'kW'],
                        },
                    ],
                },
            ],
        };
    }

    getWidgetInfo(): RxWidgetInfo {
        return EnergyConsumption.getWidgetInfo();
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        const data = this.state.rxData;
        const flow = energyFlow(
            this.state.values[`${data.gridOid}.val`],
            this.state.values[`${data.solarOid}.val`],
            data.gridUnit,
            data.solarUnit,
            data.invertGrid === true || data.invertGrid === 'true',
        );
        const t = (key: string): string => Generic.t(key).replace('vis_2_widgets_nils_', '');
        const formatPower = (value: number, digits: number): string =>
            new Intl.NumberFormat(Generic.getLanguage(), {
                minimumFractionDigits: digits,
                maximumFractionDigits: digits,
            }).format(value);
        const reading = (watts: number | undefined, className: string): React.JSX.Element => {
            const formatted = powerReading(watts);
            return (
                <tspan className={className}>
                    {formatted.value === undefined ? '–' : formatPower(formatted.value, formatted.digits)}
                    <tspan className="sh-energy-consumption__unit"> {formatted.unit}</tspan>
                </tspan>
            );
        };
        const exporting = flow.grid !== undefined && flow.grid < 0;
        const gridLabel = exporting
            ? 'energy_export'
            : flow.grid === undefined || flow.grid === 0
              ? 'energy_grid'
              : 'energy_import';
        const status = flow.inconsistent
            ? 'energy_check_readings'
            : flow.home === undefined
              ? 'energy_unavailable'
              : 'energy_now';
        const solarActive = flow.home !== undefined && flow.solar !== undefined && flow.solar > 0;
        const gridActive = flow.home !== undefined && flow.grid !== undefined && flow.grid !== 0;
        const percent = flow.solarShare === undefined ? undefined : Math.round(flow.solarShare * 100);
        const id = `energy-${Array.from(this.props.id, char => char.codePointAt(0)!.toString(16)).join('-')}`;
        const describePower = (watts: number | undefined): string => {
            const formatted = powerReading(watts);
            return formatted.value === undefined
                ? t('energy_unavailable')
                : `${formatPower(formatted.value, formatted.digits)} ${formatted.unit}`;
        };

        return (
            <div
                className={`sh-energy-consumption${data.noCard === true || data.noCard === 'true' ? ' sh-energy-consumption--bare' : ''}`}
            >
                <svg
                    viewBox="0 0 370 150"
                    role="img"
                    aria-labelledby={`${id}-title ${id}-description`}
                >
                    <title id={`${id}-title`}>{t('energy_consumption')}</title>
                    <desc
                        id={`${id}-description`}
                    >{`${t('energy_home')}: ${describePower(flow.home)}. ${t('energy_solar')}: ${describePower(flow.solar)}. ${t(gridLabel)}: ${describePower(flow.grid)}. ${t(status)}.`}</desc>
                    <text
                        x="14"
                        y="22"
                        className="sh-energy-consumption__title"
                    >
                        {t('energy_consumption')}
                    </text>
                    <text
                        x="356"
                        y="22"
                        textAnchor="end"
                        className="sh-energy-consumption__muted"
                    >
                        {t(status)}
                    </text>

                    <path
                        d="M79 61H152M218 61H291"
                        className="sh-energy-consumption__track"
                    />
                    {solarActive ? (
                        <g className="sh-energy-consumption__solar-flow">
                            <path
                                d="M79 61H152"
                                className="sh-energy-consumption__flow"
                            />
                            <path
                                d="M130 58L134 61L130 64"
                                className="sh-energy-consumption__arrow"
                            />
                        </g>
                    ) : null}
                    {gridActive ? (
                        <g
                            className={`sh-energy-consumption__grid-flow${exporting ? ' sh-energy-consumption__grid-flow--export' : ''}`}
                        >
                            <path
                                d={exporting ? 'M218 61H291' : 'M291 61H218'}
                                className="sh-energy-consumption__flow"
                            />
                            <path
                                d={exporting ? 'M259 58L263 61L259 64' : 'M263 58L259 61L263 64'}
                                className="sh-energy-consumption__arrow"
                            />
                        </g>
                    ) : null}

                    <g
                        transform="translate(58 61)"
                        className="sh-energy-consumption__solar-icon"
                    >
                        <circle r="8" />
                        <path d="M0-16V-12M0 12V16M-16 0H-12M12 0H16M-11-11L-8-8M8 8L11 11M-11 11L-8 8M8-8L11-11" />
                    </g>
                    <circle
                        cx="185"
                        cy="61"
                        r="28"
                        className="sh-energy-consumption__ring"
                    />
                    {flow.home !== undefined && flow.home > 0 ? (
                        <>
                            <circle
                                cx="185"
                                cy="61"
                                r="28"
                                className="sh-energy-consumption__ring-grid"
                            />
                            <circle
                                cx="185"
                                cy="61"
                                r="28"
                                pathLength="100"
                                strokeDasharray={`${(flow.solarShare ?? 0) * 100} 100`}
                                transform="rotate(-90 185 61)"
                                className="sh-energy-consumption__ring-solar"
                            />
                        </>
                    ) : null}
                    <path
                        d="M172 60L185 49L198 60M175 58V72H195V58M182 72V63H188V72"
                        className="sh-energy-consumption__home-icon"
                    />
                    <g
                        transform="translate(312 61)"
                        className="sh-energy-consumption__grid-icon"
                    >
                        <path d="M-10 15L0-16L10 15M-10-6H10M-14 3H14M-6 3L6 11M6 3L-6 11M-10-6V-2M10-6V-2M-14 3V7M14 3V7M-13 15H-7M7 15H13" />
                    </g>
                    <text
                        x="58"
                        y="98"
                        textAnchor="middle"
                        className="sh-energy-consumption__solar-value"
                    >
                        {reading(flow.solar, 'sh-energy-consumption__value')}
                    </text>
                    <text
                        x="185"
                        y="108"
                        textAnchor="middle"
                    >
                        {reading(flow.home, 'sh-energy-consumption__home-value')}
                    </text>
                    <text
                        x="312"
                        y="98"
                        textAnchor="middle"
                    >
                        {reading(flow.grid, 'sh-energy-consumption__value')}
                    </text>
                    <text
                        x="58"
                        y="115"
                        textAnchor="middle"
                        className="sh-energy-consumption__muted"
                    >
                        {t('energy_solar')}
                    </text>
                    <text
                        x="312"
                        y="115"
                        textAnchor="middle"
                        className="sh-energy-consumption__muted"
                    >
                        {t(gridLabel)}
                    </text>
                    <text
                        x="185"
                        y="124"
                        textAnchor="middle"
                        className="sh-energy-consumption__muted"
                    >
                        {t('energy_home')}
                    </text>
                    <text
                        x="14"
                        y="143"
                        className="sh-energy-consumption__muted"
                    >
                        {t('energy_solar_share')}
                    </text>
                    <path
                        d="M115 139H307"
                        className="sh-energy-consumption__share-track"
                    />
                    {flow.solarShare !== undefined && flow.solarShare > 0 ? (
                        <path
                            d={`M115 139H${115 + 192 * flow.solarShare}`}
                            className="sh-energy-consumption__share"
                        />
                    ) : null}
                    <text
                        x="356"
                        y="143"
                        textAnchor="end"
                        className="sh-energy-consumption__percentage"
                    >
                        {percent === undefined ? '–' : `${percent}%`}
                    </text>
                </svg>
            </div>
        );
    }
}
