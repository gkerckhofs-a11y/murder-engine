import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLiveElapsedSeconds, shapeLiveDashboard, controlLiveSession, changeLiveResource, setLiveCharacterState, setLiveEventStatus, validateBusinessDeal, __liveOps } from '../src/live.mjs';

const session=(overrides={})=>({
  id:'S1',status:'READY',runtimeInitializedAt:'2026-09-21T10:00:00.000Z',runtimeVersion:'0.7',startedAt:null,pausedAt:null,finishedAt:null,
  liveClockStartedAt:null,liveElapsedSeconds:0,currentPhaseExternalId:null,
  scenarioVersion:{id:'V1',runtimeDataVersion:'0.7'},
  sessionParticipants_on_gameSession:[{id:'P1',displayName:'Alice',active:true,characterExternalId:'CHAR_A'}],
  ...overrides,
});
const source=()=>({
  gamePhaseDefinitions:[{externalId:'PHASE_1',name:'Enquête',orderIndex:1,active:true}],
  gameEventDefinitions:[{externalId:'EVENT_40',title:'Rapport',gmDescription:'Remettre',triggerType:'TIME_RELATIVE',delayMinutes:40,priority:'IMPORTANT',mandatory:true,active:true}],
  resources:[{externalId:'RES_PA',name:'Points d’action',unit:'PA',active:true}],
  gameStateDefinitions:[{externalId:'STATE_BLESSE',name:'Blessé',defaultDurationSeconds:600,active:true}],
  characters:[{externalId:'CHAR_A',name:'Alice Capello',publicRole:'Héritière',active:true}],
});
const runtime=()=>({
  sessionResources:[{characterExternalId:'CHAR_A',resourceExternalId:'RES_PA',initialValue:5,currentValue:5,maxValue:5}],
  sessionCharacterStates:[],sessionEvents:[],sessionActionLogs:[],
});

function readerFor(sess=session(),src=source(),rt=runtime()) { return async(op)=>{
  if(op===__liveOps.LIVE_SESSION_QUERY) return {gameSession:sess};
  if(op===__liveOps.LIVE_SOURCE_QUERY) return src;
  if(op===__liveOps.LIVE_RUNTIME_QUERY) return rt;
  assert.fail('unexpected read');
};}

test('live elapsed clock accumulates only while LIVE',()=>{
  const now=new Date('2026-09-21T10:10:00.000Z');
  assert.equal(computeLiveElapsedSeconds(session({status:'LIVE',liveClockStartedAt:'2026-09-21T10:05:00.000Z',liveElapsedSeconds:120}),now),420);
  assert.equal(computeLiveElapsedSeconds(session({status:'PAUSED',liveClockStartedAt:null,liveElapsedSeconds:420}),now),420);
});

test('live dashboard exposes Business Deals and only accepted deals await GM validation',()=>{
  const rt=runtime();
  rt.businessDealProposals=[
    {
      id:'D1',
      actionType:'BUSINESS_DEAL_PROPOSED',
      characterExternalId:'CHAR_A',
      refExternalId:'DEAL_1',
      afterValue:'CHAR_B',
      note:JSON.stringify({
        terms:'Finance 500 $ contre 10 % des bénéfices.',
        actorName:'Alice Capello',
        targetName:'Bob'
      }),
      createdAt:'2026-09-21T10:05:00Z'
    },
    {
      id:'D2',
      actionType:'BUSINESS_DEAL_PROPOSED',
      characterExternalId:'CHAR_A',
      refExternalId:'DEAL_2',
      afterValue:'CHAR_B',
      note:JSON.stringify({
        terms:'Prêt de 200 $.',
        actorName:'Alice Capello',
        targetName:'Bob'
      }),
      createdAt:'2026-09-21T10:06:00Z'
    }
  ];
  rt.businessDealAccepted=[
    {id:'A1',refExternalId:'DEAL_1'}
  ];
  rt.businessDealDeclined=[
    {id:'R1',refExternalId:'DEAL_2'}
  ];
  rt.businessDealOfficial=[];

  const out=shapeLiveDashboard(
    session({status:'LIVE'}),
    source(),
    rt,
    new Date('2026-09-21T10:10:00Z')
  );

  assert.equal(out.businessDeals.length,2);
  assert.equal(out.businessDeals.find(x=>x.dealId==='DEAL_1').status,'ACCEPTED');
  assert.equal(out.businessDeals.find(x=>x.dealId==='DEAL_2').status,'DECLINED');
});

