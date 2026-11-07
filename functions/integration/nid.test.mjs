import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp} from 'firebase-admin/app';
import {getDataConnect} from 'firebase-admin/data-connect';
import {executePlayerLocationAction,getPlayerPortal,examinePlayerDocument} from '../src/player.mjs';
assert.ok(process.env.DATA_CONNECT_EMULATOR_HOST);
assert.equal(process.env.GCLOUD_PROJECT,'demo-murder-engine-votes');
initializeApp({projectId:process.env.GCLOUD_PROJECT});
const dc=getDataConnect({location:'europe-west1',serviceId:'murder-engine'});
async function execute(q,v={}){const r=await dc.executeGraphql(q,{variables:v});if(r.errors?.length)throw Error(JSON.stringify(r.errors));return r.data;}
async function read(q,v={}){const r=await dc.executeGraphqlRead(q,{variables:v});if(r.errors?.length)throw Error(JSON.stringify(r.errors));return r.data;}
const insert=(type,name,data)=>execute(`mutation Seed($data:${type}_Data!){${name}_insert(data:$data)}`,{data});
async function fixture(){
 const org=randomUUID(),sc=randomUUID(),v=randomUUID(),s=randomUUID();
 await insert('Organization','organization',{id:org,name:'Nid test',slug:org});
 await insert('Scenario','scenario',{id:sc,organizationId:org,title:'Nid test',slug:sc});
 await insert('ScenarioVersion','scenarioVersion',{id:v,scenarioId:sc,sourceScenarioId:sc,versionLabel:'test',templateVersion:'1.4',language:'FR',status:'READY',gmSummary:'Test',playerSummary:'Test',runtimeDataVersion:'0.9'});
 await insert('GameSession','gameSession',{id:s,organizationId:org,scenarioVersionId:v,status:'LIVE',language:'FR',runtimeInitializedAt:new Date().toISOString()});
 const players=[];
 for(const name of ['A','B']){
  const id=randomUUID(),token=randomUUID()+randomUUID();
  await insert('Character','character',{scenarioVersionId:v,externalId:name,name,biography:'Test',importance:'CORE',intensity:'MEDIUM'});
  await insert('SessionParticipant','sessionParticipant',{id,gameSessionId:s,displayName:name,characterExternalId:name,playerAccessEnabled:true,playerAccessToken:token});
  await insert('SessionResource','sessionResource',{gameSessionId:s,characterExternalId:name,resourceExternalId:'RES_PA',initialValue:5,currentValue:5});players.push({id,name,token});
 }
 for(const id of ['L1','L2','OWN'])await insert('GameLocation','gameLocation',{scenarioVersionId:v,externalId:id,name:id,description:'Test',lockExternalId:id==='OWN'?'OWNER:A':null});
 for(const [id,loc] of [['C1','L1'],['C2','L1'],['C3','L2']])await insert('Clue','clue',{scenarioVersionId:v,externalId:id,internalName:id,playerName:id,clueType:'INFO',playerText:'Test',gmInterpretation:'Test',support:'DIGITAL',presentationMode:'TAKEABLE',locationExternalId:loc});
 return {s,v,players};
}
const search=(p,l,id=randomUUID(),options={})=>executePlayerLocationAction(p.token,{locationExternalId:l,interactionExternalId:'SYSTEM_LOCATION_SEARCH',requestId:id},options);
const state=s=>read('query State($s:UUID!){sessionResources(where:{gameSessionId:{eq:$s}}){characterExternalId currentValue}sessionClueDiscoveries(where:{gameSessionId:{eq:$s}}){characterExternalId clueExternalId}sessionLocationSearchCommands(where:{gameSessionId:{eq:$s}}){requestId}sessionInteractionUses(where:{gameSessionId:{eq:$s}}){id}}',{s});
test('real SQL: one command replayed concurrently grants one clue and costs one PA',async()=>{
 const {s,players:[a]}=await fixture(),id=randomUUID();
 const results=await Promise.all([search(a,'L1',id),search(a,'L1',id)]);
 assert.deepEqual(results[0],results[1]);await search(a,'L1',id);
 const st=await state(s);assert.equal(st.sessionResources.find(r=>r.characterExternalId==='A').currentValue,4);assert.equal(st.sessionClueDiscoveries.length,1);assert.equal(st.sessionLocationSearchCommands.length,1);
});
test('real SQL: distinct simultaneous searches by same player cannot bypass cooldown',async()=>{
 const {s,players:[a]}=await fixture();
 const r=await Promise.allSettled([search(a,'L1'),search(a,'L2')]);assert.equal(r.filter(x=>x.status==='fulfilled').length,1);
 const st=await state(s);assert.equal(st.sessionClueDiscoveries.length,1);assert.equal(st.sessionResources.find(r=>r.characterExternalId==='A').currentValue,4);
});
test('real SQL: two players get distinct unique clues even with concurrent selection',async()=>{
 const {s,players:[a,b]}=await fixture();
 const r=await Promise.all([search(a,'L1'),search(b,'L1')]);assert.notEqual(r[0].reward.clue.externalId,r[1].reward.clue.externalId);
 const st=await state(s);assert.equal(st.sessionClueDiscoveries.length,2);assert.deepEqual(st.sessionResources.map(x=>x.currentValue),[4,4]);
});
test('real SQL: a failing final write rolls back clue, PA, log and replay receipt',async()=>{
 const {s,players:[a]}=await fixture();
 await assert.rejects(()=>search(a,'L1',randomUUID(),{executor:(q,v)=>execute(q,{...v,notification:{...v.notification,gameSessionId:randomUUID()}})}));
 const st=await state(s);assert.equal(st.sessionClueDiscoveries.length,0);assert.equal(st.sessionResources.find(r=>r.characterExternalId==='A').currentValue,5);assert.equal(st.sessionLocationSearchCommands.length,0);assert.equal(st.sessionInteractionUses.length,0);
});
test('real SQL: own room and a session paused during the request are rejected without a charge',async()=>{
 const {s,players:[a]}=await fixture();await assert.rejects(()=>search(a,'OWN'),/LOCATION_OWNED/);
 await assert.rejects(()=>search(a,'L1',randomUUID(),{executor:async(q,v)=>{await execute('mutation Pause($s:UUID!){gameSession_update(id:$s,data:{status:"PAUSED"})}',{s});return execute(q,v);}}),/SEARCH_SESSION_NOT_LIVE/);
 const st=await state(s);assert.equal(st.sessionClueDiscoveries.length,0);assert.equal(st.sessionResources.find(r=>r.characterExternalId==='A').currentValue,5);
});

