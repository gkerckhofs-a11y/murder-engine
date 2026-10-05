import test from 'node:test';
import assert from 'node:assert/strict';
import { shapeCharacterDetail, summarizeGenderComposition, __queries } from '../src/library.mjs';

test('character detail joins objectives, knowledge and perspective-aware relationships', () => {
  const data = {
    characters: [{ externalId:'CHAR_A', name:'Alice', biography:'Bio' }],
    allCharacters: [
      { externalId:'CHAR_A', name:'Alice', publicRole:'Médecin' },
      { externalId:'CHAR_B', name:'Bob', publicRole:'Avocat' },
    ],
    objectives: [{ externalId:'OBJ_1', title:'Agir', active:true }],
    relationships: [
      { externalId:'REL_1', characterAExternalId:'CHAR_B', characterBExternalId:'CHAR_A', textA:'Alice est utile.', textB:'Bob est dangereux.', visibility:'PRIVATE', active:true },
    ],
    initialKnowledges: [{ factExternalId:'FACT_1', sourceType:'INITIAL' }],
    facts: [{ externalId:'FACT_1', title:'Un secret', text:'Texte', nature:'FACT', importance:'IMPORTANT' }],
  };
  const detail = shapeCharacterDetail(data, 'CHAR_A');
  assert.equal(detail.objectives.length,1);
  assert.equal(detail.knowledge[0].fact.title,'Un secret');
  assert.equal(detail.relationships[0].otherName,'Bob');
  assert.equal(detail.relationships[0].text,'Bob est dangereux.');
});

test('library queries are read-only GraphQL queries', () => {
  assert.match(__queries.LIST_LIBRARY_QUERY,/query LibraryScenarios/);
  assert.match(__queries.VERSION_OVERVIEW_QUERY,/query ScenarioVersionOverview/);
  assert.match(__queries.CHARACTER_DETAIL_QUERY,/query CharacterDetail/);
  assert.doesNotMatch(__queries.CHARACTER_DETAIL_QUERY,/mutation /);
});


test('gender composition summarizes fixed and adaptable playable roles', () => {
  const summary = summarizeGenderComposition([
    {gender:'FEMININ',playable:true,active:true},
    {gender:'MASCULIN',playable:true,active:true},
    {gender:'NEUTRE',playable:true,active:true},
    {gender:'FEMININ',playable:false,active:true},
  ]);
  assert.deepEqual(summary,{feminine:1,masculine:1,flexible:1,other:0,total:3,label:'1F · 1M · 1 adapt.'});
});
