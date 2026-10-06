import { randomBytes, randomUUID } from 'node:crypto';
import { createGameSession, addGameSessionParticipant } from './sessions.mjs';

const LIST_CAMPAIGNS_QUERY = `
query PrecastCampaignLibrary {
  precastCampaigns(orderBy: {createdAt: DESC}) {
    id name token language status plannedAt venueHint publicNote
    openCount submissionCount lastOpenedAt closedAt createdAt
    scenario { id title slug organization { id name slug } }
    precastRegistrations_on_campaign(orderBy: {submittedAt: ASC}) {
      id displayName email ageBracket genderPreference desiredInvolvement
      notes status transferredSessionId submittedAt updatedAt active
    }
  }
}
`;

const GET_CAMPAIGN_QUERY = `
query PrecastCampaignDetail($campaignId: UUID!) {
  precastCampaign(id: $campaignId) {
    id name token language status plannedAt venueHint publicNote
    openCount submissionCount lastOpenedAt closedAt createdAt
    scenario {
      id title slug
      organization { id name slug }
      scenarioVersions_on_scenario(orderBy: {importedAt: DESC}) {
        id versionLabel variantName genderProfile language status subtitle
        minPlayers maxPlayers playerSummary importedAt
        characters_on_scenarioVersion { externalId gender playable active }
      }
    }
    precastRegistrations_on_campaign(orderBy: {submittedAt: ASC}) {
      id displayName email ageBracket genderPreference desiredInvolvement
      notes status transferredSessionId submittedAt updatedAt active
    }
  }
}
`;

const GET_SCENARIO_QUERY = `
query ScenarioForPrecast($scenarioId: UUID!) {
  scenario(id: $scenarioId) {
    id title slug
    organization { id name slug }
    scenarioVersions_on_scenario(orderBy: {importedAt: DESC}) {
      id versionLabel variantName genderProfile language status subtitle
      minPlayers maxPlayers playerSummary importedAt
      characters_on_scenarioVersion { externalId gender playable active }
    }
  }
}
`;

const PUBLIC_CAMPAIGN_QUERY = `
query PublicPrecastCampaign($token: String!) {
  precastCampaigns(where: {token: {eq: $token}}, limit: 1) {
    id name token language status plannedAt venueHint publicNote
    openCount submissionCount lastOpenedAt
    scenario {
      id title slug
      scenarioVersions_on_scenario(orderBy: {importedAt: DESC}) {
        id versionLabel variantName language status playerSummary importedAt
      }
    }
    precastRegistrations_on_campaign {
      id email active status
    }
  }
}
`;

const CREATE_CAMPAIGN_MUTATION = `
mutation CreatePrecastCampaign($data: PrecastCampaign_Data!) {
  precastCampaign_insert(data: $data)
}
`;

const UPDATE_CAMPAIGN_STATUS_MUTATION = `
mutation UpdatePrecastCampaignStatus($campaignId: UUID!, $status: String!, $closedAt: Timestamp) {
  precastCampaign_update(id: $campaignId, data: {status: $status, closedAt: $closedAt})
}
`;

const TRACK_CAMPAIGN_OPEN_MUTATION = `
mutation TrackPrecastCampaignOpen($campaignId: UUID!, $count: Int!, $openedAt: Timestamp!) {
  precastCampaign_update(id: $campaignId, data: {openCount: $count, lastOpenedAt: $openedAt})
}
`;

const UPDATE_CAMPAIGN_SUBMISSION_COUNT_MUTATION = `
mutation UpdatePrecastCampaignSubmissionCount($campaignId: UUID!, $count: Int!) {
  precastCampaign_update(id: $campaignId, data: {submissionCount: $count})
}
`;

const INSERT_REGISTRATION_MUTATION = `
mutation InsertPrecastRegistration($data: PrecastRegistration_Data!) {
  precastRegistration_insert(data: $data)
}
`;

const UPDATE_REGISTRATION_MUTATION = `
mutation UpdatePrecastRegistration(
  $registrationId: UUID!
  $displayName: String!
  $ageBracket: String!
  $genderPreference: String
  $desiredInvolvement: String!
  $notes: String
  $submittedAt: Timestamp!
  $updatedAt: Timestamp!
  $status: String!
  $active: Boolean!
) {
  precastRegistration_update(
    id: $registrationId
    data: {
      displayName: $displayName
      ageBracket: $ageBracket
      genderPreference: $genderPreference
      desiredInvolvement: $desiredInvolvement
      notes: $notes
      submittedAt: $submittedAt
      updatedAt: $updatedAt
      status: $status
      active: $active
    }
  )
}
`;

