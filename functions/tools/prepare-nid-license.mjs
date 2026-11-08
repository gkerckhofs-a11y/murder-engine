import assert from 'node:assert/strict';
import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {accessReader, accessExecutor, authorizeSession, authorizeEndpoint} from '../src/session-access.mjs';
import {getSelfServiceState, replaceSessionRehearsal} from '../src/session-rehearsal.mjs';

assert.equal(process.env.GCLOUD_PROJECT, 'murder-engine-ludificateur');
initializeApp({projectId:process.env.GCLOUD_PROJECT});
const sessionId = 'd1a40507-811f-4695-a119-e16ed74eb5cd';
const email = 'collin.marielle@hotmail.com';

const stateQuery = `query InspectNidLicence($sessionId: UUID!) {
  gameSession(id:$sessionId){
    id name status scheduledAt venue language runtimeInitializedAt startedAt pausedAt finishedAt notes
    liveClockStartedAt liveElapsedSeconds currentPhaseExternalId
    organizerEmail organizerAccessEnabled selfServiceEnabled realSessionStartedAt rehearsalOfId activeRehearsalId
    scenarioVersion { sourceScenarioId versionLabel }
  }
  sessionParticipants(where:{gameSessionId:{eq:$sessionId}},limit:100){
    id characterExternalId active playerAccessEnabled playerAccessToken characterSnapshotAt
  }
  sessionActionLogs(where:{gameSessionId:{eq:$sessionId}},limit:1000){actionType}
  sessionClueDiscoveries(where:{gameSessionId:{eq:$sessionId}},limit:1000){clueExternalId}
  sessionResources(where:{gameSessionId:{eq:$sessionId}},limit:1000){characterExternalId resourceExternalId initialValue currentValue}
  sessionCasino(key:{gameSessionId:$sessionId}){revision stateJson}
}`;
const state = await accessReader(stateQuery, {sessionId});
const session = state.gameSession;
assert.equal(session.scenarioVersion.sourceScenarioId, 'NID_ESPIONS_1958_16');
assert.equal(session.scenarioVersion.versionLabel, '1.3-master-20261107-r2');
const auth = await getAuth().getUserByEmail(email).then(user=>({
  exists:true, verified:user.emailVerified, disabled:user.disabled,
  google:user.providerData.some(provider=>provider.providerId==='google.com'),
})).catch(error=>{
  if(error.code==='auth/user-not-found')return {exists:false};
  return {unknown:error.code??'AUTH_LOOKUP_FAILED'};
});
const {organizerEmail, notes, ...publicState} = session;
console.log(JSON.stringify({session:publicState, sameOrganizer:organizerEmail?.toLowerCase()===email,
  otherOrganizer:Boolean(organizerEmail && organizerEmail.toLowerCase()!==email), auth,
  players:state.sessionParticipants.length,
  activeLinks:state.sessionParticipants.filter(player=>player.active && player.playerAccessEnabled && player.playerAccessToken).length,
  frozen:state.sessionParticipants.filter(player=>player.characterSnapshotAt).length,
  actionTypes:Object.fromEntries([...new Set(state.sessionActionLogs.map(row=>row.actionType))].map(action=>[action,state.sessionActionLogs.filter(row=>row.actionType===action).length])),
  discoveries:state.sessionClueDiscoveries.length,
  resourcesChanged:state.sessionResources.filter(row=>row.initialValue!==row.currentValue).length,
  casinoRevision:state.sessionCasino?.revision??null,
}));

