import React from 'react';

import {
    EVENT_DURATION_MS,
    SPARK_COUNT,
    formatScore,
    makeSparks,
    summarizeLightNames,
    type VisualEvent,
} from './EnergyGameUtils';

export interface EnergyGamePalette {
    mode: 'light' | 'dark';
    text: string;
    textSecondary: string;
    accent: string;
    gold: string;
}

export interface EnergyGameLabels {
    title: string;
    daily: string;
    overall: string;
    record: string;
    unit: string;
}

export interface EnergyGameViewProps {
    daily: number | null;
    overall: number | null;
    highScore: number | null;
    highScoreToday: boolean;
    recordBrokenAt: number | null;
    activeEvent: VisualEvent | null;
    labels: EnergyGameLabels;
    showTitle: boolean;
    animationsEnabled: boolean;
    reducedMotion: boolean;
    showLightNames: boolean;
    recordSparkles: boolean;
    compact: boolean;
    palette: EnergyGamePalette;
    lang: string;
    width: number;
    height: number;
    t: (key: string, ...args: (string | number)[]) => string;
}

const STYLE_ID = 'nils-energy-game-styles';
const CSS = `
.nils-eg{position:relative;width:100%;height:100%;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;box-sizing:border-box;user-select:none}
.nils-eg *{box-sizing:border-box}.nils-eg-num{font-variant-numeric:tabular-nums;line-height:1;white-space:nowrap}.nils-eg-label{text-transform:uppercase;letter-spacing:.16em;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.nils-eg-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;pointer-events:none}.nils-eg-centre{position:absolute;left:50%;top:50%;pointer-events:none}
@keyframes nils-eg-rise{0%{opacity:0;transform:translate3d(0,14px,0) scale(.8)}18%{opacity:1;transform:translate3d(0,-2px,0) scale(1.12)}72%{opacity:1;transform:translate3d(0,-10px,0) scale(1)}100%{opacity:0;transform:translate3d(0,-24px,0) scale(.96)}}
@keyframes nils-eg-fade{0%{opacity:0}14%{opacity:1}82%{opacity:1}100%{opacity:0}}@keyframes nils-eg-ring{0%{opacity:.8;transform:translate(-50%,-50%) scale(.5)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.8)}}
@keyframes nils-eg-spark{0%{opacity:0;transform:translate3d(0,0,0) scale(.3)}15%{opacity:1}100%{opacity:0;transform:translate3d(var(--dx),var(--dy),0) scale(1)}}@keyframes nils-eg-pop{30%{transform:scale(1.14)}100%{transform:scale(1)}}
@keyframes nils-eg-badge{0%{opacity:0;transform:translateY(-12px) scale(.7)}16%{opacity:1;transform:translateY(0) scale(1.08)}28%{transform:scale(1)}86%{opacity:1}100%{opacity:0}}@keyframes nils-eg-shine{0%{transform:translateX(-180%) skewX(-20deg)}100%{transform:translateX(280%) skewX(-20deg)}}
@keyframes nils-eg-breathe{0%,100%{opacity:.3}50%{opacity:.8}}@keyframes nils-eg-twinkle{0%,100%{opacity:0;transform:scale(.4) rotate(0)}50%{opacity:.9;transform:scale(1) rotate(45deg)}}
.nils-eg-rise{animation:nils-eg-rise var(--dur) cubic-bezier(.2,.8,.2,1) both}.nils-eg-fade{animation:nils-eg-fade var(--dur) ease-in-out both}.nils-eg-ring{animation:nils-eg-ring .9s ease-out both}.nils-eg-spark{animation:nils-eg-spark var(--sdur) ease-out both}.nils-eg-pop{animation:nils-eg-pop .6s ease-out both}.nils-eg-badge{animation:nils-eg-badge var(--dur) cubic-bezier(.2,.8,.2,1) both}.nils-eg-shine{animation:nils-eg-shine 1.4s ease-in-out .3s both}.nils-eg-breathe{animation:nils-eg-breathe 4s ease-in-out infinite}.nils-eg-twinkle{animation:nils-eg-twinkle var(--tdur) ease-in-out var(--tdelay) infinite}
@media(prefers-reduced-motion:reduce){.nils-eg-motion{animation:none!important;opacity:0!important}.nils-eg-breathe,.nils-eg-twinkle{animation:none!important}}
`;

