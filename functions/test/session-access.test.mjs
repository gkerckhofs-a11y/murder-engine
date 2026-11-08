import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {authorizeEndpoint,authorizeSession,configureSessionAccess,isAdministrator,PUBLIC_ENDPOINTS,CLIENT_SESSION_ENDPOINTS,canonicalSessionId} from '../src/session-access.mjs';
const id='11111111-1111-4111-8111-111111111111';
const child='22222222-2222-4222-8222-222222222222';
const other='33333333-3333-4333-8333-333333333333';
const identity={uid:'client',email:'client@example.com',email_verified:true};
const root=(extra={})=>({id,status:'READY',organizerEmail:identity.email,organizerAccessEnabled:true,selfServiceEnabled:true,realSessionStartedAt:null,rehearsalOfId:null,activeRehearsalId:null,...extra});
const readerFor=(rows)=>async(op,vars)=>({gameSession:rows.find(x=>x.id===vars.sessionId)??null});

test('verified client can access assigned session, never another session or an unverified account',async()=>{
  const reader=readerFor([root(),root({id:other,organizerEmail:'other@example.com'})]);
  assert.equal((await authorizeSession(identity,id,{reader})).root.id,id);
  await assert.rejects(()=>authorizeSession(identity,other,{reader}),/SESSION_ACCESS_DENIED/);
  await assert.rejects(()=>authorizeSession({...identity,email_verified:false},id,{reader}),/ORGANIZER_AUTH_REQUIRED/);
  await assert.rejects(()=>authorizeSession(identity,'not-a-uuid',{reader}),/SESSION_ID_REQUIRED/);
});
test('revocation and reassignment take effect at the next request',async()=>{
  for(const extra of [{organizerAccessEnabled:false},{organizerEmail:'new@example.com'},{selfServiceEnabled:false},{status:'ARCHIVED'}])
    await assert.rejects(()=>authorizeSession(identity,id,{reader:readerFor([root(extra)])}),/SESSION_ACCESS_DENIED/);
});
test('only the active rehearsal is delegated and access closes at real launch',async()=>{
  const run=root({id:child,rehearsalOfId:id});
  const reader=readerFor([root({activeRehearsalId:child}),run]);
  assert.equal((await authorizeSession(identity,child,{reader})).root.id,id);
  for(const parent of [root(),root({activeRehearsalId:other}),root({activeRehearsalId:child,realSessionStartedAt:'2026-11-05T12:00:00Z'})])
    await assert.rejects(()=>authorizeSession(identity,child,{reader:readerFor([parent,run])}),/SESSION_ACCESS_DENIED/);
});
test('clients cannot use global library, access delegation, purge, archive or create routes',async()=>{
  for(const name of ['listScenarios','listSessions','createSession','purgeSessionView','archiveSession','configureSessionAccessView','getScenarioVersion','futureUnclassifiedRoute'])
    await assert.rejects(()=>authorizeEndpoint(name,identity,{sessionId:id},{reader:readerFor([root()])}),/ADMINISTRATOR_REQUIRED/);
});
test('trial configuration locks after first trial; real launch cannot be bypassed by normal START',async()=>{
  const reader=readerFor([root()]);
  await assert.rejects(()=>authorizeEndpoint('controlLive',identity,{sessionId:id,action:'START'},{reader}),/USE_START_REAL_SESSION/);
  await assert.rejects(()=>authorizeEndpoint('updateSessionStatus',identity,{sessionId:id,status:'LIVE'},{reader}),/INVALID_PRELIVE_STATUS/);
  await assert.rejects(()=>authorizeEndpoint('castSessionParticipant',identity,{sessionId:id},{reader:readerFor([root({activeRehearsalId:child})])}),/SESSION_PREPARATION_LOCKED/);
  await authorizeEndpoint('controlLive',identity,{sessionId:id,action:'PAUSE'},{reader:readerFor([root({realSessionStartedAt:'now',status:'LIVE'})])});
});
test('access setup validates email and cannot sell an already played legacy session',async()=>{
  const writes=[];const executor=async(op,vars)=>writes.push(vars);
  await assert.rejects(()=>configureSessionAccess(id,{email:'bad',enabled:true},{reader:readerFor([root()]),executor}),/INVALID_ORGANIZER_EMAIL/);
  await assert.rejects(()=>configureSessionAccess(id,{email:identity.email,enabled:true},{reader:readerFor([root({selfServiceEnabled:false,startedAt:'now'})]),executor}),/SESSION_ALREADY_STARTED/);
  await configureSessionAccess(id,{email:'CLIENT@EXAMPLE.COM',enabled:true},{reader:readerFor([root()]),executor});
  assert.equal(writes[0].email,identity.email);
  assert.equal(isAdministrator(identity),false);
});
test('every HTTP endpoint is explicitly wrapped; public endpoints use only player/registration token flows',()=>{
  const source=fs.readFileSync(new URL('../src/index.mjs',import.meta.url),'utf8');
  const endpoints=[...source.matchAll(/export const (\w+) = securedOnRequest\('(\w+)'/g)];
  assert.ok(endpoints.length>60);
  for(const [,name,policy] of endpoints)assert.equal(name,policy);
  assert.doesNotMatch(source,/export const \w+ = onRequest\(/);
  for(const name of PUBLIC_ENDPOINTS){
    assert.ok(endpoints.some(x=>x[1]===name),name);
    assert.equal(CLIENT_SESSION_ENDPOINTS.has(name),false);
    assert.ok(/Public|Player|Precast/.test(name),name);
  }
});

test('SQL Connect UUID serialization is normalized for links and parent-child access checks',()=>{
  assert.equal(canonicalSessionId('11111111111141118111111111111111'),id);
});
