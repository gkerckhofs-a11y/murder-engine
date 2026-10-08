import {getGameSession} from '../src/sessions.mjs';
import {getPlayerLocation} from '../src/player.mjs';

const sessionId='9e1f4a9b-53f8-4f38-9289-4ffa6dc5e227';
const session=await getGameSession(sessionId);

const tests=[
  ['CHAR_CLARA','LOC_ROOM_C15'],
  ['CHAR_MAXWELL','LOC_ROOM_C01'],
  ['CHAR_ELEANOR','LOC_ROOM_C02'],
];

const results=[];

for(const [characterExternalId,locationExternalId] of tests){
  const participant=(session.participants??[]).find(p=>
    p.active!==false &&
    p.characterExternalId===characterExternalId &&
    p.playerAccessEnabled &&
    p.playerAccessToken
  );

  if(!participant)
    throw new Error('PLAYER_ACCESS_NOT_FOUND_'+characterExternalId);

  const own=await getPlayerLocation(
    participant.playerAccessToken,
    locationExternalId
  );

  const other=await getPlayerLocation(
    participant.playerAccessToken,
    'LOC_ROOM_C09'
  );

  results.push({
    characterExternalId,
    own:{
      location:own.location?.name,
      forbidden:own.forbidden,
      actions:own.actions?.length??0,
    },
    other:{
      location:other.location?.name,
      forbidden:other.forbidden,
    },
  });
}

console.log(JSON.stringify(results,null,2));

if(results.some(x=>x.own.forbidden!==true||x.own.actions!==0))
  throw new Error('OWN_ROOM_NOT_BLOCKED');

if(results[0].other.forbidden===true)
  throw new Error('OTHER_ROOM_WRONGLY_BLOCKED');
