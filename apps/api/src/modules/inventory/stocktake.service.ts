import { createHash } from 'node:crypto';
import { prisma, Prisma, StockCountStatus, UserRole } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import { isIngredientBatchUsable } from '../../common/ingredient-batch-availability';
import type { StocktakeCreateInput, StocktakeEntryInput, StocktakeSubmitInput, StocktakeDecisionInput } from './stocktake.validator';

type Actor = { id: string; role: UserRole };
type DB = Prisma.TransactionClient;
const zero = new Prisma.Decimal(0);
const movements = new Set(['IMPORT', 'CONSUME', 'WASTE', 'RETURN', 'RETURN_OUT', 'ADJUSTMENT', 'DAMAGE', 'SIMULATE_SALE']);
const excludes = new Set(['RESERVE', 'RELEASE', 'CANCEL']);
const active = [StockCountStatus.DRAFT, StockCountStatus.PENDING_APPROVAL, StockCountStatus.NEEDS_INVESTIGATION];
const sorted = (ids: string[]) => [...new Set(ids)].sort();
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const asScope = (raw: Prisma.JsonValue | null): string[] => {
    if (!Array.isArray(raw) || raw.some(x => typeof x !== 'string')) throw new HttpError(409, 'Phạm vi phiên kiểm kê không hợp lệ.');
    return raw as string[];
};
const lockIngredients = async (tx: DB, ids: string[]) => {
    for (const id of sorted(ids)) {
        const result = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Ingredient" WHERE "id" = ${id} FOR UPDATE`;
        if (result.length !== 1) throw new HttpError(404, 'Không tìm thấy nguyên liệu cần kiểm kê.');
    }
};
const readSession = async (tx: DB, id: string) => {
    const session = await tx.stockCount.findFirst({ where: { id, kind: 'STOCKTAKE' } });
    if (!session) throw new HttpError(404, 'Không tìm thấy phiên kiểm kê.');
    return session;
};
const see = (session: { createdById: string; assignedCounterId: string | null }, actor: Actor) => {
    if (actor.role !== UserRole.ADMIN && actor.id !== session.createdById && actor.id !== session.assignedCounterId) {
        throw new HttpError(403, 'Bạn không được truy cập phiên kiểm kê này.');
    }
};
const countPermission = (session: { assignedCounterId: string | null }, actor: Actor) => {
    if (session.assignedCounterId !== actor.id) throw new HttpError(403, 'Chỉ nhân viên được phân công mới được ghi nhận kiểm kê.');
};
const admin = (actor: Actor) => {
    if (actor.role !== UserRole.ADMIN) throw new HttpError(403, 'Chỉ ADMIN được ra quyết định kiểm kê.');
};
const action = async (tx: DB, requestId: string, stockCountId: string, operation: string, actor: Actor, body: unknown) => {
    const hash = digest(body);
    const exists = await tx.stocktakeRequest.findUnique({ where: { requestId } });
    if (exists) {
        if (exists.stockCountId !== stockCountId || exists.action !== operation ||
            exists.actorId !== actor.id || exists.payloadHash !== hash) {
            throw new HttpError(409, 'requestId đã được sử dụng cho nội dung hoặc hành động khác.');
        }
        return true;
    }
    await tx.stocktakeRequest.create({ data: { requestId, stockCountId, action: operation,
        actorId: actor.id, payloadHash: hash } });
    return false;
};
const dtoEntry = (entry: any) => ({
    id: entry.id, ingredientId: entry.ingredientId, batchId: entry.batchId,
    openingQty: entry.openingQty.toString(), openingCursor: entry.openingCursor.toString(),
    openingQualityStatus: entry.openingQualityStatus, openingExpirationDate: entry.openingExpirationDate,
    presentAtOpen: entry.presentAtOpen,
    expectedAtCount: entry.expectedAtCount?.toString() ?? null,
    observedQty: entry.observedQty?.toString() ?? null, varianceQty: entry.varianceQty?.toString() ?? null,
    observedCursor: entry.observedCursor?.toString() ?? null,
    countedAt: entry.countedAt, countedById: entry.countedById, reason: entry.reason,
    reasonCategory: entry.reasonCategory, revision: entry.revision,
    history: entry.history?.map((h: any) => ({ id: h.id, revision: h.revision,
        previousQty: h.previousQty?.toString() ?? null, newQty: h.newQty.toString(),
        actorId: h.actorId, reason: h.reason, createdAt: h.createdAt })) ?? []
});
const dtoSession = (session: any) => ({
    id: session.id, code: session.code, status: session.status, scope: asScope(session.scope),
    createdById: session.createdById, assignedCounterId: session.assignedCounterId,
    approvedById: session.approvedById, approvedAt: session.approvedAt,
    rejectedById: session.rejectedById, rejectedAt: session.rejectedAt, rejectedReason: session.rejectedReason,
    investigationReason: session.investigationReason, revision: session.revision,
    submittedAt: session.submittedAt, createdAt: session.createdAt, updatedAt: session.updatedAt,
    note: session.note
});
const details = async (tx: DB, id: string, actor: Actor) => {
    const s = await readSession(tx, id); see(s, actor);
    const entries = await tx.stocktakeEntry.findMany({ where: { stockCountId: id },
        include: { history: { orderBy: { revision: 'asc' } } },
        orderBy: [{ ingredientId: 'asc' }, { batchId: 'asc' }] });
    const scope = asScope(s.scope);
    const ingredients = await tx.ingredient.findMany({ where: { id: { in: scope } },
        select: { id: true, movementCursor: true, quantity: true, reserved: true,
            batches: { select: { id: true, batchCode: true, quantityRemaining: true,
                expirationDate: true, qualityStatus: true } } } });
    const scoped = new Set(entries.map(e => e.batchId));
    return {
        session: dtoSession(s), entries: entries.map(dtoEntry),
        counted: entries.filter(e => e.countedAt !== null).length,
        uncounted: entries.filter(e => e.countedAt === null).length,
        current: ingredients.map(i => ({
            ingredientId: i.id, cursor: i.movementCursor.toString(),
            physicalQty: i.quantity.toString(), reservedQty: i.reserved.toString(),
            batches: i.batches.map(b => ({ id: b.id, batchCode: b.batchCode,
                quantityRemaining: b.quantityRemaining.toString(),
                qualityStatus: b.qualityStatus, expirationDate: b.expirationDate,
                usable: isIngredientBatchUsable(b) }))
        })),
        untrackedBatches: ingredients.flatMap(i => i.batches.filter(b => !scoped.has(b.id)).map(b =>
            ({ ingredientId: i.id, batchId: b.id, quantityRemaining: b.quantityRemaining.toString() })))
    };
};
const track = async (tx: DB, ingredientId: string, from: bigint, until: bigint, batchId?: string) => {
    if (until < from) throw new HttpError(409, 'Mốc biến động không hợp lệ.');
    const rows = await tx.inventoryTransaction.findMany({ where: {
        ingredientId, movementSeq: { gt: from, lte: until },
        ...(batchId ? { batchId } : {})
    }, orderBy: { movementSeq: 'asc' } });
    const unknown = rows.filter(r => !movements.has(r.type) && !excludes.has(r.type));
    if (unknown.length) throw new HttpError(409, 'Có giao dịch chưa phân loại; cần kiểm tra lại trước khi phê duyệt.');
    return rows;
};
const signed = (rows: { type: string; quantity: Prisma.Decimal }[]) =>
    rows.reduce((sum, row) => movements.has(row.type) ? sum.add(row.quantity) : sum, zero);
