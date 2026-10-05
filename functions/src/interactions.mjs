import {
  resolveSessionCharacter
} from './session-character-resolver.mjs';
import { randomInt } from 'node:crypto';

export const INTERACTION_SESSION_QUERY = `
query InteractionSession($sessionId: UUID!) {
  gameSession(id: $sessionId) {
    id status runtimeInitializedAt runtimeVersion
    scenarioVersion { id runtimeDataVersion }
    sessionParticipants_on_gameSession(orderBy: {createdAt: ASC}) {
      id displayName active characterExternalId
      characterDisplayName
      characterGenderVariant
      characterSnapshotJson
      characterSnapshotAt
    }
  }
}
`;

export const INTERACTION_SOURCE_QUERY = `
query InteractionSource($versionId: UUID!) {
  abilities(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId name description category defaultLevel defaultMaxUses defaultCooldownMinutes secret active
  }
  abilityAssignments(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId ownerType ownerExternalId abilityExternalId level flatBonus usesOverride cooldownOverrideMinutes active
  }
  interactions(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId name category targetType scanMode abilityExternalId actorScope targetScope
    costResourceExternalId costValue costTiming resolution diceCount diceSides abilityLevelMultiplier flatBonus difficulty
    opposedAbilityExternalId tieRule validation maxUses limitPerTarget cooldownMinutes targetSecret active
  }
  gameLocations(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId name description qrCode permanent lockExternalId active
  }
  gameObjects(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId name description transferable stealable consumable critical active
  }
  clues(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId playerName clueType playerText gmInterpretation locationExternalId objectExternalId documentExternalId
    shareable transferable consumable major logisticsCode active
  }
  clueFacts(where: {scenarioVersionId: {eq: $versionId}}) { clueExternalId factExternalId }
  characters(where: {scenarioVersionId: {eq: $versionId}}) { externalId name publicRole active }
}
`;

export const INTERACTION_RUNTIME_QUERY = `
query InteractionRuntime($sessionId: UUID!) {
  sessionResources(where: {gameSessionId: {eq: $sessionId}}) {
    characterExternalId resourceExternalId initialValue currentValue maxValue updatedAt
  }
  sessionObjects(where: {gameSessionId: {eq: $sessionId}}) {
    objectExternalId holderType holderExternalId charges identificationLevel inPlay updatedAt
  }
  sessionInteractionUses(where: {gameSessionId: {eq: $sessionId}}, orderBy: {createdAt: DESC}, limit: 500) {
    id interactionExternalId actorCharacterExternalId targetType targetExternalId resolution success abilityLevel
    actorRollJson targetRollJson costResourceExternalId costValue note createdAt
  }
  sessionClueDiscoveries(where: {gameSessionId: {eq: $sessionId}}) {
    characterExternalId clueExternalId sourceInteractionExternalId sourceRef discoveredAt
  }
  sessionKnowledges(where: {gameSessionId: {eq: $sessionId}}) {
    characterExternalId factExternalId sourceType learnedAt
  }
}
`;

const EXECUTE_WITH_COST_MUTATION = `
mutation ExecuteInteractionWithCost(
  $sessionId: UUID!, $characterExternalId: String!, $resourceExternalId: String!, $currentValue: Int!, $updatedAt: Timestamp!,
  $use: SessionInteractionUse_Data!, $log: SessionActionLog_Data!
) @transaction {
  sessionResource_update(
    key: {gameSessionId: $sessionId, characterExternalId: $characterExternalId, resourceExternalId: $resourceExternalId}
    data: {currentValue: $currentValue, updatedAt: $updatedAt}
  )
  sessionInteractionUse_insert(data: $use)
  sessionActionLog_insert(data: $log)
}
`;

const EXECUTE_NO_COST_MUTATION = `
mutation ExecuteInteractionNoCost($use: SessionInteractionUse_Data!, $log: SessionActionLog_Data!) @transaction {
  sessionInteractionUse_insert(data: $use)
  sessionActionLog_insert(data: $log)
}
`;

