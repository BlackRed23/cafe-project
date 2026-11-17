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
const helper = load('src/pages/admin/ingredientFeedback.ts');
test('Ingredient PATCH preserves omitted fields and computes available stock', () => {
  const original = { name: 'Milk', sku: 'M', baseUnit: 'ml', costPerBaseUnit: 7, minThreshold: 12, isActive: true, rowVersion: 5, quantity: 20, reserved: 3, availableQuantity: 17 };
  const before = JSON.stringify(original);
  assert.deepEqual(helper.ingredientPatch(original, { isActive: false, baseUnit: 'ml', costPerBaseUnit: 7, minThreshold: 12 }), { isActive: false });
  assert.deepEqual(helper.ingredientPatch(original, { name: 'New', origin: undefined }), { name: 'New' });
  assert.equal(helper.availableStock(original), 17); assert.equal(helper.availableStock({...original, availableQuantity:0}),0); assert.equal(helper.availableStock({}),0); assert.equal(JSON.stringify(original), before);
});
test('Ingredient failures distinguish auth, SKU, unit, stale and hide diagnostics', () => {
  for (const status of [400,401,403,404,409,500,502]) assert.ok(!helper.ingredientError({ response: { status, data: { message: 'PRIVATE STACK SQL' } } }).includes('PRIVATE'));
  assert.match(helper.ingredientError({ response: { status:409, data:{message:'SKU exists'} } }), /SKU/);
  assert.match(helper.ingredientError({ response: { status:409, data:{message:'Cannot change base unit'} } }), /đơn vị chuẩn/);
  assert.match(helper.ingredientError({ response: { status:409, data:{message:'Stock changed'} } }), /kiểm đếm lại/);
  assert.match(helper.ingredientError(new Error('SECRET')), /giữ nguyên/);
});
test('Ingredient API uses configured client, exact bodies and replay/pending shapes', async () => {
  const calls=[];let value;
  const client=Object.fromEntries(['get','post','patch','delete'].map(method=>[method,async(...args)=>{calls.push([method,...args]);return {data:{success:true,data:value}};} ]));
  const {ingredientsApi:api}=load('src/api/ingredients.api.ts',{'./client':{apiClient:client,unwrapApiData:x=>x.data}});
  const body={requestId:'owned-uuid',quantity:3,unit:'g',purpose:'training',recipient:'team'};
  value={ingredient:{quantity:7},consumedQuantityBase:3,totalCost:6,transactionIds:['t'],replayed:true};
  assert.equal((await api.internalUse('i',body)).replayed,true);assert.deepEqual(calls.at(-1),['post','/ingredients/i/internal-use',body]);
  value={id:'incident',status:'PENDING',items:[{varianceQty:'-3'}]};
  assert.equal((await api.createIncident('i',{actualQuantity:7,reason:'lost'})).status,'PENDING');
  assert.deepEqual(calls.at(-1),['post','/ingredients/i/incidents',{actualQuantity:7,reason:'lost'}]);
  await api.getIncident('i','a/b');assert.equal(calls.at(-1)[1],'/ingredients/i/incidents/a%2Fb');
  await api.approveIncident('i','a');assert.deepEqual(calls.at(-1),['post','/ingredients/i/incidents/a/approve',{}]);
  await api.updateIngredient('i',{isActive:false});assert.deepEqual(calls.at(-1),['patch','/ingredients/i',{isActive:false}]);
  value=[];await api.getIngredients({lowStock:true,includeInactive:true,search:'milk'});assert.deepEqual(calls.at(-1),['get','/ingredients',{params:{search:'milk',lowStock:'true',includeInactive:'true'}}]);
});

function tree(node) { return Array.isArray(node) ? node.flatMap(tree) : node && typeof node === 'object' ? [node, ...tree(node.props?.children)] : []; }
function operationHarness(admin) {
  const slots=[];let cursor=0;const calls=[];
  const react={useState:initial=>{const k=cursor++;if(!(k in slots))slots[k]=initial;return[slots[k],v=>{slots[k]=typeof v==='function'?v(slots[k]):v;}];},useRef:initial=>{const k=cursor++;return slots[k]??={current:initial};}};
  const Input=()=>null,Button=()=>null;
  const api={internalUse:async(id,body)=>{calls.push(body);throw new Error('uncertain network');}};
  const {IngredientOperations}=load('src/pages/admin/IngredientOperations.tsx',{
    react,'react/jsx-runtime':require('react/jsx-runtime'),'../../api/ingredients.api':{ingredientsApi:api},
    '../../contexts/AuthContext':{useAuth:()=>({isAdmin:admin})},'../../contexts/ToastContext':{useToast:()=>({success(){},info(){}})},
    '../../components/common/Button':{Button},'../../components/common/Input':{Input},'./ingredientFeedback':helper
  });
  const render=()=>{cursor=0;return tree(IngredientOperations({ingredient:{id:'i',quantity:10,reserved:2,availableQuantity:8,baseUnit:'g',rowVersion:3},onRefresh:async()=>{}}));};
  return{render,calls,Input,Button};
}
test('Internal-use ADMIN gate and uncertain retry retain same operation UUID and locked fields', async()=>{
  const staff=operationHarness(false);
  assert.equal(staff.render().some(n=>n.props?.children==='Sử dụng nội bộ'),false);
  const h=operationHarness(true);let nodes=h.render();
  nodes.find(n=>n.props?.children==='Sử dụng nội bộ').props.onClick();nodes=h.render();
  for(const[label,value]of[['Lượng sử dụng (g)','3'],['Mục đích sử dụng','training'],['Người nhận / bộ phận','team']]){
    nodes.find(n=>n.type===h.Input&&n.props.label===label).props.onChange({target:{value}});
  }
  nodes.find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});
  await h.render().find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
  nodes=h.render();assert.ok(nodes.filter(n=>n.type===h.Input&&['Lượng sử dụng (g)','Mục đích sử dụng','Người nhận / bộ phận'].includes(n.props.label)).every(n=>n.props.disabled));
  await nodes.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});
  assert.equal(h.calls.length,2);assert.equal(h.calls[0].requestId,h.calls[1].requestId);assert.deepEqual(h.calls[0],h.calls[1]);
});
