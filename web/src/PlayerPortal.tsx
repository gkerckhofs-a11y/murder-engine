import { useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import QrLocationScanner from './QrLocationScanner';
import LocationScan from './LocationScan';
import QrCharacterScanner from './QrCharacterScanner';
import ImmersiveDocument from './ImmersiveDocument';
import NarrativeText from './NarrativeText';
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
  const r=await fetch(url,init);
  const contentType=r.headers.get('content-type')??'';
  const raw=await r.text();
  let data:any=null;
  if(raw&&contentType.includes('application/json')){try{data=JSON.parse(raw)}catch{}}
  const english=localStorage.getItem('murderEnginePlayerLanguage')==='EN';
  if(!r.ok){
    const message=data?.message??data?.error??((raw&&!raw.trim().startsWith('<'))?raw.slice(0,240):null);
    throw new Error(
      message??
      (english
        ? `API route unavailable (${r.status}): ${url}. Contact the organizer.`
        : `Route API indisponible (${r.status}) : ${url}. Contactez l'organisateur.`)
    );
  }
  if(!data)throw new Error(
    english
      ? `Non-JSON response received for ${url}. The corresponding server function is probably not deployed.`
      : `Réponse non JSON pour ${url}. La fonction serveur correspondante n'est probablement pas déployée.`
  );
  return data as T;
}
async function postJson<T=any>(url:string,body:any):Promise<T>{return fetchJson<T>(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}
function niceDate(v?:string|null,language='FR'){if(!v)return String(language).toUpperCase()==='EN'?'Date to be confirmed':'Date à confirmer';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleString(String(language).toUpperCase()==='EN'?'en-GB':'fr-BE',{dateStyle:'full',timeStyle:'short'});}
function niceTime(v?:string|null,language='FR'){if(!v)return '';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleTimeString(String(language).toUpperCase()==='EN'?'en-GB':'fr-BE',{hour:'2-digit',minute:'2-digit'});}
function isEnglish(portal:any){return String(portal?.session?.language??'FR').trim().toUpperCase()==='EN';}
function tr(portal:any,fr:string,en:string){return isEnglish(portal)?en:fr;}
function resourceLabel(id:string,portal?:any){return (isEnglish(portal)?{RES_PA:'AP',RES_CASH:'Cash',RES_BANK:'Bank',RES_INFLUENCE:'Influence'}:{RES_PA:'PA',RES_CASH:'Argent',RES_BANK:'Banque',RES_INFLUENCE:'Influence'} as Record<string,string>)[id]??id.replace(/^RES_/,'');}
function normalizeText(v:any){return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
function isPhysicalClue(clue:any){
  if(clue?.objectExternalId)return true;
  const hay=normalizeText(`${clue?.clueType??''} ${clue?.support??''} ${clue?.presentationMode??''}`);
  return /(document|photo|lettre|letter|telegram|telegr|rapport|journal|plan|carte|papier|contrat|acte)/.test(hay);
}

function objectVisualGlyph(code?:string|null){
  return ({
    KEY:'🔑',
    LETTER:'✉️',
    PHOTO:'🖼️',
    RING:'💍',
    JEWEL:'💎',
    WATCH:'⌚',
    VIAL:'🧪',
    BOTTLE:'🍾',
    KNIFE:'🗡️',
    GUN:'🔫',
    MAP:'🗺️',
    NOTEBOOK:'📓',
    MONEY:'💰',
    BADGE:'🎖️',
    BOX:'🧰',
    OBJECT:'🎒',
  } as Record<string,string>)[String(code??'OBJECT')]??'🎒';
}

export default function PlayerPortal({token}:{token:string}){
  useEffect(()=>{if(token)localStorage.setItem('murderEnginePlayerToken',token);},[token]);
  const [portal,setPortal]=useState<Portal|null>(null); const [error,setError]=useState(''); const [loading,setLoading]=useState(true); const [tab,setTab]=useState<Tab>('fiche'); const [busy,setBusy]=useState(false); const [flash,setFlash]=useState('');
  const [introOpen,setIntroOpen]=useState(false);
  const [resultPopup,setResultPopup]=useState<{success:boolean;title:string;body:string}|null>(null);
  async function load(track=true){
    setError('');
    try{
      const r=await fetchJson<{ok:boolean;portal:Portal}>(`/api/player/portal?token=${encodeURIComponent(token)}${track?'':'&refresh=1'}`);
      setPortal(r.portal);
      const language=String(r.portal?.session?.language??'FR').trim().toUpperCase()==='EN'?'EN':'FR';
      localStorage.setItem('murderEnginePlayerLanguage',language);
    }catch(e){
      setError(e instanceof Error?e.message:String(e));
    }finally{
      setLoading(false);
    }
  }
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
  if(loading&&!portal)return <main className="playerShell"><section className="playerCard"><h1>Murder Engine</h1><p>Loading your character sheet…</p></section></main>;
  if(error&&!portal)return <main className="playerShell"><section className="playerCard"><p className="eyebrow">MURDER ENGINE</p><h1>Link unavailable</h1><p>This player link is no longer active or valid.</p><small>{error}</small></section></main>;
  if(!portal)return null;
  const printMode=new URLSearchParams(window.location.search).get('print');
  if(printMode==='sheet')return <PlayerPrintableSheet portal={portal}/>;

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
    <header className="playerHero">{presentation.logo?.source&&<img className="playerScenarioLogo" src={presentation.logo.source} alt={presentation.logo.altText||s.scenarioTitle}/>}<p className="eyebrow">{s.scenarioTitle}</p><h1>{c.name}</h1><p className="playerRole">{c.publicRole||tr(portal,'Personnage','Character')}{c.narrativeAge?` · ${c.narrativeAge}`:''}</p><div className="playerSessionMeta"><span>{s.name}</span><span>{niceDate(s.scheduledAt,s.language)}</span>{s.venue&&<span>{s.venue}</span>}</div></header>
    <div className="playerStatusBar"><div><small>{tr(portal,'Vous jouez','You are playing')}</small><strong>{c.name}</strong></div><div className="paPill"><small>{isEnglish(portal)?'AP':'PA'}</small><strong>{pa?.currentValue??'—'}{pa?.maxValue!=null?`/${pa.maxValue}`:''}</strong></div></div>
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
        requestOnly?tr(portal,'Demande envoyée au MJ ✓','Request sent to GM ✓'):''
      );

      if(response&&!requestOnly){
        const r=response?.result??response;

        setResultPopup({
          success:Boolean(r?.success),
          title:r?.rumor
            ? (isEnglish(portal)?`Rumour — ${r.rumor.targetName}`:`Rumeur — ${r.rumor.targetName}`)
            : Boolean(r?.success)
              ? tr(portal,'Réussite','Success')
              : tr(portal,'Échec','Failure'),
          body:r?.rumor?.text
            ? String(r.rumor.text)
            : Boolean(r?.success)
              ? tr(portal,'Votre action a réussi. Les effets ont été appliqués à votre personnage.','Your action succeeded. The effects have been applied to your character.')
              : tr(portal,'Votre tentative échoue. Aucun effet positif n’est appliqué.','Your attempt failed. No positive effect was applied.')
        });
      }

      return response;
    }} onVote={(voteExternalId,round,selectedOptionExternalIds)=>act(()=>postJson('/api/player/vote',{token,voteExternalId,round,selectedOptionExternalIds}),tr(portal,'Vote enregistré ✓','Vote recorded ✓'))}/>} 
    {tab==='sac'&&<PlayerBag
      portal={portal}
      busy={busy}
      onGive={(objectExternalId,targetCharacterExternalId)=>act(
        ()=>postJson('/api/player/object',{token,objectExternalId,targetCharacterExternalId}),
        tr(portal,'Objet transféré ✓','Item transferred ✓')
      )}
      onShareClue={(clueExternalId,targetCharacterExternalId)=>act(
        ()=>postJson('/api/player/clue/share',{token,clueExternalId,targetCharacterExternalId}),
        tr(portal,'Indice partagé ✓','Clue shared ✓')
      )}
      onCashTransfer={(targetCharacterExternalId,amount)=>act(
        ()=>postJson('/api/player/cash',{token,targetCharacterExternalId,amount}),
        tr(portal,'Virement effectué ✓','Transfer completed ✓')
      )}
    />} 
    {tab==='news'&&<PlayerNews portal={portal} busy={busy} onRead={id=>act(()=>postJson('/api/player/notification/read',{token,notificationId:id}),tr(portal,'Notification lue','Notification read'))}/>} 
    {introOpen&&<div className="qrScannerOverlay playerStoryOverlay" role="dialog" aria-modal="true" aria-label="Introduction"><div className="qrScannerPanel playerStoryPanel"><p className="eyebrow">{tr(portal,'L’HISTOIRE COMMENCE','THE STORY BEGINS')}</p><h2>{s.scenarioTitle}</h2><div className="playerStoryText">{s.playerSummary}</div><button className="playerPrimary" onClick={closeIntro}>{tr(portal,'Entrer dans l’histoire','Enter the story')}</button></div></div>}

    {resultPopup&&<div className="qrScannerOverlay" role="dialog" aria-modal="true" aria-label={tr(portal,'Résultat de l’action','Action result')}><div className={`qrScannerPanel actionResultPopup ${resultPopup.success?'success':'failure'}`}><p className="eyebrow">{tr(portal,'RÉSULTAT','RESULT')}</p><h2>{resultPopup.success?tr(portal,'✓ Réussite','✓ Success'):tr(portal,'✕ Échec','✕ Failure')}</h2><p>{resultPopup.body}</p><button className="playerPrimary" onClick={()=>setResultPopup(null)}>{tr(portal,'Continuer','Continue')}</button></div></div>}

    <footer className="playerFooter">Murder Engine · Ludificateur</footer>
    <nav className="playerBottomNav" aria-label={tr(portal,'Navigation joueur','Player navigation')}>
      <button className={tab==='fiche'?'active':''} onClick={()=>setTab('fiche')}><span>🪪</span><b>{tr(portal,'Fiche','Sheet')}</b></button>
      <button className={tab==='carnet'?'active':''} onClick={()=>setTab('carnet')}><span>📓</span><b>{tr(portal,'Carnet','Notebook')}</b></button>
      <button className={tab==='actions'?'active':''} onClick={()=>setTab('actions')}><span>⚡</span><b>{tr(portal,'Jouer','Play')}</b>{portal.votes?.length>0&&<em>{portal.votes.length}</em>}</button>
      <button className={tab==='sac'?'active':''} onClick={()=>setTab('sac')}><span>🎒</span><b>{tr(portal,'Sac','Bag')}</b></button>
      <button className={tab==='news'?'active':''} onClick={()=>setTab('news')}><span>📰</span><b>News</b>{unread>0&&<em>{unread}</em>}</button>
    </nav>
  </main>;
}