export function ensureEnergyGameStyles(): void {
    if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) {
        return;
    }
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
const Bolt = ({ size, color }: { size: number; color: string }): React.JSX.Element => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
    >
        <path
            d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"
            fill={color}
        />
    </svg>
);
const Trophy = ({ size, color }: { size: number; color: string }): React.JSX.Element => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
    >
        <path
            d="M7 3h10v2h3v3a5 5 0 0 1-4.2 4.94A5 5 0 0 1 13 15.9V18h3v2H8v-2h3v-2.1A5 5 0 0 1 8.2 13 5 5 0 0 1 4 8V5h3V3zM6 7v1a3 3 0 0 0 1.6 2.65A7 7 0 0 1 7 8.5V7H6zm12 0h-1v1.5c0 .77-.2 1.5-.6 2.15A3 3 0 0 0 18 8V7z"
            fill={color}
        />
    </svg>
);
const Star = ({ size, color }: { size: number; color: string }): React.JSX.Element => (
    <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden="true"
    >
        <path
            d="M12 0l2.5 9.5L24 12l-9.5 2.5L12 24l-2.5-9.5L0 12l9.5-2.5z"
            fill={color}
        />
    </svg>
);

function RecordDecoration({ color, reducedMotion }: { color: string; reducedMotion: boolean }): React.JSX.Element {
    const points = [
        ['4%', '8%', '7s', '0s'],
        ['88%', '4%', '9s', '2.5s'],
        ['92%', '70%', '8s', '5s'],
        ['8%', '74%', '7.5s', '1.3s'],
    ];
    return (
        <>
            <span
                className={reducedMotion ? undefined : 'nils-eg-breathe'}
                aria-hidden="true"
                style={{
                    position: 'absolute',
                    inset: -2,
                    borderRadius: 12,
                    boxShadow: `0 0 0 1px ${color}66,0 0 14px ${color}55`,
                    opacity: reducedMotion ? 0.5 : undefined,
                }}
            />
            {!reducedMotion &&
                points.map(([left, top, duration, delay], index) => (
                    <span
                        key={index}
                        className="nils-eg-twinkle"
                        aria-hidden="true"
                        style={
                            {
                                position: 'absolute',
                                left,
                                top,
                                '--tdur': duration,
                                '--tdelay': delay,
                            } as React.CSSProperties
                        }
                    >
                        <Star
                            size={7}
                            color={color}
                        />
                    </span>
                ))}
        </>
    );
}

