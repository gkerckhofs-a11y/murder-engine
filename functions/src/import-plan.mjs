import { createHash } from 'node:crypto';
import { splitIds } from './contract.mjs';

const truthy = (value, fallback = false) => {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  return String(value).trim().toUpperCase() === 'TRUE';
};

const intOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
};

const textOrNull = (value) => value === null || value === undefined || value === '' ? null : String(value);
const joinIds = (values) => { const out=(values??[]).map(v=>String(v??'').trim()).filter(Boolean); return out.length?out.join(';'):null; };

const normalizedGender = (value) => {
  const v = String(value ?? '').trim().toUpperCase();
  if (['F','FEMININ','FÉMININ','FEMME','WOMAN','FEMALE'].includes(v)) return 'FEMININ';
  if (['M','MASCULIN','H','HOMME','MAN','MALE'].includes(v)) return 'MASCULIN';
  if (['NEUTRE','NEUTRAL','ADAPTABLE','UNISEXE','UNISEX','LIBRE','ANY','AU_CHOIX'].includes(v)) return 'ADAPTABLE';
  return v ? 'AUTRE' : 'NON_RENSEIGNE';
};

export function inferGenderProfile(characterRows = []) {
  const playable = characterRows.filter(r => truthy(r.jouable, true) && truthy(r.actif, true));
  if (!playable.length) return 'NON_RENSEIGNE';
  const genders = playable.map(r => normalizedGender(r.genre));
  const flexible = genders.filter(g => g === 'ADAPTABLE' || g === 'NON_RENSEIGNE').length;
  if (flexible === playable.length) return 'LIBRE';
  if (flexible > 0) return 'ADAPTABLE';
  return 'FIXE';
}

