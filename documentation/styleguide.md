# SmartHome App Styleguide

## 1. Design principles

The SmartHome UI is a calm, spatial control surface built around a clean floor plan. The interface should feel technical, modern, and lightweight rather than decorative.

### Core priorities

1. **Weather and home state are immediately readable.**
2. **The floor plan is the primary interaction surface.**
3. **Device state is communicated consistently with icon, fill, and color.**
4. **Decorative elements are minimized.** No furniture or imagery is required in the floor plan.
5. **Quick access stays compact.** Frequently used actions should not compete visually with the floor plan.
6. **Use MUI theme tokens and reusable components rather than hard-coded one-off styles.**

---

## 2. Visual language

### Overall aesthetic

- Dark, desaturated blue application background
- Slightly lighter blue surfaces for cards and controls
- Cool blue as the primary interaction color
- Warm amber only for active lights / warm device states
- Cyan accents for environmental data
- Soft shadows and restrained elevation
- Rounded geometry
- Strong spacing consistency using an 8 px grid

### Avoid

- Background photography or weather illustrations behind cards
- Decorative furniture or plants in the floor plan
- Heavy glassmorphism
- Excessive shadows
- Oversized floating action circles
- Multiple similar blue tones used without semantic meaning

---

## 3. Color tokens

The palette is optimized for dark-mode smart-home dashboards.

| Token | Value | Use |
|---|---:|---|
| `--sh-bg` | `#16324A` | App background |
| `--sh-surface` | `#1D3C57` | Main cards / navigation |
| `--sh-surface-2` | `#244B68` | Raised controls / secondary surfaces |
| `--sh-floor` | `#3B5B73` | Floor-plan base |
| `--sh-wall` | `#94A3B8` | Floor-plan walls |
| `--sh-primary` | `#3B82F6` | Selected navigation / primary actions |
| `--sh-secondary` | `#60A5FA` | Secondary accent |
| `--sh-info` | `#22D3EE` | Sensor / environmental data |
| `--sh-success` | `#10B981` | Healthy / positive status |
| `--sh-warning` | `#F59E0B` | Active warm-light state |
| `--sh-error` | `#EF4444` | Fault / offline / critical status |
| `--sh-text` | `#F8FAFC` | Primary text |
| `--sh-text-secondary` | `#C3D0DE` | Secondary text |
| `--sh-divider` | `rgba(148, 163, 184, 0.28)` | Dividers / subtle strokes |
| `--sh-control-off` | `#6F879B` | Inactive device controls |
| `--sh-control-on` | `#F6C453` | Active light icon |

### State usage

- **Primary blue:** selection, navigation, action emphasis
- **Amber:** switched-on lighting only
- **Cyan:** temperature, humidity, weather detail
- **Green:** success / healthy system states
- **Red:** error, disconnected, unavailable

Do not use color as the only state cue. Pair it with icon fill, outline, label, or badge.

---

## 4. Typography

Use **Roboto**, the default MUI family, with restrained hierarchy.

| Role | MUI style | Suggested size | Weight |
|---|---|---:|---:|
| Main value | `h3` | 48 px | 500 |
| Section title | `h6` | 20 px | 600 |
| Card title | `subtitle1` | 16 px | 600 |
| Body | `body2` | 14 px | 400 |
| Device label | `body2` | 14 px | 500 |
| Metadata | `caption` | 12 px | 400 |

### Numerals

For sensor and weather values, enable tabular numerals:

```css
font-variant-numeric: tabular-nums;
```

---

## 5. Spacing

Base unit: **8 px**.

Recommended values:

- Page padding: `16px`
- Card internal padding: `16px` to `20px`
- Major section gap: `16px`
- Compact item gap: `8px`
- Icon-to-label gap: `8px`
- Minimum touch target: `48px × 48px`

---

## 6. Shape

| Component | Radius |
|---|---:|
| Major cards | 20–24 px |
| Compact controls | 12–14 px |
| Chips / sensor pills | 14–18 px |
| Circular device buttons | 50% |
| Bottom navigation | 20–24 px |

Use rounded corners consistently. Avoid mixing many different radii in the same view.

---

## 7. Elevation

Keep elevation restrained.

| Level | Use |
|---|---|
| 0 | Floor plan / structural layout |
| 1 | Weather card, quick-access container |
| 1 | Device buttons and sensor chips |
| 2 | Navigation surface |
| 3+ | Dialogs / sheets only |

Suggested shadow language:

```css
box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
```

For smaller controls:

```css
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.14);
```

---

## 8. Weather card

