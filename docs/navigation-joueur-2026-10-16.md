# Navigation joueur après le débrief Showbiz

Base : `455831ce56bf7a38c30ddf00130a20c9f2458334`, corrections des votes déjà déployées.

- Quatre boutons légèrement agrandis : Sheets, Notebook, Play, Bag.
- Sheets : Story, Missions, Roleplay, My QR. Contenu conservé.
- Notebook : My notes, Relations, Info, Context. Les notes non enregistrées restent montées lors des changements d'onglet.
- Info fusionne connaissances, nouvelles et résultats de vote, du plus récent au plus ancien. Chaque indice autorisé a un rappel factuel court. Les rapprochements utilisent exclusivement les faits liés déjà connus de ce joueur ; leurs détails restent consultables. Aucun texte MJ, fait caché ou découverte d'un autre joueur n'alimente ces rappels. Un indice sans fait lié conserve un extrait de son propre texte : aucune interprétation spécifique n'est inventée.
- Info propose exactement quatre filtres dans cet ordre : All, Votes, Clues, Information (FR : Tout, Votes, Indices, Informations). Information regroupe les connaissances et les nouvelles. Les catégories du scénario restent descriptives dans les contenus et ne créent plus de boutons supplémentaires. Un élément masqué par un filtre reste non vu.
- Les règles sont accessibles dans Context.
- Bag : une seule page, avec les ressources puis les indices et objets, sans sous-onglets. Le sac réunit objets, documents possédés et découvertes conservées en mémoire après un transfert. Seuls les supports détenus gardent leurs actions de transfert.
- Les compteurs indiquent les éléments non vus, aux deux niveaux de navigation. Ils diminuent quand un élément est effectivement visible pendant 600 ms, jamais pour un onglet masqué ou une fenêtre inactive. Une nouvelle version d'un contenu ou un nouveau tour de vote peut réactiver le compteur.
- Les lectures sont mémorisées par partie, personnage et participant dans le navigateur ; les notifications sont aussi marquées lues via l'API existante. Les autres compteurs ne sont pas synchronisés entre appareils et peuvent réapparaître si le stockage du navigateur est effacé.
- Un QR personnage ouvert avec la caméra du téléphone affiche une explication FR/EN sans lancer d'action. Le lien de retour utilise exclusivement le lien joueur déjà enregistré et ouvre Play ; sans lien enregistré, la page demande de rouvrir le lien personnel de l'organisateur. Aucun code technique de personnage n'est affiché.

## Vérifications

Tests unitaires de navigation et des règles de confidentialité des rappels. Tests navigateur sur réponses API fictives uniquement : quatre boutons, sous-rubriques, visibilité réelle, persistance des lectures, pièces transférées et QR externe avec/sans session. Déploiement conditionné à ces tests et au build. Première publication : `getPublicPlayerPortal` et Hosting. Ajustement du sac et des filtres : Hosting seulement. Aucune migration de schéma ni modification des données de la soirée terminée.
