import { REQUIRED_SHEETS, SHEETS, splitIds } from './contract.mjs';

const empty = (v) => v === null || v === undefined || v === '';
const active = (row) => row.actif !== 'FALSE' && row.actif !== false;

function diag(severity, ruleId, entityType, entityId, message, detail = '', blocking = false) {
  return { severity, ruleId, entityType, entityId: entityId ?? '', message, detail, blocking };
}

export function buildIndexes(workbook) {
  const indexes = {};
  for (const [sheet, rows] of Object.entries(workbook.sheets)) {
    const idField = SHEETS[sheet]?.id;
    if (!idField) continue;
    indexes[sheet] = new Set(rows.map(r => r[idField]).filter(Boolean));
  }
  return indexes;
}

export function validateWorkbook(workbook) {
  const diagnostics = [];
  const indexes = buildIndexes(workbook);

  for (const sheet of REQUIRED_SHEETS) {
    if (!workbook.sheets[sheet]) diagnostics.push(diag('ERROR','SHEET_REQUIRED',sheet,'',`Onglet obligatoire absent : ${sheet}.`,'',true));
  }

  for (const [sheet, spec] of Object.entries(SHEETS)) {
    const rows = workbook.sheets[sheet];
    if (!rows) continue;
    const seen = new Set();
    for (const row of rows) {
      const id = row[spec.id];
      if (String(id ?? '').startsWith('EXAMPLE_')) continue;
      for (const field of spec.required) {
        if (empty(row[field])) diagnostics.push(diag('ERROR','FIELD_REQUIRED',sheet,id,`Champ obligatoire vide : ${field}.`,'',true));
      }
      if (id) {
        if (seen.has(id)) diagnostics.push(diag('ERROR','ID_DUPLICATE',sheet,id,'Identifiant dupliqué.','',true));
        seen.add(id);
      }
    }
  }

  const ref = (sheet, row, field, target, list = false, required = false) => {
    const values = list ? splitIds(row[field]) : (empty(row[field]) ? [] : [row[field]]);
    if (required && values.length === 0) diagnostics.push(diag('ERROR','REF_REQUIRED',sheet,row[SHEETS[sheet]?.id],`Référence obligatoire absente : ${field}.`,'',true));
    for (const value of values) {
      if (!indexes[target]?.has(value)) diagnostics.push(diag('ERROR','REF_MISSING',sheet,row[SHEETS[sheet]?.id],`Référence introuvable : ${value}.`,`Champ ${field} → ${target}`,true));
    }
  };

  for (const r of workbook.sheets.PERSONNAGES ?? []) ref('PERSONNAGES',r,'starting_fact_ids','FAITS',true);
  for (const r of workbook.sheets.RELATIONS ?? []) {
    ref('RELATIONS',r,'character_a_id','PERSONNAGES',false,true); ref('RELATIONS',r,'character_b_id','PERSONNAGES',false,true);
    if (r.plot_id) ref('RELATIONS',r,'plot_id','INTRIGUES');
  }
  for (const r of workbook.sheets.OBJECTIFS ?? []) {
    const target = r.owner_type === 'CHARACTER' ? 'PERSONNAGES' : r.owner_type === 'FACTION' ? 'FACTIONS' : null;
    if (!target) diagnostics.push(diag('ERROR','OWNER_TYPE','OBJECTIFS',r.objective_id,`owner_type non supporté : ${r.owner_type}.`,'',true));
    else ref('OBJECTIFS',r,'owner_id',target,false,true);
  }
  for (const r of workbook.sheets.FAITS ?? []) if (r.plot_id) ref('FAITS',r,'plot_id','INTRIGUES');
  for (const r of workbook.sheets.INDICES ?? []) {
    ref('INDICES',r,'fact_ids','FAITS',true);
    if (r.plot_id) ref('INDICES',r,'plot_id','INTRIGUES');
    if (r.location_id) ref('INDICES',r,'location_id','LIEUX');
    if (r.object_id) ref('INDICES',r,'object_id','OBJETS');
    if (r.document_id) ref('INDICES',r,'document_id','DOCUMENTS');
    if (r.media_id) ref('INDICES',r,'media_id','MEDIA');
  }
  for (const r of workbook.sheets.OBJETS ?? []) {
    if (r.prop_requirement_id) ref('OBJETS',r,'prop_requirement_id','PROPS_REQUIS');
    if (r.owner_initial_type === 'CHARACTER' && r.owner_initial_id) ref('OBJETS',r,'owner_initial_id','PERSONNAGES');
    if (r.owner_initial_type === 'LOCATION' && r.owner_initial_id) ref('OBJETS',r,'owner_initial_id','LIEUX');
    if (r.owner_initial_type === 'FACTION' && r.owner_initial_id) ref('OBJETS',r,'owner_initial_id','FACTIONS');
  }
  for (const r of workbook.sheets.DOCUMENTS ?? []) {
    ref('DOCUMENTS',r,'clue_ids','INDICES',true);
    if (r.media_id) ref('DOCUMENTS',r,'media_id','MEDIA');
    if (r.prop_requirement_id) ref('DOCUMENTS',r,'prop_requirement_id','PROPS_REQUIS');
  }
  for (const r of workbook.sheets.ATTRIB_CAPACITES ?? []) {
    ref('ATTRIB_CAPACITES',r,'ability_id','CAPACITES',false,true);
    if (r.owner_type === 'CHARACTER') ref('ATTRIB_CAPACITES',r,'owner_id','PERSONNAGES',false,true);
  }
  for (const r of workbook.sheets.INTERACTIONS ?? []) {
    if (r.ability_id) ref('INTERACTIONS',r,'ability_id','CAPACITES');
    if (r.cost_resource_id) ref('INTERACTIONS',r,'cost_resource_id','RESSOURCES');
    const targetType = String(r.target_type ?? '').toUpperCase();
    const scanMode = String(r.scan_mode ?? '').trim().toUpperCase();
    if (scanMode && !['DIRECT','DISCRET','SELECT'].includes(scanMode)) diagnostics.push(diag('ERROR','SCAN_MODE_INVALID','INTERACTIONS',r.interaction_id,`scan_mode non supporté : ${r.scan_mode}. Utiliser DIRECT, DISCRET ou SELECT.`,'',true));
    if (scanMode && !['PLAYER','CHARACTER'].includes(targetType)) diagnostics.push(diag('WARNING','SCAN_MODE_NON_CHARACTER','INTERACTIONS',r.interaction_id,'scan_mode est ignoré car la cible n’est pas un personnage.'));
    if (r.resolution === 'DICE' && [r.dice_count,r.dice_sides,r.difficulty].some(empty)) diagnostics.push(diag('ERROR','DICE_INCOMPLETE','INTERACTIONS',r.interaction_id,'Paramètres de jet incomplets.','',true));
    if (r.resolution === 'OPPOSED' && (empty(r.opposed_ability_id) || empty(r.tie_rule))) diagnostics.push(diag('ERROR','OPPOSED_INCOMPLETE','INTERACTIONS',r.interaction_id,'Paramètres de jet opposé incomplets.','',true));
  }
  for (const r of workbook.sheets.OPTIONS_VOTE ?? []) ref('OPTIONS_VOTE',r,'vote_id','VOTES',false,true);

  // Game-design diagnostics
  const objectiveOwners = new Set((workbook.sheets.OBJECTIFS ?? []).filter(active).filter(r => r.statut_initial === 'ACTIVE').map(r => r.owner_id));
  for (const c of workbook.sheets.PERSONNAGES ?? []) {
    if (active(c) && c.jouable === 'TRUE' && !objectiveOwners.has(c.character_id)) diagnostics.push(diag('WARNING','CHAR_NO_OBJECTIVE','PERSONNAGES',c.character_id,'Personnage jouable sans objectif actif.'));
  }

  const cluesPerFact = new Map();
  for (const clue of workbook.sheets.INDICES ?? []) if (active(clue)) for (const factId of splitIds(clue.fact_ids)) cluesPerFact.set(factId,(cluesPerFact.get(factId) ?? 0)+1);
  const holdersPerFact = new Map();
  for (const c of workbook.sheets.PERSONNAGES ?? []) if (active(c)) for (const factId of splitIds(c.starting_fact_ids)) holdersPerFact.set(factId,(holdersPerFact.get(factId) ?? 0)+1);
  for (const fact of workbook.sheets.FAITS ?? []) {
    if (!active(fact) || fact.importance !== 'CRITICAL') continue;
    const paths = (cluesPerFact.get(fact.fact_id) ?? 0) + (holdersPerFact.get(fact.fact_id) ?? 0);
    if (paths === 0) diagnostics.push(diag('WARNING','CRITICAL_NO_PATH','FAITS',fact.fact_id,'Fait critique sans chemin de découverte.'));
    else if (paths === 1) diagnostics.push(diag('INFO','CRITICAL_ONE_PATH','FAITS',fact.fact_id,'Fait critique avec un seul chemin de découverte.'));
  }

  for (const clue of workbook.sheets.INDICES ?? []) {
    if (active(clue) && clue.majeur === 'TRUE' && splitIds(clue.fact_ids).length === 0) diagnostics.push(diag('WARNING','MAJOR_CLUE_NO_FACT','INDICES',clue.clue_id,'Indice majeur sans fait structuré associé.'));
  }

  const resourceAssignments = new Map();
  for (const a of workbook.sheets.ATTRIB_RESSOURCES ?? []) resourceAssignments.set(a.resource_id,(resourceAssignments.get(a.resource_id) ?? 0)+1);
  const resources = new Map((workbook.sheets.RESSOURCES ?? []).map(r => [r.resource_id,r]));
  const usedResources = new Set((workbook.sheets.INTERACTIONS ?? []).map(r => r.cost_resource_id).filter(Boolean));
  for (const resourceId of usedResources) {
    const r = resources.get(resourceId);
    if (r && empty(r.valeur_defaut) && !resourceAssignments.get(resourceId)) diagnostics.push(diag('ERROR','RESOURCE_UNINITIALIZED','RESSOURCES',resourceId,'Ressource utilisée comme coût mais non initialisée.','',true));
  }

  for (const e of workbook.sheets.EVENEMENTS ?? []) {
    const automatic = e.trigger_type !== 'MANUAL';
    if (active(e) && e.obligatoire === 'TRUE' && automatic && empty(e.fallback_mj)) diagnostics.push(diag('WARNING','EVENT_NO_FALLBACK','EVENEMENTS',e.event_id,'Événement obligatoire automatique sans fallback MJ.'));
  }

  const optionsPerVote = new Map();
  for (const o of workbook.sheets.OPTIONS_VOTE ?? []) if (active(o)) optionsPerVote.set(o.vote_id,(optionsPerVote.get(o.vote_id) ?? 0)+1);
  for (const v of workbook.sheets.VOTES ?? []) if (active(v) && v.choices_mode === 'OPTIONS' && !optionsPerVote.get(v.vote_id)) diagnostics.push(diag('ERROR','VOTE_NO_OPTIONS','VOTES',v.vote_id,'Vote sans option active.','',true));

  const gmInteractions = (workbook.sheets.INTERACTIONS ?? []).filter(r => active(r) && r.resolution === 'GM').length;
  if (gmInteractions) diagnostics.push(diag('INFO','GM_DEPENDENCY','INTERACTIONS','',`${gmInteractions} interaction(s) restent sous résolution MJ.`));

  const counts = diagnostics.reduce((acc,d) => { acc[d.severity]=(acc[d.severity] ?? 0)+1; return acc; }, {ERROR:0,WARNING:0,INFO:0});
  return { diagnostics, counts, blocking: diagnostics.some(d => d.blocking) };
}