export function sha256Hex(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function stableUuid(seed) {
  const bytes = Buffer.from(createHash('sha256').update(String(seed)).digest().subarray(0, 16));
  // UUID v5-style version/variant bits, using SHA-256 as deterministic source.
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = bytes.toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

export function slugify(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 80) || 'scenario';
}

export function buildImportPlan(workbook, {
  sourceBuffer,
  organizationSlug = 'ludificateur',
  organizationName = 'Le Ludificateur',
} = {}) {
  const scenarioRow = workbook.sheets.SCENARIO?.[0];
  if (!scenarioRow) throw new Error('SCENARIO_REQUIRED_FOR_IMPORT');

  const sourceHash = sourceBuffer ? sha256Hex(sourceBuffer) : sha256Hex(Buffer.from(JSON.stringify(workbook)));
  const sourceScenarioId = String(scenarioRow.scenario_id);
  const organizationId = stableUuid(`organization:${organizationSlug}`);
  const scenarioId = stableUuid(`scenario:${organizationSlug}:${sourceScenarioId}`);
  const scenarioVersionId = stableUuid(`scenario-version:${organizationSlug}:${sourceScenarioId}:${sourceHash}`);
  const scenarioSlug = slugify(scenarioRow.titre || sourceScenarioId);


  const characters = (workbook.sheets.PERSONNAGES ?? []).map(r => ({
    scenarioVersionId,
    externalId: String(r.character_id),
    name: String(r.nom_personnage),
    publicRole: textOrNull(r.fonction_publique),
    dramaticFunction: textOrNull(r.fonction_dramatique),
    narrativeAge: textOrNull(r.age_narratif),
    gender: textOrNull(r.genre),
    importance: String(r.importance),
    intensity: String(r.intensite),
    biography: String(r.biographie),
    secretIntro: textOrNull(r.secret_intro),
    interpretationNotes: textOrNull(r.conseils_interpretation),
    appearanceNotes: textOrNull(r.apparence),
    apparentMotive: textOrNull(r.mobile_apparent),
    personalTimeline: textOrNull(r.chronologie_personnelle),
    motto: textOrNull(r.devise),
    portraitMediaId: textOrNull(r.portrait_media_id),
    portraitArchetypeCode: textOrNull(r.portrait_archetype_code),
    playable: truthy(r.jouable, true),
    active: truthy(r.actif, true),
  }));

  const plots = (workbook.sheets.INTRIGUES ?? []).map(r => ({
    scenarioVersionId,
    externalId: String(r.plot_id),
    title: String(r.titre),
    plotType: String(r.type_intrigue),
    importance: String(r.importance),
    gmSummary: String(r.resume_mj),
    active: truthy(r.actif, true),
  }));

  const objectives = (workbook.sheets.OBJECTIFS ?? []).map(r => ({
    scenarioVersionId,
    externalId: String(r.objective_id),
    ownerType: String(r.owner_type),
    ownerExternalId: String(r.owner_id),
    title: String(r.titre),
    description: String(r.description),
    objectiveType: String(r.type_objectif),
    secret: truthy(r.secret, true),
    initialStatus: String(r.statut_initial),
    triggerExternalId: textOrNull(r.trigger_id),
    importance: textOrNull(r.importance),
    active: truthy(r.actif, true),
  }));

  const relationships = (workbook.sheets.RELATIONS ?? []).map(r => ({
    scenarioVersionId,
    externalId: String(r.relation_id),
    characterAExternalId: String(r.character_a_id),
    characterBExternalId: String(r.character_b_id),
    relationType: textOrNull(r.type_relation),
    textA: String(r.texte_a),
    textB: textOrNull(r.texte_b),
    visibility: String(r.visibilite),
    plotExternalId: textOrNull(r.plot_id),
    active: truthy(r.actif, true),
  }));

  const facts = (workbook.sheets.FAITS ?? []).map(r => ({
    scenarioVersionId,
    externalId: String(r.fact_id),
    title: String(r.titre_court),
    text: String(r.texte),
    nature: String(r.nature),
    importance: String(r.importance),
    plotExternalId: textOrNull(r.plot_id),
    notebookCategory: textOrNull(r.categorie_carnet),
    isPublic: truthy(r.public, false),
    active: truthy(r.actif, true),
  }));

  const initialKnowledge = [];
  for (const r of workbook.sheets.PERSONNAGES ?? []) {
    for (const factExternalId of splitIds(r.starting_fact_ids)) {
      initialKnowledge.push({
        scenarioVersionId,
        characterExternalId: String(r.character_id),
        factExternalId,
        sourceType: 'INITIAL',
      });
    }
  }

  const mediaAssets = (workbook.sheets.MEDIA ?? []).map(r => ({
    scenarioVersionId,
    externalId: String(r.media_id),
    mediaType: String(r.type_media ?? 'IMAGE').toUpperCase(),
    source: String(r.fichier_ou_url ?? ''),
    altText: textOrNull(r.alt_text),
    notes: textOrNull(r.notes),
    active: truthy(r.actif, true),
  }));

  const documents = (workbook.sheets.DOCUMENTS ?? []).map(r => ({
    scenarioVersionId,
    externalId: String(r.document_id),
    title: String(r.titre),
    textContent: textOrNull(r.contenu_texte),
    support: String(r.support ?? 'DIGITAL'),
    mediaExternalIds: joinIds(splitIds(r.media_ids).length ? splitIds(r.media_ids) : splitIds(r.media_id)),
    reusable: truthy(r.reutilisable, true),
    consumable: truthy(r.consommable, false),
    ownerInitialType: textOrNull(r.owner_initial_type),
    ownerInitialExternalId: textOrNull(r.owner_initial_id),
    clueExternalIds: joinIds(splitIds(r.clue_ids)),
    logisticsCode: textOrNull(r.code_logistique),
    propRequirementExternalId: textOrNull(r.prop_requirement_id),
    transferable: truthy(r.transferable, true),
    stealable: truthy(r.volable, true),
    active: truthy(r.actif, true),
  }));

  const documentObjectId = documentExternalId => `DOC_OBJ_${documentExternalId}`;

  const clues = (workbook.sheets.INDICES ?? []).map(r => ({
    scenarioVersionId,
    externalId: String(r.clue_id),
    internalName: String(r.nom_interne),
    playerName: String(r.nom_joueur),
    clueType: String(r.type_indice),
    playerText: String(r.texte_joueur),
    gmInterpretation: String(r.interpretation_mj),
    discoveryHook: textOrNull(r.accroche_decouverte),
    plotExternalId: textOrNull(r.plot_id),
    locationExternalId: textOrNull(r.location_id),
    objectExternalId: textOrNull(r.object_id) ?? (textOrNull(r.document_id) ? documentObjectId(String(r.document_id)) : null),
    documentExternalId: textOrNull(r.document_id),
    support: String(r.support),
    presentationMode: String(r.presentation_mode),
    shareable: truthy(r.partageable, true),
    transferable: truthy(r.transferable, true),
    consumable: truthy(r.consommable, false),
    major: truthy(r.majeur, false),
    logisticsCode: textOrNull(r.code_logistique),
    mediaExternalId: textOrNull(r.media_id),
    addToNotebook: truthy(r.ajouter_au_carnet, true),
    active: truthy(r.actif, true),
  }));

  const clueFacts = [];
  for (const r of workbook.sheets.INDICES ?? []) {
    for (const factExternalId of splitIds(r.fact_ids)) {
      clueFacts.push({
        scenarioVersionId,
        clueExternalId: String(r.clue_id),
        factExternalId,
      });
    }
  }

  const gameObjects = (workbook.sheets.OBJETS ?? []).map(r => ({
    scenarioVersionId,
    externalId: String(r.object_id),
    name: String(r.nom),
    description: String(r.description),
    support: String(r.support),
    propRequirementExternalId: textOrNull(r.prop_requirement_id),
    ownerInitialType: textOrNull(r.owner_initial_type),
    ownerInitialExternalId: textOrNull(r.owner_initial_id),
    transferable: truthy(r.transferable, true),
    stealable: truthy(r.volable, false),
    consumable: truthy(r.consommable, false),
    initialCharges: intOrNull(r.charges_initiales),
    critical: truthy(r.critique, false),
    identification0: textOrNull(r.identification_0),
    identification1: textOrNull(r.identification_1),
    identification2: textOrNull(r.identification_2),
    identification3: textOrNull(r.identification_3),
    active: truthy(r.actif, true),
  }));
  const explicitObjectIds = new Set(gameObjects.map(o=>o.externalId));
  for (const d of documents) {
    const externalId=documentObjectId(d.externalId);
    if (explicitObjectIds.has(externalId) || d.active === false) continue;
    gameObjects.push({
      scenarioVersionId, externalId, name:d.title, description:d.textContent || d.title, support:'DOCUMENT',
      propRequirementExternalId:d.propRequirementExternalId, ownerInitialType:d.ownerInitialType, ownerInitialExternalId:d.ownerInitialExternalId,
      transferable:d.transferable, stealable:d.stealable, consumable:d.consumable, initialCharges:1, critical:false,
      identification0:d.title, identification1:null, identification2:null, identification3:null,
      mediaExternalId:d.mediaExternalIds?.split(';')?.[0] ?? null, visualArchetypeCode:'LETTER', active:true,
    });
  }

  const resources = (workbook.sheets.RESSOURCES ?? []).map(r => ({
    scenarioVersionId,
    externalId: String(r.resource_id),
    name: String(r.nom),
    scopeType: String(r.scope_type),
    unit: textOrNull(r.unite),
    defaultValue: intOrNull(r.valeur_defaut),
    maxValue: intOrNull(r.valeur_max),
    physicalMode: String(r.mode_physique),
    isPublic: truthy(r.public, false),
    active: truthy(r.actif, true),
  }));

  const resourceAssignments = (workbook.sheets.ATTRIB_RESSOURCES ?? []).map(r => ({
    scenarioVersionId,
    externalId: String(r.resource_assignment_id),
    ownerType: String(r.owner_type),
    ownerExternalId: textOrNull(r.owner_id),
    resourceExternalId: String(r.resource_id),
    initialValue: intOrNull(r.initial_value) ?? 0,
    maxOverride: intOrNull(r.max_override),
    notes: textOrNull(r.notes),
    active: true,
  }));

  const abilities = (workbook.sheets.CAPACITES ?? []).map(r => ({
    scenarioVersionId,
    externalId: String(r.ability_id),
    name: String(r.nom),
    description: String(r.description ?? ''),
    category: String(r.categorie ?? 'UTILITY'),
    defaultLevel: intOrNull(r.niveau_defaut) ?? 0,
    defaultMaxUses: intOrNull(r.max_utilisations_defaut),
    defaultCooldownMinutes: intOrNull(r.cooldown_minutes_defaut),
    secret: truthy(r.secrete, false),
    active: truthy(r.actif, true),
  }));

  const abilityAssignments = (workbook.sheets.ATTRIB_CAPACITES ?? []).map(r => ({
    scenarioVersionId,
    externalId: String(r.assignment_id),
    ownerType: String(r.owner_type),
    ownerExternalId: String(r.owner_id),
    abilityExternalId: String(r.ability_id),
    level: intOrNull(r.niveau) ?? 0,
    flatBonus: intOrNull(r.bonus_flat) ?? 0,
    usesOverride: intOrNull(r.utilisations_override),
    cooldownOverrideMinutes: intOrNull(r.cooldown_override_minutes),
    active: truthy(r.actif, true),
  }));

  const interactions = (workbook.sheets.INTERACTIONS ?? []).map(r => {
    const targetType = String(r.target_type ?? 'NONE').toUpperCase();
    const rawScanMode = String(r.scan_mode ?? '').trim().toUpperCase();
    const scanMode = ['PLAYER','CHARACTER'].includes(targetType)
      ? (rawScanMode || (truthy(r.secret_cible, false) ? 'DISCRET' : 'DIRECT'))
      : null;
    return {
    scenarioVersionId,
    externalId: String(r.interaction_id),
    name: String(r.nom),
    category: String(r.categorie),
    targetType,
    scanMode,
    abilityExternalId: textOrNull(r.ability_id),
    actorScope: textOrNull(r.actor_scope),
    targetScope: textOrNull(r.target_scope),
    costResourceExternalId: textOrNull(r.cost_resource_id),
    costValue: intOrNull(r.cost_value),
    costTiming: textOrNull(r.cost_timing),
    resolution: String(r.resolution),
    diceCount: intOrNull(r.dice_count),
    diceSides: intOrNull(r.dice_sides),
    abilityLevelMultiplier: intOrNull(r.ability_level_multiplier),
    flatBonus: intOrNull(r.flat_bonus),
    difficulty: intOrNull(r.difficulty),
    opposedAbilityExternalId: textOrNull(r.opposed_ability_id),
    tieRule: textOrNull(r.tie_rule),
    validation: String(r.validation),
    maxUses: intOrNull(r.max_utilisations),
    limitPerTarget: intOrNull(r.limit_per_target),
    cooldownMinutes: intOrNull(r.cooldown_minutes),
    targetSecret: truthy(r.secret_cible, false),
    notificationSuccessActorExternalId: textOrNull(r.notification_success_actor_id),
    notificationFailureActorExternalId: textOrNull(r.notification_failure_actor_id),
    notificationSuccessTargetExternalId: textOrNull(r.notification_success_target_id),
    notificationFailureTargetExternalId: textOrNull(r.notification_failure_target_id),
    active: truthy(r.actif, true),
  };
  });

  const locations = (workbook.sheets.LIEUX ?? []).map(r => ({
    scenarioVersionId,
    externalId: String(r.location_id),
    name: String(r.nom),
    description: String(r.description ?? ''),
    qrCode: textOrNull(r.qr_code),
    permanent: truthy(r.permanent, true),
    themeExternalId: textOrNull(r.theme_id),
    lockExternalId: textOrNull(r.lock_id),
    active: truthy(r.actif, true),
  }));

  const stateDefinitions = (workbook.sheets.ETATS ?? []).map(r => ({
    scenarioVersionId,
    externalId: String(r.state_id),
    name: String(r.nom),
    description: String(r.description),
    defaultDurationSeconds: intOrNull(r.duree_defaut_secondes),
    visibleToHolder: truthy(r.visible_porteur, true),
    visiblePublic: truthy(r.visible_public, false),
    blockedActionIds: textOrNull(r.actions_bloquees_ids),
    active: truthy(r.actif, true),
  }));

  const phaseDefinitions = (workbook.sheets.PHASES ?? []).map(r => ({
    scenarioVersionId,
    externalId: String(r.phase_id),
    name: String(r.nom),
    orderIndex: intOrNull(r.ordre) ?? 0,
    gmDescription: String(r.description_mj ?? ''),
    triggerType: String(r.trigger_type),
    triggerRef: textOrNull(r.trigger_ref),
    manualConfirm: truthy(r.manual_confirm, false),
    active: truthy(r.actif, true),
  }));

  const eventDefinitions = (workbook.sheets.EVENEMENTS ?? []).map(r => ({
    scenarioVersionId,
    externalId: String(r.event_id),
    title: String(r.titre),
    gmDescription: String(r.description_mj ?? ''),
    triggerType: String(r.trigger_type),
    triggerRef: textOrNull(r.trigger_ref),
    delayMinutes: intOrNull(r.delay_minutes),
    absoluteTime: textOrNull(r.heure_absolue),
    phaseExternalId: textOrNull(r.phase_id),
    validation: String(r.validation),
    notificationExternalId: textOrNull(r.notification_id),
    priority: String(r.priorite),
    mandatory: truthy(r.obligatoire, false),
    repeatable: truthy(r.repetable, false),
    fallbackGm: textOrNull(r.fallback_mj),
    manualFallbackAllowed: truthy(r.manual_fallback_allowed, true),
    active: truthy(r.actif, true),
  }));

  const voteDefinitions = (workbook.sheets.VOTES ?? []).map(r => ({
    scenarioVersionId,
    externalId: String(r.vote_id),
    title: String(r.titre),
    question: String(r.question),
    scopeType: String(r.scope_type),
    scopeRef: textOrNull(r.scope_ref),
    choicesMode: String(r.choices_mode),
    secret: truthy(r.secret, true),
    votesPerElector: intOrNull(r.votes_par_electeur) ?? 1,
    weighted: truthy(r.pondere, false),
    weightResourceExternalId: textOrNull(r.weight_resource_id),
    abstention: truthy(r.abstention, false),
    modifiable: truthy(r.modifiable, false),
    closeMode: String(r.close_mode),
    durationMinutes: intOrNull(r.duration_minutes),
    resultVisibility: String(r.result_visibility),
    tieRule: textOrNull(r.tie_rule),
    notificationOpenExternalId: textOrNull(r.notification_open_id),
    notificationResultExternalId: textOrNull(r.notification_result_id),
    active: truthy(r.actif, true),
  }));

  const voteOptionDefinitions = (workbook.sheets.OPTIONS_VOTE ?? []).map(r => ({
    scenarioVersionId,
    externalId: String(r.vote_option_id),
    voteExternalId: String(r.vote_id),
    orderIndex: intOrNull(r.ordre) ?? 0,
    label: String(r.label),
    description: textOrNull(r.description),
    characterExternalId: textOrNull(r.character_id),
    enabledConditionExternalId: textOrNull(r.enabled_condition_id),
    active: truthy(r.actif, true),
  }));

  const themeRows = workbook.sheets.THEME ?? [];
  const scenarioThemeId = String(scenarioRow.theme_id ?? '').trim();

  const themeRow =
    themeRows.find(r => String(r.theme_id ?? '').trim() === scenarioThemeId)
    ?? themeRows[0]
    ?? {};

  return {
    sourceHash,
    ids: { organizationId, scenarioId, scenarioVersionId },
    organization: {
      id: organizationId,
      name: organizationName,
      slug: organizationSlug,
      active: true,
    },
    scenario: {
      id: scenarioId,
      organizationId,
      title: String(scenarioRow.titre),
      slug: scenarioSlug,
      archived: false,
    },
    scenarioVersion: {
      id: scenarioVersionId,
      scenarioId,
      sourceScenarioId,
      versionLabel: String(scenarioRow.version),
      variantName: textOrNull(scenarioRow.variant_name) ?? textOrNull(scenarioRow.nom_version) ?? (intOrNull(scenarioRow.min_joueurs) === intOrNull(scenarioRow.max_joueurs) && intOrNull(scenarioRow.min_joueurs) !== null ? `${intOrNull(scenarioRow.min_joueurs)} joueurs` : `${intOrNull(scenarioRow.min_joueurs) ?? '?'}–${intOrNull(scenarioRow.max_joueurs) ?? '?'} joueurs`),
      genderProfile: textOrNull(scenarioRow.profil_genre)?.toUpperCase() ?? inferGenderProfile(workbook.sheets.PERSONNAGES ?? []),
      variantNotes: textOrNull(scenarioRow.variant_notes) ?? textOrNull(scenarioRow.notes_version),
      templateVersion: String(workbook.templateVersion ?? '1.1'),
      language: String(scenarioRow.langue_defaut),
      status: String(scenarioRow.statut),
      subtitle: textOrNull(scenarioRow.sous_titre),
      universe: textOrNull(scenarioRow.univers),
      era: textOrNull(scenarioRow.epoque),
      gmSummary: String(scenarioRow.resume_mj),
      playerSummary: String(scenarioRow.resume_joueur),
      durationMinutes: intOrNull(scenarioRow.duree_minutes),
      minPlayers: intOrNull(scenarioRow.min_joueurs),
      maxPlayers: intOrNull(scenarioRow.max_joueurs),
      sourceFilename: textOrNull(workbook.filename),
      sourceHash,
      importReportJson: null,

      // Skin Engine V1.7
      skinId: textOrNull(themeRow.skin_id) ?? 'CONTEMPORARY_1980_2000',
      accentColor: textOrNull(themeRow.couleur_accent),
      logoMediaExternalId: textOrNull(themeRow.logo_media_id),
      backgroundMediaExternalId: textOrNull(themeRow.fond_media_id),

      locked: false,
    },
    characters,
    plots,
    objectives,
    relationships,
    facts,
    initialKnowledge,
    clues,
    clueFacts,
    documents,
    mediaAssets,
    gameObjects,
    resources,
    resourceAssignments,
    abilities,
    abilityAssignments,
    interactions,
    locations,
    stateDefinitions,
    phaseDefinitions,
    eventDefinitions,
    voteDefinitions,
    voteOptionDefinitions,
  };
}

export function importPlanCounts(plan) {
  return {
    characters: plan.characters.length,
    plots: plan.plots.length,
    objectives: plan.objectives.length,
    relationships: plan.relationships.length,
    facts: plan.facts.length,
    initialKnowledge: plan.initialKnowledge.length,
    clues: plan.clues.length,
    clueFacts: plan.clueFacts.length,
    documents: plan.documents.length,
    mediaAssets: plan.mediaAssets.length,
    gameObjects: plan.gameObjects.length,
    resources: plan.resources.length,
    resourceAssignments: plan.resourceAssignments.length,
    abilities: plan.abilities.length,
    abilityAssignments: plan.abilityAssignments.length,
    interactions: plan.interactions.length,
    locations: plan.locations.length,
    stateDefinitions: plan.stateDefinitions.length,
    phaseDefinitions: plan.phaseDefinitions.length,
    eventDefinitions: plan.eventDefinitions.length,
    voteDefinitions: plan.voteDefinitions.length,
    voteOptionDefinitions: plan.voteOptionDefinitions.length,
  };
}
