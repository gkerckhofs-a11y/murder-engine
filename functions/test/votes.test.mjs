import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveElectorate, tallyVote, shapeVoteDashboard, openSessionVote, castSessionBallot, closeSessionVote } from '../src/votes.mjs';

const session=()=>({id:'S1',status:'LIVE',scenarioVersion:{id:'V1',runtimeDataVersion:'0.9'},sessionParticipants_on_gameSession:[
  {id:'P1',displayName:'A',active:true,characterExternalId:'CHAR_A'},
  {id:'P2',displayName:'B',active:true,characterExternalId:'CHAR_B'},
  {id:'P3',displayName:'C',active:true,characterExternalId:'CHAR_C'},
]});
const source=()=>({voteDefinitions:[{externalId:'VOTE_1',title:'Succession',question:'Qui ?',scopeType:'LIST',scopeRef:'CHAR_A;CHAR_B;CHAR_C',choicesMode:'OPTIONS',secret:true,votesPerElector:1,weighted:false,abstention:false,modifiable:false,closeMode:'GM',resultVisibility:'AFTER_CLOSE',tieRule:'SECOND_ROUND',active:true}],voteOptionDefinitions:[
  {externalId:'OPT_A',voteExternalId:'VOTE_1',orderIndex:1,label:'Alice',active:true},
  {externalId:'OPT_B',voteExternalId:'VOTE_1',orderIndex:2,label:'Bob',active:true},
  {externalId:'OPT_C',voteExternalId:'VOTE_1',orderIndex:3,label:'Clara',active:true},
],characters:[{externalId:'CHAR_A',name:'Alice'},{externalId:'CHAR_B',name:'Bob'},{externalId:'CHAR_C',name:'Clara'}]});
const runtime=()=>({sessionVotes:[],sessionBallots:[],sessionResources:[]});
function readerFor(s=session(),src=source(),rt=runtime()){let i=0;return async()=>{i++;return i%3===1?{gameSession:s}:i%3===2?src:rt;};}

test('LIST electorate keeps only cast and allowed characters',()=>{
  assert.deepEqual(resolveElectorate(source().voteDefinitions[0],session().sessionParticipants_on_gameSession),['CHAR_A','CHAR_B','CHAR_C']);
});

test('VOTE_WINNERS electorate resolves character winners from prior closed votes',()=>{
  const def={
    externalId:'VOTE_FINAL',
    scopeType:'VOTE_WINNERS',
    scopeRef:'VOTE_SEAT_A;VOTE_SEAT_B',
  };

  const src=source();
  src.voteOptionDefinitions.push(
    {externalId:'SEAT_A_OPT',voteExternalId:'VOTE_SEAT_A',orderIndex:1,label:'Alice',characterExternalId:'CHAR_A',active:true},
    {externalId:'SEAT_B_OPT',voteExternalId:'VOTE_SEAT_B',orderIndex:1,label:'Bob',characterExternalId:'CHAR_B',active:true},
  );

  const rt=runtime();
  rt.sessionVotes=[
    {voteExternalId:'VOTE_SEAT_A',round:1,status:'CLOSED',resultJson:JSON.stringify({winnerOptionExternalId:'SEAT_A_OPT'})},
    {voteExternalId:'VOTE_SEAT_B',round:2,status:'CLOSED',resultJson:JSON.stringify({winnerOptionExternalId:'SEAT_B_OPT'})},
  ];

  assert.deepEqual(
    resolveElectorate(def,session().sessionParticipants_on_gameSession,rt,src),
    ['CHAR_A','CHAR_B']
  );
});

