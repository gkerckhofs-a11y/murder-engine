import test from 'node:test';
import assert from 'node:assert/strict';
import {shuffle,blackjackValue,best,compare} from '../src/casino/cards.mjs';
import {table,join,leave,act,tick,abort,view,distributePots} from '../src/casino/engine.mjs';
import {writePlan} from '../src/casino/service.mjs';

const deck=(...cards)=>cards.reverse();
function blackjack(bank=1000){const t=table('BLACKJACK',{enabled:true,bank});join(t,'A','Alice',100);return t;}
function total(t){return t.bank+t.seats.reduce((n,p)=>n+p.stack+(t.phase==='PLAYING'&&t.game==='HOLDEM'?p.committed:0)+(t.game==='BLACKJACK'?(p.hands??[]).reduce((n,h)=>n+h.bet,0):0),0);}
test('cards: secure shuffle, ace handling and all poker ranks',()=>{
  assert.equal(new Set(shuffle()).size,52);assert.equal(shuffle(6).length,312);
  assert.equal(blackjackValue(['S14','H14','D9']),21);assert.equal(blackjackValue(['S14','H14','D10','C9']),21);
  const samples=[['S14','S13','S12','S11','S10'],['S9','C9','D9','H9','S2'],['S9','C9','D9','H2','S2'],['S14','S12','S9','S5','S2'],['S14','C5','D4','H3','S2'],['S9','C9','D9','H5','S2'],['S9','C9','D5','H5','S2'],['S9','C9','D6','H5','S2'],['S14','C12','D9','H5','S2']];
  samples.forEach((cards,i)=>assert.equal(best(cards)[0],8-i));
  assert.equal(best(samples[4])[1],5);assert.ok(compare(best(samples[0]),best(samples[1]))>0);
  assert.deepEqual(best(['S14','H14','C14','S13','H13','C13','D2']),[6,14,13]);
});
test('blackjack: natural pays 3:2, dealer natural pushes only a natural',()=>{
  let t=blackjack();act(t,'A',{type:'BET',amount:10});act(t,'A',{type:'START'},{deck:deck('S14','H9','D13','C7','S5')});
  assert.equal(t.phase,'COMPLETE');assert.equal(t.seats[0].stack,115);assert.equal(t.bank,985);assert.equal(total(t),1100);
  t=blackjack();act(t,'A',{type:'BET',amount:10});act(t,'A',{type:'START'},{deck:deck('S14','H14','D13','C13')});
  assert.equal(t.seats[0].stack,100);assert.equal(t.bank,1000);
});
test('blackjack: finite bank, integer payouts and no withdrawal of reserved stakes',()=>{
  const t=blackjack(10);assert.throws(()=>act(t,'A',{type:'BET',amount:10}),/BANK_INSUFFICIENT/);assert.equal(t.seats[0].stack,100);
  assert.throws(()=>act(t,'A',{type:'BET',amount:3}),/EVEN_BETS/);
  act(t,'A',{type:'BET',amount:2});assert.throws(()=>leave(t,'A'),/BET_RESERVED/);abort(t);assert.equal(leave(t,'A'),100);assert.equal(t.bank,10);
});
test('blackjack: double, split, hidden cards, timeout and abort conserve dollars',()=>{
  const t=blackjack();act(t,'A',{type:'BET',amount:10});act(t,'A',{type:'START'},{now:0,deck:deck('S8','H10','D8','C7','S3','C2','S10','D10')});
  assert.deepEqual(view(t,'OUTSIDER').dealer,['H10',null]);assert.deepEqual(view(t,'OUTSIDER').seats[0].hands[0].cards,[null,null]);assert.ok(!JSON.stringify(view(t,'A')).includes('deck'));
  act(t,'A',{type:'SPLIT'},{now:1});assert.equal(t.seats[0].hands.length,2);assert.equal(total(t),1100);
  act(t,'A',{type:'DOUBLE'},{now:2});assert.equal(total(t),1100);tick(t,100000);assert.equal(t.phase,'COMPLETE');assert.equal(total(t),1100);assert.ok(t.bank>=0);
  const other=blackjack();act(other,'A',{type:'BET',amount:10});act(other,'A',{type:'START'},{deck:deck('S9','H10','D7','C8')});abort(other);assert.equal(total(other),1100);assert.equal(other.seats[0].stack,100);
});
test('poker: heads-up positions, checking through all streets, private cards and fold privacy',()=>{
  const t=table('HOLDEM',{enabled:true});join(t,'A','Alice',100);join(t,'B','Bob',100);
  act(t,'A',{type:'READY'});act(t,'B',{type:'READY'});act(t,'A',{type:'START'});
  assert.equal(t.actor,'A');assert.equal(t.seats[0].streetBet,5);assert.equal(t.seats[1].streetBet,10);
  assert.deepEqual(view(t,'A').seats[1].cards,[null,null]);assert.equal(view(t,'A').seats[0].cards.filter(Boolean).length,2);
  act(t,'A',{type:'CALL'});act(t,'B',{type:'CHECK'});assert.equal(t.hand.board.length,3);assert.equal(t.actor,'B');
  for(let i=0;i<6;i++)act(t,t.actor,{type:'CHECK'});assert.equal(t.phase,'COMPLETE');assert.equal(total(t),200);
  act(t,'A',{type:'NEXT'});act(t,'A',{type:'READY'});act(t,'B',{type:'READY'});act(t,'A',{type:'START'});const folded=t.actor;act(t,folded,{type:'FOLD'});
  assert.deepEqual(view(t,folded==='A'?'B':'A').seats.find(p=>p.id===folded).cards,[null,null]);assert.equal(total(t),200);
});
test('poker: side pots, uncalled excess and odd-chip order',()=>{
  const ps=[{id:'A',cards:['S14','H14'],committed:10},{id:'B',cards:['S13','H13'],committed:20},{id:'C',cards:['S12','H12'],committed:30}];
  const r=distributePots(ps,['C2','D3','S7','H8','C9'],['B','C','A']);assert.deepEqual(r.returns,{A:30,B:20,C:10});
  const tie=distributePots([{id:'A',cards:['H2','D3'],committed:1},{id:'B',cards:['H4','D5'],committed:1},{id:'C',cards:['H6','D7'],committed:1,folded:true}],['S10','S11','S12','S13','S14'],['B','C','A']);assert.deepEqual(tie.returns,{A:1,B:2,C:0});
});
test('poker: short all-in does not reopen a raise, all-ins run out automatically',()=>{
  const t=table('HOLDEM',{enabled:true});for(const [id,money]of[['A',100],['B',100],['C',25]]){join(t,id,id,money);act(t,id,{type:'READY'});}act(t,'A',{type:'START'});
  assert.equal(t.actor,'A');act(t,'A',{type:'RAISE',amount:20});act(t,'B',{type:'CALL'});act(t,'C',{type:'RAISE',amount:25});assert.equal(t.actor,'A');assert.equal(view(t,'A').mayRaise,false);
  assert.throws(()=>act(t,'A',{type:'RAISE',amount:40}),/NOT_REOPENED/);act(t,'A',{type:'CALL'});act(t,'B',{type:'CALL'});assert.equal(t.hand.board.length,3);assert.equal(total(t),225);
  abort(t);assert.equal(total(t),225);
  const h=table('HOLDEM',{enabled:true});join(h,'A','A',10);join(h,'B','B',10);act(h,'A',{type:'READY'});act(h,'B',{type:'READY'});act(h,'A',{type:'START'});act(h,'A',{type:'CALL'});assert.equal(h.phase,'COMPLETE');assert.equal(h.hand.board.length,5);assert.equal(total(h),20);
});
test('poker: cross-game actions and turn theft reject without taking chips',()=>{
  const t=table('HOLDEM');join(t,'A','A',100);assert.throws(()=>act(t,'A',{type:'BET',amount:10}),/INVALID/);assert.equal(total(t),100);
  join(t,'B','B',100);act(t,'A',{type:'READY'});act(t,'B',{type:'READY'});act(t,'A',{type:'START'});assert.throws(()=>act(t,'B',{type:'FOLD'}),/NOT_YOUR_TURN/);assert.equal(total(t),200);
});
test('random legal hands conserve money across 150 blackjack and poker rounds',()=>{
  for(const game of ['BLACKJACK','HOLDEM']){
    const t=table(game,{bank:1000000});for(let i=0;i<4;i++)join(t,String(i),String(i),10000);const before=total(t);
    for(let n=0;n<150;n++){
      if(t.phase==='COMPLETE')act(t,t.seats[0].id,{type:'NEXT'});
      for(const p of t.seats)if(p.stack>=10)act(t,p.id,game==='BLACKJACK'?{type:'BET',amount:10}:{type:'READY'});
      act(t,'0',{type:'START'});let count=0;
      while(t.phase==='PLAYING'){
        if(count++>100)throw Error('stuck hand');
        if(game==='BLACKJACK')act(t,t.actor,{type:Math.random()<.5?'HIT':'STAND'});
        else{const p=t.seats.find(p=>p.id===t.actor);act(t,p.id,{type:p.streetBet<t.hand.currentBet?'CALL':'CHECK'});}
        assert.equal(total(t),before);
      }assert.equal(total(t),before);assert.ok(t.bank>=0);
    }
  }
});
test('SQL plan protects wallets, revisions, command replay and participant/session access',()=>{
  const data={sessionCasino:{revision:2},sessionResources:[{characterExternalId:'A',currentValue:100,maxValue:null}]};
  const p=writePlan(data,{tables:{}},{sessionId:'S',requestId:'REQUEST',actor:'A',participantId:'P',allowedStatuses:['LIVE'],walletChanges:[{id:'A',delta:-40}],action:'JOIN',now:0});
  assert.match(p.operation,/@transaction/);assert.match(p.operation,/CASINO_CASH_CHANGED/);assert.match(p.operation,/CASINO_STATE_CHANGED/);assert.match(p.operation,/CASINO_PLAYER_ACCESS_CHANGED/);assert.match(p.operation,/sessionCasinoCommand_insert/);assert.equal(p.variables.after0,60);
  assert.throws(()=>writePlan({sessionResources:[{characterExternalId:'A',currentValue:90,maxValue:100}]},{},{sessionId:'S',actor:'A',requestId:'R',allowedStatuses:['LIVE'],walletChanges:[{id:'A',delta:20}],action:'LEAVE',now:0}),/WALLET_LIMIT/);
});
test('varied no-limit tables finish and conserve all chips through raises, folds and unequal all-ins',()=>{
  let seed=271828;const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
  for(let game=0;game<200;game++){
    const t=table('HOLDEM');const count=2+random(8);
    for(let i=0;i<count;i++){join(t,String(i),String(i),10+random(400));act(t,String(i),{type:'READY'});}
    const before=total(t);act(t,'0',{type:'START'});let steps=0;
    while(t.phase==='PLAYING'){
      assert.ok(steps++<200,'hand must terminate');const p=t.seats.find(p=>p.id===t.actor);const maximum=p.streetBet+p.stack;const minimum=t.hand.currentBet+t.hand.minRaise;
      if(random(6)===0)act(t,p.id,{type:'FOLD'});
      else if(view(t,p.id).mayRaise&&maximum>t.hand.currentBet&&random(3)===0){const amount=maximum<minimum?maximum:minimum+random(maximum-minimum+1);act(t,p.id,{type:'RAISE',amount});}
      else act(t,p.id,{type:p.streetBet<t.hand.currentBet?'CALL':'CHECK'});
      assert.equal(total(t),before);
    }
  }
});
