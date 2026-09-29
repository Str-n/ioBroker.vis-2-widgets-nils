const assert = require('node:assert/strict');
const fs = require('node:fs');
const puppeteer = require('puppeteer');

const url = process.env.DEHUMIDIFIER_PREVIEW_URL || 'http://127.0.0.1:4174/test-dashboard.html';
const artifacts = '/tmp/dehumidifier-review';
fs.mkdirSync(artifacts, { recursive: true });

(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], pipe: true });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.setViewport({ width: 1100, height: 800, deviceScaleFactor: 2 });
        await page.goto(url, { waitUntil: 'networkidle0' });
        await page.waitForSelector('.sh-dehumidifier');
        await page.click('.sh-dehumidifier button[aria-label="High"]');
        await page.waitForSelector('.sh-dehumidifier[data-level="3"]');
        await page.click('.sh-dehumidifier button[aria-label="Off"]');
        await page.waitForSelector('.sh-dehumidifier[data-running="false"]');

        // Keep writes separate from subscribed readings to test external updates
        // and ensure a click alone never invents a running status.
        await page.evaluate(async () => {
            const React = (await import(performance.getEntriesByType('resource').find(r => r.name.includes('/react.js?')).name)).default;
            const { createRoot } = (await import(performance.getEntriesByType('resource').find(r => r.name.includes('/react-dom_client.js?')).name)).default;
            const { default: Widget, dehumidifierBindings } = await import('/src/Dehumidifier.tsx');
            window.dehumidifierBindings = dehumidifierBindings;
            window.dehumidifierInfo = Widget.getWidgetInfo();
            const node = document.createElement('div');
            node.id = 'dehumidifier-test';
            document.body.prepend(node);
            const root = createRoot(node);
            window.dehumidifierWrites = [];
            window.renderDehumidifier = (power, level, overrides = {}, editMode = false) => root.render(React.createElement(Widget, {
                id: 'isolated-dehumidifier', editMode,
                context: { setValue: (id, value) => window.dehumidifierWrites.push([id, value]) },
                customSettings: {
                    values: { 'test.power.val': power, 'test.level.val': level, 'test.temperature.val': 19.6, 'test.humidity.val': 64, ...(window.dehumidifierSensorValues || {}) },
                    style: { width: 240, height: 144 },
                    rxData: { powerOid: 'test.power', levelOid: 'test.level', temperatureOid: 'test.temperature', humidityOid: 'test.humidity', ...overrides },
                },
            }));
            window.renderDehumidifier(false, 2);
        });
        const root = '#dehumidifier-test .sh-dehumidifier';
        const button = label => `${root} button[aria-label="${label}"]`;
        const selected = label => page.waitForSelector(`${button(label)}[aria-pressed="true"]`);
        const render = (power, level, overrides, editMode) => page.evaluate((...args) => window.renderDehumidifier(...args), power, level, overrides, editMode);
        await selected('Off');
        const bindings = await page.evaluate(() => window.dehumidifierBindings);
        assert.deepEqual(bindings, {
            powerOid: '0_userdata.0.Feuchtigkeit.Power_Mode',
            levelOid: '0_userdata.0.Feuchtigkeit.Power_Mode_Level',
            temperatureOid: '0_userdata.0.Feuchtigkeit.T_in',
            humidityOid: '0_userdata.0.Feuchtigkeit.rel_humidity_basement',
        });
        for (const [level, label] of [[1, 'Low'], [2, 'Medium'], [3, 'High']]) {
            await page.evaluate(() => { window.dehumidifierWrites = []; });
            await page.click(button(label));
            assert.deepEqual(await page.evaluate(() => window.dehumidifierWrites), [['test.level', level], ['test.power', true]]);
            await render(true, level);
            await selected(label);
            assert.equal(await page.$$eval(`${root} .sh-dehumidifier__status [data-filled="true"]`, nodes => nodes.length), level);
        }
        await (await page.$(root)).screenshot({ path: `${artifacts}/running.png` });
        await page.evaluate(() => { window.dehumidifierWrites = []; });
        await page.focus(button('Off'));
        await page.keyboard.press('Enter');
        assert.deepEqual(await page.evaluate(() => window.dehumidifierWrites), [['test.power', false]]);
        await selected('High'); // unchanged until a subscribed value arrives
        await render(false, 3);
        await selected('Off');
        assert.equal(await page.$$eval(`${root} .sh-dehumidifier__status [data-filled="true"]`, nodes => nodes.length), 0);
        await (await page.$(root)).screenshot({ path: `${artifacts}/off.png` });

        console.log('Checking sensor readings while off and external updates');
        const temperature = `${root} .sh-dehumidifier__temperature`;
        const humidity = `${root} .sh-dehumidifier__humidity`;
        assert.equal(await page.$eval(temperature, el => el.textContent), '19.6 °C');
        assert.equal(await page.$eval(humidity, el => el.textContent), '64 %');
        for (const [temp, rh, expectedTemp, expectedRh] of [
            [0, 0, '0.0 °C', '0 %'],
            ['-2.5', '75.2', '-2.5 °C', '75 %'],
            [null, null, '– °C', '– %'],
            ['', 101, '– °C', '– %'],
            [false, -1, '– °C', '– %'],
        ]) {
            await page.evaluate((temp, rh) => {
                window.dehumidifierSensorValues = { 'test.temperature.val': temp, 'test.humidity.val': rh };
                window.renderDehumidifier(false, 3);
            }, temp, rh);
            await page.waitForFunction((t, h, expectedT, expectedH) => document.querySelector(t).textContent === expectedT && document.querySelector(h).textContent === expectedH, {}, temperature, humidity, expectedTemp, expectedRh);
            await selected('Off');
        }
        await page.evaluate(() => { window.dehumidifierSensorValues = {}; });

        console.log('Checking external readings and reduced motion');
        await render('true', '2');
        await selected('Medium');
        await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
        assert.equal(await page.$eval(`${root} .sh-dehumidifier__flow`, el => getComputedStyle(el).animationName), 'none');
        await render(null, null);
        await page.waitForSelector(`${root} [role="status"][aria-label="Status unavailable"]`);
        assert.equal(await page.$$eval(`${root} button[aria-pressed="true"]`, nodes => nodes.length), 0);
        await render(true, 9);
        await page.waitForSelector(`${root} [role="status"][aria-label="Running · Level unavailable"]`);
        assert.equal(await page.$$eval(`${root} button[aria-pressed="true"]`, nodes => nodes.length), 0);

        console.log('Checking disabled controls');
        for (const [overrides, editMode] of [[{ readOnly: true }, false], [{ readOnly: 'true' }, false], [{}, true], [{ powerOid: 'nothing_selected' }, false]]) {
            await render(true, 1, overrides, editMode);
            await page.waitForFunction(selector => [...document.querySelectorAll(`${selector} button`)].every(b => b.disabled), {}, root);
            await page.evaluate(() => { window.dehumidifierWrites = []; });
            await page.click(button('High'));
            assert.deepEqual(await page.evaluate(() => window.dehumidifierWrites), []);
        }
        console.log('Checking incomplete bindings');
        await render(true, 1, { levelOid: 'nothing_selected' });
        await page.waitForFunction(selector => !document.querySelector(selector).disabled, {}, button('Off'));
        assert.equal(await page.$eval(button('High'), el => el.disabled), true);
        await page.click(button('Off'));
        assert.deepEqual(await page.evaluate(() => window.dehumidifierWrites), [['test.power', false]]);

        console.log('Checking localization and light theme');
        await page.evaluate(translations => {
            window.visRxWidget.t = key => translations[key] || key;
            window.visRxWidget.getLanguage = () => 'de';
            window.renderDehumidifier(true, 2);
        }, require('../src-widgets/src/i18n/de.json'));
        await page.select('.sh-theme-selector select', 'daytime');
        await selected('Mittel');
        assert.equal(await page.$eval(temperature, el => el.textContent), '19,6 °C');
        await (await page.$(root)).screenshot({ path: `${artifacts}/daytime.png` });
        assert.deepEqual(errors, []);
        console.log(`Dehumidifier browser checks passed; screenshots in ${artifacts}`);
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
