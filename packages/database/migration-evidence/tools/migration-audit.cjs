const fs = require('fs');
const { spawnSync } = require('child_process');
require('dotenv').config({path: '../../apps/api/.env', quiet:true});
require('dotenv').config({path: '.env', quiet:true});
const {PrismaClient}=require('@prisma/client');
const db=new PrismaClient();
const out='migration-evidence'; fs.mkdirSync(out,{recursive:true});
async function main(){
const identity=await db.$queryRawUnsafe('SELECT current_database() AS database, current_schema() AS schema, version() AS version');
if(identity[0].database!=='cafe-kltn') throw Error('WRONG_DATABASE');
const evidence={identity, tables:[], columns:await db.$queryRawUnsafe("SELECT table_name,column_name,data_type,udt_name,is_nullable,column_default,numeric_precision,numeric_scale FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position"), enums:await db.$queryRawUnsafe("SELECT t.typname,e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder"), constraints:await db.$queryRawUnsafe("SELECT c.conname, c.conrelid::regclass::text AS table_name,pg_get_constraintdef(c.oid) AS definition,c.convalidated FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' ORDER BY c.conname")};
await db.$transaction(async tx=>{await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
for(const {tablename} of await tx.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")){
 const q='"'+tablename.replaceAll('"','""')+'"';
 const [r]=await tx.$queryRawUnsafe(`SELECT count(*)::text AS count,md5(coalesce(string_agg(rowhash,'' ORDER BY rowhash),'')) AS fingerprint FROM (SELECT md5(row_to_json(t)::text) AS rowhash FROM public.${q} t) s`);
 evidence.tables.push({table:tablename,...r});
}
for(const table of ['Payment','InventoryTransaction']) evidence[table]=await tx.$queryRawUnsafe(`SELECT "${table==='Payment'?'status':'type'}"::text AS value,count(*)::text AS count FROM "${table}" GROUP BY 1 ORDER BY 1`);
}, {timeout:60000});
fs.writeFileSync(out+(process.argv.includes('--after')?'/after.json':'/before.json'),JSON.stringify(evidence,null,2));
console.log(JSON.stringify({identity,tables:evidence.tables,status:evidence.Payment,transactionTypes:evidence.InventoryTransaction}));
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1}).finally(()=>db.$disconnect());
