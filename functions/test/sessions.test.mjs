import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shapeSessionSummary,
  shapeSessionDetail,
  createGameSession,
  addGameSessionParticipant,
  assignCharacterToParticipant,
  setGameSessionStatus,
  updateGameSessionDetails,
  setGameSessionArchived,
  deleteGameSession,
  __sessionOps,
} from '../src/sessions.mjs';

test('session summary counts active participants and assignments', () => {
  const shaped = shapeSessionSummary({
    id:'S1', status:'DRAFT', sessionParticipants_on_gameSession:[
      {id:'P1',active:true,characterExternalId:'CHAR_A'},
      {id:'P2',active:true,characterExternalId:null},
      {id:'P3',active:false,characterExternalId:'CHAR_B'},
    ],
  });
  assert.deepEqual(shaped.counts,{participants:2,assigned:1});
});

test('session detail exposes playable cast and remaining slots', () => {
  const detail = shapeSessionDetail({
    id:'S1', status:'CASTING',
    scenarioVersion:{ characters_on_scenarioVersion:[
      {externalId:'CHAR_A',playable:true,active:true},
      {externalId:'CHAR_B',playable:true,active:true},
      {externalId:'NPC_X',playable:false,active:true},
    ]},
    sessionParticipants_on_gameSession:[
      {id:'P1',displayName:'Alice',active:true,characterExternalId:'CHAR_A'},
      {id:'P2',displayName:'Bob',active:true,characterExternalId:null},
    ],
  });
  assert.equal(detail.characters.length,2);
  assert.equal(detail.counts.unassignedParticipants,1);
  assert.equal(detail.counts.unassignedCharacters,1);
});

test('create session resolves organization from scenario version and inserts DRAFT', async () => {
  let write;
  const out = await createGameSession({versionId:'V1',name:'Première'}, {
    reader: async () => ({ scenarioVersion:{id:'V1',versionLabel:'2.3',language:'FR',scenario:{title:'Cosa',organization:{id:'ORG'}}} }),
    executor: async (op,vars) => { write={op,vars}; return {data:{}}; },
  });
  assert.equal(out.status,'DRAFT');
  assert.equal(write.vars.data.organizationId,'ORG');
  assert.equal(write.vars.data.scenarioVersionId,'V1');
  assert.equal(write.vars.data.status,'DRAFT');
});

test('participant defaults to active involvement and no casting', async () => {
  let write;
  await addGameSessionParticipant('S1',{displayName:'Gaël',email:'gael@example.com',ageBracket:'26_40'}, {reader:async()=>({gameSession:{id:'S1',runtimeInitializedAt:null,scenarioVersion:{characters_on_scenarioVersion:[]},sessionParticipants_on_gameSession:[]}}),executor: async (op,vars)=>{write={op,vars};return {data:{}};}});
  assert.equal(write.vars.data.desiredInvolvement,'ACTIF');
  assert.equal(write.vars.data.characterExternalId,null);
  assert.equal(write.vars.data.active,true);
});

test('casting can move an already assigned character to another participant', async () => {
  let write;
  const out=await assignCharacterToParticipant('S1','P2','CHAR_A',{
    reader: async () => ({ gameSession:{
      id:'S1',
      scenarioVersion:{characters_on_scenarioVersion:[
        {externalId:'CHAR_A',playable:true,active:true},
        {externalId:'CHAR_B',playable:true,active:true},
      ]},
      sessionParticipants_on_gameSession:[
        {id:'P1',displayName:'A',active:true,characterExternalId:'CHAR_A'},
        {id:'P2',displayName:'B',active:true,characterExternalId:null},
      ],
    }}),
    executor: async(op,vars)=>{write={op,vars};return {};},
  });
  assert.equal(out.reassigned,true);
  assert.equal(out.characterExternalId,'CHAR_A');
  assert.equal(out.previousHolderParticipantId,'P1');
  assert.equal(out.previousHolderCharacterExternalId,null);
  assert.match(write.op,/ReassignSessionCharacter/);
  assert.equal(write.vars.conflictParticipantId,'P1');
  assert.equal(write.vars.replacementCharacterExternalId,null);
});

