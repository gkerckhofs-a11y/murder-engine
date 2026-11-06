import {randomUUID} from 'node:crypto';
import {authorizePlayerAccess,readPlayerData,writePlayerData} from '../player.mjs';
import {SESSION_LOCK} from '../vote-storage.mjs';
import {canonicalSessionId} from '../session-access.mjs';
import {table,GAMES,integer,join,leave,act,tick,abort,view} from './engine.mjs';

export const CASINO_QUERY=`query CasinoSession($sessionId: UUID!) {
  gameSession(id:$sessionId) { id status pausedAt }
  sessionCasino(key:{gameSessionId:$sessionId}) {revision stateJson}
  sessionResources(where:{gameSessionId:{eq:$sessionId},resourceExternalId:{eq:"RES_CASH"}},limit:2000) {characterExternalId currentValue maxValue}
}`;
const COMMAND_QUERY=`query CasinoCommand($sessionId: UUID!,$requestId:String!) {
  sessionCasinoCommand(key:{gameSessionId:$sessionId,requestId:$requestId}) {actor}
}`;
function gameKey(value){if(!GAMES.includes(value))throw Error('INVALID_CASINO_GAME');return value;}
const parse=row=>row?JSON.parse(row.stateJson):{tables:Object.fromEntries(GAMES.map(g=>[g,table(g)])),pausedAt:null};
const fail=message=>{throw Error(message);};
function publicResult(data,state,actor,game){
  const wallet=data.sessionResources.find(r=>r.characterExternalId===actor);
  return {revision:data.sessionCasino?.revision??-1,sessionId:data.gameSession.id,characterExternalId:actor,serverNow:Date.now(),status:data.gameSession.status,wallet:wallet?.currentValue??0,walletMax:wallet?.maxValue??null,table:view(state.tables[game],actor),otherTable:GAMES.find(g=>g!==game&&state.tables[g].seats.some(p=>p.id===actor))??null};
}
async function load(sessionId,reader){const data=await reader(CASINO_QUERY,{sessionId});if(!data.gameSession)fail('CASINO_SESSION_NOT_FOUND');data.gameSession.id=canonicalSessionId(data.gameSession.id);return {...data,sessionResources:data.sessionResources??[]};}
function stateClock(state,status,now){
  if(status==='PAUSED'){if(!state.pausedAt)state.pausedAt=now;return;}
  if(state.pausedAt){const delta=now-state.pausedAt;for(const t of Object.values(state.tables))if(t.deadline)t.deadline+=delta;state.pausedAt=null;}
  if(status==='LIVE')for(const t of Object.values(state.tables))tick(t,now);
  else if(['FINISHED','ARCHIVED'].includes(status))for(const t of Object.values(state.tables))if(t.phase==='PLAYING'||t.seats.some(p=>p.hands?.some(h=>h.bet)))abort(t);
}
export function writePlan(data,state,{sessionId,requestId,actor,participantId=null,allowedStatuses,walletChanges=[],action,now}){
  const revision=data.sessionCasino?.revision??-1;
  const vars={sessionId,requestId,actor,expectedRevision:revision,stateJson:JSON.stringify(state),updatedAt:new Date(now).toISOString()};
  const decl=['$sessionId:UUID!','$requestId:String!','$actor:String!','$expectedRevision:Int!','$stateJson:String!','$updatedAt:Timestamp!'];
  if(revision<0){decl.splice(decl.indexOf('$expectedRevision:Int!'),1);delete vars.expectedRevision;}
  let body=SESSION_LOCK;
  body+=`guard:query @check(expr:"response.guard.gameSession != null && response.guard.gameSession.status in ${JSON.stringify(allowedStatuses).replaceAll('"',"'")}",message:"CASINO_SESSION_STATE_CHANGED") @redact {gameSession(id:$sessionId){status}}\n`;
  if(participantId){vars.participantId=participantId;decl.push('$participantId:UUID!');body+=`playerGuard:query @check(expr:"response.playerGuard.sessionParticipant != null && response.playerGuard.sessionParticipant.active == true && response.playerGuard.sessionParticipant.playerAccessEnabled == true && response.playerGuard.sessionParticipant.characterExternalId == vars.actor && response.playerGuard.sessionParticipant.gameSession.id == vars.sessionId",message:"CASINO_PLAYER_ACCESS_CHANGED") @redact {sessionParticipant(id:$participantId){active playerAccessEnabled characterExternalId gameSession{id}}}\n`;}
  if(revision>=0){
    body+=`casinoLock:sessionCasino_update(key:{gameSessionId:$sessionId},data:{revision_update:{inc:0}})\n`;
    body+=`versionGuard:query @check(expr:"response.versionGuard.sessionCasino.revision == vars.expectedRevision",message:"CASINO_STATE_CHANGED") @redact {sessionCasino(key:{gameSessionId:$sessionId}){revision}}\n`;
  }
  walletChanges.sort((a,b)=>a.id.localeCompare(b.id));
  for(const [i,c]of walletChanges.entries()){
    const row=data.sessionResources.find(r=>r.characterExternalId===c.id)??fail('CASINO_CASH_NOT_AVAILABLE');
    const after=integer(row.currentValue+c.delta,0,2147483647);
    // Preserve scenario caps; a partial cash-out can free a seat without losing money.
    if(row.maxValue!=null&&after>row.maxValue)fail('CASINO_WALLET_LIMIT');
    Object.assign(vars,{['char'+i]:c.id,['before'+i]:row.currentValue,['after'+i]:after});decl.push(`$char${i}:String!`,`$before${i}:Int!`,`$after${i}:Int!`);
    body+=`cashLock${i}:sessionResource_update(key:{gameSessionId:$sessionId,characterExternalId:$char${i},resourceExternalId:"RES_CASH"},data:{currentValue_update:{inc:0}})\n`;
    body+=`cashGuard${i}:query @check(expr:"response.cashGuard${i}.sessionResource.currentValue == vars.before${i}",message:"CASINO_CASH_CHANGED") @redact {sessionResource(key:{gameSessionId:$sessionId,characterExternalId:$char${i},resourceExternalId:"RES_CASH"}){currentValue}}\n`;
    body+=`cash${i}:sessionResource_update(key:{gameSessionId:$sessionId,characterExternalId:$char${i},resourceExternalId:"RES_CASH"},data:{currentValue:$after${i},updatedAt:$updatedAt})\n`;
    row.currentValue=after;
  }
  body+=revision>=0?`casino:sessionCasino_update(key:{gameSessionId:$sessionId},data:{revision:${revision+1},stateJson:$stateJson,updatedAt:$updatedAt})\n`:`casino:sessionCasino_insert(data:{gameSessionId:$sessionId,revision:0,stateJson:$stateJson,updatedAt:$updatedAt})\n`;
  body+=`command:sessionCasinoCommand_insert(data:{gameSessionId:$sessionId,requestId:$requestId,actor:$actor,createdAt:$updatedAt})\n`;
  vars.log={gameSessionId:sessionId,characterExternalId:participantId?actor:null,actionType:'CASINO',refExternalId:action,beforeValue:String(revision),afterValue:String(revision+1),deltaValue:walletChanges.find(c=>c.id===actor)?.delta??0,note:JSON.stringify({actor,action,walletChanges}),createdAt:vars.updatedAt};decl.push('$log:SessionActionLog_Data!');body+='log:sessionActionLog_insert(data:$log)';
  return {operation:`mutation CasinoCommit(${decl.join(',')}) @transaction {${body}}`,variables:vars,revision:revision+1};
}
export async function playerCasino(token,input,{reader=readPlayerData,executor=writePlayerData,now=Date.now(),attempt=0}={}){
  const participant=await authorizePlayerAccess(token,reader);
  const sessionId=canonicalSessionId(participant.gameSession.id);if(canonicalSessionId(input.sessionId)!==sessionId)fail('CASINO_WRONG_SESSION');
  const game=gameKey(input.game),actor=participant.characterExternalId;
  const data=await load(sessionId,reader),state=parse(data.sessionCasino),t=state.tables[game];
  const type=String(input.type??'VIEW');
  if(type==='VIEW')return publicResult(data,state,actor,game);
  if(!/^[a-zA-Z0-9_-]{16,80}$/.test(input.requestId??''))fail('CASINO_REQUEST_ID_REQUIRED');
  const prior=(await reader(COMMAND_QUERY,{sessionId,requestId:input.requestId})).sessionCasinoCommand;
  if(prior){if(prior.actor!==actor)fail('CASINO_REQUEST_OWNER_MISMATCH');return publicResult(data,state,actor,game);}
  const serialized=JSON.stringify(state);
  const tablesBeforeClock=Object.fromEntries(GAMES.map(g=>[g,JSON.stringify(state.tables[g])]));
  stateClock(state,data.gameSession.status,now);
  for(const g of GAMES)if(tablesBeforeClock[g]!==JSON.stringify(state.tables[g]))state.tables[g].version++;
  const sameRound=input.round===t.round&&['JOIN','LEAVE','WITHDRAW','BET','READY','START','NEXT'].includes(type);
  if(type!=='REFRESH'&&!sameRound&&(input.tableRevision!=null?input.tableRevision!==t.version:input.revision!==(data.sessionCasino?.revision??-1)))fail('CASINO_STATE_CHANGED');
  const changes=[];
  if(type!=='REFRESH'){
    if(type!=='LEAVE'&&type!=='WITHDRAW'&&data.gameSession.status!=='LIVE')fail('CASINO_SESSION_NOT_LIVE');
    if(type!=='LEAVE'&&type!=='WITHDRAW'&&!t.enabled)fail('CASINO_DISABLED');
    if(type==='JOIN'){
      if(GAMES.some(g=>state.tables[g].seats.some(p=>p.id===actor)))fail('CASINO_ALREADY_AT_TABLE');
      const row=data.sessionResources.find(r=>r.characterExternalId===actor);const amount=integer(input.amount,1);
      if(!row||row.currentValue<amount)fail('CASINO_INSUFFICIENT_CASH');
      join(t,actor,participant.characterDisplayName||participant.displayName,amount);changes.push({id:actor,delta:-amount});
    }else if(type==='LEAVE'){changes.push({id:actor,delta:leave(t,actor)});}
    else if(type==='WITHDRAW'){
      if(t.phase==='PLAYING')fail('CASINO_HAND_IN_PROGRESS');const p=t.seats.find(s=>s.id===actor)??fail('CASINO_NOT_SEATED');
      if(p.hands?.some(h=>h.bet))fail('CASINO_BET_RESERVED');const amount=integer(input.amount,1,p.stack);p.stack-=amount;changes.push({id:actor,delta:amount});
    }else act(t,actor,{type,amount:input.amount},{now});
  }
  if(!changes.length&&JSON.stringify(state)===serialized)return publicResult(data,state,actor,game);
  if(type!=='REFRESH')t.version++;
  const plan=writePlan(data,state,{sessionId,requestId:input.requestId,actor,participantId:participant.id,allowedStatuses:type==='REFRESH'||type==='LEAVE'||type==='WITHDRAW'?['LIVE','PAUSED','FINISHED']:['LIVE'],walletChanges:changes,action:`${game}:${type}`,now});
  try{await executor(plan.operation,plan.variables);}catch(error){
    const details=String(error.message)+' '+JSON.stringify(error.details??'');
    if(attempt<2&&/CASINO_STATE_CHANGED|CASINO_CASH_CHANGED|ALREADY_EXISTS|duplicate key/.test(details))return playerCasino(token,input,{reader,executor,now,attempt:attempt+1});
    if(/CASINO_STATE_CHANGED|CASINO_CASH_CHANGED|ALREADY_EXISTS|duplicate key/.test(details))fail('CASINO_STATE_CHANGED');
    throw error;
  }data.sessionCasino={revision:plan.revision};return publicResult(data,state,actor,game);
}
export async function organizerCasino(sessionId,input={}, {reader=readPlayerData,executor=writePlayerData,now=Date.now()}={}){
  sessionId=canonicalSessionId(sessionId);
  const data=await load(sessionId,reader),state=parse(data.sessionCasino);
  if(!input.type)return {sessionId,status:data.gameSession.status,revision:data.sessionCasino?.revision??-1,tables:GAMES.map(g=>({...view(state.tables[g],null),bankInitial:state.tables[g].bankInitial})),wallets:data.sessionResources};
  const game=gameKey(input.game),t=state.tables[game];
  if(input.revision!==(data.sessionCasino?.revision??-1))fail('CASINO_STATE_CHANGED');
  const changes=[];
  if(input.type==='CONFIGURE'){
    if(t.seats.length)fail('CASINO_TABLE_MUST_BE_EMPTY');const replacement=table(game,input.config);
    if(game==='BLACKJACK'&&replacement.bankInitial===t.bankInitial)replacement.bank=t.bank;
    replacement.round=t.round;replacement.version=(t.version??0)+1;replacement.history=t.history;state.tables[game]=replacement;
  }else if(input.type==='CLOSE'){
    abort(t);for(const p of [...t.seats])changes.push({id:p.id,delta:leave(t,p.id)});t.enabled=false;
  }else if(input.type==='ABORT')abort(t);else fail('INVALID_CASINO_ACTION');
  if(input.type!=='CONFIGURE')t.version++;
  const plan=writePlan(data,state,{sessionId,requestId:randomUUID(),actor:'ORGANIZER',allowedStatuses:['DRAFT','CASTING','READY','LIVE','PAUSED','FINISHED'],walletChanges:changes,action:`${game}:${input.type}`,now});
  await executor(plan.operation,plan.variables);return {ok:true,revision:plan.revision};
}
export const __casino={COMMAND_QUERY,parse};
