import { randomBytes, randomUUID } from 'node:crypto';

const LIST_SESSIONS_QUERY = `
query SessionLibrary {
  gameSessions(orderBy: {createdAt: DESC}) {
    id
    name
    scheduledAt
    venue
    language
    status
    notes
    precastEnabled
    precastToken
    precastOpenCount
    precastLastOpenedAt
    precastSubmissionCount
    runtimeInitializedAt
    runtimeVersion
    startedAt
    pausedAt
    finishedAt
    createdAt
    organization { id name slug }
    scenarioVersion {
      id
      versionLabel
      variantName
      genderProfile
      minPlayers
      maxPlayers
      scenario { id title slug }
    }
    sessionParticipants_on_gameSession {
      id
      displayName
      characterExternalId
      characterDisplayName
      characterGenderVariant
      characterSnapshotJson
      characterSnapshotAt
      active
      source
      precastSubmittedAt
    
    }
  }
}
`;

const GET_SESSION_QUERY = `
query SessionDetail($sessionId: UUID!) {
  gameSession(id: $sessionId) {
    id
    name
    scheduledAt
    venue
    language
    status
    notes
    precastEnabled
    precastToken
    precastOpenCount
    precastLastOpenedAt
    precastSubmissionCount
    runtimeInitializedAt
    runtimeVersion
    startedAt
    pausedAt
    finishedAt
    createdAt
    organization { id name slug }
    scenarioVersion {
      id
      versionLabel
      variantName
      genderProfile
      language
      minPlayers
      maxPlayers
      durationMinutes
      scenario { id title slug }
      characters_on_scenarioVersion(orderBy: {externalId: ASC}) {
        externalId
        name
        publicRole
        gender
        importance
        intensity
        playable
        active
      }
    }
    sessionParticipants_on_gameSession(orderBy: {createdAt: ASC}) {
      id
      displayName
      email
      ageBracket
      genderPreference
      desiredInvolvement
      characterExternalId
      castingLocked
      briefingStatus
      playerAccessToken
      playerAccessEnabled
      playerFirstOpenedAt
      playerLastOpenedAt
      playerOpenCount
      briefingReadAt
      source
      precastSubmittedAt
      notes
      active
      createdAt
    }
  }
}
`;

const GET_VERSION_FOR_SESSION_QUERY = `
query VersionForSession($versionId: UUID!) {
  scenarioVersion(id: $versionId) {
    id
    versionLabel
    variantName
    genderProfile
    language
    scenario { id title organization { id name slug } }
  }
}
`;

const GET_PRECAST_SESSION_QUERY = `
query PublicPrecastSession($token: String!) {
  gameSessions(where: {precastToken: {eq: $token}}) {
    id
    name
    scheduledAt
    venue
    language
    status
    precastEnabled
    precastOpenCount
    precastSubmissionCount
    scenarioVersion {
      id
      versionLabel
      playerSummary
      scenario { id title slug }
    }
    sessionParticipants_on_gameSession {
      id
      displayName
      email
      active
      source
      precastSubmittedAt
    }
  }
}
`;

const CREATE_SESSION_MUTATION = `
mutation CreateGameSession($data: GameSession_Data!) {
  gameSession_insert(data: $data)
}
`;

const ADD_PARTICIPANT_MUTATION = `
mutation AddSessionParticipant($data: SessionParticipant_Data!) {
  sessionParticipant_insert(data: $data)
}
`;

const UPDATE_PRECAST_PARTICIPANT_MUTATION = `
mutation UpdatePrecastParticipant(
  $participantId: UUID!
  $displayName: String!
  $email: String
  $ageBracket: String
  $genderPreference: String
  $desiredInvolvement: String!
  $source: String!
  $submittedAt: Timestamp!
  $notes: String
) {
  sessionParticipant_update(
    id: $participantId
    data: {
      displayName: $displayName
      email: $email
      ageBracket: $ageBracket
      genderPreference: $genderPreference
      desiredInvolvement: $desiredInvolvement
      source: $source
      precastSubmittedAt: $submittedAt
      notes: $notes
    }
  )
}
`;

const ASSIGN_CHARACTER_MUTATION = `
mutation AssignSessionCharacter($participantId: UUID!, $characterExternalId: String, $castingLocked: Boolean!) {
  sessionParticipant_update(
    id: $participantId
    data: { characterExternalId: $characterExternalId, castingLocked: $castingLocked }
  )
}
`;

