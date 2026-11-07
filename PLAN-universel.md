# Plan universel - Vidéo Continuum (rédigé le 2026-11-04, après 7.15.0)

Décision de l'utilisateur : priorité au **suivi unifié** et aux **raccourcis** ; la **traduction hors YouTube vient en dernier**, quand le reste est au point.
Pourcentages = estimations (code lu le 2026-11-04). Les faits sur les plateformes DRM sont des connaissances générales, NON vérifiées sur le web : à confirmer par site avec `tests/analyse-site.js`.

## Deux familles de sites
| Famille | Exemples | Faisabilité | Déjà compatible |
|---|---|---|---|
| Sites gratuits à lecteur intégré | Esprit Donghua, Anime-Sama, Animoflix | haute (un adaptateur par site) | ~80 % |
| Plateformes DRM avec compte | Prime Video, Crunchyroll, Netflix, Disney+ | moyenne (mode « sur la page ») | ~25 % |

Le DRM bloque la capture du flux, pas le pilotage de l'élément `<video>` (pause, saut, position) : suivi et raccourcis restent possibles.

## Ce qu'on a (réutilisable pour l'universel)
- Suivi, historique, sauvegarde : ~90 % (clé `site::série`).
- Panneau, thèmes, raccourcis N/P/S/Échap, pause : ~85 %.
- Repères intro/outro manuels : 100 %. AniSkip et fiche AniList : anime seulement.
- Moteur de traduction + affichage : réutilisables, mais récupération des sous-titres source seulement YouTube (~10 %).

## Ordre de travail
0. **Fiche de faisabilité** par plateforme voulue (`tests/analyse-site.js`) : lecteur, `<video>`, titre/épisode, épisode suivant, shadow DOM / iframes. Liste des plateformes à fixer avec l'utilisateur (pas encore donnée).
1. **Mode « sur la page »** : panneau flottant sur une page avec `<video>`, sans cadre intermédiaire ; un site pilote. (Le mode générique `makeGenericSite`, src/06-page-principale.js, est le point de départ.)
2. **Suivi unifié** : position et épisode par plateforme, même clé `site::série`, liste commune « où j'en suis » ; règles par site (sélecteurs) + sonde `probe()` par site.
3. **Raccourcis universels** : N/P/S/Échap/pause/saut sur n'importe quelle `<video>` de la page, repères intro/outro manuels réutilisés.
4. **Tests de fumée et canal de publication** (étapes 2 et 3 de PLAN-amelioration.md) : à faire AVANT d'ajouter beaucoup de plateformes, car elles changent leur page sans prévenir.
5. **Plateformes une par une** : Crunchyroll en premier (anime : AniList et AniSkip s'appliquent), puis Prime / Netflix (fiches TMDB).
6. **Traduction hors YouTube (en dernier)** : récupérer les sous-titres source (pistes `<track>` ou réseau), langue source automatique, boîte d'affichage dans l'élément plein écran du site.

## Risques
- Conditions d'utilisation des services payants : lire ou traduire leurs sous-titres est une zone grise (risque surtout pour le compte de l'utilisateur) ; raison de plus pour mettre la traduction en dernier.
- Fragilité : pages changées sans préavis -> sondes obligatoires.
- Gel des fonctions recommandé le 2026-11-02 (PLAN-amelioration.md) : l'étape 4 passe avant l'ajout massif de plateformes.
