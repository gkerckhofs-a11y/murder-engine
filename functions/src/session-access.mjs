
export const ACCESS_QUERY = `query SessionAccess($sessionId: UUID!) {
  gameSession(id: $sessionId) {
    id status name organizerEmail organizerAccessEnabled selfServiceEnabled realSessionStartedAt
    rehearsalOfId activeRehearsalId runtimeInitializedAt startedAt
  }
}`;
export const CONFIGURE_ACCESS = `mutation ConfigureSessionAccess(
  $sessionId: UUID!, $email: String!, $enabled: Boolean!
) @transaction {
  gameSession_updateMany(where: {
    _and: [
      {id: {eq: $sessionId}, rehearsalOfId: {isNull: true}},
      {_or: [{selfServiceEnabled: {eq: true}}, {startedAt: {isNull: true}, status: {ne: "ARCHIVED"}}]}
    ]
  }, data: {
    organizerEmail: $email, organizerAccessEnabled: $enabled, selfServiceEnabled: true
  }) @check(expr: "this == 1", message: "SESSION_ACCESS_STATE_CHANGED")
}`;

async function dataConnect() {
  const [{initializeApp,getApps},{getDataConnect}] = await Promise.all([
    import('firebase-admin/app'), import('firebase-admin/data-connect'),
  ]);
  if (!getApps().length) initializeApp();
  return getDataConnect({location:'europe-west1',serviceId:'murder-engine'});
}
async function run(method, operation, variables) {
  const response = await (await dataConnect())[method](operation,{variables});
  const errors=response?.errors??response?.data?.errors??[];
  if(errors.length){const error=new Error('SESSION_ACCESS_DATABASE_FAILED');error.details=errors;throw error;}
  return response?.data??response;
}
export const accessReader=(op,vars)=>run('executeGraphqlRead',op,vars);
export const accessExecutor=(op,vars)=>run('executeGraphql',op,vars);

