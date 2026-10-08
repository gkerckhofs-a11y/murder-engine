import {initializeApp,getApps} from 'firebase-admin/app';
import {getDataConnect} from 'firebase-admin/data-connect';
import {__playerOps} from '../src/player.mjs';

if(!getApps().length)initializeApp();
const dc=getDataConnect({location:'europe-west1',serviceId:'murder-engine'});
const versionId='939107cb50b25f1bbe03e1df7eff06e6';

const response=await dc.executeGraphqlRead(
  __playerOps.PLAYER_SOURCE_QUERY,
  {variables:{versionId}}
);
const data=response?.data??response;
const clues=data.clues??[];

console.log(JSON.stringify({
  clueCount:clues.length,
  rumorCount:clues.filter(x=>String(x.clueType).toUpperCase()==='RUMOR').length,
  firstIds:clues.slice(0,5).map(x=>x.externalId),
  lastIds:clues.slice(-10).map(x=>x.externalId),
},null,2));
