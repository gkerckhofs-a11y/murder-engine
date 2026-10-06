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
query VoteSource($versionId: UUID!) {
  voteDefinitions(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId title question scopeType scopeRef choicesMode secret votesPerElector weighted
    weightResourceExternalId abstention modifiable closeMode durationMinutes resultVisibility tieRule active
  }
  voteOptionDefinitions(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId voteExternalId orderIndex label description characterExternalId enabledConditionExternalId active
  }
  characters(where: {scenarioVersionId: {eq: $versionId}}) { externalId name publicRole active }
}
`;

const VOTE_RUNTIME_QUERY = `
query VoteRuntime($sessionId: UUID!) {
  sessionVotes(where: {gameSessionId: {eq: $sessionId}}) {
    voteExternalId round status eligibleOptionExternalIds openedAt closedAt resultJson note
  }
  sessionBallots(where: {gameSessionId: {eq: $sessionId}}) {
    voteExternalId round electorCharacterExternalId selectedOptionExternalIds weight castAt updatedAt
  }
  sessionResources(where: {gameSessionId: {eq: $sessionId}}) {
    characterExternalId resourceExternalId currentValue
  }
}
`;

const INSERT_SESSION_VOTE = `
mutation InsertSessionVote($data: SessionVote_Data!) { sessionVote_insert(data: $data) }
`;
const UPDATE_SESSION_VOTE = `
mutation UpdateSessionVote($sessionId: UUID!, $voteExternalId: String!, $round: Int!, $status: String!, $closedAt: Timestamp, $resultJson: String, $note: String) {
  sessionVote_update(key: {gameSessionId: $sessionId, voteExternalId: $voteExternalId, round: $round}, data: {status: $status, closedAt: $closedAt, resultJson: $resultJson, note: $note})
}
`;
const INSERT_BALLOT = `mutation InsertBallot($data: SessionBallot_Data!) { sessionBallot_insert(data: $data) }`;
const UPDATE_BALLOT = `
mutation UpdateBallot($sessionId: UUID!, $voteExternalId: String!, $round: Int!, $electorCharacterExternalId: String!, $selectedOptionExternalIds: String, $weight: Int!, $updatedAt: Timestamp!) {
  sessionBallot_update(key: {gameSessionId: $sessionId, voteExternalId: $voteExternalId, round: $round, electorCharacterExternalId: $electorCharacterExternalId}, data: {selectedOptionExternalIds: $selectedOptionExternalIds, weight: $weight, updatedAt: $updatedAt})
}
`;
const INSERT_ACTION_LOG = `mutation InsertVoteLog($data: SessionActionLog_Data!) { sessionActionLog_insert(data: $data) }`;

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
  const tieForLead = ranked.length > 1 && ranked[0].votes === ranked[1].votes;
  const suggestSecondRound = definition.tieRule === 'SECOND_ROUND' && !majorityAbsolute && ranked.length > 2;

  let secondRoundOptionExternalIds=[];
  if(suggestSecondRound&&ranked.length>=2){
    const leadVotes=ranked[0].votes;
    const leadGroup=ranked.filter(x=>x.votes===leadVotes);

    if(leadGroup.length>=2){
      secondRoundOptionExternalIds=leadGroup.map(x=>x.optionExternalId);
    }else{
      const secondVotes=ranked[1].votes;
      secondRoundOptionExternalIds=[
        ranked[0].optionExternalId,
        ...ranked.filter((x,index)=>index>0&&x.votes===secondVotes).map(x=>x.optionExternalId),
      ];
    }
  }

  return {
    electorateCount: electorSet.size,
    ballotsCast: (ballots ?? []).filter(b=>electorSet.has(b.electorCharacterExternalId)).length,
    validBallots,
    totalWeight,
    abstentions,
    majorityAbsolute,
    tieForLead,
    winnerOptionExternalId: majorityAbsolute && !tieForLead ? winner?.optionExternalId ?? null : null,
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

async function loadVoteState(sessionId, reader=defaultReader) {
  const s = await reader(VOTE_SESSION_QUERY,{sessionId});
  const session=s?.gameSession; if(!session) throw new Error('SESSION_NOT_FOUND');
  const versionId=session.scenarioVersion?.id;
  const [source,runtime]=await Promise.all([reader(VOTE_SOURCE_QUERY,{versionId}),reader(VOTE_RUNTIME_QUERY,{sessionId})]);
  return {session,source,runtime};
}

export async function getVoteDashboard(sessionId,{reader=defaultReader}={}) {
  const loaded=await loadVoteState(sessionId,reader); return shapeVoteDashboard(loaded.session,loaded.source,loaded.runtime);
}

function getDefinition(source,voteExternalId){const def=(source.voteDefinitions??[]).find(v=>v.externalId===voteExternalId&&v.active!==false);if(!def)throw new Error('VOTE_NOT_FOUND');return def;}
function optionsFor(source,voteExternalId){return (source.voteOptionDefinitions??[]).filter(o=>o.voteExternalId===voteExternalId&&o.active!==false).sort((a,b)=>(a.orderIndex??0)-(b.orderIndex??0));}

export async function openSessionVote(sessionId,input,{reader=defaultReader,executor=defaultExecutor,now=()=>new Date()}={}) {
  const {session,source,runtime}=await loadVoteState(sessionId,reader);
  if(!['LIVE','PAUSED'].includes(session.status)) throw new Error('VOTE_REQUIRES_LIVE_SESSION');
  if(session.scenarioVersion?.runtimeDataVersion!=='0.9') throw new Error('VOTE_SOURCE_NOT_READY');
  const def=getDefinition(source,String(input.voteExternalId));
  const existing=(runtime.sessionVotes??[]).filter(v=>v.voteExternalId===def.externalId).sort((a,b)=>a.round-b.round);
  if(existing.some(v=>v.status==='OPEN')) throw new Error('VOTE_ALREADY_OPEN');
  const previous=existing.at(-1)??null;
  const round=previous?previous.round+1:1;
  let eligible=optionsFor(source,def.externalId).map(o=>o.externalId);
  if(input.secondRound===true){
    if(!previous?.resultJson) throw new Error('SECOND_ROUND_REQUIRES_RESULT');
    const result=JSON.parse(previous.resultJson);
    eligible=(result.secondRoundOptionExternalIds??[]).filter(Boolean);
    if(eligible.length<2) throw new Error('SECOND_ROUND_NOT_AVAILABLE');
  }
  const electorate=resolveElectorate(def,session.sessionParticipants_on_gameSession??[],runtime,source);
  if(!electorate.length) throw new Error('VOTE_ELECTORATE_EMPTY');
  const openedAt=now().toISOString();
  await executor(INSERT_SESSION_VOTE,{data:{gameSessionId:sessionId,voteExternalId:def.externalId,round,status:'OPEN',eligibleOptionExternalIds:joinIds(eligible),openedAt,closedAt:null,resultJson:null,note:null}});
  await executor(INSERT_ACTION_LOG,{data:{gameSessionId:sessionId,actionType:'VOTE_OPEN',refExternalId:def.externalId,afterValue:String(round),note:input.secondRound?'Second tour':'Ouverture du vote'}});
  return {voteExternalId:def.externalId,round,electorateCount:electorate.length,eligibleOptionExternalIds:eligible};
}

export async function castSessionBallot(sessionId,input,{reader=defaultReader,executor=defaultExecutor,now=()=>new Date()}={}) {
  const {session,source,runtime}=await loadVoteState(sessionId,reader);
  if(!['LIVE','PAUSED'].includes(session.status)) throw new Error('BALLOT_REQUIRES_LIVE_SESSION');
  const def=getDefinition(source,String(input.voteExternalId));
  const open=(runtime.sessionVotes??[]).filter(v=>v.voteExternalId===def.externalId&&v.status==='OPEN').sort((a,b)=>b.round-a.round)[0];
  if(!open) throw new Error('VOTE_NOT_OPEN');
  const voter=String(input.electorCharacterExternalId??'').trim();
  const electorate=resolveElectorate(def,session.sessionParticipants_on_gameSession??[],runtime,source);
  if(!electorate.includes(voter)) throw new Error('VOTER_NOT_ELIGIBLE');
  const eligible=new Set(splitIds(open.eligibleOptionExternalIds));
  const selected=Array.isArray(input.selectedOptionExternalIds)?input.selectedOptionExternalIds.map(String).filter(Boolean):splitIds(input.selectedOptionExternalIds);
  if(!selected.length && !def.abstention) throw new Error('ABSTENTION_NOT_ALLOWED');
  if(selected.length>Math.max(1,def.votesPerElector??1)) throw new Error('TOO_MANY_CHOICES');
  if(selected.some(id=>!eligible.has(id))) throw new Error('VOTE_OPTION_NOT_ELIGIBLE');
  let weight=1;
  if(def.weighted&&def.weightResourceExternalId){
    const resource=(runtime.sessionResources??[]).find(r=>r.characterExternalId===voter&&r.resourceExternalId===def.weightResourceExternalId);
    weight=Math.max(0,Number(resource?.currentValue??0));
  
  }
  const previous=(runtime.sessionBallots??[]).find(b=>b.voteExternalId===def.externalId&&b.round===open.round&&b.electorCharacterExternalId===voter);
  const stamp=now().toISOString();
  if(previous){
    if(!def.modifiable) throw new Error('BALLOT_NOT_MODIFIABLE');
    await executor(UPDATE_BALLOT,{sessionId,voteExternalId:def.externalId,round:open.round,electorCharacterExternalId:voter,selectedOptionExternalIds:joinIds(selected),weight,updatedAt:stamp});
  } else {
    await executor(INSERT_BALLOT,{data:{gameSessionId:sessionId,voteExternalId:def.externalId,round:open.round,electorCharacterExternalId:voter,selectedOptionExternalIds:joinIds(selected),weight,castAt:stamp,updatedAt:stamp}});
  }
  await executor(INSERT_ACTION_LOG,{data:{gameSessionId:sessionId,actionType:'BALLOT_CAST',characterExternalId:voter,refExternalId:def.externalId,afterValue:def.secret?'SECRET':joinIds(selected),note:`Tour ${open.round}`}});
  return {voteExternalId:def.externalId,round:open.round,electorCharacterExternalId:voter,updated:Boolean(previous)};
}

export async function closeSessionVote(sessionId,input,{reader=defaultReader,executor=defaultExecutor,now=()=>new Date()}={}) {
  const {session,source,runtime}=await loadVoteState(sessionId,reader);
  const def=getDefinition(source,String(input.voteExternalId));
  const open=(runtime.sessionVotes??[]).filter(v=>v.voteExternalId===def.externalId&&v.status==='OPEN').sort((a,b)=>b.round-a.round)[0];
  if(!open) throw new Error('VOTE_NOT_OPEN');
  const eligibleIds=splitIds(open.eligibleOptionExternalIds);
  const options=optionsFor(source,def.externalId).filter(o=>eligibleIds.includes(o.externalId));
  const electorate=resolveElectorate(def,session.sessionParticipants_on_gameSession??[],runtime,source);
  const ballots=(runtime.sessionBallots??[]).filter(b=>b.voteExternalId===def.externalId&&b.round===open.round);
  const result=tallyVote({definition:def,options,electorate,ballots});
  const closedAt=now().toISOString();
  await executor(UPDATE_SESSION_VOTE,{sessionId,voteExternalId:def.externalId,round:open.round,status:'CLOSED',closedAt,resultJson:JSON.stringify(result),note:input.note?String(input.note):null});
  await executor(INSERT_ACTION_LOG,{data:{gameSessionId:sessionId,actionType:'VOTE_CLOSE',refExternalId:def.externalId,beforeValue:'OPEN',afterValue:'CLOSED',note:`Tour ${open.round} · ${result.ballotsCast}/${result.electorateCount} bulletins`}});
  return {voteExternalId:def.externalId,round:open.round,result};
}