test('real SQL: examination is private, concurrent-safe and requires current possession',async()=>{
 const {s,v,players:[a,b]}=await fixture();
 await insert('GameObject','gameObject',{scenarioVersionId:v,externalId:'DOC',name:'Dossier',description:'Text',support:'DIGITAL'});
 await insert('SessionObject','sessionObject',{gameSessionId:s,objectExternalId:'DOC',holderType:'CHARACTER',holderExternalId:'A',inPlay:true});
 await insert('Fact','fact',{scenarioVersionId:v,externalId:'SECRET',title:'Private analysis',text:'Expert conclusion',nature:'INTERPRETATION',importance:'IMPORTANT'});
 await insert('Ability','ability',{scenarioVersionId:v,externalId:'SCI',name:'Expert',description:'Test',category:'INVESTIGATION'});
 await insert('AbilityAssignment','abilityAssignment',{scenarioVersionId:v,externalId:'A_SCI',ownerType:'CHARACTER',ownerExternalId:'A',abilityExternalId:'SCI',level:2});
 await insert('DocumentAnalysisDefinition','documentAnalysisDefinition',{scenarioVersionId:v,externalId:'ANA',targetType:'OBJECT',targetExternalId:'DOC',abilityExternalId:'SCI',minLevel:2,factExternalId:'SECRET'});
 const input={targetType:'OBJECT',targetExternalId:'DOC'};
 const before=await getPlayerPortal(a.token,{trackOpen:false});assert.ok(!JSON.stringify(before).includes('Expert conclusion'));
 await Promise.all([examinePlayerDocument(a.token,input),examinePlayerDocument(a.token,input)]);
 const knowledge=await read('query K($s:UUID!){sessionKnowledges(where:{gameSessionId:{eq:$s}}){characterExternalId factExternalId}}',{s});assert.equal(knowledge.sessionKnowledges.length,1);assert.equal(knowledge.sessionKnowledges[0].characterExternalId,'A');
 const other=await getPlayerPortal(b.token,{trackOpen:false});assert.ok(!JSON.stringify(other).includes('Expert conclusion'));
 await execute('mutation Move($s:UUID!){sessionObject_update(key:{gameSessionId:$s,objectExternalId:"DOC"},data:{holderExternalId:"B"})}',{s});
 await assert.rejects(()=>examinePlayerDocument(a.token,input),/DOCUMENT_NOT_IN_INVENTORY/);
 const unskilled=await examinePlayerDocument(b.token,input);assert.equal(unskilled.results.length,0);
 await execute('mutation Move($s:UUID!){sessionObject_update(key:{gameSessionId:$s,objectExternalId:"DOC"},data:{holderExternalId:"A"})}',{s});
 await assert.rejects(()=>examinePlayerDocument(a.token,input,{executor:async(q,vars)=>{await execute('mutation Move($s:UUID!){sessionObject_update(key:{gameSessionId:$s,objectExternalId:"DOC"},data:{holderExternalId:"B"})}',{s});return execute(q,vars);}}),/DOCUMENT_NOT_IN_INVENTORY/);
});

