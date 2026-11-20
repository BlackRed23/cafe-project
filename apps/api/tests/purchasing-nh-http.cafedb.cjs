// NH-01..NH-22: actual HTTP -> JWT -> services -> Prisma -> cafedb.
// Opt-in, uniquely owned fixtures, zero external supplier communication.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');
const reportRoot = 'D:/KLTN/cafe-project-artifacts/reports/purchasing';
fs.mkdirSync(reportRoot, { recursive: true });
const run = 'nh-' + randomUUID();
const out = { run, time: new Date().toISOString(), scenarios: [], requests: [],
  externalCommunication: 'NONE', database: 'cafedb', notes: [] };
const evidencePath = process.env.PURCHASING_EVIDENCE_PATH ||
  reportRoot + '/PURCHASING-HTTP-DB-EVIDENCE.json';
const stringify = value => JSON.stringify(value, (_k,v)=>typeof v==='bigint'?v.toString():v);
const save = () => fs.writeFileSync(evidencePath, stringify(out));
const selected = process.env.PURCHASING_CASES?.split(',');
async function main() {
  assert.equal(process.env.PURCHASING_CAFEDB_CONFIRMED, 'YES');
  const uri = new URL(process.env.DATABASE_URL);
  assert.equal(uri.pathname, '/cafedb');
  uri.hostname = '127.0.0.1'; uri.port = process.env.PURCHASING_DB_PORT || '55432';
  const db = new PrismaClient({ datasources: { db: { url: uri.toString() } } });
  let admin, staff, adminUser, staffUser, n = 0;
  const base = 'http://127.0.0.1:5004/api';
  const api = async (method, url, body, token = admin) => {
    const response = await fetch(base + url, { method,
      signal: AbortSignal.timeout(30000), headers: { 'content-type':'application/json',authorization:'Bearer '+token },
      body: body === undefined ? undefined : JSON.stringify(body) });
    const raw = await response.text();
    let payload;try { payload=JSON.parse(raw); }catch { payload={raw}; }
    const row={id:'NH-H'+(++n),method,url,body,status:response.status,response:payload,
      role:token===staff?'STAFF':'ADMIN',time:new Date().toISOString()};
    out.requests.push(row);
    return row;
  };
  const ok = (result, expected = 200) => { assert.equal(result.status,expected,
    result.id+': '+stringify(result.response).slice(0,800)); return result.response.data; };
  const caseTest = async (id, expected, fn) => {
    if (selected && !selected.includes(id)) return;
    const start=out.requests.length;
    try{
      const actual=await fn();
      out.scenarios.push({id,expected,actual,verdict:'PASS',evidence:out.requests.slice(start).map(x=>x.id)});
    }catch(e){
      out.scenarios.push({id,expected,error:e.stack??e.message,verdict:'FAIL',
        evidence:out.requests.slice(start).map(x=>x.id)});
    }
    console.log(id+' '+out.scenarios.at(-1).verdict+
      (out.scenarios.at(-1).error?' '+out.scenarios.at(-1).error.slice(0,280):''));
    save();
  };
  const ingredient = async suffix => ok(await api('POST','/ingredients',{
    sku:run+'-'+suffix,name:run+'-'+suffix,baseUnit:'gram',
    expiryClassification:'NON_PERISHABLE',costPerBaseUnit:1
  }),201);
  const supplier = async suffix => ok(await api('POST','/suppliers',{
    name:run+'-'+suffix,email:run.slice(0,16)+'-'+suffix+'@example.invalid'
  }),201).supplier;
  const mapSupplier = async (s,i,price=10) => ok(await api('POST','/supplier-products',{
    supplierId:s.id,productId:i.id,price,
    purchaseUnit:'gram',conversionQuantity:1,conversionTargetUnit:'gram',
    minOrderQuantity:1,leadTimeDays:1
  }),201).supplierProduct;
  const fixture = async suffix => {
    const i=await ingredient(suffix);const s=await supplier(suffix);
    await mapSupplier(s,i);
    return {i,s};
  };
  const pr = async (f,qty=10, extra={}) => ok(await api('POST','/purchase-requests',{
    supplierId:f.s.id,notes:run+' requested stock',items:[{ingredientId:f.i.id,quantity:qty,
      unitPrice:10}],...extra
  }),201).purchaseRequest;
  const approvePr = async p => ok(await api('PATCH','/purchase-requests/'+p.id+'/approve'));
  const po = async p => ok(await api('POST','/purchase-orders',{
    requestId:randomUUID(),purchaseRequestId:p.id,currency:'VND'
  }),201).order;
  const confirm = async order => ok(await api('POST','/purchase-orders/'+order.id+'/confirm',{
    requestId:randomUUID(),reason:run+' verified in manual admin record',
    evidenceReference:run+'-manual-reference'
  }));
  const dispatch = (order,mode='SANDBOX',requestId=randomUUID()) => api('POST',
    '/purchase-orders/'+order.id+'/dispatch',{requestId,mode,reason:run+' controlled test'});
  const receiptBody = (order,quantity,extra={}) => ({
    requestId:randomUUID(),supplierInvoiceNo:run+'-INV',
    note:run+' accepted physical receipt',items:[{
      purchaseOrderItemId:order.items[0].id,receivedQuantity:quantity,
      batches:[{batchCode:run+'-lot-'+randomUUID().slice(0,8),
        expirationDate:'2099-01-01T00:00:00.000Z',quantity}]
    }],...extra
  });
  const receipt = async (order,quantity,body=receiptBody(order,quantity),token=staff) =>
    api('POST','/purchase-orders/'+order.id+'/receipts',body,token);
  const ready = async (suffix,qty=10) => {
    const f=await fixture(suffix),p=await pr(f,qty);
    await approvePr(p);const order=await po(p);await confirm(order);
    return {...f,p,order};
  };
  const current = async f => ({
    ingredient:await db.ingredient.findUniqueOrThrow({where:{id:f.i.id}}),
    batches:await db.ingredientBatch.findMany({where:{ingredientId:f.i.id},orderBy:{id:'asc'}}),
    ledger:await db.inventoryTransaction.findMany({where:{ingredientId:f.i.id},orderBy:{id:'asc'}})
  });
  const checkQty = async(f,expected) => {
    const s=await current(f);
    assert.equal(Number(s.ingredient.quantity),expected);
    assert.equal(s.batches.reduce((n,b)=>n+Number(b.quantityRemaining),0),expected);
    return s;
  };
  async function lockOverlap(purchaseRequestId,operations) {
    let release,notify;
    const stop=new Promise(resolve=>release=resolve);
    const ready=new Promise(resolve=>notify=resolve);
    const holder=db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT "id" FROM "PurchaseRequest" WHERE "id"=${purchaseRequestId} FOR UPDATE`;
      notify();await stop;
    },{timeout:25000});
    await ready;
    const pending=operations.map(op=>op());
    let waiting=0;
    try {
      for(let tries=0;tries<100;tries++){
        const [r]=await db.$queryRaw`SELECT count(*)::int waiters FROM pg_stat_activity
          WHERE datname=current_database() AND wait_event_type='Lock'
          AND query LIKE '%PurchaseRequest%FOR UPDATE%'`;
        waiting=Number(r.waiters);
        if(waiting>=2)break;
        await new Promise(resolve=>setTimeout(resolve,40));
      }
    } finally {release();await holder;}
    const results=await Promise.all(pending);
    assert.ok(waiting>=2,'Two PostgreSQL lock waiters were not observed');
    return {waiting,results};
  }
  async function advisoryOverlap(ingredientId,ops) {
    let release,notify;
    const stop=new Promise(resolve=>release=resolve);
    const ready=new Promise(resolve=>notify=resolve);
    const holder=db.$transaction(async tx=>{
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'purchasing-demand:'+ingredientId}))::text`;
      notify();await stop;
    },{timeout:25000});
    await ready;
    const pending=ops.map(op=>op());
    let waiting=0;
    try {
      for(let tries=0;tries<100;tries++){
        const [r]=await db.$queryRaw`SELECT count(*)::int waiters FROM pg_stat_activity
          WHERE datname=current_database() AND wait_event_type='Lock'
          AND query LIKE '%pg_advisory_xact_lock%'`;
        waiting=Number(r.waiters);
        if(waiting>=2)break;
        await new Promise(resolve=>setTimeout(resolve,40));
      }
    }finally{release();await holder;}
    const results=await Promise.all(pending);
    assert.ok(waiting>=2,'Concurrent demand proposals were not observed waiting on PG advisory lock.');
    return {waiting,results};
  }
  try {
    const dbName=(await db.$queryRaw`SELECT current_database() db`)[0].db;
    assert.equal(dbName,'cafedb');
    adminUser=await db.user.findFirstOrThrow({where:{role:'ADMIN',isActive:true},
      select:{id:true,email:true,role:true}});
    staffUser=await db.user.findFirstOrThrow({where:{role:'STAFF',isActive:true},
      select:{id:true,email:true,role:true}});
    admin=jwt.sign(adminUser,process.env.JWT_SECRET,{expiresIn:'2h'});
    staff=jwt.sign(staffUser,process.env.JWT_SECRET,{expiresIn:'2h'});

    await caseTest('NH-01','STAFF/ADMIN PR pending with items/actor, no PO or stock effect',async()=>{
      const f=await fixture('create');const p=await pr(f);
      assert.equal(p.status,'PENDING');assert.equal(p.items.length,1);
      const persisted=await db.purchaseRequest.findUniqueOrThrow({where:{id:p.id},include:{items:true}});
      assert.equal(persisted.requestedBy,adminUser.id);assert.ok(persisted.createdAt);
      assert.equal(await db.purchaseOrder.count({where:{purchaseRequestId:p.id}}),0);
      await checkQty(f,0);return{requestId:p.id,status:p.status,actor:persisted.requestedBy};
    });

    await caseTest('NH-02','ADMIN approval has actor/time and no automatically issued PO',async()=>{
      const f=await fixture('approve');const p=await pr(f);
      assert.equal((await api('PATCH','/purchase-requests/'+p.id+'/approve',{},staff)).status,403);
      const first=await approvePr(p);assert.equal(first.purchaseRequest.status,'APPROVED');
      assert.equal(first.purchaseRequest.approver.id,adminUser.id);
      assert.ok(first.purchaseRequest.approvedAt);
      const again=await approvePr(p);assert.equal(again.purchaseRequest.status,'APPROVED');
      assert.equal(await db.purchaseOrder.count({where:{purchaseRequestId:p.id}}),0);
      await checkQty(f,0);return{id:p.id,status:'APPROVED',duplicateApproval:'SAFE'};
    });

    await caseTest('NH-03','ADMIN rejection requires reason and no supplier order or stock change',async()=>{
      const f=await fixture('reject');const p=await pr(f);
      assert.equal((await api('PATCH','/purchase-requests/'+p.id+'/reject',{reason:''})).status,400);
      const rejected=ok(await api('PATCH','/purchase-requests/'+p.id+'/reject',{
        reason:run+' incorrect demand'
      }));
      assert.equal(rejected.purchaseRequest.status,'REJECTED');
      const dbPr=await db.purchaseRequest.findUniqueOrThrow({where:{id:p.id}});
      assert.equal(dbPr.rejectedById,adminUser.id);assert.ok(dbPr.rejectedAt);
      assert.equal((await api('PATCH','/purchase-requests/'+p.id+'/approve',{})).status,400);
      assert.equal(await db.purchaseOrder.count({where:{purchaseRequestId:p.id}}),0);
      await checkQty(f,0);return{id:p.id,reason:dbPr.rejectionReason};
    });

    await caseTest('NH-04','Only approved PR converts to one PO with Supplier and fixed price snapshot',async()=>{
      const f=await fixture('po');const p=await pr(f);
      assert.equal((await api('POST','/purchase-orders',{
        requestId:randomUUID(),purchaseRequestId:p.id,currency:'VND'
      })).status,409);
      await approvePr(p);const order=await po(p);
      assert.equal(order.supplierId,f.s.id);assert.equal(order.purchaseRequestId,p.id);
      assert.equal(order.items[0].quantityOrdered,10);assert.equal(Number(order.items[0].unitPrice),10);
      assert.equal(order.items[0].unit,'gram');
      assert.equal((await api('POST','/purchase-orders',{
        requestId:randomUUID(),purchaseRequestId:p.id,currency:'VND'
      })).status,409);
      await checkQty(f,0);return{purchaseRequestId:p.id,orderId:order.id,supplierId:f.s.id,price:10};
    });

    await caseTest('NH-05','Supplier dispatch sandbox is auditable; real send is NOT_VERIFIED',async()=>{
      const f=await fixture('dispatch');const p=await pr(f);await approvePr(p);const order=await po(p);
      assert.equal((await api('PATCH','/purchase-requests/'+p.id+'/mark-sent',{})).status,409);
      const sent=ok(await dispatch(order,'SANDBOX'));
      assert.equal(sent.order.status,'SANDBOX_SENT');assert.equal(sent.externalDelivery,'NOT_VERIFIED');
      const audit=sent.order.events.find(e=>e.type==='DISPATCH');
      assert.ok(audit);assert.equal(audit.details.realSupplierContacted,false);
      assert.equal((await db.purchaseRequest.findUniqueOrThrow({where:{id:p.id}})).status,'APPROVED');
      await checkQty(f,0);
      return{orderId:order.id,adapter:'NO_NETWORK_TEST_ONLY',external:'NOT_VERIFIED'};
    });

    await caseTest('NH-06','Unknown dispatch and controlled resend preserve attempt history without a second PO',async()=>{
      const f=await fixture('timeout');const p=await pr(f);await approvePr(p);const order=await po(p);
      const key=randomUUID();
      const uncertain=ok(await dispatch(order,'UNKNOWN',key));
      assert.equal(uncertain.order.status,'DISPATCH_UNKNOWN');
      assert.equal((await api('POST','/purchase-orders/'+order.id+'/cancel',{
        requestId:randomUUID(),reason:run+' unsafe cancellation while external status unknown'
      })).status,409);
      const replay=ok(await dispatch(order,'UNKNOWN',key));
      assert.equal(replay.replayed,true);
      const retried=ok(await dispatch(order,'SANDBOX'));
      assert.equal(retried.order.events.filter(e=>e.type==='DISPATCH').length,2);
      assert.equal(await db.purchaseOrder.count({where:{purchaseRequestId:p.id}}),1);
      return{orderId:order.id,attempts:2,external:'NOT_VERIFIED'};
    });

    await caseTest('NH-07','Signed ADMIN manual confirmation persists provenance, but external origin is not verified',async()=>{
      const f=await fixture('confirm');const p=await pr(f);await approvePr(p);const order=await po(p);
      const body={requestId:randomUUID(),reason:run+' supplier call noted',
        evidenceReference:run+' manual phone note'};
      assert.equal((await api('POST','/purchase-orders/'+order.id+'/confirm',body,staff)).status,403);
      const first=ok(await api('POST','/purchase-orders/'+order.id+'/confirm',body));
      assert.equal(first.order.status,'CONFIRMED');assert.ok(first.order.confirmedAt);
      assert.equal(first.externalConfirmation,'ADMIN_ATTESTATION_NOT_INDEPENDENTLY_VERIFIED');
      assert.equal(ok(await api('POST','/purchase-orders/'+order.id+'/confirm',body)).replayed,true);
      assert.equal((await api('POST','/purchase-orders/'+order.id+'/confirm',{
        ...body,reason:'CHANGED'
      })).status,409);
      await checkQty(f,0);
      return{orderId:order.id,confirmationSource:first.order.confirmationSource,external:'NOT_VERIFIED'};
    });

    await caseTest('NH-08','Supplier rejects PO, audited replacement supplier chosen and old PO preserved',async()=>{
      const f=await fixture('supplier-reject');const p=await pr(f);
      const s2=await supplier('supplier-reject-alt');await mapSupplier(s2,f.i);
      await approvePr(p);const original=await po(p);
      const rejected=ok(await api('POST','/purchase-orders/'+original.id+'/reject',{
        requestId:randomUUID(),reason:run+' vendor cannot supply',
        evidenceReference:run+' supplier refusal'
      }));
      assert.equal(rejected.order.status,'REJECTED');
      const chosen=ok(await api('POST','/purchase-requests/'+p.id+'/select-supplier',{
        requestId:randomUUID(),supplierId:s2.id,reason:run+' alternate supplier'
      }));
      assert.equal(chosen.request.supplierId,s2.id);
      const alternate=await po(p);assert.equal(alternate.supplierId,s2.id);
      assert.equal((await db.purchaseOrder.findUniqueOrThrow({where:{id:original.id}})).status,'REJECTED');
      assert.equal(await db.purchaseOrder.count({where:{purchaseRequestId:p.id}}),2);
      await checkQty(f,0);return{oldOrderId:original.id,newOrderId:alternate.id,newSupplier:s2.id};
    });

    await caseTest('NH-09','Exact physical receipt creates GoodsReceipt, IngredientBatch and signed IMPORT once',async()=>{
      const f=await ready('exact');
      const legacyBypass=await api('PATCH','/purchase-requests/'+f.p.id+'/receive',{
        idempotencyKey:randomUUID(),items:[{purchaseRequestItemId:f.p.items[0].id,
          receivedQuantity:10,batches:[{batchCode:run+'-legacy-bypass',
            expirationDate:'2099-01-01',quantity:10}]}]
      });
      assert.equal(legacyBypass.status,409,'Legacy direct receipt bypassed PO guards.');
      ok(await receipt(f.order,10),201);
      const state=await checkQty(f,10);
      const dbPo=await db.purchaseOrder.findUniqueOrThrow({where:{id:f.order.id},include:{items:true,receipts:true}});
      assert.equal(dbPo.status,'RECEIVED');assert.equal(dbPo.items[0].quantityReceived,10);
      assert.equal(dbPo.receipts.length,1);assert.equal(state.batches.length,1);
      assert.equal(state.batches[0].goodsReceiptId,dbPo.receipts[0].id);
      assert.equal(state.ledger.filter(x=>x.type==='IMPORT'&&x.referenceId===dbPo.receipts[0].id).length,1);
      return{orderId:f.order.id,receiptId:dbPo.receipts[0].id,physicalQty:10,
        legacyBypassDenied:409};
    });

    await caseTest('NH-10','Under-delivery preserves remaining quantity, accepts later receipt',async()=>{
      const f=await ready('partial');ok(await receipt(f.order,3),201);
      let dbPo=await db.purchaseOrder.findUniqueOrThrow({where:{id:f.order.id},include:{items:true}});
      assert.equal(dbPo.status,'PARTIALLY_RECEIVED');assert.equal(dbPo.items[0].quantityReceived,3);
      await checkQty(f,3);
      ok(await receipt(f.order,7),201);
      dbPo=await db.purchaseOrder.findUniqueOrThrow({where:{id:f.order.id},include:{items:true,receipts:true}});
      assert.equal(dbPo.status,'RECEIVED');assert.equal(dbPo.items[0].quantityReceived,10);
      assert.equal(dbPo.receipts.length,2);await checkQty(f,10);
      return{orderId:f.order.id,shipments:2,received:10,remaining:0};
    });

    await caseTest('NH-11','Over-delivery discrepancy records observed/accepted/rejected; unauthorized excess not imported',async()=>{
      const f=await ready('over');
      const detected=ok(await api('POST','/purchase-orders/'+f.order.id+'/discrepancies',{
        requestId:randomUUID(),purchaseOrderItemId:f.order.items[0].id,
        category:'OVER_DELIVERY',observedQuantity:12,
        acceptedQuantity:10,rejectedQuantity:2,reason:run+' over supply'
      },staff),201);
      assert.equal(Number(detected.discrepancy.rejectedQuantity),2);
      await checkQty(f,0);
      assert.ok((await receipt(f.order,12)).status>=400);
      ok(await receipt(f.order,10),201);await checkQty(f,10);
      assert.equal((await db.purchaseDeliveryDiscrepancy.count({where:{purchaseOrderId:f.order.id}})),1);
      return{orderId:f.order.id,observed:12,accepted:10,rejected:2,imported:10};
    });

    await caseTest('NH-12','Wrong ingredient delivery recorded separately; no substitution or stock import',async()=>{
      const f=await ready('wrong');const other=await ingredient('wrong-other');
      const logged=ok(await api('POST','/purchase-orders/'+f.order.id+'/discrepancies',{
        requestId:randomUUID(),purchaseOrderItemId:f.order.items[0].id,
        category:'WRONG_INGREDIENT',observedIngredientId:other.id,
        observedQuantity:10,acceptedQuantity:0,rejectedQuantity:10,
        reason:run+' observed wrong ingredient'
      },staff),201);
      assert.equal(logged.discrepancy.observedIngredientId,other.id);
      await checkQty(f,0);
      assert.equal((await db.inventoryTransaction.count({where:{ingredientId:other.id}})),0);
      assert.equal((await db.goodsReceipt.count({where:{purchaseOrderId:f.order.id}})),0);
      return{orderId:f.order.id,wrongIngredientId:other.id,imports:0};
    });

    await caseTest('NH-13','Damaged delivery remains held/rejected before physical acceptance',async()=>{
      const f=await ready('damage');
      const row=ok(await api('POST','/purchase-orders/'+f.order.id+'/discrepancies',{
        requestId:randomUUID(),purchaseOrderItemId:f.order.items[0].id,
        category:'DAMAGED',observedQuantity:4,acceptedQuantity:0,
        rejectedQuantity:4,reason:run+' photo evidence damaged',
        evidence:{type:'TEST_FIXTURE',reference:run}
      },staff),201);
      assert.equal(row.discrepancy.status,'HELD');
      await checkQty(f,0);return{orderId:f.order.id,damaged:4,imported:0};
    });

    await caseTest('NH-14','Unapproved shelf-life tolerance is held; expired shipment rejected before import',async()=>{
      const f=await ready('expiry');
      const hold=ok(await api('POST','/purchase-orders/'+f.order.id+'/discrepancies',{
        requestId:randomUUID(),purchaseOrderItemId:f.order.items[0].id,
        category:'SHELF_LIFE',observedQuantity:10,acceptedQuantity:0,
        rejectedQuantity:10,reason:run+' minimum remaining shelf-life policy unknown'
      },staff),201);
      assert.equal(hold.discrepancy.status,'HELD');
      const outdated=receiptBody(f.order,10);
      outdated.items[0].batches[0].expirationDate='2001-01-01T00:00:00.000Z';
      assert.equal((await receipt(f.order,10,outdated)).status,400);
      await checkQty(f,0);
      return{orderId:f.order.id,status:'HELD',minimumShelfLife:'BLOCKED_POLICY',expiryRejected:true};
    });

    await caseTest('NH-15','Multiple deliveries create distinct receipts and lots, preserving earlier history',async()=>{
      const f=await ready('deliveries');
      for(const quantity of [3,4,3]) ok(await receipt(f.order,quantity),201);
      const state=await checkQty(f,10);
      assert.equal(state.batches.length,3);
      const poDb=await db.purchaseOrder.findUniqueOrThrow({where:{id:f.order.id},include:{receipts:true}});
      assert.equal(poDb.receipts.length,3);
      assert.equal(new Set(poDb.receipts.map(r=>r.id)).size,3);
      assert.equal(poDb.status,'RECEIVED');
      return{orderId:f.order.id,receipts:poDb.receipts.map(r=>r.id),total:10};
    });

    await caseTest('NH-16','Competing real HTTP receipts serialize; one cannot exceed PO remaining; identical replay safe',async()=>{
      const f=await ready('concurrency');
      const a=receiptBody(f.order,7),b=receiptBody(f.order,7);
      const route='/purchase-orders/'+f.order.id+'/receipts';
      const racing=await lockOverlap(f.p.id,[
        ()=>api('POST',route,a,staff),()=>api('POST',route,b,staff)
      ]);
      assert.equal(racing.results.filter(r=>r.status===201).length,1);
      assert.equal(racing.results.filter(r=>r.status>=400).length,1);
      const accepted=racing.results.find(r=>r.status===201);
      const acceptedBody=accepted.body;
      const repeated=ok(await api('POST',route,acceptedBody,staff),201);
      assert.equal(repeated.replayed,true);
      const dbPo=await db.purchaseOrder.findUniqueOrThrow({where:{id:f.order.id},include:{items:true,receipts:true}});
      assert.equal(dbPo.items[0].quantityReceived,7);assert.equal(dbPo.receipts.length,1);
      await checkQty(f,7);
      return{orderId:f.order.id,waiting:racing.waiting,
        statuses:racing.results.map(r=>r.status),receiptCount:1,remaining:3};
    });

    await caseTest('NH-17','Cancel created PO with reason and zero stock change; subsequent receipt forbidden',async()=>{
      const f=await fixture('cancel');const p=await pr(f);await approvePr(p);const order=await po(p);
      const denied=ok(await api('POST','/purchase-orders/'+order.id+'/cancel',{
        requestId:randomUUID(),reason:run+' no longer required'
      }));
      assert.equal(denied.order.status,'CANCELLED');
      assert.ok(denied.order.cancelledAt);assert.equal(denied.order.cancelledById,adminUser.id);
      assert.ok((await receipt(order,1)).status>=400);
      await checkQty(f,0);
      return{orderId:order.id,status:'CANCELLED',imported:0};
    });

    await caseTest('NH-18','Partially received PO blocks unsafe cancellation and holds outstanding pending approved policy',async()=>{
      const f=await ready('partial-cancel');
      ok(await receipt(f.order,3),201);
      const earlier=await current(f);
      assert.equal((await api('POST','/purchase-orders/'+f.order.id+'/cancel',{
        requestId:randomUUID(),reason:run+' cancel remaining'
      })).status,409);
      assert.equal((await api('POST','/purchase-orders/'+f.order.id+'/cancel',{
        requestId:randomUUID(),reason:run+' supplier confirmed cancellation',
        supplierEvidenceReference:run+' cancellation evidence'
      })).status,409);
      const done=ok(await api('POST','/purchase-orders/'+f.order.id+'/request-cancel',{
        requestId:randomUUID(),reason:run+' request cancellation of outstanding qty',
        supplierEvidenceReference:run+' unverified manual record'
      }));
      assert.equal(done.order.status,'CANCELLATION_PENDING');
      assert.equal(done.remainingCancellation,'BLOCKED_POLICY');
      assert.equal(done.order.items[0].quantityReceived,3);
      assert.equal(done.order.events.find(x=>x.type==='CANCELLATION_REQUESTED').details.existingAccepted[0].outstandingQty,7);
      assert.ok((await receipt(f.order,7)).status>=400);
      assert.equal(stringify(await current(f)),stringify(earlier));
      return{orderId:f.order.id,received:3,outstandingOnHold:7,
        cancellationStatus:'BLOCKED_POLICY',physicalQty:3};
    });

    await caseTest('NH-19','Source-linked supplier RETURN_OUT and credit UNSETTLED; duplicate/concurrent returns cannot overdraw',async()=>{
      const f=await ready('return');ok(await receipt(f.order,10),201);
      const before=await checkQty(f,10),lot=before.batches[0];
      const stk=ok(await api('POST','/stocktakes',{
        requestId:randomUUID(),ingredientIds:[f.i.id],assignedCounterId:staffUser.id,
        note:run+' supplier return and stocktake coexistence'
      },staff),201);
      const id=randomUUID(),body={requestId:id,goodsReceiptId:lot.goodsReceiptId,batchId:lot.id,
        quantity:4,reason:run+' returned unused damaged supplier goods'};
      const first=ok(await api('POST','/purchase-orders/'+f.order.id+'/returns',body),201);
      assert.equal(first.supplierCredit,'UNSETTLED');
      assert.equal(ok(await api('POST','/purchase-orders/'+f.order.id+'/returns',body),201).replayed,true);
      let after=await checkQty(f,6);
      assert.equal(after.ledger.filter(x=>x.type==='RETURN_OUT').length,1);
      assert.equal(Number(after.ledger.find(x=>x.type==='RETURN_OUT').quantity),-4);
      const bodyA={...body,requestId:randomUUID(),quantity:5};
      const bodyB={...body,requestId:randomUUID(),quantity:5};
      const race=await lockOverlap(f.p.id,[
        ()=>api('POST','/purchase-orders/'+f.order.id+'/returns',bodyA),
        ()=>api('POST','/purchase-orders/'+f.order.id+'/returns',bodyB)
      ]);
      assert.deepEqual(race.results.map(x=>x.status).sort(),[201,409]);
      after=await checkQty(f,1);
      assert.equal(after.ledger.filter(x=>x.type==='RETURN_OUT').length,2);
      const stocktake=ok(await api('GET','/stocktakes/'+stk.session.id,undefined,staff));
      const entry=stocktake.entries.find(e=>e.batchId===lot.id);
      assert.ok(entry);
      const counted=ok(await api('POST','/stocktakes/'+stk.session.id+'/entries',{
        requestId:randomUUID(),batchId:lot.id,expectedCursor:stocktake.current[0].cursor,
        expectedRevision:0,actualQty:1,
        reason:run+' return physically counted once',reasonCategory:'COUNTED'
      },staff));
      assert.equal(counted.entries[0].varianceQty,'0');
      ok(await api('POST','/stocktakes/'+stk.session.id+'/submit',{requestId:randomUUID()},staff));
      const confirmed=ok(await api('POST','/stocktakes/'+stk.session.id+'/approve',{requestId:randomUUID()}));
      assert.equal(confirmed.session.status,'COMPLETED');
      assert.equal((await db.inventoryTransaction.count({where:{
        ingredientId:f.i.id,referenceType:'Stocktake'
      }})),0);
      return{orderId:f.order.id,originalReceiptId:lot.goodsReceiptId,remaining:1,
        lockWaiters:race.waiting,concurrentStatuses:race.results.map(x=>x.status),
        supplierCredit:'UNSETTLED',stocktakeId:stk.session.id,
        supplierReturnReconciledByStocktake:true};
    });

    await caseTest('NH-20','Invoice mismatch persists dispute, keeps approved PO prices and payment untouched',async()=>{
      const f=await ready('invoice');ok(await receipt(f.order,10),201);
      const currentPo=ok(await api('GET','/purchase-orders/'+f.order.id));
      const price=Number(currentPo.items[0].unitPrice);
      const reconciled=ok(await api('POST','/purchase-orders/'+f.order.id+'/invoices/reconcile',{
        requestId:randomUUID(),invoiceNumber:run+'-invoice-different',currency:'USD',
        items:[{purchaseOrderItemId:currentPo.items[0].id,
          ingredientId:f.i.id,quantity:9,unit:'kg',unitPrice:12,total:108}]
      }),201);
      assert.equal(reconciled.reconciliation.status,'DISPUTED');
      assert.ok(reconciled.reconciliation.differences.length>=3);
      assert.equal(reconciled.financialApproval,'NOT_GRANTED');
      assert.equal(Number((await db.purchaseOrderItem.findUniqueOrThrow({
        where:{id:currentPo.items[0].id}})).unitPrice),price);
      assert.equal((await db.purchaseRequest.findUniqueOrThrow({where:{id:f.p.id}})).paymentStatus,'UNPAID');
      return{orderId:f.order.id,differences:reconciled.reconciliation.differences.map(d=>d.field),
        invoiceStatus:'DISPUTED',payment:'UNPAID'};
    });

    await caseTest('NH-21','Concurrent duplicate demand source serialized, one PR created and replay idempotent',async()=>{
      const f=await fixture('duplicate');
      const request={supplierId:f.s.id,demandSourceKey:run+'-stock-shortage',
        items:[{ingredientId:f.i.id,quantity:10,unitPrice:10}],
        notes:run+' same underlying shortage'};
      const racing=await advisoryOverlap(f.i.id,[
        ()=>api('POST','/purchase-requests',request),
        ()=>api('POST','/purchase-requests',request)
      ]);
      assert.deepEqual(racing.results.map(x=>x.status).sort(),[201,201]);
      const ids=racing.results.map(x=>x.response.data.purchaseRequest.id);
      assert.equal(new Set(ids).size,1);
      assert.equal((await db.purchaseRequest.count({where:{demandSourceKey:request.demandSourceKey}})),1);
      assert.equal((await api('POST','/purchase-requests',{
        ...request,items:[{...request.items[0],quantity:11}]
      })).status,409);
      const distinctDemand=await api('POST','/purchase-requests',{
        ...request,demandSourceKey:run+'-different-legitimate-shortage',
        notes:run+' distinct event for the same ingredient',
        items:[{...request.items[0],quantity:2}]
      },staff);
      assert.ok(distinctDemand.status>=400);
      assert.equal((await db.purchaseRequest.count({where:{
        demandSourceKey:run+'-different-legitimate-shortage'
      }})),0,'Unapproved independent demand must not merge or create a new commitment.');
      await checkQty(f,0);
      return{purchaseRequestId:ids[0],waiters:racing.waiting,
        createdOnce:true,concurrentStatuses:racing.results.map(x=>x.status),
        distinctDemandStatus:distinctDemand.status,
        separateDemandConsolidation:'BLOCKED_POLICY'};
    });

    await caseTest('NH-22','No eligible Supplier -> actual pending PR hold, later ADMIN maps and assigns supplier safely',async()=>{
      const i=await ingredient('no-supplier');
      const listed=ok(await api('GET','/purchase-requests/ingredients/'+i.id+'/eligible-suppliers'));
      assert.equal(listed.status,'NEEDS_SUPPLIER');
      const pending=ok(await api('POST','/purchase-requests/sourcing-holds',{
        requestId:randomUUID(),ingredientId:i.id,quantity:10,
        reason:run+' supplier not yet eligible'
      },staff),201).request;
      assert.equal(pending.supplierId,null);assert.equal(pending.status,'PENDING');
      assert.equal((await api('PATCH','/purchase-requests/'+pending.id+'/approve',{})).status,409);
      assert.equal(await db.purchaseOrder.count({where:{purchaseRequestId:pending.id}}),0);
      const s=await supplier('no-supplier-later');await mapSupplier(s,i);
      const assigned=ok(await api('POST','/purchase-requests/'+pending.id+'/assign-supplier',{
        requestId:randomUUID(),supplierId:s.id,reason:run+' authorized supplier review'
      }));
      assert.equal(assigned.request.supplierId,s.id);
      const approved=await approvePr({id:pending.id});
      assert.equal(approved.purchaseRequest.status,'APPROVED');
      const created=await po({id:pending.id});assert.equal(created.supplierId,s.id);
      assert.equal(Number((await db.ingredient.findUniqueOrThrow({where:{id:i.id}})).quantity),0);
      return{requestId:pending.id,recoveredFrom:'NO_ELIGIBLE_SUPPLIER',
        assignedSupplierId:s.id,purchaseOrderId:created.id,physicalQty:0};
    });
    if (process.env.PURCHASING_EXTENDED_CASES === 'YES') {
      await caseTest('NH-05R','No-network dispatch identity persists, UNKNOWN cannot issue a duplicate external send',async()=>{
        const f=await fixture('dispatch-r'),p=await pr(f);await approvePr(p);const order=await po(p);
        const requestId=randomUUID();
        const first=ok(await dispatch(order,'UNKNOWN',requestId));
        assert.equal(first.order.dispatchAttempts.length,1);
        assert.equal(first.order.dispatchAttempts[0].providerStatus,'UNKNOWN');
        assert.equal(first.order.dispatchAttempts[0].providerReference,null);
        assert.equal(ok(await dispatch(order,'UNKNOWN',requestId)).replayed,true);
        assert.equal((await dispatch(order,'UNKNOWN')).status,409);
        const safe=ok(await dispatch(order,'SANDBOX'));
        assert.equal(safe.order.dispatchAttempts.length,2);
        assert.equal(safe.order.dispatchAttempts[0].dispatchIdentity,
          safe.order.dispatchAttempts[1].dispatchIdentity);
        assert.match(safe.order.dispatchAttempts[1].providerReference,/^no-network:/);
        assert.equal(await db.purchaseOrder.count({where:{purchaseRequestId:p.id}}),1);
        return{poId:order.id,attempts:2,externalDelivery:'NOT_VERIFIED'};
      });
      await caseTest('NH-07R','Supplier evidence is sourced, rejects stale times and remains externally unverified',async()=>{
        const f=await fixture('evidence-r'),p=await pr(f);await approvePr(p);const order=await po(p);
        const base={requestId:randomUUID(),reason:run+' supplier note',
          evidenceReference:run+' evidence ref',source:'SUPPLIER_DOCUMENT',
          sourceIdentity:run+' external contact'};
        const stale={...base,observedAt:new Date(new Date(order.createdAt).getTime()-60000).toISOString()};
        assert.equal((await api('POST','/purchase-orders/'+order.id+'/confirm',stale)).status,409);
        assert.equal(await db.purchaseSupplierEvidence.count({where:{purchaseOrderId:order.id}}),0);
        const body={...base,observedAt:new Date().toISOString()};
        const confirmed=ok(await api('POST','/purchase-orders/'+order.id+'/confirm',body));
        assert.equal(confirmed.order.status,'CONFIRMED');
        assert.equal(confirmed.order.supplierEvidence[0].verificationStatus,'NOT_VERIFIED_EXTERNAL');
        assert.equal(ok(await api('POST','/purchase-orders/'+order.id+'/confirm',body)).replayed,true);
        assert.equal((await api('POST','/purchase-orders/'+order.id+'/confirm',
          {...body,requestId:randomUUID()})).status,409);
        await checkQty(f,0);
        return{poId:order.id,externalEvidence:'NOT_VERIFIED_EXTERNAL'};
      });
      await caseTest('NH-11R','Overdelivery amendment is traceable and cannot auto-expand approved quantity',async()=>{
        const f=await ready('over-r');
        const item=f.order.items[0];
        const held=ok(await api('POST','/purchase-orders/'+f.order.id+'/discrepancies',{
          requestId:randomUUID(),purchaseOrderItemId:item.id,category:'OVER_DELIVERY',
          observedQuantity:12,acceptedQuantity:10,rejectedQuantity:2,reason:run+' held excess'
        },staff),201).discrepancy;
        const body={requestId:randomUUID(),discrepancyId:held.id,
          requestedExtraQuantity:2,reason:run+' admin amendment request'};
        const amend=ok(await api('POST','/purchase-orders/'+f.order.id+'/overdelivery-amendments',body),201);
        assert.equal(amend.amendment.status,'PENDING_POLICY');
        assert.equal(ok(await api('POST','/purchase-orders/'+f.order.id+'/overdelivery-amendments',body),201).replayed,true);
        assert.equal((await api('POST','/purchase-orders/'+f.order.id+'/overdelivery-amendments',
          {...body,requestId:randomUUID()})).status,409);
        const saved=await db.purchaseOrderItem.findUniqueOrThrow({where:{id:item.id}});
        assert.equal(saved.quantityOrdered,10);
        await checkQty(f,0);
        return{poId:f.order.id,excessAcceptance:'BLOCKED_POLICY'};
      });
      await caseTest('NH-14R','Ingredient shelf-life draft holds short-dated receipt with zero stock mutation',async()=>{
        const f=await ready('shelf-r');
        const policy=ok(await api('POST','/purchase-requests/shelf-life-rules',{
          requestId:randomUUID(),ingredientId:f.i.id,minRemainingDays:90,
          reason:run+' draft minimum shelf life'
        }),201);
        assert.equal(policy.rule.status,'DRAFT');
        const short=receiptBody(f.order,10);
        short.items[0].batches[0].expirationDate=new Date(Date.now()+5*86400000).toISOString();
        assert.equal((await receipt(f.order,10,short)).status,409);
        await checkQty(f,0);
        assert.equal(await db.goodsReceipt.count({where:{purchaseOrderId:f.order.id}}),0);
        const good=ok(await receipt(f.order,10),201);
        assert.equal(good.order.status,'RECEIVED');
        await checkQty(f,10);
        return{poId:f.order.id,policyStatus:'BLOCKED_POLICY',draftId:policy.rule.id};
      });
      await caseTest('NH-18R','Cancellation resolution adds evidence and preserves received inventory',async()=>{
        const f=await ready('cancel-r');ok(await receipt(f.order,3),201);
        ok(await api('POST','/purchase-orders/'+f.order.id+'/request-cancel',{
          requestId:randomUUID(),reason:run+' remainder cancellation requested'
        }));
        const body={requestId:randomUUID(),decision:'SUPPLIER_ACKNOWLEDGED',
          reason:run+' supplier claimed acknowledgement',evidenceReference:run+' paper claim'};
        const pending=ok(await api('POST','/purchase-orders/'+f.order.id+'/cancellation-resolution',body),201);
        assert.equal(pending.order.status,'CANCELLATION_PENDING');
        assert.equal(pending.finalCommitment,'BLOCKED_POLICY');
        assert.equal(ok(await api('POST','/purchase-orders/'+f.order.id+'/cancellation-resolution',body),201).replayed,true);
        await checkQty(f,3);
        return{poId:f.order.id,resolution:'BLOCKED_POLICY'};
      });
      await caseTest('NH-21R','Independent demand sources retain PRs and require explicit ADMIN grouping',async()=>{
        const f=await fixture('sources-r');
        const a=await pr(f,10,{demandSourceKey:run+'-independent-a'});
        const b=await pr(f,5,{demandSourceKey:run+'-independent-b'});
        assert.notEqual(a.id,b.id);
        const body={requestId:randomUUID(),purchaseRequestIds:[a.id,b.id],
          reason:run+' explicit admin grouping'};
        assert.equal((await api('POST','/purchase-requests/demand-aggregations',body,staff)).status,403);
        const group=ok(await api('POST','/purchase-requests/demand-aggregations',body),201);
        assert.equal(group.aggregation.status,'ADMIN_GROUPING_APPROVED_PENDING_POLICY');
        assert.equal(group.aggregation.members.length,2);
        assert.equal(ok(await api('POST','/purchase-requests/demand-aggregations',body),201).replayed,true);
        assert.equal((await api('PATCH','/purchase-requests/'+a.id+'/approve',{})).status,409);
        assert.equal(await db.purchaseRequest.count({where:{id:{in:[a.id,b.id]},status:'PENDING'}}),2);
        await checkQty(f,0);
        return{sourcePRs:[a.id,b.id],groupId:group.aggregation.id,merge:'BLOCKED_POLICY'};
      });
    }
  }catch(error){out.blocker=error.stack??error.message;process.exitCode=2;
    console.error('PRECONDITION',error.message);
  }finally{
    out.finishedAt=new Date().toISOString();save();await db.$disconnect();
  }
  if(out.scenarios.some(s=>s.verdict!=='PASS')) process.exitCode=1;
}
main().catch(error=>{console.error(error.stack);process.exitCode=2;});
