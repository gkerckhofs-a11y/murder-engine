import test from 'node:test';
import assert from 'node:assert/strict';
import {replaceSessionRehearsal,getSelfServiceState,PREPARED_SESSION_QUERY,PARTICIPANTS_QUERY,SOURCE_QUERY,TIMELINE_QUERY} from '../src/session-rehearsal.mjs';
import {ACCESS_QUERY} from '../src/session-access.mjs';
const id='11111111-1111-4111-8111-111111111111';
const old='22222222-2222-4222-8222-222222222222';
const person='33333333-3333-4333-8333-333333333333';
const identity={uid:'client',email:'client@example.com',email_verified:true};
const root=(extra={})=>({id,name:'Ma murder',language:'FR',venue:'Chez moi',status:'READY',runtimeInitializedAt:'previous',
  selfServiceEnabled:true,organizerAccessEnabled:true,organizerEmail:identity.email,realSessionStartedAt:null,rehearsalOfId:null,activeRehearsalId:null,
  organization:{id:'ORG'},scenarioVersion:{id:'VERSION',runtimeDataVersion:'0.9'},...extra});
const participant=(extra={})=>({id:person,displayName:'Alice',characterExternalId:'ALICE',characterSnapshotAt:'2026-11-05T12:00:00Z',
  characterSnapshotJson:JSON.stringify({characterExternalId:'ALICE',character:{name:'Alice personnalisée'}}),
  playerAccessToken:'original-token',active:true,...extra});
function readerFor(session=root(),people=[participant()]){return async(op,vars)=>{
  if(op===ACCESS_QUERY||op===PREPARED_SESSION_QUERY)return {gameSession:session};
  if(op===PARTICIPANTS_QUERY)return {sessionParticipants:people};
  if(op===SOURCE_QUERY)return {resources:[{externalId:'PA',scopeType:'PLAYER',defaultValue:5,active:true}],resourceAssignments:[],gameObjects:[{externalId:'KEY',ownerInitialType:'CHARACTER',ownerInitialExternalId:'ALICE',initialCharges:2}],objectives:[],initialKnowledges:[],gameStateDefinitions:[]};
  if(op===TIMELINE_QUERY)return {gamePhaseDefinitions:[{externalId:'INTRO',orderIndex:1}],gameEventDefinitions:[{externalId:'NEWS'}]};
  assert.fail('Unexpected read');
};}
test('new rehearsal clones configuration and frozen casting with new IDs/tokens and pristine resources',async()=>{
  let write;const result=await replaceSessionRehearsal(identity,id,{reader:readerFor(),executor:async(operation,variables)=>{write={operation,variables};}});
  assert.notEqual(result.workingSessionId,id);
  const rows=Object.values(write.variables).flat().filter(x=>x&&typeof x==='object');
  const child=rows.find(x=>x.rehearsalOfId===id),p=rows.find(x=>x.characterSnapshotJson),resource=rows.find(x=>x.resourceExternalId==='PA');
  assert.equal(child.venue,'Chez moi');assert.equal(child.status,'READY');
  assert.equal(p.characterSnapshotJson,participant().characterSnapshotJson);
  assert.notEqual(p.id,person);assert.notEqual(p.playerAccessToken,'original-token');
  assert.equal(resource.currentValue,5);assert.equal(resource.gameSessionId,result.workingSessionId);
  assert.match(write.operation,/@transaction/);assert.doesNotMatch(write.operation,/gameSession_delete|sessionParticipant_delete/);
});
test('reset archives former trial and disables its links without touching the original participants',async()=>{
  let write;await replaceSessionRehearsal(identity,id,{reader:readerFor(root({activeRehearsalId:old})),executor:async(operation,variables)=>{write={operation,variables};}});
  assert.equal(write.variables.oldId,old);assert.equal(write.variables.expectedRehearsalId,old);
  assert.match(write.operation,/disableOldPlayers: sessionParticipant_updateMany/);
  assert.match(write.operation,/activeRehearsalId: \{eq: \$expectedRehearsalId\}/);
  assert.match(write.operation,/organizerAccessEnabled: \{eq: true\}, organizerEmail: \{eq: \$email\}/);
});
test('real launch restores original runtime and tokens and records the irreversible start in the same transaction',async()=>{
  let write;const result=await replaceSessionRehearsal(identity,id,{real:true,reader:readerFor(root({activeRehearsalId:old})),executor:async(operation,variables)=>{write={operation,variables};}});
  assert.equal(result.workingSessionId,id);assert.equal(result.mode,'REAL');
  assert.equal(write.variables.rootData.status,'LIVE');assert.ok(write.variables.rootData.realSessionStartedAt);
  assert.match(write.operation,/realSessionStartedAt: \{isNull: true\}/);
  assert.match(write.operation,/sessionBallot_deleteMany/);
  assert.doesNotMatch(write.operation,/sessionParticipant_delete|gameSession_delete/);
  assert.equal(write.variables.rootData.currentPhaseExternalId,'INTRO');
  const rows=Object.values(write.variables).flat().filter(x=>x&&typeof x==='object');
  assert.ok(rows.some(x=>x.eventExternalId==='NEWS'));
  assert.ok(rows.some(x=>x.playerAccessToken==='original-token'&&x.playerAccessEnabled));
  assert.ok(rows.some(x=>x.gameSessionId===id&&x.currentValue===5));
});
test('real launch, archived/unprepared sessions, incomplete casting and unfrozen fiches reject without writes',async()=>{
  for(const [session,people,pattern] of [
    [root({realSessionStartedAt:'already'}),[participant()],/REAL_SESSION_ALREADY_STARTED/],
    [root({status:'DRAFT'}),[participant()],/SESSION_MUST_BE_READY/],
    [root(),[participant({characterExternalId:null})],/CASTING_INCOMPLETE/],
    [root(),[participant({characterSnapshotAt:null})],/SESSION_INCARNATIONS_NOT_FROZEN/],
  ]){
    let writes=0;
    await assert.rejects(()=>replaceSessionRehearsal(identity,id,{reader:readerFor(session,people),executor:async()=>{writes++;}}),pattern);
    assert.equal(writes,0);
  }
});
test('commercial state always resolves original, active rehearsal, then real session',async()=>{
  for(const [session,mode,working] of [[root(),'PREPARATION',id],[root({activeRehearsalId:old}),'REHEARSAL',old],[root({activeRehearsalId:old,realSessionStartedAt:'now'}),'REAL',id]]){
    const state=await getSelfServiceState(identity,id,{reader:readerFor(session)});assert.equal(state.mode,mode);assert.equal(state.workingSessionId,working);
  }
});
