const assert = require('node:assert/strict');
const fs = require('node:fs');
const puppeteer = require('puppeteer');
const url = process.env.SUNLIGHT_PREVIEW_URL || 'http://127.0.0.1:4174/test-dashboard.html';
const artifacts = process.env.SUNLIGHT_ARTIFACTS || '/tmp/sun-position-review';
fs.mkdirSync(artifacts, { recursive: true });
(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], pipe: true });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.setViewport({ width: 1000, height: 800, deviceScaleFactor: 2 });
        await page.evaluateOnNewDocument(() => { Date.now = () => new Date().setHours(11, 30, 0, 0); });
        await page.goto(url, { waitUntil: 'networkidle0' });
        await page.waitForSelector('.sh-sun-position__marker');
        await page.click('[data-scene="noon"]');
        await page.waitForFunction(() => document.querySelector('.sh-sun-position').textContent.includes('950'));
        await (await page.$('.sh-sun-position')).screenshot({ path: `${artifacts}/sun-position-day.png` });
        const bounds = await page.$eval('.sh-sun-position', element => {
            const box = element.getBoundingClientRect();
            return [box.width, box.height];
        });
        assert.deepEqual(bounds, [370, 150]);
        await page.click('[data-scene="evening"]');
        await page.waitForSelector('.sh-sun-position--night');
        assert.equal(await page.$('.sh-sun-position__marker'), null);
        await (await page.$('.sh-sun-position')).screenshot({ path: `${artifacts}/sun-position-night.png` });
        await page.evaluate(async () => {
            const React = (await import(performance.getEntriesByType('resource').find(r => r.name.includes('/react.js?')).name)).default;
            const { createRoot } = (await import(performance.getEntriesByType('resource').find(r => r.name.includes('/react-dom_client.js?')).name)).default;
            const Widget = (await import('/src/SunPosition.tsx')).default;
            const { sunPositionBindings } = await import('/src/SunPositionUtils.ts');
            const node = document.createElement('div');
            node.id = 'sun-position-test';
            document.body.prepend(node);
            const root = createRoot(node);
            window.renderSunTest = (values = {}, overrides = {}, language = 'en', width = 370) => {
                window.visRxWidget.getLanguage = () => language;
                root.render(React.createElement(Widget, {
                    id: 'isolated-sun', context: {},
                    customSettings: { values, style: { width, height: 150 }, rxData: { ...sunPositionBindings, ...overrides } },
                }));
            };
            window.renderSunTest();
        });
        await page.waitForFunction(() => document.querySelector('#sun-position-test').textContent.includes('Daily path unavailable'));
        assert.equal(await page.$('#sun-position-test .sh-sun-position__marker'), null);
        await (await page.$('#sun-position-test')).screenshot({ path: `${artifacts}/sun-position-missing.png` });
        await page.evaluate(() => window.renderSunTest({
            'custom.clouds.val': 0.75, 'custom.sun.val': 20,
            'custom.radiation.val': 0,
        }, { weatherCloudinessOid: 'custom.clouds', cloudinessScale: 'fraction', sunElevationOid: 'custom.sun', weatherRadiationOid: 'custom.radiation' }));
        await page.waitForFunction(() => document.querySelector('#sun-position-test').textContent.includes('75'));
        assert.equal(await page.$eval('#sun-position-test .sh-sun-position__metric', el => el.textContent.trim()), '0 W/m²');
        await page.evaluate(async () => {
            const translations = (await import('/src/i18n/de.json')).default;
            window.visRxWidget.t = key => translations[key] || key;
            window.renderSunTest({}, {}, 'de', 370);
        });
        await page.waitForFunction(() => document.querySelector('#sun-position-test').textContent.includes('Tagesbahn nicht verfügbar'));
        const overflow = await page.$$eval('#sun-position-test svg text', nodes => nodes.filter(node => {
            const b = node.getBBox(); return b.x < 0 || b.x + b.width > 370 || b.y < 0 || b.y + b.height > 150;
        }).map(node => node.textContent));
        assert.deepEqual(overflow, []);
        await (await page.$('#sun-position-test')).screenshot({ path: `${artifacts}/sun-position-german.png` });
        assert.deepEqual(errors, []);
        console.log(`Sun position browser checks passed; screenshots in ${artifacts}`);
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
