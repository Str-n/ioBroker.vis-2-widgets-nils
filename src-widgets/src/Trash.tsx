import React from 'react';
import { CheckRounded, DeleteRounded } from '@mui/icons-material';
import type { RxRenderWidgetProps, RxWidgetInfo } from '@iobroker/types-vis-2';

import Generic from './Generic';
import '../public/smarthome.css';
import './Trash.css';

interface TrashRxData {
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
                        {
                            name: 'oidDaysLeft',
                            type: 'id',
                            label: 'trash_days_left',
                            onChange: (_field, data, changeData) => {
                                const id = String(data.oidDaysLeft || '');
                                if (id.endsWith('.daysLeft')) {
                                    changeData({ ...data, oidCompleted: id.replace(/\.daysLeft$/, '.completed') });
                                }
                                return Promise.resolve();
                            },
                        },
                        { name: 'oidCompleted', type: 'id', label: 'trash_completed' },
                        { name: 'daysThreshold', type: 'number', label: 'trash_threshold', default: 7 },
                        {
                            name: 'binColor',
                            type: 'select',
                            label: 'trash_color',
                            default: 'green',
                            options: ['green', 'brown', 'black', 'blue'].map(value => ({
                                value,
                                label: `trash_${value}`,
                            })),
                        },
                    ],
                },
            ],
        };
    }

    getWidgetInfo(): RxWidgetInfo {
        return Trash.getWidgetInfo();
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element | null {
        super.renderWidgetBody(props);
        const { oidCompleted, daysThreshold, binColor } = this.state.rxData;
        const rawDays = this.getPropertyValue('oidDaysLeft');
        const days =
            typeof rawDays === 'number' || (typeof rawDays === 'string' && rawDays.trim()) ? Number(rawDays) : NaN;
        const threshold = daysThreshold === undefined || daysThreshold === '' ? 7 : Number(daysThreshold);
        const due = Number.isFinite(days) && days < (Number.isFinite(threshold) ? threshold : 7);
        if (!due && !this.props.editMode) {
            return null;
        }
        const rawCompleted = this.getPropertyValue('oidCompleted');
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
