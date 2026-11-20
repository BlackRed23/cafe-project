// Real JWT HTTP -> existing services -> Prisma -> PostgreSQL cafedb.
// Opt-in: LN_CAFEDB_CONFIRMED=YES LN_DB_PORT=15432 node apps/api/tests/ln-stock-purchasing.cafedb.cjs
// Isolated owned HTTP child, no shared-server kill or SMTP/financial/destructive action.
'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), net=require('node:net');
const {randomUUID}=require('node:crypto'), {spawn}=require('node:child_process');
require('dotenv').config({path:'apps/api/.env',quiet:true});
require('dotenv').config({quiet:true});
const dbUrl=new URL(process.env.DATABASE_URL);
assert.equal(dbUrl.pathname,'/cafedb');
dbUrl.hostname='127.0.0.1';dbUrl.port=process.env.LN_DB_PORT||'15432';
const repr=v=>JSON.stringify(v,(_k,x)=>typeof x==='bigint'?x.toString():x,2);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

if(process.env.LN_OWNED_CHILD==='YES'){
  assert.equal(process.env.LN_CAFEDB_CONFIRMED,'YES');
  process.env.DATABASE_URL=dbUrl.toString();process.env.NODE_ENV='test';
  require('ts-node').register({project:'apps/api/tsconfig.json',transpileOnly:true});
  const express=require('express'), app=express();
  app.use(express.json());
  app.set('json replacer',(_k,x)=>typeof x==='bigint'?x.toString():x);
  app.use((req,res,next)=>{
    if(req.headers['x-ln-drop-after-commit']!=='YES')return next();
    const original=res.end;
    res.end=function(...args){
      if(res.statusCode===201&&req.path.endsWith('/receipts')){
        process.send?.({kind:'POST_COMMIT_ACK_DROPPED',path:req.path,status:201});
        res.socket?.destroy();return this;
      }
      return original.apply(this,args);
    };next();
  });
  const sup=require('../src/modules/supplier/supplier.route');
  const pur=require('../src/modules/purchase/purchase.route');
  for(const [prefix,module,name] of [
    ['/api/ingredients','../src/modules/ingredient/ingredient.route','ingredientRoutes'],
    ['/api/stocktakes','../src/modules/inventory/stocktake.route','stocktakeRoutes'],
    ['/api/suppliers','../src/modules/supplier/supplier.route','supplierRoutes'],
    ['/api/supplier-products','../src/modules/supplier/supplier.route','supplierProductRoutes'],
    ['/api/purchase-requests','../src/modules/purchase/purchase.route','default'],
    ['/api/purchase-orders','../src/modules/purchase/purchase.route','purchaseOrderRoutes'],
    ['/api/products','../src/modules/product/product.route','default'],
    ['/api/products','../src/modules/recipe/recipe.route','productRecipeRoutes'],
    ['/api/orders','../src/modules/order/order.route','default']
  ])app.use(prefix,require(module)[name]);
  app.use(require('../src/common/error-handler').errorHandler);
  const server=app.listen(Number(process.env.LN_API_PORT),'127.0.0.1',
    ()=>process.send?.({kind:'READY',pid:process.pid}));
  process.on('SIGTERM',()=>server.close(()=>process.exit()));
}else run().catch(e=>{console.error(e.stack||e);process.exitCode=1});

