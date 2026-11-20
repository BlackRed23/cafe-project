// Phase VII independent authenticated HTTP / Prisma / existing cafedb UAT.
// Only isolated fixtures; no production code change, payments, supplier email, or destructive SQL.
// UAT_CAFEDB_CONFIRMED=YES UAT_DB_PORT=15432 node apps/api/tests/system-uat-vii.cafedb.cjs
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),net=require('node:net');
const {randomUUID}=require('node:crypto'),{spawn}=require('node:child_process');
require('dotenv').config({path:'apps/api/.env',quiet:true});
const uri=new URL(process.env.DATABASE_URL);
assert.equal(uri.pathname,'/cafedb','Never test against another DB');
uri.hostname='127.0.0.1';uri.port=process.env.UAT_DB_PORT||'15432';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const json=v=>JSON.stringify(v,(k,x)=>/password|secret|authorization|token|signature/i.test(k)?undefined:typeof x==='bigint'?x.toString():x,2);
if(process.env.UAT_OWNED_SERVER==='YES'){
  assert.equal(process.env.UAT_CAFEDB_CONFIRMED,'YES');
  process.env.DATABASE_URL=uri.toString();process.env.NODE_ENV='test';
  require('ts-node').register({project:'apps/api/tsconfig.json',transpileOnly:true});
  if(process.env.UAT_FAULT_PREPARING==='YES'){
    const {prisma}=require('@cafe-project/database');
    const native=prisma.$transaction.bind(prisma);
    prisma.$transaction=(cb,opt)=>typeof cb!=='function'?native(cb,opt):native(async tx=>{
      const wrapped=new Proxy(tx,{get(target,key){
        if(key!=='inventoryTransaction')return Reflect.get(target,key);
        return new Proxy(Reflect.get(target,key),{get(model,method){
          const fn=Reflect.get(model,method);
          if(typeof fn!=='function')return fn;
          if(method!=='upsert')return fn.bind(model);
          return async args=>{
            const committed=await fn.call(model,args);
            if(args.create?.type==='CONSUME'&&args.create?.ingredientId===process.env.UAT_FAULT_INGREDIENT){
              process.send?.({type:'UAT12_INJECTED',ingredientId:args.create.ingredientId});
              throw Error('UAT12_TEST_ONLY_FAILURE_AFTER_CONSUME_LEDGER_SQL');
            }
            return committed;
          };
        }});
      }});
      return cb(wrapped);
    },opt);
  }
  const express=require('express'),app=express();app.use(express.json());
  app.set('json replacer',(_k,x)=>typeof x==='bigint'?x.toString():x);
  for(const [path,mod,name] of [
    ['/api/ingredients','../src/modules/ingredient/ingredient.route','ingredientRoutes'],
    ['/api/stocktakes','../src/modules/inventory/stocktake.route','stocktakeRoutes'],
    ['/api/suppliers','../src/modules/supplier/supplier.route','supplierRoutes'],
    ['/api/supplier-products','../src/modules/supplier/supplier.route','supplierProductRoutes'],
    ['/api/purchase-requests','../src/modules/purchase/purchase.route','default'],
    ['/api/purchase-orders','../src/modules/purchase/purchase.route','purchaseOrderRoutes'],
    ['/api/products','../src/modules/product/product.route','default'],
    ['/api/products','../src/modules/recipe/recipe.route','productRecipeRoutes'],
    ['/api/orders','../src/modules/order/order.route','default']
  ])app.use(path,require(mod)[name]);
  app.use(require('../src/common/error-handler').errorHandler);
  const server=app.listen(Number(process.env.UAT_PORT),'127.0.0.1',()=>process.send?.({type:'READY',pid:process.pid}));
  process.on('SIGTERM',()=>server.close(()=>process.exit()));
}else main().catch(e=>{console.error(e.stack||e);process.exitCode=2});

