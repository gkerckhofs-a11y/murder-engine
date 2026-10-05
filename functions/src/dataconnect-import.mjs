export const IMPORT_PREFLIGHT_QUERY = `
query ImportPreflight($organizationId: UUID!, $scenarioId: UUID!, $scenarioVersionId: UUID!) {
  organization(id: $organizationId) { id }
  scenario(id: $scenarioId) { id }
  scenarioVersion(id: $scenarioVersionId) {
    id
    runtimeDataVersion
    skinId
    accentColor
    logoMediaExternalId
    backgroundMediaExternalId
  }
}
`;

export const EXISTING_ENRICHMENT_QUERY = `
query ExistingEnrichment($scenarioVersionId: UUID!) {
  objectives(where: {scenarioVersionId: {eq: $scenarioVersionId}}) { externalId }
  relationships(where: {scenarioVersionId: {eq: $scenarioVersionId}}) { externalId }
  documentDefinitions(where: {scenarioVersionId: {eq: $scenarioVersionId}}) { externalId }
  mediaAssets(where: {scenarioVersionId: {eq: $scenarioVersionId}}) { externalId }
  skinVisualDefinitions(where: {scenarioVersionId: {eq: $scenarioVersionId}}) { externalId }
  gameObjects(where: {scenarioVersionId: {eq: $scenarioVersionId}}) { externalId }
  resources(where: {scenarioVersionId: {eq: $scenarioVersionId}}) { externalId }
  resourceAssignments(where: {scenarioVersionId: {eq: $scenarioVersionId}}) { externalId }
  gameStateDefinitions(where: {scenarioVersionId: {eq: $scenarioVersionId}}) { externalId }
  abilities(where: {scenarioVersionId: {eq: $scenarioVersionId}}) { externalId }
  abilityAssignments(where: {scenarioVersionId: {eq: $scenarioVersionId}}) { externalId }
  interactions(where: {scenarioVersionId: {eq: $scenarioVersionId}}) { externalId }
  gameLocations(where: {scenarioVersionId: {eq: $scenarioVersionId}}) { externalId }
  gamePhaseDefinitions(where: {scenarioVersionId: {eq: $scenarioVersionId}}) { externalId }
  gameEventDefinitions(where: {scenarioVersionId: {eq: $scenarioVersionId}}) { externalId }
  voteDefinitions(where: {scenarioVersionId: {eq: $scenarioVersionId}}) { externalId }
  voteOptionDefinitions(where: {scenarioVersionId: {eq: $scenarioVersionId}}) { externalId }
}
`;

export const INSERT_ORGANIZATION_MUTATION = `
mutation InsertOrganization($data: Organization_Data!) {
  organization_insert(data: $data)
}
`;

export const INSERT_SCENARIO_MUTATION = `
mutation InsertScenario($data: Scenario_Data!) {
  scenario_insert(data: $data)
}
`;

export const INSERT_SCENARIO_SNAPSHOT_MUTATION = `
mutation InsertScenarioSnapshot(
  $scenarioVersion: ScenarioVersion_Data!
  $characters: [Character_Data!]!
  $plots: [Plot_Data!]!
  $facts: [Fact_Data!]!
  $initialKnowledge: [InitialKnowledge_Data!]!
  $clues: [Clue_Data!]!
  $clueFacts: [ClueFact_Data!]!
) @transaction {
  scenarioVersion_insert(data: $scenarioVersion)
  character_insertMany(data: $characters)
  plot_insertMany(data: $plots)
  fact_insertMany(data: $facts)
  initialKnowledge_insertMany(data: $initialKnowledge)
  clue_insertMany(data: $clues)
  clueFact_insertMany(data: $clueFacts)
}
`;

export const INSERT_OBJECTIVE_MUTATION = `
mutation InsertObjective($data: Objective_Data!) {
  objective_insert(data: $data)
}
`;

export const INSERT_RELATIONSHIP_MUTATION = `
mutation InsertRelationship($data: Relationship_Data!) {
  relationship_insert(data: $data)
}
`;

export const INSERT_DOCUMENT_DEFINITION_MUTATION = `
mutation InsertDocumentDefinition($data: DocumentDefinition_Data!) {
  documentDefinition_insert(data: $data)
}
`;

