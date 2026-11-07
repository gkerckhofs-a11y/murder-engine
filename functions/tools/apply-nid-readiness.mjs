// One-time, scoped correction. No runtime resources, ownership, casino state or media are modified.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {initializeApp} from 'firebase-admin/app';
import {getDataConnect} from 'firebase-admin/data-connect';
const emulatorFixture=process.argv.includes('--emulator-fixture');
assert.equal(process.env.GCLOUD_PROJECT,emulatorFixture?'demo-murder-engine-votes':'murder-engine-ludificateur','Explicit project required');
if(emulatorFixture)assert.ok(process.env.DATA_CONNECT_EMULATOR_HOST);
const patch=JSON.parse(readFileSync(new URL('../../fixtures/nid/readiness-corrections.json',import.meta.url)));
initializeApp({projectId:process.env.GCLOUD_PROJECT});
const dc=getDataConnect({location:'europe-west1',serviceId:'murder-engine'});
async function read(q,v={}){const r=await dc.executeGraphqlRead(q,{variables:v});if(r.errors?.length)throw Error(JSON.stringify(r.errors));return r.data;}
async function execute(q,v={}){const r=await dc.executeGraphql(q,{variables:v});if(r.errors?.length)throw Error(JSON.stringify(r.errors));return r.data;}
const v=patch.scenarioVersionId;
const before=await read(`query Before($v:UUID!){
 scenarioVersion(id:$v){id sourceHash versionLabel variantNotes mediaOverridesJson scenario{title}}
 gameSessions(where:{scenarioVersionId:{eq:$v}},limit:100){id name status}
 documentAnalysisDefinitions(where:{scenarioVersionId:{eq:$v}},limit:100){externalId targetType targetExternalId abilityExternalId minLevel factExternalId active}
 facts(where:{scenarioVersionId:{eq:$v}},limit:100){externalId title text nature importance plotExternalId notebookCategory isPublic charmable active}
 abilities(where:{scenarioVersionId:{eq:$v}},limit:100){externalId name description category defaultLevel defaultMaxUses defaultCooldownMinutes secret active}
 interactions(where:{scenarioVersionId:{eq:$v}},limit:100){externalId name category targetType scanMode abilityExternalId actorScope targetScope costResourceExternalId costValue costTiming resolution diceCount diceSides abilityLevelMultiplier flatBonus difficulty opposedAbilityExternalId tieRule validation maxUses limitPerTarget cooldownMinutes targetSecret active}
 gameObjects(where:{scenarioVersionId:{eq:$v}},limit:100){externalId description bonusAbilityExternalId bonusValue}
 characters(where:{scenarioVersionId:{eq:$v}},limit:100){externalId biography interpretationNotes}
}`,{v});
assert.equal(before.scenarioVersion?.sourceHash,patch.expectedSourceHash);assert.equal(before.scenarioVersion.versionLabel,patch.expectedVersionLabel);
assert.equal(before.characters.length,16);assert.ok(before.gameSessions.length<100);assert.ok(before.gameSessions.every(s=>s.status!=='LIVE'),'Pause Nid sessions before applying');
const fingerprint=async s=>read(`query State($s:UUID!){
 sessionResources(where:{gameSessionId:{eq:$s}},limit:1000,orderBy:[{characterExternalId:ASC},{resourceExternalId:ASC}]){characterExternalId resourceExternalId currentValue}
 sessionObjects(where:{gameSessionId:{eq:$s}},limit:1000,orderBy:{objectExternalId:ASC}){objectExternalId holderType holderExternalId inPlay}
 sessionCasino(key:{gameSessionId:$s}){revision stateJson}
}`,{s});
before.sessions=[];
for(const session of before.gameSessions){
 const rows=await read('query Participants($s:UUID!){sessionParticipants(where:{gameSessionId:{eq:$s}},limit:1000){id characterExternalId characterSnapshotJson}}',{s:session.id});
 before.sessions.push({...session,participants:rows.sessionParticipants,runtime:await fingerprint(session.id)});
}
mkdirSync('nid-correction-evidence',{recursive:true});
writeFileSync('nid-correction-evidence/before.json',JSON.stringify(before,null,2));
if(process.argv.includes('--check-only')){console.log(JSON.stringify({checked:true,sessions:before.gameSessions.map(s=>({name:s.name,status:s.status})),analyses:before.documentAnalysisDefinitions.length}));process.exit(0);}
const vars={v,label:patch.expectedVersionLabel,hash:patch.expectedSourceHash},decl=['$v:UUID!','$label:String!','$hash:String!'];
let body=`lock:scenarioVersion_update(id:$v,data:{versionLabel:$label})
 guard:query @check(expr:"response.guard.scenarioVersion.sourceHash == vars.hash",message:"NID_SOURCE_CHANGED") @redact{scenarioVersion(id:$v){sourceHash}}\n`;
