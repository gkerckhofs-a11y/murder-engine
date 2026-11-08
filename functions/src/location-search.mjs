import {randomUUID} from 'node:crypto';
import {SESSION_LOCK} from './vote-storage.mjs';

export const SEARCH_COMMAND_QUERY=`query LocationSearchCommand($sessionId:UUID!,$requestId:String!){
  sessionLocationSearchCommand(key:{gameSessionId:$sessionId,requestId:$requestId}){participantId characterExternalId locationExternalId resultJson}
}`;

export function searchRequestId(value){
  if(value==null)return randomUUID();
  if(typeof value!=='string'||!/^[-A-Za-z0-9_]{16,100}$/.test(value))throw Error('INVALID_SEARCH_REQUEST_ID');
  return value;
}
export async function readSearchReplay(reader,loaded,requestId,locationExternalId){
  const row=(await reader(SEARCH_COMMAND_QUERY,{sessionId:loaded.session.id,requestId}))?.sessionLocationSearchCommand;
  if(!row)return null;
  if(row.participantId!==loaded.participant.id||row.characterExternalId!==loaded.participant.characterExternalId||row.locationExternalId!==locationExternalId)throw Error('SEARCH_REQUEST_MISMATCH');
  return JSON.parse(row.resultJson);
}
export function searchFailure(error){
  const text=String(error?.message??'')+' '+JSON.stringify(error?.details??[]);
  return ['SEARCH_REWARD_CHANGED','SEARCH_BALANCE_CHANGED','SEARCH_COOLDOWN','SEARCH_ACCESS_CHANGED','SEARCH_SESSION_NOT_LIVE'].find(code=>text.includes(code))??null;
}

