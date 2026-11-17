const fs=require('fs'),cp=require('child_process');require('dotenv').config({path:'../../apps/api/.env',quiet:true});
const u=new URL(process.env.DATABASE_URL);if(u.pathname!=='/cafe-kltn')throw Error('WRONG_DATABASE');
const sql=fs.readFileSync('prisma/schema/migrations/20261116090000_expand_preserve_legacy/migration.sql','utf8').replace(/COMMIT;\s*$/,'ROLLBACK;');
const r=cp.spawnSync('C:/Program Files/PostgreSQL/18/bin/psql.exe',['-X','-v','ON_ERROR_STOP=1'],{env:{...process.env,PGHOST:u.hostname,PGPORT:u.port||'5432',PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:'cafe-kltn'},input:sql,encoding:'utf8'});
console.log(JSON.stringify({exit:r.status,stderr:r.stderr,tail:r.stdout?.split('\n').slice(-5)}));process.exitCode=r.status;
