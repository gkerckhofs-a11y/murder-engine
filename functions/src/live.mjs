import { readAllPages } from './pagination.mjs';
import { SESSION_LOCK } from './vote-storage.mjs';
import {
  resolveSessionCharacter
} from './session-character-resolver.mjs';
const LIVE_SESSION_QUERY = `
query LiveSession($sessionId: UUID!) {
  gameSession(id: $sessionId) {
    id status runtimeInitializedAt runtimeVersion startedAt pausedAt finishedAt
    liveClockStartedAt liveElapsedSeconds currentPhaseExternalId
    scenarioVersion { id runtimeDataVersion }
    sessionParticipants_on_gameSession(orderBy: {createdAt: ASC}) {
      id displayName active characterExternalId
      characterDisplayName
      characterGenderVariant
      characterSnapshotJson
      characterSnapshotAt
    }
  }
}
`;

const LIVE_SOURCE_QUERY = `
query LiveSource($versionId: UUID!, $pageLimit: Int!, $pageOffset: Int!) {
  gamePhaseDefinitions(where: {scenarioVersionId: {eq: $versionId}}, orderBy: {externalId: ASC}, limit: $pageLimit, offset: $pageOffset) {
    externalId name orderIndex gmDescription triggerType triggerRef manualConfirm active
  }
  gameEventDefinitions(where: {scenarioVersionId: {eq: $versionId}}, orderBy: {externalId: ASC}, limit: $pageLimit, offset: $pageOffset) {
    externalId title gmDescription triggerType triggerRef delayMinutes absoluteTime phaseExternalId
    validation notificationExternalId priority mandatory repeatable fallbackGm manualFallbackAllowed active
  }
  resources(where: {scenarioVersionId: {eq: $versionId}}, orderBy: {externalId: ASC}, limit: $pageLimit, offset: $pageOffset) {
    externalId name unit maxValue active
  }
  gameStateDefinitions(where: {scenarioVersionId: {eq: $versionId}}, orderBy: {externalId: ASC}, limit: $pageLimit, offset: $pageOffset) {
    externalId name description defaultDurationSeconds visibleToHolder visiblePublic active
  }
  characters(where: {scenarioVersionId: {eq: $versionId}}, orderBy: {externalId: ASC}, limit: $pageLimit, offset: $pageOffset) {
    externalId name publicRole active
  }
}
`;

const LIVE_RUNTIME_QUERY = `
query LiveRuntime($sessionId: UUID!, $pageLimit: Int!, $pageOffset: Int!) {
  sessionVotes(where: {gameSessionId: {eq: $sessionId}}, orderBy: [{voteExternalId: ASC}, {round: ASC}], limit: $pageLimit, offset: $pageOffset) { voteExternalId round status }
  sessionResources(where: {gameSessionId: {eq: $sessionId}}, orderBy: [{characterExternalId: ASC}, {resourceExternalId: ASC}], limit: $pageLimit, offset: $pageOffset) {
    characterExternalId resourceExternalId initialValue currentValue maxValue updatedAt
  }
  sessionCharacterStates(where: {gameSessionId: {eq: $sessionId}}, orderBy: [{characterExternalId: ASC}, {stateExternalId: ASC}], limit: $pageLimit, offset: $pageOffset) {
    characterExternalId stateExternalId active appliedAt expiresAt sourceRef
  }
  sessionEvents(where: {gameSessionId: {eq: $sessionId}}, orderBy: {eventExternalId: ASC}, limit: $pageLimit, offset: $pageOffset) {
    eventExternalId status firedAt acknowledgedAt skippedAt notes updatedAt
  }
  sessionActionLogs(where: {gameSessionId: {eq: $sessionId}}, orderBy: {createdAt: DESC}, limit: 30) {
    id actionType characterExternalId refExternalId beforeValue afterValue deltaValue note createdAt
  }
  businessDealProposals: sessionActionLogs(
    where: {
      gameSessionId: {eq: $sessionId}
      actionType: {eq: "BUSINESS_DEAL_PROPOSED"}
    }
    orderBy: {createdAt: DESC}
    limit: 100
  ) {
    id actionType characterExternalId refExternalId beforeValue afterValue deltaValue note createdAt
  }
  businessDealAccepted: sessionActionLogs(
    where: {
      gameSessionId: {eq: $sessionId}
      actionType: {eq: "BUSINESS_DEAL_ACCEPTED"}
    }
    orderBy: {createdAt: DESC}
    limit: 100
  ) {
    id actionType characterExternalId refExternalId beforeValue afterValue deltaValue note createdAt
  }
  businessDealDeclined: sessionActionLogs(
    where: {
      gameSessionId: {eq: $sessionId}
      actionType: {eq: "BUSINESS_DEAL_DECLINED"}
    }
    orderBy: {createdAt: DESC}
    limit: 100
  ) {
    id actionType characterExternalId refExternalId beforeValue afterValue deltaValue note createdAt
  }
  businessDealOfficial: sessionActionLogs(
    where: {
      gameSessionId: {eq: $sessionId}
      actionType: {eq: "BUSINESS_DEAL_OFFICIAL"}
    }
    orderBy: {createdAt: DESC}
    limit: 100
  ) {
    id actionType characterExternalId refExternalId beforeValue afterValue deltaValue note createdAt
  }
}
`;

