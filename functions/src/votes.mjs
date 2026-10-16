import { readAllPages } from './pagination.mjs';
import { BALLOT_BY_KEY_QUERY, readRoundBallots, SESSION_LOCK, RUNNING_SESSION_CHECK, OPEN_ROUND_CHECK } from './vote-storage.mjs';
import {
  resolveSessionCharacter
} from './session-character-resolver.mjs';
const VOTE_SESSION_QUERY = `
query VoteSession($sessionId: UUID!) {
  gameSession(id: $sessionId) {
    id status runtimeInitializedAt
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

const VOTE_SOURCE_QUERY = `
query VoteSource($versionId: UUID!, $pageLimit: Int!, $pageOffset: Int!) {
  voteDefinitions(where: {scenarioVersionId: {eq: $versionId}}, orderBy: {externalId: ASC}, limit: $pageLimit, offset: $pageOffset) {
    externalId title question scopeType scopeRef choicesMode secret votesPerElector weighted
    weightResourceExternalId abstention modifiable closeMode durationMinutes resultVisibility tieRule active
  }
  voteOptionDefinitions(where: {scenarioVersionId: {eq: $versionId}}, orderBy: {externalId: ASC}, limit: $pageLimit, offset: $pageOffset) {
    externalId voteExternalId orderIndex label description characterExternalId enabledConditionExternalId active
  }
  characters(where: {scenarioVersionId: {eq: $versionId}}, orderBy: {externalId: ASC}, limit: $pageLimit, offset: $pageOffset) { externalId name publicRole active }
}
`;

const VOTE_RUNTIME_QUERY = `
query VoteRuntime($sessionId: UUID!, $pageLimit: Int!, $pageOffset: Int!) {
  sessionVotes(where: {gameSessionId: {eq: $sessionId}}, orderBy: [{voteExternalId: ASC}, {round: ASC}], limit: $pageLimit, offset: $pageOffset) {
    voteExternalId round status eligibleOptionExternalIds openedAt closedAt resultJson note
  }
  sessionBallots(where: {gameSessionId: {eq: $sessionId}}, orderBy: [{castAt: ASC}, {voteExternalId: ASC}, {round: ASC}, {electorCharacterExternalId: ASC}], limit: $pageLimit, offset: $pageOffset) {
    voteExternalId round electorCharacterExternalId selectedOptionExternalIds weight castAt updatedAt
  }
  sessionResources(where: {gameSessionId: {eq: $sessionId}}, orderBy: [{characterExternalId: ASC}, {resourceExternalId: ASC}], limit: $pageLimit, offset: $pageOffset) {
    characterExternalId resourceExternalId currentValue
  }
}
`;

const VOTE_CONTEXT_QUERY = `
query VoteRuntimeContext($sessionId: UUID!, $pageLimit: Int!, $pageOffset: Int!) {
  sessionVotes(where: {gameSessionId: {eq: $sessionId}}, orderBy: [{voteExternalId: ASC}, {round: ASC}], limit: $pageLimit, offset: $pageOffset) {
    voteExternalId round status eligibleOptionExternalIds openedAt closedAt resultJson note
  }
  sessionResources(where: {gameSessionId: {eq: $sessionId}}, orderBy: [{characterExternalId: ASC}, {resourceExternalId: ASC}], limit: $pageLimit, offset: $pageOffset) {
    characterExternalId resourceExternalId currentValue
  }
}`;

const INSERT_SESSION_VOTE = `
mutation InsertSessionVote($sessionId: UUID!, $voteExternalId: String!, $data: SessionVote_Data!, $log: SessionActionLog_Data!) @transaction {
  ${SESSION_LOCK}
  ${RUNNING_SESSION_CHECK}
  existing: query @check(expr: "response.existing.sessionVotes.size() == 0", message: "VOTE_ALREADY_OPEN") @redact {
    sessionVotes(where: {gameSessionId: {eq: $sessionId}, voteExternalId: {eq: $voteExternalId}, status: {in: ["OPEN", "CLOSING"]}}, limit: 1) { round }
  }
  sessionVote_insert(data: $data)
  sessionActionLog_insert(data: $log)
}
`;
const BEGIN_VOTE_CLOSE = `
mutation BeginVoteClose($sessionId: UUID!, $voteExternalId: String!, $round: Int!) @transaction {
  ${SESSION_LOCK}
  ${RUNNING_SESSION_CHECK}
  ${OPEN_ROUND_CHECK}
  sessionVote_update(key: {gameSessionId: $sessionId, voteExternalId: $voteExternalId, round: $round}, data: {status: "CLOSING"})
}`;
const UPDATE_SESSION_VOTE = `
mutation UpdateSessionVote($sessionId: UUID!, $voteExternalId: String!, $round: Int!, $status: String!, $closedAt: Timestamp, $resultJson: String, $note: String, $log: SessionActionLog_Data!) @transaction {
  ${SESSION_LOCK}
  ${RUNNING_SESSION_CHECK}
  closing: query @check(expr: "response.closing.sessionVote != null && response.closing.sessionVote.status == 'CLOSING'", message: "VOTE_NOT_CLOSING") @redact {
    sessionVote(key: {gameSessionId: $sessionId, voteExternalId: $voteExternalId, round: $round}) { status }
  }
  sessionVote_update(key: {gameSessionId: $sessionId, voteExternalId: $voteExternalId, round: $round}, data: {status: $status, closedAt: $closedAt, resultJson: $resultJson, note: $note})
  sessionActionLog_insert(data: $log)
}
`;
const INSERT_BALLOT = `
mutation InsertBallot($sessionId: UUID!, $voteExternalId: String!, $round: Int!, $data: SessionBallot_Data!, $log: SessionActionLog_Data!) @transaction {
  ${SESSION_LOCK}
  ${RUNNING_SESSION_CHECK}
  ${OPEN_ROUND_CHECK}
  sessionBallot_insert(data: $data)
  sessionActionLog_insert(data: $log)
}`;
const UPDATE_BALLOT = `
mutation UpdateBallot($sessionId: UUID!, $voteExternalId: String!, $round: Int!, $electorCharacterExternalId: String!, $selectedOptionExternalIds: String, $weight: Int!, $updatedAt: Timestamp!, $log: SessionActionLog_Data!) @transaction {
  ${SESSION_LOCK}
  ${RUNNING_SESSION_CHECK}
  ${OPEN_ROUND_CHECK}
  sessionBallot_update(key: {gameSessionId: $sessionId, voteExternalId: $voteExternalId, round: $round, electorCharacterExternalId: $electorCharacterExternalId}, data: {selectedOptionExternalIds: $selectedOptionExternalIds, weight: $weight, updatedAt: $updatedAt})
  sessionActionLog_insert(data: $log)
}
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
  if (errors.length) { const e = new Error('DATACONNECT_VOTE_READ_FAILED'); e.details = errors; throw e; }
  return response?.data ?? response;
}
async function defaultExecutor(operation, variables) {
  const dc = await getAdminDataConnect();
  const response = await dc.executeGraphql(operation, { variables });
  const errors = response?.errors ?? response?.data?.errors ?? [];
  if (errors.length) { const e = new Error('DATACONNECT_VOTE_WRITE_FAILED'); e.details = errors; throw e; }
  return response?.data ?? response;
}