export const INSERT_MEDIA_ASSET_MUTATION = `
mutation InsertMediaAsset($data: MediaAsset_Data!) {
  mediaAsset_insert(data: $data)
}
`;

export const INSERT_SKIN_VISUAL_DEFINITION_MUTATION = `
mutation InsertSkinVisualDefinition($data: SkinVisualDefinition_Data!) {
  skinVisualDefinition_insert(data: $data)
}
`;

export const INSERT_GAME_OBJECT_MUTATION = `
mutation InsertGameObject($data: GameObject_Data!) {
  gameObject_insert(data: $data)
}
`;

export const INSERT_RESOURCE_MUTATION = `
mutation InsertResource($data: Resource_Data!) {
  resource_insert(data: $data)
}
`;

export const INSERT_RESOURCE_ASSIGNMENT_MUTATION = `
mutation InsertResourceAssignment($data: ResourceAssignment_Data!) {
  resourceAssignment_insert(data: $data)
}
`;

export const INSERT_STATE_DEFINITION_MUTATION = `
mutation InsertGameStateDefinition($data: GameStateDefinition_Data!) {
  gameStateDefinition_insert(data: $data)
}
`;

export const INSERT_ABILITY_MUTATION = `
mutation InsertAbility($data: Ability_Data!) {
  ability_insert(data: $data)
}
`;

export const INSERT_ABILITY_ASSIGNMENT_MUTATION = `
mutation InsertAbilityAssignment($data: AbilityAssignment_Data!) {
  abilityAssignment_insert(data: $data)
}
`;

export const INSERT_INTERACTION_MUTATION = `
mutation InsertInteraction($data: Interaction_Data!) {
  interaction_insert(data: $data)
}
`;

export const INSERT_LOCATION_MUTATION = `
mutation InsertGameLocation($data: GameLocation_Data!) {
  gameLocation_insert(data: $data)
}
`;

export const INSERT_PHASE_DEFINITION_MUTATION = `
mutation InsertGamePhaseDefinition($data: GamePhaseDefinition_Data!) {
  gamePhaseDefinition_insert(data: $data)
}
`;

export const INSERT_EVENT_DEFINITION_MUTATION = `
mutation InsertGameEventDefinition($data: GameEventDefinition_Data!) {
  gameEventDefinition_insert(data: $data)
}
`;


export const INSERT_VOTE_DEFINITION_MUTATION = `
mutation InsertVoteDefinition($data: VoteDefinition_Data!) {
  voteDefinition_insert(data: $data)
}
`;

export const INSERT_VOTE_OPTION_DEFINITION_MUTATION = `
mutation InsertVoteOptionDefinition($data: VoteOptionDefinition_Data!) {
  voteOptionDefinition_insert(data: $data)
}
`;

export const MARK_RUNTIME_SOURCE_MUTATION = `
mutation MarkRuntimeSource(
  $scenarioVersionId: UUID!,
  $runtimeDataVersion: String!,
  $skinId: String,
  $accentColor: String,
  $logoMediaExternalId: String,
  $backgroundMediaExternalId: String
) {
  scenarioVersion_update(
    id: $scenarioVersionId,
    data: {
      runtimeDataVersion: $runtimeDataVersion,
      skinId: $skinId,
      accentColor: $accentColor,
      logoMediaExternalId: $logoMediaExternalId,
      backgroundMediaExternalId: $backgroundMediaExternalId
    }
  )
}
`;

export function mutationVariablesFromPlan(plan, importReport) {
  return {
    scenarioVersion: {
      ...plan.scenarioVersion,
      importReportJson: JSON.stringify(importReport ?? {}),
    },
    characters: plan.characters,
    plots: plan.plots,
    facts: plan.facts,
    initialKnowledge: plan.initialKnowledge,
    clues: plan.clues,
    clueFacts: plan.clueFacts,
  };
}

function extractErrors(response) {
  return response?.errors ?? response?.data?.errors ?? [];
}

function assertNoErrors(response, code) {
  const errors = extractErrors(response);
  if (Array.isArray(errors) && errors.length) {
    const err = new Error(code);
    err.details = errors;
    throw err;
  }
  return response?.data ?? response;
}

