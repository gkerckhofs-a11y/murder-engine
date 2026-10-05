import {
  assertSessionIncarnationsFrozen,
  incarnationStatus,
  resolveSessionCharacter
} from './session-character-resolver.mjs';
const RUNTIME_SESSION_QUERY = `
query RuntimeSession($sessionId: UUID!) {
  gameSession(id: $sessionId) {
    id
    status
    runtimeInitializedAt
    runtimeVersion
    scenarioVersion { id runtimeDataVersion }
    sessionParticipants_on_gameSession(orderBy: {createdAt: ASC}) {
      id
      displayName
      active
      characterExternalId
      characterDisplayName
      characterGenderVariant
      characterSnapshotJson
      characterSnapshotAt
    }
  }
}
`;

const RUNTIME_SOURCE_QUERY = `
query RuntimeSource($versionId: UUID!) {
  resources(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId name scopeType unit defaultValue maxValue physicalMode isPublic active
  }
  resourceAssignments(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId ownerType ownerExternalId resourceExternalId initialValue maxOverride notes active
  }
  gameObjects(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId name support ownerInitialType ownerInitialExternalId initialCharges critical active
  }
  objectives(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId ownerType ownerExternalId title initialStatus active
  }
  initialKnowledges(where: {scenarioVersionId: {eq: $versionId}}) {
    characterExternalId factExternalId sourceType
  }
  gameStateDefinitions(where: {scenarioVersionId: {eq: $versionId}}) {
    externalId name defaultDurationSeconds visibleToHolder visiblePublic active
  }
}
`;

const RUNTIME_STATE_QUERY = `
query RuntimeState($sessionId: UUID!) {
  sessionCharacters(where: {gameSessionId: {eq: $sessionId}}) {
    characterExternalId participantId status active initializedAt
  }
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
}
`;

const INSERT_SESSION_CHARACTER_MUTATION = `
mutation InsertSessionCharacter($data: SessionCharacter_Data!) {
  sessionCharacter_insert(data: $data)
}
`;

const INSERT_SESSION_RESOURCE_MUTATION = `
mutation InsertSessionResource($data: SessionResource_Data!) {
  sessionResource_insert(data: $data)
}
`;

const INSERT_SESSION_KNOWLEDGE_MUTATION = `
mutation InsertSessionKnowledge($data: SessionKnowledge_Data!) {
  sessionKnowledge_insert(data: $data)
}
`;

const INSERT_SESSION_OBJECTIVE_MUTATION = `
mutation InsertSessionObjective($data: SessionObjective_Data!) {
  sessionObjective_insert(data: $data)
}
`;

const INSERT_SESSION_OBJECT_MUTATION = `
mutation InsertSessionObject($data: SessionObject_Data!) {
  sessionObject_insert(data: $data)
}
`;

const MARK_RUNTIME_INITIALIZED_MUTATION = `
mutation MarkRuntimeInitialized($sessionId: UUID!, $initializedAt: Timestamp!, $runtimeVersion: String!) {
  gameSession_update(id: $sessionId, data: { runtimeInitializedAt: $initializedAt, runtimeVersion: $runtimeVersion })
}
`;

async function getAdminDataConnect() {
  const [{ initializeApp, getApps }, { getDataConnect }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/data-connect'),
  ]);
  if (!getApps().length) initializeApp();
  return getDataConnect({ location: 'europe-west1', serviceId: 'murder-engine' });
}

async function defaultReader(operation, variables = undefined) {
  const dc = await getAdminDataConnect();
  const response = await dc.executeGraphqlRead(operation, variables ? { variables } : undefined);
  const errors = response?.errors ?? response?.data?.errors ?? [];
  if (Array.isArray(errors) && errors.length) {
    const error = new Error('DATACONNECT_RUNTIME_READ_FAILED');
    error.details = errors;
    throw error;
  }
  return response?.data ?? response;
}

async function defaultExecutor(operation, variables) {
  const dc = await getAdminDataConnect();
  const response = await dc.executeGraphql(operation, { variables });
  const errors = response?.errors ?? response?.data?.errors ?? [];
  if (Array.isArray(errors) && errors.length) {
    const error = new Error('DATACONNECT_RUNTIME_WRITE_FAILED');
    error.details = errors;
    throw error;
  }
  return response?.data ?? response;
}

