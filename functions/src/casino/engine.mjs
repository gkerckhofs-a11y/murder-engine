import {randomInt} from 'node:crypto';
import {rouletteBet,roulettePayout} from './roulette.mjs';
import {shuffle,rank,blackjackValue,best,compare} from './cards.mjs';

export const GAMES=['BLACKJACK','HOLDEM','ROULETTE'];
const fail=message=>{throw Error(message);};
export function integer(value,min=0,max=100000000){if(!Number.isSafeInteger(value)||value<min||value>max)fail('INVALID_CASINO_AMOUNT');return value;}
export function table(game,config={}){
  if(!GAMES.includes(game))fail('INVALID_CASINO_GAME');
  const minBet=integer(config.minBet??(game==='BLACKJACK'?2:10),1,1000000);
  const maxBet=integer(config.maxBet??200,minBet,1000000);
  if(game==='BLACKJACK'&&(minBet%2||maxBet%2))fail('BLACKJACK_EVEN_BETS_REQUIRED');
  const smallBlind=integer(config.smallBlind??5,1,1000000),bigBlind=integer(config.bigBlind??10,smallBlind*2,1000000);
  return {game,version:0,enabled:config.enabled===true,minBet,maxBet,smallBlind,bigBlind,turnSeconds:integer(config.turnSeconds??45,15,180),bank:game!=='HOLDEM'?integer(config.bank??10000,0):0,bankInitial:game!=='HOLDEM'?integer(config.bank??10000,0):0,seats:[],phase:'BETTING',round:0,button:-1,hand:null,results:[],history:[]};
}
const draw=t=>t.hand.deck.pop()??fail('CASINO_DECK_EMPTY');
const hands=t=>t.seats.flatMap(p=>p.hands??[]);
const seat=(t,id)=>t.seats.find(p=>p.id===id)??fail('CASINO_NOT_SEATED');
const playing=p=>!p.folded;
function event(t,message){t.history=[...t.history.slice(-29),message];}
function deadline(t,now){t.deadline=now+t.turnSeconds*1000;}
function exposure(t){return hands(t).reduce((n,h)=>n+(h.split||h.doubled?h.bet:Math.ceil(h.bet*1.5)),0);}
function requireBank(t,extra){if(t.bank<exposure(t)+extra)fail('CASINO_BANK_INSUFFICIENT');}
export function join(t,id,name,amount){
  if(t.phase!=='BETTING'&&t.phase!=='COMPLETE')fail('CASINO_HAND_IN_PROGRESS');if(t.seats.some(p=>p.id===id))fail('CASINO_ALREADY_SEATED');
  if(t.seats.length>=(t.game==='BLACKJACK'?7:9))fail('CASINO_TABLE_FULL');
  integer(amount,t.game!=='HOLDEM'?t.minBet:t.bigBlind);
  t.seats.push({id,name:String(name).slice(0,100),stack:amount,ready:false,hands:[]});event(t,`${name} rejoint la table.`);
}
export function leave(t,id){
  if(t.phase==='PLAYING')fail('CASINO_HAND_IN_PROGRESS');const p=seat(t,id);if(p.hands?.some(h=>h.bet))fail('CASINO_BET_RESERVED');
  const index=t.seats.indexOf(p);if(index<=t.button)t.button--;
  t.seats=t.seats.filter(s=>s.id!==id);event(t,`${p.name} quitte la table.`);return p.stack;
}
export function next(t){if(t.phase==='PLAYING')fail('CASINO_HAND_IN_PROGRESS');if(t.phase==='COMPLETE'){t.phase='BETTING';t.hand=null;t.actor=null;t.deadline=null;for(const p of t.seats){p.hands=[];p.ready=false;delete p.folded;delete p.cards;}}}
function finishBlackjack(t){
  const dealer=t.hand.dealer;const dealerNatural=dealer.length===2&&blackjackValue(dealer)===21;
  if(!dealerNatural)while(blackjackValue(dealer)<17)dealer.push(draw(t));
  const dealerScore=blackjackValue(dealer);const result=[];
  for(const p of t.seats)for(const h of p.hands??[]){
    const score=blackjackValue(h.cards),natural=!h.split&&h.cards.length===2&&score===21;
    let back=0;if(score<=21){if(dealerNatural)back=natural?h.bet:0;else if(natural)back=h.bet*2.5;else if(dealerScore>21||score>dealerScore)back=h.bet*2;else if(score===dealerScore)back=h.bet;}
    p.stack+=back;t.bank+=h.bet-back;result.push({id:p.id,name:p.name,bet:h.bet,back,net:back-h.bet,cards:h.cards});h.bet=0;
  }
  t.phase='COMPLETE';t.results=result;t.actor=null;t.deadline=null;event(t,'La banque règle les mains.');
}
function advanceBlackjack(t,now){
  for(let i=0;i<t.seats.length;i++){const p=t.seats[i];for(let j=0;j<(p.hands??[]).length;j++){const h=p.hands[j];if(!h.done&&blackjackValue(h.cards)<21){t.actor=p.id;t.handIndex=j;deadline(t,now);return;}h.done=true;}}
  finishBlackjack(t);
}
function startBlackjack(t,now,deck){
  if(!hands(t).length)fail('CASINO_BETS_REQUIRED');t.hand={deck:deck??shuffle(6),dealer:[],before:t.seats.map(p=>({id:p.id,stack:p.stack+(p.hands??[]).reduce((n,h)=>n+h.bet,0)}))};
  t.phase='PLAYING';t.round++;
  for(let card=0;card<2;card++){for(const p of t.seats)for(const h of p.hands??[])h.cards.push(draw(t));t.hand.dealer.push(draw(t));}
  if(blackjackValue(t.hand.dealer)===21)finishBlackjack(t);else advanceBlackjack(t,now);
}
function betBlackjack(t,p,amount){
  if(t.phase!=='BETTING')fail('CASINO_NOT_BETTING');integer(amount,t.minBet,t.maxBet);if(amount%2)fail('BLACKJACK_EVEN_BETS_REQUIRED');
  if(p.hands.length)fail('CASINO_ALREADY_BET');if(p.stack<amount)fail('CASINO_INSUFFICIENT_STACK');requireBank(t,amount*1.5);
  p.stack-=amount;p.hands=[{cards:[],bet:amount,split:false,done:false}];
}
function blackjackAction(t,p,type){
  const h=p.hands[t.handIndex];if(!h||h.done)fail('CASINO_INVALID_HAND');
  if(type==='HIT'){if(h.aceSplit)fail('BLACKJACK_SPLIT_ACES_ONE_CARD');h.cards.push(draw(t));if(blackjackValue(h.cards)>=21)h.done=true;}
  else if(type==='STAND')h.done=true;
  else if(type==='DOUBLE'){
    if(h.cards.length!==2||h.aceSplit||p.stack<h.bet)fail('BLACKJACK_DOUBLE_UNAVAILABLE');
    const old=h.split?h.bet:h.bet*1.5;requireBank(t,h.bet*2-old);p.stack-=h.bet;h.bet*=2;h.doubled=true;h.cards.push(draw(t));h.done=true;
  }else if(type==='SPLIT'){
    if(h.cards.length!==2||rank(h.cards[0])!==rank(h.cards[1])||p.hands.length>=4||p.stack<h.bet||h.aceSplit)fail('BLACKJACK_SPLIT_UNAVAILABLE');
    const old=h.split?h.bet:h.bet*1.5;requireBank(t,h.bet*2-old);p.stack-=h.bet;
    const ace=rank(h.cards[0])===14;const second={cards:[h.cards.pop(),draw(t)],bet:h.bet,split:true,aceSplit:ace,done:ace};
    h.cards.push(draw(t));h.split=true;h.aceSplit=ace;h.done=ace;p.hands.splice(t.handIndex+1,0,second);
  }else fail('INVALID_CASINO_ACTION');
}
function chips(p,amount){const paid=Math.min(p.stack,amount);p.stack-=paid;p.streetBet+=paid;p.committed+=paid;return paid;}
function handPlayers(t){return t.seats.filter(p=>t.hand.ids.includes(p.id));}
function nextIndex(t,index,predicate){for(let n=1;n<=t.seats.length;n++){const i=(index+n+t.seats.length)%t.seats.length;if(predicate(t.seats[i]))return i;}return -1;}
function after(t,id,predicate){return nextIndex(t,t.seats.findIndex(p=>p.id===id),predicate);}
export function distributePots(players,board,buttonOrder){
  const totals=players.map(p=>p.committed);const levels=[...new Set(totals.filter(x=>x>0))].sort((a,b)=>a-b);let last=0;const pots=[];const returns=Object.fromEntries(players.map(p=>[p.id,0]));
  for(const level of levels){const contributors=players.filter(p=>p.committed>=level);const amount=(level-last)*contributors.length;last=level;
    if(contributors.length===1){returns[contributors[0].id]+=amount;pots.push({amount,winners:[contributors[0].id],refund:true});continue;}
    const eligible=contributors.filter(playing);if(!eligible.length)fail('POKER_NO_ELIGIBLE_WINNER');let winners=eligible;
    if(eligible.length>1){let high=[];winners=[];for(const p of eligible){const score=best([...p.cards,...board]);const cmp=compare(score,high);if(cmp>0){high=score;winners=[p];}else if(cmp===0)winners.push(p);}}
    const ordered=buttonOrder.filter(id=>winners.some(p=>p.id===id));const each=Math.floor(amount/winners.length);let odd=amount%winners.length;
    for(const id of ordered)returns[id]+=each+(odd-- >0?1:0);pots.push({amount,winners:ordered});
  }return {returns,pots};
}
function finishPoker(t){
  const ps=handPlayers(t);const survivors=ps.filter(playing);let result;
  t.hand.showdown=survivors.length>1;
  const order=Array.from({length:t.seats.length},(_,n)=>t.seats[(t.button+1+n)%t.seats.length].id);
  if(survivors.length===1){const amount=ps.reduce((n,p)=>n+p.committed,0);result={returns:{[survivors[0].id]:amount},pots:[{amount,winners:[survivors[0].id]}]};}
  else result=distributePots(ps,t.hand.board,order);
  t.results=ps.map(p=>({id:p.id,name:p.name,bet:p.committed,back:result.returns[p.id]??0,net:(result.returns[p.id]??0)-p.committed}));
  for(const p of ps){p.stack+=result.returns[p.id]??0;p.committed=0;p.streetBet=0;p.ready=false;}
  t.hand.pots=result.pots;t.phase='COMPLETE';t.actor=null;t.deadline=null;event(t,'Le pot est distribué.');
}
function boardStreet(t){
  draw(t);const count=t.hand.board.length===0?3:1;for(let n=0;n<count;n++)t.hand.board.push(draw(t));
  t.hand.street=['FLOP','TURN','RIVER'][t.hand.board.length-3];
  t.hand.currentBet=0;t.hand.minRaise=t.bigBlind;
  for(const p of handPlayers(t)){p.streetBet=0;p.acted=false;p.lastActedBet=0;}
}
function advancePoker(t,from,now){
  const ps=handPlayers(t);if(ps.filter(playing).length===1){finishPoker(t);return;}
  const actionable=ps.filter(p=>!p.folded&&p.stack>0);
  if(actionable.length<=1&&actionable.every(p=>p.streetBet>=Math.max(0,...ps.filter(q=>q!==p&&!q.folded).map(q=>q.streetBet)))){
    while(t.hand.board.length<5)boardStreet(t);finishPoker(t);return;
  }
  const pending=p=>t.hand.ids.includes(p.id)&&!p.folded&&p.stack>0&&(!p.acted||p.streetBet<t.hand.currentBet);
  let i=after(t,from,pending);
  if(i<0){if(t.hand.board.length===5){finishPoker(t);return;}boardStreet(t);i=nextIndex(t,t.button,pending);}
  if(i<0)fail('POKER_NO_NEXT_ACTOR');t.actor=t.seats[i].id;deadline(t,now);
}
function startPoker(t,now,deck){
  const ps=t.seats.filter(p=>p.ready&&p.stack>0);if(ps.length<2)fail('POKER_TWO_READY_PLAYERS_REQUIRED');
  t.button=nextIndex(t,t.button,p=>ps.includes(p));
  t.hand={deck:deck??shuffle(),ids:ps.map(p=>p.id),board:[],street:'PREFLOP',currentBet:t.bigBlind,minRaise:t.bigBlind,before:t.seats.map(p=>({id:p.id,stack:p.stack}))};
  t.phase='PLAYING';t.round++;
  for(const p of ps){p.cards=[];p.committed=0;p.streetBet=0;p.folded=false;p.acted=false;p.lastActedBet=0;}
  const sb=ps.length===2?t.button:nextIndex(t,t.button,p=>ps.includes(p));const bb=nextIndex(t,sb,p=>ps.includes(p));
  for(let card=0;card<2;card++){let i=t.button;for(let n=0;n<ps.length;n++){i=nextIndex(t,i,p=>ps.includes(p));t.seats[i].cards.push(draw(t));}}
  chips(t.seats[sb],t.smallBlind);chips(t.seats[bb],t.bigBlind);
  // A short big blind does not reduce the normal opening bet.
  advancePoker(t,t.seats[bb].id,now);
}
function pokerAction(t,p,type,amount){
  const h=t.hand;const owed=h.currentBet-p.streetBet;
  if(type==='FOLD')p.folded=true;
  else if(type==='CHECK'){if(owed>0)fail('POKER_MUST_CALL_OR_FOLD');}
  else if(type==='CALL'){if(owed<=0)fail('POKER_NOTHING_TO_CALL');chips(p,owed);}
  else if(type==='RAISE'){
    integer(amount,h.currentBet+1,p.streetBet+p.stack);
    if(p.acted&&h.currentBet-p.lastActedBet<h.minRaise)fail('POKER_RAISE_NOT_REOPENED');
    const raise=amount-h.currentBet,allIn=amount===p.streetBet+p.stack;
    if(raise<h.minRaise&&!allIn)fail('POKER_RAISE_TOO_SMALL');
    chips(p,amount-p.streetBet);h.currentBet=amount;
    if(raise>=h.minRaise){h.minRaise=raise;for(const other of handPlayers(t))if(other!==p)other.acted=false;}
  }else fail('INVALID_CASINO_ACTION');
  p.acted=true;p.lastActedBet=h.currentBet;
}
export function act(t,id,input,{now=Date.now(),deck}={}){
  const p=seat(t,id),type=input.type;
  if(type==='NEXT'){next(t);return;}
  if(type==='BET'&&t.game==='ROULETTE'){
    if(t.phase!=='BETTING')fail('CASINO_NOT_BETTING');
    const bet=rouletteBet(input.selection,integer(input.amount,t.minBet,t.maxBet));
    if(p.stack<bet.bet)fail('CASINO_INSUFFICIENT_STACK');
    if(p.hands.reduce((n,h)=>n+h.bet,0)+bet.bet>t.maxBet)fail('INVALID_CASINO_AMOUNT');
    const all=[...hands(t),bet],total=all.reduce((n,h)=>n+h.bet,0);
    for(let n=0;n<=36;n++)if(all.reduce((sum,h)=>sum+roulettePayout(h,n),0)>t.bank+total)fail('CASINO_BANK_INSUFFICIENT');
    p.stack-=bet.bet;p.hands.push(bet);return;
  }
  if(type==='BET'){if(t.game!=='BLACKJACK')fail('INVALID_CASINO_ACTION');betBlackjack(t,p,integer(input.amount));return;}
  if(type==='READY'){if(t.game!=='HOLDEM'||t.phase==='PLAYING')fail('CASINO_HAND_IN_PROGRESS');next(t);p.ready=!p.ready;return;}
  if(type==='START'){
    if(t.phase!=='BETTING')fail('CASINO_NOT_BETTING');
    if(t.game==='ROULETTE'){
      if(!hands(t).length)fail('CASINO_BETS_REQUIRED');
      const number=randomInt(37);t.hand={number};t.round++;
      t.results=t.seats.filter(p=>p.hands.length).map(p=>{const bet=p.hands.reduce((s,h)=>s+h.bet,0),back=p.hands.reduce((s,h)=>s+roulettePayout(h,number),0);p.stack+=back;t.bank+=bet-back;for(const h of p.hands)h.bet=0;return {id:p.id,name:p.name,bet,back,net:back-bet};});
      t.phase='COMPLETE';t.actor=null;t.deadline=null;event(t,`La bille s’arrête sur le ${number}.`);
    }else if(t.game==='BLACKJACK')startBlackjack(t,now,deck);else startPoker(t,now,deck);return;
  }
  if(t.phase!=='PLAYING'||t.actor!==id)fail('CASINO_NOT_YOUR_TURN');
  if(t.game==='BLACKJACK'){blackjackAction(t,p,type);advanceBlackjack(t,now);}else{pokerAction(t,p,type,input.amount);advancePoker(t,id,now);}
}
export function tick(t,now=Date.now()){
  if(t.phase==='PLAYING'&&t.deadline<=now){const p=seat(t,t.actor);const type=t.game==='BLACKJACK'?'STAND':p.streetBet<t.hand.currentBet?'FOLD':'CHECK';act(t,p.id,{type},{now});event(t,`${p.name} : délai dépassé.`);return true;}return false;
}
export function abort(t){
  if(t.phase==='PLAYING')for(const before of t.hand.before){const p=t.seats.find(s=>s.id===before.id);if(p)p.stack=before.stack;}
  else if(t.phase==='BETTING'&&t.game!=='HOLDEM')for(const p of t.seats)p.stack+=(p.hands??[]).reduce((n,h)=>n+h.bet,0);
  t.phase='BETTING';t.hand=null;t.actor=null;t.deadline=null;t.results=[];for(const p of t.seats){p.hands=[];p.ready=false;p.committed=0;p.streetBet=0;delete p.cards;delete p.folded;}event(t,'La main est annulée, les mises sont rendues.');
}
export function view(t,id){
  const done=t.phase==='COMPLETE';const own=t.seats.find(p=>p.id===id);
  return {game:t.game,version:t.version??0,enabled:t.enabled,phase:t.phase,round:t.round,minBet:t.minBet,maxBet:t.maxBet,smallBlind:t.smallBlind,bigBlind:t.bigBlind,bank:t.bank,turnSeconds:t.turnSeconds,actor:t.actor??null,handIndex:t.handIndex??0,deadline:t.deadline??null,button:t.button,
    number:done?t.hand?.number??null:null,board:t.hand?.board??[],street:t.hand?.street??null,currentBet:t.hand?.currentBet??0,minRaise:t.hand?.minRaise??t.bigBlind,
    dealer:t.hand?.dealer?.map((c,i)=>done||i===0?c:null)??[],
    seats:t.seats.map(p=>({id:p.id,name:p.name,stack:p.stack,ready:p.ready,folded:!!p.folded,streetBet:p.streetBet??0,committed:p.committed??0,
      cards:p.cards?.map(c=>p.id===id||(done&&t.hand?.showdown&&!p.folded)?c:null)??[],hands:(p.hands??[]).map(h=>({cards:h.cards.map(c=>p.id===id||done?c:null),score:p.id===id||done?blackjackValue(h.cards):null,selection:h.selection??null,bet:h.bet,done:h.done,split:h.split,aceSplit:h.aceSplit}))})),
    mayRaise:!!own&&(!own.acted||(t.hand?.currentBet??0)-(own.lastActedBet??0)>=(t.hand?.minRaise??0)),results:done?t.results:[],history:t.history};
}
