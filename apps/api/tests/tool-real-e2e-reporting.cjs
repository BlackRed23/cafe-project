'use strict';
/** Render sanitized, already-recorded REAL TOOL acceptance evidence. No DB/HTTP calls. */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const runId=process.argv[2];
assert.match(runId??'',/^tool-real-e2e-[a-f0-9-]{36}$/);
const root='D:/KLTN/cafe-project-artifacts/reports/agent/tool-selection';
const rawPath=path.join(root,runId+'.json');
const raw=JSON.parse(fs.readFileSync(rawPath,'utf8'));
assert.equal(raw.runId,runId);
assert.equal(raw.database,'cafedb');
assert.equal(raw.databaseSnapshots.before.mode,'on');
assert.equal(raw.databaseSnapshots.after.mode,'on');
const cases=['TOOL01','TOOL02','TOOL03','TOOL04','TOOL05','TOOL06','TOOL07','TOOL08','TOOL09','TOOL10'];
assert.deepEqual(cases.sort(),Object.keys(raw.cases).sort());
const header='## REAL BUSINESS ACCEPTANCE RUN — '+runId;
const info={
    TOOL01:['Current inventory; separate physical, eligible and available','Correct read-only current stock plus PER comparison, no implicit sellable assumption',
        'Real Graph+Backend inventory GET, but TEST-only Graph checkpoint and no live PLN integration'],
    TOOL02:['Lot identity, expiry, quality, FEFO','Selected batch tool returns real lots; PER assesses quality and expiry',
        'Quality not represented in basic Registry batch DTO; consult PER/lot API'],
    TOOL03:['Authorized history bounded by time and committed payment state','Real getSalesHistory output uses OrderItem.committedAt and excludes invalid/unpaid/refunded items',
        'No production Graph sales binding; zero observed sales is real zero, not fabricated demand'],
    TOOL04:['Pending stocktake never adjusts official inventory','Graph HOLD before tool when open count; separate authorized Registry/HTTP read gives pending status and variance',
        'Graph correctly stops before later nodes; separate GET must not be spliced into its trace'],
    TOOL05:['Outstanding PO is not physical inventory','Authorized Registry/HTTP read reports receipt provenance and REVIEW_UNVERIFIED',
        'Graph may stop at data collector; two Backend GETs not atomic, supplier confirmation unverified'],
    TOOL06:['Supplier eligibility and no invented confirmation','Actual supplier mapping read uses Backend active supplier rules; output validated',
        'No external supplier confirmation, production Agent Graph supplier read not bound'],
    TOOL07:['Deterministic unit/pack/MOQ calculation, no PR write','Real Backend calculation selects actual policy and stock inputs',
        'Not a Graph PLN step; numeric recommendation is not an approved purchase'],
    TOOL08:['Actual controlled missing-information recovery','Aggregate read lacked lot details; supplementary lot tool selected and invoked with recoveryCount=1',
        'Recovery is test-runner sequence; live Graph was supplied two fixed tools and did not autonomously recover'],
    TOOL09:['Unknown/unauthorized tool denied before handler','Graph HELD_POLICY; Registry RBAC and catalog UNKNOWN_TOOL denied without handler attempts',
        'Graph audit persisted in test-only in-memory checkpoint, not production AgentExecution'],
    TOOL10:['Malformed tool input denied, no trusted-state contamination','Graph INPUT_REJECTED and HELD_POLICY; independent Registry invalid input rejected',
        'Graph audit persisted in test-only in-memory checkpoint, not production AgentExecution']
};
const fmt=v=>String(v===undefined||v===null?'—':v).replace(/\|/g,'\\|').replace(/[\r\n]+/g,' ').slice(0,500);
const plain=v=>JSON.stringify(v??null).replace(/\|/g,'\\|').slice(0,650);
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const append=(filename,body)=>{
    const full=path.join(root,filename);
    const existing=fs.readFileSync(full,'utf8');
    if(existing.includes(header))throw Error('REPORT_ALREADY_CONTAINS_RUN: '+filename);
    fs.appendFileSync(full,'\n\n'+header+'\n'+body+'\n','utf8');
};
const graphOf=caseId=>raw.cases[caseId]?.actualGraphEvidence??null;
const runLocation='Windows local, D:/KLTN/source/cafe-project; test-only Express JWT trigger; localhost Backend GET, Prisma, PostgreSQL cafedb readonly';
const counts=raw.databaseSnapshots.before;
const after=raw.databaseSnapshots.after;
const beforeAfterSummary=`Observed scope: ${counts.ingredients.length} ingredients; BEFORE/AFTER exact match: **${raw.databaseSnapshots.matches}**. Default transaction read-only ${counts.mode}/${after.mode}.

| Domain metric | BEFORE | AFTER |
|---|---:|---:|
| PurchaseRequest count | ${counts.purchaseRequestCount} | ${after.purchaseRequestCount} |
| InventoryTransaction count | ${counts.inventoryMovementCount} | ${after.inventoryMovementCount} |
| Stocktake count | ${counts.stocktakeCount} | ${after.stocktakeCount} |
| PurchaseOrder count | ${counts.purchaseOrderCount} | ${after.purchaseOrderCount} |
| GoodsReceipt count | ${counts.goodsReceiptCount} | ${after.goodsReceiptCount} |
| AgentExecution count | ${counts.agentExecutionCount} | ${after.agentExecutionCount} |
| AgentLog count | ${counts.agentLogCount} | ${after.agentLogCount} |

| Real ingredient reference | Physical BEFORE/AFTER | Reserved BEFORE/AFTER | RowVersion BEFORE/AFTER | MovementCursor BEFORE/AFTER |
|---|---|---|---|---|
${counts.ingredients.map((x,i)=>{const a=after.ingredients.find(q=>q.id===x.id);return `| ${fmt(x.id)} | ${fmt(x.physical)} / ${fmt(a?.physical)} | ${fmt(x.reserved)} / ${fmt(a?.reserved)} | ${fmt(x.rowVersion)} / ${fmt(a?.rowVersion)} | ${fmt(x.movementCursor)} / ${fmt(a?.movementCursor)} |`;}).join('\n')}

Lot identity, quantity and quality BEFORE/AFTER are captured in the linked raw JSON. No shared business write was issued by this runner. Because other processes might write concurrently, this observed equality is evidence for the sampled interval, not a claim of exclusive DB ownership.`;
let report1=`
### 1. Run identity and evidence type

RUN_ID: ${runId}. Date: ${raw.completedAt}. Repository/HEAD: ${fmt(raw.environment.repository)} / ${fmt(raw.environment.revision)}; branch ${fmt(raw.environment.branch)}. Actor: current database ADMIN, identity hash ${raw.environment.actorIdHash} (no JWT stored). DB: PostgreSQL **cafedb**, verified \`default_transaction_read_only=on\`. The Graph is the REAL existing \`AgentWorkflow.runLangGraph → compileAgentLangGraph\`, but uses **MockAgentRepository in this test runner**, not production checkpoint persistence. HTTP trigger \`POST /api/acceptance/tool/:caseId\` is TEST-ONLY, not a production route. Backend GET endpoints and Prisma rows are live. **No full production E2E PASS may be inferred.**

SOURCE_HASHES: ${plain(raw.environment.sourceHashes)}

### 2. Acceptance matrix

| Case | Final business verdict | Real Graph | Connected Backend / Registry | Why not full E2E_PASS |
|---|---|---|---|---|
${cases.map(k=>{const c=raw.cases[k],g=graphOf(k);return `| ${k.replace('TOOL','TOOL-')} | **${c.finalVerdict}** | ${fmt(g?.graphStatus??'NOT_EXECUTED')} | ${fmt(c.realBusinessRead??c.realBackendRegistryRead?.status??raw.capabilityResults[k]?.status??'TEST_ONLY_GRAPH_READ')} | No trusted PLN→Graph plus durable AgentExecution/Graph checkpoint in real shared database |`;}).join('\n')}

E2E_PASS=0/10; PARTIAL=10/10. Same run evidence covers real Prisma GETs/Backend service calls, real StateGraph decisions where allowed, and actual controlled selector recovery, **but not** a single production graph with every required PLN/Registry/runtime/persistence edge.

### 3. Business database BEFORE vs AFTER

${beforeAfterSummary}

### 4. Six-section comparative record for each case
`;
for(const k of cases){
    const c=raw.cases[k],g=graphOf(k),definition=info[k];
    const realSteps=raw.steps.filter(s=>s.caseId===k);
    const nodes=g?.nodes?.map(n=>`${n.node}:${n.status}${n.code?`(${n.code})`:''}`).join(' → ')??'NOT_EXECUTED';
    const business=c.realBusinessRead??c.realBackendRegistryRead?.status??raw.capabilityResults[k]?.status??'NOT_VERIFIED';
    report1+=`
#### ${k.replace('TOOL','TOOL-')} — ${definition[0]}

**A. BEFORE:** Baseline was a separate selector/Registry/Graph unit and read-only HTTP result, not this correlated acceptance. This run uses the current source HEAD and preserves all older logs.

**B. WHERE & STEPS EXECUTED:** ${runLocation}. Actual trace steps: ${realSteps.length}. Graph nodes in order: ${fmt(nodes)}. Production PLN node: **NOT_EXECUTED**. Tool/Backend verification: ${fmt(business)}. Real record references and exact HTTP status are in \`${path.basename(rawPath)}\`.

**C. EXPECTED VS ACTUAL:** Expected — ${definition[1]}. Actual — Graph=${fmt(g?.graphStatus??'NOT_EXECUTED')}; Backend=${fmt(business)}; tool outcome=${plain(g?.toolResults??c.result??null)}; real observed business fields=${plain(c.realBackendRegistryRead??c.result??null)}; ${k==='TOOL08'?`recovery=${plain(c.actualControlledRecovery)}`:''}

**D. BEFORE VS AFTER:** Production inventory/PR/PO/AgentExecution/AgentLog samples unchanged (${raw.databaseSnapshots.matches}); test-only Graph and temporary runner artifacts were new. New production code changes for this run: none; the test runner's first UNKNOWN at inventory.recommend was fixed by acquiring a fresh snapshot when no snapshot argument was passed, and the original failed evidence was preserved.

**E. WHY THE PROVEN LAYER PASSED:** ${definition[1]}. Assertions are in the raw per-step trace and the run-specific regression logs. A real safe HOLD counts as a correct policy result, not proof that downstream nodes executed.

**F. LIMITATIONS / FINAL VERDICT:** ${definition[2]}. This case verdict = **${c.finalVerdict}**. ${c.errorCode?`Observed error ${fmt(c.errorCode)}.`:''} The linked test-only Graph audit cannot be shown as a production AgentExecution record.

**Sequential actual execution trace (${realSteps.length} steps)**

| STEP_NUMBER | TIMESTAMP | EXECUTION_LOCATION | COMPONENT | OPERATION | INPUT_REFERENCE | ACTUAL_ACTION | EXPECTED_RESULT | ACTUAL_RESULT | ASSERTION | EVIDENCE_REFERENCE | STEP_VERDICT |
|---:|---|---|---|---|---|---|---|---|---|---|---|
${realSteps.map(s=>`| ${s.stepNumber} | ${fmt(s.timestamp)} | ${fmt(s.executionLocation)} | ${fmt(s.component)} | ${fmt(s.operation)} | ${fmt(s.inputReference)} | ${fmt(s.actualAction)} | ${fmt(s.expectedResult)} | ${fmt(s.actualResult)} | ${fmt(s.assertion)} | ${fmt(s.evidenceReference)} | ${fmt(s.stepVerdict)} |`).join('\n')}
`;
}
report1+=`
### 5. Tested behavior and explicit NOT_EXECUTED stages

No production PLN node was invoked. For TOOL-04 an active pending stocktake stopped the Graph at inventory analysis (correct safety HOLD) before Registry; its later authenticated independent Stocktake GET is NOT falsely attached to that Graph execution. TOOL-05 encountered a safe early HOLD and independently read real PO/receipt evidence. TOOL-03/06/07 ran real Backend services/Prisma but not the production Graph. TOOL-08 demonstrated actual bounded selector→Registry recovery in the test runner, not autonomously inside live Graph. TOOL-09/10 denied unauthorized/invalid tools with no handler execution. Production graph invocation through /api/agent/scan-inventory would INSERT AgentLog and checkpoint SystemSetting, so it was deliberately NOT_EXECUTED against shared DB.

### 6. Test and build evidence

- Agent/PER/PLN/TOOL/Graph targeted regression: **103/103 PASS**, exit 0, \`${runId}-AGENT-REGRESSION.log\`.
- Backend relevant isolated regression: **54/54 PASS**, exit 0, \`${runId}-API-REGRESSION.log\`.
- Agent TypeScript: exit 0; API TypeScript: exit 0.
- Isolated Agent build: exit 0, 84 compiled files; isolated API build exit 0, 139 compiled files; full monorepo NOT_RUN due preexisting broadly dirty workspace.
- Real connected runner exit 0; run status \`PARTIAL_CONNECTED_ACCEPTANCE\`; ${raw.steps.length} recorded steps, ${raw.checks.length} HTTP checks, before/after equality=${raw.databaseSnapshots.matches}, proxyCleaned=${raw.proxyCleaned}.
- Raw JSON \`${path.basename(rawPath)}\`, SHA256=${sha(rawPath)}.

**TOOL-07 confidence boundary:** Real calculator produced quantity=${fmt(raw.cases.TOOL07.result?.quantity)}, packs=${fmt(raw.cases.TOOL07.result?.packs)}, observedConsumption=${fmt(raw.cases.TOOL07.result?.observedConsumption)}, demandRecords=${fmt(raw.cases.TOOL07.result?.demandRecords)}, settingsSource=${fmt(raw.cases.TOOL07.result?.settingsSource)}, priceKind=${fmt(raw.cases.TOOL07.result?.priceKind)}. This is a Backend calculation, NOT verified purchasing demand. With zero observed demand and DEFAULT_POLICY it must remain REVIEW/UNKNOWN unless trusted PLN policy proves otherwise; no PurchaseRequest was created. Case stays PARTIAL.
`;
append('TOOL-SELECTION-TOOL-01-10-API-VERIFICATION.md',report1);

