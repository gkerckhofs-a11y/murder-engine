export const CONTRACT_VERSION = '1.7';

export const REQUIRED_SHEETS = [
  'SCENARIO', 'PERSONNAGES', 'OBJECTIFS', 'INTRIGUES', 'FAITS', 'INDICES',
  'INTERACTIONS', 'PHASES', 'EVENEMENTS'
];

export const SHEETS = {
  SCENARIO: { id: 'scenario_id', required: ['scenario_id','titre','resume_mj','resume_joueur','duree_minutes','min_joueurs','max_joueurs','langue_defaut','version','statut'] },
  THEME: { id: 'theme_id', required: ['theme_id'] },
  PERSONNAGES: { id: 'character_id', required: ['character_id','nom_personnage','importance','intensite','biographie','public_nom','public_role','jouable','actif'] },
  FACTIONS: { id: 'faction_id', required: ['faction_id','nom','visibilite','background','actif'] },
  MEMBRES_FACTION: { id: 'membership_id', required: ['membership_id','character_id','faction_id','visibilite','principal','actif'] },
  RELATIONS: { id: 'relation_id', required: ['relation_id','character_a_id','character_b_id','texte_a','visibilite','actif'] },
  OBJECTIFS: { id: 'objective_id', required: ['objective_id','owner_type','owner_id','titre','description','type_objectif','secret','statut_initial','actif'] },
  INTRIGUES: { id: 'plot_id', required: ['plot_id','titre','type_intrigue','importance','resume_mj','actif'] },
  FAITS: { id: 'fact_id', required: ['fact_id','titre_court','texte','nature','importance','public','actif'] },
  INDICES: { id: 'clue_id', required: ['clue_id','nom_interne','nom_joueur','type_indice','texte_joueur','interpretation_mj','support','partageable','transferable','consommable','majeur','presentation_mode','ajouter_au_carnet','actif'] },
  OBJETS: { id: 'object_id', required: ['object_id','nom','description','support','owner_initial_type','transferable','volable','consommable','critique','actif'] },
  DOCUMENTS: { id: 'document_id', required: ['document_id','titre','contenu_texte','support','reutilisable','consommable','owner_initial_type','actif'] },
  LIEUX: { id: 'location_id', required: ['location_id','nom','description','permanent','actif'] },
  VERROUS: { id: 'lock_id', required: ['lock_id','target_type','target_id','lock_type','case_sensitive','success_text','failure_text','actif'] },
  CAPACITES: { id: 'ability_id', required: ['ability_id','nom','description','categorie','secrete','actif'] },
  ATTRIB_CAPACITES: { id: 'assignment_id', required: ['assignment_id','owner_type','owner_id','ability_id','niveau','actif'] },
  INTERACTIONS: { id: 'interaction_id', required: ['interaction_id','nom','categorie','target_type','resolution','validation','secret_cible','actif'] },
  CONDITIONS: { id: 'condition_id', required: ['condition_id','parent_type','parent_id','groupe','logique','condition_type','subject_selector','operator','value','actif'] },
  EFFETS: { id: 'effect_id', required: ['effect_id','parent_type','parent_id','trigger_result','ordre','effect_type','target_selector','actif'] },
  ETATS: { id: 'state_id', required: ['state_id','nom','description','visible_porteur','visible_public','actif'] },
  RESSOURCES: { id: 'resource_id', required: ['resource_id','nom','scope_type','mode_physique','public','actif'] },
  ATTRIB_RESSOURCES: { id: 'resource_assignment_id', required: ['resource_assignment_id','owner_type','resource_id','initial_value'] },
  VARIABLES: { id: 'variable_id', required: ['variable_id','nom','type','scope','initial_value','actif'] },
  PHASES: { id: 'phase_id', required: ['phase_id','nom','ordre','description_mj','trigger_type','manual_confirm','actif'] },
  EVENEMENTS: { id: 'event_id', required: ['event_id','titre','description_mj','trigger_type','validation','priorite','obligatoire','repetable','actif'] },
  NOTIFICATIONS: { id: 'notification_id', required: ['notification_id','type','titre','corps','audience_type','priorite','persistence','track_read','secret','actif'] },
  VOTES: { id: 'vote_id', required: ['vote_id','titre','question','scope_type','choices_mode','secret','votes_par_electeur','pondere','abstention','modifiable','close_mode','result_visibility','actif'] },
  OPTIONS_VOTE: { id: 'vote_option_id', required: ['vote_option_id','vote_id','ordre','label','actif'] },
  MEDIA: { id: 'media_id', required: ['media_id','type_media','fichier_ou_url','actif'] },
  VISUELS_SKIN: { id: 'visual_id', required: ['visual_id','skin_id','visual_type','archetype_code','media_id','actif'] },
  PROPS_REQUIS: { id: 'prop_requirement_id', required: ['prop_requirement_id','nom','type_prop','quantite_requise','actif'] },
  TRADUCTIONS: { id: 'translation_id', required: ['translation_id','entity_type','entity_id','field_name','langue','texte','actif'] }
};

export const splitIds = (value) => {
  if (value === null || value === undefined || value === '') return [];
  return String(value).split(';').map(v => v.trim()).filter(Boolean);
};
