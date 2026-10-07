import { randomBytes } from 'node:crypto';
import { executeInteraction, transferSessionObject, revealClueToCharacter } from './interactions.mjs';
import { castSessionBallot, resolveElectorate } from './votes.mjs';
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
        mediaOverridesJson
        scenario {
          id
          title
          slug
          skinId
          accentColor
          scenarioVersions_on_scenario(orderBy: {importedAt: DESC}) {
            id
            mediaOverridesJson
            importedAt
          }
        }
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
    externalId playerName clueType playerText discoveryHook support presentationMode shareable transferable consumable addToNotebook locationExternalId objectExternalId documentExternalId logisticsCode mediaExternalId major active
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
    externalId title question scopeType scopeRef choicesMode secret votesPerElector weighted abstention modifiable resultVisibility active
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

const RESOLVE_ABILITY_GRANT_MUTATION = `
mutation ResolveAbilityGrant(
  $sessionId: UUID!,
  $grantToken: String!,
  $chosenExternalId: String!,
  $usedAt: Timestamp!,
  $actorNotification: SessionPlayerNotification_Data!,
  $targetNotification: SessionPlayerNotification_Data!,
  $log: SessionActionLog_Data!
) @transaction {
  sessionStealGrant_update(
    key: {gameSessionId: $sessionId, grantToken: $grantToken}
    data: {status: "USED", usedAt: $usedAt, chosenObjectExternalId: $chosenExternalId}
  )
  actorNotification: sessionPlayerNotification_insert(data: $actorNotification)
  targetNotification: sessionPlayerNotification_insert(data: $targetNotification)
  sessionActionLog_insert(data: $log)
}
`;

const RESOLVE_CHARM_MUTATION = `
mutation ResolveCharm(
  $sessionId: UUID!,
  $grantToken: String!,
  $factExternalId: String!,
  $usedAt: Timestamp!,
  $knowledge: SessionKnowledge_Data!,
  $actorNotification: SessionPlayerNotification_Data!,
  $targetNotification: SessionPlayerNotification_Data!,
  $log: SessionActionLog_Data!
) @transaction {
  sessionKnowledge_insert(data: $knowledge)
  sessionStealGrant_update(
    key: {gameSessionId: $sessionId, grantToken: $grantToken}
    data: {status: "USED", usedAt: $usedAt, chosenObjectExternalId: $factExternalId}
  )
  actorNotification: sessionPlayerNotification_insert(data: $actorNotification)
  targetNotification: sessionPlayerNotification_insert(data: $targetNotification)
  sessionActionLog_insert(data: $log)
}
`;

