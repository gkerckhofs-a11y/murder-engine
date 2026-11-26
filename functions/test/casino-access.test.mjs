import test from 'node:test';
import assert from 'node:assert/strict';
import {playerCasino,organizerCasino} from '../src/casino/service.mjs';
import {table} from '../src/casino/engine.mjs';
import {casinoFailure} from '../src/casino/diagnostics.mjs';
const sessionId='11111111-1111-4111-8111-111111111111',token='a'.repeat(64);
function fixture(){
 const data={gameSession:{id:sessionId,name:'Audit test',status:'LIVE',runtimeInitializedAt:'2026-11-14T21:00:00Z'},sessionCasino:{revision:0,stateJson:JSON.stringify({tables:Object.fromEntries(['BLACKJACK','HOLDEM','ROULETTE'].map(g=>[g,table(g,{enabled:true,bank:10000})]))})},sessionResources:[{characterExternalId:'P04',currentValue:700,maxValue:null}]};
 const logs=[],rejections=new Map(),commands=new Map();
 const reader=async(q,v)=>q.includes('PlayerAccessByToken')?{sessionParticipants:v.token===token?[{id:'22222222-2222-4222-8222-222222222222',active:true,playerAccessEnabled:true,characterExternalId:'P04',characterDisplayName:'François Delorme',gameSession:data.gameSession}]:[]}:q.includes('CasinoCommand')?{sessionCasinoCommand:commands.get(v.requestId)??null}:structuredClone(data);
 const executor=async(q,v)=>{
   if(q.includes('CasinoRejection')){if(rejections.has(v.data.id))throw Error('duplicate key');rejections.set(v.data.id,v.data);return;}
   logs.push(v.log);data.sessionCasino={revision:data.sessionCasino.revision+1,stateJson:v.stateJson};
   for(let i=0;v['char'+i];i++)data.sessionResources.find(r=>r.characterExternalId===v['char'+i]).currentValue=v['after'+i];
   commands.set(v.requestId,{actor:v.actor});
 };
 let request=0;const deps={reader,executor};
 const act=async(type,game='ROULETTE',extra={})=>{const d=await playerCasino(token,{sessionId,game},deps);return playerCasino(token,{sessionId,game,type,requestId:'test_request_'+String(++request).padStart(8,'0'),revision:d.revision,tableRevision:d.table.version,round:d.table.round,...extra},deps);};
 return {data,logs,rejections,deps,act};
}
test('François can join each table with 700 dollars; reads expose only enabled tables and verified identity',async()=>{
 for(const game of ['BLACKJACK','HOLDEM','ROULETTE']){
  const f=fixture();let d=await playerCasino(token,{sessionId,game},f.deps);
  assert.equal(d.characterName,'François Delorme');assert.equal(d.sessionName,'Audit test');assert.equal(d.availableTables.length,3);assert.equal(f.logs.length,0);
  d=await f.act('JOIN',game,{amount:100});assert.equal(d.wallet,600);assert.equal(d.table.seats[0].stack,100);
 }
});
test('refused authenticated actions are deduplicated and never change money; polling/invalid links do not write',async()=>{
 const f=fixture(),command={sessionId,game:'ROULETTE',type:'JOIN',requestId:'test_refusal_00000001',round:0,amount:701,token};
 for(let i=0;i<2;i++)await assert.rejects(()=>playerCasino(token,command,f.deps),/INSUFFICIENT_CASH/);
 assert.equal(f.rejections.size,1);assert.equal(f.data.sessionResources[0].currentValue,700);assert.equal(f.logs.length,0);
 const text=JSON.stringify([...f.rejections.values()]);assert.ok(!text.includes(token));assert.match(text,/CASINO_INSUFFICIENT_CASH/);
 await assert.rejects(()=>playerCasino('b'.repeat(64),command,f.deps),/PLAYER_LINK_NOT_FOUND/);
 await assert.rejects(()=>playerCasino(token,{...command,type:'REFRESH',sessionId:'33333333-3333-4333-8333-333333333333'},f.deps),/WRONG_SESSION/);
 assert.equal(f.rejections.size,1);
});
test('an audit write failure never hides the original rejection',async()=>{
 const f=fixture();await assert.rejects(()=>playerCasino(token,{sessionId,game:'ROULETTE',type:'JOIN',requestId:'test_refusal_00000001',round:0,amount:701},{...f.deps,executor:async()=>{throw Error('audit unavailable');}}),/CASINO_INSUFFICIENT_CASH/);
});
test('journal keeps bets, outcomes and refunds without tokens or hidden cards',async()=>{
 const f=fixture();await f.act('JOIN','ROULETTE',{amount:100});await f.act('BET','ROULETTE',{amount:10,selection:'RED'});await f.act('START');
 const bet=JSON.parse(f.logs.find(l=>l.refExternalId==='ROULETTE:BET').note).audit;
 assert.equal(bet.command.amount,10);assert.equal(bet.command.selection,'RED');
 const spin=JSON.parse(f.logs.at(-1).note).audit;assert.ok(spin.after.ROULETTE.outcome.number>=0);assert.equal(spin.after.ROULETTE.outcome.payouts[0].bet,10);
 await f.act('NEXT');await f.act('BET','ROULETTE',{amount:10,selection:'BLACK'});
 await organizerCasino(sessionId,{game:'ROULETTE',type:'CLOSE',revision:f.data.sessionCasino.revision},f.deps);
 assert.equal(JSON.parse(f.data.sessionCasino.stateJson).tables.ROULETTE.seats.length,0);
 assert.equal(f.data.sessionResources[0].currentValue+JSON.parse(f.data.sessionCasino.stateJson).tables.ROULETTE.bank,10700);
 const all=JSON.stringify(f.logs);assert.ok(!all.includes(token));assert.ok(!all.includes('"cards"'));assert.ok(!all.includes('"deck"'));
 const diagnostic=casinoFailure({token,game:'ROULETTE',type:'JOIN',selection:token},Error('URL with token '+token));
 assert.ok(!JSON.stringify(diagnostic).includes(token));assert.equal(diagnostic.errorCode,'CASINO_UNEXPECTED_ERROR');
});
