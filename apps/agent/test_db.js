import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const logs = await prisma.agentLog.findMany({
    orderBy: { triggered_at: 'desc' },
    take: 3
  });
  console.log(JSON.stringify(logs, null, 2));
  await prisma.$disconnect();
}
run();
