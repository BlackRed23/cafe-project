// UAT05: ten identical signed LOCAL contract callbacks. No external provider access.
// UAT_CAFEDB_CONFIRMED=YES UAT_DB_PORT=15432 node apps/api/tests/uat-vii-webhook.cafedb.cjs
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {randomUUID}=require('node:crypto');
assert.equal(process.env.UAT_CAFEDB_CONFIRMED,'YES');
require('dotenv').config({path:'apps/api/.env',quiet:true});
const u=new URL(process.env.DATABASE_URL);assert.equal(u.pathname,'/cafedb');
u.hostname='127.0.0.1';u.port=process.env.UAT_DB_PORT||'15432';
process.env.DATABASE_URL=u.toString();process.env.NODE_ENV='test';
Object.assign(process.env,{MOMO_PARTNER_CODE:'uat-local-only',MOMO_ACCESS_KEY:'uat-access',
  MOMO_SECRET_KEY:randomUUID(),MOMO_DEV_FALLBACK:'false'});
require('ts-node').register({project:'apps/api/tsconfig.json',transpileOnly:true});
const {prisma:db}=require('@cafe-project/database');
const {signMoMoIpnPayload}=require('../src/modules/payment/momo.gateway');
const express=require('express'),app=express();app.use(express.json());
app.use('/api/payments',require('../src/modules/payment/payment.route').default);
app.use(require('../src/common/error-handler').errorHandler);
const runId='uat05-'+randomUUID(),folder='D:/KLTN/cafe-project-artifacts/reports/uat';
fs.mkdirSync(folder,{recursive:true});
const path=folder+'/'+runId+'.json';
const out={runId,startedAt:new Date().toISOString(),case:'UAT05',verdict:'NOT_RUN',
  evidenceClass:'REAL_HTTP_PRISMA_CAFEDB; LOCAL_SIGNATURE_NOT_PROVIDER_ACCEPTANCE',
  externalProviderVerified:false,requests:[],notes:['Test-only synthetic HMAC secret; no gateway call or payment charge']};
const json=v=>JSON.stringify(v,(k,x)=>/secret|signature|authorization|rawPayload|token/i.test(k)?undefined:typeof x==='bigint'?String(x):x,2);
let server;
async function main(){
  try{
    const [identity]=await db.$queryRaw`SELECT current_database() AS name`;
    assert.equal(identity.name,'cafedb');out.database=identity.name;
    const actor=await db.user.findFirstOrThrow({where:{role:'ADMIN',isActive:true},select:{id:true}});
    const orderId=runId+'-order';
    const o=await db.order.create({data:{id:orderId,userId:actor.id,totalAmount:'10000',
      paymentMethod:'MOMO',paymentStatus:'PENDING',
      payments:{create:{method:'MOMO',amount:'10000',merchantRef:orderId+'_1',
        attemptNo:1,status:'PENDING'}}},
      include:{payments:true}});
    const p=o.payments[0];
    out.fixture={orderId,paymentId:p.id,merchantRef:p.merchantRef};
    const data={partnerCode:process.env.MOMO_PARTNER_CODE,orderId:p.merchantRef,
      requestId:p.merchantRef+'-callback',amount:'10000',orderInfo:'UAT05 local contract',
      transId:'uat05-'+randomUUID(),resultCode:0,message:'UAT05 local',
      responseTime:Date.now(),extraData:''};
    data.signature=signMoMoIpnPayload(data,process.env.MOMO_ACCESS_KEY,process.env.MOMO_SECRET_KEY);
    server=app.listen(0,'127.0.0.1');
    await new Promise(resolve=>server.once('listening',resolve));
    const base='http://127.0.0.1:'+server.address().port+'/api/payments/webhook/momo';
    async function post(body,name){
      const t=new Date().toISOString();
      const response=await fetch(base,{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
      out.requests.push({name,method:'POST',endpoint:'/api/payments/webhook/momo',
        status:response.status,time:t,finishedAt:new Date().toISOString()});
      return response.status;
    }
    const statuses=await Promise.all(Array.from({length:10},(_,i)=>post(data,'REPLAY_'+(i+1))));
    assert.ok(statuses.every(x=>x===204),'Expected 10 deterministic valid webhook ACKs: '+statuses);
    const callbacks=await db.paymentCallback.findMany({where:{paymentId:p.id},
      select:{id:true,status:true,retryCount:true,providerEventId:true}});
    const final=await db.order.findUniqueOrThrow({where:{id:orderId},
      include:{payments:true}});
    assert.equal(callbacks.length,1,'Duplicate financial callback event inserted');
    assert.equal(final.paymentStatus,'PAID');
    assert.equal(final.payments.length,1);
    assert.equal(final.payments[0].status,'PAID');
    // MoMo settlement repository persists a namespaced provider transaction identity.
    assert.equal(final.payments[0].providerTxnId,'MOMO:'+data.transId);
    assert.equal((await post({...data,signature:'forged-signature'},'FORGED_SIGNATURE')),400);
    assert.equal(await db.paymentCallback.count({where:{paymentId:p.id}}),1);
    const afterForgery=await db.payment.findUniqueOrThrow({where:{id:p.id}});
    assert.equal(afterForgery.status,'PAID');
    assert.equal(afterForgery.providerTxnId,'MOMO:'+data.transId);
    out.actual={validCallbacks:10,ackStatuses:statuses,forgedStatus:400,
      callbacks:callbacks.map(x=>({id:x.id,status:x.status,retryCount:x.retryCount})),
      finalOrderPaymentStatus:final.paymentStatus,providerTxnMatches:true,
      noDuplicatePayment:true,noDuplicateCallback:true,noExternalProvider:true};
    out.verdict='BACKEND_PASS';console.log('UAT05 BACKEND_PASS 10 signed local callbacks 1 settlement');
  }catch(e){out.verdict='FAIL';out.error=e.stack||e.message;process.exitCode=1;console.error('UAT05 FAIL '+e.message)}
  finally{
    if(server)await new Promise(resolve=>server.close(resolve));
    await db.$disconnect();out.finishedAt=new Date().toISOString();
    out.httpCount=out.requests.length;
    fs.writeFileSync(path,json(out));console.log(json({file:path,runId,verdict:out.verdict,http:out.httpCount,error:out.error?.slice(0,350)}));
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=2});
