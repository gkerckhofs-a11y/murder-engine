// Read-only production smoke check. Never log or persist the personal access link.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initializeApp} from 'firebase-admin/app';
import {getDataConnect} from 'firebase-admin/data-connect';
const projectId='murder-engine-ludificateur',origin=`https://${projectId}.web.app`;
assert.equal(process.env.FIREBASE_PROJECT_ID,projectId);
assert.ok(!process.env.DATA_CONNECT_EMULATOR_HOST);
initializeApp({projectId});
const dc=getDataConnect({location:'europe-west1',serviceId:'murder-engine'});
const sessionId=process.env.CASINO_VERIFY_SESSION_ID;
const query=`query VerifyCasinoRelease($s:UUID!){
 gameSession(id:$s){id status}
 sessionParticipants(where:{gameSessionId:{eq:$s},characterExternalId:{eq:"P04"},active:{eq:true},playerAccessEnabled:{eq:true}}){characterExternalId characterDisplayName playerAccessToken}
 sessionCasino(key:{gameSessionId:$s}){revision stateJson}
 sessionResources(where:{gameSessionId:{eq:$s}},limit:2000){characterExternalId resourceExternalId currentValue}
}`;
async function snapshot(){const r=await dc.executeGraphqlRead(query,{variables:{s:sessionId}});assert.ok(!r.errors?.length,'Verification query failed');return r.data;}
try{
 const before=await snapshot(),p=before.sessionParticipants[0];assert.ok(p?.playerAccessToken,'Verification player unavailable');
 for(const game of ['BLACKJACK','HOLDEM','ROULETTE']){
   const r=await fetch(origin+'/api/player/casino/table?'+new URLSearchParams({sessionId,game,token:p.playerAccessToken}));
   assert.ok(r.ok,`Read-only ${game} endpoint failed`);const d=await r.json();
   assert.ok(d.ok&&d.characterExternalId===p.characterExternalId&&d.characterName===p.characterDisplayName,`Identity check failed for ${game}`);
   assert.ok(Array.isArray(d.availableTables),`Casino access summary missing for ${game}`);
 }
 const after=await snapshot();
 assert.ok(JSON.stringify(before.sessionCasino)===JSON.stringify(after.sessionCasino),'Casino state changed during reads');
 const balances=d=>JSON.stringify(d.sessionResources.sort((a,b)=>(a.characterExternalId+a.resourceExternalId).localeCompare(b.characterExternalId+b.resourceExternalId)));
 assert.ok(balances(before)===balances(after),'Player balances changed during reads');
 const expected=await readFile(new URL('../../web/dist/index.html',import.meta.url),'utf8');
 const html=await (await fetch(origin+'/?release-check='+Date.now(),{headers:{'Cache-Control':'no-cache'}})).text();
 for(const asset of expected.match(/\/assets\/[^"\s]+\.(js|css)/g)??[])assert.ok(html.includes(asset),'Published interface does not match this build');
 console.log('PASS: deployed interface matches; all three casino reads recognize the player; table state and all balances unchanged.');
}catch(error){console.error('Casino release verification failed:',error.message);process.exitCode=1;}