function EventOverlay({
    event,
    dailyText,
    props,
    base,
}: {
    event: VisualEvent;
    dailyText: string;
    props: EnergyGameViewProps;
    base: number;
}): React.JSX.Element {
    const duration = `${EVENT_DURATION_MS[event.kind]}ms`;
    const record = event.kind === 'NEW_RECORD';
    const combo = event.kind === 'COMBO';
    const color = record ? props.palette.gold : props.palette.accent;
    const size = clamp(base * (record ? 0.16 : combo ? 0.19 : 0.15), 26, 84);
    const lineSize = clamp(base * 0.04, 10, 16);
    const delta = event.delta === null ? '' : `+${event.delta}`;
    const names = props.showLightNames && !props.compact ? summarizeLightNames(event.lightNames) : '';
    const sparks = props.reducedMotion ? [] : makeSparks(SPARK_COUNT[event.kind], event.sequence, base * 0.42);
    const headline = record
        ? props.t('eg_new_record')
        : combo
          ? props.t('eg_energy_combo')
          : props.t('eg_energy_saved');
    const subline = record
        ? delta
            ? `${delta} ${props.t('eg_energy')}`
            : ''
        : combo
          ? names ||
            (event.lightCount || event.delta ? props.t('eg_lights_saved', event.lightCount || event.delta || 0) : '')
          : names;
    return (
        <div
            className="nils-eg-overlay"
            aria-hidden="true"
            style={{ '--dur': duration } as React.CSSProperties}
        >
            {record && (
                <span
                    className="nils-eg-fade"
                    style={{
                        position: 'absolute',
                        inset: 0,
                        background: props.palette.mode === 'dark' ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.72)',
                    }}
                />
            )}
            {!props.reducedMotion && (
                <>
                    <span
                        className="nils-eg-centre nils-eg-ring nils-eg-motion"
                        style={{
                            width: base * 0.5,
                            height: base * 0.5,
                            borderRadius: '50%',
                            border: `2px solid ${color}`,
                        }}
                    />
                    {(combo || record) && (
                        <span
                            className="nils-eg-centre nils-eg-ring nils-eg-motion"
                            style={{
                                width: base * 0.5,
                                height: base * 0.5,
                                borderRadius: '50%',
                                border: `1px solid ${color}`,
                                animationDelay: '.18s',
                            }}
                        />
                    )}
                    {sparks.map((spark, index) => (
                        <span
                            key={index}
                            className="nils-eg-centre nils-eg-spark nils-eg-motion"
                            style={
                                {
                                    width: spark.size,
                                    height: spark.size,
                                    margin: -spark.size / 2,
                                    borderRadius: '50%',
                                    background: color,
                                    boxShadow: `0 0 6px ${color}`,
                                    '--dx': `${spark.dx}px`,
                                    '--dy': `${spark.dy}px`,
                                    '--sdur': `${spark.durationMs}ms`,
                                    animationDelay: `${spark.delayMs}ms`,
                                } as React.CSSProperties
                            }
                        />
                    ))}
                    {record &&
                        [
                            ['10%', '12%'],
                            ['86%', '10%'],
                            ['12%', '82%'],
                            ['84%', '80%'],
                        ].map(([left, top], index) => (
                            <span
                                key={index}
                                style={{ position: 'absolute', left, top }}
                            >
                                <Star
                                    size={clamp(base * 0.05, 10, 22)}
                                    color={props.palette.gold}
                                />
                            </span>
                        ))}
                </>
            )}
            <div
                className={record ? 'nils-eg-badge' : props.reducedMotion ? 'nils-eg-fade' : 'nils-eg-rise'}
                style={{ position: 'relative' }}
            >
                {record ? (
                    <>
                        <div
                            className="nils-eg-label"
                            style={{
                                fontSize: clamp(base * 0.045, 11, 18),
                                fontWeight: 800,
                                color: props.palette.gold,
                                padding: '4px 14px',
                                border: `1px solid ${props.palette.gold}`,
                                borderRadius: 999,
                                display: 'inline-block',
                                marginBottom: 8,
                            }}
                        >
                            {headline}
                        </div>
                        <div
                            style={{
                                position: 'relative',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 10,
                                overflow: 'hidden',
                                borderRadius: 12,
                            }}
                        >
                            <Trophy
                                size={size * 0.9}
                                color={props.palette.gold}
                            />
                            <span
                                className="nils-eg-num"
                                style={{
                                    fontSize: size,
                                    fontWeight: 800,
                                    color: props.palette.text,
                                    textShadow: `0 0 ${Math.round(base * 0.05)}px ${color}99`,
                                }}
                            >
                                {dailyText}
                            </span>
                            {!props.reducedMotion && (
                                <span
                                    className="nils-eg-shine nils-eg-motion"
                                    style={{
                                        position: 'absolute',
                                        inset: '0 auto 0 0',
                                        width: '35%',
                                        background: `linear-gradient(90deg,transparent,${props.palette.gold}55,transparent)`,
                                    }}
                                />
                            )}
                        </div>
                        {subline && (
                            <div
                                className="nils-eg-label"
                                style={{ fontSize: lineSize, fontWeight: 700, color: props.palette.gold, marginTop: 6 }}
                            >
                                {subline}
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                            <Bolt
                                size={size * 0.55}
                                color={color}
                            />
                            <span
                                className="nils-eg-num"
                                style={{
                                    fontSize: size,
                                    fontWeight: 800,
                                    color,
                                    textShadow: `0 0 ${Math.round(base * 0.05)}px ${color}99`,
                                }}
                            >
                                {delta || '⚡'}
                            </span>
                        </div>
                        <div
                            className="nils-eg-label"
                            style={{ fontSize: lineSize, fontWeight: 700, color: props.palette.text, marginTop: 4 }}
                        >
                            {headline}
                        </div>
                        {subline && (
                            <div
                                style={{
                                    fontSize: lineSize,
                                    color: props.palette.textSecondary,
                                    marginTop: 2,
                                    maxWidth: '90%',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {subline}
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default function EnergyGameView(props: EnergyGameViewProps): React.JSX.Element {
    const width = Math.max(120, props.width || 400);
    const height = Math.max(80, props.height || 260);
    const compact = props.compact || width < 300 || height < 190;
    const base = Math.max(150, Math.min(width, height * 1.45));
    const dailySize = clamp(base * (compact ? 0.17 : 0.2), 30, 96);
    const secondarySize = clamp(base * 0.075, 14, 32);
    const labelSize = clamp(base * 0.03, 9, 13);
    const padding = compact ? 8 : clamp(base * 0.035, 10, 20);
    const dailyText = formatScore(props.daily, props.lang);
    const event = props.animationsEnabled ? props.activeEvent : null;
    const recordTitle = props.recordBrokenAt
        ? new Date(props.recordBrokenAt).toLocaleTimeString(props.lang || undefined)
        : undefined;
    return (
        <div
            className="nils-eg"
            style={{ padding, color: props.palette.text }}
        >
            {props.showTitle && !compact && (
                <div
                    className="nils-eg-label"
                    style={{
                        fontSize: labelSize,
                        fontWeight: 700,
                        color: props.palette.textSecondary,
                        textAlign: 'center',
                    }}
                >
                    {props.labels.title}
                </div>
            )}
            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 0,
                }}
            >
                {!compact && (
                    <Bolt
                        size={clamp(base * 0.06, 14, 26)}
                        color={props.palette.accent}
                    />
                )}
                <div
                    key={event?.sequence || 'idle'}
                    className={`nils-eg-num${event && !props.reducedMotion ? ' nils-eg-pop' : ''}`}
                    role="status"
                    aria-live="polite"
                    aria-label={`${props.labels.daily}: ${props.daily === null ? props.t('eg_score_unavailable') : dailyText}`}
                    style={{
                        fontSize: dailySize,
                        fontWeight: 800,
                        minWidth: `${Math.max(2, dailyText.length) * 0.62}em`,
                        textAlign: 'center',
                        textShadow: `0 0 ${Math.round(dailySize * 0.25)}px ${props.palette.accent}66`,
                        marginTop: compact ? 0 : 4,
                    }}
                >
                    {dailyText}
                </div>
                <div
                    className="nils-eg-label"
                    style={{ fontSize: labelSize, fontWeight: 700, color: props.palette.accent, marginTop: 6 }}
                >
                    {props.labels.daily}
                </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                        className="nils-eg-num"
                        style={{ fontSize: secondarySize, fontWeight: 700 }}
                        aria-label={`${props.labels.overall}: ${formatScore(props.overall, props.lang)}`}
                    >
                        {formatScore(props.overall, props.lang)}
                    </div>
                    <div
                        className="nils-eg-label"
                        style={{ fontSize: labelSize, color: props.palette.textSecondary, marginTop: 3 }}
                    >
                        {props.labels.overall}
                    </div>
                </div>
                <div
                    title={recordTitle}
                    style={{
                        position: 'relative',
                        minWidth: 0,
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        padding: '6px 10px',
                        borderRadius: 12,
                    }}
                >
                    {props.highScoreToday && props.recordSparkles && (
                        <RecordDecoration
                            color={props.palette.gold}
                            reducedMotion={props.reducedMotion}
                        />
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Trophy
                            size={secondarySize * 0.95}
                            color={props.highScoreToday ? props.palette.gold : props.palette.textSecondary}
                        />
                        <span
                            className="nils-eg-num"
                            style={{
                                fontSize: secondarySize,
                                fontWeight: 700,
                                color: props.highScoreToday ? props.palette.gold : props.palette.text,
                            }}
                            aria-label={`${props.labels.record}: ${formatScore(props.highScore, props.lang)}`}
                        >
                            {formatScore(props.highScore, props.lang)}
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        {props.highScoreToday && (
                            <span
                                className="nils-eg-label"
                                style={{
                                    fontSize: Math.max(8, labelSize - 2),
                                    fontWeight: 800,
                                    color: props.palette.gold,
                                    border: `1px solid ${props.palette.gold}88`,
                                    borderRadius: 999,
                                    padding: '1px 6px',
                                }}
                            >
                                {props.t('eg_new_record')}
                            </span>
                        )}
                        <span
                            className="nils-eg-label"
                            style={{ fontSize: labelSize, color: props.palette.textSecondary }}
                        >
                            {props.labels.record}
                        </span>
                    </div>
                </div>
            </div>
            {event && (
                <EventOverlay
                    key={event.sequence}
                    event={event}
                    dailyText={dailyText}
                    props={props}
                    base={base}
                />
            )}
        </div>
    );
}
