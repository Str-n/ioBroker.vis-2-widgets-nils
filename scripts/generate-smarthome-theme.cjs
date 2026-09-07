const fs = require('node:fs');
const path = require('node:path');
const { createTheme } = require('../src-widgets/node_modules/@mui/material/styles');

const publicDir = path.resolve(__dirname, '../src-widgets/public');
const preset = JSON.parse(fs.readFileSync(path.join(publicDir, 'themes/ocean.json'), 'utf8'));
const theme = createTheme({ ...preset, cssVariables: true });
const p = theme.palette;
const s = theme.smartHome;
const tokens = {
    bg: p.background.default,
    surface: p.background.paper,
    'surface-2': s.surfaceRaised,
    floor: p.background.default,
    wall: s.wall,
    primary: p.primary.main,
    'primary-contrast': p.primary.contrastText,
    secondary: p.secondary.main,
    info: p.info.main,
    success: p.success.main,
    warning: p.warning.main,
    error: p.error.main,
    text: p.text.primary,
    'text-secondary': p.text.secondary,
    divider: p.divider,
    'control-off': p.text.disabled,
    'control-on': s.lightOn,
    focus: p.secondary.light,
    'radius-card': s.radiusCard,
    'radius-control': s.radiusControl,
    'radius-chip': s.radiusChip,
    'shadow-control': s.shadowControl,
    'shadow-card': s.shadowCard,
    'shadow-badge': s.shadowBadge,
};
const banner = '/* Generated from themes/ocean.json by npm run theme:generate. Do not edit. */\n';
const declarations = Object.entries(tokens)
    .map(([key, value]) => `    --sh-${key}: ${value};`)
    .join('\n');
const tokenCss = `${banner}/* Defaults live only at the document root. Widget classes inherit them. */\n:where(:root) {\n${declarations}\n}\n`;

// Ask MUI to generate every palette value, including channels and component colors.
// This compatibility sheet changes CSS only; it cannot replace the host's JS theme.
const variables = Object.assign({}, ...theme.generateStyleSheets().map(sheet => sheet[':root'] || {}));
const paletteCss = Object.entries(variables)
    .filter(([key]) => key.startsWith('--mui-palette-'))
    .map(([key, value]) => `    ${key}: ${value};`)
    .join('\n');
const aliases = {
    '--color-bg': 'var(--sh-bg)',
    '--color-bg-widget': 'var(--sh-bg)',
    '--color-secondary': 'var(--sh-secondary)',
    '--color-third': 'var(--sh-focus)',
    '--color-text-light': 'var(--sh-text)',
    '--color-text-dark': 'var(--mui-palette-secondary-contrastText)',
    '--color-border': 'var(--sh-surface)',
    '--color-shadow': s.legacyShadowColor,
    '--color-success': 'var(--sh-success)',
    '--color-warning': 'var(--sh-warning)',
    '--color-error': 'var(--sh-error)',
    '--light-on': 'var(--sh-control-on)',
    '--light-off': 'var(--sh-control-off)',
    '--mui-palette-primary-main-hover': 'var(--mui-palette-primary-light)',
};
const aliasCss = Object.entries(aliases)
    .map(([key, value]) => `    ${key}: ${value};`)
    .join('\n');
const projectCss = `${banner}/* Explicit project-wide compatibility opt-in; includes the editor's MUI CSS. */\n@import url('./smarthome.css');\n\n:root {\n${paletteCss}\n${aliasCss}\n}\n`;

const outputs = { 'smarthome-tokens.css': tokenCss, 'smarthome-project.css': projectCss };
for (const [name, contents] of Object.entries(outputs)) {
    const file = path.join(publicDir, name);
    if (process.argv.includes('--check')) {
        if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== contents) {
            throw new Error(`${name} is out of date. Run npm run theme:generate.`);
        }
    } else {
        fs.writeFileSync(file, contents);
    }
}
console.log(process.argv.includes('--check') ? 'Theme CSS matches ocean.json.' : 'Generated Ocean theme CSS.');
