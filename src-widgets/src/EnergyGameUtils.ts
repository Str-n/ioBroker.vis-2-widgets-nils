/** Pure, defensive helpers for the EnergyGame widget. */

export type EventKind = 'POINT' | 'COMBO' | 'NEW_RECORD';

export interface VisualEvent {
    sequence: number;
    kind: EventKind;
    delta: number | null;
    lightCount: number | null;
    lightNames: string[];
    receivedAt: number;
}

export const EVENT_DURATION_MS: Record<EventKind, number> = {
    POINT: 1400,
    COMBO: 2400,
    NEW_RECORD: 3600,
};

export const EVENT_PRIORITY: Record<EventKind, number> = { POINT: 1, COMBO: 2, NEW_RECORD: 3 };
export const SPARK_COUNT: Record<EventKind, number> = { POINT: 6, COMBO: 12, NEW_RECORD: 16 };
export const SNAPSHOT_DELAY_MS = 80;

export function parseNumber(value: unknown): number | null {
    if (value === null || value === undefined || typeof value === 'boolean') {
        return null;
    }
    const number =
        typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim().replace(',', '.')) : NaN;
    return Number.isFinite(number) ? number : null;
}

export function parseScore(value: unknown): number | null {
    const number = parseNumber(value);
    return number === null ? null : Math.round(number);
}

export function parseSequence(value: unknown): number | null {
    const number = parseNumber(value);
    return number === null || number < 0 ? null : Math.floor(number);
}

export function parsePositiveInt(value: unknown): number | null {
    const number = parseNumber(value);
    if (number === null) {
        return null;
    }
    const integer = Math.round(number);
    return integer >= 1 ? integer : null;
}

export function parseBoolean(value: unknown): boolean {
    if (value === true || value === 1) {
        return true;
    }
    return typeof value === 'string' && ['true', '1', 'on', 'yes'].includes(value.trim().toLowerCase());
}

const cleanName = (value: unknown): string => {
    const name = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
    return name ? (name.length > 24 ? `${name.slice(0, 23)}…` : name) : '';
};

export function parseLightNames(value: unknown): string[] {
    try {
        if (Array.isArray(value)) {
            return value.map(cleanName).filter(Boolean).slice(0, 50);
        }
        if (value && typeof value === 'object') {
            return parseLightNames((value as { lightNames?: unknown }).lightNames);
        }
        if (typeof value !== 'string') {
            return [];
        }
        const source = value.trim();
        if (!source || source === '[]' || source === 'null') {
            return [];
        }
        if (source.startsWith('[') || source.startsWith('{')) {
            try {
                const parsed: unknown = JSON.parse(source);
                if (Array.isArray(parsed) || (parsed && typeof parsed === 'object')) {
                    return parseLightNames(parsed);
                }
            } catch {
                // Fall through to delimiter parsing for malformed JSON.
            }
        }
        return source
            .replace(/^[[{]|[\]}]$/g, '')
            .split(/[,;•|]/)
            .map(part => cleanName(part.replace(/^["']|["']$/g, '')))
            .filter(Boolean)
            .slice(0, 50);
    } catch {
        return [];
    }
}

export function summarizeLightNames(names: string[], maxShown = 3, separator = ' • '): string {
    if (!names?.length) {
        return '';
    }
    return names.length <= maxShown
        ? names.join(separator)
        : `${names.slice(0, maxShown).join(separator)} +${names.length - maxShown}`;
}

export function classifyEventKind(rawKind: unknown, delta: number | null): EventKind {
    if (typeof rawKind === 'string') {
        const kind = rawKind.trim().toUpperCase();
        if (kind === 'POINT' || kind === 'COMBO' || kind === 'NEW_RECORD') {
            return kind;
        }
    }
    return delta !== null && delta > 1 ? 'COMBO' : 'POINT';
}

export interface EventJsonSnapshot {
    sequence: number;
    delta: number | null;
    kind: unknown;
    lightCount: number | null;
    lightNames: string[];
}

export function parseEventJson(value: unknown): EventJsonSnapshot | null {
    try {
        const object: unknown = typeof value === 'string' ? JSON.parse(value) : value;
        if (!object || typeof object !== 'object') {
            return null;
        }
        const data = object as Record<string, unknown>;
        const sequence = parseSequence(data.sequence);
        return sequence === null
            ? null
            : {
                  sequence,
                  delta: parsePositiveInt(data.delta),
                  kind: data.kind,
                  lightCount: parsePositiveInt(data.lightCount),
                  lightNames: parseLightNames(data.lightNames),
              };
    } catch {
        return null;
    }
}

export function formatScore(value: number | null, lang?: string): string {
    if (value === null) {
        return '—';
    }
    try {
        return new Intl.NumberFormat(lang || undefined).format(value);
    } catch {
        return String(value);
    }
}

export type SequenceReason = 'NO_VALUE' | 'BASELINE' | 'REBASELINE' | 'UNCHANGED' | 'REGRESSION' | 'NEW_EVENT';

export class EventSequenceTracker {
    private baseline: number | null = null;
    private rebaselinePending = false;

    requestRebaseline(): void {
        this.rebaselinePending = true;
    }

    reset(): void {
        this.baseline = null;
        this.rebaselinePending = false;
    }

    observe(sequence: number | null): { animate: boolean; sequence: number | null; reason: SequenceReason } {
        if (sequence === null) {
            return { animate: false, sequence: null, reason: 'NO_VALUE' };
        }
        if (this.baseline === null) {
            this.baseline = sequence;
            this.rebaselinePending = false;
            return { animate: false, sequence, reason: 'BASELINE' };
        }
        if (this.rebaselinePending) {
            this.baseline = sequence;
            this.rebaselinePending = false;
            return { animate: false, sequence, reason: 'REBASELINE' };
        }
        if (sequence === this.baseline) {
            return { animate: false, sequence, reason: 'UNCHANGED' };
        }
        if (sequence < this.baseline) {
            this.baseline = sequence;
            return { animate: false, sequence, reason: 'REGRESSION' };
        }
        this.baseline = sequence;
        return { animate: true, sequence, reason: 'NEW_EVENT' };
    }
}

export function resolveEventTransition(
    active: VisualEvent | null,
    pending: VisualEvent | null,
    incoming: VisualEvent,
): { active: VisualEvent; pending: VisualEvent | null; restarted: boolean } {
    if (!active || EVENT_PRIORITY[incoming.kind] >= EVENT_PRIORITY[active.kind]) {
        return { active: incoming, pending: null, restarted: true };
    }
    return {
        active,
        pending: pending && EVENT_PRIORITY[pending.kind] > EVENT_PRIORITY[incoming.kind] ? pending : incoming,
        restarted: false,
    };
}

function random(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

export interface Spark {
    dx: number;
    dy: number;
    delayMs: number;
    size: number;
    durationMs: number;
}

export function makeSparks(count: number, seed: number, radius: number): Spark[] {
    const amount = Math.max(0, Math.min(24, Math.floor(count)));
    const next = random(seed || 1);
    return Array.from({ length: amount }, (_, index) => {
        const angle = (index / amount) * Math.PI * 2 + (next() - 0.5) * 0.6;
        const distance = radius * (0.55 + next() * 0.45);
        return {
            dx: Math.round(Math.cos(angle) * distance),
            dy: Math.round(Math.sin(angle) * distance),
            delayMs: Math.round(next() * 180),
            size: 3 + Math.round(next() * 3),
            durationMs: 700 + Math.round(next() * 400),
        };
    });
}

export function prefersReducedMotion(): boolean {
    try {
        return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
            : false;
    } catch {
        return false;
    }
}
