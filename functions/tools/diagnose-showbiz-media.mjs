import { initializeApp, getApps } from 'firebase-admin/app';
import { getDataConnect } from 'firebase-admin/data-connect';
import { listScenarioLibrary } from '../src/library.mjs';
import { listGameSessions, getGameSession } from '../src/sessions.mjs';
import { getPlayerPortal } from '../src/player.mjs';

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
    where: {scenarioVersionId: {eq: $versionId}}
    orderBy: {externalId: ASC}
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
    const clues=data.clues??[];
    const clue=clues.find(c=>
      /tonic|vocal|flacon/i.test(
        `${c.externalId??''} ${c.playerName??''} ${c.playerText??''} ${c.logisticsCode??''}`
      )
    )??null;
    const objects=data.gameObjects??[];
    const media=data.mediaAssets??[];
    let overrides={};
    try{
      overrides=JSON.parse(data.scenarioVersion?.mediaOverridesJson||'{}')||{};
    }catch{}

    const keys=Object.keys(overrides);
    const relevantOverrideKeys=keys.filter(k=>
      /SHW[-_]?COM[-_]?04|SB[-_]?OBJ[-_]?005|TONIC|VIAL|OBJ_SHW_COM_04/i.test(k)
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
      allOverrideKeys:keys,
      allOverrides:Object.fromEntries(keys.map(k=>[
        k,
        {
          assetExternalId:overrides[k]?.assetExternalId??null,
          label:overrides[k]?.label??null,
          source:overrides[k]?.source?'[SOURCE_PRESENT]':null,
          targetExternalId:overrides[k]?.targetExternalId??null,
          targetLogisticsCode:overrides[k]?.targetLogisticsCode??null,
        }
      ])),
      overrideKeyCount:keys.length,
    },null,2));
  }
}


const RUNTIME_DIAG_QUERY=`
query DiagnoseShowbizRuntime($sessionId: UUID!) {
  sessionObjects(
    where: {
      gameSessionId: {eq: $sessionId}
      objectExternalId: {eq: "OBJ_SHW_COM_04"}
    }
  ) {
    objectExternalId
    holderType
    holderExternalId
    inPlay
    identificationLevel
    updatedAt
  }
  sessionClueDiscoveries(
    where: {gameSessionId: {eq: $sessionId}}
  ) {
    characterExternalId
    clueExternalId
    sourceInteractionExternalId
    sourceRef
    discoveredAt
  }
}
`;

const sessions=await listGameSessions();
const showbizVersionIds=new Set(
  showbiz.flatMap(s=>s.versions.map(v=>v.id))
);

