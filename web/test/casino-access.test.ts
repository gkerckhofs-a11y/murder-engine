import test from 'node:test';
import assert from 'node:assert/strict';
import {casinoFromQr,casinoHref,locationFromQr,personalToken,initialCasinoReserve,rememberPlayerAccess,readCasinoAccess} from '../src/casino-access.ts';
const origin='https://murder-engine-ludificateur.web.app',session='11111111-1111-4111-8111-111111111111',token='a'.repeat(64);
test('casino and room QRs are distinguished; external links cannot receive a player token',()=>{
  const qr=origin+casinoHref('ROULETTE',session,'');
  assert.deepEqual(casinoFromQr(qr,origin),{game:'ROULETTE',sessionId:session});
  assert.equal(locationFromQr(qr,origin),null);
  assert.equal(locationFromQr(origin+'/scan/LOC_201',origin),'LOC_201');
  assert.equal(casinoFromQr(qr.replace(origin,'https://untrusted.example'),origin),null);
  assert.equal(casinoFromQr(qr.replace(session,'invalid'),origin),null);
  assert.equal(casinoFromQr(qr.replace('ROULETTE','INVALID'),origin),null);
  assert.equal(personalToken(origin+'/?player='+token,origin),token);
  assert.equal(personalToken('https://untrusted.example/?player='+token,origin),null);
});
test('validated session access wins over a stale global token, including compact session ids',()=>{
  const data=new Map<string,string>();
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>data.set(k,v)}});
  rememberPlayerAccess(session,token);
  rememberPlayerAccess('22222222-2222-4222-8222-222222222222','b'.repeat(64));
  assert.equal(readCasinoAccess(session.replaceAll('-','')),token);
  assert.equal(readCasinoAccess('22222222222242228222222222222222'),'b'.repeat(64));
  Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw Error('blocked');}});
  assert.equal(readCasinoAccess(session),'');assert.doesNotThrow(()=>rememberPlayerAccess(session,token));
  delete (globalThis as any).localStorage;
});
test('an affordable initial reserve does not block a player with less than 100 dollars',()=>{
  assert.equal(initialCasinoReserve(700,10),100);
  assert.equal(initialCasinoReserve(25,10),25);
  assert.equal(initialCasinoReserve(0,10),0);
  assert.equal(initialCasinoReserve(700,200),200);
});
