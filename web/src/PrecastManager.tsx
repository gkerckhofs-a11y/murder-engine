import { useEffect, useMemo, useState } from 'react';

type ScenarioVersion = {
  id:string;
  versionLabel:string;
  variantName?:string|null;
  language?:string|null;
  status:string;
  minPlayers?:number|null;
  maxPlayers?:number|null;
  playableCharacters:number;
  genderComposition:{feminine:number;masculine:number;flexible:number;total:number};
};

type Registration = {
  id:string;
  displayName:string;
  email:string;
  ageBracket:string;
  genderPreference?:string|null;
  desiredInvolvement:string;
  notes?:string|null;
  status:string;
  transferredSessionId?:string|null;
  submittedAt?:string|null;
  active?:boolean;
};

type Campaign = {
  id:string;
  name:string;
  token:string;
  language:string;
  status:string;
  plannedAt?:string|null;
  venueHint?:string|null;
  publicNote?:string|null;
  openCount:number;
  submissionCount:number;
  scenario:{id:string;title:string};
  registrations:Registration[];
  versions?:ScenarioVersion[];
  counts:{
    registrations:number;
    available:number;
    transferred:number;
    femininePreference:number;
    masculinePreference:number;
    noPreference:number;
    highInvolvement:number;
  };
};

type Scenario = {
  id:string;
  title:string;
  versions:Array<{
    id:string;
    versionLabel:string;
    variantName?:string|null;
    status:string;
    language:string;
    minPlayers?:number|null;
    maxPlayers?:number|null;
    counts:{playableCharacters:number};
  }>;
};

