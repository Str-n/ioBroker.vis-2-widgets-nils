const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Exercise the actual TypeScript geometry without needing the vis runtime or a browser.
const modules = new Map();
function loadSource(name) {
    const filename = path.resolve(__dirname, '../src-widgets/src', `${name}.ts`);
    if (modules.has(filename)) return modules.get(filename).exports;
    const loaded = new Module(filename, module);
    modules.set(filename, loaded);
    loaded.require = request => (request.startsWith('./') ? loadSource(request.slice(2)) : require(request));
    loaded._compile(
        ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
            compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        }).outputText,
        filename,
    );
    return loaded.exports;
}
const utils = loadSource('SunlightUtils');
const { parseFloorplanGeometries } = loadSource('SunlightFloorplanConfig');
const room = [
    [0, 0],
    [200, 0],
    [200, 200],
    [0, 200],
];
const window = {
    startX: 50,
    startY: 0,
    endX: 150,
    endY: 0,
    azimuth: 0,
    roomPolygon: room,
    blindStateConfigured: false,
    blindMin: 0,
    blindMax: 100,
    blindInvert: false,
    windowHeightMeters: 1.35,
    windowSillHeightMeters: 0.9,
    roomHeightMeters: 2.5,
};
const beam = (overrides = {}, azimuth = 0, elevation = 45, cap = 650) =>
    utils.calculateSunlightBeam({ ...window, ...overrides }, azimuth, elevation, 0, 1, 1, 50, cap);

describe('SunlightFloorplan light model', () => {
    it('projects from the sill and exposed window top, in the direction away from the sun', () => {
        const result = beam();
        assert(Math.abs(result.points[0][1] - 45) < 1e-6);
        assert(Math.abs(result.points[2][1] - 112.5) < 1e-6);
        assert.equal(result.points[0][0], 50);
        const half = beam({ blindStateConfigured: true, blindValue: 50 });
        assert.equal(half.points[0][1], result.points[0][1]);
        assert(Math.abs(half.points[2][1] - 78.75) < 1e-6);
    });
    it('has no direct patch at night, at zenith, behind the window, or with closed blinds', () => {
        assert.equal(beam({}, 0, -1), undefined);
        assert.equal(beam({}, 0, 90), undefined);
        assert.equal(beam({}, 180), undefined);
        assert.equal(beam({ blindStateConfigured: true, blindValue: 0 }), undefined);
        assert.equal(beam({ blindStateConfigured: true, blindValue: undefined }), undefined);
        assert.equal(beam({ blindStateConfigured: true, blindValue: 'invalid' }), undefined);
    });
    it('normalizes inverted blind ranges and wrapped compass bearings', () => {
        assert.equal(utils.normalizeBlindOpenFactor(25, 0, 100, true), 0.75);
        assert.equal(utils.smallestAngularDifference(-1080, 10), -10);
        assert.equal(beam({}, -1080).strength, beam().strength);
    });
    it('retains a wall reflection when low sun projects beyond the drawing limit', () => {
        const result = beam({}, 0, 1);
        assert(result.wallReflection);
        assert.equal(result.wallReflection.fraction, 1);
        assert(Math.abs(result.wallReflection.point[1] - 200) < 1e-6);
        assert.equal(utils.polygonArea(result.floorPoints), 0);
    });
    it('stops light at the first wall in a concave room', () => {
        const concave = [
            [0, 0],
            [200, 0],
            [200, 200],
            [0, 200],
            [0, 150],
            [150, 150],
            [150, 80],
            [0, 80],
        ];
        const result = beam({ startX: 50, endX: 100, roomPolygon: concave, windowSillHeightMeters: 0 }, 0, 30);
        assert(result.floorPoints.every(point => point[1] <= 80 + 1e-6));
        assert(result.wallReflection);
    });
    it('keeps sash apertures disjoint and preserves their total glazed width', () => {
        const sashes = utils.splitWindowIntoSashes(window, 3, 2);
        assert.equal(sashes.length, 3);
        assert(Math.abs(sashes.reduce((sum, sash) => sum + sash.endX - sash.startX, 0) - 96) < 1e-6);
        assert(sashes[0].endX < sashes[1].startX);
    });
    it('returns finite weather factors at small references and ignores unselected sources', () => {
        for (const reference of [1, 8, 1000]) {
            assert.equal(utils.weatherSunFactorFromRadiation(reference, reference), 1);
            assert.equal(utils.weatherSunFactorFromRadiation(0, reference), 0);
        }
        assert.equal(
            utils.calculateSunlightFactors(undefined, undefined, undefined, false, 600, 1000, 'cloudiness').total,
            0,
        );
        const overcast = utils.calculateSunlightFactors(undefined, 100, undefined, false, 600, 1000, 'radiation');
        assert.equal(overcast.direct, 0);
        assert(overcast.diffuse > 0);
        assert.equal(utils.calculateSunlightFactors(undefined, 0, undefined, false, 0, 1000, 'radiation').total, 0);
    });
    it('rejects non-finite inputs instead of producing invalid SVG numbers', () => {
        assert.equal(beam({ startX: NaN }), undefined);
        assert.equal(beam({}, 0, 40, NaN), undefined);
        assert.equal(beam({ blindStateConfigured: true, blindMin: 100, blindMax: 100, blindValue: 100 }), undefined);
        for (const value of [null, undefined, '', '  ', true, [], Infinity]) {
            assert.equal(utils.numericStateValue(value), undefined);
        }
        assert.equal(utils.numericStateValue(' 25.5 '), 25.5);
    });
});