function PlayerPrintableSheet({portal}:{portal:Portal}){
  const c=portal.character;

  useEffect(()=>{
    const id=window.setTimeout(()=>window.print(),350);
    return()=>window.clearTimeout(id);
  },[]);

  return <main className="playerPdfRoot">
    <div className="playerPdfControls">
      <button className="playerPrimary" onClick={()=>window.print()}>
        {tr(portal,'Enregistrer / imprimer en PDF','Save / print as PDF')}
      </button>
      <button className="playerSecondary" onClick={()=>window.close()}>
        {tr(portal,'Fermer','Close')}
      </button>
    </div>

    <article className="playerPdfSheet">
      <header className="playerPdfHeader">
        <p>{portal.session?.scenarioTitle}</p>
        {c.portrait?.source&&
          <img src={c.portrait.source} alt={c.portrait.altText||c.name}/>
        }
        <h1>{c.name}</h1>
        {c.publicRole&&<h2>{c.publicRole}</h2>}
        {c.narrativeAge&&<span>{c.narrativeAge}</span>}
      </header>

      {c.motto&&<blockquote>« {c.motto} »</blockquote>}

      <section>
        <h3>{tr(portal,'Mon histoire','My story')}</h3>
        <NarrativeText text={c.biography||'—'} className="playerNarrativeText"/>
      </section>

      {c.secretIntro&&<section className="playerPdfSecret">
        <h3>{tr(portal,'Ce que vous seul savez','What only you know')}</h3>
        <NarrativeText text={c.secretIntro} className="playerNarrativeText compact"/>
      </section>}

      {c.apparentMotive&&<section>
        <h3>{tr(portal,'Ma position','My position')}</h3>
        <NarrativeText text={c.apparentMotive} className="playerNarrativeText compact"/>
      </section>}

      {c.personalTimeline&&<section>
        <h3>{tr(portal,'Ma chronologie','My timeline')}</h3>
        <NarrativeText text={c.personalTimeline} className="playerNarrativeText"/>
      </section>}

      {(portal.discoverableAboutMe??[]).length>0&&<section>
        <h3>{tr(
          portal,
          'Ce que les joueurs peuvent découvrir sur moi',
          'What other players can discover about me'
        )}</h3>
        <ul>
          {(portal.discoverableAboutMe??[]).map((clue:any)=>
            <li key={clue.externalId}>
              <strong>{clue.playerName}</strong>
              <p>{clue.playerText}</p>
            </li>
          )}
        </ul>
      </section>}

      <section>
        <h3>{tr(portal,'Mes missions','My missions')}</h3>
        {portal.objectives?.length
          ? <ol>{portal.objectives.map((o:any)=><li key={o.externalId}><strong>{o.title}</strong><p>{o.description}</p></li>)}</ol>
          : <p>—</p>}
      </section>

      {portal.relationships?.length>0&&<section>
        <h3>{tr(portal,'Mes relations','My relationships')}</h3>
        {portal.relationships.map((r:any)=>
          <div className="playerPdfRelation" key={r.externalId}>
            <strong>{r.otherName}</strong>
            {r.otherPublicRole&&<span> · {r.otherPublicRole}</span>}
            <p>{r.text}</p>
          </div>
        )}
      </section>}

      <footer>Murder Engine · Ludificateur</footer>
    </article>
  </main>;
}