test('GM can make an accepted Business Deal official',async()=>{
  const sess=session({status:'LIVE'});
  const rt=runtime();
  rt.businessDealProposals=[{
    id:'D1',
    actionType:'BUSINESS_DEAL_PROPOSED',
    characterExternalId:'CHAR_A',
    refExternalId:'DEAL_1',
    afterValue:'CHAR_B',
    note:JSON.stringify({
      terms:'Finance 500 $ contre 10 % des bénéfices.',
      actorName:'Alice Capello',
      targetName:'Bob'
    }),
    createdAt:'2026-09-21T10:05:00Z'
  }];
  rt.businessDealAccepted=[{id:'A1',refExternalId:'DEAL_1'}];
  rt.businessDealDeclined=[];
  rt.businessDealOfficial=[];

  let write=null;
  const out=await validateBusinessDeal(
    'S1',
    {dealId:'DEAL_1'},
    {
      reader:readerFor(sess,source(),rt),
      executor:async(op,vars)=>{write={op,vars};return{};},
      now:new Date('2026-09-21T10:10:00Z')
    }
  );

  assert.equal(out.status,'OFFICIAL');
  assert.equal(write.op,__liveOps.INSERT_ACTION_LOG_MUTATION);
  assert.equal(write.vars.data.actionType,'BUSINESS_DEAL_OFFICIAL');
  assert.equal(write.vars.data.refExternalId,'DEAL_1');
});

test('live dashboard flags overdue timed events and labels resources',()=>{
  const sess=session({status:'LIVE',startedAt:'2026-09-21T10:00:00.000Z',liveClockStartedAt:'2026-09-21T10:00:00.000Z'});
  const out=shapeLiveDashboard(sess,source(),runtime(),new Date('2026-09-21T10:45:00.000Z'));
  assert.equal(out.events[0].urgency,'OVERDUE');
  assert.equal(out.alerts.overdueEvents,1);
  assert.equal(out.characters[0].resources[0].name,"Points d’action");
});

test('START initializes live clock, first phase, session events and audit',async()=>{
  const writes=[];
  const result=await controlLiveSession('S1','START',{reader:readerFor(),executor:async(op,vars)=>{writes.push({op,vars});return {};},now:new Date('2026-09-21T19:00:00.000Z')});
  assert.equal(result.status,'LIVE');
  assert.equal(result.currentPhaseExternalId,'PHASE_1');
  assert.equal(writes[0].op,__liveOps.INSERT_SESSION_EVENT_MUTATION);
  assert.equal(writes.at(-2).op,__liveOps.UPDATE_LIVE_SESSION_MUTATION);
  assert.equal(writes.at(-1).op,__liveOps.INSERT_ACTION_LOG_MUTATION);
});

test('PAUSE stores accumulated elapsed time',async()=>{
  const sess=session({status:'LIVE',startedAt:'2026-09-21T19:00:00.000Z',liveClockStartedAt:'2026-09-21T19:10:00.000Z',liveElapsedSeconds:300});
  const writes=[];
  const out=await controlLiveSession('S1','PAUSE',{reader:readerFor(sess),executor:async(op,vars)=>{writes.push({op,vars});return {};},now:new Date('2026-09-21T19:15:00.000Z')});
  assert.equal(out.liveElapsedSeconds,600);
  assert.equal(out.status,'PAUSED');
});

test('live resource delta changes value and writes audit',async()=>{
  const sess=session({status:'LIVE',liveClockStartedAt:'2026-09-21T19:00:00.000Z'});
  const writes=[];
  const out=await changeLiveResource('S1',{characterExternalId:'CHAR_A',resourceExternalId:'RES_PA',mode:'DELTA',value:-1},{reader:readerFor(sess),executor:async(op,vars)=>{writes.push({op,vars});return {};}});
  assert.deepEqual({before:out.before,after:out.after},{before:5,after:4});
  assert.equal(writes[0].op,__liveOps.UPDATE_SESSION_RESOURCE_MUTATION);
  assert.equal(writes[1].op,__liveOps.INSERT_ACTION_LOG_MUTATION);
});

test('applying and removing a state uses insert then audit when absent',async()=>{
  const sess=session({status:'LIVE'}); const writes=[];
  const out=await setLiveCharacterState('S1',{characterExternalId:'CHAR_A',stateExternalId:'STATE_BLESSE',action:'APPLY'},{reader:readerFor(sess),executor:async(op,vars)=>{writes.push({op,vars});return {};},now:new Date('2026-09-21T19:00:00.000Z')});
  assert.equal(out.active,true); assert.equal(writes[0].op,__liveOps.INSERT_CHARACTER_STATE_MUTATION);
});

test('event status can be marked done',async()=>{
  const sess=session({status:'LIVE'}); const rt=runtime(); rt.sessionEvents=[{eventExternalId:'EVENT_40',status:'PENDING'}]; const writes=[];
  const out=await setLiveEventStatus('S1',{eventExternalId:'EVENT_40',status:'DONE'},{reader:readerFor(sess,source(),rt),executor:async(op,vars)=>{writes.push({op,vars});return {};},now:new Date('2026-09-21T19:40:00.000Z')});
  assert.equal(out.status,'DONE'); assert.equal(writes[0].op,__liveOps.UPDATE_SESSION_EVENT_MUTATION);
});
