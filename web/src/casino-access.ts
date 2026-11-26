export const casinoTitles:Record<string,string>={BLACKJACK:'Blackjack',HOLDEM:'Texas Hold’em',ROULETTE:'Roulette'};
export function sessionKey(id:string){return id.replaceAll('-','').toLowerCase();}
const storageKey=(id:string)=>`murderEnginePlayerToken:${sessionKey(id)}`;
export function readCasinoAccess(id:string):string {
  try{return localStorage.getItem(storageKey(id))||localStorage.getItem('murderEnginePlayerToken')||'';}catch{return '';}
}
// Store only links that the server has associated with this session.
export function rememberPlayerAccess(id:string,token:string){
  if(!id||!token)return;
  try{localStorage.setItem(storageKey(id),token);localStorage.setItem('murderEnginePlayerToken',token);}catch{}
}
export function casinoHref(game:string,sessionId:string,token:string){
  return '/?'+new URLSearchParams({casino:game,casinoSession:sessionId,player:token}).toString();
}
function trusted(url:URL,origin:string){
  return url.origin===origin||['https://murder-engine-ludificateur.web.app','https://murder-engine-ludificateur.firebaseapp.com'].includes(url.origin);
}
export function casinoFromQr(text:string,origin:string):{game:string;sessionId:string}|null {
  try{
    const url=new URL(text.trim(),origin),game=url.searchParams.get('casino')||'',sessionId=url.searchParams.get('casinoSession')||'';
    if(!trusted(url,origin)||url.pathname!=='/'||!casinoTitles[game]||!/^([a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.test(sessionId))return null;
    return {game,sessionId};
  }catch{return null;}
}
export function personalToken(text:string,origin:string):string|null {
  try{
    const url=new URL(text.trim(),origin),token=url.searchParams.get('player')||'';
    return trusted(url,origin)&&url.pathname==='/'&&/^[A-Za-z0-9_-]{32,160}$/.test(token)?token:null;
  }catch{return null;}
}
export function locationFromQr(text:string,origin:string):string|null {
  const raw=text.trim();
  try{const url=new URL(raw,origin),match=url.pathname.match(/^\/scan\/([^/]+)\/?$/);
    if(trusted(url,origin)&&match&&match[1]!=='character')return decodeURIComponent(match[1]);
  }catch{}
  return /^[A-Za-z0-9_.:-]{1,120}$/.test(raw)?raw:null;
}
export function initialCasinoReserve(wallet:number,minimum:number){return Math.min(Math.max(100,minimum),Math.max(0,wallet));}