test('casting swaps roles when both participants already have a character', async () => {
  let write;
  const out=await assignCharacterToParticipant('S1','P2','CHAR_A',{
    reader: async () => ({ gameSession:{
      id:'S1',
      scenarioVersion:{characters_on_scenarioVersion:[
        {externalId:'CHAR_A',playable:true,active:true},
        {externalId:'CHAR_B',playable:true,active:true},
      ]},
      sessionParticipants_on_gameSession:[
        {id:'P1',displayName:'A',active:true,characterExternalId:'CHAR_A'},
        {id:'P2',displayName:'B',active:true,characterExternalId:'CHAR_B'},
      ],
    }}),
    executor: async(op,vars)=>{write={op,vars};return {};},
  });
  assert.equal(out.reassigned,true);
  assert.equal(out.previousHolderParticipantId,'P1');
  assert.equal(out.previousHolderCharacterExternalId,'CHAR_B');
  assert.equal(write.vars.replacementCharacterExternalId,'CHAR_B');
  assert.equal(write.vars.replacementCastingLocked,true);
});

test('manual participant creation is locked after runtime initialization', async () => {
  await assert.rejects(
    addGameSessionParticipant('S1',{displayName:'Late',email:'late@example.com',ageBracket:'26_40'}, {
      reader:async()=>({gameSession:{id:'S1',runtimeInitializedAt:'2026-09-21T10:00:00Z',scenarioVersion:{characters_on_scenarioVersion:[]},sessionParticipants_on_gameSession:[]}}),
      executor:async()=>({}),
    }),
    /RUNTIME_ALREADY_INITIALIZED/
  );
});

test('casting is locked after runtime initialization', async () => {
  await assert.rejects(() => assignCharacterToParticipant('S1','P1','CHAR_A',{
    reader: async () => ({ gameSession:{
      id:'S1',runtimeInitializedAt:'2026-09-21T10:00:00Z',
      scenarioVersion:{characters_on_scenarioVersion:[{externalId:'CHAR_A',playable:true,active:true}]},
      sessionParticipants_on_gameSession:[{id:'P1',displayName:'A',active:true,characterExternalId:'CHAR_A'}],
    }}),
    executor: async()=>({}),
  }), /RUNTIME_ALREADY_INITIALIZED/);
});

test('runtime initialization keeps READY as the only pre-live status', async () => {
  await assert.rejects(() => setGameSessionStatus('S1','CASTING',{
    reader: async()=>({gameSession:{id:'S1',status:'READY',runtimeInitializedAt:'2026-09-21T10:00:00Z',scenarioVersion:{characters_on_scenarioVersion:[]},sessionParticipants_on_gameSession:[]}}),
    executor: async()=>({}),
  }), /RUNTIME_ALREADY_INITIALIZED/);
});

test('pre-live status only accepts DRAFT CASTING READY', async () => {
  let called=0;
  await setGameSessionStatus('S1','READY',{reader:async()=>({gameSession:{id:'S1',status:'CASTING',runtimeInitializedAt:null,scenarioVersion:{characters_on_scenarioVersion:[]},sessionParticipants_on_gameSession:[]}}),executor:async()=>{called+=1;return {};}});
  assert.equal(called,1);
  await assert.rejects(()=>setGameSessionStatus('S1','LIVE',{reader:async()=>({gameSession:{id:'S1'}}),executor:async()=>({})}),/INVALID_PRELIVE_STATUS/);
});

test('session operations use insert/update, never upsert', () => {
  for (const operation of Object.values(__sessionOps)) assert.doesNotMatch(operation,/_upsert/);
  assert.match(__sessionOps.ASSIGN_CHARACTER_MUTATION,/sessionParticipant_update/);
});

