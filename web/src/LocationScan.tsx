import { useEffect, useState } from 'react';
import { asSkinId, skinClassFor, defaultAccentForSkin } from './skin-registry';

type LocationAction = {
  externalId:string; name:string; category:string; resolution:string; costResourceExternalId?:string|null; costValue?:number|null;
  currentCostResourceValue?:number|null; diceCount?:number|null; diceSides?:number|null; difficulty?:number|null;
  ability?:{name:string;level:number}|null; available:boolean; blockedReason?:string|null; systemFallback?:boolean; searchCooldownRemainingSeconds?:number|null;
};
type LocationPayload = {
  session:{id:string;name?:string|null;status:string;scenarioTitle:string}; character:{externalId:string;name:string};
  location:{externalId:string;name:string;description:string}; actions:LocationAction[]; rewardsRemaining:number; searchCooldownRemainingSeconds:number;
  forbidden:boolean; empty:boolean;
};
type ActionResult = {result:{interactionName:string;success:boolean;resolution:string;actorRoll?:{rolls:number[];sum:number}|null;actorTotal?:number|null;targetTotal?:number|null;cost?:{resourceExternalId:string;value:number;remaining:number}|null};reward:{kind:string;clue?:{name:string;text:string;clueType:string}|null;object?:{name:string;description?:string|null}|null};location:{name:string}};