for(const summary of sessions.filter(s=>
  showbizVersionIds.has(s.scenarioVersion?.id)
)){
  const detail=await getGameSession(summary.id);

  const runtimeDiag=await read(
    RUNTIME_DIAG_QUERY,
    {sessionId:summary.id}
  );

  const currentVersionData=await read(
    DETAIL_QUERY,
    {versionId:summary.scenarioVersion?.id}
  );
  const soundClues=(currentVersionData.clues??[])
    .filter(clue=>clue.locationExternalId==='LOC_SOUND')
    .map(clue=>({
      externalId:clue.externalId,
      playerName:clue.playerName,
      objectExternalId:clue.objectExternalId??null,
      logisticsCode:clue.logisticsCode??null,
    }));
  const soundIds=new Set(soundClues.map(c=>c.externalId));
  const soundDiscoveries=(runtimeDiag.sessionClueDiscoveries??[])
    .filter(d=>soundIds.has(d.clueExternalId));

  console.log('SHOWBIZ_RUNTIME_DIAG',JSON.stringify({
    sessionId:summary.id,
    status:summary.status,
    tonicObjects:runtimeDiag.sessionObjects??[],
    tonicDiscoveries:(runtimeDiag.sessionClueDiscoveries??[])
      .filter(d=>d.clueExternalId==='CLUE_SHW_COM_04'),
    soundClues,
    soundDiscoveries,
  },null,2));

  const rows=[];

  for(const participant of detail?.participants??[]){
    if(
      participant.active===false ||
      !participant.characterExternalId ||
      !participant.playerAccessEnabled ||
      !participant.playerAccessToken
    ) continue;

    try{
      const portal=await getPlayerPortal(
        participant.playerAccessToken,
        {trackOpen:false}
      );

      const tonicObject=(portal.inventory??[]).find(o=>
        o.objectExternalId==='OBJ_SHW_COM_04' ||
        /tonic|vocal/i.test(String(o.name??''))
      )??null;

      const tonicDiscovery=(portal.discoveries??[]).find(d=>
        d.clueExternalId==='CLUE_SHW_COM_04' ||
        /tonic|vocal/i.test(String(d.clue?.playerName??''))
      )??null;

      const tonicEntry=(portal.documentEntries??[]).find(d=>
        d.clueExternalId==='CLUE_SHW_COM_04' ||
        d.objectExternalId==='OBJ_SHW_COM_04' ||
        /tonic|vocal/i.test(String(d.playerName??''))
      )??null;

      if(tonicObject||tonicDiscovery||tonicEntry){
        rows.push({
          characterExternalId:participant.characterExternalId,
          inventory:tonicObject?{
            objectExternalId:tonicObject.objectExternalId,
            name:tonicObject.name,
            logisticsCode:tonicObject.logisticsCode??null,
            visualMedia:tonicObject.visualMedia?{
              sourcePresent:Boolean(tonicObject.visualMedia.source),
              externalId:tonicObject.visualMedia.externalId??null,
              override:Boolean(tonicObject.visualMedia.override),
              inherited:Boolean(tonicObject.visualMedia.inherited),
            }:null,
          }:null,
          discovery:tonicDiscovery?{
            clueExternalId:tonicDiscovery.clueExternalId,
            inBag:Boolean(tonicDiscovery.clue?.inBag),
            objectExternalId:tonicDiscovery.clue?.objectExternalId??null,
            logisticsCode:tonicDiscovery.clue?.logisticsCode??null,
            visualMedia:tonicDiscovery.clue?.visualMedia?{
              sourcePresent:Boolean(tonicDiscovery.clue.visualMedia.source),
              externalId:tonicDiscovery.clue.visualMedia.externalId??null,
              override:Boolean(tonicDiscovery.clue.visualMedia.override),
              inherited:Boolean(tonicDiscovery.clue.visualMedia.inherited),
            }:null,
          }:null,
          documentEntry:tonicEntry?{
            clueExternalId:tonicEntry.clueExternalId,
            objectExternalId:tonicEntry.objectExternalId??null,
            hasObject:Boolean(tonicEntry.object),
            visualMedia:tonicEntry.visualMedia?{
              sourcePresent:Boolean(tonicEntry.visualMedia.source),
              externalId:tonicEntry.visualMedia.externalId??null,
              override:Boolean(tonicEntry.visualMedia.override),
              inherited:Boolean(tonicEntry.visualMedia.inherited),
            }:null,
            objectVisualMedia:tonicEntry.object?.visualMedia?{
              sourcePresent:Boolean(tonicEntry.object.visualMedia.source),
              externalId:tonicEntry.object.visualMedia.externalId??null,
              override:Boolean(tonicEntry.object.visualMedia.override),
              inherited:Boolean(tonicEntry.object.visualMedia.inherited),
            }:null,
          }:null,
        });
      }
    }catch(error){
      rows.push({
        characterExternalId:participant.characterExternalId,
        error:error instanceof Error?error.message:String(error),
      });
    }
  }

  console.log('SHOWBIZ_PORTAL_DIAG',JSON.stringify({
    sessionId:summary.id,
    status:summary.status,
    versionId:summary.scenarioVersion?.id,
    matches:rows,
  },null,2));
}

const FORMULA_QUERY=`
query DiagnoseVocalFormula($versionId: UUID!) {
  clues(
    where: {
      scenarioVersionId: {eq: $versionId}
      externalId: {eq: "CLUE_SHW_R17_02"}
    }
    limit: 5
  ) {
    externalId
    playerName
    clueType
    playerText
    locationExternalId
    objectExternalId
    documentExternalId
    logisticsCode
    mediaExternalId
    support
    presentationMode
    shareable
    transferable
    consumable
    major
    active
  }
}
`;

for(const scenario of showbiz){
  for(const version of scenario.versions){
    const data=await read(FORMULA_QUERY,{versionId:version.id});
    console.log('CLUE_SHW_R17_02_DETAIL',JSON.stringify({
      versionId:version.id,
      clue:data.clues?.[0]??null,
    },null,2));
  }
}


const SKILLS_RUMORS_QUERY=`
query DiagnoseShowbizSkillsRumors($versionId: UUID!) {
  abilities(
    where: {scenarioVersionId: {eq: $versionId}}
    orderBy: {externalId: ASC}
  ) {
    externalId
    name
    description
    category
    defaultLevel
    defaultMaxUses
    defaultCooldownMinutes
    secret
    active
  }

  abilityAssignments(
    where: {scenarioVersionId: {eq: $versionId}}
    orderBy: {ownerExternalId: ASC}
  ) {
    externalId
    ownerType
    ownerExternalId
    abilityExternalId
    level
    flatBonus
    usesOverride
    cooldownOverrideMinutes
    active
  }

  interactions(
    where: {scenarioVersionId: {eq: $versionId}}
    orderBy: {externalId: ASC}
  ) {
    externalId
    name
    category
    targetType
    scanMode
    abilityExternalId
    actorScope
    targetScope
    costResourceExternalId
    costValue
    costTiming
    resolution
    diceCount
    diceSides
    abilityLevelMultiplier
    flatBonus
    difficulty
    opposedAbilityExternalId
    tieRule
    validation
    maxUses
    limitPerTarget
    cooldownMinutes
    targetSecret
    active
  }

  characters(
    where: {scenarioVersionId: {eq: $versionId}}
    orderBy: {externalId: ASC}
  ) {
    externalId
    name
    publicRole
    active
  }

  clues(
    where: {scenarioVersionId: {eq: $versionId}}
    orderBy: {externalId: ASC}
  ) {
    externalId
    playerName
    clueType
    playerText
    discoveryHook
    major
    shareable
    transferable
    active
  }
}
`;

