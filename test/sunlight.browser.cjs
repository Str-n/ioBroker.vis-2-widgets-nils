const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const puppeteer = require('puppeteer');
const previewUrl = process.env.SUNLIGHT_PREVIEW_URL || 'http://127.0.0.1:4174/test-dashboard.html';
const artifacts = process.env.SUNLIGHT_ARTIFACTS || path.join(os.tmpdir(), 'sunlight-review');
fs.mkdirSync(artifacts, { recursive: true });
const screenshotPath = name => path.join(artifacts, name);

async function checkRenderer(browser) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(previewUrl, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.sh-sunlight-floorplan');
    assert.equal(await page.$$eval('.sunlight-scene-button', buttons => buttons.length), 5);
    await page.click('.sunlight-scene-button[data-scene="evening"]');
    await page.waitForFunction(() => document.querySelectorAll('.sh-sunlight-floorplan__light-glow').length === 4);
    assert.deepEqual(
        await page.$$eval('.sunlight-preview-controls input[type=range]', inputs => inputs.map(input => Number(input.value))),
        [292, -4, 30, 0, 0],
        'The evening preset should update sun, weather and blind settings together',
    );
    await page.click('.sunlight-scene-button[data-scene="noon"]');
    await page.waitForFunction(() => document.querySelectorAll('.sh-sunlight-floorplan__beam').length > 0 &&
        document.querySelectorAll('.sh-sunlight-floorplan__light-glow').length === 0);
    assert.deepEqual(
        await page.$$eval('.sunlight-preview-controls input[type=range]', inputs => inputs.map(input => Number(input.value))),
        [163, 58, 5, 950, 25],
    );
    await page.click('.sunlight-scene-button[data-scene="overcast"]');
    await page.waitForFunction(() => document.querySelectorAll('.sh-sunlight-floorplan__beam').length === 0 &&
        document.querySelectorAll('.sh-sunlight-floorplan__ambient').length > 0);
    assert.deepEqual(
        await page.$$eval('.sunlight-preview-controls input[type=range]', inputs => inputs.map(input => Number(input.value))),
        [190, 34, 100, 220, 100],
    );
    await page.click('.sunlight-scene-button[data-scene="afternoon"]');
    await page.waitForFunction(() => document.querySelectorAll('.sh-sunlight-floorplan__beam').length > 0 &&
        document.querySelectorAll('.sh-sunlight-floorplan__light-glow').length === 1);
    assert.deepEqual(
        await page.$$eval('.sunlight-preview-controls input[type=range]', inputs => inputs.map(input => Number(input.value))),
        [245, 17, 15, 540, 60],
    );
    await page.click('.sunlight-scene-button[data-scene="morning"]');
    await page.waitForFunction(() => document.querySelectorAll('.sh-sunlight-floorplan__light-glow').length === 2);
    const set = async values => {
        await page.evaluate(values => {
            for (const [index, value] of Object.entries(values)) {
                const el = document.querySelectorAll('.sunlight-preview-controls input[type=range]')[index];
                Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(value));
                el.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }, values);
        await new Promise(r => setTimeout(r, 100));
    };
    const inspect = () =>
        page.$eval('.sh-sunlight-floorplan', e => ({
            beams: e.querySelectorAll('.sh-sunlight-floorplan__beam').length,
            ambient: e.querySelectorAll('.sh-sunlight-floorplan__ambient').length,
            reflections: e.querySelectorAll('.sh-sunlight-floorplan__reflection').length,
            lamps: e.querySelectorAll('.sh-sunlight-floorplan__light-glow').length,
            invalid: /NaN|Infinity/.test(e.innerHTML),
        }));
    const screenshot = async name =>
        (await page.$('.sh-sunlight-floorplan')).screenshot({ path: screenshotPath(name + '.png') });
    const day = await inspect();
    console.log('day', day);
    const patchBoundsArea = () =>
        page.$eval('.sh-sunlight-floorplan', element =>
            [...element.querySelectorAll('.sh-sunlight-floorplan__beam')].reduce((area, patch) => {
                const bounds = patch.getBBox();
                return area + bounds.width * bounds.height;
            }, 0),
        );
    const grazingAngleAreas = [];
    for (const azimuth of [83, 84, 85]) {
        await set({ 0: azimuth });
        const area = await patchBoundsArea();
        assert(area > 0, `No sunlight was rendered at azimuth ${azimuth}°`);
        grazingAngleAreas.push(area);
        await screenshot(`azimuth-${azimuth}`);
    }
    assert(
        Math.max(...grazingAngleAreas) / Math.min(...grazingAngleAreas) < 1.1,
        `Rendered patch bounds changed abruptly at the grazing wall angle: ${grazingAngleAreas}`,
    );
    await set({ 0: 108 });
    await set({ 1: -5 });
    const night = await inspect();
    assert.equal(night.beams, 0);
    assert.equal(night.ambient, 0);
    assert.equal(night.lamps, 2);
    await screenshot('night');
    console.log('night', night);
    await set({ 1: 25, 4: 0 });
    const closed = await inspect();
    assert(closed.beams < day.beams, 'Closing configured blinds should reduce direct sunlight');
    assert(closed.ambient < day.ambient, 'Closing configured blinds should reduce indirect room light');
    console.log('closed', closed);
    await set({ 4: 100, 2: 100 });
    const cloudy = await inspect();
    assert.equal(cloudy.beams, 0);
    assert(cloudy.ambient > 0);
    await screenshot('cloudy');
    console.log('cloudy', cloudy);
    await set({ 2: 0, 1: 10 });
    const atCutoff = await inspect();
    assert(atCutoff.beams > 0, 'Sun exactly at the cutoff should still cast direct patches');
    await set({ 1: 9 });
    const low = await inspect();
    assert.equal(low.beams, 0);
    assert.equal(low.reflections, 0);
    assert(low.ambient > 0, 'Sun below the direct-light cutoff should still contribute indirect light');
    await screenshot('low');
    console.log('low', low);
    await set({ 1: 11 });
    const aboveCutoff = await inspect();
    assert(aboveCutoff.beams > 0, 'Sun above the default 10° cutoff should cast direct patches');
    await set({ 1: 25, 4: 50, 2: 25 });
    await page.evaluate(() => {
        const host = document.querySelector('.sh-sunlight-floorplan').closest('.widget-surface');
        let fiber = host[Object.keys(host).find(key => key.startsWith('__reactFiber$'))];
        while (fiber && typeof fiber.stateNode?.onConfiguredStateChange !== 'function') fiber = fiber.return;
        if (!fiber) throw new Error('Sunlight widget instance not found');
        const widget = fiber.stateNode;
        window.sunlightTestWidget = widget;
        const azimuthKey = `${widget.state.rxData.sunAzimuthOid}.val`;
        window.sunlightTestAzimuthValue = widget.state.values[azimuthKey];
        widget.state.values[azimuthKey] = undefined;
        widget.forceUpdate();
    });
    await page.waitForFunction(() => document.querySelectorAll('.sh-sunlight-floorplan__beam').length === 0);
    assert.equal(
        await page.$eval('.sh-sunlight-floorplan__status', element => element.textContent).catch(() => null),
        null,
        'Missing sun states should not show a status banner at the top of the widget',
    );
    await page.evaluate(() => {
        const widget = window.sunlightTestWidget;
        const azimuthKey = `${widget.state.rxData.sunAzimuthOid}.val`;
        widget.state.values[azimuthKey] = window.sunlightTestAzimuthValue;
        widget.forceUpdate();
    });
    await page.waitForFunction(() => document.querySelectorAll('.sh-sunlight-floorplan__beam').length > 0);
    // Nested geometry OIDs are subscribed separately from the widget's ordinary fields.
    // A deleted state must override any old value still present in the host's state cache.
    await page.evaluate(() => {
        window.sunlightTestWidget.onConfiguredStateChange('preview.sunlight.livingRoomLight', null);
    });
    await page.waitForFunction(() => document.querySelectorAll('.sh-sunlight-floorplan__light-glow').length === 1);
    await page.evaluate(() =>
        window.sunlightTestWidget.onConfiguredStateChange('preview.sunlight.livingRoomLight', { val: true }),
    );
    await page.waitForFunction(() => document.querySelectorAll('.sh-sunlight-floorplan__light-glow').length === 2);
    const beamsWithBlindState = (await inspect()).beams;
    await page.evaluate(() =>
        window.sunlightTestWidget.onConfiguredStateChange('preview.sunlight.blindPosition', null),
    );
    await page.waitForFunction(count => document.querySelectorAll('.sh-sunlight-floorplan__beam').length < count, {}, beamsWithBlindState);
    const beamsWithoutBlindState = (await inspect()).beams;
    await page.evaluate(() =>
        window.sunlightTestWidget.onConfiguredStateChange('preview.sunlight.blindPosition', { val: 50 }),
    );
    await page.waitForFunction(count => document.querySelectorAll('.sh-sunlight-floorplan__beam').length > count, {}, beamsWithoutBlindState);
    await page.evaluate(() => {
        document.documentElement.setAttribute('data-sh-theme', 'daytime');
        window.dispatchEvent(new Event('nils-smarthome-theme-change'));
    });
    await new Promise(r => setTimeout(r, 200));
    await screenshot('daytime');
    await page.setViewport({ width: 390, height: 844 });
    await screenshot('mobile');
    const sceneButtonsFit = await page.$eval('.sunlight-scene-grid', grid => {
        const bounds = grid.getBoundingClientRect();
        return [...grid.querySelectorAll('button')].every(button => {
            const buttonBounds = button.getBoundingClientRect();
            return buttonBounds.left >= bounds.left && buttonBounds.right <= bounds.right;
        });
    });
    assert(sceneButtonsFit, 'Scene buttons should fit their grid at mobile width');
    const compact = await page.$eval('.sh-sunlight-floorplan', element => {
        element.closest('.widget-surface').style.height = '200px';
        element.classList.add('sh-sunlight-floorplan--bare');
        const drawing = element.querySelector('.sh-floorplan-svg').getBoundingClientRect();
        return {
            height: element.getBoundingClientRect().height,
            padding: getComputedStyle(element).padding,
            drawingHeight: drawing.height,
        };
    });
    assert.equal(compact.height, 200);
    assert.equal(compact.padding, '0px');
    assert(compact.drawingHeight > 0 && compact.drawingHeight <= 200);
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    assert.equal(await page.$$eval('.sh-sunlight-floorplan animate', x => x.length), 0);
    assert.deepEqual(errors, []);
    console.log('All renderer browser scenarios passed');

    await page.close();
}

