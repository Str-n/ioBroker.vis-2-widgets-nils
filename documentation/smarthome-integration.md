# SmartHome design integration

Weather now loads the shared palette from `src-widgets/public/smarthome.css` and
its component layout from `src-widgets/src/Weather.css`. The public stylesheet
is also copied into the build for use by vis project layouts. It contains no
global body, MUI, or SVG overrides. StackCardCarousel uses the same foundation. SwitchButton, ThermostatCompact,
and Blinds are unchanged.

The written style guide is the palette/spacing specification; the PNG is the
composition reference. The implementation uses scoped CSS tokens because the
host owns the MUI theme and this widget set already accommodates differing host
and bundled MUI versions. It does not replace the editor's theme or install a
global CssBaseline. New components can reuse the tokens through CSS or MUI `sx`.

## Weather

- Weather supplies a solid background with no outer border or shadow. The
  surrounding carousel/container owns the rounded surface and elevation.
- `noCard` and `usedInWidget` preserve a transparent, borderless presentation for
  embedding inside a card or carousel. The parent remains responsible for its
  surface and padding.
- New instances default to 480 × 200. Saved widget sizes are not changed.
- Below 400px widget width, spacing and the main value become compact. Below
  320px, forecasts move below current conditions. Give these narrow widgets more
  height (the preview uses 280 × 300). Content scrolls when a fixed height cannot
  accommodate longer descriptions; it is not silently clipped.
- Current/forecast bindings, local temperature override, units, date formatting,
  missing-state fallback, and one/two forecast selection retain their behavior.

## EG migration

The live editor inspected on 2026-09-05 has project CSS in `vis_user`, including
global `--mui-palette-*` overrides, `.mybulb`, `.mywindow`, and thermostat rules.
Keep these for now: the remaining widgets still use them. There is no dedicated
Weather selector in that stylesheet to remove.

The weather is embedded in the carousel under `w000083`, with view
`visview_widgetkarte1`. StackCardCarousel now owns the 22px rounded border and restrained shadow.
Only the selected view is mounted; background cards have been removed. Keep
Weather cardless there for a transparent background. Previous/next buttons,
indicator buttons, and horizontal swipes change the active view. Indicators use 6px dots (8px for the active card), with 24px-wide buttons and
40px-high controls. Button backgrounds remain transparent on touch, hover, and
click; keyboard focus uses an outline. A numeric counter replaces dots when space is limited
or more than five views are configured. A single view has no navigation row.
Switching views unmounts the previous view, so its local transient UI state resets
when revisited; ioBroker states remain the source of device data.

After installing the rebuilt widget package, the shared stylesheet is available
at `/vis-2/widgets/vis-2-widgets-nils-fork/smarthome.css` on this server. For an
explicit project-wide stylesheet dependency, place this import at the beginning
of the project CSS:

```css
@import url('/vis-2/widgets/vis-2-widgets-nils-fork/smarthome.css');
```

Assign the `sh-app` class to the EG view, then append this small project-specific
bridge after the existing CSS:

```css
/* Override the existing .vis-view background only for the opted-in view. */
.vis-view.sh-app {
    background-color: var(--sh-bg);
    --color-bg: var(--sh-bg);
}
```

Use `sh-theme sh-surface` for a new standalone container, or `sh-surface` inside
`sh-app`. Use `sh-content` only on a flow-layout container: applying a grid to
the existing positioned floor-plan view would disturb its device placement.
The foundation also provides opt-in floor-plan and quick-access classes.
It does not redraw the floor-plan asset or change navigation.

Do not import `documentation/smarthome-mui.css` into the editor unchanged. Its
global selectors would also affect the editor and the widgets excluded from
this refactor. The production foundation is the scoped file in `public`.

## Review

Run `npm run test:dashboard` in `src-widgets` and open
`http://localhost:4174/test-dashboard.html`. The Weather section includes the
normal card, saved compact dimensions, a narrow single-forecast card, and an
embedded missing-data example. These use mock states and do not operate devices.

Build with `npm run build` in `src-widgets`; use the repository's
`npm run copy-files` when preparing the adapter distribution. Installing or
uploading that distribution and editing project CSS are separate from the local
source changes. Back up the project CSS before applying the bridge.

Run `node scripts/check-carousel-preview.cjs http://127.0.0.1:4174/test-dashboard.html`
against the running preview for desktop and mobile regression checks. The checks
use real Chromium touch gestures over Weather, including stopped bubbling events,
vertical/short drags, indicator taps, and transparent pressed/hover states.
