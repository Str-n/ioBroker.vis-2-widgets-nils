# Theme-aware floor plans

Use the maintained SVG files in `src-widgets/public/floorplans/` as inline markup
in a vis-2 **Html template** widget. This keeps geometry in version control and
appearance in the shared theme. The editor holds a deployed copy of the geometry;
changing colors or shadows requires no SVG edits or repasting.

The three old PNGs have been redrawn as a few native paths, with no embedded
bitmap, scripts, external resources or SVG IDs. Their original coordinate spaces
and openings are retained. Slightly skewed roof lines and the EG left wall junction
are straightened. The originals remain in `documentation/old_backgrounds/`.

## Design

- The background stays Ocean `#477592`; the building has a subtle surface tint.
- Outer walls are 2.5 CSS pixels; inner partitions are 1.5 pixels and slightly
  quieter. Rounded joins and caps suit the controls without rounding the rooms.
- Wall strokes use `vector-effect="non-scaling-stroke"` through CSS, keeping
  their weight consistent when the SVG viewport changes size. A transform on an
  ancestor vis view can still scale the complete composed view.
- Walls have no shadow by default. Device controls retain elevation and remain
  the interactive foreground. A theme variable can enable a wall shadow.
- These backdrops are decorative and ignore pointer events. Existing device
  widgets keep their labels, keyboard support, state bindings and positions.

The SVGs need `smarthome.css` from the matching build. Do **not** put their URL in
an image widget, CSS background or iframe when they need the page's theme: inline
SVG participates in the document's CSS cascade; separate image documents do not
inherit its custom properties. Opening the raw SVG by itself is consequently not
a themed preview. See [MDN: SVG in HTML](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_in_HTML)
and [MDN: including vector graphics](https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Structuring_content/Including_vector_graphics_in_HTML).

## Editor migration

These placements were read from the local runtime on 2026-09-07. Coordinates are
relative to the view, excluding the navigation bar. Recheck them if the project
has since changed.

| View | Existing image widget | SVG source | Left / top | Widget width / height | SVG displayed height |
| --- | --- | --- | --- | --- | --- |
| EG | `w000016` | [eg.svg](../src-widgets/public/floorplans/eg.svg) | 4 / 210 px | 380 / 362 px | about 351.35 px |
| OG | `w000014` | [og.svg](../src-widgets/public/floorplans/og.svg) | 63 / 207 px | 293 / 388 px | about 355.03 px |
| DG | `w000030` | [dg.svg](../src-widgets/public/floorplans/dg.svg) | 64 / 210 px | 289 / 395 px | about 350.61 px |

The legacy images display at natural aspect ratio, leaving unused height inside
their widget. The SVG stylesheet deliberately uses `width: 100%; height: auto`
and top-left alignment to match this. Avoid `height: 100%` or
`preserveAspectRatio="none"`: stretching would shift walls relative to controls.

1. Back up the project and install the matching widget build. The existing
   `smarthome-project.css` import includes the updated floor-plan styles. Projects
   that only need the scoped styles can import
   `/vis-2/widgets/vis-2-widgets-nils-fork/smarthome.css` at the beginning of their
   editor CSS instead.
2. Add a **Html template** from this widget set (`tplNils2Static`). Enable
   **without card** (`noCard`), leave the title empty, and paste the complete SVG
   file into the HTML source field. Leave image, iframe and embedded-widget
   fields empty. Do not paste the SVG as escaped text or wrap it in `<img>`.
3. Copy the old image widget's left, top, width and height. Keep padding, border
   and background empty. Set widget style `pointer-events: none`, enable
   `doNotWantIncludeWidgets` if offered, and place the background behind the
   device widgets. Lock it after positioning; select it through the editor's
   widget list when necessary. The HTML widget's image-interaction option does
   not apply to inline HTML.
4. Hide the old bitmap while reviewing the SVG. Check window markers, switches,
   thermostat chips and each intentional opening on desktop and mobile. Remove
   the old image widget once the replacement is accepted.

No view, device state or editor project is changed by these repository assets.

## Theme ownership and customization

`public/themes/ocean.json` is the default theme source. Shared `smartHome.wall`
and `smartHome.surfaceRaised` provide the colors; `smartHome.floorplan` provides
stroke weights, opacity and shadow. Run `npm run theme:generate` after changing
the preset. The generated `smarthome-tokens.css` and the MUI theme consume that
same preset. Do not put another palette in each SVG.

For an installation-specific override, add CSS **after** the shared import in
the editor. Apply these properties at `:root`, a view, or a widget wrapper:

| Property | Default / purpose |
| --- | --- |
| `--sh-wall` | Shared wall color from the theme |
| `--sh-floorplan-wall-outer` | Optional override; otherwise uses `--sh-wall` |
| `--sh-floorplan-wall-inner` | Optional override; otherwise uses `--sh-wall` |
| `--sh-floorplan-fill` | Optional override; otherwise uses `--sh-surface-2` |
| `--sh-floorplan-fill-opacity` | `0.18`; set to `0` for transparent rooms |
| `--sh-floorplan-inner-opacity` | `0.8` |
| `--sh-floorplan-outer-width` | `2.5px` |
| `--sh-floorplan-inner-width` | `1.5px` |
| `--sh-floorplan-shadow` | `none`, or a CSS `drop-shadow(...)` filter |

For example, this uses existing palette roles and keeps all colors theme-aware:

```css
:root {
    --sh-floorplan-wall-outer: var(--sh-primary);
    --sh-floorplan-fill-opacity: 0.12;
    --sh-floorplan-shadow: drop-shadow(0 2px 3px var(--sh-surface));
}
```

For future day/night or weather adaptation, use ioBroker states to select a theme
or a small set of appearance parameters, and update these inherited properties
at one boundary. SVG geometry stays unchanged. Synchronizing the MUI palette and
its CSS variables belongs to the theme integration, not to each floor plan.
Avoid a global brightness filter: it would dim text and device status colors too.

A dedicated React floor-plan widget becomes useful if rooms later need
interaction, live occupancy fills or an editor picker for plan assets. Static
backdrops already work through the existing HTML widget without another runtime
component or datapoint containing SVG markup.

## Local preview

Run `npm run test:dashboard` in `src-widgets`, then open
`http://localhost:4174/floorplan-preview.html`. Wall color, room tint and shadow
controls update all three inline SVGs immediately. They change only the preview;
they do not save a theme or operate devices.

The replacements were also previewed in temporary browser DOMs of the live EG,
OG and DG runtime views at 390 × 750. All three rendered image bounds matched
exactly; 69 existing button rectangles and pointer hit targets stayed unchanged.
This verifies the SVG substitution, not a saved migration of the HTML widgets.
The standalone preview passed desktop/mobile layout and dynamic color, fill and
shadow checks. The production build, generated-token check and generator lint
passed; the SVGs are included in the built distribution.