describe('SunlightFloorplan geometry and editor helpers', () => {
    it('infers the same wall bearing regardless of polygon winding', () => {
        for (const polygon of [room, [...room].reverse()]) {
            assert.equal(utils.inferWindowAzimuthFromRoomBoundary(100, 0, 80, 0, polygon, 163), 163);
            assert.equal(utils.inferWindowAzimuthFromRoomBoundary(100, 100, 80, 0, polygon, 0), undefined);
            assert.equal(utils.inferWindowAzimuthFromRoomBoundary(100, 0, 400, 0, polygon, 0), undefined);
        }
    });
    it('rejects crossing, collapsed and malformed rooms', () => {
        assert.equal(
            utils.isValidRoomPolygon([
                [0, 0],
                [10, 10],
                [0, 10],
                [10, 0],
            ]),
            false,
        );
        assert.equal(
            utils.isValidRoomPolygon([
                [0, 0],
                [10, 0],
                [20, 0],
            ]),
            false,
        );
        assert.equal(utils.isValidRoomPolygon([...room, room[0]]), false);
        assert.equal(utils.isValidRoomPolygon(room), true);
    });
    it('snaps near a wall and finds an interior light position for a concave room', () => {
        assert.deepEqual(utils.snapPointToRoomBoundary([70, 4], room, 10), [70, 0]);
        assert.deepEqual(utils.snapPointToRoomBoundary([70, 40], room, 10), [70, 40]);
        const concave = [
            [0, 0],
            [200, 0],
            [200, 50],
            [50, 50],
            [50, 200],
            [0, 200],
        ];
        assert(utils.isPointInPolygon(utils.roomInteriorPoint(concave), concave));
    });
    it('preserves room references when invalid rooms are removed', () => {
        const parsed = parseFloorplanGeometries({
            eg: {
                rooms: [{ points: [] }, { points: room }],
                windows: [{ roomIndex: 1 }, { roomIndex: 2 }, { roomIndex: 99 }],
                lightBubbles: [{ roomIndex: 2 }],
            },
        }).eg;
        assert.equal(parsed.rooms.length, 1);
        assert.equal(parsed.windows.length, 1);
        assert.equal(parsed.windows[0].roomIndex, 1);
        assert.equal(parsed.lightBubbles[0].roomIndex, 1);
    });
    it('does not turn null coordinates into valid room corners', () => {
        const parsed = parseFloorplanGeometries({
            eg: {
                rooms: [
                    {
                        points: [
                            [null, 0],
                            [100, 0],
                            [0, 100],
                        ],
                    },
                ],
            },
        });
        assert.equal(parsed.eg.rooms.length, 0);
        assert.deepEqual(parseFloorplanGeometries('{'), {});
    });
});
