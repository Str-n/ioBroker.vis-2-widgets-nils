import React, { useMemo } from 'react';
import { ThemeProvider, useTheme, type Theme } from '@mui/material/styles';
import { deepmerge } from '@mui/utils';

import { createSmartHomeTheme } from './createSmartHomeTheme';
import { useSelectedTheme } from './themeSelection';
import type { SmartHomeThemeId } from './presets';

const themes = new WeakMap<Theme, Map<SmartHomeThemeId, Theme>>();

/**
 * Adapt opted-in widgets to the host without injecting a second global MUI sheet.
 * Portals retain this React context, so their paper, text and controls match too.
 * Keep host extensions (e.g. ioBroker toolbar settings) and component defaults.
 */
export default function SmartHomeThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const host = useTheme();
    const themeId = useSelectedTheme();
    const theme = useMemo(() => {
        let hostThemes = themes.get(host);
        if (!hostThemes) {
            hostThemes = new Map();
            themes.set(host, hostThemes);
        }
        let resolved = hostThemes.get(themeId);
        if (!resolved) {
            const preset = createSmartHomeTheme({ cssVariables: false }, themeId);
            const hostTheme = { ...host };
            delete hostTheme.vars;
            delete (hostTheme as Theme & { colorSchemes?: unknown }).colorSchemes;
            resolved = {
                ...hostTheme,
                ...preset,
                palette: { ...host.palette, ...preset.palette },
                components: deepmerge(host.components || {}, preset.components || {}),
            };
            hostThemes.set(themeId, resolved);
        }
        return resolved;
    }, [host, themeId]);

    return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
