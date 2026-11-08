import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp} from 'firebase-admin/app';
import {getDataConnect} from 'firebase-admin/data-connect';
import {replaceSessionRehearsal, getSelfServiceState} from '../src/session-rehearsal.mjs';
import {authorizeSession, configureSessionAccess} from '../src/session-access.mjs';
import {getPlayerPortal} from '../src/player.mjs';
import {initializeSessionRuntime} from '../src/runtime.mjs';
import {controlLiveSession,changeLiveResource} from '../src/live.mjs';

assert.ok(process.env.DATA_CONNECT_EMULATOR_HOST,'Local SQL Connect emulator required');
assert.equal(process.env.GCLOUD_PROJECT,'demo-murder-engine-votes');
initializeApp({projectId:'demo-murder-engine-votes'});
const dc=getDataConnect({location:'europe-west1',serviceId:'murder-engine'});
async function execute(operation,variables={}) {
  const response=await dc.executeGraphql(operation,{variables});assert.deepEqual(response.errors??[],[]);return response.data;
}
async function read(operation,variables={}) {
  const response=await dc.executeGraphqlRead(operation,{variables});assert.deepEqual(response.errors??[],[]);return response.data;
}
async function insert(type,field,rows) {
  if(!rows.length)return;
  for(let offset=0;offset<rows.length;offset+=50)await execute(`mutation Seed($rows:[${type}_Data!]!) { ${field}_insertMany(data:$rows) }`,{rows:rows.slice(offset,offset+50)});
}
const identity={uid:'client',email:'client@example.com',email_verified:true};
async function fixture(){
  const org=randomUUID(),scenario=randomUUID(),version=randomUUID(),session=randomUUID(),person=randomUUID();
  await insert('Organization','organization',[{id:org,name:'Local tests',slug:org}]);
  await insert('Scenario','scenario',[{id:scenario,organizationId:org,title:'Self-service murder',slug:scenario}]);
  await insert('ScenarioVersion','scenarioVersion',[{id:version,scenarioId:scenario,sourceScenarioId:scenario,versionLabel:'local',templateVersion:'1.4',language:'FR',status:'READY',gmSummary:'Local GM',playerSummary:'Local story',runtimeDataVersion:'0.9'}]);
  await insert('GameSession','gameSession',[{id:session,organizationId:org,scenarioVersionId:version,name:'Partie client',venue:'Lieu conservé',language:'FR',status:'READY'}]);
  const snapshot=JSON.stringify({characterExternalId:'ALICE',character:{name:'Alice adaptée',biography:'Fiche personnalisée'},objectives:[],relationships:[]});
  await insert('Character','character',[{scenarioVersionId:version,externalId:'ALICE',name:'Alice canonique',biography:'Original',importance:'CORE',intensity:'MEDIUM'}]);
  await insert('SessionParticipant','sessionParticipant',[{id:person,gameSessionId:session,displayName:'Client player',email:'player@example.com',characterExternalId:'ALICE',characterSnapshotAt:new Date().toISOString(),characterSnapshotJson:snapshot,privateNotesJson:'[]'}]);
  await insert('Resource','resource',[{scenarioVersionId:version,externalId:'PA',name:'Actions',scopeType:'PLAYER',defaultValue:5,maxValue:5,physicalMode:'VIRTUAL'}]);
  // >100 assignments prove that baseline initialization is paginated.
  await insert('ResourceAssignment','resourceAssignment',Array.from({length:101},(_,i)=>({scenarioVersionId:version,externalId:`ASSIGN_${String(i).padStart(3,'0')}`,ownerType:'CHARACTER',ownerExternalId:i===100?'ALICE':`OTHER_${i}`,resourceExternalId:'PA',initialValue:i===100?7:1})));
  await insert('GamePhaseDefinition','gamePhaseDefinition',[{scenarioVersionId:version,externalId:'INTRO',name:'Introduction',orderIndex:1,gmDescription:'Begin',triggerType:'MANUAL'}]);
  await insert('GameEventDefinition','gameEventDefinition',[{scenarioVersionId:version,externalId:'NEWS',title:'News',gmDescription:'Publish',triggerType:'TIME_RELATIVE',delayMinutes:10,validation:'GM',priority:'NORMAL'}]);
  await configureSessionAccess(session,{email:identity.email,enabled:true});
  const configured=await read('query CheckAccess($s:UUID!){gameSession(id:$s){id organizerEmail organizerAccessEnabled selfServiceEnabled status rehearsalOfId}}',{s:session});
  assert.equal(configured.gameSession.organizerAccessEnabled,true,JSON.stringify(configured));
  await initializeSessionRuntime(session);
  return {session,person,snapshot};
}
const state=async(session)=>read(`query State($s:UUID!){gameSession(id:$s){id status name venue startedAt realSessionStartedAt activeRehearsalId currentPhaseExternalId}sessionParticipants(where:{gameSessionId:{eq:$s}}){id characterSnapshotJson playerAccessToken playerAccessEnabled}sessionResources(where:{gameSessionId:{eq:$s}}){currentValue}sessionEvents(where:{gameSessionId:{eq:$s}}){eventExternalId status}}`,{s:session});