async function run(){
  assert.equal(process.env.LN_CAFEDB_CONFIRMED,'YES','Explicit cafedb opt-in required');
  const jwt=require('jsonwebtoken'), {PrismaClient}=require('@prisma/client');
  const db=new PrismaClient({datasources:{db:{url:dbUrl.toString()}}});
  const runId='ln-stock-'+randomUUID(), folder='D:/KLTN/cafe-project-artifacts/reports/cross-workflow';
  fs.mkdirSync(folder,{recursive:true});
  const file=folder+'/ln-stock-purchasing-'+runId+'.json';
  const out={runId,at:new Date().toISOString(),database:'cafedb',dbPort:Number(dbUrl.port),
    http:[],scenarios:[],locks:[],ownedServers:[],notes:['No external supplier email or financial transfer',
    'No destructive SQL; isolated per-run fixtures','All HTTP authenticated; independent server child']};
  const save=()=>fs.writeFileSync(file,repr(out),'utf8');
  const selected=new Set((process.env.LN_CASES||'LN04,LN05,LN06,LN11,LN12,LN13,LN14,LN16').split(','));
  let child,port,admin,staff,adminUser,staffUser,category,n=0;
  let dropEvents=[];
  const num=Number;
  const freePort=()=>new Promise((resolve,reject)=>{
    const l=net.createServer();l.once('error',reject);
    l.listen(0,'127.0.0.1',()=>{const p=l.address().port;l.close(()=>resolve(p))});
  });
  async function startServer(){
    assert.ok(!child,'One server child at a time');
    port=await freePort();
    child=spawn(process.execPath,[__filename],{cwd:process.cwd(),windowsHide:true,
      env:{...process.env,LN_OWNED_CHILD:'YES',LN_API_PORT:String(port)},
      stdio:['ignore','pipe','pipe','ipc']});
    let stderr='';child.stderr.on('data',d=>{stderr=(stderr+String(d)).slice(-2500)});
    child.stdout.on('data',()=>{});
    const pid=child.pid;
    await Promise.race([
      new Promise((resolve,reject)=>{
        child.on('message',msg=>{
          if(msg.kind==='READY')resolve();
          if(msg.kind==='POST_COMMIT_ACK_DROPPED')dropEvents.push({...msg,pid,time:new Date().toISOString()});
        });
        child.once('exit',(code,signal)=>reject(new Error('Child exited '+code+'/'+signal+' '+stderr)));
      }),
      sleep(20000).then(()=>{throw Error('Owned server startup timeout '+stderr)})
    ]);
    out.ownedServers.push({event:'start',pid,port,time:new Date().toISOString()});
  }
  async function stopServer(force=false){
    if(!child)return;
    const c=child;child=null;
    if(c.exitCode!==null||c.signalCode!==null)return;
    const exited=new Promise(resolve=>c.once('exit',(code,signal)=>resolve({code,signal})));
    c.kill(force?'SIGKILL':'SIGTERM');
    const result=await Promise.race([exited,sleep(4000).then(()=>{c.kill('SIGKILL');return exited})]);
    out.ownedServers.push({event:'stop',pid:c.pid,force,...result,time:new Date().toISOString()});
  }
  async function http(method,path,body,token=admin,opts={}){
    const id='LN-H'+(++n), started=new Date().toISOString();
    try{
      const r=await fetch('http://127.0.0.1:'+port+'/api'+path,{method,
        headers:{'content-type':'application/json',authorization:'Bearer '+token,
          ...(opts.dropAck?{'x-ln-drop-after-commit':'YES'}:{})},
        signal:AbortSignal.timeout(30000),body:body===undefined?undefined:JSON.stringify(body)});
      const raw=await r.text();let payload;
      try{payload=JSON.parse(raw)}catch{payload={raw}};
      out.http.push({id,method,path,requestId:body?.requestId,status:r.status,started,
        ended:new Date().toISOString(),message:payload?.message,
        ...(r.status>=400?{response:payload}:{})});
      return {id,status:r.status,data:payload?.data,raw:payload};
    }catch(e){
      out.http.push({id,method,path,requestId:body?.requestId,status:'NO_RESPONSE',started,
        ended:new Date().toISOString(),error:e.message});
      if(!opts.allowFailure)throw e;
      return {id,status:'NO_RESPONSE',error:e.message};
    }
  }
  const ok=(r,s=200)=>{assert.equal(r.status,s,r.id+': '+repr(r.raw).slice(0,700));return r.data};
  async function scenario(id,expected,fn){
    if(!selected.has(id))return;
    const before=out.http.length;
    try{const evidence=await fn();out.scenarios.push({id,expected,verdict:'PASS',evidence,
      http:out.http.slice(before).map(x=>x.id)})}
    catch(e){out.scenarios.push({id,expected,verdict:'FAIL',error:e.stack||e.message,
      http:out.http.slice(before).map(x=>x.id)})}
    const v=out.scenarios.at(-1);console.log(id+' '+v.verdict+(v.error?' '+v.error.slice(0,200):''));
    save();
  }
  async function state(i){
    return {ingredient:await db.ingredient.findUniqueOrThrow({where:{id:i.id}}),
      batches:await db.ingredientBatch.findMany({where:{ingredientId:i.id},orderBy:{id:'asc'}}),
      ledger:await db.inventoryTransaction.findMany({where:{ingredientId:i.id},orderBy:{id:'asc'}})};
  }
  const stable=s=>repr({qty:s.ingredient.quantity,reserved:s.ingredient.reserved,
    cursor:s.ingredient.movementCursor,batches:s.batches.map(b=>[b.id,b.quantityRemaining,b.qualityStatus]),
    ledger:s.ledger.map(t=>[t.id,t.type,t.batchId,t.quantity])});
  async function stock(i,qty){
    const s=await state(i);
    assert.equal(num(s.ingredient.quantity),qty);
    assert.equal(s.batches.reduce((x,b)=>x+num(b.quantityRemaining),0),qty);
    // RESERVE/RELEASE are nonphysical audit movements, not physical stock deltas.
    const physicalMovements=new Set(['IMPORT','CONSUME','WASTE','RETURN','RETURN_OUT',
      'ADJUSTMENT','DAMAGE','SIMULATE_SALE']);
    assert.equal(s.ledger.filter(t=>physicalMovements.has(t.type))
      .reduce((x,t)=>x+num(t.quantity),0),qty);
    assert.ok(s.batches.every(b=>num(b.quantityRemaining)>=0));
    return s;
  }
  const ingredient=async suffix=>ok(await http('POST','/ingredients',{
    sku:runId+'-'+suffix,name:runId+'-'+suffix,baseUnit:'gram',expiryClassification:'NON_PERISHABLE',
    costPerBaseUnit:2}),201);
  const initial=async(i,q,suffix,expiry='2099-01-01')=>ok(await http('POST',
    '/ingredients/'+i.id+'/import',{requestId:randomUUID(),quantity:q,unit:'g',unitCost:2,
      batchCode:runId+'-'+suffix+'-'+randomUUID().slice(0,6),expirationDate:expiry}));
  async function purchase(i,qty,suffix){
    const s=ok(await http('POST','/suppliers',{name:runId+'-'+suffix,
      email:runId.slice(0,12)+'-'+suffix+'@example.invalid'}),201).supplier;
    ok(await http('POST','/supplier-products',{supplierId:s.id,productId:i.id,price:10,
      purchaseUnit:'gram',conversionQuantity:1,conversionTargetUnit:'gram',
      minOrderQuantity:1,leadTimeDays:1}),201);
    const pr=ok(await http('POST','/purchase-requests',{supplierId:s.id,notes:runId,
      items:[{ingredientId:i.id,quantity:qty,unitPrice:10}]}),201).purchaseRequest;
    ok(await http('PATCH','/purchase-requests/'+pr.id+'/approve'));
    const p=ok(await http('POST','/purchase-orders',{requestId:randomUUID(),
      purchaseRequestId:pr.id,currency:'VND'}),201).order;
    ok(await http('POST','/purchase-orders/'+p.id+'/confirm',{requestId:randomUUID(),
      reason:runId+' admin test attestation',
      evidenceReference:runId+'-'+randomUUID().slice(0,8)}));
    return p;
  }
  const receiptBody=(p,q,suffix)=>({requestId:randomUUID(),supplierInvoiceNo:runId+'-'+suffix,
    note:runId+' local accepted',items:[{purchaseOrderItemId:p.items[0].id,receivedQuantity:q,
      batches:[{batchCode:runId+'-receipt-'+suffix,expirationDate:'2099-01-01T00:00:00.000Z',quantity:q}]}]});
  const receive=(p,body,opts)=>http('POST','/purchase-orders/'+p.id+'/receipts',body,staff,opts);
  async function product(i,suffix,grams){
    const p=ok(await http('POST','/products',{sku:runId+'-'+suffix,name:runId+'-'+suffix,
      price:10000,categoryId:category.id,isActive:false,requiresRecipe:true}),201).product;
    ok(await http('POST','/products/'+p.id+'/recipes',
      {ingredients:[{ingredientId:i.id,quantity:grams,unit:'g'}]}),201);
    const current=ok(await http('GET','/products/'+p.id)).product;
    ok(await http('PUT','/products/'+p.id,{expectedUpdatedAt:current.updatedAt,isActive:true}));
    return p;
  }
  async function order(p){
    const o=ok(await http('POST','/orders',{requestId:randomUUID(),paymentMethod:'CASH',
      items:[{productId:p.id,quantity:1}]}),201).order;
    ok(await http('PATCH','/orders/'+o.id+'/status',{status:'CONFIRMED'}));
    return o;
  }
  const prep=o=>http('PATCH','/orders/'+o.id+'/status',{status:'PREPARING'});
  const open=i=>http('POST','/stocktakes',{requestId:randomUUID(),ingredientIds:[i.id],
    assignedCounterId:staffUser.id,note:runId},staff).then(r=>ok(r,201));
  const view=s=>http('GET','/stocktakes/'+s.session.id,undefined,staff).then(ok);
  async function count(s,i,batchId,qty,snapshot){
    const current=snapshot||await view(s), entry=current.entries.find(e=>e.batchId===batchId);
    return http('POST','/stocktakes/'+s.session.id+'/entries',{requestId:randomUUID(),
      batchId,expectedCursor:current.current.find(x=>x.ingredientId===i.id).cursor,
      expectedRevision:entry?.revision||0,actualQty:qty,reason:runId+' counted',
      reasonCategory:'COUNTED'},staff);
  }
  const submit=s=>http('POST','/stocktakes/'+s.session.id+'/submit',{requestId:randomUUID()},staff);
  const approve=s=>http('POST','/stocktakes/'+s.session.id+'/approve',{requestId:randomUUID()});
  const waste=(i,q)=>http('POST','/ingredients/'+i.id+'/waste',
    {quantity:q,unit:'g',wasteReason:'DAMAGED',note:runId+' waste'},staff);
  async function overlap(i,ops,expected=2){
    let release,ready;
    const gate=new Promise(r=>release=r), held=new Promise(r=>ready=r);
    const holder=db.$transaction(async tx=>{
      await tx.$queryRawUnsafe('SELECT id FROM "Ingredient" WHERE id=$1 FOR UPDATE',i.id);
      ready();await gate;
    },{timeout:25000});
    await held;
    const calls=ops.map(fn=>fn());let waiters=0,sample=[];
    try{
      for(let k=0;k<100;k++){
        const rows=await db.$queryRawUnsafe(
          "SELECT pid,wait_event,query FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%Ingredient%FOR UPDATE%'");
        waiters=Math.max(waiters,rows.length);
        if(rows.length>=expected){sample=rows.map(r=>({pid:r.pid,wait:r.wait_event,query:r.query.slice(0,110)}));break}
        await sleep(50);
      }
    }finally{release();await holder}
    const results=await Promise.allSettled(calls);
    const evidence={ingredientId:i.id,waiters,sample,
      responses:results.map(r=>r.status==='fulfilled'?{id:r.value.id,status:r.value.status}:String(r.reason))};
    out.locks.push(evidence);
    assert.ok(waiters>=expected,'Expected '+expected+' real PostgreSQL lock waiters; saw '+waiters);
    assert.ok(results.every(r=>r.status==='fulfilled'),repr(evidence));
    return {...evidence,results:results.map(r=>r.value)};
  }
  try{
    const [check]=await db.$queryRawUnsafe("SELECT current_database() db, (SELECT count(*)::int FROM pg_trigger WHERE tgname='InventoryTransaction_stocktake_cursor') cursor_trigger");
    assert.equal(check.db,'cafedb');assert.equal(check.cursor_trigger,1);
    out.databaseVerification=check;
    adminUser=await db.user.findFirstOrThrow({where:{role:'ADMIN',isActive:true},
      select:{id:true,email:true,role:true}});
    staffUser=await db.user.findFirstOrThrow({where:{role:'STAFF',isActive:true},
      select:{id:true,email:true,role:true}});
    category=await db.category.findFirstOrThrow({select:{id:true}});
    admin=jwt.sign(adminUser,process.env.JWT_SECRET,{expiresIn:'2h'});
    staff=jwt.sign(staffUser,process.env.JWT_SECRET,{expiresIn:'2h'});
    await startServer();

    await scenario('LN04','PREPARING+GoodsReceipt concurrent, IMPORT and CONSUME exact',async()=>{
      const i=await ingredient('ln04');await initial(i,10,'ln04');
      const p=await product(i,'ln04-product',4),o=await order(p);
      const po=await purchase(i,8,'ln04');const body=receiptBody(po,6,'ln04');
      const race=await overlap(i,[()=>prep(o),()=>receive(po,body)]);
      ok(race.results[0]);ok(race.results[1],201);
      const s=await stock(i,12);
      assert.equal(s.ledger.filter(x=>x.type==='CONSUME').length,1);
      assert.equal(s.ledger.filter(x=>x.type==='IMPORT'&&x.referenceType==='GoodsReceipt').length,1);
      assert.ok((await db.order.findUniqueOrThrow({where:{id:o.id}})).stockDeductedAt);
      return {orderId:o.id,poId:po.id,final:12,import:6,consume:-4,waiters:race.waiters};
    });
    await scenario('LN05','PREPARING overlaps stocktake approve; stale cursor safe',async()=>{
      const i=await ingredient('ln05'),b=await initial(i,10,'ln05');
      const p=await product(i,'ln05-product',2),s=await open(i);
      ok(await count(s,i,b.batch.id,10));ok(await submit(s));
      const o=await order(p),race=await overlap(i,[()=>prep(o),()=>approve(s)]);
      ok(race.results[0]);ok(race.results[1]);
      const after=await stock(i,8),status=(await view(s)).session.status;
      assert.ok(['COMPLETED','NEEDS_INVESTIGATION'].includes(status));
      assert.equal(after.ledger.filter(t=>t.type==='CONSUME').length,1);
      assert.equal(after.ledger.filter(t=>t.referenceType==='Stocktake').length,0);
      return {sessionId:s.session.id,orderId:o.id,status,qty:8,waiters:race.waiters};
    });
    await scenario('LN06','GoodsReceipt during stocktake, new lot count and cursor',async()=>{
      const i=await ingredient('ln06'),first=await initial(i,10,'ln06-old');
      const s=await open(i),snapshot=await view(s),po=await purchase(i,5,'ln06');
      const body=receiptBody(po,5,'ln06');
      const race=await overlap(i,[()=>receive(po,body),()=>count(s,i,first.batch.id,10,snapshot)]);
      ok(race.results[0],201);assert.ok([200,409].includes(race.results[1].status));
      const fresh=await view(s);assert.equal(fresh.untrackedBatches.length,1);
      const newLot=fresh.untrackedBatches[0].batchId;
      assert.notEqual(fresh.current[0].cursor,snapshot.current[0].cursor);
      if(race.results[1].status===409)ok(await count(s,i,first.batch.id,10));
      ok(await count(s,i,newLot,5));
      const counted=await view(s);assert.equal(counted.entries.length,2);
      assert.equal(counted.entries.find(e=>e.batchId===newLot).openingQty,'0');
      assert.ok(counted.entries.every(e=>e.varianceQty==='0'));
      ok(await submit(s));ok(await approve(s));await stock(i,15);
      return {sessionId:s.session.id,newLot,cursorBefore:snapshot.current[0].cursor,
        cursorAfter:counted.current[0].cursor,waiters:race.waiters};
    });
    await scenario('LN11','Transport drop after GoodsReceipt commit, exact idempotency replay',async()=>{
      const i=await ingredient('ln11'),po=await purchase(i,10,'ln11'),body=receiptBody(po,7,'ln11');
      const lost=await receive(po,body,{dropAck:true,allowFailure:true});
      assert.equal(lost.status,'NO_RESPONSE');
      assert.ok(dropEvents.some(x=>x.kind==='POST_COMMIT_ACK_DROPPED'));
      const receipt=await db.goodsReceipt.findUniqueOrThrow({where:{idempotencyKey:body.requestId}});
      const before=stable(await stock(i,7));
      assert.equal(ok(await receive(po,body),201).replayed,true);
      assert.equal(stable(await stock(i,7)),before);
      assert.equal((await receive(po,{...body,note:body.note+' changed'})).status,409);
      assert.equal(await db.goodsReceipt.count({where:{idempotencyKey:body.requestId}}),1);
      return {requestId:body.requestId,receiptId:receipt.id,response:'LOST_POST_COMMIT',
        replay:true,changed:409,goodsReceiptCount:1};
    });
    await scenario('LN12','Own server restart before and after GoodsReceipt commit',async()=>{
      const i=await ingredient('ln12'),po=await purchase(i,10,'ln12'),body=receiptBody(po,6,'ln12');
      let unlock,acquired;
      const gate=new Promise(r=>unlock=r),ready=new Promise(r=>acquired=r);
      const holder=db.$transaction(async tx=>{
        await tx.$queryRawUnsafe('SELECT id FROM "Ingredient" WHERE id=$1 FOR UPDATE',i.id);
        acquired();await gate;
      },{timeout:25000});
      await ready;let waiting=0;const inflight=receive(po,body,{allowFailure:true});
      try{
        for(let j=0;j<100;j++){
          const [row]=await db.$queryRawUnsafe(
            "SELECT count(*)::int n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%Ingredient%FOR UPDATE%'");
          waiting=Math.max(waiting,row.n);if(waiting>=1)break;await sleep(50);
        }
        assert.ok(waiting>=1,'No observed pre-commit PG lock');
        await stopServer(true);
      }finally{unlock();await holder}
      assert.equal((await inflight).status,'NO_RESPONSE');
      assert.equal(await db.goodsReceipt.count({where:{idempotencyKey:body.requestId}}),0);
      await stock(i,0);
      await startServer();ok(await receive(po,body),201);
      const after=stable(await stock(i,6));
      await stopServer();await startServer();
      assert.equal(ok(await receive(po,body),201).replayed,true);
      assert.equal(stable(await stock(i,6)),after);
      return {requestId:body.requestId,preCommitLockWaiters:waiting,preCommit:'ROLLED_BACK',
        afterRestart:'COMMITTED_ONCE',postCommitRestart:'REPLAYED'};
    });
    await scenario('LN13','RETURN+WASTE share batch lock, exact ledger no negative',async()=>{
      const i=await ingredient('ln13');await initial(i,10,'ln13');
      const p=await product(i,'ln13-product',4),o=await order(p);
      ok(await prep(o));const consumed=await stock(i,6);
      const original=consumed.ledger.find(t=>t.type==='CONSUME');assert.ok(original);
      const body={requestId:randomUUID(),sourceTransactionId:original.id,batchId:original.batchId,
        quantity:1,quality:'UNKNOWN',reason:runId+' return isolated'};
      const race=await overlap(i,[()=>http('POST','/ingredients/'+i.id+'/returns',body),()=>waste(i,2)]);
      ok(race.results[0]);ok(race.results[1]);
      const after=await stock(i,5);
      assert.equal(after.ledger.filter(t=>t.type==='WASTE').length,1);
      assert.equal(after.ledger.filter(t=>t.type==='RETURN').length,1);
      const ret=await db.lotReturn.findUniqueOrThrow({where:{requestId:body.requestId}});
      assert.equal(after.batches.find(b=>b.id===ret.targetBatchId).qualityStatus,'QUARANTINED');
      return {sourceId:original.id,returnId:ret.id,qty:5,waiters:race.waiters};
    });
    await scenario('LN14','WASTE during count, cursor re-read, no double debit',async()=>{
      const i=await ingredient('ln14'),b=await initial(i,10,'ln14'),s=await open(i);
      const snapshot=await view(s);
      const race=await overlap(i,[()=>waste(i,2),()=>count(s,i,b.batch.id,10,snapshot)]);
      ok(race.results[0]);assert.ok([200,409].includes(race.results[1].status));
      if(race.results[1].status===409)ok(await count(s,i,b.batch.id,8));
      const counted=await view(s);assert.equal(counted.entries[0].varianceQty,'0');
      const submitted=ok(await submit(s));
      assert.ok(['PENDING_APPROVAL','NEEDS_INVESTIGATION'].includes(submitted.session.status));
      if(submitted.session.status==='PENDING_APPROVAL')ok(await approve(s));
      const after=await stock(i,8);
      assert.equal(after.ledger.filter(t=>t.type==='WASTE').length,1);
      assert.equal(after.ledger.filter(t=>t.referenceType==='Stocktake').length,0);
      return {sessionId:s.session.id,status:(await view(s)).session.status,
        qty:8,waiters:race.waiters,waste:1,adjustments:0};
    });
    await scenario('LN16','Invalid provenance/expired/quarantined/excess/duplicate returns',async()=>{
      const i=await ingredient('ln16'),first=await initial(i,10,'ln16');
      const p=await product(i,'ln16-product',3),o=await order(p);
      ok(await prep(o));
      const source=(await state(i)).ledger.find(t=>t.type==='CONSUME');assert.ok(source);
      const wrong=await ingredient('ln16-wrong'),wrongLot=await initial(wrong,4,'ln16-wrong');
      const body={requestId:randomUUID(),sourceTransactionId:source.id,batchId:first.batch.id,
        quantity:1,quality:'SAFE',reason:runId+' return uncertain'};
      const before=stable(await state(i));
      assert.equal((await http('POST','/ingredients/'+i.id+'/returns',
        {...body,batchId:wrongLot.batch.id})).status,409);
      assert.equal((await http('POST','/ingredients/'+i.id+'/returns',
        {...body,sourceTransactionId:randomUUID()})).status,409);
      assert.equal((await http('POST','/ingredients/'+i.id+'/returns',
        {...body,quantity:4})).status,409);
      assert.equal(stable(await state(i)),before);
      const accepted=ok(await http('POST','/ingredients/'+i.id+'/returns',body));
      assert.equal(accepted.return.disposition,'QUARANTINED');
      assert.equal(accepted.releaseToUsable,'NOT_VERIFIED');
      const once=stable(await stock(i,8));
      assert.equal(ok(await http('POST','/ingredients/'+i.id+'/returns',body)).replayed,true);
      assert.equal(stable(await state(i)),once);
      assert.equal((await http('POST','/ingredients/'+i.id+'/returns',
        {...body,quantity:2})).status,409);
      ok(await http('POST','/ingredients/'+i.id+'/batches/'+first.batch.id+'/quarantine',
        {requestId:randomUUID(),reason:runId+' source held'}));
      const held=ok(await http('POST','/ingredients/'+i.id+'/returns',
        {...body,requestId:randomUUID(),quantity:2}));
      assert.equal(held.return.disposition,'QUARANTINED');
      const final=await stock(i,10);
      assert.equal(final.batches.filter(b=>b.qualityStatus==='QUARANTINED').length,3);
      assert.equal(ok(await http('GET','/ingredients/'+i.id)).availableQuantity,0);
      const expired=await initial(wrong,1,'ln16-expired','2001-01-01');
      assert.equal((await http('POST','/ingredients/'+wrong.id+'/returns',
        {...body,requestId:randomUUID(),batchId:expired.batch.id})).status,409);
      // A genuine CONSUME from a batch that later expires must never become usable.
      const expIngredient=await ingredient('ln16-valid-then-expired');
      const expiresAt=new Date(Date.now()+12000).toISOString();
      const expLot=await initial(expIngredient,2,'ln16-short-life',expiresAt);
      const expProduct=await product(expIngredient,'ln16-short-life-product',1);
      const expOrder=await order(expProduct);
      ok(await prep(expOrder));
      const expConsumed=(await state(expIngredient)).ledger.find(t=>t.type==='CONSUME');
      assert.ok(expConsumed&&expConsumed.batchId===expLot.batch.id,'Need genuine source consumption');
      await sleep(Math.max(0,new Date(expiresAt).getTime()-Date.now()+150));
      assert.ok(Date.now()>new Date(expiresAt).getTime(),'Batch must have actually expired');
      const expBefore=stable(await state(expIngredient));
      const expiredResult=await http('POST','/ingredients/'+expIngredient.id+'/returns',{
        requestId:randomUUID(),sourceTransactionId:expConsumed.id,batchId:expLot.batch.id,
        quantity:1,quality:'SAFE',reason:runId+' genuinely expired source returned'});
      assert.ok([200,409].includes(expiredResult.status));
      if(expiredResult.status===200){
        assert.equal(expiredResult.data.return.disposition,'QUARANTINED');
        await stock(expIngredient,2);
      }else{
        assert.equal(stable(await state(expIngredient)),expBefore);
        await stock(expIngredient,1);
      }
      assert.equal(ok(await http('GET','/ingredients/'+expIngredient.id)).availableQuantity,0);
      return {sourceId:source.id,wrong:409,excess:409,changedReplay:409,
        expiredWithoutConsume:409,expiredRealConsumedSource:expiredResult.status,
        expiredReturnedUsable:0,quarantined:'NOT_USABLE',finalPhysical:10};
    });
  }finally{
    await stopServer().catch(()=>{});
    await db.$disconnect();
    out.completedAt=new Date().toISOString();out.totalHttp=out.http.length;out.dropEvents=dropEvents;
    out.verdict=out.scenarios.length===selected.size&&out.scenarios.every(s=>s.verdict==='PASS')?'PASS':'PARTIAL_OR_FAIL';
    save();console.log(repr({runId,file,totalHttp:out.totalHttp,verdict:out.verdict,
      cases:out.scenarios.map(s=>({id:s.id,verdict:s.verdict,error:s.error?.slice(0,200)}))}));
    if(out.verdict!=='PASS')process.exitCode=1;
  }
}
