/** Offline draft-contract core. No database, worker or legacy write integration. */
import { createHash } from 'node:crypto';
import { BaseUnit, ExpiringBatch, normalizeIngredientQuantity, rankEligibleBatches } from './ingredient-policy';

interface Fraction { n: bigint; d: bigint }
function decimal(value: string, precision: number, scale: number): Fraction {
    if (typeof value !== 'string' || !/^(0|[1-9]\d*)(\.\d+)?$/.test(value)) throw new Error('Invalid decimal string');
    const [whole, tail = ''] = value.split('.');
    if (whole!.length > precision - scale || tail.length > scale) throw new Error('Decimal capacity exceeded');
    return { n: BigInt(whole! + tail), d: 10n ** BigInt(tail.length) };
}
function gcd(a: bigint, b: bigint): bigint { while (b) { const rest = a % b; a = b; b = rest; } return a; }
function add(a: Fraction, b: Fraction): Fraction {
    const shared = gcd(a.d, b.d);
    const n = a.n * (b.d / shared) + b.n * (a.d / shared);
    const d = a.d * (b.d / shared); const divisor = gcd(n, d);
    return { n: n / divisor, d: d / divisor };
}
function format(n: bigint, scale: number): string {
    const sign = n < 0n ? '-' : ''; const digits = (n < 0n ? -n : n).toString().padStart(scale + 1, '0');
    if (!scale) return sign + digits;
    const tail = digits.slice(-scale).replace(/0+$/, '');
    return sign + digits.slice(0, -scale) + (tail ? `.${tail}` : '');
}
function halfUp(a: Fraction, scale: number): bigint {
    const numerator = a.n * 10n ** BigInt(scale);
    return numerator / a.d + (2n * (numerator % a.d) >= a.d ? 1n : 0n);
}
function milli(value: string): bigint { const a = decimal(value, 14, 3); return a.n * 1000n / a.d; }
function id(value: string): void { if (typeof value !== 'string' || !value.trim() || value !== value.trim()) throw new Error('Invalid identity'); }
export interface RequirementInput { ingredientId: string; baseUnit: BaseUnit; quantity: string; unit: string; active: boolean; optional: boolean }
export interface RecipeInput {
    id: string; version: string; active: boolean; productActive: boolean;
    effectiveFrom: Date; effectiveTo: Date | null; yieldQuantity: string; ingredients: readonly RequirementInput[];
}
export interface AddEffect { type: 'ADD'; ingredientId: string; baseUnit: BaseUnit; quantity: string; unit: string; active: boolean }
/** Inputs are one item's explicit recipe candidates and selected ADD quantities for that entire item line.
 * Caller must resolve topping selection counts to line quantities; this core never infers those counts. */
