import { useEffect, useState } from 'react';
import { asSkinId, skinClassFor, defaultAccentForSkin } from './skin-registry';

type Language='FR'|'EN';

type LocationAction = {
  externalId:string;
  name:string;
  category:string;
  resolution:string;
  costResourceExternalId?:string|null;
  costValue?:number|null;
  currentCostResourceValue?:number|null;
  diceCount?:number|null;
  diceSides?:number|null;
  difficulty?:number|null;
  ability?:{name:string;level:number}|null;
  available:boolean;
  blockedReason?:string|null;
  systemFallback?:boolean;
  searchCooldownRemainingSeconds?:number|null;
};

type LocationPayload = {
  session:{
    id:string;
    name?:string|null;
    status:string;
    language?:string|null;
    scenarioTitle:string;
  };
  character:{externalId:string;name:string};
  location:{externalId:string;name:string;description:string};
  actions:LocationAction[];
  rewardsRemaining:number;
  searchCooldownRemainingSeconds:number;
  forbidden:boolean;
  empty:boolean;
};

type ActionResult = {
  result:{
    interactionName:string;
    success:boolean;
    resolution:string;
    actorRoll?:{rolls:number[];sum:number}|null;
    actorTotal?:number|null;
    targetTotal?:number|null;
    cost?:{resourceExternalId:string;value:number;remaining:number}|null;
  };
  reward:{
    kind:string;
    clue?:{
      name:string;
      text:string;
      clueType:string;
      mode:'TAKEABLE'|'PERSISTENT';
    }|null;
    object?:{
      name:string;
      description?:string|null;
      logisticsCode?:string|null;
      physicalPickupRequired?:boolean;
    }|null;
  };
  location:{name:string};
};

async function fetchJson<T>(url:string,init?:RequestInit):Promise<T>{
  const r=await fetch(url,init);
  const ct=r.headers.get('content-type')??'';
  const raw=await r.text();
  let data:any=null;

  if(raw&&ct.includes('application/json')){
    try{data=JSON.parse(raw)}catch{}
  }

  if(!r.ok)
    throw new Error(data?.message??data?.error??`HTTP ${r.status}`);

  if(!data)
    throw new Error('INVALID_SERVER_RESPONSE');

  return data as T;
}

const postJson=<T,>(url:string,body:any)=>
  fetchJson<T>(url,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body),
  });

function safeStorageGet(key:string){
  try{return window.localStorage.getItem(key)}catch{return null}
}

function safeStorageSet(key:string,value:string){
  try{window.localStorage.setItem(key,value)}catch{}
}

function normalizeLanguage(value?:string|null):Language{
  return String(value??'FR').trim().toUpperCase()==='EN'?'EN':'FR';
}

function tx(language:Language,fr:string,en:string){
  return language==='EN'?en:fr;
}

function resourceLabel(id:string|undefined|null,language:Language){
  if(id==='RES_PA')return language==='EN'?'AP':'PA';
  return String(id??'').replace(/^RES_/,'')||tx(language,'ressource','resource');
}

