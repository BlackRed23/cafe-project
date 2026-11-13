import { HttpError } from '../../common/http-error';
import { Prisma, prisma, type SupplierIngredient, type Supplier } from '@cafe-project/database';
import { stockQuantity } from './inventory-quantity';
import { inventoryRepository, type InventoryRecord, type InventoryTransactionRecord } from './inventory.repository';
import type { AdjustInventoryInput, ImportInventoryInput, UpdateThresholdInput } from './inventory.validator';
import { InventoryTransactionType } from '@cafe-project/database';
import { scanInventoryViaAgentService, createAgentLogViaAgentService } from '../agent/agent.client';
export type InventoryStatus = 'OUT_OF_STOCK' | 'LOW_STOCK' | 'IN_STOCK';

type ThresholdSuggestionOptions = {
    salesWindowDays?: number;
    bufferDays?: number;
    delayBufferDays?: number;
    planningPeriod?: 'WEEKLY' | 'MONTHLY' | 'CUSTOM';
    planningDays?: number;
};

export type ThresholdWarning = {
    level: 'strong' | 'warning' | 'info';
    message: string;
};

export type InventoryDto = {
    id: string;
    inventoryId: string;
    productId: string;
    productImageUrl: string | null;
    productName: string;
    productSku: string;
    categoryName: string;
    quantity: number;
    stock: number;
    reservedStock: number;
    availableStock: number;
    minThreshold: number;
    minStock: number;
    unit: string;
    status: InventoryStatus;
    createdAt: Date;
    updatedAt: Date;
    safetyStock?: number;
    leadTimeDemand?: number;
    recommendedThreshold?: number;
    hasOpenPurchaseRequest?: boolean;
    openPurchaseRequestId?: string;
    openPurchaseRequestCode?: string;
    openPurchaseRequestStatus?: string;
    sellableQuantity: number;
    ingredientId: string;
    batches: Array<{ id: string; batchCode: string; quantity: number; quantityInitial: number; quantityRemaining: number; expirationDate: Date | null; receivedAt: Date }>;
};

export type InventoryTransactionDto = {
    id: string;
    ingredientId: string;
    productId: string | null;
    productName: string;
    productSku: string;
    type: string;
    quantity: number;
    previousQty: number | null;
    newQty: number | null;
    note: string | null;
    createdBy: string | null;
    createdByEmail: string | null;
    createdAt: Date;
};

export type InventoryMutationDto = {
    inventory: InventoryDto;
    stockAfter: number;
    minThreshold: number;
    message: string;
    warnings: ThresholdWarning[];
    purchaseQuantity?: number;
    purchaseUnit?: string | null;
    conversionQuantity?: number | null;
    conversionTargetUnit?: string | null;
    convertedQuantity?: number;
    stockBefore?: number;
};

const getStatus = (availableStock: number, minThreshold: number): InventoryStatus => {
    if (availableStock <= 0) return 'OUT_OF_STOCK';
    if (availableStock <= minThreshold) return 'LOW_STOCK';

    return 'IN_STOCK';
};

const toInventoryDto = (inventory: InventoryRecord): InventoryDto => {
    const now = new Date();
    const batches = inventory.batches.map(batch => ({
        id: batch.id, batchCode: batch.batchCode, quantity: Number(batch.quantityRemaining),
        quantityInitial: Number(batch.quantityInitial), quantityRemaining: Number(batch.quantityRemaining),
        expirationDate: batch.expirationDate, receivedAt: batch.receivedAt
    }));
    const eligible = inventory.batches.filter(batch => batch.expirationDate && batch.expirationDate > now && batch.receivedAt <= now)
        .reduce((sum, batch) => sum.plus(batch.quantityRemaining), new Prisma.Decimal(0));
    const available = inventory.quantity.minus(inventory.reserved);
    const sellableQuantity = Number(Prisma.Decimal.max(0, Prisma.Decimal.min(available, eligible.minus(inventory.reserved))));

    return {
        id: inventory.id,
        inventoryId: inventory.id,
        // Legacy display fields describe ingredients; IDs are Ingredient.id aliases.
        ingredientId: inventory.id,
        productId: inventory.id,
        productImageUrl: inventory.imageUrl,
        productName: inventory.name,
        productSku: inventory.sku,
        categoryName: inventory.category?.name ?? '',
        quantity: Number(inventory.quantity),
        stock: Number(inventory.quantity),
        reservedStock: Number(inventory.reserved),
        availableStock: Number(available),
        sellableQuantity,
        minThreshold: Number(inventory.minThreshold),
        minStock: Number(inventory.minThreshold),
        unit: inventory.baseUnit,
        status: getStatus(Number(available), Number(inventory.minThreshold)),
        createdAt: inventory.createdAt,
        updatedAt: inventory.updatedAt,
        batches
    };
};

