const assert = require('node:assert/strict');
const fs = require('node:fs');
const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'], pipe: true });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => {
            errors.push(error.message);
            console.error('Browser:', error.message);
        });
        await page.setViewport({ width: 900, height: 1000, deviceScaleFactor: 1 });
        await page.goto(process.env.BLINDCONTROL_PREVIEW_URL || 'http://127.0.0.1:4175/test-dashboard.html', {
            waitUntil: 'networkidle0',
        });
        await page.evaluate(async () => {
            const React = (
                await import(performance.getEntriesByType('resource').find(r => r.name.includes('/react.js?')).name)
            ).default;
            const { createRoot } = (
                await import(
                    performance.getEntriesByType('resource').find(r => r.name.includes('/react-dom_client.js?')).name
                )
            ).default;
            const Dialog = (await import('/src/Components/DialogBlinds.tsx')).default;
            const Base = (await import('/src/Components/BlindsBase.tsx')).default;
            // Use the host widget's translator; do not seed a separate global I18n dictionary.
            window.blindWrites = [];
            window.blindSubscriptions = new Map();
            window.blindValues = {
                'blindcontrol.0.windows.one.enabled': true,
                'blindcontrol.0.windows.one.autoOpenMorning': false,
                'blindcontrol.0.windows.two.autoOpenMorning': false,
                'blindcontrol.0.windows.two.enabled': false,
            };
            window.blindFail = false;
            window.blindAck = true;
            const socket = {
                getState: async id => ({ val: window.blindValues[id], ack: true, ts: Date.now() }),
                subscribeState: async (id, callback) => {
                    if (!window.blindSubscriptions.has(id)) window.blindSubscriptions.set(id, new Set());
                    window.blindSubscriptions.get(id).add(callback);
                },
                unsubscribeState: (id, callback) => window.blindSubscriptions.get(id)?.delete(callback),
                setState: async (id, value) => {
                    if (window.blindFail) throw new Error('write denied');
                    window.blindWrites.push([id, value]);
                    if (window.blindAck) {
                        window.blindValues[id] = value.val;
                        window.blindSubscriptions
                            .get(id)
                            ?.forEach(cb => cb(id, { ...value, ack: true, ts: Date.now() }));
                    }
                },
            };
            const host = document.createElement('div');
            document.body.append(host);
            const root = createRoot(host);
            window.mountBlind = id =>
                root.render(
                    React.createElement(Dialog, {
                        key: id || 'none',
                        startValue: 50,
                        type: 2,
                        onValueChange: value => window.blindWrites.push(['position', value]),
                        onClose: () => root.render(null),
                        onStop: () => window.blindWrites.push(['stop', true]),
                        automation: { enabledOid: id, socket },
                    }),
                );
            window.emitBlind = (id, val) => {
                window.blindValues[id] = val;
                window.blindSubscriptions.get(id)?.forEach(cb => cb(id, { val, ack: true, ts: Date.now() }));
            };
            // Verify shared and separate sash mappings at the actual dialog call site.
            const fake = {
                state: {
                    showBlindsDialog: 2,
                    rxData: { blindControlEnabled_oid: 'main', slideBlindControlEnabled_oid2: 'sash2', timeout: 0 },
                },
                props: { context: { socket } },
                getMinMaxPosition: () => ({ customOid: true, shutterPos: 50 }),
            };
            if (Base.prototype.renderBlindsDialog.call(fake).props.automation.enabledOid !== 'sash2')
                throw new Error('Wrong sash mapping');
            fake.getMinMaxPosition = () => ({ customOid: false, shutterPos: 50 });
            if (Base.prototype.renderBlindsDialog.call(fake).props.automation.enabledOid !== 'main')
                throw new Error('Wrong shared mapping');
            window.mountBlind('blindcontrol.0.windows.one.enabled');
        });
        const settings = '[aria-label="Blind automation settings"]';
        const toggle = 'input[aria-label="Automatic sun and heat protection"]';
        const morning = 'input[aria-label="Open automatically in the morning"]';
        await page.waitForSelector(settings);
        assert.equal(await page.$(toggle), null, 'settings start hidden');
        await page.click(settings);
        await page.waitForSelector(toggle);
        await page.waitForSelector('.MuiCollapse-entered');
        const settingsText = await page.$eval('.MuiDialog-paper', el => el.textContent);
        assert(settingsText.includes('Enable or disable automatic control for this window.'));
        assert(
            settingsText.includes(
                'Open this window at the configured morning time, subject to heat protection. Vacation mode overrides this setting.',
            ),
        );
        assert(!settingsText.includes('vis_2_widgets_nils_'), 'settings must show translated text');
        await page.waitForFunction(
            sel => document.querySelector(sel).checked && !document.querySelector(sel).disabled,
            {},
            toggle,
        );
        await page.click(toggle);
        await page.waitForFunction(
            sel => !document.querySelector(sel).checked && !document.querySelector(sel).disabled,
            {},
            toggle,
        );
        assert.deepEqual(await page.evaluate(() => window.blindWrites[0]), [
            'blindcontrol.0.windows.one.enabled',
            { val: false, ack: false },
        ]);
        await page.waitForFunction(
            sel => !document.querySelector(sel).checked && !document.querySelector(sel).disabled,
            {},
            morning,
        );
        await page.click(morning);
        await page.waitForFunction(
            sel => document.querySelector(sel).checked && !document.querySelector(sel).disabled,
            {},
            morning,
        );
        assert.deepEqual(await page.evaluate(() => window.blindWrites.at(-1)), [
            'blindcontrol.0.windows.one.autoOpenMorning',
            { val: true, ack: false },
        ]);
        assert.equal(await page.$eval(toggle, el => el.checked), false, 'morning setting does not enable automation');
        await page.evaluate(() => {
            window.blindFail = true;
        });
        await page.click(morning);
        await page.waitForSelector('[role="alert"]');
        assert.equal(await page.$eval(morning, el => el.checked), true, 'failed morning write retains value');
        await page.evaluate(() => {
            window.blindFail = false;
            window.emitBlind('blindcontrol.0.windows.one.autoOpenMorning', false);
        });
        await page.waitForFunction(sel => !document.querySelector(sel).checked, {}, morning);
        await page.click(morning);
        await page.waitForFunction(sel => document.querySelector(sel).checked, {}, morning);
        await page.evaluate(() => window.emitBlind('blindcontrol.0.windows.one.enabled', true));
        await page.waitForFunction(sel => document.querySelector(sel).checked, {}, toggle);
        await page.evaluate(() => {
            window.blindFail = true;
        });
        await page.click(toggle);
        await page.waitForSelector('[role="alert"]');
        assert.equal(await page.$eval(toggle, el => el.checked), true, 'failed write retains confirmed value');
        await page.evaluate(() => {
            window.blindFail = false;
            window.blindAck = false;
        });
        await page.click(toggle);
        await page.waitForFunction(sel => document.querySelector(sel).disabled, {}, toggle);
        assert.equal(await page.$eval(toggle, el => el.checked), true, 'pending write waits for ack');
        await page.evaluate(() => window.emitBlind('blindcontrol.0.windows.one.enabled', false));
        await page.waitForFunction(
            sel => !document.querySelector(sel).checked && !document.querySelector(sel).disabled,
            {},
            toggle,
        );
        await page.click('.MuiDialogTitle-root button:last-of-type');
        await page.waitForSelector(settings, { hidden: true });
        assert.equal(
            await page.evaluate(() => window.blindSubscriptions.get('blindcontrol.0.windows.one.enabled').size),
            0,
        );
        assert.equal(
            await page.evaluate(() => window.blindSubscriptions.get('blindcontrol.0.windows.one.autoOpenMorning').size),
            0,
        );
        await page.evaluate(() => window.mountBlind('blindcontrol.0.windows.one.enabled'));
        await page.waitForSelector(settings);
        await page.click(settings);
        await page.waitForSelector(toggle);
        await page.waitForSelector('.MuiCollapse-entered');
        await page.waitForFunction(
            sel => !document.querySelector(sel).checked && !document.querySelector(sel).disabled,
            {},
            toggle,
        );
        await page.waitForFunction(sel => document.querySelector(sel).checked, {}, morning);
        await page.evaluate(() => window.mountBlind('blindcontrol.0.windows.two.enabled'));
        await page.waitForFunction(
            sel => document.querySelector(sel)?.getAttribute('aria-expanded') === 'false',
            {},
            settings,
        );
        await page.click(settings);
        await page.waitForSelector(toggle);
        await page.waitForSelector('.MuiCollapse-entered');
        assert.equal(await page.$eval(toggle, el => el.checked), false);
        assert.equal(await page.$eval(morning, el => el.checked), false, 'morning setting is per window');
        await page.setViewport({ width: 360, height: 780 });
        fs.mkdirSync('/tmp/blindcontrol-review', { recursive: true });
        await page.screenshot({ path: '/tmp/blindcontrol-review/settings-mobile.png' });
        assert(await page.$eval('.MuiDialog-paper', el => el.getBoundingClientRect().width <= 360));
        await page.evaluate(() => window.mountBlind(undefined));
        await page.waitForFunction(
            sel => document.querySelector(sel)?.getAttribute('aria-expanded') === 'false',
            {},
            settings,
        );
        await page.click(settings);
        await page.waitForFunction(() => document.body.textContent.includes('Select this window'));
        assert.equal(await page.$(toggle), null);
        assert.deepEqual(errors, []);
        console.log(
            'Blind settings: hidden panel, per-window mapping, acknowledged toggle, external updates, failed/pending writes, remount, cleanup and mobile layout passed.',
        );
    } finally {
        await browser.close();
    }
})().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
