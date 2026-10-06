
export function summarizeGenderComposition(characters = []) {
  const activePlayable = characters.filter(c => c?.active !== false && c?.playable !== false);
  const counts = { feminine: 0, masculine: 0, flexible: 0, other: 0, total: activePlayable.length };
  for (const character of activePlayable) {
    const v = String(character?.gender ?? '').trim().toUpperCase();
    if (['F','FEMININ','FÉMININ','FEMME','WOMAN','FEMALE'].includes(v)) counts.feminine += 1;
    else if (['M','MASCULIN','H','HOMME','MAN','MALE'].includes(v)) counts.masculine += 1;
    else if (!v || ['NEUTRE','NEUTRAL','ADAPTABLE','UNISEXE','UNISEX','LIBRE','ANY','AU_CHOIX'].includes(v)) counts.flexible += 1;
    else counts.other += 1;
  }
  const parts = [];
  if (counts.feminine) parts.push(`${counts.feminine}F`);
  if (counts.masculine) parts.push(`${counts.masculine}M`);
  if (counts.flexible) parts.push(`${counts.flexible} adapt.`);
  if (counts.other) parts.push(`${counts.other} autre`);
  return { ...counts, label: parts.join(' · ') || 'Non renseignée' };
}

function inferredGenderProfile(composition) {
  if (!composition?.total) return 'NON_RENSEIGNE';
  if (composition.flexible === composition.total) return 'LIBRE';
  if (composition.flexible > 0) return 'ADAPTABLE';
  return 'FIXE';
}

function defaultVariantName(version, composition) {
  const min = version?.minPlayers; const max = version?.maxPlayers;
  if (min != null && max != null && min === max) return `${min} joueurs`;
  if (min != null || max != null) return `${min ?? '?'}–${max ?? '?'} joueurs`;
  return composition?.total ? `${composition.total} joueurs` : `Version ${version?.versionLabel ?? ''}`.trim();
}

const LIST_LIBRARY_QUERY = `
query LibraryScenarios {
  scenarios(orderBy: {updatedAt: DESC}) {
    id
    title
    slug
    archived
    skinId
    accentColor
    createdAt
    updatedAt
    organization { id name slug }
    scenarioVersions_on_scenario(orderBy: {importedAt: DESC}) {
      id
      sourceScenarioId
      versionLabel
      variantName
      genderProfile
      variantNotes
      skinId
      accentColor
      templateVersion
      language
      status
      subtitle
      universe
      era
      durationMinutes
      minPlayers
      maxPlayers
      sourceFilename
      sourceHash
      locked
      importedAt
      characters_on_scenarioVersion { externalId gender playable active }
      facts_on_scenarioVersion { externalId active }
      clues_on_scenarioVersion { externalId major active }
    }
  }
}
`;

const VERSION_OVERVIEW_QUERY = `
query ScenarioVersionOverview($versionId: UUID!) {
  scenarioVersion(id: $versionId) {
    id
    sourceScenarioId
    versionLabel
    variantName
    genderProfile
    variantNotes
    mediaOverridesJson
    templateVersion
    language
    status
    subtitle
    universe
    era
    gmSummary
    playerSummary
    durationMinutes
    minPlayers
    maxPlayers
    sourceFilename
    sourceHash
    importedAt
    scenario { id title slug organization { id name slug } }
    characters_on_scenarioVersion(orderBy: {externalId: ASC}) {
      externalId name publicRole gender importance intensity portraitMediaId portraitArchetypeCode playable active
    }
    facts_on_scenarioVersion(orderBy: {externalId: ASC}) {
      externalId title nature importance isPublic active
    }
    clues_on_scenarioVersion(orderBy: {externalId: ASC}) {
      externalId playerName clueType support major active
    }
    gameObjects(
      where: {scenarioVersionId: {eq: $versionId}}
      orderBy: {externalId: ASC}
    ) {
      externalId
      name
      description
      support
      mediaExternalId
      visualArchetypeCode
      active
    }
  }
}
`;