const toTransactionDto = (transaction: InventoryTransactionRecord): InventoryTransactionDto => ({
    id: transaction.id,
    ingredientId: transaction.ingredientId,
    productId: transaction.ingredientId,
    productName: transaction.ingredient.name,
    productSku: transaction.ingredient.sku,
    type: transaction.type === 'ADJUSTMENT' ? 'ADJUST' : transaction.type,
    quantity: Number(transaction.quantity),
    previousQty: null,
    newQty: null,
    note: transaction.reason,
    createdBy: transaction.performedByUser?.name ?? null,
    createdByEmail: transaction.performedByUser?.email ?? null,
    createdAt: transaction.createdAt
});

const normalizeNote = (note: string | null | undefined): string | null => {
    if (!note) return null;

    return note;
};

const appendConversionNote = (note: string | null, conversionNote: string | null): string | null => {
    if (!conversionNote) return note;
    return note ? `${note} | ${conversionNote}` : conversionNote;
};

const ensureInventoryExists = async (id: string): Promise<InventoryRecord> => {
    const inventory = await inventoryRepository.findById(id);

    if (!inventory) {
        throw new HttpError(404, 'Không tìm thấy tồn kho.');
    }

    return inventory;
};

const normalizePositiveInteger = (value: number | undefined, fallback: number): number => {
    if (value === undefined || !Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
        return fallback;
    }

    return value;
};

const toSupplierDto = (supplierProduct: SupplierIngredient & { supplier: Supplier }) => ({
    supplierId: supplierProduct.supplierId,
    supplierName: supplierProduct.supplier.name,
    isPreferred: supplierProduct.isPreferred,
    priority: null,
    leadTimeDays: supplierProduct.leadTimeDays,
    moq: supplierProduct.minOrderQuantity,
    purchasePrice: Number(supplierProduct.pricePerBaseUnit.times(supplierProduct.conversionQuantity)),
    pricePerBaseUnit: Number(supplierProduct.pricePerBaseUnit),
    purchaseUnit: supplierProduct.purchaseUnit,
    conversionQuantity: Number(supplierProduct.conversionQuantity),
    conversionTargetUnit: supplierProduct.conversionTargetUnit
});

const getSupplierProductsForSuggestion = async (productId: string) => {
    return prisma.supplierIngredient.findMany({
        where: {
            ingredientId: productId,
            supplier: {
                status: 'ACTIVE',
                deletedAt: null
            }
        },
        include: { supplier: true },
        orderBy: [{ isPreferred: 'desc' }, { leadTimeDays: 'asc' }, { pricePerBaseUnit: 'asc' }]
    });
};

const getThresholdWarnings = (inputThreshold: number, leadTimeDemand: number, recommendedThreshold: number): ThresholdWarning[] => {
    const warnings: ThresholdWarning[] = [];

    if (inputThreshold < leadTimeDemand) {
        warnings.push({
            level: 'strong',
            message: 'Ngưỡng này quá thấp so với tốc độ bán và thời gian nhập hàng.'
        });
    } else if (inputThreshold < recommendedThreshold) {
        warnings.push({
            level: 'warning',
            message: 'Ngưỡng thấp hơn đề xuất, có nguy cơ thiếu hàng trong thời gian chờ nhập.'
        });
    }

    if (inputThreshold > recommendedThreshold * 3) {
        warnings.push({
            level: 'warning',
            message: 'Ngưỡng này cao bất thường, có thể gây tồn kho quá nhiều.'
        });
    }

    return warnings;
};