function key(...parts) { return parts.map(x => String(x ?? '')).join('::'); }

export function buildRuntimePlan(session, source) {
  if (!session) throw new Error('SESSION_NOT_FOUND');
  if (session.status !== 'READY') throw new Error('SESSION_MUST_BE_READY');
  if (session.runtimeInitializedAt) throw new Error('RUNTIME_ALREADY_INITIALIZED');
  if (!['0.6','0.7','0.8','0.9'].includes(session.scenarioVersion?.runtimeDataVersion)) throw new Error('RUNTIME_SOURCE_NOT_READY');

  const participants = (session.sessionParticipants_on_gameSession ?? []).filter(p => p.active !== false);
  if (!participants.length) throw new Error('NO_ACTIVE_PARTICIPANTS');
  const uncast = participants.filter(p => !p.characterExternalId);
  if (uncast.length) throw new Error('CASTING_INCOMPLETE');

  assertSessionIncarnationsFrozen(session);

  const characters = participants.map(p => ({
    gameSessionId: session.id,
    participantId: p.id,
    characterExternalId: p.characterExternalId,
    status: 'READY',
    active: true,
  
  }));
  const castIds = new Set(characters.map(c => c.characterExternalId));

  const assignments = (source.resourceAssignments ?? []).filter(a => a.active !== false && a.ownerType === 'CHARACTER');
  const assignmentByOwnerResource = new Map(assignments.map(a => [key(a.ownerExternalId, a.resourceExternalId), a]));
  const resources = [];
  for (const character of characters) {
    for (const resource of (source.resources ?? []).filter(r => r.active !== false && r.scopeType === 'PLAYER')) {
      const assignment = assignmentByOwnerResource.get(key(character.characterExternalId, resource.externalId));
      const initialValue = assignment?.initialValue ?? resource.defaultValue;
      if (initialValue === null || initialValue === undefined) continue;
      resources.push({
        gameSessionId: session.id,
        characterExternalId: character.characterExternalId,
        resourceExternalId: resource.externalId,
        initialValue: Number(initialValue),
        currentValue: Number(initialValue),
        maxValue: assignment?.maxOverride ?? resource.maxValue ?? null,
      });
    }
  }

  const knowledge = (source.initialKnowledges ?? [])
    .filter(k => castIds.has(k.characterExternalId))
    .map(k => ({
      gameSessionId: session.id,
      characterExternalId: k.characterExternalId,
      factExternalId: k.factExternalId,
      sourceType: k.sourceType || 'INITIAL',
    }));

  const objectives = (source.objectives ?? [])
    .filter(o => o.active !== false && o.ownerType === 'CHARACTER' && castIds.has(o.ownerExternalId))
    .map(o => ({
      gameSessionId: session.id,
      characterExternalId: o.ownerExternalId,
      objectiveExternalId: o.externalId,
      status: o.initialStatus || 'ACTIVE',
      progress: 0,
      notes: null,
    }));

  const objects = (source.gameObjects ?? [])
    .filter(o => o.active !== false)
    .map(o => ({
      gameSessionId: session.id,
      objectExternalId: o.externalId,
      holderType: o.ownerInitialType || 'UNASSIGNED',
      holderExternalId: o.ownerInitialExternalId || null,
      charges: o.initialCharges ?? null,
      identificationLevel: 0,
      inPlay: true,
    }));

  return {
    characters,
    resources,
    knowledge,
    objectives,
    objects,
    stateDefinitions: (source.gameStateDefinitions ?? []).filter(s => s.active !== false),
  };
}

function existingKeys(runtime) {
  return {
    characters: new Set((runtime.sessionCharacters ?? []).map(r => key(r.characterExternalId))),
    resources: new Set((runtime.sessionResources ?? []).map(r => key(r.characterExternalId, r.resourceExternalId))),
    knowledge: new Set((runtime.sessionKnowledges ?? []).map(r => key(r.characterExternalId, r.factExternalId))),
    objectives: new Set((runtime.sessionObjectives ?? []).map(r => key(r.characterExternalId, r.objectiveExternalId))),
    objects: new Set((runtime.sessionObjects ?? []).map(r => key(r.objectExternalId))),
  };
}