export function calculateRequirements(recipes: readonly RecipeInput[], servings: string, omitted: readonly string[], effects: readonly AddEffect[], now: Date) {
    if (!Number.isFinite(now.getTime())) throw new Error('Invalid clock');
    const selected = recipes.filter(r => r.active && r.productActive && Number.isFinite(r.effectiveFrom.getTime()) &&
        (r.effectiveTo === null || (Number.isFinite(r.effectiveTo.getTime()) && r.effectiveTo > r.effectiveFrom)) &&
        r.effectiveFrom <= now && (r.effectiveTo === null || now < r.effectiveTo));
    if (selected.length !== 1) throw new Error('Missing or ambiguous recipe');
    const r = selected[0]!; id(r.id);
    if (decimal(r.version, 10, 0).n <= 0n) throw new Error('Positive recipe version required');
    const yieldValue = decimal(r.yieldQuantity, 10, 2); const count = decimal(servings, 10, 0);
    if (yieldValue.n === 0n || count.n === 0n) throw new Error('Positive yield/servings required');
    const omit = new Set(omitted); if (omit.size !== omitted.length) throw new Error('Duplicate omission');
    const seen = new Set<string>(); const totals = new Map<string, { baseUnit: BaseUnit; value: Fraction }>();
    const accumulate = (ingredientId: string, baseUnit: BaseUnit, value: Fraction) => {
        id(ingredientId); const previous = totals.get(ingredientId);
        if (previous && previous.baseUnit !== baseUnit) throw new Error('Ingredient dimension mismatch');
        totals.set(ingredientId, { baseUnit, value: previous ? add(previous.value, value) : value });
    };
    for (const row of r.ingredients) {
        id(row.ingredientId);
        if (seen.has(row.ingredientId)) throw new Error('Duplicate recipe ingredient'); seen.add(row.ingredientId);
        if (!row.active) throw new Error('Inactive ingredient');
        const amount = decimal(normalizeIngredientQuantity(row.quantity, row.unit, row.baseUnit), 14, 3);
        if (omit.has(row.ingredientId)) { if (!row.optional) throw new Error('Mandatory omission'); continue; }
        accumulate(row.ingredientId, row.baseUnit, { n: amount.n * count.n * yieldValue.d, d: amount.d * count.d * yieldValue.n });
    }
    for (const key of omit) if (!seen.has(key)) throw new Error('Unknown omission');
    for (const effect of effects) {
        if (effect.type !== 'ADD' || !effect.active) throw new Error('Unsupported topping effect');
        if (decimal(effect.quantity, 14, 3).n === 0n) {
            normalizeIngredientQuantity('1', effect.unit, effect.baseUnit);
            id(effect.ingredientId);
            const previous = totals.get(effect.ingredientId);
            if (previous && previous.baseUnit !== effect.baseUnit) throw new Error('Ingredient dimension mismatch');
            continue;
        }
        accumulate(effect.ingredientId, effect.baseUnit, decimal(normalizeIngredientQuantity(effect.quantity, effect.unit, effect.baseUnit), 14, 3));
    }
    const requirements = [...totals].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([ingredientId, { baseUnit, value }]) => {
        if (baseUnit === 'piece' && value.n % value.d !== 0n) throw new Error('Fractional piece requirement');
        const rounded = halfUp(value, 3);
        if (rounded > 99999999999999n) throw new Error('Requirement overflow');
        return { ingredientId, baseUnit, quantity: format(rounded, 3),
            roundingDelta: { numerator: (rounded * value.d - value.n * 1000n).toString(), denominator: (1000n * value.d).toString() } };
    });
    // Detached value snapshot, not a claim of durable database immutability.
    return { recipeId: r.id, recipeVersion: r.version, yieldQuantity: format(yieldValue.n * 100n / yieldValue.d, 2), servings,
        omitted: [...omitted].sort(), effects: effects.map(e => ({ ...e })), requirements };
}

/** Sum exact extended costs, round once to Decimal(14,2). null is UNKNOWN; known zero is valid. */
export function ingredientCost(lines: readonly { quantity: string; unitCost: string | null }[]): { complete: boolean; total: string | null } {
    let total: Fraction = { n: 0n, d: 1n }; let complete = true;
    for (const row of lines) {
        const q = decimal(row.quantity, 14, 3);
        if (row.unitCost === null) { complete = false; continue; }
        const cost = decimal(row.unitCost, 18, 4); total = add(total, { n: q.n * cost.n, d: q.d * cost.d });
    }
    if (!complete) return { complete: false, total: null };
    const rounded = halfUp(total, 2); if (rounded > 99999999999999n) throw new Error('Cost overflow');
    return { complete: true, total: format(rounded, 2) };
}

/** Preserve source fractions; distribute the aggregate milliquantity by largest remainder.
 * This does not round each recipe/topping independently or change the existing total requirement. */