if (process.argv.includes('--apply')) {
  assert.equal(session.name, 'Nid d’espions — TEST JOUEURS — 16 participants');
  assert.equal(session.status, 'PAUSED');
  assert.equal(session.selfServiceEnabled, false);
  assert.equal(session.organizerAccessEnabled, false);
  assert.equal(session.organizerEmail, null);
  assert.equal(session.realSessionStartedAt, null);
  assert.equal(session.activeRehearsalId, null);
  assert.equal(session.rehearsalOfId, null);
  assert.equal(session.liveClockStartedAt, null);
  assert.equal(state.sessionParticipants.length, 16);
  assert.ok(state.sessionParticipants.every(player=>player.active && player.playerAccessEnabled && player.playerAccessToken && player.characterSnapshotAt));
  assert.equal(state.sessionClueDiscoveries.length, 0);
  assert.ok(state.sessionActionLogs.every(row=>['CASINO','LIVE_START','DOCUMENT_EXAMINED','LIVE_PAUSE'].includes(row.actionType)));
  const data = {
    venue:'Centerpark',
    organizerEmail:email,
    organizerAccessEnabled:true,
    selfServiceEnabled:true,
    status:'READY',
    startedAt:null,
    pausedAt:null,
    finishedAt:null,
    liveClockStartedAt:null,
    liveElapsedSeconds:0,
    currentPhaseExternalId:null,
  };
  const schedule = process.env.NID_SCHEDULED_AT;
  if (schedule) {
    const date = new Date(schedule);
    assert.ok(Number.isFinite(date.getTime()));
    assert.equal(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).format(date),'2026-11-13');
    data.scheduledAt = date.toISOString();
  }
  const backup = Object.fromEntries(Object.keys(data).map(key=>[key,session[key]??null]));
  const operation = `mutation PrepareLicensedNid($sessionId:UUID!, $started:Timestamp!, $paused:Timestamp!, $data:GameSession_Data!, $backup:String!) @transaction {
    activate:gameSession_updateMany(where:{
      id:{eq:$sessionId}, status:{eq:"PAUSED"}, startedAt:{eq:$started}, pausedAt:{eq:$paused},
      selfServiceEnabled:{eq:false}, organizerAccessEnabled:{eq:false}, organizerEmail:{isNull:true},
      realSessionStartedAt:{isNull:true}, activeRehearsalId:{isNull:true}, rehearsalOfId:{isNull:true}
    },data:$data) @check(expr:"this == 1",message:"NID_LICENCE_STATE_CHANGED")
    sessionActionLog_insert(data:{gameSessionId:$sessionId,actionType:"LICENCE_PREPARATION_FROM_TEST",beforeValue:"PAUSED",afterValue:"READY",note:$backup})
  }`;
  await accessExecutor(operation, {sessionId, started:session.startedAt, paused:session.pausedAt, data, backup:JSON.stringify(backup)});
  const after = await accessReader(stateQuery,{sessionId});
  for(const [key,value] of Object.entries(data)) {
    if(key==='scheduledAt')assert.equal(new Date(after.gameSession[key]).toISOString(),value);
    else assert.equal(after.gameSession[key],value,key);
  }
  const stable = rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
  assert.deepEqual(stable(after.sessionParticipants),stable(state.sessionParticipants));
  assert.deepEqual(after.sessionCasino,state.sessionCasino);
  assert.deepEqual(after.sessionClueDiscoveries,state.sessionClueDiscoveries);
  const resources = rows=>rows.map(({characterExternalId,resourceExternalId,initialValue,currentValue})=>[characterExternalId,resourceExternalId,initialValue,currentValue]).sort();
  assert.deepEqual(resources(after.sessionResources),resources(state.sessionResources));

  // Exercise production authorisation and both launch plans without starting either.
  const identity={uid:'licence-policy-check',email,email_verified:true};
  const access = await getSelfServiceState(identity,sessionId);
  assert.equal(access.mode,'PREPARATION');
  assert.equal(access.workingSessionId,sessionId);
  assert.equal(access.enabled,true);
  await assert.rejects(authorizeSession({...identity,email:'other@example.com'},sessionId), /SESSION_ACCESS_DENIED/);
  await assert.rejects(authorizeEndpoint('listSessions',identity,{}), /ADMINISTRATOR_REQUIRED/);
  const rehearsal = await replaceSessionRehearsal(identity,sessionId,{executor:async()=>{}});
  const real = await replaceSessionRehearsal(identity,sessionId,{real:true,executor:async()=>{}});
  assert.equal(rehearsal.mode,'REHEARSAL');
  assert.notEqual(rehearsal.workingSessionId,sessionId);
  assert.equal(real.workingSessionId,sessionId);
  console.log(JSON.stringify({applied:true,status:after.gameSession.status,venue:after.gameSession.venue,
    scheduledAt:after.gameSession.scheduledAt,accessMode:access.mode,existingPlayerLinks:after.sessionParticipants.length,
    isolatedRehearsalPlan:true,realLaunchPlan:true,organizerAccountExists:auth.exists??null}));
}