const CHARACTER_DETAIL_QUERY = `
query CharacterDetail($versionId: UUID!, $externalId: String!) {
  characters(
    where: {
      scenarioVersionId: {eq: $versionId}
      externalId: {eq: $externalId}
    }
    limit: 1
  ) {
    externalId
    name
    publicRole
    dramaticFunction
    narrativeAge
    gender
    importance
    intensity
    biography
    secretIntro
    interpretationNotes
    appearanceNotes
    apparentMotive
    personalTimeline
    motto
    portraitMediaId
    playable
    active
  }
  allCharacters: characters(
    where: {scenarioVersionId: {eq: $versionId}}
    orderBy: {externalId: ASC}
  ) {
    externalId
    name
    publicRole
  }
  objectives(
    where: {
      scenarioVersionId: {eq: $versionId}
      ownerType: {eq: "CHARACTER"}
      ownerExternalId: {eq: $externalId}
    }
    orderBy: {externalId: ASC}
  ) {
    externalId
    title
    description
    objectiveType
    secret
    initialStatus
    triggerExternalId
    importance
    active
  }
  relationships(
    where: {scenarioVersionId: {eq: $versionId}}
    orderBy: {externalId: ASC}
  ) {
    externalId
    characterAExternalId
    characterBExternalId
    relationType
    textA
    textB
    visibility
    plotExternalId
    active
  }
  initialKnowledges(
    where: {
      scenarioVersionId: {eq: $versionId}
      characterExternalId: {eq: $externalId}
    }
  ) {
    factExternalId
    sourceType
  }
  facts(
    where: {scenarioVersionId: {eq: $versionId}}
    orderBy: {externalId: ASC}
  ) {
    externalId
    title
    text
    nature
    importance
    notebookCategory
    isPublic
    active
  }
}
`;

function parseMediaOverrides(value) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function getAdminDataConnect() {
  const [{ initializeApp, getApps }, { getDataConnect }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/data-connect'),
  ]);
  if (!getApps().length) initializeApp();
  return getDataConnect({ location: 'europe-west1', serviceId: 'murder-engine' });
}

async function executeRead(operation, variables = undefined) {
  const dc = await getAdminDataConnect();
  const response = await dc.executeGraphqlRead(operation, variables ? { variables } : undefined);
  const errors = response?.errors ?? response?.data?.errors ?? [];
  if (Array.isArray(errors) && errors.length) {
    const error = new Error('DATACONNECT_READ_FAILED');
    error.details = errors;
    throw error;
  }
  return response?.data ?? response;
}


async function executeWrite(operation, variables) {
  const dc = await getAdminDataConnect();
  const response = await dc.executeGraphql(operation, { variables });
  const errors = response?.errors ?? response?.data?.errors ?? [];
  if (Array.isArray(errors) && errors.length) {
    const error = new Error('DATACONNECT_WRITE_FAILED');
    error.details = errors;
    throw error;
  }
  return response?.data ?? response;
}

const SET_SCENARIO_VERSION_STATUS_MUTATION = `
mutation SetScenarioVersionStatus($versionId: UUID!, $status: String!) {
  scenarioVersion_update(
    id: $versionId,
    data: { status: $status }
  )
}
`;

export async function setScenarioVersionArchived(versionId, archived) {
  if (!versionId) throw new Error('VERSION_ID_REQUIRED');

  const status = archived ? 'ARCHIVED' : 'READY';

  await executeWrite(
    SET_SCENARIO_VERSION_STATUS_MUTATION,
    { versionId, status }
  );

  return {
    id: versionId,
    status,
    archived: status === 'ARCHIVED',
  };
}