const splitIds = value => String(value ?? '').split(';').map(x => x.trim()).filter(Boolean);
const joinIds = values => (values ?? []).filter(Boolean).join(';');
const byId = (rows, key='externalId') => new Map((rows ?? []).map(row => [row[key], row]));
const normalizedIdSet = values => [...new Set((values ?? []).map(String).filter(Boolean))].sort();
const sameIdSet = (left, right) => {
  const a=normalizedIdSet(left);
  const b=normalizedIdSet(right);
  return a.length===b.length && a.every((value,index)=>value===b[index]);
};
function errorSearchText(error){
  const parts=[error instanceof Error?error.message:String(error??'')];
  if(error&&typeof error==='object'&&'details' in error){
    try{parts.push(JSON.stringify(error.details));}
    catch{parts.push(String(error.details??''));}
  }
  return parts.join(' ');
}
function isSessionBallotUniqueConstraint(error){
  const compact=errorSearchText(error).toLowerCase().replace(/[^a-z0-9]+/g,'');
  return compact.includes('sessionballotpkey') &&
    (compact.includes('unique')||compact.includes('duplicate')||compact.includes('violatedsql'));
}

export function resolveElectorate(definition, participants, runtime=null, source=null) {
  const cast = (participants ?? [])
    .filter(p => p.active !== false && p.characterExternalId)
    .map(p => p.characterExternalId);

  if (definition.scopeType === 'ALL')
    return [...new Set(cast)];

  if (definition.scopeType === 'LIST') {
    const allowed = new Set(splitIds(definition.scopeRef));
    return cast.filter(id => allowed.has(id));
  }

  if (definition.scopeType === 'VOTE_WINNERS') {
    if(!runtime||!source)return [];

    const castSet=new Set(cast);
    const optionMap=new Map(
      (source.voteOptionDefinitions??[]).map(option=>[option.externalId,option])
    );

    const sourceVoteExternalIds=splitIds(definition.scopeRef);
    if(!sourceVoteExternalIds.length)return [];

    const winners=[];

    for(const sourceVoteExternalId of sourceVoteExternalIds){
      const closed=(runtime.sessionVotes??[])
        .filter(v=>v.voteExternalId===sourceVoteExternalId&&v.status==='CLOSED'&&v.resultJson)
        .sort((a,b)=>Number(b.round??0)-Number(a.round??0))[0];

      if(!closed)return [];

      let result=null;
      try{result=JSON.parse(closed.resultJson)}catch{}
      const winnerOptionExternalId=result?.winnerOptionExternalId;
      const characterExternalId=optionMap.get(winnerOptionExternalId)?.characterExternalId;

      if(!characterExternalId||!castSet.has(characterExternalId))
        return [];

      winners.push(characterExternalId);
    }

    const unique=[...new Set(winners)];
    return unique.length===sourceVoteExternalIds.length?unique:[];
  }

  return [];
}