export const getInventories = async (): Promise<InventoryDto[]> => {
    const inventories = await inventoryRepository.findMany();

    const openPRs = await prisma.purchaseRequestItem.findMany({
        where: {
            request: {
                status: {
                    in: ['PENDING', 'APPROVED', 'SENT']
                }
            }
        },
        include: {
            request: true
        }
    });

    const openPRMap = new Map<string, typeof openPRs[number]['request']>();
    for (const prItem of openPRs) {
        if (!openPRMap.has(prItem.ingredientId)) {
            openPRMap.set(prItem.ingredientId, prItem.request);
        }
    }

    const ingredientIds = inventories.map(inv => inv.id);
    const salesWindowDays = 30;
    const bufferDays = 2;
    const delayBufferDays = 2;
    const salesWindowStart = new Date();
    salesWindowStart.setDate(salesWindowStart.getDate() - salesWindowDays);

    const salesGroups = await prisma.inventoryTransaction.groupBy({
        by: ['ingredientId'],
        where: {
            ingredientId: { in: ingredientIds },
            type: InventoryTransactionType.CONSUME,
            createdAt: { gte: salesWindowStart }
        },
        _sum: { quantity: true }
    });

    const salesMap = new Map(salesGroups.map(g => [g.ingredientId, Math.abs(Number(g._sum.quantity ?? 0))]));

    const supplierProducts = await prisma.supplierIngredient.findMany({
        where: {
            ingredientId: { in: ingredientIds },
            supplier: { status: 'ACTIVE', deletedAt: null }
        },
        orderBy: [{ isPreferred: 'desc' }, { leadTimeDays: 'asc' }, { pricePerBaseUnit: 'asc' }]
    });

    const supplierMap = new Map<string, SupplierIngredient>();
    for (const sp of supplierProducts) {
        if (!supplierMap.has(sp.ingredientId)) {
            supplierMap.set(sp.ingredientId, sp);
        }
    }

    return inventories.map(inv => {
        const dto = toInventoryDto(inv);
        const openPR = openPRMap.get(inv.id);
        
        const totalSalesInWindow = Number(salesMap.get(inv.id) ?? 0);
        const avgDailySales = totalSalesInWindow / salesWindowDays;
        const baseDailySales = avgDailySales > 0 ? avgDailySales : 1;
        
        const primarySupplierProduct = supplierMap.get(inv.id);
        const leadTimeDays = primarySupplierProduct?.leadTimeDays ?? 3;
        const effectiveLeadTimeDays = leadTimeDays + delayBufferDays;

        const leadTimeDemand = Math.ceil(baseDailySales * effectiveLeadTimeDays);
        const safetyStock = Math.max(1, Math.ceil(baseDailySales * bufferDays));
        const recommendedThreshold = Math.ceil(leadTimeDemand + safetyStock);

        return {
            ...dto,
            hasOpenPurchaseRequest: !!openPR,
            openPurchaseRequestId: openPR?.id,
            openPurchaseRequestCode: openPR?.requestNumber,
            openPurchaseRequestStatus: openPR?.status,
            safetyStock,
            leadTimeDemand,
            recommendedThreshold
        };
    });
};

export const getInventoryById = async (id: string): Promise<InventoryDto> => {
    return toInventoryDto(await ensureInventoryExists(id));
};

export const getInventoryTransactions = async (): Promise<InventoryTransactionDto[]> => {
    const transactions = await inventoryRepository.findTransactions();

    return transactions.map(toTransactionDto);
};

// Agent contract accepts selling Product IDs and resolves their recipes itself.
const scanIngredientProducts = async (ingredientId: string, triggerType: string, userId: string) => {
    const now = new Date();
    const products = await prisma.product.findMany({ where: {
        isActive: true, deletedAt: null, recipes: { some: {
            isActive: true, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
            ingredients: { some: { ingredientId } }
        } }
    }, select: { id: true } });
    if (products.length === 0) return;
    return scanInventoryViaAgentService({ productIds: products.map(row => row.id), triggerType,
        sourceType: 'INGREDIENT', sourceId: ingredientId }, userId);
};

