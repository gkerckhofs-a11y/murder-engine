# Murder Engine Ludificateur — V1.6.2

V1.6.2 ajoute les **documents immersifs numériques** au frontend joueur, sans remplacer les accessoires physiques qui apportent réellement du jeu.

## Principe

Un document documentaire peut désormais être traité comme un véritable prop numérique : lettre, photographie, télégramme, coupure de presse, rapport, contrat, billet, plan, etc.

- **Sac** : le joueur possède le support tangible/numérique et voit son fac-similé.
- **Carnet** : le joueur conserve l'information apprise et peut rouvrir le document découvert.
- **Don / vol** : le support change de propriétaire via les mécaniques existantes, tandis que l'information déjà acquise reste mémorisée.

## Lecteur immersif

Le frontend joueur dispose d'un lecteur plein écran :

- image simple ;
- plusieurs images ordonnées pour un document multipage ou recto/verso ;
- zoom + / − et remise à zéro ;
- miniature dans le Sac ;
- réouverture depuis le Carnet ;
- fallback « papier numérique » lorsque le document ne possède encore aucun visuel.

Le joueur voit donc le document lui-même, et non une simple fiche d'indice.

## Standard Excel V1.4

`MEDIA` décrit les ressources visuelles :

- `media_id`
- `type_media`
- `fichier_ou_url`
- `alt_text`
- `notes`
- `actif`

`DOCUMENTS` peut associer un ou plusieurs médias via `media_ids` (séparés par `;`). Les colonnes `transferable` et `volable` pilotent le comportement du support documentaire.

Un document importé est automatiquement matérialisé dans le runtime comme objet documentaire (`DOC_OBJ_<document_id>`), ce qui permet de réutiliser les transferts et vols existants sans mécanique parallèle.

## Cosa Nostra

Le projet embarque dans Hosting plusieurs fac-similés provenant du dossier final Cosa Nostra : photographies, billets, plans, carte d'agent, journaux, etc. Le classeur `COSA_NOSTRA_MURDER_ENGINE_V1_6_2_IMMERSIVE.xlsx` les référence via `/immersive/cosa-nostra/...`.

Les documents dépourvus d'image restent parfaitement jouables grâce au rendu papier à partir de `contenu_texte`.

## Backend / Data Connect

Deux nouvelles entités persistantes :

- `MediaAsset`
- `DocumentDefinition`

L'import reste **insert-only** et les snapshots de `ScenarioVersion` restent immuables.

## Validation

- Backend : **106/106 tests**.
- Syntaxe Node des modules backend modifiés : OK.
- Les classeurs V1.4 et Cosa Nostra immersive ont été contrôlés avec `artifact_tool`.
- Le build Vite complet doit être lancé dans Cloud Shell, l'environnement de génération ne contenant pas `web/node_modules`.
