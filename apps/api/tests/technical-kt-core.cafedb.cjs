// Phase VI KT: opt-in real authenticated HTTP -> services -> Prisma -> existing cafedb.
// No external SMTP/provider charge, no destructive SQL, no shared process termination.
// Run: KT_CAFEDB_CONFIRMED=YES KT_DB_PORT=15432 node apps/api/tests/technical-kt-core.cafedb.cjs
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),net=require('node:net');
const {randomUUID}=require('node:crypto'),{spawn}=require('node:child_process');
require('dotenv').config({path:'apps/api/.env',quiet:true});
require('dotenv').config({quiet:true});
const uri=new URL(process.env.DATABASE_URL);
assert.equal(uri.pathname,'/cafedb');
uri.hostname='127.0.0.1';uri.port=process.env.KT_DB_PORT||'15432';
const clean=v=>JSON.stringify(v,(key,value)=>{
  if(/^(authorization|secret|signature|password|accesskey|token)$/i.test(key)||
    /(?:^|_)(secret|signature|password|accesskey|token)(?:_|$)/i.test(key))return '[REDACTED]';
  if(typeof value==='bigint')return value.toString();
  if(value instanceof Error)return value.message;
  return value;
},2);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
if(process.env.KT_CHILD==='YES'){
  assert.equal(process.env.KT_CAFEDB_CONFIRMED,'YES');
  const childUrl=new URL(uri.toString());
  if(process.env.KT_CHILD_DB_PORT)childUrl.port=process.env.KT_CHILD_DB_PORT;
  process.env.DATABASE_URL=childUrl.toString();
  process.env.NODE_ENV='test';
  process.env.PAYMENT_REFUND_EXECUTION_ENABLED='false';
  process.env.PAYMENT_REFUND_POLICY_ENABLED='false';
  process.env.MOMO_PARTNER_CODE='KT-CONTRACT';
  process.env.MOMO_ACCESS_KEY='kt-test';
  process.env.MOMO_SECRET_KEY='kt-test-only-'+process.env.KT_SECRET;
  process.env.VNPAY_TMN_CODE='KTTEST';
  process.env.VNPAY_HASH_SECRET='kt-test-only-'+process.env.KT_SECRET;
  require('ts-node').register({project:'apps/api/tsconfig.json',transpileOnly:true});
  const express=require('express'),app=express();
  app.use(express.json());
  app.set('json replacer',(_k,value)=>typeof value==='bigint'?value.toString():value);
  app.use((req,res,next)=>{
    if(req.headers['x-kt-drop-ack']!=='YES')return next();
    const end=res.end;
    res.end=function(...args){
      if(res.statusCode===200&&req.path.endsWith('/import')){
        process.send?.({kind:'DROP_AFTER_COMMIT',pid:process.pid});
        res.socket?.destroy();return this;
      }
      return end.apply(this,args);
    };
    next();
  });
  const supplier=require('../src/modules/supplier/supplier.route');
  const purchase=require('../src/modules/purchase/purchase.route');
  for(const [root,path,exportName] of [
    ['/api/ingredients','../src/modules/ingredient/ingredient.route','ingredientRoutes'],
    ['/api/stocktakes','../src/modules/inventory/stocktake.route','stocktakeRoutes'],
    ['/api/suppliers','../src/modules/supplier/supplier.route','supplierRoutes'],
    ['/api/supplier-products','../src/modules/supplier/supplier.route','supplierProductRoutes'],
    ['/api/purchase-requests','../src/modules/purchase/purchase.route','default'],
    ['/api/purchase-orders','../src/modules/purchase/purchase.route','purchaseOrderRoutes'],
    ['/api/orders','../src/modules/order/order.route','default'],
    ['/api/payments','../src/modules/payment/payment.route','default']
  ])app.use(root,require(path)[exportName]);
  app.use(require('../src/common/error-handler').errorHandler);
  const server=app.listen(Number(process.env.KT_HTTP_PORT),'127.0.0.1',
    ()=>process.send?.({kind:'READY',pid:process.pid,port:Number(process.env.KT_HTTP_PORT)}));
  process.on('SIGTERM',()=>server.close(()=>process.exit()));
} else main().catch(e=>{console.error(e.stack||e);process.exitCode=2});