const MARK_REGISTRATION_TRANSFERRED_MUTATION = `
mutation MarkPrecastRegistrationTransferred($registrationId: UUID!, $sessionId: String!, $updatedAt: Timestamp!) {
  precastRegistration_update(
    id: $registrationId
    data: {status: "TRANSFERRED", transferredSessionId: $sessionId, updatedAt: $updatedAt}
  )
}
`;

const ALLOWED_LANGUAGES = new Set(['FR','EN']);
const ALLOWED_INVOLVEMENT = new Set(['TRANQUILLE','ACTIF','TRES_IMPLIQUE','PREMIER_ROLE']);
const ALLOWED_AGE_BRACKETS = new Set(['MOINS_18','18_25','26_40','41_60','60_PLUS']);
const ALLOWED_CHARACTER_PREFERENCES = new Set(['','SANS_PREFERENCE','MASCULIN','FEMININ','A_DISCUTER']);
const ALLOWED_CAMPAIGN_STATUSES = new Set(['OPEN','CLOSED']);

async function getAdminDataConnect() {
  const [{ initializeApp, getApps }, { getDataConnect }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/data-connect'),
  ]);
  if (!getApps().length) initializeApp();
  return getDataConnect({ location:'europe-west1', serviceId:'murder-engine' });
}

async function defaultReader(operation, variables=undefined) {
  const dc=await getAdminDataConnect();
  const response=await dc.executeGraphqlRead(operation, variables?{variables}:undefined);
  const errors=response?.errors??response?.data?.errors??[];
  if(Array.isArray(errors)&&errors.length){
    const error=new Error('DATACONNECT_PRECAST_READ_FAILED');
    error.details=errors;
    throw error;
  }
  return response?.data??response;
}

async function defaultExecutor(operation,variables) {
  const dc=await getAdminDataConnect();
  const response=await dc.executeGraphql(operation,{variables});
  const errors=response?.errors??response?.data?.errors??[];
  if(Array.isArray(errors)&&errors.length){
    const error=new Error('DATACONNECT_PRECAST_WRITE_FAILED');
    error.details=errors;
    throw error;
  }
  return response?.data??response;
}

function cleanText(value,max=500){
  return String(value??'').trim().slice(0,max);
}

function normalizeEmail(value){
  return String(value??'').trim().toLowerCase();
}

function safeToken(token){
  const value=String(token??'').trim();
  if(!/^[A-Za-z0-9_-]{24,120}$/.test(value)) throw new Error('INVALID_PRECAST_TOKEN');
  return value;
}

function validateRegistration(input){
  const displayName=cleanText(input?.displayName,80);
  if(displayName.length<2) throw new Error('PARTICIPANT_NAME_REQUIRED');

  const email=normalizeEmail(input?.email);
  if(!email) throw new Error('EMAIL_REQUIRED');
  if(!email.includes('@')||email.length>254) throw new Error('INVALID_EMAIL');

  const ageBracket=cleanText(input?.ageBracket,30).toUpperCase();
  if(!ALLOWED_AGE_BRACKETS.has(ageBracket)) throw new Error('INVALID_AGE_BRACKET');

  const genderPreference=cleanText(input?.genderPreference,30).toUpperCase();
  if(!ALLOWED_CHARACTER_PREFERENCES.has(genderPreference)) throw new Error('INVALID_CHARACTER_PREFERENCE');

  const desiredInvolvement=cleanText(input?.desiredInvolvement||'ACTIF',30).toUpperCase();
  if(!ALLOWED_INVOLVEMENT.has(desiredInvolvement)) throw new Error('INVALID_INVOLVEMENT');

  return {
    displayName,email,ageBracket,
    genderPreference:genderPreference||null,
    desiredInvolvement,
    notes:cleanText(input?.notes,500)||null,
  };
}

