import assert from 'node:assert/strict';
import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {accessReader} from '../src/session-access.mjs';

assert.equal(process.env.GCLOUD_PROJECT, 'murder-engine-ludificateur');
initializeApp({projectId:process.env.GCLOUD_PROJECT});
const sessionId = 'd1a40507-811f-4695-a119-e16ed74eb5cd';
const email = 'collin.marielle@hotmail.com';

const stateQuery = `query InspectNidLicence($sessionId: UUID!) {
  gameSession(id:$sessionId){
    id name status scheduledAt venue language runtimeInitializedAt startedAt pausedAt finishedAt
    liveClockStartedAt liveElapsedSeconds currentPhaseExternalId
    organizerEmail organizerAccessEnabled selfServiceEnabled realSessionStartedAt rehearsalOfId activeRehearsalId
    scenarioVersion { sourceScenarioId versionLabel }
  }
  sessionParticipants(where:{gameSessionId:{eq:$sessionId}},limit:100){
    id characterExternalId active playerAccessEnabled playerAccessToken characterSnapshotAt
  }
  sessionActionLogs(where:{gameSessionId:{eq:$sessionId}},limit:1000){actionType}
  sessionClueDiscoveries(where:{gameSessionId:{eq:$sessionId}},limit:1000){clueExternalId}
  sessionResources(where:{gameSessionId:{eq:$sessionId}},limit:1000){resourceExternalId initialValue currentValue}
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
const {organizerEmail, ...publicState} = session;
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
