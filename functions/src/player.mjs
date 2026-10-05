import { randomBytes } from 'node:crypto';
import { executeInteraction, transferSessionObject, revealClueToCharacter } from './interactions.mjs';
import { castSessionBallot } from './votes.mjs';
import { getGameSession } from './sessions.mjs';

const PLAYER_ACCESS_QUERY = `
query PlayerAccessByToken($token: String!) {
  sessionParticipants(where: {playerAccessToken: {eq: $token}}) {
    id displayName email active characterExternalId briefingStatus
    characterDisplayName characterGenderVariant characterSnapshotJson characterSnapshotAt
    playerAccessToken playerAccessEnabled playerFirstOpenedAt playerLastOpenedAt playerOpenCount briefingReadAt
    gameSession {
      id name scheduledAt venue language status runtimeInitializedAt startedAt pausedAt finishedAt
      scenarioVersion {
        id
        versionLabel
        playerSummary
        skinId
        accentColor
        logoMediaExternalId
        backgroundMediaExternalId
        scenario { id title slug skinId accentColor }
      }
      sessionParticipants_on_gameSession(orderBy: {createdAt: ASC}) {
        id displayName active characterExternalId
        characterDisplayName characterGenderVariant characterSnapshotJson characterSnapshotAt
      }
    }
  }
}
`;

const PLAYER_SOURCE_QUERY = `
query PlayerSource($versionId: UUID!) {
  characters(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId name publicRole dramaticFunction narrativeAge gender biography secretIntro interpretationNotes appearanceNotes apparentMotive personalTimeline motto portraitMediaId portraitArchetypeCode playable active
  }
  objectives(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId ownerType ownerExternalId title description objectiveType secret initialStatus importance active
  }
  relationships(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId characterAExternalId characterBExternalId relationType textA textB visibility plotExternalId active
  }
  facts(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId title text nature importance notebookCategory isPublic active
  }
  clues(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId playerName clueType playerText support presentationMode addToNotebook locationExternalId objectExternalId documentExternalId mediaExternalId major active
  }
  clueFacts(where: {scenarioVersionId: {eq: $versionId}}) { clueExternalId factExternalId }
  documentDefinitions(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId title textContent support mediaExternalIds reusable consumable ownerInitialType ownerInitialExternalId transferable stealable active
  }
  mediaAssets(where: {scenarioVersionId: {eq: $versionId}}) { externalId mediaType source altText notes active }
  skinVisualDefinitions(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId skinId visualType archetypeCode mediaExternalId displayName description variant active
  }
  resources(where: {scenarioVersionId: {eq: $versionId}}) { externalId name unit isPublic active }
  gameObjects(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId name description logisticsCode transferable stealable consumable critical identification0 identification1 identification2 identification3 mediaExternalId visualArchetypeCode active
  }
  gameStateDefinitions(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId name description visibleToHolder visiblePublic active
  }
  abilities(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId name description category defaultLevel defaultMaxUses defaultCooldownMinutes secret active
  }
  abilityAssignments(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId ownerType ownerExternalId abilityExternalId level flatBonus usesOverride cooldownOverrideMinutes active
  }
  interactions(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId name category targetType scanMode abilityExternalId actorScope costResourceExternalId costValue costTiming
    resolution diceCount diceSides abilityLevelMultiplier flatBonus difficulty opposedAbilityExternalId tieRule validation
    maxUses limitPerTarget cooldownMinutes targetSecret active
  }
  gameLocations(where: {scenarioVersionId: {eq: $versionId}}) { externalId name description qrCode permanent lockExternalId active }
  voteDefinitions(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId title question scopeType scopeRef choicesMode secret votesPerElector weighted abstention modifiable active
  }
  voteOptionDefinitions(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId voteExternalId orderIndex label description characterExternalId active
  }
}
`;

const PLAYER_RUNTIME_QUERY = `
query PlayerRuntime($sessionId: UUID!) {
  sessionResources(where: {gameSessionId: {eq: $sessionId}}) {
    characterExternalId resourceExternalId initialValue currentValue maxValue updatedAt
  }
  sessionKnowledges(where: {gameSessionId: {eq: $sessionId}}) {
    characterExternalId factExternalId sourceType learnedAt
  }
  sessionObjectives(where: {gameSessionId: {eq: $sessionId}}) {
    characterExternalId objectiveExternalId status progress notes updatedAt
  }
  sessionObjects(where: {gameSessionId: {eq: $sessionId}}) {
    objectExternalId holderType holderExternalId charges identificationLevel inPlay updatedAt
  }
  sessionCharacterStates(where: {gameSessionId: {eq: $sessionId}}) {
    characterExternalId stateExternalId active appliedAt expiresAt sourceRef
  }
  sessionClueDiscoveries(where: {gameSessionId: {eq: $sessionId}}) {
    characterExternalId clueExternalId sourceInteractionExternalId sourceRef discoveredAt
  }
  sessionInteractionUses(where: {gameSessionId: {eq: $sessionId}}) {
    interactionExternalId actorCharacterExternalId targetType targetExternalId success createdAt
  }
  sessionVotes(where: {gameSessionId: {eq: $sessionId}}) {
    voteExternalId round status eligibleOptionExternalIds openedAt closedAt resultJson
  }
  sessionBallots(where: {gameSessionId: {eq: $sessionId}}) {
    voteExternalId round electorCharacterExternalId selectedOptionExternalIds weight castAt updatedAt
  }
  sessionPlayerNotifications(where: {gameSessionId: {eq: $sessionId}}) {
    id characterExternalId kind title body priority refExternalId createdAt readAt
  }
  sessionActionLogs(where: {gameSessionId: {eq: $sessionId}}, orderBy: {createdAt: DESC}, limit: 100) {
    id actionType characterExternalId refExternalId beforeValue afterValue deltaValue note createdAt
  }
  sessionStealGrants(where: {gameSessionId: {eq: $sessionId}}) {
    grantToken interactionExternalId actorCharacterExternalId targetCharacterExternalId kind status createdAt expiresAt usedAt chosenObjectExternalId
  }
}
`;

const UPDATE_PLAYER_ACCESS_MUTATION = `
mutation UpdatePlayerAccess($participantId: UUID!, $enabled: Boolean!, $token: String, $briefingStatus: String!) {
  sessionParticipant_update(id: $participantId, data: {playerAccessEnabled: $enabled, playerAccessToken: $token, briefingStatus: $briefingStatus})
}
`;
const TRACK_PLAYER_OPEN_MUTATION = `
mutation TrackPlayerOpen($participantId: UUID!, $firstOpenedAt: Timestamp, $lastOpenedAt: Timestamp!, $openCount: Int!, $briefingStatus: String!) {
  sessionParticipant_update(id: $participantId, data: {playerFirstOpenedAt: $firstOpenedAt, playerLastOpenedAt: $lastOpenedAt, playerOpenCount: $openCount, briefingStatus: $briefingStatus})
}
`;
const MARK_BRIEFING_READ_MUTATION = `
mutation MarkBriefingRead($participantId: UUID!, $readAt: Timestamp!) {
  sessionParticipant_update(id: $participantId, data: {briefingStatus: "READ", briefingReadAt: $readAt})
}
`;
const INSERT_PLAYER_ACTION_LOG_MUTATION = `
mutation InsertPlayerActionRequest($data: SessionActionLog_Data!) { sessionActionLog_insert(data: $data) }
`;
const INSERT_NOTIFICATION_MUTATION = `mutation InsertPlayerNotification($data: SessionPlayerNotification_Data!) { sessionPlayerNotification_insert(data: $data) }`;
const MARK_NOTIFICATION_READ_MUTATION = `mutation MarkPlayerNotificationRead($notificationId: UUID!, $readAt: Timestamp!) { sessionPlayerNotification_update(id: $notificationId, data: {readAt: $readAt}) }`;
const INSERT_STEAL_GRANT_MUTATION = `mutation InsertStealGrant($data: SessionStealGrant_Data!) { sessionStealGrant_insert(data: $data) }`;
const CLAIM_STEAL_MUTATION = `
mutation ClaimSteal(
  $sessionId: UUID!, $grantToken: String!, $objectExternalId: String!, $actorCharacterExternalId: String!, $usedAt: Timestamp!,
  $notification: SessionPlayerNotification_Data!, $log: SessionActionLog_Data!
) @transaction {
  sessionObject_update(
    key: {gameSessionId: $sessionId, objectExternalId: $objectExternalId}
    data: {holderType: "CHARACTER", holderExternalId: $actorCharacterExternalId, updatedAt: $usedAt}
  )
  sessionStealGrant_update(
    key: {gameSessionId: $sessionId, grantToken: $grantToken}
    data: {status: "USED", usedAt: $usedAt, chosenObjectExternalId: $objectExternalId}
  )
  sessionPlayerNotification_insert(data: $notification)
  sessionActionLog_insert(data: $log)
}
`;

const TRANSFER_PLAYER_CASH_MUTATION = `
mutation TransferPlayerCash(
  $sessionId: UUID!,
  $senderCharacterExternalId: String!,
  $targetCharacterExternalId: String!,
  $senderValue: Int!,
  $targetValue: Int!,
  $updatedAt: Timestamp!,
  $notification: SessionPlayerNotification_Data!,
  $senderLog: SessionActionLog_Data!,
  $targetLog: SessionActionLog_Data!
) @transaction {
  senderResource: sessionResource_update(
    key: {gameSessionId: $sessionId, characterExternalId: $senderCharacterExternalId, resourceExternalId: "RES_CASH"}
    data: {currentValue: $senderValue, updatedAt: $updatedAt}
  )
  targetResource: sessionResource_update(
    key: {gameSessionId: $sessionId, characterExternalId: $targetCharacterExternalId, resourceExternalId: "RES_CASH"}
    data: {currentValue: $targetValue, updatedAt: $updatedAt}
  )
  notification: sessionPlayerNotification_insert(data: $notification)
  senderLog: sessionActionLog_insert(data: $senderLog)
  targetLog: sessionActionLog_insert(data: $targetLog)
}
`;