export function calculateComponents(recipes: readonly RecipeInput[], servings: string, omitted: readonly string[], effects: readonly AddEffect[], now: Date) {
    const snapshot = calculateRequirements(recipes, servings, omitted, effects, now);
    const recipe = recipes.find(r => r.id === snapshot.recipeId)!;
    const count = decimal(servings, 10, 0); const yieldValue = decimal(recipe.yieldQuantity, 10, 2);
    const rows: { id: string; ingredientId: string; source: 'RECIPE' | 'TOPPING'; value: Fraction; allocated: bigint }[] = [];
    for (const line of recipe.ingredients.filter(l => !omitted.includes(l.ingredientId))) {
        const q = decimal(normalizeIngredientQuantity(line.quantity, line.unit, line.baseUnit), 14, 3);
        rows.push({ id: `recipe:${recipe.id}:${line.ingredientId}`, ingredientId: line.ingredientId, source: 'RECIPE', value: { n: q.n * count.n * yieldValue.d, d: q.d * count.d * yieldValue.n }, allocated: 0n });
    }
    effects.forEach((effect, index) => {
        if (decimal(effect.quantity, 14, 3).n === 0n) return;
        rows.push({ id: `topping:${index}:${effect.ingredientId}`, ingredientId: effect.ingredientId, source: 'TOPPING', value: decimal(normalizeIngredientQuantity(effect.quantity, effect.unit, effect.baseUnit), 14, 3), allocated: 0n });
    });
    for (const requirement of snapshot.requirements) {
        const parts = rows.filter(row => row.ingredientId === requirement.ingredientId);
        for (const part of parts) part.allocated = part.value.n * 1000n / part.value.d;
        let remainder = milli(requirement.quantity) - parts.reduce((sum, p) => sum + p.allocated, 0n);
        const rank = [...parts].sort((a, b) => {
            const left = (a.value.n * 1000n % a.value.d) * b.value.d;
            const right = (b.value.n * 1000n % b.value.d) * a.value.d;
            return left === right ? (a.id < b.id ? -1 : 1) : left > right ? -1 : 1;
        });
        for (const part of rank) { if (remainder-- <= 0n) break; part.allocated++; }
    }
    return { snapshot, components: rows.map(row => ({ id: row.id, ingredientId: row.ingredientId, source: row.source, quantity: format(row.allocated, 3), exact: { numerator: row.value.n.toString(), denominator: row.value.d.toString() } })) };
}

/** Exact source×lot extended costs, with cents apportioned so component sum equals rounded total. */
export function attributeComponentCosts<T extends { quantity: string; unitCost: string | null }>(lines: readonly T[], targetTotal?: string) {
    const rows = lines.map((line, index) => {
        if (line.unitCost === null) return { line, index, value: null, cents: 0n };
        const q = decimal(line.quantity, 14, 3); const c = decimal(line.unitCost, 18, 4);
        const value = { n: q.n * c.n, d: q.d * c.d };
        return { line, index, value, cents: value.n * 100n / value.d };
    });
    const known = rows.filter((row): row is typeof row & { value: Fraction } => row.value !== null);
    const total = known.reduce((sum, row) => add(sum, row.value), { n: 0n, d: 1n });
    const target = targetTotal === undefined ? halfUp(total, 2) : halfUp(decimal(targetTotal, 14, 2), 2);
    let remainder = target - known.reduce((sum, row) => sum + row.cents, 0n);
    if (remainder < 0n || remainder > BigInt(known.length)) throw new Error('Invalid cost apportionment target');
    for (const row of [...known].sort((a, b) => {
        const left = (a.value.n * 100n % a.value.d) * b.value.d; const right = (b.value.n * 100n % b.value.d) * a.value.d;
        return left === right ? a.index - b.index : left > right ? -1 : 1;
    })) { if (remainder-- <= 0n) break; row.cents++; }
    return rows.map(row => ({ ...row.line, exact: row.value ? { numerator: row.value.n.toString(), denominator: row.value.d.toString() } : null, attributedCost: row.value ? format(row.cents, 2) : null }));
}

