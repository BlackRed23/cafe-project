const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixDuplicates() {
  const items = await prisma.purchaseRequestItem.findMany();
  const seen = new Set();
  for (const item of items) {
    const key = `${item.requestId}-${item.productId}`;
    if (seen.has(key)) {
      console.log(`Deleting duplicate: ${item.id}`);
      await prisma.purchaseRequestItem.delete({ where: { id: item.id } });
    } else {
      seen.add(key);
    }
  }
  console.log('Done cleaning duplicates.');
}

fixDuplicates().catch(console.error).finally(() => prisma.$disconnect());
