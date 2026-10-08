import {initializeApp,getApps} from 'firebase-admin/app';
import {getDataConnect} from 'firebase-admin/data-connect';
import {__mediaLibraryOps} from '../src/media-library.mjs';

if(!getApps().length)initializeApp();
const dc=getDataConnect({location:'europe-west1',serviceId:'murder-engine'});

const response=await dc.executeGraphql(
  __mediaLibraryOps.DEACTIVATE_ASSET_MUTATION,
  {variables:{
    organizationId:'00000000-0000-0000-0000-000000000001',
    externalId:'__SCHEMA_CHECK_DO_NOT_EXIST__',
  }}
);

const errors=response?.errors??response?.data?.errors??[];
if(errors.length){
  console.error(JSON.stringify(errors,null,2));
  process.exit(2);
}

console.log(JSON.stringify({ok:true,result:response?.data??response},null,2));
