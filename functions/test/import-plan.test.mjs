import test from 'node:test';
import assert from 'node:assert/strict';
import { buildImportPlan, stableUuid, importPlanCounts } from '../src/import-plan.mjs';
import {
  IMPORT_PREFLIGHT_QUERY,
  EXISTING_ENRICHMENT_QUERY,
  INSERT_ORGANIZATION_MUTATION,
  INSERT_SCENARIO_MUTATION,
  INSERT_SCENARIO_SNAPSHOT_MUTATION,
  INSERT_CLUES_BATCH_MUTATION,
  INSERT_CLUE_FACTS_BATCH_MUTATION,
  INSERT_OBJECTIVE_MUTATION,
  INSERT_RELATIONSHIP_MUTATION,
  INSERT_GAME_OBJECT_MUTATION,
  INSERT_RESOURCE_MUTATION,
  INSERT_RESOURCE_ASSIGNMENT_MUTATION,
  INSERT_STATE_DEFINITION_MUTATION,
  INSERT_ABILITY_MUTATION,
  INSERT_ABILITY_ASSIGNMENT_MUTATION,
  INSERT_INTERACTION_MUTATION,
  INSERT_LOCATION_MUTATION,
  INSERT_PHASE_DEFINITION_MUTATION,
  INSERT_EVENT_DEFINITION_MUTATION,
  INSERT_VOTE_DEFINITION_MUTATION,
  INSERT_VOTE_OPTION_DEFINITION_MUTATION,
  MARK_RUNTIME_SOURCE_MUTATION,
  mutationVariablesFromPlan,
  persistImportPlan,
} from '../src/dataconnect-import.mjs';