let n=0;
function update(type,field,key,data){const id='u'+n++;decl.push(`$${id}:${type}_Data!`);vars[id]=data;body+=`${id}:${field}_update(${key},data:$${id})\n`;}
function upsert(type,field,row){const id='u'+n++;decl.push(`$${id}:${type}_Data!`);vars[id]={...row,scenarioVersionId:v};body+=`${id}:${field}_upsert(data:$${id})\n`;}
const key=id=>`key:{scenarioVersionId:$v,externalId:${JSON.stringify(id)}}`;
for(const row of patch.documentAnalyses)upsert('DocumentAnalysisDefinition','documentAnalysisDefinition',row);
for(const row of patch.facts)upsert('Fact','fact',row);
for(const id of patch.protectedFacts){assert.ok(before.facts.some(f=>f.externalId===id));update('Fact','fact',key(id),{charmable:false});}
for(const row of patch.abilities)update('Ability','ability',key(row.externalId),{description:row.description});
for(const row of patch.interactions){const {scenarioVersionId,externalId,...data}=row;update('Interaction','interaction',key(externalId),data);}
for(const row of patch.objects){const {externalId,...data}=row;assert.ok(before.gameObjects.some(o=>o.externalId===externalId));update('GameObject','gameObject',key(externalId),data);}
for(const row of patch.characters){const {externalId,...data}=row;update('Character','character',key(externalId),data);}
update('ScenarioVersion','scenarioVersion','id:$v',{variantNotes:patch.versionNotes});
for(const session of before.sessions){
 const id='s'+n++;decl.push(`$${id}:UUID!`);vars[id]=session.id;
 body+=`lock${id}:gameSession_update(id:$${id},data:{liveElapsedSeconds_update:{inc:0}})\nstatus${id}:query @check(expr:"response.status${id}.gameSession.status != 'LIVE'",message:"NID_SESSION_RUNNING") @redact{gameSession(id:$${id}){status}}\n`;
 for(const p of session.participants){
  if(!p.characterSnapshotJson)continue;
  const snap=JSON.parse(p.characterSnapshotJson);assert.equal(snap.characterExternalId,p.characterExternalId);
  if(!snap.character)continue;
  const fix=patch.characters.find(c=>c.externalId===p.characterExternalId);if(!fix)continue;
  const rules=fix.interpretationNotes.split('Règles de la session :')[1];
  if(!String(snap.character.interpretationNotes??'').includes('Règles de la session :'))snap.character.interpretationNotes=(snap.character.interpretationNotes??'')+'\n\nRègles de la session :'+rules;
  if(p.characterExternalId==='P05'&&typeof snap.character.biography==='string')snap.character.biography=snap.character.biography.replaceAll('cinq mallettes','mallettes');
  update('SessionParticipant','sessionParticipant',`id:${JSON.stringify(p.id)}`,{characterSnapshotJson:JSON.stringify(snap)});
 }
}
await execute(`mutation ApplyNidReadiness(${decl.join(',')}) @transaction{${body}}`,vars);
for(const s of before.sessions)assert.deepEqual(await fingerprint(s.id),s.runtime,'Runtime must remain unchanged');
const after=await read('query Check($v:UUID!){scenarioVersion(id:$v){mediaOverridesJson} documentAnalysisDefinitions(where:{scenarioVersionId:{eq:$v}},limit:100){externalId} interactions(where:{scenarioVersionId:{eq:$v}},limit:100){externalId active resolution}}',{v});
assert.equal(after.scenarioVersion.mediaOverridesJson,before.scenarioVersion.mediaOverridesJson);assert.equal(after.documentAnalysisDefinitions.length,12);assert.ok(after.interactions.filter(i=>i.externalId.startsWith('INT_AB_')).every(i=>i.active));
const summary={applied:true,scenarioVersionId:v,analyses:12,protectedInitialFacts:16,pistolsWithConditionalBonus:3,sessions:before.gameSessions.map(s=>({id:s.id,name:s.name,status:s.status})),runtimePreserved:true,mediaPreserved:true,patchSha256:createHash('sha256').update(JSON.stringify(patch)).digest('hex')};
writeFileSync('nid-correction-evidence/result.json',JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
