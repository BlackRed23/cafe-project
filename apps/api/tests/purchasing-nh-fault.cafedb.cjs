// Real HTTP + cafedb rollback, fault-only server :5005, owned fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const root = 'D:/KLTN/cafe-project-artifacts/reports/purchasing';
fs.mkdirSync(root,{recursive:true});
const evidence = { run:'nh-fault-'+randomUUID(), scenarios:[],requests:[] };
const json = x => JSON.stringify(x,(_k,v)=>typeof v==='bigint'?v.toString():v);
async function main() {
  assert.equal(process.env.PURCHASING_FAULT_CONFIRMED,'YES');
  const u = new URL(process.env.DATABASE_URL);assert.equal(u.pathname,'/cafedb');
  u.hostname='127.0.0.1';u.port='55432';
  const db = new PrismaClient({datasources:{db:{url:u.toString()}}});
  let token;
  const api = async(method,route,body) => {
    const r=await fetch('http://127.0.0.1:5005/api'+route,{method,
      signal:AbortSignal.timeout(30000),
      headers:{'content-type':'application/json',authorization:'Bearer '+token},
      body:body===undefined?undefined:JSON.stringify(body)});
    const response=await r.json();
    const row={id:'NH-F'+(evidence.requests.length+1),method,route,body,status:r.status,response};
    evidence.requests.push(row);return row;
  };
  const ok=(r,expected=200)=>{assert.equal(r.status,expected,json(r).slice(0,800));return r.response.data};
  const state=async(i,p,o)=>({
    ingredient:await db.ingredient.findUniqueOrThrow({where:{id:i}}),
    batches:await db.ingredientBatch.findMany({where:{ingredientId:i},orderBy:{id:'asc'}}),
    ledger:await db.inventoryTransaction.findMany({where:{ingredientId:i},orderBy:{id:'asc'}}),
    pr:await db.purchaseRequest.findUniqueOrThrow({where:{id:p},include:{items:true}}),
    po:await db.purchaseOrder.findUniqueOrThrow({where:{id:o},include:{items:true}}),
    receipts:await db.goodsReceipt.findMany({where:{purchaseOrderId:o},orderBy:{id:'asc'}})
  });
  try{
    const actor=await db.user.findFirstOrThrow({where:{role:'ADMIN',isActive:true},
      select:{id:true,email:true,role:true}});
    token=jwt.sign(actor,process.env.JWT_SECRET,{expiresIn:'1h'});
    for(const [id,marker] of [['NH-ROLLBACK-LEDGER','__NH_LEDGER_ROLLBACK__'],
      ['NH-ROLLBACK-PO-FINALIZE','__NH_PO_FINALIZE_ROLLBACK__']]){
      const start=evidence.requests.length;
      try{
        const name=evidence.run+'-'+id;
        const i=ok(await api('POST','/ingredients',{
          sku:name,name,baseUnit:'gram',expiryClassification:'NON_PERISHABLE'
        }),201);
        const supplier=ok(await api('POST','/suppliers',{name,
          email:'nh-fault-'+randomUUID().slice(0,6)+'@example.invalid'}),201).supplier;
        ok(await api('POST','/supplier-products',{supplierId:supplier.id,productId:i.id,
          price:10,purchaseUnit:'gram',conversionQuantity:1,conversionTargetUnit:'gram'}),201);
        const p=ok(await api('POST','/purchase-requests',{supplierId:supplier.id,
          notes:marker,items:[{ingredientId:i.id,quantity:10,unitPrice:10}]}),201).purchaseRequest;
        ok(await api('PATCH','/purchase-requests/'+p.id+'/approve'));
        const po=ok(await api('POST','/purchase-orders',{
          requestId:randomUUID(),purchaseRequestId:p.id,currency:'VND'
        }),201).order;
        ok(await api('POST','/purchase-orders/'+po.id+'/confirm',{
          requestId:randomUUID(),reason:name,evidenceReference:name+'-admin-attestation'
        }));
        const before=await state(i.id,p.id,po.id);
        const attempt=await api('POST','/purchase-orders/'+po.id+'/receipts',{
          requestId:randomUUID(),note:marker,items:[{purchaseOrderItemId:po.items[0].id,
            receivedQuantity:10,batches:[{
              batchCode:name,expirationDate:'2099-01-01T00:00:00.000Z',quantity:10
            }]}]
        });
        assert.ok(attempt.status>=400,'Intentional fault did not surface as failed HTTP.');
        const after=await state(i.id,p.id,po.id);
        assert.equal(json(after),json(before),'Partial purchasing transaction committed.');
        assert.equal(Number(after.ingredient.quantity),0);
        assert.equal(after.po.status,'CONFIRMED');
        assert.equal(after.receipts.length,0);
        assert.equal(after.ledger.length,0);
        assert.equal(after.ingredient.movementCursor.toString(),before.ingredient.movementCursor.toString());
        evidence.scenarios.push({id,verdict:'PASS',purchaseRequestId:p.id,orderId:po.id,
          failedHttp:attempt.status,fullRollback:true,
          evidence:evidence.requests.slice(start).map(r=>r.id)});
      }catch(e){
        evidence.scenarios.push({id,verdict:'FAIL',error:e.stack??e.message,
          evidence:evidence.requests.slice(start).map(r=>r.id)});
      }
      console.log(id+' '+evidence.scenarios.at(-1).verdict);
    }
  }finally{
    evidence.finishedAt=new Date().toISOString();
    fs.writeFileSync(root+'/PURCHASING-FAULT-EVIDENCE.json',json(evidence));
    await db.$disconnect();
  }
  if(evidence.scenarios.some(x=>x.verdict!=='PASS'))process.exitCode=1;
}
main().catch(e=>{console.error(e.stack);process.exitCode=2;});