const workbook = () => ({
  filename: 'test.xlsx', templateVersion: '1.1', sheets: {
    SCENARIO: [{ scenario_id:'SCENARIO_TEST', titre:'Test Murder', sous_titre:'Une nuit', univers:'Polar', epoque:'2026', resume_mj:'Canon', resume_joueur:'Pitch', duree_minutes:120, min_joueurs:2, max_joueurs:4, langue_defaut:'FR', version:'1.0', statut:'TEST' }],
    PERSONNAGES: [{ character_id:'CHAR_A', nom_personnage:'Alice', fonction_publique:'Médecin', importance:'MAIN', intensite:'STANDARD', biographie:'Bio', starting_fact_ids:'FACT_1;FACT_2', public_nom:'TRUE', public_role:'TRUE', jouable:'TRUE', actif:'TRUE' }],
    INTRIGUES: [{ plot_id:'PLOT_1', titre:'Meurtre', type_intrigue:'MAIN', importance:'CRITICAL', resume_mj:'x', actif:'TRUE' }],
    OBJECTIFS: [{ objective_id:'OBJ_1', owner_type:'CHARACTER', owner_id:'CHAR_A', titre:'Comprendre', description:'Découvrir la vérité', type_objectif:'PERSONAL', secret:'TRUE', statut_initial:'ACTIVE', importance:'MAIN', actif:'TRUE' }],
    RELATIONS: [{ relation_id:'REL_1', character_a_id:'CHAR_A', character_b_id:'CHAR_B', type_relation:'ALLY', texte_a:'Je lui fais confiance.', texte_b:'Elle me protège.', visibilite:'PRIVATE', plot_id:'PLOT_1', actif:'TRUE' }],
    OBJETS: [{ object_id:'ITEM_1', nom:'Clé', description:'Une clé', support:'PHYSICAL', owner_initial_type:'CHARACTER', owner_initial_id:'CHAR_A', transferable:'TRUE', volable:'TRUE', consommable:'FALSE', charges_initiales:1, critique:'FALSE', actif:'TRUE' }],
    RESSOURCES: [{ resource_id:'RES_PA', nom:'Points d’action', scope_type:'PLAYER', unite:'PA', valeur_defaut:5, valeur_max:5, mode_physique:'HYBRID', public:'TRUE', actif:'TRUE' }],
    ATTRIB_RESSOURCES: [{ resource_assignment_id:'RA_1', owner_type:'CHARACTER', owner_id:'CHAR_A', resource_id:'RES_PA', initial_value:6, max_override:6, notes:'test' }],
    ETATS: [{ state_id:'STATE_BLESSE', nom:'Blessé', description:'Blessure', duree_defaut_secondes:600, visible_porteur:'TRUE', visible_public:'FALSE', actif:'TRUE' }],
    CAPACITES: [{ ability_id:'ABILITY_FOUILLE', nom:'Fouille', description:'Fouiller une pièce', categorie:'UTILITY', niveau_defaut:1, max_utilisations_defaut:null, cooldown_minutes_defaut:0, secrete:'FALSE', actif:'TRUE' }],
    ATTRIB_CAPACITES: [{ assignment_id:'ASSIGN_A_FOUILLE', owner_type:'CHARACTER', owner_id:'CHAR_A', ability_id:'ABILITY_FOUILLE', niveau:2, bonus_flat:1, utilisations_override:3, cooldown_override_minutes:5, actif:'TRUE' }],
    INTERACTIONS: [{ interaction_id:'ACT_FOUILLE', nom:'Fouiller', categorie:'INVESTIGATION', target_type:'LOCATION', ability_id:'ABILITY_FOUILLE', actor_scope:'ABILITY_HOLDER', target_scope:null, cost_resource_id:'RES_PA', cost_value:1, cost_timing:'BEFORE', resolution:'DICE', dice_count:2, dice_sides:6, ability_level_multiplier:1, flat_bonus:0, difficulty:7, opposed_ability_id:null, tie_rule:null, validation:'AUTO', max_utilisations:null, limit_per_target:1, cooldown_minutes:0, secret_cible:'FALSE', actif:'TRUE' }],
    LIEUX: [{ location_id:'LOC_BUREAU', nom:'Bureau', description:'Bureau privé', qr_code:'QR_BUREAU', permanent:'TRUE', theme_id:'THEME', lock_id:null, actif:'TRUE' }],
    PHASES: [{ phase_id:'PHASE_1', nom:'Enquête', ordre:1, description_mj:'Phase enquête', trigger_type:'MANUAL', manual_confirm:'TRUE', actif:'TRUE' }],
    EVENEMENTS: [{ event_id:'EVENT_1', titre:'Rapport', description_mj:'Remettre le rapport', trigger_type:'TIME_RELATIVE', delay_minutes:40, validation:'GM', priorite:'IMPORTANT', obligatoire:'TRUE', repetable:'FALSE', fallback_mj:'Remise manuelle', manual_fallback_allowed:'TRUE', actif:'TRUE' }],
    VOTES: [{ vote_id:'VOTE_1', titre:'Succession', question:'Qui dirige ?', scope_type:'LIST', scope_ref:'CHAR_A;CHAR_B', choices_mode:'OPTIONS', secret:'TRUE', votes_par_electeur:1, pondere:'FALSE', abstention:'FALSE', modifiable:'FALSE', close_mode:'GM', result_visibility:'AFTER_CLOSE', tie_rule:'SECOND_ROUND', actif:'TRUE' }],
    OPTIONS_VOTE: [{ vote_option_id:'OPT_1', vote_id:'VOTE_1', ordre:1, label:'Alice', character_id:'CHAR_A', actif:'TRUE' }],
    FAITS: [
      { fact_id:'FACT_1', titre_court:'Fait 1', texte:'x', nature:'FACT', importance:'CRITICAL', plot_id:'PLOT_1', public:'FALSE', actif:'TRUE' },
      { fact_id:'FACT_2', titre_court:'Fait 2', texte:'y', nature:'BELIEF', importance:'IMPORTANT', public:'FALSE', actif:'TRUE' },
    ],
    INDICES: [{ clue_id:'CLUE_1', nom_interne:'Indice', nom_joueur:'Papier', type_indice:'DOCUMENT', texte_joueur:'Texte', interpretation_mj:'Sens', fact_ids:'FACT_1', plot_id:'PLOT_1', support:'PHYSICAL', partageable:'TRUE', transferable:'TRUE', consommable:'FALSE', majeur:'TRUE', presentation_mode:'DOCUMENT', ajouter_au_carnet:'TRUE', actif:'TRUE' }],
  }
});

