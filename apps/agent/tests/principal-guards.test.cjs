const assert=require('node:assert/strict');const {test}=require('node:test');const fs=require('node:fs');const Module=require('node:module');const ts=require('typescript');
Module._extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f);
let writes=0,transactions=0;const users={admin:{id:'admin',role:'ADMIN',isActive:true},customer:{id:'customer',role:'CUSTOMER',isActive:true}};
const db={prisma:{user:{findUnique:async({where})=>users[where.id]},$transaction:async fn=>{transactions++;return fn({purchaseRequestItem:{findFirst:async()=>null},purchaseRequest:{create:async({data})=>{writes++;return data}}})}},PurchaseRequestStatus:{PENDING:'PENDING'},OrderStatus:{CANCELLED:'CANCELLED'}};
let repoMock;const old=Module._load;
process.env.AGENT_INTERNAL_TOKEN = require('node:crypto').randomBytes(32).toString('base64url');
const systemLogs=[];
Module._load=function(r,p,m){if(r==='@cafe-project/database')return db;if(r==='../repositories/agent.repository'&&repoMock)return {agentRepository:repoMock,ACTIVE_PURCHASE_REQUEST_MESSAGE:'duplicate'};if(r==='./recommendation.service')return {recommendationService:{generateForProduct:async()=>({recommendation:{productId:'p'},logId:'rec'})}};if(r==='../utils/logger')return {logger:{info(){},error(){},warn(){}}};return old.call(this,r,p,m)};
const repository=require('../src/repositories/agent.repository.ts').agentRepository;
repoMock={findInventories:async()=>[{productId:'low',quantity:3,reservedStock:2,minThreshold:2},{productId:'ok',quantity:10,reservedStock:0,minThreshold:2}],createLog:async data=>{systemLogs.push(data);return data},findActiveProductIds:async()=>['p'],findRecommendationLog:async()=>({action:'RECOMMEND_REORDER',output:JSON.stringify({productId:'p',recommendedSupplierId:'s',recommendedQuantity:1})}),createPurchaseRequestFromRecommendation:async data=>{writes++;return data}};
const service=require('../src/services/agent.service.ts').agentService;
test('worker scheduled/manual scans perform read-only analysis and system logs with zero purchase writes',async()=>{
 for(const trigger of ['SCHEDULED','MANUAL']){
 const summary=await service.runScan(trigger);
 assert.deepEqual(summary,{principal:'system',triggerType:trigger,mode:'LOG_ONLY',totalChecked:2,lowStockProductIds:['low'],purchaseWritesBlocked:true});
 }
 assert.equal(systemLogs.length,2);for(const log of systemLogs){assert.equal(log.creator,undefined);assert.equal(log.createdBy,undefined);}
 assert.equal(writes,0);assert.equal(transactions,0);assert.equal(repository.findFirstAdmin,undefined);
});
test('system scan requires configured identity before reading inventory',async()=>{
 const secret=process.env.AGENT_INTERNAL_TOKEN;let reads=0;const prev=repoMock.findInventories;
 repoMock.findInventories=async()=>{reads++;return []};
 delete process.env.AGENT_INTERNAL_TOKEN;
 try {await assert.rejects(service.runScan(),/configuration/);assert.equal(reads,0);}
 finally {process.env.AGENT_INTERNAL_TOKEN=secret;repoMock.findInventories=prev;}
});
test('direct service writes reject unauthorized identities before dependencies',async()=>{
 for(const id of [undefined,'customer','nonexistent']){
 await assert.rejects(service.scanInventory({},id),/Forbidden/);
 await assert.rejects(service.recommendReorder({},id),/Forbidden/);
 await assert.rejects(service.createPurchaseRequestFromRecommendation('rec',id),/Forbidden/);
 }
 assert.equal(writes,0);assert.equal(transactions,0);
});
test('repository cannot fallback to ADMIN or write as customer',async()=>{
 for(const id of [undefined,'customer']){
 await assert.rejects(repository.createAiPurchaseRequest({}, {},1,'reason',id),/Forbidden/);
 await assert.rejects(repository.createPurchaseRequestFromRecommendation({userId:id}),/Forbidden/);
 }
 assert.equal(writes,0);assert.equal(transactions,0);
});
test('authorized real service operations pass with mocked recommendation/persistence',async()=>{
 const result=await service.recommendReorder({},'admin');assert.equal(result.newRecommendationsCount,1);
 const purchase=await service.createPurchaseRequestFromRecommendation('rec','admin');assert.equal(purchase.userId,'admin');assert.equal(writes,1);
});
