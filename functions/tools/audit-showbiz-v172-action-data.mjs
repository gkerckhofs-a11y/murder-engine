import {initializeApp,getApps} from 'firebase-admin/app';
import {getDataConnect} from 'firebase-admin/data-connect';

if(!getApps().length)initializeApp();
const dc=getDataConnect({location:'europe-west1',serviceId:'murder-engine'});
const versionId='939107cb50b25f1bbe03e1df7eff06e6';

const query=`
query AuditShowbizAbilities($versionId: UUID!) {
  clues(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:2000){
    externalId playerName clueType discoveryHook locationExternalId objectExternalId documentExternalId active
  }
  gameObjects(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:1000){
    externalId name ownerInitialType ownerInitialExternalId transferable stealable active
  }
  documentDefinitions(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:1000){
    externalId title ownerInitialType ownerInitialExternalId transferable stealable support active
  }
}
`;

const response=await dc.executeGraphqlRead(query,{variables:{versionId}});
const data=response?.data??response;
const clues=(data.clues??[]).filter(x=>x.active!==false);
const rumors=clues.filter(x=>String(x.clueType).toUpperCase()==='RUMOR');
const targeted=rumors.filter(x=>/^RUMOR_TARGET\s*:/i.test(String(x.discoveryHook??'')));
const objects=(data.gameObjects??[]).filter(x=>x.active!==false);
const docs=(data.documentDefinitions??[]).filter(x=>x.active!==false);

console.log(JSON.stringify({
  rumorCount:rumors.length,
  targetedRumorCount:targeted.length,
  rumors:rumors.map(x=>({
    id:x.externalId,
    name:x.playerName,
    discoveryHook:x.discoveryHook,
    location:x.locationExternalId,
  })),
  transferableStartingObjects:objects.filter(x=>
    x.transferable===true &&
    String(x.ownerInitialType??'').toUpperCase()==='CHARACTER' &&
    x.ownerInitialExternalId
  ),
  transferableStartingDocuments:docs.filter(x=>
    x.transferable===true &&
    String(x.ownerInitialType??'').toUpperCase()==='CHARACTER' &&
    x.ownerInitialExternalId
  ),
},null,2));
