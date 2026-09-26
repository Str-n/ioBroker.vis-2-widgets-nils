export const energyConsumptionBindings = {
    gridOid: 'sonoff.0.DVES_D10348.SML_curr',
    solarOid: 'deyeidc.0.4154663299.Apo_t1',
};

export interface EnergyFlow {
    grid?: number;
    solar?: number;
    home?: number;
    solarShare?: number;
    inconsistent: boolean;
}

function power(value: unknown, unit: string): number | undefined {
    if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) {
        return undefined;
    }
    const watts = Number(value) * (unit === 'kW' ? 1000 : 1);
    return Number.isFinite(watts) ? watts : undefined;
}

/** Signed grid import plus solar production gives household load, excluding storage or other sources. */
export function energyFlow(
    gridValue: unknown,
    solarValue: unknown,
    gridUnit = 'W',
    solarUnit = 'W',
    invertGrid = false,
): EnergyFlow {
    const rawGrid = power(gridValue, gridUnit);
    const grid = rawGrid === undefined ? undefined : rawGrid * (invertGrid ? -1 : 1);
    const rawSolar = power(solarValue, solarUnit);
    const solar = rawSolar !== undefined && rawSolar >= 0 ? rawSolar : undefined;
    const sum = grid !== undefined && solar !== undefined ? grid + solar : undefined;
    const inconsistent = sum !== undefined && (!Number.isFinite(sum) || sum < 0);
    const home = inconsistent ? undefined : sum;
    const solarShare = home !== undefined && home > 0 && solar !== undefined ? Math.min(solar / home, 1) : undefined;
    return { grid, solar, home, solarShare, inconsistent };
}

export function powerReading(watts: number | undefined): { value?: number; unit: string; digits: number } {
    if (watts === undefined) {
        return { unit: 'W', digits: 0 };
    }
    const magnitude = Math.abs(watts);
    // Switch before rounding could display "1000 W".
    return magnitude >= 999.5
        ? { value: magnitude / 1000, unit: 'kW', digits: magnitude < 10000 ? 2 : 1 }
        : { value: magnitude, unit: 'W', digits: 0 };
}