async function main(){
  assert.equal(process.env.KT_CAFEDB_CONFIRMED,'YES','KT_CAFEDB_CONFIRMED=YES required');
  const jwt=require('jsonwebtoken'),{PrismaClient}=require('@prisma/client');
  const db=new PrismaClient({datasources:{db:{url:uri.toString()}}});
  const runID='kt-'+randomUUID(),baseDir='D:/KLTN/cafe-project-artifacts/reports/security';
  fs.mkdirSync(baseDir,{recursive:true});
  const target=baseDir+'/technical-kt-core-'+runID+'.json';
  const out={runID,startedAt:new Date().toISOString(),db:'cafedb',port:Number(uri.port),
    cases:[],http:[],locks:[],processes:[],noExternalActions:true,
    limitations:['Synthetic fixture data in real existing cafedb','External provider/supplier never contacted']};
  const save=()=>fs.writeFileSync(target,clean(out),'utf8');
  const selected=new Set((process.env.KT_CASES||'KT01,KT03,KT04,KT05,KT06,KT07,KT08,KT09,KT10,KT12,KT13,KT14,KT15,KT16').split(','));
  let child=null,port=0,seq=0,admin='',staff='',adminUser,staffUser,secret=randomUUID();
  const marks=[];
  async function childPort(){return new Promise((resolve,reject)=>{
    const listener=net.createServer();listener.once('error',reject);
    listener.listen(0,'127.0.0.1',()=>{const p=listener.address().port;listener.close(()=>resolve(p))});
  })}
  async function start(childDbPort){
    assert.equal(child,null);
    port=await childPort();
    const c=spawn(process.execPath,[__filename],{cwd:process.cwd(),windowsHide:true,
      env:{...process.env,KT_CHILD:'YES',KT_HTTP_PORT:String(port),KT_SECRET:secret,
        KT_CHILD_DB_PORT:childDbPort?String(childDbPort):''},
      stdio:['ignore','pipe','pipe','ipc']});
    child=c;let stderr='';
    c.stdout.on('data',()=>{});c.stderr.on('data',d=>{stderr=(stderr+String(d)).slice(-2500)});
    const ready=await Promise.race([
      new Promise((resolve,reject)=>{
        c.on('message',message=>{
          if(message.kind==='READY')resolve(message);
          if(message.kind==='DROP_AFTER_COMMIT')marks.push(message);
        });
        c.once('exit',(code,signal)=>reject(Error('KT child premature exit '+code+'/'+signal+': '+stderr)));
      }),
      sleep(18000).then(()=>{throw Error('KT child startup timeout: '+stderr)})
    ]);
    out.processes.push({kind:'START',...ready,at:new Date().toISOString()});
  }
  async function stop(force=false){
    if(!child)return;
    const c=child;child=null;
    if(c.exitCode!==null||c.signalCode!==null)return;
    const exited=new Promise(resolve=>c.once('exit',(code,signal)=>resolve({code,signal})));
    c.kill(force?'SIGKILL':'SIGTERM');
    const result=await Promise.race([exited,sleep(5000).then(()=>{c.kill('SIGKILL');return exited})]);
    out.processes.push({kind:'STOP',pid:c.pid,force,...result,at:new Date().toISOString()});
  }
  async function localDbTunnel(){
    const sockets=new Set(),server=net.createServer(local=>{
      const remote=net.connect({host:'127.0.0.1',port:Number(uri.port)});
      sockets.add(local);sockets.add(remote);
      local.pipe(remote);remote.pipe(local);
      for(const socket of [local,remote]){
        socket.on('error',()=>{local.destroy();remote.destroy()});
        socket.on('close',()=>{sockets.delete(socket);local.destroy();remote.destroy()});
      }
    });
    const tunnelPort=await new Promise((resolve,reject)=>{
      server.once('error',reject);
      server.listen(0,'127.0.0.1',()=>resolve(server.address().port));
    });
    const cut=()=>{for(const s of sockets)s.destroy()};
    const close=async()=>{cut();await new Promise(resolve=>server.close(resolve))};
    return {tunnelPort,cut,close,connectionCount:()=>sockets.size};
  }
  async function req(method,path,body,role='ADMIN',options={}){
    const id='KT-H'+(++seq),begin=new Date().toISOString();
    const token=role==='ADMIN'?admin:role==='STAFF'?staff:null;
    try{
      const response=await fetch('http://127.0.0.1:'+port+'/api'+path,{method,
        headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{}),
          ...(options.dropAck?{'x-kt-drop-ack':'YES'}:{})},
        body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(options.timeout||28000)});
      const raw=await response.text();let payload;
      try{payload=JSON.parse(raw)}catch{payload={raw}};
      const item={id,method,path:path.split('?')[0],role,status:response.status,
        requestId:body?.requestId,begin,end:new Date().toISOString(),
        result:payload?.message,replayed:payload?.data?.replayed,
        ...(response.status>=400?{error:payload?.error||payload?.message}:{})};
      out.http.push(item);
      return {id,status:response.status,data:payload?.data,body:payload};
    }catch(error){
      out.http.push({id,method,path:path.split('?')[0],role,status:'NO_RESPONSE',
        requestId:body?.requestId,begin,end:new Date().toISOString(),error:error.message});
      if(!options.allowFailure)throw error;
      return {id,status:'NO_RESPONSE',error:error.message};
    }
  }
  const ok=(r,status=200)=>{
    assert.equal(r.status,status,r.id+': '+clean(r.body).slice(0,600));return r.data;
  };
  async function test(id,description,fn){
    if(!selected.has(id))return;
    const offset=out.http.length;
    try{
      const evidence=await fn();
      out.cases.push({id,description,verdict:evidence?.verdict||'PASS',
        evidence,...evidence,requests:out.http.slice(offset).map(r=>r.id)});
    }catch(e){out.cases.push({id,description,verdict:'FAIL',
      failure:e.stack||e.message,requests:out.http.slice(offset).map(r=>r.id)})}
    console.log(id+' '+out.cases.at(-1).verdict+
      (out.cases.at(-1).failure?' '+out.cases.at(-1).failure.slice(0,190):''));
    save();
  }
  async function ingredient(tag,unit='g'){
    return ok(await req('POST','/ingredients',{sku:runID+'-'+tag,
      name:runID+'-'+tag,baseUnit:unit,costPerBaseUnit:2,
      expiryClassification:'NON_PERISHABLE'}),201);
  }
  function importBody(q,tag,key=randomUUID(),unit='g',price=2){
    return {requestId:key,quantity:q,unit,unitCost:price,
      batchCode:runID+'-'+tag,expirationDate:'2099-01-01T00:00:00.000Z'};
  }
  const imp=(i,body,role='ADMIN',opts={})=>req('POST','/ingredients/'+i.id+'/import',body,role,opts);
  async function stock(i){
    return {ingredient:await db.ingredient.findUniqueOrThrow({where:{id:i.id}}),
      batches:await db.ingredientBatch.findMany({where:{ingredientId:i.id},orderBy:{id:'asc'}}),
      ledger:await db.inventoryTransaction.findMany({where:{ingredientId:i.id},orderBy:{movementSeq:'asc'}})};
  }
  const physical=s=>s.batches.reduce((a,b)=>a+Number(b.quantityRemaining),0);
  const verify=(s,q)=>{assert.equal(Number(s.ingredient.quantity),q);
    assert.equal(physical(s),q);
    assert.ok(s.batches.every(b=>Number(b.quantityRemaining)>=0));
  };
  async function lockOverlap(i,operations,minimum=2){
    let release,signal;
    const gate=new Promise(resolve=>release=resolve),held=new Promise(resolve=>signal=resolve);
    const holder=db.$transaction(async tx=>{
      await tx.$queryRawUnsafe('SELECT id FROM "Ingredient" WHERE id=$1 FOR UPDATE',i.id);
      signal();await gate;
    },{timeout:24000});
    await held;
    const pending=operations.map(op=>op());
    let maxWait=0,samples=[];
    try{
      for(let n=0;n<100;n++){
        const rows=await db.$queryRawUnsafe("SELECT pid,wait_event,query FROM pg_stat_activity "+
          "WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%Ingredient%FOR UPDATE%'");
        maxWait=Math.max(maxWait,rows.length);
        if(rows.length>=minimum){samples=rows.map(r=>({pid:r.pid,wait:r.wait_event}));break}
        await sleep(50);
      }
    }finally{release();await holder}
    const result=await Promise.allSettled(pending);
    out.locks.push({ingredientId:i.id,waiters:maxWait,samples,
      results:result.map(x=>x.status==='fulfilled'?x.value.status:'EXCEPTION')});
    assert.ok(maxWait>=minimum,'Actual pg_stat_activity waiters '+maxWait+' < '+minimum);
    assert.ok(result.every(x=>x.status==='fulfilled'),clean(result));
    return {waiters:maxWait,responses:result.map(x=>x.value)};
  }
  async function createStocktake(i,counterId=staffUser.id,tag=''){
    const session=ok(await req('POST','/stocktakes',{requestId:randomUUID(),
      ingredientIds:[i.id],assignedCounterId:counterId,note:runID+' '+tag}),201);
    return session;
  }
  async function count(s,batchId,qty,role='STAFF',cursor){
    const details=ok(await req('GET','/stocktakes/'+s.session.id,undefined,role));
    const entry=details.entries.find(x=>x.batchId===batchId);
    return req('POST','/stocktakes/'+s.session.id+'/entries',{requestId:randomUUID(),
      batchId,expectedCursor:cursor||details.current[0].cursor,expectedRevision:entry?.revision||0,
      actualQty:qty,reason:runID+' count',reasonCategory:'COUNTED'},role);
  }
  try{
    const [dbInfo]=await db.$queryRawUnsafe(
      "SELECT current_database() name, (SELECT count(*)::int FROM pg_trigger "+
      "WHERE tgname='InventoryTransaction_append_only') immutability_trigger");
    assert.equal(dbInfo.name,'cafedb');
    out.databaseEvidence=dbInfo;
    adminUser=await db.user.findFirstOrThrow({where:{role:'ADMIN',isActive:true},
      select:{id:true,email:true,role:true}});
    staffUser=await db.user.findFirstOrThrow({where:{role:'STAFF',isActive:true},
      select:{id:true,email:true,role:true}});
    admin=jwt.sign(adminUser,process.env.JWT_SECRET,{expiresIn:'1h'});
    staff=jwt.sign(staffUser,process.env.JWT_SECRET,{expiresIn:'1h'});
    await start();

    await test('KT01','Break only owned app PostgreSQL transport mid-write; rollback and reconcile',async()=>{
      const i=await ingredient('db-link-lost');
      ok(await imp(i,importBody(10,'db-link-original')));
      const before=clean(await stock(i)),attempt=importBody(3,'db-link-interrupted');
      const tunnel=await localDbTunnel();
      await stop();
      let dropped,waiters=0,linkCut=false;
      try{
        await start(tunnel.tunnelPort);
        let release,notify;
        const gate=new Promise(r=>release=r),ready=new Promise(r=>notify=r);
        const holder=db.$transaction(async tx=>{
          await tx.$queryRawUnsafe('SELECT id FROM "Ingredient" WHERE id=$1 FOR UPDATE',i.id);
          notify();await gate;
        },{timeout:24000});
        await ready;
        const pending=imp(i,attempt,'ADMIN',{allowFailure:true});
        try{
          for(let j=0;j<100;j++){
            const [x]=await db.$queryRawUnsafe("SELECT count(*)::int n FROM pg_stat_activity "+
              "WHERE datname=current_database() AND wait_event_type='Lock' "+
              "AND query LIKE '%Ingredient%FOR UPDATE%'");
            waiters=Math.max(waiters,x.n);
            if(waiters>=1)break;await sleep(40);
          }
          assert.ok(waiters>=1,'No real PG row-lock wait before DB link loss');
          linkCut=tunnel.connectionCount()>0;
          assert.ok(linkCut,'Owned tunnel had no active DB sockets');
          tunnel.cut();
          dropped=await pending;
        }finally{release();await holder}
      }finally{
        await stop().catch(()=>{});await tunnel.close();await start();
      }
      assert.ok(['NO_RESPONSE',500,503].includes(dropped.status),
        'DB link severed but backend unexpectedly returned '+dropped.status);
      assert.equal(clean(await stock(i)),before,'Commit occurred after broken DB socket');
      const retried=ok(await imp(i,attempt));
      const result=await stock(i);verify(result,13);
      assert.equal(result.ledger.filter(t=>t.idempotencyKey==='ingredient-import:'+attempt.requestId).length,1);
      return {databaseLinkBroken:true,pgWaiters:waiters,
        interruptedHttp:dropped.status,retryHttp:200,qtyBefore:10,qtyAfter:13,
        backendReconcile:'GET authoritative DB + retry same requestId'};
    });

    await test('KT03','Two real writers on same exact batch, row locks prevent lost update',async()=>{
      const i=await ingredient('row-lock');
      const opening=ok(await imp(i,importBody(12,'single-lot')));
      const a={quantity:7,unit:'g',wasteReason:'DAMAGED',batchId:opening.batch.id,
        note:runID+' same-lot waste A'};
      const b={quantity:5,unit:'g',wasteReason:'DAMAGED',batchId:opening.batch.id,
        note:runID+' same-lot waste B'};
      const overlap=await lockOverlap(i,[
        ()=>req('POST','/ingredients/'+i.id+'/waste',a),
        ()=>req('POST','/ingredients/'+i.id+'/waste',b)
      ]);
      overlap.responses.forEach(r=>ok(r));
      const s=await stock(i);verify(s,0);
      assert.equal(s.batches.length,1,'Both writers must target the exact same batch');
      assert.equal(s.batches[0].id,opening.batch.id);
      assert.equal(s.ledger.filter(x=>x.type==='WASTE').length,2);
      assert.equal(s.ledger.filter(x=>x.type==='IMPORT').length,1);
      return {waiters:overlap.waiters,HTTP:overlap.responses.map(x=>x.status),
        sameBatchId:opening.batch.id,opening:12,wasteA:7,wasteB:5,
        finalQuantity:0,wasteLedgerCount:2};
    });

    await test('KT04','Exact request replay effect once, changed body and actor 409',async()=>{
      const i=await ingredient('replay'),body=importBody(3,'replay');
      ok(await imp(i,body));const before=clean(await stock(i));
      assert.equal(ok(await imp(i,body)).replayed,true);
      assert.equal((await imp(i,{...body,quantity:4})).status,409);
      assert.equal((await imp(i,body,'STAFF')).status,409);
      assert.equal(clean(await stock(i)),before);
      return {statuses:[200,200,409,409],ledgerCount:1,quantity:3};
    });

    await test('KT05','Owned process killed precommit, and postcommit response lost then safe replay',async()=>{
      const i=await ingredient('process-restart'),opening=importBody(10,'restart-base');
      ok(await imp(i,opening));
      const pendingBody=importBody(3,'killed-precommit'),before=clean(await stock(i));
      let release,signal;
      const gate=new Promise(r=>release=r),held=new Promise(r=>signal=r);
      const holder=db.$transaction(async tx=>{
        await tx.$queryRawUnsafe('SELECT id FROM "Ingredient" WHERE id=$1 FOR UPDATE',i.id);
        signal();await gate;
      },{timeout:24000});
      await held;
      const pending=imp(i,pendingBody,'ADMIN',{allowFailure:true});
      let waiters=0;
      try{
        for(let j=0;j<100;j++){
          const [x]=await db.$queryRawUnsafe("SELECT count(*)::int n FROM pg_stat_activity "+
            "WHERE datname=current_database() AND wait_event_type='Lock' "+
            "AND query LIKE '%Ingredient%FOR UPDATE%'");
          waiters=Math.max(waiters,x.n);
          if(waiters>=1)break;await sleep(40);
        }
        assert.ok(waiters>=1,'Precommit postgres wait not observed');
        await stop(true);
      }finally{release();await holder}
      assert.equal((await pending).status,'NO_RESPONSE');
      assert.equal(clean(await stock(i)),before,'Killed precommit write persisted unexpectedly');
      await start();
      ok(await imp(i,pendingBody));
      verify(await stock(i),13);
      const afterBody=importBody(5,'ack-dropped');
      const interrupted=await imp(i,afterBody,'ADMIN',{dropAck:true,allowFailure:true});
      assert.equal(interrupted.status,'NO_RESPONSE');
      assert.ok(marks.some(x=>x.kind==='DROP_AFTER_COMMIT'));
      const committed=clean(await stock(i));
      verify(await stock(i),18);
      await stop();await start();
      assert.equal(ok(await imp(i,afterBody)).replayed,true);
      assert.equal(clean(await stock(i)),committed);
      assert.equal((await imp(i,{...afterBody,quantity:6})).status,409);
      return {pgWaiters:waiters,killedOwnChildPrecommit:true,
        postCommitResponseLost:true,finalQty:18,originalEffectOnce:true,changedPayload409:true};
    });

    await test('KT06','Forged provider webhook rejected, no settlement on synthetic DB payment fixture',async()=>{
      // These are isolated test-only payment records; no gateway traffic/charge.
      process.env.MOMO_PARTNER_CODE='KT-CONTRACT';
      process.env.MOMO_ACCESS_KEY='kt-test';
      process.env.MOMO_SECRET_KEY='kt-test-only-'+secret;
      require('ts-node').register({project:'apps/api/tsconfig.json',transpileOnly:true});
      const {signMoMoIpnPayload}=require('../src/modules/payment/momo.gateway');
      const orderId=runID+'-payment-'+randomUUID();
      const order=await db.order.create({data:{id:orderId,userId:adminUser.id,
        totalAmount:'10000',paymentMethod:'MOMO',paymentStatus:'PENDING',
        payments:{create:{method:'MOMO',amount:'10000',
          merchantRef:orderId+'_1',attemptNo:1,status:'PENDING'}}},
        include:{payments:true}});
      const payment=order.payments[0];
      const base={partnerCode:'KT-CONTRACT',orderId:payment.merchantRef,
        requestId:payment.merchantRef+'-request',amount:'10000',orderInfo:'KT synthetic',
        transId:runID+'-'+randomUUID(),resultCode:0,message:'KT mock only',
        responseTime:Date.now(),extraData:''};
      const signed=payload=>({...payload,signature:signMoMoIpnPayload(payload,
        process.env.MOMO_ACCESS_KEY,process.env.MOMO_SECRET_KEY)});
      const bad=await req('POST','/payments/webhook/momo',
        {...base,signature:'invalid'},'ANON');
      assert.equal(bad.status,400);
      const wrongMerchant=await req('POST','/payments/webhook/momo',
        signed({...base,partnerCode:'WRONG-MERCHANT'}),'ANON');
      const replayPayload=signed({...base,amount:'9000',transId:runID+'-'+randomUUID()});
      const wrongAmount=await req('POST','/payments/webhook/momo',replayPayload,'ANON');
      const retry=await req('POST','/payments/webhook/momo',
        replayPayload,'ANON');
      const after=await db.order.findUniqueOrThrow({where:{id:orderId},
        include:{payments:true}});
      assert.equal(after.paymentStatus,'PENDING');
      assert.equal(after.payments[0].status,'PENDING');
      assert.equal(after.payments[0].paidAt,null);
      assert.ok([200,204,400,409].includes(wrongMerchant.status));
      assert.ok([200,204,400,409].includes(wrongAmount.status));
      assert.ok([200,204,400,409].includes(retry.status));
      return {verdict:'BACKEND_PASS',invalidSignatureStatus:400,
        wrongMerchantStatus:wrongMerchant.status,wrongAmountStatus:wrongAmount.status,
        replayOfRejectedAttemptStatus:retry.status,paymentStatus:'PENDING',
        externalProvider:'NOT_VERIFIED_EXTERNAL',realFinancialActivity:false};
    });

    await test('KT07','STAFF cannot commit stock adjustment, but can create draft under current policy',async()=>{
      const i=await ingredient('staff-rbac'),receipt=ok(await imp(i,importBody(10,'staff-rbac')));
      const before=clean(await stock(i));
      const forbidden=await req('POST','/ingredients/'+i.id+'/internal-use',{
        requestId:randomUUID(),quantity:1,unit:'g',purpose:'KT no permission',
        recipient:'KT test'},'STAFF');
      assert.equal(forbidden.status,403);
      const draft=await req('POST','/ingredients/'+i.id+'/adjustments',{
        requestId:randomUUID(),batchId:receipt.batch.id,measuredQuantity:9,
        reason:'KT isolated draft'},'STAFF');
      assert.equal(draft.status,201);
      const approve=await req('POST','/ingredients/'+i.id+'/adjustments/'+
        draft.data.requestId+'/approve',undefined,'STAFF');
      assert.equal(approve.status,403);
      assert.equal(clean(await stock(i)),before);
      return {verdict:'BLOCKED_POLICY',reason:'STAFF may create a PENDING_APPROVAL draft (201) by design; user expected 403 on stock adjust. Committed stock unchanged; ADMIN-only approve and internal-use 403.',statuses:[403,201,403],
        physicalQty:10};
    });

    await test('KT08','Assigned ADMIN counter cannot self-approve',async()=>{
      const i=await ingredient('self-approve'),receipt=ok(await imp(i,importBody(10,'self-count')));
      const s=await createStocktake(i,adminUser.id,'self');
      ok(await count(s,receipt.batch.id,9,'ADMIN'));
      ok(await req('POST','/stocktakes/'+s.session.id+'/submit',{requestId:randomUUID()}));
      const before=clean(await stock(i));
      const approval=await req('POST','/stocktakes/'+s.session.id+'/approve',{requestId:randomUUID()});
      assert.equal(approval.status,403);
      assert.equal(clean(await stock(i)),before);
      assert.equal((await db.stockCount.findUniqueOrThrow({where:{id:s.session.id}})).status,'PENDING_APPROVAL');
      return {selfApprovalHttp:403,unchangedQuantity:10,sessionStatus:'PENDING_APPROVAL'};
    });

    await test('KT09','Malformed, negative and invalid-unit quantities fail without stock writes',async()=>{
      const i=await ingredient('invalid'),baseline=clean(await stock(i));
      const items=[{quantity:-1},{quantity:0},{quantity:'NaN'},{quantity:'Infinity'},
        {quantity:null},{quantity:1,unit:'unsupported--units'}];
      const statuses=[];
      for(let index=0;index<items.length;index++){
        const bad=items[index],body={...importBody(1,'bad-'+index),...bad};
        const response=await imp(i,body);statuses.push(response.status);
        assert.ok(response.status>=400,'Accepted invalid quantity/unit '+index);
      }
      assert.equal(clean(await stock(i)),baseline);
      return {statuses,invalidRequests:items.length,committedMovements:0};
    });

    await test('KT10','Decimal 3-place conservation and overflow rejected without mutation',async()=>{
      const i=await ingredient('decimal'),a=importBody(1.001,'decimal-A',randomUUID(),'g',0.1);
      const b=importBody(0.002,'decimal-B',randomUUID(),'g',0.1);
      ok(await imp(i,a));ok(await imp(i,b));
      const s=await stock(i);verify(s,1.003);
      assert.equal(s.ledger[0].quantity.toString(),'1.001');
      assert.equal(s.ledger[1].quantity.toString(),'0.002');
      const prev=clean(s);
      const huge=await imp(i,importBody(1000000000000000000,'decimal-overflow'));
      assert.ok(huge.status>=400,'Overflow was unexpectedly accepted');
      assert.equal(clean(await stock(i)),prev);
      return {verdict:huge.status>=500?'PARTIAL':'PASS',overflowHttp:huge.status,
        preciseTotal:'1.003',physicalLotSum:'1.003',
        note:huge.status>=500?'Fail-closed DB overflow with server error; API error normalization needs review.':'Rejected with validation status'};
    });

    await test('KT12','Stale client cache cannot overwrite fresh authoritative count cursor',async()=>{
      const i=await ingredient('stale'),old=ok(await imp(i,importBody(6,'stale-A')));
      const s=await createStocktake(i);
      const initial=ok(await req('GET','/stocktakes/'+s.session.id,undefined,'STAFF'));
      const staleCursor=initial.current[0].cursor;
      ok(await imp(i,importBody(4,'stale-B')));
      const res=await count(s,old.batch.id,6,'STAFF',staleCursor);
      assert.equal(res.status,409);
      const current=ok(await req('GET','/stocktakes/'+s.session.id,undefined,'STAFF'));
      assert.notEqual(current.current[0].cursor,staleCursor);
      ok(await count(s,old.batch.id,6,'STAFF'));
      const ledger=await stock(i);verify(ledger,10);
      return {staleHttp:409,cursorOld:staleCursor,cursorCurrent:current.current[0].cursor,
        totalPhysical:10};
    });

    await test('KT13','Durable UNKNOWN supplier dispatch; replay and resend held without email',async()=>{
      const i=await ingredient('po-unknown','gram');
      const supplier=ok(await req('POST','/suppliers',{
        name:runID+'-supplier',email:runID.slice(0,16)+'@example.invalid'}),201).supplier;
      ok(await req('POST','/supplier-products',{
        supplierId:supplier.id,productId:i.id,price:10,purchaseUnit:'gram',
        conversionQuantity:1,conversionTargetUnit:'gram',minOrderQuantity:1,leadTimeDays:1
      }),201);
      const pr=ok(await req('POST','/purchase-requests',{supplierId:supplier.id,
        notes:runID+' no external SMTP',items:[{ingredientId:i.id,quantity:5,unitPrice:10}]
      }),201).purchaseRequest;
      ok(await req('PATCH','/purchase-requests/'+pr.id+'/approve'));
      const po=ok(await req('POST','/purchase-orders',{requestId:randomUUID(),
        purchaseRequestId:pr.id,currency:'VND'}),201).order;
      const body={requestId:randomUUID(),mode:'UNKNOWN',reason:runID+' supplier not contacted'};
      const sent=ok(await req('POST','/purchase-orders/'+po.id+'/dispatch',body));
      assert.equal(sent.order.status,'DISPATCH_UNKNOWN');
      assert.equal(sent.externalDelivery,'NOT_VERIFIED');
      assert.equal(ok(await req('POST','/purchase-orders/'+po.id+'/dispatch',body)).replayed,true);
      assert.equal((await req('POST','/purchase-orders/'+po.id+'/dispatch',
        {...body,requestId:randomUUID()})).status,409);
      const attempts=await db.purchaseDispatchAttempt.findMany({where:{purchaseOrderId:po.id}});
      assert.equal(attempts.length,1);
      assert.equal(attempts[0].providerStatus,'UNKNOWN');
      assert.equal(attempts[0].providerReference,null);
      return {verdict:'BACKEND_PASS',poId:po.id,status:'DISPATCH_UNKNOWN',
        providerStatus:'UNKNOWN',durableAttempts:1,replayedSameId:true,
        newUnknownBlockedHttp:409,realSupplierEmail:false,
        externalProof:'NOT_VERIFIED_EXTERNAL'};
    });

    await test('KT14','API authorization and DB append-only trigger installed, no forbidden SQL mutation attempted',async()=>{
      const i=await ingredient('ledger'),created=ok(await imp(i,importBody(8,'immutable')));
      assert.equal(dbInfo.immutability_trigger,1);
      const before=clean(await stock(i));
      const correction=await req('POST','/ingredients/'+i.id+'/transactions/'+
        created.batch.id+'/corrections',{requestId:randomUUID(),reason:'KT denied'},'STAFF');
      assert.equal(correction.status,403);
      const after=clean(await stock(i));assert.equal(after,before);
      const enabled=await db.$queryRawUnsafe(
        "SELECT t.tgenabled, pg_get_triggerdef(t.oid) definition "+
        "FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid "+
        "WHERE c.relname='InventoryTransaction' AND t.tgname='InventoryTransaction_append_only'");
      assert.equal(enabled.length,1);assert.equal(enabled[0].tgenabled,'O');
      assert.ok(enabled[0].definition.includes('BEFORE') &&
        enabled[0].definition.includes('UPDATE') &&
        enabled[0].definition.includes('DELETE'),'Unexpected append-only trigger definition');
      const [eventGuard]=await db.$queryRawUnsafe(
        "SELECT current_user AS db_user, "+
        "has_table_privilege(current_user,'\"PurchaseOrderEvent\"','UPDATE') AS event_update_granted, "+
        "(SELECT relrowsecurity FROM pg_class WHERE relname='PurchaseOrderEvent') AS event_rls, "+
        "(SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid "+
        "WHERE c.relname='PurchaseOrderEvent' AND NOT t.tgisinternal) AS event_trigger_count");
      assert.ok(eventGuard);
      return {verdict:'PARTIAL',staffHttp:403,triggerEnabled:true,
        purchaseEventDbUser:eventGuard.db_user,
        eventUpdateGranted:eventGuard.event_update_granted,
        eventRowLevelSecurity:eventGuard.event_rls,
        eventImmutabilityTriggerCount:eventGuard.event_trigger_count,
        note:'Ledger append-only trigger enabled, API denies STAFF correction, but PurchaseOrderEvent DB immutability not proven. No destructive UPDATE/DELETE attempted.'};
    });

    await test('KT15','Repeated same request ID with latency, one durable effect',async()=>{
      const i=await ingredient('slow-replay'),body=importBody(3,'slow-replay');
      const race=await lockOverlap(i,[()=>imp(i,body)],1);
      ok(race.responses[0]);
      const statuses=[];
      for(let n=0;n<12;n++){
        const response=await imp(i,body);statuses.push(response.status);
        assert.equal(ok(response).replayed,true);
      }
      const s=await stock(i);verify(s,3);
      assert.equal(s.ledger.length,1);
      return {observedBlockedWaiters:race.waiters,remainingReplays:12,statuses:[200,...statuses],
        durableImports:1};
    });

    await test('KT16','Forged client clock ignored; PostgreSQL movement sequence is authoritative',async()=>{
      const i=await ingredient('clock');
      const first=importBody(2,'clock-A'),second=importBody(4,'clock-B');
      first.clientObservedAt='2099-01-01T00:00:00Z';
      second.clientObservedAt='1990-01-01T00:00:00Z';
      const a=await imp(i,first),b=await imp(i,second);
      ok(a);ok(b);
      const s=await stock(i);verify(s,6);
      assert.equal(s.ledger.length,2);
      assert.ok(s.ledger[0].movementSeq<s.ledger[1].movementSeq);
      assert.equal(BigInt(s.ingredient.movementCursor),BigInt(s.ledger[1].movementSeq));
      return {verdict:'BACKEND_PASS',sequence:s.ledger.map(x=>x.movementSeq.toString()),
        note:'Untrusted client clock extras did not reorder DB commits; no host wall clock manipulation performed'};
    });
  }finally{
    await stop().catch(()=>{});
    await db.$disconnect();
    out.finishedAt=new Date().toISOString();out.totalHTTP=out.http.length;out.socketDrops=marks;
    out.completion=out.cases.length===selected.size&&out.cases.every(x=>x.verdict!=='FAIL')?'SCOPED_COMPLETE':'PARTIAL';
    save();console.log(clean({runID,target,totalHTTP:out.totalHTTP,completion:out.completion,
      cases:out.cases.map(x=>({id:x.id,verdict:x.verdict,failure:x.failure?.slice(0,180)}))}));
    if(out.cases.some(x=>x.verdict==='FAIL'))process.exitCode=1;
  }
}
