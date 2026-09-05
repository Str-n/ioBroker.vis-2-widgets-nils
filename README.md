![Logo](admin/vis-2-widgets-nils.png)

# Material widgets for ioBroker.vis 2.0

![Number of Installations](http://iobroker.live/badges/vis-2-widgets-nils-installed.svg) ![Number of Installations](http://iobroker.live/badges/vis-2-widgets-nils-stable.svg) [![NPM version](http://img.shields.io/npm/v/iobroker.vis-2-widgets-nils.svg)](https://www.npmjs.com/package/iobroker.vis-2-widgets-nils)
[![Downloads](https://img.shields.io/npm/dm/iobroker.vis-2-widgets-nils.svg)](https://www.npmjs.com/package/iobroker.vis-2-widgets-nils)

[![NPM](https://nodei.co/npm/iobroker.vis-2-widgets-nils.png?downloads=true)](https://nodei.co/npm/iobroker.vis-2-widgets-nils/)

## Widgets

### Home Screen Fullscreen

Add **Home Screen Fullscreen** to the **EG** view, save, then open
`http://192.168.178.40:8082/vis-2/index.html#EG` in the device browser and wait for
the dashboard to load before adding it to the home screen. Remove an existing
shortcut and add it again to pick up the new installation settings. On iOS, use
Safari's Share → Add to Home Screen (enable **Open as Web App** if offered).
On Android, use Chrome's Add to Home screen / Install app menu.

The widget is visible only in the editor and has no runtime DOM or touch area.
It injects mobile web-app meta tags and replaces the page's manifest link with
the bundled `home-screen.webmanifest`. These settings remain until page reload,
even when navigating to another view. The manifest launches `index.html#EG` on
the current server, requests Android fullscreen, and allows iOS to use standalone
mode. iOS may retain the system status bar; a widget cannot force it away.

Chrome's normal install promotion requires HTTPS; the HTTP LAN URL may create a
regular browser shortcut instead. Use a trusted HTTPS endpoint for reliable app
installation. Browser support for metadata injected after page load varies. If
installation ignores it, the same manifest link and mobile meta tags must be
included in the host vis-2 HTML head before load. No widget can bypass these
browser restrictions. This widget does not provide offline operation.

The launch view and app name are defined in
`src-widgets/public/home-screen.webmanifest`; rebuild and reinstall the home-screen
app after changing them. Build with `npm run build` and deploy the widget package
using your usual ioBroker workflow before adding the widget in vis-2.

References: [Apple web-app configuration](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html),
[Chrome installation criteria](https://web.dev/articles/install-criteria).

For a standalone, hot-reloading preview of the button widgets, run `npm run preview:widgets` and open
<http://localhost:4174/test-dashboard.html>. It uses mock ioBroker values and does not require a deployment.

### Buttons and switches

![Switches](img/material-switches.png)

![Switches](img/material-switches-buttons.png)

![Switches](img/material-switches-buttons-2.png)

### Clock

-   Analog

![Clock Analog](img/material-clock-analog-1.png)

-   Analog variation

![Clock Analog 2](img/material-clock-analog-2.png)

-   Digital

![Digital](img/material-clock-digital-1.png)

-   Digital2 (SVG Text)

![Digital2](img/material-clock-digital-2.png)

### Simple state

With this widget, you can control one device. Boolean or number.

-   Number

![Simple state](img/material-simple-state-1.png)

-   Control

![Simple state](img/material-simple-state-2.png)

### View in widget

![View in widget](img/material-view-in-widget-1.png)

Not as a button: View could be shown in full size, and you can control elements in view.

![View in widget - button](img/material-view-in-widget-2.png)

As button: You can show a small thumbnail of view, and by pressing on it, it will be shown in full size.

### Thermostat

![Thermostat](img/material-thermostat-1.png)

Additionally, it can show a history if you activated it.

### Compact weather

The compact weather widget is designed for an approximately 370 × 150 px tile. It shows the current temperature and
condition, today's high/low, precipitation and wind speed, plus one or two forecast days.

It uses the `openweathermap` adapter by default and automatically binds its `forecast.current`, `forecast.day0`, and
`forecast.day1` states. An optional location label can be entered manually. To display a local outdoor sensor instead of
the API temperature, select its state under **Current temperature override**; all other values continue to come from
OpenWeatherMap. Individual API state IDs can be changed under **Advanced weather bindings**.

### Actual value with chart

![Actual value](img/material-actual-value-1.png)

![Actual value with chart](img/material-actual-value-2.png)

### Security control

![Security control](img/material-security-0.png)

![Security control](img/material-security-1.png)

You can define the delay in seconds.

By activation, the defined ID will be written with the number of the delay seconds,
and after the delay is over, the defined ID will be set to 0, and the alarm ID will be set to true.

![Security control](img/material-security-2.png)

### Player

![Player](img/material-player.png)

### Map

![Map](img/material-map-1.png)

Position could be defined as a combined state, like `9.2344;41.374652` - `longitude;latitude` or as two separate states.

### Camera

![Camera](img/material-camera-1.png)

### HTML Template

![HTML](img/material-html-1.png)

HTML template can be used to show any HTML code.
Additionally, you can show an image or iframe with this widget too.

### Blinds

![Blinds](img/material-blinds-1.png)

![Blinds](img/material-blinds-2.png)

### Color Lamp

With the RGB lamp widget, you can control different types of RGB lamps. Here are some examples:

-   RGB colors are set in one state like '#RRGGBB'
-   R/G/B colors are set in different states from 0 to 255
-   RGBW as one variable like '#RRGGBBWW'
-   R/G/B/W colors are set in different states from 0 to 255
-   hue/sat/lum as 3 different states
-   color temperature as one state from 2700 to 6500 or defined by min/max of the object
-   White mode state can be used to switch between RGB and white mode via a special state

![RGB Lamp 1](img/material-rgb-1.png)

![RGB Lamp 2](img/material-rgb-2.png)

### Door lock

![Door lock](img/material-lock.png)

### Vacuum cleaner

This widget is primary for Xiaomi vacuum cleaner. But it can be used for any other vacuum cleaner too.

The only difference is that Xiaomi supports the room cleaning.

![Vacuum cleaner](img/material-vacuum.png)

### Time picker

## Todo

-   Extend Blinds with shutter
<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->

## Changelog
### 1.6.7 (2026-05-17)

-   (@GermanBluefox) Corrected error with button and alarm widget

### 1.6.1 (2026-03-14)

-   (@GermanBluefox) Corrected error with select value widget

### 1.6.0 (2025-09-03)

-   (@GermanBluefox) Corrected "Actual" widget

### 1.5.3 (2025-08-27)
-   (@GermanBluefox) Added support for older Android devices

### 1.5.0 (2025-05-19)

-   (bluefox) Corrected thermostat slider
-   (bluefox) Rewritten with TypeScript and vite
-   (bluefox) Corrected blinds control
-   (bluefox) Added disabled mode additionally to hidden mode in the 'switches and buttons' widget
-   (bluefox) Added `_ts=Date.now()` to camera URL to disable the browser cache
-   (bluefox) Simple state has a new option - step
-   (bluefox) Added new navigation widget: jump to view, url or list of views

[Older changelogs can be found there](CHANGELOG_OLD.md)## License

The MIT License (MIT)

Copyright (c) 2022-2026 Denis Haev <dogafox@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
