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

test('tally detects absolute majority',()=>{
  const out=tallyVote({definition:source().voteDefinitions[0],options:source().voteOptionDefinitions,electorate:['CHAR_A','CHAR_B','CHAR_C'],ballots:[
    {electorCharacterExternalId:'CHAR_A',selectedOptionExternalIds:'OPT_A',weight:1},
    {electorCharacterExternalId:'CHAR_B',selectedOptionExternalIds:'OPT_A',weight:1},
    {electorCharacterExternalId:'CHAR_C',selectedOptionExternalIds:'OPT_B',weight:1},
  ]});
  assert.equal(out.majorityAbsolute,true); assert.equal(out.winnerOptionExternalId,'OPT_A'); assert.equal(out.suggestSecondRound,false);
});

test('no majority suggests second round with top two',()=>{
  const electorate=['A','B','C','D'];
  const out=tallyVote({definition:source().voteDefinitions[0],options:source().voteOptionDefinitions,electorate,ballots:[
    {electorCharacterExternalId:'A',selectedOptionExternalIds:'OPT_A',weight:1},
    {electorCharacterExternalId:'B',selectedOptionExternalIds:'OPT_A',weight:1},
    {electorCharacterExternalId:'C',selectedOptionExternalIds:'OPT_B',weight:1},
    {electorCharacterExternalId:'D',selectedOptionExternalIds:'OPT_C',weight:1},
  ]});
  assert.equal(out.majorityAbsolute,false); assert.equal(out.suggestSecondRound,true); assert.deepEqual(out.secondRoundOptionExternalIds,['OPT_A','OPT_B']);
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
