const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const load=(file,mocks={})=>{
  const module={exports:{}};
  const code=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'..',file),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true},
  }).outputText;
  new Function('require','module','exports',code)((name)=>{assert.ok(name in mocks,name);return mocks[name];},module,module.exports);
  return module.exports;
};
test('Contract maps create/get/count/submit/approve/reject/reopen without number cursor conversion',async()=>{
  const calls=[];const fixture={session:{id:'s',status:'DRAFT'},entries:[{openingCursor:'9007199254740993123456789'}],current:[{cursor:'9007199254740993123456789'}],counted:0,uncounted:1,untrackedBatches:[]};
  const client=Object.fromEntries(['get','post'].map(method=>[method,async(...args)=>{calls.push([method,...args]);return {data:{success:true,data:fixture}};}]));
  const api=load('src/api/stocktakes.api.ts',{'./client':{apiClient:client,unwrapApiData:d=>d.data}}).stocktakesApi;
  const create={requestId:'uuid',ingredientIds:['i'],assignedCounterId:'staff'};
  assert.equal((await api.create(create)).session.id,'s');
  assert.deepEqual(calls.at(-1),['post','/stocktakes',create]);
  await api.get('s/a');assert.equal(calls.at(-1)[1],'/stocktakes/s%2Fa');
  const body={requestId:'stable',batchId:'b',expectedCursor:'9007199254740993123456789',expectedRevision:2,actualQty:0,reason:'Đã đếm',reasonCategory:'COUNTED'};
  await api.save('s',body);assert.deepEqual(calls.at(-1),['post','/stocktakes/s/entries',body]);
  for(const verb of ['submit','approve']){await api[verb]('s','id');assert.deepEqual(calls.at(-1),['post',`/stocktakes/s/${verb}`,{requestId:'id'}]);}
  for(const verb of ['reject','reopen']){await api[verb]('s',{requestId:'id',reason:'check'});assert.equal(calls.at(-1)[1],`/stocktakes/s/${verb}`);}
});
test('Self approval, count zero, conflict and uncertainty are distinguished',()=>{
  const h=load('src/pages/admin/stocktakeFeedback.ts');
  const data={session:{status:'PENDING_APPROVAL',assignedCounterId:'admin'}};
  assert.equal(h.mayApprove(data,'admin',true),false);
  assert.equal(h.mayApprove(data,'other',true),true);
  assert.equal(h.mayApprove(data,'other',false),false);
  assert.equal(h.countIsSaved(null),false);assert.equal(h.countIsSaved('0'),true);
  assert.match(h.stocktakeError({response:{status:409}}),/đã thay đổi/);
  assert.equal(h.uncertainError(new Error('network')),true);
  assert.equal(h.uncertainError({response:{status:409}}),false);
});
test('Stocktake UI preserves stable retry intent and uses verified reason categories',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../src/pages/admin/AdminStocktakesPage.tsx'),'utf8');
  assert.match(source,/stocktakesApi\.save\(action\.sessionId,action\.body\)/);
  assert.match(source,/perform\(intent\)/);
  assert.match(source,/expectedCursor:cursor/);
  assert.doesNotMatch(source,/Number\([^)]*cursor/i);
  assert.match(source,/e\.history\.map\(/);
  assert.match(source,/data\.session\.assignedCounterId===user\?\.id/);
});
