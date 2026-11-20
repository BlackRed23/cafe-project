// NEW correlated acceptance probe: real authenticated GET / Prisma / cafedb
// combined with a real existing StateGraph using a TEST-ONLY in-memory checkpoint.
// Never equate test-owned Graph persistence with durable production E2E.
// DB must be default_transaction_read_only=on; no production AgentLog writes.
// Opt-in: TOOL_READONLY_CAFEDB_CONFIRMED=YES node apps/api/tests/tool-real-e2e-acceptance.cafedb.cjs
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });

const runId = 'tool-real-e2e-' + crypto.randomUUID();
const root = 'D:/KLTN/cafe-project-artifacts/reports/agent/tool-selection';
fs.mkdirSync(root, { recursive: true });
const outPath = path.join(root, runId + '.json');
const out = {
    runId, startedAt: new Date().toISOString(),
    evidence: 'REAL_CAFEDB_READONLY_JWT_EXPRESS_PRISMA_NO_FIXTURES',
    status: 'NOT_RUN', actorRoles: {}, database: 'cafedb',
    checks: [], capabilityResults: {}, frontend: {}, writesPerformed: false,
    authentication: 'Backend real JWT + live current-account revalidation',
    graphProof: 'TEST_OWNED_CHECKPOINT_ONLY', exclusiveSharedFileOwnership: false,
    missingData: [], errorCode: null,
    cases: {}, steps: [], databaseSnapshots: {},
    graphStorage: 'MockAgentRepository TEST_ONLY, NOT PostgreSQL',
    all10E2eVerified: false
};
let stepCounter=0;
let currentCaseId='PREFLIGHT';
const step=(caseId, component, operation, expected, actual, verdict, extra={})=>{
    const item={stepNumber:++stepCounter,timestamp:new Date().toISOString(),
        executionLocation:'D:/KLTN/source/cafe-project, Windows local test runner',
        caseId,component,operation,inputReference:extra.inputReference??null,
        actualAction:extra.actualAction??operation,expectedResult:expected,actualResult:actual,
        assertion:extra.assertion??null,evidenceReference:runId+'.json#steps/'+stepCounter,
        stepVerdict:verdict};
    out.steps.push(item);return item;
};
const save = () => fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
const docker = (args, timeout = 20000) => execFileSync('docker', args, {
    cwd: process.cwd(), encoding: 'utf8', timeout, windowsHide: true,
    stdio: ['ignore','pipe','pipe']
}).trim();
const availablePort = () => new Promise((resolve,reject)=>{
    const server=net.createServer();
    server.once('error', reject);
    server.listen(0,'127.0.0.1',()=>{
        const port=server.address().port;
        server.close(()=>resolve(port));
    });
});
const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));
let ownProxy = false, proxyName = 'toolro-' + crypto.randomUUID().slice(0,9);
let appServer, client;
function stopProxy() {
    if (!ownProxy) return;
    try { docker(['stop','--time','2',proxyName],18000); ownProxy = false; out.proxyCleaned = true; }
    catch { out.proxyCleanupIncomplete = true; }
}
process.on('exit',stopProxy);
async function http(base, endpoint, token, label) {
    const res = await fetch(base + endpoint, {
        method:'GET', headers: token ? { Authorization: 'Bearer '+token } : {},
        redirect:'error', signal:AbortSignal.timeout(14000)
    });
    let body;
    try { body = await res.json(); } catch { body = {success:false}; }
    const caseId=label.startsWith('GRAPH_BACKEND_')?currentCaseId:
        label.startsWith('STOCKTAKE_')?'TOOL04':label.startsWith('PO_')?'TOOL05':
        label.startsWith('SUMMARY_')?'FRONTEND':'PREFLIGHT';
    out.checks.push({label,caseId,endpoint: endpoint.replace(/\/[a-z0-9_-]{18,}/gi,'/:id'),
        status:res.status,success:body.success===true});
    step(caseId,'Express Backend API','GET '+endpoint,
        'JWT/RBAC and valid PostgreSQL-backed response or expected denial',
        'HTTP '+res.status,(res.status===200||[400,401,403,404].includes(res.status))?'OBSERVED':'PARTIAL',
        {inputReference:label,assertion:'Real HTTP response captured; no route fake'});
    return {status:res.status,body};
}
const redact = (value) => JSON.stringify(value, (k,v)=>
    /token|secret|password|authorization|input|output|prompt|command|reasoning/i.test(k) ?
        '[REDACTED]' : typeof v==='bigint' ? String(v) : v);

