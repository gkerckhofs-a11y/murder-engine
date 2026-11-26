import {useEffect,useState} from 'react';
import {casinoHref,casinoTitles} from './casino-access';

export default function PlayerCasinoLinks({token,sessionId,language}:{token:string;sessionId:string;language?:string}){
  const [tables,setTables]=useState<any[]>([]);
  const en=language==='EN';
  useEffect(()=>{
    let alive=true;setTables([]);
    async function load(){
      try{
        const r=await fetch('/api/player/casino/table?'+new URLSearchParams({token,sessionId,game:'BLACKJACK'}));
        if(!r.ok)return;
        const data=await r.json();
        if(alive)setTables(data.availableTables??[]);
      }catch{}
    }
    void load();const timer=window.setInterval(()=>void load(),20000);
    return()=>{alive=false;window.clearInterval(timer);};
  },[token,sessionId]);
  if(!tables.length)return null;
  return <section className="playerCard playerCasinoLinks" aria-label="Casino">
    <h2>{en?'Games lounge':'Salon de jeux'}</h2>
    <p>{en?'Choose your table. You will see the minimum stake before joining.':'Choisissez votre table. La mise minimale est indiquée avant de prendre place.'}</p>
    <div>{tables.map(t=><a key={t.game} href={casinoHref(t.game,sessionId,token)}>{casinoTitles[t.game]}{!t.enabled?(en?' · Cash out':' · Récupérer ma réserve'):''}</a>)}</div>
  </section>;
}
