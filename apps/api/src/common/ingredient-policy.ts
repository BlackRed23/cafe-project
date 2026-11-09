/** R5 pure D02/D03/D04 foundations. Deliberately not wired to legacy stock writers. */
export type BaseUnit = 'g' | 'ml' | 'piece';
const units: Record<string, { base: BaseUnit; factor: bigint }> = {
    g: { base: 'g', factor: 1n }, kg: { base: 'g', factor: 1000n },
    ml: { base: 'ml', factor: 1n }, l: { base: 'ml', factor: 1000n },
    piece: { base: 'piece', factor: 1n },
};

/** Positive Decimal(14,3) input; no exponent, Number coercion or implicit rounding. */
export function normalizeIngredientQuantity(value: string, unit: string, expected: BaseUnit): string {
    if (typeof value !== 'string' || !/^(0|[1-9]\d{0,10})(\.\d{1,3})?$/.test(value)) {
        throw new Error('Invalid Decimal(14,3) quantity');
    }
    const selected = typeof unit === 'string' ? units[unit.trim().toLowerCase()] : undefined;
    if (!selected || selected.base !== expected) throw new Error('Unsupported unit or dimension');
    const [whole, fraction = ''] = value.split('.');
    const scaled = (BigInt(whole!) * 1000n + BigInt(fraction.padEnd(3, '0'))) * selected.factor;
    if (scaled <= 0n || scaled > 99999999999999n) throw new Error('Quantity out of range');
    if (expected === 'piece' && scaled % 1000n !== 0n) throw new Error('Whole pieces required');
    const tail = (scaled % 1000n).toString().padStart(3, '0').replace(/0+$/, '');
    return (scaled / 1000n).toString() + (tail ? `.${tail}` : '');
}

/** Supplier date expires at next midnight UTC+07, independent of host timezone. */
export function supplierExpiryInstant(date: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date-only expiry required');
    const midnight = new Date(`${date}T00:00:00.000Z`);
    if (!Number.isFinite(midnight.getTime()) || midnight.toISOString().slice(0, 10) !== date) {
        throw new Error('Invalid expiry date');
    }
    return new Date(midnight.getTime() + 17 * 60 * 60 * 1000);
}

export interface ExpiringBatch { id: string; expirationDate: Date | null; receivedAt: Date }
/** Pure eligibility/ranking only: balances, allocations, locks and consume recheck remain required. */
export function rankEligibleBatches<T extends ExpiringBatch>(batches: readonly T[], now: Date): T[] {
    if (!Number.isFinite(now.getTime())) throw new Error('Invalid clock');
    return batches.filter(batch => batch.expirationDate instanceof Date &&
        Number.isFinite(batch.expirationDate.getTime()) && batch.expirationDate.getTime() > now.getTime() &&
        Number.isFinite(batch.receivedAt.getTime()))
        .sort((a, b) => a.expirationDate!.getTime() - b.expirationDate!.getTime() ||
            a.receivedAt.getTime() - b.receivedAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