test('VOTE_WINNERS remains locked until every referenced jury seat has a winner',()=>{
  const def={
    externalId:'VOTE_FINAL',
    scopeType:'VOTE_WINNERS',
    scopeRef:'VOTE_SEAT_A;VOTE_SEAT_B',
  };

  const src=source();
  src.voteOptionDefinitions.push(
    {externalId:'SEAT_A_OPT',voteExternalId:'VOTE_SEAT_A',orderIndex:1,label:'Alice',characterExternalId:'CHAR_A',active:true},
    {externalId:'SEAT_B_OPT',voteExternalId:'VOTE_SEAT_B',orderIndex:1,label:'Bob',characterExternalId:'CHAR_B',active:true},
  );

  const rt=runtime();
  rt.sessionVotes=[
    {voteExternalId:'VOTE_SEAT_A',round:1,status:'CLOSED',resultJson:JSON.stringify({winnerOptionExternalId:'SEAT_A_OPT'})},
  ];

  assert.deepEqual(
    resolveElectorate(def,session().sessionParticipants_on_gameSession,rt,src),
    []
  );

  rt.sessionVotes.push(
    {voteExternalId:'VOTE_SEAT_B',round:1,status:'CLOSED',resultJson:JSON.stringify({winnerOptionExternalId:null})},
  );

  assert.deepEqual(
    resolveElectorate(def,session().sessionParticipants_on_gameSession,rt,src),
    []
  );
});

test('tally detects absolute majority',()=>{
  const out=tallyVote({definition:source().voteDefinitions[0],options:source().voteOptionDefinitions,electorate:['CHAR_A','CHAR_B','CHAR_C'],ballots:[
    {electorCharacterExternalId:'CHAR_A',selectedOptionExternalIds:'OPT_A',weight:1},
    {electorCharacterExternalId:'CHAR_B',selectedOptionExternalIds:'OPT_A',weight:1},
    {electorCharacterExternalId:'CHAR_C',selectedOptionExternalIds:'OPT_B',weight:1},
  ]});
  assert.equal(out.majorityAbsolute,true); assert.equal(out.winnerOptionExternalId,'OPT_A'); assert.equal(out.suggestSecondRound,false);
});

test('a unique plurality leader wins without a second round',()=>{
  const electorate=['A','B','C','D'];
  const out=tallyVote({definition:source().voteDefinitions[0],options:source().voteOptionDefinitions,electorate,ballots:[
    {electorCharacterExternalId:'A',selectedOptionExternalIds:'OPT_A',weight:1},
    {electorCharacterExternalId:'B',selectedOptionExternalIds:'OPT_A',weight:1},
    {electorCharacterExternalId:'C',selectedOptionExternalIds:'OPT_B',weight:1},
    {electorCharacterExternalId:'D',selectedOptionExternalIds:'OPT_C',weight:1},
  ]});
  assert.equal(out.majorityAbsolute,false);
  assert.equal(out.tieForLead,false);
  assert.equal(out.suggestSecondRound,false);
  assert.equal(out.winnerOptionExternalId,'OPT_A');
  assert.deepEqual(out.secondRoundOptionExternalIds,[]);
});

