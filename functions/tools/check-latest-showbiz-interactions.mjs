import {getInteractionDashboard} from '../src/interactions.mjs';
import {getGameSession} from '../src/sessions.mjs';

const sessionId='f3a79e59edff460caa357d3ba202c7f8';
const session=await getGameSession(sessionId);
const dashboard=await getInteractionDashboard(sessionId);

console.log(JSON.stringify({
  session:{
    id:session.id,
    name:session.name,
    status:session.status,
    runtimeInitializedAt:session.runtimeInitializedAt,
  },
  sourceReady:dashboard.sourceReady,
  actors:dashboard.actors.map(a=>({
    character:a.characterName,
    externalId:a.characterExternalId,
    abilities:a.abilities.map(x=>({
      id:x.externalId,
      name:x.name,
      cooldown:x.cooldownMinutes,
      maxUses:x.maxUses,
    })),
    interactions:a.interactions.map(i=>({
      id:i.externalId,
      name:i.name,
      ability:i.ability?.externalId??null,
      targetType:i.targetType,
      resolution:i.resolution,
      validation:i.validation,
      cost:i.costValue,
      costResource:i.costResourceExternalId,
      cooldown:i.cooldownMinutes,
      maxUses:i.maxUses,
    })),
  })),
},null,2));
