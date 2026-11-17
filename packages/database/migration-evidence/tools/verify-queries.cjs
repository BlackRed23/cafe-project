require('dotenv').config({path:'../../apps/api/.env',quiet:true});
const fs=require('fs');const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
async function main(){
const r=await db.$transaction(async tx=>{
await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
const [identity]=await tx.$queryRawUnsafe('SELECT current_database() AS database');if(identity.database!=='cafe-kltn')throw Error('WRONG_DATABASE');
const product=await tx.product.findMany({take:1,include:{recipes:{include:{ingredients:{include:{ingredient:true}}}},inventory:true}});
const ingredient=await tx.ingredient.findMany({take:1,include:{batches:true,recipeItems:true,transactions:true}});
const recipe=await tx.recipe.findMany({take:1,include:{product:true,ingredients:{include:{ingredient:true}}}});
const inventory=await tx.inventory.findMany({take:1,include:{product:true}});
const payment=await tx.payment.findMany({take:1,include:{order:true,callbacks:true}});
const history=await tx.inventoryTransaction.findMany({take:1,include:{ingredient:true,batch:true,legacyBatch:true,performedByUser:true}});
const purchase=await tx.purchaseRequestItem.findMany({take:1,include:{inventory:true,product:true,ingredient:true}});
const orderItem=await tx.orderItem.findMany({take:1,include:{recipe:true,product:true,toppings:true}});
const constraints=await tx.$queryRawUnsafe("SELECT count(*)::int AS invalid FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated");
return {database:identity.database,queries:{product:product.length,ingredient:ingredient.length,recipe:recipe.length,inventory:inventory.length,payment:payment.length,history:history.length,purchase:purchase.length,orderItem:orderItem.length},constraints};
});
const before=JSON.parse(fs.readFileSync('migration-evidence/before.json'));const after=JSON.parse(fs.readFileSync('migration-evidence/after.json'));
r.preservation=before.tables.filter(t=>t.table!=='_prisma_migrations').map(t=>({table:t.table,countBefore:t.count,countAfter:after.tables.find(a=>a.table===t.table)?.count,preserved:t.count===after.tables.find(a=>a.table===t.table)?.count&&(t.table!=='User'||t.fingerprint===after.tables.find(a=>a.table===t.table)?.fingerprint)}));
if(r.preservation.some(t=>!t.preserved)||r.constraints[0].invalid)throw Error('PRESERVATION_FAILED');
fs.writeFileSync('migration-evidence/query-verification.json',JSON.stringify(r,null,2));console.log(JSON.stringify(r));
}
main().catch(e=>{console.error(e.code||e.message);process.exitCode=1}).finally(()=>db.$disconnect());