const SYSTEM_LOCATION_SEARCH_MUTATION = `
mutation SystemLocationSearch(
  $sessionId: UUID!, $characterExternalId: String!, $currentValue: Int!, $updatedAt: Timestamp!,
  $use: SessionInteractionUse_Data!, $log: SessionActionLog_Data!
) @transaction {
  sessionResource_update(
    key: {gameSessionId: $sessionId, characterExternalId: $characterExternalId, resourceExternalId: "RES_PA"}
    data: {currentValue: $currentValue, updatedAt: $updatedAt}
  )
  sessionInteractionUse_insert(data: $use)
  sessionActionLog_insert(data: $log)
}
`;

async function getAdminDataConnect() {
  const [{ initializeApp, getApps }, { getDataConnect }] = await Promise.all([
    import('firebase-admin/app'), import('firebase-admin/data-connect'),
  ]);
  if (!getApps().length) initializeApp();
  return getDataConnect({ location: 'europe-west1', serviceId: 'murder-engine' });
}
async function defaultReader(operation, variables) {
  const dc = await getAdminDataConnect();
  const response = await dc.executeGraphqlRead(operation, { variables });
  const errors = response?.errors ?? response?.data?.errors ?? [];
  if (errors.length) { const e = new Error('DATACONNECT_PLAYER_READ_FAILED'); e.details = errors; throw e; }
  return response?.data ?? response;
}
async function defaultExecutor(operation, variables) {
  const dc = await getAdminDataConnect();
  const response = await dc.executeGraphql(operation, { variables });
  const errors = response?.errors ?? response?.data?.errors ?? [];
  if (errors.length) { const e = new Error('DATACONNECT_PLAYER_WRITE_FAILED'); e.details = errors; throw e; }
  return response?.data ?? response;
}

const splitIds = value => String(value ?? '').split(';').map(x=>x.trim()).filter(Boolean);

function locationOwnerCharacter(location) {
  const raw=String(location?.lockExternalId??'').trim();
  const match=raw.match(/^OWNER:(.+)$/i);
  return match ? String(match[1]).trim() : null;
}

function persistentLocationClues(source,locationExternalId) {
  return (source.clues??[]).filter(
    clue =>
      clue.active!==false &&
      clue.locationExternalId===locationExternalId &&
      !clue.objectExternalId
  );
}

function remainingLocationObjects(runtime,locationExternalId) {
  return (runtime.sessionObjects??[]).filter(
    object =>
      object.inPlay!==false &&
      object.holderType==='LOCATION' &&
      object.holderExternalId===locationExternalId
  );
}

function locationIsGloballyEmpty(source,runtime,locationExternalId) {
  return (
    persistentLocationClues(source,locationExternalId).length===0 &&
    remainingLocationObjects(runtime,locationExternalId).length===0
  );
}

const byId = rows => new Map((rows ?? []).map(r=>[r.externalId,r]));
function safeToken(value) {
  const token = String(value ?? '').trim();
  if (!/^[A-Za-z0-9_-]{32,160}$/.test(token)) throw new Error('INVALID_PLAYER_TOKEN');
  return token;
}
function nowIso(now = new Date()) { return now instanceof Date ? now.toISOString() : new Date(now).toISOString(); }

function parseIncarnationSnapshot(participant){
  if(!participant?.characterSnapshotJson)return null;

  try{
    const value=
      JSON.parse(participant.characterSnapshotJson);

    if(
      !value ||
      value.characterExternalId !==
        participant.characterExternalId
    ) return null;

    return value;

  }catch{
    return null;
  }
}

function applySessionIncarnations(
  participant,
  session,
  source
){
  const participants=
    (session?.sessionParticipants_on_gameSession??[])
      .filter(
        p=>
          p.active!==false &&
          p.characterExternalId
      );

  const participantByCharacter=
    new Map(
      participants.map(
        p=>[p.characterExternalId,p]
      )
    );

  const characters=
    (source.characters??[])
      .map(character=>{

        const p=
          participantByCharacter.get(
            character.externalId
          );

        if(!p)return character;

        const snapshot=
          parseIncarnationSnapshot(p);

        return {
          ...character,
          ...(snapshot?.character??{}),

          externalId:
            character.externalId,

          name:
            p.characterDisplayName ||
            snapshot?.character?.name ||
            character.name,

          genderVariant:
            p.characterGenderVariant??null,
        };
      });


  const actorSnapshot=
    parseIncarnationSnapshot(participant);


  const objectiveOverrides=
    new Map(
      (actorSnapshot?.objectives??[])
        .map(
          objective=>[
            objective.externalId,
            objective
          ]
        )
    );


  const objectives=
    (source.objectives??[])
      .map(objective=>{

        if(
          objective.ownerExternalId !==
            participant.characterExternalId
        ) return objective;

        const override=
          objectiveOverrides.get(
            objective.externalId
          );

        if(!override)return objective;

        return {
          ...objective,
          title:
            override.title ??
            objective.title,

          description:
            override.description ??
            objective.description,
        };
      });


  const relationshipOverrides=
    new Map(
      (actorSnapshot?.relationships??[])
        .map(
          relationship=>[
            relationship.externalId,
            relationship
          ]
        )
    );


  const relationships=
    (source.relationships??[])
      .map(relationship=>{

        const override=
          relationshipOverrides.get(
            relationship.externalId
          );

        if(!override)return relationship;

        const isA=
          relationship.characterAExternalId ===
          participant.characterExternalId;

        const isB=
          relationship.characterBExternalId ===
          participant.characterExternalId;

        if(!isA&&!isB)
          return relationship;

        return {
          ...relationship,

          relationType:
            override.relationType ??
            relationship.relationType,

          textA:
            isA
              ? override.text
              : relationship.textA,

          textB:
            isB
              ? override.text
              : relationship.textB,
        };
      });


  return {
    ...source,
    characters,
    objectives,
    relationships,
  };
}

function visibilityAllowed(value) { return !['MJ','MJ_ONLY','SECRET_MJ','GM_ONLY'].includes(String(value ?? '').toUpperCase()); }

async function loadPlayerAccess(token, reader=defaultReader) {
  const safe = safeToken(token);
  const data = await reader(PLAYER_ACCESS_QUERY,{token:safe});
  const participant=(data?.sessionParticipants ?? [])[0] ?? null;
  if (!participant || participant.active===false || !participant.playerAccessEnabled) throw new Error('PLAYER_LINK_NOT_FOUND');
  if (!participant.characterExternalId) throw new Error('PLAYER_NOT_CAST');
  if (!participant.gameSession?.runtimeInitializedAt) throw new Error('RUNTIME_NOT_INITIALIZED');
  if (participant.gameSession?.status==='ARCHIVED') throw new Error('SESSION_ARCHIVED');
  return participant;
}

async function loadPlayerData(token, reader=defaultReader) {
  const participant=await loadPlayerAccess(token,reader);
  const session=participant.gameSession;
  const versionId=session?.scenarioVersion?.id;
  const [source,runtime]=await Promise.all([
    reader(PLAYER_SOURCE_QUERY,{versionId}),
    reader(PLAYER_RUNTIME_QUERY,{sessionId:session.id}),
  ]);
  const resolvedSource=
    applySessionIncarnations(
      participant,
      session,
      source??{}
    );

  return {
    participant,
    session,
    source:resolvedSource,
    runtime:runtime??{}
  };
}

function effectiveAbilities(source, characterExternalId) {
  const defs=byId((source.abilities??[]).filter(x=>x.active!==false));
  return (source.abilityAssignments??[]).filter(a=>a.active!==false&&a.ownerType==='CHARACTER'&&a.ownerExternalId===characterExternalId).map(a=>{
    const d=defs.get(a.abilityExternalId); if(!d)return null;
    return {externalId:d.externalId,name:d.name,description:d.description,category:d.category,level:Number(a.level??d.defaultLevel??0),flatBonus:Number(a.flatBonus??0),maxUses:a.usesOverride??d.defaultMaxUses??null,cooldownMinutes:a.cooldownOverrideMinutes??d.defaultCooldownMinutes??null,secret:Boolean(d.secret)};
  }).filter(Boolean);
}

