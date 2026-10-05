export function parseCharacterSnapshot(participant){
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

export function resolveSessionCharacter(
  participant,
  canonical={}
){
  const snapshot=parseCharacterSnapshot(participant);

  const snapCharacter=
    snapshot?.character??{};

  const externalId=
    participant?.characterExternalId ??
    canonical?.externalId ??
    null;

  return {
    ...canonical,
    ...snapCharacter,

    externalId,

    name:
      participant?.characterDisplayName ||
      snapCharacter.name ||
      canonical?.name ||
      externalId ||
      'Personnage',

    publicRole:
      snapCharacter.publicRole ??
      canonical?.publicRole ??
      null,

    gender:
      participant?.characterGenderVariant ||
      snapCharacter.gender ||
      canonical?.gender ||
      null,

    snapshotAt:
      participant?.characterSnapshotAt??null,

    frozen:
      Boolean(
        snapshot &&
        participant?.characterSnapshotAt
      ),
  };
}

export function incarnationStatus(session){
  const casted=
    (session?.sessionParticipants_on_gameSession??[])
      .filter(
        p=>
          p.active!==false &&
          p.characterExternalId
      );

  /*
   * Compatibilité tests / anciennes structures.
   * En production Data Connect, ces propriétés existent,
   * même quand leur valeur est null.
   */
  const incarnationAware=
    casted.some(p=>
      [
        'characterSnapshotJson',
        'characterSnapshotAt',
        'characterDisplayName',
      ].some(key=>
        Object.prototype.hasOwnProperty.call(p,key)
      )
    );

  if(!incarnationAware){
    return {
      supported:false,
      ready:true,
      frozenCount:casted.length,
      total:casted.length,
      unfrozenCharacterExternalIds:[],
    };
  }

  const unfrozen=
    casted.filter(p=>
      !parseCharacterSnapshot(p) ||
      !p.characterSnapshotAt
    );

  return {
    supported:true,

    ready:
      casted.length>0 &&
      unfrozen.length===0,

    frozenCount:
      casted.length-unfrozen.length,

    total:
      casted.length,

    unfrozenCharacterExternalIds:
      unfrozen.map(p=>p.characterExternalId),
  };
}

export function assertSessionIncarnationsFrozen(session){
  const state=incarnationStatus(session);

  if(state.supported&&!state.ready){
    const error=
      new Error('SESSION_INCARNATIONS_NOT_FROZEN');

    error.details={
      frozenCount:state.frozenCount,
      total:state.total,
      unfrozenCharacterExternalIds:
        state.unfrozenCharacterExternalIds,
    };

    throw error;
  }

  return state;
}
