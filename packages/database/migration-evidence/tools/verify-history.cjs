const fs=require('fs'),crypto=require('crypto');require('dotenv').config({path:'../../apps/api/.env',quiet:true});const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
db.$queryRawUnsafe('SELECT migration_name,checksum,finished_at,rolled_back_at,applied_steps_count FROM "_prisma_migrations" ORDER BY started_at').then(rows=>{
const results=rows.map(r=>({...r,fileChecksum:crypto.createHash('sha256').update(fs.readFileSync('prisma/schema/migrations/'+r.migration_name+'/migration.sql')).digest('hex')}));
if(results.some(r=>r.finished_at&&r.checksum!==r.fileChecksum))throw Error('MIGRATION_CHECKSUM_MISMATCH');
fs.writeFileSync('migration-evidence/migration-history.json',JSON.stringify(results,null,2));console.log(JSON.stringify({applied:results.filter(r=>r.finished_at).length,rolledBack:results.filter(r=>r.rolled_back_at).length,appliedChecksumsMatch:true}));
}).catch(e=>{console.error(e.code||e.message);process.exitCode=1}).finally(()=>db.$disconnect());
