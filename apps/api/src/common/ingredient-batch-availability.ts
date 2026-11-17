/** Persisted timestamps are exclusive expiry boundaries. Nullable legacy expiry retains existing compatibility. */
export function isIngredientBatchUnexpired(expirationDate: Date | string | null | undefined, now = new Date()): boolean {
    if (expirationDate == null) return true;
    const instant = new Date(expirationDate).getTime();
    return Number.isFinite(instant) && instant > now.getTime();
}

/** Unknown/missing quality fails closed. Legacy rows receive AVAILABLE via additive schema default. */
export function isIngredientBatchUsable(batch: { qualityStatus?: string; expirationDate?: Date | string | null }, now = new Date()): boolean {
    return batch.qualityStatus === 'AVAILABLE' && isIngredientBatchUnexpired(batch.expirationDate, now);
}

export function lotExpiryStatus(expirationDate: Date | null, now: Date, warningDays: number): string {
    if (expirationDate === null) return 'NO_EXPIRY';
    const remaining = expirationDate.getTime() - now.getTime();
    if (!Number.isFinite(remaining)) return 'UNKNOWN';
    if (remaining <= 0) return 'EXPIRED';
    return remaining <= warningDays * 86400000 ? 'NEAR_EXPIRY' : 'VALID';
}