async function insertRows(rows, operation, executor, keyFn, existingSet, concurrency = 8) {
  const missing = rows.filter(r => !existingSet.has(keyFn(r)));
  let cursor = 0;
  let count = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= missing.length) return;
      await executor(operation, { data: missing[i] });
      count += 1;
    }
  }
  await Promise.all(Array.from({length: Math.min(concurrency, Math.max(1, missing.length))}, () => worker()));
  return count;
}

export async function initializeSessionRuntime(sessionId, { reader = defaultReader, executor = defaultExecutor } = {}) {
  if (!sessionId) throw new Error('SESSION_ID_REQUIRED');
  const sessionData = await reader(RUNTIME_SESSION_QUERY, { sessionId });
  const session = sessionData?.gameSession ?? null;
  if (!session) throw new Error('SESSION_NOT_FOUND');
  if (session.runtimeInitializedAt) return { sessionId, alreadyInitialized: true, initializedAt: session.runtimeInitializedAt, runtimeVersion: session.runtimeVersion || '0.8' };

  const versionId = session.scenarioVersion?.id;
  if (!versionId) throw new Error('SCENARIO_VERSION_NOT_FOUND');
  const [source, runtime] = await Promise.all([
    reader(RUNTIME_SOURCE_QUERY, { versionId }),
    reader(RUNTIME_STATE_QUERY, { sessionId }),
  ]);
  const plan = buildRuntimePlan(session, source ?? {});
  const existing = existingKeys(runtime ?? {});

  const inserted = {};
  inserted.characters = await insertRows(plan.characters, INSERT_SESSION_CHARACTER_MUTATION, executor, r => key(r.characterExternalId), existing.characters);
  inserted.resources = await insertRows(plan.resources, INSERT_SESSION_RESOURCE_MUTATION, executor, r => key(r.characterExternalId, r.resourceExternalId), existing.resources);
  inserted.knowledge = await insertRows(plan.knowledge, INSERT_SESSION_KNOWLEDGE_MUTATION, executor, r => key(r.characterExternalId, r.factExternalId), existing.knowledge);
  inserted.objectives = await insertRows(plan.objectives, INSERT_SESSION_OBJECTIVE_MUTATION, executor, r => key(r.characterExternalId, r.objectiveExternalId), existing.objectives);
  inserted.objects = await insertRows(plan.objects, INSERT_SESSION_OBJECT_MUTATION, executor, r => key(r.objectExternalId), existing.objects);

  const initializedAt = new Date().toISOString();
  await executor(MARK_RUNTIME_INITIALIZED_MUTATION, { sessionId, initializedAt, runtimeVersion: '0.8' });

  return {
    sessionId,
    alreadyInitialized: false,
    initializedAt,
    runtimeVersion: '0.8',
    inserted,
    source: {
      states: plan.stateDefinitions.length,
      resources: (source?.resources ?? []).length,
      objects: (source?.gameObjects ?? []).length,
    },
  };
}

