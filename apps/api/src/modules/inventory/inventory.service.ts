import { HttpError } from '../../common/http-error';
import { prisma } from '../../common/prisma';
import { inventoryRepository, type InventoryRecord, type InventoryTransactionRecord } from './inventory.repository';
import type { AdjustInventoryInput, ImportInventoryInput, UpdateThresholdInput } from './inventory.validator';
import { InventoryTransactionType } from '@cafe-project/database';
import { scanInventoryViaAgentService } from '../agent/agent.client';
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
};

export type InventoryTransactionDto = {
    id: string;
    productId: string;
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

const getStatus = (quantity: number, minThreshold: number): InventoryStatus => {
    if (quantity <= 0) return 'OUT_OF_STOCK';
    if (quantity <= minThreshold) return 'LOW_STOCK';

    return 'IN_STOCK';
};

const toInventoryDto = (inventory: InventoryRecord): InventoryDto => ({
    id: inventory.id,
    inventoryId: inventory.id,
    productId: inventory.productId,
    productImageUrl: inventory.product.imageUrl,
    productName: inventory.product.name,
    productSku: inventory.product.sku,
    categoryName: inventory.product.category.name,
    quantity: inventory.quantity,
    stock: inventory.quantity,
    reservedStock: inventory.reservedStock,
    availableStock: inventory.quantity - inventory.reservedStock,
    minThreshold: inventory.minThreshold,
    minStock: inventory.minThreshold,
    unit: inventory.unit,
    status: getStatus(inventory.quantity - inventory.reservedStock, inventory.minThreshold),
    createdAt: inventory.createdAt,
    updatedAt: inventory.updatedAt
});

const toTransactionDto = (transaction: InventoryTransactionRecord): InventoryTransactionDto => ({
    id: transaction.id,
    productId: transaction.productId,
    productName: transaction.product.name,
    productSku: transaction.product.sku,
    type: transaction.type === 'ADJUSTMENT' ? 'ADJUST' : transaction.type,
    quantity: transaction.quantity,
    previousQty: null,
    newQty: null,
    note: transaction.reason,
    createdBy: transaction.user?.name ?? null,
    createdByEmail: transaction.user?.email ?? null,
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

const toSupplierDto = (supplierProduct: any) => ({
    supplierId: supplierProduct.supplierId,
    supplierName: supplierProduct.supplier.name,
    isPreferred: supplierProduct.isPreferred,
    priority: null,
    leadTimeDays: supplierProduct.leadTimeDays,
    moq: supplierProduct.minOrderQuantity,
    purchasePrice: Number(supplierProduct.price)
});

const getSupplierProductsForSuggestion = async (productId: string) => {
    return prisma.supplierProduct.findMany({
        where: {
            productId,
            supplier: {
                status: 'ACTIVE',
                deletedAt: null
            }
        },
        include: { supplier: true },
        orderBy: [{ isPreferred: 'desc' }, { leadTimeDays: 'asc' }, { price: 'asc' }]
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
    await inventoryRepository.createMissingForActiveProducts();
    const inventories = await inventoryRepository.findMany();

    return inventories.map(toInventoryDto);
};

export const getInventoryById = async (id: string): Promise<InventoryDto> => {
    return toInventoryDto(await ensureInventoryExists(id));
};

export const getInventoryTransactions = async (): Promise<InventoryTransactionDto[]> => {
    const transactions = await inventoryRepository.findTransactions();

    return transactions.map(toTransactionDto);
};

export const importInventory = async (input: ImportInventoryInput, userId: string): Promise<InventoryMutationDto> => {
    const inventory = await ensureInventoryExists(input.inventoryId);
    const stockBefore = inventory.quantity;
    let importQuantity = input.quantity ?? 0;
    let purchaseQuantity: number | undefined;
    let purchaseUnit: string | null = null;
    let conversionQuantity: number | null = null;
    let conversionTargetUnit: string | null = null;
    let conversionNote: string | null = null;

    if (input.purchaseQuantity !== undefined) {
        const supplierProduct = input.supplierProductId
            ? await prisma.supplierProduct.findUnique({ where: { id: input.supplierProductId }, include: { supplier: true } })
            : input.supplierId
              ? await prisma.supplierProduct.findUnique({
                    where: { supplierId_productId: { supplierId: input.supplierId, productId: inventory.productId } },
                    include: { supplier: true }
                })
              : null;

        if (!supplierProduct || supplierProduct.productId !== inventory.productId) {
            throw new HttpError(400, 'Chưa có quy cách nhập hàng cho sản phẩm này.');
        }

        if (!supplierProduct.purchaseUnit || !supplierProduct.conversionQuantity || !supplierProduct.conversionTargetUnit) {
            throw new HttpError(400, 'Chưa có quy cách nhập hàng cho sản phẩm này.');
        }

        if (supplierProduct.conversionTargetUnit !== inventory.unit) {
            throw new HttpError(400, `Quy cách nhập hàng quy đổi sang ${supplierProduct.conversionTargetUnit}, không khớp đơn vị tồn kho ${inventory.unit}.`);
        }

        purchaseQuantity = input.purchaseQuantity;
        purchaseUnit = supplierProduct.purchaseUnit;
        conversionQuantity = supplierProduct.conversionQuantity;
        conversionTargetUnit = supplierProduct.conversionTargetUnit;
        importQuantity = Math.ceil(input.purchaseQuantity * supplierProduct.conversionQuantity);
        conversionNote = `Nhập ${input.purchaseQuantity} ${purchaseUnit}; quy cách 1 ${purchaseUnit} = ${conversionQuantity} ${conversionTargetUnit}; kho tăng ${importQuantity} ${inventory.unit}`;
    }

    if (importQuantity <= 0) {
        throw new HttpError(400, 'Số lượng phải lớn hơn 0.');
    }

    const updatedInventory = await inventoryRepository.importStock(inventory, importQuantity, appendConversionNote(normalizeNote(input.note), conversionNote), userId);
    const dto = toInventoryDto(updatedInventory);
    const isLow = dto.quantity <= dto.minThreshold;

    scanInventoryViaAgentService({
        productIds: [inventory.productId],
        triggerType: 'INVENTORY_IMPORTED',
        sourceType: 'INVENTORY',
        sourceId: inventory.id,
        note: 'Inventory imported'
    }, userId).catch((error) => {
        console.error('[AI_AGENT] Failed to scan inventory after inventory import', error);
    });

    return {
        inventory: dto,
        stockAfter: dto.quantity,
        minThreshold: dto.minThreshold,
        message: isLow ? 'Số lượng sau nhập vẫn thấp hơn ngưỡng tối thiểu.' : 'Nhập kho thành công. Đủ hàng.',
        warnings: isLow
            ? [
                  {
                      level: 'warning',
                      message: 'Số lượng sau nhập vẫn thấp hơn ngưỡng tối thiểu.'
                  }
              ]
            : [],
        purchaseQuantity,
        purchaseUnit,
        conversionQuantity,
        conversionTargetUnit,
        convertedQuantity: importQuantity,
        stockBefore
    };
};

export const adjustInventory = async (input: AdjustInventoryInput, userId: string): Promise<InventoryMutationDto> => {
    const inventory = await ensureInventoryExists(input.inventoryId);

    if (input.quantity === 0) {
        throw new HttpError(400, 'Số lượng điều chỉnh không được bằng 0.');
    }

    if (inventory.quantity + input.quantity < 0) {
        throw new HttpError(400, 'Tồn kho không đủ.');
    }

    const updatedInventory = await inventoryRepository.adjustStock(inventory, input.quantity, normalizeNote(input.note), userId);
    const dto = toInventoryDto(updatedInventory);

    if (dto.quantity <= dto.minThreshold) {
        scanInventoryViaAgentService({
            productIds: [inventory.productId],
            triggerType: 'INVENTORY_ADJUSTED',
            sourceType: 'INVENTORY',
            sourceId: inventory.id,
            note: 'Inventory adjusted below threshold'
        }, userId).catch((error) => {
            console.error('[AI_AGENT] Failed to scan inventory after inventory adjustment', error);
        });
    }

    return {
        inventory: dto,
        stockAfter: dto.quantity,
        minThreshold: dto.minThreshold,
        message: dto.quantity <= dto.minThreshold ? 'Số lượng sau điều chỉnh thấp hơn ngưỡng, cần nhập hàng.' : 'Điều chỉnh thành công.',
        warnings:
            dto.quantity <= dto.minThreshold
                ? [
                      {
                          level: 'warning',
                          message: 'Số lượng sau điều chỉnh thấp hơn ngưỡng, cần nhập hàng.'
                      }
                  ]
                : []
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

export const getInventoryThresholdSuggestion = async (inventoryId: string, options: ThresholdSuggestionOptions = {}) => {
    const inventory = await ensureInventoryExists(inventoryId);
    const salesWindowDays = normalizePositiveInteger(options.salesWindowDays, 30);
    const bufferDays = normalizePositiveInteger(options.bufferDays, 2);
    const planningPeriod = options.planningPeriod || 'WEEKLY';
    let planningDays = 7;
    if (planningPeriod === 'MONTHLY') planningDays = 30;
    else if (planningPeriod === 'CUSTOM') planningDays = normalizePositiveInteger(options.planningDays, 14);

    const supplierProducts = await getSupplierProductsForSuggestion(inventory.productId);
    const primarySupplierProduct = supplierProducts[0] ?? null;

    const leadTimeDays = primarySupplierProduct?.leadTimeDays || 3;
    const delayBufferDays = normalizePositiveInteger(options.delayBufferDays, 2);
    const effectiveLeadTimeDays = leadTimeDays + delayBufferDays;

    const salesWindowStart = new Date();
    salesWindowStart.setDate(salesWindowStart.getDate() - salesWindowDays);

    const salesTransactions = await prisma.inventoryTransaction.aggregate({
        where: {
            productId: inventory.productId,
            type: { in: [InventoryTransactionType.ORDER, InventoryTransactionType.SIMULATE_SALE] },
            createdAt: { gte: salesWindowStart }
        },
        _sum: { quantity: true }
    });

    const totalSalesInWindow = Math.abs(salesTransactions._sum.quantity ?? 0);
    const avgDailySales = totalSalesInWindow / salesWindowDays;
    const safetyStock = avgDailySales > 0 ? Math.ceil(avgDailySales * bufferDays) : 10;
    const leadTimeDemand = Math.ceil(avgDailySales * effectiveLeadTimeDays);
    
    let recommendedThreshold = 0;
    if (avgDailySales > 0) {
        recommendedThreshold = Math.ceil(avgDailySales * (planningDays + effectiveLeadTimeDays + bufferDays));
    } else {
        const currentMin = inventory.minThreshold;
        if (planningPeriod === 'WEEKLY') {
            recommendedThreshold = Math.max(currentMin, 10);
        } else if (planningPeriod === 'MONTHLY') {
            recommendedThreshold = Math.max(currentMin * 3, 30);
        } else {
            recommendedThreshold = Math.max(Math.ceil(currentMin * (planningDays / 7)), 10);
        }
    }

    const warnings = getThresholdWarnings(inventory.minThreshold, leadTimeDemand, recommendedThreshold);

    if (supplierProducts.length === 0) {
        warnings.push({
            level: 'info',
            message: 'Sản phẩm chưa gắn nhà cung cấp, hệ thống đang dùng thời gian nhập hàng mặc định 3 ngày.'
        });
    }

    let periodText = 'hằng tuần';
    if (planningPeriod === 'MONTHLY') periodText = 'hằng tháng';
    else if (planningPeriod === 'CUSTOM') periodText = `tùy chỉnh ${planningDays} ngày`;

    const unit = inventory.unit || 'đơn vị';
    const explanation = avgDailySales > 0
        ? `Sản phẩm ${inventory.product.name} đang được tính ngưỡng theo chu kỳ nhập hàng ${periodText}. Dựa trên tốc độ bán trung bình ${Number(avgDailySales.toFixed(2))} ${unit}/ngày, thời gian nhập hàng ${effectiveLeadTimeDays} ngày và ${bufferDays} ngày dự phòng, hệ thống gợi ý ngưỡng tồn kho là ${recommendedThreshold} ${unit}.`
        : `Sản phẩm ${inventory.product.name} chưa có đủ lịch sử bán hàng. Hệ thống tạm thời gợi ý mức an toàn là ${recommendedThreshold} ${unit} dựa trên chu kỳ ${periodText}.`;

    return {
        inventoryId: inventory.id,
        productId: inventory.productId,
        productName: inventory.product.name,
        inventoryUnit: unit,
        planningPeriod,
        planningDays,
        explanation,
        currentStock: inventory.quantity,
        currentThreshold: inventory.minThreshold,
        salesWindowDays,
        totalSalesInWindow,
        avgDailySales: Number(avgDailySales.toFixed(2)),
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
        capacityNote: 'SupplierProduct hiện chưa có availableQuantity/capacity; hệ thống không tự kết luận nhà cung cấp đủ hay thiếu.',
        warnings: warnings.map((warning) => warning.message),
        warningDetails: warnings
    };
};