export async function listScenarioLibrary() {
  const data = await executeRead(LIST_LIBRARY_QUERY);
  return (data?.scenarios ?? []).map(scenario => ({
    id: scenario.id,
    title: scenario.title,
    slug: scenario.slug,
    archived: scenario.archived,

    // V1.10 — le scénario porte l'apparence.
    // Fallback sur une ancienne ScenarioVersion pour les scénarios pré-V1.10.
    skinId:
      scenario.skinId ??
      (scenario.scenarioVersions_on_scenario ?? []).find(v => v.skinId)?.skinId ??
      'CONTEMPORARY_1980_2000',

    accentColor:
      scenario.accentColor ??
      (scenario.scenarioVersions_on_scenario ?? []).find(v => v.accentColor)?.accentColor ??
      null,

    createdAt: scenario.createdAt,
    updatedAt: scenario.updatedAt,
    organization: scenario.organization,
    versions: (scenario.scenarioVersions_on_scenario ?? []).map(version => {
      const genderComposition = summarizeGenderComposition(version.characters_on_scenarioVersion ?? []);
      return {
      ...version,
      variantName: version.variantName || defaultVariantName(version, genderComposition),
      genderProfile: version.genderProfile || inferredGenderProfile(genderComposition),
      genderComposition,
      counts: {
        characters: (version.characters_on_scenarioVersion ?? []).filter(x => x.active !== false).length,
        playableCharacters: (version.characters_on_scenarioVersion ?? []).filter(x => x.active !== false && x.playable !== false).length,
        facts: (version.facts_on_scenarioVersion ?? []).filter(x => x.active !== false).length,
        clues: (version.clues_on_scenarioVersion ?? []).filter(x => x.active !== false).length,
        majorClues: (version.clues_on_scenarioVersion ?? []).filter(x => x.active !== false && x.major === true).length,
      },
      characters_on_scenarioVersion: undefined,
      facts_on_scenarioVersion: undefined,
      clues_on_scenarioVersion: undefined,
    };
    }),
  }));
}

export async function getScenarioVersionOverview(versionId) {
  const data = await executeRead(VERSION_OVERVIEW_QUERY, { versionId });
  const version = data?.scenarioVersion;
  if (!version) return null;
  const genderComposition = summarizeGenderComposition(version.characters_on_scenarioVersion ?? []);
  return {
    ...version,
    variantName: version.variantName || defaultVariantName(version, genderComposition),
    genderProfile: version.genderProfile || inferredGenderProfile(genderComposition),
    genderComposition,
    counts: {
      characters: (version.characters_on_scenarioVersion ?? []).filter(x => x.active !== false).length,
      playableCharacters: (version.characters_on_scenarioVersion ?? []).filter(x => x.active !== false && x.playable !== false).length,
      facts: (version.facts_on_scenarioVersion ?? []).filter(x => x.active !== false).length,
      clues: (version.clues_on_scenarioVersion ?? []).filter(x => x.active !== false).length,
      majorClues: (version.clues_on_scenarioVersion ?? []).filter(x => x.active !== false && x.major === true).length,
    },
    characters: version.characters_on_scenarioVersion ?? [],
    facts: version.facts_on_scenarioVersion ?? [],
    clues: version.clues_on_scenarioVersion ?? [],
    objects: version.gameObjects ?? [],
    mediaOverrides: parseMediaOverrides(version.mediaOverridesJson),
    characters_on_scenarioVersion: undefined,
    facts_on_scenarioVersion: undefined,
    clues_on_scenarioVersion: undefined,
    gameObjects: undefined,
  };
}

export function shapeCharacterDetail(data, externalId) {
  const character = data?.characters?.[0];
  if (!character) return null;

  const names = new Map((data.allCharacters ?? []).map(c => [c.externalId, c]));
  const facts = new Map((data.facts ?? []).map(f => [f.externalId, f]));

  const knowledge = (data.initialKnowledges ?? [])
    .map(k => ({ ...k, fact: facts.get(k.factExternalId) ?? null }))
    .filter(k => k.fact);

  const relationships = (data.relationships ?? [])
    .filter(r => r.active !== false && (r.characterAExternalId === externalId || r.characterBExternalId === externalId))
    .map(r => {
      const isA = r.characterAExternalId === externalId;
      const otherExternalId = isA ? r.characterBExternalId : r.characterAExternalId;
      const other = names.get(otherExternalId);
      return {
        externalId: r.externalId,
        otherExternalId,
        otherName: other?.name ?? otherExternalId,
        otherPublicRole: other?.publicRole ?? null,
        relationType: r.relationType,
        text: isA ? r.textA : (r.textB || r.textA),
        visibility: r.visibility,
        plotExternalId: r.plotExternalId,
      };
    });

  return {
    character,
    objectives: (data.objectives ?? []).filter(o => o.active !== false),
    relationships,
    knowledge,
  };
}

export async function getCharacterDetail(versionId, externalId) {
  const data = await executeRead(CHARACTER_DETAIL_QUERY, { versionId, externalId });
  return shapeCharacterDetail(data, externalId);
}

export const __queries = {
  LIST_LIBRARY_QUERY,
  VERSION_OVERVIEW_QUERY,
  CHARACTER_DETAIL_QUERY,
};