function PlayerSheet({portal,busy,onRead}:{portal:Portal;busy:boolean;onRead:()=>void}){
  type SheetTab='story'|'missions'|'roleplay'|'qr';
  const c=portal.character;
  const [tab,setTab]=useState<SheetTab>('story');

  const tabs:[
    SheetTab,
    string
  ][]=[
    ['story',tr(portal,'Histoire','Story')],
    ['missions',tr(portal,'Missions','Missions')],
    ...(c.interpretationNotes||c.appearanceNotes?[['roleplay',tr(portal,'Interprétation','Roleplay')] as [SheetTab,string]]:[]),
    ['qr',tr(portal,'Mon QR','My QR')],
  ];

  return <div className="playerStack playerSheetShell">
    <nav className="sheetTabs" aria-label="Rubriques de ma fiche">
      {tabs.map(([id,label])=>
        <button
          key={id}
          className={tab===id?'active':''}
          onClick={()=>setTab(id)}
        >
          {label}
        </button>
      )}
    </nav>

    <button
      type="button"
      className="playerSecondary playerSheetPdfButton"
      onClick={()=>{
        const url=new URL(window.location.href);
        url.searchParams.set('print','sheet');
        window.open(url.toString(),'_blank','noopener,noreferrer');
      }}
    >
      📄 {tr(portal,'PDF de ma fiche','My character sheet PDF')}
    </button>

    {c.motto&&tab==='story'&&<blockquote className="playerQuote">« {c.motto} »</blockquote>}

    {tab==='story'&&<section className="playerCard">
      <p className="playerSectionKicker">{tr(portal,'CE QUE JE SUIS','WHO I AM')}</p>
      <h2>{tr(portal,'Mon histoire','My story')}</h2>
      {c.portrait&&<figure className="characterPortraitHero">
        <img src={c.portrait.source} alt={c.portrait.altText||`Portrait de ${c.name}`}/>
        <figcaption><strong>{c.name}</strong>{c.publicRole&&<span>{c.publicRole}</span>}</figcaption>
      </figure>}
      <NarrativeText text={c.biography} className="playerNarrativeText"/>
      {c.secretIntro&&<div className="playerSecret"><h3>{tr(portal,'Ce que vous seul savez','What only you know')}</h3><NarrativeText text={c.secretIntro} className="playerNarrativeText compact"/></div>}
      {c.apparentMotive&&<><h3>{tr(portal,'Ma position','My position')}</h3><NarrativeText text={c.apparentMotive} className="playerNarrativeText compact"/></>}
      <div className="sheetSubsection">
        <p className="playerSectionKicker">{tr(portal,'MON ALIBI / MA CHRONOLOGIE','MY ALIBI / TIMELINE')}</p>
        <h3>{tr(portal,'Ce que j’ai fait le soir du meurtre','What I did on the night of the murder')}</h3>
        {c.personalTimeline
          ? <NarrativeText text={c.personalTimeline} className="playerNarrativeText"/>
          : <p className="playerMuted">{tr(portal,'Aucune chronologie particulière n’est renseignée pour ce personnage.','No specific timeline is provided for this character.')}</p>}
      </div>

      <div className="sheetSubsection discoverableAboutMe">
        <p className="playerSectionKicker">{tr(portal,'CE QUE LES AUTRES PEUVENT APPRENDRE','WHAT OTHERS MAY LEARN')}</p>
        <h3>{tr(
          portal,
          'Ce que les joueurs peuvent découvrir sur moi',
          'What other players can discover about me'
        )}</h3>
        {(portal.discoverableAboutMe??[]).length===0
          ? <p className="playerMuted">{tr(
              portal,
              'Aucun indice ciblé n’est actuellement renseigné sur votre personnage.',
              'No targeted clue is currently defined about your character.'
            )}</p>
          : <div className="discoverableClueList">
              {(portal.discoverableAboutMe??[]).map((clue:any)=>
                <article key={clue.externalId}>
                  <strong>{clue.playerName}</strong>
                  <p>{clue.playerText}</p>
                </article>
              )}
            </div>
        }
      </div>
    </section>}

    {tab==='missions'&&<section className="playerCard">
      <div className="playerSectionHead">
        <div><p className="playerSectionKicker">{tr(portal,'CE QUE JE DOIS ACCOMPLIR','WHAT I MUST ACHIEVE')}</p><h2>{tr(portal,'Mes missions','My missions')}</h2></div>
        <span>{portal.objectives.length}</span>
      </div>
      {portal.objectives.length===0
        ? <p>{tr(portal,'Aucune mission structurée.','No structured mission.')}</p>
        : portal.objectives.map((o:any)=><article className="playerObjective" key={o.externalId}><div><strong>{o.title}</strong><span>{o.status}</span></div><p>{o.description}</p></article>)}
    </section>}

    {tab==='roleplay'&&(c.interpretationNotes||c.appearanceNotes)&&<section className="playerCard playerRoleplayCard">
      <p className="playerSectionKicker">{tr(portal,'INCARNER MON PERSONNAGE','PLAYING MY CHARACTER')}</p>
      <h2>{tr(portal,'Comment me la jouer','How to play my character')}</h2>
      {c.interpretationNotes&&<NarrativeText text={c.interpretationNotes} className="playerNarrativeText"/>}
      {c.appearanceNotes&&<div className="sheetSubsection">
        <p className="playerSectionKicker">{tr(portal,'STYLE & DÉGUISEMENT','STYLE & COSTUME')}</p>
        <h3>{tr(portal,'Mon apparence','My appearance')}</h3>
        <NarrativeText text={c.appearanceNotes} className="playerNarrativeText"/>
      </div>}
    </section>}

    {tab==='qr'&&<section className="playerCard playerUtilityDetails">
      <p className="playerSectionKicker">{tr(portal,'MON IDENTIFIANT DE JEU','MY GAME ID')}</p>
      <h2>{tr(portal,'Mon QR','My QR')}</h2>
      <p className="playerHelp">{tr(portal,'C’est l’unique QR de votre personnage. Pour une interaction DIRECTE, vous le présentez au joueur qui agit sur vous. Le MJ peut conserver une copie du même QR pour les interactions DISCRÈTES.','This is your character’s unique QR code. For a DIRECT interaction, show it to the player acting on you. The GM may keep a copy of the same QR code for DISCREET interactions.')}</p>
      <div className="playerCharacterQr">
        <QRCodeSVG value={`${window.location.origin}/scan/character/${encodeURIComponent(c.externalId)}`} size={180} level="M" includeMargin/>
        <strong>{c.name}</strong>
        <small>{c.publicRole||c.externalId}</small>
      </div>
    </section>}

    {!portal.participant.briefingReadAt&&<button className="playerPrimary" disabled={busy} onClick={onRead}>{tr(portal,'J’ai lu ma fiche','I have read my sheet')}</button>}
  </div>;
}

