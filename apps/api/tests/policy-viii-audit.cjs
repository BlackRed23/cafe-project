// Read-only policy metadata audit. No policy activation, secrets or data mutation.
// POLICY_CAFEDB_CONFIRMED=YES POLICY_DB_PORT=15432 node apps/api/tests/policy-viii-audit.cjs
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {randomUUID}=require('node:crypto');
require('dotenv').config({path:'apps/api/.env',quiet:true});
const u=new URL(process.env.DATABASE_URL);
assert.equal(u.pathname,'/cafedb');u.hostname='127.0.0.1';u.port=process.env.POLICY_DB_PORT||'15432';
const safe=(key,value)=>typeof value==='bigint'?String(value):value;
async function run(){
  assert.equal(process.env.POLICY_CAFEDB_CONFIRMED,'YES','Read-only audit requires explicit opt-in');
  const {PrismaClient}=require('@prisma/client');
  const db=new PrismaClient({datasources:{db:{url:u.toString()}}});
  const id='policy-'+randomUUID();
  const folder='D:/KLTN/cafe-project-artifacts/reports/policy';
  fs.mkdirSync(folder,{recursive:true});
  const output={runId:id,recordedAt:new Date().toISOString(),database:null,
    mode:'READ_ONLY_POLICY_METADATA_AND_APPROVAL_SOURCE_AUDIT',
    noBusinessApprovalInferred:true,settings:[],openPolicyIndicators:{},refundGates:{},
    notes:['No SystemSetting business-owner-approval column in current Prisma schema',
      'Presence of a setting is not evidence of approval',
      'Approval of 10 topics requires explicit business-owner record; never activate flags']};
  try{
    const [row]=await db.$queryRaw`SELECT current_database() AS name`;
    assert.equal(row.name,'cafedb');output.database=row.name;
    const whitelist=['ai.enabled','ai.scanCron','inventory.defaultMinThreshold',
      'inventory.lotNearExpiryDays','inventory.reorderPlanningPeriod','inventory.reorderPlanningCustomDays'];
    const entries=await db.systemSetting.findMany({where:{key:{in:whitelist}},
      select:{key:true,updatedAt:true}});
    output.settings=whitelist.map(key=>({key,persisted:entries.some(r=>r.key===key),
      updatedAt:entries.find(r=>r.key===key)?.updatedAt??null}));
    for(const [name,model,where] of [
      ['shelfLifeDraft',db.purchaseShelfLifeRule,{status:'DRAFT'}],
      ['overdeliveryPendingPolicy',db.purchaseOverdeliveryAmendment,{status:'PENDING_POLICY'}],
      ['aggregationPendingPolicy',db.purchaseDemandAggregation,{status:'ADMIN_GROUPING_APPROVED_PENDING_POLICY'}],
      ['supplierEvidenceNotVerified',db.purchaseSupplierEvidence,{verificationStatus:'NOT_VERIFIED_EXTERNAL'}]
    ])output.openPolicyIndicators[name]=await model.count({where});
    const flags=['PAYMENT_REFUND_POLICY_ENABLED','PAYMENT_REFUND_EXECUTION_ENABLED',
      'PAYMENT_REFUND_POLICY_VERSION','PAYMENT_REFUND_MAX_VND'];
    for(const name of flags)output.refundGates[name]={
      present:Boolean(process.env[name]?.trim()),
      enabled:name.endsWith('_ENABLED')||name.endsWith('_EXECUTION_ENABLED')
        ?process.env[name]==='true':null};
    output.result='READ_ONLY_VERIFIED';
  }catch(e){output.result='FAIL';output.error=e.message;process.exitCode=1}
  finally{
    await db.$disconnect();
    const file=folder+'/'+id+'.json';
    fs.writeFileSync(file,JSON.stringify(output,safe,2));
    console.log(JSON.stringify({file,runId:id,result:output.result,database:output.database,
      settings:output.settings,openPolicyIndicators:output.openPolicyIndicators,
      refundGates:output.refundGates,error:output.error},safe,2));
  }
}
run().catch(e=>{console.error(e.message);process.exitCode=2});
