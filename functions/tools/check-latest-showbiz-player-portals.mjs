import {getGameSession} from '../src/sessions.mjs';
import {getPlayerPortal} from '../src/player.mjs';

const sessionId='f3a79e59edff460caa357d3ba202c7f8';
const session=await getGameSession(sessionId);

const rows=[];

for(const p of (session.participants??[]).filter(x=>
  x.active!==false &&
  x.characterExternalId &&
  x.playerAccessEnabled &&
  x.playerAccessToken
)){
  const portal=await getPlayerPortal(
    p.playerAccessToken,
    {trackOpen:false}
  );

  rows.push({
    characterExternalId:p.characterExternalId,
    characterName:p.characterDisplayName??p.characterExternalId,
    status:portal.session?.status??portal.status??null,
    resources:(portal.resources??[]).map(r=>({
      id:r.externalId??r.resourceExternalId,
      current:r.currentValue,
    })),
    discoverableAboutMe:(portal.discoverableAboutMe??[]).map(x=>({
      id:x.externalId,
      name:x.playerName,
      clueType:x.clueType,
    })),
    interactions:(portal.interactions??portal.play?.interactions??[]).map(i=>({
      id:i.externalId,
      name:i.name,
      ability:i.ability?.externalId??null,
      specialKind:i.specialKind??null,
      directEnabled:i.directEnabled,
      blockedReason:i.blockedReason??null,
      targetCount:i.targets?.length??0,
      targets:(i.targets??[]).slice(0,3).map(t=>t.label),
      cost:i.costValue??0,
      currentCostResourceValue:i.currentCostResourceValue??null,
    })),
  });
}

console.log(JSON.stringify({
  sessionStatus:session.status,
  rows,
},null,2));
