// Real read-only JWT HTTP -> Backend Prisma -> existing cafedb.
// Never seeds ledger or writes purchases; opt-in through owned test proxy.
// RISK_CAFEDB_CONFIRMED=YES RISK_DB_PORT=<owned-port> node apps/api/tests/agent-demand-risk.cafedb.cjs
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {randomUUID,randomBytes}=require('node:crypto');
require('dotenv').config({path:'apps/api/.env',quiet:true});
assert.equal(process.env.RISK_CAFEDB_CONFIRMED,'YES');
// Unique internal service credential confined to this owned test process;
// only presence/authorization statuses are recorded, NEVER the value.
process.env.AGENT_INTERNAL_TOKEN=randomBytes(64).toString('base64url');
const uri=new URL(process.env.DATABASE_URL);
assert.equal(uri.pathname,'/cafedb');
uri.hostname='127.0.0.1';uri.port=process.env.RISK_DB_PORT||'15432';
process.env.DATABASE_URL=uri.toString();process.env.NODE_ENV='test';
require('ts-node').register({project:'apps/api/tsconfig.json',transpileOnly:true});
const {PrismaClient}=require('@prisma/client');
const jwt=require('jsonwebtoken'),express=require('express');
const db=new PrismaClient({datasources:{db:{url:uri.toString()}}});
const runId='agent-demand-risk-'+randomUUID();
const folder='D:/KLTN/cafe-project-artifacts/reports/agent';
fs.mkdirSync(folder,{recursive:true});
const target=folder+'/'+runId+'.json';
const out={runId,caseIds:['AI02','AI03','AI04','AI11','AI12','AI24'],database:'cafedb',
  startedAt:new Date().toISOString(),evidenceClass:'JWT_HTTP_BACKEND_REAL_PRISMA_CAFEDB_READ_ONLY',
  graphProof:false,approvedBusinessPolicy:false,requests:[],verdict:'NOT_RUN'};
const serialize=value=>JSON.stringify(value,(key,x)=>
  /^(token|accessToken|refreshToken|secret|password|authorization|signature|x-agent-internal-token)$/i.test(key)?'[REDACTED]':
    typeof x==='bigint'?String(x):x,2);
