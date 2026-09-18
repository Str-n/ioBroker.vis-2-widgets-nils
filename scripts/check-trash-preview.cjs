/* global document, getComputedStyle -- Evaluated in Chromium by Puppeteer. */
// Start scripts/setup-local-test.sh, then run node scripts/check-trash-preview.cjs.
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');

async function main() {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(process.argv[2] || 'http://127.0.0.1:4174/test-dashboard.html');
        const card = '[data-preview="trash-green"]';
        const button = `${card} button`;
        await page.waitForSelector(button);
        assert.equal(await page.$eval(`${button} .sh-trash__days`, node => node.textContent), '1');
        assert.equal(await page.$$eval('.sh-trash__button', nodes => nodes.length), 5);
        const activeColor = await page.$eval(button, node => getComputedStyle(node).color);
        await page.click(button);
        await page.waitForFunction(
            selector => document.querySelector(selector)?.textContent === 'true',
            {},
            `${card} output`,
        );
        assert.equal(await page.$eval(button, node => node.getAttribute('aria-pressed')), 'true');
        assert.ok(await page.$(`${button} .sh-trash__check`));
        assert.notEqual(await page.$eval(button, node => getComputedStyle(node).color), activeColor);
        await page.focus(button);
        await page.keyboard.press('Space');
        await page.waitForFunction(
            selector => document.querySelector(selector)?.textContent === 'false',
            {},
            `${card} output`,
        );
        assert.equal(await page.$eval(button, node => getComputedStyle(node).color), activeColor);
        const setDays = async value => {
            await page.click(`${card} input`, { clickCount: 3 });
            await page.keyboard.press('Backspace');
            if (value) {
                await page.type(`${card} input`, value);
            }
        };
        await setDays('7');
        await page.waitForFunction(selector => !document.querySelector(selector), {}, button);
        await setDays('6');
        await page.waitForSelector(button);
        assert.equal(await page.$eval(`${button} .sh-trash__days`, node => node.textContent), '6');
        await setDays('0');
        await page.waitForSelector(button);
        assert.equal(await page.$eval(`${button} .sh-trash__days`, node => node.textContent), '0');
        await setDays('');
        await page.waitForFunction(selector => !document.querySelector(selector), {}, button);
        // Other bins retain their own state when the green bin changes.
        assert.equal(await page.$eval('[data-preview="trash-brown"] output', node => node.textContent), 'true');
        assert.equal(await page.$eval('[data-preview="trash-blue"] output', node => node.textContent), 'false');
        const combined = '[data-preview="trash-combined"] button';
        const color = () => page.$eval(combined, node => node.getAttribute('data-color'));
        // Green has missing data now; the completed brown bin is still the nearest.
        assert.equal(await color(), 'brown');
        assert.equal(await page.$eval(combined, node => node.getAttribute('aria-pressed')), 'true');
        await page.click(combined);
        await page.waitForFunction(
            () => document.querySelector('[data-preview="trash-brown"] output').textContent === 'false',
        );
        assert.equal(await color(), 'brown');
        assert.equal(await page.$eval('[data-preview="trash-green"] output', node => node.textContent), 'false');
        const changeDays = async (bin, value) => {
            const input = `[data-preview="trash-${bin}"] input`;
            await page.click(input, { clickCount: 3 });
            await page.keyboard.press('Backspace');
            await page.type(input, value);
        };
        await changeDays('brown', '8');
        assert.equal(await color(), 'black');
        await page.click(combined);
        await page.waitForFunction(
            () => document.querySelector('[data-preview="trash-black"] output').textContent === 'true',
        );
        assert.equal(await page.$eval('[data-preview="trash-brown"] output', node => node.textContent), 'false');
        await changeDays('black', '9');
        assert.equal(await color(), 'blue');
        await changeDays('blue', '7');
        await page.waitForFunction(selector => !document.querySelector(selector), {}, combined);
        await changeDays('blue', '0');
        await page.waitForSelector(combined);
        assert.equal(await color(), 'blue');
        assert.equal(await page.$eval(`${combined} .sh-trash__days`, node => node.textContent), '0');
        assert.deepEqual(errors, []);
        console.log(
            'Trash preview passed: colors, toggle/undo, keyboard, cutoff, zero, missing data, and multi-bin selection/writes.',
        );
    } finally {
        await browser.close();
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
