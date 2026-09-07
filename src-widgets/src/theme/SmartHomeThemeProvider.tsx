import React, { useMemo } from 'react';
import { ThemeProvider, useTheme, type Theme } from '@mui/material/styles';
import { deepmerge } from '@mui/utils';

import { createSmartHomeTheme } from './createSmartHomeTheme';

const ocean = createSmartHomeTheme({ cssVariables: false });
const themes = new WeakMap<Theme, Theme>();

/**
 * Adapt opted-in widgets to the host without injecting a second global MUI sheet.
 * Portals retain this React context, so their paper, text and controls match too.
 * Keep host extensions (e.g. ioBroker toolbar settings) and component defaults.
 */
export default function SmartHomeThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
    const host = useTheme();
    const theme = useMemo(() => {
        let resolved = themes.get(host);
        if (!resolved) {
            const hostTheme = { ...host };
            delete hostTheme.vars;
            delete (hostTheme as Theme & { colorSchemes?: unknown }).colorSchemes;
            resolved = {
                ...hostTheme,
                ...ocean,
                palette: { ...host.palette, ...ocean.palette },
                components: deepmerge(host.components || {}, ocean.components || {}),
            };
            themes.set(host, resolved);
        }
        return resolved;
    }, [host]);

    return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
