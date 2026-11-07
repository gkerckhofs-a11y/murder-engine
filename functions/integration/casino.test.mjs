import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeApp} from 'firebase-admin/app';
import {getDataConnect} from 'firebase-admin/data-connect';
import {organizerCasino,playerCasino,CASINO_QUERY,writePlan,__casino} from '../src/casino/service.mjs';
import {transferPlayerCash,__playerOps} from '../src/player.mjs';
import {__interactionOps} from '../src/interactions.mjs';
import {__liveOps} from '../src/live.mjs';

assert.ok(process.env.DATA_CONNECT_EMULATOR_HOST,'Local SQL Connect emulator required');
assert.equal(process.env.GCLOUD_PROJECT,'demo-murder-engine-votes');
initializeApp({projectId:'demo-murder-engine-votes'});
const dc=getDataConnect({location:'europe-west1',serviceId:'murder-engine'});
async function execute(operation,variables={}){const r=await dc.executeGraphql(operation,{variables});if(r.errors?.length)throw Error(JSON.stringify(r.errors));return r.data;}
async function read(operation,variables={}){const r=await dc.executeGraphqlRead(operation,{variables});if(r.errors?.length)throw Error(JSON.stringify(r.errors));return r.data;}
async function insert(type,field,data){return execute(`mutation Seed($row:${type}_Data!){${field}_insert(data:$row)}`,{row:data});}
async function fixture(){
  const organizationId=randomUUID(),scenarioId=randomUUID(),versionId=randomUUID(),sessionId=randomUUID(),now=new Date().toISOString();
  await insert('Organization','organization',{id:organizationId,name:'Casino integration',slug:organizationId});
  await insert('Scenario','scenario',{id:scenarioId,organizationId,title:'Casino test',slug:scenarioId});
  await insert('ScenarioVersion','scenarioVersion',{id:versionId,scenarioId,sourceScenarioId:scenarioId,versionLabel:'test',templateVersion:'1.4',language:'FR',status:'READY',gmSummary:'Test',playerSummary:'Test',runtimeDataVersion:'0.9'});
  await insert('GameSession','gameSession',{id:sessionId,organizationId,scenarioVersionId:versionId,language:'FR',status:'LIVE',runtimeInitializedAt:now});
  const players=[];
  for(const name of ['A','B']){const id=randomUUID(),token=randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','');
    await insert('SessionParticipant','sessionParticipant',{id,gameSessionId:sessionId,displayName:name,characterExternalId:name,active:true,playerAccessEnabled:true,playerAccessToken:token});
    await insert('SessionResource','sessionResource',{gameSessionId:sessionId,characterExternalId:name,resourceExternalId:'RES_CASH',initialValue:100,currentValue:100});players.push({id,name,token});
  }return {sessionId,players};
}
const key=()=>randomUUID();
test('casino real SQL: money reservations, concurrent actions and replay, access, abort and cash-out',async()=>{
  const {sessionId:s,players:[a,b]}=await fixture();
  await organizerCasino(s,{type:'CONFIGURE',game:'BLACKJACK',revision:-1,config:{enabled:true,bank:1000}});
  let d=await playerCasino(a.token,{sessionId:s,game:'BLACKJACK'});
  const requestId=key();const command={sessionId:s,game:'BLACKJACK',type:'JOIN',amount:60,revision:d.revision,requestId};
  // Repeated requests cannot reserve the same dollars twice, even under real SQL contention.
  const joined=await Promise.allSettled([playerCasino(a.token,command),playerCasino(a.token,command)]);
  assert.ok(joined.some(r=>r.status==='fulfilled'));
  d=await playerCasino(a.token,{sessionId:s,game:'BLACKJACK'});assert.equal(d.wallet,40);assert.equal(d.table.seats[0].stack,60);
  await playerCasino(a.token,command);assert.equal((await playerCasino(a.token,{sessionId:s,game:'BLACKJACK'})).wallet,40);
  await assert.rejects(()=>playerCasino(b.token,command),/OWNER_MISMATCH/);
  await assert.rejects(()=>playerCasino(a.token,{...command,sessionId:randomUUID(),requestId:key()}),/WRONG_SESSION/);
  await assert.rejects(()=>playerCasino(a.token,{...command,game:'HOLDEM',revision:d.revision,requestId:key()}),/DISABLED|ALREADY/);
  // Existing cash transfer uses a fresh balance and cannot spend the money held at table.
  await assert.rejects(()=>transferPlayerCash(a.token,{targetCharacterExternalId:'B',amount:50}),/INSUFFICIENT_CASH/);
  await transferPlayerCash(a.token,{targetCharacterExternalId:'B',amount:30});
  let raw=await read(CASINO_QUERY,{sessionId:s});assert.equal(raw.sessionResources.find(r=>r.characterExternalId==='A').currentValue,10);
  const mutate=async(type,amount)=>{const v=await playerCasino(a.token,{sessionId:s,game:'BLACKJACK'});return playerCasino(a.token,{sessionId:s,game:'BLACKJACK',type,amount,revision:v.revision,requestId:key()});};
  await mutate('BET',10);await mutate('START');
  d=await playerCasino(a.token,{sessionId:s,game:'BLACKJACK'});
  if(d.table.phase==='PLAYING'){
    const other=await playerCasino(b.token,{sessionId:s,game:'BLACKJACK'});assert.equal(other.table.dealer[1],null);assert.deepEqual(other.table.seats[0].hands[0].cards,[null,null]);
    await organizerCasino(s,{game:'BLACKJACK',type:'ABORT',revision:d.revision});
  }
  d=await mutate('LEAVE');assert.equal(d.table.seats.length,0);
  const final=await read(CASINO_QUERY,{sessionId:s});const state=__casino.parse(final.sessionCasino);
  assert.equal(final.sessionResources.reduce((n,r)=>n+r.currentValue,0)+state.tables.BLACKJACK.bank,1200);
  // A revoked player cannot use a QR to re-enter.
  await execute('mutation Disable($id:UUID!){sessionParticipant_update(id:$id,data:{playerAccessEnabled:false})}',{id:a.id});
  await assert.rejects(()=>playerCasino(a.token,{sessionId:s,game:'BLACKJACK'}),/LINK_NOT_FOUND/);
});
test('casino real SQL: stale wallet writers roll back, including an existing transfer',async()=>{
  const {sessionId:s,players:[a]}=await fixture();
  await organizerCasino(s,{type:'CONFIGURE',game:'BLACKJACK',revision:-1,config:{enabled:true,bank:1000}});
  const old=await read(CASINO_QUERY,{sessionId:s});const state=__casino.parse(old.sessionCasino);
  const stale=writePlan(structuredClone(old),state,{sessionId:s,requestId:key(),actor:'A',participantId:a.id,allowedStatuses:['LIVE'],walletChanges:[{id:'A',delta:-90}],action:'TEST',now:Date.now()});
  await transferPlayerCash(a.token,{targetCharacterExternalId:'B',amount:50});
  await assert.rejects(()=>execute(stale.operation,stale.variables),/CASINO_CASH_CHANGED/);
  const now=await read(CASINO_QUERY,{sessionId:s});assert.equal(now.sessionResources.find(r=>r.characterExternalId==='A').currentValue,50);assert.equal(now.sessionCasino.revision,old.sessionCasino.revision);
  const updatedAt=new Date().toISOString();
  const log={gameSessionId:s,actionType:'TEST',createdAt:updatedAt};
  await assert.rejects(()=>execute(__playerOps.TRANSFER_PLAYER_CASH_MUTATION,{sessionId:s,senderCharacterExternalId:'A',targetCharacterExternalId:'B',senderBefore:100,targetBefore:100,senderValue:90,targetValue:110,updatedAt,notification:{gameSessionId:s,characterExternalId:'B',kind:'CASH',title:'Test',body:'Test',createdAt:updatedAt},senderLog:log,targetLog:log}),/CASH_BALANCE_CHANGED/);
  await assert.rejects(()=>execute(__liveOps.UPDATE_SESSION_RESOURCE_MUTATION,{sessionId:s,characterExternalId:'A',resourceExternalId:'RES_CASH',currentValue:100,expectedValue:100,updatedAt}),/RESOURCE_BALANCE_CHANGED/);
  await assert.rejects(()=>execute(__interactionOps.EXECUTE_WITH_COST_MUTATION,{sessionId:s,characterExternalId:'A',resourceExternalId:'RES_CASH',currentValue:90,expectedValue:100,updatedAt,use:{gameSessionId:s,interactionExternalId:'TEST',actorCharacterExternalId:'A',targetType:'NONE',resolution:'AUTO'},log}),/RESOURCE_BALANCE_CHANGED/);
  // Session pause is checked again inside the transaction, after the application-level read.
  const valid=writePlan(structuredClone(now),state,{sessionId:s,requestId:key(),actor:'A',participantId:a.id,allowedStatuses:['LIVE'],walletChanges:[{id:'A',delta:-10}],action:'TEST',now:Date.now()});
  await execute('mutation Pause($id:UUID!){gameSession_update(id:$id,data:{status:"PAUSED"})}',{id:s});
  await assert.rejects(()=>execute(valid.operation,valid.variables),/CASINO_SESSION_STATE_CHANGED/);
});
test('roulette real SQL: duplicate bets/spins settle once, pause and close refund safely',async()=>{
 const {sessionId:s,players:[a,b]}=await fixture();const game='ROULETTE';
 await organizerCasino(s,{type:'CONFIGURE',game,revision:-1,config:{enabled:true,bank:10000,minBet:1,maxBet:100}});
 const get=()=>playerCasino(a.token,{sessionId:s,game});
 const command=async(type,extra={})=>{const d=await get();return {sessionId:s,game,type,revision:d.revision,tableRevision:d.table.version,round:d.table.round,requestId:key(),...extra};};
 await playerCasino(a.token,await command('JOIN',{amount:100}));
 const bet=await command('BET',{amount:10,selection:'NUMBER:0'});
 const results=await Promise.allSettled([playerCasino(a.token,bet),playerCasino(a.token,bet)]);assert.ok(results.some(r=>r.status==='fulfilled'));
 let d=await get();assert.equal(d.table.seats[0].stack,90);assert.equal(d.table.seats[0].hands.length,1);
 const spin=await command('START');await playerCasino(a.token,spin);const settled=await get();await playerCasino(a.token,spin);d=await get();assert.deepEqual(d.table,settled.table);assert.equal(d.table.round,1);
 await assert.rejects(()=>playerCasino(b.token,spin),/OWNER_MISMATCH/);
 await playerCasino(a.token,await command('NEXT'));await playerCasino(a.token,await command('BET',{amount:10,selection:'RED'}));
 await execute('mutation Pause($id:UUID!){gameSession_update(id:$id,data:{status:"PAUSED"})}',{id:s});
 await assert.rejects(async()=>playerCasino(a.token,await command('START')),/NOT_LIVE/);
 d=await get();await organizerCasino(s,{game,type:'CLOSE',revision:d.revision});
 const raw=await read(CASINO_QUERY,{sessionId:s});const t=__casino.parse(raw.sessionCasino).tables.ROULETTE;
 assert.equal(t.seats.length,0);assert.equal(t.enabled,false);assert.equal(raw.sessionResources.reduce((n,r)=>n+r.currentValue,0)+t.bank,10200);
});
