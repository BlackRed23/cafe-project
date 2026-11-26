'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {pathToFileURL} = require('node:url');
const {spawnSync} = require('node:child_process');
const source = path.resolve(__dirname,'../..');
const root = path.resolve(process.env.CAFE_PROJECT_TEST_ROOT || path.join(source,'../../cafe-project-artifacts/testing'));
const manifest = JSON.parse(fs.readFileSync(path.join(root,'manifests/regression.json'),'utf8'));
const tier = process.argv[2] || 'full';
if (!['smoke','core','module','pr','full','security'].includes(tier)) throw Error('Unknown tier: '+tier);
const known = new Set(manifest.suites.flatMap(s=>s.modules));
let modules = (process.env.REGRESSION_MODULES || '').split(',').filter(Boolean);
if (modules.some(m=>!known.has(m))) throw Error('Unknown regression module');
if (tier === 'pr') {
  const base = process.env.REGRESSION_BASE_SHA;
  if (!/^[a-f0-9]{40}$/.test(base || '')) throw Error('PR base SHA required');
  const diff = spawnSync('git',['diff','--name-only',base+'...HEAD'],{cwd:source,encoding:'utf8'});
  if (diff.status !== 0) throw Error('Cannot compute affected modules');
  // Cross-cutting changes and unknown paths deliberately select all modules.
  const mapping = {auth:['auth'],product:['catalog','inventory','sales','purchasing','agent'],recipe:['catalog','inventory','sales','agent'],ingredient:['catalog','inventory','purchasing','agent'],inventory:['inventory','sales','purchasing','agent'],order:['sales','inventory','purchasing','agent'],payment:['sales','recovery'],purchase:['purchasing','inventory','agent'],supplier:['purchasing','agent']};
  for (const file of diff.stdout.trim().split('\n').filter(Boolean)) {
    const match = /^apps\/api\/src\/modules\/([^/]+)/.exec(file);
    const key = match && Object.keys(mapping).find(k=>match[1].startsWith(k));
    if (key) modules.push(...mapping[key]);
    else if(file.startsWith('apps/agent/src/')) modules.push('agent','purchasing','recovery','auth');
    else if(file.startsWith('apps/web/src/')) modules.push('ui','auth','catalog','inventory','sales','purchasing','agent');
    else modules.push(...known);
  }
}
if (tier === 'module' && !modules.length) modules = [...known];
const selected = manifest.suites.filter(s => tier==='full' ||
  (tier==='security' && s.modules.includes('auth')) ||
  ((tier==='module'||tier==='pr') && s.modules.some(m=>modules.includes(m))) ||
  s.tiers.includes(tier==='pr'?'core':tier) && tier!=='module');
if (!selected.length) throw Error('Empty selection');
const current = ['api','agent','web'].flatMap(app=>fs.readdirSync(path.join(root,'apps',app,'tests')).filter(f=>f.endsWith('.test.cjs')).map(f=>`apps/${app}/tests/${f}`)).sort();
if (JSON.stringify(current)!==JSON.stringify(manifest.suites.map(s=>s.file).sort())) throw Error('Suite inventory drift');
for (const s of manifest.suites) {
  if (crypto.createHash('sha256').update(fs.readFileSync(path.join(root,s.file))).digest('hex')!==s.sha256) throw Error('Test bytes changed: '+s.file);
}
console.log(JSON.stringify({tier, suites:selected.length, modules:[...new Set(modules)]}));
if (process.argv.includes('--list')) {
  console.log(JSON.stringify(selected.map(s=>s.file)));
  process.exit(0);
}
const started=Date.now();
const reportDir=path.join(root,'reports','tier-runs');
fs.mkdirSync(reportDir,{recursive:true});
const evidence=path.join(reportDir,`${tier}-${process.pid}.jsonl`);
// Restart suites launch multiple TS-heavy processes inside their existing deadlines.
// Run them exclusively, rather than weakening assertions or increasing test timeouts.
const exclusive=s=>/\/(mock-recovery|mock-process)\.test\.cjs$/.test(s.file);
const batches=[selected.filter(s=>!exclusive(s)),...selected.filter(exclusive).map(s=>[s])].filter(s=>s.length);
const summary={type:'test:summary',success:true,counts:{tests:0,failed:0,passed:0,cancelled:0,skipped:0,todo:0,topLevel:0,suites:0},duration_ms:0};
fs.writeFileSync(evidence,'');
let exitCode=0;
for(const [i,batch] of batches.entries()) {
  const part=evidence+'.'+i;
  const run=spawnSync(process.execPath,['--test','--test-reporter=tap','--test-reporter-destination=stdout',
    '--test-reporter='+pathToFileURL(path.join(root,'ci/case-reporter.cjs')).href,'--test-reporter-destination='+part,
    '--test-concurrency=4','--test-timeout=180000',...batch.map(s=>path.join(root,s.file))],{
    cwd:source,stdio:'inherit',windowsHide:true,
    env:{...process.env,CAFE_PROJECT_ROOT:source,NODE_ENV:'test',DATABASE_URL:'postgresql://ci_no_write:ci_no_write@127.0.0.1:1/ci_unreachable',AGENT_GRAPH_READONLY:'YES'},
  });
  const data=fs.existsSync(part)?fs.readFileSync(part,'utf8'):'';
  fs.appendFileSync(evidence,data);
  const events=data.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line));
  const result=events.filter(e=>e.type==='test:summary'&&!e.file).at(-1);
  if(run.status!==0 || !result?.success) {exitCode=1;summary.success=false;}
  if(result) {
    for(const key of Object.keys(summary.counts)) summary.counts[key]+=result.counts[key]||0;
    summary.duration_ms+=result.duration_ms;
  }
}
const expected=selected.every(s=>Number.isInteger(s.runtimeCaseCount))?selected.reduce((n,s)=>n+s.runtimeCaseCount,0):undefined;
const incomplete=!summary || !summary.success || summary.counts.skipped>0 || summary.counts.todo>0 || summary.counts.cancelled>0 || (expected!==undefined && summary.counts.tests!==expected);
exitCode=exitCode || (incomplete ? 1 : 0);
summary.success=exitCode===0;
fs.appendFileSync(evidence,JSON.stringify(summary)+'\n');
console.log(JSON.stringify({tier,elapsedSeconds:(Date.now()-started)/1000,exitCode,evidence,summary}));
process.exit(exitCode);
