const GM_PACK_QUERY = `
query GmPack($versionId: UUID!) {
  scenarioVersion(id: $versionId) {
    id
    sourceScenarioId
    versionLabel
    variantName
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
    importedAt

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
      organization { id name slug }
    }
  }

  characters(
    where: {scenarioVersionId: {eq: $versionId}}
    orderBy: {externalId: ASC}
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
    portraitArchetypeCode
    playable
    active
  }

  objectives(
    where: {scenarioVersionId: {eq: $versionId}}
  ) {
    externalId
    ownerType
    ownerExternalId
    title
    description
    objectiveType
    secret
    importance
    active
  }

  relationships(
    where: {scenarioVersionId: {eq: $versionId}}
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

  clues(
    where: {scenarioVersionId: {eq: $versionId}}
  ) {
    externalId
    playerName
    clueType
    playerText
    gmInterpretation
    support
    locationExternalId
    objectExternalId
    documentExternalId
    mediaExternalId
    shareable
    transferable
    consumable
    major
    logisticsCode
    active
  }

  documentDefinitions(
    where: {scenarioVersionId: {eq: $versionId}}
  ) {
    externalId
    title
    support
    mediaExternalIds
    reusable
    consumable
    ownerInitialType
    ownerInitialExternalId
    transferable
    stealable
    active
  }

  mediaAssets(
    where: {scenarioVersionId: {eq: $versionId}}
  ) {
    externalId
    mediaType
    source
    altText
    notes
    active
  }

  gameObjects(
    where: {scenarioVersionId: {eq: $versionId}}
  ) {
    externalId
    name
    description
    support
    ownerInitialType
    ownerInitialExternalId
    initialCharges
    transferable
    stealable
    consumable
    critical
    mediaExternalId
    visualArchetypeCode
    active
  }

  gameLocations(
    where: {scenarioVersionId: {eq: $versionId}}
  ) {
    externalId
    name
    description
    qrCode
    permanent
    lockExternalId
    active
  }

  interactions(
    where: {scenarioVersionId: {eq: $versionId}}
  ) {
    externalId
    name
    category
    targetType
    scanMode
    costResourceExternalId
    costValue
    resolution
    difficulty
    validation
    targetSecret
    active
  }

  gamePhaseDefinitions(
    where: {scenarioVersionId: {eq: $versionId}}
  ) {
    externalId
    name
    orderIndex
    gmDescription
    triggerType
    triggerRef
    manualConfirm
    active
  }

  gameEventDefinitions(
    where: {scenarioVersionId: {eq: $versionId}}
  ) {
    externalId
    title
    gmDescription
    triggerType
    triggerRef
    delayMinutes
    absoluteTime
    phaseExternalId
    validation
    priority
    mandatory
    repeatable
    fallbackGm
    manualFallbackAllowed
    active
  }

  voteDefinitions(
    where: {scenarioVersionId: {eq: $versionId}}
  ) {
    externalId
    title
    question
    scopeType
    scopeRef
    choicesMode
    secret
    votesPerElector
    weighted
    abstention
    modifiable
    active
  }

  voteOptionDefinitions(
    where: {scenarioVersionId: {eq: $versionId}}
  ) {
    externalId
    voteExternalId
    orderIndex
    label
    description
    characterExternalId
    active
  }
}
`;

async function getAdminDataConnect() {
  const [{ initializeApp, getApps }, { getDataConnect }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/data-connect'),
  ]);
  if (!getApps().length) initializeApp();
  return getDataConnect({
    location: 'europe-west1',
    serviceId: 'murder-engine',
  });
}

async function read(operation, variables) {
  const dc = await getAdminDataConnect();
  const response = await dc.executeGraphqlRead(operation, { variables });

  const errors = response?.errors ?? response?.data?.errors ?? [];
  if (Array.isArray(errors) && errors.length) {
    const error = new Error('DATACONNECT_GM_PACK_READ_FAILED');
    error.details = errors;
    throw error;
  }

  return response?.data ?? response;
}

const active = rows => (rows ?? []).filter(x => x?.active !== false);