// All guards, debit, discovery, ownership, knowledge and replay receipt commit together.
export function buildLocationSearchTransaction(loaded,{requestId,locationExternalId,response,notification,now,searchIds}){
  const {participant,session,source,runtime}=loaded,actor=participant.characterExternalId;
  const pa=runtime.sessionResources.find(r=>r.characterExternalId===actor&&r.resourceExternalId==='RES_PA');
  if(!pa||Number(pa.currentValue)<1)throw Error('INTERACTION_INSUFFICIENT_RESOURCE');
  const reward=response.reward,clue=reward.clue,object=reward.object;
  if(!clue&&!object)throw Error('LOCATION_EMPTY');
  const createdAt=new Date(now).toISOString();
  const variables={sessionId:session.id,participantId:participant.id,token:participant.playerAccessToken,actor,locationExternalId,expectedValue:Number(pa.currentValue),updatedAt:createdAt,cutoff:new Date(new Date(now).getTime()-600000).toISOString(),searchIds,requestId,
    command:{gameSessionId:session.id,requestId,participantId:participant.id,characterExternalId:actor,locationExternalId,resultJson:JSON.stringify(response),createdAt},notification,
    use:{gameSessionId:session.id,interactionExternalId:'SYSTEM_LOCATION_SEARCH',actorCharacterExternalId:actor,targetType:'LOCATION',targetExternalId:locationExternalId,resolution:'AUTO',success:true,abilityLevel:0,costResourceExternalId:'RES_PA',costValue:1,createdAt},
    log:{gameSessionId:session.id,actionType:'INTERACTION_EXECUTE',characterExternalId:actor,refExternalId:'SYSTEM_LOCATION_SEARCH',afterValue:'SUCCESS',deltaValue:-1,note:`Fouille QR → ${locationExternalId}`,createdAt}};
  const declarations=['$sessionId:UUID!','$participantId:UUID!','$token:String!','$actor:String!','$locationExternalId:String!','$expectedValue:Int!','$updatedAt:Timestamp!','$cutoff:Timestamp!','$searchIds:[String!]!','$requestId:String!','$command:SessionLocationSearchCommand_Data!','$notification:SessionPlayerNotification_Data!','$use:SessionInteractionUse_Data!','$log:SessionActionLog_Data!'];
  let body=`${SESSION_LOCK}
    sessionGuard:query @check(expr:"response.sessionGuard.gameSession.status == 'LIVE'",message:"SEARCH_SESSION_NOT_LIVE") @redact {gameSession(id:$sessionId){status}}
    accessGuard:query @check(expr:"response.accessGuard.sessionParticipant != null && response.accessGuard.sessionParticipant.gameSessionId == vars.sessionId && response.accessGuard.sessionParticipant.active == true && response.accessGuard.sessionParticipant.playerAccessEnabled == true && response.accessGuard.sessionParticipant.playerAccessToken == vars.token && response.accessGuard.sessionParticipant.characterExternalId == vars.actor",message:"SEARCH_ACCESS_CHANGED") @redact {sessionParticipant(id:$participantId){gameSessionId active playerAccessEnabled playerAccessToken characterExternalId}}
    balanceGuard:query @check(expr:"response.balanceGuard.sessionResource != null && response.balanceGuard.sessionResource.currentValue == vars.expectedValue && vars.expectedValue > 0",message:"SEARCH_BALANCE_CHANGED") @redact {sessionResource(key:{gameSessionId:$sessionId,characterExternalId:$actor,resourceExternalId:"RES_PA"}){currentValue}}
    cooldownGuard:query @check(expr:"response.cooldownGuard.sessionInteractionUses.size() == 0",message:"SEARCH_COOLDOWN") @redact {sessionInteractionUses(where:{gameSessionId:{eq:$sessionId},actorCharacterExternalId:{eq:$actor},interactionExternalId:{in:$searchIds},createdAt:{gt:$cutoff}},limit:1){id}}
  `;
  if(clue){
    declarations.push('$clueId:String!','$discovery:SessionClueDiscovery_Data!');variables.clueId=clue.externalId;
    variables.discovery={gameSessionId:session.id,characterExternalId:actor,clueExternalId:clue.externalId,sourceInteractionExternalId:'SYSTEM_LOCATION_SEARCH',sourceRef:locationExternalId,discoveredAt:createdAt};
    body+=`clueGuard:query @check(expr:"response.clueGuard.sessionClueDiscoveries.size() == 0",message:"SEARCH_REWARD_CHANGED") @redact {sessionClueDiscoveries(where:{gameSessionId:{eq:$sessionId},clueExternalId:{eq:$clueId}${clue.mode==='PERSISTENT'?',characterExternalId:{eq:$actor}':''}},limit:1){clueExternalId}}\n`;
  }
  if(object){
    declarations.push('$objectId:String!');variables.objectId=object.externalId;
    body+=`objectGuard:query @check(expr:"response.objectGuard.sessionObject != null && response.objectGuard.sessionObject.inPlay == true && response.objectGuard.sessionObject.holderType == 'LOCATION' && response.objectGuard.sessionObject.holderExternalId == vars.locationExternalId",message:"SEARCH_REWARD_CHANGED") @redact {sessionObject(key:{gameSessionId:$sessionId,objectExternalId:$objectId}){inPlay holderType holderExternalId}}\n`;
  }
  body+=`receipt:sessionLocationSearchCommand_insert(data:$command)
    debit:sessionResource_update(key:{gameSessionId:$sessionId,characterExternalId:$actor,resourceExternalId:"RES_PA"},data:{currentValue_update:{dec:1},updatedAt:$updatedAt})
    sessionInteractionUse_insert(data:$use)
    sessionActionLog_insert(data:$log)
  `;
  if(clue){
    body+='sessionClueDiscovery_insert(data:$discovery)\n';
    const known=new Set((runtime.sessionKnowledges??[]).filter(k=>k.characterExternalId===actor).map(k=>k.factExternalId));
    const facts=[...new Set((source.clueFacts??[]).filter(k=>k.clueExternalId===clue.externalId&&!known.has(k.factExternalId)).map(k=>k.factExternalId))];
    facts.forEach((factExternalId,i)=>{declarations.push(`$knowledge${i}:SessionKnowledge_Data!`);variables['knowledge'+i]={gameSessionId:session.id,characterExternalId:actor,factExternalId,sourceType:'CLUE',learnedAt:createdAt};body+=`knowledge${i}:sessionKnowledge_upsert(data:$knowledge${i})\n`;});
  }
  if(object)body+='sessionObject_update(key:{gameSessionId:$sessionId,objectExternalId:$objectId},data:{holderType:"CHARACTER",holderExternalId:$actor,updatedAt:$updatedAt})\n';
  body+='sessionPlayerNotification_insert(data:$notification)\n';
  // requestId is carried in the command row; it is not separately referenced by GraphQL.
  declarations.splice(declarations.indexOf('$requestId:String!'),1);delete variables.requestId;
  if(!object){declarations.splice(declarations.indexOf('$locationExternalId:String!'),1);delete variables.locationExternalId;}
  return{operation:`mutation AtomicLocationSearch(${declarations.join(',')}) @transaction {${body}}`,variables};
}
