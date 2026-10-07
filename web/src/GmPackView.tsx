import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import JSZip from 'jszip';
import QRCode from 'qrcode';
import { asSkinId, skinClassFor, defaultAccentForSkin } from './skin-registry';
import NarrativeText from './NarrativeText';
import { organizerToken } from './admin-auth';

type Props={versionId?:string;sessionId?:string};

async function fetchJson<T=any>(url:string,init?:RequestInit):Promise<T>{
  const r=await fetch(url,init);

  const contentType=
    r.headers.get('content-type')??'';

  const text=await r.text();

  let data:any=null;

  if(contentType.includes('application/json')){
    try{
      data=text?JSON.parse(text):{};
    }catch{
      throw new Error(
        `Réponse JSON invalide reçue depuis ${url}`
      );
    }
  }else{
    throw new Error(
      `La route ${url} ne renvoie pas du JSON. `+
      `Elle pointe probablement vers l'application React au lieu de la Function.`
    );
  }

  if(!r.ok)
    throw new Error(
      data?.message||
      data?.error||
      `HTTP ${r.status}`
    );

  return data;
}

function printUrl(
  versionId:string|undefined,
  mode:string,
  sessionId?:string
){
  const params=new URLSearchParams();

  if(sessionId)
    params.set('gmPackSession',sessionId);
  else if(versionId)
    params.set('gmPack',versionId);

  params.set('print',mode);

  return `/?${params.toString()}`;
}

function safeFilename(value:string){
  return String(value||'qr')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9_-]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .toLowerCase();
}

async function addQrFiles(
  folder:any,
  filename:string,
  url:string
){
  const svg=await QRCode.toString(url,{
    type:'svg',
    errorCorrectionLevel:'M',
    margin:2,
    width:800,
  });

  folder.file(`${filename}.svg`,svg);

  const png=await QRCode.toDataURL(url,{
    errorCorrectionLevel:'M',
    margin:3,
    width:1200,
  });

  folder.file(
    `${filename}.png`,
    png.split(',')[1],
    {base64:true}
  );
}