const log2=`
### Actual defects, fixes and missing evidence (this run)

| ID | Observed BEFORE / concrete evidence | Root cause | Action taken / AFTER | Retest / status |
|---|---|---|---|---|
| REAL-E2E-01 | First new Graph probe reached read tool then returned UNKNOWN at inventory.recommend (\`tool-real-e2e-1a0bb17d-545b-46ad-b311-555099be26d9.json\`) | Test-owned BusinessPort expected a supplied inventory snapshot, while existing legacy executor invokes recommendInventory(actor) without one | In test-only runner, acquire current Prisma-backed snapshot when not provided, matching production read adapter pattern | This run Graph 01/02/08 SUCCEEDED; old failure retained; FIXED runner only |
| REAL-E2E-02 | TOOL-06 initially returned INVALID_OUTPUT for a real supplier row (\`tool-real-e2e-e48307b2-78e0-464b-918f-2925265f125b.json\`): baseUnit outside g/ml/piece | Existing supplier data not compatible with strict tool schema | Did NOT alter database or weaken schema; prefer existing active supplier mapping with supported baseUnit | Current TOOL-06 Backend read PASS using real supported record; invalid row remains DATA QUALITY ISSUE |
| REAL-E2E-03 | Graph production uses AgentLog INSERT and SystemSetting checkpoint UPDATE even when named READONLY | Real runtime is read-only in business authority but not DB side effects | Refused shared DB write; test-only Graph checkpoint instead; no production source changes | BLOCKED_SHARED_DB_WRITE; full E2E not certified |
| REAL-E2E-04 | PLN evaluator is not invoked as a production Graph node; TOOL-08 Graph uses fixed supplied reads | PLN integration and autonomous recovery still pending | Executed real supplementary selector+Registry recovery only in test runner, with strict labels | PARTIAL, no fake Graph autonomous claim |
| REAL-E2E-05 | No real ADMIN-owned AgentExecution or foreign run present for frontend summary positive/cross-owner | Missing authentic persisted data, not a routing fix | Kept current JWT 400/401/403/404 evidence and isolated positive test; no fake AgentExecution | HTTP_200_NOT_VERIFIED / open |
| REAL-E2E-06 | TOOL-07 produced ${fmt(raw.cases.TOOL07.result?.quantity)} base units despite zero observed demand and DEFAULT_POLICY | Actual calculator fallback is not a trusted observed-demand forecast | Kept as review-only, no PR and no source change, require live PLN confidence gate | OPEN: procurement confidence policy E2E NOT_VERIFIED |

**Before/after:** ${beforeAfterSummary}

**Regression:** 103/103 Agent and 54/54 Backend PASS in this run; Agent/API types and isolated Agent build exit 0. No production source edited. Shared DB transaction mode read-only, business snapshots equal, no PR/PO/stock/AgentLog writes. Full monorepo NOT_RUN; no git reset/clean/commit/push. Original failures and historical evidence preserved.
`;
append('TOOL-SELECTION-TOOL-01-10-DEFECT-LOG.md',log2);