test('only candidates tied for first place go to a second round',()=>{
  const electorate=['A','B','C','D','E'];
  const options=[
    {externalId:'OPT_A',orderIndex:1,label:'A'},
    {externalId:'OPT_B',orderIndex:2,label:'B'},
    {externalId:'OPT_C',orderIndex:3,label:'C'},
    {externalId:'OPT_D',orderIndex:4,label:'D'},
    {externalId:'OPT_E',orderIndex:5,label:'E'},
  ];
  const definition={tieRule:'SECOND_ROUND',votesPerElector:1};

  const tiedForLead=tallyVote({
    definition,options,electorate,
    ballots:[
      {electorCharacterExternalId:'A',selectedOptionExternalIds:'OPT_A',weight:1},
      {electorCharacterExternalId:'B',selectedOptionExternalIds:'OPT_A',weight:1},
      {electorCharacterExternalId:'C',selectedOptionExternalIds:'OPT_B',weight:1},
      {electorCharacterExternalId:'D',selectedOptionExternalIds:'OPT_B',weight:1},
      {electorCharacterExternalId:'E',selectedOptionExternalIds:'OPT_C',weight:1},
    ]
  });
  assert.equal(tiedForLead.tieForLead,true);
  assert.equal(tiedForLead.suggestSecondRound,true);
  assert.equal(tiedForLead.winnerOptionExternalId,null);
  assert.deepEqual(tiedForLead.secondRoundOptionExternalIds,['OPT_A','OPT_B']);

  const allTied=tallyVote({
    definition,options,electorate,
    ballots:[
      {electorCharacterExternalId:'A',selectedOptionExternalIds:'OPT_A',weight:1},
      {electorCharacterExternalId:'B',selectedOptionExternalIds:'OPT_B',weight:1},
      {electorCharacterExternalId:'C',selectedOptionExternalIds:'OPT_C',weight:1},
      {electorCharacterExternalId:'D',selectedOptionExternalIds:'OPT_D',weight:1},
      {electorCharacterExternalId:'E',selectedOptionExternalIds:'OPT_E',weight:1},
    ]
  });
  assert.equal(allTied.tieForLead,true);
  assert.deepEqual(allTied.secondRoundOptionExternalIds,['OPT_A','OPT_B','OPT_C','OPT_D','OPT_E']);

  const tiedForSecond=tallyVote({
    definition,options,electorate,
    ballots:[
      {electorCharacterExternalId:'A',selectedOptionExternalIds:'OPT_A',weight:1},
      {electorCharacterExternalId:'B',selectedOptionExternalIds:'OPT_A',weight:1},
      {electorCharacterExternalId:'C',selectedOptionExternalIds:'OPT_B',weight:1},
      {electorCharacterExternalId:'D',selectedOptionExternalIds:'OPT_C',weight:1},
      {electorCharacterExternalId:'E',selectedOptionExternalIds:'OPT_D',weight:1},
    ]
  });
  assert.equal(tiedForSecond.tieForLead,false);
  assert.equal(tiedForSecond.suggestSecondRound,false);
  assert.equal(tiedForSecond.winnerOptionExternalId,'OPT_A');
  assert.deepEqual(tiedForSecond.secondRoundOptionExternalIds,[]);
});

test('dashboard hides nothing from MJ but tracks who voted',()=>{
  const rt=runtime();rt.sessionVotes=[{voteExternalId:'VOTE_1',round:1,status:'OPEN',eligibleOptionExternalIds:'OPT_A;OPT_B;OPT_C'}];rt.sessionBallots=[{voteExternalId:'VOTE_1',round:1,electorCharacterExternalId:'CHAR_A',selectedOptionExternalIds:'OPT_A',weight:1}];
  const out=shapeVoteDashboard(session(),source(),rt);assert.equal(out.sourceReady,true);assert.equal(out.votes[0].voters[0].hasVoted,true);assert.equal(out.votes[0].voters[1].hasVoted,false);
});

test('opening a vote creates round one',async()=>{
  const writes=[];const out=await openSessionVote('S1',{voteExternalId:'VOTE_1'},{reader:readerFor(),executor:async(op,vars)=>{writes.push({op,vars});return{};},now:()=>new Date('2026-09-21T18:00:00Z')});
  assert.equal(out.round,1);assert.equal(out.electorateCount,3);assert.equal(writes.length,2);
});

test('casting a secret ballot records no choice in audit note',async()=>{
  const rt=runtime();rt.sessionVotes=[{voteExternalId:'VOTE_1',round:1,status:'OPEN',eligibleOptionExternalIds:'OPT_A;OPT_B;OPT_C'}];const writes=[];
  const out=await castSessionBallot('S1',{voteExternalId:'VOTE_1',electorCharacterExternalId:'CHAR_A',selectedOptionExternalIds:['OPT_A']},{reader:readerFor(session(),source(),rt),executor:async(op,vars)=>{writes.push({op,vars});return{};},now:()=>new Date('2026-09-21T18:05:00Z')});
  assert.equal(out.round,1);assert.equal(writes[1].vars.data.afterValue,'SECRET');
});

