'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const root=path.resolve(process.argv[2]);
const events=fs.readFileSync(process.argv[3],'utf8').trim().split('\n').map(s=>JSON.parse(s));
const file=path.join(root,'manifests/regression.json');
const manifest=JSON.parse(fs.readFileSync(file,'utf8'));
const cases=events.filter(e=>['test:pass','test:fail'].includes(e.type) && e.details?.type==='test');
if(cases.length!==952) throw Error('Expected original 952 runtime cases, got '+cases.length);
const seen=new Set();
for(const suite of manifest.suites) {
  const matching=cases.filter(e=>path.relative(root,e.entryFile||e.file).replaceAll('\\','/')===suite.file);
  if(!matching.length) throw Error('Missing runtime evidence: '+suite.file);
  suite.declarations=suite.declarations||suite.cases;
  suite.cases=matching.map((e,i)=>({id:createHash('sha256').update(suite.file+'\0'+e.name+'\0'+i).digest('hex').slice(0,16),title:e.name,line:e.line}));
  suite.runtimeCaseCount=matching.length;
  for(const e of matching) seen.add(e);
}
if(seen.size!==952) throw Error('Unmapped runtime cases');
manifest.runtimeCaseCount=952;
const selections={};
for(const tier of ['smoke','core','full','security',...new Set(manifest.suites.flatMap(s=>s.modules))]) {
  const suites=manifest.suites.filter(s=>tier==='security'?s.modules.includes('auth'):['smoke','core','full'].includes(tier)?s.tiers.includes(tier):s.modules.includes(tier));
  selections[tier]={count:suites.reduce((n,s)=>n+s.runtimeCaseCount,0),suites:suites.map(s=>s.file)};
}
fs.writeFileSync(file,JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(root,'manifests/selections.json'),JSON.stringify({version:manifest.version,overlap:true,selections},null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(selections).map(([k,v])=>[k,{cases:v.count,suites:v.suites.length}]))));
