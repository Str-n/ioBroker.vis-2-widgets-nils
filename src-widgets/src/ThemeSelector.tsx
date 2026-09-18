import React from 'react';
import type { RxRenderWidgetProps, RxWidgetInfo } from '@iobroker/types-vis-2';

import Generic from './Generic';
import { themeNames, isSmartHomeThemeId } from './theme/presets';
import { selectSmartHomeTheme, useSelectedTheme } from './theme/themeSelection';
import '../public/smarthome.css';
import './ThemeSelector.css';

function ThemeSelection({ disabled }: { disabled: boolean }): React.JSX.Element {
    const selected = useSelectedTheme();
    return (
        <label className="sh-theme sh-theme-selector">
            <span>{ThemeSelector.t('theme_selector')}</span>
            <select
                value={selected}
                disabled={disabled}
                onPointerDown={event => event.stopPropagation()}
                onClick={event => event.stopPropagation()}
                onChange={event => {
                    if (isSmartHomeThemeId(event.target.value)) {
                        selectSmartHomeTheme(event.target.value);
                    }
                }}
            >
                {Object.entries(themeNames).map(([id, name]) => (
                    <option
                        key={id}
                        value={id}
                    >
                        {name}
                    </option>
                ))}
            </select>
        </label>
    );
}

export default class ThemeSelector extends Generic<Record<string, never>> {
    static smartHomeTheme = true;

    static getWidgetInfo(): RxWidgetInfo {
        return {
            id: 'tplNils2ThemeSelector',
            visSet: 'vis-2-widgets-nils-fork',
            visName: 'Theme selector',
            visWidgetLabel: 'theme_selector',
            visAttrs: [],
            visDefaultStyle: { width: 220, height: 76, position: 'absolute' },
            visPrev: 'widgets/vis-2-widgets-nils-fork/img/prev_theme_selector.svg',
        };
    }

    getWidgetInfo(): RxWidgetInfo {
        return ThemeSelector.getWidgetInfo();
    }

    renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element {
        super.renderWidgetBody(props);
        return <ThemeSelection disabled={!!this.props.editMode} />;
    }
}