export function tallyVote({ definition, options, electorate, ballots }) {
  const allowed = new Set((options ?? []).map(o => o.externalId));
  const tally = new Map((options ?? []).map(o => [o.externalId, 0]));
  let abstentions = 0;
  let validBallots = 0;
  let totalWeight = 0;
  const electorSet = new Set(electorate ?? []);
  for (const ballot of ballots ?? []) {
    if (!electorSet.has(ballot.electorCharacterExternalId)) continue;
    const weight = Math.max(0, Number(ballot.weight ?? 1));
    const selected = splitIds(ballot.selectedOptionExternalIds).filter(id => allowed.has(id));
    if (!selected.length) { abstentions += weight; continue; }
    validBallots += 1;
    totalWeight += weight;
    for (const id of selected.slice(0, Math.max(1, Number(definition.votesPerElector ?? 1)))) tally.set(id, (tally.get(id) ?? 0) + weight);
  }
  const ranked = (options ?? []).map(o => ({ optionExternalId:o.externalId, label:o.label, orderIndex:o.orderIndex ?? 0, votes:tally.get(o.externalId) ?? 0 }))
    .sort((a,b)=>b.votes-a.votes || a.orderIndex-b.orderIndex);
  const winner = ranked[0] ?? null;
  const majorityAbsolute = winner ? winner.votes > totalWeight / 2 : false;
  const hasEffectiveVote = Boolean(validBallots > 0 && winner && Number(winner.votes) > 0);
  const tieForLead = Boolean(
    hasEffectiveVote &&
    ranked.length > 1 &&
    ranked[0].votes === ranked[1].votes
  );
  const suggestSecondRound = definition.tieRule === 'SECOND_ROUND' && tieForLead;
  const secondRoundOptionExternalIds = suggestSecondRound
    ? ranked
        .filter(x=>x.votes===ranked[0].votes)
        .map(x=>x.optionExternalId)
    : [];

  return {
    electorateCount: electorSet.size,
    ballotsCast: (ballots ?? []).filter(b=>electorSet.has(b.electorCharacterExternalId)).length,
    validBallots,
    totalWeight,
    abstentions,
    majorityAbsolute,
    tieForLead,
    winnerOptionExternalId: hasEffectiveVote && !tieForLead ? winner?.optionExternalId ?? null : null,
    ranked,
    suggestSecondRound,
    secondRoundOptionExternalIds,
  };
}