function playerInteractions(source,runtime,session,characterExternalId,resources,now=new Date()) {
  const abilities=effectiveAbilities(source,characterExternalId);
  const abilityMap=new Map(abilities.map(a=>[a.externalId,a]));
  const otherPlayers=(session.sessionParticipants_on_gameSession??[]).filter(p=>p.active!==false&&p.characterExternalId&&p.characterExternalId!==characterExternalId);
  const charMap=byId(source.characters??[]);
  const objectMap=byId(source.gameObjects??[]);
  const inPlayObjects=(runtime.sessionObjects??[]).filter(o=>o.inPlay!==false);
  return (source.interactions??[]).filter(i=>i.active!==false&&(!i.abilityExternalId||abilityMap.has(i.abilityExternalId))).map(i=>{
    const ability=i.abilityExternalId?abilityMap.get(i.abilityExternalId):null;
    const uses=(runtime.sessionInteractionUses??[]).filter(u=>u.actorCharacterExternalId===characterExternalId&&u.interactionExternalId===i.externalId);
    const maxUses=i.maxUses??ability?.maxUses??null;
    const cooldownMinutes=i.cooldownMinutes??ability?.cooldownMinutes??null;
    let cooldownRemainingSeconds=0;
    if(cooldownMinutes&&uses.length){const latest=Math.max(...uses.map(u=>new Date(u.createdAt).getTime()).filter(Number.isFinite));cooldownRemainingSeconds=Math.max(0,Math.ceil((Number(cooldownMinutes)*60000-(now.getTime()-latest))/1000));}
    const costRow=resources.find(r=>r.resourceExternalId===i.costResourceExternalId);
    const targetType=String(i.targetType??'NONE').toUpperCase();
    let targets=[];
    if(['PLAYER','CHARACTER'].includes(targetType)) targets=otherPlayers.map(p=>({id:p.characterExternalId,label:charMap.get(p.characterExternalId)?.name??p.displayName,subtitle:charMap.get(p.characterExternalId)?.publicRole??p.displayName}));
    else if(targetType==='LOCATION') targets=(source.gameLocations??[]).filter(x=>x.active!==false).map(x=>({id:x.externalId,label:x.name,subtitle:null}));
    else if(targetType==='OBJECT'&&!i.targetSecret) targets=inPlayObjects.map(o=>({id:o.objectExternalId,label:objectMap.get(o.objectExternalId)?.name??o.objectExternalId,subtitle:null}));
    const clandestineKind=clandestineInteractionKind(i);
    const scanMode=interactionScanMode(i);
    const characterTarget=['PLAYER','CHARACTER'].includes(targetType);
    const requiresGm=String(i.resolution).toUpperCase()==='GM'||String(i.validation??'').toUpperCase()==='GM'||(Boolean(i.targetSecret)&&!characterTarget&&!clandestineKind);
    const running=session.status==='LIVE';
    const directEnabled=running&&!requiresGm;
    const blockedReason=!running?'Disponible pendant le live':requiresGm?'À demander au MJ':null;
    return {externalId:i.externalId,name:i.name,category:i.category,targetType:i.targetType,scanMode,resolution:i.resolution,directEnabled,blockedReason,clandestineKind,ability,costResourceExternalId:i.costResourceExternalId,costValue:i.costValue,currentCostResourceValue:costRow?.currentValue??null,diceCount:i.diceCount,diceSides:i.diceSides,difficulty:i.difficulty,usesCount:uses.length,maxUses,limitPerTarget:i.limitPerTarget??null,cooldownMinutes,cooldownRemainingSeconds,targets};
  });
}

function normalizeSearchText(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}

export function interactionScanMode(interaction) {
  const target=String(interaction?.targetType ?? '').toUpperCase();
  if(!['PLAYER','CHARACTER'].includes(target)) return null;
  const explicit=String(interaction?.scanMode ?? '').trim().toUpperCase();
  if(['DIRECT','DISCRET'].includes(explicit)) return explicit;
  return interaction?.targetSecret ? 'DISCRET' : 'DIRECT';
}

export function clandestineInteractionKind(interaction) {
  const target=String(interaction?.targetType ?? '').toUpperCase();
  if(!['PLAYER','CHARACTER'].includes(target)) return null;
  const hay=normalizeSearchText(`${interaction?.externalId ?? ''} ${interaction?.name ?? ''} ${interaction?.category ?? ''}`);
  if(/(vol|steal|pickpocket|chapard|derob|robbery|theft)/.test(hay)) return 'STEAL';
  if(/(fouill.*poche|search.*pocket|fouille.*joueur|inspect.*person|frisk|palpation)/.test(hay)) return 'SEARCH_PLAYER';
  return null;
}


export const LOCATION_SEARCH_COOLDOWN_SECONDS = 10 * 60;

export function isLocationSearchInteraction(interaction) {
  if (String(interaction?.targetType ?? '').toUpperCase() !== 'LOCATION') return false;
  if (String(interaction?.externalId ?? '') === 'SYSTEM_LOCATION_SEARCH') return true;
  const hay=normalizeSearchText(`${interaction?.externalId ?? ''} ${interaction?.name ?? ''} ${interaction?.category ?? ''}`);
  return /(fouill|search|inspect|explor|chercher|investig)/.test(hay);
}

function globalLocationSearchCooldownRemaining(source, runtime, characterExternalId, now=new Date()) {
  const searchIds=new Set(['SYSTEM_LOCATION_SEARCH', ...(source.interactions??[]).filter(isLocationSearchInteraction).map(i=>i.externalId)]);
  const times=(runtime.sessionInteractionUses??[])
    .filter(u=>u.actorCharacterExternalId===characterExternalId&&searchIds.has(u.interactionExternalId))
    .map(u=>new Date(u.createdAt).getTime()).filter(Number.isFinite);
  if(!times.length)return 0;
  const latest=Math.max(...times);
  return Math.max(0,Math.ceil((LOCATION_SEARCH_COOLDOWN_SECONDS*1000-(now.getTime()-latest))/1000));
}
export function isAutonomousLocationInteraction(interaction) {
  if (String(interaction?.targetType ?? '').toUpperCase() !== 'LOCATION' || interaction?.targetSecret) return false;
  const resolution=String(interaction?.resolution ?? 'GM').toUpperCase();
  const validation=String(interaction?.validation ?? '').toUpperCase();
  if (resolution !== 'GM' && validation !== 'GM') return true;
  const hay=normalizeSearchText(`${interaction?.externalId ?? ''} ${interaction?.name ?? ''} ${interaction?.category ?? ''}`);
  return /(fouill|search|inspect|explor|chercher|investig)/.test(hay);
}

function availableLocationRewards(source,runtime,characterExternalId,locationExternalId) {
  const discovered=new Set((runtime.sessionClueDiscoveries??[]).filter(d=>d.characterExternalId===characterExternalId).map(d=>d.clueExternalId));
  const clues=(source.clues??[]).filter(c=>c.active!==false&&c.locationExternalId===locationExternalId&&!discovered.has(c.externalId)).sort((a,b)=>Number(Boolean(b.major))-Number(Boolean(a.major))||String(a.externalId).localeCompare(String(b.externalId)));
  const objectDefs=new Map((source.gameObjects??[]).filter(o=>o.active!==false).map(o=>[o.externalId,o]));
  const objects=(runtime.sessionObjects??[]).filter(o=>o.inPlay!==false&&o.holderType==='LOCATION'&&o.holderExternalId===locationExternalId&&objectDefs.has(o.objectExternalId)).sort((a,b)=>String(a.objectExternalId).localeCompare(String(b.objectExternalId)));
  return {clues,objects,objectDefs};
}

function locationActionShape(source,runtime,session,characterExternalId,locationExternalId,resources,now=new Date()) {
  const location=(source.gameLocations??[]).find(x=>x.externalId===locationExternalId&&x.active!==false);
  if(!location) throw new Error('PLAYER_LOCATION_NOT_FOUND');
  const searchCooldownRemainingSeconds=globalLocationSearchCooldownRemaining(source,runtime,characterExternalId,now);
  const base=playerInteractions(source,runtime,session,characterExternalId,resources,now).filter(i=>String(i.targetType).toUpperCase()==='LOCATION'&&isAutonomousLocationInteraction(i));
  const actions=base.map(i=>{
    const uses=(runtime.sessionInteractionUses??[]).filter(u=>u.actorCharacterExternalId===characterExternalId&&u.interactionExternalId===i.externalId);
    const sameTarget=uses.filter(u=>u.targetExternalId===locationExternalId).length;
    const costBlocked=Boolean(i.costValue&&i.costResourceExternalId&&(i.currentCostResourceValue==null||Number(i.currentCostResourceValue)<Number(i.costValue)));
    const maxBlocked=i.maxUses!=null&&uses.length>=Number(i.maxUses);
    const targetBlocked=i.limitPerTarget!=null&&sameTarget>=Number(i.limitPerTarget);
    const ownCooldown=Number(i.cooldownRemainingSeconds??0);
    const searchCooldown=isLocationSearchInteraction(i)?searchCooldownRemainingSeconds:0;
    const cooldownRemainingSeconds=Math.max(ownCooldown,searchCooldown);
    const cooldownBlocked=cooldownRemainingSeconds>0;
    const blockedReason=session.status!=='LIVE'?'La partie n’est pas en cours':costBlocked?'Ressource insuffisante':maxBlocked?'Nombre maximal d’utilisations atteint':targetBlocked?'Ce lieu a déjà été fouillé avec cette action':cooldownBlocked?(searchCooldown>0?'Nouvelle fouille disponible dans quelques minutes':'Action en cooldown'):null;
    return {...i,targetExternalId:locationExternalId,autonomous:true,available:!blockedReason,blockedReason,usesOnLocation:sameTarget,cooldownRemainingSeconds,searchCooldownRemainingSeconds:searchCooldown};
  });
  const rewards=availableLocationRewards(source,runtime,characterExternalId,locationExternalId);
  if(!actions.length&&(!location.lockExternalId||locationOwnerCharacter(location))&&(rewards.clues.length||rewards.objects.length)){
    const pa=resources.find(r=>r.resourceExternalId==='RES_PA');
    const blockedReason=session.status!=='LIVE'?'La partie n’est pas en cours':!pa?'PA indisponibles':Number(pa.currentValue??0)<1?'PA insuffisants':searchCooldownRemainingSeconds>0?'Nouvelle fouille disponible dans quelques minutes':null;
    actions.push({externalId:'SYSTEM_LOCATION_SEARCH',name:'Fouiller',category:'INVESTIGATION',targetType:'LOCATION',resolution:'AUTO',validation:'AUTO',costResourceExternalId:'RES_PA',costValue:1,currentCostResourceValue:pa?.currentValue??null,diceCount:0,diceSides:0,difficulty:null,usesCount:(runtime.sessionInteractionUses??[]).filter(u=>u.actorCharacterExternalId===characterExternalId&&u.interactionExternalId==='SYSTEM_LOCATION_SEARCH'&&u.targetExternalId===locationExternalId).length,maxUses:null,cooldownMinutes:10,cooldownRemainingSeconds:searchCooldownRemainingSeconds,searchCooldownRemainingSeconds,targetExternalId:locationExternalId,autonomous:true,systemFallback:true,available:!blockedReason,blockedReason});
  }
  return {location,actions,rewardsRemaining:rewards.clues.length+rewards.objects.length,searchCooldownRemainingSeconds};
}

