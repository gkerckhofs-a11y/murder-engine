import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {initializeApp} from 'firebase-admin/app';
import {getDataConnect} from 'firebase-admin/data-connect';
assert.ok(process.env.DATA_CONNECT_EMULATOR_HOST);
assert.equal(process.env.GCLOUD_PROJECT,'demo-murder-engine-votes');
initializeApp({projectId:process.env.GCLOUD_PROJECT});
const dc=getDataConnect({location:'europe-west1',serviceId:'murder-engine'});
const patch=JSON.parse(readFileSync(new URL('../../fixtures/nid/editorial-corrections.json',import.meta.url)));
async function execute(q,v={}){const r=await dc.executeGraphql(q,{variables:v});if(r.errors?.length)throw Error(JSON.stringify(r.errors));return r.data;}
async function read(q,v={}){const r=await dc.executeGraphqlRead(q,{variables:v});if(r.errors?.length)throw Error(JSON.stringify(r.errors));return r.data;}
const insert=(type,name,data)=>execute(`mutation Seed($data:${type}_Data!){${name}_insert(data:$data)}`,{data});
test('editorial SQL: rejects a live game and custom sheet; updates atomically, replays safely, preserves casting/money/originals',async()=>{
 const org=randomUUID(),sc=randomUUID(),v=randomUUID(),s=randomUUID();
 await insert('Organization','organization',{id:org,name:'Editorial',slug:org});
 await insert('Scenario','scenario',{id:sc,organizationId:org,title:'Nid editorial',slug:sc});
 await insert('ScenarioVersion','scenarioVersion',{id:v,scenarioId:sc,sourceScenarioId:'NID_ESPIONS_1958_16',sourceHash:'editorial-fixture',versionLabel:patch.expectedVersionLabel,templateVersion:'1.7',language:'FR',status:'TEST',gmSummary:'Test',playerSummary:'Test',mediaOverridesJson:'{"keep":true}'});
 await insert('GameSession','gameSession',{id:s,organizationId:org,scenarioVersionId:v,name:patch.targetName,status:'LIVE',language:'FR'});
 const models={characters:['Character','character',{name:'Name',importance:'CORE',intensity:'MEDIUM'}],relationships:['Relationship','relationship',{characterAExternalId:'P01',characterBExternalId:'P02',textA:'Text A',textB:'Text B',visibility:'PRIVATE'}],objectives:['Objective','objective',{ownerType:'CHARACTER',ownerExternalId:'P01',title:'Goal',objectiveType:'PERSONAL',initialStatus:'ACTIVE'}],clues:['Clue','clue',{internalName:'clue',playerName:'clue',playerText:'Text',gmInterpretation:'MJ only',clueType:'DOCUMENT',support:'DIGITAL',presentationMode:'DOCUMENT'}],documents:['DocumentDefinition','documentDefinition',{title:'Document',support:'DIGITAL'}],gameObjects:['GameObject','gameObject',{name:'Item',description:'Description',support:'DIGITAL'}],facts:['Fact','fact',{nature:'FACT',importance:'IMPORTANT'}]};
 for(const [group,rows] of Object.entries(patch.groups)){
  const [type,name,defaults]=models[group];
  for(const row of rows)await insert(type,name,{...defaults,...row.expected,externalId:row.externalId,scenarioVersionId:v});
 }
 const participants=[];
 for(const c of patch.groups.characters){
  const id=randomUUID(),snap={characterExternalId:c.externalId,character:{name:'Custom '+c.externalId,...c.expected},objectives:[],relationships:[]};
  const row={id,gameSessionId:s,displayName:'Player',characterExternalId:c.externalId,characterDisplayName:'Custom '+c.externalId,characterSnapshotJson:JSON.stringify(snap),characterSnapshotAt:'2026-11-08T00:00:00Z',playerAccessEnabled:true};
  await insert('SessionParticipant','sessionParticipant',row);participants.push(row);
 }
 for(const id of patch.removedObjects)await insert('SessionObject','sessionObject',{gameSessionId:s,objectExternalId:id,holderType:'CHARACTER',holderExternalId:'P01'});
 for(const id of ['ORIGINAL_A','ORIGINAL_B','ORIGINAL_C'])await insert('SessionObject','sessionObject',{gameSessionId:s,objectExternalId:id,holderType:'CHARACTER',holderExternalId:'P03'});
 await insert('SessionResource','sessionResource',{gameSessionId:s,characterExternalId:'P01',resourceExternalId:'RES_CASH',initialValue:450,currentValue:375});
 await insert('SessionCasino','sessionCasino',{gameSessionId:s,revision:13,stateJson:'{"doNotChange":true}'});
 const script=fileURLToPath(new URL('../tools/apply-nid-editorial.mjs',import.meta.url));
 const run=()=>spawnSync(process.execPath,[script,'--emulator-fixture','--target-session='+s],{env:process.env,encoding:'utf8',maxBuffer:5e6});
 let result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/NID_SESSION_RUNNING/);
 await execute('mutation Pause($s:UUID!){gameSession_update(id:$s,data:{status:"READY"})}',{s});
 const first=participants[0];await execute('mutation Custom($id:UUID!){sessionParticipant_update(id:$id,data:{characterSnapshotJson:$snap})}'.replace('($id:UUID!)','($id:UUID!,$snap:String!)'),{id:first.id,snap:JSON.stringify({characterExternalId:'P01',character:{biography:'Custom author text'}})});
 result=run();assert.notEqual(result.status,0);assert.match(result.stderr,/CUSTOM_SNAPSHOT/);
 const unchanged=await read('query C($v:UUID!){character(key:{scenarioVersionId:$v,externalId:"P01"}){biography}}',{v});assert.equal(unchanged.character.biography,patch.groups.characters[0].expected.biography);
 await execute('mutation Restore($id:UUID!,$snap:String!){sessionParticipant_update(id:$id,data:{characterSnapshotJson:$snap})}',{id:first.id,snap:first.characterSnapshotJson});
 for(let i=0;i<2;i++){result=run();assert.equal(result.status,0,result.stderr||result.stdout);}
 const after=await read('query Verify($s:UUID!){sessionObjects(where:{gameSessionId:{eq:$s}}){objectExternalId inPlay}sessionResources(where:{gameSessionId:{eq:$s}}){currentValue}sessionCasino(key:{gameSessionId:$s}){revision stateJson}sessionParticipants(where:{gameSessionId:{eq:$s}}){characterExternalId characterSnapshotJson characterDisplayName playerAccessEnabled}}',{s});
 assert.equal(after.sessionObjects.filter(o=>o.inPlay).length,3);assert.equal(after.sessionResources[0].currentValue,375);assert.equal(after.sessionCasino.revision,13);assert.equal(after.sessionCasino.stateJson,'{"doNotChange":true}');
 for(const person of after.sessionParticipants){const snap=JSON.parse(person.characterSnapshotJson);assert.equal(snap.character.name,'Custom '+person.characterExternalId);assert.ok(snap.character.personalTimeline);assert.doesNotMatch(snap.character.biography,/Règles de partie|5 PA|Je garde ici/);assert.equal(person.playerAccessEnabled,true);}
});