const UPDATE_LIVE_SESSION_MUTATION = `
mutation UpdateLiveSession(
  $sessionId: UUID!, $status: String!, $startedAt: Timestamp, $pausedAt: Timestamp, $finishedAt: Timestamp,
  $liveClockStartedAt: Timestamp, $liveElapsedSeconds: Int!, $currentPhaseExternalId: String, $expectedStatus: String!
) @transaction {
  ${SESSION_LOCK}
  state: query @check(expr: "response.state.gameSession != null && response.state.gameSession.status == vars.expectedStatus", message: "SESSION_STATE_CHANGED") @redact {
    gameSession(id: $sessionId) { status }
  }
  outstanding: query @check(expr: "vars.status != 'FINISHED' || response.outstanding.sessionVotes.size() == 0", message: "SESSION_HAS_OPEN_VOTES") @redact {
    sessionVotes(where: {gameSessionId: {eq: $sessionId}, status: {in: ["OPEN", "CLOSING"]}}, limit: 1) { voteExternalId }
  }
  gameSession_update(id: $sessionId, data: {
    status: $status, startedAt: $startedAt, pausedAt: $pausedAt, finishedAt: $finishedAt,
    liveClockStartedAt: $liveClockStartedAt, liveElapsedSeconds: $liveElapsedSeconds,
    currentPhaseExternalId: $currentPhaseExternalId, precastEnabled: false
  })
}
`;

const INSERT_SESSION_EVENT_MUTATION = `
mutation InsertSessionEvent($data: SessionEvent_Data!) { sessionEvent_insert(data: $data) }
`;

const UPDATE_SESSION_EVENT_MUTATION = `
mutation UpdateSessionEvent(
  $sessionId: UUID!, $eventExternalId: String!, $status: String!, $firedAt: Timestamp,
  $acknowledgedAt: Timestamp, $skippedAt: Timestamp, $notes: String
) {
  sessionEvent_update(
    key: {gameSessionId: $sessionId, eventExternalId: $eventExternalId}
    data: {status: $status, firedAt: $firedAt, acknowledgedAt: $acknowledgedAt, skippedAt: $skippedAt, notes: $notes}
  )
}
`;

const UPDATE_SESSION_RESOURCE_MUTATION = `
mutation UpdateSessionResource($sessionId: UUID!, $characterExternalId: String!, $resourceExternalId: String!, $currentValue: Int!, $updatedAt: Timestamp!) {
  sessionResource_update(
    key: {gameSessionId: $sessionId, characterExternalId: $characterExternalId, resourceExternalId: $resourceExternalId}
    data: {currentValue: $currentValue, updatedAt: $updatedAt}
  )
}
`;

const INSERT_CHARACTER_STATE_MUTATION = `
mutation InsertCharacterState($data: SessionCharacterState_Data!) { sessionCharacterState_insert(data: $data) }
`;