test('SQL Connect: delegated rehearsal/reset/real launch preserves configuration and isolates runs',async t=>{
  const {session,person,snapshot}=await fixture();let first,second,firstToken;
  await t.test('assigned client only; first trial is isolated and copies all initial assignments',async()=>{
    await authorizeSession(identity,session);
    await assert.rejects(()=>authorizeSession({...identity,email:'other@example.com'},session),/SESSION_ACCESS_DENIED/);
    first=await replaceSessionRehearsal(identity,session);
    assert.notEqual(first.workingSessionId,session);
    const testState=await state(first.workingSessionId);assert.equal(testState.sessionResources[0].currentValue,7);
    assert.equal(testState.sessionParticipants[0].characterSnapshotJson,snapshot);
    assert.notEqual(testState.sessionParticipants[0].id,person);
    firstToken=testState.sessionParticipants[0].playerAccessToken;
    assert.equal((await getPlayerPortal(firstToken,{trackOpen:false})).session.rehearsal,true);
    assert.equal((await state(session)).sessionResources[0].currentValue,5); // legacy initializer is untouched by trials
    await controlLiveSession(first.workingSessionId,'START');
    await changeLiveResource(first.workingSessionId,{characterExternalId:'ALICE',resourceExternalId:'PA',mode:'SET',value:1});
  });
  await t.test('reset retires former links and restores pristine state under a new session ID',async()=>{
    second=await replaceSessionRehearsal(identity,session);
    const before=await state(first.workingSessionId),after=await state(second.workingSessionId),original=await state(session);
    assert.equal(before.gameSession.status,'ARCHIVED');assert.equal(before.sessionParticipants[0].playerAccessEnabled,false);
    await assert.rejects(()=>getPlayerPortal(firstToken,{trackOpen:false}));
    await assert.rejects(()=>authorizeSession(identity,first.workingSessionId),/SESSION_ACCESS_DENIED/);
    assert.equal(after.sessionResources[0].currentValue,7);assert.equal(after.sessionParticipants[0].characterSnapshotJson,snapshot);
    assert.notEqual(after.sessionParticipants[0].playerAccessToken,firstToken);
    assert.equal(original.gameSession.venue,'Lieu conservé');assert.equal(original.sessionParticipants[0].id.replaceAll('-',''),person.replaceAll('-',''));
  });
  await t.test('double real launch commits once, closes tests, starts clean events and enables real links',async()=>{
    const results=await Promise.allSettled([replaceSessionRehearsal(identity,session,{real:true}),replaceSessionRehearsal(identity,session,{real:true})]);
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
    const real=await state(session),old=await state(second.workingSessionId);
    assert.equal(real.gameSession.status,'LIVE');assert.ok(real.gameSession.realSessionStartedAt);
    assert.equal(real.gameSession.currentPhaseExternalId,'INTRO');assert.equal(real.gameSession.activeRehearsalId,null);
    assert.equal(real.sessionResources[0].currentValue,7);assert.equal(real.sessionEvents[0].status,'PENDING');
    assert.equal(real.sessionParticipants[0].id.replaceAll('-',''),person.replaceAll('-',''));assert.equal(real.sessionParticipants[0].playerAccessEnabled,true);
    assert.equal((await getPlayerPortal(real.sessionParticipants[0].playerAccessToken,{trackOpen:false})).session.rehearsal,false);
    assert.equal(old.gameSession.status,'ARCHIVED');
    await assert.rejects(()=>replaceSessionRehearsal(identity,session),/REAL_SESSION_ALREADY_STARTED/);
    await assert.rejects(()=>replaceSessionRehearsal(identity,session,{real:true}),/REAL_SESSION_ALREADY_STARTED/);
    assert.equal((await getSelfServiceState(identity,session)).mode,'REAL');
  });
  await t.test('access is revocable after launch without altering the game',async()=>{
    await configureSessionAccess(session,{email:identity.email,enabled:false});
    await assert.rejects(()=>authorizeSession(identity,session),/SESSION_ACCESS_DENIED/);
    assert.equal((await state(session)).gameSession.status,'LIVE');
  });
});