function PlayerNotebook({portal}:{portal:Portal}){
  type NotebookTab='context'|'relations'|'info'|'clues';
  const [tab,setTab]=useState<NotebookTab>('relations');
  const [category,setCategory]=useState('ALL');

  const rows=useMemo(
    ()=>[...(portal.knowledge??[])].sort(
      (a:any,b:any)=>
        new Date(b.learnedAt??0).getTime()-
        new Date(a.learnedAt??0).getTime()
    ),
    [portal.knowledge]
  );

  const categories=useMemo(
    ()=>[...new Set(rows.map((k:any)=>String(k.fact?.notebookCategory||k.sourceType||'Autres')).filter(Boolean))],
    [rows]
  );

  const visibleRows=category==='ALL'
    ? rows
    : rows.filter((k:any)=>String(k.fact?.notebookCategory||k.sourceType||'Autres')===category);

  const clueRows=useMemo(()=>{
    const map=new Map<string,any>();
    for(const d of portal.discoveries??[])
      map.set(d.clueExternalId,{...d.clue,externalId:d.clueExternalId,discoveredAt:d.discoveredAt,owned:Boolean(d.clue?.inBag)});
    for(const d of portal.documentEntries??[]){
      const previous=map.get(d.clueExternalId);
      map.set(d.clueExternalId,{...(previous??{}),...d,externalId:d.clueExternalId,owned:true});
    }
    return [...map.values()].sort(
      (a:any,b:any)=>
        new Date(b.discoveredAt??0).getTime()-
        new Date(a.discoveredAt??0).getTime()
    );
  },[portal.discoveries,portal.documentEntries]);

  const tabs:[
    NotebookTab,
    string,
    number|null
  ][]=[
    ['relations',tr(portal,'Relations','Relations'),portal.relationships?.length??0],
    ['info',tr(portal,'Infos','Info'),rows.length],
    ['clues',tr(portal,'Indices','Clues'),clueRows.length],
    ['context',tr(portal,'Contexte','Context'),null],
  ];

  return <div className="playerStack notebookShell">
    <nav className="notebookTabs" aria-label="Rubriques du carnet">
      {tabs.map(([id,label,count])=>
        <button
          key={id}
          className={tab===id?'active':''}
          onClick={()=>setTab(id)}
        >
          <span>{label}</span>
          {count!=null&&<em>{count}</em>}
        </button>
      )}
    </nav>

    {tab==='context'&&<section className="playerCard notebookContextCard">
      <p className="playerSectionKicker">{tr(portal,'L’HISTOIRE','THE STORY')}</p>
      <h2>{portal.session?.scenarioTitle||tr(portal,'Contexte','Context')}</h2>
      {portal.session?.playerSummary
        ? <div className="notebookIntroText">{portal.session.playerSummary}</div>
        : <p>{tr(portal,'Aucun texte d’introduction n’est renseigné pour ce scénario.','No introduction text is provided for this scenario.')}</p>}
    </section>}

    {tab==='relations'&&<section className="playerCard">
      <div className="playerSectionHead">
        <div><p className="playerSectionKicker">{tr(portal,'CE QUE JE SAIS SUR LES AUTRES','WHAT I KNOW ABOUT OTHERS')}</p><h2>{tr(portal,'Personnes & relations','People & relationships')}</h2></div>
        <span>{portal.relationships?.length??0}</span>
      </div>
      {!portal.relationships?.length
        ? <p>{tr(portal,'Vous n’avez encore aucune relation structurée dans votre carnet.','You do not have any structured relationships in your notebook yet.')}</p>
        : portal.relationships.map((r:any)=>
          <article className={`playerRelation ${r.portrait?'hasPortrait':''}`} key={r.externalId}>
            {r.portrait&&<img className="relationPortrait" src={r.portrait.source} alt={r.portrait.altText||`Portrait de ${r.otherName}`}/>}
            <div className="relationContent">
              <small>{r.relationType||tr(portal,'Relation','Relationship')}</small>
              <strong>{r.otherName}</strong>
              {r.otherPublicRole&&<em>{r.otherPublicRole}</em>}
              <p>{r.text}</p>
            </div>
          </article>
        )}
    </section>}

    {tab==='info'&&<section className="playerCard">
      <div className="playerSectionHead">
        <div><p className="playerSectionKicker">{tr(portal,'MES INFORMATIONS','MY INFORMATION')}</p><h2>{tr(portal,'Ce que je sais','What I know')}</h2></div>
        <span>{rows.length}</span>
      </div>

      {categories.length>1&&<div className="notebookCategoryFilters" role="group" aria-label="Filtrer les informations">
        <button className={category==='ALL'?'active':''} onClick={()=>setCategory('ALL')}>{tr(portal,'Tout','All')}</button>
        {categories.map(c=>
          <button key={c} className={category===c?'active':''} onClick={()=>setCategory(c)}>{c}</button>
        )}
      </div>}

      {visibleRows.length===0
        ? <p>{tr(portal,'Aucune information structurée pour le moment.','No structured information yet.')}</p>
        : visibleRows.map((k:any)=>
          <article className="playerKnowledge" key={`${k.factExternalId}-${k.learnedAt}`}>
            <small>{k.fact.notebookCategory||k.sourceType}</small>
            <strong>{k.fact.title}</strong>
            <p>{k.fact.text}</p>
          </article>
        )}
    </section>}

    {tab==='clues'&&<section className="playerCard">
      <div className="playerSectionHead">
        <div><p className="playerSectionKicker">{tr(portal,'CE QUE J’AI DÉCOUVERT','WHAT I DISCOVERED')}</p><h2>{tr(portal,'Indices & documents','Clues & documents')}</h2></div>
        <span>{clueRows.length}</span>
      </div>
      {clueRows.length===0
        ? <p>{tr(portal,'Vous n’avez encore découvert aucun indice.','You have not discovered any clues yet.')}</p>
        : clueRows.map((d:any)=>
          <article className={`playerClue ${d.immersiveDocument?'immersiveClue':''}`} key={d.externalId}>
            <div className="clueBadges">
              <small>{d.clueType||'INDICE'}</small>
              {d.owned&&<small className="ownedBadge">{tr(portal,'dans votre sac','in your bag')}</small>}
            </div>
            {d.visualMedia?.source&&
              <img
                className="clueVisual"
                src={d.visualMedia.source}
                alt={d.visualMedia.altText||d.playerName}
              />
            }
            <strong>{d.playerName}</strong>
            <p>{d.playerText}</p>
            {d.immersiveDocument&&<ImmersiveDocument entry={d} language={portal.session?.language} buttonLabel={tr(portal,'Revoir le document original','View original document')} compact/>}
          </article>
        )}
    </section>}
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
  const [scannedLocation,setScannedLocation]=useState<string|null>(null);
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
  const characterInteractions=visibleInteractions.filter((i:any)=>['PLAYER','CHARACTER'].includes(String(i.targetType??'').toUpperCase()));
  const otherInteractions=visibleInteractions.filter((i:any)=>!['PLAYER','CHARACTER'].includes(String(i.targetType??'').toUpperCase()));
  const pa=(portal.resources??[]).find((r:any)=>r.resourceExternalId==='RES_PA');

  function renderInteraction(i:any){
    const specialKind=Boolean(i.clandestineKind);
    const rawScanMode=String(i.scanMode??'DIRECT').toUpperCase();
    const scanMode=rawScanMode==='DISCRET'?'DISCRET':rawScanMode==='SELECT'?'SELECT':'DIRECT';
    const requestable=!i.directEnabled&&['À demander au MJ','Ask the GM'].includes(String(i.blockedReason??''));
    const characterTarget=['PLAYER','CHARACTER'].includes(String(i.targetType??'').toUpperCase());
    const needsTarget=Boolean(i.targets?.length>0);
    const targetId=targets[i.externalId]||'';
    const targetInfo=(i.targets??[]).find((t:any)=>t.id===targetId);
    const disabled=busy||(!i.directEnabled&&!requestable)||(needsTarget&&!targetId)||i.cooldownRemainingSeconds>0;
    const modeLabel=scanMode==='DISCRET'
      ? tr(portal,'Discrètement','Discreetly')
      : scanMode==='SELECT'
        ? tr(portal,'Choix libre','Select')
        : tr(portal,'Face à face','Face to face');

    return <article className={`playerAction playActionCard ${!i.directEnabled&&!requestable?'isUnavailable':''}`} key={i.externalId}>
      <div className="playActionHeader">
        <div>
          <strong>{i.name}</strong>
          {characterTarget&&<small className={`playModeBadge ${scanMode.toLowerCase()}`}>{modeLabel}</small>}
        </div>
        <div className="playActionBadges">
          {Number(i.costValue??0)>0&&<span>{i.costValue} {resourceLabel(i.costResourceExternalId,portal)}</span>}
          {i.ability&&<span>{i.ability.name} · {tr(portal,'niv.','lvl.')} {i.ability.level}</span>}
          {i.cooldownRemainingSeconds>0&&<span>⏱ {Math.ceil(i.cooldownRemainingSeconds/60)} min</span>}
        </div>
      </div>

      {i.ability?.description&&<p className="playActionDescription">{i.ability.description}</p>}

      {i.maxUses!=null&&<small className="playActionUsage">{i.usesCount}/{i.maxUses} {tr(portal,'utilisations','uses')}</small>}

      {specialKind?<>
        <p className="playActionHint">{scanMode==='DISCRET'
          ? tr(portal,'Scannez la copie du QR de la cible disponible chez le MJ.','Scan the target QR copy available from the GM.')
          : tr(portal,'Demandez à la cible de vous présenter son QR.','Ask the target to show you their QR code.')}</p>
        <button className="playerPrimary playActionCta" disabled={busy||clandestineBusy||!i.directEnabled||i.cooldownRemainingSeconds>0} onClick={()=>setSpecialScanner(i)}>
          📷 {scanMode==='DISCRET'?tr(portal,'Scanner discrètement','Scan discreetly'):tr(portal,'Scanner la cible','Scan target')}
        </button>
      </>:<>
        {characterTarget&&needsTarget&&scanMode==='SELECT'&&
          <select value={targetId} onChange={e=>setTargets(v=>({...v,[i.externalId]:e.target.value}))}>
            <option value="">{tr(portal,'Choisir le personnage…','Choose a character…')}</option>
            {i.targets.map((t:any)=><option key={t.id} value={t.id}>{t.label}{t.subtitle?` — ${t.subtitle}`:''}</option>)}
          </select>
        }

        {characterTarget&&needsTarget&&scanMode!=='SELECT'&&<div className="characterTargetScan playTargetScan">
          {targetInfo
            ? <p className="scannedCharacterTarget">{tr(portal,'Cible :','Target:')} <strong>{targetInfo.label}</strong>{targetInfo.subtitle?` · ${targetInfo.subtitle}`:''}</p>
            : <p className="playActionHint">{scanMode==='DISCRET'?tr(portal,'Utilisez la copie du QR chez le MJ.','Use the QR copy held by the GM.'):tr(portal,'Demandez à la cible de présenter son QR.','Ask the target to show their QR code.')}</p>}
          <button className="playerSecondary" disabled={busy} onClick={()=>setCharacterScanner({interactionId:i.externalId,requestOnly:requestable,scanMode:scanMode as 'DIRECT'|'DISCRET'})}>
            📷 {targetInfo?tr(portal,'Changer de cible','Change target'):scanMode==='DISCRET'?tr(portal,'Scanner discrètement','Scan discreetly'):tr(portal,'Scanner la cible','Scan target')}
          </button>
        </div>}

        {needsTarget&&!characterTarget&&<select value={targetId} onChange={e=>setTargets(v=>({...v,[i.externalId]:e.target.value}))}>
          <option value="">{tr(portal,'Choisir la cible…','Choose target…')}</option>
          {i.targets.map((t:any)=><option key={t.id} value={t.id}>{t.label}{t.subtitle?` — ${t.subtitle}`:''}</option>)}
        </select>}

        <button className={i.directEnabled?'playerPrimary playActionCta':'playerSecondary playActionCta'} disabled={disabled} onClick={()=>{
          const run=()=>onExecute(i.externalId,targetId||null,requestable);
          if(requestable)run(); else withPaConfirmation(i,run);
        }}>
          {i.directEnabled?tr(portal,'Lancer l’action','Start action'):requestable?tr(portal,'Demander au MJ','Ask GM'):(i.blockedReason||tr(portal,'Indisponible','Unavailable'))}
        </button>

        {requestable&&Number(i.costValue??0)>0&&<small className="playerHelp">{tr(portal,'Le coût sera appliqué uniquement si le MJ valide l’action.','The cost will only be applied if the GM approves the action.')}</small>}
      </>}
    </article>;
  }

  return <div className="playerStack playTab">
    <section className="playStatusStrip">
      <div><small>{tr(portal,'Points d’action','Action points')}</small><strong>{pa?.currentValue??'—'}{pa?.maxValue!=null?`/${pa.maxValue}`:''}</strong></div>
      <div><small>{tr(portal,'Prochaine fouille','Next search')}</small><strong>{searchCooldown>0?playerCountdown(searchCooldown):tr(portal,'Disponible','Available')}</strong></div>
    </section>

    {portal.votes?.length>0&&<section className="playPriorityBlock">
      <div className="playPriorityTitle"><span>🗳</span><div><small>{tr(portal,'DÉCISION EN COURS','DECISION IN PROGRESS')}</small><strong>{tr(portal,'Votre vote est attendu','Your vote is required')}</strong></div></div>
      <PlayerVotes portal={portal} busy={busy} onVote={onVote}/>
    </section>}

    <section className="playerCard playMainCard searchScanCard">
      <div className="playCardLead">
        <span className="playCardIcon">🔎</span>
        <div><p className="playerSectionKicker">{tr(portal,'ENQUÊTER','INVESTIGATE')}</p><h2>{tr(portal,'Fouiller un lieu','Search a location')}</h2><p>{tr(portal,'Scannez le QR présent dans la pièce pour tenter une fouille.','Scan the QR code in the room to attempt a search.')}</p></div>
      </div>
      <div className="playActionBadges immersiveSearchCost">
        <span>{tr(portal,'1 PA par fouille','1 AP per search')}</span>
      </div>
      {searchCooldown>0&&<div className="portalSearchCooldown"><span>{tr(portal,'Nouvelle fouille dans','Next search in')}</span><strong>{playerCountdown(searchCooldown)}</strong></div>}
      <button className="playerPrimary scanLaunchButton playMainCta" disabled={busy||portal.session?.status!=='LIVE'||searchCooldown>0} onClick={()=>setScannerOpen(true)}>
        {searchCooldown>0?(isEnglish(portal)?`Available in ${playerCountdown(searchCooldown)}`:`Disponible dans ${playerCountdown(searchCooldown)}`):tr(portal,'📷 Scanner un lieu','📷 Scan a location')}
      </button>
      {portal.session?.status!=='LIVE'&&<small className="playerHelp">{tr(portal,'Disponible lorsque la partie est lancée.','Available once the game has started.')}</small>}
    </section>

    {localError&&<p className="playerError">{localError}</p>}

    <section className="playerCard playMainCard">
      <div className="playerSectionHead"><div><p className="playerSectionKicker">{tr(portal,'INTERAGIR','INTERACT')}</p><h2>{tr(portal,'Agir sur quelqu’un','Act on someone')}</h2><p className="playSectionIntro">{tr(portal,'Choisissez votre action, puis scannez la personne concernée.','Choose your action, then scan the person concerned.')}</p></div><span>{characterInteractions.length}</span></div>
      {characterInteractions.length===0?<p>{tr(portal,'Aucune action sur un personnage n’est disponible pour le moment.','No character action is currently available.')}</p>:<div className="playActionList">{characterInteractions.map(renderInteraction)}</div>}
    </section>

    {otherInteractions.length>0&&<section className="playerCard playMainCard">
      <div className="playerSectionHead"><div><p className="playerSectionKicker">{tr(portal,'AUTRES POSSIBILITÉS','OTHER OPTIONS')}</p><h2>{tr(portal,'Autres actions','Other actions')}</h2></div><span>{otherInteractions.length}</span></div>
      <div className="playActionList">{otherInteractions.map(renderInteraction)}</div>
    </section>}

    <details className="playerCard playSkillsDetails">
      <summary><span>🎯 {tr(portal,'Mes compétences','My skills')}</span><small>{portal.abilities?.length??0}</small></summary>
      {!portal.abilities?.length?<p>{tr(portal,'Aucune compétence particulière n’est renseignée.','No special skill is provided.')}</p>:<div className="abilityGrid playAbilityGrid">{portal.abilities.map((a:any)=><article className="abilityCard" key={a.externalId}><div><strong>{a.name}</strong><span>{tr(portal,'Niveau','Level')} {a.level}</span></div>{a.description&&<p>{a.description}</p>}</article>)}</div>}
    </details>

    {scannerOpen&&
      <QrLocationScanner
        token={token}
        language={portal.session?.language}
        onClose={()=>setScannerOpen(false)}
        onSelect={locationExternalId=>{
          setScannerOpen(false);
          setScannedLocation(locationExternalId);
        }}
      />
    }

    {scannedLocation&&
      <div className="locationInlineOverlay" role="dialog" aria-modal="true">
        <div className="locationInlineStage">
          <LocationScan
            locationExternalId={scannedLocation}
            playerToken={token}
            embedded
            onClose={()=>{
              setScannedLocation(null);
              void onRefresh();
            }}
          />
        </div>
      </div>
    } 
    {characterScanner&&<QrCharacterScanner title={characterScanner.scanMode==='DISCRET'?tr(portal,'Scanner la cible discrètement','Scan target discreetly'):tr(portal,'Scanner la cible','Scan target')} mode={characterScanner.scanMode} targets={portal.otherCharacters} language={portal.session?.language} onClose={()=>setCharacterScanner(null)} onSelect={(target:any)=>{setTargets(v=>({...v,[characterScanner.interactionId]:target.characterExternalId}));setCharacterScanner(null);}}/>}
    {specialScanner&&<QrCharacterScanner title={String(specialScanner.scanMode??'DIRECT').toUpperCase()==='DISCRET'?tr(portal,'Scanner la cible discrètement','Scan target discreetly'):tr(portal,'Scanner la cible','Scan target')} mode={String(specialScanner.scanMode??'DIRECT').toUpperCase()==='DISCRET'?'DISCRET':'DIRECT'} targets={portal.otherCharacters} language={portal.session?.language} onClose={()=>setSpecialScanner(null)} onSelect={(target:any)=>{const interaction=specialScanner;setSpecialScanner(null);withPaConfirmation(interaction,()=>void attemptClandestine(interaction,target));}}/>}
    {paPrompt&&<div className="qrScannerOverlay" role="dialog" aria-modal="true" aria-label={tr(portal,'Confirmer la dépense de PA','Confirm AP spending')}><div className="qrScannerPanel paConfirmPanel"><p className="eyebrow">{tr(portal,'CONFIRMATION D’ACTION','ACTION CONFIRMATION')}</p><h2>{paPrompt.title}</h2><p>{tr(portal,'Voulez-vous dépenser','Do you want to spend')} <strong>{paPrompt.cost} {isEnglish(portal)?'AP':'PA'}</strong> {tr(portal,'pour tenter cette action ?','to attempt this action?')}</p>{paPrompt.current!=null&&<div className="paSpendPreview"><span>{tr(portal,'Avant','Before')} <strong>{paPrompt.current} {isEnglish(portal)?'AP':'PA'}</strong></span><span>{tr(portal,'Après','After')} <strong>{paPrompt.remaining} {isEnglish(portal)?'AP':'PA'}</strong></span></div>}<div className="giveConfirmActions"><button className="playerSecondary" onClick={()=>setPaPrompt(null)}>{tr(portal,'Non','No')}</button><button className="playerPrimary" onClick={()=>{const run=paPrompt.run;setPaPrompt(null);run();}}>{tr(portal,'Oui, continuer','Yes, continue')}</button></div></div></div>}
    {clandestineResult&&<div className="qrScannerOverlay" role="dialog" aria-modal="true" aria-label={tr(portal,'Résultat action clandestine','Clandestine action result')}><div className="qrScannerPanel clandestineResultPanel"><p className="eyebrow">{tr(portal,'INTERACTION QR','QR INTERACTION')}</p><h2>{clandestineResult.success?tr(portal,'Réussite','Success'):tr(portal,'Échec','Failure')}</h2>{!clandestineResult.success?<p>{tr(portal,'La tentative échoue. La cible reçoit une notification anonyme indiquant qu’une action a été tentée sur elle.','The attempt fails. The target receives an anonymous notification that an action was attempted on them.')}</p>:clandestineResult.claimed?<p>{tr(portal,'Objet récupéré :','Item obtained:')} <strong>{clandestineResult.claimed.name}</strong>. {tr(portal,'La victime reçoit une notification sans identité de l’auteur.','The victim receives a notification without the author’s identity.')}</p>:<><p>{clandestineResult.kind==='STEAL'?tr(portal,'Choisissez maintenant un seul objet à subtiliser. Ce choix est à usage unique.','Choose one item to steal now. This choice can only be used once.'):tr(portal,'Vous identifiez les objets accessibles sur la cible.','You identify the items accessible on the target.')}</p>{clandestineResult.items?.length?<div className="clandestineItemList">{clandestineResult.items.map((o:any)=><article key={o.objectExternalId}><div><strong>{o.name}</strong>{o.description&&<small>{o.description}</small>}</div>{clandestineResult.kind==='STEAL'&&<button className="playerPrimary" disabled={clandestineBusy||!clandestineResult.grantToken} onClick={()=>void claimSteal(o)}>{tr(portal,'Voler cet objet','Steal this item')}</button>}</article>)}</div>:<p>{tr(portal,'Aucun objet accessible n’est trouvé.','No accessible item was found.')}</p>}</>}<button className="playerSecondary" disabled={clandestineBusy} onClick={()=>setClandestineResult(null)}>{tr(portal,'Fermer','Close')}</button></div></div>}
  </div>;
}