const UPDATE_CHARACTER_STATE_MUTATION = `
mutation UpdateCharacterState($sessionId: UUID!, $characterExternalId: String!, $stateExternalId: String!, $active: Boolean!, $appliedAt: Timestamp!, $expiresAt: Timestamp, $sourceRef: String) {
  sessionCharacterState_update(
    key: {gameSessionId: $sessionId, characterExternalId: $characterExternalId, stateExternalId: $stateExternalId}
    data: {active: $active, appliedAt: $appliedAt, expiresAt: $expiresAt, sourceRef: $sourceRef}
  )
}
`;

const INSERT_ACTION_LOG_MUTATION = `
mutation InsertActionLog($data: SessionActionLog_Data!) { sessionActionLog_insert(data: $data) }
`;

async function getAdminDataConnect() {
  const [{ initializeApp, getApps }, { getDataConnect }] = await Promise.all([
    import('firebase-admin/app'), import('firebase-admin/data-connect'),
  ]);
  if (!getApps().length) initializeApp();
  return getDataConnect({ location: 'europe-west1', serviceId: 'murder-engine' });
}
async function defaultReader(operation, variables) {
  const dc = await getAdminDataConnect();
  const response = await dc.executeGraphqlRead(operation, { variables });
  const errors = response?.errors ?? response?.data?.errors ?? [];
  if (errors.length) { const e = new Error('DATACONNECT_LIVE_READ_FAILED'); e.details = errors; throw e; }
  return response?.data ?? response;
}
async function defaultExecutor(operation, variables) {
  const dc = await getAdminDataConnect();
  const response = await dc.executeGraphql(operation, { variables });
  const errors = response?.errors ?? response?.data?.errors ?? [];
  if (errors.length) { const e = new Error('DATACONNECT_LIVE_WRITE_FAILED'); e.details = errors; throw e; }
  return response?.data ?? response;
}

const toMs = value => value ? new Date(value).getTime() : NaN;
export function computeLiveElapsedSeconds(session, now = new Date()) {
  const base = Number(session?.liveElapsedSeconds ?? 0);
  if (session?.status !== 'LIVE' || !session?.liveClockStartedAt) return Math.max(0, base);
  const start = toMs(session.liveClockStartedAt);
  if (!Number.isFinite(start)) return Math.max(0, base);
  return Math.max(0, base + Math.floor((now.getTime() - start) / 1000));
}

function eventUrgency(event, elapsedSeconds) {
  if (event.status !== 'PENDING' || event.delayMinutes == null) return 'NORMAL';
  const remaining = event.delayMinutes * 60 - elapsedSeconds;
  if (remaining <= 0) return 'OVERDUE';
  if (remaining <= 600) return 'SOON';
  return 'NORMAL';
}

function mapBy(rows, key) { return new Map((rows ?? []).map(r => [r[key], r])); }

