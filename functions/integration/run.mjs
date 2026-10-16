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
writeFileSync(join(temp,'firebase.json'),JSON.stringify({dataconnect:{source:'dataconnect'},emulators:{dataconnect:{port:9399},ui:{enabled:false}}}));
const child=spawnSync(process.env.FIREBASE_CLI||'firebase',[
  'emulators:exec','--only','dataconnect','--project','demo-murder-engine-votes',
  '--config',join(temp,'firebase.json'),'--non-interactive',
  `node --test "${resolve(root,'functions/integration/vote-session.test.mjs')}"`,
],{cwd:temp,stdio:'inherit',env:{...process.env,GCLOUD_PROJECT:'demo-murder-engine-votes'}});
if(child.status===0)rmSync(temp,{recursive:true,force:true});
else console.error(`Emulator diagnostics: ${temp}`);
if(child.error)console.error(child.error.message);
process.exitCode=child.status??1;
