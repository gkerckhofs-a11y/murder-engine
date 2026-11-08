import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getPlayerLocation,executePlayerLocationAction,transferPlayerObject,shapePlayerPortal,__playerOps} from '../src/player.mjs';
const src=JSON.parse(readFileSync(new URL('../../fixtures/nid/editorial-gameplay.json',import.meta.url)));
const patch=JSON.parse(readFileSync(new URL('../../fixtures/nid/editorial-corrections.json',import.meta.url)));
const token='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef1234567890_-';
const session={id:'S1',name:'Nid test',status:'LIVE',runtimeInitializedAt:'2026-11-08T00:00:00Z',scenarioVersion:{id:'V1',versionLabel:'Test',scenario:{title:'Nid'}},sessionParticipants_on_gameSession:src.characters.map(c=>({id:c.externalId,characterExternalId:c.externalId,active:true}))};
function setup(actor){
 const participant={id:actor,characterExternalId:actor,active:true,playerAccessEnabled:true,playerAccessToken:token};
 const rt={sessionObjects:src.gameObjects.map(o=>({objectExternalId:o.externalId,holderType:o.ownerInitialType,holderExternalId:o.ownerInitialExternalId,inPlay:true,identificationLevel:0})),sessionResources:src.characters.map(c=>({characterExternalId:c.externalId,resourceExternalId:'RES_PA',currentValue:5})),sessionClueDiscoveries:[],sessionKnowledges:[],sessionInteractionUses:[]};
 const reader=async op=>{if(op===__playerOps.PLAYER_ACCESS_QUERY)return {sessionParticipants:[{...participant,gameSession:session}]};if(op===__playerOps.PLAYER_SOURCE_QUERY)return src;if(op===__playerOps.PLAYER_RUNTIME_QUERY)return rt;throw Error('Unexpected read');};
 return {participant,rt,reader};
}
for(const m of patch.roomMoves)test('room pickup is unique, automatic and costs 1 PA: '+m.objectExternalId,async()=>{
 const {participant,rt,reader}=setup('P02'),writes=[];
 const location=await getPlayerLocation(token,m.toExternalId,{reader});assert.equal(location.forbidden,false);
 const action=location.actions.find(a=>a.available);assert.ok(action);assert.equal(action.diceCount,0);
 const out=await executePlayerLocationAction(token,{locationExternalId:m.toExternalId,interactionExternalId:action.externalId},{reader,executor:async(q,v)=>{writes.push(v);return{};}});
 assert.equal(out.reward.object.externalId,m.objectExternalId);assert.equal(out.result.cost.value,1);assert.equal(writes[0].objectId,m.objectExternalId);
 const item=rt.sessionObjects.find(o=>o.objectExternalId===m.objectExternalId);item.holderType='CHARACTER';item.holderExternalId='P02';
 assert.equal(shapePlayerPortal(participant,session,src,rt).inventory.filter(o=>o.objectExternalId===m.objectExternalId).length,1);
 const second=await executePlayerLocationAction(token,{locationExternalId:m.toExternalId,interactionExternalId:action.externalId},{reader,executor:async()=>({})});assert.notEqual(second.reward.object?.externalId,m.objectExternalId);
 const owner=setup(m.fromExternalId);assert.equal((await getPlayerLocation(token,m.toExternalId,{reader:owner.reader})).forbidden,true);
});
for(const [letter,owner] of [['A','P03'],['B','P14'],['C','P11']])test('original '+letter+' can be handed over and returned without duplicate possession',async()=>{
 const {participant,rt,reader}=setup(owner);const id='DOC_OBJ_DOC_NE_'+letter,other='P06';
 const transfer=async(s,input)=>{const row=rt.sessionObjects.find(o=>o.objectExternalId===input.objectExternalId);Object.assign(row,{holderType:input.holderType,holderExternalId:input.holderExternalId});return{};};
 const seen=[];const opts={reader,objectTransfer:transfer,clueReveal:async(s,i)=>{seen.push(i.characterExternalId);return{};},executor:async()=>({})};
 await transferPlayerObject(token,{objectExternalId:id,targetCharacterExternalId:other},opts);
 assert.ok(!shapePlayerPortal(participant,session,src,rt).inventory.some(o=>o.objectExternalId===id));
 participant.characterExternalId=other;
 assert.equal(shapePlayerPortal(participant,session,src,rt).inventory.filter(o=>o.objectExternalId===id).length,1);
 await transferPlayerObject(token,{objectExternalId:id,targetCharacterExternalId:owner},opts);
 assert.equal(rt.sessionObjects.filter(o=>o.objectExternalId===id).length,1);assert.equal(rt.sessionObjects.find(o=>o.objectExternalId===id).holderExternalId,owner);assert.deepEqual(new Set(seen),new Set([owner,other]));
});