import {
  configureGameSessionPrecast,
  getPublicPrecastSession,
  submitPublicPrecast,
  shapePublicPrecastSession,
} from '../src/sessions.mjs';

test('precast configuration generates a stable long token and can be disabled', async () => {
  let writes=[];
  const reader=async()=>({ gameSession:{
    id:'S1',status:'CASTING',precastEnabled:false,precastToken:null,precastOpenCount:0,precastSubmissionCount:0,
    scenarioVersion:{characters_on_scenarioVersion:[]},sessionParticipants_on_gameSession:[]
  }});
  const executor=async(op,vars)=>{writes.push({op,vars});return {};};
  const enabled=await configureGameSessionPrecast('S1',true,{reader,executor});
  assert.equal(enabled.enabled,true);
  assert.match(enabled.token,/^[A-Za-z0-9_-]{24,120}$/);
  assert.equal(writes[0].vars.enabled,true);
});

test('public precast shape exposes only public session information', () => {
  const shaped=shapePublicPrecastSession({
    id:'S1',name:'Soirée test',scheduledAt:'2026-10-01T18:00:00Z',venue:'Western City',language:'FR',status:'CASTING',
    precastToken:'SECRET',notes:'MJ only',scenarioVersion:{versionLabel:'2.3',playerSummary:'Bienvenue',scenario:{title:'Cosa Nostra'}}
  });
  assert.equal(shaped.scenario.title,'Cosa Nostra');
  assert.equal(shaped.name,'Soirée test');
  assert.equal('precastToken' in shaped,false);
  assert.equal('notes' in shaped,false);
});

test('opening a public precast link increments open tracking', async () => {
  let write;
  const session={id:'S1',name:'Test',status:'CASTING',precastEnabled:true,precastOpenCount:4,scenarioVersion:{scenario:{title:'Cosa'}},sessionParticipants_on_gameSession:[]};
  const out=await getPublicPrecastSession('abcdefghijklmnopqrstuvwx',{reader:async()=>({gameSessions:[session]}),executor:async(op,vars)=>{write={op,vars};return {};}});
  assert.equal(out.scenario.title,'Cosa');
  assert.equal(write.vars.count,5);
});

test('public precast creates a participant when email is new', async () => {
  const writes=[];
  const session={id:'S1',status:'CASTING',precastEnabled:true,precastSubmissionCount:1,sessionParticipants_on_gameSession:[],scenarioVersion:{scenario:{title:'Cosa'}}};
  const result=await submitPublicPrecast('abcdefghijklmnopqrstuvwx',{displayName:'Alice',email:'Alice@example.com',desiredInvolvement:'ACTIF',ageBracket:'26_40',genderPreference:'SANS_PREFERENCE'}, {
    reader:async()=>({gameSessions:[session]}),executor:async(op,vars)=>{writes.push({op,vars});return {};}
  });
  assert.equal(result.updated,false);
  assert.equal(writes[0].vars.data.source,'PRECAST');
  assert.equal(writes[0].vars.data.email,'alice@example.com');
  assert.equal(writes[1].vars.count,2);
});

test('public precast updates an existing participant matched by email', async () => {
  const writes=[];
  const session={id:'S1',status:'CASTING',precastEnabled:true,precastSubmissionCount:0,sessionParticipants_on_gameSession:[{id:'P1',email:'alice@example.com',active:true}],scenarioVersion:{scenario:{title:'Cosa'}}};
  const result=await submitPublicPrecast('abcdefghijklmnopqrstuvwx',{displayName:'Alice B',email:'ALICE@example.com',desiredInvolvement:'PREMIER_ROLE',ageBracket:'26_40'}, {
    reader:async()=>({gameSessions:[session]}),executor:async(op,vars)=>{writes.push({op,vars});return {};}
  });
  assert.equal(result.updated,true);
  assert.equal(result.participantId,'P1');
  assert.equal(writes[0].vars.participantId,'P1');
});

