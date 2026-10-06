import { useEffect, useMemo, useState } from 'react';

type Asset={
  externalId:string;
  label:string;
  category:string;
  mediaType:string;
  source:string;
  altText?:string|null;
  tags?:string|null;
  skinId?:string|null;
};

type Override={
  assetExternalId?:string|null;
  label?:string|null;
  category?:string|null;
  mediaType?:string|null;
  source?:string|null;
  altText?:string|null;
  skinId?:string|null;
};

type Target={
  type:'CHARACTER'|'OBJECT';
  externalId:string;
  label:string;
  subtitle?:string|null;
};

async function fetchJson<T>(url:string,init?:RequestInit):Promise<T>{
  const response=await fetch(url,init);
  const raw=await response.text();
  let json:any=null;

  if(raw){
    try{json=JSON.parse(raw)}catch{}
  }

  if(!response.ok)
    throw new Error(json?.message??json?.error??raw??`HTTP ${response.status}`);

  return json as T;
}

const postJson=<T,>(url:string,body:any)=>
  fetchJson<T>(url,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body),
  });

export default function MediaLibraryPanel({
  version,
  onChanged,
}:{
  version:any;
  onChanged?:()=>void|Promise<void>;
}){
  const [open,setOpen]=useState(false);
  const [assets,setAssets]=useState<Asset[]>([]);
  const [overrides,setOverrides]=useState<Record<string,Override>>(version?.mediaOverrides??{});
  const [targetType,setTargetType]=useState<'CHARACTER'|'OBJECT'>('CHARACTER');
  const [selectedTarget,setSelectedTarget]=useState('');
  const [filter,setFilter]=useState('');
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [uploadFile,setUploadFile]=useState<File|null>(null);
  const [uploadLabel,setUploadLabel]=useState('');
  const [uploadTags,setUploadTags]=useState('');

  useEffect(()=>{
    setOverrides(version?.mediaOverrides??{});
    setSelectedTarget('');
  },[version?.id,version?.mediaOverrides]);

  const targets=useMemo<Target[]>(()=>{
    if(targetType==='CHARACTER'){
      return (version?.characters??[])
        .filter((c:any)=>c.active!==false)
        .map((c:any)=>({
          type:'CHARACTER' as const,
          externalId:c.externalId,
          label:c.name,
          subtitle:c.publicRole??null,
        }));
    }

    return (version?.objects??[])
      .filter((o:any)=>o.active!==false)
      .map((o:any)=>({
        type:'OBJECT' as const,
        externalId:o.externalId,
        label:o.name,
        subtitle:o.support??null,
      }));
  },[targetType,version?.characters,version?.objects]);

  useEffect(()=>{
    if(!selectedTarget&&targets.length)
      setSelectedTarget(targets[0].externalId);
    else if(selectedTarget&&!targets.some(t=>t.externalId===selectedTarget))
      setSelectedTarget(targets[0]?.externalId??'');
  },[targetType,targets,selectedTarget]);

  const selected=targets.find(t=>t.externalId===selectedTarget)??null;
  const selectedKey=selected?`${selected.type}:${selected.externalId}`:'';
  const currentOverride=selectedKey?overrides[selectedKey]??null:null;

  const visibleAssets=useMemo(()=>{
    const needle=filter.trim().toLowerCase();

    return assets.filter(asset=>{
      const category=String(asset.category??'GENERAL').toUpperCase();
      if(!['GENERAL',targetType].includes(category))return false;

      if(!needle)return true;

      return `${asset.label} ${asset.tags??''} ${asset.skinId??''}`
        .toLowerCase()
        .includes(needle);
    });
  },[assets,filter,targetType]);

  async function load(){
    if(!version?.id)return;

    setLoading(true);
    setError('');

    try{
      const result=await fetchJson<{
        ok:boolean;
        assets:Asset[];
        overrides:Record<string,Override>;
      }>(`/api/media/library?versionId=${encodeURIComponent(version.id)}`);

      setAssets(result.assets??[]);
      setOverrides(result.overrides??{});
    }catch(e){
      setError(e instanceof Error?e.message:String(e));
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{
    if(open)void load();
  },[open,version?.id]);

  async function assign(assetExternalId:string|null){
    if(!selected)return;

    setBusy(true);
    setError('');

    try{
      const result=await postJson<{
        ok:boolean;
        overrides:Record<string,Override>;
      }>('/api/media/assign',{
        versionId:version.id,
        targetType:selected.type,
        targetExternalId:selected.externalId,
        assetExternalId,
      });

      setOverrides(result.overrides??{});
      if(onChanged)await onChanged();
    }catch(e){
      setError(e instanceof Error?e.message:String(e));
    }finally{
      setBusy(false);
    }
  }

  async function upload(){
    if(!uploadFile)return;

    setBusy(true);
    setError('');

    try{
      const result=await fetchJson<{ok:boolean;asset:Asset}>('/api/media/upload',{
        method:'POST',
        headers:{
          'content-type':uploadFile.type||'application/octet-stream',
          'x-version-id':version.id,
          'x-file-name':uploadFile.name,
          'x-media-label':encodeURIComponent(uploadLabel.trim()||uploadFile.name),
          'x-media-category':targetType,
          'x-media-tags':encodeURIComponent(uploadTags.trim()),
          'x-media-alt':encodeURIComponent(uploadLabel.trim()||uploadFile.name),
        },
        body:await uploadFile.arrayBuffer(),
      });

      setAssets(prev=>[result.asset,...prev.filter(x=>x.externalId!==result.asset.externalId)]);
      setUploadFile(null);
      setUploadLabel('');
      setUploadTags('');
    }catch(e){
      setError(e instanceof Error?e.message:String(e));
    }finally{
      setBusy(false);
    }
  }

  return <section className="card mediaLibraryPanel">
    <div className="mediaLibraryHead">
      <div>
        <p className="eyebrow">MÉDIATHÈQUE & VISUELS</p>
        <h3>Choisir les portraits et objets</h3>
        <p>
          Les images choisies ici surchargent le MASTER sans modifier son contenu narratif.
          Elles restent réutilisables dans les autres scénarios de l’organisation.
        </p>
      </div>

      <button className="secondary" onClick={()=>setOpen(v=>!v)}>
        {open?'Fermer':'Ouvrir la médiathèque'}
      </button>
    </div>

    {open&&<>
      {error&&<p className="errorbox">{error}</p>}

      <div className="mediaTypeTabs">
        <button className={targetType==='CHARACTER'?'active secondary':'secondary'} onClick={()=>setTargetType('CHARACTER')}>
          Personnages
        </button>
        <button className={targetType==='OBJECT'?'active secondary':'secondary'} onClick={()=>setTargetType('OBJECT')}>
          Objets
        </button>
      </div>

      <div className="mediaWorkspace">
        <div className="mediaTargets">
          <div className="mediaColumnHead">
            <strong>{targetType==='CHARACTER'?'Personnages':'Objets'}</strong>
            <span>{targets.length}</span>
          </div>

          {targets.length===0
            ? <p className="empty">Aucun élément disponible.</p>
            : targets.map(target=>{
              const key=`${target.type}:${target.externalId}`;
              const image=overrides[key];

              return <button
                key={key}
                className={`mediaTargetRow ${selectedTarget===target.externalId?'selected':''}`}
                onClick={()=>setSelectedTarget(target.externalId)}
              >
                <span className="mediaTargetThumb">
                  {image?.source
                    ? <img src={image.source} alt={image.altText||target.label}/>
                    : <b>{target.label.slice(0,1).toUpperCase()}</b>
                  }
                </span>

                <span>
                  <strong>{target.label}</strong>
                  <small>{target.subtitle||target.externalId}</small>
                </span>

                <em>{image?.source?'personnalisé':'défaut'}</em>
              </button>;
            })
          }
        </div>

        <div className="mediaPicker">
          <div className="mediaSelectedTarget">
            <div>
              <span className="micro">VISUEL SÉLECTIONNÉ</span>
              <h4>{selected?.label||'Choisir un élément'}</h4>
              <small>{selected?.externalId}</small>
            </div>

            {currentOverride?.source&&
              <button className="secondary" disabled={busy} onClick={()=>void assign(null)}>
                Revenir au visuel du MASTER / skin
              </button>
            }
          </div>

          {currentOverride?.source&&
            <div className="mediaCurrentPreview">
              <img src={currentOverride.source} alt={currentOverride.altText||selected?.label||'Visuel'}/>
              <div>
                <strong>{currentOverride.label||'Visuel personnalisé'}</strong>
                <small>{currentOverride.assetExternalId}</small>
              </div>
            </div>
          }

          <div className="mediaUpload">
            <div>
              <span className="micro">AJOUTER À LA BIBLIOTHÈQUE</span>
              <strong>Nouvelle image</strong>
            </div>

            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={e=>{
                const file=e.target.files?.[0]??null;
                setUploadFile(file);
                if(file&&!uploadLabel)setUploadLabel(file.name.replace(/\.[^.]+$/,''));
              }}
            />

            <input
              value={uploadLabel}
              onChange={e=>setUploadLabel(e.target.value)}
              placeholder="Nom de l’image"
            />

            <input
              value={uploadTags}
              onChange={e=>setUploadTags(e.target.value)}
              placeholder="Tags : hollywood, actrice, 1930…"
            />

            <button disabled={!uploadFile||busy} onClick={()=>void upload()}>
              {busy?'Traitement…':'Ajouter à la bibliothèque'}
            </button>
          </div>

          <div className="mediaLibraryToolbar">
            <input
              value={filter}
              onChange={e=>setFilter(e.target.value)}
              placeholder="Filtrer par nom, tag, skin…"
            />
            <button className="secondary" disabled={loading} onClick={()=>void load()}>
              {loading?'Actualisation…':'Actualiser'}
            </button>
          </div>

          <div className="mediaAssetGrid">
            {visibleAssets.length===0
              ? <p className="empty">Aucune image compatible dans la bibliothèque.</p>
              : visibleAssets.map(asset=><button
                  key={asset.externalId}
                  className={`mediaAssetCard ${currentOverride?.assetExternalId===asset.externalId?'selected':''}`}
                  disabled={!selected||busy}
                  onClick={()=>void assign(asset.externalId)}
                >
                  <img src={asset.source} alt={asset.altText||asset.label}/>
                  <span>
                    <strong>{asset.label}</strong>
                    <small>{asset.tags||asset.category}</small>
                  </span>
                </button>)
            }
          </div>
        </div>
      </div>
    </>}
  </section>;
}