for(const scenario of showbiz){
  for(const version of scenario.versions){
    const data=await read(SKILLS_RUMORS_QUERY,{versionId:version.id});
    const chars=new Map(
      (data.characters??[]).map(x=>[x.externalId,x])
    );

    const assignments=(data.abilityAssignments??[])
      .filter(x=>x.active!==false)
      .map(x=>({
        ...x,
        ownerName:chars.get(x.ownerExternalId)?.name??x.ownerExternalId,
      }));

    const rumorClues=(data.clues??[])
      .filter(x=>
        x.active!==false &&
        String(x.clueType??'').toUpperCase()==='RUMOR'
      )
      .map(x=>({
        ...x,
        targetCharacterExternalId:
          String(x.discoveryHook??'')
            .match(/^(?:RUMOR_TARGET|CHARACTER_TARGET|TARGET_CHARACTER|ABOUT_CHARACTER)\s*:\s*(.+)$/i)?.[1]
            ?.trim()??null,
      }))
      .map(x=>({
        ...x,
        targetName:
          chars.get(x.targetCharacterExternalId)?.name??
          x.targetCharacterExternalId,
      }));

    console.log(
      'SHOWBIZ_SKILLS_RUMORS_DIAG',
      JSON.stringify({
        version:{
          id:version.id,
          versionLabel:version.versionLabel,
          variantName:version.variantName,
        },
        abilities:(data.abilities??[]).filter(x=>x.active!==false),
        assignments,
        interactions:(data.interactions??[]).filter(x=>x.active!==false),
        rumorCount:rumorClues.length,
        rumorClues,
      },null,2)
    );
  }
}


for(const scenario of showbiz){
  for(const version of scenario.versions){
    const data=await read(SKILLS_RUMORS_QUERY,{versionId:version.id});
    const chars=new Map((data.characters??[]).map(x=>[x.externalId,x.name]));
    const defs=new Map((data.abilities??[]).map(x=>[x.externalId,x]));
    const interactionsByAbility=new Map();
    for(const interaction of data.interactions??[]){
      if(interaction.active===false||!interaction.abilityExternalId)continue;
      const arr=interactionsByAbility.get(interaction.abilityExternalId)??[];
      arr.push({
        id:interaction.externalId,
        name:interaction.name,
        targetType:interaction.targetType,
        scanMode:interaction.scanMode,
        cost:`${interaction.costValue??0} ${interaction.costResourceExternalId??''}`.trim(),
        resolution:interaction.resolution,
        validation:interaction.validation,
        maxUses:interaction.maxUses,
        limitPerTarget:interaction.limitPerTarget,
        cooldownMinutes:interaction.cooldownMinutes,
      });
      interactionsByAbility.set(interaction.abilityExternalId,arr);
    }

    const grouped=(data.abilities??[])
      .filter(a=>a.active!==false)
      .map(a=>({
        id:a.externalId,
        name:a.name,
        description:a.description,
        defaultMaxUses:a.defaultMaxUses,
        defaultCooldownMinutes:a.defaultCooldownMinutes,
        owners:(data.abilityAssignments??[])
          .filter(x=>x.active!==false&&x.abilityExternalId===a.externalId)
          .map(x=>({
            id:x.ownerExternalId,
            name:chars.get(x.ownerExternalId)??x.ownerExternalId,
            usesOverride:x.usesOverride,
            cooldownOverrideMinutes:x.cooldownOverrideMinutes,
          })),
        interactions:interactionsByAbility.get(a.externalId)??[],
      }));

    const rumors=(data.clues??[])
      .filter(x=>x.active!==false&&String(x.clueType??'').toUpperCase()==='RUMOR')
      .map(x=>({
        id:x.externalId,
        name:x.playerName,
        text:x.playerText,
        discoveryHook:x.discoveryHook,
      }));

    console.log('SHOWBIZ_SKILLS_SUMMARY',JSON.stringify({
      versionId:version.id,
      grouped,
      rumors,
    },null,2));
  }
}
