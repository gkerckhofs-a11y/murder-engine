# Murder Engine — Examiner un document (V1)

## Principe
L'image et la description ordinaires d'un indice sont visibles par son détenteur.
Le bouton **Examiner** n'apparaît que pour les indices/objets associés à au moins
une règle d'analyse. Il ne coûte aucun PA et ne demande pas de validation MJ.

Le serveur contrôle :
1. lien joueur actif, session LIVE ;
2. présence **actuelle** de l'objet dans le Sac du personnage, ou découverte d'un indice numérique ;
3. compétence assignée à ce personnage, active, et niveau >= seuil ;
4. faits correspondants, actifs et privés.

Les faits déchiffrés sont enregistrés dans **SessionKnowledge** avec la source
DOCUMENT_ANALYSIS. Ils restent dans le Carnet même si le personnage échange ensuite
l'objet. Un nouveau détenteur doit cliquer sur Examiner et posséder les compétences
appropriées : les interprétations ne sont pas transférées automatiquement.

L'absence de compétence ne consomme pas de PA et ne divulgue pas les textes
des autres niveaux. Les anciens scénarios sans ANALYSES restent inchangés.

## Configuration dans le master

L'onglet **ANALYSES** est facultatif. Champs obligatoires :

| Champ | Exemple | Sens |
|---|---|---|
| analysis_id | ANA_TELE_1 | Identifiant unique |
| target_type | DOCUMENT | DOCUMENT, CLUE ou OBJECT |
| target_id | DOC_TELEFORCE | Identifiant dans DOCUMENTS, INDICES (clue_id) ou OBJETS (object_id) |
| ability_id | AB_TELEFORCE | Compétence du master CAPACITES (vide = aucune compétence requise) |
| min_level | 1 | Niveau minimal entier >= 0 |
| fact_id | F_TELE_PARTIAL | Fait existant dans FAITS, révélé au succès |
| actif | TRUE | Activation |

Les seuils sont **cumulatifs** : un expert niveau 2 déverrouille aussi les
analyses niveau 1 de la même compétence. Plusieurs compétences distinctes peuvent
fournir plusieurs interprétations du même objet (ex. traduction et faux).

Les contenus révélés sont rédigés **manuellement par l'auteur du scénario** dans
FAITS. Murder Engine ne traduit pas réellement des images, ne reconnaît pas
un faux par reconnaissance automatique, et ne transmet aucune image à une IA.

## Exemple : Nid d'espions

Dans CAPACITES :

- AB_TELEFORCE : Analyse Teleforce ; Karl niveau 1, Catherine et Erik niveau 2
- AB_CHRONOS : Analyse Chronos ; Karl niveau 1, Erik et Bianca niveau 2
- AB_SYNCHRO : Analyse Synchronisation ; Bianca niveau 2

Dans ANALYSES (illustratif, identifiants définitifs à aligner sur le master) :

| analysis_id | target_type | target_id | ability_id | min_level | fact_id | actif |
|---|---|---|---|---:|---|---|
| ANA_T1 | DOCUMENT | DOC_TELEFORCE | AB_TELEFORCE | 1 | F_TELE_PARTIAL | TRUE |
| ANA_T2 | DOCUMENT | DOC_TELEFORCE | AB_TELEFORCE | 2 | F_TELE_EXPERT | TRUE |
| ANA_C1 | DOCUMENT | DOC_CHRONOS | AB_CHRONOS | 1 | F_CHRONOS_PARTIAL | TRUE |
| ANA_C2 | DOCUMENT | DOC_CHRONOS | AB_CHRONOS | 2 | F_CHRONOS_EXPERT | TRUE |

Dans FAITS, chaque ligne contient un titre et une explication réservée à
l'examinateur qualifié (public = FALSE, ne pas ajouter à starting_fact_ids).

## Autre scénario : archéologue

L'auteur importe une image montrant des signes cunéiformes dans DOCUMENTS +
INDICES, puis définit la compétence AB_CUNEIFORME dans CAPACITES.

Il attribue cette compétence niveau 2 à l'archéologue. Dans ANALYSES, la ligne :

ANA_CUN_1 | DOCUMENT | DOC_TABLETTE | AB_CUNEIFORME | 2 | F_TRADUCTION | TRUE

F_TRADUCTION contient, par exemple, la traduction fictive rédigée par le scénariste.
N'importe quel joueur peut voir les signes ; **seul celui qui possède la
compétence et la tablette** peut obtenir ce texte par Examiner.

Une deuxième règle avec AB_AUTHENTICITE peut montrer aux experts en faux que
la tablette est une contrefaçon, sans révéler automatiquement sa traduction.

## Remarques techniques

- Les règles privées sont en base dans DocumentAnalysisDefinition ; elles ne
  sont jamais envoyées au portail joueur.
- Le client ne fournit que targetType et targetExternalId ; compétence, niveau,
  possession et faits sont toujours vérifiés côté serveur.
- Les informations de résultat apparaissent dans la fenêtre d'examen, puis dans
  Carnet > Infos grâce à SessionKnowledge.
- Pour les documents physiques importés via DOCUMENTS, l'objet généré par le
  master porte l'ID DOC_OBJ_<document_id>. Les règles peuvent viser directement
  le document, sans connaître cet identifiant généré.
- Pour un indice virtuel non associé à un objet, la découverte représente un
  exemplaire numérique conservé dans le Sac et peut être examiné.
- Un document déjà vu mais transféré **n'est plus examinable** par l'ancien
  détenteur ; seules ses connaissances déjà acquises restent disponibles.
- Ne jamais inscrire un résultat caché dans contenu_texte, texte_joueur, alt_text,
  identification_0 ou les autres champs communs visibles du document.
- L'onglet ANALYSES est optionnel ; aucune migration de master n'est requise
  pour les scénarios qui ne font pas appel à cette fonction.
