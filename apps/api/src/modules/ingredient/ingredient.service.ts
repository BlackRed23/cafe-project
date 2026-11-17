import { InventoryTransactionType, prisma, Prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';
import { isIngredientBatchUsable } from '../../common/ingredient-batch-availability';
import {
    allocateFifoBatches,
    calculateMovingAverageCost,
    roundCost4,
    roundMoney2,
    roundQty3,
    toDecimal
} from '../../common/ingredient-cost.utils';
import { convertToBaseQuantity } from '../../common/unit-conversion';
import { scanInventoryViaAgentService } from '../agent/agent.client';
import { recalculateCostsForIngredient } from '../recipe/recipe.service';
import {
    ingredientInclude,
    ingredientRepository,
    type IngredientRecord,
    type IngredientTransactionRecord
} from './ingredient.repository';
import type {
    CreateIngredientInput,
    ImportIngredientInput,
    IngredientFiltersInput,
    UpdateIngredientInput,
    WasteIngredientInput
} from './ingredient.validator';

export type IngredientStatus = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';

const getIngredientStatus = (availableQty: Prisma.Decimal, minThreshold: Prisma.Decimal): IngredientStatus => {
    if (availableQty.lte(0)) return 'OUT_OF_STOCK';
    if (availableQty.lte(minThreshold)) return 'LOW_STOCK';
    return 'IN_STOCK';
};

export const toIngredientDto = (ingredient: IngredientRecord) => {
    const qty = toDecimal(ingredient.quantity);
    const reserved = toDecimal(ingredient.reserved);
    const now = new Date();
    const expired = (ingredient.batches ?? []).reduce((sum, batch) =>
        isIngredientBatchUsable(batch, now) ? sum : sum.add(batch.quantityRemaining),
        new Prisma.Decimal(0));
    const available = roundQty3(Prisma.Decimal.max(0, qty.sub(expired).sub(reserved)));
    const minThreshold = toDecimal(ingredient.minThreshold);
    const costPerBaseUnit = toDecimal(ingredient.costPerBaseUnit);

    const batches = (ingredient.batches ?? []).map((b) => {
        const rem = toDecimal(b.quantityRemaining);
        const uCost = toDecimal(b.unitCost);
        return {
            id: b.id,
            qualityStatus: b.qualityStatus,
            usableQuantity: isIngredientBatchUsable(b, now) ? Number(rem) : 0,
            batchCode: b.batchCode,
            quantityInitial: Number(b.quantityInitial),
            quantityRemaining: Number(rem),
            unitCost: Number(uCost),
            batchValue: Number(roundMoney2(rem.mul(uCost))),
            expirationDate: b.expirationDate,
            receivedAt: b.receivedAt,
            supplierId: b.supplierId,
            receivedQty: b.receivedQty !== null ? Number(b.receivedQty) : null,
            receivedUnit: b.receivedUnit,
            note: b.note
        };
    });

    const batchStockValue = (ingredient.batches ?? []).reduce(
        (sum, b) => sum.add(toDecimal(b.quantityRemaining).mul(toDecimal(b.unitCost))),
        new Prisma.Decimal(0)
    );
    const stockValue = (ingredient.batches && ingredient.batches.length > 0)
        ? roundMoney2(batchStockValue)
        : roundMoney2(qty.mul(costPerBaseUnit));

    return {
        id: ingredient.id,
        sku: ingredient.sku,
        name: ingredient.name,
        categoryId: ingredient.categoryId,
        category: ingredient.category,
        baseUnit: ingredient.baseUnit,
        costPerBaseUnit: Number(costPerBaseUnit),
        quantity: Number(qty),
        physicalQuantity: Number(qty),
        usableQuantity: Number(Prisma.Decimal.max(0, qty.sub(expired))),
        reserved: Number(reserved),
        availableQuantity: Number(available),
        minThreshold: Number(minThreshold),
        stockValue: Number(stockValue),
        status: getIngredientStatus(available, minThreshold),
        origin: ingredient.origin,
        storageInstructions: ingredient.storageInstructions,
        expiryInfo: ingredient.expiryInfo,
        shelfLifeDays: ingredient.shelfLifeDays,
        expiryClassification: ingredient.expiryClassification,
        expiryClassificationRequired: ingredient.expiryClassificationRequired,
        imageUrl: ingredient.imageUrl,
        isActive: ingredient.isActive,
        rowVersion: ingredient.rowVersion,
        batches,
        createdAt: ingredient.createdAt,
        updatedAt: ingredient.updatedAt
    };
};

export const toIngredientTransactionDto = (txRecord: IngredientTransactionRecord) => ({
    id: txRecord.id,
    ingredientId: txRecord.ingredientId,
    batchId: txRecord.batchId,
    batchCode: txRecord.batch?.batchCode ?? null,
    type: txRecord.type,
    quantity: Number(txRecord.quantity),
    unitCost: Number(txRecord.unitCost),
    totalCost: Number(txRecord.totalCost),
    referenceType: txRecord.referenceType,
    referenceId: txRecord.referenceId,
    orderItemId: txRecord.orderItemId,
    wasteReason: txRecord.wasteReason,
    reason: txRecord.reason,
    performedBy: txRecord.performedByUser?.name ?? null,
    performedByEmail: txRecord.performedByUser?.email ?? null,
    createdAt: txRecord.createdAt
});

const createSkuBase = (name: string): string => {
    const base = name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return `ING-${base.slice(0, 80).replace(/-+$/g, '') || 'ITEM'}`;
};

const generateUniqueIngredientSku = async (name: string, ignoreId?: string): Promise<string> => {
    const base = createSkuBase(name);
    let suffix = 1;
    while (true) {
        const sku = suffix === 1 ? base : `${base}-${suffix}`;
        const existing = await ingredientRepository.findBySku(sku);
        if (!existing || existing.id === ignoreId) {
            return sku;
        }
        suffix++;
    }
};

export const ingredientService = {
    async calculateReorderQuantity(input: { ingredientId: string; supplierId?: string }, now = new Date()) {
        const from = new Date(now.getTime() - 30 * 86400000);
        const snapshot = await ingredientRepository.planningSnapshot(input.ingredientId, from, now);
        if (!snapshot?.ingredient || !snapshot.ingredient.isActive || snapshot.ingredient.deletedAt) throw new HttpError(404, 'Active ingredient not found.');
        const { supplierService } = await import('../supplier/supplier.service');
        const { getReorderPlanningSettings } = await import('../system-setting/system-setting.service');
        const { calculateIngredientReorder } = await import('../../common/ingredient-reorder');
        const suppliers = await supplierService.findIngredientSuppliers(input.ingredientId);
        const candidates = suppliers.filter(s => !input.supplierId || s.supplierId === input.supplierId)
            .sort((a, b) => Number(b.isPreferred) - Number(a.isPreferred) || a.pricePerBaseUnit - b.pricePerBaseUnit ||
                a.leadTimeDays - b.leadTimeDays || a.supplierId.localeCompare(b.supplierId));
        if (!candidates.length) throw new HttpError(409, 'No eligible supplier.', 'BLOCKED');
        return calculateIngredientReorder(snapshot.ingredient, snapshot.consumption, candidates[0]!, await getReorderPlanningSettings(), from, now);
    },
    async list(filters: IngredientFiltersInput) {
        const records = await ingredientRepository.findMany({
            search: filters.search,
            categoryId: filters.categoryId,
            includeInactive: filters.includeInactive === 'true'
        });

        const dtos = records.map(toIngredientDto);
        if (filters.lowStock === 'true') {
            return dtos.filter((d) => d.status === 'LOW_STOCK' || d.status === 'OUT_OF_STOCK');
        }
        return dtos;
    },

    async getById(id: string) {
        const record = await ingredientRepository.findById(id);
        if (!record) {
            throw new HttpError(404, 'Không tìm thấy nguyên liệu.');
        }
        return toIngredientDto(record);
    },

    async create(input: CreateIngredientInput) {
        const sku = input.sku?.trim() || (await generateUniqueIngredientSku(input.name));
        const existingSku = await ingredientRepository.findBySku(sku);
        if (existingSku) {
            throw new HttpError(409, 'Mã SKU nguyên liệu đã tồn tại.');
        }

        const created = await prisma.ingredient.create({
            data: {
                sku,
                name: input.name.trim(),
                categoryId: input.categoryId || null,
                baseUnit: input.baseUnit.trim(),
                costPerBaseUnit: roundCost4(toDecimal(input.costPerBaseUnit ?? 0)),
                minThreshold: roundQty3(toDecimal(input.minThreshold ?? 0)),
                origin: input.origin?.trim() || null,
                storageInstructions: input.storageInstructions?.trim() || null,
                expiryInfo: input.expiryInfo?.trim() || null,
                shelfLifeDays: input.shelfLifeDays ?? null,
                expiryClassification: input.expiryClassification ?? null,
                imageUrl: input.imageUrl?.trim() || null,
                isActive: input.isActive ?? true
            },
            include: ingredientInclude
        });

        return toIngredientDto(created);
    },

    async update(id: string, input: UpdateIngredientInput) {
        let existing = await ingredientRepository.findById(id);
        if (!existing) {
            throw new HttpError(404, 'Không tìm thấy nguyên liệu.');
        }

        if (input.sku && input.sku.trim() !== existing.sku) {
            const skuExists = await ingredientRepository.findBySku(input.sku.trim());
            if (skuExists && skuExists.id !== id) {
                throw new HttpError(409, 'Mã SKU nguyên liệu đã tồn tại.');
            }
        }

        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            await tx.$queryRaw`SELECT "id" FROM "Ingredient" WHERE "id" = ${id} FOR UPDATE`;
            const current = await ingredientRepository.findById(id, tx);
            if (!current) throw new HttpError(404, 'Không tìm thấy nguyên liệu.');
            existing = current;
            if (input.baseUnit !== undefined && input.baseUnit.trim() !== existing.baseUnit) {
                const used = await tx.ingredient.findFirst({
                    where: { id, OR: [
                        { quantity: { not: 0 } }, { reserved: { not: 0 } },
                        { batches: { some: {} } }, { transactions: { some: {} } },
                        { recipeItems: { some: {} } }, { toppingItems: { some: {} } },
                        { supplierLinks: { some: {} } }, { purchaseItems: { some: {} } },
                        { stockCountItems: { some: {} } }
                    ] }, select: { id: true }
                });
                if (used) throw new HttpError(409, 'Cannot change base unit after stock or business references exist. Use input-unit conversion instead.');
            }
            const costChanged =
                input.costPerBaseUnit !== undefined &&
                !roundCost4(toDecimal(input.costPerBaseUnit)).equals(toDecimal(existing.costPerBaseUnit));

            const updated = await tx.ingredient.update({
                where: { id },
                data: {
                    ...(input.sku !== undefined ? { sku: input.sku.trim() } : {}),
                    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
                    ...(input.categoryId !== undefined ? { categoryId: input.categoryId || null } : {}),
                    ...(input.baseUnit !== undefined ? { baseUnit: input.baseUnit.trim() } : {}),
                    ...(input.costPerBaseUnit !== undefined
                        ? { costPerBaseUnit: roundCost4(toDecimal(input.costPerBaseUnit)) }
                        : {}),
                    ...(input.minThreshold !== undefined
                        ? { minThreshold: roundQty3(toDecimal(input.minThreshold)) }
                        : {}),
                    ...(input.origin !== undefined ? { origin: input.origin?.trim() || null } : {}),
                    ...(input.storageInstructions !== undefined
                        ? { storageInstructions: input.storageInstructions?.trim() || null }
                        : {}),
                    ...(input.expiryInfo !== undefined ? { expiryInfo: input.expiryInfo?.trim() || null } : {}),
                    ...(input.expiryClassification !== undefined ? { expiryClassification: input.expiryClassification } : {}),
                    ...(input.shelfLifeDays !== undefined ? { shelfLifeDays: input.shelfLifeDays ?? null } : {}),
                    ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl?.trim() || null } : {}),
                    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
                    rowVersion: { increment: 1 }
                },
                include: ingredientInclude
            });

            if (costChanged) {
                await recalculateCostsForIngredient(id, tx);
            }

            return toIngredientDto(updated);
        });
    },

    async softDelete(id: string) {
        const existing = await ingredientRepository.findById(id);
        if (!existing) {
            throw new HttpError(404, 'Không tìm thấy nguyên liệu.');
        }

        const activeRecipesCount = await ingredientRepository.countActiveRecipeUsage(id);
        if (activeRecipesCount > 0) {
            throw new HttpError(
                409,
                `Không thể xóa nguyên liệu "${existing.name}" vì đang được sử dụng trong ${activeRecipesCount} công thức đang hoạt động.`
            );
        }

        const deleted = await prisma.ingredient.update({
            where: { id },
            data: {
                isActive: false,
                deletedAt: new Date(),
                rowVersion: { increment: 1 }
            },
            include: ingredientInclude
        });

        return toIngredientDto(deleted);
    },

    async importStock(id: string, input: ImportIngredientInput, userId: string) {
        const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            await tx.$queryRaw`SELECT "id" FROM "Ingredient" WHERE "id" = ${id} FOR UPDATE`;
            const ingredient = await ingredientRepository.findById(id, tx);
            if (!ingredient) {
                throw new HttpError(404, 'Không tìm thấy nguyên liệu.');
            }

            const inputUnit = input.unit?.trim() || ingredient.baseUnit;
            const importQtyBase = convertToBaseQuantity(input.quantity, inputUnit, ingredient.baseUnit);

            if (!ingredient.expiryClassification && ingredient.expiryClassificationRequired) {
                throw new HttpError(409, 'Classify new ingredient expiry policy before receipt.');
            }
            if (ingredient.expiryClassification === 'PERISHABLE' && !input.expirationDate) {
                throw new HttpError(400, 'PERISHABLE ingredient requires an explicit valid expirationDate.');
            }

            let unitCostPerBase: Prisma.Decimal;
            let totalCostMoney: Prisma.Decimal;

            if (input.totalCost !== undefined) {
                totalCostMoney = roundMoney2(toDecimal(input.totalCost));
                unitCostPerBase = roundCost4(totalCostMoney.div(importQtyBase));
            } else {
                // input.unitCost là đơn giá theo đơn vị nhập (inputUnit)
                const costPerInputUnit = toDecimal(input.unitCost ?? 0);
                const totalRaw = costPerInputUnit.mul(toDecimal(input.quantity));
                totalCostMoney = roundMoney2(totalRaw);
                unitCostPerBase = roundCost4(totalRaw.div(importQtyBase));
            }

            const newMovingAvgCost = calculateMovingAverageCost(
                ingredient.quantity,
                ingredient.costPerBaseUnit,
                importQtyBase,
                unitCostPerBase
            );

            let expirationDate: Date | null = null;
            if (input.expirationDate) {
                expirationDate = new Date(input.expirationDate);
                const datePart = input.expirationDate.slice(0, 10);
                const calendarDay = new Date(`${datePart}T00:00:00.000Z`);
                if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(input.expirationDate) ||
                    !Number.isFinite(expirationDate.getTime()) || !Number.isFinite(calendarDay.getTime()) ||
                    calendarDay.toISOString().slice(0, 10) !== datePart) {
                    throw new HttpError(400, 'Ngày hết hạn của lô nguyên liệu không hợp lệ.');
                }
            } else if (ingredient.shelfLifeDays) {
                expirationDate = new Date();
                expirationDate.setDate(expirationDate.getDate() + ingredient.shelfLifeDays);
            }

            const batchCode =
                input.batchCode?.trim() ||
                `${ingredient.sku}-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;

            const batch = await tx.ingredientBatch.create({
                data: {
                    ingredientId: ingredient.id,
                    batchCode,
                    quantityInitial: importQtyBase,
                    quantityRemaining: importQtyBase,
                    unitCost: unitCostPerBase,
                    expirationDate,
                    supplierId: input.supplierId || null,
                    receivedQty: roundQty3(toDecimal(input.quantity)),
                    receivedUnit: inputUnit,
                    note: input.note?.trim() || null
                }
            });

            await tx.inventoryTransaction.create({
                data: {
                    ingredientId: ingredient.id,
                    batchId: batch.id,
                    type: InventoryTransactionType.IMPORT,
                    quantity: importQtyBase,
                    unitCost: unitCostPerBase,
                    totalCost: totalCostMoney,
                    referenceType: 'ManualImport',
                    referenceId: batch.id,
                    performedBy: userId,
                    reason:
                        input.note?.trim() ||
                        `Nhập kho nguyên liệu ${input.quantity} ${inputUnit} (${importQtyBase.toString()} ${ingredient.baseUnit})`
                }
            });

            await tx.ingredient.update({
                where: { id: ingredient.id },
                data: {
                    quantity: { increment: importQtyBase },
                    costPerBaseUnit: newMovingAvgCost,
                    rowVersion: { increment: 1 }
                }
            });

            const recalculatedProducts = await recalculateCostsForIngredient(ingredient.id, tx);
            const updated = await ingredientRepository.findById(ingredient.id, tx);

            return {
                ingredient: toIngredientDto(updated!),
                batch: {
                    id: batch.id,
                    batchCode: batch.batchCode,
                    importedQuantityBase: Number(importQtyBase),
                    unitCostPerBase: Number(unitCostPerBase),
                    totalCost: Number(totalCostMoney)
                },
                recalculatedProductCount: recalculatedProducts.length
            };
        });

        scanInventoryViaAgentService(
            {
                ingredientIds: [id],
                scope: 'INGREDIENT',
                triggerType: 'INGREDIENT_IMPORTED',
                sourceType: 'INGREDIENT',
                sourceId: id,
                note: 'Ingredient stock imported'
            },
            userId
        ).catch(() => {
            console.error('[AI_AGENT] Failed to scan ingredient after stock import');
        });

        return result;
    },

    async recordWaste(id: string, input: WasteIngredientInput, userId: string) {
        const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            await tx.$queryRaw`SELECT "id" FROM "Ingredient" WHERE "id" = ${id} FOR UPDATE`;
            const ingredient = await ingredientRepository.findById(id, tx);
            if (!ingredient) {
                throw new HttpError(404, 'Không tìm thấy nguyên liệu.');
            }

            const inputUnit = input.unit?.trim() || ingredient.baseUnit;
            const wasteQtyBase = convertToBaseQuantity(input.quantity, inputUnit, ingredient.baseUnit);
            const available = toDecimal(ingredient.quantity).sub(toDecimal(ingredient.reserved));

            if (available.lt(wasteQtyBase)) {
                throw new HttpError(
                    400,
                    `Số lượng hao hụt (${wasteQtyBase.toString()} ${ingredient.baseUnit}) vượt quá tồn kho khả dụng (${available.toString()} ${ingredient.baseUnit}).`
                );
            }

            let candidateBatches = ingredient.batches;
            if (input.batchId) {
                const chosen = ingredient.batches.find((b) => b.id === input.batchId);
                if (!chosen) {
                    throw new HttpError(404, 'Không tìm thấy lô nguyên liệu được chọn hoặc lô đã hết.');
                }
                candidateBatches = [chosen];
            }

            const { allocations, totalCost } = allocateFifoBatches(
                candidateBatches,
                wasteQtyBase,
                ingredient.name
            );

            for (const alloc of allocations) {
                await tx.ingredientBatch.update({
                    where: { id: alloc.batchId },
                    data: { quantityRemaining: { decrement: alloc.quantity } }
                });

                await tx.inventoryTransaction.create({
                    data: {
                        ingredientId: ingredient.id,
                        batchId: alloc.batchId,
                        type: InventoryTransactionType.WASTE,
                        quantity: alloc.quantity.neg(),
                        unitCost: alloc.unitCost,
                        totalCost: alloc.totalCost,
                        wasteReason: input.wasteReason,
                        referenceType: 'Waste',
                        performedBy: userId,
                        reason: input.note?.trim() || `Hao hụt nguyên liệu (${input.wasteReason})`
                    }
                });
            }

            await tx.ingredient.update({
                where: { id: ingredient.id },
                data: {
                    quantity: { decrement: wasteQtyBase },
                    rowVersion: { increment: 1 }
                }
            });

            const updated = await ingredientRepository.findById(ingredient.id, tx);
            return {
                ingredient: toIngredientDto(updated!),
                wastedQuantityBase: Number(wasteQtyBase),
                totalWasteCost: Number(totalCost)
            };
        });

        scanInventoryViaAgentService(
            {
                ingredientIds: [id],
                scope: 'INGREDIENT',
                triggerType: 'INGREDIENT_WASTE',
                sourceType: 'INGREDIENT',
                sourceId: id,
                note: `Ingredient waste recorded (${input.wasteReason})`
            },
            userId
        ).catch(() => {
            console.error('[AI_AGENT] Failed to scan ingredient after waste recorded');
        });

        return result;
    },

    async getTransactions(id: string) {
        const ingredient = await ingredientRepository.findById(id);
        if (!ingredient) {
            throw new HttpError(404, 'Không tìm thấy nguyên liệu.');
        }
        const records = await ingredientRepository.findTransactions(id);
        return records.map(toIngredientTransactionDto);
    }
};
