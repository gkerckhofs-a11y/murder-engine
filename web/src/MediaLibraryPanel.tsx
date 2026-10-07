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
  const [pendingAssignments,setPendingAssignments]=useState<Record<string,string|null>>({});
  const [assignmentSummary,setAssignmentSummary]=useState('');
  const [targetType,setTargetType]=useState<'CHARACTER'|'OBJECT'>('CHARACTER');
  const [selectedTarget,setSelectedTarget]=useState('');
  const [filter,setFilter]=useState('');
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [authRequired,setAuthRequired]=useState(false);
  const [uploadFiles,setUploadFiles]=useState<File[]>([]);
  const [uploadLabel,setUploadLabel]=useState('');
  const [uploadTags,setUploadTags]=useState('');
  const [uploadProgress,setUploadProgress]=useState<Record<string,{status:'PENDING'|'UPLOADING'|'SUCCESS'|'ERROR';message?:string}>>({});
  const [uploadSummary,setUploadSummary]=useState('');
  const [showUpload,setShowUpload]=useState(false);

  useEffect(()=>{
    setOverrides(version?.mediaOverrides??{});
    setPendingAssignments({});
    setAssignmentSummary('');
    setSelectedTarget('');
  },[version?.id]);

  useEffect(()=>{
    setOverrides(version?.mediaOverrides??{});
  },[version?.mediaOverrides]);

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
        subtitle:o.logisticsCode
          ? `${o.logisticsCode}${o.support?` · ${o.support}`:''}`
          : o.support??null,
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

  const hasPendingAssignment=(key:string)=>
    Object.prototype.hasOwnProperty.call(pendingAssignments,key);

  const assetOverride=(assetExternalId:string|null|undefined):Override|null=>{
    if(!assetExternalId)return null;
    const asset=assets.find(x=>x.externalId===assetExternalId);
    if(!asset)return null;
    return {
      assetExternalId:asset.externalId,
      label:asset.label,
      category:asset.category,
      mediaType:asset.mediaType,
      source:asset.source,
      altText:asset.altText??null,
      skinId:asset.skinId??null,
    };
  };

  const effectiveOverride=(key:string):Override|null=>{
    if(hasPendingAssignment(key))
      return assetOverride(pendingAssignments[key]);
    return overrides[key]??null;
  };

  const currentOverride=selectedKey?effectiveOverride(selectedKey):null;
  const pendingCount=Object.keys(pendingAssignments).length;

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

  function assign(assetExternalId:string|null){
    if(!selected||!selectedKey)return;

    setError('');
    setAssignmentSummary('');

    const persistedAssetId=
      overrides[selectedKey]?.assetExternalId??null;

    setPendingAssignments(prev=>{
      const next={...prev};

      if((persistedAssetId??null)===(assetExternalId??null))
        delete next[selectedKey];
      else
        next[selectedKey]=assetExternalId;

      return next;
    });
  }

  function discardAssignments(){
    setPendingAssignments({});
    setAssignmentSummary('');
    setError('');
  }

  async function saveAssignments(){
    const entries=Object.entries(pendingAssignments);
    if(!entries.length)return;

    setBusy(true);
    setError('');
    setAssignmentSummary('');

    try{
      let latestOverrides=overrides;

      for(const [key,assetExternalId] of entries){
        const separator=key.indexOf(':');
        const targetType=key.slice(0,separator);
        const targetExternalId=key.slice(separator+1);

        const result=await postJson<{
          ok:boolean;
          overrides:Record<string,Override>;
        }>('/api/media/assign',{
          versionId:version.id,
          targetType,
          targetExternalId,
          assetExternalId,
        });

        latestOverrides=result.overrides??latestOverrides;
      }

      setOverrides(latestOverrides);
      setPendingAssignments({});
      setAssignmentSummary(
        entries.length===1
          ? 'Attribution enregistrée ✓'
          : `${entries.length} attributions enregistrées ✓`
      );

      if(onChanged)await onChanged();
    }catch(e){
      setError(e instanceof Error?e.message:String(e));
    }finally{
      setBusy(false);
    }
  }

  const uploadKey=(file:File)=>
    `${file.name}::${file.size}::${file.lastModified}`;

  const defaultMediaLabel=(file:File)=>
    file.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim()||file.name;

  async function upload(){
    if(!uploadFiles.length)return;

    setBusy(true);
    setError('');
    setUploadSummary('');

    const total=uploadFiles.length;
    const uploaded:Asset[]=[];
    const failed:File[]=[];

    try{
      const token=await organizerToken(true);
      if(!token)throw new Error('ORGANIZER_AUTH_REQUIRED');

      for(const file of uploadFiles){
        const key=uploadKey(file);
        const label=
          total===1 && uploadLabel.trim()
            ? uploadLabel.trim()
            : defaultMediaLabel(file);

        if(file.size>5*1024*1024){
          failed.push(file);
          setUploadProgress(prev=>({
            ...prev,
            [key]:{
              status:'ERROR',
              message:'Fichier supérieur à 5 Mo',
            },
          }));
          continue;
        }

        setUploadProgress(prev=>({
          ...prev,
          [key]:{status:'UPLOADING'},
        }));

        try{
          const result=await fetchJson<{ok:boolean;asset:Asset}>('/api/media/upload',{
            method:'POST',
            headers:{
              'authorization':`Bearer ${token}`,
              'content-type':file.type||'application/octet-stream',
              'x-version-id':version.id,
              'x-file-name':file.name,
              'x-media-label':encodeURIComponent(label),
              'x-media-category':targetType,
              'x-media-tags':encodeURIComponent(uploadTags.trim()),
              'x-media-alt':encodeURIComponent(label),
            },
            body:await file.arrayBuffer(),
          });

          uploaded.push(result.asset);
          setUploadProgress(prev=>({
            ...prev,
            [key]:{status:'SUCCESS'},
          }));
        }catch(e){
          failed.push(file);
          setUploadProgress(prev=>({
            ...prev,
            [key]:{
              status:'ERROR',
              message:e instanceof Error?e.message:String(e),
            },
          }));
        }
      }

      if(uploaded.length){
        setAssets(prev=>[
          ...uploaded.reverse(),
          ...prev.filter(existing=>
            !uploaded.some(asset=>asset.externalId===existing.externalId)
          ),
        ]);
      }

      setUploadFiles(failed);

      if(failed.length===0){
        setUploadLabel('');
        setUploadTags('');
        setUploadSummary(
          total===1
            ? 'Image ajoutée à la bibliothèque ✓'
            : `${total} images ajoutées à la bibliothèque ✓`
        );
      }else{
        setUploadSummary(
          `${uploaded.length}/${total} image(s) ajoutée(s) · ${failed.length} échec(s)`
        );
      }
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

      {(pendingCount>0||assignmentSummary)&&<div className="mediaAssignmentSaveBar">
        <div>
          <strong>
            {pendingCount>0
              ? `${pendingCount} attribution${pendingCount>1?'s':''} en attente`
              : assignmentSummary}
          </strong>
          {pendingCount>0&&<small>
            Tu peux continuer à attribuer des images avant d’enregistrer.
          </small>}
        </div>

        {pendingCount>0&&<div className="mediaAssignmentSaveActions">
          <button
            className="secondary"
            disabled={busy}
            onClick={discardAssignments}
          >
            Annuler les changements
          </button>
          <button
            className="mediaPrimaryAction"
            disabled={busy}
            onClick={()=>void saveAssignments()}
          >
            {busy?'Enregistrement…':`Enregistrer ${pendingCount} attribution${pendingCount>1?'s':''}`}
          </button>
        </div>}
      </div>}

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
              const image=effectiveOverride(key);
              const changed=hasPendingAssignment(key);

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

                <em className={changed?'pending':image?.source?'custom':'default'}>
                  {changed?'À enregistrer':image?.source?'Image choisie':'Défaut'}
                </em>
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

            <div className="mediaSelectedActions">
              <button
                className="mediaAddButton"
                disabled={busy}
                onClick={()=>setShowUpload(v=>!v)}
              >
                {showUpload?'Masquer l’ajout':'+ Ajouter une image'}
              </button>

              {currentOverride?.source&&
                <button className="secondary mediaResetButton" disabled={busy} onClick={()=>assign(null)}>
                  Réinitialiser
                </button>
              }
            </div>
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

          {showUpload&&<div className="mediaUpload">
            <div className="mediaUploadHead">
              <div>
                <span className="micro">OU IMPORTER DE NOUVELLES IMAGES</span>
                <strong>Ajouter un ou plusieurs fichiers à la bibliothèque</strong>
              </div>
              <small>JPG, PNG, WebP ou GIF · 5 Mo max. par fichier.</small>
            </div>

            <div className="mediaUploadFields">
              <label className="mediaField mediaFileField">
                <span>Fichier(s)</span>
                <input
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={e=>{
                    const files=Array.from(e.target.files??[]);
                    setUploadFiles(files);
                    setUploadProgress(
                      Object.fromEntries(
                        files.map(file=>[
                          uploadKey(file),
                          {status:'PENDING' as const},
                        ])
                      )
                    );
                    setUploadSummary('');
                    if(files.length===1)
                      setUploadLabel(defaultMediaLabel(files[0]));
                    else
                      setUploadLabel('');
                    e.currentTarget.value='';
                  }}
                />
              </label>

              <label className="mediaField">
                <span>{uploadFiles.length>1?'Noms automatiques':'Nom'}</span>
                <input
                  value={
                    uploadFiles.length>1
                      ? 'Nom de chaque fichier'
                      : uploadLabel
                  }
                  disabled={uploadFiles.length>1}
                  onChange={e=>setUploadLabel(e.target.value)}
                  placeholder="Ex. Ruby Saint-Clair"
                />
              </label>

              <label className="mediaField">
                <span>Tags communs</span>
                <input
                  value={uploadTags}
                  onChange={e=>setUploadTags(e.target.value)}
                  placeholder="hollywood, actrice, 1930"
                />
              </label>
            </div>

            {uploadFiles.length>0&&<div className="mediaUploadQueue">
              {uploadFiles.map(file=>{
                const progress=uploadProgress[uploadKey(file)]??{status:'PENDING' as const};
                return <div className={`mediaUploadQueueRow ${progress.status.toLowerCase()}`} key={uploadKey(file)}>
                  <div>
                    <strong>{file.name}</strong>
                    <small>{(file.size/1024/1024).toFixed(2)} Mo</small>
                  </div>
                  <span>
                    {progress.status==='PENDING'&&'En attente'}
                    {progress.status==='UPLOADING'&&'Import…'}
                    {progress.status==='SUCCESS'&&'✓ Ajoutée'}
                    {progress.status==='ERROR'&&`⚠ ${progress.message||'Erreur'}`}
                  </span>
                </div>;
              })}
            </div>}

            <div className="mediaUploadActions">
              <span>
                {uploadFiles.length===0
                  ? 'Aucun fichier sélectionné'
                  : uploadFiles.length===1
                    ? uploadFiles[0].name
                    : `${uploadFiles.length} fichiers sélectionnés`}
              </span>
              <button className="mediaPrimaryAction" disabled={!uploadFiles.length||busy} onClick={()=>void upload()}>
                {busy
                  ? `Import en cours…`
                  : uploadFiles.length>1
                    ? `Ajouter les ${uploadFiles.length} images`
                    : 'Ajouter l’image'}
              </button>
            </div>

            {uploadSummary&&<div className="mediaUploadSummary">{uploadSummary}</div>}
          </div>}

          <div className="mediaExistingHead">
            <div>
              <span className="micro">BIBLIOTHÈQUE EXISTANTE</span>
              <strong>Choisir une image déjà importée</strong>
              <small>Clique sur une vignette pour préparer l’attribution. Enregistre ensuite toutes tes modifications en une fois.</small>
            </div>
            <b>{visibleAssets.length}</b>
          </div>

          <div className="mediaLibraryToolbar">
            <input
              value={filter}
              onChange={e=>setFilter(e.target.value)}
              placeholder="Rechercher dans la bibliothèque : nom, tag, skin…"
            />
            <button className="secondary mediaRefreshButton" disabled={loading||pendingCount>0} onClick={()=>void load()}>
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
                  onClick={()=>assign(asset.externalId)}
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
