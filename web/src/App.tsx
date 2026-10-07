import { useEffect, useMemo, useState } from 'react';
import PlayerPortal from './PlayerPortal';
import LocationScan from './LocationScan';
import GmPackView from './GmPackView';
import { QRCodeSVG } from 'qrcode.react';
import { SKIN_OPTIONS, type SkinId, asSkinId, skinOptionFor, defaultAccentForSkin } from './skin-registry';
import { PrecastManager, PublicRegistrationView } from './PrecastManager';
import MediaLibraryPanel from './MediaLibraryPanel';
import NarrativeText from './NarrativeText';
import { organizerToken } from './admin-auth';

const GM_PACK_VERSION_ID = new URLSearchParams(window.location.search).get('gmPack');
const GM_PACK_SESSION_ID = new URLSearchParams(window.location.search).get('gmPackSession');


type Severity = 'ERROR' | 'WARNING' | 'INFO';

type Diagnostic = { severity: Severity; ruleId: string; entityType: string; entityId: string; message: string; detail: string; blocking: boolean };
type ImportResponse = { ok: boolean; blocking: boolean; counts: Record<Severity, number>; summary: Record<string, string | number>; diagnostics: Diagnostic[] };
type CommitResponse = { ok: boolean; scenarioId: string; scenarioVersionId: string; sourceHash: string; imported: Record<string, number> };

type VersionSummary = {
  id: string; sourceScenarioId: string; versionLabel: string; variantName?: string | null; genderProfile?: string | null; variantNotes?: string | null; templateVersion: string; language: string; status: string;
  subtitle?: string | null; universe?: string | null; era?: string | null; durationMinutes?: number | null;
  minPlayers?: number | null; maxPlayers?: number | null; sourceFilename?: string | null; importedAt?: string | null;
  genderComposition: { feminine:number; masculine:number; flexible:number; other:number; total:number; label:string };
  counts: { characters: number; playableCharacters: number; facts: number; clues: number; majorClues: number };
};
type ScenarioLibraryItem = { id: string; title: string; slug: string; archived: boolean; skinId?: string | null; accentColor?: string | null; organization?: { id: string; name: string; slug: string }; versions: VersionSummary[] };
type CharacterSummary = { externalId: string; name: string; publicRole?: string | null; gender?: string | null; importance: string; intensity: string; portraitMediaId?:string|null; portraitArchetypeCode?:string|null; playable: boolean; active: boolean };
type ScenarioVersionDetail = VersionSummary & {
  gmSummary: string; playerSummary: string; sourceHash?: string | null;
  scenario: { id: string; title: string; slug: string; organization?: { id: string; name: string; slug: string } };
  characters: CharacterSummary[];
  facts: Array<{ externalId: string; title: string; nature: string; importance: string; isPublic: boolean; active: boolean }>;
  clues: Array<{ externalId: string; playerName: string; clueType: string; support: string; major: boolean; active: boolean }>;
  objects: Array<{ externalId:string; name:string; description?:string|null; support?:string|null; mediaExternalId?:string|null; visualArchetypeCode?:string|null; active:boolean }>;
  mediaOverrides: Record<string,{assetExternalId?:string|null;label?:string|null;source?:string|null;altText?:string|null;mediaType?:string|null;category?:string|null;skinId?:string|null}>;
};
type CharacterDetail = {
  character: CharacterSummary & { dramaticFunction?: string | null; narrativeAge?: string | null; gender?: string | null; biography: string; secretIntro?: string | null; interpretationNotes?: string | null; appearanceNotes?: string | null; apparentMotive?: string | null; personalTimeline?: string | null; motto?: string | null };
  objectives: Array<{ externalId: string; title: string; description: string; objectiveType: string; secret: boolean; initialStatus: string; importance?: string | null }>;
  relationships: Array<{ externalId: string; otherExternalId: string; otherName: string; otherPublicRole?: string | null; relationType?: string | null; text: string; visibility: string }>;
  knowledge: Array<{ factExternalId: string; sourceType: string; fact: { externalId: string; title: string; text: string; nature: string; importance: string; notebookCategory?: string | null } }>;
};

type SessionParticipant = {
  id: string; displayName: string; email?: string | null; ageBracket?: string | null; genderPreference?: string | null;
  desiredInvolvement?: string | null; characterExternalId?: string | null;
  characterDisplayName?: string | null;
  characterGenderVariant?: string | null;
  characterSnapshotAt?: string | null;
  castingLocked: boolean; briefingStatus: string;
  source?: string | null; precastSubmittedAt?: string | null; notes?: string | null; active: boolean; createdAt?: string | null;
  playerAccessToken?: string | null; playerAccessEnabled?: boolean; playerFirstOpenedAt?: string | null; playerLastOpenedAt?: string | null; playerOpenCount?: number; briefingReadAt?: string | null;
};
type SessionSummary = {
  id: string; name?: string | null; scheduledAt?: string | null; venue?: string | null; language: string; status: string; notes?: string | null;
  precastEnabled?: boolean; precastToken?: string | null; precastOpenCount?: number; precastLastOpenedAt?: string | null; precastSubmissionCount?: number;
  runtimeInitializedAt?: string | null; runtimeVersion?: string | null;
  startedAt?: string | null; pausedAt?: string | null; finishedAt?: string | null;
  createdAt?: string | null; organization?: { id: string; name: string; slug: string };
  scenarioVersion?: { id: string; versionLabel: string; variantName?:string|null; genderProfile?:string|null; minPlayers?: number | null; maxPlayers?: number | null; scenario?: { id: string; title: string; slug: string } };
  counts: { participants: number; assigned: number };
};
type SessionDetail = SessionSummary & {
  scenarioVersion: { id: string; versionLabel: string; variantName?:string|null; genderProfile?:string|null; language?: string; minPlayers?: number | null; maxPlayers?: number | null; durationMinutes?: number | null; scenario?: { id: string; title: string; slug: string } };
  participants: SessionParticipant[];
  characters: CharacterSummary[];
  counts: { participants: number; assigned: number; playableCharacters: number; unassignedParticipants: number; unassignedCharacters: number; precastParticipants?: number };
};


type SessionSetup = {
  preparation:{minPlayers:number;maxPlayers:number;countCompatible:boolean;profilesComplete:boolean;allAssigned:boolean;assignedKnown:boolean;canMarkReady:boolean;progress:number;steps:Array<{id:string;label:string;ready:boolean;detail:string}>};
  proposal:{assignments:Array<{participantId:string;participantName:string;characterExternalId:string;characterName:string;publicRole?:string|null;score:number;confidence:'HAUTE'|'MOYENNE'|'A_VERIFIER';reasons:string[]}>;unassignedParticipants:Array<{id:string;displayName:string}>;warnings:string[]};
};

type RuntimeResource = { characterExternalId:string; resourceExternalId:string; initialValue:number; currentValue:number; maxValue?:number|null; updatedAt?:string|null };
type RuntimeCharacter = { characterExternalId:string; participantId:string; participantName?:string|null; status:string; resources:RuntimeResource[]; objectiveCount:number; knowledgeCount:number; states:Array<{stateExternalId:string;active:boolean}>; objectCount:number };
type RuntimeState = { initialized:boolean; initializedAt?:string|null; runtimeVersion?:string|null; sourceReady:boolean; characters:RuntimeCharacter[]; counts:{characters:number;resources:number;knowledge:number;objectives:number;objects:number;activeStates:number} };

type LiveResource = RuntimeResource & { name:string; unit?:string|null };
type LiveStateItem = { characterExternalId:string; stateExternalId:string; active:boolean; name:string; appliedAt?:string|null; expiresAt?:string|null };
type LiveCharacter = { characterExternalId:string; characterName:string; publicRole?:string|null; participantName?:string|null; resources:LiveResource[]; states:LiveStateItem[] };
type LiveEvent = { eventExternalId?:string; externalId:string; title:string; gmDescription:string; triggerType:string; delayMinutes?:number|null; priority:string; mandatory:boolean; status:string; urgency:'NORMAL'|'SOON'|'OVERDUE'; dueElapsedSeconds?:number|null; fallbackGm?:string|null };
type LiveDashboard = {
  snapshotAt:string; sourceReady:boolean;
  session:{id:string;status:string;startedAt?:string|null;pausedAt?:string|null;finishedAt?:string|null;elapsedSeconds:number;currentPhaseExternalId?:string|null};
  phases:Array<{externalId:string;name:string;orderIndex:number;gmDescription:string}>;
  events:LiveEvent[]; characters:LiveCharacter[]; stateDefinitions:Array<{externalId:string;name:string;description:string;defaultDurationSeconds?:number|null}>;
  logs:Array<{id:string;actionType:string;characterExternalId?:string|null;refExternalId?:string|null;beforeValue?:string|null;afterValue?:string|null;deltaValue?:number|null;note?:string|null;createdAt:string}>;
  alerts:{overdueEvents:number;soonEvents:number;activeStates:number};
};

type InteractionAbility = { externalId:string; name:string; description:string; level:number; flatBonus:number; maxUses?:number|null; cooldownMinutes?:number|null };
type InteractionDefinition = {
  externalId:string; name:string; category:string; targetType:string; scanMode?:'DIRECT'|'DISCRET'|null; abilityExternalId?:string|null; actorScope?:string|null;
  costResourceExternalId?:string|null; costValue?:number|null; costTiming?:string|null; resolution:string; diceCount?:number|null; diceSides?:number|null;
  abilityLevelMultiplier?:number|null; flatBonus?:number|null; difficulty?:number|null; opposedAbilityExternalId?:string|null; tieRule?:string|null;
  maxUses?:number|null; limitPerTarget?:number|null; cooldownMinutes?:number|null; targetSecret:boolean; ability?:InteractionAbility|null;
  usesCount:number; cooldownRemainingSeconds:number; currentCostResourceValue?:number|null;
};
type InteractionActor = { characterExternalId:string; participantId:string; participantName:string; characterName:string; publicRole?:string|null; abilities:InteractionAbility[]; interactions:InteractionDefinition[] };
type InteractionObject = { objectExternalId:string; name:string; description?:string; holderType:string; holderExternalId?:string|null; transferable:boolean; stealable:boolean; consumable:boolean; critical:boolean; charges?:number|null; identificationLevel:number; inPlay:boolean };
type InteractionClue = { externalId:string; playerName:string; clueType:string; playerText:string; gmInterpretation:string; locationExternalId?:string|null; objectExternalId?:string|null; documentExternalId?:string|null; major:boolean; logisticsCode?:string|null; discoveredBy:string[] };
type InteractionDashboard = { sourceReady:boolean; actors:InteractionActor[]; locations:Array<{externalId:string;name:string;description:string}>; objects:InteractionObject[]; clues:InteractionClue[]; uses:Array<{id:string;interactionExternalId:string;actorCharacterExternalId:string;targetExternalId?:string|null;success?:boolean|null;createdAt:string}>; discoveries:Array<{characterExternalId:string;clueExternalId:string;discoveredAt:string}> };
type InteractionResult = { interactionExternalId:string;interactionName:string;actorCharacterExternalId:string;targetType:string;targetExternalId?:string|null;success:boolean;resolution:string;actorRoll?:{rolls:number[];sum:number}|null;targetRoll?:{rolls:number[];sum:number}|null;actorTotal?:number|null;targetTotal?:number|null;abilityLevel:number;cost?:{resourceExternalId:string;value:number;remaining:number}|null };

type VoteOption = { externalId:string; voteExternalId:string; orderIndex:number; label:string; description?:string|null; characterExternalId?:string|null };
type VoteResult = { electorateCount:number; ballotsCast:number; validBallots:number; totalWeight:number; abstentions:number; majorityAbsolute:boolean; tieForLead:boolean; winnerOptionExternalId?:string|null; ranked:Array<{optionExternalId:string;label:string;votes:number}>; suggestSecondRound:boolean; secondRoundOptionExternalIds:string[] };
type VoteDashboardItem = { externalId:string; title:string; question:string; scopeType:string; scopeRef?:string|null; choicesMode:string; secret:boolean; votesPerElector:number; weighted:boolean; abstention:boolean; modifiable:boolean; resultVisibility:string; tieRule?:string|null; options:VoteOption[]; activeRound?:{voteExternalId:string;round:number;status:string;eligibleOptionExternalIds?:string|null;openedAt?:string|null;closedAt?:string|null;resultJson?:string|null}|null; result?:VoteResult|null; voters:Array<{characterExternalId:string;characterName:string;participantName?:string|null;hasVoted:boolean}>; electorate:string[] };
type VoteDashboard = { sourceReady:boolean; session:{id:string;status:string}; votes:VoteDashboardItem[] };

type PublicPrecastSession = {
  name?: string | null; scheduledAt?: string | null; venue?: string | null; language: string; status: string;
  scenario: { title: string; versionLabel?: string | null; playerSummary?: string | null };
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const contentType = response.headers.get('content-type') ?? '';
  const raw = await response.text();
  let json: any = null;
  if (raw && contentType.includes('application/json')) {
    try { json = JSON.parse(raw); } catch { /* handled below */ }
  }
  if (!response.ok) {
    const message = json?.message ?? json?.error ?? (raw && !raw.trim().startsWith('<') ? raw.slice(0, 240) : null);
    throw new Error(message ?? `Route API indisponible (${response.status}) : ${url}. Vérifie le déploiement de la Function correspondante.`);
  }
  if (!json) {
    throw new Error(`Réponse non JSON reçue pour ${url}. La route Hosting pointe probablement vers l'application au lieu de la Function.`);
  }
  return json as T;
}

const postJson = <T,>(url: string, body: unknown) => fetchJson<T>(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function organizerPostJson<T=any>(url:string,body:unknown):Promise<T>{
  const token=await organizerToken(true);
  if(!token)throw new Error('Connexion organisateur requise.');

  return fetchJson<T>(url,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'authorization':`Bearer ${token}`,
    },
    body:JSON.stringify(body),
  });
}