export function shapeLiveDashboard(session, source, runtime, now = new Date()) {
  const elapsedSeconds = computeLiveElapsedSeconds(session, now);
  const eventState = mapBy(runtime?.sessionEvents, 'eventExternalId');
  const characterDefs = mapBy(source?.characters, 'externalId');
  const participantByChar = new Map((session?.sessionParticipants_on_gameSession ?? []).filter(p => p.characterExternalId).map(p => [p.characterExternalId, p]));
  const resourceDefs = mapBy(source?.resources, 'externalId');
  const stateDefs = mapBy(source?.gameStateDefinitions, 'externalId');

  const resourcesByChar = new Map();
  for (const r of runtime?.sessionResources ?? []) {
    if (!resourcesByChar.has(r.characterExternalId)) resourcesByChar.set(r.characterExternalId, []);
    resourcesByChar.get(r.characterExternalId).push({ ...r, name: resourceDefs.get(r.resourceExternalId)?.name ?? r.resourceExternalId, unit: resourceDefs.get(r.resourceExternalId)?.unit ?? null });
  
  }
  const statesByChar = new Map();
  for (const st of runtime?.sessionCharacterStates ?? []) if (st.active !== false) {
    if (!statesByChar.has(st.characterExternalId)) statesByChar.set(st.characterExternalId, []);
    statesByChar.get(st.characterExternalId).push({ ...st, name: stateDefs.get(st.stateExternalId)?.name ?? st.stateExternalId });
  }

  const characters = [...new Set([...(runtime?.sessionResources ?? []).map(r=>r.characterExternalId), ...(session?.sessionParticipants_on_gameSession ?? []).map(p=>p.characterExternalId).filter(Boolean)])]
    .map(characterExternalId => ({
      characterExternalId,
      characterName:
        resolveSessionCharacter(
          participantByChar.get(characterExternalId),
          characterDefs.get(characterExternalId)
        ).name,
      publicRole:
        resolveSessionCharacter(
          participantByChar.get(characterExternalId),
          characterDefs.get(characterExternalId)
        ).publicRole,
      participantName: participantByChar.get(characterExternalId)?.displayName ?? null,
      resources: resourcesByChar.get(characterExternalId) ?? [],
      states: statesByChar.get(characterExternalId) ?? [],
    
    }));

  function parseDealNote(value) {
    try { return JSON.parse(String(value??'')) ?? {}; }
    catch { return {}; }
  }

  const acceptedDealIds=new Set(
    (runtime?.businessDealAccepted??[])
      .map(x=>x.refExternalId)
      .filter(Boolean)
  );
  const declinedDealIds=new Set(
    (runtime?.businessDealDeclined??[])
      .map(x=>x.refExternalId)
      .filter(Boolean)
  );
  const officialDealIds=new Set(
    (runtime?.businessDealOfficial??[])
      .map(x=>x.refExternalId)
      .filter(Boolean)
  );

  const businessDeals=(runtime?.businessDealProposals??[])
    .map(proposal=>{
      const data=parseDealNote(proposal.note);
      const dealId=proposal.refExternalId;
      const status=officialDealIds.has(dealId)
        ? 'OFFICIAL'
        : declinedDealIds.has(dealId)
          ? 'DECLINED'
          : acceptedDealIds.has(dealId)
            ? 'ACCEPTED'
            : 'PROPOSED';
      return {
        dealId,
        actorCharacterExternalId:proposal.characterExternalId,
        actorName:data.actorName??characterDefs.get(proposal.characterExternalId)?.name??proposal.characterExternalId,
        targetCharacterExternalId:proposal.afterValue,
        targetName:data.targetName??characterDefs.get(proposal.afterValue)?.name??proposal.afterValue,
        terms:data.terms??proposal.beforeValue??'',
        status,
        proposedAt:proposal.createdAt,
      };
    })
    .filter(deal=>Boolean(deal.dealId));

  const phases = (source?.gamePhaseDefinitions ?? []).filter(x=>x.active!==false).sort((a,b)=>(a.orderIndex??0)-(b.orderIndex??0));
  const events = (source?.gameEventDefinitions ?? []).filter(x=>x.active!==false).map(def => {
    const state = eventState.get(def.externalId) ?? {status:'PENDING'};
    return { ...def, ...state, urgency: eventUrgency({...def,...state}, elapsedSeconds), dueElapsedSeconds: def.delayMinutes == null ? null : def.delayMinutes * 60 };
  }).sort((a,b)=>(a.delayMinutes??999999)-(b.delayMinutes??999999));

  return {
    snapshotAt: now.toISOString(),
    session: {
      id: session.id, status: session.status, startedAt: session.startedAt, pausedAt: session.pausedAt, finishedAt: session.finishedAt,
      elapsedSeconds, currentPhaseExternalId: session.currentPhaseExternalId ?? null,
    },
    sourceReady: ['0.7','0.8','0.9'].includes(session.scenarioVersion?.runtimeDataVersion),
    phases, events, characters, businessDeals,
    stateDefinitions: (source?.gameStateDefinitions ?? []).filter(x=>x.active!==false),
    logs: runtime?.sessionActionLogs ?? [],
    alerts: {
      overdueEvents: events.filter(e=>e.urgency==='OVERDUE').length,
      soonEvents: events.filter(e=>e.urgency==='SOON').length,
      activeStates: (runtime?.sessionCharacterStates ?? []).filter(s=>s.active!==false).length,
    },
  };
}

