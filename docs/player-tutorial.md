# Tutoriel joueur - 7 écrans

Préparé le 5 novembre 2026 sur `work/session-organizer-rehearsal`, commit `771ed2001576351700fd796b01948038be39b114`.

## Parcours

1. Le principe : incarner son personnage et enquêter entre joueurs.
2. Fiches : histoire, missions, interprétation et QR personnel.
3. Carnet : notes, relations, fil Infos et rappels d’indices.
4. Sac : ressources et pièces de l’enquête, sur une seule page.
5. Jouer : actions, conditions, coûts affichés et votes ouverts.
6. QR : choisir l’action dans l’app avant de scanner ; accès séparé aux fouilles de lieux.
7. Nouveautés : compteurs, résultats de vote et accès aux règles.

Les textes FR/EN sont centralisés dans `web/src/player-tutorial.ts`. Ils ne contiennent aucun scénario, personnage, secret ou coût chiffré. Les illustrations sont des éléments d’interface génériques, sans QR fonctionnel. Les quatre filtres suivent l’ordre Tout / Indices / Informations / Vote.

## Intégration

- Ouverture automatique après la première introduction, ou directement si aucune introduction n’est renseignée.
- « Passer », Échap et le dernier bouton ferment le tutoriel. Un bouton sous l’identité du joueur et un accès dans Carnet > Contexte permettent de le revoir.
- Fermeture mémorisée dans ce navigateur, par session, personnage et participant. Elle ne se synchronise pas entre appareils. Si le stockage est indisponible, la fermeture reste effective pour la visite en cours.
- Aucun lancement automatique pour l’impression ou un retour QR `tab=play`.
- Dialogue natif : focus contenu dans le tutoriel, retour au bouton d’origine après fermeture, navigation au clavier et boutons explicites.
- Les éléments cachés par le tutoriel ne sont pas marqués comme vus ; aucune action de jeu ni dépense de ressource n’est déclenchée.

## Vérification

```sh
npm ci --prefix web
npm run build --prefix web
# Avec Playwright et Chromium disponibles, démarrer Vite sur 127.0.0.1:4173.
cd web
node test/browser-tutorial.cjs
node test/browser-navigation.cjs
```

Le test du tutoriel couvre FR/EN, petits mobiles, séquence après l’introduction, progression, fermeture et mémorisation, accès depuis Contexte, retour du focus, protection des compteurs, retour QR, isolation par participant, stockage bloqué et absence de requête de jeu. Les tests navigateur acceptent `CHROMIUM_PATH` pour un exécutable Chromium déjà installé.

Ce travail ne change pas les règles du moteur ni les paramètres des scénarios. Sa branche de préparation ne déclenche aucun déploiement Firebase.
