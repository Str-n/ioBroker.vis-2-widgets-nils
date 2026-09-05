// @ts-expect-error no types
import react from '@vitejs/plugin-react';
import commonjs from 'vite-plugin-commonjs';
import { federation } from '@module-federation/vite';
import topLevelAwait from 'vite-plugin-top-level-await';
import { moduleFederationShared } from '@iobroker/types-vis-2/modulefederation.vis.config';
import type { UserConfig } from 'vite';
import packageJson from './package.json' with { type: 'json' };

const config = ({ command }: { command: 'build' | 'serve' }): UserConfig => ({
    plugins: [
        ...(command === 'build'
            ? [
                  federation({
                      manifest: true,
                      name: 'vis2nilsForkWidgets',
                      filename: 'customWidgets.js',
                      exposes: {
                          './Thermostat': './src/Thermostat',
                          './ThermostatCompact': './src/ThermostatCompact',
                          './Actual': './src/Actual',
                          './Switches': './src/Switches',
                          './SwitchButton': './src/SwitchButton',
                          './SimpleState': './src/SimpleState',
                          './Blinds': './src/Blinds',
                          './Clock': './src/Clock',
                          './ViewInWidget': './src/ViewInWidget',
                          './StackCardCarousel': './src/StackCardCarousel',
                          './Camera': './src/Camera',
                          './Security': './src/Security',
                          './Player': './src/Player',
                          './Map': './src/Map',
                          './Html': './src/Html',
                          './ThemeSwitcher': './src/ThemeSwitcher',
                          './WasherDryer': './src/WasherDryer',
                          './Wizard': './src/Wizard',
                          './RGBLight': './src/RGBLight',
                          './Lock': './src/Lock',
                          './Vacuum': './src/Vacuum',
                          './Navigate': './src/Navigate',
                          './EnergyGame': './src/EnergyGame',
                          './Weather': './src/Weather',
                          './translations': './src/translations.js',
                      },
                      remotes: {},
                      shared: moduleFederationShared(packageJson),
                      dts: false,
                  }),
                  topLevelAwait({
                      // The export name of top-level awaits promise for each chunk module
                      promiseExportName: '__tla',
                      // The function to generate import names of top-level awaits promise in each chunk module
                      promiseImportName: (i: number): string => `__tla_${i}`,
                  }),
              ]
            : []),
        react(),
        commonjs(),
    ],
    server: {
        port: 3000,
        proxy: {
            '/_socket': 'http://localhost:8082',
            '/vis.0': 'http://localhost:8082',
            '/adapter': 'http://localhost:8082',
            '/habpanel': 'http://localhost:8082',
            '/vis': 'http://localhost:8082',
            '/widgets': 'http://localhost:8082/vis',
            '/widgets.html': 'http://localhost:8082/vis',
            '/web': 'http://localhost:8082',
            '/state': 'http://localhost:8082',
        },
    },
    base: './',
    resolve: {
        tsconfigPaths: true,
        dedupe: [
            'react',
            'react-dom',
            '@emotion/react',
            '@iobroker/gui-components',
            '@mui/material',
            '@mui/system',
            '@mui/private-theming',
        ],
    },
    build: {
        target: 'chrome81',
        outDir: './build',
        rollupOptions: {
            onwarn(warning: { code: string }, warn: (warning: { code: string }) => void): void {
                // Suppress "Module level directives cause errors when bundled" warnings
                if (warning.code === 'MODULE_LEVEL_DIRECTIVE') {
                    return;
                }
                warn(warning);
            },
        },
    },
});

export default config;