async function loadLive(sessionId, reader) {
  const sessionData = await reader(LIVE_SESSION_QUERY, {sessionId});
  const session = sessionData?.gameSession;
  if (!session) throw new Error('SESSION_NOT_FOUND');
  const versionId = session.scenarioVersion?.id;
  const [source, runtime] = await Promise.all([
    readAllPages(reader,LIVE_SOURCE_QUERY,{versionId},['gamePhaseDefinitions', 'gameEventDefinitions', 'resources', 'gameStateDefinitions', 'characters']), readAllPages(reader,LIVE_RUNTIME_QUERY,{sessionId},['sessionVotes', 'sessionResources', 'sessionCharacterStates', 'sessionEvents']),
  ]);
  return {session, source:source??{}, runtime:runtime??{}};
}

async function logAction(executor, data) {
  await executor(INSERT_ACTION_LOG_MUTATION, {data});
}

async function ensureEvents(sessionId, source, runtime, executor) {
  const existing = new Set((runtime?.sessionEvents ?? []).map(e=>e.eventExternalId));
  let inserted = 0;
  for (const def of (source?.gameEventDefinitions ?? []).filter(e=>e.active!==false)) {
    if (existing.has(def.externalId)) continue;
    await executor(INSERT_SESSION_EVENT_MUTATION, {data:{gameSessionId:sessionId,eventExternalId:def.externalId,status:'PENDING'}});
    inserted += 1;
  }
  return inserted;
}

export async function getLiveDashboard(sessionId, {reader=defaultReader}={}) {
  if (!sessionId) throw new Error('SESSION_ID_REQUIRED');
  const {session,source,runtime}=await loadLive(sessionId,reader);
  return shapeLiveDashboard(session,source,runtime);
}

export async function controlLiveSession(sessionId, action, {reader=defaultReader,executor=defaultExecutor,now=new Date()}={}) {
  if (!sessionId) throw new Error('SESSION_ID_REQUIRED');
  const normalized=String(action??'').toUpperCase();
  const {session,source,runtime}=await loadLive(sessionId,reader);
  if (!session.runtimeInitializedAt) throw new Error('RUNTIME_NOT_INITIALIZED');
  if (!['0.7','0.8','0.9'].includes(session.scenarioVersion?.runtimeDataVersion)) throw new Error('LIVE_SOURCE_NOT_READY');
  const iso=now.toISOString();
  let next;
  if (normalized==='START') {
    if (session.status!=='READY') throw new Error('SESSION_MUST_BE_READY');
    await ensureEvents(sessionId,source,runtime,executor);
    next={status:'LIVE',startedAt:session.startedAt??iso,pausedAt:null,finishedAt:null,liveClockStartedAt:iso,liveElapsedSeconds:0,currentPhaseExternalId:(source.gamePhaseDefinitions??[]).filter(p=>p.active!==false).sort((a,b)=>(a.orderIndex??0)-(b.orderIndex??0))[0]?.externalId??null};
  } else if (normalized==='PAUSE') {
    if (session.status!=='LIVE') throw new Error('SESSION_NOT_LIVE');
    next={status:'PAUSED',startedAt:session.startedAt,pausedAt:iso,finishedAt:null,liveClockStartedAt:null,liveElapsedSeconds:computeLiveElapsedSeconds(session,now),currentPhaseExternalId:session.currentPhaseExternalId??null};
  } else if (normalized==='RESUME') {
    if (session.status!=='PAUSED') throw new Error('SESSION_NOT_PAUSED');
    next={status:'LIVE',startedAt:session.startedAt,pausedAt:null,finishedAt:null,liveClockStartedAt:iso,liveElapsedSeconds:Number(session.liveElapsedSeconds??0),currentPhaseExternalId:session.currentPhaseExternalId??null};
  } else if (normalized==='FINISH') {
    if (!['LIVE','PAUSED'].includes(session.status)) throw new Error('SESSION_NOT_RUNNING');
    const outstanding=(runtime.sessionVotes??[]).filter(v=>['OPEN','CLOSING'].includes(v.status));
    if(outstanding.length){
      const error=new Error('SESSION_HAS_OPEN_VOTES');
      error.details={votes:outstanding.map(v=>({voteExternalId:v.voteExternalId,round:v.round,status:v.status}))};
      throw error;
    }
    next={status:'FINISHED',startedAt:session.startedAt,pausedAt:null,finishedAt:iso,liveClockStartedAt:null,liveElapsedSeconds:computeLiveElapsedSeconds(session,now),currentPhaseExternalId:session.currentPhaseExternalId??null};
  } else throw new Error('INVALID_LIVE_ACTION');
  await executor(UPDATE_LIVE_SESSION_MUTATION,{sessionId,expectedStatus:session.status,...next});
  await logAction(executor,{gameSessionId:sessionId,actionType:`LIVE_${normalized}`,beforeValue:session.status,afterValue:next.status,note:null});
  return {sessionId,...next};
}