function normalizeGender(value){
  const v=String(value??'').trim().toUpperCase();
  if(['F','FEMININ','FÉMININ','FEMME','WOMAN','FEMALE'].includes(v)) return 'FEMININ';
  if(['M','MASCULIN','H','HOMME','MAN','MALE'].includes(v)) return 'MASCULIN';
  return 'ADAPTABLE';
}

function shapeVersion(version){
  const playable=(version?.characters_on_scenarioVersion??[]).filter(c=>c.active!==false&&c.playable!==false);
  const genders={feminine:0,masculine:0,flexible:0};
  for(const c of playable){
    const g=normalizeGender(c.gender);
    if(g==='FEMININ')genders.feminine+=1;
    else if(g==='MASCULIN')genders.masculine+=1;
    else genders.flexible+=1;
  }
  return {
    id:version.id,
    versionLabel:version.versionLabel,
    variantName:version.variantName,
    genderProfile:version.genderProfile,
    language:version.language,
    status:version.status,
    subtitle:version.subtitle,
    minPlayers:version.minPlayers,
    maxPlayers:version.maxPlayers,
    playerSummary:version.playerSummary,
    importedAt:version.importedAt,
    playableCharacters:playable.length,
    genderComposition:{...genders,total:playable.length},
  };
}

function shapeCampaign(campaign,{includeVersions=false}={}){
  if(!campaign)return null;
  const registrations=(campaign.precastRegistrations_on_campaign??[]).filter(r=>r.active!==false);
  const available=registrations.filter(r=>r.status!=='TRANSFERRED');
  return {
    id:campaign.id,
    name:campaign.name,
    token:campaign.token,
    language:campaign.language,
    status:campaign.status,
    plannedAt:campaign.plannedAt??null,
    venueHint:campaign.venueHint??null,
    publicNote:campaign.publicNote??null,
    openCount:Number(campaign.openCount??0),
    submissionCount:Number(campaign.submissionCount??0),
    lastOpenedAt:campaign.lastOpenedAt??null,
    closedAt:campaign.closedAt??null,
    createdAt:campaign.createdAt??null,
    scenario:{
      id:campaign.scenario?.id,
      title:campaign.scenario?.title??'Murder Party',
      slug:campaign.scenario?.slug??null,
    },
    registrations,
    counts:{
      registrations:registrations.length,
      available:available.length,
      transferred:registrations.filter(r=>r.status==='TRANSFERRED').length,
      femininePreference:available.filter(r=>r.genderPreference==='FEMININ').length,
      masculinePreference:available.filter(r=>r.genderPreference==='MASCULIN').length,
      noPreference:available.filter(r=>!r.genderPreference||r.genderPreference==='SANS_PREFERENCE').length,
      highInvolvement:available.filter(r=>['TRES_IMPLIQUE','PREMIER_ROLE'].includes(r.desiredInvolvement)).length,
    },
    ...(includeVersions?{
      versions:(campaign.scenario?.scenarioVersions_on_scenario??[])
        .filter(v=>v.status!=='ARCHIVED')
        .map(shapeVersion),
    }:{})
  };
}

export async function listPrecastCampaigns({reader=defaultReader}={}){
  const data=await reader(LIST_CAMPAIGNS_QUERY);
  return (data?.precastCampaigns??[]).map(row=>shapeCampaign(row));
}

export async function getPrecastCampaign(campaignId,{reader=defaultReader}={}){
  if(!campaignId)throw new Error('PRECAST_CAMPAIGN_ID_REQUIRED');
  const data=await reader(GET_CAMPAIGN_QUERY,{campaignId});
  const campaign=shapeCampaign(data?.precastCampaign??null,{includeVersions:true});
  if(!campaign)throw new Error('PRECAST_CAMPAIGN_NOT_FOUND');
  return campaign;
}

