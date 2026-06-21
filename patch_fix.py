import os

file = 'apps/api/src/modules/inventory/inventory.service.ts'
with open(file, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix import
content = content.replace(
    "import { InventoryTransactionType } from '@cafe-project/database';",
    "import { InventoryTransactionType } from '@cafe-project/database';\nimport { scanInventoryViaAgentService } from '../agent/agent.client';"
)

import_inventory_correct = """export const importInventory = async (input: ImportInventoryInput, userId: string): Promise<InventoryMutationDto> => {
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
    }, userId).catch((error: any) => {
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
"""

adjust_inventory_correct = """export const adjustInventory = async (input: AdjustInventoryInput, userId: string): Promise<InventoryMutationDto> => {
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
        }, userId).catch((error: any) => {
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
"""

import_start = content.find("export const importInventory = async")
update_threshold_start = content.find("export const updateInventoryThreshold = async")

content = content[:import_start] + import_inventory_correct + "\n" + adjust_inventory_correct + "\n" + content[update_threshold_start:]

with open(file, 'w', encoding='utf-8') as f:
    f.write(content)