const RESOLVE_NEGOTIATION_MUTATION = `
mutation ResolveNegotiation(
  $sessionId: UUID!,
  $grantToken: String!,
  $actorObjectExternalId: String!,
  $targetObjectExternalId: String!,
  $actorCharacterExternalId: String!,
  $targetCharacterExternalId: String!,
  $usedAt: Timestamp!,
  $actorNotification: SessionPlayerNotification_Data!,
  $targetNotification: SessionPlayerNotification_Data!,
  $log: SessionActionLog_Data!
) @transaction {
  actorObject: sessionObject_update(
    key: {gameSessionId: $sessionId, objectExternalId: $actorObjectExternalId}
    data: {holderType: "CHARACTER", holderExternalId: $targetCharacterExternalId, updatedAt: $usedAt}
  )
  targetObject: sessionObject_update(
    key: {gameSessionId: $sessionId, objectExternalId: $targetObjectExternalId}
    data: {holderType: "CHARACTER", holderExternalId: $actorCharacterExternalId, updatedAt: $usedAt}
  )
  sessionStealGrant_update(
    key: {gameSessionId: $sessionId, grantToken: $grantToken}
    data: {status: "USED", usedAt: $usedAt, chosenObjectExternalId: $targetObjectExternalId}
  )
  actorNotification: sessionPlayerNotification_insert(data: $actorNotification)
  targetNotification: sessionPlayerNotification_insert(data: $targetNotification)
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

function isStaticLocationClue(clue) {
  if(!clue || clue.objectExternalId)return false;

  const mode=String(clue.presentationMode??'').trim().toUpperCase();

  return [
    'PERSISTENT',
    'STATIC',
    'PERMANENT',
  ].includes(mode);
}

function staticLocationClues(source,locationExternalId) {
  return (source.clues??[]).filter(
    clue =>
      clue.active!==false &&
      clue.locationExternalId===locationExternalId &&
      isStaticLocationClue(clue)
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
function sessionIsEnglish(session){return String(session?.language??'FR').trim().toUpperCase()==='EN';}
function sessionText(session,fr,en){return sessionIsEnglish(session)?en:fr;}

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

function clueTargetCharacter(clue){
  const hook=String(clue?.discoveryHook??'').trim();

  const patterns=[
    /^RUMOR_TARGET\s*:\s*(.+)$/i,
    /^CHARACTER_TARGET\s*:\s*(.+)$/i,
    /^TARGET_CHARACTER\s*:\s*(.+)$/i,
    /^ABOUT_CHARACTER\s*:\s*(.+)$/i,
  ];

  for(const pattern of patterns){
    const match=hook.match(pattern);
    if(match)return String(match[1]).trim();
  }

  return null;
}

function rumorTargetCharacter(clue){
  if(String(clue?.clueType??'').trim().toUpperCase()!=='RUMOR')return null;
  return clueTargetCharacter(clue);
}

function isInformantInteraction(interaction){
  const hay=normalizeSearchText(
    `${interaction?.externalId??''} ${interaction?.name??''} ${interaction?.abilityExternalId??''} ${interaction?.category??''}`
  );
  return String(interaction?.abilityExternalId??'').trim().toUpperCase()==='ABILITY_INFORMANT'
    || /(informant|rumor|rumeur)/.test(hay);
}

function availableRumorForTarget(source,runtime,actorCharacterExternalId,targetCharacterExternalId){
  const discovered=new Set(
    (runtime.sessionClueDiscoveries??[])
      .filter(d=>d.characterExternalId===actorCharacterExternalId)
      .map(d=>d.clueExternalId)
  );

  return (source.clues??[])
    .filter(clue=>
      clue.active!==false &&
      rumorTargetCharacter(clue)===targetCharacterExternalId &&
      !discovered.has(clue.externalId)
    )
    .sort((a,b)=>String(a.externalId).localeCompare(String(b.externalId)))[0]??null;
}

const SPECIAL_PLAYER_ABILITY_KIND = new Map([
  ['ABILITY_CHARM','CHARM'],
  ['ABILITY_NEGOTIATION','NEGOTIATION'],
  ['ABILITY_POLICE_INTIMIDATION','INTIMIDATION'],
]);

function specialPlayerAbilityKind(interaction) {
  return SPECIAL_PLAYER_ABILITY_KIND.get(
    String(interaction?.abilityExternalId??'').trim().toUpperCase()
  )??null;
}

function transferableEvidenceForCharacter(source,runtime,characterExternalId) {
  const defs=byId((source.gameObjects??[]).filter(o=>o.active!==false));
  return (runtime.sessionObjects??[])
    .filter(o=>
      o.inPlay!==false &&
      o.holderType==='CHARACTER' &&
      o.holderExternalId===characterExternalId
    )
    .map(o=>({row:o,def:defs.get(o.objectExternalId)}))
    .filter(x=>x.def?.transferable===true)
    .map(x=>({
      objectExternalId:x.row.objectExternalId,
      name:x.def?.name??x.row.objectExternalId,
      description:x.def?.description??null,
    }));
}

function charmInformationForTarget(source,runtime,actorCharacterExternalId,targetCharacterExternalId) {
  const facts=byId((source.facts??[]).filter(f=>f.active!==false));
  const actorKnown=new Set(
    (runtime.sessionKnowledges??[])
      .filter(k=>k.characterExternalId===actorCharacterExternalId)
      .map(k=>k.factExternalId)
  );
  return (runtime.sessionKnowledges??[])
    .filter(k=>
      k.characterExternalId===targetCharacterExternalId &&
      !actorKnown.has(k.factExternalId)
    )
    .map(k=>({knowledge:k,fact:facts.get(k.factExternalId)}))
    .filter(x=>Boolean(x.fact))
    .map(x=>({
      factExternalId:x.knowledge.factExternalId,
      title:x.fact?.title??x.knowledge.factExternalId,
      text:x.fact?.text??'',
      category:x.fact?.notebookCategory??x.fact?.nature??null,
    }));
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
    const repeatableLocationSearch=isLocationSearchInteraction(i);
    const specialKind=specialPlayerAbilityKind(i);
    const maxUses=repeatableLocationSearch?null:(i.maxUses??ability?.maxUses??null);
    const cooldownMinutes=repeatableLocationSearch||specialKind?0:(i.cooldownMinutes??ability?.cooldownMinutes??null);
    let cooldownRemainingSeconds=0;
    if(cooldownMinutes&&uses.length){const latest=Math.max(...uses.map(u=>new Date(u.createdAt).getTime()).filter(Number.isFinite));cooldownRemainingSeconds=Math.max(0,Math.ceil((Number(cooldownMinutes)*60000-(now.getTime()-latest))/1000));}
    const costRow=resources.find(r=>r.resourceExternalId===i.costResourceExternalId);
    const targetType=String(i.targetType??'NONE').toUpperCase();
    let targets=[];
    if(['PLAYER','CHARACTER'].includes(targetType)){
      const usedTargets=new Set(
        uses
          .filter(u=>u.targetExternalId)
          .map(u=>u.targetExternalId)
      );
      let targetRows=otherPlayers.filter(p=>!usedTargets.has(p.characterExternalId));

      if(isInformantInteraction(i))
        targetRows=targetRows.filter(p=>availableRumorForTarget(source,runtime,characterExternalId,p.characterExternalId));
      else if(specialKind==='CHARM')
        targetRows=targetRows.filter(p=>charmInformationForTarget(source,runtime,characterExternalId,p.characterExternalId).length>0);
      else if(specialKind==='INTIMIDATION')
        targetRows=targetRows.filter(p=>transferableEvidenceForCharacter(source,runtime,p.characterExternalId).length>0);
      else if(specialKind==='NEGOTIATION'){
        const actorHasEvidence=transferableEvidenceForCharacter(source,runtime,characterExternalId).length>0;
        targetRows=actorHasEvidence
          ? targetRows.filter(p=>transferableEvidenceForCharacter(source,runtime,p.characterExternalId).length>0)
          : [];
      }

      targets=targetRows.map(p=>({
        id:p.characterExternalId,
        label:charMap.get(p.characterExternalId)?.name??p.displayName,
        subtitle:charMap.get(p.characterExternalId)?.publicRole??p.displayName
      }));
    }
    else if(targetType==='LOCATION') targets=(source.gameLocations??[]).filter(x=>x.active!==false).map(x=>({id:x.externalId,label:x.name,subtitle:null}));
    else if(targetType==='OBJECT'&&!i.targetSecret) targets=inPlayObjects.map(o=>({id:o.objectExternalId,label:objectMap.get(o.objectExternalId)?.name??o.objectExternalId,subtitle:null}));

    const clandestineKind=specialKind==='INTIMIDATION'?'INTIMIDATION':clandestineInteractionKind(i);
    const scanMode=interactionScanMode(i);
    const characterTarget=['PLAYER','CHARACTER'].includes(targetType);
    const requiresGm=!specialKind&&(String(i.resolution).toUpperCase()==='GM'||String(i.validation??'').toUpperCase()==='GM'||(Boolean(i.targetSecret)&&!characterTarget&&!clandestineKind));
    const running=session.status==='LIVE';
    const noRumorTarget=isInformantInteraction(i)&&targets.length===0;
    const noSpecialTarget=Boolean(specialKind)&&characterTarget&&targets.length===0;
    const directEnabled=running&&!requiresGm&&!noRumorTarget&&!noSpecialTarget;
    const blockedReason=!running
      ? sessionText(session,'Disponible pendant le live','Available during live play')
      : requiresGm
        ? sessionText(session,'À demander au MJ','Ask the GM')
        : noRumorTarget
          ? sessionText(session,'Aucune nouvelle rumeur disponible','No new rumour available')
          : noSpecialTarget
            ? sessionText(session,'Aucune cible éligible pour cette compétence','No eligible target for this skill')
            : null;

    return {
      externalId:i.externalId,
      name:i.name,
      category:i.category,
      targetType:i.targetType,
      scanMode,
      resolution:i.resolution,
      directEnabled,
      blockedReason,
      clandestineKind,
      specialKind,
      ability,
      costResourceExternalId:i.costResourceExternalId,
      costValue:i.costValue,
      currentCostResourceValue:costRow?.currentValue??null,
      diceCount:i.diceCount,
      diceSides:i.diceSides,
      difficulty:i.difficulty,
      usesCount:uses.length,
      maxUses,
      limitPerTarget:repeatableLocationSearch?null:(specialKind?(i.limitPerTarget??1):(i.limitPerTarget??null)),
      cooldownMinutes,
      cooldownRemainingSeconds,
      targets
    };
  });
}

function normalizeSearchText(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}

export function interactionScanMode(interaction) {
  const target=String(interaction?.targetType ?? '').toUpperCase();
  if(!['PLAYER','CHARACTER'].includes(target)) return null;
  const explicit=String(interaction?.scanMode ?? '').trim().toUpperCase();
  if(['DIRECT','DISCRET','SELECT'].includes(explicit)) return explicit;
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
  const searchIds=new Set([
    'SYSTEM_LOCATION_SEARCH',
    ...(source.interactions??[])
      .filter(isLocationSearchInteraction)
      .map(i=>i.externalId)
  ]);

  const times=(runtime.sessionInteractionUses??[])
    .filter(
      u=>
        u.actorCharacterExternalId===characterExternalId &&
        searchIds.has(u.interactionExternalId)
    )
    .map(u=>new Date(u.createdAt).getTime())
    .filter(Number.isFinite);

  if(!times.length)return 0;

  const latest=Math.max(...times);

  return Math.max(
    0,
    Math.ceil(
      (
        LOCATION_SEARCH_COOLDOWN_SECONDS*1000 -
        (now.getTime()-latest)
      )/1000
    )
  );
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
  const discoveredByCharacter=new Set(
    (runtime.sessionClueDiscoveries??[])
      .filter(d=>d.characterExternalId===characterExternalId)
      .map(d=>d.clueExternalId)
  );

  const discoveredGlobally=new Set(
    (runtime.sessionClueDiscoveries??[])
      .map(d=>d.clueExternalId)
  );

  const objectDefs=new Map(
    (source.gameObjects??[])
      .filter(o=>o.active!==false)
      .map(o=>[o.externalId,o])
  );

  const objects=remainingLocationObjects(runtime,locationExternalId)
    .filter(o=>objectDefs.has(o.objectExternalId))
    .sort((a,b)=>String(a.objectExternalId).localeCompare(String(b.objectExternalId)));

  const objectIdsAtLocation=new Set(objects.map(o=>o.objectExternalId));

  const locationClues=(source.clues??[])
    .filter(clue=>
      clue.active!==false &&
      clue.locationExternalId===locationExternalId &&
      !discoveredByCharacter.has(clue.externalId) &&
      (!clue.objectExternalId || objectIdsAtLocation.has(clue.objectExternalId))
    );

  const takeableClues=locationClues
    .filter(clue=>
      !isStaticLocationClue(clue) &&
      !discoveredGlobally.has(clue.externalId)
    )
    .sort((a,b)=>
      Number(Boolean(b.major))-Number(Boolean(a.major)) ||
      String(a.externalId).localeCompare(String(b.externalId))
    );

  const staticClues=locationClues
    .filter(clue=>isStaticLocationClue(clue))
    .sort((a,b)=>
      Number(Boolean(b.major))-Number(Boolean(a.major)) ||
      String(a.externalId).localeCompare(String(b.externalId))
    );

  const linkedObjectIds=new Set(
    takeableClues
      .map(clue=>clue.objectExternalId)
      .filter(Boolean)
  );

  const standaloneObjects=objects.filter(
    object=>!linkedObjectIds.has(object.objectExternalId)
  );

  return {
    takeableClues,
    staticClues,
    clues:[...takeableClues,...staticClues],
    objects,
    standaloneObjects,
    objectDefs,
    rewardsRemaining:
      takeableClues.length +
      staticClues.length +
      standaloneObjects.length,
  };
}

function locationIsEmptyForCharacter(source,runtime,characterExternalId,locationExternalId) {
  return availableLocationRewards(
    source,
    runtime,
    characterExternalId,
    locationExternalId
  ).rewardsRemaining===0;
}

function locationActionShape(source,runtime,session,characterExternalId,locationExternalId,resources,now=new Date()) {
  const location=(source.gameLocations??[]).find(x=>x.externalId===locationExternalId&&x.active!==false);
  if(!location) throw new Error('PLAYER_LOCATION_NOT_FOUND');
  const searchCooldownRemainingSeconds=globalLocationSearchCooldownRemaining(source,runtime,characterExternalId,now);
  const base=playerInteractions(source,runtime,session,characterExternalId,resources,now).filter(i=>String(i.targetType).toUpperCase()==='LOCATION'&&isAutonomousLocationInteraction(i));
  const actions=base.map(i=>{
    const uses=(runtime.sessionInteractionUses??[]).filter(u=>u.actorCharacterExternalId===characterExternalId&&u.interactionExternalId===i.externalId);
    const sameTarget=uses.filter(u=>u.targetExternalId===locationExternalId).length;
    const repeatableSearch=isLocationSearchInteraction(i);
    const searchPa=resources.find(r=>r.resourceExternalId==='RES_PA');
    const costBlocked=repeatableSearch
      ? (!searchPa || Number(searchPa.currentValue??0)<1)
      : Boolean(
          i.costValue &&
          i.costResourceExternalId &&
          (i.currentCostResourceValue==null || Number(i.currentCostResourceValue)<Number(i.costValue))
        );
    const maxBlocked=!repeatableSearch&&i.maxUses!=null&&uses.length>=Number(i.maxUses);
    const targetBlocked=!repeatableSearch&&i.limitPerTarget!=null&&sameTarget>=Number(i.limitPerTarget);
    const ownCooldown=repeatableSearch?0:Number(i.cooldownRemainingSeconds??0);
    const searchCooldown=repeatableSearch?searchCooldownRemainingSeconds:0;
    const cooldownRemainingSeconds=Math.max(ownCooldown,searchCooldown);
    const cooldownBlocked=cooldownRemainingSeconds>0;
    const blockedReason=session.status!=='LIVE'
      ? sessionText(session,'La partie n’est pas en cours','The game is not currently live')
      : costBlocked
        ? sessionText(session,'Ressource insuffisante','Insufficient resource')
        : maxBlocked
          ? sessionText(session,'Nombre maximal d’utilisations atteint','Maximum number of uses reached')
          : targetBlocked
            ? sessionText(session,'Ce lieu a déjà été fouillé avec cette action','This location has already been searched with this action')
            : cooldownBlocked
              ? (searchCooldown>0
                  ? sessionText(session,'Nouvelle fouille disponible dans quelques minutes','Next search available in a few minutes')
                  : sessionText(session,'Action en cooldown','Action on cooldown'))
              : null;
    return repeatableSearch
      ? {
          ...i,
          targetExternalId:locationExternalId,
          autonomous:true,
          resolution:'AUTO',
          validation:'AUTO',
          costResourceExternalId:'RES_PA',
          costValue:1,
          currentCostResourceValue:resources.find(r=>r.resourceExternalId==='RES_PA')?.currentValue??null,
          diceCount:0,
          diceSides:0,
          difficulty:null,
          maxUses:null,
          limitPerTarget:null,
          cooldownMinutes:10,
          available:!blockedReason,
          blockedReason,
          usesOnLocation:sameTarget,
          cooldownRemainingSeconds,
          searchCooldownRemainingSeconds:searchCooldown
        }
      : {
          ...i,
          targetExternalId:locationExternalId,
          autonomous:true,
          available:!blockedReason,
          blockedReason,
          usesOnLocation:sameTarget,
          cooldownRemainingSeconds,
          searchCooldownRemainingSeconds:searchCooldown
        };
  });
  const rewards=availableLocationRewards(source,runtime,characterExternalId,locationExternalId);
  if(!actions.length&&(!location.lockExternalId||locationOwnerCharacter(location))&&(rewards.clues.length||rewards.objects.length)){
    const pa=resources.find(r=>r.resourceExternalId==='RES_PA');
    const blockedReason=session.status!=='LIVE'
      ? sessionText(session,'La partie n’est pas en cours','The game is not currently live')
      : !pa
        ? sessionText(session,'PA indisponibles','AP unavailable')
        : Number(pa.currentValue??0)<1
          ? sessionText(session,'PA insuffisants','Insufficient AP')
          : searchCooldownRemainingSeconds>0
            ? sessionText(session,'Nouvelle fouille disponible dans quelques minutes','Next search available in a few minutes')
            : null;
    actions.push({externalId:'SYSTEM_LOCATION_SEARCH',name:sessionText(session,'Fouiller','Search'),category:'INVESTIGATION',targetType:'LOCATION',resolution:'AUTO',validation:'AUTO',costResourceExternalId:'RES_PA',costValue:1,currentCostResourceValue:pa?.currentValue??null,diceCount:0,diceSides:0,difficulty:null,usesCount:(runtime.sessionInteractionUses??[]).filter(u=>u.actorCharacterExternalId===characterExternalId&&u.interactionExternalId==='SYSTEM_LOCATION_SEARCH'&&u.targetExternalId===locationExternalId).length,maxUses:null,cooldownMinutes:10,cooldownRemainingSeconds:searchCooldownRemainingSeconds,searchCooldownRemainingSeconds,targetExternalId:locationExternalId,autonomous:true,systemFallback:true,available:!blockedReason,blockedReason});
  }
  return {location,actions,rewardsRemaining:rewards.rewardsRemaining,searchCooldownRemainingSeconds};
}

function playerVotes(source,runtime,session,characterExternalId) {
  const optionsByVote=new Map();

  for(const o of source.voteOptionDefinitions??[]){
    if(o.active===false)continue;
    if(!optionsByVote.has(o.voteExternalId))
      optionsByVote.set(o.voteExternalId,[]);
    optionsByVote.get(o.voteExternalId).push(o);
  }

  return (source.voteDefinitions??[])
    .filter(v=>v.active!==false)
    .flatMap(v=>{
      const electorate=resolveElectorate(
        v,
        session.sessionParticipants_on_gameSession??[],
        runtime,
        source
      );

      if(!electorate.includes(characterExternalId))
        return [];

      const openRounds=(runtime.sessionVotes??[])
        .filter(r=>
          r.voteExternalId===v.externalId &&
          r.status==='OPEN'
        )
        .sort((a,b)=>b.round-a.round);

      const round=openRounds[0];
      if(!round)return [];

      const ballot=(runtime.sessionBallots??[])
        .find(b=>
          b.voteExternalId===v.externalId &&
          b.round===round.round &&
          b.electorCharacterExternalId===characterExternalId
        );

      // Once the player has voted, the ballot leaves the Play tab.
      if(ballot)return [];

      const eligible=round.eligibleOptionExternalIds
        ? splitIds(round.eligibleOptionExternalIds)
        : null;

      const options=(optionsByVote.get(v.externalId)??[])
        .filter(o=>!eligible||eligible.includes(o.externalId))
        .sort((a,b)=>(a.orderIndex??0)-(b.orderIndex??0))
        .map(o=>({
          externalId:o.externalId,
          label:o.label,
          description:o.description??null
        }));

      return [{
        externalId:v.externalId,
        title:v.title,
        question:v.question,
        round:round.round,
        secret:Boolean(v.secret),
        modifiable:Boolean(v.modifiable),
        abstention:Boolean(v.abstention),
        options,
        selectedOptionExternalIds:[],
        hasVoted:false
      }];
    });
}

function playerVoteResults(source,runtime,session,characterExternalId) {
  const cast=new Set(
    (session.sessionParticipants_on_gameSession??[])
      .filter(p=>p.active!==false&&p.characterExternalId)
      .map(p=>p.characterExternalId)
  );

  if(!cast.has(characterExternalId))
    return [];

  const charMap=byId(source.characters??[]);
  const optionMap=byId(
    (source.voteOptionDefinitions??[])
      .filter(o=>o.active!==false)
  );

  return (source.voteDefinitions??[])
    .filter(v=>v.active!==false)
    .flatMap(v=>{
      const visibility=String(
        v.resultVisibility??'AFTER_CLOSE'
      ).trim().toUpperCase();

      if([
        'GM',
        'MJ',
        'GM_ONLY',
        'MJ_ONLY',
        'HIDDEN',
        'NONE',
      ].includes(visibility))
        return [];

      if(['ELECTORATE','VOTERS'].includes(visibility)){
        const electorate=resolveElectorate(
          v,
          session.sessionParticipants_on_gameSession??[],
          runtime,
          source
        );

        if(!electorate.includes(characterExternalId))
          return [];
      }

      const closed=(runtime.sessionVotes??[])
        .filter(row=>
          row.voteExternalId===v.externalId &&
          row.status==='CLOSED' &&
          row.resultJson
        )
        .sort((a,b)=>Number(b.round??0)-Number(a.round??0))[0];

      if(!closed)return [];

      let result=null;
      try{result=JSON.parse(closed.resultJson)}catch{}
      if(!result)return [];

      const resolveLabel=optionExternalId=>{
        const option=optionMap.get(optionExternalId);
        if(!option)return optionExternalId??null;

        if(option.characterExternalId){
          const character=charMap.get(option.characterExternalId);
          return character?.name??option.label??optionExternalId;
        }

        return option.label??optionExternalId;
      };

      const winnerOptionExternalId=
        result.winnerOptionExternalId??null;

      return [{
        externalId:v.externalId,
        title:v.title,
        question:v.question,
        round:closed.round,
        closedAt:closed.closedAt??null,
        winnerOptionExternalId,
        winnerLabel:winnerOptionExternalId
          ? resolveLabel(winnerOptionExternalId)
          : null,
        tieForLead:Boolean(result.tieForLead),
        suggestSecondRound:Boolean(result.suggestSecondRound),
        ranked:(result.ranked??[])
          .slice(0,3)
          .map(row=>({
            optionExternalId:row.optionExternalId,
            label:resolveLabel(row.optionExternalId)
          }))
      }];
    })
    .sort((a,b)=>
      new Date(b.closedAt??0).getTime()-
      new Date(a.closedAt??0).getTime()
    );
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
function playerObjectView(session,source,mediaMap,objectMap,row){
  if(!row)return null;

  const def=objectMap.get(row.objectExternalId);
  const level=Math.max(0,Math.min(3,Number(row.identificationLevel??0)));
  const identification=
    def?.[`identification${level}`] ||
    def?.description ||
    def?.name ||
    row.objectExternalId;

  const visualCode=String(
    def?.visualArchetypeCode ??
    objectVisualCode(def)
  ).trim().toUpperCase();

  const linkedClues=
    (source.clues??[])
      .filter(clue=>
        clue.active!==false &&
        clue.objectExternalId===row.objectExternalId
      );

  const mediaOverrideCandidates=[
    row.objectExternalId,
    def?.logisticsCode,
    ...linkedClues.map(clue=>clue.logisticsCode),
  ]
    .map(value=>String(value??'').trim())
    .filter(Boolean)
    .filter((value,index,array)=>array.indexOf(value)===index);

  const overrideMedia=
    mediaOverrideCandidates
      .map(candidate=>
        mediaOverrideVisual(
          session,
          'OBJECT',
          candidate
        )
      )
      .find(Boolean) ??
    null;

  const dedicatedMedia=
    visualMedia(mediaMap,def?.mediaExternalId) ??
    visualMedia(mediaMap,`OBJ_${row.objectExternalId}`) ??
    visualMedia(mediaMap,`OBJECT_${row.objectExternalId}`);

  const linkedClueMedia=
    linkedClues
      .map(clue=>visualMedia(mediaMap,clue.mediaExternalId))
      .find(Boolean) ??
    null;

  const archetypeMedia=
    skinVisualMedia(
      source,
      mediaMap,
      session,
      'OBJECT',
      visualCode
    );

  return {
    ...row,
    name:def?.name??row.objectExternalId,
    description:def?.description??'',
    identification,
    transferable:Boolean(def?.transferable),
    consumable:Boolean(def?.consumable),
    critical:Boolean(def?.critical),
    logisticsCode:def?.logisticsCode??null,
    visualCode,
    visualMedia:
      overrideMedia ??
      dedicatedMedia ??
      linkedClueMedia ??
      archetypeMedia ??
      null,
  };
}

function clueVisualMedia(session,source,mediaMap,objectMap,clue){
  if(!clue)return null;

  const def=clue.objectExternalId
    ? objectMap.get(clue.objectExternalId)
    : null;

  const overrideCandidates=[
    ['CLUE',clue.externalId],
    ['OBJECT',clue.objectExternalId],
    ['OBJECT',def?.logisticsCode],
    ['OBJECT',clue.logisticsCode],
  ]
    .map(([type,id])=>[type,String(id??'').trim()])
    .filter(([,id])=>Boolean(id));

  const overrideMedia=
    overrideCandidates
      .map(([type,id])=>mediaOverrideVisual(session,type,id))
      .find(Boolean) ??
    null;

  const dedicatedMedia=
    visualMedia(mediaMap,clue.mediaExternalId) ??
    visualMedia(mediaMap,def?.mediaExternalId) ??
    null;

  const clueLooksLikeObject=
    String(clue.clueType??'').trim().toUpperCase()==='OBJET' ||
    Boolean(clue.objectExternalId) ||
    Boolean(clue.logisticsCode);

  const visualCode=String(
    def?.visualArchetypeCode ??
    objectVisualCode(
      def ?? {
        name:clue.playerName,
        description:clue.playerText,
        support:clue.support,
      }
    )
  ).trim().toUpperCase();

  const archetypeMedia=
    clueLooksLikeObject
      ? skinVisualMedia(
          source,
          mediaMap,
          session,
          'OBJECT',
          visualCode
        )
      : null;

  return overrideMedia ?? dedicatedMedia ?? archetypeMedia ?? null;
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


function parseMediaOverrides(value){
  if(!value)return {};
  try{
    const parsed=JSON.parse(value);
    return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};
  }catch{
    return {};
  }
}

function mediaOverrideVisual(session,targetType,targetExternalId){
  const key=
    `${String(targetType??'').trim().toUpperCase()}:${String(targetExternalId??'').trim()}`;

  const version=session?.scenarioVersion??{};
  const siblingVersions=
    version?.scenario?.scenarioVersions_on_scenario??[];

  const overrideSources=[
    version.mediaOverridesJson,
    ...siblingVersions
      .filter(v=>v?.id!==version.id)
      .map(v=>v?.mediaOverridesJson)
  ];

  let override=null;

  for(const raw of overrideSources){
    const candidate=parseMediaOverrides(raw)?.[key];

    if(candidate?.source){
      override=candidate;
      break;
    }
  }

  if(!override?.source)return null;

  const source=immersiveMediaSource(override.source);
  if(!source)return null;

  return {
    externalId:override.assetExternalId??null,
    mediaType:override.mediaType??'IMAGE',
    source,
    altText:override.altText??override.label??null,
    label:override.label??null,
    skinId:override.skinId??null,
    override:true,
    inherited:
      !parseMediaOverrides(version.mediaOverridesJson)?.[key]?.source,
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
  const knowledge=(runtime.sessionKnowledges??[]).filter(k=>k.characterExternalId===characterExternalId).map(k=>({factExternalId:k.factExternalId,sourceType:k.sourceType,learnedAt:k.learnedAt,fact:factMap.get(k.factExternalId)})).filter(k=>k.fact).sort((a,b)=>new Date(b.learnedAt).getTime()-new Date(a.learnedAt).getTime());
  const discoveries=(runtime.sessionClueDiscoveries??[])
    .filter(d=>d.characterExternalId===characterExternalId)
    .map(d=>{
      const clue=clueMap.get(d.clueExternalId);
      return {
        ...d,
        clue:clue
          ? {
              ...clue,
              inBag:!clue.objectExternalId,
              visualMedia:clueVisualMedia(session,source,mediaMap,objectMap,clue),
              immersiveDocument:immersiveDocumentForClue(clue,documentMap,mediaMap)
            }
          : null
      };
    })
    .filter(d=>d.clue)
    .sort((a,b)=>new Date(b.discoveredAt).getTime()-new Date(a.discoveredAt).getTime());
  const inventory=(runtime.sessionObjects??[])
    .filter(o=>
      o.inPlay!==false &&
      o.holderType==='CHARACTER' &&
      o.holderExternalId===characterExternalId
    )
    .map(o=>playerObjectView(session,source,mediaMap,objectMap,o))
    .filter(Boolean);
  const states=(runtime.sessionCharacterStates??[]).filter(s=>s.characterExternalId===characterExternalId&&s.active!==false).map(s=>({...s,definition:stateMap.get(s.stateExternalId)})).filter(s=>s.definition?.visibleToHolder!==false).map(s=>({...s,name:s.definition?.name??s.stateExternalId,description:s.definition?.description??''}));
  const inventoryById=new Map(
    inventory.map(o=>[o.objectExternalId,o])
  );
  const ownedObjectIds=new Set(inventoryById.keys());

  const documentEntries=(source.clues??[])
    .filter(c=>
      c.active!==false &&
      c.objectExternalId &&
      ownedObjectIds.has(c.objectExternalId) &&
      c.addToNotebook!==false
    )
    .map(c=>({
      clueExternalId:c.externalId,
      objectExternalId:c.objectExternalId,
      documentExternalId:c.documentExternalId??null,
      playerName:c.playerName,
      playerText:c.playerText,
      clueType:c.clueType,
      support:c.support,
      presentationMode:c.presentationMode,
      logisticsCode:c.logisticsCode??null,
      visualMedia:clueVisualMedia(session,source,mediaMap,objectMap,c),
      immersiveDocument:immersiveDocumentForClue(c,documentMap,mediaMap),
      object:inventoryById.get(c.objectExternalId)??null,
      owned:true,
    }));
  const actionLogs=(runtime.sessionActionLogs??[]).filter(l=>l.characterExternalId===characterExternalId).sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).slice(0,50);
  const relationships=(source.relationships??[]).filter(r=>r.active!==false&&visibilityAllowed(r.visibility)&&(r.characterAExternalId===characterExternalId||r.characterBExternalId===characterExternalId)).map(r=>{const isA=r.characterAExternalId===characterExternalId;const otherExternalId=isA?r.characterBExternalId:r.characterAExternalId;const other=charMap.get(otherExternalId);return{externalId:r.externalId,otherExternalId,otherName:other?.name??otherExternalId,otherPublicRole:other?.publicRole??null,relationType:r.relationType,text:isA?r.textA:(r.textB||r.textA),visibility:r.visibility,portrait:mediaOverrideVisual(session,'CHARACTER',otherExternalId)??visualMedia(mediaMap,other?.portraitMediaId)??skinVisualMedia(source,mediaMap,session,'CHARACTER',other?.portraitArchetypeCode)};});
  const discoverableAboutMe=(source.clues??[])
    .filter(clue=>
      clue.active!==false &&
      clueTargetCharacter(clue)===characterExternalId
    )
    .sort((a,b)=>
      Number(Boolean(b.major))-Number(Boolean(a.major)) ||
      String(a.externalId).localeCompare(String(b.externalId))
    )
    .map(clue=>({
      externalId:clue.externalId,
      playerName:clue.playerName,
      playerText:clue.playerText,
      clueType:clue.clueType,
      major:Boolean(clue.major),
    }));

  const pendingAbilityRequests=(runtime.sessionStealGrants??[])
    .filter(g=>
      g.status==='OPEN' &&
      g.targetCharacterExternalId===characterExternalId &&
      ['CHARM','NEGOTIATION'].includes(String(g.kind??'').toUpperCase()) &&
      new Date(g.expiresAt).getTime()>now.getTime()
    )
    .map(g=>{
      const kind=String(g.kind??'').toUpperCase();
      const actor=charMap.get(g.actorCharacterExternalId);
      const offeredDef=g.chosenObjectExternalId
        ? objectMap.get(g.chosenObjectExternalId)
        : null;
      const options=kind==='CHARM'
        ? charmInformationForTarget(
            source,
            runtime,
            g.actorCharacterExternalId,
            characterExternalId
          )
        : transferableEvidenceForCharacter(
            source,
            runtime,
            characterExternalId
          );
      return {
        grantToken:g.grantToken,
        interactionExternalId:g.interactionExternalId,
        kind,
        actorCharacterExternalId:g.actorCharacterExternalId,
        actorName:actor?.name??g.actorCharacterExternalId,
        expiresAt:g.expiresAt,
        offeredObject:g.chosenObjectExternalId
          ? {
              objectExternalId:g.chosenObjectExternalId,
              name:offeredDef?.name??g.chosenObjectExternalId,
              description:offeredDef?.description??null,
            }
          : null,
        options,
      };
    })
    .filter(request=>request.options.length>0);

  const notifications=(runtime.sessionPlayerNotifications??[]).filter(n=>n.characterExternalId===characterExternalId).sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
  const interactions=playerInteractions(source,runtime,session,characterExternalId,resources,now);
  const votes=playerVotes(source,runtime,session,characterExternalId);
  const voteResults=playerVoteResults(
    source,
    runtime,
    session,
    characterExternalId
  );

  return {
    presentation:scenarioPresentation(session,source),
    participant:{id:participant.id,displayName:participant.displayName,briefingStatus:participant.briefingStatus,briefingReadAt:participant.briefingReadAt??null,playerOpenCount:Number(participant.playerOpenCount??0)},
    session:{id:session.id,name:session.name,scheduledAt:session.scheduledAt,venue:session.venue,language:session.language??'FR',status:session.status,startedAt:session.startedAt,pausedAt:session.pausedAt,finishedAt:session.finishedAt,scenarioTitle:session.scenarioVersion?.scenario?.title??'Murder Party',playerSummary:session.scenarioVersion?.playerSummary??''},
    character:{externalId:character.externalId,name:character.name,publicRole:character.publicRole,biography:character.biography,secretIntro:character.secretIntro,interpretationNotes:character.interpretationNotes,appearanceNotes:character.appearanceNotes,apparentMotive:character.apparentMotive,personalTimeline:character.personalTimeline,motto:character.motto,narrativeAge:character.narrativeAge,portrait:mediaOverrideVisual(session,'CHARACTER',character.externalId)??visualMedia(mediaMap,character.portraitMediaId)??skinVisualMedia(source,mediaMap,session,'CHARACTER',character.portraitArchetypeCode)},
    otherCharacters:(session.sessionParticipants_on_gameSession??[]).filter(p=>p.active!==false&&p.characterExternalId&&p.characterExternalId!==characterExternalId).map(p=>{const c=charMap.get(p.characterExternalId);return{characterExternalId:p.characterExternalId,name:c?.name??p.characterExternalId,publicRole:c?.publicRole??null,participantName:p.displayName,portrait:mediaOverrideVisual(session,'CHARACTER',p.characterExternalId)??visualMedia(mediaMap,c?.portraitMediaId)??skinVisualMedia(source,mediaMap,session,'CHARACTER',c?.portraitArchetypeCode)};}),
    objectives,relationships,resources,knowledge,discoveries,documentEntries,inventory,discoverableAboutMe,pendingAbilityRequests,states,abilities:effectiveAbilities(source,characterExternalId).filter(a=>!a.secret),interactions,votes,voteResults,notifications,actionLogs,unreadNotificationCount:notifications.filter(n=>!n.readAt).length,searchCooldownRemainingSeconds:globalLocationSearchCooldownRemaining(source,runtime,characterExternalId,now),
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
  const detail=await getGameSession(sessionId,{reader});
  if(!detail)throw new Error('SESSION_NOT_FOUND');
  const characterExternalId=String(input?.characterExternalId??'').trim();
  if(!detail.participants.some(p=>p.active!==false&&p.characterExternalId===characterExternalId))throw new Error('TARGET_CHARACTER_NOT_IN_SESSION');
  const english=sessionIsEnglish(detail);
  const title=String(english?(input?.titleEn??input?.title):(input?.title??input?.titleEn)??'').trim().slice(0,120);
  const body=String(english?(input?.bodyEn??input?.body):(input?.body??input?.bodyEn)??'').trim().slice(0,1200);
  if(!title||!body)throw new Error('NOTIFICATION_CONTENT_REQUIRED');
  const data={gameSessionId:sessionId,characterExternalId,kind:String(input?.kind??'GM').trim().slice(0,40)||'GM',title,body,priority:String(input?.priority??'NORMAL').trim().toUpperCase(),refExternalId:String(input?.refExternalId??'').trim()||null,createdAt:nowIso(now),readAt:null};
  await executor(INSERT_NOTIFICATION_MUTATION,{data});
  return{sent:true,characterExternalId,title};
}


async function respondPlayerAbilityGrant(token,input,{reader=defaultReader,executor=defaultExecutor,clueReveal=revealClueToCharacter,now=new Date()}={}) {
  const loaded=await loadPlayerData(token,reader);
  if(loaded.session.status!=='LIVE')throw new Error('PLAYER_ACTIONS_NOT_LIVE');
  const target=loaded.participant.characterExternalId;
  const grantToken=String(input?.grantToken??'').trim();
  const selectionExternalId=String(input?.selectionExternalId??'').trim();
  if(!grantToken||!selectionExternalId)throw new Error('ABILITY_RESPONSE_REQUIRED');

  const grant=(loaded.runtime.sessionStealGrants??[]).find(g=>g.grantToken===grantToken);
  if(!grant||grant.status!=='OPEN'||grant.targetCharacterExternalId!==target)
    throw new Error('ABILITY_REQUEST_NOT_AVAILABLE');

  const nowDate=now instanceof Date?now:new Date(now);
  if(new Date(grant.expiresAt).getTime()<=nowDate.getTime())
    throw new Error('ABILITY_REQUEST_EXPIRED');

  const actor=grant.actorCharacterExternalId;
  const actorDef=(loaded.source.characters??[]).find(c=>c.externalId===actor);
  const targetDef=(loaded.source.characters??[]).find(c=>c.externalId===target);
  const actorName=actorDef?.name??actor;
  const targetName=targetDef?.name??target;
  const usedAt=nowIso(nowDate);
  const kind=String(grant.kind??'').toUpperCase();

  if(kind==='CHARM'){
    const option=charmInformationForTarget(
      loaded.source,
      loaded.runtime,
      actor,
      target
    ).find(x=>x.factExternalId===selectionExternalId);
    if(!option)throw new Error('CHARM_INFORMATION_NOT_AVAILABLE');

    const actorNotification={
      gameSessionId:loaded.session.id,
      characterExternalId:actor,
      kind:'CHARM',
      title:sessionText(loaded.session,'Information obtenue de '+targetName,'Information obtained from '+targetName),
      body:option.text||option.title,
      priority:'IMPORTANT',
      refExternalId:selectionExternalId,
      createdAt:usedAt,
      readAt:null,
    };
    const targetNotification={
      gameSessionId:loaded.session.id,
      characterExternalId:target,
      kind:'CHARM',
      title:sessionText(loaded.session,'Information révélée','Information revealed'),
      body:sessionText(
        loaded.session,
        'Vous avez révélé « '+option.title+' » à '+actorName+'.',
        'You revealed “'+option.title+'” to '+actorName+'.'
      ),
      priority:'NORMAL',
      refExternalId:selectionExternalId,
      createdAt:usedAt,
      readAt:null,
    };
    const log={
      gameSessionId:loaded.session.id,
      actionType:'CHARM_INFORMATION_SHARED',
      characterExternalId:actor,
      refExternalId:selectionExternalId,
      beforeValue:target,
      afterValue:actor,
      deltaValue:null,
      note:sessionText(loaded.session,'Charm : information choisie par '+targetName,'Charm: information chosen by '+targetName),
      createdAt:usedAt,
    };
    await executor(RESOLVE_CHARM_MUTATION,{
      sessionId:loaded.session.id,
      grantToken,
      factExternalId:selectionExternalId,
      usedAt,
      knowledge:{
        gameSessionId:loaded.session.id,
        characterExternalId:actor,
        factExternalId:selectionExternalId,
        sourceType:'CHARM',
        learnedAt:usedAt,
      },
      actorNotification,
      targetNotification,
      log,
    });
    return {success:true,kind:'CHARM',fact:{factExternalId:selectionExternalId,title:option.title,text:option.text},actorCharacterExternalId:actor,targetCharacterExternalId:target};
  }

  if(kind==='NEGOTIATION'){
    const actorObjectExternalId=String(grant.chosenObjectExternalId??'').trim();
    const actorOption=transferableEvidenceForCharacter(loaded.source,loaded.runtime,actor)
      .find(x=>x.objectExternalId===actorObjectExternalId);
    const targetOption=transferableEvidenceForCharacter(loaded.source,loaded.runtime,target)
      .find(x=>x.objectExternalId===selectionExternalId);
    if(!actorOption)throw new Error('NEGOTIATION_OFFER_NO_LONGER_AVAILABLE');
    if(!targetOption)throw new Error('NEGOTIATION_RESPONSE_NO_LONGER_AVAILABLE');
    if(actorObjectExternalId===selectionExternalId)throw new Error('NEGOTIATION_SAME_OBJECT');

    const sourceClues=(loaded.source.clues??[]).filter(c=>c.active!==false&&c.addToNotebook!==false);
    const actorLinked=sourceClues.filter(c=>c.objectExternalId===actorObjectExternalId);
    const targetLinked=sourceClues.filter(c=>c.objectExternalId===selectionExternalId);

    for(const clue of actorLinked)
      await clueReveal(loaded.session.id,{characterExternalId:actor,clueExternalId:clue.externalId,sourceRef:actorObjectExternalId,note:sessionText(loaded.session,'Preuve conservée au carnet avant échange','Evidence retained in notebook before exchange')});
    for(const clue of targetLinked)
      await clueReveal(loaded.session.id,{characterExternalId:target,clueExternalId:clue.externalId,sourceRef:selectionExternalId,note:sessionText(loaded.session,'Preuve conservée au carnet avant échange','Evidence retained in notebook before exchange')});

    const actorNotification={
      gameSessionId:loaded.session.id,
      characterExternalId:actor,
      kind:'NEGOTIATION',
      title:sessionText(loaded.session,'Échange conclu','Exchange completed'),
      body:sessionText(
        loaded.session,
        targetName+' vous remet « '+targetOption.name+' » en échange de « '+actorOption.name+' ».',
        targetName+' gives you “'+targetOption.name+'” in exchange for “'+actorOption.name+'”.'
      ),
      priority:'IMPORTANT',
      refExternalId:selectionExternalId,
      createdAt:usedAt,
      readAt:null,
    };
    const targetNotification={
      gameSessionId:loaded.session.id,
      characterExternalId:target,
      kind:'NEGOTIATION',
      title:sessionText(loaded.session,'Échange imposé','Forced exchange'),
      body:sessionText(
        loaded.session,
        'Vous remettez « '+targetOption.name+' » à '+actorName+' et recevez « '+actorOption.name+' ».',
        'You give “'+targetOption.name+'” to '+actorName+' and receive “'+actorOption.name+'”.'
      ),
      priority:'IMPORTANT',
      refExternalId:actorObjectExternalId,
      createdAt:usedAt,
      readAt:null,
    };
    const log={
      gameSessionId:loaded.session.id,
      actionType:'NEGOTIATION_EXCHANGE',
      characterExternalId:actor,
      refExternalId:grant.interactionExternalId,
      beforeValue:actorObjectExternalId,
      afterValue:selectionExternalId,
      deltaValue:null,
      note:sessionText(loaded.session,'Échange forcé avec '+targetName,'Forced exchange with '+targetName),
      createdAt:usedAt,
    };
    await executor(RESOLVE_NEGOTIATION_MUTATION,{
      sessionId:loaded.session.id,
      grantToken,
      actorObjectExternalId,
      targetObjectExternalId:selectionExternalId,
      actorCharacterExternalId:actor,
      targetCharacterExternalId:target,
      usedAt,
      actorNotification,
      targetNotification,
      log,
    });

    for(const clue of actorLinked)
      await clueReveal(loaded.session.id,{characterExternalId:target,clueExternalId:clue.externalId,sourceRef:actorObjectExternalId,note:sessionText(loaded.session,'Preuve reçue par négociation','Evidence received through negotiation')});
    for(const clue of targetLinked)
      await clueReveal(loaded.session.id,{characterExternalId:actor,clueExternalId:clue.externalId,sourceRef:selectionExternalId,note:sessionText(loaded.session,'Preuve reçue par négociation','Evidence received through negotiation')});

    return {success:true,kind:'NEGOTIATION',received:targetOption,given:actorOption,actorCharacterExternalId:actor,targetCharacterExternalId:target};
  }

  throw new Error('UNSUPPORTED_ABILITY_REQUEST');
}

export async function executePlayerInteraction(token,input,{reader=defaultReader,executor=defaultExecutor,interactionExecutor=executeInteraction,clueReveal=revealClueToCharacter,now=new Date()}={}) {
  if(input?.grantToken)
    return respondPlayerAbilityGrant(token,input,{reader,executor,clueReveal,now});

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

  const specialKind=specialPlayerAbilityKind(interaction);
  if(['CHARM','NEGOTIATION'].includes(specialKind)){
    const targetCharacter=(loaded.source.characters??[]).find(c=>c.externalId===targetExternalId);
    const targetName=targetCharacter?.name??targetExternalId;
    const actorCharacter=(loaded.source.characters??[]).find(c=>c.externalId===actor);
    const actorName=actorCharacter?.name??actor;

    if(specialKind==='CHARM'){
      if(!charmInformationForTarget(loaded.source,loaded.runtime,actor,targetExternalId).length)
        throw new Error('CHARM_NO_INFORMATION_AVAILABLE');
    }

    let offeredObjectExternalId=null;
    if(specialKind==='NEGOTIATION'){
      const actorEvidence=transferableEvidenceForCharacter(loaded.source,loaded.runtime,actor);
      const targetEvidence=transferableEvidenceForCharacter(loaded.source,loaded.runtime,targetExternalId);
      if(!actorEvidence.length||!targetEvidence.length)
        throw new Error('NEGOTIATION_NO_EVIDENCE_AVAILABLE');
      offeredObjectExternalId=String(input?.offeredObjectExternalId??'').trim();
      if(!actorEvidence.some(x=>x.objectExternalId===offeredObjectExternalId))
        throw new Error('NEGOTIATION_OFFER_REQUIRED');
    }

    const result=await interactionExecutor(loaded.session.id,{
      actorCharacterExternalId:actor,
      interactionExternalId:id,
      targetExternalId,
      gmOutcome:'SUCCESS',
      note:sessionText(loaded.session,'Compétence directe · '+specialKind,'Direct skill · '+specialKind),
    });

    const grantToken=randomBytes(24).toString('base64url');
    const createdAt=nowIso(now);
    const expiresAt=new Date((now instanceof Date?now:new Date(now)).getTime()+6*60*60*1000).toISOString();
    await executor(INSERT_STEAL_GRANT_MUTATION,{data:{
      gameSessionId:loaded.session.id,
      grantToken,
      interactionExternalId:id,
      actorCharacterExternalId:actor,
      targetCharacterExternalId:targetExternalId,
      kind:specialKind,
      status:'OPEN',
      createdAt,
      expiresAt,
      usedAt:null,
      chosenObjectExternalId:offeredObjectExternalId,
    }});

    const body=specialKind==='CHARM'
      ? sessionText(
          loaded.session,
          actorName+' utilise son charme sur vous. Choisissez une information que vous connaissez à lui révéler.',
          actorName+' uses Charm on you. Choose one piece of information you know to reveal.'
        )
      : sessionText(
          loaded.session,
          actorName+' impose un échange de preuves. Choisissez une preuve transférable à lui remettre en retour.',
          actorName+' forces an evidence exchange. Choose one transferable piece of evidence to give in return.'
        );

    await executor(INSERT_NOTIFICATION_MUTATION,{data:{
      gameSessionId:loaded.session.id,
      characterExternalId:targetExternalId,
      kind:specialKind,
      title:specialKind==='CHARM'
        ? sessionText(loaded.session,'Charm — réponse requise','Charm — response required')
        : sessionText(loaded.session,'Négociation — échange requis','Negotiation — exchange required'),
      body,
      priority:'IMPORTANT',
      refExternalId:id,
      createdAt,
      readAt:null,
    }});
    await executor(INSERT_NOTIFICATION_MUTATION,{data:{
      gameSessionId:loaded.session.id,
      characterExternalId:actor,
      kind:specialKind,
      title:sessionText(loaded.session,'Action lancée','Action started'),
      body:sessionText(
        loaded.session,
        'Votre action sur '+targetName+' est lancée. La cible doit maintenant faire son choix.',
        'Your action on '+targetName+' has started. The target must now make their choice.'
      ),
      priority:'NORMAL',
      refExternalId:id,
      createdAt,
      readAt:null,
    }});

    return {...result,success:true,specialKind,pending:true,grantToken,targetExternalId};
  }

  const rumorInteraction=isInformantInteraction(interaction);
  const rumorClue=
    rumorInteraction&&targetExternalId
      ? availableRumorForTarget(loaded.source,loaded.runtime,actor,targetExternalId)
      : null;

  if(rumorInteraction&&!rumorClue)
    throw new Error('RUMOR_NOT_AVAILABLE_FOR_TARGET');

  const characterTarget=['PLAYER','CHARACTER'].includes(targetType);
  const requiresGm=String(interaction.resolution).toUpperCase()==='GM'||String(interaction.validation??'').toUpperCase()==='GM'||(Boolean(interaction.targetSecret)&&!characterTarget);
  if(requiresGm){
    if(!input?.requestOnly)throw new Error('PLAYER_INTERACTION_REQUIRES_GM');
    await executor(INSERT_PLAYER_ACTION_LOG_MUTATION,{data:{gameSessionId:loaded.session.id,actionType:'PLAYER_INTERACTION_REQUEST',characterExternalId:actor,refExternalId:id,beforeValue:null,afterValue:targetExternalId,deltaValue:null,note:sessionText(loaded.session,'Demande joueur : '+interaction.name,'Player request: '+interaction.name),createdAt:nowIso(now)}});
    return {requested:true,interactionExternalId:id,interactionName:interaction.name,targetExternalId,scanMode:interactionScanMode(interaction)};
  }

  const result=await interactionExecutor(loaded.session.id,{actorCharacterExternalId:actor,interactionExternalId:id,targetExternalId,note:sessionText(loaded.session,'Action joueur · ciblage '+(interactionScanMode(interaction)??'N/A'),'Player action · targeting '+(interactionScanMode(interaction)??'N/A'))});
  const createdAt=nowIso(now);
  const targetCharacter=(loaded.source.characters??[]).find(c=>c.externalId===targetExternalId);
  let rumor=null;

  if(result.success&&rumorClue){
    await clueReveal(loaded.session.id,{
      characterExternalId:actor,
      clueExternalId:rumorClue.externalId,
      sourceInteractionExternalId:id,
      sourceRef:targetExternalId,
      note:sessionText(loaded.session,'Rumeur obtenue sur '+targetExternalId,'Rumour obtained about '+targetExternalId),
    });

    rumor={
      clueExternalId:rumorClue.externalId,
      name:rumorClue.playerName,
      text:rumorClue.playerText,
      targetCharacterExternalId:targetExternalId,
      targetName:targetCharacter?.name??targetExternalId,
    };
  }

  const actorNotification=rumor
    ? {
        gameSessionId:loaded.session.id,
        characterExternalId:actor,
        kind:'RUMOR',
        title:sessionText(loaded.session,'Rumeur — '+rumor.targetName,'Rumour — '+rumor.targetName),
        body:rumor.text,
        priority:'NORMAL',
        refExternalId:rumor.clueExternalId,
        createdAt,
        readAt:null,
      }
    : {
        gameSessionId:loaded.session.id,
        characterExternalId:actor,
        kind:'INTERACTION',
        title:result.interactionName||interaction.name,
        body:result.success
          ? sessionText(loaded.session,'Action réussie.','Action succeeded.')
          : sessionText(loaded.session,'Action échouée.','Action failed.'),
        priority:'NORMAL',
        refExternalId:id,
        createdAt,
        readAt:null,
      };

  await executor(INSERT_NOTIFICATION_MUTATION,{data:actorNotification});

  if(characterTarget&&targetExternalId){
    const targetData=rumor
      ? {
          gameSessionId:loaded.session.id,
          characterExternalId:targetExternalId,
          kind:'INTERACTION_TARGET',
          title:sessionText(loaded.session,'Une rumeur circule…','A rumour is circulating…'),
          body:sessionText(
            loaded.session,
            'Quelqu’un vient d’obtenir une rumeur à votre sujet par son réseau d’informateurs. Murder Engine ne révèle pas son identité.',
            'Someone has just obtained a rumour about you through their informant network. Murder Engine does not reveal their identity.'
          ),
          priority:'NORMAL',
          refExternalId:id,
          createdAt,
          readAt:null,
        }
      : {
          gameSessionId:loaded.session.id,
          characterExternalId:targetExternalId,
          kind:'INTERACTION_TARGET',
          title:sessionText(loaded.session,'Action sur votre personnage','Action targeting your character'),
          body:sessionText(
            loaded.session,
            'Une action « '+interaction.name+' » vient d’être exercée sur votre personnage. '+(result.success?'Elle a réussi.':'Elle a échoué.')+' Murder Engine ne révèle pas son auteur.',
            'An action “'+interaction.name+'” has just been used on your character. '+(result.success?'It succeeded.':'It failed.')+' Murder Engine does not reveal who performed it.'
          ),
          priority:'NORMAL',
          refExternalId:id,
          createdAt,
          readAt:null,
        };

    await executor(INSERT_NOTIFICATION_MUTATION,{data:targetData});
  }

  return {...result,scanMode:interactionScanMode(interaction),rumor};
}

export async function sharePlayerClue(token,input,{reader=defaultReader,executor=defaultExecutor,clueReveal=revealClueToCharacter,now=new Date()}={}) {
  const loaded=await loadPlayerData(token,reader);
  if(loaded.session.status!=='LIVE')throw new Error('PLAYER_ACTIONS_NOT_LIVE');

  const actor=loaded.participant.characterExternalId;
  const clueExternalId=String(input?.clueExternalId??'').trim();
  const targetCharacterExternalId=String(input?.targetCharacterExternalId??'').trim();

  if(!clueExternalId)throw new Error('CLUE_ID_REQUIRED');
  if(!targetCharacterExternalId||targetCharacterExternalId===actor)
    throw new Error('INVALID_CLUE_TARGET');

  if(!(loaded.session.sessionParticipants_on_gameSession??[]).some(
    p=>p.active!==false&&p.characterExternalId===targetCharacterExternalId
  )) throw new Error('CLUE_TARGET_CHARACTER_NOT_FOUND');

  const clue=(loaded.source.clues??[]).find(
    c=>c.externalId===clueExternalId&&c.active!==false
  );
  if(!clue)throw new Error('CLUE_NOT_FOUND');
  if(clue.shareable===false)throw new Error('CLUE_NOT_SHAREABLE');

  const actorHasClue=(loaded.runtime.sessionClueDiscoveries??[]).some(
    d=>d.characterExternalId===actor&&d.clueExternalId===clueExternalId
  );
  if(!actorHasClue)throw new Error('CLUE_NOT_OWNED_BY_PLAYER');

  const targetAlreadyHasClue=(loaded.runtime.sessionClueDiscoveries??[]).some(
    d=>d.characterExternalId===targetCharacterExternalId&&d.clueExternalId===clueExternalId
  );

  if(!targetAlreadyHasClue){
    await clueReveal(loaded.session.id,{
      characterExternalId:targetCharacterExternalId,
      clueExternalId,
      sourceRef:actor,
      note:sessionText(
        loaded.session,
        `Indice partagé par ${actor}`,
        `Clue shared by ${actor}`
      ),
    });
  }

  const createdAt=nowIso(now);
  const targetName=
    (loaded.source.characters??[]).find(c=>c.externalId===targetCharacterExternalId)?.name
    ??targetCharacterExternalId;

  if(!targetAlreadyHasClue){
    await executor(INSERT_NOTIFICATION_MUTATION,{data:{
      gameSessionId:loaded.session.id,
      characterExternalId:targetCharacterExternalId,
      kind:'CLUE',
      title:sessionText(loaded.session,'Nouvel indice','New clue'),
      body:sessionText(
        loaded.session,
        `${clue.playerName} a été ajouté à votre Sac et à votre Carnet.`,
        `${clue.playerName} has been added to your Bag and Notebook.`
      ),
      priority:'IMPORTANT',
      refExternalId:clueExternalId,
      createdAt,
      readAt:null,
    }});
  }

  await executor(INSERT_NOTIFICATION_MUTATION,{data:{
    gameSessionId:loaded.session.id,
    characterExternalId:actor,
    kind:'ACTION',
    title:sessionText(loaded.session,'Indice partagé','Clue shared'),
    body:targetAlreadyHasClue
      ? sessionText(
          loaded.session,
          `${targetName} connaissait déjà cet indice.`,
          `${targetName} already knew this clue.`
        )
      : sessionText(
          loaded.session,
          `Vous avez partagé « ${clue.playerName} » avec ${targetName}.`,
          `You shared “${clue.playerName}” with ${targetName}.`
        ),
    priority:'NORMAL',
    refExternalId:clueExternalId,
    createdAt,
    readAt:null,
  }});

  return {
    clueExternalId,
    targetCharacterExternalId,
    targetName,
    alreadyKnown:targetAlreadyHasClue,
    shared:!targetAlreadyHasClue,
  };
}

export async function transferPlayerObject(token,input,{reader=defaultReader,executor=defaultExecutor,objectTransfer=transferSessionObject,clueReveal=revealClueToCharacter,now=new Date()}={}) {
  const loaded=await loadPlayerData(token,reader);if(loaded.session.status!=='LIVE')throw new Error('PLAYER_ACTIONS_NOT_LIVE');const actor=loaded.participant.characterExternalId;const objectExternalId=String(input?.objectExternalId??'').trim();const targetCharacterExternalId=String(input?.targetCharacterExternalId??'').trim();if(!targetCharacterExternalId||targetCharacterExternalId===actor)throw new Error('INVALID_OBJECT_TARGET');const row=(loaded.runtime.sessionObjects??[]).find(o=>o.objectExternalId===objectExternalId&&o.inPlay!==false&&o.holderType==='CHARACTER'&&o.holderExternalId===actor);if(!row)throw new Error('OBJECT_NOT_OWNED_BY_PLAYER');const def=(loaded.source.gameObjects??[]).find(o=>o.externalId===objectExternalId&&o.active!==false);if(!def?.transferable)throw new Error('OBJECT_NOT_TRANSFERABLE');if(!(loaded.session.sessionParticipants_on_gameSession??[]).some(p=>p.active!==false&&p.characterExternalId===targetCharacterExternalId))throw new Error('OBJECT_TARGET_CHARACTER_NOT_FOUND');
  const linkedClues=(loaded.source.clues??[]).filter(c=>c.active!==false&&c.objectExternalId===objectExternalId&&c.addToNotebook!==false);
  for(const clue of linkedClues){await clueReveal(loaded.session.id,{characterExternalId:actor,clueExternalId:clue.externalId,sourceRef:objectExternalId,note:sessionText(loaded.session,`Document consulté : ${def.name}`,`Document reviewed: ${def.name}`)});}
  const result=await objectTransfer(loaded.session.id,{objectExternalId,holderType:'CHARACTER',holderExternalId:targetCharacterExternalId,note:sessionText(loaded.session,`Don de ${actor}`,`Given by ${actor}`)});
  for(const clue of linkedClues){await clueReveal(loaded.session.id,{characterExternalId:targetCharacterExternalId,clueExternalId:clue.externalId,sourceRef:objectExternalId,note:sessionText(loaded.session,`Document reçu : ${def.name}`,`Document received: ${def.name}`)});}
  const createdAt=nowIso(now);
  await executor(INSERT_NOTIFICATION_MUTATION,{data:{gameSessionId:loaded.session.id,characterExternalId:targetCharacterExternalId,kind:'OBJECT',title:sessionText(loaded.session,'Objet reçu','Item received'),body:sessionText(loaded.session,`Vous recevez : ${def.name}.`,`You receive: ${def.name}.`),priority:'NORMAL',refExternalId:objectExternalId,createdAt,readAt:null}});
  await executor(INSERT_NOTIFICATION_MUTATION,{data:{gameSessionId:loaded.session.id,characterExternalId:actor,kind:'ACTION',title:sessionText(loaded.session,'Objet donné','Item given'),body:sessionText(loaded.session,`Vous avez donné : ${def.name}.`,`You gave: ${def.name}.`),priority:'NORMAL',refExternalId:objectExternalId,createdAt,readAt:null}});
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
    title:sessionText(loaded.session,'Argent reçu','Money received'),
    body:sessionText(loaded.session,`Vous recevez ${amount} d’argent.`,`You receive ${amount} in cash.`),
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
    note:sessionText(loaded.session,`Virement de ${amount} à ${targetName}`,`Transfer of ${amount} to ${targetName}`),
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
    note:sessionText(loaded.session,`Virement reçu : ${amount}`,`Transfer received: ${amount}`),
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
  const use={gameSessionId:loaded.session.id,interactionExternalId:'SYSTEM_LOCATION_SEARCH',actorCharacterExternalId:actor,targetType:'LOCATION',targetExternalId:locationExternalId,resolution:'AUTO',success:true,abilityLevel:0,actorRollJson:null,targetRollJson:null,costResourceExternalId:'RES_PA',costValue:1,note:sessionText(loaded.session,'Fouille QR automatique','Automatic QR search'),createdAt};
  const log={gameSessionId:loaded.session.id,actionType:'INTERACTION_EXECUTE',characterExternalId:actor,refExternalId:'SYSTEM_LOCATION_SEARCH',beforeValue:null,afterValue:'SUCCESS',deltaValue:-1,note:sessionText(loaded.session,`Fouille QR → ${locationExternalId}`,`QR search → ${locationExternalId}`),createdAt};
  await executor(SYSTEM_LOCATION_SEARCH_MUTATION,{sessionId:loaded.session.id,characterExternalId:actor,currentValue:after,updatedAt:createdAt,use,log});
  return {interactionExternalId:'SYSTEM_LOCATION_SEARCH',interactionName:sessionText(loaded.session,'Fouiller','Search'),actorCharacterExternalId:actor,targetType:'LOCATION',targetExternalId:locationExternalId,success:true,resolution:'AUTO',actorRoll:null,targetRoll:null,actorTotal:null,targetTotal:null,abilityLevel:0,cost:{resourceExternalId:'RES_PA',value:1,remaining:after}};
}

async function grantAutomaticLocationReward(loaded, locationExternalId, interactionExternalId, {clueReveal=revealClueToCharacter,objectTransfer=transferSessionObject}={}) {
  const actor=loaded.participant.characterExternalId;
  const rewards=availableLocationRewards(loaded.source,loaded.runtime,actor,locationExternalId);

  let clue=rewards.takeableClues[0]??null;
  let objectRow=null;

  if(clue?.objectExternalId){
    objectRow=rewards.objects.find(
      o=>o.objectExternalId===clue.objectExternalId
    )??null;
  }else if(!clue && rewards.standaloneObjects.length){
    objectRow=rewards.standaloneObjects[0];
  }else if(!clue){
    clue=rewards.staticClues[0]??null;
  }
  if(clue) await clueReveal(loaded.session.id,{characterExternalId:actor,clueExternalId:clue.externalId,sourceInteractionExternalId:interactionExternalId,sourceRef:locationExternalId,note:sessionText(loaded.session,'Découverte automatique via QR','Automatic discovery via QR')});
  if(objectRow) await objectTransfer(loaded.session.id,{objectExternalId:objectRow.objectExternalId,holderType:'CHARACTER',holderExternalId:actor,note:sessionText(loaded.session,`Ramassé lors de la fouille de ${locationExternalId}`,`Picked up while searching ${locationExternalId}`)});
  const mediaMap=byId(
    (loaded.source.mediaAssets??[])
      .filter(m=>m.active!==false)
  );
  const objectMap=byId(
    (loaded.source.gameObjects??[])
      .filter(o=>o.active!==false)
  );
  const objectView=objectRow
    ? playerObjectView(
        loaded.session,
        loaded.source,
        mediaMap,
        objectMap,
        objectRow
      )
    : null;

  return {
    kind:clue&&objectRow?'CLUE_OBJECT':clue?'CLUE':objectRow?'OBJECT':'NONE',
    clue:clue?{
      externalId:clue.externalId,
      name:clue.playerName,
      text:clue.playerText,
      clueType:clue.clueType,
      logisticsCode:clue.logisticsCode??null,
      visualMedia:clueVisualMedia(
        loaded.session,
        loaded.source,
        mediaMap,
        objectMap,
        clue
      ),
      mode:isStaticLocationClue(clue)?'PERSISTENT':'TAKEABLE'
    }:null,
    object:objectView?{
      externalId:objectView.objectExternalId,
      name:objectView.name,
      description:objectView.description??null,
      logisticsCode:objectView.logisticsCode??null,
      physicalPickupRequired:Boolean(objectView.logisticsCode),
      visualMedia:objectView.visualMedia??null,
      visualCode:objectView.visualCode??null
    }:null
  };
}

export async function getPlayerLocation(token,locationExternalId,{reader=defaultReader,now=new Date()}={}) {
  const loaded=await loadPlayerData(token,reader); const actor=loaded.participant.characterExternalId;
  const resources=(loaded.runtime.sessionResources??[]).filter(r=>r.characterExternalId===actor);
  const shaped=locationActionShape(loaded.source,loaded.runtime,loaded.session,actor,String(locationExternalId??'').trim(),resources,now instanceof Date?now:new Date(now));
  const forbidden=locationOwnerCharacter(shaped.location)===actor;
  const empty=locationIsEmptyForCharacter(loaded.source,loaded.runtime,actor,shaped.location.externalId);
  return {
    presentation:scenarioPresentation(loaded.session,loaded.source),
    session:{
      id:loaded.session.id,
      name:loaded.session.name,
      status:loaded.session.status,
      language:loaded.session.language??'FR',
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

  if(locationIsEmptyForCharacter(
    loaded.source,
    loaded.runtime,
    actor,
    locationExternalId
  ))
    throw new Error('LOCATION_EMPTY');

  const resources=(loaded.runtime.sessionResources??[]).filter(r=>r.characterExternalId===actor); const shaped=locationActionShape(loaded.source,loaded.runtime,loaded.session,actor,locationExternalId,resources,now instanceof Date?now:new Date(now));
  const action=shaped.actions.find(a=>a.externalId===interactionExternalId); if(!action) throw new Error('LOCATION_ACTION_NOT_AVAILABLE'); if(!action.available) throw new Error(action.blockedReason||'LOCATION_ACTION_BLOCKED');
  let result;
  if(interactionExternalId==='SYSTEM_LOCATION_SEARCH'){
    result=await executeSystemLocationSearch(loaded,locationExternalId,{executor,now});
  }else{
    const sourceInteraction=(loaded.source.interactions??[]).find(
      i=>i.externalId===interactionExternalId&&i.active!==false
    );

    if(!sourceInteraction||!isAutonomousLocationInteraction(sourceInteraction))
      throw new Error('LOCATION_ACTION_NOT_AUTONOMOUS');

    if(isLocationSearchInteraction(sourceInteraction)){
      result=await executeSystemLocationSearch(loaded,locationExternalId,{executor,now});
    }else{
      const gmOutcome=String(sourceInteraction.resolution).toUpperCase()==='GM'
        ? 'SUCCESS'
        : null;

      result=await interactionExecutor(
        loaded.session.id,
        {
          actorCharacterExternalId:actor,
          interactionExternalId,
          targetExternalId:locationExternalId,
          gmOutcome,
          note:sessionText(loaded.session,'Action QR joueur','Player QR action')
        }
      );
    }
  }
  const reward=result.success?await grantAutomaticLocationReward(loaded,locationExternalId,result.interactionExternalId,{clueReveal,objectTransfer}):{kind:'NONE',clue:null,object:null};

  const language=String(loaded.session?.language??'FR').trim().toUpperCase();
  const english=language==='EN';
  const physicalPickup=Boolean(
    reward?.object?.physicalPickupRequired &&
    reward?.object?.logisticsCode
  );

  let body;
  if(!result.success){
    body=english?'Action failed.':'Action échouée.';
  }else if(physicalPickup){
    const discovery=
      reward.kind==='CLUE_OBJECT'
        ? (english
            ? `You discover ${reward.clue.name}. `
            : `Vous découvrez ${reward.clue.name}. `)
        : '';

    body=
      discovery +
      (english
        ? `Physical prop to collect: ${reward.object.name}. Go to the Game Master (GM) now and show pickup code ${reward.object.logisticsCode} to receive the physical item.`
        : `Objet physique à récupérer : ${reward.object.name}. Allez maintenant voir le Maître du Jeu (GM) et montrez-lui le code ${reward.object.logisticsCode} pour recevoir l’objet.`);
  }else if(reward.kind==='CLUE_OBJECT'){
    body=english
      ? `You discover ${reward.clue.name} and receive ${reward.object.name}. The clue is saved in your Notebook and the item is now in your Bag.`
      : `Vous découvrez ${reward.clue.name} et récupérez ${reward.object.name}. L’indice est mémorisé dans votre Carnet et l’objet se trouve maintenant dans votre Sac.`;
  }else if(reward.kind==='CLUE'){
    body=english
      ? `You discover: ${reward.clue.name}. It is now in your Bag and Notebook.`
      : `Vous découvrez : ${reward.clue.name}. Il se trouve maintenant dans votre Sac et votre Carnet.`;
  }else if(reward.kind==='OBJECT'){
    body=english
      ? `You receive: ${reward.object.name}.`
      : `Vous récupérez : ${reward.object.name}.`;
  }else{
    body=english
      ? 'You find nothing new.'
      : 'Vous ne trouvez rien de nouveau.';
  }

  const notificationTitle=physicalPickup
    ? (english?'Collect your prop from the GM':'Objet à récupérer auprès du GM')
    : location.name;

  await executor(INSERT_NOTIFICATION_MUTATION,{data:{gameSessionId:loaded.session.id,characterExternalId:actor,kind:physicalPickup?'PHYSICAL_PICKUP':'LOCATION',title:notificationTitle,body,priority:physicalPickup?'IMPORTANT':'NORMAL',refExternalId:physicalPickup?reward.object.externalId:locationExternalId,createdAt:nowIso(now),readAt:null}});
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
  const result=await interactionExecutor(loaded.session.id,{actorCharacterExternalId:actor,interactionExternalId,targetExternalId:targetCharacterExternalId,note:sessionText(loaded.session,`Action joueur · scan ${scanMode??'DISCRET'}`,`Player action · ${scanMode??'DISCREET'} scan`)});
  const notifyTarget=async(body,title=sessionText(loaded.session,'Action sur votre personnage','Action targeting your character'))=>executor(INSERT_NOTIFICATION_MUTATION,{data:{gameSessionId:loaded.session.id,characterExternalId:targetCharacterExternalId,kind:'INTERACTION_TARGET',title,body,priority:'NORMAL',refExternalId:interactionExternalId,createdAt:nowIso(now),readAt:null}});
  if(!result.success){
    await notifyTarget(sessionText(
      loaded.session,
      `Une action « ${interaction.name} » a été tentée sur votre personnage, mais elle a échoué. Murder Engine ne révèle pas son auteur.`,
      `An action “${interaction.name}” was attempted on your character, but it failed. Murder Engine does not reveal who performed it.`
    ));
    return {kind,success:false,result,items:[],scanMode};
  }
  const items=clandestineVisibleObjects(loaded,targetCharacterExternalId);
  if(kind==='SEARCH_PLAYER'){
    await notifyTarget(sessionText(
      loaded.session,
      `Une action « ${interaction.name} » vient d’être exercée sur votre personnage. Elle a réussi. Murder Engine ne révèle pas son auteur.`,
      `An action “${interaction.name}” has just been used on your character. It succeeded. Murder Engine does not reveal who performed it.`
    ));
    return {kind,success:true,result,items,scanMode};
  }
  if(!items.length){
    await notifyTarget(sessionText(
      loaded.session,
      `Une action « ${interaction.name} » vient d’être exercée sur votre personnage, mais aucun objet n’a pu être pris. Murder Engine ne révèle pas son auteur.`,
      `An action “${interaction.name}” has just been used on your character, but no item could be taken. Murder Engine does not reveal who performed it.`
    ));
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
  for(const clue of linkedClues){await clueReveal(loaded.session.id,{characterExternalId:grant.targetCharacterExternalId,clueExternalId:clue.externalId,sourceRef:objectExternalId,note:sessionText(loaded.session,`Document possédé avant vol : ${def.name}`,`Document owned before theft: ${def.name}`)});}
  const usedAt=nowIso(nowDate);
  const notification={gameSessionId:loaded.session.id,characterExternalId:grant.targetCharacterExternalId,kind:'THEFT',title:sessionText(loaded.session,'Quelque chose vous manque…','Something is missing…'),body:sessionText(loaded.session,'Vous venez de constater qu’un objet a disparu de vos affaires. Murder Engine ne révèle pas l’auteur du vol.','You have just noticed that an item has disappeared from your belongings. Murder Engine does not reveal who took it.'),priority:'IMPORTANT',refExternalId:null,createdAt:usedAt,readAt:null};
  const log={gameSessionId:loaded.session.id,actionType:'OBJECT_STOLEN',characterExternalId:actor,refExternalId:objectExternalId,beforeValue:grant.targetCharacterExternalId,afterValue:actor,deltaValue:null,note:sessionText(loaded.session,`Vol clandestin réussi sur ${grant.targetCharacterExternalId}`,`Successful clandestine theft from ${grant.targetCharacterExternalId}`),createdAt:usedAt};
  await executor(CLAIM_STEAL_MUTATION,{sessionId:loaded.session.id,grantToken,objectExternalId,actorCharacterExternalId:actor,usedAt,notification,log});
  for(const clue of linkedClues){await clueReveal(loaded.session.id,{characterExternalId:actor,clueExternalId:clue.externalId,sourceRef:objectExternalId,note:sessionText(loaded.session,`Document volé : ${def.name}`,`Stolen document: ${def.name}`)});}
  return {stolen:true,object:{objectExternalId,name:def.name,description:def.description??null},targetCharacterExternalId:grant.targetCharacterExternalId};
}

export async function castPlayerVote(token,input,{reader=defaultReader,voteCaster=castSessionBallot}={}) {
  const loaded=await loadPlayerData(token,reader);return voteCaster(loaded.session.id,{voteExternalId:String(input?.voteExternalId??'').trim(),electorCharacterExternalId:loaded.participant.characterExternalId,selectedOptionExternalIds:Array.isArray(input?.selectedOptionExternalIds)?input.selectedOptionExternalIds:[],round:input?.round});
}

export const __playerOps={PLAYER_ACCESS_QUERY,PLAYER_SOURCE_QUERY,PLAYER_RUNTIME_QUERY,UPDATE_PLAYER_ACCESS_MUTATION,TRACK_PLAYER_OPEN_MUTATION,MARK_BRIEFING_READ_MUTATION,INSERT_NOTIFICATION_MUTATION,MARK_NOTIFICATION_READ_MUTATION,INSERT_PLAYER_ACTION_LOG_MUTATION,SYSTEM_LOCATION_SEARCH_MUTATION,INSERT_STEAL_GRANT_MUTATION,CLAIM_STEAL_MUTATION,TRANSFER_PLAYER_CASH_MUTATION};
