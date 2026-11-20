// KT02 real PostgreSQL 40P01 deadlock, plus bounded test-only retry and HTTP idempotence.
// Opt-in: KT_CAFEDB_CONFIRMED=YES KT_DB_PORT=15432 node apps/api/tests/technical-kt-deadlock.cafedb.cjs
// SELECT row locks only; no destructive SQL or production source edits.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {randomUUID}=require('node:crypto');
require('dotenv').config({path:'apps/api/.env',quiet:true});
require('dotenv').config({quiet:true});
assert.equal(process.env.KT_CAFEDB_CONFIRMED,'YES');
const url=new URL(process.env.DATABASE_URL);
assert.equal(url.pathname,'/cafedb');
url.hostname='127.0.0.1';url.port=process.env.KT_DB_PORT||'15432';
process.env.DATABASE_URL=url.toString();
process.env.NODE_ENV='test';
require('ts-node').register({project:'apps/api/tsconfig.json',transpileOnly:true});
const {PrismaClient}=require('@prisma/client'),jwt=require('jsonwebtoken');
const express=require('express');
const db=new PrismaClient({datasources:{db:{url:url.toString()}}});
const runID='kt-deadlock-'+randomUUID();
const folder='D:/KLTN/cafe-project-artifacts/reports/security';
fs.mkdirSync(folder,{recursive:true});
const target=folder+'/technical-kt-deadlock-'+runID+'.json';
const output={runID,startedAt:new Date().toISOString(),db:'cafedb',case:'KT02',
  verdict:'NOT_RUN',observedLockWaiters:[],http:[],
  note:'Real 40P01 is verified; bounded backoff implemented by test only, not inferred in product'};
