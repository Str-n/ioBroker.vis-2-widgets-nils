/* global document, getComputedStyle, requestAnimationFrame, visualViewport -- Evaluated in Chromium by Puppeteer. */
// Start src-widgets with npm run test:dashboard, then run:
// node scripts/check-carousel-preview.cjs http://127.0.0.1:4174/test-dashboard.html
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');

async function touchDrag(page, selector, dx, dy = 0) {
    await page.$eval('.sh-carousel', element => element.scrollIntoView({ block: 'center' }));
    const start = await page.$eval(selector, element => {
        const rect = element.getBoundingClientRect();
        return {
            x: rect.x + rect.width / 2 - visualViewport.offsetLeft,
            y: rect.y + rect.height / 2 - visualViewport.offsetTop,
        };
    });
    const touch = await page.touchscreen.touchStart(start.x, start.y);
    for (let step = 1; step <= 8; step++) {
        await touch.move(start.x + (dx * step) / 8, start.y + (dy * step) / 8);
    }
    await touch.end();
    // Let Chromium finish the gesture before starting an independent tap.
    await new Promise(resolve => setTimeout(resolve, 400));
}

async function tapControl(page, selector) {
    await page.$eval(selector, element => element.scrollIntoView({ block: 'center' }));
    // Wait for mobile viewport scrolling/layout to settle before sending coordinates.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const point = await page.$eval(selector, element => {
        const rect = element.getBoundingClientRect();
        return {
            x: rect.x + rect.width / 2 - visualViewport.offsetLeft,
            y: rect.y + rect.height / 2 - visualViewport.offsetTop,
        };
    });
    const touch = await page.touchscreen.touchStart(point.x, point.y);
    assert.equal(await page.$eval(selector, element => getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0)');
    await touch.end();
}

async function activeCard(page, number) {
    await page.waitForFunction(
        expected => document.querySelector('.sh-carousel__card')?.getAttribute('aria-label') === expected,
        { timeout: 3000 },
        `Card ${number} of 3`,
    );
    assert.equal(await page.$$eval('.sh-carousel__card', elements => elements.length), 1);
}

async function main() {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    try {
        for (const mobile of [false, true]) {
            const page = await browser.newPage();
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.setViewport({ width: 430, height: 900, isMobile: mobile, hasTouch: mobile });
            await page.goto(process.argv[2] || 'http://127.0.0.1:4174/test-dashboard.html', {
                waitUntil: 'networkidle2',
            });
            await page.waitForSelector('.sh-carousel .sh-weather');
            await page.$eval('.sh-carousel', element => {
                element.parentElement.style.width = '340px';
                element.scrollIntoView({ block: 'center' });
            });

            if (mobile) {
                // Model vis wrappers that stop bubbling events inside the embedded view.
                await page.$eval('.sh-carousel .sh-weather', element => {
                    for (const type of ['pointerdown', 'pointermove', 'pointerup']) {
                        element.addEventListener(type, event => event.stopPropagation());
                    }
                });
                await touchDrag(page, '.sh-carousel .sh-weather', -110);
                await activeCard(page, 2);
                await tapControl(page, '.sh-carousel [aria-label="Show card 1"]');
                await activeCard(page, 1);
                await touchDrag(page, '.sh-carousel .sh-weather', 0, -90);
                await activeCard(page, 1);
                await touchDrag(page, '.sh-carousel .sh-weather', -15);
                await activeCard(page, 1);
                await touchDrag(page, '.sh-carousel .sh-weather', 110);
                await activeCard(page, 3);
                await tapControl(page, '.sh-carousel [aria-label="Next card"]');
                await activeCard(page, 1);
            } else {
                const rect = await (await page.$('.sh-carousel .sh-weather')).boundingBox();
                await page.mouse.move(rect.x + rect.width * 0.7, rect.y + 70);
                await page.mouse.down();
                await page.mouse.move(rect.x + rect.width * 0.3, rect.y + 70, { steps: 8 });
                await page.mouse.up();
                await activeCard(page, 2);
                await page.focus('.sh-carousel [aria-label="Previous card"]');
                await page.keyboard.press('Enter');
                await activeCard(page, 1);
                await page.hover('.sh-carousel [aria-label="Next card"]');
            }

            const appearance = await page.$$eval('.sh-carousel__control', elements =>
                elements.map(element => ({
                    background: getComputedStyle(element).backgroundColor,
                    shadow: getComputedStyle(element).boxShadow,
                    tap: getComputedStyle(element).webkitTapHighlightColor,
                })),
            );
            for (const control of appearance) {
                assert.equal(control.background, 'rgba(0, 0, 0, 0)');
                assert.equal(control.shadow, 'none');
                assert.equal(control.tap, 'rgba(0, 0, 0, 0)');
            }
            const dots = await page.$$eval('.sh-carousel__dot span', elements =>
                elements.map(element => [element.offsetWidth, element.offsetHeight]),
            );
            assert.deepEqual(dots, [
                [8, 8],
                [6, 6],
                [6, 6],
            ]);
            assert.deepEqual(errors, []);
            console.log(`${mobile ? 'Mobile touch' : 'Desktop mouse/keyboard'} carousel checks passed`);
            await page.close();
        }
    } finally {
        await browser.close();
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