test('stableUuid is deterministic and UUID-shaped', () => {
  const a = stableUuid('same');
  const b = stableUuid('same');
  assert.equal(a,b);
  assert.match(a,/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test('buildImportPlan maps narrative entities and relationships', () => {
  const plan = buildImportPlan(workbook(), { sourceBuffer: Buffer.from('file'), organizationSlug:'ludificateur' });
  assert.equal(plan.characters.length,1);
  assert.equal(plan.scenario.organizationId, plan.ids.organizationId);
  assert.equal(plan.scenarioVersion.scenarioId, plan.ids.scenarioId);
  assert.equal(plan.characters[0].scenarioVersionId, plan.ids.scenarioVersionId);
  assert.equal(plan.plots[0].scenarioVersionId, plan.ids.scenarioVersionId);
  assert.equal(plan.objectives.length,1);
  assert.equal(plan.relationships.length,1);
  assert.equal(plan.objectives[0].ownerExternalId,'CHAR_A');
  assert.equal(plan.relationships[0].characterBExternalId,'CHAR_B');
  assert.equal(plan.facts.length,2);
  assert.equal(plan.initialKnowledge.length,2);
  assert.equal(plan.clues.length,1);
  assert.equal(plan.clueFacts.length,1);
  assert.equal(plan.gameObjects[0].ownerInitialExternalId,'CHAR_A');
  assert.equal(plan.resources[0].defaultValue,5);
  assert.equal(plan.resourceAssignments[0].initialValue,6);
  assert.equal(plan.stateDefinitions[0].externalId,'STATE_BLESSE');
  assert.equal(plan.abilities[0].externalId,'ABILITY_FOUILLE');
  assert.equal(plan.abilityAssignments[0].level,2);
  assert.equal(plan.interactions[0].diceSides,6);
  assert.equal(plan.interactions[0].scanMode,null);
  assert.equal(plan.locations[0].externalId,'LOC_BUREAU');
  assert.equal(plan.phaseDefinitions[0].externalId,'PHASE_1');
  assert.equal(plan.eventDefinitions[0].delayMinutes,40);
  assert.equal(plan.voteDefinitions[0].externalId,'VOTE_1');
  assert.equal(plan.voteOptionDefinitions[0].voteExternalId,'VOTE_1');
  assert.deepEqual(importPlanCounts(plan), { characters:1, plots:1, objectives:1, relationships:1, facts:2, initialKnowledge:2, clues:1, clueFacts:1, documents:0, mediaAssets:0, skinVisualDefinitions:0, gameObjects:1, resources:1, resourceAssignments:1, abilities:1, abilityAssignments:1, interactions:1, locations:1, stateDefinitions:1, phaseDefinitions:1, eventDefinitions:1, voteDefinitions:1, voteOptionDefinitions:1 });
});

test('same workbook bytes create same ScenarioVersion id', () => {
  const a = buildImportPlan(workbook(), { sourceBuffer:Buffer.from('same') });
  const b = buildImportPlan(workbook(), { sourceBuffer:Buffer.from('same') });
  assert.equal(a.ids.scenarioVersionId,b.ids.scenarioVersionId);
  assert.equal(a.sourceHash,b.sourceHash);
});

test('snapshot import uses inserts, never upserts', () => {
  assert.match(IMPORT_PREFLIGHT_QUERY,/query ImportPreflight/);
  assert.match(INSERT_SCENARIO_SNAPSHOT_MUTATION,/mutation InsertScenarioSnapshot/);
  assert.match(INSERT_SCENARIO_SNAPSHOT_MUTATION,/@transaction/);
  assert.match(INSERT_SCENARIO_SNAPSHOT_MUTATION,/character_insertMany/);
  assert.doesNotMatch(INSERT_SCENARIO_SNAPSHOT_MUTATION,/clue_insertMany/);
  assert.match(INSERT_CLUES_BATCH_MUTATION,/clue_insertMany/);
  assert.match(INSERT_CLUE_FACTS_BATCH_MUTATION,/clueFact_insertMany/);
  for (const operation of [
    INSERT_ORGANIZATION_MUTATION,
    INSERT_SCENARIO_MUTATION,
    INSERT_SCENARIO_SNAPSHOT_MUTATION,
    INSERT_CLUES_BATCH_MUTATION,
    INSERT_CLUE_FACTS_BATCH_MUTATION,
    INSERT_OBJECTIVE_MUTATION,
    INSERT_RELATIONSHIP_MUTATION,
    INSERT_GAME_OBJECT_MUTATION,
    INSERT_RESOURCE_MUTATION,
    INSERT_RESOURCE_ASSIGNMENT_MUTATION,
    INSERT_STATE_DEFINITION_MUTATION,
  INSERT_ABILITY_MUTATION,
  INSERT_ABILITY_ASSIGNMENT_MUTATION,
  INSERT_INTERACTION_MUTATION,
  INSERT_LOCATION_MUTATION,
  INSERT_PHASE_DEFINITION_MUTATION,
  INSERT_EVENT_DEFINITION_MUTATION,
  INSERT_VOTE_DEFINITION_MUTATION,
  INSERT_VOTE_OPTION_DEFINITION_MUTATION,
  ]) {
    assert.doesNotMatch(operation,/_upsert/);
  }
});

test('first import inserts parents, snapshot and enrichment', async () => {
  const plan = buildImportPlan(workbook(), { sourceBuffer:Buffer.from('same') });
  const writes = [];
  let reads = 0;
  const result = await persistImportPlan(plan, { counts:{ERROR:0} }, {
    reader: async (operation) => {
      reads += 1;
      if (operation === IMPORT_PREFLIGHT_QUERY) return { data:{ organization:null, scenario:null, scenarioVersion:null } };
      if (operation === EXISTING_ENRICHMENT_QUERY) return { data:{ objectives:[], relationships:[], gameObjects:[], resources:[], resourceAssignments:[], gameStateDefinitions:[], abilities:[], abilityAssignments:[], interactions:[], gameLocations:[], gamePhaseDefinitions:[], gameEventDefinitions:[], voteDefinitions:[], voteOptionDefinitions:[], clues:[{externalId:'CLUE_1'}], clueFacts:[{clueExternalId:'CLUE_1',factExternalId:'FACT_1'}] } };
      assert.fail('Unexpected read operation');
    },
    executor: async (operation, variables) => {
      writes.push({ operation, variables });
      return { data:{ ok:true } };
    },
  });
  assert.equal(reads,2);
  assert.equal(writes.length,20);
  assert.equal(writes[0].operation, INSERT_ORGANIZATION_MUTATION);
  assert.equal(writes[1].operation, INSERT_SCENARIO_MUTATION);
  assert.equal(writes[2].operation, INSERT_SCENARIO_SNAPSHOT_MUTATION);
  assert.equal(JSON.parse(writes[2].variables.scenarioVersion.importReportJson).counts.ERROR,0);
  assert.equal(writes[3].operation, INSERT_CLUES_BATCH_MUTATION);
  assert.equal(writes[4].operation, INSERT_CLUE_FACTS_BATCH_MUTATION);
  assert.equal(writes[5].operation, INSERT_OBJECTIVE_MUTATION);
  assert.equal(writes[6].operation, INSERT_RELATIONSHIP_MUTATION);
  assert.equal(writes[7].operation, INSERT_GAME_OBJECT_MUTATION);
  assert.equal(writes[8].operation, INSERT_RESOURCE_MUTATION);
  assert.equal(writes[9].operation, INSERT_RESOURCE_ASSIGNMENT_MUTATION);
  assert.equal(writes[10].operation, INSERT_STATE_DEFINITION_MUTATION);
  assert.equal(writes[11].operation, INSERT_ABILITY_MUTATION);
  assert.equal(writes[12].operation, INSERT_ABILITY_ASSIGNMENT_MUTATION);
  assert.equal(writes[13].operation, INSERT_INTERACTION_MUTATION);
  assert.equal(writes[14].operation, INSERT_LOCATION_MUTATION);
  assert.equal(writes[15].operation, INSERT_PHASE_DEFINITION_MUTATION);
  assert.equal(writes[16].operation, INSERT_EVENT_DEFINITION_MUTATION);
  assert.equal(writes[17].operation, INSERT_VOTE_DEFINITION_MUTATION);
  assert.equal(writes[18].operation, INSERT_VOTE_OPTION_DEFINITION_MUTATION);
  assert.equal(writes[19].operation, MARK_RUNTIME_SOURCE_MUTATION);
  assert.equal(result.baseInserted,true);
  assert.deepEqual(result.imported,{ clues:1, clueFacts:1, objectives:1, relationships:1, documents:0, mediaAssets:0, skinVisualDefinitions:0, gameObjects:1, resources:1, resourceAssignments:1, stateDefinitions:1, abilities:1, abilityAssignments:1, interactions:1, locations:1, phaseDefinitions:1, eventDefinitions:1, voteDefinitions:1, voteOptionDefinitions:1 });
});

test('re-import of same immutable version skips base and only inserts missing enrichment', async () => {
  const plan = buildImportPlan(workbook(), { sourceBuffer:Buffer.from('same') });
  const writes = [];
  const result = await persistImportPlan(plan, {}, {
    reader: async (operation) => {
      if (operation === IMPORT_PREFLIGHT_QUERY) return { data:{ organization:{id:plan.ids.organizationId}, scenario:{id:plan.ids.scenarioId}, scenarioVersion:{id:plan.ids.scenarioVersionId} } };
      if (operation === EXISTING_ENRICHMENT_QUERY) return { data:{ objectives:[], relationships:[], gameObjects:[], resources:[], resourceAssignments:[], gameStateDefinitions:[], abilities:[], abilityAssignments:[], interactions:[], gameLocations:[], gamePhaseDefinitions:[], gameEventDefinitions:[], voteDefinitions:[], voteOptionDefinitions:[] } };
      assert.fail('Unexpected read operation');
    },
    executor: async (operation, variables) => {
      writes.push({ operation, variables });
      return { data:{ ok:true } };
    },
  });
  assert.equal(writes.length,15);
  assert.equal(writes[0].operation, INSERT_OBJECTIVE_MUTATION);
  assert.equal(writes[1].operation, INSERT_RELATIONSHIP_MUTATION);
  assert.equal(writes[14].operation, MARK_RUNTIME_SOURCE_MUTATION);
  assert.equal(result.baseInserted,false);
});

test('fully imported immutable version becomes a safe no-op', async () => {
  const plan = buildImportPlan(workbook(), { sourceBuffer:Buffer.from('same') });
  let writes = 0;
  const result = await persistImportPlan(plan, {}, {
    reader: async (operation) => {
      if (operation === IMPORT_PREFLIGHT_QUERY) return { data:{ organization:{id:'o'}, scenario:{id:'s'}, scenarioVersion:{id:'v',runtimeDataVersion:'0.9',skinId:'CONTEMPORARY_1980_2000',accentColor:null,logoMediaExternalId:null,backgroundMediaExternalId:null} } };
      if (operation === EXISTING_ENRICHMENT_QUERY) return { data:{ objectives:[{externalId:'OBJ_1'}], relationships:[{externalId:'REL_1'}], gameObjects:[{externalId:'ITEM_1'}], resources:[{externalId:'RES_PA'}], resourceAssignments:[{externalId:'RA_1'}], gameStateDefinitions:[{externalId:'STATE_BLESSE'}], abilities:[{externalId:'ABILITY_FOUILLE'}], abilityAssignments:[{externalId:'ASSIGN_A_FOUILLE'}], interactions:[{externalId:'ACT_FOUILLE'}], gameLocations:[{externalId:'LOC_BUREAU'}], gamePhaseDefinitions:[{externalId:'PHASE_1'}], gameEventDefinitions:[{externalId:'EVENT_1'}], voteDefinitions:[{externalId:'VOTE_1'}], voteOptionDefinitions:[{externalId:'OPT_1'}], clues:[{externalId:'CLUE_1'}], clueFacts:[{clueExternalId:'CLUE_1',factExternalId:'FACT_1'}] } };
      assert.fail('Unexpected read operation');
    },
    executor: async () => { writes += 1; return { data:{} }; },
  });
  assert.equal(writes,0);
  assert.equal(result.baseInserted,false);
  assert.deepEqual(result.imported,{ clues:0, clueFacts:0, objectives:0, relationships:0, documents:0, mediaAssets:0, skinVisualDefinitions:0, gameObjects:0, resources:0, resourceAssignments:0, stateDefinitions:0, abilities:0, abilityAssignments:0, interactions:0, locations:0, phaseDefinitions:0, eventDefinitions:0, voteDefinitions:0, voteOptionDefinitions:0 });
});

test('clue imports are split into Data Connect batches of at most 100 rows', async () => {
  const plan = buildImportPlan(workbook(), { sourceBuffer:Buffer.from('large-clues') });
  const baseClue = plan.clues[0];
  plan.clues = Array.from({length:136},(_,i)=>({...baseClue,externalId:`CLUE_${String(i+1).padStart(3,'0')}`}));
  plan.clueFacts = plan.clues.map(clue=>({
    scenarioVersionId:plan.ids.scenarioVersionId,
    clueExternalId:clue.externalId,
    factExternalId:'FACT_1',
  }));

  const calls=[];
  const result=await persistImportPlan(plan,{},{
    reader:async operation=>{
      if(operation===IMPORT_PREFLIGHT_QUERY)return {data:{
        organization:{id:plan.ids.organizationId},
        scenario:{id:plan.ids.scenarioId},
        scenarioVersion:{
          id:plan.ids.scenarioVersionId,
          runtimeDataVersion:'0.9',
          skinId:plan.scenarioVersion.skinId,
          accentColor:plan.scenarioVersion.accentColor,
          logoMediaExternalId:plan.scenarioVersion.logoMediaExternalId,
          backgroundMediaExternalId:plan.scenarioVersion.backgroundMediaExternalId,
        },
      }};
      if(operation===EXISTING_ENRICHMENT_QUERY)return {data:{
        objectives:plan.objectives.map(x=>({externalId:x.externalId})),
        relationships:plan.relationships.map(x=>({externalId:x.externalId})),
        documentDefinitions:[],
        mediaAssets:[],
        skinVisualDefinitions:[],
        gameObjects:plan.gameObjects.map(x=>({externalId:x.externalId})),
        resources:plan.resources.map(x=>({externalId:x.externalId})),
        resourceAssignments:plan.resourceAssignments.map(x=>({externalId:x.externalId})),
        gameStateDefinitions:plan.stateDefinitions.map(x=>({externalId:x.externalId})),
        abilities:plan.abilities.map(x=>({externalId:x.externalId})),
        abilityAssignments:plan.abilityAssignments.map(x=>({externalId:x.externalId})),
        interactions:plan.interactions.map(x=>({externalId:x.externalId})),
        gameLocations:plan.locations.map(x=>({externalId:x.externalId})),
        gamePhaseDefinitions:plan.phaseDefinitions.map(x=>({externalId:x.externalId})),
        gameEventDefinitions:plan.eventDefinitions.map(x=>({externalId:x.externalId})),
        voteDefinitions:plan.voteDefinitions.map(x=>({externalId:x.externalId})),
        voteOptionDefinitions:plan.voteOptionDefinitions.map(x=>({externalId:x.externalId})),
        clues:[],
        clueFacts:[],
      }};
      assert.fail('Unexpected read operation');
    },
    executor:async(operation,variables)=>{
      calls.push({operation,variables});
      return {data:{}};
    },
  });

  const clueCalls=calls.filter(x=>x.operation===INSERT_CLUES_BATCH_MUTATION);
  const clueFactCalls=calls.filter(x=>x.operation===INSERT_CLUE_FACTS_BATCH_MUTATION);
  assert.deepEqual(clueCalls.map(x=>x.variables.data.length),[100,36]);
  assert.deepEqual(clueFactCalls.map(x=>x.variables.data.length),[100,36]);
  assert.equal(result.imported.clues,136);
  assert.equal(result.imported.clueFacts,136);
});

test('immersive documents import media and synthesize a transferable object', () => {
  const wb = workbook();
  wb.sheets.MEDIA = [{ media_id:'MEDIA_LETTER', type_media:'IMAGE', fichier_ou_url:'/immersive/test/letter.png', alt_text:'Lettre manuscrite', notes:'test', actif:'TRUE' }];
  wb.sheets.DOCUMENTS = [{ document_id:'DOC_LETTER', titre:'Lettre secrète', contenu_texte:'Cher ami...', support:'DIGITAL', media_id:'MEDIA_LETTER', reutilisable:'TRUE', consommable:'FALSE', owner_initial_type:'CHARACTER', owner_initial_id:'CHAR_A', clue_ids:'CLUE_1', code_logistique:'D-01', actif:'TRUE', transferable:'TRUE', volable:'TRUE' }];
  wb.sheets.INDICES[0].document_id='DOC_LETTER';
  wb.sheets.INDICES[0].media_id='MEDIA_LETTER';
  const plan=buildImportPlan(wb,{sourceBuffer:Buffer.from('immersive-doc')});
  assert.equal(plan.documents.length,1);
  assert.equal(plan.mediaAssets.length,1);
  assert.equal(plan.documents[0].mediaExternalIds,'MEDIA_LETTER');
  assert.equal(plan.mediaAssets[0].source,'/immersive/test/letter.png');
  assert.equal(plan.clues[0].objectExternalId,'DOC_OBJ_DOC_LETTER');
  const object=plan.gameObjects.find(o=>o.externalId==='DOC_OBJ_DOC_LETTER');
  assert.ok(object);
  assert.equal(object.ownerInitialExternalId,'CHAR_A');
  assert.equal(object.transferable,true);
  assert.equal(object.stealable,true);
});

test('Visual V2 imports skin archetypes', () => {
  const wb=workbook();
  wb.sheets.THEME=[{theme_id:'THEME_1',skin_id:'RETRO_1900_1930'}];
  wb.sheets.PERSONNAGES[0].portrait_archetype_code='HENCHMAN';
  wb.sheets.OBJETS[0].media_id='MEDIA_KEY';
  wb.sheets.OBJETS[0].visual_archetype_code='KEY';
  wb.sheets.MEDIA=[
    {media_id:'MEDIA_HENCHMAN',type_media:'IMAGE',fichier_ou_url:'/visual/henchman.webp',actif:'TRUE'},
    {media_id:'MEDIA_KEY',type_media:'IMAGE',fichier_ou_url:'/visual/key.webp',actif:'TRUE'}
  ];
  wb.sheets.VISUELS_SKIN=[{
    visual_id:'VIS_HENCHMAN',skin_id:'RETRO_1900_1930',visual_type:'CHARACTER',
    archetype_code:'HENCHMAN',media_id:'MEDIA_HENCHMAN',variant:'DEFAULT',actif:'TRUE'
  }];
  const plan=buildImportPlan(wb,{sourceBuffer:Buffer.from('visual-v2')});
  assert.equal(plan.characters[0].portraitArchetypeCode,'HENCHMAN');
  assert.equal(plan.gameObjects[0].mediaExternalId,'MEDIA_KEY');
  assert.equal(plan.gameObjects[0].visualArchetypeCode,'KEY');
  assert.equal(plan.skinVisualDefinitions[0].mediaExternalId,'MEDIA_HENCHMAN');
});

test('scenario version metadata comes from Excel and gender profile can be inferred', () => {
  const wb = workbook();
  wb.sheets.SCENARIO[0].nom_version = '15 joueurs — mixte';
  wb.sheets.SCENARIO[0].profil_genre = 'ADAPTABLE';
  wb.sheets.SCENARIO[0].notes_version = 'Version de référence.';
  wb.sheets.PERSONNAGES[0].genre = 'FEMININ';
  const plan = buildImportPlan(wb, { sourceBuffer:Buffer.from('variant-meta') });
  assert.equal(plan.scenarioVersion.variantName, '15 joueurs — mixte');
  assert.equal(plan.scenarioVersion.genderProfile, 'ADAPTABLE');
  assert.equal(plan.scenarioVersion.variantNotes, 'Version de référence.');

  delete wb.sheets.SCENARIO[0].profil_genre;
  wb.sheets.PERSONNAGES.push({ character_id:'CHAR_B', nom_personnage:'Bob', genre:'NEUTRE', importance:'MAIN', intensite:'STANDARD', biographie:'Bio', jouable:'TRUE', actif:'TRUE' });
  const inferred = buildImportPlan(wb, { sourceBuffer:Buffer.from('variant-meta-2') });
  assert.equal(inferred.scenarioVersion.genderProfile, 'ADAPTABLE');
});


test('character interactions import DIRECT/DISCRET scan mode with legacy fallback', () => {
  const wb = workbook();
  wb.sheets.INTERACTIONS = [
    { ...wb.sheets.INTERACTIONS[0], interaction_id:'ACT_DIRECT', target_type:'CHARACTER', scan_mode:'DIRECT', secret_cible:'TRUE' },
    { ...wb.sheets.INTERACTIONS[0], interaction_id:'ACT_DISCRET', target_type:'CHARACTER', scan_mode:'DISCRET', secret_cible:'FALSE' },
    { ...wb.sheets.INTERACTIONS[0], interaction_id:'ACT_LEGACY', target_type:'CHARACTER', scan_mode:'', secret_cible:'TRUE' },
  ];
  const plan = buildImportPlan(wb, { sourceBuffer:Buffer.from('scan-mode') });
  assert.deepEqual(plan.interactions.map(i=>i.scanMode), ['DIRECT','DISCRET','DISCRET']);
});