async function checkEditor(browser) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(previewUrl, { waitUntil: 'networkidle0' });
    const floor = await page.waitForSelector('.sh-sunlight-floorplan');
    await floor.screenshot({ path: screenshotPath('sunlight-after.png') });
    await page.evaluate(async () => {
        const React = (
            await import(performance.getEntriesByType('resource').find(r => r.name.includes('/react.js?')).name)
        ).default;
        const { createRoot } = (
            await import(
                performance.getEntriesByType('resource').find(r => r.name.includes('/react-dom_client.js?')).name
            )
        ).default;
        const Editor = (await import('/src/SunlightFloorplanEditor.tsx')).default;
        const Provider = (await import('/src/theme/SmartHomeThemeProvider.tsx')).default;
        const translations = (await import('/src/i18n/en.json')).default;
        window.visRxWidget.t = key => translations[key] || key;
        const svg = (await import('/public/floorplans/eg.svg?raw')).default;
        const node = document.createElement('div');
        node.id = 'sunlight-editor-test';
        document.body.append(node);
        const data = {
            floorplan: 'eg',
            floorConfigurations: JSON.stringify({
                eg: {
                    rooms: [
                        {
                            points: [
                                [10, 10],
                                [400, 10],
                                [400, 300],
                                [10, 300],
                            ],
                        },
                    ],
                    windows: [],
                    lightBubbles: [],
                },
            }),
        };
        window.editorData = data;
        function Harness() {
            const [value, setValue] = React.useState(data);
            return React.createElement(Editor, {
                data: value,
                onDataChange: next => {
                    window.editorData = next;
                    setValue(next);
                },
                floors: { eg: { label: 'EG', svg }, og: { label: 'OG', svg } },
            });
        }
        createRoot(node).render(React.createElement(Provider, null, React.createElement(Harness)));
    });
    await page.waitForFunction(() =>
        [...document.querySelectorAll('#sunlight-editor-test button')].some(b =>
            b.textContent.includes('Edit floor plan geometry'),
        ),
    );
    await page.evaluate(() =>
        [...document.querySelectorAll('#sunlight-editor-test button')]
            .find(b => b.textContent.includes('Edit floor plan geometry'))
            .click(),
    );
    await page.waitForSelector('[role=dialog]');
    await new Promise(r => setTimeout(r, 400));

    const pause = () => new Promise(r => setTimeout(r, 80));
    const button = async (text, index = 0) => {
        const handles = await page.$$('[role=dialog] button');
        let found = [];
        for (const h of handles) {
            if ((await h.evaluate(e => e.textContent)).trim() === text) found.push(h);
        }
        assert(found[index], `Missing button ${text}`);
        await found[index].click();
        await pause();
    };
    const data = () => page.evaluate(() => JSON.parse(window.editorData.floorConfigurations));
    const point = async (x, y) =>
        page.$eval(
            '[role=dialog] svg.sh-floorplan-svg',
            (svg, p) => {
                const point = svg.createSVGPoint();
                point.x = p[0];
                point.y = p[1];
                const t = point.matrixTransform(svg.getScreenCTM());
                return { x: t.x, y: t.y };
            },
            [x, y],
        );
    const click = async (x, y) => {
        const p = await point(x, y);
        await page.mouse.click(p.x, p.y);
        await pause();
    };
    const drag = async (x, y, toX, toY, cancel = false) => {
        const p = await point(x, y);
        const q = await point(toX, toY);
        await page.mouse.move(p.x, p.y);
        await page.mouse.down();
        await pause();
        await page.mouse.move(q.x, q.y, { steps: 5 });
        await pause();
        if (cancel) {
            await page.$eval('[role=dialog] svg.sh-floorplan-svg', svg =>
                svg.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 })),
            );
            await pause();
        }
        await page.mouse.up();
        await pause();
    };
    const field = async label => {
        const inputs = await page.$$('[role=dialog] .MuiFormControl-root');
        for (const input of inputs) {
            if (await input.evaluate((el, label) => el.querySelector('label')?.textContent === label, label))
                return input;
        }
        throw new Error(`Missing field ${label}`);
    };
    const number = async (label, value) => {
        const control = await field(label);
        const input = await control.$('input');
        await input.click({ clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.keyboard.type(String(value));
        await page.keyboard.press('Tab');
        await pause();
    };
    const text = async (label, value) => {
        const control = await field(label);
        const input = await control.$('textarea');
        await input.click();
        await page.keyboard.down('Control');
        await page.keyboard.press('A');
        await page.keyboard.up('Control');
        await page.keyboard.type(value);
        await page.keyboard.press('Tab');
        await pause();
    };
    await button('Add', 0);
    for (const p of [
        [430, 420],
        [700, 420],
        [700, 650],
        [430, 650],
    ])
        await click(...p);
    await button('Finish room');
    assert.equal((await data()).eg.rooms.length, 2);
    await button('Add', 1);
    await drag(460, 423, 650, 424);
    let geometry = (await data()).eg;
    assert.equal(geometry.windows.length, 1);
    assert(Math.abs(geometry.windows[0].centerY - geometry.rooms[1].points[0][1]) < 0.01);
    assert.equal(geometry.windows[0].roomIndex, 2);
    await number('Window height (m)', 1.75);
    assert.equal((await data()).eg.windows[0].windowHeightMeters, 1.75);
    assert.equal((await data()).eg.windows[0].directSunlightElevationCutoffDegrees, 10);
    await number('Direct sun cutoff elevation (°)', 17);
    assert.equal((await data()).eg.windows[0].directSunlightElevationCutoffDegrees, 17);
    await (await page.$('[role=dialog]')).screenshot({ path: screenshotPath('sunlight-editor.png') });
    await button('Edit as JSON');
    let jsonGeometry = await (await (await field('Geometry JSON')).$('textarea')).evaluate(input =>
        JSON.parse(input.value),
    );
    assert.equal(jsonGeometry.windows[0].directSunlightElevationCutoffDegrees, 17);
    await (await page.$('[role=dialog]')).screenshot({ path: screenshotPath('sunlight-editor-json.png') });
    await text('Geometry JSON', '{ invalid json');
    await button('Apply JSON');
    assert(await page.$('[role=dialog] [role=alert]'));
    assert.equal((await data()).eg.windows[0].directSunlightElevationCutoffDegrees, 17);
    jsonGeometry.windows[0].directSunlightElevationCutoffDegrees = 22;
    await text('Geometry JSON', JSON.stringify(jsonGeometry, null, 2));
    await button('Apply JSON');
    assert.equal((await data()).eg.windows[0].directSunlightElevationCutoffDegrees, 22);
    await button('Add', 2);
    await click(560, 510);
    assert.equal((await data()).eg.lightBubbles.length, 1);
    await number('Brightness (lumens)', 9000);
    assert.equal((await data()).eg.lightBubbles[0].brightnessLumens, 5000);
    await drag(560, 510, 590, 530);
    let light = (await data()).eg.lightBubbles[0];
    assert(Math.abs(light.x - 590) < 1);
    assert(Math.abs(light.y - 530) < 1);
    await drag(590, 530, 630, 550, true);
    light = (await data()).eg.lightBubbles[0];
    assert(Math.abs(light.x - 590) < 1);
    assert(Math.abs(light.y - 530) < 1);
    const select = async (label, text) => {
        const control = await field(label);
        await (await control.$('[role=combobox]')).click();
        await page.waitForSelector('[role=option]');
        const options = await page.$$('[role=option]');
        for (const option of options) {
            if ((await option.evaluate(e => e.textContent)).trim() === text) {
                await option.click();
                await page.waitForSelector('[role=option]', { hidden: true });
                await pause();
                return;
            }
        }
        throw new Error(`Missing option ${text}`);
    };
    await select('Floor', 'OG');
    assert.equal((await data()).og.rooms.length, 0);
    await select('Floor', 'EG');
    assert.equal((await data()).eg.lightBubbles.length, 1);
    await select('Room', 'Room 2');
    await button('Remove room');
    geometry = (await data()).eg;
    assert.equal(geometry.rooms.length, 1);
    assert.equal(geometry.windows.length, 0);
    assert.equal(geometry.lightBubbles.length, 0);
    await button('Add', 0);
    for (const p of [
        [450, 420],
        [700, 650],
        [450, 650],
        [700, 420],
    ])
        await click(...p);
    await button('Finish room');
    assert.equal((await data()).eg.rooms.length, 1);
    assert(await page.$('[role=dialog] [role=alert]'));
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 350));
    assert(await page.$('[role=dialog]'));
    await page.setViewport({ width: 390, height: 844 });
    await pause();
    const bounds = await page.$eval('[role=dialog] svg.sh-floorplan-svg', e => e.getBoundingClientRect().toJSON());
    assert(bounds.width > 200);
    await (await page.$('[role=dialog]')).screenshot({ path: screenshotPath('sunlight-editor-mobile.png') });
    await button('Done');
    await pause();
    await page.evaluate(() =>
        [...document.querySelectorAll('#sunlight-editor-test button')]
            .find(b => b.textContent.includes('Edit floor plan geometry'))
            .click(),
    );
    await pause();
    assert.equal((await data()).eg.rooms.length, 1);
    console.log(
        'Editor passed drawing, snapping, numeric input, lamp dragging, pointer cancellation, floor persistence, cascading deletion, invalid polygons, Escape, narrow layout and reopen.',
    );

    assert.deepEqual(errors, []);
    await page.close();
}

(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], pipe: true });
    try {
        await checkRenderer(browser);
        await checkEditor(browser);
        console.log(`Browser checks passed. Screenshots: ${artifacts}`);
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
