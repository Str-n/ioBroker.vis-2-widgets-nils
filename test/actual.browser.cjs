const assert = require('node:assert/strict');
const fs = require('node:fs');
const puppeteer = require('puppeteer');
const artifacts = '/tmp/actual-review';
fs.mkdirSync(artifacts, { recursive: true });

(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], pipe: true });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => { errors.push(error.message); console.error('Browser:', error.message); });
        await page.setViewport({ width: 1100, height: 800, deviceScaleFactor: 2 });
        await page.goto(process.env.ACTUAL_PREVIEW_URL || 'http://127.0.0.1:4174/test-dashboard.html', { waitUntil: 'networkidle0' });
        await page.waitForSelector('.sh-actual__chart canvas');
        console.log('Checking card layout and history');
        await page.evaluate(async () => {
            const React = (await import(performance.getEntriesByType('resource').find(r => r.name.includes('/react.js?')).name)).default;
            const { createRoot } = (await import(performance.getEntriesByType('resource').find(r => r.name.includes('/react-dom_client.js?')).name)).default;
            const Actual = (await import('/src/Actual.tsx')).default;
            const node = document.createElement('div');
            node.id = 'actual-test';
            document.body.prepend(node);
            const root = createRoot(node);
            const objects = Object.fromEntries(['temperature', 'humidity'].map(kind => [`test.${kind}`, {
                _id: `test.${kind}`, type: 'state', common: { name: kind === 'temperature' ? 'Temperature' : 'Humidity', role: `value.${kind}`, unit: kind === 'temperature' ? '°C' : '%', type: 'number', custom: { 'history.0': { enabled: true } } },
            }]));
            window.actualRef = React.createRef();
            window.actualValues = { 'test.temperature.val': 21.5, 'test.humidity.val': 46 };
            window.actualWrites = [];
            const socket = {
                getObjectsById: async ids => Object.fromEntries(ids.filter(id => objects[id]).map(id => [id, objects[id]])),
                getObject: async id => objects[id] || null,
                getState: async id => ({ val: window.actualValues[`${id}.val`], ts: Date.now() }),
                getHistory: async (id, options) => Array.from({ length: 24 }, (_, i) => ({ ts: options.start + (options.end - options.start) * i / 24, val: id.includes('humidity') ? 46 + Math.sin(i / 4) * 3 : 21.5 + Math.sin(i / 3) })),
                subscribeState: async () => undefined,
                unsubscribeState: () => undefined,
            };
            window.renderActual = (overrides = {}, editMode = false, size = { width: 340, height: 120 }) => root.render(React.createElement(Actual, {
                id: 'actual-test-widget', ref: window.actualRef, editMode,
                context: { socket, setValue: (...args) => window.actualWrites.push(args), systemConfig: { common: { defaultHistory: 'history.0', dateFormat: 'DD.MM.YYYY', isFloatComma: false } }, themeType: 'dark' },
                customSettings: { values: window.actualValues, style: size, rxData: {
                    widgetTitle: 'Living room', 'oid-main': 'test.temperature', 'oid-secondary': 'test.humidity', digits_after_comma_main: 1, digits_after_comma_secondary: 0, ...overrides,
                } },
            }));
            window.renderActual();
        });
        const card = '#actual-test .sh-actual';
        const render = overrides => page.evaluate(overrides => window.renderActual(overrides), overrides);
        await page.waitForSelector(`${card} .sh-actual__chart canvas`);
        await page.waitForFunction(selector => document.querySelector(selector).textContent.includes('21.5'), {}, card);
        assert((await page.$eval(card, el => el.textContent)).includes('46'));
        assert.deepEqual(await page.$eval(card, el => { const r = el.getBoundingClientRect(); return [r.width, r.height]; }), [340, 120]);
        assert(await page.$eval(card, el => el.scrollHeight <= el.clientHeight));
        await (await page.$(card)).screenshot({ path: `${artifacts}/ocean.png` });
        await page.focus(card);
        await page.keyboard.press('Enter');
        await page.waitForSelector('.sh-actual-dialog .echarts-for-react svg');
        await page.waitForSelector('.sh-actual-dialog [aria-label="Close"]');
        await page.click('.sh-actual-dialog [aria-label="Close"]');
        await page.waitForSelector('.sh-actual-dialog', { hidden: true });

        console.log('Checking light theme and dialog');
        const ocean = await page.$eval(card, el => getComputedStyle(el).backgroundColor);
        await page.select('.sh-theme-selector select', 'daytime');
        await page.waitForFunction((selector, old) => getComputedStyle(document.querySelector(selector)).backgroundColor !== old, {}, card, ocean);
        await (await page.$(card)).screenshot({ path: `${artifacts}/daytime.png` });
        await page.click(card);
        await page.waitForSelector('.sh-actual-dialog .echarts-for-react svg');
        assert.equal(await page.$eval('.sh-actual-dialog .MuiDialog-paper', el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)');
        await page.keyboard.press('Escape');
        await page.waitForSelector('.sh-actual-dialog', { hidden: true });

        console.log('Checking custom settings and transparent mode');
        await render({ noCard: true, noChart: true, 'noChart-secondary': true, 'title-main': 'Basement', 'unit-main': 'K', 'font-size-main': '30', 'font-style-main': 'italic', 'color-main': '#a020f0', 'color-secondary': '#008000' });
        await page.waitForSelector(`${card}.sh-actual--bare:not(.sh-actual--chart)`);
        assert.equal(await page.$eval(card, el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
        const main = `${card} .sh-actual__reading--main`;
        assert((await page.$eval(main, el => el.textContent)).includes('Basement'));
        assert.equal(await page.$eval(`${main} .sh-actual__number`, el => getComputedStyle(el).fontSize), '30px');
        assert.equal(await page.$eval(`${main} .sh-actual__number`, el => getComputedStyle(el).fontStyle), 'italic');
        assert.equal(await page.$eval(main, el => getComputedStyle(el).color), 'rgb(160, 32, 240)');
        assert.equal(await page.$eval(card, el => el.getAttribute('role')), null);
        await (await page.$(card)).screenshot({ path: `${artifacts}/custom-bare.png` });

        await render({ 'noChart-secondary': true });
        await page.waitForFunction(() => window.actualRef.current.state.chartData['test.humidity'] === null);
        await page.evaluate(() => { window.actualValues = { 'test.temperature.val': 0, 'test.humidity.val': null }; window.renderActual({ noChart: true, 'noChart-secondary': true }); });
        await page.waitForFunction(selector => document.querySelector(selector).textContent.includes('0.0'), {}, main);
        assert.equal(await page.$eval(`${card} .sh-actual__reading--secondary .sh-actual__value`, el => el.textContent), '–');
        await render({ noChart: true, 'noChart-secondary': true, 'oid-main': 'nothing_selected' });
        await page.waitForFunction(selector => document.querySelectorAll(`${selector} .sh-actual__reading`).length === 1, {}, card);
        await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
        assert.equal(await page.$eval(`${card} .sh-actual__value`, el => getComputedStyle(el).animationName), 'none');
        await page.evaluate(() => window.renderActual({}, true));
        await page.waitForSelector(`${card} .sh-actual__chart canvas`);
        assert.equal(await page.$eval(card, el => el.getAttribute('role')), null);
        assert.deepEqual(await page.evaluate(() => window.actualWrites), []);
        assert.deepEqual(errors, []);
        console.log(`Actual browser checks passed; screenshots in ${artifacts}`);
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
