const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => { assert.ok(name in mocks, name); return mocks[name]; }, module, module.exports);
  return module.exports;
}
const helper = load('src/pages/admin/lotFeedback.ts');
const batch = { id:'b', ingredientId:'i', batchCode:'B', qualityStatus:'QUARANTINED', expiryStatus:'VALID', physicalQuantity:10, usableQuantity:0, quantityInitial:'10', quantityRemaining:'10', depletionStatus:'REMAINING' };
const source = { id:'s', batchId:'b', ingredientId:'i', type:'CONSUME', quantity:'-3', createdAt:'2026-11-18T00:00:00Z' };
const trace = { batch, events:[], outbound:[source], orders:[], orderItems:[], returns:[] };
test('Lot adapter unwraps object envelope, encodes provenance paths, preserves response/replay', async () => {
  const calls=[]; let value={ evaluatedAt:'2026-11-18T00:00:00Z',warningDays:7,ingredient:{id:'i'},batches:[batch] };
  const client={ get:async (...args)=>{calls.push(['get',...args]);return{data:{success:true,data:value}};},post:async(...args)=>{calls.push(['post',...args]);return{data:{success:true,data:value}};} };
  const api=load('src/api/ingredient-batches.api.ts',{'./client':{apiClient:client}}).ingredientBatchesApi;
  assert.equal((await api.listLots('i/a')).batches[0],batch);assert.deepEqual(calls.at(-1),['get','/ingredients/i%2Fa/batches']);
  value=trace;assert.equal(await api.traceLot('i/a','b/c'),trace);assert.equal(calls.at(-1)[1],'/ingredients/i%2Fa/batches/b%2Fc/trace');
  value={event:{id:'e'},replayed:true};const payload={requestId:'uuid',reason:'damage'};
  await api.transitionLot('i','b','quarantine',payload);assert.deepEqual(calls.at(-1),['post','/ingredients/i/batches/b/quarantine',payload]);
  await api.transitionLot('i','b','recall',payload);assert.equal(calls.at(-1)[1],'/ingredients/i/batches/b/recall');
  const returned={...payload,batchId:'b',sourceTransactionId:'s',quantity:1,quality:'UNKNOWN'};
  assert.equal((await api.returnLot('i',returned)).replayed,true);assert.deepEqual(calls.at(-1),['post','/ingredients/i/returns',returned]);
  for(const malformed of [[],null,{batches:[]},{evaluatedAt:'bad',warningDays:7,ingredient:{},batches:[]}]) { value=malformed;await assert.rejects(api.listLots('i')); }
  value={};await assert.rejects(api.traceLot('i','b'));
  assert.ok(api.getAll && api.getById && api.getExpiring && api.getTransactions,'legacy consumers preserved');
});
test('Quality and server expiry filter independently; unknown never inferred safe; depletion retained',()=>{
  const values=[batch,{...batch,id:'u',qualityStatus:'UNKNOWN',expiryStatus:'NO_EXPIRY'},{...batch,id:'d',qualityStatus:'AVAILABLE',expiryStatus:'EXPIRED',depletionStatus:'DEPLETED'}];
  assert.equal(helper.filterLots(values,'','').length,3);
  assert.deepEqual(helper.filterLots(values,'QUARANTINED','VALID').map(b=>b.id),['b']);
  assert.equal(helper.filterLots(values,'AVAILABLE','NO_EXPIRY').length,0);
  assert.equal(helper.filterLots(values,'','EXPIRED')[0].depletionStatus,'DEPLETED');
  assert.equal(values[0].usableQuantity,0);assert.equal(helper.lotNumber('2.125'),'2,125');
});
test('Return cap derives exact source consumption minus accepted returns, rejects malformed and excessive quantities',()=>{
  const returned=[{sourceTransactionId:'s',quantity:'1.125'},{sourceTransactionId:'other',quantity:99}];
  assert.equal(helper.returnCapacity(source,returned),1.875);
  for(const v of ['','0','-1','NaN','Infinity','1.0001','1.876']) assert.equal(helper.validReturnQuantity(v,1.875),false);
  assert.equal(helper.validReturnQuantity('1.875',1.875),true);
  for(const patch of [{type:'IMPORT'},{batchId:null},{quantity:'bad'},{quantity:1}]) assert.equal(helper.returnCapacity({...source,...patch},[]),0);
});
test('Business errors translated with actionable causes; diagnostics hidden; uncertain statuses retain intent',()=>{
  for(const [message,pattern] of [['Return exceeds unreturned quantity',/vượt/],['Request ID already used',/Mã thao tác/],['Lot has stock transactions and cannot be deleted',/không hỗ trợ xóa/],['Classify new ingredient',/phân loại/],['Return requires an original CONSUME',/không khớp/]]) assert.match(helper.lotError({response:{status:409,data:{message}}}),pattern);
  for(const status of [400,401,403,404,409,500,503]) assert.ok(!helper.lotError({response:{status,data:{message:'PRIVATE SQL STACK'}}}).includes('PRIVATE'));
  for(const status of [undefined,408,409,429,500,503]) assert.equal(helper.keepLotIntent({response:{status}}),true);
  assert.equal(helper.keepLotIntent({response:{status:400}}),false);
});
function tree(node) { return Array.isArray(node) ? node.flatMap(tree) : node && typeof node === 'object' ? [node,...tree(node.props?.children)] : []; }
function operationHarness(admin, api) {
  const slots=[];let cursor=0;const messages=[];
  const react={useState:initial=>{const k=cursor++;if(!(k in slots))slots[k]=initial;return[slots[k],v=>{slots[k]=typeof v==='function'?v(slots[k]):v;}];},useRef:initial=>{const k=cursor++;return slots[k]??={current:initial};}};
  const Button=()=>null,Input=()=>null,Modal=()=>null,Alert=()=>null;
  const component=load('src/pages/admin/LotOperations.tsx',{react,'react/jsx-runtime':require('react/jsx-runtime'),'../../api/ingredient-batches.api':{ingredientBatchesApi:api},'../../contexts/AuthContext':{useAuth:()=>({isAdmin:admin})},'../../contexts/ToastContext':{useToast:()=>({success:m=>messages.push(m),info:m=>messages.push(m)})},'../../components/common/Button':{Button},'../../components/common/Input':{Input},'../../components/common/Modal':{Modal},'../../components/common/Alert':{Alert},'./lotFeedback':helper}).LotOperations;
  const render=()=>{cursor=0;return tree(component({ingredientId:'i',trace,onRefresh:async()=>{}}));};
  const open=label=>render().find(n=>n.type===Button&&n.props.children===label).props.onClick();
  const field=(label,value)=>render().find(n=>n.type===Input&&n.props.label===label).props.onChange({target:{value}});
  const confirm=()=>render().find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});
  const submit=()=>render().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
  return{render,open,field,confirm,submit,Button,Input,Modal,messages};
}
test('STAFF has no mutation controls; ADMIN requires reason and confirmation before request',async()=>{
  const h=operationHarness(false,{});assert.equal(h.render().some(n=>n.type===h.Button&&n.props.children==='Cách ly lô'),false);
  let calls=0;const admin=operationHarness(true,{transitionLot:async()=>{calls++;}});admin.open('Cách ly lô');await admin.submit();assert.equal(calls,0);admin.field('Lý do','damage');await admin.submit();assert.equal(calls,0);
});
test('Quarantine uncertain retry locks fields, retains exact UUID/payload and prevents overlapping submissions',async()=>{
  const calls=[];let reject;
  const h=operationHarness(true,{transitionLot:async(...args)=>{calls.push(args);await new Promise((_,r)=>reject=r);}});
  h.open('Cách ly lô');h.field('Lý do','damaged');h.confirm();const first=h.submit();await h.submit();assert.equal(calls.length,1);reject(new Error('network'));await first;
  assert.ok(h.render().find(n=>n.type===h.Input&&n.props.label==='Lý do').props.disabled);
  assert.equal(h.messages.length,0,'no premature success');
  const retry=h.submit();assert.equal(calls.length,2);assert.deepEqual(calls[0],calls[1]);reject(new Error('network'));await retry;
});
test('Return uses selected original CONSUME, preserves uncertain replay and reports quarantine on confirmed success',async()=>{
  const calls=[];let fail=true;
  const h=operationHarness(true,{returnLot:async(...args)=>{calls.push(args);if(fail) throw new Error('lost');return{return:{quantity:'1',targetBatchId:'child',requestId:args[1].requestId,actorId:'admin',createdAt:'2026-11-18T00:00:00Z',reason:'return'},replayed:true};}});
  h.open('Nhận hoàn từ giao dịch gốc');let nodes=h.render();nodes.find(n=>n.type==='select'&&n.props.required).props.onChange({target:{value:'s'}});
  h.field('Số lượng hoàn (đơn vị chuẩn)','4');h.field('Lý do','return');h.confirm();await h.submit();assert.equal(calls.length,0);
  h.field('Số lượng hoàn (đơn vị chuẩn)','1');await h.submit();assert.equal(calls.length,1);fail=false;await h.submit();assert.deepEqual(calls[0],calls[1]);assert.equal(calls[1][1].batchId,'b');assert.equal(calls[1][1].sourceTransactionId,'s');assert.equal(calls[1][1].quality,'UNKNOWN');assert.match(h.messages[0],/không cộng tồn/);
});

