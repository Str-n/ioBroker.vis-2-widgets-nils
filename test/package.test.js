const path = require('path');
const fs = require('fs');
const { tests } = require('@iobroker/testing');

// Validate the package files
tests.packageFiles(path.join(__dirname, '..'));

const thermostatSource = fs.readFileSync(path.join(__dirname, '../src-widgets/src/Thermostat.tsx'), 'utf8');
const viteConfig = fs.readFileSync(path.join(__dirname, '../src-widgets/vite.config.ts'), 'utf8');
const ioPackage = fs.readFileSync(path.join(__dirname, '../io-package.json'), 'utf8');

describe('compact thermostat widget', () => {
    it('should provide a compact thermostat widget template and palette entry', () => {
        if (!thermostatSource.includes('tplMaterial2ThermostatCompact')) {
            throw new Error('Compact thermostat template is missing');
        }
        if (!viteConfig.includes('./ThermostatCompact')) {
            throw new Error('Compact thermostat widget is not exposed for module federation');
        }
        if (!ioPackage.includes('"ThermostatCompact"')) {
            throw new Error('Compact thermostat is not registered in the widget palette');
        }
    });
});
