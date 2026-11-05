import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PUBLIC_ENDPOINTS} from '../src/session-access.mjs';

const origin='https://murder-engine-ludificateur.web.app';
const revision=process.env.EXPECTED_REVISION;
assert.ok(revision,'EXPECTED_REVISION required');
const configuration=JSON.parse(readFileSync(new URL('../../firebase.json',import.meta.url),'utf8'));
const source=readFileSync(new URL('../src/index.mjs',import.meta.url),'utf8');
const names=new Set([...source.matchAll(/export const (\w+) = securedOnRequest\(/g)].map(match=>match[1]));
const routes=configuration.hosting.rewrites.filter(route=>route.function&&names.has(route.function.functionId)&&!PUBLIC_ENDPOINTS.has(route.function.functionId));
assert.ok(routes.length>40,'Private routes must all be verified');
async function request(path){return fetch(origin+path+(path.includes('?')?'&':'?')+'deployCheck='+encodeURIComponent(revision),{cache:'no-store',signal:AbortSignal.timeout(60000)});}
const marker=await request('/deployment-version.json');
assert.equal(marker.status,200);const version=await marker.json();
assert.equal(version.revision,revision);assert.equal(version.feature,'session-organizer-rehearsal');
const page=await request('/');assert.equal(page.status,200);assert.match(await page.text(),/Murder Engine/);
let cursor=0;
async function verifyRoutes(){
  while(cursor<routes.length){
    const route=routes[cursor++];const response=await request(route.source);
    assert.equal(response.status,401,`${route.source}: private access must require authentication`);
    const body=await response.json();assert.equal(body.error,'ORGANIZER_AUTH_REQUIRED',route.source);
    console.log(`Protected: ${route.source}`);
  }
}
await Promise.all(Array.from({length:6},verifyRoutes));
const player=await request('/api/player/portal?token=deployment-check-00000000000000000000000000000000');
assert.ok([400,404].includes(player.status),'Public player links must keep their token flow');
assert.notEqual((await player.json()).error,'ORGANIZER_AUTH_REQUIRED');
console.log(JSON.stringify({result:'PASS',revision,privateRoutes:routes.length,publicPlayerFlow:true}));
