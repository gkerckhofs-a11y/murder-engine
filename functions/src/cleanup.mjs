const SESSION_PURGE_MUTATION = `
mutation PurgeSession($sessionId: UUID!) @transaction {
  precastRegistration_updateMany(
    where:{transferredSessionId:{eq:$sessionId}}
    data:{status:"REGISTERED",transferredSessionId:null}
  )
  sessionPlayerNotification_deleteMany(where:{gameSessionId:{eq:$sessionId}})
  sessionBallot_deleteMany(where:{gameSessionId:{eq:$sessionId}})
  sessionVote_deleteMany(where:{gameSessionId:{eq:$sessionId}})
  sessionActionLog_deleteMany(where:{gameSessionId:{eq:$sessionId}})
  sessionEvent_deleteMany(where:{gameSessionId:{eq:$sessionId}})
  sessionClueDiscovery_deleteMany(where:{gameSessionId:{eq:$sessionId}})
  sessionStealGrant_deleteMany(where:{gameSessionId:{eq:$sessionId}})
  sessionInteractionUse_deleteMany(where:{gameSessionId:{eq:$sessionId}})
  sessionCharacterState_deleteMany(where:{gameSessionId:{eq:$sessionId}})
  sessionObject_deleteMany(where:{gameSessionId:{eq:$sessionId}})
  sessionObjective_deleteMany(where:{gameSessionId:{eq:$sessionId}})
  sessionKnowledge_deleteMany(where:{gameSessionId:{eq:$sessionId}})
  sessionResource_deleteMany(where:{gameSessionId:{eq:$sessionId}})
  sessionCharacter_deleteMany(where:{gameSessionId:{eq:$sessionId}})
  sessionParticipant_deleteMany(where:{gameSessionId:{eq:$sessionId}})
  gameSession_delete(id:$sessionId)
}
`;

const CAMPAIGN_PURGE_MUTATION = `
mutation PurgePrecastCampaign($campaignId: UUID!) @transaction {
  precastRegistration_deleteMany(where:{campaignId:{eq:$campaignId}})
  precastCampaign_delete(id:$campaignId)
}
`;

const VERSION_PURGE_MUTATION = `
mutation PurgeScenarioVersion($versionId: UUID!) @transaction {
  voteOptionDefinition_deleteMany(where:{scenarioVersionId:{eq:$versionId}})
  voteDefinition_deleteMany(where:{scenarioVersionId:{eq:$versionId}})
  interaction_deleteMany(where:{scenarioVersionId:{eq:$versionId}})
  gameLocation_deleteMany(where:{scenarioVersionId:{eq:$versionId}})
  abilityAssignment_deleteMany(where:{scenarioVersionId:{eq:$versionId}})
  ability_deleteMany(where:{scenarioVersionId:{eq:$versionId}})
  gameEventDefinition_deleteMany(where:{scenarioVersionId:{eq:$versionId}})
  gamePhaseDefinition_deleteMany(where:{scenarioVersionId:{eq:$versionId}})
  gameStateDefinition_deleteMany(where:{scenarioVersionId:{eq:$versionId}})
  resourceAssignment_deleteMany(where:{scenarioVersionId:{eq:$versionId}})
  resource_deleteMany(where:{scenarioVersionId:{eq:$versionId}})
  skinVisualDefinition_deleteMany(where:{scenarioVersionId:{eq:$versionId}})
  gameObject_deleteMany(where:{scenarioVersionId:{eq:$versionId}})
  documentDefinition_deleteMany(where:{scenarioVersionId:{eq:$versionId}})
  mediaAsset_deleteMany(where:{scenarioVersionId:{eq:$versionId}})
  clueFact_deleteMany(where:{scenarioVersionId:{eq:$versionId}})
  clue_deleteMany(where:{scenarioVersionId:{eq:$versionId}})
  initialKnowledge_deleteMany(where:{scenarioVersionId:{eq:$versionId}})
  fact_deleteMany(where:{scenarioVersionId:{eq:$versionId}})
  relationship_deleteMany(where:{scenarioVersionId:{eq:$versionId}})
  objective_deleteMany(where:{scenarioVersionId:{eq:$versionId}})
  plot_deleteMany(where:{scenarioVersionId:{eq:$versionId}})
  character_deleteMany(where:{scenarioVersionId:{eq:$versionId}})
  scenarioVersion_delete(id:$versionId)
}
`;

