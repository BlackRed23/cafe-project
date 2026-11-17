// Opt-in, GET-only verification of actual frontend adapter against running Backend.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const axios = require('axios');
async function main() {
  assert.ok(process.env.LOT_LIVE_API && process.env.LOT_LIVE_TOKEN, 'Set LOT_LIVE_API and LOT_LIVE_TOKEN; token never printed.');
  const client = axios.create({ baseURL: process.env.LOT_LIVE_API, timeout: 20000, headers: { Authorization: 'Bearer '+process.env.LOT_LIVE_TOKEN } });
  const calls=[];
  client.interceptors.request.use(config=>{ assert.equal(config.method,'get');calls.push(config.url);return config; });
  const module={exports:{}};
  const source=fs.readFileSync(path.join(__dirname,'../src/api/ingredient-batches.api.ts'),'utf8');
  const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('require','module','exports',code)(name=>{assert.equal(name,'./client');return{apiClient:client};},module,module.exports);
  const api=module.exports.ingredientBatchesApi;
  const ingredients=(await client.get('/ingredients',{params:{includeInactive:'true'}})).data.data;
  assert.ok(Array.isArray(ingredients));
  const owned=ingredients.filter(i=>i.sku?.startsWith('lot-')).slice(0,8);
  assert.ok(owned.length,'Existing lot fixtures required; no fixture creation authorized.');
  let traced=0;const qualities=new Set(),expiries=new Set();
  for(const ingredient of owned) {
    const result=await api.listLots(ingredient.id);
    assert.equal(result.ingredient.id,ingredient.id);assert.ok(Number.isFinite(result.warningDays));
    assert.ok(result.ingredient.availableQuantity<=result.ingredient.usableQuantity);
    for(const b of result.batches) { qualities.add(b.qualityStatus);expiries.add(b.expiryStatus);if(b.qualityStatus!=='AVAILABLE'||b.expiryStatus==='EXPIRED')assert.equal(b.usableQuantity,0); }
    if(result.batches[0]) { const trace=await api.traceLot(ingredient.id,result.batches[0].id);assert.equal(trace.batch.id,result.batches[0].id);traced++; }
  }
  console.log(JSON.stringify({verdict:'PASS',mode:'READ_ONLY_GET',http:calls.length,ingredients:owned.length,traced,qualities:[...qualities],expiryStatuses:[...expiries]}));
}
main().catch(e=>{ console.error(JSON.stringify({verdict:'FAIL',status:e.response?.status??null,reason:e.response?'Live API rejected read request.':e.message}));process.exitCode=1; });
