import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {heldAbilityBonus,resolveInteractionOutcome} from '../src/interactions.mjs';
import {planDocumentExamination} from '../src/document-analysis.mjs';
const patch=JSON.parse(readFileSync(new URL('../../fixtures/nid/readiness-corrections.json',import.meta.url)));
test('Nid firearms: +3 follows the current holder, no stacking, no bonus from a dropped weapon',()=>{
 const source={gameObjects:patch.objects},guns=patch.objects.filter(o=>o.bonusValue===3);
 assert.equal(guns.length,3);
 const runtime={sessionObjects:guns.map(o=>({objectExternalId:o.externalId,holderType:'CHARACTER',holderExternalId:'P04',inPlay:true}))};
 assert.equal(heldAbilityBonus(source,runtime,'P04','AB_INTIMIDATION'),3);
 assert.equal(heldAbilityBonus(source,runtime,'P07','AB_INTIMIDATION'),0);
 runtime.sessionObjects.forEach(o=>o.holderExternalId='P07');assert.equal(heldAbilityBonus(source,runtime,'P04','AB_INTIMIDATION'),0);assert.equal(heldAbilityBonus(source,runtime,'P07','AB_INTIMIDATION'),3);
 runtime.sessionObjects.forEach(o=>o.holderType='LOCATION');assert.equal(heldAbilityBonus(source,runtime,'P07','AB_INTIMIDATION'),0);
});
test('Nid intimidation: held pistol turns a tie into a success, otherwise defender wins',()=>{
 const interaction=patch.interactions.find(i=>i.abilityExternalId==='AB_INTIMIDATION');
 assert.equal(interaction.costValue,1);assert.equal(interaction.costTiming,'BEFORE');assert.equal(interaction.limitPerTarget,1);
 const ordinary=resolveInteractionOutcome(interaction,{level:1,flatBonus:0},{level:1,flatBonus:0},{roller:()=>3});
 const armed=resolveInteractionOutcome(interaction,{level:1,flatBonus:3},{level:1,flatBonus:0},{roller:()=>3});
 assert.equal(ordinary.success,false);assert.equal(armed.success,true);assert.equal(armed.actorTotal-ordinary.actorTotal,3);
});
test('Nid analyses include the fake; conclusions require skill and possession',()=>{
 assert.equal(patch.documentAnalyses.length,12);assert.equal(patch.protectedFacts.length,16);
 const source={gameObjects:patch.objects,documentAnalyses:patch.documentAnalyses,facts:patch.facts,abilities:[{externalId:'AB_AUTH_SCI'}],abilityAssignments:[{ownerType:'CHARACTER',ownerExternalId:'P06',abilityExternalId:'AB_AUTH_SCI',level:2}]};
 const runtime={sessionObjects:[{objectExternalId:'OBJ_CHRONOS_COPIE',holderType:'CHARACTER',holderExternalId:'P06',inPlay:true}]};
 assert.equal(planDocumentExamination(source,runtime,'P06','OBJECT','OBJ_CHRONOS_COPIE').results.length,2);
 assert.throws(()=>planDocumentExamination(source,runtime,'P15','OBJECT','OBJ_CHRONOS_COPIE'),/IN_INVENTORY/);
 assert.ok(patch.objects.find(o=>o.externalId==='OBJ_CHRONOS_COPIE').description.length>600);
});
