import { useEffect, useMemo, useState } from 'react';
import { organizerToken, ORGANIZER_EMAIL } from './admin-auth';

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

async function authenticatedFetch<T>(
  url:string,
  init:RequestInit={},
  interactive=false
):Promise<T>{
  const token=await organizerToken(interactive);

  if(!token)
    throw new Error('ORGANIZER_AUTH_REQUIRED');

  const headers=new Headers(init.headers??{});
  headers.set('authorization',`Bearer ${token}`);

  return fetchJson<T>(url,{
    ...init,
    headers,
  });
}

const postJson=<T,>(url:string,body:any)=>
  authenticatedFetch<T>(url,{
    method:'POST',
    headers:{'content-type':'application/json'},
    body:JSON.stringify(body),
  },true);

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
  const [authRequired,setAuthRequired]=useState(false);
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

    return assets
      .filter(asset=>{
        if(!needle)return true;

        return `${asset.label} ${asset.tags??''} ${asset.skinId??''} ${asset.category??''}`
          .toLowerCase()
          .includes(needle);
      })
      .sort((a,b)=>{
        const rank=(asset:Asset)=>{
          const category=String(asset.category??'GENERAL').toUpperCase();
          if(category===targetType)return 0;
          if(category==='GENERAL')return 1;
          return 2;
        };

        return rank(a)-rank(b) || a.label.localeCompare(b.label);
      });
  },[assets,filter,targetType]);

  async function load(){
    if(!version?.id)return;

    setLoading(true);
    setError('');

    try{
      const result=await authenticatedFetch<{
        ok:boolean;
        assets:Asset[];
        overrides:Record<string,Override>;
      }>(`/api/media/library?versionId=${encodeURIComponent(version.id)}`);

      setAssets(result.assets??[]);
      setOverrides(result.overrides??{});
      setAuthRequired(false);
    }catch(e){
      const message=e instanceof Error?e.message:String(e);
      if(message==='ORGANIZER_AUTH_REQUIRED'){
        setAuthRequired(true);
        setError('');
      }else{
        setError(message);
      }
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
      const token=await organizerToken(true);
      if(!token)throw new Error('ORGANIZER_AUTH_REQUIRED');

      const result=await fetchJson<{ok:boolean;asset:Asset}>('/api/media/upload',{
        method:'POST',
        headers:{
          'authorization':`Bearer ${token}`,
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

      <button className="secondary mediaHeadAction" onClick={()=>setOpen(v=>!v)}>
        {open?'Fermer':'Ouvrir'}
      </button>
    </div>

    {open&&<>
      {error&&<p className="errorbox">{error}</p>}

      {authRequired&&
        <div className="mediaAuthRequired">
          <div>
            <span className="micro">ACCÈS ORGANISATEUR</span>
            <strong>Connexion Google requise</strong>
            <p>
              La médiathèque peut ajouter des fichiers dans Firebase Storage.
              Elle est donc réservée au compte organisateur.
            </p>
          </div>
          <button onClick={async()=>{
            setBusy(true);
            setError('');
            try{
              const token=await organizerToken(true);
              if(!token)throw new Error('ORGANIZER_AUTH_REQUIRED');
              setAuthRequired(false);
              await load();
            }catch(e){
              setError(e instanceof Error?e.message:String(e));
            }finally{
              setBusy(false);
            }
          }}>
            Se connecter avec {ORGANIZER_EMAIL}
          </button>
        </div>
      }

      {!authRequired&&<><div className="mediaTypeTabs" role="tablist" aria-label="Type de visuel">
        <button className={targetType==='CHARACTER'?'active':''} onClick={()=>setTargetType('CHARACTER')}>
          <span>Personnages</span><b>{(version?.characters??[]).filter((c:any)=>c.active!==false).length}</b>
        </button>
        <button className={targetType==='OBJECT'?'active':''} onClick={()=>setTargetType('OBJECT')}>
          <span>Objets</span><b>{(version?.objects??[]).filter((o:any)=>o.active!==false).length}</b>
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

                <em className={image?.source?'custom':'default'}>{image?.source?'Image choisie':'Défaut'}</em>
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
              <button className="secondary mediaResetButton" disabled={busy} onClick={()=>void assign(null)}>
                Réinitialiser
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
            <div className="mediaUploadHead">
              <div>
                <span className="micro">OU IMPORTER UNE NOUVELLE IMAGE</span>
                <strong>Ajouter un nouveau fichier à la bibliothèque</strong>
              </div>
              <small>JPG, PNG, WebP ou GIF · 5 Mo max.</small>
            </div>

            <div className="mediaUploadFields">
              <label className="mediaField mediaFileField">
                <span>Fichier</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={e=>{
                    const file=e.target.files?.[0]??null;
                    setUploadFile(file);
                    if(file&&!uploadLabel)setUploadLabel(file.name.replace(/\.[^.]+$/,''));
                  }}
                />
              </label>

              <label className="mediaField">
                <span>Nom</span>
                <input
                  value={uploadLabel}
                  onChange={e=>setUploadLabel(e.target.value)}
                  placeholder="Ex. Ruby Saint-Clair"
                />
              </label>

              <label className="mediaField">
                <span>Tags</span>
                <input
                  value={uploadTags}
                  onChange={e=>setUploadTags(e.target.value)}
                  placeholder="hollywood, actrice, 1930"
                />
              </label>
            </div>

            <div className="mediaUploadActions">
              <span>{uploadFile?uploadFile.name:'Aucun fichier sélectionné'}</span>
              <button className="mediaPrimaryAction" disabled={!uploadFile||busy} onClick={()=>void upload()}>
                {busy?'Ajout…':'Ajouter l’image'}
              </button>
            </div>
          </div>

          <div className="mediaExistingHead">
            <div>
              <span className="micro">BIBLIOTHÈQUE EXISTANTE</span>
              <strong>Choisir une image déjà importée</strong>
              <small>Clique sur une vignette pour l’attribuer au personnage ou à l’objet sélectionné.</small>
            </div>
            <b>{visibleAssets.length}</b>
          </div>

          <div className="mediaLibraryToolbar">
            <input
              value={filter}
              onChange={e=>setFilter(e.target.value)}
              placeholder="Rechercher dans la bibliothèque : nom, tag, skin…"
            />
            <button className="secondary mediaRefreshButton" disabled={loading} onClick={()=>void load()}>
              {loading?'…':'↻ Actualiser'}
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
                  <span className="mediaAssetVisual">
                    <img src={asset.source} alt={asset.altText||asset.label}/>
                    {currentOverride?.assetExternalId===asset.externalId&&<b className="mediaAssetSelectedBadge">✓ Utilisée</b>}
                  </span>
                  <span className="mediaAssetMeta">
                    <strong>{asset.label}</strong>
                    <small>{asset.tags||asset.category}</small>
                  </span>
                </button>)
            }
          </div>
        </div>
      </div></>}
    </>}
  </section>;
}