The weather card is a **solid tonal surface** with no photographic or illustrated background.

### Structure

- Left: current conditions
- Right: two compact forecast columns
- One large temperature value
- One primary weather icon
- One subtle vertical divider between current and forecast sections
- Secondary values use `text.secondary`

### Example hierarchy

```text
20°
Überwiegend bewölkt
Max 23° · Min 14°
```

Use compact precipitation and wind indicators below.

---

## 9. Floor plan

The floor plan is the main interaction surface.

### Keep

- Outer walls
- Inner walls
- Doors
- Windows / shutters where relevant
- Room labels
- Device controls
- Sensor chips

### Remove

- Furniture
- Plants
- Beds
- Tables
- Sofas
- Decorative interior illustrations

### Recommended rendering

- Outer wall: `2px`, slightly brighter
- Inner wall: `2px`, slightly lower contrast
- Room fill: transparent or 2–4% lighter than base
- Selected room: subtle `primary` tint
- No wall shadows

Room labels should be small and quiet, typically `caption` or `body2` with `text.secondary`.

---

## 10. Device controls

### Off state

- Neutral surface
- Outline icon
- Low elevation
- White or pale-gray glyph

### On state

- Same size as off state
- Warm amber icon
- Very subtle amber halo
- No oversized glow

### Recommended dimensions

- Circular control: 48–52 px
- Icon: 22–24 px

### Accessibility

Every state should be communicated by at least two of:

- color
- icon fill / outline
- label
- badge
- text state

---

## 11. Environmental sensors

Use a small horizontal chip instead of a large floating card.

Example:

```text
23.1 °C · 61%
```

Guidelines:

- Compact padding
- Minimal shadow
- One sensor icon at most
- Tabular numerals
- Consistent location inside each room

Threshold warnings should use semantic accents rather than increasing component size.

---

## 12. Schnellzugriff

Quick access should be visibly secondary to the floor plan.

### Preferred pattern

Use a compact horizontal strip with small chip-like or button-like actions.

```text
Schnellzugriff                     Alle Geräte

[💡 Wohnzimmer] [🛏 Schlafzimmer] [💡 Stehlampe] [🌿 Außen]
```

### Recommended implementation

- MUI `Stack` with `direction="row"`
- MUI `Button`, `Chip`, or compact `Paper`
- Height: 40–44 px
- Icon + short label
- No large individual cards
- No embedded switch per shortcut
- Active state uses a subtle tonal fill

Direct tap may toggle the action. Secondary interaction can open details.

---

## 13. Navigation

For mobile, prefer a compact `BottomNavigation`.

Suggested items:

- Zuhause
- Räume
- Szenen
- Einstellungen

Use both icon and label. Selected state uses primary blue plus an indicator, not color alone.

---

## 14. MUI component mapping

Recommended components:

- `ThemeProvider`
- `CssBaseline`
- `Paper`
- `Card`
- `Stack`
- `Grid`
- `IconButton`
- `Button`
- `Chip`
- `Badge`
- `Divider`
- `Tooltip`
- `BottomNavigation`
- `BottomNavigationAction`
- `Dialog`

Prefer theme-level `components` overrides for repeated styles. Use `sx` only for layout-specific exceptions.

---

## 15. Suggested semantic theme tokens

In addition to standard MUI palette values, consider exposing semantic tokens in your application theme:

```ts
device: {
  lightOn: '#F6C453',
  lightOff: '#6F879B',
  offline: '#EF4444',
},
sensor: {
  background: '#1D3C57',
  accent: '#22D3EE',
},
floorplan: {
  background: '#3B5B73',
  wall: '#94A3B8',
  selectedRoom: 'rgba(59, 130, 246, 0.10)',
}
```

---

## 16. Accessibility

- Target WCAG AA contrast
- Minimum 48 px touch targets
- Avoid critical labels below 12–14 px
- Use visible `:focus-visible` rings
- Respect `prefers-reduced-motion`
- Never indicate state with color alone
- Use text alternatives / `aria-label` for icon-only controls

---

## 17. CSS integration

The accompanying `smarthome-mui.css` file provides:

- CSS variables matching this palette
- global body/background rules
- MUI surface overrides
- weather-card styling
- floor-plan styling
- device control states
- sensor-chip styling
- compact Schnellzugriff styling
- navigation states
- accessibility and reduced-motion rules

Import the CSS after your MUI baseline/theme styles:

```ts
import './smarthome-mui.css';
```

For best results, pair it with a matching MUI `createTheme()` configuration so the CSS and theme palette stay in sync.
