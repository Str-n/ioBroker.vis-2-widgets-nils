import ocean from '../../public/themes/ocean.json';
import daytime from '../../public/themes/daytime.json';
import midnight from '../../public/themes/midnight.json';
import plum from '../../public/themes/plum.json';
import happymode from '../../public/themes/happymode.json';
import graphite from '../../public/themes/graphite.json';

export const themePresets = { ocean, daytime, midnight, plum, happymode, graphite };
export type SmartHomeThemeId = keyof typeof themePresets;
export const themeNames: Record<SmartHomeThemeId, string> = {
    ocean: 'Ocean',
    daytime: 'Daytime',
    midnight: 'Midnight',
    plum: 'Plum',
    happymode: 'Happy Mode',
    graphite: 'Graphite',
};

export function isSmartHomeThemeId(value: unknown): value is SmartHomeThemeId {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(themePresets, value);
}