async function main(){
    try {
        assert.equal(process.env.TOOL_READONLY_CAFEDB_CONFIRMED,'YES','EXPLICIT_READONLY_CONFIRMATION_REQUIRED');
        const uri = new URL(process.env.DATABASE_URL);
        assert.equal(uri.pathname,'/cafedb','WRONG_DATABASE');
        assert.equal(docker(['inspect','cafe_postgres','--format','{{.State.Running}}']), 'true');
        const networks = JSON.parse(docker(['inspect','cafe_postgres',
            '--format','{{json .NetworkSettings.Networks}}']));
        assert.ok(networks.bridge?.IPAddress,'EXPECTED_BRIDGE_NETWORK');
        const port = await availablePort();
        const containerPort = 25000 + Math.floor(Math.random()*18000);
        const script = [
            'const n=require("node:net");',
            'n.createServer(c=>{const u=n.connect(5432,process.env.PG_TARGET);',
            'c.on("error",()=>u.destroy());u.on("error",()=>c.destroy());',
            'c.pipe(u);u.pipe(c);}).listen(Number(process.env.PROXY_LISTEN_PORT),"0.0.0.0");'
        ].join('');
        docker(['run','--rm','-d','--name',proxyName,'--network','bridge',
            '-p','127.0.0.1:'+port+':'+containerPort,
            '-e','PG_TARGET='+networks.bridge.IPAddress,
            '-e','PROXY_LISTEN_PORT='+containerPort,
            '--entrypoint','node','cafe-agent:local','-e',script],30000);
        ownProxy = true;
        uri.hostname='127.0.0.1';uri.port=String(port);
        uri.searchParams.set('connection_limit','2');
        uri.searchParams.set('options','-c default_transaction_read_only=on -c statement_timeout=8000');
        process.env.DATABASE_URL=uri.toString();
        process.env.NODE_ENV='test';
        require('ts-node').register({ project:'apps/api/tsconfig.json', transpileOnly:true });
        const {PrismaClient}=require('@prisma/client');
        const express=require('express');
        const jwt=require('jsonwebtoken');
        client = new PrismaClient({datasources:{db:{url:uri.toString()}}});
        // Shared database package adopts this client in TEST, all routes use read-only connection.
        globalThis.prisma=client;
        let identity;
        for(let i=0;i<25;i++) {
            try {
                [identity]=await client.$queryRawUnsafe(
                    'SELECT current_database() AS name, current_setting(\'default_transaction_read_only\') AS ro');
                break;
            } catch(error) {
                if(i===24) throw error;
                await wait(150);
            }
        }
        assert.equal(identity.name,'cafedb');
        assert.equal(identity.ro,'on');
        const [admin,staff] = await Promise.all([
            client.user.findFirst({where:{role:'ADMIN',isActive:true}, select:{id:true,email:true,role:true}}),
            client.user.findFirst({where:{role:'STAFF',isActive:true}, select:{id:true,email:true,role:true}})
        ]);
        if(!admin) throw Error('NO_ACTIVE_ADMIN_FIXTURE');
        out.actorRoles.admin=true;out.actorRoles.staff=!!staff;
        const adminJwt=jwt.sign(admin,process.env.JWT_SECRET,{expiresIn:'10m'});
        const staffJwt=staff?jwt.sign(staff,process.env.JWT_SECRET,{expiresIn:'10m'}):null;
        const app=express();app.use(express.json());
        const {stocktakeRoutes}=require('../src/modules/inventory/stocktake.route');
        const {purchaseOrderRoutes}=require('../src/modules/purchase/purchase.route');
        const {ingredientRoutes}=require('../src/modules/ingredient/ingredient.route');
        const {createAgentFrontendSummaryRouter}=require('../src/modules/agent/agent-frontend-summary.route');
        app.use('/api/stocktakes',stocktakeRoutes);
        app.use('/api/purchase-orders',purchaseOrderRoutes);
        app.use('/api/ingredients',ingredientRoutes);
        app.use('/api/agent',createAgentFrontendSummaryRouter());
        app.use(require('../src/common/error-handler').errorHandler);
        appServer=app.listen(0,'127.0.0.1');
        await new Promise(resolve=>appServer.once('listening',resolve));
        const base='http://127.0.0.1:'+appServer.address().port;
        const {createAuthenticatedBusinessReadClient,createToolBusinessReadAdapter}=
            require('../../agent/src/services/tool-selection/tool-business-read');
        const adapter=createToolBusinessReadAdapter(createAuthenticatedBusinessReadClient({
            baseUrl:base,bearerJwt:adminJwt
        }));
        out.environment = {
            repository:'D:/KLTN/source/cafe-project',
            branch:execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),
            revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
            container:'cafe_postgres',
            pgReadOnly:true, testActorRole:admin.role,
            actorIdHash:crypto.createHash('sha256').update(admin.id).digest('hex').slice(0,20),
            backendHost:'Express test transport on loopback',
            graphCheckpoint:'MockAgentRepository, test-only, in-memory',
            sourceHashes:Object.fromEntries([
                'apps/agent/src/workflows/agent-langgraph.ts',
                'apps/agent/src/workflows/agent-workflow.ts',
                'apps/agent/src/workflows/tool-registry.ts',
                'apps/agent/src/services/tool-selection/tool-selection.service.ts',
                'apps/agent/src/services/planning/planning.service.ts'
            ].map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(name)).digest('hex')]))
        };
        const observe = async (ids=[]) => {
            const selected = await client.ingredient.findMany({
                where:{id:{in:ids}},select:{id:true,quantity:true,reserved:true,
                    movementCursor:true,rowVersion:true,
                    batches:{select:{id:true,qualityStatus:true,quantityRemaining:true,
                        expirationDate:true}}},orderBy:{id:'asc'}
            });
            const [pr, movement, agentExecution, agentLog, stocktake, receipt, order]=await Promise.all([
                client.purchaseRequest.count(), client.inventoryTransaction.count(),
                client.agentExecution.count(), client.agentLog.count(),
                client.stockCount.count(), client.goodsReceipt.count(),
                client.purchaseOrder.count()
            ]);
            const [mode]=await client.$queryRawUnsafe('SELECT current_setting(\'default_transaction_read_only\') AS ro');
            assert.equal(mode.ro,'on');
            return {mode:mode.ro,purchaseRequestCount:pr, inventoryMovementCount:movement,
                agentExecutionCount:agentExecution,agentLogCount:agentLog,
                stocktakeCount:stocktake,goodsReceiptCount:receipt,purchaseOrderCount:order,
                ingredients:selected.map(row=>({id:row.id,physical:String(row.quantity),
                    reserved:String(row.reserved),movementCursor:String(row.movementCursor),
                    rowVersion:row.rowVersion,
                    batches:row.batches.map(b=>({id:b.id,quantity:String(b.quantityRemaining),
                        quality:b.qualityStatus,expiry:b.expirationDate?.toISOString()??null}))}))};
        };
        const {AgentWorkflow,MockAgentRepository}=require('../../agent/src/workflows/agent-workflow');
        const {analyzeInventoryPerception}=require('../../agent/src/workflows/inventory-perception');
        const readSource=async id=>client.ingredient.findFirst({where:{id,isActive:true,deletedAt:null},include:{batches:true}});
        const guardActor=async(actor,permission)=>{
            if(actor!==admin.id || !['agent.run','inventory.read','purchase.read'].includes(permission))
                throw Object.assign(new Error('FORBIDDEN'),{statusCode:403});
            const current=await client.user.findUnique({where:{id:actor},select:{isActive:true,role:true}});
            if(!current?.isActive || current.role!=='ADMIN') throw Object.assign(new Error('FORBIDDEN'),{statusCode:403});
            return {role:'ADMIN'};
        };
        const stockForGraph=async actor=>{
            await guardActor(actor,'inventory.read');
            const row=await readSource(graphIngredientId);
            if(!row) throw Error('DATA_UNAVAILABLE');
            const sum=row.batches.reduce((v,b)=>v.plus(b.quantityRemaining),new (require('@prisma/client').Prisma.Decimal)(0));
            if(!sum.eq(row.quantity)) throw Error('ANOMALOUS_INVENTORY');
            return [{id:row.id,ingredientId:row.id,remaining:row.quantity.toString(),
                reserved:row.reserved.toString(),version:String(row.rowVersion+1)}];
        };
        let graphIngredientId=null;
        const graphReadServices={
            authorize:guardActor,
            availability:async id=>{
                const response=await http(base,'/api/ingredients/'+encodeURIComponent(id),adminJwt,'GRAPH_BACKEND_INVENTORY');
                assert.equal(response.status,200);
                const d=response.body.data;
                assert.equal(d.id,id);
                return {ingredientId:id,baseUnit:d.baseUnit,quantity:d.physicalQuantity,
                    reserved:d.reserved,available:d.physicalQuantity-d.reserved,
                    active:d.isActive,rowVersion:d.rowVersion};
            },
            batches:async id=>{
                const response=await http(base,'/api/ingredients/'+encodeURIComponent(id)+'/batches',adminJwt,'GRAPH_BACKEND_BATCHES');
                assert.equal(response.status,200);
                const d=response.body.data;
                assert.ok(Array.isArray(d.batches));
                return {ingredientId:id,baseUnit:d.ingredient?.baseUnit??(await readSource(id)).baseUnit,
                    batches:d.batches.map(b=>({id:b.id,quantityRemaining:Number(b.quantityRemaining),
                        expirationDate:b.expirationDate??null,receivedAt:b.receivedAt}))};
            },
            stocktake:input=>adapter.readStocktake(input),
            inbound:input=>adapter.readInbound(input)
        };
        const {authMiddleware,roleMiddleware}=require('../src/modules/auth/auth.middleware');
        const graphRuns=[];
        const runGraph=async ({caseId,ingredientId,readTools})=>{
            currentCaseId=caseId;
            graphIngredientId=ingredientId;
            const repo=new MockAgentRepository();
            await repo.atomic(s=>{s.permissions[admin.id]=['agent.run','inventory.read'];});
            const bridgeRegistry=createToolRegistry(graphReadServices,'BACKEND');
            const business={
                toolRegistry:bridgeRegistry,authorize:guardActor,
                inventory:stockForGraph,
                perceiveInventory:async(actor,initial)=>{
                    await guardActor(actor,'inventory.read');
                    const row=await readSource(ingredientId);
                    if(!row) throw Error('DATA_UNAVAILABLE');
                    return [analyzeInventoryPerception(row,initial[0],new Date())];
                },
                recommendInventory:async(actor,initial)=>{
                    await guardActor(actor,'inventory.read');
                    const row=await readSource(ingredientId);
                    if(!row) throw Error('DATA_UNAVAILABLE');
                    const activeCount=await client.stockCount.findFirst({where:{kind:'STOCKTAKE',
                        status:{in:['DRAFT','PENDING_APPROVAL','NEEDS_INVESTIGATION']},
                        stocktakeEntries:{some:{ingredientId}}},select:{id:true}});
                    if(activeCount) throw Error('STOCKTAKE_UNCERTAIN');
                    // Existing legacy executor calls recommendInventory(actor)
                    // without a snapshot. Acquire a new authoritative read,
                    // mirroring agent-live-readonly.ts's real BusinessPort.
                    const authoritative=initial??await stockForGraph(actor);
                    const per=analyzeInventoryPerception(row,authoritative[0],new Date());
                    const Decimal=require('@prisma/client').Prisma.Decimal;
                    const needed=Decimal.max(new Decimal(0),new Decimal(per.thresholdQuantity).minus(per.availableQuantity));
                    return [{ingredientId,baseUnit:row.baseUnit,available:per.availableQuantity,
                        minStock:per.thresholdQuantity,targetStock:per.thresholdQuantity,
                        recommendedBaseQuantity:needed.toString(),sourceVersion:String(row.rowVersion+1)}];
                },
                sourceVersions:async()=>({}),
                atomic:async()=>{throw Error('BUSINESS_WRITE_FORBIDDEN')},
                purchaseReceipt:async()=>{throw Error('BUSINESS_WRITE_FORBIDDEN')},
                createPurchase:async()=>{throw Error('BUSINESS_WRITE_FORBIDDEN')}
            };
            const planner={plan:async()=>[{tool:'inventory.read',input:null},
                {tool:'inventory.recommend',input:null}]};
            const agent=new AgentWorkflow(repo,business,planner,
                ['inventory.read','inventory.recommend'],()=>new Date(),true);
            const requestId=crypto.randomUUID();
            const graph=await agent.runLangGraph({requestId,actorId:admin.id,
                prompt:'Acceptance test-only read-only case '+caseId,
                budget:2,mode:'PLAN',readTools});
            const checkpoint=repo.snapshot().graphRuns[graph.graphId];
            assert.equal(checkpoint.status,graph.status);
            assert.ok(checkpoint.trace.length>0);
            const stored=repo.snapshot();
            const record={caseId,requestId,graphId:graph.graphId,graphStatus:graph.status,
                graphSource:graph.source,checkpoint:'TEST_ONLY_IN_MEMORY',
                legacyExecution:graph.execution?{id:graph.execution.id,status:graph.execution.status,
                    outcomeVerified:graph.execution.outcome?.verified??null}:null,
                executionToolCalls:Object.values(stored.toolCalls).filter(c=>c.executionId===graph.execution?.id)
                    .map(c=>({tool:c.tool,status:c.status,attempts:c.attempts??null,
                        authorized:!!c.authorization,verifiedAtPresent:!!c.verifiedAt})),
                nodes:graph.trace.map(e=>({node:e.node,status:e.status,code:e.code??null,
                    tool:e.tool??null,at:e.at,edge:e.edge})),
                toolResults:graph.toolResults.map(r=>({ok:r.ok,
                    ...(r.ok?{tool:r.evidence.tool,validated:r.evidence.validated,
                        attempts:r.evidence.attempts}:{tool:r.evidence.tool,
                        error:r.error,attempts:r.evidence.attempts})})),
                perception:graph.perception?.map(p=>({ingredientId:p.ingredientId,
                    physical:p.physicalQuantity,eligible:p.eligibleQuantity,reserved:p.reservedQuantity,
                    available:p.availableQuantity,quality:p.lotBreakdown.map(l=>({id:l.id,quality:l.qualityStatus,eligible:l.eligible}))}))??[],
                auditPersistedInTestRepo:checkpoint.trace.length===graph.trace.length};
            graphRuns.push(record);
            return record;
        };
        app.post('/api/acceptance/tool/:caseId',authMiddleware,roleMiddleware('ADMIN'),async(req,res)=>{
            try {
                if(req.user?.id!==admin.id) return res.status(403).json({success:false});
                const input=req.body;
                const graph=await runGraph({caseId:req.params.caseId,
                    ingredientId:input.ingredientId,readTools:input.readTools});
                return res.json({success:true,data:graph});
            }catch(error){return res.status(409).json({success:false,
                errorCode:String(error?.message||'UNKNOWN').slice(0,70)});}
        });
        const triggerGraph=async(caseId,ingredientId,readTools)=>{
            currentCaseId=caseId;
            const response=await fetch(base+'/api/acceptance/tool/'+caseId,{
                method:'POST',headers:{Authorization:'Bearer '+adminJwt,'content-type':'application/json'},
                body:JSON.stringify({ingredientId,readTools}),signal:AbortSignal.timeout(20000)});
            const payload=await response.json();
            step(caseId,'Express test-only acceptance trigger','POST authenticated test-only graph route',
                'ADMIN authorized, no procurement or shared DB writes',
                'HTTP '+response.status,response.status===200?'PASS':'PARTIAL',
                {inputReference:ingredientId,assertion:'real JWT middleware and current DB user'});
            if(response.status!==200) throw Error('GRAPH_TRIGGER_'+response.status+'_'+payload.errorCode);
            const result=payload.data;
            for(const e of result.nodes) step(caseId,'LangGraph '+e.node,e.status,
                'trusted node routing or explicit HOLD',e.code??e.status,'OBSERVED',
                {inputReference:result.graphId,assertion:'state graph trace from actual execute'});
            return result;
        };
        // Optional real business bindings for the SINGLE existing Registry.
        // Backend HTTP independently revalidates JWT and current account; no
        // Agent internal token, browser credential or write capability.
        const {createToolRegistry}=require('../../agent/src/workflows/tool-registry');
        const {selectToolForTask}=require('../../agent/src/services/tool-selection/tool-selection.service');
        const {TOOL_SELECTION_VERSION}=require('../../agent/src/services/tool-selection/tool-selection.schema');
        const {requireAgentUser}=require('../../agent/src/internal-auth');
        const businessRegistry=createToolRegistry({
            authorize:async(actor,permission)=>{
                if(!['inventory.read','purchase.read'].includes(permission)) throw Object.assign(new Error('FORBIDDEN'),{statusCode:403});
                return requireAgentUser(actor,['ADMIN']);
            },
            stocktake:args=>adapter.readStocktake(args),
            inbound:args=>adapter.readInbound(args)
        },'BACKEND');
        const runBusinessRegistry=async(objective,name,inputs)=>{
            const decision=await selectToolForTask({
                version:TOOL_SELECTION_VERSION,actorId:admin.id,objective,
                dataQuality:'VERIFIED',requiredInformation:[],availableInformation:[],
                dependencyIds:[],completedDependencyIds:[],inputs,
                previousOutcome:'NOT_RUN',recoveryCount:0
            },businessRegistry,(actor,permission)=>{
                if(actor!==admin.id) throw Error('FORBIDDEN');
                return requireAgentUser(actor,['ADMIN']);
            });
            assert.equal(decision.status,'SELECTED');
            assert.equal(decision.selectedTool,name);
            const caseId=objective==='STOCKTAKE'?'TOOL04':'TOOL05';
            step(caseId,'TOOL selector','selectToolForTask '+name,
                'read-only selected capability after current ADMIN check',
                decision.status+':'+decision.selectionReason,'PASS',
                {inputReference:inputs.ingredientId,assertion:'selector strict input and permission validation'});
            const outcome=await businessRegistry.dispatch(admin.id,name,inputs);
            assert.equal(outcome.ok,true,outcome.error);
            assert.equal(outcome.evidence.validated,true);
            assert.equal(outcome.evidence.attempts,1);
            step(caseId,'UnifiedToolRegistry','dispatch '+name,
                'authorized, output Zod validated, attempts=1',
                'SUCCEEDED validated='+outcome.evidence.validated,'PASS',
                {inputReference:inputs.ingredientId,
                    assertion:'Backend current-role auth, GET-only service, no business writes'});
            return outcome.output;
        };

        // Always prove auth/negative HTTP paths, even if no matching business fixtures exist.
        const anon=await http(base,'/api/agent/executions/missing-check/summary',null,'SUMMARY_ANON');
        assert.equal(anon.status,401);
        if(staffJwt) {
            const denied=await http(base,'/api/agent/executions/missing-check/summary',staffJwt,'SUMMARY_STAFF');
            assert.equal(denied.status,403);
        }
        const missing=await http(base,'/api/agent/executions/missing-check/summary',adminJwt,'SUMMARY_MISSING');
        assert.equal(missing.status,404);
        const malformed=await http(base,'/api/agent/executions/@bad/summary',adminJwt,'SUMMARY_INVALID');
        assert.equal(malformed.status,400);
        const owned=await client.agentExecution.findFirst({
            where:{triggeredBy:admin.id},
            select:{id:true,status:true,triggeredBy:true},
            orderBy:{startedAt:'desc'}
        });
        if(owned){
            const response=await http(base,'/api/agent/executions/'+encodeURIComponent(owned.id)+'/summary',
                adminJwt,'SUMMARY_OWNED');
            assert.equal(response.status,200);
            assert.equal(response.body.data.runId,owned.id);
            assert.equal(response.body.data.status,owned.status);
            assert.equal(response.body.data.selectedTools.length<=100,true);
            for(const key of ['goal','prompt','arguments','result','reasoning','internalToken','errorMessage']){
                assert.equal(Object.prototype.hasOwnProperty.call(response.body.data,key),false);
            }
            out.frontend.ownedRun='ADMIN_200_REAL';
            out.frontend.actualStatus=owned.status;
        }else {
            out.missingData.push('NO_ADMIN_OWNED_AGENT_EXECUTION');
            out.frontend.ownedRun='BLOCKED_NO_OWNED_RUN';
        }
        const foreign=await client.agentExecution.findFirst({
            where:{OR:[{triggeredBy:null},{triggeredBy:{not:admin.id}}]},
            select:{id:true,triggeredBy:true}
        });
        if(foreign){
            const response=await http(base,'/api/agent/executions/'+encodeURIComponent(foreign.id)+'/summary',
                adminJwt,'SUMMARY_FOREIGN');
            assert.equal(response.status,404);
            out.frontend.crossUser='404';
        }else out.missingData.push('NO_FOREIGN_RUN_FOR_LIVE_NEGATIVE');

        // Real Registry dispatch for TOOL-01/02/09/10 without touching shared
        // Graph/Registry files. The Backend-owned READ adapters query the same
        // read-only Prisma/cafedb connection and recheck current ADMIN authority.
        const validIngredients=await client.ingredient.findMany({
            where:{isActive:true,deletedAt:null},
            select:{id:true,quantity:true,reserved:true,
                batches:{select:{quantityRemaining:true}}},
            take:40,orderBy:{id:'asc'}
        });
        const valid=validIngredients.find(row=>
            row.batches.reduce((sum,batch)=>sum.plus(batch.quantityRemaining),
                new (require('@prisma/client').Prisma.Decimal)(0)).eq(row.quantity) &&
            row.reserved.lte(row.quantity));
        if(valid){
            const {createLiveBackendReadRegistry}=
                require('../../agent/src/workflows/agent-live-backend-registry');
            const {selectToolForTask}=require('../../agent/src/services/tool-selection/tool-selection.service');
            const {TOOL_SELECTION_VERSION}=require('../../agent/src/services/tool-selection/tool-selection.schema');
            const registry=createLiveBackendReadRegistry([valid.id]);
            for(const [caseId,objective,name] of [
                ['TOOL01','INVENTORY','getIngredientAvailability'],
                ['TOOL02','EXPIRY','getIngredientBatches']
            ]){
                const decision=await selectToolForTask({
                    version:TOOL_SELECTION_VERSION,actorId:admin.id,objective,
                    dataQuality:'VERIFIED',requiredInformation:[],availableInformation:[],
                    dependencyIds:[],completedDependencyIds:[],
                    inputs:{ingredientId:valid.id},
                    previousOutcome:'NOT_RUN',recoveryCount:0
                },registry,async(actor,permission)=>{
                    assert.equal(actor,admin.id);
                    assert.equal(permission,'inventory.read');
                });
                assert.equal(decision.status,'SELECTED');
                assert.equal(decision.selectedTool,name);
                const actual=await registry.dispatch(admin.id,name,{ingredientId:valid.id});
                assert.equal(actual.ok,true,actual.error);
                assert.equal(actual.evidence.mode,'BACKEND');
                out.capabilityResults[caseId]={status:'REAL_PRISMA_REGISTRY_DISPATCH_PASS',
                    selectedTool:name,permission:'inventory.read',
                    argumentValidated:actual.evidence.validated,attempts:actual.evidence.attempts};
            }
            if(staff){
                const unauthorized=await registry.dispatch(staff.id,'getIngredientAvailability',{ingredientId:valid.id});
                assert.equal(unauthorized.ok,false);
                assert.equal(unauthorized.error,'FORBIDDEN');
                out.capabilityResults.TOOL09={status:'REAL_REGISTRY_RBAC_DENIED_PASS'};
            }
            const malformed=await registry.dispatch(admin.id,'getIngredientAvailability',
                {ingredientId:valid.id,forceWrite:true});
            assert.equal(malformed.ok,false);
            assert.equal(malformed.error,'INVALID_INPUT');
            out.capabilityResults.TOOL10={status:'REAL_REGISTRY_INPUT_SCHEMA_DENIAL_PASS'};
        }else {
            out.missingData.push('NO_COHERENT_ACTIVE_INGREDIENT_FOR_REGISTRY_READ');
            out.capabilityResults.TOOL01={status:'BLOCKED_NO_SAFE_FIXTURE'};
            out.capabilityResults.TOOL02={status:'BLOCKED_NO_SAFE_FIXTURE'};
        }

        let stocktakeInput=null,inboundInput=null;
        const stocktakeFields={id:true,scope:true,createdById:true,assignedCounterId:true,status:true};
        const stk=await client.stockCount.findFirst({
            where:{kind:'STOCKTAKE',status:'PENDING_APPROVAL'},
            select:stocktakeFields,orderBy:{createdAt:'desc'}
        }) ?? await client.stockCount.findFirst({
            where:{kind:'STOCKTAKE'},
            select:stocktakeFields,
            orderBy:{createdAt:'desc'}
        });
        if(stk && Array.isArray(stk.scope) && stk.scope.length>0){
            const ingredientId=stk.scope.find(x=>typeof x==='string');
            if(ingredientId){
                stocktakeInput={stocktakeId:stk.id,ingredientId};
                const response=await http(base,'/api/stocktakes/'+encodeURIComponent(stk.id),
                    adminJwt,'STOCKTAKE_ADMIN');
                assert.equal(response.status,200);
                const projected=await runBusinessRegistry('STOCKTAKE','getStocktakeStatus',
                    {stocktakeId:stk.id,ingredientId});
                assert.equal(projected.createsAdjustment,false);
                assert.equal(projected.grantsApproval,false);
                out.capabilityResults.TOOL04={status:'REAL_HTTP_PRISMA_REGISTRY_PASS_NOT_GRAPH',
                    stocktakeId:stk.id,ingredientId,
                    quality:projected.warnings,
                    stocktakeStatus:projected.status,
                    pendingApproval:projected.pendingApproval,
                    unapprovedVarianceCount:projected.unapprovedVariances.length,
                    unapprovedVariances:projected.unapprovedVariances.map(v=>({batchId:v.batchId,
                        varianceBase:v.varianceBase,openingCursor:v.openingCursor,
                        observedCursor:v.observedCursor})),
                    uncountedLots:projected.uncountedLots,
                    createsAdjustment:projected.createsAdjustment,grantsApproval:projected.grantsApproval};
                if(staffJwt && staff.id!==stk.createdById && staff.id!==stk.assignedCounterId){
                    const denied=await http(base,'/api/stocktakes/'+encodeURIComponent(stk.id),
                        staffJwt,'STOCKTAKE_UNRELATED_STAFF');
                    assert.equal(denied.status,403);
                }
            }
        }
        if(!out.capabilityResults.TOOL04){
            out.capabilityResults.TOOL04={status:'BLOCKED_NO_REAL_STOCKTAKE_FIXTURE'};
            out.missingData.push('NO_STOCKTAKE_WITH_INGREDIENT_SCOPE');
        }
        const po=await client.purchaseOrder.findFirst({
            where:{items:{some:{ingredientId:{not:null}}}},
            select:{id:true,items:{select:{ingredientId:true}}},
            orderBy:{createdAt:'desc'}
        });
        if(po){
            const ingredientId=po.items.find(item=>item.ingredientId)?.ingredientId;
            if(ingredientId){
                inboundInput={purchaseOrderId:po.id,ingredientId};
                const response=await http(base,'/api/purchase-orders/'+encodeURIComponent(po.id),
                    adminJwt,'PO_ADMIN');
                assert.equal(response.status,200);
                const projected=await runBusinessRegistry('INBOUND','getInboundPurchaseOrder',
                    {purchaseOrderId:po.id,ingredientId});
                assert.equal(projected.createsPurchaseOrder,false);
                assert.equal(projected.supplierExternallyVerified,false);
                assert.equal(projected.contributesToPhysicalStock,false);
                out.capabilityResults.TOOL05={status:'REAL_HTTP_PRISMA_REGISTRY_PASS_NOT_GRAPH',
                    purchaseOrderId:po.id,ingredientId,purchaseOrderStatus:projected.purchaseOrderStatus,
                    pendingBase:projected.pendingBase,observedReceivedBase:projected.observedReceivedBase,
                    consideration:projected.inboundConsideration,
                    goodsReceipts:projected.goodsReceipts,
                    supplierExternallyVerified:projected.supplierExternallyVerified,
                    contributesToPhysicalStock:projected.contributesToPhysicalStock,
                    provenanceChecked:projected.provenanceChecked,warnings:projected.warnings};
                if(staffJwt){
                    const denied=await http(base,'/api/purchase-orders/'+encodeURIComponent(po.id),
                        staffJwt,'PO_STAFF_DENIED');
                    assert.equal(denied.status,403);
                }
            }
        }
        if(!out.capabilityResults.TOOL05){
            out.capabilityResults.TOOL05={status:'BLOCKED_NO_REAL_PO_FIXTURE'};
            out.missingData.push('NO_PO_WITH_INGREDIENT');
        }

        // Fully correlated real backend+Prisma read and actual Graph routing,
        // but Graph checkpoint remains test-only in memory, not PostgreSQL.
        const candidates=await client.ingredient.findMany({
            where:{isActive:true,deletedAt:null},include:{batches:true},take:40,orderBy:{id:'asc'}
        });
        let safeGraphIngredient=null;
        for(const row of candidates){
            const Decimal=require('@prisma/client').Prisma.Decimal;
            const total=row.batches.reduce((sum,b)=>sum.plus(b.quantityRemaining),new Decimal(0));
            const eligible=row.batches.filter(b=>b.qualityStatus==='AVAILABLE'&&
                (!b.expirationDate||b.expirationDate.getTime()>Date.now()))
                .reduce((sum,b)=>sum.plus(b.quantityRemaining),new Decimal(0));
            if(!total.eq(row.quantity)||row.reserved.gt(eligible)||
                !['g','ml','piece'].includes(row.baseUnit))continue;
            const pending=await client.stockCount.findFirst({where:{kind:'STOCKTAKE',
                status:{in:['DRAFT','PENDING_APPROVAL','NEEDS_INVESTIGATION']},
                stocktakeEntries:{some:{ingredientId:row.id}}},select:{id:true}});
            if(!pending){safeGraphIngredient=row.id;break;}
        }
        const observedIds=[...new Set([safeGraphIngredient,valid?.id,
            stocktakeInput?.ingredientId,inboundInput?.ingredientId].filter(Boolean))];
        out.databaseSnapshots.before=await observe(observedIds);
        step('ALL','PostgreSQL','read-only BEFORE snapshot','default_transaction_read_only=on',
            'on; '+observedIds.length+' ingredients; no writes','PASS',
            {inputReference:observedIds.join(','),assertion:'Prisma counters and actual rowVersion/movementCursor'});

        if(safeGraphIngredient){
            const graphInputs={
                TOOL01:[{name:'getIngredientAvailability',input:{ingredientId:safeGraphIngredient}}],
                TOOL02:[{name:'getIngredientBatches',input:{ingredientId:safeGraphIngredient}}],
                TOOL08:[
                    {name:'getIngredientAvailability',input:{ingredientId:safeGraphIngredient}},
                    {name:'getIngredientBatches',input:{ingredientId:safeGraphIngredient}}],
                TOOL09:[{name:'fake.admin.write',input:{ingredientId:safeGraphIngredient}}],
                TOOL10:[{name:'getIngredientAvailability',input:{ingredientId:safeGraphIngredient,forceWrite:true}}]
            };
            for(const [caseId,tools] of Object.entries(graphInputs)){
                try{
                    const graph=await triggerGraph(caseId,safeGraphIngredient,tools);
                    out.cases[caseId]={...(out.cases[caseId]??{}),
                        graph:{status:graph.graphStatus,graphId:graph.graphId,
                            nodeCount:graph.nodes.length,toolResults:graph.toolResults,
                            perception:graph.perception,checkpoint:graph.checkpoint},
                        runtime:'REAL_HTTP_AUTHENTICATED_TEST_TRIGGER + REAL_GRAPH + REAL_BACKEND_HTTP + PRISMA_READONLY + IN_MEMORY_GRAPH_CHECKPOINT',
                        verdict:'PARTIAL',reason:'PLN_NOT_IN_PRODUCTION_GRAPH_AND_CHECKPOINT_TEST_ONLY'};
                    if(caseId==='TOOL09'||caseId==='TOOL10') {
                        assert.equal(graph.graphStatus,'HELD_POLICY');
                        assert.equal(graph.toolResults.filter(x=>x.attempts>0).length,0);
                    }
                }catch(error){
                    out.cases[caseId]={...(out.cases[caseId]??{}),verdict:'PARTIAL',
                        errorCode:String(error.message).slice(0,120)};
                    step(caseId,'AgentWorkflow','Graph failure / early HOLD',
                        'safe and typed trace','NOT_VERIFIED','BLOCKED',
                        {assertion:'No untrusted Graph E2E PASS'});
                }
            }
        }else{
            for(const caseId of ['TOOL01','TOOL02','TOOL08','TOOL09','TOOL10']){
                out.cases[caseId]={verdict:'BLOCKED_DATA',reason:'NO_SAFE_COHERENT_NON_STOCKTAKE_INGREDIENT'};
                step(caseId,'Graph preflight','candidate validation',
                    'coherent ingredient','NOT_EXECUTED','BLOCKED_DATA');
            }
            out.missingData.push('NO_SAFE_GRAPH_INGREDIENT');
        }

        for(const [caseId,input,toolName] of [
            ['TOOL04',stocktakeInput,'getStocktakeStatus'],
            ['TOOL05',inboundInput,'getInboundPurchaseOrder']]){
            if(!input){out.cases[caseId]={verdict:'BLOCKED_DATA',reason:'NO_EXISTING_RECORD'};continue;}
            try{
                const graph=await triggerGraph(caseId,input.ingredientId,[{name:toolName,input}]);
                out.cases[caseId]={verdict:'PARTIAL',graph:{status:graph.graphStatus,
                    graphId:graph.graphId,nodes:graph.nodes.map(n=>n.node),
                    toolResults:graph.toolResults,checkpoint:graph.checkpoint},
                    realBackendRegistryRead:out.capabilityResults[caseId],
                    limitation:'Graph may correctly stop at active stocktake/quality uncertainty; independent real Registry read does not erase that HOLD'};
            }catch(error){out.cases[caseId]={verdict:'PARTIAL',
                realBackendRegistryRead:out.capabilityResults[caseId],
                errorCode:String(error.message).slice(0,120)};}
        }

        // TOOL03/06/07 currently have real Backend service bindings but are
        // not in the opt-in live Agent Graph. Exercise them without bypassing
        // policy. Missing real inputs are BLOCKED_DATA, never fabricated.
        const {createBackendToolServices}=require('../src/workflows/tool-services');
        const liveServices=createBackendToolServices();
        const liveRegistry=createToolRegistry({
            ...liveServices,stocktake:input=>adapter.readStocktake(input),
            inbound:input=>adapter.readInbound(input)
        },'BACKEND');
        const product=await client.product.findFirst({where:{isActive:true},select:{id:true}});
        const selectAndInvoke=async(caseId,objective,input,name)=>{
            const decision=await selectToolForTask({
                version:TOOL_SELECTION_VERSION,actorId:admin.id,objective,
                dataQuality:'VERIFIED',requiredInformation:[],availableInformation:[],
                dependencyIds:[],completedDependencyIds:[],inputs:input,
                previousOutcome:'NOT_RUN',recoveryCount:0
            },liveRegistry,liveServices.authorize);
            step(caseId,'TOOL selector','selectToolForTask',name,
                decision.status+':'+(decision.selectedTool??'none'),decision.status==='SELECTED'?'PASS':'PARTIAL',
                {inputReference:caseId,assertion:'actual real actor checked and schema validated'});
            if(decision.status!=='SELECTED')return {decision,status:'BLOCKED_CAPABILITY'};
            const result=await liveRegistry.dispatch(admin.id,name,input);
            step(caseId,'UnifiedToolRegistry','dispatch '+name,
                'read-only authorized validated result',result.ok?'SUCCEEDED':result.error,
                result.ok?'PASS':'PARTIAL',{assertion:'Registry input/output validation and current-user auth'});
            return {decision,status:result.ok?'BACKEND_PASS':'BLOCKED_DATA',
                result:result.ok?result.output:{error:result.error}};
        };
        if(product){
            const now=new Date();const from=new Date(now.getTime()-30*86400000);
            const input={productId:product.id,from:from.toISOString(),to:now.toISOString()};
            try{const x=await selectAndInvoke('TOOL03','CONSUMPTION',input,'getSalesHistory');
                out.cases.TOOL03={verdict:'PARTIAL',realBusinessRead:x.status,
                    productId:product.id,data:x.result??null,
                    limitation:'Graph production sales capability not bound; direct Backend service/Prisma, not full graph E2E'};}
            catch(error){out.cases.TOOL03={verdict:'PARTIAL',errorCode:String(error?.message).slice(0,80)};}
        }else{out.cases.TOOL03={verdict:'BLOCKED_DATA',reason:'NO_ACTIVE_PRODUCT'};}
        if(valid){
            const mapped=await client.supplierIngredient.findFirst({
                where:{supplier:{status:'ACTIVE',deletedAt:null},
                    ingredient:{isActive:true,deletedAt:null,baseUnit:{in:['g','ml','piece']}},
                    conversionTargetUnit:{in:['g','ml','piece']}},
                select:{ingredientId:true},orderBy:{id:'asc'}
            });
            const supplierIngredientId=mapped?.ingredientId??valid.id;
            for(const [caseId,objective,name] of [
                ['TOOL06','SUPPLIER','findIngredientSuppliers'],
                ['TOOL07','REORDER','calculateReorderQuantity']]){
                try{const x=await selectAndInvoke(caseId,objective,{ingredientId:supplierIngredientId},name);
                    out.cases[caseId]={verdict:'PARTIAL',realBusinessRead:x.status,
                        ingredientId:supplierIngredientId,result:x.result??null,
                        activeMappingPresent:!!mapped,
                        ...(caseId==='TOOL06'&&Array.isArray(x.result)&&x.result.length===0?
                            {noEligibleSupplier:true,businessDecision:'REVIEW_MISSING_SUPPLIER'}:{}),
                        limitation:'Backend service invoked directly; not from real production PLN→Graph'};
                    if(caseId==='TOOL06'&&x.status!=='BACKEND_PASS'){
                        try{
                            const actual=await liveServices.suppliers(supplierIngredientId);
                            const {TOOL_CONTRACTS}=require('../../agent/src/workflows/tool-contracts');
                            const parsed=TOOL_CONTRACTS.findIngredientSuppliers.output.safeParse(actual);
                            out.cases.TOOL06.contractDiagnosis={serviceReturnedRows:actual.length,
                                issues:parsed.success?[]:parsed.error.issues.map(issue=>({
                                    code:issue.code,path:issue.path.join('.'),message:issue.message.slice(0,80)
                                }))};
                        }catch(error){out.cases.TOOL06.contractDiagnosis={errorCode:String(error?.code||error?.message||'UNKNOWN').slice(0,80)};}
                    }
                }
                catch(error){out.cases[caseId]={verdict:'PARTIAL',errorCode:String(error?.message).slice(0,80)};}
            }
        }else{out.cases.TOOL06={verdict:'BLOCKED_DATA'};out.cases.TOOL07={verdict:'BLOCKED_DATA'};}

        // Actual controlled recovery, not merely a selection-unit assertion.
        // Backend stock projection omits per-lot expiry and quality, so a
        // supplementary lot read is required; two authorized read invocations
        // happen sequentially inside THIS same independent acceptance run.
        if(safeGraphIngredient){
            currentCaseId='TOOL08';
            const recoveryRegistry=createToolRegistry(graphReadServices,'BACKEND');
            const primary=await recoveryRegistry.dispatch(admin.id,'getIngredientAvailability',
                {ingredientId:safeGraphIngredient});
            assert.equal(primary.ok,true);
            const missingLots=!Object.prototype.hasOwnProperty.call(primary.output,'batches');
            assert.equal(missingLots,true);
            const decision=await selectToolForTask({
                version:TOOL_SELECTION_VERSION,actorId:admin.id,objective:'EXPIRY',
                dataQuality:'VERIFIED',requiredInformation:['LOTS'],availableInformation:['STOCK'],
                dependencyIds:['read-stock'],completedDependencyIds:['read-stock'],
                inputs:{ingredientId:safeGraphIngredient},
                previousTool:'getIngredientAvailability',
                previousOutcome:'INSUFFICIENT_DATA',recoveryCount:1
            },recoveryRegistry,guardActor);
            assert.equal(decision.status,'SELECTED');
            assert.equal(decision.selectedTool,'getIngredientBatches');
            const supplementary=await recoveryRegistry.dispatch(admin.id,decision.selectedTool,
                {ingredientId:safeGraphIngredient});
            assert.equal(supplementary.ok,true);
            step('TOOL08','Tool Selector','bounded supplementary recovery after real incomplete data',
                'select batches after aggregate lacks lot context',
                'recoveryCount=1, selected='+decision.selectedTool,
                'PASS',{inputReference:safeGraphIngredient,assertion:'actual first and second Registry dispatch, not a unit-only decision'});
            out.cases.TOOL08.actualControlledRecovery={primaryRead:'getIngredientAvailability',
                primaryResultVerified:primary.evidence.validated,missingLots,
                supplementaryTool:decision.selectedTool,
                supplementaryResultValidated:supplementary.evidence.validated,
                recoveredLotCount:supplementary.output.batches.length,
                recoveryCount:1,manualBusinessWrites:0,
                limitation:'Sequential selector+Registry recovery in test runner; live Graph still accepts a fixed two-tool list'};
        }

        // Compare same authoritative business records, including execution and
        // audit counters. In the presence of concurrent writers, do not attribute
        // changes to this read-only runner; report observed mismatch instead.
        out.databaseSnapshots.after=await observe(observedIds);
        out.databaseSnapshots.matches=JSON.stringify(out.databaseSnapshots.before)===
            JSON.stringify(out.databaseSnapshots.after);
        step('ALL','PostgreSQL','read-only AFTER snapshot',
            'no changes from this runner, engine-level transaction read only',
            out.databaseSnapshots.matches?'BEFORE_EQUALS_AFTER':'BEFORE_DIFFERS_AFTER',
            out.databaseSnapshots.matches?'PASS':'PARTIAL',
            {assertion:'current_setting(default_transaction_read_only)=on; before/after exact business counters'});
        for(const caseId of ['TOOL01','TOOL02','TOOL03','TOOL04','TOOL05','TOOL06','TOOL07','TOOL08','TOOL09','TOOL10']){
            if(!out.cases[caseId])out.cases[caseId]={verdict:'NOT_RUN',reason:'EXECUTION_NOT_RECORDED'};
            out.cases[caseId].actualGraphEvidence = graphRuns.find(g=>g.caseId===caseId)??null;
            out.cases[caseId].pln = 'NOT_EXECUTED_IN_REAL_GRAPH';
            out.cases[caseId].finalVerdict = out.cases[caseId].verdict;
            step(caseId,'PLN','evaluatePlanning in real Graph',
                'validated live PER+Backend evidence', 'NOT_EXECUTED','NOT_VERIFIED',
                {assertion:'No fake PLN claim; standalone PLN contract does not equal Graph node'});
        }

        const [readonly] = await client.$queryRawUnsafe(
            'SELECT current_setting(\'default_transaction_read_only\') AS ro');
        assert.equal(readonly.ro,'on');
        out.writesPerformed=false;
        out.status='PARTIAL_CONNECTED_ACCEPTANCE';
        out.completedAt=new Date().toISOString();
        save();
        console.log(JSON.stringify({runId,outcome:out.status,checks:out.checks.length,
            capabilityResults:out.capabilityResults,frontend:out.frontend,
            missingData:out.missingData,readOnly:true}));
    } catch(error) {
        out.status='BLOCKED';
        out.errorCode=String(error?.code||error?.message||'UNKNOWN').replace(/(password|token|secret)\S*/ig,'[REDACTED]').slice(0,100);
        out.completedAt=new Date().toISOString();
        save();
        console.log(JSON.stringify({runId,status:'BLOCKED',errorCode:out.errorCode,secretsOmitted:true}));
        process.exitCode=1;
    } finally {
        if(appServer) await new Promise(resolve=>appServer.close(resolve));
        if(client) await client.$disconnect();
        delete globalThis.prisma;
        stopProxy();
        save();
    }
}
main();
