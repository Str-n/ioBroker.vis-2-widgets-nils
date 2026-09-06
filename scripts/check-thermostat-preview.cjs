// Start the local dashboard, then run: node scripts/check-thermostat-preview.cjs [URL]
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');

async function main() {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.setViewport({ width: 1100, height: 900 });
        await page.goto(process.argv[2] || 'http://127.0.0.1:4174/test-dashboard.html', {
            waitUntil: 'networkidle2',
            timeout: 120000,
        });
        const root = '[data-preview="thermostat"]';
        const slider = `${root} input[type="range"]`;
        await page.waitForSelector(slider);
        assert.equal(await page.$eval(slider, el => el.max), '25');
        await page.focus(slider);
        await page.keyboard.press('End');
        const values = () => page.$eval('[data-preview="thermostat-values"]', el => JSON.parse(el.textContent));
        assert.equal((await values()).setpoint, 25);
        assert.equal(await page.$eval(`${root} button[aria-label="Increase temperature"]`, el => el.disabled), true);
        await page.keyboard.press('ArrowRight');
        assert.equal((await values()).setpoint, 25);
        await page.click(`${root} button[aria-label="Decrease temperature"]`);
        assert.equal((await values()).setpoint, 24.5);
        await page.click(`${root} button[value="1"]`);
        assert.equal((await values()).mode, 1);
        assert.equal(await page.$eval(`${root} button[value="1"]`, el => el.getAttribute('aria-pressed')), 'true');
        await page.click(`${root} button[value="0"]`);
        assert.equal((await values()).mode, 0);
        await page.click(`${root} button[value="0"]`);
        assert.equal((await values()).mode, 0, 'Selected mode cannot be deselected');
        await page.$eval(root, el => el.scrollIntoView({ block: 'center' }));
        await (await page.$(root)).screenshot({ path: '/tmp/thermostat-desktop.png' });
        await page.setViewport({ width: 390, height: 844 });
        await page.$eval(`${root} .widget-surface`, el => {
            el.style.height = '400px';
        });
        assert.equal(await page.$eval(root, el => el.scrollWidth <= el.clientWidth), true, 'No horizontal overflow');
        await (await page.$(root)).screenshot({ path: '/tmp/thermostat-mobile.png' });
        await page.click('.thermostat-compact-button');
        await page.waitForSelector('[role="dialog"] input[type="range"]');
        assert.equal(await page.$eval('[role="dialog"] input[type="range"]', el => el.max), '25');
        assert.equal(await page.$$eval('[data-testid="MoreVertIcon"]', els => els.length), 0);
        await new Promise(resolve => setTimeout(resolve, 300));
        await (await page.$('[role="dialog"]')).screenshot({ path: '/tmp/thermostat-dialog.png' });
        assert.deepEqual(errors, []);
        console.log(
            'Thermostat checks passed: 25°C cap, half-degree adjustment, numeric Auto/Manual, responsive layout, compact dialog.',
        );
    } finally {
        await browser.close();
    }
}
main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
