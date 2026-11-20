// TOOL completion: real signed JWT -> Express Business routes -> Prisma -> cafedb,
// READ ONLY. No fixture creation, no job, Graph checkpoint, supplier dispatch or write.
// Explicit opt-in: TOOL_READONLY_CAFEDB_CONFIRMED=YES node apps/api/tests/tool-selection-real-readonly.cafedb.cjs
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
require('dotenv').config({ path: 'apps/api/.env', quiet: true });

const runId = 'tool-real-http-' + crypto.randomUUID();
const root = 'D:/KLTN/cafe-project-artifacts/reports/agent/tool-selection';
fs.mkdirSync(root, { recursive: true });
const outPath = path.join(root, runId + '.json');
const out = {
    runId, startedAt: new Date().toISOString(),
    evidence: 'REAL_CAFEDB_READONLY_JWT_EXPRESS_PRISMA_NO_FIXTURES',
    status: 'NOT_RUN', actorRoles: {}, database: 'cafedb',
    checks: [], capabilityResults: {}, frontend: {}, writesPerformed: false,
    authentication: 'Backend real JWT + live current-account revalidation',
    graphProof: false, exclusiveSharedFileOwnership: false,
    missingData: [], errorCode: null
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
    out.checks.push({label, endpoint: endpoint.replace(/\/[a-z0-9_-]{18,}/gi,'/:id'), status:res.status,
        success:body.success===true});
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
            const outcome=await businessRegistry.dispatch(admin.id,name,inputs);
            assert.equal(outcome.ok,true,outcome.error);
            assert.equal(outcome.evidence.validated,true);
            assert.equal(outcome.evidence.attempts,1);
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
                const response=await http(base,'/api/stocktakes/'+encodeURIComponent(stk.id),
                    adminJwt,'STOCKTAKE_ADMIN');
                assert.equal(response.status,200);
                const projected=await runBusinessRegistry('STOCKTAKE','getStocktakeStatus',
                    {stocktakeId:stk.id,ingredientId});
                assert.equal(projected.createsAdjustment,false);
                assert.equal(projected.grantsApproval,false);
                out.capabilityResults.TOOL04={status:'REAL_HTTP_PRISMA_REGISTRY_PASS_NOT_GRAPH',quality:projected.warnings,
                    stocktakeStatus:projected.status,
                    pendingApproval:projected.pendingApproval,
                    unapprovedVarianceCount:projected.unapprovedVariances.length};
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
                const response=await http(base,'/api/purchase-orders/'+encodeURIComponent(po.id),
                    adminJwt,'PO_ADMIN');
                assert.equal(response.status,200);
                const projected=await runBusinessRegistry('INBOUND','getInboundPurchaseOrder',
                    {purchaseOrderId:po.id,ingredientId});
                assert.equal(projected.createsPurchaseOrder,false);
                assert.equal(projected.supplierExternallyVerified,false);
                assert.equal(projected.contributesToPhysicalStock,false);
                out.capabilityResults.TOOL05={status:'REAL_HTTP_PRISMA_REGISTRY_PASS_NOT_GRAPH',
                    consideration:projected.inboundConsideration,
                    provenanceChecked:projected.provenanceChecked, warnings:projected.warnings};
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

        const [readonly] = await client.$queryRawUnsafe(
            'SELECT current_setting(\'default_transaction_read_only\') AS ro');
        assert.equal(readonly.ro,'on');
        out.writesPerformed=false;
        out.status=out.missingData.length?'PARTIAL_REAL_HTTP_PASS':'REAL_BACKEND_HTTP_PASS';
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
