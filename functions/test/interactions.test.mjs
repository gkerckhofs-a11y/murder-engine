import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rollDice, resolveInteractionOutcome, shapeInteractionDashboard,
  executeInteraction, revealClueToCharacter, transferSessionObject, __interactionOps,
} from '../src/interactions.mjs';

const session=(overrides={})=>({
  id:'S1',status:'LIVE',runtimeInitializedAt:'2026-09-21T18:55:00.000Z',runtimeVersion:'0.8',
  scenarioVersion:{id:'V1',runtimeDataVersion:'0.8'},
  sessionParticipants_on_gameSession:[
    {id:'P1',displayName:'Alice',active:true,characterExternalId:'CHAR_A'},
    {id:'P2',displayName:'Bob',active:true,characterExternalId:'CHAR_B'},
  ],...overrides,
});
const source=()=>({
  abilities:[
    {externalId:'ABILITY_FOUILLE',name:'Fouille',description:'Chercher',defaultLevel:1,defaultMaxUses:null,defaultCooldownMinutes:0,active:true},
    {externalId:'ABILITY_DEF',name:'Résistance',description:'Résister',defaultLevel:1,defaultCooldownMinutes:0,active:true},
  ],
  abilityAssignments:[
    {externalId:'AA1',ownerType:'CHARACTER',ownerExternalId:'CHAR_A',abilityExternalId:'ABILITY_FOUILLE',level:2,flatBonus:1,usesOverride:null,cooldownOverrideMinutes:null,active:true},
    {externalId:'AA2',ownerType:'CHARACTER',ownerExternalId:'CHAR_B',abilityExternalId:'ABILITY_DEF',level:1,flatBonus:0,active:true},
  ],
  interactions:[
    {externalId:'ACT_FOUILLE',name:'Fouiller',category:'INVESTIGATION',targetType:'LOCATION',abilityExternalId:'ABILITY_FOUILLE',actorScope:'ABILITY_HOLDER',costResourceExternalId:'RES_PA',costValue:1,costTiming:'BEFORE',resolution:'DICE',diceCount:2,diceSides:6,abilityLevelMultiplier:1,flatBonus:0,difficulty:8,validation:'AUTO',limitPerTarget:1,cooldownMinutes:0,targetSecret:false,active:true},
    {externalId:'ACT_GM',name:'Réseau',category:'INVESTIGATION',targetType:'NONE',abilityExternalId:'ABILITY_FOUILLE',actorScope:'ABILITY_HOLDER',costResourceExternalId:'RES_PA',costValue:1,costTiming:'BEFORE',resolution:'GM',validation:'GM',cooldownMinutes:60,active:true},
  ],
  gameLocations:[{externalId:'LOC_OFFICE',name:'Bureau',description:'Pièce',active:true}],
  gameObjects:[{externalId:'ITEM_KEY',name:'Clé',description:'Clé',transferable:true,stealable:true,consumable:false,critical:false,active:true}],
  clues:[{externalId:'CLUE_1',playerName:'Lettre',clueType:'DOCUMENT',playerText:'Texte',gmInterpretation:'Sens',locationExternalId:'LOC_OFFICE',objectExternalId:null,active:true}],
  clueFacts:[{clueExternalId:'CLUE_1',factExternalId:'FACT_1'}],
  characters:[{externalId:'CHAR_A',name:'Alice Character',active:true},{externalId:'CHAR_B',name:'Bob Character',active:true}],
});
const runtime=()=>({
  sessionResources:[{characterExternalId:'CHAR_A',resourceExternalId:'RES_PA',initialValue:5,currentValue:5,maxValue:5}],
  sessionObjects:[{objectExternalId:'ITEM_KEY',holderType:'CHARACTER',holderExternalId:'CHAR_A',charges:1,identificationLevel:0,inPlay:true}],
  sessionInteractionUses:[],sessionClueDiscoveries:[],sessionKnowledge:[],
});
function readerFor(sess=session(),src=source(),rt=runtime()) { return async(op)=>{
  if(op===__interactionOps.INTERACTION_SESSION_QUERY) return {gameSession:sess};
  if(op===__interactionOps.INTERACTION_SOURCE_QUERY) return src;
  if(op===__interactionOps.INTERACTION_RUNTIME_QUERY) return rt;
  assert.fail('unexpected read');
};}

test('rollDice and DICE resolution use level multiplier and flat bonuses',()=>{
  const values=[3,4];
  const rolled=rollDice(2,6,()=>values.shift());
  assert.deepEqual(rolled.rolls,[3,4]); assert.equal(rolled.sum,7);
  const outcome=resolveInteractionOutcome(source().interactions[0],{level:2,flatBonus:1},null,{roller:(()=>{const v=[2,3];return()=>v.shift();})()});
  assert.equal(outcome.actorTotal,8); assert.equal(outcome.success,true);
});

