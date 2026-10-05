import { useEffect, useMemo, useState } from 'react';

type Props = {
  entry:any;
  buttonLabel?:string;
  compact?:boolean;
};

function documentData(entry:any){return entry?.immersiveDocument??entry?.clue?.immersiveDocument??null;}

export default function ImmersiveDocument({entry,buttonLabel='Examiner le document',compact=false}:Props){
  const doc=documentData(entry);
  const [open,setOpen]=useState(false);
  const [page,setPage]=useState(0);
  const [zoom,setZoom]=useState(1);
  const media=useMemo(()=>Array.isArray(doc?.media)?doc.media.filter((m:any)=>m?.source):[],[doc]);
  const first=media[0];
  useEffect(()=>{if(!open){setPage(0);setZoom(1);}},[open]);
  if(!doc)return null;
  const title=doc.title||entry?.playerName||'Document';
  return <>
    <button type="button" className={`immersiveDocPreview ${compact?'compact':''}`} onClick={()=>setOpen(true)} aria-label={`${buttonLabel} : ${title}`}>
      <span className="immersiveDocThumb" aria-hidden="true">
        {first?.source?<img src={first.source} alt="" loading="lazy"/>:<span className="immersivePaperMini"><i></i><i></i><i></i><i></i></span>}
      </span>
      <span className="immersiveDocPreviewText"><small>{media.length>1?`${media.length} pages`:(first?'Fac-similé numérique':'Document numérique')}</small><strong>{buttonLabel}</strong></span>
    </button>
    {open&&<div className="immersiveViewer" role="dialog" aria-modal="true" aria-label={title}>
      <header className="immersiveViewerHeader"><div><small>DOCUMENT TROUVÉ</small><strong>{title}</strong></div><button type="button" onClick={()=>setOpen(false)} aria-label="Fermer le document">✕</button></header>
      <div className="immersiveViewerStage">
        {media.length>0?<div className="immersiveImageScroller"><img src={media[page]?.source} alt={media[page]?.altText||title} style={{transform:`scale(${zoom})`}}/></div>:<article className="immersivePaperFallback"><div className="paperNoise"/><h2>{title}</h2><p>{doc.textContent||entry?.playerText||'Le document ne contient pas de texte numérisé.'}</p></article>}
      </div>
      <footer className="immersiveViewerControls">
        {media.length>1&&<div className="immersivePaging"><button type="button" disabled={page<=0} onClick={()=>{setPage(p=>Math.max(0,p-1));setZoom(1);}}>←</button><span>{page+1} / {media.length}</span><button type="button" disabled={page>=media.length-1} onClick={()=>{setPage(p=>Math.min(media.length-1,p+1));setZoom(1);}}>→</button></div>}
        {media.length>0&&<div className="immersiveZoom"><button type="button" onClick={()=>setZoom(z=>Math.max(.7,Math.round((z-.2)*10)/10))}>−</button><button type="button" onClick={()=>setZoom(1)}>{Math.round(zoom*100)}%</button><button type="button" onClick={()=>setZoom(z=>Math.min(2.6,Math.round((z+.2)*10)/10))}>+</button></div>}
        <button type="button" className="immersiveClose" onClick={()=>setOpen(false)}>Ranger le document</button>
      </footer>
    </div>}
  </>;
}