async function downloadQrZip(
  pack:any,
  kind:'full'|'locations'|'access'|'characters'='full'
){
  const zip=new JSZip();

  async function addCharacters(){
    const folder=zip.folder('QR-PERSONNAGES-INTERACTIONS');
    if(!folder)throw new Error('ZIP_FOLDER_ERROR');

    for(const character of pack.logistics.qrCharacters??[]){
      const url=
        window.location.origin+
        '/scan/character/'+
        encodeURIComponent(character.externalId);

      const filename=
        safeFilename(character.externalId)+
        '-'+
        safeFilename(character.name);

      await addQrFiles(folder,filename,url);
    }
  }

  async function addLocations(){
    const folder=zip.folder('QR-LIEUX');
    if(!folder)throw new Error('ZIP_FOLDER_ERROR');

    for(const location of pack.logistics.qrLocations??[]){
      const url=
        window.location.origin+
        '/scan/'+
        encodeURIComponent(location.externalId);

      const filename=
        safeFilename(location.externalId)+
        '-'+
        safeFilename(location.name);

      await addQrFiles(folder,filename,url);
    }
  }

  async function addAccess(){
    if(!pack.session)throw new Error('PACK_SESSION_REQUIRED');

    const folder=zip.folder('QR-ACCES-JOUEURS');
    if(!folder)throw new Error('ZIP_FOLDER_ERROR');

    const rows=pack.session.playerAccess??[];

    for(const row of rows){
      const url=
        window.location.origin+
        '/?player='+
        encodeURIComponent(row.playerAccessToken);

      const filename=
        safeFilename(row.characterExternalId)+
        '-'+
        safeFilename(row.characterName);

      await addQrFiles(folder,filename,url);
    }

    const escapeCsv=(value:any)=>
      '"'+String(value??'').replace(/"/g,'""')+'"';

    const csv=[
      'Personnage,Joueur,Lien',
      ...rows.map((row:any)=>{
        const url=
          window.location.origin+
          '/?player='+
          encodeURIComponent(row.playerAccessToken);

        return [
          escapeCsv(row.characterName),
          escapeCsv(row.participantDisplayName),
          escapeCsv(url),
        ].join(',');
      }),
    ].join('\n');

    folder.file('correspondance-joueurs.csv',csv);
  }

  if(kind==='full'||kind==='locations')await addLocations();
  if(kind==='full'||kind==='characters')await addCharacters();
  if(kind==='full'||kind==='access')await addAccess();

  const readme=[
    'MURDER ENGINE — PACK ORGANISATEUR',
    '',
    'Scénario : '+pack.scenario.title,
    pack.session?'Session : '+pack.session.name:'Version : '+pack.scenario.versionLabel,
    '',
    'QR lieux et QR personnages : réutilisables entre sessions.',
    'QR accès joueurs : propres à la session.',
    '',
    'Les planches A4 sont accessibles depuis l’écran Pack MJ.',
  ].join('\n');

  zip.file('LISEZ-MOI.txt',readme);

  const blob=await zip.generateAsync({
    type:'blob',
    compression:'DEFLATE',
    compressionOptions:{level:6}
  });

  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;

  const prefix=
    kind==='locations'
      ? 'QR-LIEUX'
      : kind==='access'
        ? 'QR-ACCES-JOUEURS'
        : kind==='characters'
          ? 'QR-PERSONNAGES'
          : 'PACK-ORGANISATEUR';

  anchor.download=
    prefix+
    '-'+
    safeFilename(pack.scenario.title)+
    '-'+
    safeFilename(pack.session?.name||pack.scenario.versionLabel)+
    '.zip';

  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}


function PrintControls(){
  return <div className="gmPrintControls">
    <button onClick={()=>window.print()}>🖨 Imprimer</button>
    <button onClick={()=>window.close()}>Fermer</button>
  </div>;
}

function CharacterSheets({pack,skinClass}:{pack:any;skinClass:string}){
  return <main className={`gmPrintRoot ${skinClass}`}>
    <PrintControls/>

    {pack.printables.characterSheets.map((c:any)=>
      <article className="gmPrintPage gmCharacterPrint" key={c.externalId}>

        <header className="gmPrintHeader">
          <p>{pack.scenario.title} · {pack.scenario.era||''}</p>
          {c.portrait?.source&&<img className="gmCharacterPortrait" src={c.portrait.source} alt={c.portrait.altText||c.name}/>}
          <h1>{c.name}</h1>
          <h2>{c.publicRole||'Personnage'}</h2>
          {c.narrativeAge&&<span>{c.narrativeAge}</span>}
        </header>

        {c.motto&&
          <blockquote>« {c.motto} »</blockquote>
        }

        <section>
          <h3>Mon histoire</h3>
          <NarrativeText text={c.biography||'—'} className="gmNarrativeText"/>
        </section>

        {c.interpretationNotes&&
          <section>
            <h3>Comment me la jouer</h3>
            <NarrativeText text={c.interpretationNotes} className="gmNarrativeText"/>
          </section>
        }

        {c.appearanceNotes&&
          <section>
            <h3>Mon apparence</h3>
            <NarrativeText text={c.appearanceNotes} className="gmNarrativeText"/>
          </section>
        }

        {c.secretIntro&&
          <section className="gmPrintSecret">
            <h3>Ce que vous seul savez</h3>
            <NarrativeText text={c.secretIntro} className="gmNarrativeText compact"/>
          </section>
        }

        {c.apparentMotive&&
          <section>
            <h3>Ma position</h3>
            <NarrativeText text={c.apparentMotive} className="gmNarrativeText compact"/>
          </section>
        }

        {c.personalTimeline&&
          <section>
            <h3>Ma chronologie</h3>
            <NarrativeText text={c.personalTimeline} className="gmNarrativeText"/>
          </section>
        }

        <section>
          <h3>Mes objectifs</h3>

          {!c.objectives.length
            ? <p>—</p>
            : <ol>
              {c.objectives.map((o:any)=>
                <li key={o.externalId}>
                  <strong>{o.title}</strong>
                  <p>{o.description}</p>
                </li>
              )}
            </ol>
          }
        </section>

        {c.relationships.length>0&&
          <section>
            <h3>Mes relations</h3>

            {c.relationships.map((r:any)=>
              <div className="gmPrintRelation" key={r.externalId}>
                <strong>{r.otherName}</strong>
                {r.otherPublicRole&&<span> · {r.otherPublicRole}</span>}
                {r.relationType&&<small>{r.relationType}</small>}
                <p>{r.text}</p>
              </div>
            )}
          </section>
        }

        {(c.startingDocuments.length>0||c.startingObjects.length>0)&&
          <section className="gmPrintStarting">
            <h3>Matériel de départ</h3>

            <ul>
              {c.startingDocuments.map((d:any)=>
                <li key={d.externalId}>{d.title}</li>
              )}

              {c.startingObjects.map((o:any)=>
                <li key={o.externalId}>{o.name}</li>
              )}
            </ul>
          </section>
        }

        <footer>
          Murder Engine · Ludificateur · {pack.scenario.versionLabel}
        </footer>

      </article>
    )}
  </main>;
}

function SetupPrint({pack,skinClass}:{pack:any;skinClass:string}){
  return <main className={`gmPrintRoot ${skinClass}`}>
    <PrintControls/>

    <article className="gmPrintPage">
      <header className="gmPrintHeader">
        <p>MURDER ENGINE · CHECKLIST MJ</p>
        <h1>{pack.scenario.title}</h1>
        <h2>Installation</h2>
      </header>

      <div className="gmChecklistPrint">
        {pack.printables.setupChecklist.map((row:any,index:number)=>
          <label key={`${row.group}-${index}`}>
            <span className="gmCheckbox"/>
            <span>
              <small>{row.group}</small>
              <strong>{row.label}</strong>
            </span>
          </label>
        )}
      </div>
    </article>


    <article className="gmPrintPage gmPlacementPage">
      <header className="gmPrintHeader">
        <p>MURDER ENGINE · PLAN DE PLACEMENT</p>
        <h1>{pack.scenario.title}</h1>
        <h2>Indices, documents & objets</h2>
      </header>

      <table className="gmPlacementTable">
        <thead>
          <tr>
            <th>✓</th>
            <th>Type</th>
            <th>Élément</th>
            <th>Placement initial</th>
            <th>Code</th>
          </tr>
        </thead>

        <tbody>
          {pack.printables.placementRows.map((row:any)=>
            <tr className={row.major?'important':''} key={`${row.type}-${row.externalId}`}>
              <td>□</td>
              <td>{row.type}</td>
              <td>{row.name}</td>
              <td>{row.placement}</td>
              <td>{row.logisticsCode||''}</td>
            </tr>
          )}
        </tbody>
      </table>
    </article>
  </main>;
}

function LabelsPrint({pack,skinClass}:{pack:any;skinClass:string}){
  return <main className={`gmPrintRoot ${skinClass}`}>
    <PrintControls/>

    <article className="gmPrintLabelsPage">

      <header className="gmPrintHeader gmLabelsHeader">
        <p>MURDER ENGINE · ÉTIQUETTES</p>
        <h1>{pack.scenario.title}</h1>
        <h2>Enveloppes personnages</h2>
      </header>

      <div className="gmLabelGrid">
        {pack.printables.envelopeLabels.map((label:any)=>
          <section className="gmEnvelopeLabel" key={label.characterExternalId}>
            <p>ENVELOPPE PERSONNAGE</p>
            <h2>{label.name}</h2>

            {label.publicRole&&
              <h3>{label.publicRole}</h3>
            }

            <div className="gmEnvelopeContents">
              <strong>À placer dans l’enveloppe</strong>

              {!label.documents.length&&!label.objects.length
                ? <span>Aucun matériel initial</span>
                : <ul>
                  {label.documents.map((x:string)=><li key={`d-${x}`}>{x}</li>)}
                  {label.objects.map((x:string)=><li key={`o-${x}`}>{x}</li>)}
                </ul>
              }
            </div>
          </section>
        )}
      </div>
    </article>
  </main>;
}

function QrSheetPrint({
  pack,
  skinClass,
  mode,
}:{
  pack:any;
  skinClass:string;
  mode:'locations'|'access'|'characters';
}){
  const locationItems=(pack.logistics?.qrLocations??[]).map((x:any)=>({
    key:x.externalId,
    name:x.name,
    subtitle:x.externalId,
    url:window.location.origin+'/scan/'+encodeURIComponent(x.externalId),
    portrait:null,
  }));

  const accessItems=(pack.session?.playerAccess??[]).map((x:any)=>({
    key:x.characterExternalId,
    name:x.characterName,
    subtitle:x.participantDisplayName,
    url:window.location.origin+'/?player='+encodeURIComponent(x.playerAccessToken),
    portrait:null,
  }));

  const characterItems=(pack.logistics?.qrCharacters??[]).map((x:any)=>({
    key:x.externalId,
    name:x.name,
    subtitle:x.publicRole||x.externalId,
    url:window.location.origin+'/scan/character/'+encodeURIComponent(x.externalId),
    portrait:x.portrait?.source||null,
  }));

  const items=
    mode==='locations'
      ? locationItems
      : mode==='access'
        ? accessItems
        : characterItems;

  const title=
    mode==='locations'
      ? 'QR des lieux'
      : mode==='access'
        ? 'QR accès joueurs · cette session'
        : 'QR personnages · interactions';

  return <main className={'gmPrintRoot '+skinClass}>
    <PrintControls/>

    <article className="gmPrintPage gmQrSheetPage">
      <header className="gmPrintHeader">
        <p>MURDER ENGINE · PLANCHES A4</p>
        <h1>{title}</h1>
        <h2>{pack.scenario.title}</h2>
      </header>

      <div className={mode==='characters'?'gmQrSheetGrid illustrated':'gmQrSheetGrid'}>
        {items.map((item:any)=>
          <article className="gmQrSheetCard" key={item.key}>
            {item.portrait&&
              <img className="gmQrSheetPortrait" src={item.portrait} alt={item.name}/>
            }
            <QRCodeSVG value={item.url} size={mode==='characters'?126:150} level="M" includeMargin/>
            <strong>{item.name}</strong>
            <small>{item.subtitle}</small>
          </article>
        )}
      </div>
    </article>
  </main>;
}

function OrganizerDossier({
  pack,
  skinClass,
}:{
  pack:any;
  skinClass:string;
}){
  const characters=pack.printables?.characterSheets??[];
  const clues=pack.materials?.clues??[];

  return <main className={'gmPrintRoot '+skinClass}>
    <PrintControls/>

    <article className="gmPrintPage gmDossierCover">
      <header className="gmPrintHeader">
        <p>MURDER ENGINE · DOSSIER MJ</p>
        <h1>{pack.scenario.title}</h1>
        <h2>{pack.session?.name||('Version '+pack.scenario.versionLabel)}</h2>
      </header>

      <section>
        <h3>Résumé du scénario</h3>
        <NarrativeText
          text={pack.preparation?.gmSummary||'—'}
          className="gmNarrativeText"
        />
      </section>

      <section>
        <h3>Repères</h3>
        <ul>
          <li>{characters.length} personnages</li>
          <li>{clues.length} indices</li>
          <li>{pack.materials?.locations?.length??0} lieux</li>
          <li>{pack.materials?.documents?.length??0} documents</li>
          <li>{pack.materials?.objects?.length??0} objets</li>
        </ul>
      </section>
    </article>

    {characters.map((character:any)=>
      <article className="gmPrintPage gmDossierCharacter" key={character.externalId}>
        <header className="gmPrintHeader">
          {character.portrait?.source&&
            <img
              className="gmCharacterPortrait"
              src={character.portrait.source}
              alt={character.name}
            />
          }
          <p>PERSONNAGE · SYNTHÈSE MJ</p>
          <h1>{character.name}</h1>
          <h2>{character.publicRole||'Personnage'}</h2>
          {character.participantDisplayName&&
            <span>Joué par {character.participantDisplayName}</span>
          }
        </header>

        <section>
          <h3>En bref</h3>
          {character.dramaticFunction&&
            <p><strong>Fonction dramatique :</strong> {character.dramaticFunction}</p>
          }
          {character.apparentMotive&&
            <p><strong>Position / mobile apparent :</strong> {character.apparentMotive}</p>
          }
          {character.secretIntro&&<>
            <h4>Secret / connaissance sensible</h4>
            <NarrativeText
              text={character.secretIntro}
              className="gmNarrativeText compact"
            />
          </>}
        </section>

        <section>
          <h3>Objectifs</h3>
          <ul>
            {(character.objectives??[]).map((o:any)=>
              <li key={o.externalId}>
                <strong>{o.title}</strong> — {o.description}
              </li>
            )}
          </ul>
        </section>

        <section>
          <h3>Relations clés</h3>
          {(character.relationships??[]).map((rel:any)=>
            <p key={rel.externalId}>
              <strong>{rel.otherName}</strong> — {rel.text}
            </p>
          )}
        </section>
      </article>
    )}

    <article className="gmPrintPage gmDossierClues">
      <header className="gmPrintHeader">
        <p>DOSSIER MJ</p>
        <h1>Index des indices</h1>
        <h2>{clues.length} éléments</h2>
      </header>

      <div className="gmClueIndex">
        {clues.map((clue:any)=>
          <section className="gmClueIndexRow" key={clue.externalId}>
            <h3>{clue.major?'★ ':''}{clue.playerName}</h3>
            <small>{clue.externalId} · {clue.clueType} · {clue.support}</small>
            <p>{clue.playerText}</p>
            {clue.gmInterpretation&&
              <p><strong>Lecture MJ :</strong> {clue.gmInterpretation}</p>
            }
            <p className="gmCluePlacement">
              {clue.locationExternalId&&<>Lieu : {clue.locationExternalId} · </>}
              {clue.objectExternalId&&<>Objet : {clue.objectExternalId} · </>}
              {clue.documentExternalId&&<>Document : {clue.documentExternalId}</>}
            </p>
          </section>
        )}
      </div>
    </article>
  </main>;
}

export default function GmPackView({versionId,sessionId}:Props){
  const [pack,setPack]=useState<any|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [qrZipBusy,setQrZipBusy]=useState(false);
  const [productionBusy,setProductionBusy]=useState('');

  useEffect(()=>{
    let alive=true;

    (async()=>{
      try{
        const apiUrl=
          sessionId
            ? `/api/sessions/gm-pack?sessionId=${encodeURIComponent(sessionId)}`
            : `/api/library/gm-pack?versionId=${encodeURIComponent(versionId??'')}`;

        const init:RequestInit={};

        if(sessionId){
          const token=await organizerToken(true);
          if(!token)
            throw new Error('ORGANIZER_AUTH_REQUIRED');

          init.headers={
            authorization:'Bearer '+token,
          };
        }

        const r=
          await fetchJson<{ok:boolean;pack:any}>(
            apiUrl,
            init
          );
        if(!r?.pack)
          throw new Error(
            'Le serveur a répondu sans Pack MJ de session.'
          );

        if(alive)setPack(r.pack);
      }catch(e){
        if(alive)setError(e instanceof Error?e.message:String(e));
      }finally{
        if(alive)setLoading(false);
      }
    })();

    return()=>{alive=false};
  },[versionId,sessionId]);

  if(loading&&!pack)
    return <main className="gmPackShell"><p>Préparation du Pack MJ…</p></main>;

  if(error&&!pack)
    return <main className="gmPackShell"><h1>Pack MJ indisponible</h1><p>{error}</p></main>;

  if(!pack)return null;

  const skinId=asSkinId(pack.presentation?.skinId);
  const skinClass=skinClassFor(skinId);

  const printMode=new URLSearchParams(window.location.search).get('print');

  if(printMode==='characters')
    return <CharacterSheets pack={pack} skinClass={skinClass}/>;

  if(printMode==='setup')
    return <SetupPrint pack={pack} skinClass={skinClass}/>;

  if(printMode==='labels')
    return <LabelsPrint pack={pack} skinClass={skinClass}/>;

  if(printMode==='dossier')
    return <OrganizerDossier pack={pack} skinClass={skinClass}/>;

  if(printMode==='qr-locations')
    return <QrSheetPrint pack={pack} skinClass={skinClass} mode="locations"/>;

  if(printMode==='qr-access')
    return <QrSheetPrint pack={pack} skinClass={skinClass} mode="access"/>;

  if(printMode==='qr-characters')
    return <QrSheetPrint pack={pack} skinClass={skinClass} mode="characters"/>;

  const s=pack.scenario;
  const c=pack.counts;

  return <main
    className={`gmPackShell ${skinClass}`}
    style={{'--skin-accent':pack.presentation?.accentColor||defaultAccentForSkin(skinId)} as any}
  >

    <header className="gmPackHero">
      <div>
        <p className="gmPackEyebrow">MURDER ENGINE · PACK MJ</p>
        <h1>{s.title}</h1>
        <p>{s.subtitle||`${s.universe||'Murder Party'}${s.era?` · ${s.era}`:''}`}</p>

        <div className="gmPackMeta">
          <span>Version {s.versionLabel}</span>
          {s.variantName&&<span>{s.variantName}</span>}
          {s.durationMinutes&&<span>{s.durationMinutes} min</span>}
          <span>{s.minPlayers??'?'}–{s.maxPlayers??'?'} joueurs</span>
        </div>
      </div>

      {pack.session&&
        <div className="gmPackSessionIdentity">
          <span>PACK DE SESSION</span>
          <strong>{pack.session.name}</strong>
          <small>
            {pack.session.characterCount} personnage(s)
            {' · '}
            {pack.session.frozenCount}/{pack.session.characterCount} fiche(s) figée(s)
          </small>
        </div>
      }

      <div className="gmPackHeroActions">
        <button onClick={()=>window.open(printUrl(versionId,'characters',sessionId),'_blank')}>
          👤 Fiches personnages
        </button>

        <button onClick={()=>window.open(printUrl(versionId,'setup',sessionId),'_blank')}>
          ☑ Installation & placement
        </button>

        <button onClick={()=>window.open(printUrl(versionId,'labels',sessionId),'_blank')}>
          ✉ Étiquettes
        </button>

        <button
          disabled={qrZipBusy}
          onClick={async()=>{
            setQrZipBusy(true);

            try{
              await downloadQrZip(pack);
            }catch(error){
              alert(
                error instanceof Error
                  ? error.message
                  : 'Impossible de générer le ZIP.'
              );
            }finally{
              setQrZipBusy(false);
            }
          }}
        >
          {qrZipBusy?'⏳ Préparation…':'⬇ ZIP de tous les QR'}
        </button>

        <button onClick={()=>window.print()}>
          🖨 Imprimer le Pack
        </button>

        <a href="/">← Murder Engine</a>
      </div>
    </header>


    <section className="gmPackCounters">
      <article><strong>{c.characters}</strong><span>Personnages</span></article>
      <article><strong>{c.documents}</strong><span>Documents</span></article>
      <article><strong>{c.objects}</strong><span>Objets</span></article>
      <article><strong>{c.locations}</strong><span>Lieux</span></article>
      <article><strong>{c.majorClues}</strong><span>Indices majeurs</span></article>
      <article><strong>{c.events}</strong><span>Événements</span></article>
      <article><strong>{c.votes}</strong><span>Votes</span></article>
      <article><strong>{c.gmInteractions}</strong><span>Actions MJ</span></article>
    </section>


    {pack.session?.casting?.length>0&&
      <section className="gmPackSection gmPackCasting">
        <p className="gmPackKicker">
          SESSION · CASTING RÉEL
        </p>

        <h2>Qui joue qui ?</h2>

        <div className="gmPackCastingGrid">
          {pack.session.casting.map((row:any)=>
            <article key={row.characterExternalId}>
              <div>
                <strong>
                  {row.characterName}
                </strong>

                <small>
                  {row.publicRole||row.characterExternalId}
                </small>
              </div>

              <span>←</span>

              <div>
                <strong>
                  {row.participantDisplayName}
                </strong>

                <small>
                  {row.genderVariant||'Version canonique'}
                </small>
              </div>

              <em className={
                row.frozen
                  ? 'gmPackFrozen'
                  : 'gmPackDraft'
              }>
                {row.frozen?'figée':'à figer'}
              </em>
            </article>
          )}
        </div>
      </section>
    }

    <section className="gmPackSection">
      <p className="gmPackKicker">01 · PRÉPARATION</p>
      <h2>Ce que le MJ doit savoir</h2>

      <div className="gmPackPaper">
        <h3>Résumé MJ</h3>
        <p>{pack.preparation.gmSummary||'Aucun résumé MJ renseigné.'}</p>
      </div>
    </section>


    <section className="gmPackSection">
      <p className="gmPackKicker">02 · CONDUITE DU JEU</p>
      <h2>Timeline</h2>

      <div className="gmPackTimeline">
        {pack.preparation.events.map((event:any)=>
          <article className={`gmPackEvent ${event.mandatory?'mandatory':''}`} key={event.externalId}>
            <div className="gmPackEventWhen">
              <strong>
                {event.absoluteTime||
                  (event.delayMinutes!=null?`+ ${event.delayMinutes} min`:'Déclencheur')}
              </strong>
            </div>

            <div>
              <h3>{event.title}</h3>
              <p>{event.gmDescription}</p>

              {event.fallbackGm&&
                <em>Plan B : {event.fallbackGm}</em>
              }
            </div>
          </article>
        )}
      </div>
    </section>


    <section className="gmPackSection">
      <p className="gmPackKicker">03 · MATÉRIEL</p>
      <h2>Préparation physique</h2>

      <div className="gmPackTwoCols">
        <div>
          <h3>Documents</h3>
          {pack.materials.documents.map((d:any)=>
            <article className="gmPackItem" key={d.externalId}>
              <strong>{d.title}</strong>
              <p>{d.support}</p>
            </article>
          )}
        </div>

        <div>
          <h3>Objets</h3>
          {pack.materials.objects.map((o:any)=>
            <article className={`gmPackItem ${o.critical?'critical':''}`} key={o.externalId}>
              <strong>{o.name}</strong>
              <p>{o.description}</p>
            </article>
          )}
        </div>
      </div>
    </section>


    <section className="gmPackSection gmPackQrSection">
      <p className="gmPackKicker">04 · QR PERSONNAGES</p>
      <h2>QR statiques</h2>

      <div className="gmPackQrGrid">
        {pack.logistics.qrCharacters.map((character:any)=>{
          const url=`${window.location.origin}/scan/character/${encodeURIComponent(character.externalId)}`;

          return <article className="gmPackQrCard" key={character.externalId}>
            <QRCodeSVG value={url} size={142} level="M" includeMargin/>
            <strong>{character.name}</strong>
            <span>{character.publicRole||character.externalId}</span>
          </article>;
        })}
      </div>
    </section>


    <section className="gmPackSection gmPackQrSection">
      <p className="gmPackKicker">05 · QR LIEUX</p>
      <h2>Lieux de jeu</h2>

      <div className="gmPackQrGrid">
        {pack.logistics.qrLocations.map((location:any)=>{
          const url=`${window.location.origin}/scan/${encodeURIComponent(location.externalId)}`;

          return <article className="gmPackQrCard" key={location.externalId}>
            <QRCodeSVG value={url} size={142} level="M" includeMargin/>
            <strong>{location.name}</strong>
            <span>{location.externalId}</span>
          </article>;
        })}
      </div>
    </section>


    <section className="gmPackSection">
      <p className="gmPackKicker">06 · CONTRÔLE</p>
      <h2>Points d’attention</h2>

      {!pack.diagnostics.length
        ? <p className="gmPackOk">✓ Aucun point d’attention automatique.</p>
        : <div className="gmPackDiagnostics">
          {pack.diagnostics.map((d:any,index:number)=>
            <article className={String(d.severity).toLowerCase()} key={index}>
              <strong>{d.title}</strong>
              <p>{d.message}</p>
            </article>
          )}
        </div>
      }
    </section>

    <footer className="gmPackFooter">
      Murder Engine · Ludificateur · Pack MJ V1.8B
    </footer>

  </main>;
}
