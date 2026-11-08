import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import NarrativeText from './NarrativeText';

type Props = {
  entry:any;
  buttonLabel?:string;
  compact?:boolean;
  language?:string|null;
};

function documentData(entry:any){
  return entry?.immersiveDocument??entry?.clue?.immersiveDocument??
    (entry?.description||entry?.playerText||entry?.visualMedia
      ? {title:entry.name||entry.playerName,textContent:entry.description||entry.playerText}
      : null);
}

function isEnglish(language?:string|null){
  return String(language??'FR').trim().toUpperCase()==='EN';
}

function tx(language:string|undefined|null,fr:string,en:string){
  return isEnglish(language)?en:fr;
}

export default function ImmersiveDocument({
  entry,
  buttonLabel,
  compact=false,
  language='FR',
}:Props){
  const doc=documentData(entry);
  const [open,setOpen]=useState(false);
  const [page,setPage]=useState(0);
  const [zoom,setZoom]=useState(1);
  const [imageError,setImageError]=useState(false);
  const dialogRef=useRef<HTMLDivElement>(null);
  const closeRef=useRef<HTMLButtonElement>(null);
  const media=useMemo(
    ()=>{
      const pages=Array.isArray(doc?.media)?doc.media.filter((m:any)=>m?.source):[];
      const visual=entry?.object?.visualMedia||entry?.visualMedia||entry?.clue?.visualMedia;
      return pages.length?pages:visual?.source?[visual]:[];
    },
    [doc,entry]
  );
  const first=media[0];
  const resolvedButtonLabel=
    buttonLabel??tx(language,'Examiner le document','Examine document');

  useEffect(()=>{
    if(!open){
      setPage(0);
      setZoom(1);
    }
  },[open]);
  useEffect(()=>{setImageError(false);},[page,open]);
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    closeRef.current?.focus();
    function keydown(event:KeyboardEvent){
      if(event.key==='Escape'){event.preventDefault();setOpen(false);}
      if(event.key==='Tab'){
        const buttons=Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],[tabindex="0"]')??[]);
        const first=buttons[0],last=buttons[buttons.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    }
    document.addEventListener('keydown',keydown);
    return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',keydown);previous?.focus();};
  },[open]);

  if(!doc)return null;

  const title=doc.title||entry?.playerName||tx(language,'Document','Document');

  return <>
    <button
      type="button"
      className={`immersiveDocPreview ${compact?'compact':''}`}
      onClick={()=>setOpen(true)}
      aria-label={`${resolvedButtonLabel} : ${title}`}
    >
      <span className="immersiveDocThumb" aria-hidden="true">
        {first?.source
          ? <img src={first.source} alt="" loading="lazy"/>
          : <span className="immersivePaperMini"><i></i><i></i><i></i><i></i></span>
        }
      </span>

      <span className="immersiveDocPreviewText">
        <small>
          {media.length>1
            ? `${media.length} ${tx(language,'pages','pages')}`
            : first
              ? tx(language,'Fac-similé numérique','Digital facsimile')
              : tx(language,'Document numérique','Digital document')}
        </small>
        <strong>{resolvedButtonLabel}</strong>
      </span>
    </button>

    {open&&createPortal(
      <div ref={dialogRef} className="immersiveViewer" role="dialog" aria-modal="true" aria-label={title}>
        <header className="immersiveViewerHeader">
          <div>
            <small>{tx(language,'DOCUMENT TROUVÉ','DOCUMENT FOUND')}</small>
            <strong>{title}</strong>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={()=>setOpen(false)}
            aria-label={tx(language,'Fermer le document','Close document')}
          >
            ✕
          </button>
        </header>

        <div className={`immersiveViewerStage ${media.length?'hasImage':''}`}>
          {media.length>0&&<section className="immersiveImageSection" aria-label={tx(language,'Image du document','Document image')}>
            {imageError?<p role="status">{tx(language,'L’image n’a pas pu être chargée. Le texte reste disponible ci-dessous.','The image could not load. The text remains available below.')}</p>:<div className="immersiveImageScroller" tabIndex={0}>
              <div className="immersiveImageCanvas" style={{width:`${zoom*100}%`}}>
                <img
                  src={media[page]?.source}
                  alt={media[page]?.altText||title}
                  onError={()=>setImageError(true)}
                />
              </div>
            </div>}
          </section>}
          <article className="immersivePaperFallback">
                <div className="paperNoise"/>
                <h2>{title}</h2>
                <NarrativeText text={doc.textContent
                    ||entry?.playerText
                    ||entry?.description
                    ||tx(
                      language,
                      'Le document ne contient pas de texte numérisé.',
                      'No digitized text is available for this document.'
                    )}/>
          </article>
        </div>

        <footer className="immersiveViewerControls">
          {media.length>1&&
            <div className="immersivePaging">
              <button
                type="button"
                disabled={page<=0}
                onClick={()=>{
                  setPage(p=>Math.max(0,p-1));
                  setZoom(1);
                }}
              >
                ←
              </button>
              <span>{page+1} / {media.length}</span>
              <button
                type="button"
                disabled={page>=media.length-1}
                onClick={()=>{
                  setPage(p=>Math.min(media.length-1,p+1));
                  setZoom(1);
                }}
              >
                →
              </button>
            </div>
          }

          {media.length>0&&
            <div className="immersiveZoom">
              <button type="button" aria-label={tx(language,'Réduire l’image','Zoom out')} disabled={zoom<=1} onClick={()=>setZoom(z=>Math.max(1,Math.round((z-.25)*100)/100))}>−</button>
              <button type="button" aria-label={tx(language,'Réinitialiser le zoom','Reset zoom')} onClick={()=>setZoom(1)}>{Math.round(zoom*100)}%</button>
              <button type="button" aria-label={tx(language,'Agrandir l’image','Zoom in')} disabled={zoom>=3} onClick={()=>setZoom(z=>Math.min(3,Math.round((z+.25)*100)/100))}>+</button>
            </div>
          }

          <button
            type="button"
            className="immersiveClose"
            onClick={()=>setOpen(false)}
          >
            {tx(language,'Ranger le document','Put document away')}
          </button>
        </footer>
      </div>,document.body)
    }
  </>;
}
