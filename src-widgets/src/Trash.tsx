import React from 'react';
import { CheckRounded, DeleteRounded } from '@mui/icons-material';
import type { RxRenderWidgetProps, RxWidgetInfo, RxWidgetInfoGroup } from '@iobroker/types-vis-2';

import Generic from './Generic';
import '../public/smarthome.css';
import './Trash.css';

interface TrashRxData {
    binCount?: number | string;
    [key: `oidDaysLeft${number}`]: string;
    [key: `oidCompleted${number}`]: string;
    [key: `binColor${number}`]: string;
    oidDaysLeft: string;
    oidCompleted: string;
    daysThreshold: number | string;
    binColor: 'green' | 'brown' | 'black' | 'blue';
}

export default class Trash extends Generic<TrashRxData> {
    static smartHomeTheme = true;

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplNils2Trash',
            visSet: 'vis-2-widgets-nils-fork',
            visName: 'Trash',
            visWidgetLabel: 'trash_widget',
            visPrev: 'widgets/vis-2-widgets-nils-fork/img/prev_trash.svg',
            visDefaultStyle: { width: 56, height: 56, position: 'absolute' },
            visAttrs: [
                {
                    name: 'common',
                    fields: [
                        { name: 'daysThreshold', type: 'number', label: 'trash_threshold', default: 7 },
                        { name: 'binCount', type: 'number', label: 'trash_bin_count', default: 1, min: 1, max: 4 },
                    ],
                },
                ...[1, 2, 3, 4].map((index): RxWidgetInfoGroup => {
                    // Keep the original unsuffixed fields for existing single-bin widgets.
                    const suffix = index === 1 ? '' : String(index);
                    const daysField = `oidDaysLeft${suffix}`;
                    const completedField = `oidCompleted${suffix}`;
                    return {
                        name: `trash_bin_${index}`,
                        label: `trash_bin_${index}`,
                        hidden: data => Number(data.binCount || 1) < index,
                        fields: [
                            {
                                name: daysField,
                                type: 'id',
                                label: 'trash_days_left',
                                onChange: (_field, data, changeData) => {
                                    const id = String(data[daysField] || '');
                                    if (id.endsWith('.daysLeft')) {
                                        changeData({
                                            ...data,
                                            [completedField]: id.replace(/\.daysLeft$/, '.completed'),
                                        });
                                    }
                                    return Promise.resolve();
                                },
                            },
                            { name: completedField, type: 'id', label: 'trash_completed' },
                            {
                                name: `binColor${suffix}`,
                                type: 'select',
                                label: 'trash_color',
                                default: ['green', 'brown', 'black', 'blue'][index - 1],
                                options: ['green', 'brown', 'black', 'blue'].map(value => ({
                                    value,
                                    label: `trash_${value}`,
                                })),
                            },
                        ],
                    };
                }),
            ],
        };
    }

    getWidgetInfo(): RxWidgetInfo {
        return Trash.getWidgetInfo();
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element | null {
        super.renderWidgetBody(props);
        const data = this.state.rxData;
        const { daysThreshold } = data;
        const threshold = daysThreshold === undefined || daysThreshold === '' ? 7 : Number(daysThreshold);
        const configuredCount = Number(data.binCount);
        const count = Number.isFinite(configuredCount) ? Math.max(1, Math.min(4, Math.floor(configuredCount))) : 1;
        const bins = Array.from({ length: count }, (_, index) => {
            const suffix = index === 0 ? '' : String(index + 1);
            const rawDays = this.getPropertyValue(`oidDaysLeft${suffix}`);
            const days =
                typeof rawDays === 'number' || (typeof rawDays === 'string' && rawDays.trim()) ? Number(rawDays) : NaN;
            return {
                days,
                oidCompleted: data[`oidCompleted${suffix}` as keyof TrashRxData] as string,
                binColor: data[`binColor${suffix}` as keyof TrashRxData] || ['green', 'brown', 'black', 'blue'][index],
                rawCompleted: this.getPropertyValue(`oidCompleted${suffix}`),
            };
        });
        const activeBin = bins
            .filter(bin => Number.isFinite(bin.days) && bin.days < (Number.isFinite(threshold) ? threshold : 7))
            .sort((a, b) => a.days - b.days)[0];
        if (!activeBin && !this.props.editMode) {
            return null;
        }
        const { days, oidCompleted, binColor, rawCompleted } = activeBin || bins[0];
        const completed = rawCompleted === true || rawCompleted === 'true' || rawCompleted === 1;
        const knownCompleted = completed || rawCompleted === false || rawCompleted === 'false' || rawCompleted === 0;
        const label = Trash.t(completed ? 'trash_moved_out' : 'trash_move_out');
        const daysLabel = Number.isFinite(days) ? `${days} ${Trash.t(days === 1 ? 'trash_day' : 'trash_days')}` : '—';
        const accessibleLabel = `${daysLabel}: ${label}`;

        return (
            <div className="sh-theme sh-trash">
                <button
                    type="button"
                    className="sh-trash__button"
                    data-color={binColor || 'green'}
                    data-completed={completed}
                    aria-label={accessibleLabel}
                    aria-pressed={completed}
                    title={accessibleLabel}
                    disabled={!!this.props.editMode || !oidCompleted || !knownCompleted}
                    onClick={event => {
                        event.stopPropagation();
                        this.props.context.setValue(oidCompleted, !completed);
                    }}
                >
                    <DeleteRounded style={{ width: 36, height: 36 }} />
                    <span
                        className="sh-trash__days"
                        aria-hidden="true"
                    >
                        {Number.isFinite(days) ? days : '—'}
                    </span>
                    {completed ? (
                        <CheckRounded
                            className="sh-trash__check"
                            style={{ width: 16, height: 16 }}
                        />
                    ) : null}
                </button>
            </div>
        );
    }
}