const UPDATE_SESSION_STATUS_MUTATION = `
mutation UpdateSessionStatus($sessionId: UUID!, $status: String!) {
  gameSession_update(id: $sessionId, data: { status: $status })
}
`;

const UPDATE_SESSION_DETAILS_MUTATION = `
mutation UpdateSessionDetails($sessionId: UUID!, $name: String!, $scheduledAt: Timestamp, $venue: String, $language: String!) {
  gameSession_update(
    id: $sessionId
    data: { name: $name, scheduledAt: $scheduledAt, venue: $venue, language: $language }
  )
}
`;

const SET_SESSION_ARCHIVED_MUTATION = `
mutation SetSessionArchived($sessionId: UUID!, $status: String!, $precastEnabled: Boolean!) {
  gameSession_update(id: $sessionId, data: { status: $status, precastEnabled: $precastEnabled })
}
`;

const DELETE_SESSION_MUTATION = `
mutation DeleteGameSession($sessionId: UUID!) {
  gameSession_delete(id: $sessionId)
}
`;

const CONFIGURE_PRECAST_MUTATION = `
mutation ConfigurePrecast($sessionId: UUID!, $enabled: Boolean!, $token: String) {
  gameSession_update(id: $sessionId, data: { precastEnabled: $enabled, precastToken: $token })
}
`;

const TRACK_PRECAST_OPEN_MUTATION = `
mutation TrackPrecastOpen($sessionId: UUID!, $count: Int!, $openedAt: Timestamp!) {
  gameSession_update(id: $sessionId, data: { precastOpenCount: $count, precastLastOpenedAt: $openedAt })
}
`;

const TRACK_PRECAST_SUBMISSION_MUTATION = `
mutation TrackPrecastSubmission($sessionId: UUID!, $count: Int!) {
  gameSession_update(id: $sessionId, data: { precastSubmissionCount: $count })
}
`;

