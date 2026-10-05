import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import QrLocationScanner from './QrLocationScanner';
import QrCharacterScanner from './QrCharacterScanner';
import ImmersiveDocument from './ImmersiveDocument';
import { asSkinId, skinClassFor, defaultAccentForSkin } from './skin-registry';

type Portal = any;
type Tab = 'fiche'|'carnet'|'actions'|'sac'|'news';

type PaPrompt = {
  title:string;
  cost:number;
  current:number|null;
  remaining:number|null;
  run:()=>void;
};

async function fetchJson<T>(url:string, init?:RequestInit):Promise<T>{
  const r=await fetch(url,init); const contentType=r.headers.get('content-type')??''; const raw=await r.text(); let data:any=null;
  if(raw&&contentType.includes('application/json')){try{data=JSON.parse(raw)}catch{}}
  if(!r.ok){const message=data?.message??data?.error??((raw&&!raw.trim().startsWith('<'))?raw.slice(0,240):null);throw new Error(message??`Route API indisponible (${r.status}) : ${url}. Contactez l'organisateur.`)}
  if(!data)throw new Error(`Réponse non JSON pour ${url}. La fonction serveur correspondante n'est probablement pas déployée.`);
  return data as T;
}
async function postJson<T=any>(url:string,body:any):Promise<T>{return fetchJson<T>(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}
function niceDate(v?:string|null){if(!v)return 'Date à confirmer';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString('fr-BE',{dateStyle:'full',timeStyle:'short'});}
function niceTime(v?:string|null){if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleTimeString('fr-BE',{hour:'2-digit',minute:'2-digit'});}
function resourceLabel(id:string){return ({RES_PA:'PA',RES_CASH:'Argent',RES_BANK:'Banque',RES_INFLUENCE:'Influence'} as Record<string,string>)[id]??id.replace(/^RES_/,'');}
function normalizeText(v:any){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function isPhysicalClue(clue:any){
  if(clue?.objectExternalId)return true;
  const hay=normalizeText(`${clue?.clueType??''} ${clue?.support??''} ${clue?.presentationMode??''}`);
  return /(document|photo|lettre|letter|telegram|telegr|rapport|journal|plan|carte|papier|contrat|acte)/.test(hay);
}

export default function PlayerPortal({token}:{token:string}){
  useEffect(()=>{if(token)localStorage.setItem('murderEnginePlayerToken',token);},[token]);
  const [portal,setPortal]=useState<Portal|null>(null); const [error,setError]=useState(''); const [loading,setLoading]=useState(true); const [tab,setTab]=useState<Tab>('fiche'); const [busy,setBusy]=useState(false); const [flash,setFlash]=useState('');
  const [introOpen,setIntroOpen]=useState(false);
  const [resultPopup,setResultPopup]=useState<{success:boolean;title:string;body:string}|null>(null);
  async function load(track=true){setError('');try{const r=await fetchJson<{ok:boolean;portal:Portal}>(`/api/player/portal?token=${encodeURIComponent(token)}${track?'':'&refresh=1'}`);setPortal(r.portal);}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setLoading(false);}}
  useEffect(()=>{void load(true);const id=window.setInterval(()=>void load(false),20000);return()=>window.clearInterval(id);},[token]);
  useEffect(()=>{
    if(
      !portal?.session?.id ||
      !portal?.character?.externalId ||
      !portal?.session?.playerSummary
    ) return;

    const key=
      `murderIntroSeen:${portal.session.id}:${portal.character.externalId}`;

    if(localStorage.getItem(key)!=='1')
      setIntroOpen(true);

  },[
    portal?.session?.id,
    portal?.character?.externalId,
    portal?.session?.playerSummary
  ]);

  function closeIntro(){
    if(portal){
      const key=
        `murderIntroSeen:${portal.session.id}:${portal.character.externalId}`;

      localStorage.setItem(key,'1');
    }

    setIntroOpen(false);
  }

  const unread=portal?.unreadNotificationCount??0;
  async function act(fn:()=>Promise<any>,message=''){
    setBusy(true);
    setError('');
    setFlash('');

    try{
      const result=await fn();

      if(message)
        setFlash(message);

      await load(false);

      return result;

    }catch(e){
      setError(e instanceof Error?e.message:String(e));
      return null;

    }finally{
      setBusy(false);
    }
  }
  if(loading&&!portal)return <main className="playerShell"><section className="playerCard"><h1>Murder Engine</h1><p>Chargement de votre fiche…</p></section></main>;
  if(error&&!portal)return <main className="playerShell"><section className="playerCard"><p className="eyebrow">MURDER ENGINE</p><h1>Lien indisponible</h1><p>Ce lien joueur n’est plus actif ou n’est pas valide.</p><small>{error}</small></section></main>;
  if(!portal)return null;
  const c=portal.character; const s=portal.session; const pa=(portal.resources??[]).find((r:any)=>r.resourceExternalId==='RES_PA');
  const presentation=(portal as any).presentation??{};
  const skinId=asSkinId(presentation.skinId);
  const skinClass=skinClassFor(skinId);
  const skinStyle={
    '--skin-accent':presentation.accentColor||defaultAccentForSkin(skinId),
    '--skin-background-image':presentation.background?.source
      ? `url("${presentation.background.source}")`
      : 'none',
  } as any;

  return <main className={`playerShell playerShellV161 ${skinClass}`} style={skinStyle}>
    <header className="playerHero">{presentation.logo?.source&&<img className="playerScenarioLogo" src={presentation.logo.source} alt={presentation.logo.altText||s.scenarioTitle}/>}<p className="eyebrow">{s.scenarioTitle}</p><h1>{c.name}</h1><p className="playerRole">{c.publicRole||'Personnage'}{c.narrativeAge?` · ${c.narrativeAge}`:''}</p><div className="playerSessionMeta"><span>{s.name}</span><span>{niceDate(s.scheduledAt)}</span>{s.venue&&<span>{s.venue}</span>}</div></header>
    <div className="playerStatusBar"><div><small>Vous jouez</small><strong>{c.name}</strong></div><div className="paPill"><small>PA</small><strong>{pa?.currentValue??'—'}{pa?.maxValue!=null?`/${pa.maxValue}`:''}</strong></div></div>
    {s.playerSummary&&<button className="playerIntroButton" onClick={()=>setIntroOpen(true)}>🎬 Relire l’introduction</button>}
    {portal.states?.length>0&&<section className="playerStates">{portal.states.map((st:any)=><span key={st.stateExternalId}><b>{st.name}</b>{st.description?` · ${st.description}`:''}</span>)}</section>}
    {flash&&<p className="playerFlash">{flash}</p>}{error&&<p className="playerError">{error}</p>}
    {tab==='fiche'&&<PlayerSheet portal={portal} busy={busy} onRead={()=>void act(()=>postJson('/api/player/briefing/read',{token}))}/>} 
    {tab==='carnet'&&<PlayerNotebook portal={portal}/>} 
    {tab==='actions'&&<PlayerActions token={token} portal={portal} busy={busy} onRefresh={()=>load(false)} onExecute={async(interactionExternalId,targetExternalId,requestOnly)=>{
      const response=await act(
        ()=>postJson('/api/player/interaction',{
          token,
          interactionExternalId,
          targetExternalId,
          requestOnly
        }),
        requestOnly?'Demande envoyée au MJ ✓':''
      );

      if(response&&!requestOnly){
        const r=response?.result??response;

        setResultPopup({
          success:Boolean(r?.success),
          title:Boolean(r?.success)?'Réussite':'Échec',
          body:Boolean(r?.success)
            ? 'Votre action a réussi. Les effets ont été appliqués à votre personnage.'
            : 'Votre tentative échoue. Aucun effet positif n’est appliqué.'
        });
      }

      return response;
    }} onVote={(voteExternalId,round,selectedOptionExternalIds)=>act(()=>postJson('/api/player/vote',{token,voteExternalId,round,selectedOptionExternalIds}),'Vote enregistré ✓')}/>} 
    {tab==='sac'&&<PlayerBag portal={portal} busy={busy} onGive={(objectExternalId,targetCharacterExternalId)=>act(()=>postJson('/api/player/object',{token,objectExternalId,targetCharacterExternalId}),'Objet transféré ✓')}/>} 
    {tab==='news'&&<PlayerNews portal={portal} busy={busy} onRead={id=>act(()=>postJson('/api/player/notification/read',{token,notificationId:id}),'Notification lue')}/>} 
    {introOpen&&<div className="qrScannerOverlay playerStoryOverlay" role="dialog" aria-modal="true" aria-label="Introduction"><div className="qrScannerPanel playerStoryPanel"><p className="eyebrow">L’HISTOIRE COMMENCE</p><h2>{s.scenarioTitle}</h2><div className="playerStoryText">{s.playerSummary}</div><button className="playerPrimary" onClick={closeIntro}>Entrer dans l’histoire</button></div></div>}

    {resultPopup&&<div className="qrScannerOverlay" role="dialog" aria-modal="true" aria-label="Résultat de l’action"><div className={`qrScannerPanel actionResultPopup ${resultPopup.success?'success':'failure'}`}><p className="eyebrow">RÉSULTAT</p><h2>{resultPopup.success?'✓ Réussite':'✕ Échec'}</h2><p>{resultPopup.body}</p><button className="playerPrimary" onClick={()=>setResultPopup(null)}>Continuer</button></div></div>}

    <footer className="playerFooter">Murder Engine · Ludificateur</footer>
    <nav className="playerBottomNav" aria-label="Navigation joueur">
      <button className={tab==='fiche'?'active':''} onClick={()=>setTab('fiche')}><span>🪪</span><b>Fiche</b></button>
      <button className={tab==='carnet'?'active':''} onClick={()=>setTab('carnet')}><span>📓</span><b>Carnet</b></button>
      <button className={tab==='actions'?'active':''} onClick={()=>setTab('actions')}><span>⚡</span><b>Actions</b>{portal.votes?.length>0&&<em>{portal.votes.length}</em>}</button>
      <button className={tab==='sac'?'active':''} onClick={()=>setTab('sac')}><span>🎒</span><b>Sac</b></button>
      <button className={tab==='news'?'active':''} onClick={()=>setTab('news')}><span>📰</span><b>News</b>{unread>0&&<em>{unread}</em>}</button>
    </nav>
  </main>;
}

function PlayerSheet({portal,busy,onRead}:{portal:Portal;busy:boolean;onRead:()=>void}){
  const c=portal.character;
  return <div className="playerStack">
    {c.motto&&<blockquote className="playerQuote">« {c.motto} »</blockquote>}
    <section className="playerCard"><p className="playerSectionKicker">CE QUE JE SUIS</p><h2>Mon histoire</h2><p>{c.biography}</p>{c.secretIntro&&<div className="playerSecret"><h3>Ce que vous seul savez</h3><p>{c.secretIntro}</p></div>}{c.apparentMotive&&<><h3>Ma position</h3><p>{c.apparentMotive}</p></>}</section>
    <section className="playerCard"><div className="playerSectionHead"><div><p className="playerSectionKicker">CE QUE JE DOIS ACCOMPLIR</p><h2>Mes missions</h2></div><span>{portal.objectives.length}</span></div>{portal.objectives.length===0?<p>Aucune mission structurée.</p>:portal.objectives.map((o:any)=><article className="playerObjective" key={o.externalId}><div><strong>{o.title}</strong><span>{o.status}</span></div><p>{o.description}</p></article>)}</section>
    <section className="playerCard"><p className="playerSectionKicker">MON ALIBI / MA CHRONOLOGIE</p><h2>Ce que j’ai fait le soir du meurtre</h2>{c.personalTimeline?<p>{c.personalTimeline}</p>:<p className="playerMuted">Aucune chronologie particulière n’est renseignée pour ce personnage.</p>}</section>
    {c.interpretationNotes&&<section className="playerCard playerRoleplayCard"><p className="playerSectionKicker">INCARNER MON PERSONNAGE</p><h2>Comment me la jouer</h2><p>{c.interpretationNotes}</p></section>}
    {c.appearanceNotes&&<section className="playerCard playerAppearanceCard"><p className="playerSectionKicker">STYLE & DÉGUISEMENT</p><h2>Mon apparence</h2><p>{c.appearanceNotes}</p></section>}
    <details className="playerCard playerUtilityDetails"><summary>Mon QR personnage</summary><p className="playerHelp">C’est l’unique QR de votre personnage. Pour une interaction DIRECTE, vous le présentez au joueur qui agit sur vous. Le MJ peut conserver une copie du même QR pour les interactions DISCRÈTES.</p><div className="playerCharacterQr"><QRCodeSVG value={`${window.location.origin}/scan/character/${encodeURIComponent(c.externalId)}`} size={180} level="M" includeMargin/><strong>{c.name}</strong><small>{c.publicRole||c.externalId}</small></div></details>
    {!portal.participant.briefingReadAt&&<button className="playerPrimary" disabled={busy} onClick={onRead}>J’ai lu ma fiche</button>}
  </div>;
}

function PlayerNotebook({portal}:{portal:Portal}){
  const rows=useMemo(()=>[...(portal.knowledge??[])].sort((a:any,b:any)=>String(a.fact?.notebookCategory||'').localeCompare(String(b.fact?.notebookCategory||''))),[portal.knowledge]);
  const clueRows=useMemo(()=>{
    const map=new Map<string,any>();
    for(const d of portal.discoveries??[]) map.set(d.clueExternalId,{...d.clue,externalId:d.clueExternalId,discoveredAt:d.discoveredAt,owned:false});
    for(const d of portal.documentEntries??[]){const previous=map.get(d.clueExternalId);map.set(d.clueExternalId,{...(previous??{}),...d,externalId:d.clueExternalId,owned:true});}
    return [...map.values()];
  },[portal.discoveries,portal.documentEntries]);
  return <div className="playerStack">
    <section className="playerCard"><div className="playerSectionHead"><div><p className="playerSectionKicker">CE QUE JE SAIS SUR LES AUTRES</p><h2>Personnes & relations</h2></div><span>{portal.relationships?.length??0}</span></div>{!portal.relationships?.length?<p>Vous n’avez encore aucune relation structurée dans votre carnet.</p>:portal.relationships.map((r:any)=><article className="playerRelation" key={r.externalId}><small>{r.relationType||'Relation'}</small><strong>{r.otherName}</strong>{r.otherPublicRole&&<em>{r.otherPublicRole}</em>}<p>{r.text}</p></article>)}</section>
    <section className="playerCard"><div className="playerSectionHead"><div><p className="playerSectionKicker">MES INFORMATIONS</p><h2>Ce que je sais</h2></div><span>{rows.length}</span></div>{rows.length===0?<p>Aucune information structurée pour le moment.</p>:rows.map((k:any)=><article className="playerKnowledge" key={`${k.factExternalId}-${k.learnedAt}`}><small>{k.fact.notebookCategory||k.sourceType}</small><strong>{k.fact.title}</strong><p>{k.fact.text}</p></article>)}</section>
    <section className="playerCard"><div className="playerSectionHead"><div><p className="playerSectionKicker">CE QUE J’AI DÉCOUVERT</p><h2>Indices & documents</h2></div><span>{clueRows.length}</span></div>{clueRows.length===0?<p>Vous n’avez encore découvert aucun indice.</p>:clueRows.map((d:any)=><article className={`playerClue ${d.immersiveDocument?'immersiveClue':''}`} key={d.externalId}><div className="clueBadges"><small>{d.clueType||'INDICE'}</small>{d.owned&&<small className="ownedBadge">dans votre sac</small>}</div><strong>{d.playerName}</strong><p>{d.playerText}</p>{d.immersiveDocument&&<ImmersiveDocument entry={d} buttonLabel="Revoir le document original" compact/>}</article>)}</section>
  </div>;
}

function isSearchLocationAction(i:any){
  if(String(i?.targetType??'').toUpperCase()!=='LOCATION')return false;
  const hay=normalizeText(`${i?.externalId??''} ${i?.name??''} ${i?.category??''}`);
  return /(fouill|search|inspect|explor|chercher|investig)/.test(hay);
}
function playerCountdown(total:number){const sec=Math.max(0,Math.floor(total));return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;}

function PlayerActions({token,portal,busy,onExecute,onRefresh,onVote}:{token:string;portal:Portal;busy:boolean;onExecute:(id:string,target:string|null,requestOnly:boolean)=>void;onRefresh:()=>Promise<void>;onVote:(id:string,round:number,selected:string[])=>void}){
  const [targets,setTargets]=useState<Record<string,string>>({});
  const [scannerOpen,setScannerOpen]=useState(false);
  const [characterScanner,setCharacterScanner]=useState<{interactionId:string;requestOnly:boolean;scanMode:'DIRECT'|'DISCRET'}|null>(null);
  const [specialScanner,setSpecialScanner]=useState<any|null>(null);
  const [clandestineResult,setClandestineResult]=useState<any|null>(null);
  const [clandestineBusy,setClandestineBusy]=useState(false);
  const [localError,setLocalError]=useState('');
  const [searchCooldown,setSearchCooldown]=useState(Number(portal.searchCooldownRemainingSeconds??0));
  const [paPrompt,setPaPrompt]=useState<PaPrompt|null>(null);
  useEffect(()=>setSearchCooldown(Number(portal.searchCooldownRemainingSeconds??0)),[portal.searchCooldownRemainingSeconds]);
  useEffect(()=>{if(searchCooldown<=0)return;const id=window.setInterval(()=>setSearchCooldown(v=>Math.max(0,v-1)),1000);return()=>window.clearInterval(id);},[searchCooldown>0]);

  function withPaConfirmation(interaction:any,run:()=>void){
    const cost=Number(interaction?.costValue??0); const isPa=String(interaction?.costResourceExternalId??'')==='RES_PA';
    if(cost>0&&isPa){const current=interaction?.currentCostResourceValue==null?null:Number(interaction.currentCostResourceValue);setPaPrompt({title:interaction.name,cost,current,remaining:current==null?null:Math.max(0,current-cost),run});return;}
    run();
  }
  async function attemptClandestine(interaction:any,target:any){
    setSpecialScanner(null);setClandestineBusy(true);setLocalError('');setClandestineResult(null);
    try{const r=await postJson<any>('/api/player/clandestine/attempt',{token,interactionExternalId:interaction.externalId,targetCharacterExternalId:target.characterExternalId});setClandestineResult({...r.result,target});await onRefresh();}
    catch(e){setLocalError(e instanceof Error?e.message:String(e));}finally{setClandestineBusy(false);}
  }
  async function claimSteal(item:any){
    if(!clandestineResult?.grantToken)return;setClandestineBusy(true);setLocalError('');
    try{const r=await postJson<any>('/api/player/clandestine/claim',{token,grantToken:clandestineResult.grantToken,objectExternalId:item.objectExternalId});setClandestineResult({...clandestineResult,claimed:r.result.object,grantToken:null});await onRefresh();}
    catch(e){setLocalError(e instanceof Error?e.message:String(e));}finally{setClandestineBusy(false);}
  }

  const visibleInteractions=(portal.interactions??[]).filter((i:any)=>!isSearchLocationAction(i));
  const searchAbility=(portal.abilities??[]).find((a:any)=>/(fouill|search|investig|explor)/.test(normalizeText(`${a.name} ${a.category}`)));
  return <div className="playerStack">
    <section className="playerCard"><div className="playerSectionHead"><div><p className="playerSectionKicker">CE QUE JE SAIS FAIRE</p><h2>Mes compétences</h2></div><span>{portal.abilities?.length??0}</span></div>{!portal.abilities?.length?<p>Aucune compétence particulière n’est renseignée.</p>:<div className="abilityGrid">{portal.abilities.map((a:any)=><article className="abilityCard" key={a.externalId}><div><strong>{a.name}</strong><span>Niveau {a.level}</span></div>{a.description&&<p>{a.description}</p>}{a.category&&<small>{a.category}</small>}</article>)}</div>}</section>
    <section className="playerCard searchScanCard"><div className="playerSectionHead"><div><p className="playerSectionKicker">ACTION D’ENQUÊTE</p><h2>Fouiller un lieu</h2></div><span>QR</span></div>{searchAbility&&<div className="actionSkillIntro"><strong>{searchAbility.name} · niveau {searchAbility.level}</strong>{searchAbility.description&&<p>{searchAbility.description}</p>}</div>}<p>Scannez le QR présent physiquement dans le lieu. Le moteur vérifiera ensuite le coût en PA, votre compétence et le délai entre deux fouilles.</p>{searchCooldown>0&&<div className="portalSearchCooldown"><span>Prochaine fouille</span><strong>{playerCountdown(searchCooldown)}</strong></div>}<button className="playerPrimary scanLaunchButton" disabled={busy||portal.session?.status!=='LIVE'||searchCooldown>0} onClick={()=>setScannerOpen(true)}>{searchCooldown>0?`Fouille dans ${playerCountdown(searchCooldown)}`:'📷 Scanner le QR du lieu'}</button>{portal.session?.status!=='LIVE'&&<small className="playerHelp">Le scan de fouille sera disponible lorsque la partie sera lancée.</small>}</section>
    {localError&&<p className="playerError">{localError}</p>}
    <section className="playerCard"><div className="playerSectionHead"><div><p className="playerSectionKicker">MES AUTRES ACTIONS</p><h2>Actions disponibles</h2></div><span>{visibleInteractions.length}</span></div>{visibleInteractions.length===0?<p>Aucune autre action n’est disponible pour le moment.</p>:visibleInteractions.map((i:any)=>{
      const specialKind=Boolean(i.clandestineKind); const scanMode=String(i.scanMode??'DIRECT').toUpperCase()==='DISCRET'?'DISCRET':'DIRECT';
      return <article className="playerAction" key={i.externalId}><div className="playerActionTop"><div><strong>{i.name}</strong><small>{i.category} · {i.resolution}{['PLAYER','CHARACTER'].includes(String(i.targetType??'').toUpperCase())?` · ${scanMode}`:''}</small></div>{i.costValue>0&&<span className="costBadge">{i.costValue} {resourceLabel(i.costResourceExternalId)}</span>}</div>{i.ability&&<div className="actionAbilityDescription"><strong>{i.ability.name} · niveau {i.ability.level}</strong>{i.ability.description&&<p>{i.ability.description}</p>}</div>}<div className="playerActionMeta">{i.maxUses!=null&&<span>{i.usesCount}/{i.maxUses} usages</span>}{i.cooldownRemainingSeconds>0&&<span>Cooldown {Math.ceil(i.cooldownRemainingSeconds/60)} min</span>}{i.currentCostResourceValue!=null&&<span>Disponible : {i.currentCostResourceValue} {resourceLabel(i.costResourceExternalId)}</span>}</div>{specialKind?<><p className="scanRequiredNote">{scanMode==='DISCRET'?'Mode DISCRET : scannez le QR unique de la cible depuis la copie chez le MJ.':'Mode DIRECT : demandez à la cible de vous présenter son QR.'} La cible reçoit une notification de l’action sans identité de l’auteur.</p><button className="playerSecondary" disabled={busy||clandestineBusy||!i.directEnabled||i.cooldownRemainingSeconds>0} onClick={()=>setSpecialScanner(i)}>📷 {scanMode==='DISCRET'?'Scanner le QR chez le MJ':'Scanner le QR de la cible'}</button></>:<>{(()=>{
        const requestable=!i.directEnabled&&i.blockedReason==='À demander au MJ'; const characterTarget=['PLAYER','CHARACTER'].includes(String(i.targetType??'').toUpperCase()); const needsTarget=Boolean(i.targets?.length>0); const targetId=targets[i.externalId]||''; const targetInfo=(i.targets??[]).find((t:any)=>t.id===targetId); const disabled=busy||(!i.directEnabled&&!requestable)||(needsTarget&&!targetId)||i.cooldownRemainingSeconds>0;
        return <>{characterTarget&&needsTarget?<div className="characterTargetScan">{targetInfo?<p className="scannedCharacterTarget">Cible scannée : <strong>{targetInfo.label}</strong>{targetInfo.subtitle?` · ${targetInfo.subtitle}`:''} <span className={`scanModeBadge ${scanMode.toLowerCase()}`}>{scanMode}</span></p>:<p className="scanRequiredNote">{scanMode==='DISCRET'?'Scannez le QR unique de la cible depuis la copie chez le MJ.':'Demandez à la cible de présenter son QR et scannez-le directement.'}</p>}<button className="playerSecondary" disabled={busy} onClick={()=>setCharacterScanner({interactionId:i.externalId,requestOnly:requestable,scanMode})}>📷 {targetInfo?'Scanner une autre cible':scanMode==='DISCRET'?'Scanner le QR chez le MJ':'Scanner le QR de la cible'}</button></div>:needsTarget&&<select value={targetId} onChange={e=>setTargets(v=>({...v,[i.externalId]:e.target.value}))}><option value="">Choisir la cible…</option>{i.targets.map((t:any)=><option key={t.id} value={t.id}>{t.label}{t.subtitle?` — ${t.subtitle}`:''}</option>)}</select>}<button className={i.directEnabled?'playerPrimary':'playerSecondary'} disabled={disabled} onClick={()=>{const run=()=>onExecute(i.externalId,targetId||null,requestable);if(requestable)run();else withPaConfirmation(i,run);}}>{i.directEnabled?'Exécuter':requestable?'Demander au MJ':(i.blockedReason||'Indisponible')}</button>{requestable&&Number(i.costValue??0)>0&&<small className="playerHelp">Le coût de {i.costValue} {resourceLabel(i.costResourceExternalId)} sera appliqué si le MJ valide l’action.</small>}</>;
      })()}</>}</article>;})}</section>
    <PlayerVotes portal={portal} busy={busy} onVote={onVote}/>
    {scannerOpen&&<QrLocationScanner token={token} onClose={()=>setScannerOpen(false)}/>} 
    {characterScanner&&<QrCharacterScanner title={characterScanner.scanMode==='DISCRET'?'Scanner la cible discrètement':'Scanner la cible'} mode={characterScanner.scanMode} targets={portal.otherCharacters} onClose={()=>setCharacterScanner(null)} onSelect={(target:any)=>{setTargets(v=>({...v,[characterScanner.interactionId]:target.characterExternalId}));setCharacterScanner(null);}}/>}
    {specialScanner&&<QrCharacterScanner title={String(specialScanner.scanMode??'DIRECT').toUpperCase()==='DISCRET'?'Scanner la cible discrètement':'Scanner la cible'} mode={String(specialScanner.scanMode??'DIRECT').toUpperCase()==='DISCRET'?'DISCRET':'DIRECT'} targets={portal.otherCharacters} onClose={()=>setSpecialScanner(null)} onSelect={(target:any)=>{const interaction=specialScanner;setSpecialScanner(null);withPaConfirmation(interaction,()=>void attemptClandestine(interaction,target));}}/>}
    {paPrompt&&<div className="qrScannerOverlay" role="dialog" aria-modal="true" aria-label="Confirmer la dépense de PA"><div className="qrScannerPanel paConfirmPanel"><p className="eyebrow">CONFIRMATION D’ACTION</p><h2>{paPrompt.title}</h2><p>Voulez-vous dépenser <strong>{paPrompt.cost} PA</strong> pour tenter cette action ?</p>{paPrompt.current!=null&&<div className="paSpendPreview"><span>Avant <strong>{paPrompt.current} PA</strong></span><span>Après <strong>{paPrompt.remaining} PA</strong></span></div>}<div className="giveConfirmActions"><button className="playerSecondary" onClick={()=>setPaPrompt(null)}>Non</button><button className="playerPrimary" onClick={()=>{const run=paPrompt.run;setPaPrompt(null);run();}}>Oui, continuer</button></div></div></div>}
    {clandestineResult&&<div className="qrScannerOverlay" role="dialog" aria-modal="true" aria-label="Résultat action clandestine"><div className="qrScannerPanel clandestineResultPanel"><p className="eyebrow">INTERACTION QR</p><h2>{clandestineResult.success?'Réussite':'Échec'}</h2>{!clandestineResult.success?<p>La tentative échoue. La cible reçoit une notification anonyme indiquant qu’une action a été tentée sur elle.</p>:clandestineResult.claimed?<p>Objet récupéré : <strong>{clandestineResult.claimed.name}</strong>. La victime reçoit une notification sans identité de l’auteur.</p>:<><p>{clandestineResult.kind==='STEAL'?'Choisissez maintenant un seul objet à subtiliser. Ce choix est à usage unique.':'Vous identifiez les objets accessibles sur la cible.'}</p>{clandestineResult.items?.length?<div className="clandestineItemList">{clandestineResult.items.map((o:any)=><article key={o.objectExternalId}><div><strong>{o.name}</strong>{o.description&&<small>{o.description}</small>}</div>{clandestineResult.kind==='STEAL'&&<button className="playerPrimary" disabled={clandestineBusy||!clandestineResult.grantToken} onClick={()=>void claimSteal(o)}>Voler cet objet</button>}</article>)}</div>:<p>Aucun objet accessible n’est trouvé.</p>}</>}<button className="playerSecondary" disabled={clandestineBusy} onClick={()=>setClandestineResult(null)}>Fermer</button></div></div>}
  </div>;
}

function PlayerBag({portal,busy,onGive}:{portal:Portal;busy:boolean;onGive:(objectId:string,targetId:string)=>void}){
  const [scanObject,setScanObject]=useState<any|null>(null); const [pending,setPending]=useState<{object:any;target:any}|null>(null);
  const inventoryMap=new Map((portal.inventory??[]).map((o:any)=>[o.objectExternalId,o]));
  const docObjectIds=new Set((portal.documentEntries??[]).map((d:any)=>d.objectExternalId).filter(Boolean));
  const documentRows=useMemo(()=>{
    const map=new Map<string,any>();
    for(const d of portal.documentEntries??[])map.set(d.clueExternalId,{...d,owned:true,object:inventoryMap.get(d.objectExternalId)??null});
    for(const discovery of portal.discoveries??[]){if(!map.has(discovery.clueExternalId)&&isPhysicalClue(discovery.clue)&&!discovery.clue?.objectExternalId)map.set(discovery.clueExternalId,{...discovery.clue,clueExternalId:discovery.clueExternalId,owned:true,object:null});}
    return [...map.values()];
  },[portal.documentEntries,portal.discoveries,portal.inventory]);
  const objects=(portal.inventory??[]).filter((o:any)=>!docObjectIds.has(o.objectExternalId));
  const money=(portal.resources??[]).filter((r:any)=>r.resourceExternalId!=='RES_PA');
  return <div className="playerStack">
    <section className="playerCard"><div className="playerSectionHead"><div><p className="playerSectionKicker">MES RESSOURCES</p><h2>Argent</h2></div><span>{money.length}</span></div>{money.length===0?<p>Aucune ressource monétaire ou spéciale n’est suivie numériquement.</p>:<div className="bagResourceGrid">{money.map((r:any)=><article key={r.resourceExternalId}><small>{resourceLabel(r.resourceExternalId)}</small><strong>{r.currentValue}{r.maxValue!=null?`/${r.maxValue}`:''}</strong>{r.unit&&<span>{r.unit}</span>}</article>)}</div>}{money.some((r:any)=>r.resourceExternalId==='RES_CASH')&&<p className="playerHelp">Si la partie utilise des billets ou jetons physiques, la monnaie réellement détenue pendant le jeu fait foi.</p>}</section>
    <section className="playerCard"><div className="playerSectionHead"><div><p className="playerSectionKicker">CE QUE JE POSSÈDE ET QUI INFORME</p><h2>Documents & indices physiques</h2></div><span>{documentRows.length}</span></div>{documentRows.length===0?<p>Vous ne possédez actuellement aucun document ou indice physique enregistré.</p>:documentRows.map((d:any)=><article className={`bagDocument ${d.immersiveDocument?'immersiveBagDocument':''}`} key={d.clueExternalId}>{d.immersiveDocument&&<ImmersiveDocument entry={d}/>}<div className="bagDocumentMeta"><small>{d.clueType||'DOCUMENT'}</small><strong>{d.playerName}</strong><p>{d.playerText}</p><em>Également mémorisé dans Carnet</em></div>{d.object?.transferable&&portal.otherCharacters.length>0&&<div className="giveRow giveQrRow"><p className="scanRequiredNote">Ce document est tangible : vous pouvez le donner en scannant le QR du destinataire.</p><button className="playerSecondary" disabled={busy} onClick={()=>setScanObject(d.object)}>📷 Donner ce document</button></div>}</article>)}</section>
    <section className="playerCard"><div className="playerSectionHead"><div><p className="playerSectionKicker">CE QUE JE TRANSPORTE</p><h2>Objets & accessoires</h2></div><span>{objects.length}</span></div>{objects.length===0?<p>Vous ne transportez aucun autre objet enregistré.</p>:objects.map((o:any)=><article className="playerObject" key={o.objectExternalId}><strong>{o.name}</strong><p>{o.identification}</p>{o.charges!=null&&<small>Charges : {o.charges}</small>}{o.transferable&&portal.otherCharacters.length>0&&<div className="giveRow giveQrRow"><p className="scanRequiredNote">Pour donner cet objet, scannez le QR du personnage qui le reçoit.</p><button className="playerSecondary" disabled={busy} onClick={()=>setScanObject(o)}>📷 Scanner le destinataire</button></div>}</article>)}</section>
    {scanObject&&<QrCharacterScanner title={`Donner ${scanObject.name}`} mode="DIRECT" targets={portal.otherCharacters} onClose={()=>setScanObject(null)} onSelect={(target:any)=>{setPending({object:scanObject,target});setScanObject(null);}}/>}
    {pending&&<div className="qrScannerOverlay" role="dialog" aria-modal="true" aria-label="Confirmer le don"><div className="qrScannerPanel giveConfirmPanel"><p className="eyebrow">DON · QR VALIDÉ</p><h2>Donner {pending.object.name} ?</h2><p>Destinataire : <strong>{pending.target.name}</strong>{pending.target.publicRole?` · ${pending.target.publicRole}`:''}</p><div className="giveConfirmActions"><button className="playerSecondary" disabled={busy} onClick={()=>setPending(null)}>Annuler</button><button className="playerPrimary" disabled={busy} onClick={()=>{onGive(pending.object.objectExternalId,pending.target.characterExternalId);setPending(null);}}>Confirmer le don</button></div></div></div>}
  </div>;
}

function PlayerVotes({portal,busy,onVote}:{portal:Portal;busy:boolean;onVote:(id:string,round:number,selected:string[])=>Promise<any>|void}){
  const [choice,setChoice]=useState<Record<string,string>>({});
  const [confirmation,setConfirmation]=useState<{title:string;body:string}|null>(null);

  async function submitVote(v:any){
    const selected=
      choice[v.externalId]
      ||v.selectedOptionExternalIds?.[0];

    if(!selected)return;

    await Promise.resolve(
      onVote(
        v.externalId,
        v.round,
        [selected]
      )
    );

    const option=
      (v.options??[])
        .find((o:any)=>o.externalId===selected);

    const label=
      option?.label
      ??'votre choix';

    const text=
      normalizeText(
        `${v.title??''} ${v.question??''}`
      );

    const accusation=
      /(accus|coupable|meurtr|assassin)/.test(text);

    setConfirmation({
      title:
        accusation
          ? 'Accusation enregistrée'
          : 'Vote enregistré',

      body:
        accusation
          ? `Votre accusation contre ${label} a bien été enregistrée. Le résultat sera révélé au moment prévu par le Maître du Jeu.`
          : `Votre vote pour ${label} a bien été enregistré.`
    });
  }

  return <>
    <section className="playerCard">

      <div className="playerSectionHead">
        <div>
          <p className="playerSectionKicker">DÉCIDER</p>
          <h2>Vote</h2>
        </div>
        <span>{portal.votes.length}</span>
      </div>

      {portal.votes.length===0
        ? <p>Aucun scrutin ne vous concerne actuellement.</p>
        : portal.votes.map((v:any)=>
          <article
            className="playerVote"
            key={`${v.externalId}-${v.round}`}
          >
            <small>
              Tour {v.round}
              {v.secret?' · vote secret':''}
            </small>

            <h3>{v.title}</h3>
            <p>{v.question}</p>

            <div className="voteChoices">
              {v.options.map((o:any)=>
                <label key={o.externalId}>
                  <input
                    type="radio"
                    name={`${v.externalId}-${v.round}`}
                    checked={
                      (
                        choice[v.externalId]
                        ||v.selectedOptionExternalIds?.[0]
                      )===o.externalId
                    }
                    onChange={()=>
                      setChoice(c=>({
                        ...c,
                        [v.externalId]:o.externalId
                      }))
                    }
                  />

                  <span>
                    <strong>{o.label}</strong>
                    {o.description&&<small>{o.description}</small>}
                  </span>
                </label>
              )}
            </div>

            <button
              className="playerPrimary"
              disabled={
                busy
                ||(
                  !choice[v.externalId]
                  &&!v.selectedOptionExternalIds?.length
                )
                ||(
                  v.hasVoted
                  &&!v.modifiable
                )
              }
              onClick={()=>void submitVote(v)}
            >
              {v.hasVoted
                ? (
                    v.modifiable
                      ? 'Modifier mon vote'
                      : 'Vote enregistré ✓'
                  )
                : 'Voter'}
            </button>
          </article>
        )
      }
    </section>

    {confirmation&&
      <div
        className="qrScannerOverlay"
        role="dialog"
        aria-modal="true"
        aria-label={confirmation.title}
      >
        <div className="qrScannerPanel voteConfirmationPopup">
          <p className="eyebrow">VOTE</p>
          <h2>✓ {confirmation.title}</h2>
          <p>{confirmation.body}</p>

          <button
            className="playerPrimary"
            onClick={()=>setConfirmation(null)}
          >
            Continuer
          </button>
        </div>
      </div>
    }
  </>;
}

function PlayerNews({portal,busy,onRead}:{portal:Portal;busy:boolean;onRead:(id:string)=>void}){
  const notifications=portal.notifications??[];
  const org=notifications.filter((n:any)=>['GM','MJ','ORGANIZATION','ORGANISATION','EVENT'].includes(String(n.kind??'').toUpperCase()));
  const happenings=notifications.filter((n:any)=>!org.includes(n));
  const logs=portal.actionLogs??[];
  return <div className="playerStack">
    <section className="playerCard"><div className="playerSectionHead"><div><p className="playerSectionKicker">MESSAGES DE L’ORGANISATION</p><h2>Organisation</h2></div><span>{org.length}</span></div>{org.length===0?<p>Aucun message de l’organisation.</p>:org.map((n:any)=><NewsNotification key={n.id} n={n} busy={busy} onRead={onRead}/>)}</section>
    <section className="playerCard"><div className="playerSectionHead"><div><p className="playerSectionKicker">CE QU’IL SE PASSE</p><h2>Notifications</h2></div><span>{happenings.length}</span></div>{happenings.length===0?<p>Aucune notification de jeu pour le moment.</p>:happenings.map((n:any)=><NewsNotification key={n.id} n={n} busy={busy} onRead={onRead}/>)}</section>
    <section className="playerCard"><div className="playerSectionHead"><div><p className="playerSectionKicker">CE QUE J’AI FAIT</p><h2>Actions réalisées</h2></div><span>{logs.length}</span></div>{logs.length===0?<p>Aucune action mécanique enregistrée pour le moment.</p>:logs.map((l:any)=><article className="newsLog" key={l.id??`${l.actionType}-${l.createdAt}-${l.refExternalId}`}><small>{niceTime(l.createdAt)} · {l.actionType}</small><strong>{actionLogTitle(l)}</strong>{l.note&&<p>{l.note}</p>}</article>)}</section>
    <section className="playerCard rulesCard"><p className="playerSectionKicker">RÈGLES DU JEU</p><h2>Comment jouer</h2>{portal.session?.playerSummary&&<p className="scenarioRuleIntro">{portal.session.playerSummary}</p>}<ul><li>Les discussions, négociations, mensonges et alliances entre joueurs sont libres, sauf indication contraire du scénario.</li><li>Avant une action mécanique payante, Murder Engine vous indique son coût et vous demande confirmation.</li><li>Les QR servent à valider un lieu ou une cible. Respectez le mode DIRECT ou DISCRET indiqué par l’action.</li><li>Après une tentative de fouille, un délai de 10 minutes s’applique avant la suivante.</li><li>Lorsqu’une action nécessite un jugement humain, le MJ reste l’arbitre.</li></ul></section>
  </div>;
}

function NewsNotification({n,busy,onRead}:{n:any;busy:boolean;onRead:(id:string)=>void}){
  return <article className={`playerMessage newsMessage ${n.readAt?'read':'unread'}`}><div><small>{niceTime(n.createdAt)} · {n.kind}</small><strong>{n.title}</strong><p>{n.body}</p></div>{!n.readAt&&<button className="playerSecondary" disabled={busy} onClick={()=>onRead(n.id)}>Lu</button>}</article>;
}
function actionLogTitle(l:any){
  const type=String(l?.actionType??'').toUpperCase();
  if(type==='INTERACTION_EXECUTE')return 'Action exécutée';
  if(type==='PLAYER_INTERACTION_REQUEST')return 'Demande envoyée au MJ';
  if(type==='OBJECT_TRANSFER')return 'Objet transféré';
  if(type==='OBJECT_STOLEN')return 'Objet subtilisé';
  if(type==='CLUE_REVEAL')return 'Indice découvert';
  if(type.includes('VOTE'))return 'Vote enregistré';
  return 'Action de jeu';
}
