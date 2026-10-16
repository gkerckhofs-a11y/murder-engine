import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getDataConnect } from 'firebase-admin/data-connect';
import { openSessionVote, castSessionBallot, closeSessionVote, getVoteDashboard, __voteOps } from '../src/votes.mjs';
import { getPlayerPortal, castPlayerVote, __playerOps } from '../src/player.mjs';
import { controlLiveSession, __liveOps } from '../src/live.mjs';

// This suite is deliberately impossible to run against the production project.
assert.ok(process.env.DATA_CONNECT_EMULATOR_HOST,'Local SQL Connect emulator required');
assert.equal(process.env.GCLOUD_PROJECT,'demo-murder-engine-votes');
initializeApp({projectId:'demo-murder-engine-votes'});
const dc=getDataConnect({location:'europe-west1',serviceId:'murder-engine'});
async function execute(operation,variables={}) {
  const response=await dc.executeGraphql(operation,{variables});
  assert.deepEqual(response.errors??[],[]);
  return response.data;
}
async function read(operation,variables={}) {
  const response=await dc.executeGraphqlRead(operation,{variables});
  assert.deepEqual(response.errors??[],[]);
  return response.data;
}
async function insert(type,field,rows) {
  if(!rows.length)return;
  const vars=Object.fromEntries(rows.map((row,i)=>['r'+i,row]));
  return execute(`mutation Seed(${rows.map((_,i)=>`$r${i}: ${type}_Data!`).join(',')}) @transaction { ${rows.map((_,i)=>`r${i}: ${field}_insert(data:$r${i})`).join('\n')} }`,vars);
}
async function fixture() {
  const organizationId=randomUUID(),scenarioId=randomUUID(),versionId=randomUUID(),sessionId=randomUUID();
  const now=new Date().toISOString();
  await insert('Organization','organization',[{id:organizationId,name:'Local integration test',slug:organizationId}]);
  await insert('Scenario','scenario',[{id:scenarioId,organizationId,title:'Vote integration fixture',slug:scenarioId}]);
  await insert('ScenarioVersion','scenarioVersion',[{id:versionId,scenarioId,sourceScenarioId:scenarioId,versionLabel:'test',templateVersion:'1.4',language:'EN',status:'READY',gmSummary:'Test',playerSummary:'Test',runtimeDataVersion:'0.9'}]);
  await insert('GameSession','gameSession',[{id:sessionId,organizationId,scenarioVersionId:versionId,language:'EN',status:'LIVE',runtimeInitializedAt:now,startedAt:now,liveClockStartedAt:now}]);
  const characters=Array.from({length:21},(_,i)=>`CHAR_${String(i+1).padStart(2,'0')}`);
  await insert('Character','character',characters.map(externalId=>({scenarioVersionId:versionId,externalId,name:externalId,biography:'Integration test character',importance:'CORE',intensity:'MEDIUM'})));
  const tokens=characters.map(()=>randomUUID().replaceAll('-','')+randomUUID().replaceAll('-',''));
  await insert('SessionParticipant','sessionParticipant',characters.map((characterExternalId,i)=>({gameSessionId:sessionId,displayName:characterExternalId,characterExternalId,playerAccessEnabled:true,playerAccessToken:tokens[i]})));
  const seats=Array.from({length:5},(_,i)=>`SEAT_${i+1}`);
  const ids=[...seats,'CASTING','ACCUSE','RACE','CANCEL','RESUME','MODIFIABLE'];
  await insert('VoteDefinition','voteDefinition',ids.map(externalId=>({scenarioVersionId:versionId,externalId,title:externalId,question:'Choose',scopeType:externalId==='CASTING'?'VOTE_WINNERS':'ALL',scopeRef:externalId==='CASTING'?seats.join(';'):null,choicesMode:'OPTIONS',closeMode:'GM',resultVisibility:'AFTER_CLOSE',tieRule:'SECOND_ROUND',modifiable:externalId==='MODIFIABLE'})));
  await insert('VoteOptionDefinition','voteOptionDefinition',ids.flatMap((voteExternalId,j)=>[0,1,2].map((n)=>({scenarioVersionId:versionId,externalId:`${voteExternalId}_${n}`,voteExternalId,orderIndex:n,label:`Choice ${n}`,characterExternalId:characters[(j+n+1)%21]}))));
  return {sessionId,versionId,characters,tokens,seats};
}
const vote=(s,v,c,option,round=1)=>castSessionBallot(s,{voteExternalId:v,electorCharacterExternalId:c,selectedOptionExternalIds:[`${v}_${option}`],round});
const close=(s,v,round=1,cancel=false)=>closeSessionVote(s,{voteExternalId:v,round,cancel});

