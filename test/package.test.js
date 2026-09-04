const path = require('path');
const fs = require('fs');
const { tests } = require('@iobroker/testing');

// Validate the package files
tests.packageFiles(path.join(__dirname, '..'));

const thermostatCompactSource = fs.readFileSync(
    path.join(__dirname, '../src-widgets/src/ThermostatCompact.tsx'),
    'utf8',
);
const viteConfig = fs.readFileSync(path.join(__dirname, '../src-widgets/vite.config.ts'), 'utf8');
const ioPackage = fs.readFileSync(path.join(__dirname, '../io-package.json'), 'utf8');
const energyGameSource = fs.readFileSync(path.join(__dirname, '../src-widgets/src/EnergyGame.tsx'), 'utf8');

describe('compact thermostat widget', () => {
    it('should provide a compact thermostat widget template and palette entry', () => {
        if (!thermostatCompactSource.includes('tplNils2ThermostatCompact')) {
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

describe('energy game widget', () => {
    it('should be registered in the palette and exposed for module federation', () => {
        const ioPackageJson = JSON.parse(ioPackage);
        const components = ioPackageJson.common.visWidgets.vis2nilsForkWidgets.components;

        if (!components.includes('EnergyGame')) {
            throw new Error('EnergyGame is missing from the widget palette registration');
        }
        if (!viteConfig.includes("'./EnergyGame': './src/EnergyGame'")) {
            throw new Error('EnergyGame widget is not exposed for module federation');
        }
        if (!energyGameSource.includes("id: 'tplNils2EnergyGame'")) {
            throw new Error('EnergyGame template ID is missing');
        }
    });
});
