# Nid d’espions — corrections du 7 novembre 2026

Le contrôle précédent avait identifié des fouilles non atomiques, un module d’analyse non déployé, deux interactions sociales désactivées et un faux Chronos sans matière à examiner.

Les fouilles QR consomment exactement 1 PA, sans dé. La transaction verrouille la session puis vérifie accès, statut, solde, délai et disponibilité. Elle enregistre ensemble le coût, l’indice, l’objet éventuel, les connaissances, le journal et la réponse rejouable. L’interface conserve l’identifiant de commande lors d’une réponse réseau perdue. Le délai de dix minutes est global à tous les lieux.

L’examen est gratuit, privé et conditionné à la possession actuelle. Les conclusions dépendent du niveau de compétence. Les connaissances acquises restent mémorisées après un transfert. Les analyses et leurs textes cachés ne sont pas envoyés dans le portail initial. Nid dispose de douze règles : dix existantes et deux nouvelles pour le faux Chronos.

Les règles sociales ci-dessous sont des décisions de configuration pour compléter la version initiale, qui ne précisait pas leur résolution :

- Séduction : 1 PA, une tentative par cible, sans dé. La cible choisit une information connue dans l’enquête. Les seize faits d’identité initiale sont exclus. Aucune dépense si la cible ne possède aucune information partageable. L’information est copiée, pas l’objet.
- Intimidation : 1 PA par tentative, une tentative par cible ; 2D6 + niveau contre 2D6 + niveau adverse ; égalité en faveur de la cible. Réussite : choix d’un objet transférable via le mécanisme existant.
- Un pistolet détenu ajoute +3 au jet de l’attaquant, sans cumul. La possession est revérifiée dans la transaction, y compris si l’arme est transférée pendant le calcul.

Le champ optionnel FAITS.revelable_charme (TRUE par défaut) protège une connaissance contre la confidence forcée. OBJETS.bonus_ability_id et OBJETS.bonus_valeur définissent un bonus d’équipement, de 0 à 100. Les autres scénarios conservent leur comportement sans ces colonnes.

La correction de données cible la version `67bc1a02-6255-5bef-a999-1baaa1d1a1d7`, vérifie son empreinte source et refuse une session en cours. Elle préserve les médias, ressources, propriétaires des objets et casino. Les notes de règles sont ajoutées aux fiches figées en conservant les adaptations. La mention « cinq mallettes » de P05 devient « mallettes » ; quatre mallettes restent prévues, à 100 000 $ chacune.

Validation : tests unitaires, tests SQL Connect avec concurrence réelle, erreur en fin de transaction, droits révoqués par transfert, confidentialité, migration rejouable et préservation de l’état ; compilation TypeScript/Vite. Une partie humaine de seize personnes pendant trois heures reste nécessaire pour évaluer le rythme et la compréhension.