if(process.argv.includes('--schedule')) {
  assert.equal(session.status,'READY');
  assert.equal(session.selfServiceEnabled,true);
  assert.equal(session.organizerAccessEnabled,true);
  assert.equal(session.organizerEmail,email);
  assert.equal(session.venue,'Centerpark');
  assert.equal(session.startedAt,null);
  assert.equal(session.realSessionStartedAt,null);
  assert.equal(session.scheduledAt,null);
  const rawDate = process.env.NID_SCHEDULED_AT ?? '2026-11-13T00:00:00+01:00';
  const date = new Date(rawDate);
  assert.equal(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Brussels',year:'numeric',month:'2-digit',day:'2-digit'}).format(date),'2026-11-13');
  const data = {scheduledAt:date.toISOString()};
  if (!process.env.NID_SCHEDULED_AT) {
    data.notes = [notes,'Vendredi 13 novembre 2026 à Centerpark. Heure de début à confirmer (00 h est un repère de date).'].filter(Boolean).join('\n');
  }
  const identity = {uid:'licence-policy-check',email,email_verified:true};
  const access = await getSelfServiceState(identity,sessionId);
  assert.equal(access.mode,'PREPARATION');
  assert.equal(access.enabled,true);
  assert.equal(access.workingSessionId,sessionId);
  await assert.rejects(authorizeSession({...identity,email:'other@example.com'},sessionId), /SESSION_ACCESS_DENIED/);
  await assert.rejects(authorizeEndpoint('listSessions',identity,{}), /ADMINISTRATOR_REQUIRED/);
  const rehearsal = await replaceSessionRehearsal(identity,sessionId,{executor:async()=>{}});
  const real = await replaceSessionRehearsal(identity,sessionId,{real:true,executor:async()=>{}});
  assert.equal(rehearsal.mode,'REHEARSAL');
  assert.notEqual(rehearsal.workingSessionId,sessionId);
  assert.equal(real.workingSessionId,sessionId);
  await accessExecutor(`mutation ScheduleLicensedNid($sessionId:UUID!, $email:String!, $data:GameSession_Data!) @transaction {
    gameSession_updateMany(where:{
      id:{eq:$sessionId},status:{eq:"READY"},startedAt:{isNull:true},scheduledAt:{isNull:true},
      organizerEmail:{eq:$email},organizerAccessEnabled:{eq:true},selfServiceEnabled:{eq:true}
    },data:$data) @check(expr:"this == 1",message:"NID_LICENCE_STATE_CHANGED")
  }`, {sessionId,email,data});
  const after = await accessReader(stateQuery,{sessionId});
  assert.equal(new Date(after.gameSession.scheduledAt).toISOString(),data.scheduledAt);
  assert.equal(after.gameSession.venue,'Centerpark');
  assert.equal(after.gameSession.status,'READY');
  const participants = rows=>[...rows].sort((a,b)=>a.id.localeCompare(b.id));
  assert.deepEqual(participants(after.sessionParticipants),participants(state.sessionParticipants));
  console.log(JSON.stringify({verified:true,scheduledAt:data.scheduledAt,venue:'Centerpark',mode:access.mode,
    pendingTime:!process.env.NID_SCHEDULED_AT,isolatedRehearsalPlan:true,realLaunchPlan:true,existingPlayerLinks:after.sessionParticipants.length}));
}