function PlayerBag({
  portal,
  busy,
  onGive,
  onShareClue,
  onCashTransfer,
}:{
  portal:Portal;
  busy:boolean;
  onGive:(objectId:string,targetId:string)=>void;
  onShareClue:(clueExternalId:string,targetId:string)=>Promise<any>|void;
  onCashTransfer:(targetId:string,amount:number)=>Promise<any>|void;
}){
  const [scanObject,setScanObject]=useState<any|null>(null);
  const [pending,setPending]=useState<{object:any;target:any}|null>(null);
  const [scanClue,setScanClue]=useState<any|null>(null);
  const [pendingClue,setPendingClue]=useState<{clue:any;target:any}|null>(null);
  const [cashScannerOpen,setCashScannerOpen]=useState(false);
  const [cashTarget,setCashTarget]=useState<any|null>(null);
  const [cashAmount,setCashAmount]=useState('');
  const [cashConfirmation,setCashConfirmation]=useState<string>('');
  const [cashError,setCashError]=useState('');

  const inventoryMap=new Map((portal.inventory??[]).map((o:any)=>[o.objectExternalId,o]));
  const docObjectIds=new Set((portal.documentEntries??[]).map((d:any)=>d.objectExternalId).filter(Boolean));

  const documentRows=useMemo(()=>{
    const map=new Map<string,any>();

    for(const d of portal.documentEntries??[])
      map.set(d.clueExternalId,{
        ...d,
        owned:true,
        object:d.object??inventoryMap.get(d.objectExternalId)??null
      });

    for(const discovery of portal.discoveries??[]){
      const clue=discovery.clue;
      if(
        !map.has(discovery.clueExternalId) &&
        clue?.inBag &&
        !clue?.objectExternalId
      ){
        map.set(discovery.clueExternalId,{
          ...clue,
          clueExternalId:discovery.clueExternalId,
          owned:true,
          object:null
        });
      }
    }

    return [...map.values()];
  },[portal.documentEntries,portal.discoveries,portal.inventory]);

  const objects=(portal.inventory??[]).filter((o:any)=>!docObjectIds.has(o.objectExternalId));
  const resources=(portal.resources??[]).filter((r:any)=>['RES_PA','RES_CASH'].includes(String(r.resourceExternalId)));
  const cash=resources.find((r:any)=>r.resourceExternalId==='RES_CASH');
  const cashValue=Number(cash?.currentValue??0);
  const possessionCount=documentRows.length+objects.length;

  async function confirmCashTransfer(){
    if(!cashTarget)return;
    const amount=Number(cashAmount);

    setCashError('');

    if(!Number.isInteger(amount)||amount<=0){
      setCashError(tr(portal,'Indiquez un montant entier supérieur à 0.','Enter a whole amount greater than 0.'));
      return;
    }

    if(amount>cashValue){
      setCashError(tr(portal,'Vous ne disposez pas de suffisamment d’argent.','You do not have enough money.'));
      return;
    }

    const response=await Promise.resolve(onCashTransfer(cashTarget.characterExternalId,amount));

    if(!response){
      setCashError(tr(portal,'Le virement n’a pas pu être effectué. Réessayez ou prévenez le Maître du Jeu.','The transfer could not be completed. Try again or tell the GM.'));
      return;
    }

    setCashConfirmation(isEnglish(portal)?`${amount} sent to ${cashTarget.name}.`:`${amount} envoyé à ${cashTarget.name}.`);
    setCashTarget(null);
    setCashAmount('');
    setCashError('');
  }

  return <div className="playerStack bagShell">
    <section className="playerCard bagResourcesCard">
      <div className="playerSectionHead">
        <div><p className="playerSectionKicker">{tr(portal,'MES RESSOURCES','MY RESOURCES')}</p><h2>{tr(portal,'Ressources','Resources')}</h2></div>
        <span>{resources.length}</span>
      </div>

      {resources.length===0
        ? <p>{tr(portal,'Aucune ressource n’est suivie pour votre personnage.','No resource is tracked for your character.')}</p>
        : <div className="bagResourceCompact">
          {resources.map((r:any)=>
            <div className="bagResourceCompactItem" key={r.resourceExternalId}>
              <span>{resourceLabel(r.resourceExternalId,portal)}</span>
              <strong>
                {r.currentValue}
                {r.maxValue!=null?`/${r.maxValue}`:''}
                {r.resourceExternalId==='RES_CASH'&&r.unit?` ${r.unit}`:''}
              </strong>
            </div>
          )}
          {cash&&portal.otherCharacters.length>0&&
            <button className="playerSecondary bagCashTransferButton" disabled={busy||cashValue<=0||portal.session?.status!=='LIVE'} onClick={()=>setCashScannerOpen(true)}>
              💸 {tr(portal,'Virer','Send')}
            </button>}
        </div>}

      {cash&&<p className="playerHelp bagCashHelp">{tr(portal,'Les virements reçus mettent automatiquement votre solde à jour.','Incoming transfers automatically update your balance.')}</p>}
    </section>

    <section className="playerCard bagPossessionsCard">
      <div className="playerSectionHead">
        <div><p className="playerSectionKicker">{tr(portal,'MES POSSESSIONS','MY POSSESSIONS')}</p><h2>{tr(portal,'Ce que je possède','What I own')}</h2></div>
        <span>{possessionCount}</span>
      </div>

      {possessionCount===0
        ? <p>{tr(portal,'Vous ne possédez actuellement aucun objet ou document enregistré.','You currently own no registered item or document.')}</p>
        : <div className="bagPossessionList">
          {documentRows.map((d:any)=>
            <article className={`bagDocument bagPossessionItem ${d.immersiveDocument?'immersiveBagDocument':''}`} key={d.clueExternalId}>
              <div className="bagPossessionType">
                📄 {tr(portal,'Indice / document','Clue / document')}
                <span className="bagOwnedBadge">✓ {tr(portal,'Dans votre sac','In your bag')}</span>
              </div>

              {(d.object?.visualMedia||d.visualMedia)&&
                <div className="bagLinkedObjectVisual">
                  <img
                    src={(d.object?.visualMedia||d.visualMedia).source}
                    alt={(d.object?.visualMedia||d.visualMedia).altText||d.object?.name||d.playerName}
                  />
                  <span>
                    <small>
                      {d.object
                        ? tr(portal,'Objet associé','Associated item')
                        : tr(portal,'Indice illustré','Illustrated clue')}
                    </small>
                    <strong>{d.object?.name||d.playerName}</strong>
                  </span>
                </div>
              }

              {d.immersiveDocument&&<ImmersiveDocument entry={d} language={portal.session?.language}/>} 
              <div className="bagDocumentMeta">
                <strong>{d.playerName}</strong>
                <p>{d.playerText}</p>
                <em>{tr(
                  portal,
                  'Cet indice reste aussi mémorisé dans votre Carnet.',
                  'This clue also remains saved in your Notebook.'
                )}</em>
              </div>

              {!d.object && d.shareable!==false && portal.otherCharacters.length>0&&
                <div className="giveRow giveQrRow">
                  <button className="playerSecondary" disabled={busy} onClick={()=>setScanClue(d)}>
                    📷 {tr(portal,'Partager','Share')}
                  </button>
                </div>
              }

              {d.object?.transferable&&portal.otherCharacters.length>0&&
                <div className="giveRow giveQrRow">
                  <button className="playerSecondary" disabled={busy} onClick={()=>setScanObject(d.object)}>
                    📷 {tr(portal,'Donner','Give')}
                  </button>
                </div>
              }
            </article>
          )}

          {objects.map((o:any)=>
            <article className="playerObject bagPossessionItem visualPossessionItem" key={o.objectExternalId}>
              <div className="objectVisualThumb">
                {o.visualMedia
                  ? <img src={o.visualMedia.source} alt={o.visualMedia.altText||o.name}/>
                  : <span aria-hidden="true">{objectVisualGlyph(o.visualCode)}</span>}
              </div>
              <div className="objectVisualBody">
                <div className="bagPossessionType">{tr(portal,'Objet','Item')}</div>
                <strong>{o.name}</strong>
                <p>{o.identification}</p>
                {o.charges!=null&&<small>{tr(portal,'Charges','Charges')} : {o.charges}</small>}
              </div>
              {o.transferable&&portal.otherCharacters.length>0&&<div className="giveRow giveQrRow objectVisualAction">
                <button className="playerSecondary" disabled={busy} onClick={()=>setScanObject(o)}>📷 {tr(portal,'Donner','Give')}</button>
              </div>}
            </article>
          )}
        </div>}
    </section>

    {scanClue&&<QrCharacterScanner
      title={tr(portal,'Partager cet indice','Share this clue')}
      mode="DIRECT"
      targets={portal.otherCharacters}
      language={portal.session?.language}
      onClose={()=>setScanClue(null)}
      onSelect={(target:any)=>{
        setPendingClue({clue:scanClue,target});
        setScanClue(null);
      }}
    />}

    {pendingClue&&
      <div
        className="qrScannerOverlay"
        role="dialog"
        aria-modal="true"
        aria-label={tr(portal,'Confirmer le partage','Confirm sharing')}
      >
        <div className="qrScannerPanel giveConfirmPanel">
          <p className="eyebrow">{tr(portal,'PARTAGE D’INDICE','CLUE SHARING')}</p>
          <h2>{pendingClue.clue.playerName}</h2>
          <p>
            {tr(portal,'Partager avec :','Share with:')}{' '}
            <strong>{pendingClue.target.name}</strong>
            {pendingClue.target.publicRole?` · ${pendingClue.target.publicRole}`:''}
          </p>
          <p className="playerHelp">
            {tr(
              portal,
              'Vous garderez cet indice dans votre Sac et votre Carnet après le partage.',
              'You will keep this clue in your Bag and Notebook after sharing it.'
            )}
          </p>
          <div className="giveConfirmActions">
            <button className="playerSecondary" disabled={busy} onClick={()=>setPendingClue(null)}>
              {tr(portal,'Annuler','Cancel')}
            </button>
            <button className="playerPrimary" disabled={busy} onClick={async()=>{
              await onShareClue(
                pendingClue.clue.clueExternalId,
                pendingClue.target.characterExternalId
              );
              setPendingClue(null);
            }}>
              {tr(portal,'Partager l’indice','Share clue')}
            </button>
          </div>
        </div>
      </div>
    }

    {scanObject&&<QrCharacterScanner
      title={isEnglish(portal)?`Give ${scanObject.name}`:`Donner ${scanObject.name}`}
      mode="DIRECT"
      targets={portal.otherCharacters}
      language={portal.session?.language}
      onClose={()=>setScanObject(null)}
      onSelect={(target:any)=>{setPending({object:scanObject,target});setScanObject(null);}}
    />}

    {pending&&<div className="qrScannerOverlay" role="dialog" aria-modal="true" aria-label={tr(portal,'Confirmer le don','Confirm gift')}>
      <div className="qrScannerPanel giveConfirmPanel">
        <p className="eyebrow">{tr(portal,'DON · QR VALIDÉ','GIFT · QR VALIDATED')}</p>
        <h2>{tr(portal,'Donner','Give')} {pending.object.name} ?</h2>
        <p>{tr(portal,'Destinataire :','Recipient:')} <strong>{pending.target.name}</strong>{pending.target.publicRole?` · ${pending.target.publicRole}`:''}</p>
        <div className="giveConfirmActions">
          <button className="playerSecondary" disabled={busy} onClick={()=>setPending(null)}>{tr(portal,'Annuler','Cancel')}</button>
          <button className="playerPrimary" disabled={busy} onClick={()=>{onGive(pending.object.objectExternalId,pending.target.characterExternalId);setPending(null);}}>{tr(portal,'Confirmer le don','Confirm gift')}</button>
        </div>
      </div>
    </div>}

    {cashScannerOpen&&<QrCharacterScanner
      title={tr(portal,'Virer de l’argent','Send money')}
      mode="DIRECT"
      targets={portal.otherCharacters}
      language={portal.session?.language}
      onClose={()=>setCashScannerOpen(false)}
      onSelect={(target:any)=>{setCashTarget(target);setCashScannerOpen(false);setCashAmount('');setCashError('');}}
    />}

    {cashTarget&&<div className="qrScannerOverlay" role="dialog" aria-modal="true" aria-label={tr(portal,'Confirmer le virement','Confirm transfer')}>
      <div className="qrScannerPanel cashTransferPanel">
        <p className="eyebrow">{tr(portal,'VIREMENT','TRANSFER')}</p>
        <h2>{tr(portal,'Envoyer de l’argent','Send money')}</h2>
        <p>{tr(portal,'À','To')} <strong>{cashTarget.name}</strong>{cashTarget.publicRole?` · ${cashTarget.publicRole}`:''}</p>
        <div className="cashBalancePreview"><span>{tr(portal,'Disponible','Available')}</span><strong>{cashValue}</strong></div>
        <label className="cashAmountField">
          <span>{tr(portal,'Montant','Amount')}</span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max={cashValue}
            step="1"
            value={cashAmount}
            onChange={e=>setCashAmount(e.target.value)}
            placeholder="0"
          />
        </label>
        {cashError&&<p className="playerError cashTransferError">{cashError}</p>}
        <div className="giveConfirmActions">
          <button className="playerSecondary" disabled={busy} onClick={()=>{setCashTarget(null);setCashAmount('');setCashError('');}}>{tr(portal,'Annuler','Cancel')}</button>
          <button className="playerPrimary" disabled={busy||!Number.isInteger(Number(cashAmount))||Number(cashAmount)<=0||Number(cashAmount)>cashValue} onClick={()=>void confirmCashTransfer()}>{tr(portal,'Confirmer le virement','Confirm transfer')}</button>
        </div>
      </div>
    </div>}

    {cashConfirmation&&<div className="qrScannerOverlay" role="dialog" aria-modal="true" aria-label={tr(portal,'Virement effectué','Transfer completed')}>
      <div className="qrScannerPanel cashTransferPanel">
        <p className="eyebrow">{tr(portal,'VIREMENT','TRANSFER')}</p>
        <h2>✓ {tr(portal,'Argent envoyé','Money sent')}</h2>
        <p>{cashConfirmation}</p>
        <button className="playerPrimary" onClick={()=>setCashConfirmation('')}>{tr(portal,'Continuer','Continue')}</button>
      </div>
    </div>}
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

    const response=await Promise.resolve(
      onVote(
        v.externalId,
        v.round,
        [selected]
      )
    );

    if(!response)return;

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
          ? tr(portal,'Accusation enregistrée','Accusation recorded')
          : tr(portal,'Vote enregistré','Vote recorded'),

      body:
        accusation
          ? (isEnglish(portal)?`Your accusation against ${label} has been recorded. The result will be revealed at the time planned by the GM.`:`Votre accusation contre ${label} a bien été enregistrée. Le résultat sera révélé au moment prévu par le Maître du Jeu.`)
          : (isEnglish(portal)?`Your vote for ${label} has been recorded.`:`Votre vote pour ${label} a bien été enregistré.`)
    });
  }

  return <>
    <section className="playerCard">

      <div className="playerSectionHead">
        <div>
          <p className="playerSectionKicker">{tr(portal,'DÉCIDER','DECIDE')}</p>
          <h2>{tr(portal,'Vote','Vote')}</h2>
        </div>
        <span>{portal.votes.length}</span>
      </div>

      {portal.votes.length===0
        ? <p>{tr(portal,'Aucun scrutin ne vous concerne actuellement.','No vote currently concerns you.')}</p>
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
                      ? tr(portal,'Modifier mon vote','Change my vote')
                      : tr(portal,'Vote enregistré ✓','Vote recorded ✓')
                  )
                : tr(portal,'Voter','Vote')}
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
            {tr(portal,'Continuer','Continue')}
          </button>
        </div>
      </div>
    }
  </>;
}

