# Casino lié à Murder Engine

## Utilisation

Dans la session organisateur, le panneau « Tables de casino optionnelles » permet d’activer séparément Blackjack et Texas Hold’em. Chaque module possède un QR propre à la session, imprimable depuis le panneau. Les quatre rubriques principales du joueur restent inchangées.

Sur le téléphone, ouvrir son lien joueur personnel puis scanner le QR de la table. Le QR ne contient ni identité ni accès joueur. Le joueur dépose une partie des dollars de son Sac à la table. Le Sac ne peut plus dépenser ce dépôt. Entre deux mains, quitter la table restitue la réserve au portefeuille. Une reconnexion retrouve le même siège et la même réserve.

Le bouton « Distribuer » permet à un joueur de démarrer la donne quand les participants ont misé au Blackjack ou se sont déclarés prêts au poker. L’app distribue, conduit les tours et règle les gains. Aucun joueur ne tient le rôle de croupier. Les nouveaux arrivants attendent la fin de la main.

Les réglages appartiennent à la session affichée. Les répétitions héritent des modules configurés sur la session originale, avec une caisse neuve, des sièges vides et aucun historique de cartes. Les changements faits dans une répétition ne modifient pas la session originale.

## Blackjack

- Table de 1 à 7 joueurs. Banque finie, montant de départ paramétrable par session.
- Le serveur refuse une mise, un double ou une séparation que la banque ne peut pas couvrir, en tenant compte des autres mains réservées.
- Six jeux, mélangés à chaque donne. Le croupier reste sur tout 17, y compris le 17 souple.
- Gain ordinaire 1:1, blackjack naturel 3:2, égalité remboursée. Les mises sont paires pour conserver des dollars entiers.
- Tirer, rester, doubler sur deux cartes, séparer deux cartes de même rang, jusqu’à quatre mains. Un seul tirage sur les as séparés. Une main issue d’une séparation ne gagne pas la prime du blackjack naturel.
- Sans assurance ni abandon. Ces variantes figurent dans les règles de la table.
- Modifier la caisse initiale réinitialise son solde. Modifier seulement les autres réglages conserve le solde restant. Les réglages exigent une table vide.

## Texas Hold’em

- Table de 2 à 9 joueurs. Sans limite, petite et grande blindes configurables. Aucun prélèvement sur les pots.
- Deux cartes privées, flop, turn, river, meilleure combinaison de cinq cartes parmi sept.
- Parole, suivre, relancer, tapis et se coucher. Relance minimale et droits de relance après un petit tapis contrôlés au serveur.
- Pots secondaires et remboursement de la partie non suivie d’une mise. Jetons impairs attribués aux gagnants dans l’ordre des sièges à gauche du bouton.
- Le bouton tourne. En tête-à-tête, le bouton paie la petite blinde et parle en premier avant le flop.
- Les cartes des autres restent absentes des réponses réseau, sauf lors d’un véritable abattage. Les mains couchées et la main d’un gagnant sans abattage restent privées.

## Argent et accès

Un état serveur `SessionCasino`, distinct pour chaque session, conserve les deux tables et leurs réserves. Les cartes et les paquets restent dans cet état serveur, jamais dans le connecteur public ni dans les réponses joueur.

Chaque écriture associe dans une seule transaction SQL : verrou de session, contrôle de révision, contrôle d’accès du participant, mouvements du portefeuille, nouvel état de table, clé d’idempotence et journal d’action. Les requêtes rejouées ne dépensent pas deux fois. Les révisions de chaque table évitent qu’une action sur l’autre module invalide inutilement un choix. Les conflits SQL entre tables se retentent avec les mêmes identifiants de commande.

Les virements joueur, dépenses d’interaction et corrections MJ utilisent maintenant le même verrou de session et refusent les soldes obsolètes. Les données des scénarios et les points d’action ne changent pas.

Si le scénario impose un plafond au portefeuille, il reste applicable : un retrait qui le dépasserait échoue sans perdre d’argent. L’interface propose alors un retrait partiel. Pour récupérer tout le solde, le joueur peut libérer de la place par un virement dans son Sac. La fermeture MJ respecte aussi ces plafonds et reste sans effet si elle ne peut pas rembourser tous les joueurs.

Les opérations organisateur nécessitent un accès vérifié à cette session. Les liens d’un autre joueur ou d’une autre session ne permettent pas de prendre sa place. Les commandes de casino disparaissent lors de la purge d’une session.

