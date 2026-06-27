const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const logs = await prisma.agentLog.findMany({ orderBy: { triggered_at: 'desc' }, take: 5 });
  console.log(JSON.stringify(logs, null, 2));
}
main().catch(console.error).finally(() => prisma.$disconnect());
