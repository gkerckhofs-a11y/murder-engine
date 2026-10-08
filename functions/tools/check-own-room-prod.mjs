import {getGameSession} from '../src/sessions.mjs';
import {getPlayerLocation} from '../src/player.mjs';

const sessionId='9e1f4a9b-53f8-4f38-9289-4ffa6dc5e227';
const session=await getGameSession(sessionId);

const clara=(session.participants??[]).find(p=>
  p.active!==false &&
  p.characterExternalId==='CHAR_CLARA' &&
  p.playerAccessEnabled &&
  p.playerAccessToken
);

if(!clara) throw new Error('CLARA_TEST_PLAYER_NOT_FOUND');

const view=await getPlayerLocation(clara.playerAccessToken,'LOC_ROOM_C15');

console.log(JSON.stringify({
  character:'CHAR_CLARA',
  location:view.location?.name,
  forbidden:view.forbidden,
  actionCount:view.actions?.length??0,
  empty:view.empty,
  sessionStatus:view.session?.status,
},null,2));