## Pause, absence et intervention

Le délai d’action se règle entre 15 et 180 secondes. Sans réponse, l’app reste au Blackjack. Au poker, elle fait parole si possible, sinon elle couche la main. L’avancement utilise l’heure du serveur et les actualisations de table toutes les 2,5 secondes. Il ne dépend pas du compte à rebours du téléphone.

Pendant une pause, les nouvelles actions sont bloquées et les délais se décalent lors de la reprise observée par la table. Si tous les téléphones sont fermés, l’état et les mises restent conservés. La prochaine actualisation traite le délai dépassé. Il n’y a pas de tâche autonome d’arrière-plan pour faire tourner une table sans aucun téléphone ouvert.

Le MJ peut annuler une main : toutes les mises de cette main reviennent aux réserves à table, sans annuler les résultats des mains précédentes. Il peut aussi fermer une table et restituer les réserves dans les Sacs. À la fin de la murder, une actualisation annule les mains inachevées et autorise les retraits. Fermer et rembourser les tables avant d’archiver la session, car les liens joueur archivés se désactivent.

## Vérification et déploiement

Tests ciblés : `functions/test/casino.test.mjs` et les tests des flux d’argent, accès, répétitions et purge. `functions/integration/casino.test.mjs` utilise exclusivement l’émulateur SQL avec le projet `demo-murder-engine-votes`. Le test navigateur ouvre deux téléphones, joue les deux modules, vérifie la reconnexion, les cartes privées et la conservation des dollars.

```sh
node --test functions/test/casino.test.mjs functions/test/player.test.mjs functions/test/interactions.test.mjs functions/test/live.test.mjs functions/test/session-rehearsal.test.mjs functions/test/session-access.test.mjs functions/test/cleanup.test.mjs
node functions/integration/run.mjs casino
npm run build --prefix web
# Vite sur 127.0.0.1:4175 et Chromium/Playwright disponibles :
cd web && node test/browser-casino.cjs
```

Déploiement nécessaire avant usage en ligne : ajout des tables SQL `SessionCasino` et `SessionCasinoCommand`, redéploiement des fonctions qui écrivent de l’argent, nouvelles fonctions `getPublicPlayerCasinoTable`, `executePublicPlayerCasinoAction`, `manageSessionCasinoView`, puis Hosting. Vérifier le diff SQL avant migration. Aucun déploiement automatique Firebase sur la branche de travail.

## Références de règles

- Bicycle, *Blackjack*, consulté le 6 novembre 2026 : https://bicyclecards.com/how-to-play/blackjack/
- Bicycle, *Hold ’Em*, consulté le 6 novembre 2026 : https://lb.bicyclecards.com/how-to-play/hold-em
- World Poker Federation, *How to Play Texas Hold’em*, consulté le 6 novembre 2026 : https://worldpokerfederation.org/poker/how-to-play-poker/variants-and-rules/how-to-play-texas-holdem/

Les règles affichées dans l’app constituent la variante de cette table. Les réglages de caisse et de mises sont des paramètres de jeu fictifs, propres à Murder Engine.

## Roulette

Module optionnel indépendant, QR propre à la session. Roulette à un seul zéro (0–36), tirage cryptographique côté serveur. Numéro plein : 35:1 ; douzaine et colonne : 2:1 ; rouge/noir, pair/impair et 1–18/19–36 : 1:1. La mise gagnante est restituée en plus du gain. Zéro perdant pour tous les paris extérieurs, sans partage ni prison.

Chaque joueur peut cumuler plusieurs paris jusqu’au plafond total par tour. La caisse doit couvrir le pire résultat possible de toutes les mises acceptées. Un joueur assis lance la bille après concertation avec les autres ; le tirage ferme et règle immédiatement les mises dans la même transaction. Pas de délai automatique ni de consommation de PA. Les mises non tirées sont remboursées par l’annulation MJ ou à la fin de la session. Retrait bloqué tant qu’une mise reste engagée.

Les anciennes sessions reçoivent le module désactivé, sans modification de leurs tables existantes. Les répétitions reprennent les réglages avec une caisse neuve. Tests supplémentaires : `functions/test/roulette.test.mjs`, intégration SQL casino et parcours navigateur casino à deux téléphones.