test('public precast is closed once session is READY', async () => {
  const session={id:'S1',status:'READY',precastEnabled:true,sessionParticipants_on_gameSession:[],scenarioVersion:{scenario:{title:'Cosa'}}};
  await assert.rejects(()=>getPublicPrecastSession('abcdefghijklmnopqrstuvwx',{reader:async()=>({gameSessions:[session]}),executor:async()=>({})}),/PRECAST_CLOSED/);
});


test('public precast rejects a missing age bracket', async () => {
  const session={id:'S1',status:'CASTING',precastEnabled:true,precastSubmissionCount:0,sessionParticipants_on_gameSession:[],scenarioVersion:{scenario:{title:'Cosa'}}};
  await assert.rejects(
    submitPublicPrecast('abcdefghijklmnopqrstuvwx',{displayName:'Alice',email:'alice@example.com',desiredInvolvement:'ACTIF',genderPreference:'SANS_PREFERENCE'}, {
      reader:async()=>({gameSessions:[session]}),executor:async()=>({})
    }),
    /AGE_BRACKET_REQUIRED/
  );
});

test('manual participant creation rejects a missing age bracket', async () => {
  await assert.rejects(
    addGameSessionParticipant('S1',{displayName:'Bob',email:'bob@example.com',desiredInvolvement:'ACTIF'}, {reader:async()=>({gameSession:{id:'S1',runtimeInitializedAt:null,scenarioVersion:{characters_on_scenarioVersion:[]},sessionParticipants_on_gameSession:[]}}),executor:async()=>({})}),
    /AGE_BRACKET_REQUIRED/
  );
});


test('public precast rejects a missing email', async () => {
  const session={id:'S1',status:'CASTING',precastEnabled:true,precastSubmissionCount:0,sessionParticipants_on_gameSession:[],scenarioVersion:{scenario:{title:'Cosa'}}};
  await assert.rejects(
    submitPublicPrecast('abcdefghijklmnopqrstuvwx',{displayName:'Alice',desiredInvolvement:'ACTIF',ageBracket:'26_40',genderPreference:'SANS_PREFERENCE'}, {
      reader:async()=>({gameSessions:[session]}),executor:async()=>({})
    }),
    /EMAIL_REQUIRED/
  );
});

test('manual participant creation rejects a missing email', async () => {
  await assert.rejects(
    addGameSessionParticipant('S1',{displayName:'Bob',ageBracket:'26_40',desiredInvolvement:'ACTIF'}, {reader:async()=>({gameSession:{id:'S1',runtimeInitializedAt:null,scenarioVersion:{characters_on_scenarioVersion:[]},sessionParticipants_on_gameSession:[]}}),executor:async()=>({})}),
    /EMAIL_REQUIRED/
  );
});


test('archiving a session sets ARCHIVED and closes precast', async () => {
  let write;
  const result = await setGameSessionArchived('S1', true, {
    reader: async () => ({ gameSession:{ id:'S1', status:'CASTING', runtimeInitializedAt:null, scenarioVersion:{characters_on_scenarioVersion:[]}, sessionParticipants_on_gameSession:[] } }),
    executor: async (op,vars) => { write={op,vars}; return {}; },
  });
  assert.equal(result.status,'ARCHIVED');
  assert.equal(write.vars.status,'ARCHIVED');
  assert.equal(write.vars.precastEnabled,false);
});

test('restoring an archived session returns it to DRAFT', async () => {
  let write;
  const result = await setGameSessionArchived('S1', false, {
    reader: async () => ({ gameSession:{ id:'S1', status:'ARCHIVED', runtimeInitializedAt:null, scenarioVersion:{characters_on_scenarioVersion:[]}, sessionParticipants_on_gameSession:[] } }),
    executor: async (op,vars) => { write={op,vars}; return {}; },
  });
  assert.equal(result.status,'DRAFT');
  assert.equal(write.vars.status,'DRAFT');
});

