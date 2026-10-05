import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import JSZip from 'jszip';
import QRCode from 'qrcode';
import { asSkinId, skinClassFor, defaultAccentForSkin } from './skin-registry';

type Props={versionId?:string;sessionId?:string};

async function fetchJson<T=any>(url:string):Promise<T>{
  const r=await fetch(url);

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

async function downloadQrZip(pack:any){
  const zip=new JSZip();

  const charactersFolder=zip.folder('personnages');
  const locationsFolder=zip.folder('lieux');

  if(!charactersFolder||!locationsFolder)
    throw new Error('ZIP_FOLDER_ERROR');

  for(const character of pack.logistics.qrCharacters??[]){
    const url=
      `${window.location.origin}/scan/character/${encodeURIComponent(character.externalId)}`;

    const filename=
      `${safeFilename(character.externalId)}-${safeFilename(character.name)}`;

    await addQrFiles(
      charactersFolder,
      filename,
      url
    );
  }

  for(const location of pack.logistics.qrLocations??[]){
    const url=
      `${window.location.origin}/scan/${encodeURIComponent(location.externalId)}`;

    const filename=
      `${safeFilename(location.externalId)}-${safeFilename(location.name)}`;

    await addQrFiles(
      locationsFolder,
      filename,
      url
    );
  }

  const readme=[
    'MURDER ENGINE — PACK QR',
    '',
    `Scénario : ${pack.scenario.title}`,
    `Version : ${pack.scenario.versionLabel}`,
    '',
    `QR personnages : ${pack.logistics.qrCharacters?.length??0}`,
    `QR lieux : ${pack.logistics.qrLocations?.length??0}`,
    '',
    'Chaque QR est fourni en :',
    '- SVG vectoriel pour impression',
    '- PNG haute résolution',
    '',
    'Les QR personnages sont statiques :',
    'un même personnage conserve le même QR entre les sessions.',
    '',
    'Le QR identifie la cible. Le contexte de la session est',
    'déterminé par le joueur connecté à Murder Engine.',
    '',
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
  anchor.download=
    pack.session
      ? `QR-${safeFilename(pack.scenario.title)}-${safeFilename(pack.session.name||'session')}.zip`
      : `QR-${safeFilename(pack.scenario.title)}-${safeFilename(pack.scenario.versionLabel)}.zip`;

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
          <h1>{c.name}</h1>
          <h2>{c.publicRole||'Personnage'}</h2>
          {c.narrativeAge&&<span>{c.narrativeAge}</span>}
        </header>

        {c.motto&&
          <blockquote>« {c.motto} »</blockquote>
        }

        <section>
          <h3>Mon histoire</h3>
          <p>{c.biography||'—'}</p>
        </section>

        {c.interpretationNotes&&
          <section>
            <h3>Comment me la jouer</h3>
            <p>{c.interpretationNotes}</p>
          </section>
        }

        {c.appearanceNotes&&
          <section>
            <h3>Mon apparence</h3>
            <p>{c.appearanceNotes}</p>
          </section>
        }

        {c.secretIntro&&
          <section className="gmPrintSecret">
            <h3>Ce que vous seul savez</h3>
            <p>{c.secretIntro}</p>
          </section>
        }

        {c.apparentMotive&&
          <section>
            <h3>Ma position</h3>
            <p>{c.apparentMotive}</p>
          </section>
        }

        {c.personalTimeline&&
          <section>
            <h3>Ma chronologie</h3>
            <p>{c.personalTimeline}</p>
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

export default function GmPackView({versionId,sessionId}:Props){
  const [pack,setPack]=useState<any|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [qrZipBusy,setQrZipBusy]=useState(false);

  useEffect(()=>{
    let alive=true;

    (async()=>{
      try{
        const apiUrl=
          sessionId
            ? `/api/sessions/gm-pack?sessionId=${encodeURIComponent(sessionId)}`
            : `/api/library/gm-pack?versionId=${encodeURIComponent(versionId??'')}`;

        const r=
          await fetchJson<{ok:boolean;pack:any}>(
            apiUrl
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