export const importInventory = async (input: ImportInventoryInput, userId: string): Promise<InventoryMutationDto> => {
    const inventory = await ensureInventoryExists(input.inventoryId);
    const stockBefore = Number(inventory.quantity);
    let importQuantity = new Prisma.Decimal(input.quantity ?? 0);
    let purchaseQuantity: number | undefined;
    let purchaseUnit: string | null = null;
    let conversionQuantity: number | null = null;
    let conversionTargetUnit: string | null = null;
    let conversionNote: string | null = null;
    const supplierIngredient = input.supplierIngredientId
        ? await prisma.supplierIngredient.findUnique({ where: { id: input.supplierIngredientId }, include: { supplier: true } })
        : input.supplierId ? await prisma.supplierIngredient.findUnique({
            where: { supplierId_ingredientId: { supplierId: input.supplierId, ingredientId: inventory.id } }, include: { supplier: true }
        }) : null;
    if ((input.supplierIngredientId || input.supplierId) && (!supplierIngredient || supplierIngredient.ingredientId !== inventory.id ||
        (input.supplierId && supplierIngredient.supplierId !== input.supplierId) || supplierIngredient.supplier.deletedAt || supplierIngredient.supplier.status !== 'ACTIVE')) {
        throw new HttpError(400, 'Nhà cung cấp không cung cấp nguyên liệu này.');
    }

    if (input.purchaseQuantity !== undefined) {
        const supplierProduct = supplierIngredient;
        if (!supplierProduct || supplierProduct.ingredientId !== inventory.id) {
            throw new HttpError(400, 'Chưa có quy cách nhập hàng cho sản phẩm này.');
        }

        if (!supplierProduct.purchaseUnit || !supplierProduct.conversionQuantity || !supplierProduct.conversionTargetUnit) {
            throw new HttpError(400, 'Chưa có quy cách nhập hàng cho sản phẩm này.');
        }

        if (supplierProduct.conversionTargetUnit !== inventory.baseUnit) {
            throw new HttpError(400, `Quy cách nhập hàng quy đổi sang ${supplierProduct.conversionTargetUnit}, không khớp đơn vị tồn kho ${inventory.baseUnit}.`);
        }

        purchaseQuantity = input.purchaseQuantity;
        purchaseUnit = supplierProduct.purchaseUnit;
        conversionQuantity = Number(supplierProduct.conversionQuantity);
        conversionTargetUnit = supplierProduct.conversionTargetUnit;
        importQuantity = stockQuantity(new Prisma.Decimal(input.purchaseQuantity).times(supplierProduct.conversionQuantity));
        conversionNote = `Nhập ${input.purchaseQuantity} ${purchaseUnit}; quy cách 1 ${purchaseUnit} = ${conversionQuantity} ${conversionTargetUnit}; kho tăng ${importQuantity} ${inventory.baseUnit}`;
    }

    if (importQuantity.lessThanOrEqualTo(0)) {
        throw new HttpError(400, 'Số lượng phải lớn hơn 0.');
    }

    const updatedInventory = await inventoryRepository.importStock(inventory, importQuantity, appendConversionNote(normalizeNote(input.note), conversionNote), userId, input.batchCode, input.expirationDate,
        { idempotencyKey: input.idempotencyKey, supplierIngredientId: supplierIngredient?.id, purchaseQuantity: input.purchaseQuantity });
    const dto = toInventoryDto(updatedInventory);
    const availableStockAfter = dto.quantity - dto.reservedStock;
    const isLow = availableStockAfter < dto.minThreshold;
    const isWarning = availableStockAfter === dto.minThreshold;

    createAgentLogViaAgentService({
        action: 'INVENTORY_IMPORTED',
        result: 'SUCCESS',
        reasoning: `Đã nhập kho sản phẩm ${dto.productName}. Tồn kho đã được cập nhật.`,
        input: {
            ingredientId: inventory.id,
            productName: dto.productName,
            quantityBefore: stockBefore,
            quantityAfter: dto.quantity,
            availableStock: availableStockAfter,
            minThreshold: dto.minThreshold,
            triggerType: 'MANUAL_IMPORT'
        },
        output: {
            description: `Đã nhập kho sản phẩm ${dto.productName}. Tồn kho đã được cập nhật.`
        },
        creator: userId ? { connect: { id: userId } } : undefined
    }).catch(console.error);

    scanIngredientProducts(inventory.id, 'INVENTORY_IMPORTED', userId).catch((error) => {
        console.error('[AI_AGENT] Failed to scan inventory after inventory import', error);
    });

    let message = 'Nhập kho thành công. Đủ hàng.';
    if (isLow) message = 'Số lượng sau nhập vẫn chưa đủ an toàn.';
    else if (isWarning) message = 'Nhập kho thành công nhưng đang chạm ngưỡng.';

    const warningsArr: ThresholdWarning[] = [];
    if (isLow) {
        warningsArr.push({ level: 'warning', message: 'Số lượng sau nhập vẫn chưa đủ an toàn.' });
    } else if (isWarning) {
        warningsArr.push({ level: 'warning', message: 'Nhập kho thành công nhưng đang chạm ngưỡng.' });
    }

    return {
        inventory: dto,
        stockAfter: dto.quantity,
        minThreshold: dto.minThreshold,
        message,
        warnings: warningsArr,
        purchaseQuantity,
        purchaseUnit,
        conversionQuantity,
        conversionTargetUnit,
        convertedQuantity: Number(importQuantity),
        stockBefore
    };
};