test('delete session is allowed before runtime and uses delete mutation', async () => {
  let write;
  const result = await deleteGameSession('S1', {
    reader: async () => ({ gameSession:{ id:'S1', status:'DRAFT', runtimeInitializedAt:null, startedAt:null, finishedAt:null, scenarioVersion:{characters_on_scenarioVersion:[]}, sessionParticipants_on_gameSession:[] } }),
    executor: async (op,vars) => { write={op,vars}; return {}; },
  });
  assert.equal(result.deleted,true);
  assert.equal(write.vars.sessionId,'S1');
  assert.match(write.op,/gameSession_delete/);
});

test('delete session is blocked once runtime exists', async () => {
  await assert.rejects(() => deleteGameSession('S1', {
    reader: async () => ({ gameSession:{ id:'S1', status:'READY', runtimeInitializedAt:'2026-09-21T10:00:00Z', scenarioVersion:{characters_on_scenarioVersion:[]}, sessionParticipants_on_gameSession:[] } }),
    executor: async () => ({}),
  }), /SESSION_DELETE_LOCKED_AFTER_RUNTIME/);
});

test('archived sessions cannot be modified through casting flow', async () => {
  await assert.rejects(() => addGameSessionParticipant('S1',{displayName:'Late',email:'late@example.com',ageBracket:'26_40'}, {
    reader:async()=>({gameSession:{id:'S1',status:'ARCHIVED',runtimeInitializedAt:null,scenarioVersion:{characters_on_scenarioVersion:[]},sessionParticipants_on_gameSession:[]}}),
    executor:async()=>({}),
  }), /SESSION_ARCHIVED/);
});


test('session date time venue and name can be edited before live', async () => {
  let write;
  const result = await updateGameSessionDetails('S1', {
    name:'Cosa Nostra — 12 octobre',
    scheduledAt:'2026-10-12T17:30:00.000Z',
    venue:'Western City',
    language:'EN',
  }, {
    reader: async () => ({ gameSession:{ id:'S1', status:'CASTING', startedAt:null, pausedAt:null, finishedAt:null, scenarioVersion:{characters_on_scenarioVersion:[]}, sessionParticipants_on_gameSession:[] } }),
    executor: async (op,vars) => { write={op,vars}; return {}; },
  });
  assert.equal(result.name,'Cosa Nostra — 12 octobre');
  assert.equal(result.scheduledAt,'2026-10-12T17:30:00.000Z');
  assert.equal(write.vars.venue,'Western City');
  assert.equal(write.vars.language,'EN');
  assert.equal(result.language,'EN');
  assert.match(write.op,/gameSession_update/);
});

test('session language only accepts FR or EN', async () => {
  await assert.rejects(() => updateGameSessionDetails('S1', {
    name:'Test', scheduledAt:'2026-10-12T17:30:00Z', venue:'Liège', language:'DE'
  }, {
    reader: async () => ({ gameSession:{ id:'S1', language:'FR', status:'CASTING', startedAt:null, pausedAt:null, finishedAt:null, scenarioVersion:{characters_on_scenarioVersion:[]}, sessionParticipants_on_gameSession:[] } }),
    executor: async () => ({}),
  }), /INVALID_SESSION_LANGUAGE/);
});

test('session schedule editing is locked after live started', async () => {
  await assert.rejects(() => updateGameSessionDetails('S1', {
    name:'Nouvelle date', scheduledAt:'2026-10-13T17:30:00Z'
  }, {
    reader: async () => ({ gameSession:{ id:'S1', status:'LIVE', startedAt:'2026-10-12T17:30:00Z', scenarioVersion:{characters_on_scenarioVersion:[]}, sessionParticipants_on_gameSession:[] } }),
    executor: async () => ({}),
  }), /SESSION_SCHEDULE_LOCKED_AFTER_START/);
});

import {
  buildCastingProposal,
  buildSessionPreparation,
  applySessionCastingAssignments,
} from '../src/sessions.mjs';