function PlayerNews({portal,busy,onRead}:{portal:Portal;busy:boolean;onRead:(id:string)=>void}){
  const notifications=(portal.notifications??[]).filter((n:any)=>{
    const kind=String(n.kind??'').toUpperCase();
    return !['INTERACTION','ACTION','LOCATION'].includes(kind);
  });

  const voteResults=portal.voteResults??[];
  const newsCount=notifications.length+voteResults.length;

  return <div className="playerStack newsShell">
    <section className="playerCard newsFeedCard">
      <div className="playerSectionHead">
        <div>
          <p className="playerSectionKicker">{tr(portal,'CE QU’IL SE PASSE','WHAT IS HAPPENING')}</p>
          <h2>{tr(portal,'News','News')}</h2>
        </div>
        <span>{newsCount}</span>
      </div>

      <p className="newsSectionIntro">
        {tr(
          portal,
          'Événements du scénario, résultats des votes et informations qui vous concernent.',
          'Scenario events, vote results and information concerning you.'
        )}
      </p>

      {voteResults.map((vote:any)=>
        <article
          className="playerMessage newsMessage voteResultNews"
          key={`vote-result-${vote.externalId}-${vote.round}`}
        >
          <div>
            <small>
              {tr(portal,'Résultat du vote','Vote result')}
              {vote.closedAt?` · ${niceTime(vote.closedAt,portal.session?.language)}`:''}
            </small>

            <strong>{vote.title}</strong>

            {vote.winnerLabel
              ? <p>
                  {tr(portal,'Résultat :','Result:')}{' '}
                  <b>{vote.winnerLabel}</b>
                </p>
              : vote.tieForLead
                ? <p>{tr(
                    portal,
                    'Le scrutin se termine à égalité. Aucune décision définitive n’est encore prise.',
                    'The vote ends in a tie. No final decision has been made yet.'
                  )}</p>
                : vote.suggestSecondRound
                  ? <p>{tr(
                      portal,
                      'Aucun résultat définitif. Un nouveau tour de vote est nécessaire.',
                      'No final result. Another round of voting is required.'
                    )}</p>
                  : <p>{tr(
                      portal,
                      'Le scrutin est clôturé sans résultat définitif.',
                      'The vote is closed without a final result.'
                    )}</p>
            }
          </div>
        </article>
      )}

      {notifications.length===0&&voteResults.length===0
        ? <p>{tr(portal,'Aucune nouvelle pour le moment.','No news for now.')}</p>
        : notifications.map((n:any)=>
            <NewsNotification
              key={n.id}
              n={n}
              busy={busy}
              onRead={onRead}
              portal={portal}
            />
          )
      }
    </section>

    <section className="playerCard rulesCard">
      <p className="playerSectionKicker">{tr(portal,'RÈGLES DU JEU','GAME RULES')}</p>
      <h2>{tr(portal,'Comment jouer','How to play')}</h2>
      <ul>
        <li>{tr(portal,'Les discussions, négociations, mensonges et alliances entre joueurs sont libres, sauf indication contraire du scénario.','Discussions, negotiations, lies and alliances between players are free unless the scenario states otherwise.')}</li>
        <li>{tr(portal,'Avant une action mécanique payante, Murder Engine vous indique son coût et vous demande confirmation.','Before a mechanical action that costs resources, Murder Engine shows the cost and asks for confirmation.')}</li>
        <li>{tr(portal,'Les QR servent à valider un lieu ou une cible. L’onglet Jouer vous indique quand agir face à face ou discrètement.','QR codes validate a location or target. The Play tab tells you when to act face to face or discreetly.')}</li>
        <li>{tr(portal,'Après une tentative de fouille, un délai de 10 minutes s’applique avant la suivante.','After a search attempt, a 10-minute delay applies before the next one.')}</li>
        <li>{tr(portal,'Lorsqu’une action nécessite un jugement humain, le MJ reste l’arbitre.','When an action requires human judgement, the GM remains the referee.')}</li>
      </ul>
    </section>
  </div>;
}