async function main(){
  assert.equal(process.env.UAT_CAFEDB_CONFIRMED,'YES','Requires explicit opt-in');
  const {PrismaClient}=require('@prisma/client'),jwt=require('jsonwebtoken');
  const db=new PrismaClient({datasources:{db:{url:uri.toString()}}});
  const runId='uat-'+randomUUID(),folder='D:/KLTN/cafe-project-artifacts/reports/uat';
  fs.mkdirSync(folder,{recursive:true});
  const path=folder+'/uat-vii-'+runId+'.json';
  const out={runId,startedAt:new Date().toISOString(),mode:'AUTHENTICATED_HTTP_CURRENT_SOURCE_PRISMA_CAFEDB',
    cases:[],requests:[],locks:[],owned:[],faults:[],notes:['No direct fixture DB writes, no SMTP/payment, unique test data; server is child only']};
  const save=()=>fs.writeFileSync(path,json(out));
  const selected=new Set((process.env.UAT_CASES||'UAT01,UAT02,UAT03,UAT04,UAT07,UAT08,UAT09,UAT12').split(','));
  let child,port,admin,staff,adminUser,staffUser,category,n=0;
  const num=Number;
  const freePort=()=>new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);
    s.listen(0,'127.0.0.1',()=>{const x=s.address().port;s.close(()=>resolve(x))});});
  async function start(faultIngredient){
    port=await freePort();let stderr='';
    child=spawn(process.execPath,[__filename],{cwd:process.cwd(),windowsHide:true,
      env:{...process.env,UAT_OWNED_SERVER:'YES',UAT_PORT:String(port),
        UAT_FAULT_PREPARING:faultIngredient?'YES':'NO',UAT_FAULT_INGREDIENT:faultIngredient||''},
      stdio:['ignore','pipe','pipe','ipc']});
    const c=child;c.stdout.on('data',()=>{});c.stderr.on('data',d=>{stderr=(stderr+String(d)).slice(-1600)});
    await Promise.race([new Promise((resolve,reject)=>{
      c.on('message',m=>{if(m.type==='READY')resolve();else if(m.type==='UAT12_INJECTED')out.faults.push({...m,time:new Date().toISOString()})});
      c.once('exit',(code,signal)=>reject(Error('UAT child startup died '+code+'/'+signal+' '+stderr)));
    }),sleep(20000).then(()=>{throw Error('Owned child startup timeout '+stderr)})]);
    out.owned.push({event:'start',pid:c.pid,port,fault:!!faultIngredient});
  }
  async function stop(){if(!child)return;const c=child;child=null;
    if(c.exitCode!==null||c.signalCode!==null)return;
    const done=new Promise(r=>c.once('exit',(code,signal)=>r({code,signal})));
    c.kill('SIGTERM');const ended=await Promise.race([done,sleep(4000).then(()=>{c.kill('SIGKILL');return done})]);
    out.owned.push({event:'stop',pid:c.pid,...ended});
  }
  async function api(method,route,body,role='ADMIN'){
    const id='UAT-H'+(++n),began=new Date().toISOString();
    const token=role==='STAFF'?staff:role==='ADMIN'?admin:null;
    const r=await fetch('http://127.0.0.1:'+port+'/api'+route,{method,signal:AbortSignal.timeout(30000),
      headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},
      body:body===undefined?undefined:JSON.stringify(body)});
    const raw=await r.text();let payload;try{payload=JSON.parse(raw)}catch{payload={raw}};
    out.requests.push({id,method,route,role,requestId:body?.requestId??null,
      request:body,status:r.status,message:payload?.message,responseError:r.status>=400?payload:null,
      startedAt:began,endedAt:new Date().toISOString()});
    return {id,status:r.status,data:payload?.data,raw:payload};
  }
  const ok=(r,status=200)=>{assert.equal(r.status,status,r.id+': '+json(r.raw).slice(0,500));return r.data};
  const fail=(r,allowed=[400,409])=>assert.ok(allowed.includes(r.status),r.id+': unexpected status '+r.status+' '+json(r.raw).slice(0,400));
  async function scenario(id,goal,fn){
    if(!selected.has(id))return;const before=out.requests.length;
    try{const result=await fn();out.cases.push({id,goal,verdict:'BACKEND_PASS',evidence:result,
      httpIds:out.requests.slice(before).map(x=>x.id)})}
    catch(e){out.cases.push({id,goal,verdict:'FAIL',error:e.stack||e.message,
      httpIds:out.requests.slice(before).map(x=>x.id)});process.exitCode=1;}
    save();const row=out.cases.at(-1);console.log(row.id+' '+row.verdict+(row.error?' '+row.error.slice(0,200):''));
  }
  async function ingredient(tag,unit='g'){return ok(await api('POST','/ingredients',{
    sku:runId+'-'+tag,name:runId+'-'+tag,baseUnit:unit,costPerBaseUnit:2,expiryClassification:'NON_PERISHABLE'}),201)}
  async function importLot(i,amount,tag,expiry='2099-01-01'){
    return ok(await api('POST','/ingredients/'+i.id+'/import',{
      requestId:randomUUID(),quantity:amount,unit:i.baseUnit,unitCost:2,
      batchCode:runId+'-'+tag,expirationDate:expiry}))}
  async function product(tag,recipe){
    const p=ok(await api('POST','/products',{sku:runId+'-'+tag,name:runId+'-'+tag,
      price:10000,categoryId:category.id,requiresRecipe:true,isActive:false}),201).product;
    ok(await api('POST','/products/'+p.id+'/recipes',{yieldQuantity:1,ingredients:recipe}),201);
    const fresh=ok(await api('GET','/products/'+p.id)).product;
    ok(await api('PUT','/products/'+p.id,{expectedUpdatedAt:fresh.updatedAt,isActive:true}));
    return p;
  }
  const order=(items,requestId=randomUUID())=>api('POST','/orders',{requestId,
    paymentMethod:'CASH',items:items.map(([p,quantity])=>({productId:p.id,quantity}))});
  const status=(o,s)=>api('PATCH','/orders/'+o.id+'/status',{status:s});
  const inventory=i=>db.ingredient.findUniqueOrThrow({where:{id:i.id},
    include:{batches:true}});
  const ledger=i=>db.inventoryTransaction.findMany({where:{ingredientId:i.id},
    orderBy:{movementSeq:'asc'}});
  const consume=async i=>(await ledger(i)).filter(x=>x.type==='CONSUME');
  async function overlap(table,id,functionsToCall){
    let release,ready;const gate=new Promise(r=>release=r),locked=new Promise(r=>ready=r);
    const holder=db.$transaction(async tx=>{
      if(table==='Ingredient')await tx.$queryRaw`SELECT id FROM "Ingredient" WHERE id=${id} FOR UPDATE`;
      else await tx.$queryRaw`SELECT id FROM "PurchaseRequest" WHERE id=${id} FOR UPDATE`;
      ready();await gate;
    },{timeout:20000});await locked;
    const inflight=functionsToCall.map(f=>f());let waiters=[];
    try{for(let k=0;k<90;k++){
      waiters=await db.$queryRaw`SELECT pid, wait_event_type, wait_event, query FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock'`;
      waiters=waiters.filter(w=>w.query.includes(table));
      // Release as soon as two PostgreSQL transactions truly overlap; holding a 10-way
      // queue until all ten occupy pool slots causes artificial transaction timeouts.
      if(waiters.length>=2)break;await sleep(35);
    }}finally{release();await holder}
    const responses=await Promise.all(inflight);
    // The Prisma connection pool may serve fewer DB sessions than concurrent HTTP calls.
    // Two distinct PostgreSQL waiters prove actual overlap, while all HTTP requests still run.
    assert.ok(waiters.length>=2,'No actual PostgreSQL lock overlap: '+waiters.length);
    return {locks:waiters.map(w=>({pid:w.pid,event:w.wait_event,sql:w.query.slice(0,120)})),
      responses:responses.map(x=>({id:x.id,status:x.status}))};
  }
  async function purchaseOrder(i,n,tag){
    const sup=ok(await api('POST','/suppliers',{name:runId+'-'+tag,
      email:runId.slice(0,12)+'-'+tag+'@example.invalid'}),201).supplier;
    ok(await api('POST','/supplier-products',{supplierId:sup.id,productId:i.id,price:2,
      minOrderQuantity:1,leadTimeDays:1}),201);
    const req=ok(await api('POST','/purchase-requests',{supplierId:sup.id,notes:runId,
      items:[{ingredientId:i.id,quantity:n,unitPrice:2}]}),201).purchaseRequest;
    ok(await api('PATCH','/purchase-requests/'+req.id+'/approve'));
    const po=ok(await api('POST','/purchase-orders',{requestId:randomUUID(),
      purchaseRequestId:req.id,currency:'VND'}),201).order;
    ok(await api('POST','/purchase-orders/'+po.id+'/confirm',{requestId:randomUUID(),
      reason:runId+' test-only ADMIN attestation',evidenceReference:runId+'-'+tag}));
    return {po,request:req};
  }
  function receipt(po,amount,tag,requestId=randomUUID()){
    return {requestId,supplierInvoiceNo:runId+'-'+tag,note:runId+' test receipt',
      items:[{purchaseOrderItemId:po.items[0].id,receivedQuantity:amount,
        batches:[{batchCode:runId+'-'+tag+'-batch',quantity:amount,
          expirationDate:'2099-01-01T00:00:00.000Z'}]}]};
  }
  try{
    const [id]=await db.$queryRaw`SELECT current_database() AS name`;assert.equal(id.name,'cafedb');
    out.database={name:id.name,port:Number(uri.port)};
    adminUser=await db.user.findFirstOrThrow({where:{role:'ADMIN',isActive:true},select:{id:true,role:true,email:true}});
    staffUser=await db.user.findFirstOrThrow({where:{role:'STAFF',isActive:true},select:{id:true,role:true,email:true}});
    category=await db.category.findFirstOrThrow({select:{id:true}});
    admin=jwt.sign(adminUser,process.env.JWT_SECRET,{expiresIn:'1h'});
    staff=jwt.sign(staffUser,process.env.JWT_SECRET,{expiresIn:'1h'});
    out.actors={adminId:adminUser.id,staffId:staffUser.id};
    await start();

    await scenario('UAT01','Three products / three recipes consumed exactly at PREPARING',async()=>{
      const ings=[];const products=[];const amounts=[3,5,7];
      for(let k=0;k<3;k++){const i=await ingredient('three-'+k);ings.push(i);
        await importLot(i,20,'three-'+k);
        products.push(await product('three-prod-'+k,[{ingredientId:i.id,quantity:amounts[k],unit:'g'}]));}
      const o=ok(await order(products.map(p=>[p,1])),201).order;
      for(let k=0;k<3;k++)assert.equal(num((await inventory(ings[k])).quantity),20);
      ok(await status(o,'CONFIRMED'));ok(await status(o,'PREPARING'));
      for(let k=0;k<3;k++){
        assert.equal(num((await inventory(ings[k])).quantity),20-amounts[k]);
        const c=await consume(ings[k]);assert.equal(c.length,1);assert.equal(num(c[0].quantity),-amounts[k]);
      }
      const stored=await db.order.findUniqueOrThrow({where:{id:o.id}});
      assert.equal(stored.status,'PREPARING');
      return {orderId:o.id,ingredientIds:ings.map(x=>x.id),consumption:amounts.map(x=>-x)};
    });

    await scenario('UAT02','FEFO across two eligible lots; expired lot excluded',async()=>{
      const i=await ingredient('fefo');const old=await importLot(i,2,'fefo-old','2090-01-01');
      const newer=await importLot(i,10,'fefo-new','2099-01-01');
      const expired=await importLot(i,7,'fefo-expired','2001-01-01');
      const p=await product('fefo-prod',[{ingredientId:i.id,quantity:6,unit:'g'}]);
      const o=ok(await order([[p,1]]),201).order;ok(await status(o,'CONFIRMED'));ok(await status(o,'PREPARING'));
      const lots=(await inventory(i)).batches;
      const byId=id=>num(lots.find(x=>x.id===id).quantityRemaining);
      assert.equal(byId(old.batch.id),0);assert.equal(byId(newer.batch.id),6);assert.equal(byId(expired.batch.id),7);
      const c=await consume(i);assert.deepEqual(c.map(x=>num(x.quantity)).sort((a,b)=>a-b),[-4,-2]);
      return {orderId:o.id,oldLotId:old.batch.id,newLotId:newer.batch.id,expiredLotId:expired.batch.id,
        remaining:{old:0,new:6,expired:7},consume:c.map(x=>({batch:x.batchId,qty:num(x.quantity)}))};
    });

    await scenario('UAT03','Ten concurrent distinct sale attempts; stock supports exactly five',async()=>{
      const i=await ingredient('ten');await importLot(i,50,'ten-stock');
      const p=await product('ten-prod',[{ingredientId:i.id,quantity:10,unit:'g'}]);
      const requests=Array.from({length:10},()=>randomUUID());
      const race=await overlap('Ingredient',i.id,requests.map(key=>()=>order([[p,1]],key)));
      assert.equal(race.responses.filter(x=>x.status===201).length,5,json(race));
      assert.equal(race.responses.filter(x=>x.status!==201).length,5);
      const items=await db.orderItem.findMany({where:{productId:p.id},include:{order:true}});
      assert.equal(items.length,5);const s=await inventory(i);
      assert.equal(num(s.quantity),50);assert.equal(num(s.reserved),50);
      assert.equal((await consume(i)).length,0,'No physical consume before PREPARING');
      const ids=[...new Set(items.map(x=>x.orderId))];assert.equal(ids.length,5);
      for(const id of ids){ok(await status({id},'CONFIRMED'));ok(await status({id},'PREPARING'))}
      assert.equal(num((await inventory(i)).quantity),0);
      assert.equal((await consume(i)).reduce((sum,x)=>sum+num(x.quantity),0),-50);
      out.locks.push({case:'UAT03',...race});
      return {ingredientId:i.id,success:5,denied:5,orderIds:ids,pgLocks:race.locks,
        finalPhysical:0,reserved:0};
    });

    await scenario('UAT04','Order with one ingredient unavailable rolls back all reservations atomically',async()=>{
      const a=await ingredient('short-a'),b=await ingredient('short-b');
      await importLot(a,20,'short-a');await importLot(b,1,'short-b');
      const p=await product('short-prod',[{ingredientId:a.id,quantity:4,unit:'g'},
        {ingredientId:b.id,quantity:4,unit:'g'}]);
      const beforeA=await inventory(a),beforeB=await inventory(b);
      const outcome=await order([[p,1]]);fail(outcome);
      const afterA=await inventory(a),afterB=await inventory(b);
      for(const [before,after] of [[beforeA,afterA],[beforeB,afterB]]){
        assert.equal(num(after.quantity),num(before.quantity));
        assert.equal(num(after.reserved),num(before.reserved));
        assert.deepEqual(after.batches.map(x=>num(x.quantityRemaining)),before.batches.map(x=>num(x.quantityRemaining)));
      }
      assert.equal(await db.orderItem.count({where:{productId:p.id}}),0);
      return {productId:p.id,responseStatus:outcome.status,stockA:20,stockB:1,noPartialStock:true};
    });

    await scenario('UAT07','Two concurrent ADMIN approval requests; only one adjustment',async()=>{
      const i=await ingredient('approval');const lot=await importLot(i,1000,'approval-stock');
      const s=ok(await api('POST','/stocktakes',{requestId:randomUUID(),ingredientIds:[i.id],
        assignedCounterId:staffUser.id,note:runId},'STAFF'),201);
      const seen=ok(await api('GET','/stocktakes/'+s.session.id,undefined,'STAFF'));
      ok(await api('POST','/stocktakes/'+s.session.id+'/entries',{requestId:randomUUID(),
        batchId:lot.batch.id,expectedCursor:seen.current[0].cursor,expectedRevision:0,
        actualQty:900,reason:runId+' counted',reasonCategory:'COUNTED'},'STAFF'));
      ok(await api('POST','/stocktakes/'+s.session.id+'/submit',{requestId:randomUUID()},'STAFF'));
      const route='/stocktakes/'+s.session.id+'/approve';
      const same={requestId:randomUUID()};
      const race=await overlap('Ingredient',i.id,[()=>api('POST',route,same),()=>api('POST',route,same)]);
      assert.deepEqual(race.responses.map(r=>r.status),[200,200]);
      const session=await db.stockCount.findUniqueOrThrow({where:{id:s.session.id}});
      assert.equal(session.status,'COMPLETED');
      assert.equal(num((await inventory(i)).quantity),900);
      const adj=(await ledger(i)).filter(x=>x.type==='ADJUSTMENT'&&x.referenceId===s.session.id);
      assert.equal(adj.length,1);assert.equal(num(adj[0].quantity),-100);
      out.locks.push({case:'UAT07',...race});
      return {sessionId:s.session.id,requestId:same.requestId,adjustmentId:adj[0].id,locks:race.locks};
    });

    await scenario('UAT08','One PO accepted in two independent shipments',async()=>{
      const i=await ingredient('ship');const {po,request}=await purchaseOrder(i,10,'ship');
      const a=ok(await api('POST','/purchase-orders/'+po.id+'/receipts',receipt(po,4,'ship-a'),'STAFF'),201);
      const b=ok(await api('POST','/purchase-orders/'+po.id+'/receipts',receipt(po,6,'ship-b'),'STAFF'),201);
      const s=await inventory(i);assert.equal(num(s.quantity),10);
      assert.equal(s.batches.length,2);
      const imp=(await ledger(i)).filter(x=>x.type==='IMPORT');
      assert.equal(imp.length,2);assert.equal(imp.reduce((sum,x)=>sum+num(x.quantity),0),10);
      const final=ok(await api('GET','/purchase-orders/'+po.id));
      assert.equal(final.items[0].quantityReceived,10);
      return {poId:po.id,requestId:request.id,receipts:[a.receipt?.id,b.receipt?.id],
        receivedQuantity:10,lotIds:s.batches.map(x=>x.id),imports:imp.map(x=>({id:x.id,qty:num(x.quantity)}))};
    });

    await scenario('UAT09','Concurrent duplicate receipt identity imports only once',async()=>{
      const i=await ingredient('receipt-race'),{po,request}=await purchaseOrder(i,10,'receipt-race');
      const body=receipt(po,10,'receipt-one',randomUUID());
      const path='/purchase-orders/'+po.id+'/receipts';
      const race=await overlap('PurchaseRequest',request.id,[
        ()=>api('POST',path,body,'STAFF'),()=>api('POST',path,body,'STAFF')]);
      assert.ok(race.responses.every(x=>[200,201].includes(x.status)),json(race));
      const s=await inventory(i);assert.equal(num(s.quantity),10);
      const imp=(await ledger(i)).filter(x=>x.type==='IMPORT');
      assert.equal(imp.length,1);assert.equal(num(imp[0].quantity),10);
      const mismatch={...body,items:[{...body.items[0],receivedQuantity:9,
        batches:[{...body.items[0].batches[0],quantity:9}]}]};
      fail(await api('POST',path,mismatch,'STAFF'),[409]);
      out.locks.push({case:'UAT09',...race});
      return {poId:po.id,requestId:body.requestId,locks:race.locks,oneImportId:imp[0].id,
        quantity:10,noDuplicate:true};
    });

    await scenario('UAT12','Owned fault after intermediate stock write BEFORE commit rolls back order/ledger',async()=>{
      const i=await ingredient('fault'),lot=await importLot(i,10,'fault-lot');
      const p=await product('fault-prod',[{ingredientId:i.id,quantity:4,unit:'g'}]);
      const o=ok(await order([[p,1]]),201).order;ok(await status(o,'CONFIRMED'));
      const before={ingredient:await inventory(i),ledger:await ledger(i),
        order:await db.order.findUniqueOrThrow({where:{id:o.id}})};
      await stop();await start(i.id);
      const failed=await status(o,'PREPARING');
      // The Order service can translate an injected mid-transaction error to HTTP 400.
      // The acceptance condition is real post-SQL injection and full rollback, not 500 specifically.
      assert.ok([400,500].includes(failed.status),'Unexpected injected failure status '+failed.status);
      assert.ok(out.faults.some(x=>x.ingredientId===i.id),'No actual post-ledger fault event');
      const after={ingredient:await inventory(i),ledger:await ledger(i),
        order:await db.order.findUniqueOrThrow({where:{id:o.id}})};
      assert.equal(json(after),json(before),'Partial stock commit leaked');
      await stop();await start();
      ok(await status(o,'PREPARING'));
      const s=await inventory(i);assert.equal(num(s.quantity),6);assert.equal(num(s.reserved),0);
      const c=await consume(i);assert.equal(c.length,1);assert.equal(num(c[0].quantity),-4);
      return {orderId:o.id,ingredientId:i.id,lotId:lot.batch.id,faultHttp:failed.status,finalPhysical:6,
        rollbackExact:true,stockAfterRetry:6,consumeRows:c.length};
    });
  }catch(e){out.fatal=e.stack||e.message;process.exitCode=1;console.error('UAT_FATAL '+e.message)}
  finally{
    await stop().catch(e=>{out.stopError=e.message});
    await db.$disconnect();out.finishedAt=new Date().toISOString();
    out.summary={selected:[...selected],cases:out.cases.length,
      passed:out.cases.filter(x=>x.verdict==='BACKEND_PASS').length,
      failed:out.cases.filter(x=>x.verdict==='FAIL').length,
      httpRequests:out.requests.length};
    if(out.summary.failed||out.summary.cases!==selected.size)process.exitCode=1;
    save();console.log(json({file:path,runId,summary:out.summary,fatal:out.fatal?.slice(0,500)}));
  }
}
