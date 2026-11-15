// Offline R3 evidence collector/verifier. No application imports or database access.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const root=path.resolve(__dirname,'../../../..');process.chdir(root);
const base='docs/KLTN_PLAN/RECOVERY/';
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const old=JSON.parse(fs.readFileSync(base+'evidence/source-inventory-r2.json','utf8'));
const historical=Object.keys(old.source_sha256).filter(p=>/WEEK_0[1-5]\.md$|WEEK_04_AUDIT\//.test(p));
for(const p of historical) if(hash(p)!==old.source_sha256[p]) throw Error('Historical input changed: '+p);
const ledger=fs.readFileSync(base+'R3_TASK_STATUS.md','utf8');
const ids=[...ledger.matchAll(/^\| (W\d\d-T\d\d) \|/gm)].map(m=>m[1]);
if(ids.length!==20||new Set(ids).size!==20)throw Error('Expected 20 unique tasks');
const rows=ledger.split('\n').filter(l=>/^\| W\d\d-T/.test(l));
const counts=Object.fromEntries(['VERIFIED_COMPLETE','PARTIAL','BLOCKED'].map(s=>[s,rows.filter(l=>l.endsWith('| '+s+' |')).length]));
if(counts.VERIFIED_COMPLETE!==2||counts.PARTIAL!==5||counts.BLOCKED!==13) throw Error('Count mismatch');
const reports=['R3_REPORT.md','R3_BUSINESS_RULES.md','R3_TRACEABILITY.md','R3_TASK_STATUS.md','R3_TEST_EVIDENCE.md','BACKLOG_W01_W04.md','RECOVERY_EXECUTION.md','ACCEPTANCE_STATUS.md','TEST_EVIDENCE.md'];
for(const p of reports){const full=base+p;for(const m of fs.readFileSync(full,'utf8').matchAll(/\]\(([^)]+)\)/g)){if(!/^https?:|^#/.test(m[1])&&!fs.existsSync(path.resolve(path.dirname(full),m[1].split('#')[0])))throw Error('Missing link '+m[1]);}}
const runs=JSON.parse(fs.readFileSync(base+'evidence/execution-metadata-r3.json','utf8'));
if(runs.runs.some(r=>r.exit!==0))throw Error('Test/typecheck failure');
const log=fs.readFileSync(base+'evidence/r3-regression.log','utf8');
if(!/tests 94/.test(log)||!/pass 94/.test(log)||!/fail 0/.test(log))throw Error('Regression count mismatch');
const inputs=[...new Set([...Object.keys(old.source_sha256),...reports.map(p=>base+p),base+'evidence/collect-r3.cjs',base+'evidence/execution-metadata-r3.json',...runs.runs.map(r=>base+'evidence/'+r.log)])].sort();
const result={revision:'r3',captured_at:new Date().toISOString(),display_timezone:'Asia/Saigon',head:cp.execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),historical_inputs_unchanged:historical.length,task_counts:counts,total:20,original_w01_w04_total:16,source_model_count:old.source_model_count,source_enum_count:old.source_enum_count,generated_client:old.generated_client,database_access:'NOT_ATTEMPTED; explicit prohibition',source_sha256:Object.fromEntries(inputs.map(p=>[p,hash(p)])),changed_since_r2:Object.keys(old.source_sha256).filter(p=>hash(p)!==old.source_sha256[p])};
fs.writeFileSync(base+'evidence/source-inventory-r3.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({historicalInputsUnchanged:historical.length,total:20,counts,hashedInputs:inputs.length,changedSinceR2:result.changed_since_r2}));