function NewsNotification({n,busy,onRead,portal}:{n:any;busy:boolean;onRead:(id:string)=>void;portal:Portal}){
  const kind=String(n.kind??'INFO').toUpperCase();
  const pressLike=['NEWS','EVENT','ACTU','PUBLIC'].includes(kind);
  const sourceLabel=
    ['GM','MJ','ORGANIZATION','ORGANISATION'].includes(kind)
      ? tr(portal,'Message de l’organisation','Organizer message')
      : pressLike
        ? tr(portal,'Actualité','News')
        : kind==='THEFT'
          ? tr(portal,'Alerte personnelle','Personal alert')
          : kind==='OBJECT'
            ? tr(portal,'Information reçue','Information received')
            : kind==='CASH'
              ? tr(portal,'Argent reçu','Money received')
              : kind==='INTERACTION_TARGET'
              ? tr(portal,'Événement personnel','Personal event')
              : tr(portal,'Information','Information');

  return <article className={`playerMessage newsMessage ${n.readAt?'read':'unread'} ${pressLike?'pressArticle':''}`}>
    <div>
      <small>{sourceLabel} · {niceTime(n.createdAt,portal.session?.language)}</small>
      <strong>{n.title}</strong>
      <p>{n.body}</p>
    </div>
    {!n.readAt&&<button className="playerSecondary" disabled={busy} onClick={()=>onRead(n.id)}>{tr(portal,'Marquer comme lu','Mark as read')}</button>}
  </article>;
}


