// Independent real HTTP regression for confirmed KT10 Decimal(14,3) overflow.
// KT10_CAFEDB_CONFIRMED=YES KT10_DB_PORT=15432 node apps/api/tests/kt10-overflow-retest.cafedb.cjs
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
assert.equal(process.env.KT10_CAFEDB_CONFIRMED,'YES','Explicit test permission required');
require('dotenv').config({path:'apps/api/.env',quiet:true});
const url=new URL(process.env.DATABASE_URL);assert.equal(url.pathname,'/cafedb');
url.hostname='127.0.0.1';url.port=process.env.KT10_DB_PORT||'15432';
process.env.DATABASE_URL=url.toString();process.env.NODE_ENV='test';
require('ts-node').register({project:'apps/api/tsconfig.json',transpileOnly:true});
const {prisma:db}=require('@cafe-project/database'),jwt=require('jsonwebtoken'),express=require('express');
const app=express();app.use(express.json());app.set('json replacer',(_k,v)=>typeof v==='bigint'?v.toString():v);
app.use('/api/ingredients',require('../src/modules/ingredient/ingredient.route').ingredientRoutes);
app.use(require('../src/common/error-handler').errorHandler);
const runId='kt10-fixed-'+randomUUID(),dir='D:/KLTN/cafe-project-artifacts/reports/security';
fs.mkdirSync(dir,{recursive:true});
const file=dir+'/'+runId+'.json';
const out={runId,date:new Date().toISOString(),db:'cafedb',verdict:'NOT_RUN',
  scope:'INDEPENDENT_REAL_JWT_HTTP_PRISMA_DECIMAL_OVERFLOW',http:[],
  noDestructiveActions:true};
let server;
const str=x=>JSON.stringify(x,(_k,v)=>typeof v==='bigint'?v.toString():v,2);
async function main(){
  try{
    assert.equal((await db.$queryRaw`SELECT current_database() AS name`)[0].name,'cafedb');
    const actor=await db.user.findFirstOrThrow({where:{role:'ADMIN',isActive:true},select:{id:true,role:true,email:true}});
    const token=jwt.sign(actor,process.env.JWT_SECRET,{expiresIn:'20m'});
    server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const base='http://127.0.0.1:'+server.address().port+'/api';
    const req=async(method,path,body)=>{
      const res=await fetch(base+path,{method,headers:{'content-type':'application/json',authorization:'Bearer '+token},
        body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
      const data=await res.json();
      out.http.push({method,path,status:res.status,message:data.message,
        request:body&&{...body,requestId:body.requestId}});
      return {status:res.status,data:data.data,message:data.message};
    };
    const c=await req('POST','/ingredients',{sku:runId,name:runId,baseUnit:'g',
      costPerBaseUnit:2,expiryClassification:'NON_PERISHABLE'});
    assert.equal(c.status,201);const i=c.data.id;
    const input=(qty,unit,tag)=>({requestId:randomUUID(),quantity:qty,unit,unitCost:0,
      expirationDate:'2099-01-01',batchCode:runId+'-'+tag});
    assert.equal((await req('POST','/ingredients/'+i+'/import',input(1.001,'g','base'))).status,200);
    assert.equal((await req('POST','/ingredients/'+i+'/import',input(.002,'g','decimal'))).status,200);
    const before=await db.ingredient.findUniqueOrThrow({where:{id:i},
      include:{batches:true,transactions:true}});
    assert.equal(before.quantity.toString(),'1.003');
    assert.equal(before.transactions.filter(t=>t.type==='IMPORT').length,2);
    const huge=await req('POST','/ingredients/'+i+'/import',input(1e18,'g','huge'));
    const unit=await req('POST','/ingredients/'+i+'/import',input(99999999999.99,'kg','unit-conversion-overflow'));
    const total=await req('POST','/ingredients/'+i+'/import',input(99999999999.999,'g','total-overflow'));
    assert.equal(huge.status,400,'1e18 rejected before Prisma');
    assert.equal(unit.status,400,'kg->g overflow rejected after conversion');
    assert.equal(total.status,400,'aggregate quantity overflow rejected before DB insert');
    const after=await db.ingredient.findUniqueOrThrow({where:{id:i},
      include:{batches:true,transactions:true}});
    assert.equal(str(after),str(before),'Invalid import mutated stock, batches or ledger');
    out.actual={ingredientId:i,validDecimal:'1.001+0.002=1.003',
      rejectedStatuses:[huge.status,unit.status,total.status],beforeCount:before.transactions.length,
      afterCount:after.transactions.length,stockAfter:after.quantity.toString(),noWritesOnReject:true};
    out.verdict='PASS';console.log('KT10 PASS valid decimal & three real HTTP400 overflow guards');
  }catch(e){out.verdict='FAIL';out.error=e.stack||e.message;process.exitCode=1;console.error('KT10 FAIL '+e.message)}
  finally{
    if(server)await new Promise(resolve=>server.close(resolve));await db.$disconnect();
    out.finishedAt=new Date().toISOString();out.httpCount=out.http.length;
    fs.writeFileSync(file,str(out));console.log(str({file,runId,verdict:out.verdict,httpCount:out.httpCount,error:out.error?.slice(0,500)}));
  }
}
main().catch(e=>{console.error(e.stack||e);process.exitCode=2});