async function insertRows(rows, operation, run, {
  concurrency = 8,
  entityName = 'row',
} = {}) {
  if (!rows?.length) return { count: 0 };

  let next = 0;
  let completed = 0;

  async function worker() {
    while (true) {
      const index = next++;
      if (index >= rows.length) return;
      const row = rows[index];
      const response = await run(operation, { data: row });
      assertNoErrors(response, `DATACONNECT_${entityName.toUpperCase()}_INSERT_FAILED`);
      completed += 1;
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, () => worker()));
  return { count: completed };
}

export async function persistImportPlan(plan, importReport, { executor, reader } = {}) {
  const run = executor ?? defaultExecutor;
  const read = reader ?? defaultReader;

  // Import versions are immutable snapshots. We first discover what already exists
  // and never route a re-import through SQL Connect's ON CONFLICT / DO UPDATE path.
  const preflightResponse = await read(IMPORT_PREFLIGHT_QUERY, {
    organizationId: plan.ids.organizationId,
    scenarioId: plan.ids.scenarioId,
    scenarioVersionId: plan.ids.scenarioVersionId,
  });
  const preflight = assertNoErrors(preflightResponse, 'DATACONNECT_PREFLIGHT_FAILED') ?? {};

  if (!preflight.organization) {
    assertNoErrors(
      await run(INSERT_ORGANIZATION_MUTATION, { data: plan.organization }),
      'DATACONNECT_ORGANIZATION_INSERT_FAILED',
    );
  }

  if (!preflight.scenario) {
    assertNoErrors(
      await run(INSERT_SCENARIO_MUTATION, { data: plan.scenario }),
      'DATACONNECT_SCENARIO_INSERT_FAILED',
    );
  }

  let baseInserted = false;
  if (!preflight.scenarioVersion) {
    const variables = mutationVariablesFromPlan(plan, importReport);
    assertNoErrors(
      await run(INSERT_SCENARIO_SNAPSHOT_MUTATION, variables),
      'DATACONNECT_SNAPSHOT_INSERT_FAILED',
    );
    baseInserted = true;
  }

  // V0.3 enrichment is resumable: insert only IDs that are not already present.
  const enrichmentResponse = await read(EXISTING_ENRICHMENT_QUERY, {
    scenarioVersionId: plan.ids.scenarioVersionId,
  });
  const enrichment = assertNoErrors(enrichmentResponse, 'DATACONNECT_ENRICHMENT_READ_FAILED') ?? {};
  const existingObjectives = new Set((enrichment.objectives ?? []).map(row => row.externalId));
  const existingRelationships = new Set((enrichment.relationships ?? []).map(row => row.externalId));
  const existingDocumentDefinitions = new Set((enrichment.documentDefinitions ?? []).map(row => row.externalId));
  const existingMediaAssets = new Set((enrichment.mediaAssets ?? []).map(row => row.externalId));
  const existingSkinVisualDefinitions = new Set((enrichment.skinVisualDefinitions ?? []).map(row => row.externalId));
  const existingGameObjects = new Set((enrichment.gameObjects ?? []).map(row => row.externalId));
  const existingResources = new Set((enrichment.resources ?? []).map(row => row.externalId));
  const existingResourceAssignments = new Set((enrichment.resourceAssignments ?? []).map(row => row.externalId));
  const existingStateDefinitions = new Set((enrichment.gameStateDefinitions ?? []).map(row => row.externalId));
  const existingAbilities = new Set((enrichment.abilities ?? []).map(row => row.externalId));
  const existingAbilityAssignments = new Set((enrichment.abilityAssignments ?? []).map(row => row.externalId));
  const existingInteractions = new Set((enrichment.interactions ?? []).map(row => row.externalId));
  const existingLocations = new Set((enrichment.gameLocations ?? []).map(row => row.externalId));
  const existingPhaseDefinitions = new Set((enrichment.gamePhaseDefinitions ?? []).map(row => row.externalId));
  const existingEventDefinitions = new Set((enrichment.gameEventDefinitions ?? []).map(row => row.externalId));
  const existingVoteDefinitions = new Set((enrichment.voteDefinitions ?? []).map(row => row.externalId));
  const existingVoteOptionDefinitions = new Set((enrichment.voteOptionDefinitions ?? []).map(row => row.externalId));

  const missingObjectives = plan.objectives.filter(row => !existingObjectives.has(row.externalId));
  const missingRelationships = plan.relationships.filter(row => !existingRelationships.has(row.externalId));
  const missingDocumentDefinitions = (plan.documents ?? []).filter(row => !existingDocumentDefinitions.has(row.externalId));
  const missingMediaAssets = (plan.mediaAssets ?? []).filter(row => !existingMediaAssets.has(row.externalId));
  const missingSkinVisualDefinitions = (plan.skinVisualDefinitions ?? []).filter(row => !existingSkinVisualDefinitions.has(row.externalId));
  const missingGameObjects = plan.gameObjects.filter(row => !existingGameObjects.has(row.externalId));
  const missingResources = plan.resources.filter(row => !existingResources.has(row.externalId));
  const missingResourceAssignments = plan.resourceAssignments.filter(row => !existingResourceAssignments.has(row.externalId));
  const missingStateDefinitions = plan.stateDefinitions.filter(row => !existingStateDefinitions.has(row.externalId));
  const missingAbilities = plan.abilities.filter(row => !existingAbilities.has(row.externalId));
  const missingAbilityAssignments = plan.abilityAssignments.filter(row => !existingAbilityAssignments.has(row.externalId));
  const missingInteractions = plan.interactions.filter(row => !existingInteractions.has(row.externalId));
  const missingLocations = plan.locations.filter(row => !existingLocations.has(row.externalId));
  const missingPhaseDefinitions = plan.phaseDefinitions.filter(row => !existingPhaseDefinitions.has(row.externalId));
  const missingEventDefinitions = plan.eventDefinitions.filter(row => !existingEventDefinitions.has(row.externalId));
  const missingVoteDefinitions = plan.voteDefinitions.filter(row => !existingVoteDefinitions.has(row.externalId));
  const missingVoteOptionDefinitions = plan.voteOptionDefinitions.filter(row => !existingVoteOptionDefinitions.has(row.externalId));

  const objectiveResult = await insertRows(
    missingObjectives,
    INSERT_OBJECTIVE_MUTATION,
    run,
    { concurrency: 8, entityName: 'objective' },
  );

  const relationshipResult = await insertRows(
    missingRelationships,
    INSERT_RELATIONSHIP_MUTATION,
    run,
    { concurrency: 8, entityName: 'relationship' },
  );

  const documentDefinitionResult = await insertRows(
    missingDocumentDefinitions,
    INSERT_DOCUMENT_DEFINITION_MUTATION,
    run,
    { concurrency: 8, entityName: 'document_definition' },
  );

  const mediaAssetResult = await insertRows(
    missingMediaAssets,
    INSERT_MEDIA_ASSET_MUTATION,
    run,
    { concurrency: 8, entityName: 'media_asset' },
  );

  const skinVisualDefinitionResult = await insertRows(
    missingSkinVisualDefinitions,
    INSERT_SKIN_VISUAL_DEFINITION_MUTATION,
    run,
    { concurrency: 8, entityName: 'skin_visual_definition' },
  );

  const gameObjectResult = await insertRows(
    missingGameObjects,
    INSERT_GAME_OBJECT_MUTATION,
    run,
    { concurrency: 8, entityName: 'game_object' },
  );

  const resourceResult = await insertRows(
    missingResources,
    INSERT_RESOURCE_MUTATION,
    run,
    { concurrency: 8, entityName: 'resource' },
  );

  const resourceAssignmentResult = await insertRows(
    missingResourceAssignments,
    INSERT_RESOURCE_ASSIGNMENT_MUTATION,
    run,
    { concurrency: 8, entityName: 'resource_assignment' },
  );

  const stateDefinitionResult = await insertRows(
    missingStateDefinitions,
    INSERT_STATE_DEFINITION_MUTATION,
    run,
    { concurrency: 8, entityName: 'state_definition' },
  );

  const abilityResult = await insertRows(
    missingAbilities,
    INSERT_ABILITY_MUTATION,
    run,
    { concurrency: 8, entityName: 'ability' },
  );

  const abilityAssignmentResult = await insertRows(
    missingAbilityAssignments,
    INSERT_ABILITY_ASSIGNMENT_MUTATION,
    run,
    { concurrency: 8, entityName: 'ability_assignment' },
  );

  const interactionResult = await insertRows(
    missingInteractions,
    INSERT_INTERACTION_MUTATION,
    run,
    { concurrency: 8, entityName: 'interaction' },
  );

  const locationResult = await insertRows(
    missingLocations,
    INSERT_LOCATION_MUTATION,
    run,
    { concurrency: 8, entityName: 'location' },
  );

  const phaseDefinitionResult = await insertRows(
    missingPhaseDefinitions,
    INSERT_PHASE_DEFINITION_MUTATION,
    run,
    { concurrency: 8, entityName: 'phase_definition' },
  );

  const eventDefinitionResult = await insertRows(
    missingEventDefinitions,
    INSERT_EVENT_DEFINITION_MUTATION,
    run,
    { concurrency: 8, entityName: 'event_definition' },
  );


  const voteDefinitionResult = await insertRows(
    missingVoteDefinitions,
    INSERT_VOTE_DEFINITION_MUTATION,
    run,
    { concurrency: 8, entityName: 'vote_definition' },
  );

  const voteOptionDefinitionResult = await insertRows(
    missingVoteOptionDefinitions,
    INSERT_VOTE_OPTION_DEFINITION_MUTATION,
    run,
    { concurrency: 8, entityName: 'vote_option_definition' },
  );

  const presentationChanged =
    (preflight.scenarioVersion?.skinId ?? null) !== (plan.scenarioVersion.skinId ?? null) ||
    (preflight.scenarioVersion?.accentColor ?? null) !== (plan.scenarioVersion.accentColor ?? null) ||
    (preflight.scenarioVersion?.logoMediaExternalId ?? null) !== (plan.scenarioVersion.logoMediaExternalId ?? null) ||
    (preflight.scenarioVersion?.backgroundMediaExternalId ?? null) !== (plan.scenarioVersion.backgroundMediaExternalId ?? null);

  if (preflight.scenarioVersion?.runtimeDataVersion !== '0.9' || presentationChanged) {
    assertNoErrors(
      await run(MARK_RUNTIME_SOURCE_MUTATION, {
        scenarioVersionId: plan.ids.scenarioVersionId,
        runtimeDataVersion: '0.9',
        skinId: plan.scenarioVersion.skinId ?? null,
        accentColor: plan.scenarioVersion.accentColor ?? null,
        logoMediaExternalId: plan.scenarioVersion.logoMediaExternalId ?? null,
        backgroundMediaExternalId: plan.scenarioVersion.backgroundMediaExternalId ?? null,
      }),
      'DATACONNECT_RUNTIME_SOURCE_MARK_FAILED',
    );
  }

  return {
    organizationId: plan.ids.organizationId,
    scenarioId: plan.ids.scenarioId,
    scenarioVersionId: plan.ids.scenarioVersionId,
    sourceHash: plan.sourceHash,
    baseInserted,
    imported: {
      objectives: objectiveResult.count,
      relationships: relationshipResult.count,
      documents: documentDefinitionResult.count,
      mediaAssets: mediaAssetResult.count,
      skinVisualDefinitions: skinVisualDefinitionResult.count,
      gameObjects: gameObjectResult.count,
      resources: resourceResult.count,
      resourceAssignments: resourceAssignmentResult.count,
      stateDefinitions: stateDefinitionResult.count,
      abilities: abilityResult.count,
      abilityAssignments: abilityAssignmentResult.count,
      interactions: interactionResult.count,
      locations: locationResult.count,
      phaseDefinitions: phaseDefinitionResult.count,
      eventDefinitions: eventDefinitionResult.count,
      voteDefinitions: voteDefinitionResult.count,
      voteOptionDefinitions: voteOptionDefinitionResult.count,
    },
  };
}

async function getAdminDataConnect() {
  const [{ initializeApp, getApps }, { getDataConnect }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/data-connect'),
  ]);
  if (!getApps().length) initializeApp();
  return getDataConnect({ location: 'europe-west1', serviceId: 'murder-engine' });
}

async function defaultExecutor(operation, variables) {
  const dc = await getAdminDataConnect();
  return dc.executeGraphql(operation, { variables });
}

async function defaultReader(operation, variables) {
  const dc = await getAdminDataConnect();
  return dc.executeGraphqlRead(operation, { variables });
}