const prove = async (tx: DB, ingredientId: string, from: bigint, until: bigint,
    openingQty: Prisma.Decimal, batchId: string, expected: Prisma.Decimal) => {
    const all = await track(tx, ingredientId, from, until);
    // Cursor is contiguous per ingredient; any missing movement signals an incomplete ledger.
    if (BigInt(all.length) !== until - from) throw new HttpError(409, 'Biến động tồn kho chưa đầy đủ; cần điều tra.');
    const selected = all.filter(r => r.batchId === batchId);
    if (!openingQty.add(signed(selected)).equals(expected)) {
        throw new HttpError(409, 'Tồn lô không khớp bút toán đã commit; cần kiểm kê lại.');
    }
    return selected;
};
const controlled = (tx: DB, id: string, cb: (session: Awaited<ReturnType<typeof readSession>>) => Promise<unknown>) =>
    tx.stockCount.findUnique({ where: { id } }).then(async () => {
        await tx.$queryRaw`SELECT "id" FROM "StockCount" WHERE "id" = ${id} FOR UPDATE`;
        return cb(await readSession(tx, id));
    });

export const stocktakeService = {
    async create(input: StocktakeCreateInput, actor: Actor) {
        const ids = sorted(input.ingredientIds);
        return prisma.$transaction(async tx => {
            await lockIngredients(tx, ids);
            const code = 'STK-' + input.requestId;
            const previous = await tx.stockCount.findUnique({ where: { code } });
            if (previous) {
                if (previous.kind !== 'STOCKTAKE' || previous.createdById !== actor.id ||
                    JSON.stringify(asScope(previous.scope)) !== JSON.stringify(ids) ||
                    previous.assignedCounterId !== input.assignedCounterId ||
                    (previous.note ?? '') !== (input.note ?? '')) {
                    throw new HttpError(409, 'Mã phiên kiểm kê đã được dùng với phạm vi khác.');
                }
                return { ...await details(tx, previous.id, actor), replayed: true };
            }
            const counter = await tx.user.findFirst({ where: { id: input.assignedCounterId, isActive: true,
                role: { in: [UserRole.ADMIN, UserRole.STAFF] } }, select: { id: true } });
            if (!counter) throw new HttpError(400, 'Nhân viên được phân công không hợp lệ.');
            const ingredients = await tx.ingredient.findMany({
                where: { id: { in: ids }, isActive: true, deletedAt: null },
                include: { batches: true }, orderBy: { id: 'asc' }
            });
            if (ingredients.length !== ids.length || ingredients.some(i => i.batches.length === 0)) {
                throw new HttpError(409, 'Phạm vi có nguyên liệu không hoạt động hoặc chưa có lô cần kiểm kê.');
            }
            const existing = await tx.stockCount.findMany({ where: { kind: 'STOCKTAKE',
                status: { in: active }, stocktakeEntries: { some: { ingredientId: { in: ids } } } },
                select: { id: true }, take: 1 });
            if (existing.length) throw new HttpError(409, 'Nguyên liệu đã thuộc phiên kiểm kê chưa kết thúc.');
            for (const ingredient of ingredients) {
                const aggregate = ingredient.batches.reduce((sum, b) => sum.add(b.quantityRemaining), zero);
                if (!aggregate.equals(ingredient.quantity)) {
                    throw new HttpError(409, 'Tồn tổng và tồn lô hiện không khớp; cần đối soát trước khi mở phiên.');
                }
            }
            const created = await tx.stockCount.create({ data: { code, kind: 'STOCKTAKE',
                scope: ids, status: StockCountStatus.DRAFT, createdById: actor.id,
                assignedCounterId: input.assignedCounterId, note: input.note ?? null,
                stocktakeEntries: { create: ingredients.flatMap(i => i.batches.map(b => ({
                    ingredientId: i.id, batchId: b.id, openingQty: b.quantityRemaining,
                    openingCursor: i.movementCursor, openingQualityStatus: b.qualityStatus,
                    openingExpirationDate: b.expirationDate
                }))) } } });
            return { ...await details(tx, created.id, actor), replayed: false };
        }, { timeout: 20000 });
    },

    async get(id: string, actor: Actor) {
        return prisma.$transaction(tx => details(tx, id, actor), {
            isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 15000
        });
    },

    async save(id: string, input: StocktakeEntryInput, actor: Actor) {
        return prisma.$transaction(async tx => {
            const draft = await readSession(tx, id);
            countPermission(draft, actor);
            const scope = asScope(draft.scope);
            await lockIngredients(tx, scope);
            return controlled(tx, id, async session => {
                const replay = await action(tx, input.requestId, id, 'COUNT', actor, input);
                if (replay) return { ...await details(tx, id, actor), replayed: true };
                if (session.status !== StockCountStatus.DRAFT) throw new HttpError(409, 'Phiên đã được nộp, không thể sửa số đếm.');
                const batch = await tx.ingredientBatch.findUnique({ where: { id: input.batchId } });
                if (!batch || !scope.includes(batch.ingredientId)) throw new HttpError(404, 'Lô không thuộc phạm vi được phân công.');
                const ingredient = await tx.ingredient.findUniqueOrThrow({ where: { id: batch.ingredientId } });
                if (BigInt(input.expectedCursor) !== ingredient.movementCursor) {
                    throw new HttpError(409, 'Tồn kho đã biến động trong khi đếm; đọc lại mốc mới và kiểm kê lại.');
                }
                let entry = await tx.stocktakeEntry.findUnique({
                    where: { stockCountId_batchId: { stockCountId: id, batchId: batch.id } }
                });
                if (!entry) {
                    if (input.expectedRevision !== 0) throw new HttpError(409, 'Phiên bản của lô mới không hợp lệ.');
                    // A batch received after opening belongs to the original ingredient scope.
                    const [first] = await tx.stocktakeEntry.findMany({ where: {
                        stockCountId: id, ingredientId: batch.ingredientId
                    }, take: 1 });
                    if (!first) throw new HttpError(409, 'Thiếu thông tin mở phiên cho nguyên liệu.');
                    entry = await tx.stocktakeEntry.create({ data: { stockCountId: id,
                        ingredientId: batch.ingredientId, batchId: batch.id, openingQty: zero,
                        openingCursor: first.openingCursor, openingQualityStatus: batch.qualityStatus,
                        openingExpirationDate: batch.expirationDate, presentAtOpen: false } });
                }
                if (input.expectedRevision !== entry.revision) {
                    throw new HttpError(409, 'Số đếm đã được cập nhật bởi yêu cầu khác; cần tải lại phiên bản.');
                }
                await prove(tx, batch.ingredientId, entry.openingCursor, ingredient.movementCursor,
                    entry.openingQty, batch.id, batch.quantityRemaining);
                const measured = new Prisma.Decimal(input.actualQty);
                const version = entry.revision + 1;
                await tx.stocktakeEntryHistory.create({ data: { entryId: entry.id, revision: version,
                    previousQty: entry.observedQty, newQty: measured, actorId: actor.id, reason: input.reason } });
                await tx.stocktakeEntry.update({ where: { id: entry.id }, data: {
                    observedQty: measured, expectedAtCount: batch.quantityRemaining,
                    varianceQty: measured.sub(batch.quantityRemaining),
                    observedCursor: ingredient.movementCursor, countedAt: new Date(), countedById: actor.id,
                    reason: input.reason, reasonCategory: input.reasonCategory, revision: version
                } });
                await tx.stockCount.update({ where: { id }, data: { revision: { increment: 1 } } });
                return { ...await details(tx, id, actor), replayed: false };
            });
        }, { timeout: 20000 });
    },

    async submit(id: string, input: StocktakeSubmitInput, actor: Actor) {
        return prisma.$transaction(async tx => {
            const draft = await readSession(tx, id);
            countPermission(draft, actor);
            await lockIngredients(tx, asScope(draft.scope));
            return controlled(tx, id, async s => {
                const replay = await action(tx, input.requestId, id, 'SUBMIT', actor, input);
                if (replay) return { ...await details(tx, id, actor), replayed: true };
                if (s.status !== StockCountStatus.DRAFT) throw new HttpError(409, 'Chỉ phiên nháp mới được nộp kiểm kê.');
                const result = await examine(tx, s.id, asScope(s.scope));
                if (result.missing.length) throw new HttpError(409, 'Còn lô chưa được đếm; không được xem là số lượng 0.');
                const investigation = result.ambiguous.length ? result.ambiguous.join('; ') : null;
                const status = investigation ? StockCountStatus.NEEDS_INVESTIGATION : StockCountStatus.PENDING_APPROVAL;
                await tx.stockCount.update({ where: { id }, data: {
                    status, submittedAt: new Date(), investigationReason: investigation,
                    revision: { increment: 1 }
                } });
                return { ...await details(tx, id, actor), replayed: false };
            });
        }, { timeout: 20000 });
    },

    async approve(id: string, input: StocktakeSubmitInput, actor: Actor) {
        admin(actor);
        return prisma.$transaction(async tx => {
            const s = await readSession(tx, id);
            await lockIngredients(tx, asScope(s.scope));
            return controlled(tx, id, async current => {
                const replay = await action(tx, input.requestId, id, 'APPROVE', actor, input);
                if (replay) return { ...await details(tx, id, actor), replayed: true };
                if (current.status !== StockCountStatus.PENDING_APPROVAL) throw new HttpError(409, 'Phiếu chưa đủ điều kiện phê duyệt.');
                if (current.assignedCounterId === actor.id) {
                    throw new HttpError(403, 'Người trực tiếp kiểm đếm không được tự phê duyệt kết quả.');
                }
                const examination = await examine(tx, id, asScope(current.scope));
                if (examination.missing.length || examination.ambiguous.length) {
                    await tx.stockCount.update({ where: { id }, data: { status: StockCountStatus.NEEDS_INVESTIGATION,
                        investigationReason: [...examination.missing, ...examination.ambiguous].join('; ') } });
                    return { ...await details(tx, id, actor), replayed: false, blockedForInvestigation: true };
                }
                const entries = await tx.stocktakeEntry.findMany({ where: { stockCountId: id } });
                const deltas = entries.filter(e => e.varianceQty && !e.varianceQty.isZero());
                const byIngredient = new Map<string, typeof deltas>();
                for (const e of deltas) byIngredient.set(e.ingredientId, [...(byIngredient.get(e.ingredientId) ?? []), e]);
                for (const [ingredientId, changes] of byIngredient) {
                    const ingredient = await tx.ingredient.findUniqueOrThrow({ where: { id: ingredientId }, include: { batches: true } });
                    const totalDelta = changes.reduce((sum, e) => sum.add(e.varianceQty!), zero);
                    if (ingredient.quantity.add(totalDelta).lt(ingredient.reserved) || ingredient.quantity.add(totalDelta).lt(0)) {
                        throw new HttpError(409, 'Điều chỉnh xâm phạm tồn đã giữ chỗ; cần kiểm kê lại.');
                    }
                    const transfer = changes.length === 2 && totalDelta.isZero() &&
                        changes.every(e => e.reasonCategory === 'WRONG_LOT');
                    if (changes.some(e => e.reasonCategory === 'WRONG_LOT') && !transfer) {
                        throw new HttpError(409, 'Chuyển lô cần đúng hai lô với tổng thay đổi bằng 0.');
                    }
                    if (transfer) {
                        const affected = changes.map(e => ingredient.batches.find(b => b.id === e.batchId));
                        if (affected.some(b => !b || !isIngredientBatchUsable(b))) {
                            throw new HttpError(409, 'Không thể chuyển lô hết hạn hoặc bị cách ly.');
                        }
                    }
                    const allBatches = ingredient.batches.map(b => ({
                        ...b, newQty: b.quantityRemaining.add(changes.find(e => e.batchId === b.id)?.varianceQty ?? zero)
                    }));
                    if (allBatches.some(b => b.newQty.lt(0))) {
                        throw new HttpError(409, 'Điều chỉnh khiến lô âm.');
                    }
                    const usableAfter = allBatches.reduce((sum, b) => isIngredientBatchUsable(b) ? sum.add(b.newQty) : sum, zero);
                    if (usableAfter.lt(ingredient.reserved)) {
                        throw new HttpError(409, 'Điều chỉnh làm giảm tồn có thể bán dưới phần đã giữ chỗ.');
                    }
                    for (const e of changes) {
                        const batch = ingredient.batches.find(b => b.id === e.batchId)!;
                        await tx.ingredientBatch.update({ where: { id: e.batchId },
                            data: { quantityRemaining: { increment: e.varianceQty! } } });
                        await tx.inventoryTransaction.create({ data: {
                            ingredientId, batchId: e.batchId, type: 'ADJUSTMENT',
                            quantity: e.varianceQty!, unitCost: batch.unitCost,
                            totalCost: e.varianceQty!.mul(batch.unitCost).toDecimalPlaces(2),
                            referenceType: transfer ? 'StocktakeTransfer' : 'Stocktake',
                            referenceId: id, idempotencyKey: `stocktake:${id}:${e.id}`,
                            performedBy: actor.id, reason: e.reason
                        } });
                    }
                    await tx.ingredient.update({ where: { id: ingredientId }, data: {
                        ...(totalDelta.isZero() ? {} : { quantity: { increment: totalDelta } }),
                        rowVersion: { increment: 1 }
                    } });
                }
                await tx.stockCount.update({ where: { id }, data: {
                    status: StockCountStatus.COMPLETED, approvedById: actor.id,
                    approvedAt: new Date(), revision: { increment: 1 }
                } });
                return { ...await details(tx, id, actor), replayed: false };
            });
        }, { timeout: 25000 });
    },

    async reject(id: string, input: StocktakeDecisionInput, actor: Actor) {
        admin(actor);
        return prisma.$transaction(async tx => {
            const s = await readSession(tx, id);
            await lockIngredients(tx, asScope(s.scope));
            return controlled(tx, id, async current => {
                const replay = await action(tx, input.requestId, id, 'REJECT', actor, input);
                if (replay) return { ...await details(tx, id, actor), replayed: true };
                if (current.status !== StockCountStatus.PENDING_APPROVAL &&
                    current.status !== StockCountStatus.NEEDS_INVESTIGATION) {
                    throw new HttpError(409, 'Phiếu đã có quyết định cuối cùng.');
                }
                await tx.stockCount.update({ where: { id }, data: { status: StockCountStatus.REJECTED,
                    rejectedById: actor.id, rejectedReason: input.reason, rejectedAt: new Date(),
                    revision: { increment: 1 } } });
                return { ...await details(tx, id, actor), replayed: false };
            });
        }, { timeout: 15000 });
    },

    async reopen(id: string, input: StocktakeDecisionInput, actor: Actor) {
        admin(actor);
        return prisma.$transaction(async tx => {
            const s = await readSession(tx, id);
            await lockIngredients(tx, asScope(s.scope));
            return controlled(tx, id, async current => {
                const replay = await action(tx, input.requestId, id, 'REOPEN', actor, input);
                if (replay) return { ...await details(tx, id, actor), replayed: true };
                if (current.status !== StockCountStatus.NEEDS_INVESTIGATION) {
                    throw new HttpError(409, 'Chỉ phiên cần điều tra mới được yêu cầu đếm lại.');
                }
                // The immutable StocktakeEntryHistory keeps earlier measurements and actors.
                await tx.stocktakeEntry.updateMany({ where: { stockCountId: id }, data: {
                    countedAt: null, observedQty: null, expectedAtCount: null,
                    varianceQty: null, observedCursor: null, countedById: null,
                    reasonCategory: null, revision: { increment: 1 }
                } });
                await tx.stockCount.update({ where: { id }, data: {
                    status: StockCountStatus.DRAFT, investigationReason: input.reason,
                    revision: { increment: 1 }
                } });
                return { ...await details(tx, id, actor), replayed: false };
            });
        }, { timeout: 20000 });
    }
};