function isValidEmail(value:string){ const v=value.trim(); return v.length>3 && v.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

function niceDate(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('fr-BE', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
function importanceLabel(value?: string | null) {
  const map: Record<string, string> = { STRUCTURAL: 'Structurel', MAIN: 'Principal', SECONDARY: 'Secondaire', SIDEKICK: 'Sidekick', CRITICAL: 'Critique', IMPORTANT: 'Important', FLAVOR: 'Ambiance' };
  return value ? (map[value] ?? value) : '—';
}
function statusLabel(value: string) {
  const map: Record<string,string> = { DRAFT:'Brouillon', CASTING:'Casting', READY:'Prête', LIVE:'En jeu', PAUSED:'En pause', FINISHED:'Terminée', ARCHIVED:'Archivée' };
  return map[value] ?? value;
}
function sessionDateLabel(value?: string | null) {
  if (!value) return 'Date à définir';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('fr-BE', { day:'2-digit', month:'long', year:'numeric' }).format(date);
}
function sessionTimeLabel(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('fr-BE', { hour:'2-digit', minute:'2-digit' }).format(date);
}

function localDateTimeInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function ageBracketLabel(value?: string | null) {
  const map: Record<string,string> = { MOINS_18:'Moins de 18 ans', '18_25':'18–25 ans', '26_40':'26–40 ans', '41_60':'41–60 ans', '60_PLUS':'60 ans et +' };
  return value ? (map[value] ?? value) : 'Âge non renseigné';
}
function involvementLabel(value?: string | null) {
  const map: Record<string,string> = { TRANQUILLE:'Tranquille', ACTIF:'Actif', TRES_IMPLIQUE:'Très impliqué', PREMIER_ROLE:'Premier rôle' };
  return value ? (map[value] ?? value) : 'Implication non renseignée';
}

function genderProfileLabel(value?:string|null) {
  const map:Record<string,string>={FIXE:'Composition fixe',ADAPTABLE:'Adaptable',LIBRE:'Libre',NON_RENSEIGNE:'Non renseigné'};
  const key=String(value??'').toUpperCase(); return map[key]??(value||'Auto');
}
function characterGenderLabel(value?:string|null) {
  const v=String(value??'').trim().toUpperCase();
  if(['F','FEMININ','FÉMININ','FEMME','FEMALE'].includes(v)) return 'F';
  if(['M','MASCULIN','H','HOMME','MALE'].includes(v)) return 'M';
  if(!v||['NEUTRE','ADAPTABLE','UNISEXE','LIBRE','ANY'].includes(v)) return 'Adapt.';
  return value||'—';
}
function versionCountCompatible(v:VersionSummary,count:number){const min=v.minPlayers??v.counts.playableCharacters;const max=v.maxPlayers??v.counts.playableCharacters;return count>=min&&count<=max;}
function versionGenderCompatible(v:VersionSummary,count:number,women:number|null,men:number|null){
  if(women===null||men===null||women+men!==count)return true;
  const g=v.genderComposition;
  return women>=g.feminine&&men>=g.masculine&&(women+men)>=g.feminine+g.masculine;
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  const publicPrecastToken = params.get('precast');
  const publicRegistrationToken = params.get('register');
  const publicPlayerToken = params.get('player');
  const scanMatch = window.location.pathname.match(/^\/scan\/([^/]+)\/?$/);
  const scanLocationExternalId = scanMatch ? decodeURIComponent(scanMatch[1]) : null;
  const [view, setView] = useState<'library' | 'registrations' | 'sessions' | 'import'>('library');
  const [registrationScenarioId,setRegistrationScenarioId]=useState<string|null>(null);
  const [scenarios, setScenarios] = useState<ScenarioLibraryItem[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState('');
  const [version, setVersion] = useState<ScenarioVersionDetail | null>(null);
  const [versionLoading, setVersionLoading] = useState(false);
  const [character, setCharacter] = useState<CharacterDetail | null>(null);
  const [characterLoading, setCharacterLoading] = useState(false);

  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const [runtime, setRuntime] = useState<RuntimeState | null>(null);
  const [runtimeLoading, setRuntimeLoading] = useState(false);
  const [live, setLive] = useState<LiveDashboard | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<ImportResponse | null>(null);
  const [commit, setCommit] = useState<CommitResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'ALL' | Severity>('ALL');
  const [importTargetScenario, setImportTargetScenario] = useState<ScenarioLibraryItem | null>(null);
  const [selectedSkinId,setSelectedSkinId]=useState<SkinId>('CONTEMPORARY_1980_2000');
  const [selectedAccentColor,setSelectedAccentColor]=useState('#49677A');
  const filtered = useMemo(() => data?.diagnostics.filter(d => filter === 'ALL' || d.severity === filter) ?? [], [data, filter]);

  useEffect(() => { if (!publicPrecastToken && !publicRegistrationToken && !publicPlayerToken && !scanLocationExternalId) { void loadLibrary(); void loadSessions(); } }, [publicPrecastToken, publicRegistrationToken, publicPlayerToken, scanLocationExternalId]);

  async function loadLibrary() {
    setLibraryLoading(true); setLibraryError('');
    try { const result = await fetchJson<{ ok: boolean; scenarios: ScenarioLibraryItem[] }>('/api/library/scenarios'); setScenarios(result.scenarios ?? []); }
    catch (e) { setLibraryError(e instanceof Error ? e.message : String(e)); }
    finally { setLibraryLoading(false); }
  }
  async function archiveScenarioVersion(versionId:string, archived:boolean) {
    setLibraryError('');

    try {
      await postJson(
        '/api/library/version/archive',
        {versionId, archived}
      );

      await loadLibrary();

      if(version?.id===versionId)
        await openVersion(versionId);
    }
    catch(e) {
      setLibraryError(
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  async function openVersion(versionId: string) {
    setVersionLoading(true); setLibraryError(''); setCharacter(null);
    try { const result = await fetchJson<{ ok: boolean; version: ScenarioVersionDetail }>(`/api/library/version?versionId=${encodeURIComponent(versionId)}`); setVersion(result.version); }
    catch (e) { setLibraryError(e instanceof Error ? e.message : String(e)); }
    finally { setVersionLoading(false); }
  }
  async function openCharacter(externalId: string) {
    if (!version) return;
    setCharacterLoading(true); setLibraryError(''); setCharacter(null);
    try { const result = await fetchJson<CharacterDetail & { ok: boolean }>(`/api/library/character?versionId=${encodeURIComponent(version.id)}&externalId=${encodeURIComponent(externalId)}`); setCharacter(result); }
    catch (e) { setLibraryError(e instanceof Error ? e.message : String(e)); }
    finally { setCharacterLoading(false); }
  }

  async function loadSessions() {
    setSessionError('');
    try { const result = await fetchJson<{ok:boolean;sessions:SessionSummary[]}>('/api/sessions/list'); setSessions(result.sessions ?? []); }
    catch (e) { setSessionError(e instanceof Error ? e.message : String(e)); }
  }
  async function loadRuntime(sessionId: string) {
    setRuntimeLoading(true);
    try { const result = await fetchJson<{ok:boolean;runtime:RuntimeState}>(`/api/sessions/runtime?sessionId=${encodeURIComponent(sessionId)}`); setRuntime(result.runtime); }
    catch { setRuntime(null); }
    finally { setRuntimeLoading(false); }
  }
  async function loadLive(sessionId: string) {
    setLiveLoading(true);
    try { const result = await fetchJson<{ok:boolean;live:LiveDashboard}>(`/api/sessions/live?sessionId=${encodeURIComponent(sessionId)}`); setLive(result.live); }
    catch { setLive(null); }
    finally { setLiveLoading(false); }
  }
  async function openSession(sessionId: string) {
    setSessionLoading(true); setSessionError(''); setRuntime(null); setLive(null);
    try {
      const result = await fetchJson<{ok:boolean;session:SessionDetail}>(`/api/sessions/detail?sessionId=${encodeURIComponent(sessionId)}`);
      setSession(result.session);
      await loadRuntime(sessionId);
      await loadLive(sessionId);
    }
    catch (e) { setSessionError(e instanceof Error ? e.message : String(e)); }
    finally { setSessionLoading(false); }
  }
  async function createSession(input: {name:string;scheduledAt?:string;venue?:string;language?:string;notes?:string}) {
    if (!version) return;
    setSessionError('');
    try {
      const result = await postJson<{ok:boolean;session:{id:string}}>('/api/sessions/create', { versionId: version.id, ...input, scheduledAt: input.scheduledAt ? new Date(input.scheduledAt).toISOString() : null });
      await loadSessions(); setView('sessions'); setVersion(null); setCharacter(null); await openSession(result.session.id);
    } catch (e) { setLibraryError(e instanceof Error ? e.message : String(e)); }
  }
  async function addParticipant(input: {displayName:string;email:string;ageBracket:string;genderPreference:string;desiredInvolvement:string;notes?:string}) {
    if (!session) return;
    setSessionError('');
    try { await postJson('/api/sessions/participants/add', { sessionId:session.id, ...input }); await openSession(session.id); await loadSessions(); }
    catch (e) { setSessionError(e instanceof Error ? e.message : String(e)); }
  }
  async function castParticipant(participantId:string, characterExternalId:string|null) {
    if (!session) return;
    setSessionError('');
    try { await postJson('/api/sessions/participants/cast', {sessionId:session.id, participantId, characterExternalId}); await openSession(session.id); await loadSessions(); }
    catch (e) { setSessionError(e instanceof Error ? e.message : String(e)); }
  }
  async function updateStatus(status:string) {
    if (!session) return;
    setSessionError('');
    try { await postJson('/api/sessions/status',{sessionId:session.id,status}); await openSession(session.id); await loadSessions(); }
    catch (e) { setSessionError(e instanceof Error ? e.message : String(e)); }
  }
  async function updateSessionDetails(input:{name:string;scheduledAt:string;venue:string;language:string}) {
    if (!session) return;
    setSessionError('');
    try {
      await postJson('/api/sessions/update', {
        sessionId: session.id,
        name: input.name,
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt).toISOString() : null,
        venue: input.venue,
        language: input.language,
      });
      await openSession(session.id); await loadSessions();
    } catch (e) { setSessionError(e instanceof Error ? e.message : String(e)); throw e; }
  }
  async function archiveCurrentSession(archived:boolean) {
    if (!session) return;
    setSessionError('');
    try {
      await postJson('/api/sessions/archive',{sessionId:session.id,archived});
      await loadSessions();
      if (archived) { setSession(null); setRuntime(null); } else { await openSession(session.id); }
    } catch (e) { setSessionError(e instanceof Error ? e.message : String(e)); }
  }
  async function initializeRuntime() {
    if (!session) return;
    setRuntimeLoading(true); setSessionError('');
    try {
      await postJson('/api/sessions/runtime/initialize',{sessionId:session.id});
      await openSession(session.id); await loadSessions();
    } catch (e) { setSessionError(e instanceof Error ? e.message : String(e)); }
    finally { setRuntimeLoading(false); }
  }
  async function configurePlayerLinks(enabled:boolean) {
    if(!session)return; setSessionError('');
    try { await postJson('/api/sessions/player-access/configure',{sessionId:session.id,enabled}); await openSession(session.id); }
    catch(e){ setSessionError(e instanceof Error?e.message:String(e)); }
  }
  async function sendPlayerMessage(input:{characterExternalId:string;title:string;body:string;priority?:string}) {
    if(!session)return; setSessionError('');
    try { await postJson('/api/sessions/player-notification',{sessionId:session.id,...input}); await openSession(session.id); }
    catch(e){ setSessionError(e instanceof Error?e.message:String(e)); throw e; }
  }
  async function liveControl(action:string) {
    if(!session)return; setLiveLoading(true); setSessionError('');
    try { await postJson('/api/sessions/live/control',{sessionId:session.id,action}); await openSession(session.id); await loadSessions(); }
    catch(e){ setSessionError(e instanceof Error?e.message:String(e)); } finally { setLiveLoading(false); }
  }
  async function liveResource(characterExternalId:string,resourceExternalId:string,value:number,mode:'DELTA'|'SET'='DELTA') {
    if(!session)return; setSessionError('');
    try { await postJson('/api/sessions/live/resource',{sessionId:session.id,characterExternalId,resourceExternalId,value,mode}); await loadLive(session.id); await loadRuntime(session.id); }
    catch(e){ setSessionError(e instanceof Error?e.message:String(e)); }
  }
  async function liveState(characterExternalId:string,stateExternalId:string,action:'APPLY'|'REMOVE') {
    if(!session)return; setSessionError('');
    try { await postJson('/api/sessions/live/state',{sessionId:session.id,characterExternalId,stateExternalId,action}); await loadLive(session.id); await loadRuntime(session.id); }
    catch(e){ setSessionError(e instanceof Error?e.message:String(e)); }
  }
  async function liveEvent(eventExternalId:string,status:'PENDING'|'DONE'|'SKIPPED') {
    if(!session)return; setSessionError('');
    try { await postJson('/api/sessions/live/event',{sessionId:session.id,eventExternalId,status}); await loadLive(session.id); }
    catch(e){ setSessionError(e instanceof Error?e.message:String(e)); }
  }
  async function interactionMutation() {
    if(!session)return;
    await Promise.all([loadLive(session.id),loadRuntime(session.id)]);
  }


  async function purgeScenario(scenarioId:string,title:string){
    const typed=window.prompt(`Supprimer définitivement le scénario « ${title} » ?\n\nCela supprimera aussi ses variantes, inscriptions et sessions liées.\n\nTape SUPPRIMER pour confirmer.`);
    if(typed!=='SUPPRIMER')return;
    setLibraryError('');
    try{
      await organizerPostJson('/api/admin/purge/scenario',{scenarioId});
      if(version?.scenario?.id===scenarioId){setVersion(null);setCharacter(null);}
      await Promise.all([loadLibrary(),loadSessions()]);
    }catch(e){setLibraryError(e instanceof Error?e.message:String(e));}
  }

  async function purgeSession(sessionId:string,name:string){
    if(!window.confirm(`Supprimer définitivement la session « ${name||'Session'} » ?\n\nMode ménage : runtime, journaux, votes et données de test seront également supprimés.`))return;
    setSessionError('');
    try{
      await organizerPostJson('/api/admin/purge/session',{sessionId});
      if(session?.id===sessionId){setSession(null);setRuntime(null);setLive(null);}
      await loadSessions();
    }catch(e){setSessionError(e instanceof Error?e.message:String(e));}
  }

  function choose(next: File | null) { setFile(next); setData(null); setCommit(null); setError(''); }
  async function validate() {
    if (!file) return; setLoading(true); setError(''); setData(null); setCommit(null);
    try { const result = await fetchJson<ImportResponse>('/api/import/validate', { method:'POST', headers:{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','x-file-name':file.name}, body:await file.arrayBuffer() }); setData(result); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setLoading(false); }
  }
  async function commitImport() {
    if (!file || !data || data.blocking) return;
    const expectedSourceId=importTargetScenario?.versions?.[0]?.sourceScenarioId;
    if(expectedSourceId&&String(data.summary.scenarioId??'')!==expectedSourceId){setError(`Ce fichier appartient au scénario ${String(data.summary.scenarioId||'inconnu')}, pas à ${expectedSourceId}. Corrige scenario_id pour l'ajouter à « ${importTargetScenario?.title} ».`);return;}
    const effectiveSkinId =
      asSkinId(selectedSkinId);

    const effectiveAccentColor =
      selectedAccentColor ||
      defaultAccentForSkin(effectiveSkinId);

    setCommitting(true); setError(''); setCommit(null);
    try {
      const result = await fetchJson<CommitResponse>('/api/import/commit',{
        method:'POST',
        headers:{
          'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'x-file-name':file.name,
          'x-organization-slug':'ludificateur',
          'x-organization-name':'Le Ludificateur',
          'x-skin-id':effectiveSkinId,
          'x-accent-color':effectiveAccentColor
        },
        body:await file.arrayBuffer()
      });

      if(importTargetScenario){
        await postJson('/api/library/appearance',{
          scenarioId:importTargetScenario.id,
          skinId:effectiveSkinId,
          accentColor:effectiveAccentColor,
        });
      }

      setCommit(result);
      await loadLibrary();
    }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setCommitting(false); }
  }

  if (GM_PACK_SESSION_ID)
    return <GmPackView sessionId={GM_PACK_SESSION_ID}/>;

  if (GM_PACK_VERSION_ID)
    return <GmPackView versionId={GM_PACK_VERSION_ID}/>;
  if (scanLocationExternalId) return <LocationScan locationExternalId={scanLocationExternalId}/>;
  if (publicRegistrationToken) return <PublicRegistrationView token={publicRegistrationToken}/>;
  if (publicPrecastToken) return <PublicPrecastView token={publicPrecastToken}/>;
  if (publicPlayerToken) return <PlayerPortal token={publicPlayerToken}/>;

  return <main className="shell">
    <header className="topbar">
      <div><p className="eyebrow">LUDIFICATEUR</p><h1>Murder Engine</h1><p className="subtitle">Scénarios, sessions & casting assisté — V1.6.1</p></div>
      <nav className="mainnav" aria-label="Navigation principale">
        <button className={view==='library'?'active':''} onClick={()=>setView('library')}>Scénarios</button>
        <button className={view==='registrations'?'active':''} onClick={()=>{setRegistrationScenarioId(null);setView('registrations');}}>Inscriptions</button>
        <button className={view==='sessions'?'active':''} onClick={()=>{setView('sessions');void loadSessions();}}>Sessions</button>
        <button className={view==='import'?'active':''} onClick={()=>{setImportTargetScenario(null);choose(null);setView('import');}}>Importer</button>
      </nav>
    </header>

    {view === 'library' && version && <div className="gmPackShortcut"><button onClick={()=>window.open(`/?gmPack=${encodeURIComponent(version.id)}`,'_blank')}>📦 Ouvrir le Pack MJ</button></div>}

    {view === 'library' && <LibraryView scenarios={scenarios} loading={libraryLoading} error={libraryError} version={version} versionLoading={versionLoading} character={character} characterLoading={characterLoading} onReload={()=>void loadLibrary()} onImport={()=>{setImportTargetScenario(null);choose(null);setView('import');}} onImportVersion={scenario=>{
      const id=asSkinId(scenario.skinId??'CONTEMPORARY_1980_2000');
      setSelectedSkinId(id);
      setSelectedAccentColor(scenario.accentColor||defaultAccentForSkin(id));
      setImportTargetScenario(scenario);
      choose(null);
      setView('import');
    }} onOpenVersion={id=>void openVersion(id)} onArchiveVersion={(id,archived)=>void archiveScenarioVersion(id,archived)} onBack={()=>{setVersion(null);setCharacter(null);}} onOpenCharacter={id=>void openCharacter(id)} onCreateSession={createSession} onRegistrations={scenarioId=>{setRegistrationScenarioId(scenarioId);setView('registrations');}} onDeleteScenario={(id,title)=>void purgeScenario(id,title)} />}

    {view === 'registrations' && <PrecastManager scenarios={scenarios} initialScenarioId={registrationScenarioId} onOpenSession={sessionId=>{setRegistrationScenarioId(null);setView('sessions');void loadSessions();void openSession(sessionId);}} />}

    {view === 'sessions' && <SessionsView sessions={sessions} session={session} runtime={runtime} runtimeLoading={runtimeLoading} live={live} liveLoading={liveLoading} loading={sessionLoading} error={sessionError} onReload={()=>void loadSessions()} onOpen={id=>void openSession(id)} onBack={()=>{setSession(null);setRuntime(null);setLive(null);}} onAddParticipant={addParticipant} onCast={(p,c)=>void castParticipant(p,c)} onStatus={s=>void updateStatus(s)} onUpdateDetails={updateSessionDetails} onArchive={archived=>void archiveCurrentSession(archived)} onPurge={(id,name)=>void purgeSession(id,name)} onInitializeRuntime={()=>void initializeRuntime()} onPlayerAccess={enabled=>void configurePlayerLinks(enabled)} onPlayerMessage={sendPlayerMessage} onLiveControl={a=>void liveControl(a)} onLiveResource={(c,r,v,m)=>void liveResource(c,r,v,m)} onLiveState={(c,st,a)=>void liveState(c,st,a)} onLiveEvent={(e,st)=>void liveEvent(e,st)} onInteractionMutation={()=>void interactionMutation()} />}

    {view === 'import' && <ImportView targetScenario={importTargetScenario} skinId={asSkinId(selectedSkinId)} accentColor={selectedAccentColor||defaultAccentForSkin(asSkinId(selectedSkinId))} skinLocked={false} onSkinChange={(id,accent)=>{setSelectedSkinId(id);setSelectedAccentColor(accent);}} onAccentChange={setSelectedAccentColor} file={file} data={data} commit={commit} loading={loading} committing={committing} error={error} filter={filter} filtered={filtered} onChoose={choose} onValidate={()=>void validate()} onCommit={()=>void commitImport()} onFilter={setFilter} onOpenImported={()=>commit && void openVersion(commit.scenarioVersionId).then(()=>setView('library'))} />}
  </main>;
}

function LibraryView(props:{scenarios:ScenarioLibraryItem[];loading:boolean;error:string;version:ScenarioVersionDetail|null;versionLoading:boolean;character:CharacterDetail|null;characterLoading:boolean;onReload:()=>void;onImport:()=>void;onImportVersion:(scenario:ScenarioLibraryItem)=>void;onOpenVersion:(id:string)=>void;onArchiveVersion:(id:string,archived:boolean)=>void;onBack:()=>void;onOpenCharacter:(id:string)=>void;onCreateSession:(input:{name:string;scheduledAt?:string;venue?:string;language?:string;notes?:string})=>Promise<void>;onRegistrations:(scenarioId:string)=>void;onDeleteScenario:(scenarioId:string,title:string)=>void}) {
  const [pickerScenarioId,setPickerScenarioId]=useState<string|null>(null);
  const [showArchivedVariants,setShowArchivedVariants]=useState(false);
  const [playerCount,setPlayerCount]=useState(15);
  const [women,setWomen]=useState<string>('');
  const [men,setMen]=useState<string>('');
  if (!props.version) return <section>
    {props.error && <p className="errorbox standalone">{props.error}</p>}
    <div className="sectionhead">
      <div><p className="eyebrow">BIBLIOTHÈQUE</p><h2>Scénarios</h2><p>Une carte par univers. Ouvre seulement les variantes quand tu en as besoin.</p></div>
      <div className="sessionListActions"><button onClick={props.onImport}>+ Nouveau scénario</button><button className="secondary" onClick={props.onReload}>{props.loading?'Actualisation…':'Actualiser'}</button></div>
    </div>
    {props.loading && props.scenarios.length===0 && <section className="card emptyState">Chargement…</section>}
    {!props.loading && props.scenarios.length===0 && <section className="card emptyState"><strong>Aucun scénario importé.</strong><button onClick={props.onImport}>Importer un scénario</button></section>}
    <div className="scenarioFamilyList">{props.scenarios.map(s=>{
      const pickerOpen=pickerScenarioId===s.id;
      const wc=women===''?null:Number(women), mc=men===''?null:Number(men);
      const activeVersions=s.versions.filter(v=>v.status!=='ARCHIVED');
      const archivedVersions=s.versions.filter(v=>v.status==='ARCHIVED');
      const visibleVersions=showArchivedVariants?s.versions:activeVersions;
      const candidates=activeVersions.filter(v=>versionCountCompatible(v,playerCount)&&versionGenderCompatible(v,playerCount,wc,mc));
      const playableCounts=activeVersions.map(v=>v.counts.playableCharacters).filter(Number.isFinite);
      const playerRange=playableCounts.length
        ? (Math.min(...playableCounts)===Math.max(...playableCounts)?String(playableCounts[0]):`${Math.min(...playableCounts)}–${Math.max(...playableCounts)}`)
        : '—';

      return <article className="card scenarioFamilyCompact" key={s.id}>
        <div className="scenarioCompactHead">
          <div>
            <span className="micro">{s.organization?.name??'Organisation'}</span>
            <h3>{s.title}</h3>
            <p>{activeVersions.length} variante{activeVersions.length>1?'s':''} active{activeVersions.length>1?'s':''} · {playerRange} joueurs</p>
          </div>
          <div className="scenarioCompactActions">
            <button onClick={()=>props.onRegistrations(s.id)}>📝 Inscriptions</button>
            <button className="secondary" onClick={()=>props.onImportVersion(s)}>+ Variante</button>
            <button className="danger secondary" onClick={()=>props.onDeleteScenario(s.id,s.title)}>🗑 Supprimer</button>
          </div>
        </div>

        <details className="scenarioVariantsDetails">
          <summary>Voir les variantes <span>{s.versions.length}</span></summary>
          <div className="compactVersionList">
            {visibleVersions.map(v=><article className={`compactVersionRow ${v.status==='ARCHIVED'?'archived':''}`} key={v.id}>
              <button className="compactVersionMain" onClick={()=>props.onOpenVersion(v.id)}>
                <span><strong>{v.variantName||`${v.counts.playableCharacters} joueurs`}</strong><small>{v.subtitle||v.universe||`Révision V${v.versionLabel}`}</small></span>
                <span><b>{v.counts.playableCharacters} PJ</b><small>{v.genderComposition.label}</small></span>
                <span><b>V{v.versionLabel}</b><small>{v.language} · {v.status}</small></span>
              </button>
              <div className="compactVersionActions">
                <button className="secondary" onClick={()=>window.open(`/?gmPack=${encodeURIComponent(v.id)}`,'_blank')}>📦 Pack MJ</button>
                <button className={v.status==='ARCHIVED'?'secondary':'danger secondary'} onClick={()=>props.onArchiveVersion(v.id,v.status!=='ARCHIVED')}>{v.status==='ARCHIVED'?'Réactiver':'Archiver'}</button>
              </div>
            </article>)}
          </div>

          <div className="familyTools">
            <button className="secondary" onClick={()=>{
              setPickerScenarioId(pickerOpen?null:s.id);
              const first=s.versions[0];
              setPlayerCount(first?.minPlayers??first?.counts.playableCharacters??1);
              setWomen('');
              setMen('');
            }}>{pickerOpen?'Fermer le filtre':'Trouver une variante pour mon groupe'}</button>
            {archivedVersions.length>0&&<button className="secondary" onClick={()=>setShowArchivedVariants(v=>!v)}>{showArchivedVariants?'Masquer les archivées':`Voir les archivées (${archivedVersions.length})`}</button>}
          </div>

          {pickerOpen&&<section className="variantPicker compactPicker">
            <div><p className="eyebrow">COMPATIBILITÉ</p><h4>Quel groupe vas-tu accueillir ?</h4></div>
            <div className="variantPickerInputs"><label>Joueurs<input type="number" min="1" value={playerCount} onChange={e=>setPlayerCount(Math.max(1,Number(e.target.value)||1))}/></label><label>Femmes <span>(optionnel)</span><input type="number" min="0" value={women} onChange={e=>setWomen(e.target.value)}/></label><label>Hommes <span>(optionnel)</span><input type="number" min="0" value={men} onChange={e=>setMen(e.target.value)}/></label></div>
            <div className="compatibilityList">{candidates.length===0?<p className="empty">Aucune variante compatible.</p>:candidates.map(v=><button key={v.id} className="compatibilityRow" onClick={()=>props.onOpenVersion(v.id)}><span><strong>{v.variantName||`${v.counts.playableCharacters} joueurs`}</strong><small>{genderProfileLabel(v.genderProfile)} · {v.genderComposition.label}</small></span><span><small>Révision</small><b>V{v.versionLabel}</b></span></button>)}</div>
          </section>}
        </details>
      </article>;
    })}</div>
  </section>;

  const v=props.version;
  return <section>
    {props.error && <p className="errorbox standalone">{props.error}</p>}
    <button className="backlink" onClick={props.onBack}>← Scénario & variantes</button>
    {props.versionLoading ? <section className="card emptyState">Chargement…</section> : <>
      <section className="scenarioHero"><div><p className="eyebrow">{v.universe||'SCÉNARIO'} · {v.era||''}</p><h2>{v.scenario.title}</h2><p className="heroSubtitle">{v.variantName||v.subtitle}</p><p className="playerPitch">{v.playerSummary}</p></div><div className="heroVersion"><span>RÉVISION</span><strong>{v.versionLabel}</strong><small>{v.status} · {v.language}</small></div></section>
      <section className="metaStrip versionMetaStrip"><div><span>Variante</span><strong>{v.variantName||'—'}</strong></div><div><span>Joueurs</span><strong>{v.minPlayers===v.maxPlayers?(v.minPlayers??'—'):`${v.minPlayers??'—'}–${v.maxPlayers??'—'}`}</strong></div><div><span>Composition</span><strong>{v.genderComposition.label}</strong></div><div><span>Profil</span><strong>{genderProfileLabel(v.genderProfile)}</strong></div><div><span>Durée</span><strong>{v.durationMinutes?`${v.durationMinutes} min`:'—'}</strong></div><div><span>Import</span><strong className="dateStrong">{niceDate(v.importedAt)}</strong></div></section>
      {v.variantNotes&&<section className="card variantNotes"><p className="eyebrow">NOTES DE VERSION</p><p>{v.variantNotes}</p></section>}
      {v.status==='ARCHIVED'
        ? <section className="card archivedVariantNotice">
            <div>
              <p className="eyebrow">VARIANTE ARCHIVÉE</p>
              <h3>Consultation uniquement</h3>
              <p>Cette variante reste disponible pour l’historique et les anciennes sessions, mais elle n’est plus proposée pour créer une nouvelle partie.</p>
            </div>
            <button
              className="secondary"
              onClick={()=>props.onArchiveVersion(v.id,false)}
            >
              Réactiver cette variante
            </button>
          </section>
        : <CreateSessionForm version={v} onCreate={props.onCreateSession}/>
      }
      <details className="gmSummary card"><summary>Résumé maître du jeu</summary><p>{v.gmSummary}</p></details>
      <MediaLibraryPanel version={v} onChanged={()=>props.onOpenVersion(v.id)}/>
      <div className="workspace"><section className="characterPane card"><div className="paneHead"><div><p className="eyebrow">CASTING</p><h3>Personnages de cette variante</h3></div><span>{v.characters.filter(c=>c.active!==false).length}</span></div><div className="characterList">{v.characters.filter(c=>c.active!==false).map(c=><button className={`characterRow ${props.character?.character.externalId===c.externalId?'selected':''}`} key={c.externalId} onClick={()=>props.onOpenCharacter(c.externalId)}><span className="avatar">{v.mediaOverrides?.[`CHARACTER:${c.externalId}`]?.source?<img src={v.mediaOverrides[`CHARACTER:${c.externalId}`].source||''} alt={c.name}/>:c.name.slice(0,1).toUpperCase()}</span><span className="characterIdentity"><strong>{c.name}</strong><small>{c.publicRole||'Rôle non public'}</small></span><span className="characterTags"><em>{characterGenderLabel(c.gender)}</em><small>{importanceLabel(c.importance)}</small></span></button>)}</div></section><section className="detailPane">{!props.character&&!props.characterLoading&&<div className="card detailPlaceholder"><span className="bigGlyph">♠</span><h3>Choisis un personnage</h3><p>Sa fiche détaillée apparaîtra ici.</p></div>}{props.characterLoading&&<div className="card detailPlaceholder">Chargement…</div>}{props.character&&!props.characterLoading&&<CharacterSheet detail={props.character}/>}</section></div>
    </>}
  </section>;
}

function CreateSessionForm({version,onCreate}:{version:ScenarioVersionDetail;onCreate:(input:{name:string;scheduledAt?:string;venue?:string;language?:string;notes?:string})=>Promise<void>}) {
  const [open,setOpen]=useState(false); const [name,setName]=useState(`${version.scenario.title} — session`); const [scheduledAt,setScheduledAt]=useState(''); const [venue,setVenue]=useState(''); const [language,setLanguage]=useState(String(version.language||'FR').toUpperCase()==='EN'?'EN':'FR'); const [busy,setBusy]=useState(false);
  if(!open) return <section className="sessionCta card"><div><p className="eyebrow">EXPLOITATION</p><h3>Préparer une partie</h3><p>Crée directement une session si ton groupe est déjà connu. Pour collecter les inscriptions d’abord, utilise l’onglet « Inscriptions » du scénario.</p></div><button onClick={()=>setOpen(true)}>Créer une session</button></section>;
  return <section className="sessionCta card sessionForm"><div><p className="eyebrow">NOUVELLE SESSION</p><h3>{version.scenario.title} · {version.variantName||`V${version.versionLabel}`}</h3><p>{version.genderComposition.label} · {genderProfileLabel(version.genderProfile)}</p></div><div className="formGrid"><label>Nom<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Date & heure<input type="datetime-local" value={scheduledAt} onChange={e=>setScheduledAt(e.target.value)}/></label><label>Lieu<input value={venue} onChange={e=>setVenue(e.target.value)} placeholder="Western City, client…"/></label><label>Langue joueurs<select value={language} onChange={e=>setLanguage(e.target.value)}><option value="FR">Français</option><option value="EN">English</option></select></label></div><div className="formActions"><button className="secondary" onClick={()=>setOpen(false)}>Annuler</button><button disabled={!name.trim()||busy} onClick={async()=>{setBusy(true);try{await onCreate({name,scheduledAt,venue,language});}finally{setBusy(false);}}}>{busy?'Création…':'Créer et ouvrir'}</button></div></section>;
}

function SessionsView(props:{sessions:SessionSummary[];session:SessionDetail|null;runtime:RuntimeState|null;runtimeLoading:boolean;live:LiveDashboard|null;liveLoading:boolean;loading:boolean;error:string;onReload:()=>void;onOpen:(id:string)=>void;onBack:()=>void;onAddParticipant:(input:{displayName:string;email:string;ageBracket:string;genderPreference:string;desiredInvolvement:string;notes?:string})=>Promise<void>;onCast:(participantId:string,characterExternalId:string|null)=>void;onStatus:(status:string)=>void;onUpdateDetails:(input:{name:string;scheduledAt:string;venue:string;language:string})=>Promise<void>;onArchive:(archived:boolean)=>void;onPurge:(sessionId:string,name:string)=>void;onInitializeRuntime:()=>void;onPlayerAccess:(enabled:boolean)=>void;onPlayerMessage:(input:{characterExternalId:string;title:string;body:string;priority?:string})=>Promise<void>;onLiveControl:(action:string)=>void;onLiveResource:(characterExternalId:string,resourceExternalId:string,value:number,mode:'DELTA'|'SET')=>void;onLiveState:(characterExternalId:string,stateExternalId:string,action:'APPLY'|'REMOVE')=>void;onLiveEvent:(eventExternalId:string,status:'PENDING'|'DONE'|'SKIPPED')=>void;onInteractionMutation:()=>void}) {
  const [showArchived,setShowArchived]=useState(false);
  const listedSessions=showArchived?props.sessions:props.sessions.filter(s=>s.status!=='ARCHIVED');

  if(!props.session) return <section>
    {props.error&&<p className="errorbox standalone">{props.error}</p>}
    <div className="sectionhead">
      <div><p className="eyebrow">EXPLOITATION</p><h2>Sessions</h2><p>Une ligne par partie : date, scénario, état et casting.</p></div>
      <div className="sessionListActions"><button className={showArchived?'active secondary':'secondary'} onClick={()=>setShowArchived(v=>!v)}>{showArchived?'Masquer les archivées':'Voir les archivées'}</button><button className="secondary" onClick={props.onReload}>Actualiser</button></div>
    </div>
    {listedSessions.length===0
      ? <section className="card emptyState"><strong>{showArchived?'Aucune session.':'Aucune session active.'}</strong><p>Crée-la depuis les inscriptions ou directement depuis un scénario.</p></section>
      : <div className="sessionCompactList">{listedSessions.map(s=><article className={`sessionCompactRow ${s.status==='ARCHIVED'?'archived':''}`} key={s.id}>
          <div className="sessionCompactDate"><strong>{sessionDateLabel(s.scheduledAt)}</strong><small>{sessionTimeLabel(s.scheduledAt)||'Heure à définir'}</small></div>
          <div className="sessionCompactIdentity"><span>{s.scenarioVersion?.scenario?.title??'Scénario'}</span><strong>{s.name||'Session'}</strong><small>{s.venue||'Lieu à définir'} · {s.language}</small></div>
          <div className="sessionCompactProgress"><span className={`sessionStatus ${s.status.toLowerCase()}`}>{statusLabel(s.status)}</span><small>{s.counts.assigned}/{s.counts.participants} castés</small></div>
          <div className="sessionCompactActions"><button onClick={()=>props.onOpen(s.id)}>Ouvrir</button><button className="danger secondary" onClick={()=>props.onPurge(s.id,s.name||'Session')}>🗑</button></div>
        </article>)}</div>
    }
  </section>;

  const s=props.session; const archived=s.status==='ARCHIVED'; const assigned=new Map(s.participants.filter(p=>p.characterExternalId).map(p=>[p.characterExternalId!,p.id]));
  return <section>{props.error&&<p className="errorbox standalone">{props.error}</p>}<button className="backlink" onClick={props.onBack}>← Sessions</button>{props.loading?<section className="card emptyState">Chargement…</section>:<>
    <section className={`sessionHero ${archived?'archived':''}`}><div className="sessionHeroDate"><strong>{sessionDateLabel(s.scheduledAt)}</strong><span>{sessionTimeLabel(s.scheduledAt)||'Heure à définir'}</span></div><div className="sessionHeroMain"><p className="eyebrow">{s.scenarioVersion.scenario?.title} · V{s.scenarioVersion.versionLabel}</p><h2>{s.name||'Session'}</h2><p>{s.venue||'Lieu à définir'} · {s.language}</p></div><span className={`sessionStatus large ${s.status.toLowerCase()}`}>{statusLabel(s.status)}</span></section>
    {!archived&&<EditSessionPanel session={s} onSave={props.onUpdateDetails}/>}
    <section className="metaStrip"><div><span>Participants</span><strong>{s.counts.participants}</strong></div><div><span>Castés</span><strong>{s.counts.assigned}</strong></div><div><span>Rôles disponibles</span><strong>{s.counts.playableCharacters}</strong></div><div><span>Sans rôle</span><strong>{s.counts.unassignedParticipants}</strong></div><div><span>Rôles libres</span><strong>{s.counts.unassignedCharacters}</strong></div></section>
    {!archived&&<SessionPreparationPanel session={s} onApplied={()=>props.onOpen(s.id)} onMarkReady={()=>props.onStatus('READY')}/>}
    <section className="card sessionVariantCard">
      <div>
        <p className="eyebrow">VARIANTE DE SCÉNARIO</p>
        <h3>{s.scenarioVersion?.variantName || s.scenarioVersion?.versionLabel || 'Variante'}</h3>
        <p>
          Cette session utilise <strong>{s.scenarioVersion?.scenario?.title || 'ce scénario'}</strong>
          {' · '}
          {s.scenarioVersion?.genderProfile || 'profil non renseigné'}
          {s.scenarioVersion?.minPlayers!=null && s.scenarioVersion?.maxPlayers!=null
            ? ` · ${s.scenarioVersion.minPlayers===s.scenarioVersion.maxPlayers
                ? `${s.scenarioVersion.minPlayers} PJ`
                : `${s.scenarioVersion.minPlayers}–${s.scenarioVersion.maxPlayers} PJ`}`
            : ''}
        </p>
      </div>
      <div className="sessionVariantBadge">
        <span>MASTER</span>
        <strong>{s.scenarioVersion?.variantName || s.scenarioVersion?.versionLabel || '—'}</strong>
      </div>
    </section>

    {!archived&&s.runtimeInitializedAt&&
      <PlayerAccessPanel
        session={s}
        onToggle={props.onPlayerAccess}
        onMessage={props.onPlayerMessage}
      />
    }

    <section className="card sessionLifecycle"><div><p className="eyebrow">GESTION DE LA SESSION</p><h3>{archived?'Session archivée':'Conserver ou supprimer'}</h3><p>{archived?'Elle est masquée de la liste active. Tu peux la réactiver en brouillon.':'Archive-la pour la conserver. En période de test, la suppression définitive efface aussi le runtime, les votes et les journaux.'}</p></div><div className="lifecycleButtons">{archived?<button className="secondary" onClick={()=>props.onArchive(false)}>Réactiver en brouillon</button>:<button className="secondary" onClick={()=>props.onArchive(true)}>Archiver la session</button>}<button className="danger" onClick={()=>props.onPurge(s.id,s.name||'Session')}>Supprimer définitivement (tests)</button></div></section>
    {!archived&&['DRAFT','CASTING','READY'].includes(s.status)&&<section className="card sessionState"><div><p className="eyebrow">ÉTAT PRÉ-LIVE</p><h3>{statusLabel(s.status)}</h3><p>DRAFT = préparation · CASTING = attribution en cours · READY = distribution verrouillée et prête pour le briefing.</p></div><div className="statusButtons">{['DRAFT','CASTING','READY'].map(st=><button key={st} disabled={Boolean(s.runtimeInitializedAt)&&st!=='READY'} className={s.status===st?'active':''} onClick={()=>props.onStatus(st)}>{statusLabel(st)}</button>)}</div></section>}
    <section className="sessionPackShortcut card">
      <div>
        <p className="eyebrow">
          PACK MJ DE SESSION
        </p>

        <h3>Production de cette partie</h3>

        <p>
          Fiches personnages, casting, enveloppes,
          QR et installation utilisent les incarnations
          propres à cette session.
        </p>
      </div>

      <button
        onClick={()=>
          window.open(
            `/?gmPackSession=${encodeURIComponent(s.id)}`,
            '_blank'
          )
        }
      >
        📦 Ouvrir le Pack de session
      </button>
    </section>

    <SessionIncarnationsPanel session={s}/>
    <RuntimePanel session={s} runtime={props.runtime} loading={props.runtimeLoading} onInitialize={props.onInitializeRuntime}/>
    {!archived&&s.runtimeInitializedAt&&<LivePanel session={s} live={props.live} loading={props.liveLoading} onControl={props.onLiveControl} onResource={props.onLiveResource} onState={props.onLiveState} onEvent={props.onLiveEvent} onInteractionMutation={props.onInteractionMutation}/>}
    {!archived&&!s.runtimeInitializedAt?<AddParticipantForm onAdd={props.onAddParticipant}/>:!archived?<section className="card lockNotice"><strong>Préparation verrouillée</strong><p>Le runtime est initialisé : participants et casting ne peuvent plus être modifiés dans cette version.</p></section>:null}
    <section className="card castingBoard"><div className="paneHead"><div><p className="eyebrow">CASTING</p><h3>Participants & rôles</h3></div><span>{s.counts.assigned}/{s.counts.participants}</span></div>{s.participants.length===0?<p className="empty">Ajoute d’abord les participants.</p>:<div className="castingTable">{s.participants.map(p=><div className="castingRow" key={p.id}><div className="participantIdentity"><strong>{p.displayName}</strong><small>{p.email||'E-mail non renseigné'}{p.precastSubmittedAt?' · pré-casting ✓':''}</small><div className="participantBadges"><span className="ageBadge">{ageBracketLabel(p.ageBracket)}</span><span className="involvementBadge">{involvementLabel(p.desiredInvolvement)}</span></div></div><select
    disabled={Boolean(s.runtimeInitializedAt)||archived}
    value={p.characterExternalId??''}
    onChange={e=>{
      const next=e.target.value||null;
      if(next){
        const holderId=assigned.get(next);
        if(holderId&&holderId!==p.id){
          const holderParticipant=s.participants.find(x=>x.id===holderId);
          const currentRole=p.characterExternalId
            ? s.characters.find(x=>x.externalId===p.characterExternalId)?.name||p.characterExternalId
            : null;
          const message=currentRole
            ? `${s.characters.find(x=>x.externalId===next)?.name||next} est déjà attribué à ${holderParticipant?.displayName||'un autre joueur'}.\n\nContinuer échangera les rôles : ${holderParticipant?.displayName||'ce joueur'} recevra « ${currentRole} ».`
            : `${s.characters.find(x=>x.externalId===next)?.name||next} est déjà attribué à ${holderParticipant?.displayName||'un autre joueur'}.\n\nContinuer déplacera ce rôle vers ${p.displayName} et laissera l’autre joueur sans rôle.`;
          if(!window.confirm(message))return;
        }
      }
      props.onCast(p.id,next);
    }}
  >
    <option value="">— Aucun personnage —</option>
    {s.characters.map(c=>{
      const holderId=assigned.get(c.externalId);
      const holder=holderId?s.participants.find(x=>x.id===holderId):null;
      return <option key={c.externalId} value={c.externalId}>
        {c.name}{c.publicRole?` — ${c.publicRole}`:''}{holder&&holder.id!==p.id?` · actuellement : ${holder.displayName}`:''}
      </option>;
    })}
  </select><span className={`castDot ${p.characterExternalId?'done':''}`}>{p.characterExternalId?'✓':'…'}</span></div>)}</div>}</section>
  </>}</section>;
}


function PlayerAccessPanel({session,onToggle,onMessage}:{session:SessionDetail;onToggle:(enabled:boolean)=>void;onMessage:(input:{characterExternalId:string;title:string;body:string;priority?:string})=>Promise<void>}) {
  const casted=session.participants.filter(p=>p.active!==false&&p.characterExternalId);
  const enabled=casted.some(p=>p.playerAccessEnabled);
  const [copied,setCopied]=useState(''); const [target,setTarget]=useState(casted[0]?.characterExternalId||''); const [title,setTitle]=useState('Message du MJ'); const [body,setBody]=useState(''); const [busy,setBusy]=useState(false);
  useEffect(()=>{ if(!target || !casted.some(p=>p.characterExternalId===target)) setTarget(casted[0]?.characterExternalId||''); },[casted.map(p=>p.characterExternalId).join('|'),target]);
  const link=(p:SessionParticipant)=>p.playerAccessToken?`${window.location.origin}/?player=${encodeURIComponent(p.playerAccessToken)}`:'';
  return <section className="card playerAccessPanel liveCommunicationPanel">
    <div className="precastHead">
      <div>
        <p className="eyebrow">COMMUNICATION JOUEURS</p>
        <h3>{enabled?'Messages & accès joueurs':'Accès joueurs désactivé'}</h3>
        <p>En live, utilise ce bloc pour envoyer rapidement une information à un joueur.</p>
      </div>
      <button className={enabled?'danger secondary':''} onClick={()=>onToggle(!enabled)}>
        {enabled?'Désactiver les liens':'Activer les liens joueurs'}
      </button>
    </div>

    {enabled&&casted.length>0&&
      <div className="playerMessageComposer liveMessageComposer">
        <p className="eyebrow">MESSAGE MJ</p>
        <div className="formGrid">
          <label>Destinataire
            <select value={target} onChange={e=>setTarget(e.target.value)}>
              {casted.map(p=><option key={p.id} value={p.characterExternalId||''}>
                {session.characters.find(c=>c.externalId===p.characterExternalId)?.name||p.displayName}
              </option>)}
            </select>
          </label>
          <label>Titre
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Information importante"/>
          </label>
        </div>
        <label>Message <span>(obligatoire)</span>
          <textarea value={body} onChange={e=>setBody(e.target.value)} placeholder="Votre message…"/>
        </label>
        <button disabled={busy||!target||!title.trim()||!body.trim()} onClick={async()=>{
          setBusy(true);
          try{
            await onMessage({characterExternalId:target,title,body});
            setTitle('Message du MJ');
            setBody('');
          }finally{
            setBusy(false);
          }
        }}>{busy?'Envoi…':'Envoyer au joueur'}</button>
      </div>
    }

    {enabled&&
      <details className="playerAccessLinks">
        <summary>
          <span>Liens joueurs & suivi des ouvertures</span>
          <b>{casted.length}</b>
        </summary>
        <div className="playerLinkRows">
          {casted.map(p=><div className="playerLinkRow" key={p.id}>
            <div>
              <strong>{p.displayName}</strong>
              <small>{p.characterDisplayName||session.characters.find(c=>c.externalId===p.characterExternalId)?.name||p.characterExternalId}</small>
              <div className="playerLinkStatus">
                <span>{p.briefingReadAt?'Fiche lue ✓':p.playerFirstOpenedAt?'Ouvert':'Jamais ouvert'}</span>
                <span>{p.playerOpenCount||0} ouverture(s)</span>
              </div>
            </div>
            <input readOnly value={link(p)}/>
            <button className="secondary" disabled={!link(p)} onClick={async()=>{
              await navigator.clipboard.writeText(link(p));
              setCopied(p.id);
              setTimeout(()=>setCopied(''),1300);
            }}>{copied===p.id?'Copié ✓':'Copier'}</button>
          </div>)}
        </div>
      </details>
    }
  </section>;
}


function EditSessionPanel({session,onSave}:{session:SessionDetail;onSave:(input:{name:string;scheduledAt:string;venue:string;language:string})=>Promise<void>}) {
  const [open,setOpen]=useState(false);
  const [name,setName]=useState(session.name||'');
  const [scheduledAt,setScheduledAt]=useState(localDateTimeInput(session.scheduledAt));
  const [venue,setVenue]=useState(session.venue||'');
  const [language,setLanguage]=useState(String(session.language||'FR').toUpperCase()==='EN'?'EN':'FR');
  const [busy,setBusy]=useState(false);
  const locked=Boolean(session.startedAt||session.pausedAt||session.finishedAt||['LIVE','PAUSED','FINISHED'].includes(session.status));

  useEffect(()=>{ setName(session.name||''); setScheduledAt(localDateTimeInput(session.scheduledAt)); setVenue(session.venue||''); setLanguage(String(session.language||'FR').toUpperCase()==='EN'?'EN':'FR'); },[session.id,session.name,session.scheduledAt,session.venue,session.language]);

  if(!open) return <div className="sessionEditBar"><button className="secondary" disabled={locked} title={locked?'La date et l’heure sont verrouillées après le lancement du live.':''} onClick={()=>setOpen(true)}>Modifier la session</button>{locked&&<span>Date et heure verrouillées après lancement du live.</span>}</div>;

  return <section className="card editSessionPanel"><div className="paneHead"><div><p className="eyebrow">PARAMÈTRES DE SESSION</p><h3>Modifier date, heure et lieu</h3></div></div><div className="formGrid editSessionFields"><label>Nom<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Date & heure<input type="datetime-local" value={scheduledAt} onChange={e=>setScheduledAt(e.target.value)}/></label><label>Lieu<input value={venue} onChange={e=>setVenue(e.target.value)} placeholder="Western City, client…"/></label><label>Langue joueurs<select value={language} onChange={e=>setLanguage(e.target.value)}><option value="FR">Français</option><option value="EN">English</option></select></label></div><div className="formActions"><button className="secondary" disabled={busy} onClick={()=>{setName(session.name||'');setScheduledAt(localDateTimeInput(session.scheduledAt));setVenue(session.venue||'');setLanguage(String(session.language||'FR').toUpperCase()==='EN'?'EN':'FR');setOpen(false);}}>Annuler</button><button disabled={busy||!name.trim()} onClick={async()=>{setBusy(true);try{await onSave({name,scheduledAt,venue,language});setOpen(false);}finally{setBusy(false);}}}>{busy?'Enregistrement…':'Enregistrer les modifications'}</button></div></section>;
}


function SessionIncarnationsPanel({
  session
}:{
  session:SessionDetail
}){
  const [data,setData]=useState<any|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  async function load(){
    setLoading(true);
    setError('');

    try{
      const r=await fetchJson<any>(
        `/api/sessions/incarnations?sessionId=${encodeURIComponent(session.id)}`
      );

      setData(r);

    }catch(e){
      setError(
        e instanceof Error
          ? e.message
          : String(e)
      );

    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{
    void load();
  },[
    session.id,
    session.counts.assigned
  ]);

  async function freezeAll(){
    if(
      !window.confirm(
        'Figer toutes les fiches actuellement non figées pour cette session ?'
      )
    ) return;

    setBusy(true);
    setError('');

    try{
      await postJson(
        '/api/sessions/incarnations/freeze',
        {sessionId:session.id}
      );

      await load();

    }catch(e){
      setError(
        e instanceof Error
          ? e.message
          : String(e)
      );

    }finally{
      setBusy(false);
    }
  }

  const rows=data?.incarnations??[];

  return <section className="card incarnationPanel">

    <div className="paneHead">
      <div>
        <p className="eyebrow">
          INCARNATIONS DE SESSION · V1.8D
        </p>

        <h3>Personnages de cette partie</h3>

        <p className="microNote">
          Le rôle technique et son QR restent stables.
          Ici tu modifies uniquement son incarnation
          pour cette session.
        </p>
      </div>

      <button
        className="secondary"
        disabled={
          busy ||
          rows.length===0 ||
          session.status==='ARCHIVED'
        }
        onClick={()=>void freezeAll()}
      >
        {busy
          ? 'Figeage…'
          : '🔒 Figer les fiches'}
      </button>
    </div>

    {error&&
      <p className="errorbox">
        {error}
      </p>
    }

    {loading&&!data
      ? <p className="microNote">
          Chargement des incarnations…
        </p>

      : rows.length===0
        ? <p className="empty">
            Attribue d’abord les personnages.
          </p>

        : <div className="incarnationList">
            {rows.map((row:any)=>
              <SessionIncarnationEditor
                key={row.participantId}
                sessionId={session.id}
                row={row}
                disabled={session.status==='ARCHIVED'}
                onSaved={load}
              />
            )}
          </div>
    }

  </section>;
}


function SessionIncarnationEditor({
  sessionId,
  row,
  disabled,
  onSaved
}:{
  sessionId:string;
  row:any;
  disabled:boolean;
  onSaved:()=>Promise<void>;
}){
  const resolved=row.resolved;

  const [name,setName]=
    useState(resolved.character.name??'');

  const [genderVariant,setGenderVariant]=
    useState(row.genderVariant??'');

  const [publicRole,setPublicRole]=
    useState(resolved.character.publicRole??'');

  const [narrativeAge,setNarrativeAge]=
    useState(resolved.character.narrativeAge??'');

  const [biography,setBiography]=
    useState(resolved.character.biography??'');

  const [secretIntro,setSecretIntro]=
    useState(resolved.character.secretIntro??'');

  const [apparentMotive,setApparentMotive]=
    useState(resolved.character.apparentMotive??'');

  const [personalTimeline,setPersonalTimeline]=
    useState(resolved.character.personalTimeline??'');

  const [motto,setMotto]=
    useState(resolved.character.motto??'');

  const [objectives,setObjectives]=
    useState<any[]>(resolved.objectives??[]);

  const [relationships,setRelationships]=
    useState<any[]>(resolved.relationships??[]);

  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    const r=row.resolved;

    setName(r.character.name??'');
    setGenderVariant(row.genderVariant??'');
    setPublicRole(r.character.publicRole??'');
    setNarrativeAge(r.character.narrativeAge??'');
    setBiography(r.character.biography??'');
    setSecretIntro(r.character.secretIntro??'');
    setApparentMotive(r.character.apparentMotive??'');
    setPersonalTimeline(r.character.personalTimeline??'');
    setMotto(r.character.motto??'');
    setObjectives(r.objectives??[]);
    setRelationships(r.relationships??[]);
  },[row.snapshotAt,row.characterDisplayName]);


  async function save(){
    setBusy(true);
    setError('');

    try{
      await postJson(
        '/api/sessions/incarnation',
        {
          sessionId,
          participantId:row.participantId,

          characterDisplayName:name,
          characterGenderVariant:
            genderVariant||null,

          snapshot:{
            characterExternalId:
              row.characterExternalId,

            character:{
              name,
              publicRole:
                publicRole||null,

              narrativeAge:
                narrativeAge||null,

              gender:
                genderVariant ||
                resolved.character.gender ||
                null,

              biography,
              secretIntro:
                secretIntro||null,

              apparentMotive:
                apparentMotive||null,

              personalTimeline:
                personalTimeline||null,

              motto:
                motto||null,
            },

            objectives:
              objectives.map(o=>({
                externalId:o.externalId,
                title:o.title,
                description:o.description,
                objectiveType:
                  o.objectiveType??null,
                secret:Boolean(o.secret),
                importance:
                  o.importance??null,
              })),

            relationships:
              relationships.map(r=>({
                externalId:r.externalId,
                otherExternalId:
                  r.otherExternalId,

                relationType:
                  r.relationType??null,

                text:r.text,

                visibility:
                  r.visibility??'PLAYER',
              })),
          }
        }
      );

      await onSaved();

    }catch(e){
      setError(
        e instanceof Error
          ? e.message
          : String(e)
      );

    }finally{
      setBusy(false);
    }
  }


  async function reset(){
    if(
      !window.confirm(
        'Revenir à la fiche canonique du scénario pour ce personnage ?'
      )
    ) return;

    setBusy(true);

    try{
      await postJson(
        '/api/sessions/incarnation',
        {
          sessionId,
          participantId:row.participantId,
          reset:true,
        }
      );

      await onSaved();

    }finally{
      setBusy(false);
    }
  }


  return <details className="incarnationCard">

    <summary>
      <div>
        <strong>{name}</strong>

        <small>
          joué par {row.participantDisplayName}
          {' · '}
          {row.characterExternalId}
        </small>
      </div>

      <span className={
        row.frozen
          ? 'incarnationFrozen'
          : 'incarnationDraft'
      }>
        {row.frozen
          ? 'figée'
          : 'canonique'}
      </span>
    </summary>


    <div className="incarnationEditor">

      {error&&
        <p className="errorbox">
          {error}
        </p>
      }

      <div className="formGrid incarnationIdentityFields">

        <label>
          Nom du personnage
          <input
            value={name}
            disabled={disabled}
            onChange={e=>setName(e.target.value)}
          />
        </label>

        <label>
          Variante / genre
          <select
            value={genderVariant}
            disabled={disabled}
            onChange={
              e=>setGenderVariant(e.target.value)
            }
          >
            <option value="">
              Version canonique
            </option>

            <option value="MASCULIN">
              Masculin
            </option>

            <option value="FEMININ">
              Féminin
            </option>

            <option value="NEUTRE">
              Neutre
            </option>
          </select>
        </label>

        <label>
          Rôle public
          <input
            value={publicRole}
            disabled={disabled}
            onChange={
              e=>setPublicRole(e.target.value)
            }
          />
        </label>

        <label>
          Âge narratif
          <input
            value={narrativeAge}
            disabled={disabled}
            onChange={
              e=>setNarrativeAge(e.target.value)
            }
          />
        </label>

      </div>


      <label className="incarnationTextField">
        Biographie
        <textarea
          rows={7}
          value={biography}
          disabled={disabled}
          onChange={
            e=>setBiography(e.target.value)
          }
        />
      </label>


      <label className="incarnationTextField">
        Secret / ce que le personnage seul sait
        <textarea
          rows={5}
          value={secretIntro}
          disabled={disabled}
          onChange={
            e=>setSecretIntro(e.target.value)
          }
        />
      </label>


      <label className="incarnationTextField">
        Position / mobile apparent
        <textarea
          rows={4}
          value={apparentMotive}
          disabled={disabled}
          onChange={
            e=>setApparentMotive(e.target.value)
          }
        />
      </label>


      <label className="incarnationTextField">
        Chronologie personnelle
        <textarea
          rows={5}
          value={personalTimeline}
          disabled={disabled}
          onChange={
            e=>setPersonalTimeline(e.target.value)
          }
        />
      </label>


      <label className="incarnationTextField">
        Devise
        <input
          value={motto}
          disabled={disabled}
          onChange={
            e=>setMotto(e.target.value)
          }
        />
      </label>


      <div className="incarnationSubsection">
        <h4>Objectifs</h4>

        {objectives.map((objective,index)=>
          <article
            className="incarnationObjective"
            key={objective.externalId}
          >
            <input
              value={objective.title}
              disabled={disabled}
              onChange={e=>
                setObjectives(rows=>
                  rows.map((x,i)=>
                    i===index
                      ? {
                          ...x,
                          title:e.target.value
                        }
                      : x
                  )
                )
              }
            />

            <textarea
              rows={3}
              value={objective.description}
              disabled={disabled}
              onChange={e=>
                setObjectives(rows=>
                  rows.map((x,i)=>
                    i===index
                      ? {
                          ...x,
                          description:e.target.value
                        }
                      : x
                  )
                )
              }
            />
          </article>
        )}
      </div>


      <div className="incarnationSubsection">
        <h4>Relations</h4>

        {relationships.map((relation,index)=>
          <article
            className="incarnationRelation"
            key={relation.externalId}
          >
            <strong>
              {relation.otherName}
            </strong>

            <small>
              {relation.otherPublicRole||''}
            </small>

            <textarea
              rows={3}
              value={relation.text??''}
              disabled={disabled}
              onChange={e=>
                setRelationships(rows=>
                  rows.map((x,i)=>
                    i===index
                      ? {
                          ...x,
                          text:e.target.value
                        }
                      : x
                  )
                )
              }
            />
          </article>
        )}
      </div>


      {!disabled&&
        <div className="incarnationActions">

          <button
            className="secondary danger"
            disabled={busy}
            onClick={()=>void reset()}
          >
            Revenir au canon
          </button>

          <button
            disabled={busy||!name.trim()}
            onClick={()=>void save()}
          >
            {busy
              ? 'Enregistrement…'
              : 'Enregistrer cette incarnation'}
          </button>

        </div>
      }

    </div>
  </details>;
}


function RuntimePanel({session,runtime,loading,onInitialize}:{session:SessionDetail;runtime:RuntimeState|null;loading:boolean;onInitialize:()=>void}) {
  const ready=session.status==='READY' && session.counts.participants>0 && session.counts.unassignedParticipants===0;
  const initialized=Boolean(runtime?.initialized || session.runtimeInitializedAt);

  const incarnationReady=
    (runtime as any)?.incarnationReady!==false;

  const resourceName=(id:string)=>({RES_PA:'PA',RES_CASH:'Cash',RES_BANK:'Banque',RES_INFLUENCE:'Influence'} as Record<string,string>)[id]??id.replace(/^RES_/, '');
  return <section className="card runtimePanel"><div className="runtimeHead"><div><p className="eyebrow">RUNTIME DE SESSION</p><h3>{initialized?'État joueur initialisé':'Préparer les états de jeu'}</h3><p>Crée les copies vivantes des personnages : ressources, objectifs, connaissances et objets de cette partie.</p></div>{!initialized&&<button disabled={
      loading ||
      !ready ||
      runtime?.sourceReady!==true ||
      !incarnationReady
    } onClick={onInitialize}>{loading?'Initialisation…':'Initialiser le runtime'}</button>}</div>
    {loading&&!runtime&&<p className="microNote">Lecture des données runtime…</p>}
    {runtime&&!runtime.sourceReady&&<div className="runtimeWarning"><strong>Données runtime à enrichir</strong><p>Réimporte une fois ce MASTER après la mise à jour V0.6. Cela enrichit la variante existante sans la dupliquer.</p></div>}
    {!initialized&&runtime?.sourceReady&& !ready&&<p className="microNote">Pour initialiser : passe la session à « Prête » et attribue un personnage à chaque participant.</p>}
    {!initialized&&runtime?.sourceReady&&ready&&!incarnationReady&&
      <div className="runtimeWarning">
        <strong>Fiches personnages à figer</strong>
        <p>
          {(runtime as any).incarnationFrozenCount??0}/
          {(runtime as any).incarnationTotal??0} fiche(s)
          sont figées. Fige toutes les incarnations avant
          d'initialiser le runtime.
        </p>
      </div>
    }

    {initialized&&runtime&&<><div className="runtimeStats"><div><span>Personnages</span><strong>{runtime.counts.characters}</strong></div><div><span>Ressources</span><strong>{runtime.counts.resources}</strong></div><div><span>Objectifs</span><strong>{runtime.counts.objectives}</strong></div><div><span>Connaissances</span><strong>{runtime.counts.knowledge}</strong></div><div><span>Objets</span><strong>{runtime.counts.objects}</strong></div></div><div className="runtimeCharacters">{runtime.characters.map(c=><article key={c.characterExternalId}><div><strong>{(c as any).characterName||c.characterExternalId}</strong><small>
      {c.participantName?`Joueur : ${c.participantName} · `:''}
      {c.characterExternalId} · {c.objectiveCount} objectifs · {c.knowledgeCount} connaissances · {c.objectCount} objets
    </small></div><div className="resourcePills">{c.resources.map(r=><span key={r.resourceExternalId}><b>{resourceName(r.resourceExternalId)}</b> {r.currentValue}{r.maxValue!=null?`/${r.maxValue}`:''}</span>)}</div></article>)}</div><p className="microNote">Initialisé {niceDate(runtime.initializedAt)} · runtime V{runtime.runtimeVersion||'0.6'}. Le casting est désormais verrouillé.</p></>}
  </section>;
}

function formatElapsed(totalSeconds:number) {
  const s=Math.max(0,Math.floor(totalSeconds)); const h=Math.floor(s/3600); const m=Math.floor((s%3600)/60); const sec=s%60;
  return h>0?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function LivePanel({session,live,loading,onControl,onResource,onState,onEvent,onInteractionMutation}:{session:SessionDetail;live:LiveDashboard|null;loading:boolean;onControl:(action:string)=>void;onResource:(characterExternalId:string,resourceExternalId:string,value:number,mode:'DELTA'|'SET')=>void;onState:(characterExternalId:string,stateExternalId:string,action:'APPLY'|'REMOVE')=>void;onEvent:(eventExternalId:string,status:'PENDING'|'DONE'|'SKIPPED')=>void;onInteractionMutation:()=>void}) {
  const [tick,setTick]=useState(Date.now());
  useEffect(()=>{ if(live?.session.status!=='LIVE')return; const id=window.setInterval(()=>setTick(Date.now()),1000); return()=>window.clearInterval(id); },[live?.session.status,live?.snapshotAt]);
  if(loading&&!live)return <section className="card livePanel">Chargement du poste MJ…</section>;
  if(!live)return <section className="card livePanel"><p className="microNote">Le poste MJ sera disponible après synchronisation des données live.</p></section>;
  const snapshotMs=new Date(live.snapshotAt).getTime();
  const elapsed=live.session.elapsedSeconds+(live.session.status==='LIVE'&&Number.isFinite(snapshotMs)?Math.max(0,Math.floor((tick-snapshotMs)/1000)):0);
  const running=['LIVE','PAUSED'].includes(live.session.status);
  const controls=live.session.status==='READY'?<button disabled={!live.sourceReady||loading} onClick={()=>onControl('START')}>▶ Démarrer la partie</button>:live.session.status==='LIVE'?<><button className="secondary" onClick={()=>onControl('PAUSE')}>Ⅱ Pause</button><button className="danger secondary" onClick={()=>window.confirm('Terminer définitivement le live ?')&&onControl('FINISH')}>Terminer</button></>:live.session.status==='PAUSED'?<><button onClick={()=>onControl('RESUME')}>▶ Reprendre</button><button className="danger secondary" onClick={()=>window.confirm('Terminer définitivement le live ?')&&onControl('FINISH')}>Terminer</button></>:null;
  return <section className="liveDashboard">
    <section className="card liveConsole"><div><p className="eyebrow">POSTE MJ · LIVE</p><h3>{statusLabel(live.session.status)}</h3><p className="liveClock">{formatElapsed(elapsed)}</p><p className="microNote">Temps de jeu effectif — les pauses ne comptent pas.</p></div><div className="liveControls">{controls}</div></section>
    {!live.sourceReady&&<section className="card runtimeWarning"><strong>Timeline V0.7 à enrichir</strong><p>Réimporte une fois le MASTER du scénario après cette mise à jour pour charger phases et événements avant de démarrer le live.</p></section>}
    <section className="liveAlertStrip">
      <div className={live.alerts.overdueEvents?'alert hot':'alert'}>
        <span>En retard</span>
        <strong>{live.events.filter(e=>e.status==='PENDING'&&e.dueElapsedSeconds!=null&&e.dueElapsedSeconds<=elapsed).length}</strong>
      </div>

      <div className="alert">
        <span>À venir ≤ 10 min</span>
        <strong>{live.events.filter(e=>e.status==='PENDING'&&e.dueElapsedSeconds!=null&&e.dueElapsedSeconds>elapsed&&e.dueElapsedSeconds-elapsed<=600).length}</strong>
      </div>

      <div className="alert">
        <span>États actifs</span>
        <strong>{live.characters.reduce((n,c)=>n+c.states.length,0)}</strong>
      </div>

      <div className={live.logs?.some((l:any)=>l.actionType==='LOCATION_EMPTY')?'alert hot':'alert'}>
        <span>Lieux vides</span>
        <strong>{new Set((live.logs??[]).filter((l:any)=>l.actionType==='LOCATION_EMPTY').map((l:any)=>l.refExternalId)).size}</strong>
      </div>
    </section>
    <section className="card liveTimeline"><div className="paneHead"><div><p className="eyebrow">TIMELINE</p><h3>Événements de scénario</h3></div><span>{live.events.filter(e=>e.status==='DONE').length}/{live.events.length}</span></div>{live.events.length===0?<p className="empty">Aucun événement structuré dans ce scénario.</p>:<div className="eventList">{live.events.map(e=>{const remain=e.dueElapsedSeconds==null?null:e.dueElapsedSeconds-elapsed;const urgent=e.status==='PENDING'&&remain!=null&&remain<=0;const soon=e.status==='PENDING'&&remain!=null&&remain>0&&remain<=600;return <article className={`eventRow ${e.status.toLowerCase()} ${urgent?'overdue':soon?'soon':''}`} key={e.externalId}><div className="eventWhen"><strong>{e.delayMinutes!=null?`+${e.delayMinutes} min`:'Manuel'}</strong>{remain!=null&&e.status==='PENDING'&&<small>{remain<=0?`retard ${formatElapsed(-remain)}`:`dans ${formatElapsed(remain)}`}</small>}</div><div className="eventBody"><strong>{e.title}</strong><p>{e.gmDescription}</p>{e.fallbackGm&&<small>Plan B : {e.fallbackGm}</small>}</div><div className="eventActions"><span className={`eventStatus ${e.status.toLowerCase()}`}>{e.status}</span>{running&&e.status==='PENDING'&&<><button onClick={()=>onEvent(e.externalId,'DONE')}>Fait ✓</button><button className="secondary" onClick={()=>onEvent(e.externalId,'SKIPPED')}>Ignorer</button></>}{running&&e.status!=='PENDING'&&<button className="secondary" onClick={()=>onEvent(e.externalId,'PENDING')}>Rouvrir</button>}</div></article>})}</div>}</section>
    <InteractionPanel session={session} running={running} onMutated={onInteractionMutation}/>
    <VotePanel session={session} running={running} onMutated={onInteractionMutation}/>
    <section className="card livePlayers"><div className="paneHead"><div><p className="eyebrow">JOUEURS LIVE</p><h3>Ressources & états</h3></div><span>{live.characters.length}</span></div><div className="livePlayerGrid">{live.characters.map(c=><article className="livePlayer" key={c.characterExternalId}><div className="livePlayerTitle"><div><strong>{c.characterName}</strong><small>{c.participantName?`Joueur : ${c.participantName}`:''}{c.participantName&&c.publicRole?' · ':''}{c.publicRole||''}</small></div>{c.states.length>0&&<span className="stateCount">{c.states.length} état{c.states.length>1?'s':''}</span>}</div><div className="liveResources">{c.resources.map(r=><div className="resourceControl" key={r.resourceExternalId}><span>{r.name}</span><div><button disabled={!running} className="mini" onClick={()=>onResource(c.characterExternalId,r.resourceExternalId,-1,'DELTA')}>−</button><strong>{r.currentValue}{r.maxValue!=null?`/${r.maxValue}`:''}</strong><button disabled={!running} className="mini" onClick={()=>onResource(c.characterExternalId,r.resourceExternalId,1,'DELTA')}>+</button></div></div>)}</div><StateControl character={c} definitions={live.stateDefinitions} disabled={!running} onState={onState}/></article>)}</div></section>
    {live.logs.length>0&&<section className="card liveLog"><div className="paneHead"><div><p className="eyebrow">JOURNAL MJ</p><h3>Dernières actions</h3></div></div><div className="logList">{live.logs.slice(0,12).map(l=><div key={l.id}><time>{new Intl.DateTimeFormat('fr-BE',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date(l.createdAt))}</time><strong>{l.actionType.replaceAll('_',' ')}</strong><span>{l.characterExternalId||l.refExternalId||''}{l.beforeValue!=null||l.afterValue!=null?` · ${l.beforeValue??'—'} → ${l.afterValue??'—'}`:''}</span></div>)}</div></section>}
  </section>;
}

function InteractionPanel({session,running,onMutated}:{session:SessionDetail;running:boolean;onMutated:()=>void}) {
  const [dashboard,setDashboard]=useState<InteractionDashboard|null>(null);
  const [loading,setLoading]=useState(true); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const [actorId,setActorId]=useState(''); const [interactionId,setInteractionId]=useState(''); const [targetId,setTargetId]=useState(''); const [gmOutcome,setGmOutcome]=useState<'SUCCESS'|'FAILURE'>('SUCCESS'); const [note,setNote]=useState('');
  const [result,setResult]=useState<InteractionResult|null>(null); const [clueId,setClueId]=useState('');
  const [objectId,setObjectId]=useState(''); const [holder,setHolder]=useState('');

  async function load(){ setLoading(true);setError('');try{const r=await fetchJson<{ok:boolean;interactions:InteractionDashboard}>(`/api/sessions/interactions?sessionId=${encodeURIComponent(session.id)}`);setDashboard(r.interactions);}catch(e){setError(e instanceof Error?e.message:String(e));setDashboard(null);}finally{setLoading(false);} }
  useEffect(()=>{void load()},[session.id]);
  useEffect(()=>{if(!dashboard)return; if(!actorId&&dashboard.actors[0])setActorId(dashboard.actors[0].characterExternalId)},[dashboard,actorId]);
  const actor=dashboard?.actors.find(a=>a.characterExternalId===actorId)??null;
  useEffect(()=>{if(!actor)return; if(!actor.interactions.some(i=>i.externalId===interactionId)){setInteractionId(actor.interactions[0]?.externalId??'');setTargetId('');setResult(null);}},[actor,interactionId]);
  const interaction=actor?.interactions.find(i=>i.externalId===interactionId)??null;
  useEffect(()=>{setTargetId('');setResult(null);setClueId('')},[interactionId,actorId]);
  useEffect(()=>{if(!dashboard)return; if(!objectId){const first=dashboard.objects.find(o=>o.transferable);if(first)setObjectId(first.objectExternalId)}},[dashboard,objectId]);

  const targetOptions=interaction?.targetType==='LOCATION'?(dashboard?.locations??[]).map(x=>({id:x.externalId,label:x.name})):
    ['PLAYER','CHARACTER'].includes(interaction?.targetType??'')?(dashboard?.actors??[]).filter(a=>a.characterExternalId!==actorId).map(a=>({id:a.characterExternalId,label:`${a.participantName} — ${a.characterName}`})):
    interaction?.targetType==='OBJECT'?(dashboard?.objects??[]).map(o=>({id:o.objectExternalId,label:o.name})):[];
  const needsTarget=interaction&&interaction.targetType!=='NONE';
  const costBlocked=Boolean(interaction?.costValue&&interaction.currentCostResourceValue!=null&&interaction.currentCostResourceValue<interaction.costValue);
  const executeBlocked=!running||!dashboard?.sourceReady||!actor||!interaction||Boolean(needsTarget&&!targetId)||interaction.cooldownRemainingSeconds>0||costBlocked||busy;
  const eligibleClues=(dashboard?.clues??[]).filter(c=>!c.discoveredBy.includes(actorId)).filter(c=>{
    if(!result?.success)return false;
    if(result.targetType==='LOCATION'&&result.targetExternalId)return c.locationExternalId===result.targetExternalId;
    if(result.targetType==='OBJECT'&&result.targetExternalId)return c.objectExternalId===result.targetExternalId;
    return true;
  });
  useEffect(()=>{if(eligibleClues.length&&!eligibleClues.some(c=>c.externalId===clueId))setClueId(eligibleClues[0].externalId); if(!eligibleClues.length)setClueId('')},[result?.interactionExternalId,result?.targetExternalId,actorId,dashboard?.discoveries.length]);

  async function execute(){if(!interaction||!actor)return;setBusy(true);setError('');try{const r=await postJson<{ok:boolean;result:InteractionResult}>('/api/sessions/interactions/execute',{sessionId:session.id,actorCharacterExternalId:actorId,interactionExternalId:interaction.externalId,targetExternalId:targetId||null,gmOutcome:interaction.resolution==='GM'?gmOutcome:null,note});setResult(r.result);await load();onMutated();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);} }
  async function reveal(){if(!clueId||!actorId)return;setBusy(true);setError('');try{await postJson('/api/sessions/interactions/clue',{sessionId:session.id,characterExternalId:actorId,clueExternalId:clueId,sourceInteractionExternalId:result?.interactionExternalId??null,sourceRef:result?.targetExternalId??null});await load();onMutated();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);} }
  async function transfer(){
    if(!objectId||!holder)return;
    const [holderType,...parts]=holder.split(':');
    const holderExternalId=parts.join(':')||null;
    setBusy(true);
    setError('');
    try{
      await organizerPostJson('/api/sessions/interactions/object',{
        sessionId:session.id,
        objectExternalId:objectId,
        holderType,
        holderExternalId
      });
      await load();
      onMutated();
    }catch(e){
      setError(e instanceof Error?e.message:String(e));
    }finally{
      setBusy(false);
    }
  }

  if(loading&&!dashboard)return <section className="card interactionPanel">Chargement des interactions…</section>;
  return <section className="card interactionPanel">
    <div className="paneHead"><div><p className="eyebrow">MÉCANIQUES · V0.8</p><h3>Actions, fouilles & objets</h3><p>Le moteur vérifie PA, capacités, cooldowns et jets ; le MJ conserve le contrôle de la fiction et des indices remis.</p></div><span>{dashboard?.uses.length??0} action(s)</span></div>
    {!dashboard?.sourceReady&&<div className="runtimeWarning"><strong>Données d’interaction à enrichir</strong><p>Réimporte une fois le MASTER après la V0.8 pour charger capacités, interactions et lieux.</p></div>}
    {dashboard?.locations?.length?<details className="locationQrPanel"><summary>QR des lieux · V1.1 <span>{dashboard.locations.length}</span></summary><p className="microNote">QR statiques : imprime-les une fois. Le téléphone identifie le joueur grâce à son lien personnel déjà ouvert.</p><div className="locationQrGrid">{dashboard.locations.map(loc=>{const url=`${window.location.origin}/scan/${encodeURIComponent(loc.externalId)}`;return <article className="locationQrCard" key={loc.externalId}><QRCodeSVG value={url} size={116} level="M" includeMargin/><div><strong>{loc.name}</strong><small>{loc.externalId}</small><input readOnly value={url}/><button className="secondary" onClick={()=>void navigator.clipboard.writeText(url)}>Copier le lien</button></div></article>})}</div><button className="secondary qrPrintButton" onClick={()=>window.print()}>Imprimer les QR</button></details>:null}
    {dashboard?.actors?.length?<details className="locationQrPanel characterQrPanel"><summary>QR personnages · V1.5 <span>{dashboard.actors.length}</span></summary><p className="microNote">Un seul QR statique par personnage. Le même code sert aux interactions DIRECTES (présenté par la cible) et DISCRÈTES (copie disponible chez le MJ). Le QR identifie uniquement la cible.</p><div className="locationQrGrid">{dashboard.actors.map(a=>{const url=`${window.location.origin}/scan/character/${encodeURIComponent(a.characterExternalId)}`;return <article className="locationQrCard" key={a.characterExternalId}><QRCodeSVG value={url} size={116} level="M" includeMargin/><div><strong>{a.characterName}</strong><small>{a.publicRole||a.participantName}</small><input readOnly value={url}/><button className="secondary" onClick={()=>void navigator.clipboard.writeText(url)}>Copier le lien</button></div></article>})}</div><button className="secondary qrPrintButton" onClick={()=>window.print()}>Imprimer les QR personnages</button></details>:null}
    {error&&<p className="errorbox">{error}</p>}
    <div className="interactionGrid">
      <div className="interactionWorkbench">
        <h4>Résoudre une action</h4>
        <label>Joueur<select value={actorId} onChange={e=>setActorId(e.target.value)}>{(dashboard?.actors??[]).map(a=><option key={a.characterExternalId} value={a.characterExternalId}>{a.participantName} — {a.characterName}</option>)}</select></label>
        <label>Action<select value={interactionId} onChange={e=>setInteractionId(e.target.value)}>{(actor?.interactions??[]).map(i=><option key={i.externalId} value={i.externalId}>{i.name}{i.costValue?` · ${i.costValue} PA`:''}</option>)}</select></label>
        {interaction?.ability&&<div className="abilityCallout"><strong>{interaction.ability.name} niv. {interaction.ability.level}</strong><span>{interaction.ability.description}</span></div>}
        {needsTarget&&<label>Cible<select value={targetId} onChange={e=>setTargetId(e.target.value)}><option value="">— Choisir —</option>{targetOptions.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>}
        {interaction?.resolution==='GM'&&<label>Décision MJ<select value={gmOutcome} onChange={e=>setGmOutcome(e.target.value as 'SUCCESS'|'FAILURE')}><option value="SUCCESS">Succès</option><option value="FAILURE">Échec</option></select></label>}
        {interaction&&<div className="interactionMeta"><span>{interaction.resolution==='DICE'?`${interaction.diceCount??0}D${interaction.diceSides??0} ≥ ${interaction.difficulty??0}`:interaction.resolution}</span>{interaction.maxUses!=null&&<span>{interaction.usesCount}/{interaction.maxUses} utilisations</span>}{interaction.cooldownRemainingSeconds>0&&<span className="warn">Cooldown {formatElapsed(interaction.cooldownRemainingSeconds)}</span>}{interaction.costValue? <span>{interaction.costValue} {interaction.costResourceExternalId?.replace('RES_','')} · reste {interaction.currentCostResourceValue??'?'}</span>:null}</div>}
        <label>Note MJ <span>(facultatif)</span><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Contexte, demande du joueur…"/></label>
        <button disabled={executeBlocked} onClick={()=>void execute()}>{busy?'Résolution…':'Résoudre l’action'}</button>
        {costBlocked&&<p className="microNote dangerText">Ressource insuffisante pour cette action.</p>}
        {result&&<div className={`interactionResult ${result.success?'success':'failure'}`}><strong>{result.success?'SUCCÈS ✓':'ÉCHEC ✕'}</strong><span>{result.interactionName}</span>{result.actorRoll&&<small>Jet : {result.actorRoll.rolls.join(' + ')}{result.actorTotal!=null?` → total ${result.actorTotal}`:''}{result.targetTotal!=null?` / seuil ${result.targetTotal}`:''}</small>}{result.cost&&<small>Coût : −{result.cost.value} {result.cost.resourceExternalId.replace('RES_','')} · reste {result.cost.remaining}</small>}</div>}
        {result?.success&&<div className="clueReveal"><h4>Remettre un indice</h4>{eligibleClues.length===0?<p className="microNote">Aucun indice non découvert ne correspond automatiquement à cette cible.</p>:<><select value={clueId} onChange={e=>setClueId(e.target.value)}>{eligibleClues.map(c=><option key={c.externalId} value={c.externalId}>{c.major?'★ ':''}{c.playerName}{c.locationExternalId?` · ${c.locationExternalId}`:''}</option>)}</select><button className="secondary" disabled={busy||!clueId} onClick={()=>void reveal()}>Révéler au joueur</button>{clueId&&<p className="cluePreview">{eligibleClues.find(c=>c.externalId===clueId)?.playerText}</p>}</>}</div>}
      </div>
      <div className="objectWorkbench">
        <h4>Objets en jeu</h4>
        {(dashboard?.objects.length??0)===0?<p className="empty">Aucun objet runtime.</p>:<>
          <label>Objet<select value={objectId} onChange={e=>setObjectId(e.target.value)}>{dashboard?.objects.map(o=><option key={o.objectExternalId} value={o.objectExternalId} disabled={!o.transferable}>{o.transferable?'':'🔒 '}{o.name} — {o.holderType}:{o.holderExternalId||'—'}</option>)}</select></label>
          <label>Nouvelle destination<select value={holder} onChange={e=>setHolder(e.target.value)}><option value="">— Choisir —</option><optgroup label="Personnages">{dashboard?.actors.map(a=><option key={`C-${a.characterExternalId}`} value={`CHARACTER:${a.characterExternalId}`}>{a.participantName} — {a.characterName}</option>)}</optgroup><optgroup label="Lieux">{dashboard?.locations.map(l=><option key={`L-${l.externalId}`} value={`LOCATION:${l.externalId}`}>{l.name}</option>)}</optgroup><option value="WORLD:">Dans le monde / table MJ</option></select></label>
          <button className="secondary" disabled={!running||busy||!objectId||!holder} onClick={()=>void transfer()}>Transférer l’objet</button>
          <div className="objectList">{dashboard?.objects.slice(0,12).map(o=><div key={o.objectExternalId}><strong>{o.name}</strong><small>{o.holderType} · {o.holderExternalId||'—'}{o.charges!=null?` · ${o.charges} charge(s)`:''}</small></div>)}</div>
        </>}
      </div>
    </div>
  </section>;
}

function VotePanel({session,running,onMutated}:{session:SessionDetail;running:boolean;onMutated:()=>void}) {
  const [dashboard,setDashboard]=useState<VoteDashboard|null>(null); const [loading,setLoading]=useState(true); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  async function load(){setLoading(true);setError('');try{const r=await fetchJson<{ok:boolean;votes:VoteDashboard}>(`/api/sessions/votes?sessionId=${encodeURIComponent(session.id)}`);setDashboard(r.votes);}catch(e){setError(e instanceof Error?e.message:String(e));setDashboard(null);}finally{setLoading(false);}}
  useEffect(()=>{void load()},[session.id]);
  async function open(voteExternalId:string,secondRound=false){setBusy(true);setError('');try{await postJson('/api/sessions/votes/open',{sessionId:session.id,voteExternalId,secondRound});await load();onMutated();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  async function close(voteExternalId:string){if(!window.confirm('Fermer le vote et calculer le résultat ?'))return;setBusy(true);setError('');try{await postJson('/api/sessions/votes/close',{sessionId:session.id,voteExternalId});await load();onMutated();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  async function cast(voteExternalId:string,electorCharacterExternalId:string,optionId:string){setBusy(true);setError('');try{await postJson('/api/sessions/votes/cast',{sessionId:session.id,voteExternalId,electorCharacterExternalId,selectedOptionExternalIds:optionId?[optionId]:[]});await load();onMutated();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  if(loading&&!dashboard)return <section className="card votePanel">Chargement des votes…</section>;
  return <section className="card votePanel"><div className="paneHead"><div><p className="eyebrow">VOTES · V0.9</p><h3>Scrutins & décisions collectives</h3><p>Le MJ ouvre le scrutin, enregistre les bulletins et ferme le vote. Les résultats restent masqués jusqu’à la clôture quand le MASTER le prévoit.</p></div><span>{dashboard?.votes.length??0} vote(s)</span></div>
    {!dashboard?.sourceReady&&<div className="runtimeWarning"><strong>Données de vote à enrichir</strong><p>Réimporte une fois le MASTER après la V0.9 pour charger les votes et leurs options.</p></div>}
    {error&&<p className="errorbox">{error}</p>}
    {(dashboard?.votes.length??0)===0?<p className="empty">Aucun vote structuré dans ce scénario.</p>:<div className="voteList">{dashboard?.votes.map(v=><article className="voteCard" key={v.externalId}><div className="voteHead"><div><strong>{v.title}</strong><p>{v.question}</p></div><span>{v.secret?'Secret':'Public'}</span></div>
      {!v.activeRound&&<>
        {v.scopeType==='VOTE_WINNERS'&&v.electorate.length===0&&
          <p className="voteWaiting">En attente des résultats des votes qui composent cet électorat.</p>}
        <button
          disabled={!running||busy||!dashboard.sourceReady||(v.scopeType==='VOTE_WINNERS'&&v.electorate.length===0)}
          onClick={()=>void open(v.externalId,false)}
        >
          Ouvrir le vote
        </button>
      </>}
      {v.activeRound?.status==='OPEN'&&<><div className="voteRound"><strong>Tour {v.activeRound.round}</strong><span>{v.voters.filter(x=>x.hasVoted).length}/{v.voters.length} bulletins</span></div><div className="voterList">{v.voters.map(e=><VoteVoterRow key={e.characterExternalId} vote={v} voter={e} disabled={!running||busy} onCast={(optionId)=>void cast(v.externalId,e.characterExternalId,optionId)}/>)}</div><button className="danger secondary" disabled={busy} onClick={()=>void close(v.externalId)}>Fermer et compter</button></>}
      {v.activeRound?.status==='CLOSED'&&v.result&&<div className="voteResult"><div className="voteResultSummary"><strong>{v.result.majorityAbsolute&&v.result.winnerOptionExternalId?'Majorité obtenue':'Pas de majorité absolue'}</strong><span>{v.result.ballotsCast}/{v.result.electorateCount} bulletins · {v.result.abstentions} abstention(s)</span></div><div className="voteRanking">{v.result.ranked.map((r,i)=><div key={r.optionExternalId}><span>{i+1}. {r.label}</span><strong>{r.votes}</strong></div>)}</div>{v.result.suggestSecondRound&&<button disabled={!running||busy} onClick={()=>void open(v.externalId,true)}>Ouvrir le second tour · départage</button>}</div>}
    </article>)}</div>}
  </section>;
}

function VoteVoterRow({vote,voter,disabled,onCast}:{vote:VoteDashboardItem;voter:VoteDashboardItem['voters'][number];disabled:boolean;onCast:(optionId:string)=>void}) {
  const [choice,setChoice]=useState(vote.abstention?'':vote.options[0]?.externalId??'');
  useEffect(()=>{if(choice&&!vote.options.some(o=>o.externalId===choice))setChoice(vote.abstention?'':vote.options[0]?.externalId??'')},[vote.options,choice,vote.abstention]);
  return <div className={`voterRow ${voter.hasVoted?'done':''}`}><div><strong>{voter.participantName||voter.characterName}</strong><small>{voter.characterName}</small></div>{voter.hasVoted&&!vote.modifiable?<span className="voteDone">Bulletin enregistré ✓</span>:<><select disabled={disabled} value={choice} onChange={e=>setChoice(e.target.value)}>{vote.abstention&&<option value="">Abstention</option>}{vote.options.map(o=><option key={o.externalId} value={o.externalId}>{o.label}</option>)}</select><button className="secondary" disabled={disabled||(!choice&&!vote.abstention)} onClick={()=>onCast(choice)}>{voter.hasVoted?'Modifier':'Valider'}</button></>}</div>;
}

function StateControl({character,definitions,disabled,onState}:{character:LiveCharacter;definitions:LiveDashboard['stateDefinitions'];disabled:boolean;onState:(characterExternalId:string,stateExternalId:string,action:'APPLY'|'REMOVE')=>void}) {
  const [selected,setSelected]=useState(definitions[0]?.externalId||'');
  useEffect(()=>{if(!selected&&definitions[0])setSelected(definitions[0].externalId)},[definitions,selected]);
  return <div className="stateControl"><div className="activeStates">{character.states.length===0?<small>Aucun état actif</small>:character.states.map(s=><span key={s.stateExternalId}>{s.name}<button disabled={disabled} title="Retirer" onClick={()=>onState(character.characterExternalId,s.stateExternalId,'REMOVE')}>×</button></span>)}</div><div className="stateApply"><select disabled={disabled||definitions.length===0} value={selected} onChange={e=>setSelected(e.target.value)}>{definitions.map(d=><option value={d.externalId} key={d.externalId}>{d.name}</option>)}</select><button className="secondary" disabled={disabled||!selected} onClick={()=>onState(character.characterExternalId,selected,'APPLY')}>Appliquer</button></div></div>;
}

function PublicPrecastView({token}:{token:string}) {
  const [session,setSession]=useState<PublicPrecastSession|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [submitted,setSubmitted]=useState(false);
  const [busy,setBusy]=useState(false);
  const [displayName,setDisplayName]=useState('');
  const [email,setEmail]=useState('');
  const [ageBracket,setAgeBracket]=useState('');
  const [genderPreference,setGenderPreference]=useState('SANS_PREFERENCE');
  const [desiredInvolvement,setDesiredInvolvement]=useState('ACTIF');
  const [notes,setNotes]=useState('');

  useEffect(()=>{
    (async()=>{
      try{
        const result=await fetchJson<{ok:boolean;session:PublicPrecastSession}>(
          `/api/public/precast/session?token=${encodeURIComponent(token)}`
        );
        setSession(result.session);
      }catch(e){
        setError(e instanceof Error?e.message:String(e));
      }finally{
        setLoading(false);
      }
    })();
  },[token]);

  const en=String(session?.language??'FR').toUpperCase()==='EN';
  const t=(fr:string,enText:string)=>en?enText:fr;

  if(loading)
    return <main className="publicShell">
      <section className="publicCard card">
        {t('Chargement du pré-casting…','Loading pre-casting…')}
      </section>
    </main>;

  if(error||!session)
    return <main className="publicShell">
      <section className="publicCard card">
        <p className="eyebrow">MURDER ENGINE</p>
        <h1>{t('Lien indisponible','Link unavailable')}</h1>
        <p>{t(
          'Ce lien de pré-casting n’est plus actif ou n’est pas valide.',
          'This pre-casting link is no longer active or valid.'
        )}</p>
      </section>
    </main>;

  if(submitted)
    return <main className="publicShell">
      <section className="publicCard card successPublic">
        <span className="successGlyph">✓</span>
        <p className="eyebrow">{t('PRÉ-CASTING ENVOYÉ','PRE-CASTING SUBMITTED')}</p>
        <h1>{t(`Merci ${displayName} !`,`Thank you, ${displayName}!`)}</h1>
        <p>{t(
          'Tes préférences ont bien été transmises à l’organisateur. Le rôle sera attribué séparément.',
          'Your preferences have been sent to the organizer. Your role will be assigned separately.'
        )}</p>
      </section>
    </main>;

  return <main className="publicShell">
    <section className="publicCard card">
      <p className="eyebrow">{session.scenario.title}</p>
      <h1>{session.name||t('Pré-casting','Pre-casting')}</h1>
      <p className="publicMeta">
        {niceDate(session.scheduledAt,session.language)}
        {session.venue?` · ${session.venue}`:''}
      </p>

      {session.scenario.playerSummary&&
        <p className="publicPitch">{session.scenario.playerSummary}</p>
      }

      <div className="privacyNote">
        {t(
          'Ces informations servent uniquement à aider l’organisateur à attribuer les rôles. Aucun choix ne garantit un personnage précis.',
          'This information is only used to help the organizer assign roles. No preference guarantees a specific character.'
        )}
      </div>

      <div className="publicForm">
        <label>
          {t('Prénom / nom','Name')}
          <input
            autoComplete="name"
            value={displayName}
            onChange={e=>setDisplayName(e.target.value)}
            placeholder={t('Ton prénom…','Your name…')}
          />
        </label>

        <label>
          {t('E-mail','Email')} <span>({t('obligatoire','required')})</span>
          <input
            required
            autoComplete="email"
            type="email"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>

        <label>
          {t('Tranche d’âge','Age range')} <span>({t('obligatoire','required')})</span>
          <select required value={ageBracket} onChange={e=>setAgeBracket(e.target.value)}>
            <option value="" disabled>{t('Choisis ta tranche d’âge','Choose your age range')}</option>
            <option value="MOINS_18">{t('Moins de 18 ans','Under 18')}</option>
            <option value="18_25">18–25</option>
            <option value="26_40">26–40</option>
            <option value="41_60">41–60</option>
            <option value="60_PLUS">{t('60 ans et +','60+')}</option>
          </select>
        </label>

        <label>
          {t('Préférence de personnage','Character preference')}
          <select value={genderPreference} onChange={e=>setGenderPreference(e.target.value)}>
            <option value="SANS_PREFERENCE">{t('Aucune préférence','No preference')}</option>
            <option value="MASCULIN">{t('Je préfère un personnage masculin','I prefer a male character')}</option>
            <option value="FEMININ">{t('Je préfère un personnage féminin','I prefer a female character')}</option>
            <option value="A_DISCUTER">{t('À discuter avec l’organisateur','Discuss with the organizer')}</option>
          </select>
        </label>

        <label>
          {t('Implication souhaitée','Desired involvement')}
          <select value={desiredInvolvement} onChange={e=>setDesiredInvolvement(e.target.value)}>
            <option value="TRANQUILLE">{t('Tranquille — jouer sans trop de pression','Relaxed — play without too much pressure')}</option>
            <option value="ACTIF">{t('Actif — participer pleinement','Active — take a full part in the game')}</option>
            <option value="TRES_IMPLIQUE">{t('Très impliqué — beaucoup de jeu','Highly involved — lots of interaction')}</option>
            <option value="PREMIER_ROLE">{t('Premier rôle — j’aime être au centre de l’action','Leading role — I like being at the centre of the action')}</option>
          </select>
        </label>

        <label>
          {t('Envie particulière de jeu','Anything you especially enjoy')} <span>({t('facultatif','optional')})</span>
          <textarea
            maxLength={500}
            value={notes}
            onChange={e=>setNotes(e.target.value)}
            placeholder={t(
              'Ex. : j’aime négocier, enquêter, jouer un personnage théâtral…',
              'E.g. I enjoy negotiating, investigating, playing theatrical characters…'
            )}
          />
        </label>

        <button
          disabled={busy||displayName.trim().length<2||!isValidEmail(email)||!ageBracket}
          onClick={async()=>{
            setBusy(true);
            setError('');
            try{
              await postJson('/api/public/precast/submit',{
                token,
                displayName,
                email,
                ageBracket,
                genderPreference,
                desiredInvolvement,
                notes
              });
              setSubmitted(true);
            }catch(e){
              setError(e instanceof Error?e.message:String(e));
            }finally{
              setBusy(false);
            }
          }}
        >
          {busy?t('Envoi…','Sending…'):t('Envoyer mes préférences','Submit my preferences')}
        </button>

        {error&&<p className="errorbox">{error}</p>}
      </div>
    </section>
  </main>;
}

function AddParticipantForm({onAdd}:{onAdd:(input:{displayName:string;email:string;ageBracket:string;genderPreference:string;desiredInvolvement:string;notes?:string})=>Promise<void>}) {
  const [name,setName]=useState(''); const [email,setEmail]=useState(''); const [ageBracket,setAgeBracket]=useState(''); const [genderPreference,setGenderPreference]=useState('SANS_PREFERENCE'); const [level,setLevel]=useState('ACTIF'); const [busy,setBusy]=useState(false);
  return <section className="card participantForm"><div><p className="eyebrow">PARTICIPANTS</p><h3>Ajouter un joueur</h3><p>Ces préférences alimentent la proposition de casting V1.6. Elles restent indicatives : le MJ garde la décision finale.</p></div><div className="formGrid participantFields"><label>Prénom / nom<input value={name} onChange={e=>setName(e.target.value)} placeholder="Gaël…"/></label><label>E-mail <span>(obligatoire)</span><input required type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Tranche d’âge <span>(obligatoire)</span><select required value={ageBracket} onChange={e=>setAgeBracket(e.target.value)}><option value="" disabled>Choisir…</option><option value="MOINS_18">Moins de 18 ans</option><option value="18_25">18–25 ans</option><option value="26_40">26–40 ans</option><option value="41_60">41–60 ans</option><option value="60_PLUS">60 ans et +</option></select></label><label>Préférence personnage<select value={genderPreference} onChange={e=>setGenderPreference(e.target.value)}><option value="SANS_PREFERENCE">Aucune préférence</option><option value="FEMININ">Plutôt féminin</option><option value="MASCULIN">Plutôt masculin</option><option value="A_DISCUTER">À discuter</option></select></label><label>Implication souhaitée<select value={level} onChange={e=>setLevel(e.target.value)}><option value="TRANQUILLE">Tranquille</option><option value="ACTIF">Actif</option><option value="TRES_IMPLIQUE">Très impliqué</option><option value="PREMIER_ROLE">Premier rôle</option></select></label></div><button disabled={!name.trim()||!isValidEmail(email)||!ageBracket||busy} onClick={async()=>{setBusy(true);try{await onAdd({displayName:name,email,ageBracket,genderPreference,desiredInvolvement:level});setName('');setEmail('');setAgeBracket('');setGenderPreference('SANS_PREFERENCE');}finally{setBusy(false);}}}>{busy?'Ajout…':'Ajouter'}</button></section>;
}

function SessionPreparationPanel({session,onApplied,onMarkReady}:{session:SessionDetail;onApplied:()=>void;onMarkReady:()=>void}) {
  const [setup,setSetup]=useState<SessionSetup|null>(null); const [loading,setLoading]=useState(true); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const [open,setOpen]=useState(true);
  async function load(){setLoading(true);setError('');try{const r=await fetchJson<{ok:boolean;setup:SessionSetup}>(`/api/sessions/setup?sessionId=${encodeURIComponent(session.id)}`);setSetup(r.setup);}catch(e){setError(e instanceof Error?e.message:String(e));setSetup(null);}finally{setLoading(false);}}
  useEffect(()=>{void load()},[session.id,session.counts.participants,session.counts.assigned,session.status]);
  async function apply(){if(!setup?.proposal.assignments.length)return;if(!window.confirm(`Appliquer ${setup.proposal.assignments.length} attribution(s) proposées ? Tu pourras encore les modifier manuellement ensuite.`))return;setBusy(true);setError('');try{await postJson('/api/sessions/casting/apply',{sessionId:session.id,assignments:setup.proposal.assignments.map(x=>({participantId:x.participantId,characterExternalId:x.characterExternalId}))});onApplied();}catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}
  return <section className="card setupAssistant"><div className="paneHead"><div><p className="eyebrow">ASSISTANT DE PRÉPARATION · V1.6</p><h3>Session {setup?.preparation.progress===100?'prête pour validation':'en préparation'}</h3><p>Contrôle du groupe, qualité des profils et proposition de casting. Le MJ garde toujours la main.</p></div><div className="setupScore"><strong>{setup?.preparation.progress??0}%</strong><button className="secondary mini" onClick={()=>setOpen(v=>!v)}>{open?'Réduire':'Ouvrir'}</button></div></div>
    {error&&<p className="errorbox">{error}</p>}{loading&&!setup?<p className="microNote">Analyse de la session…</p>:open&&setup&&<><div className="setupSteps">{setup.preparation.steps.map(step=><div key={step.id} className={`setupStep ${step.ready?'done':'todo'}`}><span>{step.ready?'✓':'•'}</span><div><strong>{step.label}</strong><small>{step.detail}</small></div></div>)}</div>
      {setup.proposal.assignments.length>0&&<div className="castingProposal"><div className="paneHead compact"><div><p className="eyebrow">PROPOSITION DE CASTING</p><h4>{setup.proposal.assignments.length} attribution(s) suggérée(s)</h4></div><button disabled={busy||Boolean(session.runtimeInitializedAt)} onClick={()=>void apply()}>{busy?'Application…':'Appliquer la proposition'}</button></div><p className="microNote">Aide fonctionnelle uniquement : les rôles déjà attribués ne sont jamais modifiés et tu peux retoucher le casting ensuite.</p><div className="proposalRows">{setup.proposal.assignments.map(a=><div className="proposalRow" key={a.participantId}><div><strong>{a.participantName}</strong><small>{a.reasons.join(' · ')}</small></div><span>→</span><div><strong>{a.characterName}</strong><small>{a.publicRole||a.characterExternalId}</small></div><em className={`confidence ${a.confidence.toLowerCase()}`}>{a.confidence==='HAUTE'?'forte compatibilité':a.confidence==='MOYENNE'?'compatibilité correcte':'à vérifier'}</em></div>)}</div></div>}
      {setup.proposal.assignments.length===0&&!setup.preparation.allAssigned&&<p className="empty">Aucune proposition disponible : vérifie le nombre de participants et les rôles libres.</p>}
      {setup.preparation.canMarkReady&&session.status!=='READY'&&<div className="readyCallout"><div><strong>Casting complet</strong><p>Le groupe et les profils sont cohérents. Tu peux maintenant marquer la session « Prête ».</p></div><button onClick={onMarkReady}>Marquer prête</button></div>}
    </>}</section>;
}

function CharacterSheet({detail}:{detail:CharacterDetail}) { const c=detail.character; return <div className="characterSheet"><section className="card identityCard"><div className="identityTop"><div><p className="eyebrow">{c.externalId}</p><h3>{c.name}</h3><p className="roleLine">{c.publicRole||'Sans rôle public'}{c.narrativeAge?` · ${c.narrativeAge} ans`:''}</p></div><div className="statusPills"><span>{importanceLabel(c.importance)}</span><span>{c.intensity}</span></div></div>{c.motto&&<blockquote>« {c.motto} »</blockquote>}<div className="prose"><h4>Biographie</h4><NarrativeText text={c.biography}/></div>{c.secretIntro&&<div className="secretBox"><h4>Secret d’introduction</h4><NarrativeText text={c.secretIntro} className="compact"/></div>}{c.apparentMotive&&<div className="prose"><h4>Mobile apparent</h4><NarrativeText text={c.apparentMotive} className="compact"/></div>}{c.personalTimeline&&<div className="prose"><h4>Chronologie personnelle</h4><NarrativeText text={c.personalTimeline}/></div>}</section><section className="card detailSection"><div className="detailTitle"><h4>Objectifs</h4><span>{detail.objectives.length}</span></div>{detail.objectives.length===0?<p className="empty">Aucun objectif importé.</p>:<div className="stack">{detail.objectives.map(o=><article className="objective" key={o.externalId}><div><strong>{o.title}</strong><span>{o.objectiveType}{o.secret?' · SECRET':''}</span></div><p>{o.description}</p></article>)}</div>}</section><section className="card detailSection"><div className="detailTitle"><h4>Connaissances initiales</h4><span>{detail.knowledge.length}</span></div>{detail.knowledge.length===0?<p className="empty">Aucune connaissance initiale structurée.</p>:<div className="stack">{detail.knowledge.map(k=><article className="knowledge" key={k.factExternalId}><div><strong>{k.fact.title}</strong><span>{k.fact.nature} · {importanceLabel(k.fact.importance)}</span></div><p>{k.fact.text}</p></article>)}</div>}</section><section className="card detailSection"><div className="detailTitle"><h4>Relations</h4><span>{detail.relationships.length}</span></div>{detail.relationships.length===0?<p className="empty">Aucune relation structurée.</p>:<div className="relationGrid">{detail.relationships.map(r=><article className="relation" key={r.externalId}><strong>{r.otherName}</strong><small>{r.otherPublicRole||r.relationType||'Relation'}</small><p>{r.text}</p><em>{r.visibility}</em></article>)}</div>}</section>
<section className="card detailSection characterPlayHelp">
  <div className="prose">
    <h4>Comment me la jouer</h4>
    <NarrativeText text={c.interpretationNotes||'Aucun conseil de jeu renseigné dans ce MASTER.'}/>
  </div>

  <div className="prose">
    <h4>Mon apparence</h4>
    <NarrativeText text={c.appearanceNotes||'Aucune indication de costume ou d’apparence renseignée dans ce MASTER.'}/>
  </div>
</section></div>; }

function skinPreviewClass(id:SkinId){
  return `skinVisual-${String(id).toLowerCase().replaceAll('_','-')}`;
}

function SkinVisualPreview({
  id,
  accent,
  symbol
}:{
  id:SkinId;
  accent:string;
  symbol:string;
}){
  return <div
    className={`skinVisualPreview ${skinPreviewClass(id)}`}
    style={{'--preview-accent':accent} as any}
  >
    <div className="skinVisualAtmosphere">
      <span className="skinVisualSymbol">{symbol}</span>

      <div className="skinVisualHero">
        <small>MURDER ENGINE</small>
        <strong>Votre personnage</strong>
        <span>Un rôle · Un secret</span>
      </div>

      <div className="skinVisualPaper">
        <i/>
        <b/>
        <b/>
        <b/>
        <div className="skinVisualSecret"/>
      </div>

      <div className="skinVisualNav">
        <span/>
        <span className="active"/>
        <span/>
      </div>
    </div>
  </div>;
}

function SkinPicker(props:{
  skinId:SkinId;
  accentColor:string;
  locked:boolean;
  scenarioName?:string;
  onSkinChange:(id:SkinId,accent:string)=>void;
  onAccentChange:(value:string)=>void;
}){
  const active=skinOptionFor(props.skinId);
  const currentAccent=
    props.accentColor ||
    active.defaultAccent;

  return <section className="card skinPicker skinGalleryPicker">

    <div className="skinPickerHead">
      <div>
        <p className="eyebrow">APPARENCE DU SCÉNARIO</p>
        <h3>Choisir une ambiance graphique</h3>

        <p>
          {props.locked
            ? `L’apparence est commune à « ${props.scenarioName||'ce scénario'} ».`
            : props.scenarioName
              ? `Changer cette skin mettra à jour toutes les variantes de « ${props.scenarioName} ».`
              : 'La skin détermine l’ambiance des fiches joueurs, scans QR et du Pack MJ.'}
        </p>
      </div>

      {props.locked&&
        <span className="skinLockedBadge">
          Héritée du scénario
        </span>
      }
    </div>

    <div
      className="skinGallery"
      role="radiogroup"
      aria-label="Ambiance graphique"
    >
      {SKIN_OPTIONS.map(skin=>{
        const selected=skin.id===props.skinId;

        const previewAccent=
          selected
            ? currentAccent
            : skin.defaultAccent;

        return <button
          type="button"
          key={skin.id}
          className={`skinGalleryCard ${selected?'selected':''}`}
          onClick={()=>{
            if(!props.locked)
              props.onSkinChange(
                skin.id,
                skin.defaultAccent
              );
          }}
          disabled={props.locked}
          aria-pressed={selected}
        >
          <SkinVisualPreview
            id={skin.id}
            accent={previewAccent}
            symbol={skin.preview}
          />

          <div className="skinGalleryInfo">
            <div>
              <strong>{skin.label}</strong>
              {selected&&<span className="skinSelectedCheck">✓</span>}
            </div>

            <small>{skin.subtitle}</small>

            <div className="skinGalleryPalette">
              <span
                style={{background:skin.defaultAccent}}
                title={`Accent ${skin.defaultAccent}`}
              />
              <code>{skin.id}</code>
            </div>
          </div>
        </button>;
      })}
    </div>

    <div className="skinAccentEditor">
      <div>
        <p className="eyebrow">COULEUR D’ACCENT</p>
        <strong>{active.label}</strong>
        <small>
          Personnalise les détails sans modifier la structure de la skin.
        </small>
      </div>

      <div className="skinAccentControls">
        <input
          type="color"
          value={currentAccent}
          disabled={props.locked}
          onChange={e=>props.onAccentChange(e.target.value)}
          aria-label="Couleur d’accent"
        />

        <input
          className="skinAccentHex"
          value={currentAccent.toUpperCase()}
          disabled={props.locked}
          maxLength={7}
          onChange={e=>{
            const value=e.target.value;
            props.onAccentChange(value);
          }}
          aria-label="Code couleur"
        />

        {!props.locked&&
          <button
            type="button"
            className="secondary mini"
            onClick={()=>{
              props.onAccentChange(active.defaultAccent);
            }}
          >
            Réinitialiser
          </button>
        }
      </div>
    </div>

  </section>;
}

type ImportViewProps={file:File|null;data:ImportResponse|null;commit:CommitResponse|null;loading:boolean;committing:boolean;error:string;filter:'ALL'|Severity;filtered:Diagnostic[];skinId:SkinId;accentColor:string;skinLocked:boolean;onSkinChange:(id:SkinId,accent:string)=>void;onAccentChange:(value:string)=>void;onChoose:(file:File|null)=>void;onValidate:()=>void;onCommit:()=>void;onFilter:(filter:'ALL'|Severity)=>void;onOpenImported:()=>void};
function ImportView(props:ImportViewProps & {targetScenario?:ScenarioLibraryItem|null}){return <section><div className="sectionhead"><div><p className="eyebrow">MASTER SCENARIO</p><h2>{props.targetScenario?`Nouvelle variante · ${props.targetScenario.title}`:'Importer'}</h2><p>{props.targetScenario?'Le scenario_id doit rester identique ; le MASTER définit entièrement cette nouvelle variante jouable.':'Valide le MASTER puis crée une variante immuable dans Murder Engine.'}</p></div></div><section className="card upload"><label className="drop"><input type="file" accept=".xlsx" onChange={e=>props.onChoose(e.target.files?.[0]??null)}/><strong>{props.file?props.file.name:'Choisir un fichier .xlsx'}</strong><span>Template Murder Engine V1.0 / V1.1 / V1.2</span></label><button onClick={props.onValidate} disabled={!props.file||props.loading}>{props.loading?'Analyse…':'Analyser le scénario'}</button>{props.error&&<p className="errorbox">{props.error}</p>}</section>{props.data&&<><section className={`status ${props.data.blocking?'bad':'good'}`}><div><span className="label">Statut</span><strong>{props.data.blocking?'Import bloqué':'Import autorisé'}</strong></div><div><span className="label">Scénario</span><strong>{String(props.data.summary.scenario)}</strong></div><div><span className="label">Variante</span><strong>{String(props.data.summary.variantName||`${props.data.summary.minPlayers||'?'}–${props.data.summary.maxPlayers||'?'} joueurs`)}</strong></div><div><span className="label">Genre</span><strong>{String(props.data.summary.genderComposition||props.data.summary.genderProfile||'—')}</strong></div><div><span className="label">Template</span><strong>V{String(props.data.summary.templateVersion)}</strong></div></section><section className="metrics">{['characters','objectives','facts','clues','objects','documents','interactions','events','votes'].map(k=><article key={k}><span>{k}</span><strong>{String(props.data?.summary[k]??0)}</strong></article>)}</section>{!props.data.blocking&&<SkinPicker skinId={props.skinId} accentColor={props.accentColor} locked={props.skinLocked} scenarioName={props.targetScenario?.title} onSkinChange={props.onSkinChange} onAccentChange={props.onAccentChange}/>} {!props.data.blocking&&<section className="card commitcard"><div><p className="eyebrow">MASTER VARIANT</p><h3>Le scénario est valide</h3><p>L’import crée ou enrichit la variante correspondant exactement à ce MASTER.</p></div><button onClick={props.onCommit} disabled={props.committing}>{props.committing?'Import en cours…':'Importer dans Murder Engine'}</button></section>}{props.commit&&<section className="commitSuccess"><strong>Variante enregistrée ✓</strong><span>{props.commit.scenarioVersionId}</span><small>Hash source : {props.commit.sourceHash.slice(0,16)}…</small><button onClick={props.onOpenImported}>Ouvrir dans la bibliothèque</button></section>}<section className="card"><div className="diaghead"><div><h3>Diagnostic</h3><p>{props.data.counts.ERROR} erreur(s) · {props.data.counts.WARNING} avertissement(s) · {props.data.counts.INFO} info(s)</p></div><div className="filters">{(['ALL','ERROR','WARNING','INFO'] as const).map(v=><button key={v} className={props.filter===v?'active':''} onClick={()=>props.onFilter(v)}>{v}</button>)}</div></div><div className="diagnostics">{props.filtered.length===0&&<p className="empty">Aucun diagnostic dans ce filtre.</p>}{props.filtered.map((d,i)=><article className={`diag ${d.severity.toLowerCase()}`} key={`${d.ruleId}-${d.entityId}-${i}`}><div className="pill">{d.severity}</div><div><strong>{d.entityType}{d.entityId?` · ${d.entityId}`:''}</strong><p>{d.message}</p>{d.detail&&<small>{d.detail}</small>}</div></article>)}</div></section></>}</section>}
