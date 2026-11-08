// Scoped, reversible editorial correction. The before.json artifact is the backup.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {initializeApp} from 'firebase-admin/app';
import {getDataConnect} from 'firebase-admin/data-connect';
const fixture=process.argv.includes('--emulator-fixture');
assert.equal(process.env.GCLOUD_PROJECT,fixture?'demo-murder-engine-votes':'murder-engine-ludificateur');
if(fixture)assert.ok(process.env.DATA_CONNECT_EMULATOR_HOST);
const patch=JSON.parse(readFileSync(new URL('../../fixtures/nid/editorial-corrections.json',import.meta.url)));
const targetSession=fixture?process.argv.find(x=>x.startsWith('--target-session='))?.split('=')[1]:patch.targetSession;
assert.ok(targetSession);
initializeApp({projectId:process.env.GCLOUD_PROJECT});
const dc=getDataConnect({location:'europe-west1',serviceId:'murder-engine'});
async function read(q,v={}){const r=await dc.executeGraphqlRead(q,{variables:v});if(r.errors?.length)throw Error(JSON.stringify(r.errors));return r.data;}
async function execute(q,v={}){const r=await dc.executeGraphql(q,{variables:v});if(r.errors?.length)throw Error(JSON.stringify(r.errors));return r.data;}
const selected=await read('query Target($s:UUID!){gameSession(id:$s){id name scenarioVersion{id sourceHash sourceScenarioId versionLabel}}}',{s:targetSession});
assert.equal(selected.gameSession?.name,patch.targetName);
const version=selected.gameSession.scenarioVersion,v=version.id;
assert.equal(version.sourceScenarioId,'NID_ESPIONS_1958_16');
assert.equal(version.versionLabel,patch.expectedVersionLabel);
const models={characters:['Character','character','characters'],relationships:['Relationship','relationship','relationships'],objectives:['Objective','objective','objectives'],clues:['Clue','clue','clues'],documents:['DocumentDefinition','documentDefinition','documentDefinitions'],gameObjects:['GameObject','gameObject','gameObjects'],facts:['Fact','fact','facts']};
const selections=Object.entries(models).map(([group,[,,query]])=>`${group}:${query}(where:{scenarioVersionId:{eq:$v}},limit:1000){externalId ${[...new Set(patch.groups[group].flatMap(r=>Object.keys(r.data)))].join(' ')}}`).join('\n');
const source=await read(`query Source($v:UUID!){scenarioVersion(id:$v){sourceHash versionLabel mediaOverridesJson} gameSessions(where:{scenarioVersionId:{eq:$v}},limit:100){id name status} ${selections}}`,{v});
assert.equal(source.characters.length,16);assert.ok(source.gameSessions.length<100);
assert.ok(source.gameSessions.every(s=>s.status!=='LIVE'),'NID_SESSION_RUNNING');
const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
const normalize=s=>String(s??'').trim();
const mismatches=[];
for(const [group,rows] of Object.entries(patch.groups))for(const row of rows){
 const current=source[group].find(x=>x.externalId===row.externalId);assert.ok(current,`${group}:${row.externalId}:missing`);
 for(const [field,value] of Object.entries(row.data))if(!same(current[field],row.expected[field])&&!same(current[field],value))mismatches.push(`${group}:${row.externalId}:${field}`);
}
const fingerprint=async s=>read(`query Runtime($s:UUID!){
 sessionResources(where:{gameSessionId:{eq:$s}},limit:1000,orderBy:[{characterExternalId:ASC},{resourceExternalId:ASC}]){characterExternalId resourceExternalId currentValue}
 sessionObjects(where:{gameSessionId:{eq:$s}},limit:1000,orderBy:{objectExternalId:ASC}){objectExternalId holderType holderExternalId inPlay}
 sessionCasino(key:{gameSessionId:$s}){revision stateJson}
}`,{s});
source.sessions=[];
for(const session of source.gameSessions){
 const rows=await read('query Cast($s:UUID!){sessionParticipants(where:{gameSessionId:{eq:$s}},limit:1000){id active characterExternalId characterDisplayName characterGenderVariant characterSnapshotJson characterSnapshotAt playerAccessEnabled}}',{s:session.id});
 source.sessions.push({...session,participants:rows.sessionParticipants,runtime:await fingerprint(session.id)});
}
mkdirSync('nid-editorial-evidence',{recursive:true});
writeFileSync('nid-editorial-evidence/before.json',JSON.stringify(source,null,2));
writeFileSync('nid-editorial-evidence/preflight.json',JSON.stringify({version,targetSession,mismatches,sessions:source.sessions.map(s=>({id:s.id,name:s.name,status:s.status,participants:s.participants.length,frozen:s.participants.filter(p=>p.characterSnapshotJson).length,retiredInPlay:s.runtime.sessionObjects.filter(o=>patch.removedObjects.includes(o.objectExternalId)&&o.inPlay).length}))},null,2));
console.log(JSON.stringify({preflight:true,mismatches,sessions:source.sessions.map(s=>({name:s.name,status:s.status,participants:s.participants.length}))}));
if(process.argv.includes('--check-only'))process.exit(mismatches.length?2:0);
assert.deepEqual(mismatches,[],'SOURCE_EDITED_SINCE_REVIEW');