function pageHarness(api, ingredientApi) {
  const slots=[],effects=[];let cursor=0,params=new URLSearchParams('ingredientId=i');
  const react={useState:initial=>{const k=cursor++;if(!(k in slots))slots[k]=initial;return[slots[k],v=>{slots[k]=typeof v==='function'?v(slots[k]):v;}];},useRef:initial=>{const k=cursor++;return slots[k]??={current:initial};},useCallback:fn=>fn,useEffect:fn=>{effects.push(fn);}};
  const Button=()=>null,Alert=()=>null,LotOperations=()=>null;
  const component=load('src/pages/admin/AdminIngredientBatchesPage.tsx',{react,'react/jsx-runtime':require('react/jsx-runtime'),'react-router-dom':{Link:()=>null,useSearchParams:()=>[params,v=>{params=new URLSearchParams(v);} ]},'../../api/ingredient-batches.api':{ingredientBatchesApi:api},'../../api/ingredients.api':{ingredientsApi:ingredientApi},'../../components/common/Button':{Button},'../../components/common/Alert':{Alert},'./lotFeedback':helper,'./LotOperations':{LotOperations},'./lots.css':{}}).AdminIngredientBatchesPage;
  return{render(){cursor=0;return tree(component());},async start(){const pending=effects.splice(0);for(const fn of pending)fn();await new Promise(r=>setImmediate(r));},Button,Alert};
}
test('Lot page exposes loading, server stock/expiry, historical depletion and empty filter',async()=>{
  let resolve;const snapshot={evaluatedAt:'2026-11-18T00:00:00Z',warningDays:7,ingredient:{id:'i',physicalQuantity:10,usableQuantity:0,reservedQuantity:2,availableQuantity:0},batches:[{...batch,depletionStatus:'DEPLETED'}]};
  const h=pageHarness({listLots:()=>new Promise(r=>resolve=r)},{getIngredients:async()=>[{id:'i',name:'Milk',sku:'MILK',baseUnit:'g'}]});
  h.render();await h.start();assert.ok(h.render().some(n=>n.props?.children==='Đang tải dữ liệu lô…'));
  resolve(snapshot);await new Promise(r=>setImmediate(r));let nodes=h.render();
  assert.ok(nodes.some(n=>n.props?.children==='DEPLETED · Đã cạn'));assert.ok(nodes.some(n=>n.props?.children==='Tồn vật lý'));
  const labels=nodes.filter(n=>n.type==='label');const expiry=labels.find(n=>tree(n).some(c=>c.type==='option'&&c.props.children==='Tất cả hạn dùng'));
  tree(expiry).find(n=>n.type==='select').props.onChange({target:{value:'EXPIRED'}});
  assert.ok(h.render().some(n=>n.props?.children==='Không có lô khớp bộ lọc.'));
});
test('Lot page load failure preserves business feedback and exposes retry',async()=>{
  const h=pageHarness({listLots:async()=>{throw{response:{status:403}};}},{getIngredients:async()=>[]});h.render();await h.start();const nodes=h.render();assert.ok(nodes.some(n=>n.type===h.Alert&&n.props.tone==='danger'));assert.ok(nodes.some(n=>n.type===h.Button&&n.props.children==='Thử lại'));
});

test('Receipt policy requires explicit valid perishable date; permits optional nonperishable and unchanged legacy, never imposes future date',()=>{
  const check=helper.lotImportExpiryError;
  assert.equal(check({expiryClassification:'NON_PERISHABLE'},''),'');
  assert.equal(check({expiryClassification:null,expiryClassificationRequired:false},''),'');
  assert.match(check({expiryClassification:null,expiryClassificationRequired:true},''),/phân loại/);
  assert.match(check({expiryClassification:'PERISHABLE'},''),/ngày hết hạn/);
  for(const date of ['bad','2026-02-30','2026-13-01']) assert.match(check({expiryClassification:'PERISHABLE'},date),/không hợp lệ/);
  assert.equal(check({expiryClassification:'PERISHABLE'},'2024-02-29'),'');
  assert.equal(check({expiryClassification:'NON_PERISHABLE'},'2020-01-01'),'');
});
