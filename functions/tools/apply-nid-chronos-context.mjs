import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeApp} from 'firebase-admin/app';
import {getDataConnect} from 'firebase-admin/data-connect';

assert.equal(process.env.GCLOUD_PROJECT, 'murder-engine-ludificateur');
initializeApp({projectId: process.env.GCLOUD_PROJECT});
const dc = getDataConnect({location: 'europe-west1', serviceId: 'murder-engine'});
const edits = JSON.parse(readFileSync(new URL('../../fixtures/nid/chronos-context.json', import.meta.url)));
const sessionId = 'd1a40507811f4695a119e16ed74eb5cd';
const models = {
  characters: ['Character', 'character', 'characters'],
  facts: ['Fact', 'fact', 'facts'],
};
const queries = Object.entries(models).map(([group, [, , collection]]) => {
  const fields = [...new Set(edits[group].flatMap(row => Object.keys(row.data)))];
  return `${group}:${collection}(where:{scenarioVersionId:{eq:$v}},limit:500){externalId ${fields.join(' ')}}`;
}).join('\n');
async function read(query, variables) {
  const result = await dc.executeGraphqlRead(query, {variables});
  assert.ok(!result.errors?.length, JSON.stringify(result.errors));
  return result.data;
}

const selection = await read('query Target($s:UUID!){gameSession(id:$s){scenarioVersion{id sourceScenarioId versionLabel}}}', {s: sessionId});
const version = selection.gameSession.scenarioVersion;
assert.equal(version.sourceScenarioId, 'NID_ESPIONS_1958_16');
assert.equal(version.versionLabel, '1.3-master-20261107-r2');
const v = version.id;
const state = await read(`query Before($v:UUID!){gameSessions(where:{scenarioVersionId:{eq:$v}},limit:100){id status} ${queries}}`, {v});

const verifyOnly = process.argv.includes('--verify');
if (!verifyOnly) {
  assert.ok(state.gameSessions.length < 100);
  assert.ok(state.gameSessions.every(session => session.status !== 'LIVE'), 'NID_SESSION_RUNNING');
  const variables = {v, label: version.versionLabel};
  const declarations = ['$v:UUID!', '$label:String!'];
  const steps = ['lockVersion:scenarioVersion_update(id:$v,data:{versionLabel:$label})'];
  let next = 0;
  function update(type, field, key, before, data, lock) {
    const id = 'u' + next++;
    variables[id] = data;
    declarations.push(`$${id}:${type}_Data!`);
    steps.push(`${id}lock:${field}_update(${key},data:${lock})`);
    const guards = Object.entries(before).map(([property, value], index) => {
      const argument = id + 'old' + index;
      declarations.push(`$${argument}:String`);
      variables[argument] = value;
      return `response.${id}guard.${field}.${property} == vars.${argument}`;
    });
    steps.push(`${id}guard:query @check(expr:${JSON.stringify(guards.join(' && '))},message:"NID_EDITORIAL_CONFLICT") @redact{${field}(${key}){${Object.keys(before).join(' ')}}}`);
    steps.push(`${id}:${field}_update(${key},data:$${id})`);
  }
  for (const session of state.gameSessions) {
    const id = 's' + next++;
    variables[id] = session.id;
    declarations.push(`$${id}:UUID!`);
    steps.push(`${id}lock:gameSession_update(id:$${id},data:{liveElapsedSeconds_update:{inc:0}})`);
    steps.push(`${id}guard:query @check(expr:"response.${id}guard.gameSession.status != 'LIVE'",message:"NID_SESSION_RUNNING") @redact{gameSession(id:$${id}){status}}`);
    const cast = await read('query Cast($s:UUID!){sessionParticipants(where:{gameSessionId:{eq:$s}},limit:100){id characterExternalId characterSnapshotJson}}', {s:session.id});
    for (const participant of cast.sessionParticipants) {
      const change = edits.characters.find(row => row.externalId === participant.characterExternalId);
      if (!change || !participant.characterSnapshotJson) continue;
      const snapshot = JSON.parse(participant.characterSnapshotJson);
      assert.equal(snapshot.characterExternalId, participant.characterExternalId);
      const biography = snapshot.character.biography;
      if (biography === change.data.biography) continue;
      assert.equal(biography, change.expected.biography, 'NID_CUSTOM_BIOGRAPHY:' + participant.characterExternalId);
      snapshot.character.biography = change.data.biography;
      const key = 'id:' + JSON.stringify(participant.id);
      update('SessionParticipant', 'sessionParticipant', key, {characterSnapshotJson:participant.characterSnapshotJson}, {characterSnapshotJson:JSON.stringify(snapshot)}, '{id:' + JSON.stringify(participant.id) + '}');
    }
  }
  for (const [group, rows] of Object.entries(edits)) {
    const [type, field] = models[group];
    for (const row of rows) {
      const current = state[group].find(item => item.externalId === row.externalId);
      assert.ok(current, group + ':' + row.externalId);
      const before = {};
      for (const [property, value] of Object.entries(row.data)) {
        if (current[property] === value) continue;
        assert.equal(current[property], row.expected[property], group + ':' + row.externalId + ':' + property);
        before[property] = current[property];
      }
      if (!Object.keys(before).length) continue;
      const id = JSON.stringify(row.externalId);
      update(type, field, `key:{scenarioVersionId:$v,externalId:${id}}`, before, row.data, `{externalId:${id}}`);
    }
  }
  const result = await dc.executeGraphql(`mutation NidChronosContext(${declarations.join(',')}) @transaction { ${steps.join('\n')} }`, {variables});
  assert.ok(!result.errors?.length, JSON.stringify(result.errors));
}
const after = verifyOnly ? state : await read(`query After($v:UUID!){${queries}}`, {v});
for (const [group, rows] of Object.entries(edits)) {
  for (const row of rows) {
    const current = after[group].find(item => item.externalId === row.externalId);
    for (const [property, value] of Object.entries(row.data)) assert.equal(current[property], value);
  }
}

if (verifyOnly) {
  const cast = await read('query Cast($s:UUID!){sessionParticipants(where:{gameSessionId:{eq:$s}},limit:100){active characterExternalId playerAccessToken playerAccessEnabled}}', {s:sessionId});
  const players = cast.sessionParticipants.filter(player => player.active && player.playerAccessEnabled);
  assert.equal(players.length, 16);
  const host = 'https://murder-engine-ludificateur.web.app';
  async function request(route, params) {
    const response = await fetch(host + route + '?' + new URLSearchParams(params));
    assert.ok(response.ok, route + ' returned ' + response.status);
    return response.json();
  }
  for (const player of players) {
    const {portal} = await request('/api/player/portal', {token:player.playerAccessToken, refresh:'1'});
    const character = after.characters.find(row => row.externalId === player.characterExternalId);
    assert.equal(portal.character.biography, character.biography, player.characterExternalId);
  }
}
console.log(JSON.stringify({verifyOnly, updatedBiographies:edits.characters.length,
  updatedAnalysisFacts:edits.facts.length, verifiedPlayerViews:verifyOnly?16:0}));
