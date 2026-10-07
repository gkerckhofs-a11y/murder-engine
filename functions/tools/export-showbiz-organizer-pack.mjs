import { initializeApp, getApps } from 'firebase-admin/app';
import { getDataConnect } from 'firebase-admin/data-connect';
import { getScenarioVersionOverview, getCharacterDetail } from '../src/library.mjs';
import { getGameSession } from '../src/sessions.mjs';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

if(!getApps().length) initializeApp();

const VERSION_ID='a5329463ffc25cfaa88d91ef49465c53';
const SESSION_ID='9e60756629c5466bbd31bb8e07e99848';
const BASE='https://murder-engine-ludificateur.web.app';

const dc=getDataConnect({location:'europe-west1',serviceId:'murder-engine'});

async function read(operation,variables){
  const response=await dc.executeGraphqlRead(operation,{variables});
  const errors=response?.errors??response?.data?.errors??[];
  if(errors.length){
    console.error(JSON.stringify(errors,null,2));
    process.exit(2);
  }
  return response?.data??response;
}

const EXTRA_QUERY=`
query OrganizerPackData($versionId: UUID!) {
  characters(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:500) {
    externalId name publicRole dramaticFunction narrativeAge gender importance intensity
    biography secretIntro interpretationNotes appearanceNotes apparentMotive personalTimeline
    motto playable active
  }
  clues(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:2000) {
    externalId internalName playerName clueType playerText gmInterpretation discoveryHook
    plotExternalId locationExternalId objectExternalId documentExternalId support
    presentationMode shareable transferable consumable major logisticsCode mediaExternalId
    addToNotebook active
  }
  documentDefinitions(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:1000) {
    externalId title textContent support mediaExternalIds reusable consumable
    ownerInitialType ownerInitialExternalId clueExternalIds logisticsCode
    propRequirementExternalId transferable stealable active
  }
  gameObjects(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:1000) {
    externalId name description support ownerInitialType ownerInitialExternalId logisticsCode
    transferable stealable consumable critical mediaExternalId visualArchetypeCode active
  }
  gameLocations(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:500) {
    externalId name description qrCode permanent active
  }
  plots(where:{scenarioVersionId:{eq:$versionId}},orderBy:{externalId:ASC},limit:500) {
    externalId title plotType importance gmSummary active
  }
}
`;

const [overview,session,extra]=await Promise.all([
  getScenarioVersionOverview(VERSION_ID),
  getGameSession(SESSION_ID),
  read(EXTRA_QUERY,{versionId:VERSION_ID}),
]);

if(!overview) throw new Error('VERSION_NOT_FOUND');
if(!session) throw new Error('SESSION_NOT_FOUND');

const characterDetails={};
for(const c of (overview.characters??[]).filter(x=>x.active!==false&&x.playable!==false)){
  characterDetails[c.externalId]=await getCharacterDetail(VERSION_ID,c.externalId);
}

const playerAccess=(session.participants??[])
  .filter(p=>p.active!==false&&p.characterExternalId&&p.playerAccessEnabled&&p.playerAccessToken)
  .map(p=>({
    participantId:p.id,
    displayName:p.displayName,
    characterExternalId:p.characterExternalId,
    url:`${BASE}/?player=${encodeURIComponent(p.playerAccessToken)}`,
  }));

const output={
  exportedAt:new Date().toISOString(),
  baseUrl:BASE,
  version:overview,
  session:{
    id:session.id,
    name:session.name,
    language:session.language,
    status:session.status,
    counts:session.counts,
  },
  playerAccess,
  characterDetails,
  ...extra,
};

await writeFile('showbiz-organizer-pack-data.json',JSON.stringify(output,null,2),'utf8');

const assetsDir='showbiz-organizer-pack-assets';
await mkdir(assetsDir,{recursive:true});

const playable=(extra.characters??[])
  .filter(x=>x.active!==false&&x.playable!==false);

for(const character of playable){
  const override=overview.mediaOverrides?.['CHARACTER:'+character.externalId];
  if(!override?.source)continue;

  const ext=String(override.source)
    .split('?')[0]
    .match(/\.(png|jpe?g|webp|gif)$/i)?.[1]
    ?.toLowerCase() || 'png';

  const safeName=character.externalId.replace(/[^A-Za-z0-9_-]+/g,'_');
  const filePath=path.join(assetsDir,safeName+'.'+ext);

  const response=await fetch(override.source);
  if(!response.ok)
    throw new Error('IMAGE_DOWNLOAD_FAILED_'+character.externalId);

  await writeFile(
    filePath,
    Buffer.from(await response.arrayBuffer())
  );
}

console.log(JSON.stringify({
  versionId:overview.id,
  sessionId:session.id,
  characters:(extra.characters??[]).filter(x=>x.active!==false&&x.playable!==false).length,
  locations:(extra.gameLocations??[]).filter(x=>x.active!==false).length,
  clues:(extra.clues??[]).filter(x=>x.active!==false).length,
  playerAccess:playerAccess.length,
  mediaOverrides:Object.keys(overview.mediaOverrides??{}).length,
},null,2));