export async function createPrecastCampaign(input,{reader=defaultReader,executor=defaultExecutor}={}){
  const scenarioId=String(input?.scenarioId??'').trim();
  if(!scenarioId)throw new Error('SCENARIO_ID_REQUIRED');

  const lookup=await reader(GET_SCENARIO_QUERY,{scenarioId});
  const scenario=lookup?.scenario;
  if(!scenario?.organization?.id)throw new Error('SCENARIO_NOT_FOUND');

  const name=cleanText(input?.name,120)||`${scenario.title} — inscriptions`;
  const language=cleanText(input?.language||scenario.scenarioVersions_on_scenario?.[0]?.language||'FR',10).toUpperCase();
  if(!ALLOWED_LANGUAGES.has(language))throw new Error('INVALID_PRECAST_LANGUAGE');

  let plannedAt=null;
  if(input?.plannedAt){
    const d=new Date(String(input.plannedAt));
    if(Number.isNaN(d.getTime()))throw new Error('INVALID_PRECAST_DATE');
    plannedAt=d.toISOString();
  }

  const id=randomUUID();
  const token=randomBytes(24).toString('base64url');
  await executor(CREATE_CAMPAIGN_MUTATION,{data:{
    id,
    organizationId:scenario.organization.id,
    scenarioId:scenario.id,
    name,
    token,
    language,
    status:'OPEN',
    plannedAt,
    venueHint:cleanText(input?.venueHint,180)||null,
    publicNote:cleanText(input?.publicNote,1000)||null,
    openCount:0,
    submissionCount:0,
    lastOpenedAt:null,
    closedAt:null,
  }});

  return {id,name,token,language,status:'OPEN',scenario:{id:scenario.id,title:scenario.title}};
}

export async function setPrecastCampaignStatus(campaignId,status,{reader=defaultReader,executor=defaultExecutor,now=new Date()}={}){
  const normalized=String(status??'').trim().toUpperCase();
  if(!ALLOWED_CAMPAIGN_STATUSES.has(normalized))throw new Error('INVALID_PRECAST_STATUS');
  await getPrecastCampaign(campaignId,{reader});
  const closedAt=normalized==='CLOSED'?(now instanceof Date?now:new Date(now)).toISOString():null;
  await executor(UPDATE_CAMPAIGN_STATUS_MUTATION,{campaignId,status:normalized,closedAt});
  return {campaignId,status:normalized,closedAt};
}

async function lookupPublicCampaign(token,{reader=defaultReader}={}){
  const safe=safeToken(token);
  const data=await reader(PUBLIC_CAMPAIGN_QUERY,{token:safe});
  const campaign=(data?.precastCampaigns??[])[0]??null;
  if(!campaign)throw new Error('PRECAST_LINK_NOT_FOUND');
  if(campaign.status!=='OPEN')throw new Error('PRECAST_CLOSED');
  return campaign;
}

export async function getPublicPrecastCampaign(token,{reader=defaultReader,executor=defaultExecutor,trackOpen=true,now=new Date()}={}){
  const campaign=await lookupPublicCampaign(token,{reader});
  if(trackOpen){
    const openedAt=(now instanceof Date?now:new Date(now)).toISOString();
    await executor(TRACK_CAMPAIGN_OPEN_MUTATION,{
      campaignId:campaign.id,
      count:Number(campaign.openCount??0)+1,
      openedAt,
    });
  }
  const versions=(campaign.scenario?.scenarioVersions_on_scenario??[]).filter(v=>v.status!=='ARCHIVED');
  const representative=versions[0]??null;
  return {
    name:campaign.name,
    plannedAt:campaign.plannedAt??null,
    venue:campaign.venueHint??null,
    language:campaign.language,
    status:campaign.status,
    publicNote:campaign.publicNote??null,
    scenario:{
      title:campaign.scenario?.title??'Murder Party',
      playerSummary:representative?.playerSummary??null,
    },
  };
}

export async function submitPublicPrecastRegistration(token,input,{reader=defaultReader,executor=defaultExecutor,now=new Date()}={}){
  const campaign=await lookupPublicCampaign(token,{reader});
  const cleaned=validateRegistration(input);
  const submittedAt=(now instanceof Date?now:new Date(now)).toISOString();
  const registrations=(campaign.precastRegistrations_on_campaign??[]).filter(r=>r.active!==false);
  const existing=registrations.find(r=>normalizeEmail(r.email)===cleaned.email);

  if(existing){
    if(existing.status==='TRANSFERRED')throw new Error('REGISTRATION_ALREADY_TRANSFERRED');
    await executor(UPDATE_REGISTRATION_MUTATION,{
      registrationId:existing.id,
      displayName:cleaned.displayName,
      ageBracket:cleaned.ageBracket,
      genderPreference:cleaned.genderPreference,
      desiredInvolvement:cleaned.desiredInvolvement,
      notes:cleaned.notes,
      submittedAt,
      updatedAt:submittedAt,
      status:'REGISTERED',
      active:true,
    });
    return {id:existing.id,updated:true};
  }

  const id=randomUUID();
  await executor(INSERT_REGISTRATION_MUTATION,{data:{
    id,
    campaignId:campaign.id,
    ...cleaned,
    status:'REGISTERED',
    transferredSessionId:null,
    submittedAt,
    updatedAt:submittedAt,
    active:true,
  }});
  await executor(UPDATE_CAMPAIGN_SUBMISSION_COUNT_MUTATION,{
    campaignId:campaign.id,
    count:Number(campaign.submissionCount??0)+1,
  });
  return {id,updated:false};
}