function playerVotes(source,runtime,session,characterExternalId) {
  const optionsByVote=new Map();
  for(const o of source.voteOptionDefinitions??[]){if(o.active===false)continue;if(!optionsByVote.has(o.voteExternalId))optionsByVote.set(o.voteExternalId,[]);optionsByVote.get(o.voteExternalId).push(o);}
  const cast=(session.sessionParticipants_on_gameSession??[]).filter(p=>p.active!==false&&p.characterExternalId).map(p=>p.characterExternalId);
  return (source.voteDefinitions??[]).filter(v=>v.active!==false).flatMap(v=>{
    let electorate=[];
    if(v.scopeType==='ALL')electorate=cast;
    else if(v.scopeType==='LIST'){const allowed=new Set(splitIds(v.scopeRef));electorate=cast.filter(id=>allowed.has(id));}
    if(!electorate.includes(characterExternalId))return [];
    const openRounds=(runtime.sessionVotes??[]).filter(r=>r.voteExternalId===v.externalId&&r.status==='OPEN').sort((a,b)=>b.round-a.round);
    const round=openRounds[0]; if(!round)return [];
    const eligible=round.eligibleOptionExternalIds?splitIds(round.eligibleOptionExternalIds):null;
    const options=(optionsByVote.get(v.externalId)??[]).filter(o=>!eligible||eligible.includes(o.externalId)).sort((a,b)=>(a.orderIndex??0)-(b.orderIndex??0)).map(o=>({externalId:o.externalId,label:o.label,description:o.description??null}));
    const ballot=(runtime.sessionBallots??[]).find(b=>b.voteExternalId===v.externalId&&b.round===round.round&&b.electorCharacterExternalId===characterExternalId);
    return [{externalId:v.externalId,title:v.title,question:v.question,round:round.round,secret:Boolean(v.secret),modifiable:Boolean(v.modifiable),abstention:Boolean(v.abstention),options,selectedOptionExternalIds:splitIds(ballot?.selectedOptionExternalIds),hasVoted:Boolean(ballot)}];
  });
}

function immersiveMediaSource(source){
  const value=String(source??'').trim();
  if(!value)return null;
  if(/^https?:\/\//i.test(value)||value.startsWith('/')||value.startsWith('data:'))return value;
  return `/${value.replace(/^\/+/, '')}`;
}

function visualMedia(mediaMap, externalId) {
  if(!externalId)return null;
  const media=mediaMap.get(externalId);
  if(!media||media.active===false)return null;
  const source=immersiveMediaSource(media.source);
  if(!source)return null;
  return {
    externalId:media.externalId,
    mediaType:media.mediaType??'IMAGE',
    source,
    altText:media.altText??null,
    notes:media.notes??null,
  };
}

function effectiveVisualSkinId(session) {
  const version=session?.scenarioVersion??{};
  const scenario=version.scenario??{};
  return scenario.skinId??version.skinId??'CONTEMPORARY_1980_2000';
}

function skinVisualMedia(source, mediaMap, session, visualType, archetypeCode) {
  const code=String(archetypeCode??'').trim().toUpperCase();
  if(!code)return null;
  const skinId=String(effectiveVisualSkinId(session)).trim().toUpperCase();
  const matches=(source.skinVisualDefinitions??[])
    .filter(v=>
      v.active!==false
      &&String(v.skinId??'').trim().toUpperCase()===skinId
      &&String(v.visualType??'').trim().toUpperCase()===String(visualType??'').trim().toUpperCase()
      &&String(v.archetypeCode??'').trim().toUpperCase()===code
    )
    .sort((a,b)=>{
      const av=String(a.variant??'').trim().toUpperCase()==='DEFAULT'?0:1;
      const bv=String(b.variant??'').trim().toUpperCase()==='DEFAULT'?0:1;
      return av-bv||String(a.externalId).localeCompare(String(b.externalId));
    });
  const definition=matches[0];
  if(!definition)return null;
  const media=visualMedia(mediaMap,definition.mediaExternalId);
  return media?{...media,archetypeCode:code,skinId,visualDefinitionExternalId:definition.externalId}:null;
}

function objectVisualCode(def) {
  const hay=normalizeSearchText(`${def?.name??''} ${def?.description??''} ${def?.support??''}`);
  const rules=[
    ['KEY',/(cle|clef|key)/],
    ['LETTER',/(lettre|courrier|enveloppe|telegram|document|papier)/],
    ['PHOTO',/(photo|photographie|portrait)/],
    ['RING',/(bague|anneau|ring)/],
    ['JEWEL',/(bijou|collier|broche|bracelet|pendentif|jewel)/],
    ['WATCH',/(montre|watch)/],
    ['VIAL',/(fiole|flacon|poison|serum|potion)/],
    ['BOTTLE',/(bouteille|whisky|whiskey|vin|alcool|bottle)/],
    ['KNIFE',/(couteau|dagger|dague|knife)/],
    ['GUN',/(revolver|pistolet|fusil|arme|gun|rifle)/],
    ['MAP',/(carte|plan|map)/],
    ['NOTEBOOK',/(carnet|journal|registre|notebook)/],
    ['MONEY',/(argent|billet|piece|bourse|dollar|money)/],
    ['BADGE',/(badge|insigne|medaille)/],
    ['BOX',/(coffre|boite|caisse|box|chest)/],
  ];
  for(const [code,re] of rules) if(re.test(hay)) return code;
  return 'OBJECT';
}
function immersiveDocumentForClue(clue, documentMap, mediaMap){
  if(!clue)return null;
  const doc=clue.documentExternalId?documentMap.get(clue.documentExternalId):null;
  const ids=[];
  for(const raw of String(doc?.mediaExternalIds??'').split(';')){const id=raw.trim();if(id)ids.push(id);}
  if(clue.mediaExternalId&&!ids.includes(clue.mediaExternalId))ids.push(clue.mediaExternalId);
  const media=ids.map(id=>mediaMap.get(id)).filter(m=>m&&m.active!==false).map(m=>({externalId:m.externalId,mediaType:m.mediaType,source:immersiveMediaSource(m.source),altText:m.altText??doc?.title??clue.playerName,notes:m.notes??null})).filter(m=>m.source);
  if(!doc&&!media.length)return null;
  return {
    externalId:doc?.externalId??clue.documentExternalId??null,
    title:doc?.title??clue.playerName,
    textContent:doc?.textContent??clue.playerText??'',
    support:doc?.support??clue.support??'DIGITAL',
    media,
    presentationMode:clue.presentationMode??(media.length?'IMAGE':'DOCUMENT'),
  };
}


function scenarioPresentation(session,source) {
  const mediaMap=byId((source.mediaAssets??[]).filter(m=>m.active!==false));

  const resolveMedia=(externalId)=>{
    if(!externalId)return null;
    const media=mediaMap.get(externalId);
    if(!media)return null;

    const resolvedSource=immersiveMediaSource(media.source);
    if(!resolvedSource)return null;

    return {
      externalId:media.externalId,
      mediaType:media.mediaType??null,
      source:resolvedSource,
      altText:media.altText??null,
      notes:media.notes??null,
    };
  };

  const version=session?.scenarioVersion??{};
  const scenario=version.scenario??{};

  return {
    skinId:
      scenario.skinId??
      version.skinId??
      'CONTEMPORARY_1980_2000',

    accentColor:
      scenario.accentColor??
      version.accentColor??
      null,

    logoMediaExternalId:version.logoMediaExternalId??null,
    backgroundMediaExternalId:version.backgroundMediaExternalId??null,

    logo:resolveMedia(version.logoMediaExternalId),
    background:resolveMedia(version.backgroundMediaExternalId),
  };
}

export function shapePlayerPortal(participant, session, source, runtime, now=new Date()) {
  const characterExternalId=participant.characterExternalId;
  const character=(source.characters??[]).find(c=>c.externalId===characterExternalId&&c.active!==false);
  if(!character)throw new Error('CHARACTER_NOT_FOUND');
  const factMap=byId((source.facts??[]).filter(f=>f.active!==false));
  const clueMap=byId((source.clues??[]).filter(c=>c.active!==false));
  const documentMap=byId((source.documentDefinitions??[]).filter(d=>d.active!==false));
  const mediaMap=byId((source.mediaAssets??[]).filter(m=>m.active!==false));
  const resourceMap=byId((source.resources??[]).filter(r=>r.active!==false));
  const objectMap=byId((source.gameObjects??[]).filter(o=>o.active!==false));
  const stateMap=byId((source.gameStateDefinitions??[]).filter(s=>s.active!==false));
  const charMap=byId(source.characters??[]);

  const resources=(runtime.sessionResources??[]).filter(r=>r.characterExternalId===characterExternalId).map(r=>({...r,name:resourceMap.get(r.resourceExternalId)?.name??r.resourceExternalId,unit:resourceMap.get(r.resourceExternalId)?.unit??null}));
  const objectiveRuntime=new Map((runtime.sessionObjectives??[]).filter(o=>o.characterExternalId===characterExternalId).map(o=>[o.objectiveExternalId,o]));
  const objectives=(source.objectives??[]).filter(o=>o.active!==false&&o.ownerType==='CHARACTER'&&o.ownerExternalId===characterExternalId).map(o=>({...o,status:objectiveRuntime.get(o.externalId)?.status??o.initialStatus,progress:objectiveRuntime.get(o.externalId)?.progress??0,notes:objectiveRuntime.get(o.externalId)?.notes??null}));
  const knowledge=(runtime.sessionKnowledges??[]).filter(k=>k.characterExternalId===characterExternalId).map(k=>({factExternalId:k.factExternalId,sourceType:k.sourceType,learnedAt:k.learnedAt,fact:factMap.get(k.factExternalId)})).filter(k=>k.fact).sort((a,b)=>new Date(a.learnedAt).getTime()-new Date(b.learnedAt).getTime());
  const discoveries=(runtime.sessionClueDiscoveries??[]).filter(d=>d.characterExternalId===characterExternalId).map(d=>{const clue=clueMap.get(d.clueExternalId);return {...d,clue:clue?{...clue,immersiveDocument:immersiveDocumentForClue(clue,documentMap,mediaMap)}:null};}).filter(d=>d.clue).sort((a,b)=>new Date(a.discoveredAt).getTime()-new Date(b.discoveredAt).getTime());
  const inventory=(runtime.sessionObjects??[]).filter(o=>o.inPlay!==false&&o.holderType==='CHARACTER'&&o.holderExternalId===characterExternalId).map(o=>{const def=objectMap.get(o.objectExternalId);const level=Math.max(0,Math.min(3,Number(o.identificationLevel??0)));const identification=def?.[`identification${level}`]||def?.description||def?.name||o.objectExternalId;const visualCode=String(def?.visualArchetypeCode??objectVisualCode(def)).trim().toUpperCase();const dedicatedMedia=visualMedia(mediaMap,def?.mediaExternalId)??visualMedia(mediaMap,`OBJ_${o.objectExternalId}`)??visualMedia(mediaMap,`OBJECT_${o.objectExternalId}`);const archetypeMedia=skinVisualMedia(source,mediaMap,session,'OBJECT',visualCode);return {...o,name:def?.name??o.objectExternalId,description:def?.description??'',identification,transferable:Boolean(def?.transferable),consumable:Boolean(def?.consumable),critical:Boolean(def?.critical),visualCode,visualMedia:dedicatedMedia??archetypeMedia};});
  const states=(runtime.sessionCharacterStates??[]).filter(s=>s.characterExternalId===characterExternalId&&s.active!==false).map(s=>({...s,definition:stateMap.get(s.stateExternalId)})).filter(s=>s.definition?.visibleToHolder!==false).map(s=>({...s,name:s.definition?.name??s.stateExternalId,description:s.definition?.description??''}));
  const ownedObjectIds=new Set(inventory.map(o=>o.objectExternalId));
  const documentEntries=(source.clues??[]).filter(c=>c.active!==false&&c.objectExternalId&&ownedObjectIds.has(c.objectExternalId)&&c.addToNotebook!==false).map(c=>({clueExternalId:c.externalId,objectExternalId:c.objectExternalId,documentExternalId:c.documentExternalId??null,playerName:c.playerName,playerText:c.playerText,clueType:c.clueType,support:c.support,presentationMode:c.presentationMode,immersiveDocument:immersiveDocumentForClue(c,documentMap,mediaMap),owned:true}));
  const actionLogs=(runtime.sessionActionLogs??[]).filter(l=>l.characterExternalId===characterExternalId).sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).slice(0,50);
  const relationships=(source.relationships??[]).filter(r=>r.active!==false&&visibilityAllowed(r.visibility)&&(r.characterAExternalId===characterExternalId||r.characterBExternalId===characterExternalId)).map(r=>{const isA=r.characterAExternalId===characterExternalId;const otherExternalId=isA?r.characterBExternalId:r.characterAExternalId;const other=charMap.get(otherExternalId);return{externalId:r.externalId,otherExternalId,otherName:other?.name??otherExternalId,otherPublicRole:other?.publicRole??null,relationType:r.relationType,text:isA?r.textA:(r.textB||r.textA),visibility:r.visibility,portrait:visualMedia(mediaMap,other?.portraitMediaId)??skinVisualMedia(source,mediaMap,session,'CHARACTER',other?.portraitArchetypeCode)};});
  const notifications=(runtime.sessionPlayerNotifications??[]).filter(n=>n.characterExternalId===characterExternalId).sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
  const interactions=playerInteractions(source,runtime,session,characterExternalId,resources,now);
  const votes=playerVotes(source,runtime,session,characterExternalId);
  return {
    presentation:scenarioPresentation(session,source),
    participant:{id:participant.id,displayName:participant.displayName,briefingStatus:participant.briefingStatus,briefingReadAt:participant.briefingReadAt??null,playerOpenCount:Number(participant.playerOpenCount??0)},
    session:{id:session.id,name:session.name,scheduledAt:session.scheduledAt,venue:session.venue,language:session.language??'FR',status:session.status,startedAt:session.startedAt,pausedAt:session.pausedAt,finishedAt:session.finishedAt,scenarioTitle:session.scenarioVersion?.scenario?.title??'Murder Party',playerSummary:session.scenarioVersion?.playerSummary??''},
    character:{externalId:character.externalId,name:character.name,publicRole:character.publicRole,biography:character.biography,secretIntro:character.secretIntro,interpretationNotes:character.interpretationNotes,appearanceNotes:character.appearanceNotes,apparentMotive:character.apparentMotive,personalTimeline:character.personalTimeline,motto:character.motto,narrativeAge:character.narrativeAge,portrait:visualMedia(mediaMap,character.portraitMediaId)??skinVisualMedia(source,mediaMap,session,'CHARACTER',character.portraitArchetypeCode)},
    otherCharacters:(session.sessionParticipants_on_gameSession??[]).filter(p=>p.active!==false&&p.characterExternalId&&p.characterExternalId!==characterExternalId).map(p=>{const c=charMap.get(p.characterExternalId);return{characterExternalId:p.characterExternalId,name:c?.name??p.characterExternalId,publicRole:c?.publicRole??null,participantName:p.displayName,portrait:visualMedia(mediaMap,c?.portraitMediaId)??skinVisualMedia(source,mediaMap,session,'CHARACTER',c?.portraitArchetypeCode)};}),
    objectives,relationships,resources,knowledge,discoveries,documentEntries,inventory,states,abilities:effectiveAbilities(source,characterExternalId).filter(a=>!a.secret),interactions,votes,notifications,actionLogs,unreadNotificationCount:notifications.filter(n=>!n.readAt).length,searchCooldownRemainingSeconds:globalLocationSearchCooldownRemaining(source,runtime,characterExternalId,now),
  };
}

