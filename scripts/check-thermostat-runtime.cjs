// Read-only runtime regression check. Optionally serve a local production build only to this browser:
// node scripts/check-thermostat-runtime.cjs https://host:8082/vis-2/#EG src-widgets/build
// Opens/closes dialogs; never changes device states or uploads files to the server.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');

async function main() {
    assert.ok(process.argv[2], 'Provide the vis-2 runtime URL');
    const build = process.argv[3] && path.resolve(process.argv[3]);
    const browser = await puppeteer.launch({ headless: true, acceptInsecureCerts: true, args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => {
            if (message.type() === 'error' && /tplNils2ThermostatCompact|reading 'length'/.test(message.text())) {
                errors.push(message.text());
            }
        });
        let overrides = 0;
        if (build) {
            await page.setRequestInterception(true);
            page.on('request', request => {
                const pathname = new URL(request.url()).pathname;
                const prefix = '/vis-2/widgets/vis-2-widgets-nils-fork/';
                if (pathname.startsWith(prefix)) {
                    const file = path.resolve(build, pathname.slice(prefix.length));
                    if (file.startsWith(`${build}${path.sep}`) && fs.existsSync(file) && fs.statSync(file).isFile()) {
                        overrides++;
                        const contentType = file.endsWith('.js')
                            ? 'application/javascript'
                            : file.endsWith('.css')
                              ? 'text/css'
                              : 'application/json';
                        void request.respond({ status: 200, contentType, body: fs.readFileSync(file) });
                        return;
                    }
                }
                void request.continue();
            });
        }
        await page.setViewport({ width: 390, height: 750, isMobile: true, hasTouch: true });
        await page.goto(process.argv[2], { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForSelector('.thermostat-compact-button', { timeout: 90000 });
        // Wait for state objects to load before opening the controls.
        await new Promise(resolve => setTimeout(resolve, 2000));
        const count = await page.$$eval('.thermostat-compact-button', elements => elements.length);
        for (let index = 0; index < count; index++) {
            const buttons = await page.$$('.thermostat-compact-button');
            await buttons[index].click();
            await page.waitForSelector('[role="dialog"] input[type="range"]', { timeout: 5000 });
            assert.equal(await page.$eval('[role="dialog"] input[type="range"]', element => element.max), '25');
            await new Promise(resolve => setTimeout(resolve, 300));
            const layout = await page.$eval('[role="dialog"]', element => {
                const rect = element.getBoundingClientRect();
                const content = element.querySelector('.MuiDialogContent-root');
                const controls = element.querySelector('.thermostat-controls');
                return {
                    fitsViewport: rect.left >= 0 && rect.right <= 390 && rect.top >= 0 && rect.bottom <= 750,
                    contentFits:
                        content.scrollHeight <= content.clientHeight + 1 &&
                        content.scrollWidth <= content.clientWidth + 1,
                    controlsFit:
                        controls.scrollHeight <= controls.clientHeight + 1 &&
                        controls.scrollWidth <= controls.clientWidth + 1,
                    historyVisible: /history|verlauf|thermostat_history/i.test(element.textContent),
                };
            });
            assert.deepEqual(layout, {
                fitsViewport: true,
                contentFits: true,
                controlsFit: true,
                historyVisible: false,
            });
            if (index === 0) {
                await page.screenshot({ path: '/tmp/thermostat-390x750.png' });
            }
            assert.deepEqual(errors, []);
            await page.keyboard.press('Escape');
            await page.waitForSelector('[role="dialog"]', { hidden: true });
        }
        assert.equal(await page.$$eval('.thermostat-compact-button', elements => elements.length), count);
        if (build) {
            assert.ok(overrides > 0, 'The local build must be loaded');
        }
        assert.deepEqual(errors, []);
        console.log(
            `Passed: opened and closed ${count} live compact thermostats at 390 × 750 without overflow or history; ${overrides} local build requests. No device states changed.`,
        );
    } finally {
        await browser.close();
    }
}
main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