test('real SQL: scoped Nid migration applies atomically and is safe to replay',async()=>{
 const {readFileSync}=await import('node:fs');const {spawnSync}=await import('node:child_process');const {fileURLToPath}=await import('node:url');
 const patch=JSON.parse(readFileSync(new URL('../../fixtures/nid/readiness-corrections.json',import.meta.url)));
 const org=randomUUID(),sc=randomUUID(),v=patch.scenarioVersionId,s=randomUUID();
 await insert('Organization','organization',{id:org,name:'Migration',slug:org});
 await insert('Scenario','scenario',{id:sc,organizationId:org,title:'Nid migration',slug:sc});
 await insert('ScenarioVersion','scenarioVersion',{id:v,scenarioId:sc,sourceScenarioId:'NID_ESPIONS_1958_16',sourceHash:patch.expectedSourceHash,versionLabel:patch.expectedVersionLabel,templateVersion:'1.7',language:'FR',status:'TEST',gmSummary:'Test',playerSummary:'Test',mediaOverridesJson:'{"preserve":true}'});
 await insert('GameSession','gameSession',{id:s,organizationId:org,scenarioVersionId:v,status:'PAUSED',language:'FR'});
 for(const c of patch.characters)await insert('Character','character',{scenarioVersionId:v,externalId:c.externalId,name:c.externalId,biography:'Test',importance:'CORE',intensity:'MEDIUM'});
 for(const id of patch.protectedFacts)await insert('Fact','fact',{scenarioVersionId:v,externalId:id,title:'Identity',text:'Protected',nature:'FACT',importance:'IMPORTANT'});
 for(const row of patch.abilities)await insert('Ability','ability',row);
 for(const row of patch.interactions)await insert('Interaction','interaction',{...row,active:false});
 for(const row of patch.objects)await insert('GameObject','gameObject',{...row,scenarioVersionId:v,name:row.externalId,support:'DIGITAL'});
 await insert('SessionParticipant','sessionParticipant',{gameSessionId:s,displayName:'Test',characterExternalId:'P05',characterSnapshotJson:JSON.stringify({characterExternalId:'P05',character:{name:'Custom name',biography:'Les cinq mallettes.',interpretationNotes:'Custom notes'}})});
 await insert('SessionResource','sessionResource',{gameSessionId:s,characterExternalId:'P05',resourceExternalId:'RES_PA',initialValue:5,currentValue:4});
 const script=fileURLToPath(new URL('../tools/apply-nid-readiness.mjs',import.meta.url));
 for(let i=0;i<2;i++){const r=spawnSync(process.execPath,[script,'--emulator-fixture'],{env:process.env,encoding:'utf8'});assert.equal(r.status,0,r.stderr||r.stdout);}
 const rows=await read('query C($s:UUID!){sessionParticipants(where:{gameSessionId:{eq:$s}}){characterSnapshotJson}}',{s});const snap=JSON.parse(rows.sessionParticipants[0].characterSnapshotJson);assert.equal(snap.character.name,'Custom name');assert.equal(snap.character.biography,'Les mallettes.');assert.equal((snap.character.interpretationNotes.match(/Règles de la session/g)||[]).length,1);
});

test('real SQL: intimidation uses the held pistol and rejects a transfer racing the roll without PA debit',async()=>{
 const {executeInteraction}=await import('../src/interactions.mjs');const {s,v,players:[a,b]}=await fixture();
 await insert('Ability','ability',{scenarioVersionId:v,externalId:'AB_INTIMIDATION',name:'Intimidation',description:'Test',category:'SOCIAL'});
 await insert('AbilityAssignment','abilityAssignment',{scenarioVersionId:v,externalId:'INT_A',ownerType:'CHARACTER',ownerExternalId:'A',abilityExternalId:'AB_INTIMIDATION',level:1});
 await insert('Interaction','interaction',{scenarioVersionId:v,externalId:'INT',name:'Intimidation',category:'SOCIAL',targetType:'CHARACTER',abilityExternalId:'AB_INTIMIDATION',actorScope:'ABILITY_HOLDER',resolution:'OPPOSED',diceCount:2,diceSides:6,abilityLevelMultiplier:1,opposedAbilityExternalId:'AB_INTIMIDATION',tieRule:'DEFENDER',validation:'AUTO',costResourceExternalId:'RES_PA',costValue:1,costTiming:'BEFORE'});
 await insert('GameObject','gameObject',{scenarioVersionId:v,externalId:'GUN',name:'Pistol',description:'Test',support:'DIGITAL',bonusAbilityExternalId:'AB_INTIMIDATION',bonusValue:3});
 await insert('SessionObject','sessionObject',{gameSessionId:s,objectExternalId:'GUN',holderType:'CHARACTER',holderExternalId:'A'});
 const args={actorCharacterExternalId:'A',interactionExternalId:'INT',targetExternalId:'B'};
 const success=await executeInteraction(s,args,{roller:()=>3});assert.equal(success.actorTotal,10);assert.equal(success.targetTotal,6);assert.equal(success.cost.remaining,4);
 await assert.rejects(()=>executeInteraction(s,args,{roller:()=>3,executor:async(q,vars)=>{await execute('mutation Transfer($s:UUID!){sessionObject_update(key:{gameSessionId:$s,objectExternalId:"GUN"},data:{holderExternalId:"B"})}',{s});return execute(q,vars);}}),/INTERACTION_EQUIPMENT_CHANGED/);
 assert.equal((await state(s)).sessionResources.find(r=>r.characterExternalId==='A').currentValue,4);
 const unarmed=await executeInteraction(s,args,{roller:()=>3});assert.equal(unarmed.actorTotal,7);
});
