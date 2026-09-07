import { createTheme, type Theme, type ThemeOptions } from '@mui/material/styles';
import { deepmerge } from '@mui/utils';

import ocean from '../../public/themes/ocean.json';

declare module '@mui/material/styles' {
    interface Theme {
        smartHome: typeof ocean.smartHome;
    }

    interface ThemeOptions {
        smartHome?: Partial<typeof ocean.smartHome>;
    }
}

/**
 * Build the React theme from the same preset used to generate the public CSS.
 * Merge overrides before createTheme so MUI also calculates the matching channels.
 * The vis host must install this at its theme boundary to update context.theme.
 */
export function createSmartHomeTheme(overrides: ThemeOptions = {}): Theme {
    // MUI keeps colorSchemes on a theme even with cssVariables:false. A nested
    // ThemeProvider then enters its CSS-vars path and can reuse the host palette.
    // Supply a plain palette for the widget compatibility boundary instead.
    const base =
        overrides.cssVariables === false
            ? {
                  palette: { ...ocean.colorSchemes.dark.palette, mode: 'dark' },
                  smartHome: ocean.smartHome,
                  components: ocean.components,
                  cssVariables: false,
              }
            : { ...ocean, cssVariables: true };
    return createTheme(deepmerge(base as ThemeOptions, overrides));
}
