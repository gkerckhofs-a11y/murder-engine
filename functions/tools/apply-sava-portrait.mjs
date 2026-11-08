import fs from 'node:fs';import assert from 'node:assert/strict';import {initializeApp} from 'firebase-admin/app';import {getDataConnect} from 'firebase-admin/data-connect';import {uploadMediaLibraryAsset} from '../src/media-library.mjs';import {getPlayerPortal} from '../src/player.mjs';
assert.equal(process.env.GCLOUD_PROJECT,'murder-engine-ludificateur');initializeApp({projectId:process.env.GCLOUD_PROJECT});const dc=getDataConnect({location:'europe-west1',serviceId:'murder-engine'});const s='d1a40507811f4695a119e16ed74eb5cd';
const patch=JSON.parse(fs.readFileSync('fixtures/nid/relationship-completion.json'));
const known=['P03','P06','P11','P12','P13','P14'];
const d=(await dc.executeGraphqlRead('query($s:UUID!){gameSession(id:$s){scenarioVersion{id sourceScenarioId mediaOverridesJson}}sessionParticipants(where:{gameSessionId:{eq:$s}},limit:100){characterExternalId playerAccessToken active}}',{variables:{s}})).data;
const v=d.gameSession.scenarioVersion;assert.equal(v.sourceScenarioId,'NID_ESPIONS_1958_16');const old=v.mediaOverridesJson;const map=JSON.parse(old||'{}');
const rows=patch.rows.filter(r=>r.entity==='SAVA'&&known.includes(r.owner));assert.equal(rows.length,6);
if(!process.argv.includes('--verify')){
 let asset=map['CONTACT:'+rows[0].fact.externalId];
 if(!asset)asset=await uploadMediaLibraryAsset(v.id,{raw:fs.readFileSync('fixtures/nid/sava-portrait.webp'),filename:'Sava_Tesla_Transparent.webp',contentType:'image/webp',category:'CHARACTER',label:'Sava Tesla — portrait détouré',altText:'Sava Tesla',tags:'Nid espion Sava Tesla transparent PNJ'});
 for(const row of rows)map['CONTACT:'+row.fact.externalId]={...asset,assetExternalId:asset.assetExternalId||asset.externalId};
 const r=await dc.executeGraphql('mutation($v:UUID!,$old:String!,$next:String!) @transaction{lock:scenarioVersion_update(id:$v,data:{versionLabel:"1.3-master-20261107-r2"}) guard:query @check(expr:"response.guard.scenarioVersion.mediaOverridesJson == vars.old",message:"MEDIA_CHANGED") @redact{scenarioVersion(id:$v){mediaOverridesJson}} scenarioVersion_update(id:$v,data:{mediaOverridesJson:$next})}',{variables:{v:v.id,old,next:JSON.stringify(map)}});assert.ok(!r.errors,JSON.stringify(r.errors));
}
let checked=0;for(const p of d.sessionParticipants.filter(p=>p.active!==false)){
 let portal;if(process.argv.includes('--verify')){const r=await fetch('https://murder-engine-ludificateur.web.app/api/player/portal?refresh=1&token='+encodeURIComponent(p.playerAccessToken));assert.ok(r.ok);portal=(await r.json()).portal;}else portal=await getPlayerPortal(p.playerAccessToken,{trackOpen:false});
 const relation=portal.relationships.find(r=>r.otherName==='Sava Tesla'||r.otherName==='Sava');assert.ok(relation);assert.equal(!!relation.portrait,known.includes(p.characterExternalId));assert.equal(relation.otherExternalId,null);checked++;
}assert.equal(checked,16);console.log(JSON.stringify({verified:checked,portraitsAssigned:known,otherMediaPreserved:true}));
