import test from 'node:test';
import assert from 'node:assert/strict';
import { purgeGameSession, purgeScenarioFamily, __cleanupOps } from '../src/cleanup.mjs';

test('hard session cleanup deletes the whole test session through one transaction', async()=>{
  const writes=[];
  const result=await purgeGameSession('S1',{
    reader:async(operation,variables)=>{
      assert.equal(operation,__cleanupOps.SESSION_LOOKUP_QUERY);
      assert.equal(variables.sessionId,'S1');
      return {gameSession:{id:'S1',name:'Test session',status:'DRAFT',scenarioVersion:{id:'V1',scenario:{id:'SC1',title:'Test'}}}};
    },
    executor:async(operation,variables)=>{writes.push({operation,variables});return{};},
  });
  assert.equal(result.deleted,true);
  assert.equal(result.sessionId,'S1');
  assert.equal(writes.length,1);
  assert.equal(writes[0].operation,__cleanupOps.SESSION_PURGE_MUTATION);
  assert.equal(writes[0].variables.sessionId,'S1');
  assert.match(__cleanupOps.SESSION_PURGE_MUTATION,/precastRegistration_updateMany/);
  assert.match(__cleanupOps.SESSION_PURGE_MUTATION,/sessionParticipant_deleteMany/);
  assert.match(__cleanupOps.SESSION_PURGE_MUTATION,/sessionActionLog_deleteMany/);
  assert.match(__cleanupOps.SESSION_PURGE_MUTATION,/gameSession_delete/);
});

test('scenario cleanup removes sessions campaigns versions then the scenario family', async()=>{
  const writes=[];
  const result=await purgeScenarioFamily('SC1',{
    reader:async(operation,variables)=>{
      if(operation===__cleanupOps.SCENARIO_PURGE_QUERY) assert.equal(variables.scenarioId,'SC1');
      if(operation===__cleanupOps.SCENARIO_PURGE_QUERY){
        return {
          scenario:{id:'SC1',title:'Scenario test'},
          scenarioVersions:[{id:'V1'},{id:'V2'}],
          precastCampaigns:[{id:'C1'}],
        };
      }
      if(operation===__cleanupOps.SESSIONS_FOR_VERSION_QUERY){
        return {gameSessions:variables.versionId==='V1'?[{id:'S1'},{id:'S2'}]:[]};
      }
      assert.fail('Unexpected read operation');
    },
    executor:async(operation,variables)=>{writes.push({operation,variables});return{};},
  });

  assert.equal(result.deleted,true);
  assert.equal(result.sessionsDeleted,2);
  assert.equal(result.campaignsDeleted,1);
  assert.equal(result.versionsDeleted,2);
  assert.deepEqual(writes.map(x=>x.operation),[
    __cleanupOps.SESSION_PURGE_MUTATION,
    __cleanupOps.SESSION_PURGE_MUTATION,
    __cleanupOps.CAMPAIGN_PURGE_MUTATION,
    __cleanupOps.VERSION_PURGE_MUTATION,
    __cleanupOps.VERSION_PURGE_MUTATION,
    __cleanupOps.SCENARIO_DELETE_MUTATION,
  ]);
  assert.match(__cleanupOps.VERSION_PURGE_MUTATION,/character_deleteMany/);
  assert.match(__cleanupOps.VERSION_PURGE_MUTATION,/clue_deleteMany/);
  assert.match(__cleanupOps.VERSION_PURGE_MUTATION,/scenarioVersion_delete/);
});
