import { InventoryTransactionType, type Prisma } from '@cafe-project/database';
import { prisma } from '@cafe-project/database';
import { HttpError } from '../../common/http-error';

const inventoryInclude = { product: true } satisfies Prisma.InventoryInclude;
export type SaleInventoryRecord = Prisma.InventoryGetPayload<{ include: typeof inventoryInclude }>;
export type SalePlan = { inventory: SaleInventoryRecord; decrease: number };
const RESTORE_LOOKBACK_DAYS = 7;

const restoreMarker = (transactionId: string) => `[restore-of:${transactionId}]`;

export const simulateSaleRepository = {
    async findInventories(): Promise<SaleInventoryRecord[]> { return prisma.inventory.findMany({ where: { product: { isActive: true } }, include: inventoryInclude }); },
    async findInventoryByProductId(productId: string): Promise<SaleInventoryRecord | null> {
        return prisma.inventory.findUnique({ where: { productId }, include: inventoryInclude });
    },
    async applyProductSale(inventory: SaleInventoryRecord, quantity: number, note: string | null, userId: string) {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            if (!Number.isInteger(quantity) || quantity <= 0) throw new HttpError(400, 'Số lượng mô phỏng phải là số nguyên dương.');
            await tx.$queryRaw`SELECT "id" FROM "Inventory" WHERE "id" = ${inventory.id} FOR UPDATE`;
            const current = await tx.inventory.findUnique({ where: { id: inventory.id }, include: inventoryInclude });
            if (!current) throw new HttpError(404, 'Inventory not found for selected product.');

            const previousQuantity = current.quantity;
            if (previousQuantity - current.reservedStock < quantity) {
                throw new HttpError(400, `Not enough inventory for ${current.product.name}. Current stock: ${previousQuantity}, requested: ${quantity}.`);
            }

            const newQuantity = previousQuantity - quantity;

            await tx.inventory.update({ where: { id: current.id }, data: { quantity: { decrement: quantity } } });
            
            const batches = await tx.inventoryBatch.findMany({
                where: { inventoryId: current.id, quantity: { gt: 0 }, expirationDate: { gte: startOfToday } },
                orderBy: { expirationDate: 'asc' }
            });

            const totalSellable = batches.reduce((sum: number, b: any) => sum + b.quantity, 0);
            if (totalSellable < quantity) {
                throw new HttpError(400, `Không đủ lô hàng còn hạn để mô phỏng. Yêu cầu: ${quantity}, Có thể xuất: ${totalSellable}.`);
            }

            let remainingToDeduct = quantity;
            const deductionTransactions = [];

            for (const batch of batches) {
                if (remainingToDeduct <= 0) break;
                const deduction = Math.min(batch.quantity, remainingToDeduct);
                await tx.inventoryBatch.update({
                    where: { id: batch.id },
                    data: { quantity: { decrement: deduction } }
                });
                
                const txn = await tx.inventoryTransaction.create({
                    data: { productId: current.productId, performedBy: userId, type: InventoryTransactionType.SIMULATE_SALE, quantity: -deduction, reason: note ?? 'Simulate sale', legacyBatchId: batch.id }
                });
                deductionTransactions.push(txn);
                remainingToDeduct -= deduction;
            }

            if (deductionTransactions.length === 0) {
                throw new HttpError(400, 'Không tạo được giao dịch nào cho mô phỏng.');
            }
            const lastTransactionId = deductionTransactions[deductionTransactions.length - 1].id;

            return {
                productId: current.productId,
                inventoryId: current.id,
                transactionId: lastTransactionId,
                productName: current.product.name,
                stockBefore: previousQuantity,
                stockAfter: newQuantity,
                minThreshold: current.minThreshold,
                decreasedQuantity: quantity
            };
        });
    },
    async applySale(plans: SalePlan[], note: string | null, userId: string) {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const affected = [];
            for (const plan of [...plans].sort((a, b) => a.inventory.id.localeCompare(b.inventory.id))) {
                if (!Number.isInteger(plan.decrease) || plan.decrease <= 0) throw new HttpError(400, 'Số lượng mô phỏng phải là số nguyên dương.');
                await tx.$queryRaw`SELECT "id" FROM "Inventory" WHERE "id" = ${plan.inventory.id} FOR UPDATE`;
                const current = await tx.inventory.findUnique({ where: { id: plan.inventory.id } });
                if (!current) throw new HttpError(404, 'Inventory not found.');
                const previousQuantity = current.quantity;
                const decreaseQuantity = plan.decrease;
                if (previousQuantity - current.reservedStock < decreaseQuantity) throw new HttpError(409, 'Mô phỏng vượt tồn kho khả dụng.');
                const newQuantity = previousQuantity - decreaseQuantity;
                await tx.inventory.update({ where: { id: plan.inventory.id }, data: { quantity: { decrement: decreaseQuantity } } });
                
                const batches = await tx.inventoryBatch.findMany({
                    where: { inventoryId: plan.inventory.id, quantity: { gt: 0 }, expirationDate: { gte: startOfToday } },
                    orderBy: { expirationDate: 'asc' }
                });

                const totalSellable = batches.reduce((sum: number, b: any) => sum + b.quantity, 0);
                if (totalSellable < decreaseQuantity) {
                    throw new HttpError(400, `Không đủ lô hàng còn hạn. Yêu cầu: ${decreaseQuantity}, Có thể xuất: ${totalSellable}.`);
                }

                let remainingToDeduct = decreaseQuantity;
                const deductionTransactions = [];

                for (const batch of batches) {
                    if (remainingToDeduct <= 0) break;
                    const deduction = Math.min(batch.quantity, remainingToDeduct);
                    await tx.inventoryBatch.update({
                        where: { id: batch.id },
                        data: { quantity: { decrement: deduction } }
                    });
                    
                    const txn = await tx.inventoryTransaction.create({
                        data: { productId: plan.inventory.productId, performedBy: userId, type: InventoryTransactionType.SIMULATE_SALE, quantity: -deduction, reason: note ?? 'Simulate sale', legacyBatchId: batch.id }
                    });
                    deductionTransactions.push(txn);
                    remainingToDeduct -= deduction;
                }

                if (deductionTransactions.length === 0) {
                    throw new HttpError(400, 'Không tạo được giao dịch nào cho mô phỏng.');
                }
                const lastTransactionId = deductionTransactions[deductionTransactions.length - 1].id;

                affected.push({
                    productId: plan.inventory.productId,
                    inventoryId: plan.inventory.id,
                    transactionId: lastTransactionId,
                    productName: plan.inventory.product.name,
                    stockBefore: previousQuantity,
                    previousQuantity,
                    decreasedQuantity: decreaseQuantity,
                    stockAfter: newQuantity,
                    newQuantity
                });
            }
            return affected;
        });
    },
    async restoreSale(transactionId: string, userId: string) {
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const originalTransaction = await tx.inventoryTransaction.findUnique({
                where: { id: transactionId }
            });

            if (!originalTransaction || !originalTransaction.productId) {
                throw new HttpError(404, 'Simulation transaction not found.');
            }

            if (originalTransaction.type !== InventoryTransactionType.SIMULATE_SALE || Number(originalTransaction.quantity) >= 0) {
                throw new HttpError(400, 'Transaction is not a valid simulate sale transaction.');
            }

            if (originalTransaction.ingredientId) {
                const marker = restoreMarker(originalTransaction.id);
                const existingRestore = await tx.inventoryTransaction.findFirst({
                    where: {
                        productId: originalTransaction.productId,
                        type: InventoryTransactionType.ADJUSTMENT,
                        reason: { contains: marker }
                    }
                });
                if (existingRestore) {
                    throw new HttpError(409, 'Mô phỏng này đã được khôi phục trước đó.');
                }

                const groupTxns = originalTransaction.referenceId
                    ? await tx.inventoryTransaction.findMany({
                          where: {
                              referenceType: 'SimulateSaleRecipe',
                              referenceId: originalTransaction.referenceId,
                              productId: originalTransaction.productId,
                              type: InventoryTransactionType.SIMULATE_SALE
                          }
                      })
                    : [originalTransaction];

                let lastRestoreTxnId = '';
                for (const gTxn of groupTxns) {
                    if (!gTxn.ingredientId) continue;
                    const gMarker = restoreMarker(gTxn.id);
                    const gRestoredQty = Math.abs(Number(gTxn.quantity));
                    await tx.ingredient.update({
                        where: { id: gTxn.ingredientId },
                        data: { quantity: { increment: gRestoredQty } }
                    });
                    if (gTxn.batchId) {
                        await tx.ingredientBatch.update({
                            where: { id: gTxn.batchId },
                            data: { quantityRemaining: { increment: gRestoredQty } }
                        });
                    }
                    const rTxn = await tx.inventoryTransaction.create({
                        data: {
                            productId: gTxn.productId,
                            ingredientId: gTxn.ingredientId,
                            batchId: gTxn.batchId,
                            performedBy: userId,
                            type: InventoryTransactionType.ADJUSTMENT,
                            quantity: gRestoredQty,
                            reason: `Khôi phục mô phỏng bán ${gMarker}${gTxn.id !== originalTransaction.id ? ` ${marker}` : ''}`
                        }
                    });
                    lastRestoreTxnId = rTxn.id;
                }

                const cupsMatch = /\[sim-cups:(\d+)\]/.exec(originalTransaction.reason || '');
                const cupsRestored = cupsMatch ? Number(cupsMatch[1]) : Math.abs(Number(originalTransaction.quantity));
                const product = await tx.product.findUnique({
                    where: { id: originalTransaction.productId },
                    include: {
                        recipes: {
                            where: { isActive: true },
                            include: { ingredients: { include: { ingredient: true } } },
                            take: 1
                        }
                    }
                });
                const activeRecipe = product?.recipes?.[0];
                const restoredStock =
                    activeRecipe && activeRecipe.ingredients.length > 0
                        ? Math.max(
                              0,
                              Math.min(
                                  ...activeRecipe.ingredients.map((ri: any) => {
                                      const req = Number(ri.quantityBase || 0);
                                      if (req <= 0) return 999999;
                                      const avail = Math.max(0, Number(ri.ingredient?.quantity || 0) - Number(ri.ingredient?.reserved || 0));
                                      return Math.floor(avail / req);
                                  })
                              )
                          )
                        : cupsRestored;

                return {
                    transactionId: originalTransaction.id,
                    restoreTransactionId: lastRestoreTxnId,
                    productId: originalTransaction.productId,
                    inventoryId: originalTransaction.productId,
                    productName: product?.name ?? 'Sản phẩm pha chế',
                    decreasedQuantity: cupsRestored,
                    stockBeforeRestore: Math.max(0, restoredStock - cupsRestored),
                    restoredStock,
                    restored: true
                };
            }

            const target = await tx.inventory.findUnique({ where: { productId: originalTransaction.productId } });
            if (!target) throw new HttpError(404, 'Inventory not found.');
            await tx.$queryRaw`SELECT "id" FROM "Inventory" WHERE "id" = ${target.id} FOR UPDATE`;
            const sourceBatchId = originalTransaction.legacyBatchId ?? originalTransaction.batchId;
            if (!sourceBatchId) throw new HttpError(409, 'Mô phỏng không có lô nguồn cần được đối soát, không tự tạo lô.');
            const batch = await tx.inventoryBatch.findFirst({ where: { id: sourceBatchId, inventoryId: target.id } });
            if (!batch) throw new HttpError(409, 'Không tìm thấy lô nguồn để khôi phục.');
            const marker = restoreMarker(originalTransaction.id);
            const restoredQuantity = Math.abs(Number(originalTransaction.quantity));
            const existingRestore = await tx.inventoryTransaction.findFirst({
                where: {
                    productId: originalTransaction.productId,
                    type: InventoryTransactionType.ADJUSTMENT,
                    quantity: restoredQuantity,
                    reason: { contains: marker }
                }
            });

            if (existingRestore) {
                throw new HttpError(409, 'Mô phỏng này đã được khôi phục trước đó.');
            }

            const inventory = await tx.inventory.findUnique({
                where: { productId: originalTransaction.productId },
                include: inventoryInclude
            });

            if (!inventory) {
                throw new HttpError(404, 'Inventory not found for simulation transaction.');
            }

            const stockBeforeRestore = inventory.quantity;
            const restoredStock = stockBeforeRestore + restoredQuantity;

            await tx.inventory.update({
                where: { id: inventory.id },
                data: { quantity: { increment: restoredQuantity } }
            });

            await tx.inventoryBatch.update({ where: { id: batch.id }, data: { quantity: { increment: restoredQuantity } } });
            const restoreTransaction = await tx.inventoryTransaction.create({
                data: {
                    productId: originalTransaction.productId,
                    performedBy: userId,
                    type: InventoryTransactionType.ADJUSTMENT,
                    quantity: restoredQuantity,
                    legacyBatchId: batch.id,
                    reason: `Khôi phục mô phỏng bán ${marker}`
                }
            });

            return {
                transactionId: originalTransaction.id,
                restoreTransactionId: restoreTransaction.id,
                productId: inventory.productId,
                inventoryId: inventory.id,
                productName: inventory.product.name,
                decreasedQuantity: restoredQuantity,
                stockBeforeRestore,
                restoredStock,
                restored: true
            };
        });
    },
    async findRecipeProducts() {
        return prisma.product.findMany({
            where: {
                isActive: true,
                deletedAt: null,
                recipes: { some: { isActive: true } }
            },
            include: {
                recipes: {
                    where: { isActive: true },
                    include: { ingredients: { include: { ingredient: true } } },
                    take: 1
                }
            }
        });
    },
    async findRecipeProductById(productId: string) {
        return prisma.product.findUnique({
            where: { id: productId },
            include: {
                recipes: {
                    where: { isActive: true },
                    include: { ingredients: { include: { ingredient: true } } },
                    take: 1
                }
            }
        });
    },
    async applyRecipeProductSale(productId: string, quantity: number, note: string | null, userId: string) {
        const res = await this.applyRecipeSale([{ productId, decrease: quantity }], note, userId);
        return res[0] ?? null;
    },
    async applyRecipeSale(plans: Array<{ productId: string; decrease: number }>, note: string | null, userId: string) {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const affected: Array<{
                productId: string;
                inventoryId: string;
                transactionId: string;
                productName: string;
                stockBefore: number;
                previousQuantity: number;
                decreasedQuantity: number;
                stockAfter: number;
                newQuantity: number;
                minThreshold: number;
                ingredientIds: string[];
            }> = [];

            const computeDrinkAvailableCups = (recipe: any): number => {
                if (!recipe || !Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) return 0;
                const capacities = recipe.ingredients.map((ri: any) => {
                    const req = Number(ri.quantityBase || 0);
                    if (req <= 0) return 999999;
                    const avail = Math.max(0, Number(ri.ingredient?.quantity || 0) - Number(ri.ingredient?.reserved || 0));
                    return Math.floor(avail / req);
                });
                return Math.max(0, Math.min(...capacities));
            };

            for (const plan of plans) {
                if (!Number.isInteger(plan.decrease) || plan.decrease <= 0) {
                    throw new HttpError(400, 'Số lượng mô phỏng phải là số nguyên dương.');
                }
                const product = await tx.product.findUnique({
                    where: { id: plan.productId },
                    include: {
                        recipes: {
                            where: { isActive: true },
                            include: { ingredients: { include: { ingredient: true } } },
                            take: 1
                        }
                    }
                });
                if (!product || !product.isActive) {
                    throw new HttpError(404, 'Không tìm thấy sản phẩm pha chế đang hoạt động.');
                }
                const recipe = product.recipes?.[0];
                if (!recipe || recipe.ingredients.length === 0) {
                    throw new HttpError(400, `Món "${product.name}" chưa có công thức định mức (Recipe BOM) để mô phỏng trừ kho nguyên liệu.`);
                }

                const stockBefore = computeDrinkAvailableCups(recipe);
                if (stockBefore < plan.decrease) {
                    throw new HttpError(
                        400,
                        `Không đủ tồn kho nguyên liệu để mô phỏng bán "${product.name}". Có thể pha tối đa: ${stockBefore} Ly, yêu cầu: ${plan.decrease} Ly.`
                    );
                }

                const simGroupId = `SIM-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
                let firstTxnId = '';
                const ingredientIds: string[] = [];

                for (const ri of recipe.ingredients) {
                    const ingId = ri.ingredientId;
                    ingredientIds.push(ingId);
                    const neededBase = Math.round(plan.decrease * Number(ri.quantityBase || 0) * 1000) / 1000;
                    if (neededBase <= 0) continue;

                    await tx.$queryRaw`SELECT "id" FROM "Ingredient" WHERE "id" = ${ingId} FOR UPDATE`;
                    const currentIng = await tx.ingredient.findUnique({ where: { id: ingId } });
                    if (!currentIng) {
                        throw new HttpError(404, 'Không tìm thấy nguyên liệu trong kho.');
                    }

                    const availIng = Number(currentIng.quantity) - Number(currentIng.reserved);
                    if (availIng + 1e-6 < neededBase) {
                        throw new HttpError(
                            400,
                            `Nguyên liệu "${currentIng.name}" không đủ tồn khả dụng (cần ${neededBase} ${currentIng.baseUnit}, còn ${availIng} ${currentIng.baseUnit}).`
                        );
                    }

                    const batches = await tx.ingredientBatch.findMany({
                        where: {
                            ingredientId: ingId,
                            qualityStatus: 'AVAILABLE',
                            quantityRemaining: { gt: 0 },
                            OR: [{ expirationDate: null }, { expirationDate: { gt: new Date() } }]
                        },
                        orderBy: [{ expirationDate: 'asc' }, { receivedAt: 'asc' }]
                    });

                    const eligibleQuantity = batches.reduce((sum, batch) => sum + Number(batch.quantityRemaining), 0);
                    if (eligibleQuantity - Number(currentIng.reserved) + 1e-6 < neededBase) {
                        throw new HttpError(400, 'Insufficient usable lots; quarantined, recalled and expired stock cannot be simulated as consumed.');
                    }

                    let remainingToDeduct = neededBase;
                    for (const batch of batches) {
                        if (remainingToDeduct <= 1e-6) break;
                        const batchRem = Number(batch.quantityRemaining);
                        const deduction = Math.min(batchRem, remainingToDeduct);
                        await tx.ingredientBatch.update({
                            where: { id: batch.id },
                            data: { quantityRemaining: { decrement: deduction } }
                        });
                        const txn = await tx.inventoryTransaction.create({
                            data: {
                                productId: product.id,
                                ingredientId: ingId,
                                batchId: batch.id,
                                performedBy: userId,
                                type: InventoryTransactionType.SIMULATE_SALE,
                                quantity: -deduction,
                                unitCost: batch.unitCost,
                                totalCost: Number(batch.unitCost) * deduction,
                                referenceType: 'SimulateSaleRecipe',
                                referenceId: simGroupId,
                                reason: `${note ?? `Mô phỏng bán ${plan.decrease} Ly ${product.name}`} [sim-cups:${plan.decrease}]`
                            }
                        });
                        if (!firstTxnId) firstTxnId = txn.id;
                        remainingToDeduct = Math.round((remainingToDeduct - deduction) * 1000) / 1000;
                    }

                    if (remainingToDeduct > 1e-6) {
                        throw new HttpError(409, 'Usable lot allocation changed; no unbatched stock movement is permitted.');
                    }

                    await tx.ingredient.update({
                        where: { id: ingId },
                        data: {
                            quantity: { decrement: neededBase },
                            rowVersion: { increment: 1 }
                        }
                    });
                }

                const refreshedProduct = await tx.product.findUnique({
                    where: { id: plan.productId },
                    include: {
                        recipes: {
                            where: { isActive: true },
                            include: { ingredients: { include: { ingredient: true } } },
                            take: 1
                        }
                    }
                });
                const stockAfter = computeDrinkAvailableCups(refreshedProduct?.recipes?.[0]);

                affected.push({
                    productId: product.id,
                    inventoryId: product.id,
                    transactionId: firstTxnId,
                    productName: product.name,
                    stockBefore,
                    previousQuantity: stockBefore,
                    decreasedQuantity: plan.decrease,
                    stockAfter,
                    newQuantity: stockAfter,
                    minThreshold: 5,
                    ingredientIds
                });
            }

            return affected;
        });
    },
    async findPendingRestore(userId: string) {
        const createdAfter = new Date();
        createdAfter.setDate(createdAfter.getDate() - RESTORE_LOOKBACK_DAYS);

        const transactions = await prisma.inventoryTransaction.findMany({
            where: {
                performedBy: userId,
                type: InventoryTransactionType.SIMULATE_SALE,
                quantity: { lt: 0 },
                createdAt: { gte: createdAfter },
                productId: { not: null }
            },
            orderBy: { createdAt: 'desc' },
            take: 50
        });

        const productIds = Array.from(new Set(transactions.map((t) => t.productId).filter((id): id is string => Boolean(id))));
        const products = productIds.length > 0
            ? await prisma.product.findMany({
                  where: { id: { in: productIds } },
                  include: {
                      inventory: true,
                      recipes: {
                          where: { isActive: true },
                          include: { ingredients: { include: { ingredient: true } } },
                          take: 1
                      }
                  }
              })
            : [];
        const productById = new Map(products.map((p) => [p.id, p]));

        const pendingRestores = [];
        const seenRecipeGroups = new Set<string>();

        for (const transaction of transactions) {
            if (!transaction.productId) continue;
            const product = productById.get(transaction.productId);
            if (!product) continue;

            if (transaction.referenceType === 'SimulateSaleRecipe' && transaction.referenceId) {
                const groupKey = `${transaction.productId}:${transaction.referenceId}`;
                if (seenRecipeGroups.has(groupKey)) continue;
                seenRecipeGroups.add(groupKey);
            }

            const marker = restoreMarker(transaction.id);
            const decreasedQuantity = Math.abs(Number(transaction.quantity));
            const existingRestore = await prisma.inventoryTransaction.findFirst({
                where: {
                    productId: transaction.productId,
                    type: InventoryTransactionType.ADJUSTMENT,
                    reason: { contains: marker }
                },
                select: { id: true }
            });

            if (!existingRestore) {
                const cupsMatch = /\[sim-cups:(\d+)\]/.exec(transaction.reason || '');
                const effectiveDecreased = cupsMatch ? Number(cupsMatch[1]) : decreasedQuantity;
                const activeRecipe = (product as any).recipes?.[0];
                const recipeCupsAfter =
                    activeRecipe && activeRecipe.ingredients?.length > 0
                        ? Math.max(
                              0,
                              Math.min(
                                  ...activeRecipe.ingredients.map((ri: any) => {
                                      const req = Number(ri.quantityBase || 0);
                                      if (req <= 0) return 999999;
                                      const avail = Math.max(0, Number(ri.ingredient?.quantity || 0) - Number(ri.ingredient?.reserved || 0));
                                      return Math.floor(avail / req);
                                  })
                              )
                          )
                        : undefined;
                const inventory = product.inventory;
                const stockAfter = inventory?.quantity ?? recipeCupsAfter;

                pendingRestores.push({
                    transactionId: transaction.id,
                    inventoryId: inventory?.id ?? product.id,
                    productId: transaction.productId,
                    productName: product.name,
                    stockBefore: typeof stockAfter === 'number' ? stockAfter + effectiveDecreased : undefined,
                    stockAfter,
                    decreasedQuantity: effectiveDecreased,
                    unit: product.servingUnit || 'Ly',
                    createdAt: transaction.createdAt,
                    type: transaction.type,
                    restored: false
                });
            }
        }

        return pendingRestores;
    }
};