test('non-modifiable ballot cannot be cast twice',async()=>{
  const rt=runtime();rt.sessionVotes=[{voteExternalId:'VOTE_1',round:1,status:'OPEN',eligibleOptionExternalIds:'OPT_A;OPT_B;OPT_C'}];rt.sessionBallots=[{voteExternalId:'VOTE_1',round:1,electorCharacterExternalId:'CHAR_A',selectedOptionExternalIds:'OPT_A',weight:1}];
  await assert.rejects(()=>castSessionBallot('S1',{voteExternalId:'VOTE_1',electorCharacterExternalId:'CHAR_A',selectedOptionExternalIds:['OPT_B']},{reader:readerFor(session(),source(),rt),executor:async()=>({})}),/BALLOT_NOT_MODIFIABLE/);
});

test('closing a vote stores calculated result',async()=>{
  const rt=runtime();rt.sessionVotes=[{voteExternalId:'VOTE_1',round:1,status:'OPEN',eligibleOptionExternalIds:'OPT_A;OPT_B;OPT_C'}];rt.sessionBallots=[
    {voteExternalId:'VOTE_1',round:1,electorCharacterExternalId:'CHAR_A',selectedOptionExternalIds:'OPT_A',weight:1},
    {voteExternalId:'VOTE_1',round:1,electorCharacterExternalId:'CHAR_B',selectedOptionExternalIds:'OPT_A',weight:1},
    {voteExternalId:'VOTE_1',round:1,electorCharacterExternalId:'CHAR_C',selectedOptionExternalIds:'OPT_B',weight:1},
  ];const writes=[];
  const out=await closeSessionVote('S1',{voteExternalId:'VOTE_1'},{reader:readerFor(session(),source(),rt),executor:async(op,vars)=>{writes.push({op,vars});return{};},now:()=>new Date('2026-09-21T18:10:00Z')});
  assert.equal(out.result.winnerOptionExternalId,'OPT_A');assert.equal(writes.length,2);assert.match(writes[0].vars.resultJson,/OPT_A/);
});


test('same non-modifiable ballot retry is idempotent',async()=>{
  const rt=runtime();
  rt.sessionVotes=[{voteExternalId:'VOTE_1',round:1,status:'OPEN',eligibleOptionExternalIds:'OPT_A;OPT_B;OPT_C'}];
  rt.sessionBallots=[{voteExternalId:'VOTE_1',round:1,electorCharacterExternalId:'CHAR_A',selectedOptionExternalIds:'OPT_A',weight:1}];
  const writes=[];
  const out=await castSessionBallot('S1',{voteExternalId:'VOTE_1',electorCharacterExternalId:'CHAR_A',selectedOptionExternalIds:['OPT_A']},{
    reader:readerFor(session(),source(),rt),
    executor:async(op,vars)=>{writes.push({op,vars});return{};}
  });
  assert.equal(out.alreadyRecorded,true);
  assert.equal(out.updated,false);
  assert.equal(writes.length,0);
});

test('session ballot primary-key race is an idempotent successful retry',async()=>{
  const first=runtime();
  first.sessionVotes=[{voteExternalId:'VOTE_1',round:1,status:'OPEN',eligibleOptionExternalIds:'OPT_A;OPT_B;OPT_C'}];
  const refreshed=runtime();
  refreshed.sessionVotes=[...first.sessionVotes];
  refreshed.sessionBallots=[{voteExternalId:'VOTE_1',round:1,electorCharacterExternalId:'CHAR_A',selectedOptionExternalIds:'OPT_A',weight:1}];
  let runtimeReads=0;
  const reader=async operation=>{
    if(operation.includes('VoteSession'))return {gameSession:session()};
    if(operation.includes('VoteSource'))return source();
    if(operation.includes('VoteRuntime'))return ++runtimeReads===1?first:refreshed;
    throw new Error('UNEXPECTED_READ');
  };
  const writes=[];
  const executor=async(op,vars)=>{
    writes.push({op,vars});
    if(op.includes('InsertBallot')){
      const error=new Error('DATACONNECT_VOTE_WRITE_FAILED');
      error.details=[{message:'violated SQL unique constrain: session ballot pkey'}];
      throw error;
    }
    return{};
  };
  const out=await castSessionBallot('S1',{voteExternalId:'VOTE_1',electorCharacterExternalId:'CHAR_A',selectedOptionExternalIds:['OPT_A']},{reader,executor});
  assert.equal(out.alreadyRecorded,true);
  assert.equal(out.updated,false);
  assert.equal(writes.length,1);
  assert.match(writes[0].op,/InsertBallot/);
});

