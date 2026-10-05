import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRuntimePlan, initializeSessionRuntime, shapeRuntimeState, __runtimeOps } from '../src/runtime.mjs';

function readySession(overrides={}) {
  return {
    id:'S1', status:'READY', runtimeInitializedAt:null, runtimeVersion:null,
    scenarioVersion:{id:'V1',runtimeDataVersion:'0.6'},
    sessionParticipants_on_gameSession:[
      {id:'P1',displayName:'Alice',active:true,characterExternalId:'CHAR_A'},
      {id:'P2',displayName:'Bob',active:true,characterExternalId:'CHAR_B'},
    ],
    ...overrides,
  };
}

function source() {
  return {
    resources:[
      {externalId:'RES_PA',scopeType:'PLAYER',defaultValue:5,maxValue:5,active:true},
      {externalId:'RES_CASH',scopeType:'PLAYER',defaultValue:null,maxValue:null,active:true},
      {externalId:'RES_GLOBAL',scopeType:'SESSION',defaultValue:1,maxValue:9,active:true},
    ],
    resourceAssignments:[
      {externalId:'RA_A_CASH',ownerType:'CHARACTER',ownerExternalId:'CHAR_A',resourceExternalId:'RES_CASH',initialValue:500,maxOverride:null,active:true},
      {externalId:'RA_B_PA',ownerType:'CHARACTER',ownerExternalId:'CHAR_B',resourceExternalId:'RES_PA',initialValue:6,maxOverride:6,active:true},
    ],
    initialKnowledges:[
      {characterExternalId:'CHAR_A',factExternalId:'FACT_1',sourceType:'INITIAL'},
      {characterExternalId:'CHAR_X',factExternalId:'FACT_X',sourceType:'INITIAL'},
    ],
    objectives:[
      {externalId:'OBJ_A',ownerType:'CHARACTER',ownerExternalId:'CHAR_A',initialStatus:'ACTIVE',active:true},
      {externalId:'OBJ_X',ownerType:'CHARACTER',ownerExternalId:'CHAR_X',initialStatus:'ACTIVE',active:true},
    ],
    gameObjects:[
      {externalId:'ITEM_A',ownerInitialType:'CHARACTER',ownerInitialExternalId:'CHAR_A',initialCharges:1,active:true},
      {externalId:'ITEM_ROOM',ownerInitialType:'LOCATION',ownerInitialExternalId:'LOC_OFFICE',initialCharges:null,active:true},
    ],
    gameStateDefinitions:[{externalId:'STATE_BLESSE',active:true}],
  };
}

test('runtime plan initializes PA defaults and character overrides', () => {
  const plan=buildRuntimePlan(readySession(),source());
  const aPa=plan.resources.find(r=>r.characterExternalId==='CHAR_A'&&r.resourceExternalId==='RES_PA');
  const bPa=plan.resources.find(r=>r.characterExternalId==='CHAR_B'&&r.resourceExternalId==='RES_PA');
  const aCash=plan.resources.find(r=>r.characterExternalId==='CHAR_A'&&r.resourceExternalId==='RES_CASH');
  const bCash=plan.resources.find(r=>r.characterExternalId==='CHAR_B'&&r.resourceExternalId==='RES_CASH');
  assert.deepEqual({initial:aPa.initialValue,max:aPa.maxValue},{initial:5,max:5});
  assert.deepEqual({initial:bPa.initialValue,max:bPa.maxValue},{initial:6,max:6});
  assert.equal(aCash.currentValue,500);
  assert.equal(bCash,undefined);
  assert.equal(plan.resources.some(r=>r.resourceExternalId==='RES_GLOBAL'),false);
});

test('runtime plan only copies cast character objectives and knowledge but all active objects', () => {
  const plan=buildRuntimePlan(readySession(),source());
  assert.deepEqual(plan.knowledge.map(x=>x.factExternalId),['FACT_1']);
  assert.deepEqual(plan.objectives.map(x=>x.objectiveExternalId),['OBJ_A']);
  assert.equal(plan.objects.length,2);
  assert.equal(plan.objects[0].holderExternalId,'CHAR_A');
  assert.equal(plan.stateDefinitions.length,1);
});