export function shapeVoteDashboard(session, source, runtime) {
  const optionsByVote = new Map();
  for (const option of source.voteOptionDefinitions ?? []) {
    if (option.active === false) continue;
    if (!optionsByVote.has(option.voteExternalId)) optionsByVote.set(option.voteExternalId, []);
    optionsByVote.get(option.voteExternalId).push(option);
  }
  for (const rows of optionsByVote.values()) rows.sort((a,b)=>(a.orderIndex??0)-(b.orderIndex??0));
  const roundsByVote = new Map();
  for (const row of runtime.sessionVotes ?? []) {
    if (!roundsByVote.has(row.voteExternalId)) roundsByVote.set(row.voteExternalId, []);
    roundsByVote.get(row.voteExternalId).push(row);
  }
  const ballots = runtime.sessionBallots ?? [];
  const characterMap = byId(source.characters);
  const participantMap = new Map((session.sessionParticipants_on_gameSession ?? []).filter(p=>p.characterExternalId).map(p=>[p.characterExternalId,p]));
  const resources = runtime.sessionResources ?? [];
  const votes = (source.voteDefinitions ?? []).filter(v=>v.active!==false).map(def => {
    const electorate = resolveElectorate(def, session.sessionParticipants_on_gameSession ?? [], runtime, source);
    const rounds = (roundsByVote.get(def.externalId) ?? []).sort((a,b)=>a.round-b.round);
    const activeRound = [...rounds].reverse().find(r=>r.status==='OPEN') ?? rounds.at(-1) ?? null;
    const eligibleIds = activeRound?.eligibleOptionExternalIds ? splitIds(activeRound.eligibleOptionExternalIds) : (optionsByVote.get(def.externalId) ?? []).map(x=>x.externalId);
    const options =
      (optionsByVote.get(def.externalId) ?? [])
        .filter(
          o=>eligibleIds.includes(o.externalId)
        )
        .map(option=>{
          if(!option.characterExternalId)
            return option;

          const resolved=
            resolveSessionCharacter(
              participantMap.get(
                option.characterExternalId
              ),
              characterMap.get(
                option.characterExternalId
              )
            );

          return {
            ...option,
            label:
              resolved.name ||
              option.label
          };
        });
    const roundBallots = activeRound ? ballots.filter(b=>b.voteExternalId===def.externalId && b.round===activeRound.round) : [];
    let result = null;
    if (activeRound?.resultJson) { try { result = JSON.parse(activeRound.resultJson); } catch {} }
    const voters = electorate.map(characterExternalId => ({
      characterExternalId,
      characterName:
        resolveSessionCharacter(
          participantMap.get(characterExternalId),
          characterMap.get(characterExternalId)
        ).name,
      participantName: participantMap.get(characterExternalId)?.displayName ?? null,
      hasVoted: roundBallots.some(b=>b.electorCharacterExternalId===characterExternalId),
    }));
    return { ...def, options, rounds, activeRound, result, voters, electorate, resources };
  
  });
  return { sourceReady: session.scenarioVersion?.runtimeDataVersion === '0.9', session:{id:session.id,status:session.status}, votes };
}

async function loadVoteState(sessionId, reader=defaultReader, includeBallots=false) {
  const s = await reader(VOTE_SESSION_QUERY,{sessionId});
  const session=s?.gameSession; if(!session) throw new Error('SESSION_NOT_FOUND');
  const versionId=session.scenarioVersion?.id;
  const [source,runtime]=await Promise.all([
    readAllPages(reader,VOTE_SOURCE_QUERY,{versionId},['voteDefinitions','voteOptionDefinitions','characters']),
    readAllPages(reader,includeBallots?VOTE_RUNTIME_QUERY:VOTE_CONTEXT_QUERY,{sessionId},includeBallots?['sessionVotes','sessionBallots','sessionResources']:['sessionVotes','sessionResources']),
  ]);
  return {session,source,runtime};
}

export async function getVoteDashboard(sessionId,{reader=defaultReader}={}) {
  const loaded=await loadVoteState(sessionId,reader,true); return shapeVoteDashboard(loaded.session,loaded.source,loaded.runtime);
}

function getDefinition(source,voteExternalId){const def=(source.voteDefinitions??[]).find(v=>v.externalId===voteExternalId&&v.active!==false);if(!def)throw new Error('VOTE_NOT_FOUND');return def;}
function optionsFor(source,voteExternalId){return (source.voteOptionDefinitions??[]).filter(o=>o.voteExternalId===voteExternalId&&o.active!==false).sort((a,b)=>(a.orderIndex??0)-(b.orderIndex??0));}