test('GM resolution requires explicit MJ outcome',()=>{
  assert.throws(()=>resolveInteractionOutcome(source().interactions[1],{level:2,flatBonus:0},null,{}),/GM_OUTCOME_REQUIRED/);
  assert.equal(resolveInteractionOutcome(source().interactions[1],{level:2,flatBonus:0},null,{gmOutcome:'SUCCESS'}).success,true);
});

test('dashboard exposes only interactions backed by assigned abilities',()=>{
  const out=shapeInteractionDashboard(session(),source(),runtime(),new Date('2026-09-21T19:00:00.000Z'));
  assert.equal(out.sourceReady,true); assert.equal(out.actors.length,2);
  assert.equal(out.actors[0].interactions.length,2);
  assert.equal(out.actors[1].interactions.length,0);
  assert.equal(out.objects[0].name,'Clé');
});

test('executing a dice interaction deducts PA and records result atomically',async()=>{
  const writes=[]; const seq=[3,4];
  const out=await executeInteraction('S1',{actorCharacterExternalId:'CHAR_A',interactionExternalId:'ACT_FOUILLE',targetExternalId:'LOC_OFFICE'},
    {reader:readerFor(),executor:async(op,vars)=>{writes.push({op,vars});return {};},now:new Date('2026-09-21T19:00:00.000Z'),roller:()=>seq.shift()});
  assert.equal(out.success,true); assert.equal(out.cost.remaining,4);
  assert.equal(writes.length,1); assert.equal(writes[0].op,__interactionOps.EXECUTE_WITH_COST_MUTATION);
  assert.equal(writes[0].vars.currentValue,4);
  assert.equal(writes[0].vars.use.targetExternalId,'LOC_OFFICE');
});

test('interaction refuses insufficient PA before writing',async()=>{
  const rt=runtime(); rt.sessionResources[0].currentValue=0; let writes=0;
  await assert.rejects(()=>executeInteraction('S1',{actorCharacterExternalId:'CHAR_A',interactionExternalId:'ACT_FOUILLE',targetExternalId:'LOC_OFFICE'},
    {reader:readerFor(session(),source(),rt),executor:async()=>{writes++;return {};},roller:()=>4}),/INTERACTION_INSUFFICIENT_RESOURCE/);
  assert.equal(writes,0);
});

test('per-target limit blocks a second search of same location',async()=>{
  const rt=runtime(); rt.sessionInteractionUses=[{interactionExternalId:'ACT_FOUILLE',actorCharacterExternalId:'CHAR_A',targetExternalId:'LOC_OFFICE',createdAt:'2026-09-21T18:00:00.000Z'}];
  await assert.rejects(()=>executeInteraction('S1',{actorCharacterExternalId:'CHAR_A',interactionExternalId:'ACT_FOUILLE',targetExternalId:'LOC_OFFICE'},
    {reader:readerFor(session(),source(),rt),executor:async()=>({}),roller:()=>4}),/INTERACTION_TARGET_LIMIT_REACHED/);
});

test('GM interaction cooldown is enforced from use history',async()=>{
  const rt=runtime(); rt.sessionInteractionUses=[{interactionExternalId:'ACT_GM',actorCharacterExternalId:'CHAR_A',targetExternalId:null,createdAt:'2026-09-21T18:30:00.000Z'}];
  await assert.rejects(()=>executeInteraction('S1',{actorCharacterExternalId:'CHAR_A',interactionExternalId:'ACT_GM',gmOutcome:'SUCCESS'},
    {reader:readerFor(session(),source(),rt),executor:async()=>({}),now:new Date('2026-09-21T19:00:00.000Z')}),/INTERACTION_COOLDOWN_ACTIVE/);
});

test('revealing a clue records discovery and linked facts',async()=>{
  const writes=[];
  const out=await revealClueToCharacter('S1',{characterExternalId:'CHAR_A',clueExternalId:'CLUE_1',sourceInteractionExternalId:'ACT_FOUILLE',sourceRef:'LOC_OFFICE'},
    {reader:readerFor(),executor:async(op,vars)=>{writes.push({op,vars});return {};},now:new Date('2026-09-21T19:10:00.000Z')});
  assert.equal(out.factsAdded,1); assert.equal(writes[0].op,__interactionOps.REVEAL_CLUE_MUTATION);
  assert.equal(writes[0].vars.knowledge[0].factExternalId,'FACT_1');
});

test('object transfer moves runtime ownership and audits it',async()=>{
  const writes=[];
  const out=await transferSessionObject('S1',{objectExternalId:'ITEM_KEY',holderType:'CHARACTER',holderExternalId:'CHAR_B'},
    {reader:readerFor(),executor:async(op,vars)=>{writes.push({op,vars});return {};},now:new Date('2026-09-21T19:12:00.000Z')});
  assert.equal(out.holderExternalId,'CHAR_B'); assert.equal(writes[0].op,__interactionOps.TRANSFER_OBJECT_MUTATION);
  assert.equal(writes[0].vars.holderExternalId,'CHAR_B');
});
