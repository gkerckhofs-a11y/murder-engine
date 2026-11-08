import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFileSync} from 'node:fs';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {initializeApp} from 'firebase-admin/app';import {getDataConnect} from 'firebase-admin/data-connect';
assert.ok(process.env.DATA_CONNECT_EMULATOR_HOST);assert.equal(process.env.GCLOUD_PROJECT,'demo-murder-engine-votes');initializeApp({projectId:process.env.GCLOUD_PROJECT});const dc=getDataConnect({location:'europe-west1',serviceId:'murder-engine'});
const patch=JSON.parse(readFileSync(new URL('../../fixtures/nid/relationship-completion.json',import.meta.url)));
async function write(q,v={}){const r=await dc.executeGraphql(q,{variables:v});if(r.errors?.length)throw Error(JSON.stringify(r.errors));return r.data;}
const insert=(type,name,data)=>write(`mutation Seed($data:${type}_Data!){${name}_insert(data:$data)}`,{data});
test('contact import is private, atomic, idempotent and preserves runtime and frozen sheets',async()=>{
 const org=randomUUID(),sc=randomUUID(),v=randomUUID(),s=randomUUID();await insert('Organization','organization',{id:org,name:'Relations',slug:org});await insert('Scenario','scenario',{id:sc,organizationId:org,title:'Nid',slug:sc});
 await insert('ScenarioVersion','scenarioVersion',{id:v,scenarioId:sc,sourceScenarioId:patch.expectedSourceScenarioId,sourceHash:'relationships-test',versionLabel:patch.expectedVersionLabel,templateVersion:'1.7',language:'FR',status:'TEST',gmSummary:'Test',playerSummary:'Test',mediaOverridesJson:'{"preserve":true}'});
 await insert('GameSession','gameSession',{id:s,organizationId:org,scenarioVersionId:v,name:'Nid relations',status:'LIVE',language:'FR'});
 for(const [id,bio] of Object.entries(patch.expectedCharacters))await insert('Character','character',{scenarioVersionId:v,externalId:id,name:id,biography:bio,importance:'CORE',intensity:'MEDIUM'});
 const snapshot=JSON.stringify({character:{biography:patch.expectedCharacters.P01,name:'Custom name'}});
 await insert('SessionParticipant','sessionParticipant',{id:randomUUID(),gameSessionId:s,displayName:'Player',characterExternalId:'P01',characterSnapshotJson:snapshot});
 await insert('SessionResource','sessionResource',{gameSessionId:s,characterExternalId:'P01',resourceExternalId:'RES_CASH',initialValue:450,currentValue:375});
 const run=()=>spawnSync(process.execPath,[fileURLToPath(new URL('../tools/complete-nid-relations.mjs',import.meta.url)),'--emulator-fixture','--target='+s],{env:process.env,encoding:'utf8',maxBuffer:5e6});
 let r=run();assert.notEqual(r.status,0);assert.match(r.stderr,/NID_SESSION_RUNNING/);
 await write('mutation Pause($s:UUID!){gameSession_update(id:$s,data:{status:"READY"})}',{s});
 const first=patch.rows[0].fact;await insert('Fact','fact',{...first,scenarioVersionId:v,title:'Changed by organizer'});
 r=run();assert.notEqual(r.status,0);assert.match(r.stderr,/CONTACT_ALREADY_EDITED/);
 let data=(await dc.executeGraphqlRead('query Count($v:UUID!){facts(where:{scenarioVersionId:{eq:$v}},limit:1000){externalId}initialKnowledges(where:{scenarioVersionId:{eq:$v}},limit:1000){factExternalId}}',{variables:{v}})).data;assert.equal(data.facts.length,1);assert.equal(data.initialKnowledges.length,0);
 await write('mutation Restore($v:UUID!,$id:String!,$t:String!){fact_update(key:{scenarioVersionId:$v,externalId:$id},data:{title:$t})}',{v,id:first.externalId,t:first.title});
 for(let i=0;i<2;i++){r=run();assert.equal(r.status,0,r.stderr||r.stdout);}
 data=(await dc.executeGraphqlRead('query Verify($v:UUID!,$s:UUID!){facts(where:{scenarioVersionId:{eq:$v}},limit:1000){externalId charmable isPublic}initialKnowledges(where:{scenarioVersionId:{eq:$v}},limit:1000){characterExternalId factExternalId}sessionResources(where:{gameSessionId:{eq:$s}}){currentValue}sessionParticipants(where:{gameSessionId:{eq:$s}}){characterSnapshotJson}}',{variables:{v,s}})).data;
 assert.equal(data.facts.length,90);assert.ok(data.facts.every(f=>!f.charmable&&!f.isPublic));assert.equal(data.initialKnowledges.length,90);assert.equal(data.sessionResources[0].currentValue,375);assert.equal(data.sessionParticipants[0].characterSnapshotJson,snapshot);
});