export async function openSessionVote(sessionId,input,{reader=defaultReader,executor=defaultExecutor,now=()=>new Date()}={}) {
  const {session,source,runtime}=await loadVoteState(sessionId,reader);
  if(!['LIVE','PAUSED'].includes(session.status)) throw new Error('VOTE_REQUIRES_LIVE_SESSION');
  if(session.scenarioVersion?.runtimeDataVersion!=='0.9') throw new Error('VOTE_SOURCE_NOT_READY');
  const def=getDefinition(source,String(input.voteExternalId));
  const existing=(runtime.sessionVotes??[]).filter(v=>v.voteExternalId===def.externalId).sort((a,b)=>a.round-b.round);
  if(existing.some(v=>['OPEN','CLOSING'].includes(v.status))) throw new Error('VOTE_ALREADY_OPEN');
  const previous=existing.at(-1)??null;
  const round=previous?previous.round+1:1;
  let eligible=optionsFor(source,def.externalId).map(o=>o.externalId);
  if(input.secondRound===true){
    if(!previous?.resultJson) throw new Error('SECOND_ROUND_REQUIRES_RESULT');
    const result=JSON.parse(previous.resultJson);
    const ranked=Array.isArray(result.ranked)?result.ranked:[];
    const tiedAtTop =
      ranked.length>=2 &&
      Number(ranked[0].votes)>0 &&
      ranked[0].votes===ranked[1].votes;

    if(tiedAtTop){
      const leadVotes=ranked[0].votes;
      eligible=ranked
        .filter(x=>x.votes===leadVotes)
        .map(x=>x.optionExternalId)
        .filter(Boolean);
    }else if(result.tieForLead===true && Number(result.validBallots??0)>0){
      eligible=(result.secondRoundOptionExternalIds??[]).filter(Boolean);
    }else{
      eligible=[];
    }

    if(eligible.length<2) throw new Error('SECOND_ROUND_NOT_AVAILABLE');
  }
  const electorate=resolveElectorate(def,session.sessionParticipants_on_gameSession??[],runtime,source);
  if(!electorate.length) throw new Error('VOTE_ELECTORATE_EMPTY');
  const openedAt=now().toISOString();
  await executor(INSERT_SESSION_VOTE,{sessionId,voteExternalId:def.externalId,data:{gameSessionId:sessionId,voteExternalId:def.externalId,round,status:'OPEN',eligibleOptionExternalIds:joinIds(eligible),openedAt,closedAt:null,resultJson:null,note:null},log:{gameSessionId:sessionId,actionType:'VOTE_OPEN',refExternalId:def.externalId,afterValue:String(round),note:input.secondRound?'Second tour':'Ouverture du vote'}});
  return {voteExternalId:def.externalId,round,electorateCount:electorate.length,eligibleOptionExternalIds:eligible};
}

export async function castSessionBallot(sessionId,input,{reader=defaultReader,executor=defaultExecutor,now=()=>new Date()}={}) {
  const {session,source,runtime}=await loadVoteState(sessionId,reader);
  if(!['LIVE','PAUSED'].includes(session.status)) throw new Error('BALLOT_REQUIRES_LIVE_SESSION');
  const def=getDefinition(source,String(input.voteExternalId));
  const open=(runtime.sessionVotes??[]).filter(v=>v.voteExternalId===def.externalId&&v.status==='OPEN').sort((a,b)=>b.round-a.round)[0];
  if(!open) throw new Error('VOTE_NOT_OPEN');
  if(!Number.isInteger(input.round)||input.round<1) throw new Error('VOTE_ROUND_REQUIRED');
  if(input.round!==open.round) throw new Error('VOTE_ROUND_CHANGED');
  const voter=String(input.electorCharacterExternalId??'').trim();
  const electorate=resolveElectorate(def,session.sessionParticipants_on_gameSession??[],runtime,source);
  if(!electorate.includes(voter)) throw new Error('VOTER_NOT_ELIGIBLE');
  const eligible=new Set(splitIds(open.eligibleOptionExternalIds));
  const selected=normalizedIdSet(Array.isArray(input.selectedOptionExternalIds)?input.selectedOptionExternalIds:splitIds(input.selectedOptionExternalIds));
  if(!selected.length && !def.abstention) throw new Error('ABSTENTION_NOT_ALLOWED');
  if(selected.length>Math.max(1,def.votesPerElector??1)) throw new Error('TOO_MANY_CHOICES');
  if(selected.some(id=>!eligible.has(id))) throw new Error('VOTE_OPTION_NOT_ELIGIBLE');
  let weight=1;
  if(def.weighted&&def.weightResourceExternalId){
    const resource=(runtime.sessionResources??[]).find(r=>r.characterExternalId===voter&&r.resourceExternalId===def.weightResourceExternalId);
    weight=Math.max(0,Number(resource?.currentValue??0));
  }

  const key={sessionId,voteExternalId:def.externalId,round:open.round,electorCharacterExternalId:voter};
  const previous=(await reader(BALLOT_BY_KEY_QUERY,key))?.sessionBallot;
  const stamp=now().toISOString();
  const selectedOptionExternalIds=joinIds(selected);
  const log={gameSessionId:sessionId,actionType:'BALLOT_CAST',characterExternalId:voter,refExternalId:def.externalId,afterValue:def.secret?'SECRET':selectedOptionExternalIds,note:`Tour ${open.round}`};
  const response=(updated=false,alreadyRecorded=false)=>({
    voteExternalId:def.externalId,
    round:open.round,
    electorCharacterExternalId:voter,
    updated,
    alreadyRecorded,
  });

  if(previous){
    if(sameIdSet(splitIds(previous.selectedOptionExternalIds),selected))
      return response(false,true);
    if(!def.modifiable) throw new Error('BALLOT_NOT_MODIFIABLE');
    await executor(UPDATE_BALLOT,{...key,selectedOptionExternalIds,weight,updatedAt:stamp,log});
    return response(true,false);
  }

  try{
    await executor(INSERT_BALLOT,{sessionId,voteExternalId:def.externalId,round:open.round,data:{gameSessionId:sessionId,voteExternalId:def.externalId,round:open.round,electorCharacterExternalId:voter,selectedOptionExternalIds,weight,castAt:stamp,updatedAt:stamp},log});
  }catch(error){
    if(!isSessionBallotUniqueConstraint(error)) throw error;

    // A double tap, retry, or concurrent request may insert the same
    // primary key between our read and write. Re-read once and make
    // that retry idempotent instead of exposing the SQL constraint.
    const current=(await reader(BALLOT_BY_KEY_QUERY,key))?.sessionBallot;
    if(!current) throw error;

    if(sameIdSet(splitIds(current.selectedOptionExternalIds),selected))
      return response(false,true);

    if(!def.modifiable) throw new Error('BALLOT_NOT_MODIFIABLE');

    await executor(UPDATE_BALLOT,{...key,selectedOptionExternalIds,weight,updatedAt:stamp,log});
    return response(true,false);
  }

  return response(false,false);
}

