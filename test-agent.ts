import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const AGENT_URL = 'http://127.0.0.1:5055/internal/agent/scan-inventory';
const AGENT_TOKEN = 'dev-agent-secret';

async function scanInventory(USER_ID: string) {
    const res = await fetch(AGENT_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-agent-internal-token': AGENT_TOKEN
        },
        body: JSON.stringify({ input: {}, userId: USER_ID })
    });
    return res.json();
}

async function getAgentLogs() {
    return prisma.agentLog.findMany({
        orderBy: { triggered_at: 'desc' },
        take: 3
    });
}

async function run() {
    console.log('--- STARTING AGENT TEST ---');

    let user = await prisma.user.findFirst({ where: { email: 'test@system.com' } });
    if (!user) {
        user = await prisma.user.create({ data: { email: 'test@system.com', name: 'Test User', password: 'pwd', role: 'ADMIN' } });
    }
    const USER_ID = user.id;

    // 0. Setup Test Data
    let category = await prisma.category.findFirst({ where: { name: 'Test Category' } });
    if (!category) {
        category = await prisma.category.create({ data: { name: 'Test Category' } });
    }

    const product = await prisma.product.upsert({
        where: { sku: 'TEST-ROBUSTA-01' },
        update: { isActive: true },
        create: {
            name: 'Test Robusta',
            sku: 'TEST-ROBUSTA-01',
            categoryId: category.id,
            isActive: true,
            price: 100,
            costPrice: 50,
        }
    });

    const inventory = await prisma.inventory.upsert({
        where: { productId: product.id },
        update: { quantity: 3, minThreshold: 10 },
        create: {
            productId: product.id,
            quantity: 3,
            minThreshold: 10,
            unit: 'Kg'
        }
    });

    const supplier = await prisma.supplier.upsert({
        where: { id: 'TEST-SUPPLIER-A' },
        update: { status: 'ACTIVE' },
        create: {
            id: 'TEST-SUPPLIER-A',
            name: 'Test Supplier A',
            status: 'ACTIVE',
            email: 'test@supplier.com'
        }
    });

    await prisma.supplierProduct.upsert({
        where: { supplierId_productId: { supplierId: supplier.id, productId: product.id } },
        update: { isPreferred: true, price: 40 },
        create: {
            supplierId: supplier.id,
            productId: product.id,
            price: 40,
            isPreferred: true
        }
    });

    // Cleanup existing PRs for test product
    await prisma.purchaseRequestItem.deleteMany({
        where: { productId: product.id }
    });
    await prisma.purchaseRequest.deleteMany({
        where: { supplierId: supplier.id }
    });

    // Test 1: Supplier ACTIVE creates PR successfully
    console.log('\n--- TEST 1: Supplier ACTIVE ---');
    const res1 = await scanInventory(USER_ID);
    console.log('Agent Response:', res1);
    
    let prs = await prisma.purchaseRequest.findMany({
        where: { supplierId: supplier.id },
        include: { items: true }
    });
    let logs = await getAgentLogs();
    
    console.log('PRs created:', prs.length);
    if (prs.length > 0) {
        console.log('PR Status:', prs[0].status);
        console.log('PR Quantity:', prs[0].items[0].quantity);
    }
    console.log('Latest log:', logs.data?.[0]?.message);

    // Test 2: Supplier INACTIVE
    console.log('\n--- TEST 2: Supplier INACTIVE ---');
    // Clear PRs first
    await prisma.purchaseRequestItem.deleteMany({ where: { productId: product.id } });
    await prisma.purchaseRequest.deleteMany({ where: { supplierId: supplier.id } });
    
    await prisma.supplier.update({
        where: { id: supplier.id },
        data: { status: 'INACTIVE' }
    });
    
    await scanInventory();
    
    prs = await prisma.purchaseRequest.findMany({
        where: { supplierId: supplier.id }
    });
    logs = await getAgentLogs();
    
    console.log('PRs created:', prs.length);
    console.log('Latest log:', logs.data?.[0]?.message);

    // Test 3: Existing PR prevents duplicate
    console.log('\n--- TEST 3: Existing PENDING PR ---');
    await prisma.supplier.update({
        where: { id: supplier.id },
        data: { status: 'ACTIVE' }
    });

    // Create a PR manually
    await prisma.purchaseRequest.create({
        data: {
            requestNumber: 'PR-TEST-' + Date.now(),
            supplierId: supplier.id,
            status: 'PENDING',
            requestedBy: USER_ID,
            items: {
                create: {
                    inventoryId: inventory.id,
                    productId: product.id,
                    quantity: 10
                }
            }
        }
    });

    const prCountBefore = await prisma.purchaseRequest.count({ where: { supplierId: supplier.id } });
    console.log('PR Count before scan:', prCountBefore);
    
    await scanInventory();
    
    const prCountAfter = await prisma.purchaseRequest.count({ where: { supplierId: supplier.id } });
    logs = await getAgentLogs();
    
    console.log('PR Count after scan:', prCountAfter);
    console.log('Latest log:', logs.data?.[0]?.message);

    // Test 4: Safe Stock
    console.log('\n--- TEST 4: Safe Stock ---');
    // Clear PRs
    await prisma.purchaseRequestItem.deleteMany({ where: { productId: product.id } });
    await prisma.purchaseRequest.deleteMany({ where: { supplierId: supplier.id } });
    
    await prisma.inventory.update({
        where: { id: inventory.id },
        data: { quantity: 20 }
    });
    
    await scanInventory();
    
    prs = await prisma.purchaseRequest.findMany({
        where: { supplierId: supplier.id }
    });
    logs = await getAgentLogs();
    
    console.log('PRs created:', prs.length);
    console.log('Latest log:', logs.data?.[0]?.message);

    console.log('\n--- TESTS COMPLETED ---');
}

run().catch(console.error);
