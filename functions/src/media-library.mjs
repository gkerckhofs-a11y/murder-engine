import { randomUUID } from 'node:crypto';

const CONTEXT_QUERY = `
query MediaLibraryContext($versionId: UUID!) {
  scenarioVersion(id: $versionId) {
    id
    mediaOverridesJson
    scenario {
      id
      organization { id name slug }
    }
  }
}
`;

const LIST_QUERY = `
query OrganizationMediaLibrary($organizationId: UUID!) {
  organizationMediaAssets(
    where: {
      organizationId: {eq: $organizationId}
      active: {eq: true}
    }
    orderBy: {updatedAt: DESC}
  ) {
    externalId
    label
    category
    mediaType
    source
    altText
    tags
    skinId
    active
    createdAt
    updatedAt
  }
}
`;

const ASSET_QUERY = `
query OrganizationMediaLibraryAsset(
  $organizationId: UUID!,
  $externalId: String!
) {
  organizationMediaAssets(
    where: {
      organizationId: {eq: $organizationId}
      externalId: {eq: $externalId}
      active: {eq: true}
    }
    limit: 1
  ) {
    externalId
    label
    category
    mediaType
    source
    altText
    tags
    skinId
    active
  }
}
`;


const OBJECT_TARGET_QUERY = `
query MediaObjectTarget(
  $versionId: UUID!,
  $externalId: String!
) {
  gameObjects(
    where: {
      scenarioVersionId: {eq: $versionId}
      externalId: {eq: $externalId}
    }
    limit: 1
  ) {
    externalId
    name
    logisticsCode
  }
}
`;

const INSERT_MUTATION = `
mutation InsertOrganizationMediaAsset(
  $data: OrganizationMediaAsset_Data!
) {
  organizationMediaAsset_insert(data: $data)
}
`;

const UPDATE_OVERRIDES_MUTATION = `
mutation UpdateScenarioMediaOverrides(
  $versionId: UUID!,
  $mediaOverridesJson: String
) {
  scenarioVersion_update(
    id: $versionId,
    data: {mediaOverridesJson: $mediaOverridesJson}
  )
}
`;

async function getAdminDataConnect(){
  const [{initializeApp,getApps},{getDataConnect}] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/data-connect'),
  ]);

  if(!getApps().length)initializeApp();

  return getDataConnect({
    location:'europe-west1',
    serviceId:'murder-engine',
  });
}

async function read(operation,variables){
  const dc=await getAdminDataConnect();
  const response=await dc.executeGraphqlRead(operation,{variables});
  const errors=response?.errors??response?.data?.errors??[];

  if(errors.length){
    const e=new Error('MEDIA_LIBRARY_READ_FAILED');
    e.details=errors;
    throw e;
  }

  return response?.data??response;
}

async function write(operation,variables){
  const dc=await getAdminDataConnect();
  const response=await dc.executeGraphql(operation,{variables});
  const errors=response?.errors??response?.data?.errors??[];

  if(errors.length){
    const e=new Error('MEDIA_LIBRARY_WRITE_FAILED');
    e.details=errors;
    throw e;
  }

  return response?.data??response;
}

function parseOverrides(value){
  if(!value)return {};

  try{
    const parsed=JSON.parse(value);
    return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)
      ? parsed
      : {};
  }catch{
    return {};
  }
}

function overrideKey(targetType,targetExternalId){
  return `${String(targetType??'').trim().toUpperCase()}:${String(targetExternalId??'').trim()}`;
}

function decodeHeaderValue(value){
  const raw=String(value??'');
  if(!raw)return '';
  try{return decodeURIComponent(raw)}catch{return raw}
}


function sanitizeFilename(value){
  const raw=String(value??'image').trim()||'image';

  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9._-]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,120) || 'image';
}

let resolvedStorageBucketName=null;

function firebaseConfig(){
  try{
    const raw=process.env.FIREBASE_CONFIG;
    return raw?JSON.parse(raw):{};
  }catch{
    return {};
  }
}

