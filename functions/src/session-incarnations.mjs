const SESSION_QUERY = `
query SessionIncarnationSession($sessionId: UUID!) {
  gameSession(id: $sessionId) {
    id
    name
    status
    runtimeInitializedAt

    scenarioVersion {
      id
      versionLabel
      scenario {
        id
        title
        slug
      }
    }

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

const SOURCE_QUERY = `
query SessionIncarnationSource($versionId: UUID!) {
  characters(
    where: {scenarioVersionId: {eq: $versionId}}
  ) {
    externalId
    name
    publicRole
    narrativeAge
    gender
    biography
    secretIntro
    interpretationNotes
    appearanceNotes
    apparentMotive
    personalTimeline
    motto
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
}
`;

const UPDATE_MUTATION = `
mutation UpdateSessionIncarnation(
  $participantId: UUID!,
  $characterDisplayName: String,
  $characterGenderVariant: String,
  $characterSnapshotJson: String,
  $characterSnapshotAt: Timestamp
) {
  sessionParticipant_update(
    id: $participantId,
    data: {
      characterDisplayName: $characterDisplayName,
      characterGenderVariant: $characterGenderVariant,
      characterSnapshotJson: $characterSnapshotJson,
      characterSnapshotAt: $characterSnapshotAt
    }
  )
}
`;

async function getAdminDataConnect() {
  const [{initializeApp,getApps},{getDataConnect}] = await Promise.all([
    import('firebase-admin/app'),
    import('firebase-admin/data-connect'),
  ]);

  if (!getApps().length) initializeApp();

  return getDataConnect({
    location:'europe-west1',
    serviceId:'murder-engine',
  });
}

async function read(operation,variables) {
  const dc=await getAdminDataConnect();
  const response=await dc.executeGraphqlRead(operation,{variables});
  const errors=response?.errors??response?.data?.errors??[];

  if(errors.length){
    const e=new Error('DATACONNECT_INCARNATION_READ_FAILED');
    e.details=errors;
    throw e;
  }

  return response?.data??response;
}

async function write(operation,variables) {
  const dc=await getAdminDataConnect();
  const response=await dc.executeGraphql(operation,{variables});
  const errors=response?.errors??response?.data?.errors??[];

  if(errors.length){
    const e=new Error('DATACONNECT_INCARNATION_WRITE_FAILED');
    e.details=errors;
    throw e;
  }

  return response?.data??response;
}

function visibilityAllowed(value){
  return !['MJ','MJ_ONLY','SECRET_MJ','GM_ONLY']
    .includes(String(value??'').toUpperCase());
}

function parseSnapshot(participant){
  if(!participant?.characterSnapshotJson)return null;

  try{
    const value=JSON.parse(participant.characterSnapshotJson);

    if(
      !value ||
      value.characterExternalId!==participant.characterExternalId
    ) return null;

    return value;
  }catch{
    return null;
  }
}

function canonicalSnapshot(participant,source){
  const character=(source.characters??[])
    .find(c=>
      c.externalId===participant.characterExternalId &&
      c.active!==false
    );

  if(!character)
    throw new Error('CHARACTER_NOT_FOUND');

  const objectives=(source.objectives??[])
    .filter(o=>
      o.active!==false &&
      String(o.ownerType??'').toUpperCase()==='CHARACTER' &&
      o.ownerExternalId===character.externalId
    )
    .map(o=>({
      externalId:o.externalId,
      title:o.title,
      description:o.description,
      objectiveType:o.objectiveType??null,
      secret:Boolean(o.secret),
      importance:o.importance??null,
    }));

  const relationships=(source.relationships??[])
    .filter(r=>
      r.active!==false &&
      visibilityAllowed(r.visibility) &&
      (
        r.characterAExternalId===character.externalId ||
        r.characterBExternalId===character.externalId
      )
    )
    .map(r=>{
      const isA=r.characterAExternalId===character.externalId;

      return {
        externalId:r.externalId,
        otherExternalId:
          isA
            ? r.characterBExternalId
            : r.characterAExternalId,

        relationType:r.relationType??null,

        text:
          isA
            ? r.textA
            : (r.textB||r.textA),

        visibility:r.visibility,
      };
    });

  return {
    characterExternalId:character.externalId,

    character:{
      name:character.name,
      publicRole:character.publicRole??null,
      narrativeAge:character.narrativeAge??null,
      gender:character.gender??null,
      biography:character.biography??'',
      secretIntro:character.secretIntro??null,
      interpretationNotes:character.interpretationNotes??null,
      appearanceNotes:character.appearanceNotes??null,
      apparentMotive:character.apparentMotive??null,
      personalTimeline:character.personalTimeline??null,
      motto:character.motto??null,
    },

    objectives,
    relationships,
  };
}

function resolvedSnapshot(participant,source){
  const canonical=canonicalSnapshot(participant,source);
  const saved=parseSnapshot(participant);

  if(!saved)return canonical;

  return {
    characterExternalId:canonical.characterExternalId,

    character:{
      ...canonical.character,
      ...(saved.character??{}),
    },

    objectives:
      Array.isArray(saved.objectives)
        ? saved.objectives
        : canonical.objectives,

    relationships:
      Array.isArray(saved.relationships)
        ? saved.relationships
        : canonical.relationships,
  };
}

async function loadSession(sessionId){
  const sessionData=await read(SESSION_QUERY,{sessionId});
  const session=sessionData?.gameSession;

  if(!session)throw new Error('SESSION_NOT_FOUND');

  const versionId=session.scenarioVersion?.id;
  if(!versionId)throw new Error('SCENARIO_VERSION_NOT_FOUND');

  const source=await read(SOURCE_QUERY,{versionId});

  return {
    session,
    source:source??{},
  };
}

export async function getSessionIncarnations(sessionId){
  if(!sessionId)throw new Error('SESSION_ID_REQUIRED');

  const {session,source}=await loadSession(sessionId);

  const casted=(session.sessionParticipants_on_gameSession??[])
    .filter(p=>p.active!==false&&p.characterExternalId);

  const participantByCharacter=new Map(
    casted.map(p=>[p.characterExternalId,p])
  );

  const characterMap=new Map(
    (source.characters??[])
      .map(c=>[c.externalId,c])
  );

  const incarnations=casted.map(participant=>{
    const canonical=canonicalSnapshot(participant,source);
    const resolved=resolvedSnapshot(participant,source);

    resolved.character.name=
      participant.characterDisplayName ||
      resolved.character.name;

    const relations=resolved.relationships.map(r=>{
      const targetParticipant=
        participantByCharacter.get(r.otherExternalId);

      const targetCharacter=
        characterMap.get(r.otherExternalId);

      let targetSnapshot=null;

      if(targetParticipant){
        targetSnapshot=parseSnapshot(targetParticipant);
      }

      return {
        ...r,

        otherName:
          targetParticipant?.characterDisplayName ||
          targetSnapshot?.character?.name ||
          targetCharacter?.name ||
          r.otherExternalId,

        otherPublicRole:
          targetSnapshot?.character?.publicRole ||
          targetCharacter?.publicRole ||
          null,
      };
    });

    return {
      participantId:participant.id,
      participantDisplayName:participant.displayName,

      characterExternalId:participant.characterExternalId,

      characterDisplayName:
        participant.characterDisplayName??null,

      genderVariant:
        participant.characterGenderVariant??null,

      snapshotAt:
        participant.characterSnapshotAt??null,

      frozen:Boolean(parseSnapshot(participant)),

      canonical,

      resolved:{
        ...resolved,
        relationships:relations,
      },
    };
  });

  return {
    session:{
      id:session.id,
      name:session.name,
      status:session.status,
      runtimeInitializedAt:session.runtimeInitializedAt??null,

      scenarioTitle:
        session.scenarioVersion?.scenario?.title ??
        'Murder Party',

      versionId:
        session.scenarioVersion?.id,

      versionLabel:
        session.scenarioVersion?.versionLabel,
    },

    incarnations,
  };
}

export async function updateSessionIncarnation(
  sessionId,
  input,
  {now=new Date()}={}
){
  const {session,source}=await loadSession(sessionId);

  if(session.status==='ARCHIVED')
    throw new Error('SESSION_ARCHIVED');

  const participant=
    (session.sessionParticipants_on_gameSession??[])
      .find(p=>p.id===String(input?.participantId??''));

  if(
    !participant ||
    participant.active===false ||
    !participant.characterExternalId
  ){
    throw new Error('CAST_PARTICIPANT_NOT_FOUND');
  }

  if(input?.reset===true){
    await write(UPDATE_MUTATION,{
      participantId:participant.id,
      characterDisplayName:null,
      characterGenderVariant:null,
      characterSnapshotJson:null,
      characterSnapshotAt:null,
    });

    return {
      reset:true,
      participantId:participant.id,
    };
  }

  const canonical=canonicalSnapshot(participant,source);

  const snapshot=input?.snapshot;

  if(
    !snapshot ||
    snapshot.characterExternalId!==participant.characterExternalId
  ){
    throw new Error('INVALID_CHARACTER_SNAPSHOT');
  }

  const normalized={
    characterExternalId:participant.characterExternalId,

    character:{
      ...canonical.character,
      ...(snapshot.character??{}),
    },

    objectives:
      Array.isArray(snapshot.objectives)
        ? snapshot.objectives
        : canonical.objectives,

    relationships:
      Array.isArray(snapshot.relationships)
        ? snapshot.relationships
        : canonical.relationships,
  };

  const json=JSON.stringify(normalized);

  if(json.length>250000)
    throw new Error('CHARACTER_SNAPSHOT_TOO_LARGE');

  const snapshotAt=
    now instanceof Date
      ? now.toISOString()
      : new Date(now).toISOString();

  await write(UPDATE_MUTATION,{
    participantId:participant.id,

    characterDisplayName:
      String(
        input?.characterDisplayName ??
        normalized.character.name ??
        ''
      ).trim() || null,

    characterGenderVariant:
      String(input?.characterGenderVariant??'').trim() || null,

    characterSnapshotJson:json,
    characterSnapshotAt:snapshotAt,
  });

  return {
    saved:true,
    participantId:participant.id,
    snapshotAt,
  };
}

export async function freezeSessionIncarnations(
  sessionId,
  {now=new Date()}={}
){
  const {session,source}=await loadSession(sessionId);

  if(session.status==='ARCHIVED')
    throw new Error('SESSION_ARCHIVED');

  const casted=
    (session.sessionParticipants_on_gameSession??[])
      .filter(p=>p.active!==false&&p.characterExternalId);

  const snapshotAt=
    now instanceof Date
      ? now.toISOString()
      : new Date(now).toISOString();

  let frozen=0;
  let alreadyFrozen=0;

  for(const participant of casted){

    if(parseSnapshot(participant)){
      alreadyFrozen++;
      continue;
    }

    const snapshot=resolvedSnapshot(participant,source);

    await write(UPDATE_MUTATION,{
      participantId:participant.id,

      characterDisplayName:
        participant.characterDisplayName ||
        snapshot.character.name,

      characterGenderVariant:
        participant.characterGenderVariant || null,

      characterSnapshotJson:
        JSON.stringify(snapshot),

      characterSnapshotAt:snapshotAt,
    });

    frozen++;
  }

  return {
    sessionId,
    frozen,
    alreadyFrozen,
    total:casted.length,
    snapshotAt,
  };
}

export const __incarnationOps={
  SESSION_QUERY,
  SOURCE_QUERY,
  UPDATE_MUTATION,
};