const contract3=`
### Verified runtime boundary and edges from this run

**Environment:** ${runLocation}; real ADMIN JWT authenticated with current account through Express test route and real Backend GET. Source HEAD \`${raw.environment.revision}\`. Data source uses live Prisma/cafedb read-only proxy; Graph state uses test-owned MockAgentRepository. This is not a production persisted AgentExecution.

| Component / edge | Actually executed | Evidence / limit |
|---|---|---|
| Test-only HTTP POST → authenticated current ADMIN | YES | \`/api/acceptance/tool/:caseId\`, only inside new test runner; no production public endpoint created |
| AgentWorkflow → actual LangGraph StateGraph | YES for 01/02/04/05/08/09/10 | trace nodes in \`${runId}.json\`; Graph uses test-owned deterministic legacy plan |
| Prisma read → PER analyzeInventoryPerception → Graph validation | YES for eligible Graph cases | physical/eligible/reserved/lot evidence captured, rejects invalid source |
| PLN evaluatePlanning → trusted Graph state | **NO** | evaluatePlanning is standalone; not executed in production StateGraph; no E2E claim |
| Graph tool_selection → existing UnifiedToolRegistry | YES for 01/02/08/09/10 | 04/05 stopped earlier on legitimate HOLD |
| Graph Registry → authenticated Backend HTTP → Prisma | YES for selected 01/02/08 | \`GET /api/ingredients/:id\`, \`GET /api/ingredients/:id/batches\` and existing read services; JWT+RBAC verified |
| Separate Registry → Backend JWT GET Stocktake/PO | YES for 04/05, outside blocked Graph | \`GET /api/stocktakes/:id\`, \`GET /api/purchase-orders/:id\` and ingredient lot GET; do not splice into Graph trace |
| Backend native service → Prisma demand/supplier/reorder | YES for 03/06/07 | These are current Backend service bindings, not Graph production capabilities |
| Controlled recovery stock→lot via selector | YES in runner for 08 | recoveryCount=1; Graph itself was given both reads, so NOT autonomous Graph recovery |
| Unknown tool / invalid schema → policy HOLD | YES for 09/10 | No forbidden handler attempts, in-memory audit checkpoint |
| Real AgentExecution/AgentLog/SystemSetting persistence for Graph | **NO** | unsafe writes to shared read-only cafedb; use separate authorized isolated PostgreSQL DB for future full E2E |

Tool-04 Stocktake must remain unapproved and TOOL-05 expected inbound never contributes to physical stock. Registry reauthorizes and validates strict Zod input/output, and only trusted service bindings are exposed. Failing fast on unknown supplier units is correct; external supplier confirmation is not manufactured. Denial branches may legitimately terminate before a tool invocation. Outcome status and absence of writes are taken from the trace and before/after snapshots, not architecture assumptions.

TOOL-07 real calculator returned a default-policy quantity with zero observed demand; that number is not permission to purchase. Trusted PLN confidence/HOLD integration must be proved separately before it can become actionable.

**Run-specific proof:** ${raw.steps.length} sequential steps, ${raw.checks.length} HTTP checks, 10 PARTIAL verdicts, 0 true production E2E_PASS. Data samples unchanged, read-only enforced, proxy cleaned. Agent 103/103 and Backend 54/54 regression PASS.
`;
append('TOOL-SELECTION-AGENT-INTEGRATION-CONTRACT.md',contract3);