export async function configureSessionPlayerAccess(sessionId, enabled, {reader=defaultReader,executor=defaultExecutor}={}) {
  const detail=await getGameSession(sessionId,{reader});
  if(!detail)throw new Error('SESSION_NOT_FOUND');
  if(!detail.runtimeInitializedAt)throw new Error('RUNTIME_NOT_INITIALIZED');
  if(detail.status==='ARCHIVED')throw new Error('SESSION_ARCHIVED');
  const casted=detail.participants.filter(p=>p.active!==false&&p.characterExternalId);
  if(!casted.length)throw new Error('NO_CAST_PARTICIPANTS');
  const links=[];
  for(const p of casted){
    const token=p.playerAccessToken||randomBytes(32).toString('base64url');
    const briefingStatus=p.briefingReadAt?'READ':(p.playerFirstOpenedAt?'OPENED':(p.briefingStatus||'NOT_SENT'));
    await executor(UPDATE_PLAYER_ACCESS_MUTATION,{participantId:p.id,enabled:Boolean(enabled),token,briefingStatus});
    links.push({participantId:p.id,displayName:p.displayName,characterExternalId:p.characterExternalId,token,enabled:Boolean(enabled),firstOpenedAt:p.playerFirstOpenedAt??null,lastOpenedAt:p.playerLastOpenedAt??null,openCount:Number(p.playerOpenCount??0),briefingReadAt:p.briefingReadAt??null,briefingStatus});
  }
  return {sessionId,enabled:Boolean(enabled),links};
}

export async function getPlayerPortal(token,{reader=defaultReader,executor=defaultExecutor,trackOpen=true,now=new Date()}={}) {
  const loaded=await loadPlayerData(token,reader);
  if(trackOpen){
    const openedAt=nowIso(now);
    const firstOpenedAt=loaded.participant.playerFirstOpenedAt??openedAt;
    const briefingStatus=loaded.participant.briefingReadAt?'READ':'OPENED';
    await executor(TRACK_PLAYER_OPEN_MUTATION,{participantId:loaded.participant.id,firstOpenedAt,lastOpenedAt:openedAt,openCount:Number(loaded.participant.playerOpenCount??0)+1,briefingStatus});
    loaded.participant={...loaded.participant,playerFirstOpenedAt:firstOpenedAt,playerLastOpenedAt:openedAt,playerOpenCount:Number(loaded.participant.playerOpenCount??0)+1,briefingStatus};
  }
  return shapePlayerPortal(loaded.participant,loaded.session,loaded.source,loaded.runtime,now instanceof Date?now:new Date(now));
}

export async function markPlayerBriefingRead(token,{reader=defaultReader,executor=defaultExecutor,now=new Date()}={}) {
  const participant=await loadPlayerAccess(token,reader);const readAt=nowIso(now);await executor(MARK_BRIEFING_READ_MUTATION,{participantId:participant.id,readAt});return{readAt};
}

export async function markPlayerNotificationRead(token,notificationId,{reader=defaultReader,executor=defaultExecutor,now=new Date()}={}) {
  const loaded=await loadPlayerData(token,reader);const row=(loaded.runtime.sessionPlayerNotifications??[]).find(n=>n.id===notificationId&&n.characterExternalId===loaded.participant.characterExternalId);if(!row)throw new Error('NOTIFICATION_NOT_FOUND');if(row.readAt)return{alreadyRead:true,readAt:row.readAt};const readAt=nowIso(now);await executor(MARK_NOTIFICATION_READ_MUTATION,{notificationId,readAt});return{alreadyRead:false,readAt};
}