export interface PlanningBatch extends ExpiringBatch { ingredientId: string; remaining: string; reserved: string }
/** Explicit adapter for an unordered unique ingredient-quantity collection before D09 hashing. */
export function normalizeOperationQuantities(rows: readonly { ingredientId: string; quantity: string; unit: string; baseUnit: BaseUnit }[]) {
    const seen = new Set<string>();
    return rows.map(row => {
        id(row.ingredientId); if (seen.has(row.ingredientId)) throw new Error('Duplicate ingredient'); seen.add(row.ingredientId);
        return { ingredientId: row.ingredientId, baseUnit: row.baseUnit,
            quantity: normalizeIngredientQuantity(row.quantity, row.unit, row.baseUnit) };
    }).sort((a, b) => a.ingredientId < b.ingredientId ? -1 : a.ingredientId > b.ingredientId ? 1 : 0);
}
/** All reservation amounts are supplied authoritative snapshot inputs; a plan grants no write authority. */
export function planReservation(ingredientId: string, quantity: string, batches: readonly PlanningBatch[], now: Date) {
    id(ingredientId); let needed = milli(quantity); if (needed <= 0n) throw new Error('Positive reservation required');
    const ids = new Set<string>();
    for (const b of batches) {
        id(b.id); if (ids.has(b.id) || b.ingredientId !== ingredientId) throw new Error('Duplicate or foreign batch'); ids.add(b.id);
        if (milli(b.reserved) > milli(b.remaining)) throw new Error('Invalid reserved balance');
    }
    const allocations: { batchId: string; quantity: string }[] = [];
    for (const b of rankEligibleBatches(batches, now)) {
        const free = milli(b.remaining) - milli(b.reserved); const take = free < needed ? free : needed;
        if (take > 0n) allocations.push({ batchId: b.id, quantity: format(take, 3) });
        needed -= take; if (needed === 0n) break;
    }
    if (needed !== 0n) throw new Error('Insufficient eligible stock');
    return allocations;
}

/** D09 canonical JSON subset: decimal values/versions are normalized strings, numbers forbidden.
 * Arrays retain semantic order; domain adapters must sort unordered collections before calling. */
export function canonicalOperationValue(value: unknown): string {
    const ancestors = new Set<object>();
    const encode = (current: unknown): string => {
        if (current === null || typeof current === 'boolean' || typeof current === 'string') return JSON.stringify(current);
        if (typeof current !== 'object' || !current) throw new Error('Unsupported canonical value');
        if (ancestors.has(current)) throw new Error('Cyclic canonical value');
        const array = Array.isArray(current);
        if (!array && Object.getPrototypeOf(current) !== Object.prototype) throw new Error('Unsupported canonical value');
        const descriptors = Object.getOwnPropertyDescriptors(current);
        const keys = Reflect.ownKeys(current);
        if (keys.some(k => typeof k !== 'string') || Object.entries(descriptors).some(([key, d]) =>
            !(array && key === 'length') && (!d.enumerable || !('value' in d)))) throw new Error('Invalid canonical properties');
        if (array && (keys.length !== current.length + 1 ||
            keys.some(k => k !== 'length' && !/^(0|[1-9]\d*)$/.test(k as string)))) throw new Error('Sparse or decorated array');
        ancestors.add(current);
        try {
            if (array) return '[' + Array.from({ length: current.length }, (_, i) => encode(descriptors[String(i)]!.value)).join(',') + ']';
            return '{' + Object.keys(descriptors).sort().map(k => JSON.stringify(k) + ':' + encode(descriptors[k]!.value)).join(',') + '}';
        } finally { ancestors.delete(current); }
    };
    return encode(value);
}

export function operationIdentity(input: { type: string; scope: string; callerKey: string; actorId: string; versions: Record<string, string>; payload: unknown }) {
    for (const value of [input.type, input.scope, input.callerKey, input.actorId]) id(value);
    for (const [key, value] of Object.entries(input.versions)) { id(key); id(value); }
    const hash = (value: unknown) => createHash('sha256').update(canonicalOperationValue(value)).digest('hex');
    return { key: 'r6:' + hash({ type: input.type, scope: input.scope, callerKey: input.callerKey }),
        requestHash: hash({ actorId: input.actorId, versions: input.versions, payload: input.payload }),
        childKey: (batchId: string) => { id(batchId); return 'r6-child:' + hash({ type: input.type, scope: input.scope, callerKey: input.callerKey, batchId }); } };
}