const SCENARIO_DELETE_MUTATION = `
mutation DeleteScenario($scenarioId: UUID!) {
  scenario_delete(id:$scenarioId)
}
`;

const SESSION_LOOKUP_QUERY = `
query SessionForPurge($sessionId: UUID!) {
  gameSession(id:$sessionId) {
    id name status
    scenarioVersion { id scenario { id title } }
  }
}
`;

const SCENARIO_PURGE_QUERY = `
query ScenarioForPurge($scenarioId: UUID!) {
  scenario(id:$scenarioId) { id title }
  scenarioVersions(where:{scenarioId:{eq:$scenarioId}}) { id }
  precastCampaigns(where:{scenarioId:{eq:$scenarioId}}) { id name status }
}
`;

const SESSIONS_FOR_VERSION_QUERY = `
query SessionsForScenarioVersion($versionId: UUID!) {
  gameSessions(where:{scenarioVersionId:{eq:$versionId}}) { id name status }
}
`;

async function getAdminDataConnect() {
  const [{ initializeApp, getApps }, { getDataConnect }] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/data-connect'),
  ]);
  if (!getApps().length) initializeApp();
  return getDataConnect({ location:'europe-west1', serviceId:'murder-engine' });
}

async function defaultReader(operation,variables){
  const dc=await getAdminDataConnect();
  const response=await dc.executeGraphqlRead(operation,{variables});
  const errors=response?.errors??response?.data?.errors??[];
  if(Array.isArray(errors)&&errors.length){
    const error=new Error('DATACONNECT_CLEANUP_READ_FAILED');
    error.details=errors;
    throw error;
  }
  return response?.data??response;
}

async function defaultExecutor(operation,variables){
  const dc=await getAdminDataConnect();
  const response=await dc.executeGraphql(operation,{variables});
  const errors=response?.errors??response?.data?.errors??[];
  if(Array.isArray(errors)&&errors.length){
    const error=new Error('DATACONNECT_CLEANUP_WRITE_FAILED');
    error.details=errors;
    throw error;
  }
  return response?.data??response;
}

export async function purgeGameSession(sessionId,{reader=defaultReader,executor=defaultExecutor}={}){
  const id=String(sessionId??'').trim();
  if(!id)throw new Error('SESSION_ID_REQUIRED');
  const data=await reader(SESSION_LOOKUP_QUERY,{sessionId:id});
  const session=data?.gameSession;
  if(!session)throw new Error('SESSION_NOT_FOUND');
  await executor(SESSION_PURGE_MUTATION,{sessionId:id});
  return {
    deleted:true,
    sessionId:id,
    name:session.name??'Session',
    scenarioId:session.scenarioVersion?.scenario?.id??null,
  };
}

export async function purgeScenarioFamily(scenarioId,{reader=defaultReader,executor=defaultExecutor}={}){
  const id=String(scenarioId??'').trim();
  if(!id)throw new Error('SCENARIO_ID_REQUIRED');
  const data=await reader(SCENARIO_PURGE_QUERY,{scenarioId:id});
  const scenario=data?.scenario;
  if(!scenario)throw new Error('SCENARIO_NOT_FOUND');

  const versions=data?.scenarioVersions??[];
  const campaigns=data?.precastCampaigns??[];
  const sessions=[];
  for(const version of versions){
    const sessionData=await reader(SESSIONS_FOR_VERSION_QUERY,{versionId:version.id});
    sessions.push(...(sessionData?.gameSessions??[]));
  }

  for(const session of sessions){
    await executor(SESSION_PURGE_MUTATION,{sessionId:session.id});
  }
  for(const campaign of campaigns){
    await executor(CAMPAIGN_PURGE_MUTATION,{campaignId:campaign.id});
  }
  for(const version of versions){
    await executor(VERSION_PURGE_MUTATION,{versionId:version.id});
  }
  await executor(SCENARIO_DELETE_MUTATION,{scenarioId:id});

  return {
    deleted:true,
    scenarioId:id,
    title:scenario.title,
    sessionsDeleted:sessions.length,
    campaignsDeleted:campaigns.length,
    versionsDeleted:versions.length,
  };
}

export const __cleanupOps={
  SESSION_PURGE_MUTATION,
  CAMPAIGN_PURGE_MUTATION,
  VERSION_PURGE_MUTATION,
  SCENARIO_DELETE_MUTATION,
  SESSION_LOOKUP_QUERY,
  SCENARIO_PURGE_QUERY,
  SESSIONS_FOR_VERSION_QUERY,
};