export async function sendPlayerNotification(sessionId,input,{reader=defaultReader,executor=defaultExecutor,now=new Date()}={}) {
  const detail=await getGameSession(sessionId,{reader});if(!detail)throw new Error('SESSION_NOT_FOUND');const characterExternalId=String(input?.characterExternalId??'').trim();if(!detail.participants.some(p=>p.active!==false&&p.characterExternalId===characterExternalId))throw new Error('TARGET_CHARACTER_NOT_IN_SESSION');const title=String(input?.title??'').trim().slice(0,120);const body=String(input?.body??'').trim().slice(0,1200);if(!title||!body)throw new Error('NOTIFICATION_CONTENT_REQUIRED');const data={gameSessionId:sessionId,characterExternalId,kind:String(input?.kind??'GM').trim().slice(0,40)||'GM',title,body,priority:String(input?.priority??'NORMAL').trim().toUpperCase(),refExternalId:String(input?.refExternalId??'').trim()||null,createdAt:nowIso(now),readAt:null};await executor(INSERT_NOTIFICATION_MUTATION,{data});return{sent:true,characterExternalId,title};
}

export async function executePlayerInteraction(token,input,{reader=defaultReader,executor=defaultExecutor,interactionExecutor=executeInteraction,now=new Date()}={}) {
  const loaded=await loadPlayerData(token,reader);
  if(loaded.session.status!=='LIVE')throw new Error('PLAYER_ACTIONS_NOT_LIVE');
  const actor=loaded.participant.characterExternalId;
  const id=String(input?.interactionExternalId??'').trim();
  const targetExternalId=String(input?.targetExternalId??'').trim()||null;
  const interaction=(loaded.source.interactions??[]).find(i=>i.externalId===id&&i.active!==false);
  if(!interaction)throw new Error('INTERACTION_NOT_FOUND');
  const targetType=String(interaction.targetType??'NONE').toUpperCase();
  if(['PLAYER','CHARACTER'].includes(targetType)){
    if(!targetExternalId) throw new Error('INTERACTION_TARGET_REQUIRED');
    if(targetExternalId===actor) throw new Error('PLAYER_INTERACTION_SELF_TARGET_FORBIDDEN');
    if(!(loaded.session.sessionParticipants_on_gameSession??[]).some(p=>p.active!==false&&p.characterExternalId===targetExternalId)) throw new Error('TARGET_CHARACTER_NOT_IN_SESSION');
  }
  const characterTarget=['PLAYER','CHARACTER'].includes(targetType);
  const requiresGm=String(interaction.resolution).toUpperCase()==='GM'||String(interaction.validation??'').toUpperCase()==='GM'||(Boolean(interaction.targetSecret)&&!characterTarget);
  if(requiresGm){
    if(!input?.requestOnly)throw new Error('PLAYER_INTERACTION_REQUIRES_GM');
    await executor(INSERT_PLAYER_ACTION_LOG_MUTATION,{data:{gameSessionId:loaded.session.id,actionType:'PLAYER_INTERACTION_REQUEST',characterExternalId:actor,refExternalId:id,beforeValue:null,afterValue:targetExternalId,deltaValue:null,note:`Demande joueur : ${interaction.name}`,createdAt:nowIso(now)}});
    return {requested:true,interactionExternalId:id,interactionName:interaction.name,targetExternalId,scanMode:interactionScanMode(interaction)};
  }
  const result=await interactionExecutor(loaded.session.id,{actorCharacterExternalId:actor,interactionExternalId:id,targetExternalId,note:`Action joueur · scan ${interactionScanMode(interaction)??'N/A'}`});
  const createdAt=nowIso(now);
  const data={gameSessionId:loaded.session.id,characterExternalId:actor,kind:'INTERACTION',title:result.interactionName||interaction.name,body:result.success?'Action réussie.':'Action échouée.',priority:'NORMAL',refExternalId:id,createdAt,readAt:null};
  await executor(INSERT_NOTIFICATION_MUTATION,{data});
  if(characterTarget&&targetExternalId){
    const targetData={gameSessionId:loaded.session.id,characterExternalId:targetExternalId,kind:'INTERACTION_TARGET',title:'Action sur votre personnage',body:`Une action « ${interaction.name} » vient d’être exercée sur votre personnage. ${result.success?'Elle a réussi.':'Elle a échoué.'} Murder Engine ne révèle pas son auteur.`,priority:'NORMAL',refExternalId:id,createdAt,readAt:null};
    await executor(INSERT_NOTIFICATION_MUTATION,{data:targetData});
  }
  return {...result,scanMode:interactionScanMode(interaction)};
}

export async function transferPlayerObject(token,input,{reader=defaultReader,executor=defaultExecutor,objectTransfer=transferSessionObject,clueReveal=revealClueToCharacter,now=new Date()}={}) {
  const loaded=await loadPlayerData(token,reader);if(loaded.session.status!=='LIVE')throw new Error('PLAYER_ACTIONS_NOT_LIVE');const actor=loaded.participant.characterExternalId;const objectExternalId=String(input?.objectExternalId??'').trim();const targetCharacterExternalId=String(input?.targetCharacterExternalId??'').trim();if(!targetCharacterExternalId||targetCharacterExternalId===actor)throw new Error('INVALID_OBJECT_TARGET');const row=(loaded.runtime.sessionObjects??[]).find(o=>o.objectExternalId===objectExternalId&&o.inPlay!==false&&o.holderType==='CHARACTER'&&o.holderExternalId===actor);if(!row)throw new Error('OBJECT_NOT_OWNED_BY_PLAYER');const def=(loaded.source.gameObjects??[]).find(o=>o.externalId===objectExternalId&&o.active!==false);if(!def?.transferable)throw new Error('OBJECT_NOT_TRANSFERABLE');if(!(loaded.session.sessionParticipants_on_gameSession??[]).some(p=>p.active!==false&&p.characterExternalId===targetCharacterExternalId))throw new Error('OBJECT_TARGET_CHARACTER_NOT_FOUND');
  const linkedClues=(loaded.source.clues??[]).filter(c=>c.active!==false&&c.objectExternalId===objectExternalId&&c.addToNotebook!==false);
  for(const clue of linkedClues){await clueReveal(loaded.session.id,{characterExternalId:actor,clueExternalId:clue.externalId,sourceRef:objectExternalId,note:`Document consulté : ${def.name}`});}
  const result=await objectTransfer(loaded.session.id,{objectExternalId,holderType:'CHARACTER',holderExternalId:targetCharacterExternalId,note:`Don de ${actor}`});
  for(const clue of linkedClues){await clueReveal(loaded.session.id,{characterExternalId:targetCharacterExternalId,clueExternalId:clue.externalId,sourceRef:objectExternalId,note:`Document reçu : ${def.name}`});}
  const createdAt=nowIso(now);
  await executor(INSERT_NOTIFICATION_MUTATION,{data:{gameSessionId:loaded.session.id,characterExternalId:targetCharacterExternalId,kind:'OBJECT',title:'Objet reçu',body:`Vous recevez : ${def.name}.`,priority:'NORMAL',refExternalId:objectExternalId,createdAt,readAt:null}});
  await executor(INSERT_NOTIFICATION_MUTATION,{data:{gameSessionId:loaded.session.id,characterExternalId:actor,kind:'ACTION',title:'Objet donné',body:`Vous avez donné : ${def.name}.`,priority:'NORMAL',refExternalId:objectExternalId,createdAt,readAt:null}});
  return result;
}


export async function transferPlayerCash(token,input,{reader=defaultReader,executor=defaultExecutor,now=new Date()}={}) {
  const loaded=await loadPlayerData(token,reader);
  if(loaded.session.status!=='LIVE') throw new Error('PLAYER_ACTIONS_NOT_LIVE');

  const actor=loaded.participant.characterExternalId;
  const targetCharacterExternalId=String(input?.targetCharacterExternalId??'').trim();
  const amount=Number(input?.amount);

  if(!targetCharacterExternalId||targetCharacterExternalId===actor)
    throw new Error('INVALID_CASH_TARGET');

  if(!Number.isInteger(amount)||amount<=0)
    throw new Error('INVALID_CASH_AMOUNT');

  if(!(loaded.session.sessionParticipants_on_gameSession??[]).some(
    p=>p.active!==false&&p.characterExternalId===targetCharacterExternalId
  )) throw new Error('CASH_TARGET_CHARACTER_NOT_FOUND');

  const resources=loaded.runtime.sessionResources??[];
  const sender=resources.find(
    r=>r.characterExternalId===actor&&r.resourceExternalId==='RES_CASH'
  );
  const target=resources.find(
    r=>r.characterExternalId===targetCharacterExternalId&&r.resourceExternalId==='RES_CASH'
  );

  if(!sender) throw new Error('CASH_RESOURCE_NOT_AVAILABLE');
  if(!target) throw new Error('CASH_TARGET_RESOURCE_NOT_AVAILABLE');

  const senderBefore=Number(sender.currentValue??0);
  const targetBefore=Number(target.currentValue??0);

  if(senderBefore<amount) throw new Error('INSUFFICIENT_CASH');

  const targetMax=target.maxValue==null?null:Number(target.maxValue);
  if(targetMax!=null&&targetBefore+amount>targetMax)
    throw new Error('CASH_TARGET_MAX_EXCEEDED');

  const senderAfter=senderBefore-amount;
  const targetAfter=targetBefore+amount;
  const createdAt=nowIso(now);

  const targetName=
    (loaded.source.characters??[]).find(c=>c.externalId===targetCharacterExternalId)?.name
    ??targetCharacterExternalId;

  const notification={
    gameSessionId:loaded.session.id,
    characterExternalId:targetCharacterExternalId,
    kind:'CASH',
    title:'Argent reçu',
    body:`Vous recevez ${amount} d’argent.`,
    priority:'NORMAL',
    refExternalId:'RES_CASH',
    createdAt,
    readAt:null
  };

  const senderLog={
    gameSessionId:loaded.session.id,
    actionType:'CASH_TRANSFER',
    characterExternalId:actor,
    refExternalId:'RES_CASH',
    beforeValue:String(senderBefore),
    afterValue:String(senderAfter),
    deltaValue:-amount,
    note:`Virement de ${amount} à ${targetName}`,
    createdAt
  };

  const targetLog={
    gameSessionId:loaded.session.id,
    actionType:'CASH_RECEIVED',
    characterExternalId:targetCharacterExternalId,
    refExternalId:'RES_CASH',
    beforeValue:String(targetBefore),
    afterValue:String(targetAfter),
    deltaValue:amount,
    note:`Virement reçu : ${amount}`,
    createdAt
  };

  await executor(TRANSFER_PLAYER_CASH_MUTATION,{
    sessionId:loaded.session.id,
    senderCharacterExternalId:actor,
    targetCharacterExternalId,
    senderValue:senderAfter,
    targetValue:targetAfter,
    updatedAt:createdAt,
    notification,
    senderLog,
    targetLog
  });

  return {
    transferred:true,
    amount,
    targetCharacterExternalId,
    targetName,
    remaining:senderAfter
  };
}