async function readJson<T>(url:string,init?:RequestInit):Promise<T>{
  const r=await fetch(url,init);
  const raw=await r.text();
  let data:any=null;
  try{data=raw?JSON.parse(raw):null}catch{}
  if(!r.ok)throw new Error(data?.message??data?.error??raw??`HTTP ${r.status}`);
  return data as T;
}
function postJson<T=any>(url:string,body:any){
  return readJson<T>(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
}
function localInput(v?:string|null){
  if(!v)return '';
  const d=new Date(v);
  if(Number.isNaN(d.getTime()))return '';
  const p=(n:number)=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
function dateLabel(v?:string|null){
  if(!v)return 'Date non définie';
  const d=new Date(v);
  return Number.isNaN(d.getTime())?String(v):new Intl.DateTimeFormat('fr-BE',{dateStyle:'medium',timeStyle:'short'}).format(d);
}
function genderPrefLabel(v?:string|null){
  return ({FEMININ:'F',MASCULIN:'M',SANS_PREFERENCE:'Sans préférence',A_DISCUTER:'À discuter'} as Record<string,string>)[String(v??'')]??'Sans préférence';
}
function involvementLabel(v?:string|null){
  return ({TRANQUILLE:'Tranquille',ACTIF:'Actif',TRES_IMPLIQUE:'Très impliqué',PREMIER_ROLE:'Premier rôle'} as Record<string,string>)[String(v??'')]??String(v??'—');
}

export function PrecastManager({
  scenarios,
  initialScenarioId,
  onOpenSession,
}:{
  scenarios:Scenario[];
  initialScenarioId?:string|null;
  onOpenSession:(sessionId:string)=>void;
}){
  const [campaigns,setCampaigns]=useState<Campaign[]>([]);
  const [campaign,setCampaign]=useState<Campaign|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [createOpen,setCreateOpen]=useState(Boolean(initialScenarioId));
  const [scenarioId,setScenarioId]=useState(initialScenarioId||scenarios[0]?.id||'');
  const [name,setName]=useState('');
  const [language,setLanguage]=useState('FR');
  const [plannedAt,setPlannedAt]=useState('');
  const [venueHint,setVenueHint]=useState('');
  const [publicNote,setPublicNote]=useState('');
  const [busy,setBusy]=useState(false);
  const [copied,setCopied]=useState('');

  async function loadCampaigns(){
    setLoading(true);setError('');
    try{
      const r=await readJson<{ok:boolean;campaigns:Campaign[]}>('/api/precast/list');
      setCampaigns(r.campaigns??[]);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  }
  async function openCampaign(id:string){
    setLoading(true);setError('');
    try{
      const r=await readJson<{ok:boolean;campaign:Campaign}>(`/api/precast/detail?campaignId=${encodeURIComponent(id)}`);
      setCampaign(r.campaign);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  }
  useEffect(()=>{void loadCampaigns();},[]);
  useEffect(()=>{
    if(initialScenarioId){
      setScenarioId(initialScenarioId);
      setCreateOpen(true);
    }
  },[initialScenarioId]);

  async function create(){
    if(!scenarioId)return;
    setBusy(true);setError('');
    try{
      const r=await postJson<{ok:boolean;campaign:{id:string}}>('/api/precast/create',{
        scenarioId,
        name:name.trim()||undefined,
        language,
        plannedAt:plannedAt?new Date(plannedAt).toISOString():null,
        venueHint,
        publicNote,
      });
      setName('');setPlannedAt('');setVenueHint('');setPublicNote('');setCreateOpen(false);
      await loadCampaigns();
      await openCampaign(r.campaign.id);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  }

  if(campaign){
    return <CampaignDetail
      campaign={campaign}
      busy={busy}
      error={error}
      onBack={()=>{setCampaign(null);void loadCampaigns();}}
      onRefresh={()=>void openCampaign(campaign.id)}
      onBusy={setBusy}
      onError={setError}
      onOpenSession={onOpenSession}
    />;
  }

  const visible=initialScenarioId?campaigns.filter(c=>c.scenario.id===initialScenarioId):campaigns;
  const chosen=scenarios.find(s=>s.id===scenarioId);

  return <section>
    {error&&<p className="errorbox standalone">{error}</p>}
    <div className="sectionhead">
      <div><p className="eyebrow">AVANT LA SESSION</p><h2>Inscriptions & pré-casting</h2><p>Collecte les profils d’abord. La session et la variante seront choisies ensuite à partir du groupe réel.</p></div>
      <button onClick={()=>setCreateOpen(v=>!v)}>{createOpen?'Fermer':' + Nouveau lien d’inscription'}</button>
    </div>

    {createOpen&&<section className="card editSessionPanel">
      <div className="paneHead"><div><p className="eyebrow">NOUVELLE CAMPAGNE</p><h3>Créer un lien d’inscription</h3><p>Aucune session n’est créée à cette étape.</p></div></div>
      <div className="formGrid editSessionFields">
        <label>Scénario<select value={scenarioId} onChange={e=>{setScenarioId(e.target.value);const sc=scenarios.find(x=>x.id===e.target.value);const lang=sc?.versions.find(v=>v.status!=='ARCHIVED')?.language;setLanguage(String(lang||'FR').toUpperCase()==='EN'?'EN':'FR');}}>
          <option value="">Choisir…</option>{scenarios.filter(s=>!initialScenarioId||s.id===initialScenarioId).map(s=><option value={s.id} key={s.id}>{s.title}</option>)}
        </select></label>
        <label>Nom de la campagne<input value={name} onChange={e=>setName(e.target.value)} placeholder={chosen?`${chosen.title} — inscriptions`:'Ex. Cosa Nostra — octobre'}/></label>
        <label>Langue du formulaire<select value={language} onChange={e=>setLanguage(e.target.value)}><option value="FR">Français</option><option value="EN">English</option></select></label>
        <label>Date envisagée <span>(optionnel)</span><input type="datetime-local" value={plannedAt} onChange={e=>setPlannedAt(e.target.value)}/></label>
        <label>Lieu envisagé <span>(optionnel)</span><input value={venueHint} onChange={e=>setVenueHint(e.target.value)}/></label>
      </div>
      <label>Message public <span>(optionnel)</span><textarea value={publicNote} onChange={e=>setPublicNote(e.target.value)} placeholder="Informations utiles pour les participants…"/></label>
      <div className="formActions"><button className="secondary" disabled={busy} onClick={()=>setCreateOpen(false)}>Annuler</button><button disabled={busy||!scenarioId} onClick={()=>void create()}>{busy?'Création…':'Créer le lien'}</button></div>
    </section>}

    {loading&&campaigns.length===0?<section className="card emptyState">Chargement…</section>:
      visible.length===0?<section className="card emptyState"><strong>Aucune campagne d’inscription.</strong><p>Crée un lien public depuis ici ou directement depuis un scénario.</p></section>:
      <div className="scenarioGrid">{visible.map(c=>{
        const link=`${window.location.origin}/?register=${encodeURIComponent(c.token)}`;
        return <article className="scenarioCard sessionCard" key={c.id}>
          <div className="scenarioTitleRow"><div><span className="micro">{c.scenario.title}</span><h3>{c.name}</h3></div><span className={`sessionStatus ${c.status==='OPEN'?'ready':'archived'}`}>{c.status==='OPEN'?'Ouvert':'Fermé'}</span></div>
          <p className="sessionMeta">{c.plannedAt?dateLabel(c.plannedAt):'Date à définir'}{c.venueHint?` · ${c.venueHint}`:''}</p>
          <div className="precastStats"><div><span>Inscrits disponibles</span><strong>{c.counts.available}</strong></div><div><span>Déjà transférés</span><strong>{c.counts.transferred}</strong></div><div><span>Ouvertures</span><strong>{c.openCount}</strong></div></div>
          <div className="shareLink"><input readOnly value={link}/><button className="secondary" onClick={async()=>{await navigator.clipboard.writeText(link);setCopied(c.id);setTimeout(()=>setCopied(''),1500);}}>{copied===c.id?'Copié ✓':'Copier'}</button></div>
          <button className="wide secondary" onClick={()=>void openCampaign(c.id)}>Ouvrir les inscriptions</button>
        </article>;
      })}</div>
    }
  </section>;
}

function CampaignDetail({
  campaign,busy,error,onBack,onRefresh,onBusy,onError,onOpenSession
}:{
  campaign:Campaign;busy:boolean;error:string;onBack:()=>void;onRefresh:()=>void;
  onBusy:(v:boolean)=>void;onError:(v:string)=>void;onOpenSession:(id:string)=>void;
}){
  const available=campaign.registrations.filter(r=>r.active!==false&&r.status!=='TRANSFERRED');
  const [selected,setSelected]=useState<string[]>(available.map(r=>r.id));
  const compatibleVersions=useMemo(()=>campaign.versions??[],[campaign.versions]);
  const [versionId,setVersionId]=useState(compatibleVersions.find(v=>{
    const min=v.minPlayers??v.playableCharacters;const max=v.maxPlayers??v.playableCharacters;
    return available.length>=min&&available.length<=max;
  })?.id||compatibleVersions[0]?.id||'');
  const version=compatibleVersions.find(v=>v.id===versionId);
  const [name,setName]=useState(`${campaign.scenario.title} — session`);
  const [scheduledAt,setScheduledAt]=useState(localInput(campaign.plannedAt));
  const [venue,setVenue]=useState(campaign.venueHint||'');
  const [language,setLanguage]=useState(campaign.language||'FR');
  const [copied,setCopied]=useState(false);
  const link=`${window.location.origin}/?register=${encodeURIComponent(campaign.token)}`;

  useEffect(()=>{
    setSelected(available.map(r=>r.id));
  },[campaign.id,campaign.registrations.length]);

  const min=version?.minPlayers??version?.playableCharacters??0;
  const max=version?.maxPlayers??version?.playableCharacters??0;
  const countOk=Boolean(version)&&selected.length>=min&&selected.length<=max;

  async function toggleStatus(){
    onBusy(true);onError('');
    try{
      await postJson('/api/precast/status',{campaignId:campaign.id,status:campaign.status==='OPEN'?'CLOSED':'OPEN'});
      onRefresh();
    }catch(e){onError(e instanceof Error?e.message:String(e));}
    finally{onBusy(false);}
  }

  async function createSession(){
    if(!versionId||!selected.length)return;
    onBusy(true);onError('');
    try{
      const r=await postJson<{ok:boolean;result:{session:{id:string}}}>('/api/precast/create-session',{
        campaignId:campaign.id,
        versionId,
        registrationIds:selected,
        name,
        scheduledAt:scheduledAt?new Date(scheduledAt).toISOString():null,
        venue,
        language,
      });
      onOpenSession(r.result.session.id);
    }catch(e){onError(e instanceof Error?e.message:String(e));}
    finally{onBusy(false);}
  }

  return <section>
    {error&&<p className="errorbox standalone">{error}</p>}
    <button className="backlink" onClick={onBack}>← Inscriptions</button>
    <section className="sessionHero">
      <div className="sessionHeroDate"><strong>{campaign.counts.available}</strong><span>inscrit(s) disponible(s)</span></div>
      <div className="sessionHeroMain"><p className="eyebrow">{campaign.scenario.title}</p><h2>{campaign.name}</h2><p>{campaign.plannedAt?dateLabel(campaign.plannedAt):'Date encore libre'} · {campaign.language}</p></div>
      <span className={`sessionStatus large ${campaign.status==='OPEN'?'ready':'archived'}`}>{campaign.status==='OPEN'?'Ouvert':'Fermé'}</span>
    </section>

    <section className="card precastPanel">
      <div className="precastHead"><div><p className="eyebrow">LIEN PUBLIC</p><h3>Inscription avant création de session</h3><p>Ce lien reste lié au scénario, pas à une session.</p></div><button className={campaign.status==='OPEN'?'danger secondary':'secondary'} disabled={busy} onClick={()=>void toggleStatus()}>{campaign.status==='OPEN'?'Fermer les inscriptions':'Rouvrir les inscriptions'}</button></div>
      <div className="shareLink"><input readOnly value={link}/><button className="secondary" onClick={async()=>{await navigator.clipboard.writeText(link);setCopied(true);setTimeout(()=>setCopied(false),1500);}}>{copied?'Copié ✓':'Copier le lien'}</button><a className="buttonLink" href={link} target="_blank" rel="noreferrer">Tester</a></div>
      <div className="precastStats"><div><span>Réponses</span><strong>{campaign.counts.registrations}</strong></div><div><span>F</span><strong>{campaign.counts.femininePreference}</strong></div><div><span>M</span><strong>{campaign.counts.masculinePreference}</strong></div><div><span>Sans préférence</span><strong>{campaign.counts.noPreference}</strong></div><div><span>Très impliqués / 1ers rôles</span><strong>{campaign.counts.highInvolvement}</strong></div></div>
    </section>

    <section className="card castingBoard">
      <div className="paneHead"><div><p className="eyebrow">RÉPONSES</p><h3>Sélectionner les participants</h3><p>Les personnes déjà transférées dans une session restent visibles mais ne peuvent plus être sélectionnées.</p></div><span>{selected.length}/{available.length}</span></div>
      {campaign.registrations.length===0?<p className="empty">Aucune réponse pour le moment.</p>:<div className="castingTable">
        {campaign.registrations.map(r=>{
          const transferred=r.status==='TRANSFERRED';
          const checked=selected.includes(r.id);
          return <label className={`castingRow registrationRow ${transferred?'archived':''}`} key={r.id}>
            <input type="checkbox" disabled={transferred} checked={!transferred&&checked} onChange={e=>setSelected(ids=>e.target.checked?[...ids,r.id]:ids.filter(id=>id!==r.id))}/>
            <div className="participantIdentity"><strong>{r.displayName}</strong><small>{r.email}</small><div className="participantBadges"><span className="ageBadge">{r.ageBracket}</span><span>{genderPrefLabel(r.genderPreference)}</span><span className="involvementBadge">{involvementLabel(r.desiredInvolvement)}</span></div>{r.notes&&<small>{r.notes}</small>}</div>
            <span className={`castDot ${transferred?'done':''}`}>{transferred?'Session ✓':checked?'✓':'…'}</span>
          </label>;
        })}
      </div>}
    </section>

    <section className="card editSessionPanel">
      <div className="paneHead"><div><p className="eyebrow">ÉTAPE SUIVANTE</p><h3>Créer la session à partir de ce groupe</h3><p>Choisis maintenant la variante adaptée aux {selected.length} personnes sélectionnées.</p></div></div>
      <div className="formGrid editSessionFields">
        <label>Variante<select value={versionId} onChange={e=>setVersionId(e.target.value)}>
          <option value="">Choisir…</option>{compatibleVersions.map(v=>{
            const vmin=v.minPlayers??v.playableCharacters;const vmax=v.maxPlayers??v.playableCharacters;
            const ok=selected.length>=vmin&&selected.length<=vmax;
            return <option value={v.id} key={v.id}>{ok?'✓ ':'⚠ '}{v.variantName||`V${v.versionLabel}`} · {vmin===vmax?vmin:`${vmin}–${vmax}`} joueurs</option>;
          })}
        </select></label>
        <label>Nom de la session<input value={name} onChange={e=>setName(e.target.value)}/></label>
        <label>Date & heure<input type="datetime-local" value={scheduledAt} onChange={e=>setScheduledAt(e.target.value)}/></label>
        <label>Lieu<input value={venue} onChange={e=>setVenue(e.target.value)}/></label>
        <label>Langue joueurs<select value={language} onChange={e=>setLanguage(e.target.value)}><option value="FR">Français</option><option value="EN">English</option></select></label>
      </div>
      {version&&<p className={countOk?'microNote':'errorbox'}>{countOk?`✓ ${selected.length} joueurs : compatible avec cette variante.`:`Cette variante attend ${min===max?min:`${min}–${max}`} joueurs ; tu en as sélectionné ${selected.length}.`}</p>}
      <button disabled={busy||!countOk||!name.trim()} onClick={()=>void createSession()}>{busy?'Création de la session…':`Créer la session avec ${selected.length} participant(s)`}</button>
    </section>
  </section>;
}

export function PublicRegistrationView({token}:{token:string}){
  const [campaign,setCampaign]=useState<any|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [submitted,setSubmitted]=useState(false);
  const [busy,setBusy]=useState(false);
  const [displayName,setDisplayName]=useState('');
  const [email,setEmail]=useState('');
  const [ageBracket,setAgeBracket]=useState('');
  const [genderPreference,setGenderPreference]=useState('SANS_PREFERENCE');
  const [desiredInvolvement,setDesiredInvolvement]=useState('ACTIF');
  const [notes,setNotes]=useState('');

  useEffect(()=>{void (async()=>{
    try{
      const r=await readJson<{ok:boolean;campaign:any}>(`/api/public/registration/campaign?token=${encodeURIComponent(token)}`);
      setCampaign(r.campaign);
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  })();},[token]);

  const en=String(campaign?.language??'FR').toUpperCase()==='EN';
  const t=(fr:string,enText:string)=>en?enText:fr;
  if(loading)return <main className="publicShell"><section className="publicCard card">{t('Chargement de l’inscription…','Loading registration…')}</section></main>;
  if(error||!campaign)return <main className="publicShell"><section className="publicCard card"><p className="eyebrow">MURDER ENGINE</p><h1>{t('Lien indisponible','Link unavailable')}</h1><p>{t('Ce lien d’inscription est fermé, invalide ou n’existe plus.','This registration link is closed, invalid or no longer exists.')}</p></section></main>;
  if(submitted)return <main className="publicShell"><section className="publicCard card successPublic"><span className="successGlyph">✓</span><p className="eyebrow">{t('INSCRIPTION ENVOYÉE','REGISTRATION SENT')}</p><h1>{t(`Merci ${displayName} !`,`Thank you ${displayName}!`)}</h1><p>{t('Tes préférences ont bien été transmises. L’organisateur créera la session et attribuera les rôles ensuite.','Your preferences have been sent. The organizer will create the session and assign roles afterwards.')}</p></section></main>;

  return <main className="publicShell"><section className="publicCard card">
    <p className="eyebrow">{campaign.scenario.title}</p><h1>{campaign.name}</h1>
    {(campaign.plannedAt||campaign.venue)&&<p className="publicMeta">{campaign.plannedAt?new Intl.DateTimeFormat(en?'en-GB':'fr-BE',{dateStyle:'full',timeStyle:'short'}).format(new Date(campaign.plannedAt)):''}{campaign.venue?` · ${campaign.venue}`:''}</p>}
    {campaign.scenario.playerSummary&&<p className="publicPitch">{campaign.scenario.playerSummary}</p>}
    {campaign.publicNote&&<div className="privacyNote">{campaign.publicNote}</div>}
    <div className="privacyNote">{t('Ces informations servent uniquement à préparer le groupe et le casting. Aucune préférence ne garantit un personnage précis.','This information is only used to prepare the group and casting. No preference guarantees a specific character.')}</div>
    <div className="publicForm">
      <label>{t('Prénom / nom','Name')}<input autoComplete="name" value={displayName} onChange={e=>setDisplayName(e.target.value)} placeholder={t('Ton prénom…','Your name…')}/></label>
      <label>{t('E-mail','Email')} <span>({t('obligatoire','required')})</span><input required autoComplete="email" type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
      <label>{t('Tranche d’âge','Age range')} <span>({t('obligatoire','required')})</span><select required value={ageBracket} onChange={e=>setAgeBracket(e.target.value)}>
        <option value="" disabled>{t('Choisis…','Choose…')}</option><option value="MOINS_18">{t('Moins de 18 ans','Under 18')}</option><option value="18_25">18–25</option><option value="26_40">26–40</option><option value="41_60">41–60</option><option value="60_PLUS">60+</option>
      </select></label>
      <label>{t('Préférence de personnage','Character preference')}<select value={genderPreference} onChange={e=>setGenderPreference(e.target.value)}>
        <option value="SANS_PREFERENCE">{t('Aucune préférence','No preference')}</option><option value="MASCULIN">{t('Personnage masculin','Male character')}</option><option value="FEMININ">{t('Personnage féminin','Female character')}</option><option value="A_DISCUTER">{t('À discuter','Discuss with organizer')}</option>
      </select></label>
      <label>{t('Implication souhaitée','Desired involvement')}<select value={desiredInvolvement} onChange={e=>setDesiredInvolvement(e.target.value)}>
        <option value="TRANQUILLE">{t('Tranquille — sans trop de pression','Relaxed — low pressure')}</option><option value="ACTIF">{t('Actif — participer pleinement','Active — fully involved')}</option><option value="TRES_IMPLIQUE">{t('Très impliqué — beaucoup de jeu','Highly involved — lots of play')}</option><option value="PREMIER_ROLE">{t('Premier rôle — au centre de l’action','Leading role — center of the action')}</option>
      </select></label>
      <label>{t('Envie particulière de jeu','Anything else you would like')} <span>({t('facultatif','optional')})</span><textarea maxLength={500} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
      <button disabled={busy||displayName.trim().length<2||!email.includes('@')||!ageBracket} onClick={async()=>{
        setBusy(true);setError('');
        try{
          await postJson('/api/public/registration/submit',{token,displayName,email,ageBracket,genderPreference,desiredInvolvement,notes});
          setSubmitted(true);
        }catch(e){setError(e instanceof Error?e.message:String(e));}
        finally{setBusy(false);}
      }}>{busy?t('Envoi…','Sending…'):t('Envoyer mon inscription','Send my registration')}</button>
      {error&&<p className="errorbox">{error}</p>}
    </div>
  </section></main>;
}