test('real SQL Connect: 21-player game, complete tallies, retry and session lifecycle',async t=>{
  const {sessionId:s,versionId,characters:chars,tokens,seats}=await fixture();
  await t.test('five elections exceed 100 ballots without truncating counts or player state',async()=>{
    for(const id of seats)await openSessionVote(s,{voteExternalId:id});
    for(const [j,id] of seats.entries()){
      for(let i=0;i<21;i++)await vote(s,id,chars[i],j===4?Math.floor(i/7):i<13?0:1);
    }
    const raw=await read('query Check($s:UUID!){sessionBallots(where:{gameSessionId:{eq:$s}},limit:1000){round}}',{s});
    assert.equal(raw.sessionBallots.length,105);
    const dashboard=await getVoteDashboard(s);
    for(const id of seats)assert.equal(dashboard.votes.find(v=>v.externalId===id).voters.filter(v=>v.hasVoted).length,21);
    const portal=await getPlayerPortal(tokens[20],{trackOpen:false});
    assert.equal(portal.votes.length,0,'last player must not be asked to vote again');
    for(const id of seats){const result=(await close(s,id)).result;assert.equal(result.ballotsCast,21);assert.equal(result.ranked[0].votes,id===seats[4]?7:13);}
  });
  await t.test('runoff rejects an old round; concurrent retries produce one ballot and one log',async()=>{
    const id=seats[4];await openSessionVote(s,{voteExternalId:id,secondRound:true});
    await assert.rejects(()=>vote(s,id,chars[0],0,1),/VOTE_ROUND_CHANGED/);
    await assert.rejects(()=>castSessionBallot(s,{voteExternalId:id,electorCharacterExternalId:chars[0],selectedOptionExternalIds:[`${id}_0`]}),/VOTE_ROUND_REQUIRED/);
    const retries=await Promise.all([vote(s,id,chars[0],0,2),vote(s,id,chars[0],0,2)]);
    assert.ok(retries.some(r=>r.alreadyRecorded));
    for(let i=1;i<21;i++)await vote(s,id,chars[i],i<11?0:1,2);
    const result=(await close(s,id,2)).result;assert.equal(result.ballotsCast,21);assert.equal(result.winnerOptionExternalId,`${id}_0`);
    const logs=await read('query Logs($s:UUID!){sessionActionLogs(where:{gameSessionId:{eq:$s},actionType:{eq:"BALLOT_CAST"}},limit:1000){note refExternalId characterExternalId}}',{s});
    assert.equal(logs.sessionActionLogs.filter(l=>l.note==='Tour 2'&&l.refExternalId===id&&l.characterExternalId===chars[0]).length,1);
  });
  await t.test('five elected jurors can vote and every casting ballot is counted',async()=>{
    const opened=await openSessionVote(s,{voteExternalId:'CASTING'});assert.equal(opened.electorateCount,5);
    const jurors=(await getVoteDashboard(s)).votes.find(v=>v.externalId==='CASTING').electorate;
    for(const [i,c] of jurors.entries())await vote(s,'CASTING',c,i<3?0:1);
    const result=(await close(s,'CASTING')).result;assert.equal(result.ballotsCast,5);assert.deepEqual(result.ranked.map(x=>x.votes),[3,2,0]);
  });
  await t.test('a vote racing with closure is either counted or rejected, never silently lost',async()=>{
    await openSessionVote(s,{voteExternalId:'RACE'});
    const [castResult,closed]=await Promise.allSettled([vote(s,'RACE',chars[0],0),close(s,'RACE')]);
    assert.equal(closed.status,'fulfilled');
    assert.equal(closed.value.result.ballotsCast,castResult.status==='fulfilled'?1:0);
    await assert.rejects(()=>vote(s,'RACE',chars[1],1),/VOTE_NOT_OPEN/);
  });
  await t.test('an interrupted tally can resume from frozen ballots',async()=>{
    await openSessionVote(s,{voteExternalId:'RESUME'});await vote(s,'RESUME',chars[0],0);
    await execute(__voteOps.BEGIN_VOTE_CLOSE,{sessionId:s,voteExternalId:'RESUME',round:1});
    await assert.rejects(()=>vote(s,'RESUME',chars[1],1),/VOTE_NOT_OPEN/);
    assert.equal((await close(s,'RESUME')).result.ballotsCast,1);
  });
  await t.test('modifiable ballot updates remain unique and journalled',async()=>{
    await openSessionVote(s,{voteExternalId:'MODIFIABLE'});
    await castPlayerVote(tokens[0],{voteExternalId:'MODIFIABLE',round:1,selectedOptionExternalIds:['MODIFIABLE_0']});
    await vote(s,'MODIFIABLE',chars[0],1);
    const result=(await close(s,'MODIFIABLE')).result;assert.equal(result.ballotsCast,1);assert.equal(result.winnerOptionExternalId,'MODIFIABLE_1');
  });
  await t.test('finish is refused until outstanding votes are counted or cancelled',async()=>{
    await openSessionVote(s,{voteExternalId:'CANCEL'});await vote(s,'CANCEL',chars[0],0);
    await assert.rejects(()=>controlLiveSession(s,'FINISH'),/SESSION_HAS_OPEN_VOTES/);
    await assert.rejects(()=>execute(__liveOps.UPDATE_LIVE_SESSION_MUTATION,{
      sessionId:s,expectedStatus:'LIVE',status:'FINISHED',liveElapsedSeconds:0,
      startedAt:null,pausedAt:null,finishedAt:new Date().toISOString(),liveClockStartedAt:null,currentPhaseExternalId:null,
    }),/SESSION_HAS_OPEN_VOTES/,'database guard must also reject a finish racing with an open vote');
    assert.equal((await close(s,'CANCEL',1,true)).status,'CANCELLED');
    const saved=await read('query Saved($s:UUID!){sessionBallots(where:{gameSessionId:{eq:$s},voteExternalId:{eq:"CANCEL"}},limit:1000){round}}',{s});
    assert.equal(saved.sessionBallots.length,1,'cancellation must preserve ballots');
    assert.equal((await controlLiveSession(s,'FINISH')).status,'FINISHED');
    await assert.rejects(()=>openSessionVote(s,{voteExternalId:'ACCUSE'}),/VOTE_REQUIRES_LIVE_SESSION/);
    await assert.rejects(()=>close(s,'CASTING'),/VOTE_REQUIRES_LIVE_SESSION/);
  });
  await t.test('all expanded player/live queries validate against the actual schema',async()=>{
    for(const [op,variables] of [[__playerOps.PLAYER_SOURCE_QUERY,{versionId}],[__playerOps.PLAYER_RUNTIME_QUERY,{sessionId:s}],[__liveOps.LIVE_RUNTIME_QUERY,{sessionId:s}]]){
      await read(op,{...variables,pageLimit:100,pageOffset:0});
    }
  });
});