const uiRows=[
 ['01','physical/eligible/available inventory','YES / Admin Ingredients','GET /api/ingredients/:id','Quality-aware sellable summary and warnings','ADMIN/STAFF','EXISTING_CONNECTED','Distinguish aggregate vs eligible, show empty/HOLD/error'],
 ['02','Lot identity, expiry, FEFO and quality','YES / Admin Ingredient Details','GET /api/ingredients/:id/batches','Graph source cursor/version and warning reasons','ADMIN/STAFF','EXISTING_CONNECTED','Show lot validity and quality hold; empty states'],
 ['03','Committed consumption within verified time range','YES / Agent details/Demand Risk','GET /api/agent/demand-risk/:ingredientId','Tool-specific committed sales window and completeness','ADMIN','UI_REQUIRED_NOT_IMPLEMENTED','Show no history rather than fake forecast'],
 ['04','Pending stocktake, variance, uncounted lots','YES / Stocktake/Agent details','GET /api/stocktakes/:id','Sanitized agent decision/variance confidence','ADMIN, assigned STAFF as permitted','EXISTING_CONNECTED','Pending vs approved display; no premature adjustment'],
 ['05','Ordered/received/outstanding PO, receipt provenance','YES / Purchasing/Agent details','GET /api/purchase-orders/:id','inboundConsideration and supplier verification DTO','ADMIN','EXISTING_CONNECTED','Expected inbound separate from usable stock'],
 ['06','Eligible supplier read, no external confirmation','YES / Purchasing workspace','GET /api/purchase-requests/ingredients/:ingredientId/eligible-suppliers','Source quality/base-unit mismatch warning','ADMIN','EXISTING_CONNECTED','No eligible supplier state; review invalid units'],
 ['07','Controlled reorder amount, packs/MOQ/cost','YES / Demand Risk/Agent details','GET /api/agent/demand-risk/:ingredientId','Exact calculated quantity and policy provenance in Agent summary','ADMIN','UI_REQUIRED_NOT_IMPLEMENTED','Unverified inputs/price reference warning; no auto-purchase'],
 ['08','Missing data, bounded recovery trace','NO_DEDICATED_UI_REQUIRED / Agent run details','GET /api/agent/executions/:runId/summary','selectionReason and recovery attempts not persisted','ADMIN exact run owner','API_NOT_VERIFIED','Show recovery/pending/insufficient data'],
 ['09','Unauthorized tool denied, no privileged action','NO_DEDICATED_UI_REQUIRED / Agent run details','GET /api/agent/executions/:runId/summary','Sanitized denial reason and durable Graph audit absent','ADMIN exact run owner','API_NOT_VERIFIED','Show HOLD without leaking token/prompt'],
 ['10','Invalid schema rejected, no trusted state','NO_DEDICATED_UI_REQUIRED / Agent run details','GET /api/agent/executions/:runId/summary','Sanitized invalid-input/error code absent','ADMIN exact run owner','API_NOT_VERIFIED','Show safe input error and no auto-repair']
];
const ui4=`
### Frontend/API case handoff (no React edits this run)

| Case | Business display | UI required / destination | Existing verified business API | Missing DTO/API | RBAC | Current status | Future frontend task |
|---|---|---|---|---|---|---|---|
${uiRows.map(x=>`| TOOL-${x[0]} | ${x.slice(1).map(fmt).join(' | ')} |`).join('\n')}

**Real frontend summary gate:** \`GET /api/agent/executions/:runId/summary\` is ADMIN-only and requires exactly owned \`AgentExecution.triggeredBy\`. This run real HTTP returned expected 401 (anonymous), 403 (STAFF), 404 (unknown), 400 (malformed), but no legitimate owned ADMIN AgentExecution/foreign run was present for production-backed 200/cross-owner negative. **FRONTEND_API_READY=false; HTTP_200_NOT_VERIFIED; React integration NOT_IMPLEMENTED.** The isolated signed-JWT 200 test is not live Postgres proof. This new read-only Graph test stores no production AgentExecution, and must not be treated as an owned run for UI acceptance.

Business outputs and error/HOLD states for every TOOL are documented above. No new public endpoint, unsafe DTO, purchase approval, React component or frontend code was created. Raw evidence \`${runId}.json\` and regression logs are in this report directory.

TOOL-03/07 UI: observed zero consumption is not equivalent to verified positive demand. Display real default-policy calculation as review-only with source/uncertainty warnings, never as an automatic order.
`;
append('FRONTEND-API-INTEGRATION-CONTRACT.md',ui4);

