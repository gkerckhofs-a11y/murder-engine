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

export default function LocationScan({locationExternalId}:{locationExternalId:string}){
  const params=new URLSearchParams(window.location.search);
  const queryToken=params.get('player');

  const [token,setToken]=useState(
    ()=>queryToken||localStorage.getItem('murderEnginePlayerToken')||''
  );
  const [language,setLanguage]=useState<Language>(
    ()=>normalizeLanguage(localStorage.getItem('murderEnginePlayerLanguage'))
  );
  const [data,setData]=useState<LocationPayload|null>(null);
  const [loading,setLoading]=useState(Boolean(token));
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [last,setLast]=useState<ActionResult|null>(null);
  const [cooldown,setCooldown]=useState(0);
  const [pendingAction,setPendingAction]=useState<LocationAction|null>(null);

  useEffect(()=>{
    if(queryToken){
      localStorage.setItem('murderEnginePlayerToken',queryToken);
      setToken(queryToken);
    }
  },[queryToken]);

  async function load(){
    if(!token)return;

    setLoading(true);
    setError('');

    try{
      const r=await fetchJson<{ok:boolean;location:LocationPayload}>(
        `/api/player/location?token=${encodeURIComponent(token)}&locationExternalId=${encodeURIComponent(locationExternalId)}`
      );

      const nextLanguage=normalizeLanguage(r.location.session.language);
      setLanguage(nextLanguage);
      localStorage.setItem('murderEnginePlayerLanguage',nextLanguage);
      setData(r.location);
      setCooldown(Number(r.location.searchCooldownRemainingSeconds??0));
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

  return <main className={`playerShell scanShell ${skinClass}`} style={skinStyle}>
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
      <section className="playerCard locationBlockedCard">
        <p className="eyebrow">{tx(language,'FOUILLE IMPOSSIBLE','SEARCH NOT ALLOWED')}</p>
        <h2>{tx(language,'C’est votre propre espace','This is your own space')}</h2>
        <p>{tx(
          language,
          'Vous connaissez déjà trop bien cet endroit pour pouvoir le fouiller. Cherchez des indices ailleurs.',
          'You already know this place too well to search it. Look for clues elsewhere.'
        )}</p>
      </section>
    }

    {data.empty&&
      <section className="playerCard locationEmptyCard">
        <p className="eyebrow">{tx(language,'LIEU ÉPUISÉ','LOCATION CLEARED')}</p>
        <h2>{tx(language,'Cette pièce est vide','This location is empty')}</h2>
        <p>{tx(
          language,
          'Tout ce qui pouvait être emporté a déjà été découvert. Essayez un autre endroit.',
          'Everything that could be taken has already been discovered. Try another location.'
        )}</p>
      </section>
    }

    {last&&
      <section className={`playerCard scanResult ${last.result.success?'success':'failure'}`}>
        <p className="eyebrow">{tx(language,'RÉSULTAT','RESULT')}</p>
        <h2>{last.result.success?tx(language,'Réussite','Success'):tx(language,'Échec','Failure')}</h2>

        {last.result.actorRoll&&
          <p className="diceResult">
            {tx(language,'Jet','Roll')} : {last.result.actorRoll.rolls.join(' + ')}
            {last.result.actorTotal!=null
              ? ` → ${tx(language,'total','total')} ${last.result.actorTotal}`
              : ''}
            {last.result.targetTotal!=null
              ? ` / ${tx(language,'difficulté','difficulty')} ${last.result.targetTotal}`
              : ''}
          </p>
        }

        {last.reward?.clue&&
          <div className="scanReward">
            <small className={`discoveryModeBadge ${last.reward.clue.mode==='TAKEABLE'?'takeable':'persistent'}`}>
              {last.reward.clue.mode==='TAKEABLE'
                ? tx(language,'📦 Élément récupérable','📦 Takeable item')
                : tx(language,'👁 Information persistante','👁 Persistent information')}
            </small>
            <strong>{last.reward.clue.name}</strong>
            <p>{last.reward.clue.text}</p>
            <div className="clueBagNotice">
              ✓ {last.reward?.object
                ? tx(
                    language,
                    'Cet indice est mémorisé dans votre Carnet et l’objet associé se trouve dans votre Sac.',
                    'This clue is saved in your Notebook and the associated item is in your Bag.'
                  )
                : tx(
                    language,
                    'Cet indice se trouve maintenant dans votre Sac et votre Carnet.',
                    'This clue is now in your Bag and Notebook.'
                  )}
            </div>
            {last.reward.clue.mode==='PERSISTENT'&&
              <em>{tx(
                language,
                'Cette information reste accessible aux autres joueurs.',
                'This information remains accessible to other players.'
              )}</em>
            }
          </div>
        }

        {last.reward?.object&&
          <div className="scanReward objectReward">
            <strong>{tx(language,'Objet découvert','Item discovered')} : {last.reward.object.name}</strong>
            {last.reward.object.description&&<p>{last.reward.object.description}</p>}
            {last.reward.object.logisticsCode&&
              <div className="physicalPickupCallout">
                <span>{tx(language,'OBJET PHYSIQUE','PHYSICAL PROP')}</span>
                <strong>{tx(language,'À récupérer auprès du Maître du Jeu','Collect from the Game Master')}</strong>
                <p>{tx(
                  language,
                  'Présentez-vous au MJ et donnez-lui simplement ce code :',
                  'Show the GM this pickup code:'
                )}</p>
                <b>{last.reward.object.logisticsCode}</b>
              </div>
            }
          </div>
        }

        {last.result.success&&last.reward?.kind==='NONE'&&
          <p>{tx(language,'Tu ne trouves rien de nouveau ici.','You find nothing new here.')}</p>
        }

        {last.result.cost&&
          <small>
            {tx(language,'Coût','Cost')} : {last.result.cost.value} {resourceLabel(last.result.cost.resourceExternalId,language)}
            {' · '}
            {tx(language,'reste','remaining')} {last.result.cost.remaining}
          </small>
        }
      </section>
    }

    {cooldown>0&&
      <section className="playerCard searchCooldownCard">
        <p className="eyebrow">{tx(language,'PROCHAINE FOUILLE','NEXT SEARCH')}</p>
        <div className="searchCountdown">{formatCountdown(cooldown)}</div>
        <p>{tx(
          language,
          'Profite de ce temps pour enquêter, parler aux autres joueurs ou utiliser tes autres actions. Aucun PA n’est consommé pendant l’attente.',
          'Use this time to investigate, talk to other players or use your other actions. No AP is spent while you wait.'
        )}</p>
      </section>
    }

    <section className="playerCard">
      <div className="playerSectionHead">
        <h2>{tx(language,'Actions disponibles','Available actions')}</h2>
        <span>{data.actions.length}</span>
      </div>

      {data.actions.length===0
        ? <p>{tx(
            language,
            'Aucune action autonome n’est disponible ici pour le moment.',
            'No autonomous action is currently available here.'
          )}</p>
        : data.actions.map(a=>
          <article className="scanAction" key={a.externalId}>
            <div className="playerActionTop">
              <div>
                <strong>{a.name}</strong>
                <small>{a.systemFallback
                  ? tx(language,'Action standard','Standard action')
                  : `${a.category} · ${a.resolution}`}
                </small>
              </div>
              {Number(a.costValue??0)>0&&
                <span className="costBadge">
                  {a.costValue} {resourceLabel(a.costResourceExternalId,language)}
                </span>
              }
            </div>

            {a.ability&&
              <p className="playerAbility">
                {a.ability.name} · {tx(language,'niv.','lvl.')} {a.ability.level}
              </p>
            }

            {a.diceCount&&a.diceSides
              ? <p className="scanDice">
                  {tx(language,'Jet','Roll')} : {a.diceCount}D{a.diceSides}
                  {a.difficulty!=null
                    ? ` · ${tx(language,'difficulté','difficulty')} ${a.difficulty}`
                    : ''}
                </p>
              : null
            }

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
                ? tx(language,'Résolution…','Resolving…')
                : a.searchCooldownRemainingSeconds&&cooldown>0
                  ? `${tx(language,'Fouiller dans','Search in')} ${formatCountdown(cooldown)}`
                  : a.available
                    ? a.name
                    : (a.blockedReason||tx(language,'Indisponible','Unavailable'))}
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
          <p className="eyebrow">{tx(language,'CONFIRMATION D’ACTION','ACTION CONFIRMATION')}</p>
          <h2>{pendingAction.name}</h2>
          <p>
            {tx(language,'Voulez-vous dépenser','Do you want to spend')}{' '}
            <strong>{pendingAction.costValue} {language==='EN'?'AP':'PA'}</strong>{' '}
            {tx(language,'pour tenter cette action ?','to attempt this action?')}
          </p>

          {pendingAction.currentCostResourceValue!=null&&
            <div className="paSpendPreview">
              <span>{tx(language,'Avant','Before')} <strong>{pendingAction.currentCostResourceValue} {language==='EN'?'AP':'PA'}</strong></span>
              <span>{tx(language,'Après','After')} <strong>{Math.max(0,Number(pendingAction.currentCostResourceValue)-Number(pendingAction.costValue??0))} {language==='EN'?'AP':'PA'}</strong></span>
            </div>
          }

          <div className="giveConfirmActions">
            <button className="playerSecondary" onClick={()=>setPendingAction(null)}>
              {tx(language,'Non','No')}
            </button>
            <button className="playerPrimary" onClick={()=>{
              const action=pendingAction;
              setPendingAction(null);
              void execute(action);
            }}>
              {tx(language,'Oui, continuer','Yes, continue')}
            </button>
          </div>
        </div>
      </div>
    }

    <a className="playerSecondary scanBack" href={`/?player=${encodeURIComponent(token)}`}>
      ← {tx(language,'Retour à ma fiche','Back to my character sheet')}
    </a>

    <footer className="playerFooter">Murder Engine · Ludificateur</footer>
  </main>;
}
