import {table as casinoTable,GAMES as CASINO_GAMES} from './casino/engine.mjs';
import { randomUUID, randomBytes } from 'node:crypto';
import { buildRuntimePlan, __runtimeOps } from './runtime.mjs';
import { readAllPages } from './pagination.mjs';
import { authorizeSession, accessReader, accessExecutor, readAccess, canonicalSessionId } from './session-access.mjs';

export const PREPARED_SESSION_QUERY=`query PreparedSelfServiceSession($sessionId: UUID!) {
  sessionCasino(key:{gameSessionId:$sessionId}){stateJson}
  gameSession(id: $sessionId) {
    id name language scheduledAt venue notes status runtimeInitializedAt startedAt
    organizerEmail organizerAccessEnabled selfServiceEnabled realSessionStartedAt rehearsalOfId activeRehearsalId
    organization { id }
    scenarioVersion { id runtimeDataVersion }
  }
}`;
export const PARTICIPANTS_QUERY=`query RehearsalParticipants($sessionId: UUID!, $pageLimit: Int!, $pageOffset: Int!) {
  sessionParticipants(where: {gameSessionId: {eq: $sessionId}}, orderBy: {id: ASC}, limit: $pageLimit, offset: $pageOffset) {
    id displayName email ageBracket genderPreference desiredInvolvement characterExternalId
    characterDisplayName characterGenderVariant characterSnapshotJson characterSnapshotAt
    castingLocked briefingStatus active notes playerAccessToken
  }
}`;
export const SOURCE_QUERY=__runtimeOps.RUNTIME_SOURCE_QUERY
  .replace('($versionId: UUID!)','($versionId: UUID!, $pageLimit: Int!, $pageOffset: Int!)')
  .replaceAll('where: {scenarioVersionId: {eq: $versionId}})',
    'where: {scenarioVersionId: {eq: $versionId}}, orderBy: {externalId: ASC}, limit: $pageLimit, offset: $pageOffset)')
  .replace(/initialKnowledges\((.*?)orderBy: \{externalId: ASC\}/s,
    'initialKnowledges($1orderBy: [{characterExternalId: ASC}, {factExternalId: ASC}]');
const SOURCE_FIELDS=['resources','resourceAssignments','gameObjects','objectives','initialKnowledges','gameStateDefinitions'];
export const TIMELINE_QUERY=`query RehearsalTimeline($versionId: UUID!, $pageLimit: Int!, $pageOffset: Int!) {
  gamePhaseDefinitions(where: {scenarioVersionId: {eq: $versionId}}, orderBy: {externalId: ASC}, limit: $pageLimit, offset: $pageOffset) { externalId orderIndex active }
  gameEventDefinitions(where: {scenarioVersionId: {eq: $versionId}}, orderBy: {externalId: ASC}, limit: $pageLimit, offset: $pageOffset) { externalId active }
}`;
const RUNTIME_TABLES=['sessionCasinoCommand','sessionCasino','sessionPlayerNotification','sessionBallot','sessionVote','sessionActionLog','sessionEvent',
  'sessionClueDiscovery','sessionStealGrant','sessionInteractionUse','sessionCharacterState','sessionObject',
  'sessionObjective','sessionKnowledge','sessionResource','sessionCharacter'];

export async function getSelfServiceState(identity,sessionId,deps={}) {
  const {root,session}=await authorizeSession(identity,sessionId,deps);
  // Administrator may request a rehearsal directly; management always uses its parent.
  const actualRoot=session.rehearsalOfId?await readAccess(session.rehearsalOfId,deps):root;
  return {
    sessionId:actualRoot.id,enabled:actualRoot.organizerAccessEnabled,selfServiceEnabled:actualRoot.selfServiceEnabled,
    organizerEmail:actualRoot.organizerEmail??'',realSessionStartedAt:actualRoot.realSessionStartedAt??null,
    activeRehearsalId:actualRoot.activeRehearsalId??null,
    workingSessionId:actualRoot.realSessionStartedAt?actualRoot.id:(actualRoot.activeRehearsalId||actualRoot.id),
    mode:actualRoot.realSessionStartedAt?'REAL':actualRoot.activeRehearsalId?'REHEARSAL':'PREPARATION',
  };
}

async function preparation(sessionId,reader) {
  const data=await reader(PREPARED_SESSION_QUERY,{sessionId});
  const root=data?.gameSession;
  if(root)root.casinoStateJson=data?.sessionCasino?.stateJson??null;
  if(!root || root.rehearsalOfId || !root.selfServiceEnabled)throw new Error('SELF_SERVICE_NOT_CONFIGURED');
  if(root.realSessionStartedAt)throw new Error('REAL_SESSION_ALREADY_STARTED');
  if(root.status!=='READY' || root.startedAt)throw new Error('SESSION_MUST_BE_READY');
  const [participants,source,timeline]=await Promise.all([
    readAllPages(reader,PARTICIPANTS_QUERY,{sessionId},['sessionParticipants']),
    readAllPages(reader,SOURCE_QUERY,{versionId:root.scenarioVersion.id},SOURCE_FIELDS),
    readAllPages(reader,TIMELINE_QUERY,{versionId:root.scenarioVersion.id},['gamePhaseDefinitions','gameEventDefinitions']),
  ]);
  root.id=canonicalSessionId(root.id);
  root.sessionParticipants_on_gameSession=participants.sessionParticipants;
  return {root,source:{...source,...timeline}};
}

// Each replacement is one transaction. Old test tokens are disabled; in-flight
// test writes can only address the retired test ID, never the fresh run or real ID.
export function buildRehearsalMutation(root,plan,participants,{real=false,identity,admin=false,now}) {
  const variables={sessionId:root.id,expectedRehearsalId:root.activeRehearsalId??null};
  const declarations=['$sessionId: UUID!','$expectedRehearsalId: String'];
  const rootData=real?{
    realSessionStartedAt:now,status:'LIVE',runtimeInitializedAt:now,runtimeVersion:'0.8',
    startedAt:now,pausedAt:null,finishedAt:null,liveClockStartedAt:now,liveElapsedSeconds:0,
    currentPhaseExternalId:plan.firstPhase??null,activeRehearsalId:null,precastEnabled:false,
  }:{activeRehearsalId:plan.characters[0].gameSessionId,precastEnabled:false};
  variables.rootData=rootData;declarations.push('$rootData: GameSession_Data!');
  if(!admin){variables.email=identity.email.toLowerCase();declarations.push('$email: String!');}
  // A single conditional UPDATE both locks the licence row and advances it.
  // Never update the same row twice in one generated SQL statement (Postgres CTE semantics).
  const statements=[`commit: gameSession_updateMany(where: {
    id: {eq: $sessionId}, selfServiceEnabled: {eq: true}, rehearsalOfId: {isNull: true},
    realSessionStartedAt: {isNull: true}, status: {eq: "READY"}, startedAt: {isNull: true},
    activeRehearsalId: {eq: $expectedRehearsalId}
    ${admin?'':', organizerAccessEnabled: {eq: true}, organizerEmail: {eq: $email}'}
  }, data: $rootData) @check(expr: "this == 1", message: "SELF_SERVICE_STATE_CHANGED")`];
  if(root.activeRehearsalId) {
    declarations.push('$oldId: UUID!');variables.oldId=root.activeRehearsalId;
    statements.push(`retire: gameSession_update(id: $oldId, data: {status: "ARCHIVED", liveClockStartedAt: null})`,
      `disableOldPlayers: sessionParticipant_updateMany(where: {gameSessionId: {eq: $oldId}}, data: {playerAccessEnabled: false})`);
  }
  let index=0;
  function insert(field,type,data) {
    const key=`row${index++}`;variables[key]=data;declarations.push(`$${key}: ${type}_Data!`);
    statements.push(`${key}: ${field}_insert(data: $${key})`);
  }
  function insertRows(field,type,rows) {
    for(let offset=0;offset<rows.length;offset+=100){
      const key=`batch${index++}`;variables[key]=rows.slice(offset,offset+100);
      declarations.push(`$${key}: [${type}_Data!]!`);
      statements.push(`${key}: ${field}_insertMany(data: $${key})`);
    }
  }
  if(!real) {
    insert('gameSession','GameSession',{
      id:plan.characters[0].gameSessionId,organizationId:root.organization.id,scenarioVersionId:root.scenarioVersion.id,
      name:root.name,language:root.language,scheduledAt:root.scheduledAt??null,venue:root.venue??null,notes:root.notes??null,
      status:'READY',rehearsalOfId:root.id,runtimeInitializedAt:now,runtimeVersion:'0.8',
    });
    insertRows('sessionParticipant','SessionParticipant',participants);
  }else {
    for(const table of RUNTIME_TABLES)statements.push(`${table}_deleteMany(where: {gameSessionId: {eq: $sessionId}})`);
    statements.push(`cleared: query @check(expr: "response.cleared.sessionResources.size() == 0 && response.cleared.sessionCharacters.size() == 0 && response.cleared.sessionObjects.size() == 0", message: "RUNTIME_CLEAR_FAILED") @redact {
      sessionResources(where: {gameSessionId: {eq: $sessionId}}, limit: 1) { characterExternalId }
      sessionCharacters(where: {gameSessionId: {eq: $sessionId}}, limit: 1) { characterExternalId }
      sessionObjects(where: {gameSessionId: {eq: $sessionId}}, limit: 1) { objectExternalId }
    }`);
    for(const participant of participants) {
      const key=`player${index++}`;
      declarations.push(`$${key}: SessionParticipant_Data!`, `$${key}Id: UUID!`);
      variables[key]={playerAccessEnabled:true,playerAccessToken:participant.playerAccessToken};
      variables[key+'Id']=participant.id;
      statements.push(`${key}: sessionParticipant_update(id: $${key}Id, data: $${key})`);
    }
    // Personal notebooks and briefing progress from preparation are not game data.
    // They remain attached to the original participants, never copied from tests.
  }
  if(root.casinoStateJson){
    const saved=JSON.parse(root.casinoStateJson);
    const tables=Object.fromEntries(CASINO_GAMES.map(g=>[g,casinoTable(g,{...saved.tables[g],bank:saved.tables[g].bankInitial})]));
    insert('sessionCasino','SessionCasino',{gameSessionId:plan.characters[0].gameSessionId,revision:0,stateJson:JSON.stringify({tables,pausedAt:null}),updatedAt:now});
  }
  const groups=[['characters','sessionCharacter','SessionCharacter'],['resources','sessionResource','SessionResource'],
    ['knowledge','sessionKnowledge','SessionKnowledge'],['objectives','sessionObjective','SessionObjective'],['objects','sessionObject','SessionObject']];
  for(const [key,field,type] of groups)insertRows(field,type,plan[key]);
  if(real) {
    for(const event of plan.events??[])insert('sessionEvent','SessionEvent',event);
    insert('sessionActionLog','SessionActionLog',{gameSessionId:root.id,actionType:'SELF_SERVICE_REAL_START',note:identity.email});
  }
  return {operation:`mutation ${real?'StartRealSelfServiceSession':'ReplaceSessionRehearsal'}(${declarations.join(', ')}) @transaction {\n${statements.join('\n')}\n}`,variables};
}

export async function replaceSessionRehearsal(identity,sessionId,{reader=accessReader,executor=accessExecutor,now=new Date(),real=false}={}) {
  const access=await authorizeSession(identity,sessionId,{reader});
  if(access.session.rehearsalOfId)throw new Error('ROOT_SESSION_REQUIRED');
  sessionId=canonicalSessionId(sessionId);
  const {root,source}=await preparation(sessionId,reader);
  if(real && !['0.7','0.8','0.9'].includes(root.scenarioVersion.runtimeDataVersion))throw new Error('LIVE_SOURCE_NOT_READY');
  const timestamp=now.toISOString();
  const runId=real?root.id:randomUUID();
  const participants=(root.sessionParticipants_on_gameSession??[]).filter(p=>p.active!==false).map(p=>({
    ...p,id:real?p.id:randomUUID(),gameSessionId:runId,
    // Never copy private notebook content, player tokens or read counters.
    briefingStatus:'NOT_SENT',source:'MANUAL',playerAccessEnabled:true,
    playerAccessToken:real?(p.playerAccessToken||randomBytes(24).toString('base64url')):randomBytes(24).toString('base64url'),
  }));
  const plan=buildRuntimePlan({...root,id:runId,runtimeInitializedAt:null,
    sessionParticipants_on_gameSession:participants},source);
  plan.events=(source.gameEventDefinitions??[]).filter(e=>e.active!==false).map(e=>({gameSessionId:runId,eventExternalId:e.externalId,status:'PENDING'}));
  plan.firstPhase=(source.gamePhaseDefinitions??[]).filter(p=>p.active!==false).sort((a,b)=>(a.orderIndex??0)-(b.orderIndex??0))[0]?.externalId??null;
  // Real launch initializes event rows and phase just like the standard START.
  const {operation,variables}=buildRehearsalMutation(root,plan,participants,{real,identity,admin:access.admin,now:timestamp});
  await executor(operation,variables);
  return {sessionId,workingSessionId:runId,mode:real?'REAL':'REHEARSAL',realSessionStartedAt:real?timestamp:null};
}