async function resolveStorageBucket(getStorage){
  if(resolvedStorageBucketName)
    return getStorage().bucket(resolvedStorageBucketName);

  const config=firebaseConfig();
  const projectId=String(
    process.env.GCLOUD_PROJECT ??
    process.env.GOOGLE_CLOUD_PROJECT ??
    config.projectId ??
    ''
  ).trim();

  const candidates=[
    process.env.STORAGE_BUCKET,
    config.storageBucket,
    projectId ? projectId + '.firebasestorage.app' : null,
    projectId ? projectId + '.appspot.com' : null,
  ]
    .map(v=>String(v??'').trim())
    .filter(Boolean)
    .filter((v,index,array)=>array.indexOf(v)===index);

  try{
    const fallback=getStorage().bucket();
    if(fallback?.name&&!candidates.includes(fallback.name))
      candidates.push(fallback.name);
  }catch{
    // No configured default bucket.
  }

  for(const name of candidates){
    try{
      const bucket=getStorage().bucket(name);
      const [exists]=await bucket.exists();
      if(exists){
        resolvedStorageBucketName=name;
        return bucket;
      }
    }catch{
      // Try next known Firebase bucket naming convention.
    }
  }

  const error=new Error('FIREBASE_STORAGE_BUCKET_NOT_FOUND');
  error.details={
    projectId:projectId||null,
    candidates,
    hint:'Enable Firebase Storage for this project or set STORAGE_BUCKET to the existing bucket name.',
  };
  throw error;
}

async function contextForVersion(versionId){
  if(!versionId)throw new Error('VERSION_ID_REQUIRED');

  const data=await read(CONTEXT_QUERY,{versionId});
  const version=data?.scenarioVersion;

  if(!version)throw new Error('VERSION_NOT_FOUND');

  const organization=version.scenario?.organization;
  if(!organization?.id)throw new Error('ORGANIZATION_NOT_FOUND');

  return {
    version,
    organization,
    overrides:parseOverrides(version.mediaOverridesJson),
  };
}

export async function listMediaLibrary(versionId){
  const context=await contextForVersion(versionId);
  const data=await read(LIST_QUERY,{
    organizationId:context.organization.id,
  });

  return {
    organization:context.organization,
    assets:data?.organizationMediaAssets??[],
    overrides:context.overrides,
  };
}

export async function uploadMediaLibraryAsset(versionId,input){
  const context=await contextForVersion(versionId);

  const raw=input?.raw;
  if(!raw?.length)throw new Error('EMPTY_MEDIA_FILE');
  if(raw.length>5*1024*1024)throw new Error('MEDIA_FILE_TOO_LARGE');

  const contentType=String(input?.contentType??'').trim().toLowerCase();
  if(!/^image\/(jpeg|png|webp|gif)$/.test(contentType))
    throw new Error('IMAGE_MEDIA_REQUIRED');

  const category=String(input?.category??'GENERAL').trim().toUpperCase();
  if(!['GENERAL','CHARACTER','OBJECT','CLUE','BACKGROUND','LOGO'].includes(category))
    throw new Error('INVALID_MEDIA_CATEGORY');

  const label=decodeHeaderValue(input?.label??input?.filename??'Image').trim().slice(0,160);
  const altText=decodeHeaderValue(input?.altText??label).trim().slice(0,300)||null;
  const tags=decodeHeaderValue(input?.tags??'').trim().slice(0,1000)||null;
  const skinId=String(input?.skinId??'').trim().toUpperCase().slice(0,80)||null;

  const extension={
    'image/jpeg':'jpg',
    'image/png':'png',
    'image/webp':'webp',
    'image/gif':'gif',
  }[contentType];

  const externalId=`MEDIA_LIB_${randomUUID().replaceAll('-','').toUpperCase()}`;
  const storageName=sanitizeFilename(input?.filename??`${externalId}.${extension}`);
  const objectPath=`murder-engine/media-library/${context.organization.id}/${externalId}-${storageName}`;
  const token=randomUUID();

  const [{getStorage}]=await Promise.all([
    import('firebase-admin/storage'),
  ]);

  const bucket=await resolveStorageBucket(getStorage);
  const file=bucket.file(objectPath);

  await file.save(raw,{
    resumable:false,
    metadata:{
      contentType,
      cacheControl:'public,max-age=31536000,immutable',
      metadata:{
        firebaseStorageDownloadTokens:token,
      },
    },
  });

  const source=
    `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(token)}`;

  const asset={
    organizationId:context.organization.id,
    externalId,
    label,
    category,
    mediaType:'IMAGE',
    source,
    altText,
    tags,
    skinId,
    active:true,
  };

  await write(INSERT_MUTATION,{data:asset});

  return asset;
}