export function isAdministrator(identity, emails=process.env.ORGANIZER_EMAILS??'gkerckhofs@gmail.com') {
  return identity?.email_verified === true && new Set(emails.split(',').map(x=>x.trim().toLowerCase()).filter(Boolean))
    .has(String(identity.email??'').trim().toLowerCase());
}
export function verifiedIdentity(identity) {
  if(!identity?.uid || identity.email_verified!==true || !identity.email) throw new Error('ORGANIZER_AUTH_REQUIRED');
  return identity;
}
export function canonicalSessionId(value) {
  const hex=String(value??'').replaceAll('-','').toLowerCase();
  if(!/^[0-9a-f]{32}$/.test(hex))throw new Error('SESSION_ID_REQUIRED');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export async function readAccess(sessionId,{reader=accessReader}={}) {
  const result=await reader(ACCESS_QUERY,{sessionId:canonicalSessionId(sessionId)});
  if(!result?.gameSession)throw new Error('SESSION_ACCESS_DENIED');
  return {...result.gameSession,id:canonicalSessionId(result.gameSession.id)};
}
export async function authorizeSession(identity,sessionId,{reader=accessReader,admin=isAdministrator(identity)}={}) {
  verifiedIdentity(identity);
  const session=await readAccess(sessionId,{reader});
  if(admin)return {session,root:session,admin:true};
  const root=session.rehearsalOfId?await readAccess(session.rehearsalOfId,{reader}):session;
  if(!root.selfServiceEnabled || !root.organizerAccessEnabled || root.status==='ARCHIVED' ||
     String(root.organizerEmail??'').toLowerCase()!==identity.email.toLowerCase() ||
     (session.rehearsalOfId && (root.activeRehearsalId!==session.id || root.realSessionStartedAt || session.status==='ARCHIVED')))
    throw new Error('SESSION_ACCESS_DENIED');
  return {session,root,admin:false};
}
export async function configureSessionAccess(sessionId,input,{reader=accessReader,executor=accessExecutor}={}) {
  const email=String(input.email??'').trim().toLowerCase();
  if(email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('INVALID_ORGANIZER_EMAIL');
  const session=await readAccess(sessionId,{reader});
  if(session.rehearsalOfId)throw new Error('REHEARSAL_ACCESS_MANAGED_BY_PARENT');
  // Never convert an already played legacy session into a fresh commercial licence.
  if(!session.selfServiceEnabled && (session.startedAt || session.status==='ARCHIVED'))throw new Error('SESSION_ALREADY_STARTED');
  await executor(CONFIGURE_ACCESS,{sessionId:canonicalSessionId(sessionId),email,enabled:input.enabled===true});
  return {sessionId,email,enabled:input.enabled===true};
}

// Explicit allow-list: new server endpoints are administrator-only until classified.
export const PUBLIC_ENDPOINTS=new Set([
  'getPublicPrecastCampaignView','submitPublicPrecastRegistrationView','getPublicPrecast','submitPublicPrecastForm',
  'getPublicPlayerPortal','markPlayerBriefing','readPlayerNotification','executePublicPlayerInteraction',
  'getPublicPlayerLocation','executePublicPlayerLocationAction','attemptPublicPlayerClandestineAction',
  'claimPublicPlayerStolenObject','sharePublicPlayerClue','transferPublicPlayerObject','transferPublicPlayerCash',
  'castPublicPlayerVote','managePublicPlayerNotes',
]);
export const CLIENT_SESSION_ENDPOINTS=new Set([
  'getSession','getSessionSetup','addSessionParticipant','castSessionParticipant','applySessionCasting','updateSessionDetails',
  'updateSessionStatus','configureSessionPrecast','getRuntimeState','initializeRuntime','getLiveState','controlLive',
  'updateLiveResource','updateLiveState','updateLiveEvent','validateLiveBusinessDeal','getInteractionState',
  'executeLiveInteraction','revealLiveClue','transferLiveObject','getVoteState','openLiveVote','castLiveBallot',
  'closeLiveVote','configurePlayerAccess','sendLivePlayerNotification','getSessionIncarnationsView',
  'updateSessionIncarnationView','freezeSessionIncarnationsView','getSessionGmPackView','getSessionAccessView',
  'resetSessionRehearsalView','startRealSessionView',
]);
const PREPARATION_WRITES=new Set(['addSessionParticipant','castSessionParticipant','applySessionCasting','updateSessionDetails',
  'updateSessionStatus','configureSessionPrecast','initializeRuntime','updateSessionIncarnationView','freezeSessionIncarnationsView']);

const LIVE_WRITES=new Set(['controlLive','updateLiveResource','updateLiveState','updateLiveEvent','validateLiveBusinessDeal',
  'executeLiveInteraction','revealLiveClue','transferLiveObject','openLiveVote','castLiveBallot','closeLiveVote','sendLivePlayerNotification']);

export async function authorizeEndpoint(name,identity,input,{reader=accessReader}={}) {
  verifiedIdentity(identity);
  const admin=isAdministrator(identity);
  if(admin){
    if(name==='controlLive' && String(input.action??'').toUpperCase()==='START'){
      const session=await readAccess(String(input.sessionId??''),{reader});
      if(session.selfServiceEnabled && !session.realSessionStartedAt)throw new Error('USE_START_REAL_SESSION');
    }
    return {admin:true,identity};
  }
  if(!CLIENT_SESSION_ENDPOINTS.has(name))throw new Error('ADMINISTRATOR_REQUIRED');
  const access=await authorizeSession(identity,String(input.sessionId??''),{reader,admin:false});
  if(PREPARATION_WRITES.has(name) && (access.session.rehearsalOfId || access.root.activeRehearsalId || access.root.realSessionStartedAt))
    throw new Error('SESSION_PREPARATION_LOCKED');
  if(LIVE_WRITES.has(name) && !access.session.rehearsalOfId && !access.root.realSessionStartedAt)
    throw new Error('USE_START_REAL_SESSION');
  if(name==='updateSessionStatus' && !['DRAFT','CASTING','READY'].includes(String(input.status??'').toUpperCase()))
    throw new Error('INVALID_PRELIVE_STATUS');
  return {...access,identity};
}

export async function verifyRequestIdentity(req) {
  const match=String(req.header('authorization')??'').match(/^Bearer\s+(.+)$/i);
  if(!match)throw new Error('ORGANIZER_AUTH_REQUIRED');
  try {
    const [{initializeApp,getApps},{getAuth}]=await Promise.all([import('firebase-admin/app'),import('firebase-admin/auth')]);
    if(!getApps().length)initializeApp();
    return verifiedIdentity(await getAuth().verifyIdToken(match[1],true));
  }catch {throw new Error('ORGANIZER_AUTH_INVALID');}
}
