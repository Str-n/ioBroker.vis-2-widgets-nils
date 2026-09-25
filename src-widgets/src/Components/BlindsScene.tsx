import React from 'react';

const svgLayerStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
};

// Geometry follows the original 1024 x 1536 illustration.
const openingPath =
    'M260 156H758A104 104 0 0 1 862 260V985A104 104 0 0 1 758 1089H260A104 104 0 0 1 156 985V260A104 104 0 0 1 260 156Z';
const outerFramePath =
    'M248 94H772A148 148 0 0 1 920 242V1000A148 148 0 0 1 772 1148H248A148 148 0 0 1 100 1000V242A148 148 0 0 1 248 94Z';
const innerFramePath =
    'M256 136H764A116 116 0 0 1 880 252V992A120 120 0 0 1 760 1112H256A120 120 0 0 1 136 992V256A120 120 0 0 1 256 136Z';

/** The landscape sits behind the interactive blind. */
export function BlindSceneBackdrop(): React.JSX.Element {
    const id = React.useId().replace(/:/g, '');
    const glassGradientId = `${id}-glass`;
    const windowClipId = `${id}-window`;

    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 1024 1536"
            preserveAspectRatio="xMidYMin slice"
            style={{ ...svgLayerStyle, zIndex: 0 }}
        >
            <defs>
                <linearGradient
                    id={glassGradientId}
                    x1="0"
                    x2="0"
                    y1="0"
                    y2="1"
                >
                    <stop
                        offset="0%"
                        stopColor="var(--sh-blind-scene-glass-top, #B2DEDF)"
                    />
                    <stop
                        offset="78%"
                        stopColor="var(--sh-blind-scene-glass-bottom, #FAE2B2)"
                    />
                    <stop
                        offset="100%"
                        stopColor="var(--sh-blind-scene-glass-bottom, #FAE2B2)"
                    />
                </linearGradient>
                <clipPath id={windowClipId}>
                    <path d={openingPath} />
                </clipPath>
                <filter
                    id={`${id}-texture`}
                    x="0"
                    y="0"
                    width="100%"
                    height="100%"
                >
                    <feTurbulence
                        type="fractalNoise"
                        baseFrequency="0.82"
                        numOctaves="2"
                        seed="8"
                    />
                    <feColorMatrix
                        type="saturate"
                        values="0"
                    />
                    <feComponentTransfer>
                        <feFuncA
                            type="table"
                            tableValues="0 0.12"
                        />
                    </feComponentTransfer>
                </filter>
            </defs>

            <rect
                width="1024"
                height="1536"
                fill="var(--sh-blind-scene-background, #487593)"
            />
            <g clipPath={`url(#${windowClipId})`}>
                <rect
                    x="156"
                    y="156"
                    width="706"
                    height="933"
                    fill={`url(#${glassGradientId})`}
                />
                <circle
                    cx="305"
                    cy="317"
                    r="68"
                    fill="var(--sh-blind-scene-sun, #FAE2B2)"
                />
                <path
                    d="M156 606C216 605 274 631 323 676c43 40 91 51 145 66 20 6 37 15 52 27 48 28 90 57 151 30 68-30 129-80 191-83v373H156Z"
                    fill="var(--sh-blind-scene-hill, #78C3D1)"
                />
                <path
                    d="M156 741c74-4 122 36 181 78 55 40 103 47 167 43 35-2 64-10 96-20v247H156Z"
                    fill="var(--sh-blind-scene-hill-deep, #3897B0)"
                />
            </g>
            <rect
                width="1024"
                height="1536"
                fill="white"
                opacity="0.28"
                filter={`url(#${id}-texture)`}
            />
        </svg>
    );
}

export function BlindSceneForeground(): React.JSX.Element {
    const id = React.useId().replace(/:/g, '');
    const openingClipId = `${id}-opening`;
    const frameShadeId = `${id}-frame-shade`;
    const personShadeId = `${id}-person-shade`;

    return (
        <svg
            aria-hidden="true"
            viewBox="0 0 1024 1536"
            preserveAspectRatio="xMidYMin slice"
            style={{ ...svgLayerStyle, zIndex: 2 }}
        >
            <defs>
                <clipPath id={openingClipId}>
                    <path d={openingPath} />
                </clipPath>
                <linearGradient
                    id={frameShadeId}
                    x1="0"
                    x2="1"
                    y1="0"
                    y2="1"
                >
                    <stop
                        offset="0%"
                        stopColor="white"
                        stopOpacity="0.025"
                    />
                    <stop
                        offset="48%"
                        stopColor="black"
                        stopOpacity="0.10"
                    />
                    <stop
                        offset="100%"
                        stopColor="white"
                        stopOpacity="0.045"
                    />
                </linearGradient>
                <linearGradient
                    id={personShadeId}
                    x1="0"
                    x2="1"
                    y1="0"
                    y2="1"
                >
                    <stop
                        offset="0%"
                        stopColor="black"
                        stopOpacity="0.05"
                    />
                    <stop
                        offset="100%"
                        stopColor="white"
                        stopOpacity="0.025"
                    />
                </linearGradient>
            </defs>

            {/* Cover the blind outside the glass while keeping the opening transparent. */}
            <path
                d={`M0 0H1024V1536H0Z ${openingPath}`}
                fill="var(--sh-blind-scene-background, #487593)"
                fillRule="evenodd"
            />
            <path
                d={`${outerFramePath} ${openingPath}`}
                fill="var(--sh-blind-scene-frame, #1D425B)"
                fillRule="evenodd"
            />
            <path
                d={`${outerFramePath} ${openingPath}`}
                fill={`url(#${frameShadeId})`}
                fillRule="evenodd"
            />
            <path
                d={`${innerFramePath} ${openingPath}`}
                fill="var(--sh-blind-scene-frame-inner, #0D293D)"
                fillRule="evenodd"
            />

            <g
                clipPath={`url(#${openingClipId})`}
                fill="var(--sh-blind-scene-frame-inner, #0D293D)"
            >
                <rect
                    x="495"
                    y="156"
                    width="26"
                    height="933"
                />
                <rect
                    x="156"
                    y="455"
                    width="706"
                    height="25"
                />
            </g>

            <path
                id={`${id}-person`}
                d="M431 1536C420 1477 415 1419 414 1364c-11-26-10-89-8-134 3-95 13-192 26-279 8-49 22-77 47-90 26-14 68-31 104-51 12-7 11-23 9-29-20-17-31-38-32-68-2-20-1-38 1-53-7-25 4-51 16-68 17-22 43-33 75-34 55-3 96 35 97 88 2 39-16 67-34 100-8 15-10 31-7 48 4 20 18 29 43 43 42 23 73 37 91 66 17 27 20 66 23 112 6 88 9 159-13 216-13 36-32 67-55 94v244H431Z"
                fill="var(--sh-blind-scene-person, #0D293D)"
            />
            <use
                href={`#${id}-person`}
                fill={`url(#${personShadeId})`}
            />
            <path
                d="M522 1021c-4 122-14 219-53 321M807 1018c-1 83-7 170-14 251"
                fill="none"
                stroke="var(--sh-blind-scene-frame-inner, #0D293D)"
                strokeOpacity="0.55"
                strokeWidth="2"
            />
        </svg>
    );
}