const ALLOWED_PRELIVE_STATUSES = new Set(['DRAFT', 'CASTING', 'READY']);
const ALLOWED_PRECAST_STATUSES = new Set(['DRAFT', 'CASTING']);
const ALLOWED_INVOLVEMENT = new Set(['TRANQUILLE', 'ACTIF', 'TRES_IMPLIQUE', 'PREMIER_ROLE']);
const ALLOWED_AGE_BRACKETS = new Set(['MOINS_18', '18_25', '26_40', '41_60', '60_PLUS']);
const ALLOWED_CHARACTER_PREFERENCES = new Set(['', 'SANS_PREFERENCE', 'MASCULIN', 'FEMININ', 'A_DISCUTER']);

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
    const error = new Error('DATACONNECT_SESSION_READ_FAILED');
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
    const error = new Error('DATACONNECT_SESSION_WRITE_FAILED');
    error.details = errors;
    throw error;
  }
  return response?.data ?? response;
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function cleanText(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

function validatePrecastInput(input) {
  const displayName = cleanText(input?.displayName, 80);
  if (displayName.length < 2) throw new Error('PARTICIPANT_NAME_REQUIRED');

  const email = normalizeEmail(input?.email);
  if (!email) throw new Error('EMAIL_REQUIRED');
  if (!email.includes('@') || email.length > 254) throw new Error('INVALID_EMAIL');

  const involvement = cleanText(input?.desiredInvolvement || 'ACTIF', 30).toUpperCase();
  if (!ALLOWED_INVOLVEMENT.has(involvement)) throw new Error('INVALID_INVOLVEMENT');

  const ageBracket = cleanText(input?.ageBracket, 30).toUpperCase();
  if (!ageBracket) throw new Error('AGE_BRACKET_REQUIRED');
  if (!ALLOWED_AGE_BRACKETS.has(ageBracket)) throw new Error('INVALID_AGE_BRACKET');

  const genderPreference = cleanText(input?.genderPreference, 30).toUpperCase();
  if (!ALLOWED_CHARACTER_PREFERENCES.has(genderPreference)) throw new Error('INVALID_CHARACTER_PREFERENCE');

  return {
    displayName,
    email,
    ageBracket,
    genderPreference: genderPreference || null,
    desiredInvolvement: involvement,
    notes: cleanText(input?.notes, 500) || null,
  };
}

function safePrecastToken(token) {
  const value = String(token ?? '').trim();
  if (!/^[A-Za-z0-9_-]{24,120}$/.test(value)) throw new Error('INVALID_PRECAST_TOKEN');
  return value;
}

export function shapeSessionSummary(session) {
  const participants = (session.sessionParticipants_on_gameSession ?? []).filter(p => p.active !== false);
  const assigned = participants.filter(p => Boolean(p.characterExternalId));
  return {
    id: session.id,
    name: session.name,
    scheduledAt: session.scheduledAt,
    venue: session.venue,
    language: session.language,
    status: session.status,
    notes: session.notes,
    precastEnabled: Boolean(session.precastEnabled),
    precastToken: session.precastToken ?? null,
    precastOpenCount: Number(session.precastOpenCount ?? 0),
    precastLastOpenedAt: session.precastLastOpenedAt ?? null,
    precastSubmissionCount: Number(session.precastSubmissionCount ?? 0),
    runtimeInitializedAt: session.runtimeInitializedAt ?? null,
    runtimeVersion: session.runtimeVersion ?? null,
    startedAt: session.startedAt,
    pausedAt: session.pausedAt,
    finishedAt: session.finishedAt,
    createdAt: session.createdAt,
    organization: session.organization,
    scenarioVersion: session.scenarioVersion,
    counts: { participants: participants.length, assigned: assigned.length },
  };
}

export function shapeSessionDetail(session) {
  if (!session) return null;
  const participants = (session.sessionParticipants_on_gameSession ?? []).filter(p => p.active !== false);
  const characters = (session.scenarioVersion?.characters_on_scenarioVersion ?? []).filter(c => c.active !== false && c.playable !== false);
  const assignedIds = new Set(participants.map(p => p.characterExternalId).filter(Boolean));
  return {
    ...shapeSessionSummary(session),
    scenarioVersion: {
      ...session.scenarioVersion,
      characters_on_scenarioVersion: undefined,
    },
    participants,
    characters,
    counts: {
      participants: participants.length,
      assigned: participants.filter(p => Boolean(p.characterExternalId)).length,
      playableCharacters: characters.length,
      unassignedParticipants: participants.filter(p => !p.characterExternalId).length,
      unassignedCharacters: characters.filter(c => !assignedIds.has(c.externalId)).length,
      precastParticipants: participants.filter(p => Boolean(p.precastSubmittedAt)).length,
    },
  
  };
}



// ---------------------------------------------------------------------------
// V1.6 — session preparation assistant & casting recommendations
// ---------------------------------------------------------------------------

const INVOLVEMENT_LEVEL = { TRANQUILLE: 1, ACTIF: 2, TRES_IMPLIQUE: 3, PREMIER_ROLE: 4 };

function normalizedCharacterGender(value) {
  const v = String(value ?? '').trim().toUpperCase();
  if (['F','FEMININ','FÉMININ','FEMME','WOMAN','FEMALE'].includes(v)) return 'FEMININ';
  if (['M','MASCULIN','H','HOMME','MAN','MALE'].includes(v)) return 'MASCULIN';
  if (!v || ['NEUTRE','NEUTRAL','ADAPTABLE','UNISEXE','UNISEX','LIBRE','ANY','AU_CHOIX'].includes(v)) return 'ADAPTABLE';
  return 'AUTRE';
}

function characterInvolvementLevel(character) {
  const importance = String(character?.importance ?? '').trim().toUpperCase();
  const intensity = String(character?.intensity ?? '').trim().toUpperCase();
  let importanceLevel = 2;
  if (['MAIN','MAJEUR','MAJOR','PRIMARY','CENTRAL','CRITICAL','CRITIQUE'].includes(importance)) importanceLevel = 4;
  else if (['IMPORTANT','HIGH','HAUTE','SECONDARY','SECONDAIRE'].includes(importance)) importanceLevel = 3;
  else if (['MINOR','MINEUR','BACKGROUND','FIGURANT','LOW','FAIBLE'].includes(importance)) importanceLevel = 1;
  let intensityLevel = 2;
  if (['TRES_FORTE','TRÈS_FORTE','VERY_HIGH','INTENSE','HAUTE','HIGH','FORTE'].includes(intensity)) intensityLevel = 4;
  else if (['STANDARD','MEDIUM','MOYENNE','MOYEN'].includes(intensity)) intensityLevel = 3;
  else if (['LOW','FAIBLE','LIGHT','LEGERE','LÉGÈRE'].includes(intensity)) intensityLevel = 1;
  return Math.max(1, Math.min(4, Math.round((importanceLevel + intensityLevel) / 2)));
}

function scoreCastingPair(participant, character) {
  const reasons = [];
  let score = 0;
  const desired = INVOLVEMENT_LEVEL[String(participant?.desiredInvolvement ?? 'ACTIF').toUpperCase()] ?? 2;
  const roleLevel = characterInvolvementLevel(character);
  const gap = Math.abs(desired - roleLevel);
  score += 28 - gap * 9;
  if (gap === 0) reasons.push('niveau d’implication cohérent');
  else if (gap === 1) reasons.push('niveau d’implication proche');
  else reasons.push('implication à vérifier');

  const preference = String(participant?.genderPreference ?? 'SANS_PREFERENCE').trim().toUpperCase();
  const gender = normalizedCharacterGender(character?.gender);
  if (preference === 'FEMININ' || preference === 'MASCULIN') {
    if (gender === preference) { score += 22; reasons.push('préférence de personnage respectée'); }
    else if (gender === 'ADAPTABLE') { score += 12; reasons.push('personnage adaptable'); }
    else { score -= 28; reasons.push('préférence de personnage non optimale'); }
  } else if (gender === 'ADAPTABLE') {
    score += 3; reasons.push('personnage adaptable');
  }

  if (desired === 4 && roleLevel >= 4) { score += 8; reasons.push('rôle central compatible'); }
  if (desired === 1 && roleLevel <= 2) { score += 5; reasons.push('pression de jeu limitée'); }

  return { score, reasons, desiredLevel: desired, roleLevel, characterGender: gender };
}

export function buildCastingProposal(session) {
  if (!session) return { assignments: [], unassignedParticipants: [], warnings: [] };
  const participants = (session.participants ?? []).filter(p => p.active !== false);
  const characters = (session.characters ?? []).filter(c => c.active !== false && c.playable !== false);
  const fixedParticipantIds = new Set(participants.filter(p => p.characterExternalId).map(p => p.id));
  const usedCharacters = new Set(participants.map(p => p.characterExternalId).filter(Boolean));
  const openParticipants = participants.filter(p => !fixedParticipantIds.has(p.id));
  const openCharacters = characters.filter(c => !usedCharacters.has(c.externalId));

  const edges = [];
  for (const participant of openParticipants) {
    for (const character of openCharacters) {
      const scored = scoreCastingPair(participant, character);
      edges.push({ participant, character, ...scored });
    }
  }
  edges.sort((a,b) => b.score - a.score || String(a.participant.displayName).localeCompare(String(b.participant.displayName)) || String(a.character.externalId).localeCompare(String(b.character.externalId)));

  const assignedParticipants = new Set();
  const assignedCharacters = new Set();
  const assignments = [];
  for (const edge of edges) {
    if (assignedParticipants.has(edge.participant.id) || assignedCharacters.has(edge.character.externalId)) continue;
    assignedParticipants.add(edge.participant.id);
    assignedCharacters.add(edge.character.externalId);
    assignments.push({
      participantId: edge.participant.id,
      participantName: edge.participant.displayName,
      characterExternalId: edge.character.externalId,
      characterName: edge.character.name,
      publicRole: edge.character.publicRole ?? null,
      score: edge.score,
      confidence: edge.score >= 38 ? 'HAUTE' : edge.score >= 20 ? 'MOYENNE' : 'A_VERIFIER',
      reasons: edge.reasons,
    });
  }
  const unassignedParticipants = openParticipants.filter(p => !assignedParticipants.has(p.id)).map(p => ({ id:p.id, displayName:p.displayName }));
  const warnings = [];
  if (participants.length > characters.length) warnings.push('PLUS_DE_PARTICIPANTS_QUE_DE_ROLES');
  if (unassignedParticipants.length) warnings.push('PARTICIPANTS_SANS_PROPOSITION');
  return { assignments, unassignedParticipants, warnings };
}

export function buildSessionPreparation(session) {
  if (!session) return null;
  const participants = (session.participants ?? []).filter(p => p.active !== false);
  const characters = (session.characters ?? []).filter(c => c.active !== false && c.playable !== false);
  const minPlayers = Number(session.scenarioVersion?.minPlayers ?? characters.length ?? 0);
  const maxPlayers = Number(session.scenarioVersion?.maxPlayers ?? characters.length ?? 0);
  const countCompatible = participants.length > 0 && participants.length >= minPlayers && participants.length <= maxPlayers;
  const profilesComplete = participants.length > 0 && participants.every(p => Boolean(p.email && p.ageBracket && p.desiredInvolvement));
  const assigned = participants.filter(p => Boolean(p.characterExternalId));
  const uniqueAssignments = new Set(assigned.map(p => p.characterExternalId)).size === assigned.length;
  const allAssigned = participants.length > 0 && assigned.length === participants.length && uniqueAssignments;
  const assignedKnown = assigned.every(p => characters.some(c => c.externalId === p.characterExternalId));
  const canMarkReady = countCompatible && profilesComplete && allAssigned && assignedKnown;
  const steps = [
    { id:'VARIANT', label:'Variante sélectionnée', ready:Boolean(session.scenarioVersion?.id), detail:session.scenarioVersion?.variantName || `V${session.scenarioVersion?.versionLabel ?? ''}` },
    { id:'GROUP', label:'Groupe compatible', ready:countCompatible, detail:`${participants.length} participant(s) · attendu ${minPlayers === maxPlayers ? minPlayers : `${minPlayers}–${maxPlayers}`}` },
    { id:'PROFILES', label:'Profils participants', ready:profilesComplete, detail:profilesComplete ? 'Préférences exploitables' : 'E-mail, âge ou implication à compléter' },
    { id:'CASTING', label:'Casting complet', ready:allAssigned && assignedKnown, detail:`${assigned.length}/${participants.length} rôle(s) attribué(s)` },
    { id:'READY', label:'Session marquée prête', ready:session.status === 'READY', detail:session.status === 'READY' ? 'Prête pour initialisation' : 'À valider par le MJ' },
    { id:'RUNTIME', label:'Runtime initialisé', ready:Boolean(session.runtimeInitializedAt), detail:session.runtimeInitializedAt ? 'État joueur créé' : 'Après validation du casting' },
  ];
  const coreSteps = steps.slice(0,4);
  const progress = Math.round((coreSteps.filter(x=>x.ready).length / coreSteps.length) * 100);
  return { minPlayers, maxPlayers, countCompatible, profilesComplete, allAssigned, assignedKnown, canMarkReady, progress, steps };
}

export async function getSessionSetupAssistant(sessionId, { reader = defaultReader } = {}) {
  const session = await getGameSession(sessionId, { reader });
  if (!session) throw new Error('SESSION_NOT_FOUND');
  return { preparation: buildSessionPreparation(session), proposal: buildCastingProposal(session) };
}

export async function applySessionCastingAssignments(sessionId, assignments, { reader = defaultReader, executor = defaultExecutor } = {}) {
  if (!sessionId) throw new Error('SESSION_ID_REQUIRED');
  const session = await getGameSession(sessionId, { reader });
  if (!session) throw new Error('SESSION_NOT_FOUND');
  if (session.runtimeInitializedAt) throw new Error('RUNTIME_ALREADY_INITIALIZED');
  if (session.status === 'ARCHIVED') throw new Error('SESSION_ARCHIVED');
  const requested = Array.isArray(assignments) ? assignments : [];
  if (!requested.length) throw new Error('CASTING_ASSIGNMENTS_REQUIRED');
  if (requested.length > 50) throw new Error('TOO_MANY_CASTING_ASSIGNMENTS');

  const participantIds = new Set(session.participants.map(p => p.id));
  const characterIds = new Set(session.characters.map(c => c.externalId));
  const touchedParticipants = new Set();
  const touchedCharacters = new Set();
  for (const item of requested) {
    const participantId = String(item?.participantId ?? '').trim();
    const characterExternalId = String(item?.characterExternalId ?? '').trim();
    if (!participantIds.has(participantId)) throw new Error('PARTICIPANT_NOT_FOUND');
    if (!characterIds.has(characterExternalId)) throw new Error('CHARACTER_NOT_AVAILABLE');
    if (touchedParticipants.has(participantId)) throw new Error('PARTICIPANT_DUPLICATED_IN_CASTING');
    if (touchedCharacters.has(characterExternalId)) throw new Error('CHARACTER_DUPLICATED_IN_CASTING');
    touchedParticipants.add(participantId); touchedCharacters.add(characterExternalId);
  }
  const untouchedAssigned = session.participants.filter(p => p.characterExternalId && !touchedParticipants.has(p.id));
  for (const p of untouchedAssigned) {
    if (touchedCharacters.has(p.characterExternalId)) throw new Error('CHARACTER_ALREADY_ASSIGNED');
  }
  for (const item of requested) {
    await executor(ASSIGN_CHARACTER_MUTATION, { participantId:String(item.participantId), characterExternalId:String(item.characterExternalId), castingLocked:true });
  }
  return { sessionId, applied: requested.length };
}

export function shapePublicPrecastSession(session) {
  if (!session) return null;
  return {
    name: session.name,
    scheduledAt: session.scheduledAt,
    venue: session.venue,
    language: session.language,
    status: session.status,
    scenario: {
      title: session.scenarioVersion?.scenario?.title ?? 'Murder Party',
      versionLabel: session.scenarioVersion?.versionLabel ?? null,
      playerSummary: session.scenarioVersion?.playerSummary ?? null,
    },
  };
}

export async function listGameSessions({ reader = defaultReader } = {}) {
  const data = await reader(LIST_SESSIONS_QUERY);
  return (data?.gameSessions ?? []).map(shapeSessionSummary);
}

export async function getGameSession(sessionId, { reader = defaultReader } = {}) {
  const data = await reader(GET_SESSION_QUERY, { sessionId });
  return shapeSessionDetail(data?.gameSession ?? null);
}

export async function createGameSession(input, { reader = defaultReader, executor = defaultExecutor } = {}) {
  const versionId = String(input?.versionId ?? '').trim();
  if (!versionId) throw new Error('VERSION_ID_REQUIRED');

  const lookup = await reader(GET_VERSION_FOR_SESSION_QUERY, { versionId });
  const version = lookup?.scenarioVersion;
  if (!version?.scenario?.organization?.id) throw new Error('SCENARIO_VERSION_NOT_FOUND');

  const id = randomUUID();
  const scheduledAt = input?.scheduledAt ? String(input.scheduledAt) : null;
  const name = String(input?.name ?? '').trim() || `${version.scenario.title} — ${version.versionLabel}`;
  const language = String(input?.language ?? version.language ?? 'FR').trim().toUpperCase() || 'FR';
  if (!['FR','EN'].includes(language)) throw new Error('INVALID_SESSION_LANGUAGE');

  await executor(CREATE_SESSION_MUTATION, {
    data: {
      id,
      organizationId: version.scenario.organization.id,
      scenarioVersionId: version.id,
      name,
      scheduledAt,
      venue: String(input?.venue ?? '').trim() || null,
      language,
      status: 'DRAFT',
      notes: String(input?.notes ?? '').trim() || null,
      precastEnabled: false,
      precastToken: null,
      precastOpenCount: 0,
      precastSubmissionCount: 0,
    },
  });

  return { id, status: 'DRAFT', name };
}

export async function addGameSessionParticipant(sessionId, input, { reader = defaultReader, executor = defaultExecutor } = {}) {
  const displayName = String(input?.displayName ?? '').trim();
  if (!sessionId) throw new Error('SESSION_ID_REQUIRED');
  if (!displayName) throw new Error('PARTICIPANT_NAME_REQUIRED');
  const detail = await getGameSession(sessionId, { reader });
  if (!detail) throw new Error('SESSION_NOT_FOUND');
  if (detail.runtimeInitializedAt) throw new Error('RUNTIME_ALREADY_INITIALIZED');
  if (detail.status === 'ARCHIVED') throw new Error('SESSION_ARCHIVED');

  const involvement = String(input?.desiredInvolvement ?? 'ACTIF').trim().toUpperCase();
  if (!ALLOWED_INVOLVEMENT.has(involvement)) throw new Error('INVALID_INVOLVEMENT');

  const email = normalizeEmail(input?.email);
  if (!email) throw new Error('EMAIL_REQUIRED');
  if (!email.includes('@') || email.length > 254) throw new Error('INVALID_EMAIL');

  const ageBracket = String(input?.ageBracket ?? '').trim().toUpperCase();
  if (!ageBracket) throw new Error('AGE_BRACKET_REQUIRED');
  if (!ALLOWED_AGE_BRACKETS.has(ageBracket)) throw new Error('INVALID_AGE_BRACKET');

  const id = randomUUID();
  await executor(ADD_PARTICIPANT_MUTATION, {
    data: {
      id,
      gameSessionId: sessionId,
      displayName,
      email,
      ageBracket,
      genderPreference: String(input?.genderPreference ?? '').trim() || null,
      desiredInvolvement: involvement,
      characterExternalId: null,
      castingLocked: false,
      briefingStatus: 'NOT_SENT',
      playerAccessEnabled: false,
      playerAccessToken: null,
      playerOpenCount: 0,
      source: 'MANUAL',
      precastSubmittedAt: null,
      notes: String(input?.notes ?? '').trim() || null,
      active: true,
    },
  });
  return { id, displayName };
}

export async function assignCharacterToParticipant(sessionId, participantId, characterExternalId, { reader = defaultReader, executor = defaultExecutor } = {}) {
  if (!sessionId || !participantId) throw new Error('SESSION_AND_PARTICIPANT_REQUIRED');
  const targetCharacter = characterExternalId ? String(characterExternalId).trim() : null;
  const detail = await getGameSession(sessionId, { reader });
  if (!detail) throw new Error('SESSION_NOT_FOUND');

  if (detail.runtimeInitializedAt) throw new Error('RUNTIME_ALREADY_INITIALIZED');
  if (detail.status === 'ARCHIVED') throw new Error('SESSION_ARCHIVED');
  const participant = detail.participants.find(p => p.id === participantId);
  if (!participant) throw new Error('PARTICIPANT_NOT_FOUND');

  if (targetCharacter) {
    const character = detail.characters.find(c => c.externalId === targetCharacter);
    if (!character) throw new Error('CHARACTER_NOT_AVAILABLE');
    const conflict = detail.participants.find(p => p.id !== participantId && p.characterExternalId === targetCharacter);
    if (conflict) throw new Error('CHARACTER_ALREADY_ASSIGNED');
  }

  await executor(ASSIGN_CHARACTER_MUTATION, {
    participantId,
    characterExternalId: targetCharacter,
    castingLocked: Boolean(targetCharacter),
  });
  return { participantId, characterExternalId: targetCharacter };
}

export async function updateGameSessionDetails(sessionId, input, { reader = defaultReader, executor = defaultExecutor } = {}) {
  if (!sessionId) throw new Error('SESSION_ID_REQUIRED');
  const detail = await getGameSession(sessionId, { reader });
  if (!detail) throw new Error('SESSION_NOT_FOUND');
  if (detail.status === 'ARCHIVED') throw new Error('SESSION_ARCHIVED');
  if (detail.startedAt || detail.pausedAt || detail.finishedAt || ['LIVE','PAUSED','FINISHED'].includes(detail.status)) {
    throw new Error('SESSION_SCHEDULE_LOCKED_AFTER_START');
  }

  const name = cleanText(input?.name, 120);
  if (!name) throw new Error('SESSION_NAME_REQUIRED');
  const venue = cleanText(input?.venue, 180) || null;
  const language = String(input?.language ?? detail.language ?? 'FR').trim().toUpperCase() || 'FR';
  if (!['FR','EN'].includes(language)) throw new Error('INVALID_SESSION_LANGUAGE');

  let scheduledAt = null;
  if (input?.scheduledAt) {
    const date = new Date(String(input.scheduledAt));
    if (Number.isNaN(date.getTime())) throw new Error('INVALID_SESSION_DATE');
    scheduledAt = date.toISOString();
  }

  await executor(UPDATE_SESSION_DETAILS_MUTATION, { sessionId, name, scheduledAt, venue, language });
  return { sessionId, name, scheduledAt, venue, language };
}

export async function setGameSessionStatus(sessionId, status, { reader = defaultReader, executor = defaultExecutor } = {}) {
  const normalized = String(status ?? '').trim().toUpperCase();
  if (!sessionId) throw new Error('SESSION_ID_REQUIRED');
  if (!ALLOWED_PRELIVE_STATUSES.has(normalized)) throw new Error('INVALID_PRELIVE_STATUS');
  const detail = await getGameSession(sessionId, { reader });
  if (!detail) throw new Error('SESSION_NOT_FOUND');
  if (detail.status === 'ARCHIVED') throw new Error('SESSION_ARCHIVED');
  if (detail.runtimeInitializedAt && normalized !== 'READY') throw new Error('RUNTIME_ALREADY_INITIALIZED');
  await executor(UPDATE_SESSION_STATUS_MUTATION, { sessionId, status: normalized });
  return { sessionId, status: normalized };
}

export async function setGameSessionArchived(sessionId, archived = true, { reader = defaultReader, executor = defaultExecutor } = {}) {
  if (!sessionId) throw new Error('SESSION_ID_REQUIRED');
  const detail = await getGameSession(sessionId, { reader });
  if (!detail) throw new Error('SESSION_NOT_FOUND');
  const status = archived ? 'ARCHIVED' : 'DRAFT';
  await executor(SET_SESSION_ARCHIVED_MUTATION, { sessionId, status, precastEnabled: false });
  return { sessionId, status, archived: Boolean(archived) };
}

export async function deleteGameSession(sessionId, { reader = defaultReader, executor = defaultExecutor } = {}) {
  if (!sessionId) throw new Error('SESSION_ID_REQUIRED');
  const detail = await getGameSession(sessionId, { reader });
  if (!detail) throw new Error('SESSION_NOT_FOUND');
  if (detail.runtimeInitializedAt || detail.startedAt || detail.finishedAt) throw new Error('SESSION_DELETE_LOCKED_AFTER_RUNTIME');
  await executor(DELETE_SESSION_MUTATION, { sessionId });
  return { sessionId, deleted: true };
}

export async function configureGameSessionPrecast(sessionId, enabled, { reader = defaultReader, executor = defaultExecutor } = {}) {
  if (!sessionId) throw new Error('SESSION_ID_REQUIRED');
  const detail = await getGameSession(sessionId, { reader });
  if (!detail) throw new Error('SESSION_NOT_FOUND');
  if (detail.status === 'ARCHIVED') throw new Error('SESSION_ARCHIVED');
  if (enabled && !ALLOWED_PRECAST_STATUSES.has(detail.status)) throw new Error('PRECAST_NOT_ALLOWED_FOR_STATUS');

  const token = detail.precastToken || randomBytes(24).toString('base64url');
  await executor(CONFIGURE_PRECAST_MUTATION, { sessionId, enabled: Boolean(enabled), token });
  return {
    sessionId,
    enabled: Boolean(enabled),
    token,
    openCount: detail.precastOpenCount ?? 0,
    submissionCount: detail.precastSubmissionCount ?? 0,
  };
}

async function lookupPrecastSession(token, { reader = defaultReader } = {}) {
  const safeToken = safePrecastToken(token);
  const data = await reader(GET_PRECAST_SESSION_QUERY, { token: safeToken });
  const session = (data?.gameSessions ?? [])[0] ?? null;
  if (!session || !session.precastEnabled) throw new Error('PRECAST_LINK_NOT_FOUND');
  if (!ALLOWED_PRECAST_STATUSES.has(session.status)) throw new Error('PRECAST_CLOSED');
  return session;
}

export async function getPublicPrecastSession(token, { reader = defaultReader, executor = defaultExecutor, trackOpen = true } = {}) {
  const session = await lookupPrecastSession(token, { reader });
  if (trackOpen) {
    await executor(TRACK_PRECAST_OPEN_MUTATION, {
      sessionId: session.id,
      count: Number(session.precastOpenCount ?? 0) + 1,
      openedAt: new Date().toISOString(),
    });
  }
  return shapePublicPrecastSession(session);
}

export async function submitPublicPrecast(token, input, { reader = defaultReader, executor = defaultExecutor } = {}) {
  const session = await lookupPrecastSession(token, { reader });
  const cleaned = validatePrecastInput(input);
  const submittedAt = new Date().toISOString();
  const participants = (session.sessionParticipants_on_gameSession ?? []).filter(p => p.active !== false);
  const existing = cleaned.email
    ? participants.find(p => normalizeEmail(p.email) === cleaned.email)
    : null;

  let participantId;
  let updated = false;
  if (existing) {
    participantId = existing.id;
    updated = true;
    await executor(UPDATE_PRECAST_PARTICIPANT_MUTATION, {
      participantId,
      ...cleaned,
      source: 'PRECAST',
      submittedAt,
    });
  } else {
    participantId = randomUUID();
    await executor(ADD_PARTICIPANT_MUTATION, {
      data: {
        id: participantId,
        gameSessionId: session.id,
        ...cleaned,
        characterExternalId: null,
        castingLocked: false,
        briefingStatus: 'NOT_SENT',
        playerAccessEnabled: false,
        playerAccessToken: null,
        playerOpenCount: 0,
        source: 'PRECAST',
        precastSubmittedAt: submittedAt,
        active: true,
      },
    });
  }

  await executor(TRACK_PRECAST_SUBMISSION_MUTATION, {
    sessionId: session.id,
    count: Number(session.precastSubmissionCount ?? 0) + 1,
  });

  return { participantId, displayName: cleaned.displayName, updated };
}

export const __sessionOps = {
  UPDATE_SESSION_DETAILS_MUTATION,
  LIST_SESSIONS_QUERY,
  GET_SESSION_QUERY,
  GET_VERSION_FOR_SESSION_QUERY,
  GET_PRECAST_SESSION_QUERY,
  CREATE_SESSION_MUTATION,
  ADD_PARTICIPANT_MUTATION,
  UPDATE_PRECAST_PARTICIPANT_MUTATION,
  ASSIGN_CHARACTER_MUTATION,
  UPDATE_SESSION_STATUS_MUTATION,
  SET_SESSION_ARCHIVED_MUTATION,
  DELETE_SESSION_MUTATION,
  CONFIGURE_PRECAST_MUTATION,
  TRACK_PRECAST_OPEN_MUTATION,
  TRACK_PRECAST_SUBMISSION_MUTATION,
};