export async function validateBusinessDeal(sessionId,input,{reader=defaultReader,executor=defaultExecutor,now=new Date()}={}) {
  if(!sessionId) throw new Error('SESSION_ID_REQUIRED');
  const dealId=String(input?.dealId??'').trim();
  if(!dealId) throw new Error('BUSINESS_DEAL_ID_REQUIRED');

  const {session,runtime}=await loadLive(sessionId,reader);
  if(!['LIVE','PAUSED','FINISHED'].includes(session.status))
    throw new Error('SESSION_NOT_ACTIVE');

  const proposal=(runtime.businessDealProposals??[])
    .find(x=>x.refExternalId===dealId);
  if(!proposal) throw new Error('BUSINESS_DEAL_NOT_FOUND');

  const accepted=(runtime.businessDealAccepted??[])
    .some(x=>x.refExternalId===dealId);
  if(!accepted) throw new Error('BUSINESS_DEAL_NOT_ACCEPTED');

  const declined=(runtime.businessDealDeclined??[])
    .some(x=>x.refExternalId===dealId);
  if(declined) throw new Error('BUSINESS_DEAL_DECLINED');

  const official=(runtime.businessDealOfficial??[])
    .some(x=>x.refExternalId===dealId);
  if(official) return {dealId,status:'OFFICIAL',alreadyOfficial:true};

  await logAction(executor,{
    gameSessionId:sessionId,
    actionType:'BUSINESS_DEAL_OFFICIAL',
    characterExternalId:proposal.characterExternalId,
    refExternalId:dealId,
    beforeValue:proposal.afterValue,
    afterValue:'OFFICIAL',
    deltaValue:null,
    note:proposal.note,
    createdAt:now.toISOString(),
  });

  return {dealId,status:'OFFICIAL',alreadyOfficial:false};
}

export async function changeLiveResource(sessionId,input,{reader=defaultReader,executor=defaultExecutor,now=new Date()}={}) {
  const {session,runtime}=await loadLive(sessionId,reader);
  if (!['LIVE','PAUSED'].includes(session.status)) throw new Error('SESSION_NOT_RUNNING');
  const characterExternalId=String(input?.characterExternalId??'').trim();
  const resourceExternalId=String(input?.resourceExternalId??'').trim();
  const row=(runtime.sessionResources??[]).find(r=>r.characterExternalId===characterExternalId&&r.resourceExternalId===resourceExternalId);
  if (!row) throw new Error('SESSION_RESOURCE_NOT_FOUND');
  const mode=String(input?.mode??'DELTA').toUpperCase();
  const amount=Number.parseInt(String(input?.value??0),10);
  if (!Number.isFinite(amount)) throw new Error('INVALID_RESOURCE_VALUE');
  const before=Number(row.currentValue??0);
  let after=mode==='SET'?amount:before+amount;
  if (row.maxValue!=null) after=Math.min(after,Number(row.maxValue));
  const updatedAt=now.toISOString();
  await executor(UPDATE_SESSION_RESOURCE_MUTATION,{sessionId,characterExternalId,resourceExternalId,currentValue:after,updatedAt});
  await logAction(executor,{gameSessionId:sessionId,actionType:'RESOURCE_CHANGE',characterExternalId,refExternalId:resourceExternalId,beforeValue:String(before),afterValue:String(after),deltaValue:after-before,note:String(input?.note??'').trim()||null});
  return {characterExternalId,resourceExternalId,before,after};
}

