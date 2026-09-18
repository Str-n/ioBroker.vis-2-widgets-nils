import { createTheme, type Theme, type ThemeOptions } from '@mui/material/styles';
import { deepmerge } from '@mui/utils';

import { themePresets, type SmartHomeThemeId } from './presets';

declare module '@mui/material/styles' {
    interface Theme {
        smartHome: typeof themePresets.ocean.smartHome;
    }

    interface ThemeOptions {
        smartHome?: Partial<typeof themePresets.ocean.smartHome>;
    }
}

/**
 * Build the React theme from the same preset used to generate the public CSS.
 * Merge overrides before createTheme so MUI also calculates the matching channels.
 * The vis host must install this at its theme boundary to update context.theme.
 */
export function createSmartHomeTheme(overrides: ThemeOptions = {}, themeId: SmartHomeThemeId = 'ocean'): Theme {
    const preset = themePresets[themeId] || themePresets.ocean;
    const mode = preset.defaultColorScheme === 'light' ? 'light' : 'dark';
    const scheme = preset.colorSchemes[mode];
    const palette = typeof scheme === 'object' ? scheme.palette : themePresets.ocean.colorSchemes.dark.palette;
    // MUI keeps colorSchemes on a theme even with cssVariables:false. A nested
    // ThemeProvider then enters its CSS-vars path and can reuse the host palette.
    // Supply a plain palette for the widget compatibility boundary instead.
    const base =
        overrides.cssVariables === false
            ? {
                  palette: { ...palette, mode },
                  smartHome: preset.smartHome,
                  components: preset.components,
                  cssVariables: false,
              }
            : { ...preset, cssVariables: true };
    return createTheme(deepmerge(base as ThemeOptions, overrides));
}