export async function closeSessionVote(sessionId,input,{reader=defaultReader,executor=defaultExecutor,now=()=>new Date()}={}) {
  const {session,source,runtime}=await loadVoteState(sessionId,reader);
  if(!['LIVE','PAUSED'].includes(session.status)) throw new Error('VOTE_REQUIRES_LIVE_SESSION');
  const def=getDefinition(source,String(input.voteExternalId));
  const open=(runtime.sessionVotes??[]).filter(v=>v.voteExternalId===def.externalId&&['OPEN','CLOSING'].includes(v.status)).sort((a,b)=>b.round-a.round)[0];
  if(!open) throw new Error('VOTE_NOT_OPEN');
  if(!Number.isInteger(input.round)||input.round<1) throw new Error('VOTE_ROUND_REQUIRED');
  if(input.round!==open.round) throw new Error('VOTE_ROUND_CHANGED');
  const key={sessionId,voteExternalId:def.externalId,round:open.round};
  // Once frozen, inserts/updates are rejected in the same transaction as their
  // status check. A failed tally can safely resume from CLOSING on the next call.
  if(open.status==='OPEN') await executor(BEGIN_VOTE_CLOSE,key);
  const eligibleIds=splitIds(open.eligibleOptionExternalIds);
  const options=optionsFor(source,def.externalId).filter(o=>eligibleIds.includes(o.externalId));
  const electorate=resolveElectorate(def,session.sessionParticipants_on_gameSession??[],runtime,source);
  const ballots=input.cancel===true?[]:await readRoundBallots(reader,key);
  const result=input.cancel===true?null:tallyVote({definition:def,options,electorate,ballots});
  const status=input.cancel===true?'CANCELLED':'CLOSED';
  const closedAt=now().toISOString();
  await executor(UPDATE_SESSION_VOTE,{...key,status,closedAt,resultJson:result?JSON.stringify(result):null,note:input.note?String(input.note):null,log:{gameSessionId:sessionId,actionType:input.cancel===true?'VOTE_CANCEL':'VOTE_CLOSE',refExternalId:def.externalId,beforeValue:'CLOSING',afterValue:status,note:result?`Tour ${open.round} · ${result.ballotsCast}/${result.electorateCount} bulletins`:`Tour ${open.round} · Annulé par le MJ`}});
  return {voteExternalId:def.externalId,round:open.round,status,result};
}

export const __voteOps={VOTE_SESSION_QUERY,VOTE_SOURCE_QUERY,VOTE_RUNTIME_QUERY,INSERT_SESSION_VOTE,BEGIN_VOTE_CLOSE,UPDATE_SESSION_VOTE,INSERT_BALLOT,UPDATE_BALLOT};

