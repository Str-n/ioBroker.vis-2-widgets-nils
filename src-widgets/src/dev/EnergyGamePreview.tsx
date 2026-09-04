/** Local-only preview for the EnergyGame presentation. */
import React, { useEffect, useRef, useState } from 'react';

import EnergyGameView, { ensureEnergyGameStyles } from '../EnergyGameView';
import { EVENT_DURATION_MS, type VisualEvent } from '../EnergyGameUtils';

const SIZES = {
    compact: { width: 260, height: 180 },
    tablet: { width: 400, height: 260 },
    large: { width: 600, height: 350 },
} as const;

const TEXTS: Record<string, string> = {
    eg_new_record: 'New record',
    eg_energy: 'Energy',
    eg_energy_saved: 'Energy saved',
    eg_energy_combo: 'Energy combo',
    eg_lights_saved: '%s lights saved',
    eg_score_unavailable: 'Score unavailable',
};

const translate = (key: string, ...args: (string | number)[]): string =>
    args.reduce<string>((text, argument) => text.replace('%s', String(argument)), TEXTS[key] || key);

export default function EnergyGamePreview(): React.JSX.Element {
    const [mode, setMode] = useState<'light' | 'dark'>('dark');
    const [size, setSize] = useState<keyof typeof SIZES>('tablet');
    const [highScoreToday, setHighScoreToday] = useState(false);
    const [reducedMotion, setReducedMotion] = useState(false);
    const [daily, setDaily] = useState(18);
    const [highScore, setHighScore] = useState(27);
    const [event, setEvent] = useState<VisualEvent | null>(null);
    const sequence = useRef(100);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        ensureEnergyGameStyles();
        return () => {
            if (timer.current) {
                clearTimeout(timer.current);
            }
        };
    }, []);

    const fire = (kind: VisualEvent['kind'], delta: number, names: string[]): void => {
        sequence.current += 1;
        const nextDaily = daily + delta;
        setDaily(nextDaily);
        if (kind === 'NEW_RECORD') {
            setHighScore(Math.max(highScore, nextDaily));
            setHighScoreToday(true);
        }
        setEvent({
            sequence: sequence.current,
            kind,
            delta,
            lightCount: names.length || delta,
            lightNames: names,
            receivedAt: Date.now(),
        });
        if (timer.current) {
            clearTimeout(timer.current);
        }
        timer.current = setTimeout(() => setEvent(null), EVENT_DURATION_MS[kind]);
    };

    const dark = mode === 'dark';
    const dimensions = SIZES[size];
    return (
        <div style={{ padding: 16, fontFamily: 'Roboto, sans-serif' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                <button onClick={() => fire('POINT', 1, ['Kitchen Ceiling'])}>+1 point</button>
                <button onClick={() => fire('COMBO', 5, ['Kitchen', 'Hall', 'Dining', 'Office', 'Bath'])}>
                    +5 combo
                </button>
                <button onClick={() => fire('COMBO', 10, [])}>+10 combo</button>
                <button onClick={() => fire('NEW_RECORD', 3, ['Kitchen', 'Hall', 'Dining'])}>NEW_RECORD +3</button>
                <label>
                    <input
                        type="checkbox"
                        checked={highScoreToday}
                        onChange={event => setHighScoreToday(event.target.checked)}
                    />{' '}
                    highScoreToday
                </label>
                <label>
                    <input
                        type="checkbox"
                        checked={reducedMotion}
                        onChange={event => setReducedMotion(event.target.checked)}
                    />{' '}
                    reduced motion
                </label>
                <label>
                    <input
                        type="checkbox"
                        checked={dark}
                        onChange={event => setMode(event.target.checked ? 'dark' : 'light')}
                    />{' '}
                    dark
                </label>
                <select
                    value={size}
                    onChange={event => setSize(event.target.value as keyof typeof SIZES)}
                >
                    {Object.keys(SIZES).map(key => (
                        <option
                            key={key}
                            value={key}
                        >
                            {key}
                        </option>
                    ))}
                </select>
                <button
                    onClick={() => {
                        setDaily(18);
                        setHighScore(27);
                        setHighScoreToday(false);
                        setEvent(null);
                    }}
                >
                    reset idle
                </button>
            </div>
            <div
                style={{
                    width: dimensions.width,
                    height: dimensions.height,
                    borderRadius: 12,
                    background: dark ? '#1e1e1e' : '#fff',
                    boxShadow: '0 2px 8px rgba(0,0,0,.3)',
                }}
            >
                <EnergyGameView
                    daily={daily}
                    overall={2847}
                    highScore={highScore}
                    highScoreToday={highScoreToday}
                    recordBrokenAt={highScoreToday ? Date.now() : null}
                    activeEvent={event}
                    labels={{
                        title: 'Energy Saver',
                        daily: 'Today',
                        overall: 'All time',
                        record: 'Record',
                        unit: 'Energy',
                    }}
                    showTitle
                    animationsEnabled
                    reducedMotion={reducedMotion}
                    showLightNames
                    recordSparkles
                    compact={false}
                    palette={{
                        mode,
                        text: dark ? '#f5f7fa' : '#111827',
                        textSecondary: dark ? 'rgba(245,247,250,.65)' : 'rgba(17,24,39,.6)',
                        accent: dark ? '#4fd6ff' : '#0369a1',
                        gold: dark ? '#ffc857' : '#b7791f',
                    }}
                    lang="en"
                    width={dimensions.width}
                    height={dimensions.height}
                    t={translate}
                />
            </div>
        </div>
    );
}