test('runtime plan requires READY, complete casting and V0.6 source data', () => {
  assert.throws(()=>buildRuntimePlan(readySession({status:'CASTING'}),source()),/SESSION_MUST_BE_READY/);
  assert.throws(()=>buildRuntimePlan(readySession({scenarioVersion:{id:'V1',runtimeDataVersion:null}}),source()),/RUNTIME_SOURCE_NOT_READY/);
  assert.throws(()=>buildRuntimePlan(readySession({sessionParticipants_on_gameSession:[{id:'P1',displayName:'Alice',active:true,characterExternalId:null}]}),source()),/CASTING_INCOMPLETE/);
});

test('runtime initialization inserts missing state and marks session only after data writes', async () => {
  const writes=[];
  const result=await initializeSessionRuntime('S1',{
    reader:async(operation)=>{
      if(operation===__runtimeOps.RUNTIME_SESSION_QUERY) return {gameSession:readySession()};
      if(operation===__runtimeOps.RUNTIME_SOURCE_QUERY) return source();
      if(operation===__runtimeOps.RUNTIME_STATE_QUERY) return {sessionCharacters:[],sessionResources:[],sessionKnowledges:[],sessionObjectives:[],sessionObjects:[],sessionCharacterStates:[]};
      assert.fail('unexpected read');
    },
    executor:async(operation,variables)=>{writes.push({operation,variables});return {};},
  });
  assert.equal(result.alreadyInitialized,false);
  assert.deepEqual(result.inserted,{characters:2,resources:3,knowledge:1,objectives:1,objects:2});
  assert.equal(writes.at(-1).operation,__runtimeOps.MARK_RUNTIME_INITIALIZED_MUTATION);
  assert.equal(writes.at(-1).variables.runtimeVersion,'0.8');
});

test('runtime initialization is idempotent when marker already exists', async () => {
  let writes=0;
  const result=await initializeSessionRuntime('S1',{
    reader:async()=>({gameSession:readySession({runtimeInitializedAt:'2026-09-21T10:00:00Z',runtimeVersion:'0.6'})}),
    executor:async()=>{writes+=1;return {};},
  });
  assert.equal(result.alreadyInitialized,true);
  assert.equal(writes,0);
});

test('runtime summary groups resources and held objects by character', () => {
  const shaped=shapeRuntimeState({
    sessionCharacters:[{characterExternalId:'CHAR_A',participantId:'P1',status:'READY',active:true}],
    sessionResources:[{characterExternalId:'CHAR_A',resourceExternalId:'RES_PA',currentValue:5,initialValue:5,maxValue:5}],
    sessionObjectives:[{characterExternalId:'CHAR_A',objectiveExternalId:'OBJ_1'}],
    sessionKnowledges:[{characterExternalId:'CHAR_A',factExternalId:'FACT_1'}],
    sessionObjects:[{objectExternalId:'ITEM_A',holderType:'CHARACTER',holderExternalId:'CHAR_A',inPlay:true}],
    sessionCharacterStates:[{characterExternalId:'CHAR_A',stateExternalId:'STATE_BLESSE',active:true}],
  },[{id:'P1',displayName:'Alice',characterExternalId:'CHAR_A'}]);
  assert.equal(shaped.characters[0].participantName,'Alice');
  assert.equal(shaped.characters[0].objectCount,1);
  assert.equal(shaped.characters[0].states.length,1);
  assert.deepEqual(shaped.counts,{characters:1,resources:1,knowledge:1,objectives:1,objects:1,activeStates:1});
});

test('runtime write operations use inserts and never upserts', () => {
  for(const operation of Object.values(__runtimeOps)) assert.doesNotMatch(operation,/_upsert/);
});