export function shapeRuntimeState(runtime, participants = []) {
  const participantByCharacter = new Map((participants ?? []).filter(p => p.characterExternalId).map(p => [p.characterExternalId, p]));
  const resourcesByCharacter = new Map();
  const objectiveCount = new Map();
  const knowledgeCount = new Map();
  const statesByCharacter = new Map();
  const objectsByCharacter = new Map();

  for (const row of runtime?.sessionResources ?? []) {
    if (!resourcesByCharacter.has(row.characterExternalId)) resourcesByCharacter.set(row.characterExternalId, []);
    resourcesByCharacter.get(row.characterExternalId).push(row);
  }
  for (const row of runtime?.sessionObjectives ?? []) objectiveCount.set(row.characterExternalId, (objectiveCount.get(row.characterExternalId) ?? 0) + 1);
  for (const row of runtime?.sessionKnowledges ?? []) knowledgeCount.set(row.characterExternalId, (knowledgeCount.get(row.characterExternalId) ?? 0) + 1);
  for (const row of runtime?.sessionCharacterStates ?? []) if (row.active !== false) {
    if (!statesByCharacter.has(row.characterExternalId)) statesByCharacter.set(row.characterExternalId, []);
    statesByCharacter.get(row.characterExternalId).push(row);
  }
  for (const row of runtime?.sessionObjects ?? []) if (row.inPlay !== false && row.holderType === 'CHARACTER' && row.holderExternalId) {
    if (!objectsByCharacter.has(row.holderExternalId)) objectsByCharacter.set(row.holderExternalId, []);
    objectsByCharacter.get(row.holderExternalId).push(row);
  }

  const characters = (runtime?.sessionCharacters ?? []).filter(c => c.active !== false).map(c => ({
    characterExternalId: c.characterExternalId,
    participantId: c.participantId,
    participantName: participantByCharacter.get(c.characterExternalId)?.displayName ?? null,
    status: c.status,
    resources: resourcesByCharacter.get(c.characterExternalId) ?? [],
    objectiveCount: objectiveCount.get(c.characterExternalId) ?? 0,
    knowledgeCount: knowledgeCount.get(c.characterExternalId) ?? 0,
    states: statesByCharacter.get(c.characterExternalId) ?? [],
    objectCount: (objectsByCharacter.get(c.characterExternalId) ?? []).length,
  }));

  return {
    characters,
    counts: {
      characters: characters.length,
      resources: (runtime?.sessionResources ?? []).length,
      knowledge: (runtime?.sessionKnowledges ?? []).length,
      objectives: (runtime?.sessionObjectives ?? []).length,
      objects: (runtime?.sessionObjects ?? []).length,
      activeStates: (runtime?.sessionCharacterStates ?? []).filter(s => s.active !== false).length,
    },
  };
}

export async function getSessionRuntime(sessionId, { reader = defaultReader } = {}) {
  if (!sessionId) throw new Error('SESSION_ID_REQUIRED');

  const [sessionData, runtime] = await Promise.all([
    reader(RUNTIME_SESSION_QUERY, { sessionId }),
    reader(RUNTIME_STATE_QUERY, { sessionId }),
  ]);

  const session = sessionData?.gameSession;
  if (!session) throw new Error('SESSION_NOT_FOUND');

  const participants =
    session.sessionParticipants_on_gameSession ?? [];

  const participantByCharacter =
    new Map(
      participants
        .filter(p => p.characterExternalId)
        .map(p => [p.characterExternalId, p])
    );

  const shaped =
    shapeRuntimeState(runtime ?? {}, participants);

  const characters =
    (shaped.characters ?? []).map(row => {
      const participant =
        participantByCharacter.get(
          row.characterExternalId
        );

      let snapshot = null;

      if (participant?.characterSnapshotJson) {
        try {
          snapshot =
            JSON.parse(
              participant.characterSnapshotJson
            );
        } catch {}
      }

      return {
        ...row,

        characterName:
          participant?.characterDisplayName ||
          snapshot?.character?.name ||
          row.characterName ||
          row.characterExternalId,

        publicRole:
          snapshot?.character?.publicRole ||
          row.publicRole ||
          null,
      };
    });

  return {
    initialized:
      Boolean(session.runtimeInitializedAt),

    initializedAt:
      session.runtimeInitializedAt ?? null,

    runtimeVersion:
      session.runtimeVersion ?? null,

    sourceReady:
      ['0.6','0.7','0.8','0.9']
        .includes(
          session.scenarioVersion?.runtimeDataVersion
        ),

    ...shaped,
    characters,
  };
}

export const __runtimeOps = {
  RUNTIME_SESSION_QUERY,
  RUNTIME_SOURCE_QUERY,
  RUNTIME_STATE_QUERY,
  INSERT_SESSION_CHARACTER_MUTATION,
  INSERT_SESSION_RESOURCE_MUTATION,
  INSERT_SESSION_KNOWLEDGE_MUTATION,
  INSERT_SESSION_OBJECTIVE_MUTATION,
  INSERT_SESSION_OBJECT_MUTATION,
  MARK_RUNTIME_INITIALIZED_MUTATION,
};
