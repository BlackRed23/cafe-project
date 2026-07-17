import { prisma } from '@cafe-project/database';
import { getInventories } from './modules/inventory/inventory.service';
import { simulateSaleRepository } from './modules/simulate-sale/simulate-sale.repository';

async function main() {
    console.log('Testing Simulate Sale Logic...');

    // Create a mock product and inventory
    const product = await prisma.product.create({
        data: {
            name: 'Test Product ' + Date.now(),
            sku: 'TEST-' + Date.now(),
            price: 10000,
            unit: 'test',
            categoryId: (await prisma.category.findFirst())?.id || '',
        }
    });

    const inventory = await prisma.inventory.create({
        data: {
            productId: product.id,
            quantity: 25,
            minThreshold: 5,
            unit: 'test'
        }
    });

    // Create batches
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const expiredDate = new Date(startOfToday);
    expiredDate.setDate(expiredDate.getDate() - 1); // Expired
    const validDate = new Date(startOfToday);
    validDate.setDate(validDate.getDate() + 10); // Valid

    await prisma.inventoryBatch.create({
        data: {
            inventoryId: inventory.id,
            batchCode: 'BATCH-EXPIRED',
            quantity: 20,
            expirationDate: expiredDate
        }
    });

    await prisma.inventoryBatch.create({
        data: {
            inventoryId: inventory.id,
            batchCode: 'BATCH-VALID',
            quantity: 5,
            expirationDate: validDate
        }
    });

    // Also test pendingDeleteUntil product
    const deletedProduct = await prisma.product.create({
        data: {
            name: 'Deleted Product ' + Date.now(),
            sku: 'DEL-' + Date.now(),
            price: 10000,
            unit: 'test',
            categoryId: (await prisma.category.findFirst())?.id || '',
            pendingDeleteUntil: new Date(),
        }
    });

    const deletedInventory = await prisma.inventory.create({
        data: {
            productId: deletedProduct.id,
            quantity: 10,
            minThreshold: 5,
            unit: 'test'
        }
    });

    await prisma.inventoryBatch.create({
        data: {
            inventoryId: deletedInventory.id,
            batchCode: 'BATCH-VALID-DEL',
            quantity: 10,
            expirationDate: validDate
        }
    });


    // Test getInventories
    const inventories = await getInventories();
    const testInv = inventories.find(i => i.productId === product.id);
    const delInv = inventories.find(i => i.productId === deletedProduct.id);
    
    console.log(`Test Product Sellable Quantity: ${testInv?.sellableQuantity} (Expected: 5)`);
    if (testInv?.sellableQuantity !== 5) {
        throw new Error('Sellable quantity calculation failed.');
    }

    // Try simulate sale via repository
    const salePlan = await simulateSaleRepository.findInventoryByProductId(product.id);
    if (!salePlan) throw new Error('Inventory not found');

    const user = await prisma.user.findFirst();
    const userId = user?.id || '';

    try {
        await simulateSaleRepository.applyProductSale(salePlan, 5, 'Test sale', userId);
        console.log('Simulate sale of 5 items succeeded.');
    } catch (error) {
        console.error('Failed to simulate sale 5 items:', error);
    }

    try {
        await simulateSaleRepository.applyProductSale(salePlan, 6, 'Test sale', userId);
        console.error('Simulate sale of 6 items succeeded, BUT IT SHOULD HAVE FAILED.');
    } catch (error) {
        console.log('Simulate sale of 6 items correctly failed.');
    }

    // Clean up
    await prisma.inventoryBatch.deleteMany({ where: { inventoryId: { in: [inventory.id, deletedInventory.id] } } });
    await prisma.inventory.deleteMany({ where: { id: { in: [inventory.id, deletedInventory.id] } } });
    await prisma.product.deleteMany({ where: { id: { in: [product.id, deletedProduct.id] } } });
    
    console.log('Test completed.');
}

main().catch(console.error);
