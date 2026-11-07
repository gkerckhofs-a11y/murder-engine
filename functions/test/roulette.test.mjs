import test from 'node:test';
import assert from 'node:assert/strict';
import {rouletteBet,roulettePayout} from '../src/casino/roulette.mjs';
import {table,join,act,abort,leave,view} from '../src/casino/engine.mjs';
import {__casino} from '../src/casino/service.mjs';
const total=t=>t.bank+t.seats.reduce((s,p)=>s+p.stack+p.hands.reduce((n,h)=>n+h.bet,0),0);
function setup(bank=10000){const t=table('ROULETTE',{bank,minBet:1,maxBet:200});join(t,'A','Alice',1000);join(t,'B','Bob',1000);return t;}
test('roulette: all 37 outcomes and all offered payouts, zero excluded from outside bets',()=>{
  for(let n=0;n<=36;n++){
    for(let chosen=0;chosen<=36;chosen++)assert.equal(roulettePayout(rouletteBet(`NUMBER:${chosen}`,2),n),n===chosen?72:0);
    for(const family of ['DOZEN','COLUMN'])assert.equal([1,2,3].reduce((s,k)=>s+roulettePayout(rouletteBet(family+k,2),n),0),n===0?0:6);
    for(const pair of [['RED','BLACK'],['EVEN','ODD'],['LOW','HIGH']])assert.equal(pair.reduce((s,k)=>s+roulettePayout(rouletteBet(k,2),n),0),n===0?0:4);
  }
  assert.equal(roulettePayout(rouletteBet('RED',2),1),4);assert.equal(roulettePayout(rouletteBet('BLACK',2),2),4);
  assert.equal(roulettePayout(rouletteBet('DOZEN2',2),13),6);assert.equal(roulettePayout(rouletteBet('COLUMN3',2),36),6);
});
test('roulette: malformed selections, cumulative limit and uncovered bets leave balances intact',()=>{
 const t=setup(100);const before=JSON.stringify(t);
 for(const selection of ['NUMBER:37','NUMBER:-1','NUMBER:01','RED;','',null])assert.throws(()=>act(t,'A',{type:'BET',amount:1,selection}),/INVALID_SELECTION/);
 assert.throws(()=>act(t,'A',{type:'BET',amount:10,selection:'NUMBER:0'}),/BANK_INSUFFICIENT/);assert.equal(JSON.stringify(t),before);
 act(t,'A',{type:'BET',amount:100,selection:'RED'});const reserved=JSON.stringify(t);
 assert.throws(()=>act(t,'A',{type:'BET',amount:101,selection:'BLACK'}),/INVALID_CASINO_AMOUNT/);assert.equal(JSON.stringify(t),reserved);
 assert.throws(()=>leave(t,'A'),/BET_RESERVED/);abort(t);assert.equal(leave(t,'A'),1000);
});
test('roulette: 2000 rounds preserve every dollar, expose result and settle once',()=>{
 const t=setup(1000000);const initial=total(t);
 for(let i=0;i<2000;i++){
  for(const p of t.seats)if(p.stack>=2){act(t,p.id,{type:'BET',amount:1,selection:`NUMBER:${i%37}`});act(t,p.id,{type:'BET',amount:1,selection:'RED'});}
  assert.equal(total(t),initial);act(t,'A',{type:'START'});
  assert.equal(total(t),initial);assert.ok(t.bank>=0);assert.ok(t.seats.every(p=>p.stack>=0));assert.ok(view(t,'A').number>=0&&view(t,'A').number<=36);
  const settled=JSON.stringify(t);assert.throws(()=>act(t,'A',{type:'START'}),/NOT_BETTING/);assert.equal(JSON.stringify(t),settled);
  act(t,'A',{type:'NEXT'});assert.equal(view(t,'A').number,null);
 }
});
test('roulette: old persisted sessions gain a disabled table without changing existing balances',()=>{
 const saved={tables:{BLACKJACK:table('BLACKJACK'),HOLDEM:table('HOLDEM')}};saved.tables.BLACKJACK.bank=123;
 const state=__casino.parse({stateJson:JSON.stringify(saved)});assert.equal(state.tables.ROULETTE.enabled,false);assert.deepEqual(state.tables.BLACKJACK,saved.tables.BLACKJACK);
});
