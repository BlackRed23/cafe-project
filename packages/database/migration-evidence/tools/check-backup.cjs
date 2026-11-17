const fs=require('fs'),cp=require('child_process'),crypto=require('crypto');
require('dotenv').config({path:'../../apps/api/.env',quiet:true});require('dotenv').config({path:'.env',quiet:true});
const url=new URL(process.env.DATABASE_URL);if(decodeURIComponent(url.pathname.slice(1))!=='cafe-kltn')throw Error('WRONG_DATABASE');
const env={...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:'cafe-kltn'};
function run(bin,args){const r=cp.spawnSync('C:/Program Files/PostgreSQL/18/bin/'+bin,args,{env,encoding:'utf8',maxBuffer:64*1024*1024});if(r.status!==0)throw Error(bin+' failed; exit '+r.status);return r.stdout;}
function tables(s){const result={};for(const m of s.matchAll(/COPY ([^\r\n]+) FROM stdin;\r?\n([\s\S]*?)\\\./g)){const lines=m[2].trimEnd().split(/\r?\n/).filter(Boolean).sort();result[m[1]]={count:lines.length,sha256:crypto.createHash('sha256').update(lines.join('\n')).digest('hex')};}return result;}
const backup='D:/KLTN/git-backup-cafe/cafe-kltn-before-migration.dump';
const old=tables(run('pg_restore.exe',['--data-only','--file=-',backup]));
const current=tables(run('pg_dump.exe',['--data-only','--no-owner','--no-privileges']));
const changed=[...new Set([...Object.keys(old),...Object.keys(current)])].filter(k=>JSON.stringify(old[k])!==JSON.stringify(current[k]));
const r={backup,backupSHA256:crypto.createHash('sha256').update(fs.readFileSync(backup)).digest('hex'),archiveFullyDecoded:true,old,current,changed};
fs.writeFileSync('migration-evidence/backup-comparison.json',JSON.stringify(r,null,2));console.log(JSON.stringify({archiveFullyDecoded:true,tables:Object.keys(old).length,changed,backupSHA256:r.backupSHA256}));
