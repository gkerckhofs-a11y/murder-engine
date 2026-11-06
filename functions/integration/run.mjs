import { mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root=fileURLToPath(new URL('../../',import.meta.url));
const temp=mkdtempSync(join(tmpdir(),'murder-vote-tests-'));
mkdirSync(join(temp,'dataconnect'));
cpSync(join(root,'dataconnect/schema'),join(temp,'dataconnect/schema'),{recursive:true});
writeFileSync(join(temp,'dataconnect/dataconnect.yaml'),`specVersion: v1beta
serviceId: murder-engine
location: europe-west1
schema:
  source: ./schema
  datasource:
    postgresql:
      database: murder_engine_test
      cloudSql:
        instanceId: local-vote-tests
connectorDirs: []
`);
writeFileSync(join(temp,'firebase.json'),JSON.stringify({dataconnect:{source:'dataconnect'},emulators:{dataconnect:{port:process.argv[2]==='self-service'?9401:9399,postgresPort:process.argv[2]==='self-service'?5435:5432},ui:{enabled:false}}}));
const suite=process.argv[2]==='casino'?'casino.test.mjs':process.argv[2]==='self-service'?'session-rehearsal.test.mjs':'vote-session.test.mjs';
const child=spawnSync(process.env.FIREBASE_CLI||'firebase',[
  'emulators:exec','--only','dataconnect','--project','demo-murder-engine-votes',
  '--config',join(temp,'firebase.json'),'--non-interactive',...(process.env.CASINO_DEBUG?['--debug']:[]),
  `node --test "${resolve(root,'functions/integration',suite)}"`,
],{cwd:temp,stdio:'inherit',env:{...process.env,NO_PROXY:[process.env.NO_PROXY,'127.0.0.1','localhost','::1'].filter(Boolean).join(','),no_proxy:[process.env.no_proxy,'127.0.0.1','localhost','::1'].filter(Boolean).join(','),GCLOUD_PROJECT:'demo-murder-engine-votes'}});
if(child.status===0)rmSync(temp,{recursive:true,force:true});
else console.error(`Emulator diagnostics: ${temp}`);
if(child.error)console.error(child.error.message);
process.exitCode=child.status??1;
