import test from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkbook } from '../src/diagnostics.mjs';

const base = () => ({ templateVersion: '1.1', sheets: {
  SCENARIO:[{scenario_id:'S1',titre:'Test',resume_mj:'x',resume_joueur:'x',duree_minutes:120,min_joueurs:3,max_joueurs:6,langue_defaut:'FR',version:'1',statut:'TEST'}],
  PERSONNAGES:[{character_id:'C1',nom_personnage:'A',importance:'MAIN',intensite:'STANDARD',biographie:'x',starting_fact_ids:'F1',public_nom:'TRUE',public_role:'TRUE',jouable:'TRUE',actif:'TRUE'}],
  OBJECTIFS:[{objective_id:'O1',owner_type:'CHARACTER',owner_id:'C1',titre:'Faire',description:'Faire quelque chose',type_objectif:'PERSONAL',secret:'TRUE',statut_initial:'ACTIVE',actif:'TRUE'}],
  INTRIGUES:[{plot_id:'P1',titre:'Intrigue',type_intrigue:'MAIN',importance:'IMPORTANT',resume_mj:'x',actif:'TRUE'}],
  FAITS:[{fact_id:'F1',titre_court:'Secret',texte:'x',nature:'FACT',importance:'CRITICAL',public:'FALSE',actif:'TRUE'}],
  INDICES:[{clue_id:'I1',nom_interne:'Indice',nom_joueur:'Indice',type_indice:'TEXT',texte_joueur:'papier',interpretation_mj:'soutient F1',fact_ids:'F1',support:'DIGITAL',partageable:'TRUE',transferable:'FALSE',consommable:'FALSE',majeur:'TRUE',presentation_mode:'DIRECT_TEXT',ajouter_au_carnet:'TRUE',actif:'TRUE'}],
  INTERACTIONS:[{interaction_id:'A1',nom:'Fouiller',categorie:'INVESTIGATION',target_type:'LOCATION',cost_resource_id:'RES_PA',cost_value:1,resolution:'AUTO',validation:'AUTO',secret_cible:'FALSE',actif:'TRUE'}],
  RESSOURCES:[{resource_id:'RES_PA',nom:'PA',scope_type:'PLAYER',valeur_defaut:5,valeur_max:5,mode_physique:'DIGITAL',public:'FALSE',actif:'TRUE'}],
  PHASES:[{phase_id:'PH1',nom:'Jeu',ordre:1,description_mj:'x',trigger_type:'MANUAL',manual_confirm:'TRUE',actif:'TRUE'}],
  EVENEMENTS:[{event_id:'E1',titre:'Rapport',description_mj:'x',trigger_type:'TIME_RELATIVE',delay_minutes:30,validation:'AUTO',priorite:'IMPORTANT',obligatoire:'TRUE',repetable:'FALSE',fallback_mj:'Le MJ remet le rapport.',manual_fallback_allowed:'TRUE',actif:'TRUE'}]
}});

test('valid minimal workbook has no blocking diagnostics', () => {
  const result = validateWorkbook(base());
  assert.equal(result.blocking, false);
  assert.equal(result.counts.ERROR, 0);
});

test('resource used as cost must be initialized', () => {
  const wb = base();
  wb.sheets.RESSOURCES[0].valeur_defaut = null;
  const result = validateWorkbook(wb);
  assert.equal(result.blocking, true);
  assert.ok(result.diagnostics.some(d => d.ruleId === 'RESOURCE_UNINITIALIZED'));
});

test('critical fact can be covered by initial holder plus clue', () => {
  const result = validateWorkbook(base());
  assert.ok(!result.diagnostics.some(d => d.ruleId === 'CRITICAL_NO_PATH'));
});

test('automatic mandatory event without GM fallback is warned', () => {
  const wb = base();
  wb.sheets.EVENEMENTS[0].fallback_mj = null;
  const result = validateWorkbook(wb);
  assert.ok(result.diagnostics.some(d => d.ruleId === 'EVENT_NO_FALLBACK'));
});

test('invalid QR scan mode is blocking', () => {
  const wb = base();
  wb.sheets.INTERACTIONS[0] = { ...wb.sheets.INTERACTIONS[0], target_type:'CHARACTER', scan_mode:'TELEPATHIE' };
  const result = validateWorkbook(wb);
  assert.equal(result.blocking, true);
  assert.ok(result.diagnostics.some(d => d.ruleId === 'SCAN_MODE_INVALID'));
});
