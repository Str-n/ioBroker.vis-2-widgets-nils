## Task: Add dynamic natural-light visualization to the smart-home floorplan

Implement a natural-light visualization for the smart-home floorplan that shows how daylight and direct sunlight currently affect the rooms.

The goal is not to create a physically perfect lighting simulation. The goal is to produce a visually convincing, understandable representation of the current real-world light situation inside the house.

### Available inputs

Use the following live inputs:

* **Sun position**

  * Source: `followthesun.0.current`
  * Use the available values for current sun azimuth and sun elevation.

* **Weather**

  * Source: `openweathermap.0.forecast.current`
  * Use the current cloudiness and any other relevant current weather values that help describe whether the sky is clear, partly cloudy, overcast, rainy, hazy, etc.

* **Measured outdoor solar radiation**

  * Source: '0_userdata.0.sunlight.neuwied.globalRadiationAvgWm2'
  * Use the current measured outside brightness / solar radiation value in `W/m²`.
  * This should be treated as the most important indicator of how much sunlight is actually available outdoors.

* **Date and time**

  * Use the current date and time to support seasonal and daytime-related light appearance.
  * Prefer actual sun position over fixed assumptions such as “morning = east” or “noon = south”.

* **Blind position**

  * Each blind has a percentage value from `0–100`.
  * `100%` means the complete window is uncovered.
  * `50%` means the upper half of the window is covered and only the lower half remains exposed.
  * `10%` means the upper 90% is covered and only the lowest 10% of the window remains exposed.
  * `0%` means the window is fully covered.
  * The blind therefore changes the physically exposed part of the window, not just a generic brightness percentage.

* **Window and building geometry**

  * The floorplan has a fixed geographic orientation:

    * top = `163°`
    * right = `253°`
    * bottom = `343°`
    * left = `73°`
  * Exterior windows should use the real orientation of the wall they belong to.
  * Use the available window position, width, and height if known.

### Expected visual result

The floorplan should remain abstract and UI-like. Do not add furniture or photorealistic interior details.

The visualization should communicate three different properties of natural light:

**Light direction**

Direct sunlight should visibly enter through the windows that are currently facing the sun. Its direction across the floor should correspond to the actual sun azimuth.

As the sun moves during the day, the illuminated areas should move accordingly.

**Light amount**

The visible strength of natural light should react to the measured outdoor radiation.

Examples:

* very low `W/m²` → little or no visible direct sunlight
* medium `W/m²` → noticeable but moderate light
* high `W/m²` → strong, bright sunlight
* heavy cloud cover with low measured radiation → mostly diffuse room brightness rather than strong sun patches

Do not rely on cloud percentage alone when a real radiation measurement is available.

**Light character**

The appearance of the light should change depending on current conditions.

Examples:

* clear low morning or evening sun → warmer, softer orange/yellow light
* clear midday sun → brighter and more neutral daylight
* partly cloudy → weaker and softer sunlight
* heavy overcast → very soft, diffuse daylight with little or no clearly defined sun patch
* sunset / very low sun → warm color and long projections
* night → no solar lighting effect

The transition between these situations should be continuous rather than switching between a few fixed presets.

### Blind behavior

The blind position should visibly affect the shape of the sunlight.

Because the blind covers the window from the top downward:

* a fully open window should allow the complete possible sunlight area
* at `50%`, only sunlight entering through the lower half of the window should remain
* at `10%`, only a small band at the bottom of the window remains available for direct sunlight
* at `0%`, no direct sunlight should pass through

The remaining visible sunlight should not simply become proportionally darker. The illuminated area should primarily change because less of the window is physically exposed.

Diffuse daylight may become weaker as the exposed window area becomes smaller.

### Direct light and ambient daylight

The visualization should distinguish visually between:

* **direct sunlight**

  * directional
  * forms visible patches or beams on the floor
  * can have relatively sharp edges under clear skies
  * strongly affected by sun position and blind geometry

* **diffuse daylight**

  * affects the general brightness of a room
  * has no strong directional floor patch
  * becomes more important under cloudy or overcast conditions
  * should still be visible even when direct sunlight is weak

For example, an overcast room should look brighter than a room at night, but should not show an artificial yellow sunlight polygon.

### Desired dynamic behavior

The result should feel live.

Changes in any of the following should smoothly update the visualization:

* sun azimuth
* sun elevation
* measured `W/m²`
* cloudiness/weather
* blind position
* time of day

Avoid abrupt visual jumps where possible.

### Visual style

Keep the current smart-home floorplan style:

* clean
* abstract
* 2D
* no furniture
* no photorealism
* subtle gradients and transparency
* sunlight should feel integrated into the floorplan rather than drawn on top as a separate diagram

The user should be able to look at the floorplan and immediately understand:

> Where is sunlight entering right now, how strong is it, how soft or sharp is it, what color does it currently have, and how are the blinds changing the illuminated area?

The implementation may choose the exact mathematical model and rendering technique, as long as the above inputs and visual behaviors are respected.
