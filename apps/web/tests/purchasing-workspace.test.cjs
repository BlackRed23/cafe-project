const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
function load(relative,mocks){
  const script=ts.transpileModule(fs.readFileSync(path.join(root,relative),'utf8'),{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}
  }).outputText;
  const m={exports:{}};
  new Function('require','module','exports',script)((name)=>{assert.ok(name in mocks,name);return mocks[name];},m,m.exports);
  return m.exports;
}
test('Purchasing API uses verified endpoints and retains supplied request UUID for every mutation',async()=>{
  const calls=[];
  const apiClient={get:async(...args)=>{calls.push(['GET',...args]);return{data:{data:{id:'po'}}};},
    post:async(...args)=>{calls.push(['POST',...args]);return{data:{data:{order:{id:'po'}}}};}};
  const api=load('src/api/purchasing.api.ts',{'./client':{apiClient,unwrapApiData:v=>v.data}}).purchasingApi;
  await api.getOrder('a/b');assert.equal(calls.at(-1)[1],'/purchase-orders/a%2Fb');
  const create={requestId:'stable',purchaseRequestId:'pr',currency:'VND'};
  await api.createOrder(create);assert.deepEqual(calls.at(-1),['POST','/purchase-orders',create]);
  const dispatch={requestId:'stable',mode:'SANDBOX',reason:'test'};
  await api.dispatch('po',dispatch);assert.deepEqual(calls.at(-1),['POST','/purchase-orders/po/dispatch',dispatch]);
  const decision={requestId:'stable',reason:'evidence',evidenceReference:'doc'};
  for(const action of ['confirm','reject']){await api.decision('po',action,decision);assert.equal(calls.at(-1)[1],`/purchase-orders/po/${action}`);}
  for(const action of ['cancel','request-cancel']){await api.cancellation('po',action,dispatch);assert.equal(calls.at(-1)[1],`/purchase-orders/po/${action}`);}
  const receipt={requestId:'stable',items:[{purchaseOrderItemId:'line',receivedQuantity:3,batches:[
    {batchCode:'a',expirationDate:'2027-01-01T00:00:00.000Z',quantity:1},
    {batchCode:'b',expirationDate:'2027-01-01T00:00:00.000Z',quantity:2}]}]};
  await api.receipt('po',receipt);assert.deepEqual(calls.at(-1),['POST','/purchase-orders/po/receipts',receipt]);
  for(const [method,endpoint] of [['discrepancy','discrepancies'],['supplierReturn','returns'],['invoice','invoices/reconcile']]){
    await api[method]('po',{requestId:'stable'});assert.equal(calls.at(-1)[1],`/purchase-orders/po/${endpoint}`);
  }
  await api.eligibleSuppliers('ing');assert.equal(calls.at(-1)[1],'/purchase-requests/ingredients/ing/eligible-suppliers');
  await api.sourcingHold({requestId:'stable',ingredientId:'ing',quantity:1,reason:'unavailable'});
  assert.equal(calls.at(-1)[1],'/purchase-requests/sourcing-holds');
  await api.supplierAction('pr','assign-supplier',{requestId:'stable',supplierId:'supplier',reason:'mapping'});
  assert.equal(calls.at(-1)[1],'/purchase-requests/pr/assign-supplier');
});
test('UX preserves immutability, role restrictions, HELD and no supplier/payment claim',()=>{
  const text=fs.readFileSync(path.join(root,'src/pages/admin/AdminPurchasingWorkspace.tsx'),'utf8');
  assert.match(text,/isAdmin&&/);
  assert.match(text,/isStaff\|\|isAdmin/);
  assert.match(text,/pending\.body/);
  assert.match(text,/execute\(pending\)/);
  assert.match(text,/Không gửi lại bằng mã yêu cầu mới/);
  assert.match(text,/Đã ghi nhận sai lệch giao hàng \(HELD\)/);
  assert.match(text,/UNSETTLED/);
  assert.match(text,/DISPUTED/);
  assert.match(text,/không thanh toán/);
  assert.match(text,/quantityReceived/);
  assert.match(text,/batches\.reduce/);
});
test('Legacy PR now requires eligible supplier and persists demand source across ambiguous requests',()=>{
  const page=fs.readFileSync(path.join(root,'src/pages/admin/AdminPurchaseRequestsPage.tsx'),'utf8');
  const adapter=fs.readFileSync(path.join(root,'src/api/purchaseRequests.api.ts'),'utf8');
  assert.match(page,/purchasingApi\.eligibleSuppliers/);
  assert.match(page,/eligibility\?\.eligible\.some/);
  assert.match(page,/createIntent\.current\s*=\s*payload/);
  assert.match(page,/demandSourceKey:.*crypto\.randomUUID/);
  assert.match(page,/unitPrice/);
  assert.match(adapter,/demandSourceKey\?: string/);
});