export function summarizeWorkbook(workbook) {
  const count = (s) => (workbook.sheets[s] ?? []).filter(r => !String(r[SHEETS[s]?.id] ?? '').startsWith('EXAMPLE_') && active(r)).length;
  const scenarioRow = workbook.sheets.SCENARIO?.[0] ?? {};
  const playable = (workbook.sheets.PERSONNAGES ?? []).filter(r => active(r) && r.jouable !== 'FALSE' && r.jouable !== false);
  const normalizeGender = (value) => {
    const v = String(value ?? '').trim().toUpperCase();
    if (['F','FEMININ','FÉMININ','FEMME','WOMAN','FEMALE'].includes(v)) return 'F';
    if (['M','MASCULIN','H','HOMME','MAN','MALE'].includes(v)) return 'M';
    return 'A';
  };
  const genders = playable.reduce((acc,r) => { acc[normalizeGender(r.genre)] += 1; return acc; }, {F:0,M:0,A:0});
  const inferredProfile = genders.A === playable.length ? 'LIBRE' : genders.A > 0 ? 'ADAPTABLE' : 'FIXE';
  const genderComposition = [genders.F ? `${genders.F}F` : null, genders.M ? `${genders.M}M` : null, genders.A ? `${genders.A} adapt.` : null].filter(Boolean).join(' · ') || 'Non renseignée';
  return {
    scenario: scenarioRow.titre ?? 'Scénario sans titre',
    scenarioId: scenarioRow.scenario_id ?? '',
    versionLabel: scenarioRow.version ?? '',
    variantName: scenarioRow.nom_version ?? '',
    minPlayers: scenarioRow.min_joueurs ?? '',
    maxPlayers: scenarioRow.max_joueurs ?? '',
    genderProfile: String(scenarioRow.profil_genre ?? inferredProfile).toUpperCase(),
    genderComposition,
    templateVersion: workbook.templateVersion,
    characters: count('PERSONNAGES'), objectives: count('OBJECTIFS'), facts: count('FAITS'), clues: count('INDICES'),
    objects: count('OBJETS'), documents: count('DOCUMENTS'), locations: count('LIEUX'), abilities: count('CAPACITES'),
    interactions: count('INTERACTIONS'), events: count('EVENEMENTS'), votes: count('VOTES'), notifications: count('NOTIFICATIONS')
  };
}