export const adjustInventory = async (input: AdjustInventoryInput, userId: string): Promise<InventoryMutationDto> => {
    const inventory = await ensureInventoryExists(input.inventoryId);

    if (input.quantity === 0) {
        throw new HttpError(400, 'Số lượng điều chỉnh không được bằng 0.');
    }

    const updatedInventory = await inventoryRepository.adjustStock(inventory, input.quantity, normalizeNote(input.note), userId, input.batchId, input.idempotencyKey);
    const dto = toInventoryDto(updatedInventory);

    const availableStockAfter = dto.quantity - dto.reservedStock;
    const isLow = availableStockAfter < dto.minThreshold;
    const isWarning = availableStockAfter === dto.minThreshold;

    createAgentLogViaAgentService({
        action: 'INVENTORY_ADJUSTED',
        result: 'SUCCESS',
        reasoning: `Đã điều chỉnh tồn kho sản phẩm ${dto.productName}.`,
        input: {
            ingredientId: inventory.id,
            productName: dto.productName,
            quantityBefore: Number(inventory.quantity),
            quantityAfter: dto.quantity,
            availableStock: availableStockAfter,
            minThreshold: dto.minThreshold,
            triggerType: 'MANUAL_ADJUSTMENT'
        },
        output: {
            description: `Đã điều chỉnh tồn kho sản phẩm ${dto.productName}.`
        },
        creator: userId ? { connect: { id: userId } } : undefined
    }).catch(console.error);

    if (availableStockAfter <= dto.minThreshold || input.quantity < 0) {
        scanIngredientProducts(inventory.id, 'INVENTORY_ADJUSTED', userId).catch((error) => {
            console.error('[AI_AGENT] Failed to scan inventory after inventory adjustment', error);
        });
    }

    let message = 'Điều chỉnh thành công. Đủ hàng.';
    if (isLow) message = 'Số lượng sau điều chỉnh thấp hơn ngưỡng, cần nhập hàng.';
    else if (isWarning) message = 'Số lượng sau điều chỉnh chạm ngưỡng.';

    const warningsArr: ThresholdWarning[] = [];
    if (isLow) warningsArr.push({ level: 'warning', message: 'Số lượng sau điều chỉnh thấp hơn ngưỡng, cần nhập hàng.' });
    else if (isWarning) warningsArr.push({ level: 'warning', message: 'Số lượng sau điều chỉnh chạm ngưỡng.' });

    return {
        inventory: dto,
        stockAfter: dto.quantity,
        minThreshold: dto.minThreshold,
        message,
        warnings: warningsArr
    };
};