const REVEAL_CLUE_MUTATION = `
mutation RevealClue($discovery: SessionClueDiscovery_Data!, $knowledge: [SessionKnowledge_Data!]!, $log: SessionActionLog_Data!) @transaction {
  sessionClueDiscovery_insert(data: $discovery)
  sessionKnowledge_insertMany(data: $knowledge)
  sessionActionLog_insert(data: $log)
}
`;


const REVEAL_CLUE_NO_KNOWLEDGE_MUTATION = `
mutation RevealClueNoKnowledge($discovery: SessionClueDiscovery_Data!, $log: SessionActionLog_Data!) @transaction {
  sessionClueDiscovery_insert(data: $discovery)
  sessionActionLog_insert(data: $log)
}
`;

const TRANSFER_OBJECT_MUTATION = `
mutation TransferObject(
  $sessionId: UUID!, $objectExternalId: String!, $holderType: String!, $holderExternalId: String, $updatedAt: Timestamp!,
  $log: SessionActionLog_Data!
) @transaction {
  sessionObject_update(
    key: {gameSessionId: $sessionId, objectExternalId: $objectExternalId}
    data: {holderType: $holderType, holderExternalId: $holderExternalId, updatedAt: $updatedAt}
  )
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
  if (errors.length) { const e = new Error('DATACONNECT_INTERACTION_READ_FAILED'); e.details = errors; throw e; }
  return response?.data ?? response;
}
async function defaultExecutor(operation, variables) {
  const dc = await getAdminDataConnect();
  const response = await dc.executeGraphql(operation, { variables });
  const errors = response?.errors ?? response?.data?.errors ?? [];
  if (errors.length) { const e = new Error('DATACONNECT_INTERACTION_WRITE_FAILED'); e.details = errors; throw e; }
  return response?.data ?? response;
}

export function rollDice(count, sides, roller = s => randomInt(1, s + 1)) {
  const c = Number(count ?? 0), s = Number(sides ?? 0);
  if (!Number.isInteger(c) || !Number.isInteger(s) || c < 0 || c > 20 || (c > 0 && (s < 2 || s > 1000))) throw new Error('INVALID_DICE_CONFIGURATION');
  const rolls = Array.from({ length: c }, () => roller(s));
  return { count: c, sides: s, rolls, sum: rolls.reduce((a,b)=>a+b,0) };
}

export function resolveInteractionOutcome(interaction, actorAbility, targetAbility, { gmOutcome, roller } = {}) {
  const resolution = String(interaction.resolution ?? 'GM').toUpperCase();
  const actorLevel = Number(actorAbility?.level ?? 0);
  const actorAssignmentBonus = Number(actorAbility?.flatBonus ?? 0);
  const multiplier = Number(interaction.abilityLevelMultiplier ?? 1);
  const flat = Number(interaction.flatBonus ?? 0) + actorAssignmentBonus;
  if (resolution === 'GM') {
    const normalized = String(gmOutcome ?? '').toUpperCase();
    if (!['SUCCESS','FAILURE'].includes(normalized)) throw new Error('GM_OUTCOME_REQUIRED');
    return { success: normalized === 'SUCCESS', resolution, actorLevel, actorRoll: null, targetRoll: null, actorTotal: null, targetTotal: null };
  }
  if (resolution === 'AUTO') return { success:true, resolution, actorLevel, actorRoll:null, targetRoll:null, actorTotal:null, targetTotal:null };
  const actorRoll = rollDice(interaction.diceCount ?? 0, interaction.diceSides ?? 0, roller);
  const actorTotal = actorRoll.sum + actorLevel * multiplier + flat;
  if (resolution === 'DICE') {
    const difficulty = Number(interaction.difficulty ?? 0);
    return { success: actorTotal >= difficulty, resolution, actorLevel, actorRoll, targetRoll:null, actorTotal, targetTotal:difficulty };
  }
  if (resolution === 'OPPOSED') {
    const targetLevel = Number(targetAbility?.level ?? 0);
    const targetBonus = Number(targetAbility?.flatBonus ?? 0);
    const targetRoll = rollDice(interaction.diceCount ?? 0, interaction.diceSides ?? 0, roller);
    const targetTotal = targetRoll.sum + targetLevel * multiplier + targetBonus;
    let success;
    if (actorTotal > targetTotal) success = true;
    else if (actorTotal < targetTotal) success = false;
    else {
      const tie = String(interaction.tieRule ?? 'DEFENDER').toUpperCase();
      if (tie === 'ATTACKER') success = true;
      else if (tie === 'DEFENDER') success = false;
      else throw new Error('OPPOSED_TIE_REQUIRES_GM');
    }
    return { success, resolution, actorLevel, actorRoll, targetRoll, actorTotal, targetTotal };
  }
  throw new Error('UNSUPPORTED_INTERACTION_RESOLUTION');
}

function effectiveAbility(source, characterExternalId, abilityExternalId) {
  if (!abilityExternalId) return null;
  const def = (source.abilities ?? []).find(a => a.externalId === abilityExternalId && a.active !== false);
  const assignment = (source.abilityAssignments ?? []).find(a => a.ownerType === 'CHARACTER' && a.ownerExternalId === characterExternalId && a.abilityExternalId === abilityExternalId && a.active !== false);
  if (!def || !assignment) return null;
  return {
    externalId: abilityExternalId,
    name: def.name,
    description: def.description,
    level: Number(assignment.level ?? def.defaultLevel ?? 0),
    flatBonus: Number(assignment.flatBonus ?? 0),
    maxUses: assignment.usesOverride ?? def.defaultMaxUses ?? null,
    cooldownMinutes: assignment.cooldownOverrideMinutes ?? def.defaultCooldownMinutes ?? null,
  };
}

function participantByCharacter(session, characterExternalId) {
  return (session.sessionParticipants_on_gameSession ?? []).find(p => p.active !== false && p.characterExternalId === characterExternalId) ?? null;
}

function validateTarget(source, session, targetType, targetExternalId) {
  const type = String(targetType ?? 'NONE').toUpperCase();
  if (type === 'NONE') return null;
  if (!targetExternalId) throw new Error('INTERACTION_TARGET_REQUIRED');
  if (['PLAYER','CHARACTER'].includes(type)) {
    if (!participantByCharacter(session, targetExternalId)) throw new Error('TARGET_CHARACTER_NOT_IN_SESSION');
  } else if (type === 'LOCATION') {
    if (!(source.gameLocations ?? []).some(x => x.externalId === targetExternalId && x.active !== false)) throw new Error('TARGET_LOCATION_NOT_FOUND');
  } else if (type === 'OBJECT') {
    if (!(source.gameObjects ?? []).some(x => x.externalId === targetExternalId && x.active !== false)) throw new Error('TARGET_OBJECT_NOT_FOUND');
  }
  return targetExternalId;
}

function limitConfig(interaction, ability) {
  return {
    maxUses: interaction.maxUses ?? ability?.maxUses ?? null,
    cooldownMinutes: interaction.cooldownMinutes ?? ability?.cooldownMinutes ?? null,
    limitPerTarget: interaction.limitPerTarget ?? null,
  };
}

function assertUsageAllowed(history, actorExternalId, interaction, targetExternalId, ability, now) {
  const uses = (history ?? []).filter(u => u.actorCharacterExternalId === actorExternalId && u.interactionExternalId === interaction.externalId);
  const limits = limitConfig(interaction, ability);
  if (limits.maxUses != null && uses.length >= Number(limits.maxUses)) throw new Error('INTERACTION_MAX_USES_REACHED');
  if (limits.limitPerTarget != null && targetExternalId) {
    const sameTarget = uses.filter(u => u.targetExternalId === targetExternalId).length;
    if (sameTarget >= Number(limits.limitPerTarget)) throw new Error('INTERACTION_TARGET_LIMIT_REACHED');
  }
  if (limits.cooldownMinutes != null && Number(limits.cooldownMinutes) > 0 && uses.length) {
    const latest = Math.max(...uses.map(u => new Date(u.createdAt).getTime()).filter(Number.isFinite));
    const remainingMs = Number(limits.cooldownMinutes) * 60000 - (now.getTime() - latest);
    if (remainingMs > 0) { const e = new Error('INTERACTION_COOLDOWN_ACTIVE'); e.remainingSeconds = Math.ceil(remainingMs / 1000); throw e; }
  }
  return limits;
}

async function loadInteractionData(sessionId, reader) {
  const sessionData = await reader(INTERACTION_SESSION_QUERY, { sessionId });
  const session = sessionData?.gameSession;
  if (!session) throw new Error('SESSION_NOT_FOUND');
  if (!session.runtimeInitializedAt) throw new Error('RUNTIME_NOT_INITIALIZED');
  const versionId = session.scenarioVersion?.id;
  const [source, runtime] = await Promise.all([
    reader(INTERACTION_SOURCE_QUERY, { versionId }),
    reader(INTERACTION_RUNTIME_QUERY, { sessionId }),
  ]);
  return { session, source: source ?? {}, runtime: runtime ?? {} };
}

export function shapeInteractionDashboard(session, source, runtime, now = new Date()) {
  const characterDefs = new Map((source.characters ?? []).map(c => [c.externalId, c]));
  const participants = (session.sessionParticipants_on_gameSession ?? []).filter(p => p.active !== false && p.characterExternalId);
  const resourceMap = new Map();
  for (const r of runtime.sessionResources ?? []) resourceMap.set(`${r.characterExternalId
  }|${r.resourceExternalId}`, r);
  const actors = participants.map(p => {
    const abilities = (source.abilityAssignments ?? [])
      .filter(a => a.ownerType === 'CHARACTER' && a.ownerExternalId === p.characterExternalId && a.active !== false)
      .map(a => effectiveAbility(source, p.characterExternalId, a.abilityExternalId)).filter(Boolean);
    const interactions = (source.interactions ?? []).filter(i => i.active !== false && (!i.abilityExternalId || abilities.some(a => a.externalId === i.abilityExternalId))).map(i => {
      const ability = i.abilityExternalId ? abilities.find(a => a.externalId === i.abilityExternalId) : null;
      const uses = (runtime.sessionInteractionUses ?? []).filter(u => u.actorCharacterExternalId === p.characterExternalId && u.interactionExternalId === i.externalId);
      const limits = limitConfig(i, ability);
      let cooldownRemainingSeconds = 0;
      if (limits.cooldownMinutes && uses.length) {
        const latest = Math.max(...uses.map(u => new Date(u.createdAt).getTime()).filter(Number.isFinite));
        cooldownRemainingSeconds = Math.max(0, Math.ceil((Number(limits.cooldownMinutes)*60000 - (now.getTime()-latest))/1000));
      }
      const costResource = i.costResourceExternalId ? resourceMap.get(`${p.characterExternalId}|${i.costResourceExternalId}`) : null;
      return { ...i, ability, usesCount: uses.length, maxUses: limits.maxUses, cooldownMinutes: limits.cooldownMinutes, cooldownRemainingSeconds, currentCostResourceValue: costResource?.currentValue ?? null };
    });
    const def = characterDefs.get(p.characterExternalId);
    const resolvedCharacter=
      resolveSessionCharacter(p,def);

    return {
      characterExternalId:p.characterExternalId,
      participantId:p.id,
      participantName:p.displayName,
      characterName:resolvedCharacter.name,
      publicRole:resolvedCharacter.publicRole,
      abilities,
      interactions
    };
  });
  const objectDefs = new Map((source.gameObjects ?? []).map(o => [o.externalId,o]));
  const objects = (runtime.sessionObjects ?? []).filter(o=>o.inPlay!==false).map(o=>({ ...o, ...(objectDefs.get(o.objectExternalId) ?? {name:o.objectExternalId}) }));
  const discovered = new Set((runtime.sessionClueDiscoveries ?? []).map(d=>`${d.characterExternalId}|${d.clueExternalId}`));
  const clues = (source.clues ?? []).filter(c=>c.active!==false).map(c=>({ ...c, discoveredBy: actors.filter(a=>discovered.has(`${a.characterExternalId}|${c.externalId}`)).map(a=>a.characterExternalId) }));
  return {
    sourceReady: session.scenarioVersion?.runtimeDataVersion === '0.8' || session.scenarioVersion?.runtimeDataVersion === '0.9',
    actors,
    locations:(source.gameLocations ?? []).filter(x=>x.active!==false),
    objects,
    clues,
    uses:(runtime.sessionInteractionUses ?? []).slice(0,50),
    discoveries:runtime.sessionClueDiscoveries ?? [],
  };
}

export async function getInteractionDashboard(sessionId, { reader=defaultReader, now=new Date() }={}) {
  if (!sessionId) throw new Error('SESSION_ID_REQUIRED');
  const { session, source, runtime } = await loadInteractionData(sessionId, reader);
  return shapeInteractionDashboard(session, source, runtime, now);
}

export async function executeInteraction(sessionId, input, { reader=defaultReader, executor=defaultExecutor, now=new Date(), roller }={}) {
  if (!sessionId) throw new Error('SESSION_ID_REQUIRED');
  const { session, source, runtime } = await loadInteractionData(sessionId, reader);
  if (!['LIVE','PAUSED'].includes(session.status)) throw new Error('SESSION_NOT_RUNNING');
  if (session.scenarioVersion?.runtimeDataVersion !== '0.8' && session.scenarioVersion?.runtimeDataVersion !== '0.9') throw new Error('INTERACTION_SOURCE_NOT_READY');
  const actorCharacterExternalId = String(input?.actorCharacterExternalId ?? '').trim();
  const interactionExternalId = String(input?.interactionExternalId ?? '').trim();
  if (!participantByCharacter(session, actorCharacterExternalId)) throw new Error('ACTOR_NOT_IN_SESSION');
  const interaction = (source.interactions ?? []).find(i=>i.externalId===interactionExternalId && i.active!==false);
  if (!interaction) throw new Error('INTERACTION_NOT_FOUND');
  const actorAbility = effectiveAbility(source, actorCharacterExternalId, interaction.abilityExternalId);
  if (interaction.actorScope === 'ABILITY_HOLDER' && interaction.abilityExternalId && !actorAbility) throw new Error('ABILITY_NOT_ASSIGNED');
  const targetExternalId = validateTarget(source, session, interaction.targetType, String(input?.targetExternalId ?? '').trim() || null);
  const targetAbility = ['PLAYER','CHARACTER'].includes(String(interaction.targetType).toUpperCase()) && targetExternalId && interaction.opposedAbilityExternalId ? effectiveAbility(source,targetExternalId,interaction.opposedAbilityExternalId) : null;
  assertUsageAllowed(runtime.sessionInteractionUses, actorCharacterExternalId, interaction, targetExternalId, actorAbility, now);
  const outcome = resolveInteractionOutcome(interaction, actorAbility, targetAbility, { gmOutcome:input?.gmOutcome, roller });
  const cost = Number(interaction.costValue ?? 0);
  const shouldCharge = cost > 0 && interaction.costResourceExternalId && (String(interaction.costTiming ?? 'BEFORE').toUpperCase() === 'BEFORE' || outcome.success);
  let resourceRow = null, resourceAfter = null;
  if (shouldCharge) {
    resourceRow = (runtime.sessionResources ?? []).find(r=>r.characterExternalId===actorCharacterExternalId&&r.resourceExternalId===interaction.costResourceExternalId);
    if (!resourceRow) throw new Error('INTERACTION_COST_RESOURCE_NOT_FOUND');
    if (Number(resourceRow.currentValue ?? 0) < cost) throw new Error('INTERACTION_INSUFFICIENT_RESOURCE');
    resourceAfter = Number(resourceRow.currentValue) - cost;
  }
  const createdAt = now.toISOString();
  const use = {
    gameSessionId:sessionId, interactionExternalId, actorCharacterExternalId, targetType:interaction.targetType,
    targetExternalId, resolution:outcome.resolution, success:outcome.success, abilityLevel:outcome.actorLevel,
    actorRollJson: outcome.actorRoll ? JSON.stringify({ ...outcome.actorRoll, total:outcome.actorTotal }) : null,
    targetRollJson: outcome.targetRoll ? JSON.stringify({ ...outcome.targetRoll, total:outcome.targetTotal }) : null,
    costResourceExternalId: shouldCharge ? interaction.costResourceExternalId : null,
    costValue: shouldCharge ? cost : 0,
    note:String(input?.note ?? '').trim() || null,
    createdAt,
  };
  const log = {
    gameSessionId:sessionId, actionType:'INTERACTION_EXECUTE', characterExternalId:actorCharacterExternalId,
    refExternalId:interactionExternalId, beforeValue:null, afterValue:outcome.success?'SUCCESS':'FAILURE', deltaValue:shouldCharge?-cost:null,
    note:`${interaction.name}${targetExternalId?` → ${targetExternalId}`:''}${input?.note?` · ${String(input.note).trim()}`:''}`,
    createdAt,
  };
  if (shouldCharge) await executor(EXECUTE_WITH_COST_MUTATION,{sessionId,characterExternalId:actorCharacterExternalId,resourceExternalId:interaction.costResourceExternalId,currentValue:resourceAfter,updatedAt:createdAt,use,log});
  else await executor(EXECUTE_NO_COST_MUTATION,{use,log});
  return {
    interactionExternalId, interactionName:interaction.name, actorCharacterExternalId, targetType:interaction.targetType,targetExternalId,scanMode:interaction.scanMode??null,
    success:outcome.success,resolution:outcome.resolution,actorRoll:outcome.actorRoll,targetRoll:outcome.targetRoll,actorTotal:outcome.actorTotal,targetTotal:outcome.targetTotal,
    abilityLevel:outcome.actorLevel,cost:shouldCharge?{resourceExternalId:interaction.costResourceExternalId,value:cost,remaining:resourceAfter}:null,
  };
}

export async function revealClueToCharacter(sessionId, input, { reader=defaultReader, executor=defaultExecutor, now=new Date() }={}) {
  const { session, source, runtime } = await loadInteractionData(sessionId, reader);
  if (!['LIVE','PAUSED'].includes(session.status)) throw new Error('SESSION_NOT_RUNNING');
  const characterExternalId=String(input?.characterExternalId??'').trim();
  const clueExternalId=String(input?.clueExternalId??'').trim();
  if (!participantByCharacter(session,characterExternalId)) throw new Error('TARGET_CHARACTER_NOT_IN_SESSION');
  const clue=(source.clues??[]).find(c=>c.externalId===clueExternalId&&c.active!==false);
  if (!clue) throw new Error('CLUE_NOT_FOUND');
  const already=(runtime.sessionClueDiscoveries??[]).some(d=>d.characterExternalId===characterExternalId&&d.clueExternalId===clueExternalId);
  if (already) return {alreadyDiscovered:true,characterExternalId,clueExternalId,factsAdded:0};
  const existingKnowledge=new Set((runtime.sessionKnowledges??[]).filter(k=>k.characterExternalId===characterExternalId).map(k=>k.factExternalId));
  const factIds=(source.clueFacts??[]).filter(cf=>cf.clueExternalId===clueExternalId).map(cf=>cf.factExternalId).filter(id=>!existingKnowledge.has(id));
  const discoveredAt=now.toISOString();
  const discovery={gameSessionId:sessionId,characterExternalId,clueExternalId,sourceInteractionExternalId:String(input?.sourceInteractionExternalId??'').trim()||null,sourceRef:String(input?.sourceRef??'').trim()||null,discoveredAt};
  const knowledge=factIds.map(factExternalId=>({gameSessionId:sessionId,characterExternalId,factExternalId,sourceType:'CLUE',learnedAt:discoveredAt}));
  const log={gameSessionId:sessionId,actionType:'CLUE_REVEAL',characterExternalId,refExternalId:clueExternalId,beforeValue:null,afterValue:'DISCOVERED',deltaValue:null,note:String(input?.note??'').trim()||clue.playerName,createdAt:discoveredAt};
  if (knowledge.length) await executor(REVEAL_CLUE_MUTATION,{discovery,knowledge,log});
  else await executor(REVEAL_CLUE_NO_KNOWLEDGE_MUTATION,{discovery,log});
  return {alreadyDiscovered:false,characterExternalId,clueExternalId,factsAdded:knowledge.length};
}

export async function transferSessionObject(sessionId, input, { reader=defaultReader, executor=defaultExecutor, now=new Date() }={}) {
  const { session, source, runtime } = await loadInteractionData(sessionId, reader);
  if (!['LIVE','PAUSED'].includes(session.status)) throw new Error('SESSION_NOT_RUNNING');
  const objectExternalId=String(input?.objectExternalId??'').trim();
  const holderType=String(input?.holderType??'').trim().toUpperCase();
  const holderExternalId=String(input?.holderExternalId??'').trim()||null;
  const row=(runtime.sessionObjects??[]).find(o=>o.objectExternalId===objectExternalId&&o.inPlay!==false);
  const def=(source.gameObjects??[]).find(o=>o.externalId===objectExternalId&&o.active!==false);
  if (!row||!def) throw new Error('SESSION_OBJECT_NOT_FOUND');
  if (!def.transferable && !input?.force) throw new Error('OBJECT_NOT_TRANSFERABLE');
  if (holderType==='CHARACTER'&&!participantByCharacter(session,holderExternalId)) throw new Error('OBJECT_TARGET_CHARACTER_NOT_FOUND');
  if (holderType==='LOCATION'&&!(source.gameLocations??[]).some(l=>l.externalId===holderExternalId&&l.active!==false)) throw new Error('OBJECT_TARGET_LOCATION_NOT_FOUND');
  if (!['CHARACTER','LOCATION','WORLD','NONE'].includes(holderType)) throw new Error('INVALID_OBJECT_HOLDER_TYPE');
  const before=`${row.holderType}:${row.holderExternalId??''}`; const after=`${holderType}:${holderExternalId??''}`; const updatedAt=now.toISOString();
  const log={gameSessionId:sessionId,actionType:'OBJECT_TRANSFER',characterExternalId:holderType==='CHARACTER'?holderExternalId:null,refExternalId:objectExternalId,beforeValue:before,afterValue:after,deltaValue:null,note:String(input?.note??'').trim()||null,createdAt:updatedAt};
  await executor(TRANSFER_OBJECT_MUTATION,{sessionId,objectExternalId,holderType,holderExternalId,updatedAt,log});
  return {objectExternalId,before,after,holderType,holderExternalId};
}

export const __interactionOps={INTERACTION_SESSION_QUERY,INTERACTION_SOURCE_QUERY,INTERACTION_RUNTIME_QUERY,EXECUTE_WITH_COST_MUTATION,EXECUTE_NO_COST_MUTATION,REVEAL_CLUE_MUTATION,REVEAL_CLUE_NO_KNOWLEDGE_MUTATION,TRANSFER_OBJECT_MUTATION};
