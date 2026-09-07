/* global document, getComputedStyle -- Evaluated in Chromium by Puppeteer. */
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const preset = require('../src-widgets/public/themes/ocean.json');

const palette = preset.colorSchemes.dark.palette;
const rgb = hex =>
    `rgb(${hex
        .slice(1)
        .match(/../g)
        .map(value => parseInt(value, 16))
        .join(', ')})`;
function luminance(hex) {
    const channels = hex
        .slice(1)
        .match(/../g)
        .map(value => {
            const channel = parseInt(value, 16) / 255;
            return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
    return channels.reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}
function contrast(foreground, background) {
    const [low, high] = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
    return (high + 0.05) / (low + 0.05);
}

async function main() {
    // Check real foreground/background roles; do not round before comparing.
    let pairs = 0;
    for (const background of [palette.background.default, palette.background.paper, preset.smartHome.surfaceRaised]) {
        for (const foreground of [palette.text.primary, palette.text.secondary]) {
            assert.ok(
                contrast(foreground, background) >= 4.5,
                `${foreground} on ${background} must meet text contrast`,
            );
            pairs++;
        }
    }
    for (const role of ['primary', 'secondary', 'info', 'success', 'warning', 'error']) {
        assert.ok(contrast(palette[role].contrastText, palette[role].main) >= 4.5, `${role} filled text contrast`);
        assert.ok(contrast(palette[role].main, preset.smartHome.surfaceRaised) >= 3, `${role} control contrast`);
        pairs += 2;
    }

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.setViewport({ width: 1440, height: 1050 });
        await page.goto(process.argv[2] || 'http://127.0.0.1:4174/test-dashboard.html', { waitUntil: 'networkidle2' });
        await page.waitForSelector('[data-preview="default-light"] .sh-control');

        const color = (selector, property) =>
            page.$eval(selector, (element, key) => getComputedStyle(element)[key], property);
        assert.equal(await color('body', 'backgroundColor'), rgb(palette.background.default));
        assert.equal(await color('[data-preview="default-light"] .sh-control', 'color'), rgb(preset.smartHome.lightOn));
        assert.equal(await color('[data-preview="default-switch"] .sh-control', 'color'), rgb(palette.secondary.main));
        assert.equal(await color('.button-grid .preview-card:first-child .sh-control', 'color'), rgb('#66df8b'));

        // A parent override must reach widgets even through nested sh-theme classes.
        await page.$eval('.weather-examples', element => element.style.setProperty('--sh-surface', '#503A63'));
        assert.equal(await color('.weather-examples .sh-weather', 'backgroundColor'), rgb('#503A63'));
        await page.$eval('.weather-examples', element => element.style.removeProperty('--sh-surface'));
        assert.equal(await color('.weather-examples .sh-weather', 'backgroundColor'), rgb(palette.background.paper));

        // Generated MUI channels must describe the same primary as the visible palette.
        const channel = await page.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue('--mui-palette-primary-mainChannel').trim(),
        );
        assert.equal(
            channel,
            palette.primary.main
                .slice(1)
                .match(/../g)
                .map(value => parseInt(value, 16))
                .join(' '),
        );

        await page.screenshot({ path: '/tmp/smarthome-ocean-preview.png' });

        // The host can have a different CSS palette. Adopted dialogs must keep the
        // widget's React theme even when they are portaled outside its DOM subtree.
        await page.evaluate(() =>
            document.documentElement.style.setProperty('--mui-palette-background-paper', '#FF00FF'),
        );
        await page.click('.thermostat-compact-button');
        await page.waitForSelector('.MuiDialog-paper', { visible: true });
        await page.waitForFunction(
            () => getComputedStyle(document.querySelector('.MuiDialog-container')).opacity === '1',
        );
        assert.equal(await color('.MuiDialog-paper', 'backgroundColor'), rgb(palette.background.paper));
        assert.equal(await color('.MuiDialog-paper', 'color'), rgb(palette.text.primary));
        await page.screenshot({ path: '/tmp/smarthome-ocean-dialog.png' });
        await page.keyboard.press('Escape');
        await page.waitForSelector('.MuiDialog-paper', { hidden: true });
        await page.evaluate(() => document.documentElement.style.removeProperty('--mui-palette-background-paper'));
        assert.deepEqual(errors, []);
        console.log(
            `Passed: ${pairs} contrast pairs, inherited overrides, explicit widget colors, MUI channels and portal theme.`,
        );
    } finally {
        await browser.close();
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