export async function setScenarioMediaOverride(versionId,input){
  const context=await contextForVersion(versionId);

  const targetType=String(input?.targetType??'').trim().toUpperCase();
  const targetExternalId=String(input?.targetExternalId??'').trim();
  const assetExternalId=String(input?.assetExternalId??'').trim();

  if(!['CHARACTER','OBJECT'].includes(targetType))
    throw new Error('INVALID_MEDIA_TARGET_TYPE');

  if(!targetExternalId)
    throw new Error('TARGET_EXTERNAL_ID_REQUIRED');

  const key=overrideKey(targetType,targetExternalId);
  const overrides={...context.overrides};

  let objectTarget=null;
  if(targetType==='OBJECT'){
    const objectData=await read(OBJECT_TARGET_QUERY,{
      versionId,
      externalId:targetExternalId,
    });
    objectTarget=objectData?.gameObjects?.[0]??null;
  }

  const logisticsCode=
    String(objectTarget?.logisticsCode??'').trim()||null;

  const aliasKey=
    targetType==='OBJECT' &&
    logisticsCode &&
    logisticsCode!==targetExternalId
      ? overrideKey('OBJECT',logisticsCode)
      : null;

  if(!assetExternalId){
    delete overrides[key];
    if(aliasKey)delete overrides[aliasKey];
  }else{
    const data=await read(ASSET_QUERY,{
      organizationId:context.organization.id,
      externalId:assetExternalId,
    });

    const asset=data?.organizationMediaAssets?.[0];
    if(!asset)throw new Error('MEDIA_ASSET_NOT_FOUND');

    const override={
      assetExternalId:asset.externalId,
      label:asset.label,
      category:asset.category,
      mediaType:asset.mediaType,
      source:asset.source,
      altText:asset.altText??asset.label,
      skinId:asset.skinId??null,
      targetExternalId,
      targetLabel:objectTarget?.name??null,
      targetLogisticsCode:logisticsCode,
    };

    overrides[key]=override;
    if(aliasKey)overrides[aliasKey]=override;
  }

  await write(UPDATE_OVERRIDES_MUTATION,{
    versionId,
    mediaOverridesJson:Object.keys(overrides).length
      ? JSON.stringify(overrides)
      : null,
  });

  return {
    versionId,
    targetType,
    targetExternalId,
    override:overrides[key]??null,
    overrides,
  };
}

export function mediaOverrideFor(mediaOverrides,targetType,targetExternalId){
  const overrides=
    typeof mediaOverrides==='string'
      ? parseOverrides(mediaOverrides)
      : (mediaOverrides??{});

  return overrides[overrideKey(targetType,targetExternalId)]??null;
}

export const __mediaLibraryOps={
  CONTEXT_QUERY,
  LIST_QUERY,
  ASSET_QUERY,
  OBJECT_TARGET_QUERY,
  INSERT_MUTATION,
  UPDATE_OVERRIDES_MUTATION,
  parseOverrides,
  overrideKey,
};