async function executeSystemLocationSearch(loaded, locationExternalId, {executor=defaultExecutor,now=new Date()}={}) {
  const actor=loaded.participant.characterExternalId;
  const pa=(loaded.runtime.sessionResources??[]).find(r=>r.characterExternalId===actor&&r.resourceExternalId==='RES_PA');
  if(!pa) throw new Error('INTERACTION_COST_RESOURCE_NOT_FOUND');
  if(Number(pa.currentValue??0)<1) throw new Error('INTERACTION_INSUFFICIENT_RESOURCE');
  const after=Number(pa.currentValue)-1; const createdAt=nowIso(now);
  const use={gameSessionId:loaded.session.id,interactionExternalId:'SYSTEM_LOCATION_SEARCH',actorCharacterExternalId:actor,targetType:'LOCATION',targetExternalId:locationExternalId,resolution:'AUTO',success:true,abilityLevel:0,actorRollJson:null,targetRollJson:null,costResourceExternalId:'RES_PA',costValue:1,note:'Fouille QR automatique',createdAt};
  const log={gameSessionId:loaded.session.id,actionType:'INTERACTION_EXECUTE',characterExternalId:actor,refExternalId:'SYSTEM_LOCATION_SEARCH',beforeValue:null,afterValue:'SUCCESS',deltaValue:-1,note:`Fouille QR → ${locationExternalId}`,createdAt};
  await executor(SYSTEM_LOCATION_SEARCH_MUTATION,{sessionId:loaded.session.id,characterExternalId:actor,currentValue:after,updatedAt:createdAt,use,log});
  return {interactionExternalId:'SYSTEM_LOCATION_SEARCH',interactionName:'Fouiller',actorCharacterExternalId:actor,targetType:'LOCATION',targetExternalId:locationExternalId,success:true,resolution:'AUTO',actorRoll:null,targetRoll:null,actorTotal:null,targetTotal:null,abilityLevel:0,cost:{resourceExternalId:'RES_PA',value:1,remaining:after}};
}

async function grantAutomaticLocationReward(loaded, locationExternalId, interactionExternalId, {clueReveal=revealClueToCharacter,objectTransfer=transferSessionObject}={}) {
  const actor=loaded.participant.characterExternalId;
  const rewards=availableLocationRewards(loaded.source,loaded.runtime,actor,locationExternalId);
  const clue=rewards.clues[0]??null;
  let objectRow=null;
  if(clue?.objectExternalId) objectRow=rewards.objects.find(o=>o.objectExternalId===clue.objectExternalId)??null;
  else if(!clue) objectRow=rewards.objects[0]??null;
  if(clue) await clueReveal(loaded.session.id,{characterExternalId:actor,clueExternalId:clue.externalId,sourceInteractionExternalId:interactionExternalId,sourceRef:locationExternalId,note:'Découverte automatique via QR'});
  if(objectRow) await objectTransfer(loaded.session.id,{objectExternalId:objectRow.objectExternalId,holderType:'CHARACTER',holderExternalId:actor,note:`Ramassé lors de la fouille de ${locationExternalId}`});
  const objectDef=objectRow?rewards.objectDefs.get(objectRow.objectExternalId):null;
  return {
    kind:clue&&objectRow?'CLUE_OBJECT':clue?'CLUE':objectRow?'OBJECT':'NONE',
    clue:clue?{
      externalId:clue.externalId,
      name:clue.playerName,
      text:clue.playerText,
      clueType:clue.clueType,
      mode:clue.objectExternalId?'TAKEABLE':'PERSISTENT'
    }:null,
    object:objectRow?{
      externalId:objectRow.objectExternalId,
      name:objectDef?.name??objectRow.objectExternalId,
      description:objectDef?.description??null,
      logisticsCode:objectDef?.logisticsCode??null,
      physicalPickupRequired:Boolean(objectDef?.logisticsCode)
    }:null
  };
}

export async function getPlayerLocation(token,locationExternalId,{reader=defaultReader,now=new Date()}={}) {
  const loaded=await loadPlayerData(token,reader); const actor=loaded.participant.characterExternalId;
  const resources=(loaded.runtime.sessionResources??[]).filter(r=>r.characterExternalId===actor);
  const shaped=locationActionShape(loaded.source,loaded.runtime,loaded.session,actor,String(locationExternalId??'').trim(),resources,now instanceof Date?now:new Date(now));
  const forbidden=locationOwnerCharacter(shaped.location)===actor;
  const empty=locationIsGloballyEmpty(loaded.source,loaded.runtime,shaped.location.externalId);
  return {
    presentation:scenarioPresentation(loaded.session,loaded.source),
    session:{
      id:loaded.session.id,
      name:loaded.session.name,
      status:loaded.session.status,
      scenarioTitle:loaded.session.scenarioVersion?.scenario?.title??'Murder Party'
    },
    character:{
      externalId:actor,
      name:(loaded.source.characters??[]).find(c=>c.externalId===actor)?.name??actor
    },
    location:{
      externalId:shaped.location.externalId,
      name:shaped.location.name,
      description:shaped.location.description
    },
    actions:forbidden||empty?[]:shaped.actions,
    rewardsRemaining:shaped.rewardsRemaining,
    searchCooldownRemainingSeconds:shaped.searchCooldownRemainingSeconds,
    forbidden,
    empty
  };
}

export async function executePlayerLocationAction(token,input,{reader=defaultReader,executor=defaultExecutor,interactionExecutor=executeInteraction,clueReveal=revealClueToCharacter,objectTransfer=transferSessionObject,now=new Date()}={}) {
  const loaded=await loadPlayerData(token,reader); if(loaded.session.status!=='LIVE') throw new Error('PLAYER_ACTIONS_NOT_LIVE');
  const actor=loaded.participant.characterExternalId; const locationExternalId=String(input?.locationExternalId??'').trim(); const interactionExternalId=String(input?.interactionExternalId??'').trim();
  const location=(loaded.source.gameLocations??[]).find(x=>x.externalId===locationExternalId&&x.active!==false); if(!location) throw new Error('PLAYER_LOCATION_NOT_FOUND');

  const ownerCharacterExternalId=locationOwnerCharacter(location);

  if(ownerCharacterExternalId===actor)
    throw new Error('LOCATION_OWNED_BY_CHARACTER');

  if(locationIsGloballyEmpty(
    loaded.source,
    loaded.runtime,
    locationExternalId
  ))
    throw new Error('LOCATION_EMPTY');

  const takeableObjectsBefore=
    remainingLocationObjects(
      loaded.runtime,
      locationExternalId
    ).length;

  const persistentCluesCount=
    persistentLocationClues(
      loaded.source,
      locationExternalId
    ).length;

  const resources=(loaded.runtime.sessionResources??[]).filter(r=>r.characterExternalId===actor); const shaped=locationActionShape(loaded.source,loaded.runtime,loaded.session,actor,locationExternalId,resources,now instanceof Date?now:new Date(now));
  const action=shaped.actions.find(a=>a.externalId===interactionExternalId); if(!action) throw new Error('LOCATION_ACTION_NOT_AVAILABLE'); if(!action.available) throw new Error(action.blockedReason||'LOCATION_ACTION_BLOCKED');
  let result;
  if(interactionExternalId==='SYSTEM_LOCATION_SEARCH') result=await executeSystemLocationSearch(loaded,locationExternalId,{executor,now});
  else {
    const sourceInteraction=(loaded.source.interactions??[]).find(i=>i.externalId===interactionExternalId&&i.active!==false); if(!sourceInteraction||!isAutonomousLocationInteraction(sourceInteraction)) throw new Error('LOCATION_ACTION_NOT_AUTONOMOUS');
    const gmOutcome=String(sourceInteraction.resolution).toUpperCase()==='GM'?'SUCCESS':null;
    result=await interactionExecutor(loaded.session.id,{actorCharacterExternalId:actor,interactionExternalId,targetExternalId:locationExternalId,gmOutcome,note:'Action QR joueur'});
  }
  const reward=result.success?await grantAutomaticLocationReward(loaded,locationExternalId,result.interactionExternalId,{clueReveal,objectTransfer}):{kind:'NONE',clue:null,object:null};

  const locationEmptied=
    Boolean(
      result.success &&
      reward?.object &&
      takeableObjectsBefore===1 &&
      persistentCluesCount===0
    );

  if(locationEmptied){
    await executor(
      INSERT_PLAYER_ACTION_LOG_MUTATION,
      {
        data:{
          gameSessionId:loaded.session.id,
          actionType:'LOCATION_EMPTY',
          characterExternalId:actor,
          refExternalId:locationExternalId,
          beforeValue:'1',
          afterValue:'0',
          deltaValue:-1,
          note:`Lieu vide : ${location.name}. Le MJ peut barrer ou retirer son QR.`,
          createdAt:nowIso(now)
        }
      }
    );
  }
  const body=!result.success?'Action échouée.':reward.kind==='CLUE_OBJECT'?`Vous découvrez ${reward.clue.name} et récupérez ${reward.object.name}.`:reward.kind==='CLUE'?`Vous découvrez : ${reward.clue.name}.`:reward.kind==='OBJECT'?`Vous récupérez : ${reward.object.name}.`:'Vous ne trouvez rien de nouveau.';
  await executor(INSERT_NOTIFICATION_MUTATION,{data:{gameSessionId:loaded.session.id,characterExternalId:actor,kind:'LOCATION',title:location.name,body,priority:'NORMAL',refExternalId:locationExternalId,createdAt:nowIso(now),readAt:null}});
  return {result,reward,location:{externalId:location.externalId,name:location.name}};
}

