import { initializeApp, getApps } from 'firebase-admin/app';
import { getDataConnect } from 'firebase-admin/data-connect';
import { writeFile } from 'node:fs/promises';
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
    console.error(JSON.stringify(errors,null,2));
    process.exit(2);
  }
  return response?.data??response;
}

const scenarios=await listScenarioLibrary();
const candidates=scenarios.flatMap(s=>
  (s.versions??[]).map(v=>({
    scenario:s,
    version:v,
  }))
).filter(x=>
  /showbiz|hollywood/i.test(
    `${x.scenario.title??''} ${x.scenario.slug??''} ${x.version.sourceFilename??''}`
  )
);

const preferred=candidates.find(x=>
  String(x.version.sourceFilename??'')
    .includes('Murder_Engine_MASTER_SHOWBIZ_V1_6_EN_Dynamic_Casting_Rumours(1).xlsx')
);

const chosen=preferred ?? candidates.sort((a,b)=>
  new Date(b.version.importedAt??0).getTime()-
  new Date(a.version.importedAt??0).getTime()
)[0];

if(!chosen){
  console.error('SHOWBIZ_VERSION_NOT_FOUND');
  process.exit(3);
}

const versionId=chosen.version.id;

const QUERY=`
query ExportShowbizMaster($versionId: UUID!) {
  scenarioVersion(id: $versionId) {
    id sourceScenarioId versionLabel variantName genderProfile variantNotes
    templateVersion language status subtitle universe era gmSummary playerSummary
    durationMinutes minPlayers maxPlayers sourceFilename sourceHash runtimeDataVersion
    skinId accentColor logoMediaExternalId backgroundMediaExternalId mediaOverridesJson
    scenario { id title slug skinId accentColor archived }
  }

  characters(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:500) {
    externalId name publicRole dramaticFunction narrativeAge gender importance intensity
    biography secretIntro interpretationNotes appearanceNotes apparentMotive personalTimeline
    motto portraitMediaId portraitArchetypeCode playable active
  }

  plots(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:500) {
    externalId title plotType importance gmSummary active
  }

  objectives(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:1000) {
    externalId ownerType ownerExternalId title description objectiveType secret
    initialStatus triggerExternalId importance active
  }

  relationships(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:1000) {
    externalId characterAExternalId characterBExternalId relationType textA textB
    visibility plotExternalId active
  }

  facts(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:1000) {
    externalId title text nature importance plotExternalId notebookCategory isPublic active
  }

  initialKnowledges(where:{scenarioVersionId:{eq:$versionId}},limit:2000) {
    characterExternalId factExternalId sourceType
  }

  clues(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:2000) {
    externalId internalName playerName clueType playerText gmInterpretation discoveryHook
    plotExternalId locationExternalId objectExternalId documentExternalId support
    presentationMode shareable transferable consumable major logisticsCode mediaExternalId
    addToNotebook active
  }

  clueFacts(where:{scenarioVersionId:{eq:$versionId}},limit:3000) {
    clueExternalId factExternalId
  }

  documentDefinitions(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:1000) {
    externalId title textContent support mediaExternalIds reusable consumable
    ownerInitialType ownerInitialExternalId clueExternalIds logisticsCode
    propRequirementExternalId transferable stealable active
  }

  gameObjects(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:1000) {
    externalId name description support propRequirementExternalId ownerInitialType
    ownerInitialExternalId logisticsCode transferable stealable consumable initialCharges
    critical identification0 identification1 identification2 identification3
    mediaExternalId visualArchetypeCode active
  }

  gameLocations(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:500) {
    externalId name description qrCode permanent themeExternalId lockExternalId active
  }

  resources(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:500) {
    externalId name scopeType unit defaultValue maxValue physicalMode isPublic active
  }

  resourceAssignments(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:1000) {
    externalId ownerType ownerExternalId resourceExternalId initialValue maxOverride notes active
  }

  gameStateDefinitions(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:500) {
    externalId name description defaultDurationSeconds visibleToHolder visiblePublic blockedActionIds active
  }

  gamePhaseDefinitions(where:{scenarioVersionId:{eq:$versionId}},orderBy:{orderIndex:ASC},limit:500) {
    externalId name orderIndex gmDescription triggerType triggerRef manualConfirm active
  }

  gameEventDefinitions(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:1000) {
    externalId title gmDescription triggerType triggerRef delayMinutes absoluteTime phaseExternalId
    validation notificationExternalId priority mandatory repeatable fallbackGm manualFallbackAllowed active
  }

  abilities(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:500) {
    externalId name description category defaultLevel defaultMaxUses defaultCooldownMinutes secret active
  }

  abilityAssignments(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:1000) {
    externalId ownerType ownerExternalId abilityExternalId level flatBonus usesOverride
    cooldownOverrideMinutes active
  }

  interactions(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:1000) {
    externalId name category targetType scanMode abilityExternalId actorScope targetScope
    costResourceExternalId costValue costTiming resolution diceCount diceSides
    abilityLevelMultiplier flatBonus difficulty opposedAbilityExternalId tieRule validation
    maxUses limitPerTarget cooldownMinutes targetSecret
    notificationSuccessActorExternalId notificationFailureActorExternalId
    notificationSuccessTargetExternalId notificationFailureTargetExternalId active
  }

  voteDefinitions(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:500) {
    externalId title question scopeType scopeRef choicesMode secret votesPerElector
    weighted weightResourceExternalId abstention modifiable closeMode durationMinutes
    resultVisibility tieRule notificationOpenExternalId notificationResultExternalId active
  }

  voteOptionDefinitions(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:1000) {
    externalId voteExternalId orderIndex label description characterExternalId enabledConditionExternalId active
  }

  mediaAssets(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:1000) {
    externalId mediaType source altText notes active
  }

  skinVisualDefinitions(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:1000) {
    externalId skinId visualType archetypeCode mediaExternalId displayName description variant active
  }
}
`;

const data=await read(QUERY,{versionId});

const output={
  exportedAt:new Date().toISOString(),
  source:{
    scenarioTitle:chosen.scenario.title,
    scenarioSlug:chosen.scenario.slug,
    versionId,
    versionLabel:chosen.version.versionLabel,
    sourceFilename:chosen.version.sourceFilename,
    importedAt:chosen.version.importedAt,
  },
  ...data,
};

await writeFile(
  'showbiz-master-export.json',
  JSON.stringify(output,null,2),
  'utf8'
);

console.log(JSON.stringify({
  source:output.source,
  counts:Object.fromEntries(
    Object.entries(data)
      .filter(([,v])=>Array.isArray(v))
      .map(([k,v])=>[k,v.length])
  )
},null,2));