export async function createSessionFromPrecast(campaignId,input,{
  reader=defaultReader,
  executor=defaultExecutor,
  sessionCreator=createGameSession,
  participantAdder=addGameSessionParticipant,
  now=new Date(),
}={}){
  const campaign=await getPrecastCampaign(campaignId,{reader});
  const versionId=String(input?.versionId??'').trim();
  if(!versionId)throw new Error('VERSION_ID_REQUIRED');
  const version=campaign.versions.find(v=>v.id===versionId);
  if(!version)throw new Error('VERSION_NOT_IN_PRECAST_SCENARIO');

  const requestedIds=Array.isArray(input?.registrationIds)
    ? [...new Set(input.registrationIds.map(x=>String(x??'').trim()).filter(Boolean))]
    : [];
  if(!requestedIds.length)throw new Error('REGISTRATIONS_REQUIRED');

  const registrations=campaign.registrations.filter(r=>r.active!==false&&r.status!=='TRANSFERRED');
  const byId=new Map(registrations.map(r=>[r.id,r]));
  const selected=requestedIds.map(id=>byId.get(id));
  if(selected.some(x=>!x))throw new Error('REGISTRATION_NOT_AVAILABLE');

  const min=Number(version.minPlayers??version.playableCharacters??0);
  const max=Number(version.maxPlayers??version.playableCharacters??0);
  if(selected.length<min||selected.length>max){
    const error=new Error('REGISTRATION_COUNT_INCOMPATIBLE_WITH_VARIANT');
    error.details={selected:selected.length,min,max};
    throw error;
  }

  const session=await sessionCreator({
    versionId,
    name:cleanText(input?.name,120)||`${campaign.scenario.title} — session`,
    scheduledAt:input?.scheduledAt??campaign.plannedAt??null,
    venue:cleanText(input?.venue,180)||campaign.venueHint||null,
    language:cleanText(input?.language||campaign.language||version.language||'FR',10).toUpperCase(),
    notes:cleanText(input?.notes,500)||null,
  });

  for(const registration of selected){
    await participantAdder(session.id,{
      displayName:registration.displayName,
      email:registration.email,
      ageBracket:registration.ageBracket,
      genderPreference:registration.genderPreference||'SANS_PREFERENCE',
      desiredInvolvement:registration.desiredInvolvement,
      notes:registration.notes??null,
    });
  }

  const updatedAt=(now instanceof Date?now:new Date(now)).toISOString();
  for(const registration of selected){
    await executor(MARK_REGISTRATION_TRANSFERRED_MUTATION,{
      registrationId:registration.id,
      sessionId:session.id,
      updatedAt,
    });
  }

  return {
    session,
    campaignId,
    transferred:selected.length,
    registrationIds:selected.map(r=>r.id),
  };
}

export const __precastOps={
  LIST_CAMPAIGNS_QUERY,
  GET_CAMPAIGN_QUERY,
  GET_SCENARIO_QUERY,
  PUBLIC_CAMPAIGN_QUERY,
  CREATE_CAMPAIGN_MUTATION,
  UPDATE_CAMPAIGN_STATUS_MUTATION,
  TRACK_CAMPAIGN_OPEN_MUTATION,
  UPDATE_CAMPAIGN_SUBMISSION_COUNT_MUTATION,
  INSERT_REGISTRATION_MUTATION,
  UPDATE_REGISTRATION_MUTATION,
  MARK_REGISTRATION_TRANSFERRED_MUTATION,
};
