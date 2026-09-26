const assert = require('node:assert/strict');
const fs = require('node:fs');
const puppeteer = require('puppeteer');
const url = process.env.ENERGY_PREVIEW_URL || 'http://127.0.0.1:4174/test-dashboard.html';
const artifacts = process.env.ENERGY_ARTIFACTS || '/tmp/energy-consumption-review';
fs.mkdirSync(artifacts, { recursive: true });
(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], pipe: true });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.setViewport({ width: 1100, height: 800, deviceScaleFactor: 2 });
        await page.goto(url, { waitUntil: 'networkidle0' });
        const root = '.sh-energy-consumption';
        await page.waitForSelector(root);
        const text = () => page.$eval(root, el => el.textContent);
        assert((await text()).includes('1.82'));
        assert((await text()).includes('66%'));
        assert.deepEqual(await page.$eval(root, el => { const b = el.getBoundingClientRect(); return [b.width, b.height]; }), [370, 150]);
        await (await page.$(root)).screenshot({ path: `${artifacts}/energy-import.png` });
        await page.click('[data-energy-scene="export"]');
        await page.waitForSelector('.sh-energy-consumption__grid-flow--export');
        assert((await text()).includes('1.55'));
        assert((await text()).includes('100%'));
        assert.equal(await page.$eval('.sh-energy-consumption__grid-flow .sh-energy-consumption__flow', el => el.getAttribute('d')), 'M218 61H291');
        await (await page.$(root)).screenshot({ path: `${artifacts}/energy-export.png` });
        await page.click('[data-energy-scene="night"]');
        await page.waitForFunction(() => !document.querySelector('.sh-energy-consumption__solar-flow'));
        assert((await text()).includes('480'));
        assert((await text()).includes('0%'));
        assert.equal(await page.$eval('.sh-energy-consumption__grid-flow .sh-energy-consumption__flow', el => el.getAttribute('d')), 'M291 61H218');
        await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
        assert.equal(await page.$eval('.sh-energy-consumption__flow', el => getComputedStyle(el).animationName), 'none');
        await page.click('[data-energy-scene="idle"]');
        await page.waitForFunction(() => !document.querySelector('.sh-energy-consumption__flow'));
        assert.equal(await page.$eval('.sh-energy-consumption__home-value', el => el.textContent.trim()), '0 W');
        await page.click('[data-energy-scene="missing"]');
        await page.waitForFunction(() => document.querySelector('.sh-energy-consumption').textContent.includes('Awaiting data'));
        assert.equal(await page.$eval('.sh-energy-consumption__home-value', el => el.textContent.trim()), '– W');
        console.log("Checking custom bindings, localization and theme");
        await page.evaluate(async () => {
            const React = (await import(performance.getEntriesByType('resource').find(r => r.name.includes('/react.js?')).name)).default;
            const { createRoot } = (await import(performance.getEntriesByType('resource').find(r => r.name.includes('/react-dom_client.js?')).name)).default;
            const Widget = (await import('/src/EnergyConsumption.tsx')).default;
            const node = document.createElement('div');
            node.id = 'energy-test';
            document.body.prepend(node);
            const root = createRoot(node);
            window.renderEnergyTest = (grid, solar, overrides = {}) => root.render(React.createElement(Widget, {
                id: 'isolated-energy', context: {},
                customSettings: { values: { 'test.grid.val': grid, 'test.solar.val': solar }, style: { width: 370, height: 150 },
                    rxData: { gridOid: 'test.grid', solarOid: 'test.solar', gridUnit: 'W', solarUnit: 'W', ...overrides } },
            }));
            window.renderEnergyTest(-1500, 1200);
        });
        await page.waitForFunction(() => document.querySelector('#energy-test').textContent.includes('Check readings'));
        assert.equal(await page.$('#energy-test .sh-energy-consumption__flow'), null);
        await page.evaluate(() => window.renderEnergyTest(850, 2.4, { invertGrid: true, solarUnit: 'kW', noCard: true }));
        await page.waitForFunction(() => document.querySelector('#energy-test').textContent.includes('1.55'));
        assert(await page.$('#energy-test .sh-energy-consumption--bare'));
        console.log("Checking custom bindings, localization and theme");
        await page.evaluate(async () => {
            const translations = (await import('/src/i18n/de.json')).default;
            window.visRxWidget.t = key => translations[key] || key;
            window.visRxWidget.getLanguage = () => 'de';
            window.renderEnergyTest(620, 1200);
            const { selectSmartHomeTheme } = await import('/src/theme/themeSelection.ts');
            selectSmartHomeTheme('daytime');
        });
        await page.waitForFunction(() => document.querySelector('#energy-test').textContent.includes('1,82'));
        const overflow = await page.$$eval('#energy-test svg text', nodes => nodes.filter(node => {
            const b = node.getBBox(); return b.x < 0 || b.x + b.width > 370 || b.y < 0 || b.y + b.height > 150;
        }).map(node => node.textContent));
        assert.deepEqual(overflow, []);
        await (await page.$('#energy-test .sh-energy-consumption')).screenshot({ path: `${artifacts}/energy-german-light.png` });
        assert.deepEqual(errors, []);
        console.log(`Energy browser checks passed; screenshots in ${artifacts}`);
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
