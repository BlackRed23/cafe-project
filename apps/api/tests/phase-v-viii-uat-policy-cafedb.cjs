// Opt-in isolated acceptance runner for existing real UAT and read-only policy
// audit. Owns a temporary Docker TCP proxy; never alters cafe_postgres.
// Usage: PHASE_VIII_CAFEDB_CONFIRMED=YES node apps/api/tests/phase-v-viii-uat-policy-cafedb.cjs
'use strict';
const assert = require('node:assert/strict');
const {randomUUID} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const {execFileSync, spawnSync} = require('node:child_process');
require('dotenv').config({path:'apps/api/.env',quiet:true});

const docker = (args, timeout=15000) =>
  execFileSync('docker',args,{encoding:'utf8',timeout,windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
const root = process.cwd();
const outputRoot='D:/KLTN/cafe-project-artifacts/reports/acceptance';
const id='phase-v-viii-uat-policy-'+randomUUID();
const evidence=path.join(outputRoot,id+'.json');
fs.mkdirSync(outputRoot,{recursive:true});
const riskOnly=process.env.PHASE_VIII_RISK_ONLY==='YES';
const proposalOnly=process.env.PHASE_VIII_PROPOSAL_ONLY==='YES';
const backtestOnly=process.env.PHASE_VIII_BACKTEST_ONLY==='YES';
const policyOnly=process.env.PHASE_VIII_POLICY_ONLY==='YES';
const record={runId:id,start:new Date().toISOString(),database:'cafedb',
  cases:['UAT01','UAT09','UAT12'],proxy:{},runs:[],status:'NOT_RUN',
  scope:policyOnly?'POLICY_AUDIT_ONLY':backtestOnly?'DEMAND_BACKTEST_ONLY':proposalOnly?'PROPOSAL_BOUNDARY_ONLY':riskOnly?'RISK_ONLY':'UAT_POLICY_AND_RISK',
  notes:['Real JWT HTTP Prisma, no real payment/email; temporary test-owned proxy',
    'Policy audit is read only; business-owner approval never inferred']};
const serialize=x=>JSON.stringify(x,(key,value)=>
  /secret|password|token|authorization|databaseURL/i.test(key)?'[REDACTED]':
    typeof value==='bigint'?String(value):value,2);
const save=()=>fs.writeFileSync(evidence,serialize(record));
function runScript(name,relative,env,timeout=200000){
  const res=spawnSync(process.execPath,[relative],{
    cwd:root,env:{...process.env,...env},windowsHide:true,
    encoding:'utf8',timeout,maxBuffer:2*1024*1024
  });
  const log=path.join(outputRoot,id+'-'+name+'.log');
  fs.writeFileSync(log,(res.stdout||'')+'\n'+(res.stderr||''),'utf8');
  const item={name,exitCode:res.status,signal:res.signal,error:res.error?.code,
    log,outputTail:(res.stdout||'').slice(-1700),errorTail:(res.stderr||'').slice(-600)};
  record.runs.push(item);save();
  console.log(serialize({name,exitCode:item.exitCode,log,outputTail:item.outputTail,errorTail:item.errorTail}));
  return res.status===0 && !res.error;
}
async function unusedPort(){
  return new Promise((resolve,reject)=>{
    const server=net.createServer();
    server.once('error',reject);
    server.listen(0,'127.0.0.1',()=>{
      const port=server.address().port;server.close(()=>resolve(port));
    });
  });
}
async function tcpReady(port){
  for(let i=0;i<40;i++){
    try {
      await new Promise((resolve,reject)=>{
        const socket=net.connect({host:'127.0.0.1',port});
        socket.once('connect',()=>{socket.end();resolve()});
        socket.once('error',reject);
        socket.setTimeout(500,()=>socket.destroy(Error('TIMEOUT')));
      });return true;
    }catch{await new Promise(resolve=>setTimeout(resolve,180));}
  }return false;
}
async function verifiedPostgresReady(port) {
  const { PrismaClient } = require('@prisma/client');
  const u = new URL(process.env.DATABASE_URL);
  assert.equal(u.pathname, '/cafedb');
  u.hostname = '127.0.0.1';
  u.port = String(port);
  const connection = new PrismaClient({ datasources: { db: { url: u.toString() } } });
  try {
    for (let attempt = 0; attempt < 35; attempt++) {
      try {
        const [row] = await connection.$queryRawUnsafe('SELECT current_database() AS name');
        if (row?.name === 'cafedb') return true;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 350));
      }
    }
    return false;
  } finally {
    await connection.$disconnect().catch(() => {});
  }
}
async function main(){
  assert.equal(process.env.PHASE_VIII_CAFEDB_CONFIRMED,'YES','Explicit existing DB opt-in required');
  const u=new URL(process.env.DATABASE_URL||'postgresql://invalid/invalid');
  assert.equal(u.pathname,'/cafedb','Wrong database');
  assert.equal(docker(['inspect','cafe_postgres','--format','{{.State.Running}}']),'true');
  const networks=JSON.parse(docker(['inspect','cafe_postgres','--format','{{json .NetworkSettings.Networks}}']));
  const dbIp=networks.bridge?.IPAddress;
  assert.match(dbIp||'',/^\d{1,3}(?:\.\d{1,3}){3}$/);
  const hostPort=await unusedPort(),proxy='cafe-uat-policy-owned-'+randomUUID().slice(0,8);
  record.proxy={name:proxy,hostPort,removed:false};let started=false;
  const forward=[
    'const net=require("node:net");',
    'net.createServer(c=>{const remote=net.connect(5432,process.env.PROXY_DB_IP);',
    'c.on("error",()=>remote.destroy());remote.on("error",()=>c.destroy());',
    'c.pipe(remote);remote.pipe(c);}).listen(15432,"0.0.0.0");'
  ].join('');
  try{
    docker(['run','--rm','-d','--name',proxy,'--network','bridge',
      '-p','127.0.0.1:'+hostPort+':15432',
      '-e','PROXY_DB_IP='+dbIp,'--entrypoint','node','cafe-agent:local','-e',forward],25000);
    started=true;
    assert.equal(await tcpReady(hostPort),true,'Test proxy never listened');
    assert.equal(await verifiedPostgresReady(hostPort),true,
      'Database identity/connection not verified through owned proxy');
    const envPort=String(hostPort);
    const uatOk=riskOnly || proposalOnly || backtestOnly || policyOnly || runScript('uat','apps/api/tests/system-uat-vii.cafedb.cjs',{
      UAT_CAFEDB_CONFIRMED:'YES',UAT_DB_PORT:envPort,UAT_CASES:record.cases.join(',')
    });
    const policyOk=riskOnly || proposalOnly || backtestOnly || runScript('policy','apps/api/tests/policy-viii-audit.cjs',{
      POLICY_CAFEDB_CONFIRMED:'YES',POLICY_DB_PORT:envPort
    });
    const riskOk=proposalOnly || backtestOnly || policyOnly || runScript('risk','apps/api/tests/agent-demand-risk.cafedb.cjs',{
      RISK_CAFEDB_CONFIRMED:'YES',RISK_DB_PORT:envPort
    });
    const expiryOk=proposalOnly || backtestOnly || policyOnly || runScript('expiry','apps/api/tests/agent-demand-risk-expiry.cafedb.cjs',{
      RISK_CAFEDB_CONFIRMED:'YES',RISK_DB_PORT:envPort
    });
    const proposalOk=!proposalOnly || runScript('proposal','apps/api/tests/agent-purchase-approval-boundary.cafedb.cjs',{
      PROPOSAL_CAFEDB_CONFIRMED:'YES',PROPOSAL_DB_PORT:envPort
    });
    const backtestOk=!backtestOnly || runScript('backtest','apps/api/tests/agent-demand-backtest.cafedb.cjs',{
      BACKTEST_CAFEDB_CONFIRMED:'YES',BACKTEST_DB_PORT:envPort
    });
    record.status=uatOk&&policyOk&&riskOk&&expiryOk&&proposalOk&&backtestOk?'SCOPED_COMPLETE':'PARTIAL';
    if(!uatOk||!policyOk||!riskOk||!expiryOk||!proposalOk||!backtestOk)process.exitCode=1;
  }catch(error){
    record.status='FAIL';record.error=String(error.message||error).slice(0,600);
    process.exitCode=1;
  }finally{
    if(started){
      try {docker(['stop','--time','2',proxy],15000);record.proxy.removed=true;}
      catch(error){record.proxy.cleanupError=String(error.message).slice(0,200);}
    }
    record.finish=new Date().toISOString();save();
    console.log(serialize({evidence,status:record.status,proxyRemoved:record.proxy.removed,
      runs:record.runs.map(x=>({name:x.name,exitCode:x.exitCode,log:x.log})),
      error:record.error}));
  }
}
main().catch(error=>{record.status='FAIL';record.error=String(error.message||error).slice(0,600);
  record.finish=new Date().toISOString();save();console.error(record.error);process.exitCode=2;});
