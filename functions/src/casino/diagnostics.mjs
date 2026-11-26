import {createHash} from 'node:crypto';

const code=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{1,79}$/.test(value)?value:null;
const key=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(value)?value:null;
export function casinoCommand(input={}){
  return {game:code(input.game),type:code(input.type??'VIEW'),requestId:key(input.requestId),
    amount:Number.isSafeInteger(input.amount)?input.amount:null,
    selection:typeof input.selection==='string'&&/^(RED|BLACK|EVEN|ODD|LOW|HIGH|DOZEN[123]|COLUMN[123]|NUMBER:([0-9]|[12][0-9]|3[0-6]))$/.test(input.selection)?input.selection:null};
}
export function casinoFailure(input,error,context={}){
  return {event:'CASINO_REJECTED',...casinoCommand(input),errorCode:code(error?.message)??'CASINO_UNEXPECTED_ERROR',
    sessionId:context.sessionId??null,characterExternalId:context.characterExternalId??null};
}
export function rejectionLogId(sessionId,participantId,requestId){
  const hex=createHash('sha256').update(JSON.stringify([sessionId,participantId,requestId])).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
}
// Monetary state only: never copy a token, player name, private cards or deck.
export function casinoBalances(state){
  return Object.fromEntries(Object.entries(state.tables).map(([game,t])=>[game,{
    round:t.round,phase:t.phase,bank:t.bank,enabled:t.enabled,
    seats:t.seats.map(p=>({id:p.id,stack:p.stack,committed:p.committed??0,bets:(p.hands??[]).map(h=>({bet:h.bet,selection:h.selection??null}))})),
    outcome:t.phase==='COMPLETE'?{number:game==='ROULETTE'?t.hand?.number:null,payouts:(t.results??[]).map(r=>({id:r.id,bet:r.bet,back:r.back,net:r.net}))}:null
  }]));
}