// Reconcile at both SUBMIT and APPROVE under locks, never assuming createdAt commit ordering.
async function examine(tx: DB, sessionId: string, scope: string[]) {
    const entries = await tx.stocktakeEntry.findMany({ where: { stockCountId: sessionId } });
    const missing: string[] = [], ambiguous: string[] = [];
    const ingredients = await tx.ingredient.findMany({ where: { id: { in: scope } },
        include: { batches: true } });
    for (const ingredient of ingredients) {
        const known = new Set(entries.filter(e => e.ingredientId === ingredient.id).map(e => e.batchId));
        const aggregate = ingredient.batches.reduce((sum, batch) => sum.add(batch.quantityRemaining), zero);
        if (!aggregate.equals(ingredient.quantity)) ambiguous.push(`Ingredient ${ingredient.id}: aggregate mismatch`);
        for (const batch of ingredient.batches) {
            if (!known.has(batch.id)) missing.push(`new lot ${batch.id}`);
        }
        for (const entry of entries.filter(e => e.ingredientId === ingredient.id)) {
            if (!entry.countedAt || entry.observedCursor === null || entry.expectedAtCount === null ||
                entry.observedQty === null || entry.varianceQty === null) {
                // Zero cursor and zero physical quantity are valid; only null is uncounted.
                missing.push(entry.batchId);
                continue;
            }
            const batch = ingredient.batches.find(b => b.id === entry.batchId);
            if (!batch) { ambiguous.push(`missing original batch ${entry.batchId}`); continue; }
            try {
                await prove(tx, ingredient.id, entry.openingCursor, entry.observedCursor,
                    entry.openingQty, entry.batchId, entry.expectedAtCount);
                const after = await prove(tx, ingredient.id, entry.observedCursor, ingredient.movementCursor,
                    entry.expectedAtCount, entry.batchId, batch.quantityRemaining);
                if (!entry.observedQty.sub(entry.expectedAtCount).equals(entry.varianceQty)) {
                    ambiguous.push(`changed count evidence ${entry.batchId}`);
                }
                if (!entry.varianceQty.isZero() && (
                    entry.reasonCategory === 'UNEXPLAINED' ||
                    entry.reasonCategory === 'VERIFIED_WASTE' ||
                    (entry.varianceQty.lt(0) && after.some(row => row.type === 'WASTE'))
                )) ambiguous.push(`waste/unexplained variance requires investigation ${entry.batchId}`);
            } catch (error) {
                ambiguous.push(`unproven movement ${entry.batchId}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
    return { missing, ambiguous };
}