function parseMediaOverrides(value){
  if(!value)return {};
  try{
    const parsed=JSON.parse(value);
    return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{};
  }catch{
    return {};
  }
}

export function shapeGmPack(data) {
  const version = data?.scenarioVersion;
  if (!version) return null;

  const characters = active(data.characters);
  const objectives = active(data.objectives);
  const relationships = active(data.relationships);
  const clues = active(data.clues);
  const documents = active(data.documentDefinitions);
  const media = active(data.mediaAssets);
  const objects = active(data.gameObjects);
  const locations = active(data.gameLocations);
  const interactions = active(data.interactions);
  const mediaOverrides=parseMediaOverrides(version.mediaOverridesJson);
  const mediaMap=new Map(media.map(m=>[m.externalId,m]));

  const mediaFor=(targetType,targetExternalId,fallbackExternalId=null)=>{
    const override=
      mediaOverrides[`${String(targetType??'').toUpperCase()}:${targetExternalId}`];

    if(override?.source)return {
      externalId:override.assetExternalId??null,
      mediaType:override.mediaType??'IMAGE',
      source:override.source,
      altText:override.altText??override.label??null,
      override:true,
    };

    if(fallbackExternalId){
      const fallback=mediaMap.get(fallbackExternalId);
      if(fallback)return {
        externalId:fallback.externalId,
        mediaType:fallback.mediaType,
        source:fallback.source,
        altText:fallback.altText??null,
        override:false,
      };
    }

    return null;
  };

  const phases = active(data.gamePhaseDefinitions)
    .sort((a,b) => Number(a.orderIndex ?? 0) - Number(b.orderIndex ?? 0));

  const events = active(data.gameEventDefinitions)
    .sort((a,b) => {
      const aa = a.delayMinutes ?? 999999;
      const bb = b.delayMinutes ?? 999999;
      return Number(aa) - Number(bb);
    });

  const votes = active(data.voteDefinitions);
  const voteOptions = active(data.voteOptionDefinitions);

  const optionsByVote = new Map();
  for (const option of voteOptions) {
    if (!optionsByVote.has(option.voteExternalId)) {
      optionsByVote.set(option.voteExternalId, []);
    }
    optionsByVote.get(option.voteExternalId).push(option);
  }

  const shapedVotes = votes.map(v => ({
    ...v,
    options: (optionsByVote.get(v.externalId) ?? [])
      .sort((a,b) => Number(a.orderIndex ?? 0) - Number(b.orderIndex ?? 0)),
  }));

  const majorClues = clues.filter(c => c.major === true);

  const unplacedMajorClues = majorClues.filter(c =>
    !c.locationExternalId &&
    !c.objectExternalId &&
    !c.documentExternalId
  );

  const gmValidatedInteractions = interactions.filter(i =>
    String(i.validation ?? '').toUpperCase() === 'GM' ||
    String(i.resolution ?? '').toUpperCase() === 'GM'
  );


  const characterMap = new Map(characters.map(c => [c.externalId,c]));
  const locationMap = new Map(locations.map(l => [l.externalId,l]));
  const objectMap = new Map(objects.map(o => [o.externalId,o]));
  const documentMap = new Map(documents.map(d => [d.externalId,d]));

  const playerVisibleRelation = value =>
    !['MJ','MJ_ONLY','SECRET_MJ','GM_ONLY']
      .includes(String(value ?? '').toUpperCase());

  const characterSheets = characters
    .filter(c => c.playable !== false)
    .map(character => {

      const sheetObjectives = objectives.filter(o =>
        String(o.ownerType ?? '').toUpperCase() === 'CHARACTER' &&
        o.ownerExternalId === character.externalId
      );

      const sheetRelationships = relationships
        .filter(r =>
          playerVisibleRelation(r.visibility) &&
          (
            r.characterAExternalId === character.externalId ||
            r.characterBExternalId === character.externalId
          )
        )
        .map(r => {
          const isA = r.characterAExternalId === character.externalId;
          const otherId = isA ? r.characterBExternalId : r.characterAExternalId;
          const other = characterMap.get(otherId);

          return {
            externalId:r.externalId,
            otherExternalId:otherId,
            otherName:other?.name ?? otherId,
            otherPublicRole:other?.publicRole ?? null,
            relationType:r.relationType ?? null,
            text:isA ? r.textA : (r.textB || r.textA),
          };
        });

      const startingDocuments = documents.filter(d =>
        String(d.ownerInitialType ?? '').toUpperCase() === 'CHARACTER' &&
        d.ownerInitialExternalId === character.externalId
      );

      const startingObjects = objects.filter(o =>
        String(o.ownerInitialType ?? '').toUpperCase() === 'CHARACTER' &&
        o.ownerInitialExternalId === character.externalId
      );

      return {
        ...character,
        portrait:mediaFor('CHARACTER',character.externalId,character.portraitMediaId),
        objectives:sheetObjectives,
        relationships:sheetRelationships,
        startingDocuments,
        startingObjects:startingObjects.map(o=>({
          ...o,
          media:mediaFor('OBJECT',o.externalId,o.mediaExternalId),
        })),
      };
    });


  const ownerLabel = (type,id) => {
    const safeType=String(type ?? '').toUpperCase();

    if(safeType==='CHARACTER')
      return characterMap.get(id)?.name ?? id ?? 'Personnage';

    if(safeType==='LOCATION')
      return locationMap.get(id)?.name ?? id ?? 'Lieu';

    if(['GM','MJ','ORGANIZATION'].includes(safeType))
      return 'MJ';

    return id || safeType || 'À déterminer';
  };


  const placementRows = [];

  for(const clue of clues){
    let placement='À déterminer';

    if(clue.locationExternalId)
      placement=locationMap.get(clue.locationExternalId)?.name ?? clue.locationExternalId;
    else if(clue.objectExternalId)
      placement=`Avec l’objet : ${objectMap.get(clue.objectExternalId)?.name ?? clue.objectExternalId}`;
    else if(clue.documentExternalId)
      placement=`Dans le document : ${documentMap.get(clue.documentExternalId)?.title ?? clue.documentExternalId}`;

    placementRows.push({
      type:'INDICE',
      externalId:clue.externalId,
      name:clue.playerName,
      placement,
      major:Boolean(clue.major),
      logisticsCode:clue.logisticsCode ?? null,
    });
  }

  for(const doc of documents){
    placementRows.push({
      type:'DOCUMENT',
      externalId:doc.externalId,
      name:doc.title,
      placement:ownerLabel(doc.ownerInitialType,doc.ownerInitialExternalId),
      major:false,
      logisticsCode:null,
    });
  }

  for(const object of objects){
    placementRows.push({
      type:'OBJET',
      externalId:object.externalId,
      name:object.name,
      placement:ownerLabel(object.ownerInitialType,object.ownerInitialExternalId),
      major:Boolean(object.critical),
      logisticsCode:null,
    });
  }


  const setupChecklist = [
    {
      group:'IMPRESSION',
      label:`Imprimer ${characterSheets.length} fiches personnages`,
    },
    {
      group:'IMPRESSION',
      label:`Préparer ${characterSheets.length} QR personnages`,
    },
    {
      group:'IMPRESSION',
      label:`Préparer ${locations.length} QR lieux`,
    },
    {
      group:'MATÉRIEL',
      label:`Préparer ${documents.length} documents de jeu`,
    },
    {
      group:'MATÉRIEL',
      label:`Préparer ${objects.length} objets/accessoires`,
    },
    {
      group:'PLACEMENT',
      label:`Vérifier le placement des ${clues.length} indices`,
    },
    ...(unplacedMajorClues.length ? [{
      group:'ATTENTION',
      label:`Résoudre ${unplacedMajorClues.length} indice(s) majeur(s) sans placement`,
    }] : []),
    ...(events.length ? [{
      group:'LIVE',
      label:`Relire les ${events.length} événements de la timeline`,
    }] : []),
    ...(votes.length ? [{
      group:'LIVE',
      label:`Vérifier les ${votes.length} vote(s) prévu(s)`,
    }] : []),
    ...(gmValidatedInteractions.length ? [{
      group:'LIVE',
      label:`Repérer les ${gmValidatedInteractions.length} interaction(s) nécessitant le MJ`,
    }] : []),
  ];


  const envelopeLabels = characterSheets.map(character => ({
    characterExternalId:character.externalId,
    name:character.name,
    publicRole:character.publicRole ?? null,
    documents:character.startingDocuments.map(d => d.title),
    objects:character.startingObjects.map(o => o.name),
  }));

  const diagnostics = [];

  if (!phases.length && !events.length) {
    diagnostics.push({
      severity: 'WARNING',
      title: 'Timeline vide',
      message: 'Aucune phase ni aucun événement n’est disponible dans le snapshot.',
    });
  }

  if (!locations.length) {
    diagnostics.push({
      severity: 'INFO',
      title: 'Aucun lieu QR',
      message: 'Le scénario ne contient actuellement aucun lieu structuré.',
    });
  }

  if (unplacedMajorClues.length) {
    diagnostics.push({
      severity: 'WARNING',
      title: 'Indices majeurs sans placement',
      message: `${unplacedMajorClues.length} indice(s) majeur(s) ne sont reliés ni à un lieu, ni à un objet, ni à un document.`,
    });
  }

  if (gmValidatedInteractions.length) {
    diagnostics.push({
      severity: 'INFO',
      title: 'Interventions MJ',
      message: `${gmValidatedInteractions.length} interaction(s) demandent une validation ou une résolution MJ.`,
    });
  }

  return {
    scenario: {
      id: version.scenario?.id,
      sourceScenarioId: version.sourceScenarioId,
      title: version.scenario?.title ?? 'Scénario',
      organization: version.scenario?.organization ?? null,

      versionId: version.id,
      versionLabel: version.versionLabel,
      variantName: version.variantName ?? null,
      subtitle: version.subtitle ?? null,
      universe: version.universe ?? null,
      era: version.era ?? null,
      language: version.language,
      durationMinutes: version.durationMinutes ?? null,
      minPlayers: version.minPlayers ?? null,
      maxPlayers: version.maxPlayers ?? null,
      sourceFilename: version.sourceFilename ?? null,
      importedAt: version.importedAt ?? null,
    },

    presentation: {
      skinId:
        version.scenario?.skinId ??
        version.skinId ??
        'CONTEMPORARY_1980_2000',

      accentColor:
        version.scenario?.accentColor ??
        version.accentColor ??
        null,
      logoMediaExternalId: version.logoMediaExternalId ?? null,
      backgroundMediaExternalId: version.backgroundMediaExternalId ?? null,
    },

    counts: {
      characters: characters.filter(c => c.playable !== false).length,
      objectives: objectives.length,
      majorClues: majorClues.length,
      documents: documents.length,
      media: media.length,
      objects: objects.length,
      locations: locations.length,
      interactions: interactions.length,
      gmInteractions: gmValidatedInteractions.length,
      phases: phases.length,
      events: events.length,
      votes: votes.length,
    },

    preparation: {
      gmSummary: version.gmSummary ?? '',
      playerSummary: version.playerSummary ?? '',
      phases,
      events,
      votes: shapedVotes,
      interactions,
    },

    materials: {
      characters,
      objectives,
      relationships,
      clues,
      documents,
      media,
      objects,
      locations,
    },

    logistics: {
      qrCharacters: characters.filter(c => c.playable !== false),
      qrLocations: locations,
      majorClues,
      physicalDocuments: documents,
      criticalObjects: objects.filter(o => o.critical === true),
    },

    printables:{
      characterSheets,
      setupChecklist,
      placementRows,
      envelopeLabels,
    },

    diagnostics,

    capabilities: {
      propsRequiredPersisted: false,
      sessionSpecificMaterials: false,
      pdfRenderer: false,
    },
  };
}

export async function getGmPack(versionId) {
  if (!versionId) throw new Error('VERSION_ID_REQUIRED');

  const data = await read(GM_PACK_QUERY, { versionId });
  const pack = shapeGmPack(data);

  if (!pack) throw new Error('VERSION_NOT_FOUND');
  return pack;
}

export const __gmPackOps = {
  GM_PACK_QUERY,
};