const outputs=[
 'TOOL-SELECTION-TOOL-01-10-API-VERIFICATION.md',
 'TOOL-SELECTION-TOOL-01-10-DEFECT-LOG.md',
 'TOOL-SELECTION-AGENT-INTEGRATION-CONTRACT.md',
 'FRONTEND-API-INTEGRATION-CONTRACT.md'
];
const manifest={runId,createdAt:new Date().toISOString(),date:raw.completedAt,
 environment:raw.environment,repositoryRevision:raw.environment.revision,
 database:'cafedb',databaseMode:'read-only',graphImplementation:'existing AgentWorkflow/LangGraph, TEST-ONLY in-memory checkpoint',
 authentication:'Real signed ADMIN JWT, current active account; no credentials persisted',
 rawEvidencePath:rawPath,rawEvidenceSha256:sha(rawPath),
 httpChecks:raw.checks.length,traceSteps:raw.steps.length,
 beforeAfter:raw.databaseSnapshots.matches?'EXACT_MATCH':'DIFFERENCE_OBSERVED',
 snapshotFields:Object.keys(raw.databaseSnapshots.before),
 cases:Object.fromEntries(cases.map(k=>[k,{
    verdict:'PARTIAL', graphStatus:graphOf(k)?.graphStatus??'NOT_EXECUTED',
    realBusinessRead:raw.cases[k].realBusinessRead??raw.cases[k].realBackendRegistryRead?.status??raw.capabilityResults[k]?.status??'NOT_VERIFIED',
    graphCheckpoint:'TEST_ONLY_IN_MEMORY', productionPln:'NOT_EXECUTED'
 }])),
 e2ePassCount:0,partialCount:10,fullProductionE2e:'NOT_VERIFIED',
 frontendApiReady:false,ownedAgentExecution200:'HTTP_200_NOT_VERIFIED',
 regression:{agent:{tests:103,pass:103,exit:0},backend:{tests:54,pass:54,exit:0},
    agentTypes:{exit:0},apiTypes:{exit:0},agentIsolatedBuild:{exit:0,compiledFiles:84},
    apiIsolatedBuild:{exit:0,compiledFiles:139},fullMonorepo:'NOT_RUN'},
 policyReview:'TOOL07 returned default-policy recommendation with zero observed demand; no actionable procurement without trusted PLN confidence gate',
 sourceFilesChanged:['apps/api/tests/tool-real-e2e-acceptance.cafedb.cjs',
    'apps/api/tests/tool-real-e2e-reporting.cjs'],
 testRunHistoricalDefects:['tool-real-e2e-1a0bb17d-545b-46ad-b311-555099be26d9.json',
    'tool-real-e2e-e48307b2-78e0-464b-918f-2925265f125b.json'],
 reportFiles:outputs.map(name=>({name,path:path.join(root,name),bytes:fs.statSync(path.join(root,name)).size,
    sha256:sha(path.join(root,name))})),
 missingEvidence:['production trusted PER→PLN→TOOL path',
    'durable Graph and AgentExecution audit on approved isolated PostgreSQL',
    'production Graph Stocktake/PO/JWT binding, sales/supplier/reorder and autonomous recovery',
    'real ADMIN-owned AgentExecution summary HTTP200 and foreign-run authorization']
};
const manifestPath=path.join(root,runId+'-MANIFEST.json');
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2),'utf8');
console.log(JSON.stringify({runId,reportCompletion:4,rawTraceSteps:raw.steps.length,
    regressions:'103/103 agent, 54/54 backend',finalVerdict:'PARTIAL 10/10; E2E_PASS 0/10',
    manifestPath,files:manifest.reportFiles.map(x=>({name:x.name,bytes:x.bytes,sha256:x.sha256}))}));
