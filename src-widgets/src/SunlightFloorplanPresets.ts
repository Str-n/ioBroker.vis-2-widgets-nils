import eg from '../public/floorplans/eg.json';
import og from '../public/floorplans/og.json';
import dg from '../public/floorplans/dg.json';
import basement from '../public/floorplans/basement.json';
import egSvg from '../public/floorplans/eg.svg?raw';
import ogSvg from '../public/floorplans/og.svg?raw';
import dgSvg from '../public/floorplans/dg.svg?raw';
import basementSvg from '../public/floorplans/basement.svg?raw';
import { parseFloorplanDrawing, type FloorplanDefinition } from './SunlightFloorplanDrawing';

// Existing floor IDs and coordinate systems deliberately stay stable.
export const floorplans: Record<string, FloorplanDefinition> = {
    eg: { label: 'EG', drawing: parseFloorplanDrawing(eg)! },
    og: { label: 'OG', drawing: parseFloorplanDrawing(og)! },
    dg: { label: 'DG', drawing: parseFloorplanDrawing(dg)! },
    basement: { label: 'Basement', drawing: parseFloorplanDrawing(basement)! },
    custom: { label: 'Custom', drawing: { version: 1, viewBox: [0, 0, 756, 699], walls: [] } },
    'eg-svg': { label: 'EG (legacy SVG)', svg: egSvg, configurationKey: 'eg' },
    'og-svg': { label: 'OG (legacy SVG)', svg: ogSvg, configurationKey: 'og' },
    'dg-svg': { label: 'DG (legacy SVG)', svg: dgSvg, configurationKey: 'dg' },
    'basement-svg': { label: 'Basement (legacy SVG)', svg: basementSvg, configurationKey: 'basement' },
};
