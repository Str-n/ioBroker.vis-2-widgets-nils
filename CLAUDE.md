# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ioBroker.vis-2-widgets-nils is a Material Design widget library for ioBroker vis-2. It provides 19 interactive widgets for smart home control: thermostats, switches, blinds, RGB lights, cameras, locks, vacuum cleaners, etc.

Architecture: Root package orchestrates the build via `tasks.js`; `src-widgets/` contains the actual widget source code built with Vite + Module Federation.

## Build Commands

```bash
npm run build              # Full build: clean → npm install → tsc+vite build → copy to widgets/
npm run copy-files         # Copy built artifacts from src-widgets/build/ to widgets/
npm run npm                # Install deps in both root and src-widgets/ (uses -f for src-widgets)
npm run lint               # ESLint with @iobroker/eslint-config + Prettier
npm run test               # Run all tests (integration + package)
npm run test:integration   # Mocha browser tests (spawns full ioBroker instance)
npm run test:package       # Package validation (package.json, io-package.json, CHANGELOG.md)
```

### Dev Server

```bash
cd src-widgets && npm start   # Vite dev server on port 4173, proxies to ioBroker at localhost:8082
```

## Build Pipeline (tasks.js)

1. Deletes `src-widgets/build/` and `widgets/`
2. `npm install` in `src-widgets/`
3. `tsc && vite build` via `@iobroker/build-tools`
4. Copies build output to `widgets/vis-2-widgets-nils-fork/`
   - Patches echarts/zrender SVG renderer bug: injects `isFunction` definition before its first use in `installSVGRenderer` chunks

## Widget Architecture

### Base Class: Generic.tsx

All widgets extend `Generic<RxData, State>` which inherits from `window.visRxWidget` (provided by vis-2 runtime). Provides:
- `getPropertyValue(stateName)` — reads reactive state values
- `getI18nPrefix()` — returns `'vis_2_widgets_nils_'` (auto-prepended to all i18n keys)
- `getHistoryInstance()` — detects history/sql/influxdb adapters
- `getObjectIcon()` / `getParentObject()` — ioBroker object helpers

### Widget Registration Pattern

Use `src-widgets/src/SwitchButton.tsx` as the working reference for editor palette registration. Each widget file default-exports a class extending `Generic` with:

1. `static getWidgetInfo(): RxWidgetInfo` — declares a unique persisted widget ID (e.g. `'tplNils2SwitchButton'`), `visSet: 'vis-2-widgets-nils-fork'`, `visName`, `visWidgetLabel`, `visAttrs`, `visDefaultStyle`, and `visPrev`
2. Instance `getWidgetInfo()` — returns the class's static `getWidgetInfo()` result
3. `renderWidgetBody(props)` — calls `super.renderWidgetBody(props)` and renders the widget content; the inherited `render()` supplies the widget container
4. State access via `this.state.values`, config via `this.state.rxData`, socket via `this.props.context.socket`

Keep existing widget IDs unchanged: saved dashboards refer to them. Invisible runtime widgets should still show a placeholder in edit mode; see `HomeScreenFullscreen.tsx` for an example.

### Module Federation (vite.config.ts)

Federation name: `vis2nilsForkWidgets`, entry: `customWidgets.js`. Exposes widget modules + translations. Shared dependencies managed by `@iobroker/types-vis-2/modulefederation.vis.config`.

### Adding a New Widget

1. Create `src-widgets/src/NewWidget.tsx` with a default-exported class extending `Generic<RxData, State>` and both widget-info methods described above.
2. Implement `renderWidgetBody()` with React/MUI and configure the default editor dimensions in `visDefaultStyle`.
3. Add the `visWidgetLabel` key and any configuration labels to all 11 `src-widgets/src/i18n/*.json` files (en, de, ru, pt, nl, fr, it, es, pl, uk, zh-cn). Use unprefixed keys in these dictionaries; `translations.ts` exports them with the prefix from `Generic`.
4. Put a preview image in `src-widgets/public/img/` and set `visPrev` to `widgets/vis-2-widgets-nils-fork/img/<filename>`.
5. Add `'./NewWidget': './src/NewWidget'` to the federation `exposes` object in `src-widgets/vite.config.ts`.
6. **Register `"NewWidget"` in `io-package.json` under `common.visWidgets.vis2nilsForkWidgets.components`.** The component name must match the federation expose name without `./`. Exposing the module alone is insufficient for palette discovery.
7. Run `npm run build` from the repository root to build and copy the distributable assets. With dependencies already installed, `npm run build --prefix src-widgets` followed by `npm run copy-files` also builds and copies them.
8. Deploy the updated package, including `io-package.json` and the generated `widgets/` assets, using the ioBroker installation/upload workflow, then reload the vis-2 editor. Open the fork's widget set and verify the new widget's label, preview, and ability to be added to a view.

For registration checks, compare with `SwitchButton` in both `io-package.json` and `vite.config.ts`, verify that the preview exists in the copied `widgets/` directory, and confirm the new expose appears in the generated `mf-stats.json` and federation loader. The standalone preview in `src-widgets/preview/main.tsx` is separate from editor palette registration. Build checks alone do not verify visibility in a running editor.

### Key Widget Files

- **Switches.tsx** — most versatile widget; handles switch, button, slider, blinds, thermostat, RGB, lock via device type detection
- **RGBLight.tsx** — largest widget (~55KB); 8 color modes (RGB, RGBW, HSL, Hue/Sat/Lum, CT, white)
- **deviceWidget.ts** — SVG icon mappings for `@iobroker/type-detector` device types, common icon constants
- **Static.tsx** — utility/base; not exposed via federation
- **Components/** — shared components: BlindsBase, ObjectChart (ECharts), PinCodeDialog, DoorAnimation, etc.

## Internationalization

- 11 languages, JSON files in `src-widgets/src/i18n/`
- All widget i18n keys are auto-prefixed with `vis_2_widgets_nils_` (defined in `Generic.getI18nPrefix()`)
- When adding/changing widget config fields, update all 11 JSON files

## Code Quality

- ESLint config: `eslint.config.mjs` using `@iobroker/eslint-config` with Prettier integration
- JSDoc rules disabled (`jsdoc/require-jsdoc`, `jsdoc/require-param` both off)
- Prettier: `prettier.config.mjs` with `endOfLine: 'auto'`
- TypeScript: strict mode, ESNext target, `noEmit: true` (Vite handles compilation)
- Lint ignores: `src-widgets/build/`, `widgets/`, `test/`, `src-widgets/.__mf__temp/`

## CI/CD

`.github/workflows/test-and-release.yml`:
1. Check and Lint (Node 24.x)
2. Adapter Tests (Node 22.x) — build + test
3. Deploy on version tags (`v*.*.*`) — publishes to NPM

Release: `@alcalzone/release-script` bumps version, generates changelog, creates git tag.