test('session ballot primary-key race does not overwrite a different non-modifiable choice',async()=>{
  const first=runtime();
  first.sessionVotes=[{voteExternalId:'VOTE_1',round:1,status:'OPEN',eligibleOptionExternalIds:'OPT_A;OPT_B;OPT_C'}];
  const refreshed=runtime();
  refreshed.sessionVotes=[...first.sessionVotes];
  refreshed.sessionBallots=[{voteExternalId:'VOTE_1',round:1,electorCharacterExternalId:'CHAR_A',selectedOptionExternalIds:'OPT_B',weight:1}];
  let runtimeReads=0;
  const reader=async operation=>{
    if(operation.includes('VoteSession'))return {gameSession:session()};
    if(operation.includes('VoteSource'))return source();
    if(operation.includes('VoteRuntime'))return ++runtimeReads===1?first:refreshed;
    throw new Error('UNEXPECTED_READ');
  };
  const executor=async op=>{
    if(op.includes('InsertBallot')){
      const error=new Error('DATACONNECT_VOTE_WRITE_FAILED');
      error.details=[{message:'duplicate key value violates unique constraint session_ballot_pkey'}];
      throw error;
    }
    return{};
  };
  await assert.rejects(
    ()=>castSessionBallot('S1',{voteExternalId:'VOTE_1',electorCharacterExternalId:'CHAR_A',selectedOptionExternalIds:['OPT_A']},{reader,executor}),
    /BALLOT_NOT_MODIFIABLE/
  );
});


test('a second round cannot be opened when one candidate is alone in first place',async()=>{
  const rt=runtime();
  rt.sessionVotes=[{
    voteExternalId:'VOTE_1',
    round:1,
    status:'CLOSED',
    eligibleOptionExternalIds:'OPT_A;OPT_B;OPT_C',
    resultJson:JSON.stringify({
      validBallots:4,
      tieForLead:false,
      ranked:[
        {optionExternalId:'OPT_A',votes:2,orderIndex:1},
        {optionExternalId:'OPT_B',votes:1,orderIndex:2},
        {optionExternalId:'OPT_C',votes:1,orderIndex:3},
      ],
      secondRoundOptionExternalIds:[]
    })
  }];
  await assert.rejects(
    ()=>openSessionVote('S1',{voteExternalId:'VOTE_1',secondRound:true},{
      reader:readerFor(session(),source(),rt),
      executor:async()=>({}),
      now:()=>new Date('2026-10-15T20:30:00Z')
    }),
    /SECOND_ROUND_NOT_AVAILABLE/
  );
});

test('opening a second round preserves every candidate tied for first place',async()=>{
  const rt=runtime();
  rt.sessionVotes=[{
    voteExternalId:'VOTE_1',
    round:1,
    status:'CLOSED',
    eligibleOptionExternalIds:'OPT_A;OPT_B;OPT_C',
    resultJson:JSON.stringify({
      validBallots:6,
      tieForLead:true,
      ranked:[
        {optionExternalId:'OPT_A',votes:2,orderIndex:1},
        {optionExternalId:'OPT_B',votes:2,orderIndex:2},
        {optionExternalId:'OPT_C',votes:2,orderIndex:3},
      ],
      secondRoundOptionExternalIds:['OPT_A','OPT_B','OPT_C']
    })
  }];
  const writes=[];
  const out=await openSessionVote('S1',{voteExternalId:'VOTE_1',secondRound:true},{
    reader:readerFor(session(),source(),rt),
    executor:async(op,vars)=>{writes.push({op,vars});return{};},
    now:()=>new Date('2026-10-15T20:31:00Z')
  });
  assert.deepEqual(out.eligibleOptionExternalIds,['OPT_A','OPT_B','OPT_C']);
  assert.equal(writes[0].vars.data.eligibleOptionExternalIds,'OPT_A;OPT_B;OPT_C');
});