export const updateInventoryThreshold = async (input: UpdateThresholdInput): Promise<InventoryMutationDto> => {
    const inventory = await ensureInventoryExists(input.inventoryId);

    if (input.minThreshold < 0) {
        throw new HttpError(400, 'Ngưỡng không được âm.');
    }

    const suggestion = await getInventoryThresholdSuggestion(input.inventoryId);
    const updatedInventory = await inventoryRepository.updateThreshold(inventory, input.minThreshold);
    const warnings = getThresholdWarnings(input.minThreshold, suggestion.leadTimeDemand, suggestion.recommendedThreshold);
    const dto = toInventoryDto(updatedInventory);

    return {
        inventory: dto,
        stockAfter: dto.quantity,
        minThreshold: dto.minThreshold,
        message: warnings.length > 0 ? warnings[0].message : 'Cập nhật ngưỡng tồn kho thành công.',
        warnings
    };
};

export const getInventoryThresholdSuggestion = async (inventoryId: string) => {
    const inventory = await ensureInventoryExists(inventoryId);
    const salesWindowDays = 30;
    const bufferDays = 2;
    const delayBufferDays = 2;

    const supplierProducts = await getSupplierProductsForSuggestion(inventory.id);
    const primarySupplierProduct = supplierProducts[0] ?? null;

    const leadTimeDays = primarySupplierProduct?.leadTimeDays ?? 3;
    const effectiveLeadTimeDays = leadTimeDays + delayBufferDays;

    const salesWindowStart = new Date();
    salesWindowStart.setDate(salesWindowStart.getDate() - salesWindowDays);

    const salesTransactions = await prisma.inventoryTransaction.aggregate({
        where: {
            ingredientId: inventory.id,
            type: InventoryTransactionType.CONSUME,
            createdAt: { gte: salesWindowStart }
        },
        _sum: { quantity: true }
    });

    const totalSalesInWindow = Math.abs(Number(salesTransactions._sum.quantity ?? 0));
    const avgDailySales = totalSalesInWindow / salesWindowDays;
    const baseDailySales = avgDailySales > 0 ? avgDailySales : 1;
    
    const leadTimeDemand = Math.ceil(baseDailySales * effectiveLeadTimeDays);
    const safetyStock = Math.max(1, Math.ceil(baseDailySales * bufferDays));
    
    const recommendedThreshold = Math.ceil(leadTimeDemand + safetyStock);

    const warnings = getThresholdWarnings(Number(inventory.minThreshold), leadTimeDemand, recommendedThreshold);

    if (supplierProducts.length === 0) {
        warnings.push({
            level: 'info',
            message: 'Sản phẩm chưa gắn nhà cung cấp, hệ thống đang dùng thời gian nhập hàng mặc định 3 ngày.'
        });
    }

    const unit = inventory.baseUnit;
    const explanation = avgDailySales > 0
        ? `Nguyên liệu ${inventory.name}: tiêu hao trung bình ${Number(avgDailySales.toFixed(2))} ${unit}/ngày, thời gian nhập ${effectiveLeadTimeDays} ngày; ngưỡng đề xuất ${recommendedThreshold} ${unit}.`
        : `Nguyên liệu ${inventory.name} chưa có lịch sử tiêu hao. Giả định 1 ${unit}/ngày; ngưỡng đề xuất ${recommendedThreshold} ${unit}.`;

    return {
        inventoryId: inventory.id,
        ingredientId: inventory.id,
        productId: inventory.id,
        productName: inventory.name,
        inventoryUnit: unit,
        explanation,
        currentStock: Number(inventory.quantity),
        stock: Number(inventory.quantity),
        reservedStock: Number(inventory.reserved),
        availableStock: Number(inventory.quantity.minus(inventory.reserved)),
        currentThreshold: Number(inventory.minThreshold),
        salesWindowDays,
        totalSalesInWindow,
        avgDailySales: Number(avgDailySales.toFixed(2)),
        baseDailySales: Number(baseDailySales.toFixed(2)),
        leadTimeDays,
        delayBufferDays,
        effectiveLeadTimeDays,
        bufferDays,
        safetyStock,
        leadTimeDemand,
        recommendedThreshold,
        supplier: primarySupplierProduct ? toSupplierDto(primarySupplierProduct) : null,
        backupSuppliers: supplierProducts.slice(1).map(toSupplierDto),
        supplierCapacityAvailable: false,
        capacityNote: 'SupplierIngredient chưa có availableQuantity/capacity; chưa xác minh khả năng cung cấp.',
        warnings: warnings.map((warning) => warning.message),
        warningDetails: warnings
    };
};
