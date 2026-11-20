// AI24 actual Backend near-expiry stock risk with an isolated authenticated
// Ingredient + Batch import. No automatic PR/PO, email, refund or provider calls.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {randomUUID}=require('node:crypto');
assert.equal(process.env.RISK_CAFEDB_CONFIRMED,'YES');
require('dotenv').config({path:'apps/api/.env',quiet:true});
const uri=new URL(process.env.DATABASE_URL);assert.equal(uri.pathname,'/cafedb');
uri.hostname='127.0.0.1';uri.port=process.env.RISK_DB_PORT||'15432';
process.env.DATABASE_URL=uri.toString();process.env.NODE_ENV='test';
require('ts-node').register({project:'apps/api/tsconfig.json',transpileOnly:true});
const {PrismaClient}=require('@prisma/client'),jwt=require('jsonwebtoken'),express=require('express');
const db=new PrismaClient({datasources:{db:{url:uri.toString()}}});
const runId='ai24-real-expiry-'+randomUUID();
const folder='D:/KLTN/cafe-project-artifacts/reports/agent';
fs.mkdirSync(folder,{recursive:true});
const target=folder+'/'+runId+'.json';
const out={runId,caseId:'AI24',startedAt:new Date().toISOString(),db:'cafedb',
  verdict:'NOT_RUN',evidenceClass:'AUTHENTICATED_HTTP_REAL_PRISMA_FIXTURE_BACKEND_ONLY',
  graphExecuted:false,requests:[],codes:[],externalProviderVerified:false};
const clean=x=>JSON.stringify(x,(k,v)=>/token|secret|authorization|password|signature/i.test(k)?
  '[REDACTED]':typeof v==='bigint'?String(v):v,2);
let server, fixtureIngredientId;
async function main(){
  try{
    const [identity]=await db.$queryRawUnsafe('SELECT current_database() AS name');
    assert.equal(identity.name,'cafedb');
    const admin=await db.user.findFirstOrThrow({where:{role:'ADMIN',isActive:true},
      select:{id:true,email:true,role:true}});
    const token=jwt.sign(admin,process.env.JWT_SECRET,{expiresIn:'12m'});
    const app=express();app.use(express.json());
    app.use('/api/ingredients',require('../src/modules/ingredient/ingredient.route').ingredientRoutes);
    app.use('/api/agent',require('../src/modules/agent/agent.route').default);
    app.use(require('../src/common/error-handler').errorHandler);
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const base='http://127.0.0.1:'+server.address().port+'/api';
    const api=async(method,route,body)=>{
      const response=await fetch(base+route,{method,headers:{
        Authorization:'Bearer '+token,'content-type':'application/json'},
      body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
      const result=await response.json();
      out.requests.push({method,route,status:response.status,requestId:body?.requestId??null});
      assert.ok(response.status>=200 && response.status<300,
        route+' HTTP'+response.status+' '+clean(result).slice(0,500));
      return result.data;
    };
    const sku='AI24-'+randomUUID().slice(0,18),expires=new Date(Date.now()+2*86400000);
    const ingredient=await api('POST','/ingredients',{sku,name:sku,baseUnit:'g',
      expiryClassification:'PERISHABLE',costPerBaseUnit:2,minThreshold:5});
    fixtureIngredientId=ingredient.id;
    const imported=await api('POST','/ingredients/'+ingredient.id+'/import',{
      requestId:randomUUID(),quantity:20,unit:'g',unitCost:2,
      batchCode:sku+'-near',expirationDate:expires.toISOString()});
    const before={ingredient:await db.ingredient.findUniqueOrThrow({where:{id:ingredient.id},
      select:{quantity:true,reserved:true,rowVersion:true,movementCursor:true}}),
      ledger:await db.inventoryTransaction.count({where:{ingredientId:ingredient.id}}),
      pr:await db.purchaseRequestItem.count({where:{ingredientId:ingredient.id}}),
      po:await db.purchaseOrderItem.count({where:{ingredientId:ingredient.id}})};
    const risk=await api('GET','/agent/demand-risk/'+ingredient.id);
    assert.equal(risk.writesPerformed,false);
    assert.equal(risk.purchasingDecision,'HOLD_FOR_AUTHORIZED_REVIEW');
    assert.ok(risk.nearExpiryBase>=19.999);
    assert.ok(risk.potentialExpirySurplusBase>=19.999);
    assert.equal(risk.demand.confidence,'LOW');
    assert.ok(risk.codes.includes('EXPIRY_SURPLUS_RISK'));
    assert.ok(risk.codes.includes('SPARSE_HISTORY_FALLBACK'));
    assert.equal(risk.inboundOutstandingBase,0);
    assert.equal(risk.supplyTiming.projectedShortfallBeforeArrivalBase,null);
    assert.ok(risk.supplyTiming.codes.includes('DEMAND_RATE_UNCERTAIN'));
    assert.equal(risk.openPurchaseRequests.length,0);
    const after={ingredient:await db.ingredient.findUniqueOrThrow({where:{id:ingredient.id},
      select:{quantity:true,reserved:true,rowVersion:true,movementCursor:true}}),
      ledger:await db.inventoryTransaction.count({where:{ingredientId:ingredient.id}}),
      pr:await db.purchaseRequestItem.count({where:{ingredientId:ingredient.id}}),
      po:await db.purchaseOrderItem.count({where:{ingredientId:ingredient.id}})};
    assert.equal(clean(after),clean(before));
    out.verdict='BACKEND_PASS_READONLY';
    out.fixture={ingredientId:ingredient.id,lotId:imported.batch.id,expiresAt:expires.toISOString()};
    out.initialPhysicalBase=20;
    out.nearExpiryBase=risk.nearExpiryBase;
    out.excessBase=risk.potentialExpirySurplusBase;
    out.codes=risk.codes;
    out.noProcurementWrite=before.pr===after.pr&&before.po===after.po&&after.pr===0&&after.po===0;
    out.noInventoryMutationFromRead=clean(after)===clean(before);
    out.note='Actual Backend risk computation from real isolated perishable lot; '
      +'no Graph decision, no approved shelf-life policy, no physical-world expiry proof.';
  }catch(error){out.verdict='FAIL';out.error=String(error.stack||error).slice(0,1700);
    process.exitCode=1;
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    if(fixtureIngredientId){
      try {
        await db.ingredient.update({where:{id:fixtureIngredientId},data:{isActive:false}});
        out.fixtureDeactivated=true;
      } catch(error){
        out.fixtureDeactivated=false;
        out.cleanupError=String(error.message).slice(0,300);
        process.exitCode=1;
      }
    }
    await db.$disconnect();out.finishedAt=new Date().toISOString();
    fs.writeFileSync(target,clean(out),'utf8');
    console.log(clean({target,runId,verdict:out.verdict,requests:out.requests.length,
      codes:out.codes,reason:out.error?.slice(0,400)}));
  }
}
main().catch(error=>{console.error(error);process.exitCode=2});