function formatCountdown(total:number){
  const s=Math.max(0,Math.floor(total));
  const m=Math.floor(s/60);
  return `${String(m).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}

export default function LocationScan({
  locationExternalId,
  playerToken,
  embedded=false,
  onClose,
}:{
  locationExternalId:string;
  playerToken?:string;
  embedded?:boolean;
  onClose?:()=>void;
}){
  const params=new URLSearchParams(window.location.search);
  const queryToken=params.get('player');

  const [token,setToken]=useState(
    ()=>playerToken||queryToken||safeStorageGet('murderEnginePlayerToken')||''
  );
  const [language,setLanguage]=useState<Language>(
    ()=>normalizeLanguage(safeStorageGet('murderEnginePlayerLanguage'))
  );
  const [data,setData]=useState<LocationPayload|null>(null);
  const [loading,setLoading]=useState(Boolean(token));
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [last,setLast]=useState<ActionResult|null>(null);
  const [cooldown,setCooldown]=useState(0);
  const [pendingAction,setPendingAction]=useState<LocationAction|null>(null);

  useEffect(()=>{
    const nextToken=playerToken||queryToken;
    if(nextToken){
      safeStorageSet('murderEnginePlayerToken',nextToken);
      setToken(nextToken);
    }
  },[playerToken,queryToken]);

  async function load(){
    if(!token)return;

    setLoading(true);
    setError('');

    try{
      const r=await fetchJson<{ok:boolean;location:LocationPayload}>(
        `/api/player/location?token=${encodeURIComponent(token)}&locationExternalId=${encodeURIComponent(locationExternalId)}`
      );

      if(!r?.location?.session||!r?.location?.location||!r?.location?.character)
        throw new Error('INVALID_LOCATION_PAYLOAD');

      const normalizedLocation={
        ...r.location,
        actions:Array.isArray(r.location.actions)?r.location.actions.filter(Boolean):[],
        rewardsRemaining:Number(r.location.rewardsRemaining??0),
        searchCooldownRemainingSeconds:Number(r.location.searchCooldownRemainingSeconds??0),
        forbidden:Boolean(r.location.forbidden),
        empty:Boolean(r.location.empty),
      } as LocationPayload;

      const nextLanguage=normalizeLanguage(normalizedLocation.session.language);
      setLanguage(nextLanguage);
      safeStorageSet('murderEnginePlayerLanguage',nextLanguage);
      setData(normalizedLocation);
      setCooldown(normalizedLocation.searchCooldownRemainingSeconds);
    }catch(e){
      setError(e instanceof Error?e.message:String(e));
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{void load()},[token,locationExternalId]);

  useEffect(()=>{
    if(cooldown<=0)return;
    const id=window.setInterval(()=>{
      setCooldown(v=>{
        const next=Math.max(0,v-1);
        if(next===0)window.setTimeout(()=>void load(),50);
        return next;
      });
    },1000);

    return()=>window.clearInterval(id);
  },[cooldown>0,token,locationExternalId]);

  async function execute(action:LocationAction){
    setBusy(action.externalId);
    setError('');
    setLast(null);

    try{
      const r=await postJson<{ok:boolean;result:ActionResult}>(
        '/api/player/location/action',
        {token,locationExternalId,interactionExternalId:action.externalId}
      );
      setLast(r.result);
      await load();
    }catch(e){
      setError(e instanceof Error?e.message:String(e));
    }finally{
      setBusy('');
    }
  }

  if(!token)
    return <main className="playerShell scanShell">
      <section className="playerCard scanIntro">
        <p className="eyebrow">MURDER ENGINE · QR</p>
        <h1>{tx(language,'Identité joueur requise','Player identity required')}</h1>
        <p>{tx(
          language,
          'Ouvre d’abord ton lien personnel Murder Engine sur ce téléphone. Ensuite, les QR des lieux fonctionneront automatiquement.',
          'First open your personal Murder Engine link on this phone. Location QR codes will then work automatically.'
        )}</p>
      </section>
    </main>;

  if(loading&&!data)
    return <main className="playerShell scanShell">
      <section className="playerCard">
        {tx(language,'Lecture du lieu…','Loading location…')}
      </section>
    </main>;

  if(error&&!data)
    return <main className="playerShell scanShell">
      <section className="playerCard">
        <p className="eyebrow">QR · {tx(language,'LIEU','LOCATION')}</p>
        <h1>{tx(language,'Accès impossible','Unable to access')}</h1>
        <p className="playerError">{error}</p>
        <a className="playerSecondary scanBack" href={`/?player=${encodeURIComponent(token)}`}>
          {tx(language,'Retour à ma fiche','Back to my character sheet')}
        </a>
      </section>
    </main>;

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

  return <main className={`playerShell scanShell ${embedded?'embeddedLocationScan':''} ${skinClass}`} style={skinStyle}>
    {embedded&&onClose&&
      <button
        type="button"
        className="playerSecondary embeddedLocationClose"
        onClick={onClose}
      >
        {tx(language,'Fermer','Close')}
      </button>
    }
    <header className="playerHero scanHero">
      <div>
        {presentation.logo?.source&&
          <img
            className="playerScenarioLogo playerScenarioLogoScan"
            src={presentation.logo.source}
            alt={presentation.logo.altText||data.session.scenarioTitle}
          />
        }
        <p className="eyebrow">{data.session.scenarioTitle}</p>
        <h1>{data.location.name}</h1>
        <p>{data.location.description}</p>
      </div>
      <div className="playerCharacterBadge">
        <span>{tx(language,'Vous jouez','You are playing')}</span>
        <strong>{data.character.name}</strong>
      </div>
    </header>

    {error&&<p className="playerError">{error}</p>}

    {data.forbidden&&
      <section className="playerCard locationBlockedCard immersiveSearchMessage">
        <h2>{tx(language,'Rien à découvrir ici pour vous','Nothing here for you to discover')}</h2>
        <p>{tx(
          language,
          'C’est votre propre espace. Vous le connaissez déjà trop bien : cherchez ailleurs.',
          'This is your own space. You know it too well already — look elsewhere.'
        )}</p>
      </section>
    }

    {data.empty&&
      <section className="playerCard locationEmptyCard immersiveSearchMessage">
        <h2>{tx(language,'Vous ne trouvez plus rien ici','There is nothing else to find here')}</h2>
        <p>{tx(
          language,
          'Les lieux ont déjà livré tout ce qu’ils pouvaient révéler.',
          'This place has already revealed everything it had to offer.'
        )}</p>
      </section>
    }

    {last&&
      <section className="playerCard scanResult immersiveDiscoveryCard">
        {!last.result.success
          ? <>
              <h2>{tx(language,'Rien cette fois…','Nothing this time…')}</h2>
              <p>{tx(
                language,
                'Votre recherche ne révèle rien de nouveau.',
                'Your search reveals nothing new.'
              )}</p>
            </>
          : <>
              {last.reward?.clue&&
                <div className="scanReward immersiveClueReward">
                  <p className="immersiveDiscoveryLead">
                    {tx(language,'Vous découvrez…','You discover…')}
                  </p>
                  <h2>{last.reward.clue.name}</h2>
                  <p className="immersiveDiscoveryText">{last.reward.clue.text}</p>

                  <div className="clueBagNotice">
                    {last.reward?.object
                      ? tx(
                          language,
                          'L’indice reste dans votre Carnet. L’objet associé se trouve dans votre Sac.',
                          'The clue remains in your Notebook. The associated item is in your Bag.'
                        )
                      : tx(
                          language,
                          'Cet indice est maintenant dans votre Sac et votre Carnet.',
                          'This clue is now in your Bag and Notebook.'
                        )}
                  </div>

                  {last.reward.clue.mode==='PERSISTENT'&&
                    <p className="persistentClueNote">
                      {tx(
                        language,
                        'Cet élément reste visible sur place.',
                        'This element remains visible here.'
                      )}
                    </p>
                  }
                </div>
              }

              {last.reward?.object&&
                <div className="scanReward objectReward immersiveObjectReward">
                  <p className="immersiveDiscoveryLead">
                    {tx(language,'Vous mettez la main sur…','You get your hands on…')}
                  </p>
                  <h2>{last.reward.object.name}</h2>
                  {last.reward.object.description&&<p>{last.reward.object.description}</p>}

                  {last.reward.object.logisticsCode&&
                    <div className="physicalPickupCallout">
                      <strong>{tx(language,'Un objet réel vous attend','A physical prop is waiting for you')}</strong>
                      <p>{tx(
                        language,
                        'Présentez ce code au Maître du Jeu pour le récupérer.',
                        'Show this code to the Game Master to collect it.'
                      )}</p>
                      <b>{last.reward.object.logisticsCode}</b>
                    </div>
                  }
                </div>
              }

              {last.result.success&&last.reward?.kind==='NONE'&&
                <>
                  <h2>{tx(language,'Rien de nouveau','Nothing new')}</h2>
                  <p>{tx(
                    language,
                    'Vous inspectez les lieux, mais rien d’autre n’attire votre attention.',
                    'You search the area, but nothing else catches your attention.'
                  )}</p>
                </>
              }

              {last.result.cost&&
                <p className="searchCostRecap">
                  {tx(language,'Il vous reste','You have')}{' '}
                  <strong>{last.result.cost.remaining} {resourceLabel(last.result.cost.resourceExternalId,language)}</strong>
                  {' '}
                  {tx(language,'pour poursuivre vos recherches.','left for further searches.')}
                </p>
              }
            </>
        }
      </section>
    }

    {cooldown>0&&!data.empty&&!data.forbidden&&
      <section className="playerCard searchCooldownCard">
        <h2>{tx(language,'Laissez retomber la poussière…','Give it a little time…')}</h2>
        <div className="searchCountdown">{formatCountdown(cooldown)}</div>
        <p>{tx(
          language,
          'Observez, discutez, recoupez vos informations. Vous pourrez reprendre vos recherches ensuite.',
          'Observe, talk, compare what you know. You can resume your search afterwards.'
        )}</p>
      </section>
    }

    <section className="playerCard immersiveSearchActions">
      <h2>{tx(language,'Que faites-vous ?','What do you do?')}</h2>

      {data.actions.length===0
        ? <p>{tx(
            language,
            'Rien ne semble pouvoir être tenté ici pour le moment.',
            'There seems to be nothing you can try here right now.'
          )}</p>
        : data.actions.map(a=>
          <article className="scanAction immersiveSearchAction" key={a.externalId}>
            <div className="immersiveActionHead">
              <strong>{tx(language,'Fouiller les lieux','Search the area')}</strong>
              {Number(a.costValue??0)>0&&
                <span className="immersiveCostBadge">
                  {a.costValue} {resourceLabel(a.costResourceExternalId,language)}
                </span>
              }
            </div>

            <p className="immersiveActionHint">
              {tx(
                language,
                'Prenez le temps d’examiner les alentours avec attention.',
                'Take a moment to examine the surroundings carefully.'
              )}
            </p>

            <button
              className="playerPrimary"
              disabled={busy!==''||!a.available||Boolean(a.searchCooldownRemainingSeconds&&cooldown>0)}
              onClick={()=>{
                if(Number(a.costValue??0)>0&&a.costResourceExternalId==='RES_PA')
                  setPendingAction(a);
                else
                  void execute(a);
              }}
            >
              {busy===a.externalId
                ? tx(language,'Vous fouillez…','Searching…')
                : a.searchCooldownRemainingSeconds&&cooldown>0
                  ? `${tx(language,'Reprendre dans','Resume in')} ${formatCountdown(cooldown)}`
                  : a.available
                    ? tx(language,'Fouiller les lieux','Search the area')
                    : (a.blockedReason||tx(language,'Impossible pour le moment','Not possible right now'))}
            </button>
          </article>
        )
      }
    </section>

    {pendingAction&&
      <div
        className="qrScannerOverlay"
        role="dialog"
        aria-modal="true"
        aria-label={tx(language,'Confirmer la dépense de PA','Confirm AP spending')}
      >
        <div className="qrScannerPanel paConfirmPanel">
          <h2>{tx(language,'Fouiller ce lieu ?','Search this place?')}</h2>
          <p>{tx(
            language,
            `Cette recherche vous coûtera ${pendingAction.costValue} PA.`,
            `This search will cost ${pendingAction.costValue} AP.`
          )}</p>

          <div className="giveConfirmActions">
            <button className="playerSecondary" onClick={()=>setPendingAction(null)}>
              {tx(language,'Pas maintenant','Not now')}
            </button>
            <button className="playerPrimary" onClick={()=>{
              const action=pendingAction;
              setPendingAction(null);
              void execute(action);
            }}>
              {tx(language,'Fouiller','Search')}
            </button>
          </div>
        </div>
      </div>
    }

    {embedded&&onClose
      ? <button className="playerSecondary scanBack" type="button" onClick={onClose}>
          ← {tx(language,'Revenir au jeu','Back to game')}
        </button>
      : <a className="playerSecondary scanBack" href={`/?player=${encodeURIComponent(token)}`}>
          ← {tx(language,'Retour à ma fiche','Back to my character sheet')}
        </a>
    }

    <footer className="playerFooter">Murder Engine · Ludificateur</footer>
  </main>;
}
