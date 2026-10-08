import {initializeApp,getApps} from 'firebase-admin/app';
import {getDataConnect} from 'firebase-admin/data-connect';

if(!getApps().length)initializeApp();
const dc=getDataConnect({location:'europe-west1',serviceId:'murder-engine'});
const sessionId='f3a79e59edff460caa357d3ba202c7f8';

const q=`
query RumorRuntimeAudit($sessionId: UUID!) {
  sessionClueDiscoveries(
    where:{gameSessionId:{eq:$sessionId}}
    orderBy:{discoveredAt:ASC}
    limit:2000
  ){
    characterExternalId clueExternalId sourceInteractionExternalId sourceRef discoveredAt
  }
}
`;

const response=await dc.executeGraphqlRead(q,{variables:{sessionId}});
const data=response?.data??response;
const all=data.sessionClueDiscoveries??[];
const rumors=all.filter(x=>String(x.clueExternalId).startsWith('RUMOR_SHW_TARGET_'));

const counts={};
for(const row of rumors)
  counts[row.characterExternalId]=(counts[row.characterExternalId]??0)+1;

console.log(JSON.stringify({
  allDiscoveryCount:all.length,
  rumorDiscoveryCount:rumors.length,
  rumorDiscoveryByCharacter:counts,
  rumorRows:rumors,
},null,2));