let server;
async function main(){
  try{
    const [current]=await db.$queryRawUnsafe('SELECT current_database() AS name');
    assert.equal(current.name,'cafedb');
    const admin=await db.user.findFirstOrThrow({
      where:{role:'ADMIN',isActive:true},select:{id:true,email:true,role:true}});
    const staff=await db.user.findFirstOrThrow({
      where:{role:'STAFF',isActive:true},select:{id:true,email:true,role:true}});
    const ingredient=await db.ingredient.findFirstOrThrow({
      where:{isActive:true,deletedAt:null},select:{id:true}});
    const snapshot=()=>Promise.all([
      db.ingredient.findUnique({where:{id:ingredient.id},
        select:{quantity:true,reserved:true,rowVersion:true,movementCursor:true}}),
      db.inventoryTransaction.count({where:{ingredientId:ingredient.id}}),
      db.purchaseRequestItem.count({where:{ingredientId:ingredient.id}}),
      db.purchaseOrderItem.count({where:{ingredientId:ingredient.id}})
    ]);
    const before=serialize(await snapshot());
    const app=express();app.use(express.json());
    app.use('/api/agent',require('../src/modules/agent/agent.route').default);
    app.use(require('../src/common/error-handler').errorHandler);
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const base='http://127.0.0.1:'+server.address().port+'/api/agent/demand-risk/';
    const signed=user=>jwt.sign(user,process.env.JWT_SECRET,{expiresIn:'10m'});
    async function get(suffix,role,token){
      const res=await fetch(base+suffix,{
        headers:token?{Authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(25000)});
      const payload=await res.json();
      out.requests.push({role,method:'GET',path:'/api/agent/demand-risk/'+suffix,
        httpStatus:res.status,resultCode:payload?.data?.codes??null,at:new Date().toISOString()});
      return {http:res.status,payload};
    }
    const authorized=await get(ingredient.id,'ADMIN',signed(admin));
    assert.equal(authorized.http,200,serialize(authorized.payload).slice(0,1000));
    const risk=authorized.payload.data;
    assert.equal(risk.ingredientId,ingredient.id);
    assert.equal(risk.demand.model,'DETERMINISTIC_LEDGER_BASELINE');
    assert.equal(risk.providerDeliveryVerified,false);
    assert.equal(risk.policyVersionApproved,false);
    assert.equal(risk.writesPerformed,false);
    assert.equal(risk.purchasingDecision,'HOLD_FOR_AUTHORIZED_REVIEW');
    assert.equal(typeof risk.movementCursor,'string');
    assert.ok(['LOW','MEDIUM','HIGH'].includes(risk.demand.confidence));
    assert.equal(risk.supplyTiming.arrivalEvidence,
      risk.leadTimeEstimateDays===null?'UNAVAILABLE':'SUPPLIER_CATALOG_ESTIMATE');
    assert.equal(risk.supplyTiming.projectedCoverageDaysWithoutInbound,
      risk.stockoutEstimateDays);
    assert.equal(risk.supplyTiming.hypotheticalCoverageDaysWithInbound===null
      || risk.inboundOutstandingBase>0,true);
    assert.ok(Array.isArray(risk.openPurchaseRequests));
    assert.ok(risk.openPurchaseRequests.length<=risk.pendingPurchaseRequestItems);
    assert.equal(risk.openPurchaseRequestsTruncated,
      risk.pendingPurchaseRequestItems>risk.openPurchaseRequests.length);
    assert.equal(risk.codes.includes('PROJECTED_STOCKOUT_BEFORE_LEAD_TIME'),
      risk.supplyTiming.codes.includes('PROJECTED_STOCKOUT_BEFORE_LEAD_TIME'));
    const forbidden=await get(ingredient.id,'STAFF',signed(staff));
    assert.equal(forbidden.http,403);
    const anon=await get(ingredient.id,'ANONYMOUS');
    assert.equal(anon.http,401);
    const invalid=await get('@bad','ADMIN',signed(admin));
    assert.equal(invalid.http,400);
    async function internal(actorId,token,label,extra=''){
      const res=await fetch('http://127.0.0.1:'+server.address().port+
        '/api/agent/internal/demand-risk/'+ingredient.id+
        '?actorId='+encodeURIComponent(actorId)+extra, {
          headers:token?{'x-agent-internal-token':token}:{},
          signal:AbortSignal.timeout(25000)
        });
      const payload=await res.json();
      out.requests.push({role:label,method:'GET',
        path:'/api/agent/internal/demand-risk/:ingredientId',httpStatus:res.status,
        resultCode:payload?.data?.codes??null,at:new Date().toISOString()});
      return {http:res.status,payload};
    }
    const serviceAdmin=await internal(admin.id,process.env.AGENT_INTERNAL_TOKEN,'INTERNAL_ADMIN');
    assert.equal(serviceAdmin.http,200,serialize(serviceAdmin.payload));
    assert.equal(serviceAdmin.payload.data.ingredientId,risk.ingredientId);
    assert.equal(serviceAdmin.payload.data.writesPerformed,false);
    assert.equal(serviceAdmin.payload.data.purchasingDecision,'HOLD_FOR_AUTHORIZED_REVIEW');
    const serviceStaff=await internal(staff.id,process.env.AGENT_INTERNAL_TOKEN,'INTERNAL_STAFF');
    assert.equal(serviceStaff.http,403);
    const serviceAnonymous=await internal(admin.id,undefined,'INTERNAL_NO_TOKEN');
    assert.equal(serviceAnonymous.http,403);
    const serviceInvalidToken=await internal(admin.id,'invalid','INTERNAL_BAD_TOKEN');
    assert.equal(serviceInvalidToken.http,403);
    const serviceUnknown=await internal('test-unknown-actor',process.env.AGENT_INTERNAL_TOKEN,'INTERNAL_UNKNOWN');
    assert.equal(serviceUnknown.http,403);
    const serviceExtra=await internal(admin.id,process.env.AGENT_INTERNAL_TOKEN,
      'INTERNAL_EXTRA_QUERY','&overridePolicy=true');
    assert.equal(serviceExtra.http,400);
    // AI08: optional existing real open PR fixture; READ only, never create PR.
    const openPr=await db.purchaseRequestItem.findFirst({
      where:{ingredientId:{not:null},ingredient:{isActive:true,deletedAt:null},
        request:{status:{in:['PENDING','APPROVED','SENT']}}},
      select:{ingredientId:true,requestId:true},
      orderBy:{createdAt:'desc'}
    });
    if(openPr){
      const hasOpen=await get(openPr.ingredientId,'AI08_EXISTING_PR',signed(admin));
      assert.equal(hasOpen.http,200);
      assert.ok(hasOpen.payload.data.codes.includes('EXISTING_PURCHASE_REQUEST'));
      assert.ok(hasOpen.payload.data.openPurchaseRequests.some(row=>row.id===openPr.requestId));
      assert.equal(hasOpen.payload.data.purchasingDecision,'HOLD_FOR_AUTHORIZED_REVIEW');
      assert.equal(hasOpen.payload.data.writesPerformed,false);
      out.ai08={status:'BACKEND_PASS_READONLY_DETECTION',ingredientId:openPr.ingredientId,
        existingPrId:openPr.requestId};
    }else out.ai08={status:'NOT_RUN_NO_ELIGIBLE_OPEN_PR'};
    // AI06/AI07: current live StocktakeEntry (not a legacy StockCountItem)
    // must not become authoritative stock while it awaits a decision.
    const pending=await db.stocktakeEntry.findFirst({
      where:{stockCount:{status:{in:['DRAFT','PENDING_APPROVAL','NEEDS_INVESTIGATION']}},
        ingredientId:{in:(await db.ingredient.findMany({
          where:{isActive:true,deletedAt:null},select:{id:true},take:1000
        })).map(row=>row.id)}},
      select:{ingredientId:true,stockCountId:true}
    });
    if(pending){
      const held=await get(pending.ingredientId,'AI07_UNVERIFIED_STOCKTAKE',signed(admin));
      assert.equal(held.http,200);
      assert.ok(held.payload.data.codes.includes('STOCKTAKE_UNCERTAIN'));
      assert.ok(held.payload.data.pendingStockCountItems>0);
      assert.equal(held.payload.data.writesPerformed,false);
      out.ai07={status:'BACKEND_PASS_READONLY_STOCKTAKE_HOLD',
        ingredientId:pending.ingredientId,sessionId:pending.stockCountId};
    }else out.ai07={status:'NOT_RUN_NO_LIVE_PENDING_ENTRY'};
    // AI06/AI13/AI24: independently observe a real PREEXISTING positive lot
    // (not fabricated expiry/quality) through the same JWT/Backend/Prisma
    // read-only path. If there is no such live lot, report NOT_RUN instead of
    // converting unit contracts into production evidence.
    out.lotEvidence=[];
    const lotScenarios=[
      ['EXPIRED_STOCK_PRESENT',{expirationDate:{lte:new Date()},quantityRemaining:{gt:0}}],
      ['UNKNOWN_EXPIRY_LOT',{expirationDate:null,quantityRemaining:{gt:0}}],
      ['NON_AVAILABLE_LOT_PRESENT',{qualityStatus:{not:'AVAILABLE'},quantityRemaining:{gt:0}}]
    ];
    for(const [expected,criteria] of lotScenarios){
      const realLot=await db.ingredientBatch.findFirst({
        where:{...criteria,ingredient:{isActive:true,deletedAt:null}},
        select:{id:true,ingredientId:true}
      });
      if(!realLot){
        out.lotEvidence.push({code:expected,status:'NOT_RUN_NO_EXISTING_LOT'});
        continue;
      }
      const localBefore=serialize(await Promise.all([
        db.ingredient.findUnique({where:{id:realLot.ingredientId},
          select:{quantity:true,reserved:true,rowVersion:true,movementCursor:true}}),
        db.inventoryTransaction.count({where:{ingredientId:realLot.ingredientId}}),
        db.purchaseRequestItem.count({where:{ingredientId:realLot.ingredientId}}),
        db.purchaseOrderItem.count({where:{ingredientId:realLot.ingredientId}})
      ]));
      const result=await get(realLot.ingredientId,'AI_LOT_'+expected,signed(admin));
      assert.equal(result.http,200,serialize(result.payload).slice(0,700));
      assert.ok(result.payload.data.codes.includes(expected),expected);
      assert.equal(result.payload.data.writesPerformed,false);
      assert.equal(result.payload.data.purchasingDecision,'HOLD_FOR_AUTHORIZED_REVIEW');
      const localAfter=serialize(await Promise.all([
        db.ingredient.findUnique({where:{id:realLot.ingredientId},
          select:{quantity:true,reserved:true,rowVersion:true,movementCursor:true}}),
        db.inventoryTransaction.count({where:{ingredientId:realLot.ingredientId}}),
        db.purchaseRequestItem.count({where:{ingredientId:realLot.ingredientId}}),
        db.purchaseOrderItem.count({where:{ingredientId:realLot.ingredientId}})
      ]));
      assert.equal(localAfter,localBefore,'Lot evidence read changed live business state');
      out.lotEvidence.push({code:expected,status:'BACKEND_PASS_EXISTING_LOT_READONLY',
        lotId:realLot.id,ingredientId:realLot.ingredientId,beforeAfterIdentical:true});
    }
    // AI04: seek actual historical consumption between days 8..13 with no
    // CONSUME in the last 7 days; this must never fabricate current demand
    // from a 30-day average. No transaction or synthetic sales are created.
    const clock=new Date(),day=86400000;
    const history=await db.inventoryTransaction.findMany({
      where:{type:'CONSUME',ingredientId:{not:null},
        createdAt:{gte:new Date(clock.getTime()-13*day),
          lte:new Date(clock.getTime()-8*day)}},
      select:{ingredientId:true},take:250
    });
    out.ai04Dormant={status:'NOT_RUN_NO_ELIGIBLE_LIVE_HISTORY'};
    for(const source of history){
      const candidateId=source.ingredientId;
      const row=await db.ingredient.findUnique({
        where:{id:candidateId},select:{isActive:true,deletedAt:true}});
      if(!row?.isActive || row.deletedAt)continue;
      const recent=await db.inventoryTransaction.count({
        where:{ingredientId:candidateId,type:'CONSUME',
          createdAt:{gte:new Date(clock.getTime()-7*day)}}
      });
      if(recent)continue;
      const observed=await get(candidateId,'AI04_DORMANT_LIVE',signed(admin));
      assert.equal(observed.http,200);
      assert.equal(observed.payload.data.demand.dailyRate,0);
      assert.equal(observed.payload.data.demand.confidence,'LOW');
      assert.ok(observed.payload.data.codes.includes('DEMAND_DORMANT_REVIEW'));
      assert.equal(observed.payload.data.writesPerformed,false);
      out.ai04Dormant={status:'BACKEND_PASS_READONLY_DORMANT_HOLD',
        ingredientId:candidateId,code:'DEMAND_DORMANT_REVIEW'};
      break;
    }
    const after=serialize(await snapshot());
    assert.equal(after,before,'Read-only forecast wrote stock or procurement state');
    out.verdict='BACKEND_PASS_READONLY';
    out.ingredientId=ingredient.id;
    out.demand=risk.demand;
    out.codes=risk.codes;
    out.supplyTiming=risk.supplyTiming;
    out.existingPurchaseRequestItems=risk.pendingPurchaseRequestItems;
    out.liveStocktakeEvidenceCount=risk.pendingStockCountItems;
    out.stateBeforeAfterEqual=true;
    out.httpCount=out.requests.length;
    out.internalServiceAuthorizationVerified=true;
    out.note='Deterministic forecast with real current ledger and PostgreSQL snapshot; '
      +'does not prove actual Agent StateGraph integrated forecasting, supplier external ETA or superiority over manual.';
  }catch(error){
    out.verdict='FAIL';out.error=String(error.stack||error.message).slice(0,1600);
    process.exitCode=1;
  }finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    await db.$disconnect();
    out.finishedAt=new Date().toISOString();
    fs.writeFileSync(target,serialize(out),'utf8');
    console.log(serialize({target,runId,verdict:out.verdict,httpCount:out.httpCount,
      codes:out.codes,error:out.error?.slice(0,500)}));
  }
}
main().catch(error=>{console.error(error);process.exitCode=2});