async function fetchJson<T>(url:string,init?:RequestInit):Promise<T>{
  const r=await fetch(url,init);const ct=r.headers.get('content-type')??'';const raw=await r.text();let data:any=null;
  if(raw&&ct.includes('application/json')){try{data=JSON.parse(raw)}catch{}}
  if(!r.ok)throw new Error(data?.message??data?.error??`Erreur ${r.status}`);
  if(!data)throw new Error('Réponse serveur invalide.');return data as T;
}
const postJson=<T,>(url:string,body:any)=>fetchJson<T>(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
function resourceLabel(id?:string|null){return id==='RES_PA'?'PA':String(id??'').replace(/^RES_/,'')||'ressource';}
function formatCountdown(total:number){const s=Math.max(0,Math.floor(total));const m=Math.floor(s/60);return `${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}

export default function LocationScan({locationExternalId}:{locationExternalId:string}){
  const params=new URLSearchParams(window.location.search);const queryToken=params.get('player');
  const [token,setToken]=useState(()=>queryToken||localStorage.getItem('murderEnginePlayerToken')||'');
  const [data,setData]=useState<LocationPayload|null>(null);const [loading,setLoading]=useState(Boolean(token));const [busy,setBusy]=useState('');const [error,setError]=useState('');const [last,setLast]=useState<ActionResult|null>(null);const [cooldown,setCooldown]=useState(0);const [pendingAction,setPendingAction]=useState<LocationAction|null>(null);
  useEffect(()=>{if(queryToken){localStorage.setItem('murderEnginePlayerToken',queryToken);setToken(queryToken)}},[queryToken]);
  async function load(){if(!token)return;setLoading(true);setError('');try{const r=await fetchJson<{ok:boolean;location:LocationPayload}>(`/api/player/location?token=${encodeURIComponent(token)}&locationExternalId=${encodeURIComponent(locationExternalId)}`);setData(r.location);setCooldown(Number(r.location.searchCooldownRemainingSeconds??0));}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setLoading(false)}}
  useEffect(()=>{void load()},[token,locationExternalId]);
  useEffect(()=>{if(cooldown<=0)return;const id=window.setInterval(()=>setCooldown(v=>{const next=Math.max(0,v-1);if(next===0)window.setTimeout(()=>void load(),50);return next;}),1000);return()=>window.clearInterval(id);},[cooldown>0,token,locationExternalId]);
  async function execute(action:LocationAction){setBusy(action.externalId);setError('');setLast(null);try{const r=await postJson<{ok:boolean;result:ActionResult}>('/api/player/location/action',{token,locationExternalId,interactionExternalId:action.externalId});setLast(r.result);await load();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy('')}}
  if(!token)return <main className="playerShell scanShell"><section className="playerCard scanIntro"><p className="eyebrow">MURDER ENGINE · QR</p><h1>Identité joueur requise</h1><p>Ouvre d’abord ton lien personnel Murder Engine sur ce téléphone. Ensuite, les QR des lieux fonctionneront automatiquement.</p></section></main>;
  if(loading&&!data)return <main className="playerShell scanShell"><section className="playerCard">Lecture du lieu…</section></main>;
  if(error&&!data)return <main className="playerShell scanShell"><section className="playerCard"><p className="eyebrow">QR · LIEU</p><h1>Accès impossible</h1><p className="playerError">{error}</p><a className="playerSecondary scanBack" href={`/?player=${encodeURIComponent(token)}`}>Retour à ma fiche</a></section></main>;
  if(!data)return null;

  const presentation=(data as any).presentation??{};
  const skinId=asSkinId(presentation.skinId);
  const skinClass=skinClassFor(skinId);
  const skinStyle={
    '--skin-accent':presentation.accentColor||defaultAccentForSkin(skinId),
    '--skin-background-image':presentation.background?.source
      ? `url("${presentation.background.source}")`
      : 'none',
  } as any;

  return <main className={`playerShell scanShell ${skinClass}`} style={skinStyle}>
    <header className="playerHero scanHero"><div>{presentation.logo?.source&&<img className="playerScenarioLogo playerScenarioLogoScan" src={presentation.logo.source} alt={presentation.logo.altText||data.session.scenarioTitle}/>}<p className="eyebrow">{data.session.scenarioTitle}</p><h1>{data.location.name}</h1><p>{data.location.description}</p></div><div className="playerCharacterBadge"><span>Vous jouez</span><strong>{data.character.name}</strong></div></header>
    {error&&<p className="playerError">{error}</p>}
    {data.forbidden&&<section className="playerCard locationBlockedCard"><p className="eyebrow">FOUILLE IMPOSSIBLE</p><h2>C’est votre propre espace</h2><p>Vous connaissez déjà trop bien cet endroit pour pouvoir le fouiller. Cherchez des indices ailleurs.</p></section>}

    {data.empty&&<section className="playerCard locationEmptyCard"><p className="eyebrow">LIEU ÉPUISÉ</p><h2>Cette pièce est vide</h2><p>Tout ce qui pouvait être emporté a déjà été découvert. Essayez un autre endroit.</p></section>}


    {last&&<section className={`playerCard scanResult ${last.result.success?'success':'failure'}`}><p className="eyebrow">RÉSULTAT</p><h2>{last.result.success?'Réussite':'Échec'}</h2>{last.result.actorRoll&&<p className="diceResult">Jet : {last.result.actorRoll.rolls.join(' + ')}{last.result.actorTotal!=null?` → total ${last.result.actorTotal}`:''}{last.result.targetTotal!=null?` / difficulté ${last.result.targetTotal}`:''}</p>}{last.reward?.clue&&<div className="scanReward"><small className={`discoveryModeBadge ${last.reward.clue.mode==='TAKEABLE'?'takeable':'persistent'}`}>{last.reward.clue.mode==='TAKEABLE'?'📦 Élément récupérable':'👁 Information persistante'}</small><strong>{last.reward.clue.name}</strong><p>{last.reward.clue.text}</p>{last.reward.clue.mode==='PERSISTENT'&&<em>Cette information reste accessible aux autres joueurs.</em>}</div>}{last.reward?.object&&<div className="scanReward objectReward"><strong>Objet découvert : {last.reward.object.name}</strong>{last.reward.object.description&&<p>{last.reward.object.description}</p>}{last.reward.object.logisticsCode&&<div className="physicalPickupCallout"><span>OBJET PHYSIQUE</span><strong>À récupérer auprès du Maître du Jeu</strong><p>Présentez-vous au MJ et donnez-lui simplement ce code :</p><b>{last.reward.object.logisticsCode}</b></div>}</div>}{last.result.success&&last.reward?.kind==='NONE'&&<p>Tu ne trouves rien de nouveau ici.</p>}{last.result.cost&&<small>Coût : {last.result.cost.value} {resourceLabel(last.result.cost.resourceExternalId)} · reste {last.result.cost.remaining}</small>}</section>}
    {cooldown>0&&<section className="playerCard searchCooldownCard"><p className="eyebrow">PROCHAINE FOUILLE</p><div className="searchCountdown">{formatCountdown(cooldown)}</div><p>Profite de ce temps pour enquêter, parler aux autres joueurs ou utiliser tes autres actions. Aucun PA n’est consommé pendant l’attente.</p></section>}
    <section className="playerCard"><div className="playerSectionHead"><h2>Actions disponibles</h2><span>{data.actions.length}</span></div>{data.actions.length===0?<p>Aucune action autonome n’est disponible ici pour le moment.</p>:data.actions.map(a=><article className="scanAction" key={a.externalId}><div className="playerActionTop"><div><strong>{a.name}</strong><small>{a.systemFallback?'Action standard':`${a.category} · ${a.resolution}`}</small></div>{Number(a.costValue??0)>0&&<span className="costBadge">{a.costValue} {resourceLabel(a.costResourceExternalId)}</span>}</div>{a.ability&&<p className="playerAbility">{a.ability.name} niv. {a.ability.level}</p>}{a.diceCount&&a.diceSides?<p className="scanDice">Jet : {a.diceCount}D{a.diceSides}{a.difficulty!=null?` · difficulté ${a.difficulty}`:''}</p>:null}<button className="playerPrimary" disabled={busy!==''||!a.available||Boolean(a.searchCooldownRemainingSeconds&&cooldown>0)} onClick={()=>{if(Number(a.costValue??0)>0&&a.costResourceExternalId==='RES_PA')setPendingAction(a);else void execute(a);}}>{busy===a.externalId?'Résolution…':a.searchCooldownRemainingSeconds&&cooldown>0?`Fouiller dans ${formatCountdown(cooldown)}`:a.available?a.name:(a.blockedReason||'Indisponible')}</button></article>)}</section>
    {pendingAction&&<div className="qrScannerOverlay" role="dialog" aria-modal="true" aria-label="Confirmer la dépense de PA"><div className="qrScannerPanel paConfirmPanel"><p className="eyebrow">CONFIRMATION D’ACTION</p><h2>{pendingAction.name}</h2><p>Voulez-vous dépenser <strong>{pendingAction.costValue} PA</strong> pour tenter cette action ?</p>{pendingAction.currentCostResourceValue!=null&&<div className="paSpendPreview"><span>Avant <strong>{pendingAction.currentCostResourceValue} PA</strong></span><span>Après <strong>{Math.max(0,Number(pendingAction.currentCostResourceValue)-Number(pendingAction.costValue??0))} PA</strong></span></div>}<div className="giveConfirmActions"><button className="playerSecondary" onClick={()=>setPendingAction(null)}>Non</button><button className="playerPrimary" onClick={()=>{const action=pendingAction;setPendingAction(null);void execute(action);}}>Oui, continuer</button></div></div></div>}
    <a className="playerSecondary scanBack" href={`/?player=${encodeURIComponent(token)}`}>← Retour à ma fiche</a>
    <footer className="playerFooter">Murder Engine · Ludificateur</footer>
  </main>;
}