const vars={v,label:version.versionLabel,hash:version.sourceHash},decl=['$v:UUID!','$label:String!','$hash:String!'];
let n=0,body=`lockVersion:scenarioVersion_update(id:$v,data:{versionLabel:$label})\nversionGuard:query @check(expr:"response.versionGuard.scenarioVersion.sourceHash == vars.hash",message:"NID_VERSION_CHANGED") @redact{scenarioVersion(id:$v){sourceHash}}\n`;
function update(type,field,key,data,current){
 const id='u'+n++;decl.push(`$${id}:${type}_Data!`);vars[id]=data;
 // Lock row first (within transaction) then compare every authored field.
 const lockField=field==='sessionParticipant'?'id':field==='sessionObject'?'objectExternalId':'externalId';
 const literal=key.match(new RegExp(`\\b${lockField}:("[^"]+")`))?.[1];assert.ok(literal,'MISSING_LOCK_KEY');
 body+=`${id}lock:${field}_update(${key},data:{${lockField}:${literal}})\n`;
 const guards=[];
 for(const [f,value] of Object.entries(current)){
  const arg=id+'E'+f;decl.push(`$${arg}:${typeof value==='boolean'?'Boolean':typeof value==='number'?'Int':'String'}`);vars[arg]=value??null;
  guards.push(`response.${id}guard.${field}.${f} == vars.${arg}`);
 }
 body+=`${id}guard:query @check(expr:${JSON.stringify(guards.join(' && '))},message:"NID_ROW_CHANGED") @redact{${field}(${key}){${Object.keys(current).join(' ')}}}\n`;
 body+=`${id}:${field}_update(${key},data:$${id})\n`;
}
for(const [group,rows] of Object.entries(patch.groups))for(const row of rows){
 const current=source[group].find(x=>x.externalId===row.externalId);
 if(Object.entries(row.data).every(([k,val])=>same(current[k],val)))continue;
 const [type,field]=models[group];
 update(type,field,`key:{scenarioVersionId:$v,externalId:${JSON.stringify(row.externalId)}}`,row.data,Object.fromEntries(Object.keys(row.data).map(k=>[k,current[k]])));
}
let snapshots=0,retired=0;
for(const session of source.sessions){
 const sid='s'+n++;decl.push(`$${sid}:UUID!`);vars[sid]=session.id;
 body+=`lock${sid}:gameSession_update(id:$${sid},data:{liveElapsedSeconds_update:{inc:0}})\nstatus${sid}:query @check(expr:"response.status${sid}.gameSession.status != 'LIVE'",message:"NID_SESSION_RUNNING") @redact{gameSession(id:$${sid}){status}}\n`;
 for(const person of session.participants){
  if(!person.characterSnapshotJson)continue;
  const snap=JSON.parse(person.characterSnapshotJson);assert.equal(snap.characterExternalId,person.characterExternalId);
  assert.ok(snap.character,'INVALID_FROZEN_SHEET');
  const fix=patch.groups.characters.find(c=>c.externalId===person.characterExternalId);if(!fix)continue;
  for(const [field,value] of Object.entries(fix.data)){
   assert.ok(normalize(snap.character[field])===normalize(fix.expected[field])||normalize(snap.character[field])===normalize(value),`CUSTOM_SNAPSHOT:${person.characterExternalId}:${field}`);
   snap.character[field]=value;
  }
  for(const rel of snap.relationships??[]){
   const fix=patch.groups.relationships.find(r=>r.externalId===rel.externalId);if(!fix)continue;
   // The source row's endpoints are static. Resolve direction from the character IDs.
   const endpoints={REL_02:['P01','P02'],REL_03:['P01','P03'],REL_07:['P07','P08'],REL_10:['P09','P16'],REL_11:['P10','P11'],REL_13:['P11','P12']}[rel.externalId];
   const field=endpoints[0]===person.characterExternalId?'textA':'textB';
   if(Object.hasOwn(fix.data,field)){assert.ok(same(rel.text,fix.expected[field])||same(rel.text,fix.data[field]),'CUSTOM_RELATION');rel.text=fix.data[field];}
   if(Object.hasOwn(fix.data,'relationType'))rel.relationType=fix.data.relationType;
  }
  for(const obj of snap.objectives??[]){const fix=patch.groups.objectives.find(o=>o.externalId===obj.externalId);if(fix){assert.ok(same(obj.description,fix.expected.description)||same(obj.description,fix.data.description),'CUSTOM_OBJECTIVE');obj.description=fix.data.description;}}
  const json=JSON.stringify(snap);
  if(json!==person.characterSnapshotJson){update('SessionParticipant','sessionParticipant',`id:${JSON.stringify(person.id)}`,{characterSnapshotJson:json},{active:person.active,characterSnapshotJson:person.characterSnapshotJson});snapshots++;}
 }
 for(const obj of session.runtime.sessionObjects.filter(o=>patch.removedObjects.includes(o.objectExternalId)&&o.inPlay!==false)){
  update('SessionObject','sessionObject',`key:{gameSessionId:$${sid},objectExternalId:${JSON.stringify(obj.objectExternalId)}}`,{inPlay:false},{inPlay:obj.inPlay,holderType:obj.holderType,holderExternalId:obj.holderExternalId});retired++;
 }
}
await execute(`mutation ApplyNidEditorial(${decl.join(',')}) @transaction{${body}}`,vars);
for(const session of source.sessions){
 const after=await fingerprint(session.id),expected=structuredClone(session.runtime);
 for(const obj of expected.sessionObjects)if(patch.removedObjects.includes(obj.objectExternalId))obj.inPlay=false;
 assert.deepEqual(after,expected,'ONLY_DUPLICATE_OBJECTS_MAY_CHANGE');
}
const after=await read(`query Verify($v:UUID!){scenarioVersion(id:$v){mediaOverridesJson} ${selections}}`,{v});
assert.equal(after.scenarioVersion.mediaOverridesJson,source.scenarioVersion.mediaOverridesJson);
for(const [group,rows] of Object.entries(patch.groups))for(const row of rows)for(const [field,value] of Object.entries(row.data))assert.deepEqual(after[group].find(x=>x.externalId===row.externalId)?.[field]??null,value??null);
for(const session of source.sessions){
 const rows=await read('query VerifyCast($s:UUID!){sessionParticipants(where:{gameSessionId:{eq:$s}},limit:1000){id characterExternalId characterDisplayName characterGenderVariant characterSnapshotJson characterSnapshotAt playerAccessEnabled}}',{s:session.id});
 for(const person of rows.sessionParticipants){
  const prev=session.participants.find(p=>p.id===person.id);
  for(const field of ['characterExternalId','characterDisplayName','characterGenderVariant','characterSnapshotAt','playerAccessEnabled'])assert.deepEqual(person[field],prev[field]);
  if(person.characterSnapshotJson){const snap=JSON.parse(person.characterSnapshotJson);const fix=patch.groups.characters.find(c=>c.externalId===person.characterExternalId);for(const [k,val] of Object.entries(fix?.data??{}))assert.deepEqual(snap.character[k]??null,val??null);}
 }
}
const result={applied:true,versionId:v,counts:Object.fromEntries(Object.entries(patch.groups).map(([k,rows])=>[k,rows.length])),snapshotsUpdated:snapshots,duplicateDefinitionsRetired:patch.removedObjects.length,runtimeDuplicatesRetired:retired,resourcesCasinoCastingLinksMediaPreserved:true,patchSha256:createHash('sha256').update(JSON.stringify(patch)).digest('hex')};
writeFileSync('nid-editorial-evidence/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
