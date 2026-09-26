const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const filename = path.resolve(__dirname, '../src-widgets/src/EnergyConsumptionUtils.ts');
const loaded = new Module(filename, module);
loaded._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const { energyFlow, powerReading } = loaded.exports;

describe('Energy consumption power balance', () => {
    it('adds grid import and solar production and computes their share', () => {
        const flow = energyFlow(620, 1200);
        assert.equal(flow.home, 1820);
        assert.equal(flow.solarShare, 1200 / 1820);
        assert.equal(flow.inconsistent, false);
    });
    it('subtracts exported solar and caps household solar coverage at 100%', () => {
        const flow = energyFlow(-850, 2400);
        assert.equal(flow.home, 1550);
        assert.equal(flow.grid, -850);
        assert.equal(flow.solarShare, 1);
    });
    it('handles nighttime, zero consumption and exporting all solar', () => {
        assert.equal(energyFlow(480, 0).solarShare, 0);
        assert.equal(energyFlow(0, 0).home, 0);
        assert.equal(energyFlow(0, 0).solarShare, undefined);
        assert.equal(energyFlow(-500, 500).home, 0);
        assert.equal(energyFlow(-500, 500).solarShare, undefined);
    });
    it('converts independent kW inputs and reverses the configured grid sign', () => {
        assert.equal(energyFlow('0.62', '1200', 'kW', 'W').home, 1820);
        assert.equal(energyFlow('850', '2.4', 'W', 'kW', true).home, 1550);
    });
    it('preserves valid readings without inventing a total for missing data', () => {
        for (const invalid of [null, undefined, '', ' ', true, false, 'offline', NaN, Infinity, {}, []]) {
            assert.equal(energyFlow(invalid, 1200).home, undefined);
            assert.equal(energyFlow(invalid, 1200).solar, 1200);
            assert.equal(energyFlow(620, invalid).home, undefined);
            assert.equal(energyFlow(620, invalid).grid, 620);
        }
        assert.equal(energyFlow(620, -1).solar, undefined);
    });
    it('rejects impossible balances and numeric overflow', () => {
        assert.equal(energyFlow(-1500, 1200).inconsistent, true);
        assert.equal(energyFlow(-1500, 1200).home, undefined);
        assert.equal(energyFlow(1e308, 1e308).inconsistent, true);
        assert.equal(energyFlow(1e308, 0, 'kW').home, undefined);
    });
    it('formats watt/kilowatt magnitudes while preserving missing and zero values', () => {
        assert.deepEqual(powerReading(undefined), { unit: 'W', digits: 0 });
        assert.deepEqual(powerReading(0), { value: 0, unit: 'W', digits: 0 });
        assert.deepEqual(powerReading(-850), { value: 850, unit: 'W', digits: 0 });
        assert.deepEqual(powerReading(1820), { value: 1.82, unit: 'kW', digits: 2 });
        assert.equal(powerReading(999.5).unit, 'kW');
        assert.equal(powerReading(10000).digits, 1);
    });
});
