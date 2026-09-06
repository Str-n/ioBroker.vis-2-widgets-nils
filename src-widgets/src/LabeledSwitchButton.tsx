import React from 'react';

import type { RxRenderWidgetProps, RxWidgetInfo } from '@iobroker/types-vis-2';

import SwitchButton from './SwitchButton';
import './LabeledSwitchButton.css';

interface LabeledSwitchButtonTextData {
    textLine1?: string;
    textLine2?: string;
}

class LabeledSwitchButton extends SwitchButton {
    static getWidgetInfo(): RxWidgetInfo {
        const switchButtonInfo = SwitchButton.getWidgetInfo();
        const commonGroup = switchButtonInfo.visAttrs[0];

        return {
            ...switchButtonInfo,
            id: 'tplNils2LabeledSwitchButton',
            visName: 'Labeled switch button',
            visWidgetLabel: 'labeled_switch_button',
            visAttrs: [
                {
                    ...commonGroup,
                    fields: [
                        ...commonGroup.fields,
                        {
                            name: 'textLine1',
                            type: 'text',
                            label: 'text_line_1',
                        },
                        {
                            name: 'textLine2',
                            type: 'text',
                            label: 'text_line_2',
                        },
                    ],
                },
                ...switchButtonInfo.visAttrs.slice(1),
            ],
            visDefaultStyle: {
                position: 'absolute',
                width: 96,
                height: 88,
                display: 'inline-block',
            },
            visPrev: 'widgets/vis-2-widgets-nils-fork/img/prev_labeled_switch_button.svg',
        };
    }

    getWidgetInfo(): RxWidgetInfo {
        return LabeledSwitchButton.getWidgetInfo();
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        const button = super.renderWidgetBody(props);
        const data = this.state.rxData as typeof this.state.rxData & LabeledSwitchButtonTextData;

        return (
            <div className="sh-theme sh-labeled-switch-button">
                <div className="sh-labeled-switch-button__control">{button}</div>
                {data.textLine1 || data.textLine2 ? (
                    <div className="sh-labeled-switch-button__labels">
                        {data.textLine1 ? (
                            <div className="sh-labeled-switch-button__primary">{data.textLine1}</div>
                        ) : null}
                        {data.textLine2 ? (
                            <div className="sh-labeled-switch-button__secondary">{data.textLine2}</div>
                        ) : null}
                    </div>
                ) : null}
            </div>
        );
    }
}

export default LabeledSwitchButton;
