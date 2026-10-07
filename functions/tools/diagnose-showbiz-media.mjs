import { initializeApp, getApps } from 'firebase-admin/app';
import { getDataConnect } from 'firebase-admin/data-connect';
import { listScenarioLibrary } from '../src/library.mjs';

if(!getApps().length) initializeApp();

const dc=getDataConnect({
  location:'europe-west1',
  serviceId:'murder-engine',
});

async function read(operation,variables){
  const response=await dc.executeGraphqlRead(operation,{variables});
  const errors=response?.errors??response?.data?.errors??[];
  if(errors.length){
    console.error('GRAPHQL_ERRORS',JSON.stringify(errors,null,2));
    process.exit(2);
  }
  return response?.data??response;
}

const DETAIL_QUERY=`
query DiagnoseShowbizMedia($versionId: UUID!) {
  scenarioVersion(id: $versionId) {
    id
    versionLabel
    variantName
    sourceFilename
    importedAt
    mediaOverridesJson
    scenario { id title slug }
  }
  clues(
    where: {
      scenarioVersionId: {eq: $versionId}
      externalId: {eq: "SHW-COM-04"}
    }
    limit: 5
  ) {
    externalId
    playerName
    clueType
    playerText
    locationExternalId
    objectExternalId
    logisticsCode
    mediaExternalId
    support
    presentationMode
    active
  }
  gameObjects(
    where: {scenarioVersionId: {eq: $versionId}}
    orderBy: {externalId: ASC}
  ) {
    externalId
    name
    logisticsCode
    mediaExternalId
    visualArchetypeCode
    active
  }
  mediaAssets(
    where: {scenarioVersionId: {eq: $versionId}}
    orderBy: {externalId: ASC}
  ) {
    externalId
    mediaType
    source
    altText
    active
  }
}
`;

const scenarios=await listScenarioLibrary();
const showbiz=scenarios.filter(s=>
  /showbiz|hollywood|midnight orchid/i.test(
    `${s.title??''} ${s.slug??''}`
  )
);

console.log('SHOWBIZ_SCENARIOS',showbiz.map(s=>({
  id:s.id,
  title:s.title,
  slug:s.slug,
  versions:s.versions.map(v=>({
    id:v.id,
    versionLabel:v.versionLabel,
    variantName:v.variantName,
    sourceFilename:v.sourceFilename,
    importedAt:v.importedAt,
  }))
})));

for(const scenario of showbiz){
  for(const version of scenario.versions){
    const data=await read(DETAIL_QUERY,{versionId:version.id});
    const clue=data.clues?.[0]??null;
    const objects=data.gameObjects??[];
    const media=data.mediaAssets??[];
    let overrides={};
    try{
      overrides=JSON.parse(data.scenarioVersion?.mediaOverridesJson||'{}')||{};
    }catch{}

    const keys=Object.keys(overrides);
    const relevantOverrideKeys=keys.filter(k=>
      /SHW-COM-04|SB-OBJ-005|TONIC|VIAL/i.test(k)
    );

    const matchingObjects=objects.filter(o=>
      o.externalId===clue?.objectExternalId ||
      o.logisticsCode==='SB-OBJ-005' ||
      /tonic|flacon|vocal/i.test(`${o.name??''}`)
    );

    const matchingMedia=media.filter(m=>
      m.externalId===clue?.mediaExternalId ||
      matchingObjects.some(o=>o.mediaExternalId===m.externalId) ||
      /tonic|flacon|vocal|vial/i.test(
        `${m.externalId??''} ${m.altText??''} ${m.source??''}`
      )
    ).map(m=>({
      ...m,
      source:m.source ? '[SOURCE_PRESENT]' : null,
    }));

    const relevantOverrides=Object.fromEntries(
      relevantOverrideKeys.map(k=>[
        k,
        {
          assetExternalId:overrides[k]?.assetExternalId??null,
          label:overrides[k]?.label??null,
          source:overrides[k]?.source?'[SOURCE_PRESENT]':null,
          targetExternalId:overrides[k]?.targetExternalId??null,
          targetLogisticsCode:overrides[k]?.targetLogisticsCode??null,
        }
      ])
    );

    console.log('SHOWBIZ_VERSION_DIAG',JSON.stringify({
      version:{
        id:data.scenarioVersion?.id,
        versionLabel:data.scenarioVersion?.versionLabel,
        variantName:data.scenarioVersion?.variantName,
        sourceFilename:data.scenarioVersion?.sourceFilename,
        importedAt:data.scenarioVersion?.importedAt,
      },
      clue,
      matchingObjects,
      matchingMedia,
      relevantOverrides,
      overrideKeyCount:keys.length,
    },null,2));
  }
}
