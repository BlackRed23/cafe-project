require('dotenv').config({path:'../../apps/api/.env',quiet:true});
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
db.$queryRawUnsafe('SELECT migration_name, logs, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 1').then(r=>console.log(JSON.stringify(r))).finally(()=>db.$disconnect());
