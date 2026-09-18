/* global document, getComputedStyle, localStorage, Storage -- Evaluated in Chromium by Puppeteer. */
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const names = ['ocean', 'daytime', 'midnight', 'plum', 'happymode', 'graphite'];
const presets = Object.fromEntries(names.map(name => [name, require(`../src-widgets/public/themes/${name}.json`)]));
const key = 'vis-2-widgets-nils-fork.theme';
const selector = '.sh-theme-selector select';
const rgb = hex =>
    `rgb(${hex
        .slice(1)
        .match(/../g)
        .map(value => parseInt(value, 16))
        .join(', ')})`;
function luminance(hex) {
    return hex
        .slice(1)
        .match(/../g)
        .map(value => {
            const v = parseInt(value, 16) / 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        })
        .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a, b) {
    const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y);
    return (high + 0.05) / (low + 0.05);
}

async function main() {
    for (const [id, preset] of Object.entries(presets)) {
        const p = preset.colorSchemes[preset.defaultColorScheme].palette;
        for (const background of [p.background.default, p.background.paper, preset.smartHome.surfaceRaised]) {
            for (const foreground of [p.text.primary, p.text.secondary]) {
                assert.ok(contrast(foreground, background) >= 4.5, `${id}: readable text`);
            }
        }
        for (const foreground of [preset.smartHome.switchOn, preset.smartHome.switchOff, preset.smartHome.lightOn]) {
            assert.ok(contrast(foreground, preset.smartHome.surfaceRaised) >= 3, `${id}: readable controls`);
        }
    }
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const url = process.argv[2] || 'http://127.0.0.1:4174/test-dashboard.html';
        await page.goto(url);
        await page.waitForSelector(selector);
        assert.equal(await page.$eval(selector, node => node.value), 'ocean');
        assert.deepEqual(await page.$$eval(`${selector} option`, nodes => nodes.map(node => node.value)), names);
        const color = (target, property) => page.$eval(target, (node, prop) => getComputedStyle(node)[prop], property);
        // Keep a portal open while changing presets: both CSS controls and MUI
        // dialog surfaces must update, including against a different host palette.
        await page.click('.thermostat-compact-button');
        await page.waitForSelector('.MuiDialog-paper', { visible: true });
        for (const id of names) {
            await page.select(selector, id);
            await page.waitForFunction(value => document.documentElement.dataset.shTheme === value, {}, id);
            const p = presets[id].colorSchemes[presets[id].defaultColorScheme].palette;
            // MUI animates button backgrounds, so wait for the final theme color.
            await page.waitForFunction(
                expected =>
                    getComputedStyle(document.querySelector('[data-preview="default-switch"] .sh-control'))
                        .backgroundColor === expected,
                {},
                rgb(presets[id].smartHome.surfaceRaised),
            );
            assert.equal(await color('.sh-app', 'backgroundColor'), rgb(p.background.default));
            assert.equal(await color(selector, 'colorScheme'), presets[id].defaultColorScheme);
            assert.equal(await color('.MuiDialog-paper', 'color'), rgb(p.text.primary));
            assert.equal(await color('.sh-weather', 'backgroundColor'), rgb(p.background.paper));
            assert.equal(await color('.MuiDialog-paper', 'backgroundColor'), rgb(p.background.paper));
            assert.equal(
                await color('[data-preview="default-switch"] .sh-control', 'color'),
                rgb(presets[id].smartHome.switchOn),
            );
            assert.equal(await color('.button-grid .preview-card:first-child .sh-control', 'color'), rgb('#66df8b'));
            assert.equal(await page.evaluate(storageKey => localStorage.getItem(storageKey), key), id);
        }
        await page.keyboard.press('Escape');
        await page.reload();
        await page.waitForSelector(selector);
        assert.equal(await page.$eval(selector, node => node.value), 'graphite');
        assert.equal(
            await color('.sh-app', 'backgroundColor'),
            rgb(presets.graphite.colorSchemes.dark.palette.background.default),
        );

        for (const id of ['daytime', 'happymode']) {
            await page.select(selector, id);
            await page.reload();
            await page.waitForSelector(selector);
            assert.equal(await page.$eval(selector, node => node.value), id);
            assert.equal(await color(selector, 'colorScheme'), 'light');
            assert.equal(
                await color('.sh-app', 'backgroundColor'),
                rgb(presets[id].colorSchemes.light.palette.background.default),
            );
            await page.setViewport({ width: 1100, height: 1000 });
            await page.$eval('.theme-preview', node => node.scrollIntoView());
            await page.screenshot({ path: `/tmp/theme-${id}-preview.png` });
        }

        const other = await browser.newPage();
        await other.goto(url);
        await other.waitForSelector(selector);
        await page.select(selector, 'daytime');
        await other.waitForFunction(target => document.querySelector(target).value === 'daytime', {}, selector);
        await other.evaluate(storageKey => localStorage.removeItem(storageKey), key);
        await page.waitForFunction(target => document.querySelector(target).value === 'ocean', {}, selector);
        await other.close();
        for (const saved of ['invalid-theme', 'forest', 'ember']) {
            await page.evaluate((storageKey, value) => localStorage.setItem(storageKey, value), key, saved);
            await page.reload();
            await page.waitForSelector(selector);
            assert.equal(await page.$eval(selector, node => node.value), 'ocean');
        }
        await page.evaluateOnNewDocument(storageKey => {
            const get = Storage.prototype.getItem;
            const set = Storage.prototype.setItem;
            Storage.prototype.getItem = function (name) {
                if (name === storageKey) {
                    throw new Error('Storage unavailable');
                }
                return get.call(this, name);
            };
            Storage.prototype.setItem = function (name, value) {
                if (name === storageKey) {
                    throw new Error('Storage unavailable');
                }
                return set.call(this, name, value);
            };
        }, key);
        await page.reload();
        await page.waitForSelector(selector);
        await page.select(selector, 'plum');
        assert.equal(await page.$eval(selector, node => node.value), 'plum');
        assert.equal(
            await color('.sh-app', 'backgroundColor'),
            rgb(presets.plum.colorSchemes.dark.palette.background.default),
        );
        assert.deepEqual(errors, []);
        await page.screenshot({ path: '/tmp/theme-selector-preview.png', fullPage: true });
        console.log(
            'Passed: six themes, contrast, live CSS and portal updates, explicit colors, reload, cross-tab sync, invalid/blocked storage.',
        );
    } finally {
        await browser.close();
    }
}
main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