export async function setLiveCharacterState(sessionId,input,{reader=defaultReader,executor=defaultExecutor,now=new Date()}={}) {
  const {session,source,runtime}=await loadLive(sessionId,reader);
  if (!['LIVE','PAUSED'].includes(session.status)) throw new Error('SESSION_NOT_RUNNING');
  const characterExternalId=String(input?.characterExternalId??'').trim();
  const stateExternalId=String(input?.stateExternalId??'').trim();
  const action=String(input?.action??'APPLY').toUpperCase();
  const def=(source.gameStateDefinitions??[]).find(s=>s.externalId===stateExternalId&&s.active!==false);
  if (!def) throw new Error('STATE_DEFINITION_NOT_FOUND');
  const existing=(runtime.sessionCharacterStates??[]).find(s=>s.characterExternalId===characterExternalId&&s.stateExternalId===stateExternalId);
  const appliedAt=now.toISOString();
  const active=action!=='REMOVE';
  const expiresAt=active&&def.defaultDurationSeconds?new Date(now.getTime()+Number(def.defaultDurationSeconds)*1000).toISOString():null;
  if (existing) await executor(UPDATE_CHARACTER_STATE_MUTATION,{sessionId,characterExternalId,stateExternalId,active,appliedAt,expiresAt,sourceRef:'GM'});
  else if (active) await executor(INSERT_CHARACTER_STATE_MUTATION,{data:{gameSessionId:sessionId,characterExternalId,stateExternalId,active:true,appliedAt,expiresAt,sourceRef:'GM'}});
  await logAction(executor,{gameSessionId:sessionId,actionType:active?'STATE_APPLY':'STATE_REMOVE',characterExternalId,refExternalId:stateExternalId,beforeValue:existing?.active?'ACTIVE':'INACTIVE',afterValue:active?'ACTIVE':'INACTIVE',note:String(input?.note??'').trim()||null});
  return {characterExternalId,stateExternalId,active,expiresAt};
}

export async function setLiveEventStatus(sessionId,input,{reader=defaultReader,executor=defaultExecutor,now=new Date()}={}) {
  const {session,source,runtime}=await loadLive(sessionId,reader);
  if (!['LIVE','PAUSED'].includes(session.status)) throw new Error('SESSION_NOT_RUNNING');
  await ensureEvents(sessionId,source,runtime,executor);
  const eventExternalId=String(input?.eventExternalId??'').trim();
  const status=String(input?.status??'DONE').toUpperCase();
  if (!['PENDING','DONE','SKIPPED'].includes(status)) throw new Error('INVALID_EVENT_STATUS');
  const iso=now.toISOString();
  await executor(UPDATE_SESSION_EVENT_MUTATION,{sessionId,eventExternalId,status,firedAt:status==='DONE'?iso:null,acknowledgedAt:status==='DONE'?iso:null,skippedAt:status==='SKIPPED'?iso:null,notes:String(input?.notes??'').trim()||null});
  await logAction(executor,{gameSessionId:sessionId,actionType:`EVENT_${status}`,refExternalId:eventExternalId,beforeValue:null,afterValue:status,note:String(input?.notes??'').trim()||null});
  return {eventExternalId,status};
}

export const __liveOps={LIVE_SESSION_QUERY,LIVE_SOURCE_QUERY,LIVE_RUNTIME_QUERY,UPDATE_LIVE_SESSION_MUTATION,INSERT_SESSION_EVENT_MUTATION,UPDATE_SESSION_EVENT_MUTATION,UPDATE_SESSION_RESOURCE_MUTATION,INSERT_CHARACTER_STATE_MUTATION,UPDATE_CHARACTER_STATE_MUTATION,INSERT_ACTION_LOG_MUTATION};