function clandestineVisibleObjects(loaded,targetCharacterExternalId) {
  const defs=byId((loaded.source.gameObjects??[]).filter(o=>o.active!==false));
  return (loaded.runtime.sessionObjects??[])
    .filter(o=>o.inPlay!==false&&o.holderType==='CHARACTER'&&o.holderExternalId===targetCharacterExternalId)
    .map(o=>({row:o,def:defs.get(o.objectExternalId)}))
    .filter(x=>x.def?.stealable===true)
    .map(x=>({objectExternalId:x.row.objectExternalId,name:x.def?.name??x.row.objectExternalId,description:x.def?.description??null}));
}

export async function attemptPlayerClandestineAction(token,input,{reader=defaultReader,executor=defaultExecutor,interactionExecutor=executeInteraction,now=new Date()}={}) {
  const loaded=await loadPlayerData(token,reader);
  if(loaded.session.status!=='LIVE') throw new Error('PLAYER_ACTIONS_NOT_LIVE');
  const actor=loaded.participant.characterExternalId;
  const interactionExternalId=String(input?.interactionExternalId??'').trim();
  const targetCharacterExternalId=String(input?.targetCharacterExternalId??'').trim();
  const interaction=(loaded.source.interactions??[]).find(i=>i.externalId===interactionExternalId&&i.active!==false);
  if(!interaction) throw new Error('INTERACTION_NOT_FOUND');
  const kind=clandestineInteractionKind(interaction);
  if(!kind) throw new Error('INTERACTION_NOT_CLANDESTINE');
  if(!targetCharacterExternalId||targetCharacterExternalId===actor) throw new Error('INVALID_CLANDESTINE_TARGET');
  if(!(loaded.session.sessionParticipants_on_gameSession??[]).some(p=>p.active!==false&&p.characterExternalId===targetCharacterExternalId)) throw new Error('TARGET_CHARACTER_NOT_IN_SESSION');
  if(String(interaction.resolution).toUpperCase()==='GM'||String(interaction.validation??'').toUpperCase()==='GM') throw new Error('CLANDESTINE_INTERACTION_REQUIRES_AUTOMATION');
  const scanMode=interactionScanMode(interaction);
  const result=await interactionExecutor(loaded.session.id,{actorCharacterExternalId:actor,interactionExternalId,targetExternalId:targetCharacterExternalId,note:`Action joueur · scan ${scanMode??'DISCRET'}`});
  const notifyTarget=async(body,title='Action sur votre personnage')=>executor(INSERT_NOTIFICATION_MUTATION,{data:{gameSessionId:loaded.session.id,characterExternalId:targetCharacterExternalId,kind:'INTERACTION_TARGET',title,body,priority:'NORMAL',refExternalId:interactionExternalId,createdAt:nowIso(now),readAt:null}});
  if(!result.success){
    await notifyTarget(`Une action « ${interaction.name} » a été tentée sur votre personnage, mais elle a échoué. Murder Engine ne révèle pas son auteur.`);
    return {kind,success:false,result,items:[],scanMode};
  }
  const items=clandestineVisibleObjects(loaded,targetCharacterExternalId);
  if(kind==='SEARCH_PLAYER'){
    await notifyTarget(`Une action « ${interaction.name} » vient d’être exercée sur votre personnage. Elle a réussi. Murder Engine ne révèle pas son auteur.`);
    return {kind,success:true,result,items,scanMode};
  }
  if(!items.length){
    await notifyTarget(`Une action « ${interaction.name} » vient d’être exercée sur votre personnage, mais aucun objet n’a pu être pris. Murder Engine ne révèle pas son auteur.`);
    return {kind,success:true,result,items:[],grantToken:null,scanMode};
  }
  const grantToken=randomBytes(24).toString('base64url');
  const createdAt=nowIso(now); const expiresAt=new Date((now instanceof Date?now:new Date(now)).getTime()+5*60*1000).toISOString();
  const data={gameSessionId:loaded.session.id,grantToken,interactionExternalId,actorCharacterExternalId:actor,targetCharacterExternalId,kind:'STEAL',status:'OPEN',createdAt,expiresAt,usedAt:null,chosenObjectExternalId:null};
  await executor(INSERT_STEAL_GRANT_MUTATION,{data});
  return {kind,success:true,result,items,grantToken,expiresAt,scanMode};
}

export async function claimPlayerStolenObject(token,input,{reader=defaultReader,executor=defaultExecutor,clueReveal=revealClueToCharacter,now=new Date()}={}) {
  const loaded=await loadPlayerData(token,reader);
  if(loaded.session.status!=='LIVE') throw new Error('PLAYER_ACTIONS_NOT_LIVE');
  const actor=loaded.participant.characterExternalId;
  const grantToken=String(input?.grantToken??'').trim();
  const objectExternalId=String(input?.objectExternalId??'').trim();
  const grant=(loaded.runtime.sessionStealGrants??[]).find(g=>g.grantToken===grantToken);
  if(!grant||grant.actorCharacterExternalId!==actor||grant.status!=='OPEN') throw new Error('STEAL_GRANT_NOT_AVAILABLE');
  const nowDate=now instanceof Date?now:new Date(now);
  if(new Date(grant.expiresAt).getTime()<=nowDate.getTime()) throw new Error('STEAL_GRANT_EXPIRED');
  const objectRow=(loaded.runtime.sessionObjects??[]).find(o=>o.objectExternalId===objectExternalId&&o.inPlay!==false&&o.holderType==='CHARACTER'&&o.holderExternalId===grant.targetCharacterExternalId);
  if(!objectRow) throw new Error('STEAL_OBJECT_NO_LONGER_AVAILABLE');
  const def=(loaded.source.gameObjects??[]).find(o=>o.externalId===objectExternalId&&o.active!==false);
  if(!def?.stealable) throw new Error('OBJECT_NOT_STEALABLE');
  const linkedClues=(loaded.source.clues??[]).filter(c=>c.active!==false&&c.objectExternalId===objectExternalId&&c.addToNotebook!==false);
  for(const clue of linkedClues){await clueReveal(loaded.session.id,{characterExternalId:grant.targetCharacterExternalId,clueExternalId:clue.externalId,sourceRef:objectExternalId,note:`Document possédé avant vol : ${def.name}`});}
  const usedAt=nowIso(nowDate);
  const notification={gameSessionId:loaded.session.id,characterExternalId:grant.targetCharacterExternalId,kind:'THEFT',title:'Quelque chose vous manque…',body:'Vous venez de constater qu’un objet a disparu de vos affaires. Murder Engine ne révèle pas l’auteur du vol.',priority:'IMPORTANT',refExternalId:null,createdAt:usedAt,readAt:null};
  const log={gameSessionId:loaded.session.id,actionType:'OBJECT_STOLEN',characterExternalId:actor,refExternalId:objectExternalId,beforeValue:grant.targetCharacterExternalId,afterValue:actor,deltaValue:null,note:`Vol clandestin réussi sur ${grant.targetCharacterExternalId}`,createdAt:usedAt};
  await executor(CLAIM_STEAL_MUTATION,{sessionId:loaded.session.id,grantToken,objectExternalId,actorCharacterExternalId:actor,usedAt,notification,log});
  for(const clue of linkedClues){await clueReveal(loaded.session.id,{characterExternalId:actor,clueExternalId:clue.externalId,sourceRef:objectExternalId,note:`Document volé : ${def.name}`});}
  return {stolen:true,object:{objectExternalId,name:def.name,description:def.description??null},targetCharacterExternalId:grant.targetCharacterExternalId};
}

export async function castPlayerVote(token,input,{reader=defaultReader,voteCaster=castSessionBallot}={}) {
  const loaded=await loadPlayerData(token,reader);return voteCaster(loaded.session.id,{voteExternalId:String(input?.voteExternalId??'').trim(),electorCharacterExternalId:loaded.participant.characterExternalId,selectedOptionExternalIds:Array.isArray(input?.selectedOptionExternalIds)?input.selectedOptionExternalIds:[],round:input?.round});
}

export const __playerOps={PLAYER_ACCESS_QUERY,PLAYER_SOURCE_QUERY,PLAYER_RUNTIME_QUERY,UPDATE_PLAYER_ACCESS_MUTATION,TRACK_PLAYER_OPEN_MUTATION,MARK_BRIEFING_READ_MUTATION,INSERT_NOTIFICATION_MUTATION,MARK_NOTIFICATION_READ_MUTATION,INSERT_PLAYER_ACTION_LOG_MUTATION,SYSTEM_LOCATION_SEARCH_MUTATION,INSERT_STEAL_GRANT_MUTATION,CLAIM_STEAL_MUTATION,TRANSFER_PLAYER_CASH_MUTATION};