const string=v=>JSON.stringify(v,(_k,x)=>typeof x==='bigint'?x.toString():x,2);
const save=()=>fs.writeFileSync(target,string(output),'utf8');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
  let appServer;
  try{
    const [info]=await db.$queryRawUnsafe('SELECT current_database() AS name');
    assert.equal(info.name,'cafedb');
    const admin=await db.user.findFirstOrThrow({where:{role:'ADMIN',isActive:true},
      select:{id:true,role:true,email:true}});
    const token=jwt.sign(admin,process.env.JWT_SECRET,{expiresIn:'30m'});
    const app=express();app.use(express.json());
    app.use('/api/ingredients',require('../src/modules/ingredient/ingredient.route').ingredientRoutes);
    app.use(require('../src/common/error-handler').errorHandler);
    appServer=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>appServer.once('listening',resolve));
    const base='http://127.0.0.1:'+appServer.address().port;
    async function call(method,path,body){
      const res=await fetch(base+'/api'+path,{method,
        headers:{'content-type':'application/json',authorization:'Bearer '+token},
        body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(16000)});
      const response=await res.json();
      output.http.push({method,path,status:res.status,requestId:body?.requestId});
      assert.ok([200,201].includes(res.status),string(response));
      return response.data;
    }
    const create=suffix=>call('POST','/ingredients',{
      sku:runID+'-'+suffix,name:runID+'-'+suffix,baseUnit:'g',
      expiryClassification:'NON_PERISHABLE',costPerBaseUnit:2});
    const a=await create('A'),b=await create('B');
    output.ingredients=[a.id,b.id];
    let signalA,signalB,releaseA,releaseB;
    const readyA=new Promise(r=>signalA=r),readyB=new Promise(r=>signalB=r);
    const gateA=new Promise(r=>releaseA=r),gateB=new Promise(r=>releaseB=r);
    const txA=db.$transaction(async tx=>{
      await tx.$queryRawUnsafe('SELECT id FROM "Ingredient" WHERE id=$1 FOR UPDATE',a.id);
      signalA();await gateA;
      await tx.$queryRawUnsafe('SELECT id FROM "Ingredient" WHERE id=$1 FOR UPDATE',b.id);
      return 'TX-A-COMMITTED';
    },{timeout:18000});
    const txB=db.$transaction(async tx=>{
      await tx.$queryRawUnsafe('SELECT id FROM "Ingredient" WHERE id=$1 FOR UPDATE',b.id);
      signalB();await gateB;
      await tx.$queryRawUnsafe('SELECT id FROM "Ingredient" WHERE id=$1 FOR UPDATE',a.id);
      return 'TX-B-COMMITTED';
    },{timeout:18000});
    await Promise.all([readyA,readyB]);
    releaseA();releaseB();
    for(let n=0;n<100;n++){
      const rows=await db.$queryRawUnsafe(
        "SELECT pid,wait_event FROM pg_stat_activity WHERE datname=current_database() "+
        "AND wait_event_type='Lock' AND query LIKE '%Ingredient%FOR UPDATE%'");
      if(rows.length)output.observedLockWaiters=rows.map(r=>({pid:r.pid,event:r.wait_event}));
      if(rows.length>=2)break;
      await sleep(20);
    }
    const done=await Promise.allSettled([txA,txB]);
    const errors=done.filter(r=>r.status==='rejected').map(r=>String(r.reason?.message||r.reason));
    output.pgResults=done.map(r=>r.status==='fulfilled'?r.value:'REJECTED');
    output.pgErrorClasses=errors.map(message=>
      message.includes('40P01')?'40P01':message.toLowerCase().includes('deadlock detected')
        ?'deadlock detected':'OTHER_ERROR');
    output.deadlockDetected=output.pgErrorClasses.some(x=>x!=='OTHER_ERROR');
    assert.ok(output.deadlockDetected,'No PostgreSQL 40P01 deadlock: '+string(output.pgErrorClasses));
    assert.ok(output.observedLockWaiters.length>=2,'No simultaneous PostgreSQL Lock waits observed');
    // Force a *second actual* PG lock conflict, proving bounded exponential
    // backoff happens in THIS test (not making an unsupported product claim).
    const sorted=[a.id,b.id].sort(),delays=[];let retried=false,unblock,notify;
    const gate=new Promise(resolve=>unblock=resolve);
    const locked=new Promise(resolve=>notify=resolve);
    const blocker=db.$transaction(async tx=>{
      await tx.$queryRawUnsafe('SELECT id FROM "Ingredient" WHERE id=$1 FOR UPDATE',sorted[0]);
      notify();await gate;
    },{timeout:16000});
    await locked;
    const blockerTimer=setTimeout(()=>unblock(),115);
    try{
      for(let attempt=0;attempt<3;attempt++){
        try{
          await db.$transaction(async tx=>{
            for(const id of sorted){
              await tx.$queryRawUnsafe('SELECT id FROM "Ingredient" WHERE id=$1 FOR UPDATE NOWAIT',id);
            }
          },{timeout:10000});
          retried=true;break;
        }catch(error){
          if(attempt===2)throw error;
          const delay=50*Math.pow(2,attempt);delays.push(delay);await sleep(delay);
        }
      }
    }finally{clearTimeout(blockerTimer);unblock();await blocker}
    assert.ok(retried);
    assert.ok(delays.length>=1,'Test backoff was not exercised against a PostgreSQL lock');
    const key=randomUUID(),body={requestId:key,quantity:3,unit:'g',unitCost:2,
      batchCode:runID+'-recovered',expirationDate:'2099-01-01T00:00:00Z'};
    await call('POST','/ingredients/'+a.id+'/import',body);
    const replay=await call('POST','/ingredients/'+a.id+'/import',body);
    assert.equal(replay.replayed,true);
    const count=await db.inventoryTransaction.count({
      where:{ingredientId:a.id,idempotencyKey:'ingredient-import:'+key}});
    assert.equal(count,1);
    const after=await db.ingredient.findUniqueOrThrow({where:{id:a.id}});
    assert.equal(Number(after.quantity),3);
    output.verdict='PARTIAL';
    output.backoff={implementedIn:'test-only',maximumAttempts:3,delaysMs:delays,
      nextAttemptSucceeded:retried,productionBoundedRetry:'NOT_VERIFIED'};
    output.httpIdempotency={requestId:key,receiptLedgerCount:count,quantity:3,replayed:true};
    console.log('KT02 PARTIAL: real 40P01, test retry, production deadlock retry unverified');
  }catch(error){
    output.verdict='FAIL';output.error=error.stack||error.message;process.exitCode=1;
    console.error('KT02 FAIL '+error.message);
  }finally{
    if(appServer)await new Promise(resolve=>appServer.close(resolve));
    await db.$disconnect();
    output.finishedAt=new Date().toISOString();save();
    console.log(string({runID,target,verdict:output.verdict,
      deadlockDetected:output.deadlockDetected,
      observedLockWaiters:output.observedLockWaiters?.length,
      http:output.http.length,error:output.error?.slice(0,160)}));
  }
}
main().catch(error=>{console.error(error);process.exitCode=2});
