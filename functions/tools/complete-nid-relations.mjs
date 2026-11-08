import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {initializeApp} from 'firebase-admin/app';
import {getDataConnect} from 'firebase-admin/data-connect';
import {getPlayerPortal} from '../src/player.mjs';
const patch=JSON.parse(readFileSync(new URL('../../fixtures/nid/relationship-completion.json',import.meta.url)));
const fixture=process.argv.includes('--emulator-fixture');
assert.equal(process.env.GCLOUD_PROJECT,fixture?'demo-murder-engine-votes':'murder-engine-ludificateur');
if(fixture)assert.ok(process.env.DATA_CONNECT_EMULATOR_HOST);
initializeApp({projectId:process.env.GCLOUD_PROJECT});
const dc=getDataConnect({location:'europe-west1',serviceId:'murder-engine'});
async function read(q,v={}){const r=await dc.executeGraphqlRead(q,{variables:v});if(r.errors?.length)throw Error(JSON.stringify(r.errors));return r.data;}
async function execute(q,v={}){const r=await dc.executeGraphql(q,{variables:v});if(r.errors?.length)throw Error(JSON.stringify(r.errors));return r.data;}
const target=fixture?process.argv.find(a=>a.startsWith('--target='))?.slice(9):patch.targetSession;
const first=await read('query Target($s:UUID!){gameSession(id:$s){scenarioVersion{id sourceHash versionLabel sourceScenarioId mediaOverridesJson}}}',{s:target});
const version=first.gameSession.scenarioVersion,v=version.id;
assert.equal(version.sourceScenarioId,patch.expectedSourceScenarioId);assert.equal(version.versionLabel,patch.expectedVersionLabel);
const before=await read(`query Source($v:UUID!){
 characters(where:{scenarioVersionId:{eq:$v}},limit:100){externalId biography}
 facts(where:{scenarioVersionId:{eq:$v}},limit:1000){externalId title text nature importance plotExternalId notebookCategory isPublic charmable active}
 initialKnowledges(where:{scenarioVersionId:{eq:$v}},limit:1000){characterExternalId factExternalId sourceType}
 gameSessions(where:{scenarioVersionId:{eq:$v}},limit:100){id name status}
}`,{v});
assert.equal(before.characters.length,16);assert.ok(before.facts.length<1000&&before.initialKnowledges.length<1000);
for(const c of before.characters)assert.equal(c.biography,patch.expectedCharacters[c.externalId],'STORY_CHANGED:'+c.externalId);
const fingerprint=async s=>read(`query Preserve($s:UUID!){
 sessionParticipants(where:{gameSessionId:{eq:$s}},orderBy:{id:ASC},limit:100){id characterExternalId characterSnapshotJson characterSnapshotAt characterDisplayName characterGenderVariant playerAccessEnabled}
 sessionResources(where:{gameSessionId:{eq:$s}},orderBy:[{characterExternalId:ASC},{resourceExternalId:ASC}],limit:1000){characterExternalId resourceExternalId currentValue}
 sessionObjects(where:{gameSessionId:{eq:$s}},orderBy:{objectExternalId:ASC},limit:1000){objectExternalId holderType holderExternalId inPlay}
 sessionCasino(key:{gameSessionId:$s}){revision stateJson}
}`,{s});
before.sessions=[];
for(const s of before.gameSessions){const state=await fingerprint(s.id);for(const person of state.sessionParticipants){if(!person.characterSnapshotJson)continue;const snap=JSON.parse(person.characterSnapshotJson);assert.equal(snap.character?.biography,patch.expectedCharacters[person.characterExternalId],'FROZEN_STORY_CHANGED');}before.sessions.push({...s,state});}
const existingFacts=new Map(before.facts.map(f=>[f.externalId,f]));
for(const row of patch.rows){const old=existingFacts.get(row.fact.externalId);if(old)for(const [k,value] of Object.entries(row.fact))assert.deepEqual(old[k]??null,value??null,'CONTACT_ALREADY_EDITED:'+row.fact.externalId+':'+k);}
const factsToAdd=patch.rows.filter(r=>!existingFacts.has(r.fact.externalId));
const linksToAdd=patch.rows.filter(r=>!before.initialKnowledges.some(k=>k.characterExternalId===r.owner&&k.factExternalId===r.fact.externalId));
for(const k of before.initialKnowledges){const row=patch.rows.find(r=>r.fact.externalId===k.factExternalId);if(row)assert.equal(k.characterExternalId,row.owner,'CONTACT_WRONG_OWNER');}
mkdirSync('nid-relations-evidence',{recursive:true});
if(!process.argv.includes('--verify-only')){
 assert.ok(before.gameSessions.every(s=>s.status!=='LIVE'),'NID_SESSION_RUNNING');
 writeFileSync('nid-relations-evidence/before.json',JSON.stringify({version,...before},null,2));
 const vars={v,label:version.versionLabel,hash:version.sourceHash};const decl=['$v:UUID!','$label:String!','$hash:String!'];
 let body='lock:scenarioVersion_update(id:$v,data:{versionLabel:$label})\nguard:query @check(expr:"response.guard.scenarioVersion.sourceHash == vars.hash",message:"VERSION_CHANGED") @redact{scenarioVersion(id:$v){sourceHash}}\n';
 for(const [i,s] of before.gameSessions.entries()){
  vars['s'+i]=s.id;decl.push('$s'+i+':UUID!');body+=`lockS${i}:gameSession_update(id:$s${i},data:{liveElapsedSeconds_update:{inc:0}})\nstatus${i}:query @check(expr:"response.status${i}.gameSession.status != 'LIVE'",message:"NID_SESSION_RUNNING") @redact{gameSession(id:$s${i}){status}}\n`;
 }
 for(const [i,c] of before.characters.entries()){
  vars['bio'+i]=c.biography;decl.push('$bio'+i+':String!');body+=`bio${i}:query @check(expr:"response.bio${i}.character.biography == vars.bio${i}",message:"STORY_CHANGED") @redact{character(key:{scenarioVersionId:$v,externalId:${JSON.stringify(c.externalId)}}){biography}}\n`;
 }
 for(const [i,row] of factsToAdd.entries()){const name='f'+i;decl.push('$'+name+':Fact_Data!');vars[name]={...row.fact,scenarioVersionId:v};body+=`${name}:fact_insert(data:$${name})\n`;}
 for(const [i,row] of linksToAdd.entries()){const name='k'+i;decl.push('$'+name+':InitialKnowledge_Data!');vars[name]={scenarioVersionId:v,characterExternalId:row.owner,factExternalId:row.fact.externalId,sourceType:'INITIAL'};body+=`${name}:initialKnowledge_insert(data:$${name})\n`;}
 if(factsToAdd.length||linksToAdd.length)await execute(`mutation CompleteRelations(${decl.join(',')}) @transaction{${body}}`,vars);
 for(const s of before.sessions)assert.deepEqual(await fingerprint(s.id),s.state,'RUNTIME_OR_CAST_CHANGED');
 const media=await read('query Media($v:UUID!){scenarioVersion(id:$v){mediaOverridesJson}}',{v});assert.equal(media.scenarioVersion.mediaOverridesJson,version.mediaOverridesJson);
}
const after=await read(`query Confirm($v:UUID!){facts(where:{scenarioVersionId:{eq:$v}},limit:1000){externalId title text nature importance plotExternalId notebookCategory isPublic charmable active}initialKnowledges(where:{scenarioVersionId:{eq:$v}},limit:1000){characterExternalId factExternalId sourceType}}`,{v});
for(const row of patch.rows){const fact=after.facts.find(f=>f.externalId===row.fact.externalId);assert.ok(fact);for(const [k,value] of Object.entries(row.fact))assert.deepEqual(fact[k]??null,value??null);assert.equal(after.initialKnowledges.filter(k=>k.factExternalId===row.fact.externalId&&k.characterExternalId===row.owner).length,1);}
const checks=[];
if(!fixture){
 const links=await read('query Links($s:UUID!){sessionParticipants(where:{gameSessionId:{eq:$s}},limit:100){characterExternalId playerAccessEnabled playerAccessToken active}}',{s:target});
 for(const person of links.sessionParticipants.filter(p=>p.active!==false)){
  assert.ok(person.playerAccessEnabled&&person.playerAccessToken);
  let portal;
  if(process.argv.includes('--http')){const res=await fetch('https://murder-engine-ludificateur.web.app/api/player/portal?refresh=1&token='+encodeURIComponent(person.playerAccessToken));assert.ok(res.ok,'LIVE_PORTAL_HTTP_FAILED');portal=(await res.json()).portal;}
  else portal=await getPlayerPortal(person.playerAccessToken,{trackOpen:false});
  for(const m of patch.mentions.filter(m=>m.owner===person.characterExternalId)){
   const row=patch.rows.find(r=>r.owner===m.owner&&r.entity===m.entity),id=m.targetCharacter||row?.target;
   const rel=id?portal.relationships.find(r=>r.otherExternalId===id):portal.relationships.find(r=>r.otherName===m.title);
   assert.ok(rel,'MISSING_RELATION:'+person.characterExternalId+':'+m.title);
   if(!id){assert.equal(rel.otherExternalId,null);assert.equal(rel.portrait,null);assert.equal(rel.otherPublicRole,null);}
   if(row)assert.ok(rel.text.includes(row.fact.text),'RELATION_TEXT_MISSING');
  }
  checks.push({characterExternalId:person.characterExternalId,relations:portal.relationships.length,covered:patch.mentions.filter(m=>m.owner===person.characterExternalId).length});
 }
 assert.equal(checks.length,16);
}
const result={applied:!process.argv.includes('--verify-only'),factsAdded:factsToAdd.length,initialLinksAdded:linksToAdd.length,totalContactNotes:patch.rows.length,mentionedNamesCovered:patch.mentions.length,playerViews:checks,http:process.argv.includes('--http'),runtimeCastingImagesPreserved:true};
writeFileSync('nid-relations-evidence/'+(process.argv.includes('--http')?'published-result':'result')+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