function assistantSession() {
  return {
    id:'S16', status:'CASTING', runtimeInitializedAt:null,
    scenarioVersion:{id:'V16',versionLabel:'1.0',variantName:'4 joueurs',minPlayers:4,maxPlayers:4},
    participants:[
      {id:'P1',displayName:'Alice',email:'alice@example.com',ageBracket:'26_40',desiredInvolvement:'PREMIER_ROLE',genderPreference:'FEMININ',active:true,characterExternalId:null},
      {id:'P2',displayName:'Bob',email:'bob@example.com',ageBracket:'26_40',desiredInvolvement:'TRANQUILLE',genderPreference:'MASCULIN',active:true,characterExternalId:null},
      {id:'P3',displayName:'Camille',email:'cam@example.com',ageBracket:'26_40',desiredInvolvement:'ACTIF',genderPreference:'SANS_PREFERENCE',active:true,characterExternalId:'C3'},
      {id:'P4',displayName:'Dana',email:'dana@example.com',ageBracket:'26_40',desiredInvolvement:'TRES_IMPLIQUE',genderPreference:'FEMININ',active:true,characterExternalId:null},
    ],
    characters:[
      {externalId:'C1',name:'Reine',gender:'F',importance:'MAIN',intensity:'HIGH',playable:true,active:true},
      {externalId:'C2',name:'Garde',gender:'M',importance:'MINOR',intensity:'LOW',playable:true,active:true},
      {externalId:'C3',name:'Messager',gender:'ADAPTABLE',importance:'IMPORTANT',intensity:'STANDARD',playable:true,active:true},
      {externalId:'C4',name:'Duchesse',gender:'F',importance:'IMPORTANT',intensity:'HIGH',playable:true,active:true},
    ],
  };
}

test('V1.6 casting proposal respects existing assignments and participant preferences', () => {
  const proposal = buildCastingProposal(assistantSession());
  assert.equal(proposal.assignments.length,3);
  assert.equal(proposal.assignments.some(x=>x.characterExternalId==='C3'),false);
  const alice=proposal.assignments.find(x=>x.participantId==='P1');
  const bob=proposal.assignments.find(x=>x.participantId==='P2');
  assert.equal(alice.characterExternalId,'C1');
  assert.equal(bob.characterExternalId,'C2');
  assert.ok(alice.reasons.includes('préférence de personnage respectée'));
});

test('V1.6 preparation assistant detects a compatible but incomplete casting', () => {
  const prep=buildSessionPreparation(assistantSession());
  assert.equal(prep.countCompatible,true);
  assert.equal(prep.profilesComplete,true);
  assert.equal(prep.allAssigned,false);
  assert.equal(prep.canMarkReady,false);
  assert.equal(prep.progress,75);
});

test('V1.6 preparation assistant becomes ready when all participants are cast', () => {
  const session=assistantSession();
  session.participants[0].characterExternalId='C1';
  session.participants[1].characterExternalId='C2';
  session.participants[3].characterExternalId='C4';
  const prep=buildSessionPreparation(session);
  assert.equal(prep.allAssigned,true);
  assert.equal(prep.canMarkReady,true);
  assert.equal(prep.progress,100);
});

test('V1.6 bulk casting validates all assignments before writing', async () => {
  const raw=assistantSession();
  const dbSession={
    ...raw,
    sessionParticipants_on_gameSession:raw.participants,
    scenarioVersion:{...raw.scenarioVersion,characters_on_scenarioVersion:raw.characters},
  };
  const writes=[];
  const result=await applySessionCastingAssignments('S16',[
    {participantId:'P1',characterExternalId:'C1'},
    {participantId:'P2',characterExternalId:'C2'},
  ],{
    reader:async()=>({gameSession:dbSession}),
    executor:async(op,vars)=>{writes.push({op,vars});return {};},
  });
  assert.equal(result.applied,2);
  assert.equal(writes.length,2);
  assert.equal(writes[0].vars.castingLocked,true);
});
