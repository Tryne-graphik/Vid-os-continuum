# Analyse de fiabilité — Vidéo Continuum (2026-11-07)

Base : ce qui a été **observé** pendant la session du 2026-11-06/07 (Chrome profil tryne31, épisodes E388, E410, E411), ce qui est **lu dans le code** (v7.23.1), et ce qui reste **hypothèse**. Chaque ligne porte son niveau de preuve : [O] observé, [C] lu dans le code, [H] hypothèse non vérifiée.

Légende priorité : P1 = à faire d'abord (gain net, risque faible), P2 = utile, P3 = plus tard / si le problème se reproduit.

## 1. Lecture vidéo (hébergeur Odysee)

| # | Problème | Preuve | Protection actuelle | Solution proposée | Prio |
|---|---|---|---|---|---|
| 1 | Fichier MP4 « froid » : chargement lent, gels | [O] 2026-11-05 | Mode turbo (téléchargement parallèle en mémoire), relances automatiques | Garder. Voir 9 pour les garde-fous mémoire | — |
| 2 | Odysee n'arrive pas à s'initialiser (« resolve response », « préparer votre compte ») | [O] profil Chrome tryne31, avec uBlock en mode complet | Aucune : le script voit seulement l'absence de lecture | Détecter ce message dans l'iframe Odysee (texte de l'erreur) et afficher une aide claire : « Odysee ne répond pas : effacer les données du site / baisser uBlock ». Éviter la bascule YouTube dans ce cas précis | P1 |
| 3 | uBlock Origin Lite en mode « complet » casse le lecteur | [O] confirmé : « optimal » marche | Aucune | Note d'installation dans README + encart « Aide » ; le script ne peut pas changer le réglage d'un autre add-on | P1 (doc) |
| 4 | Qualité qui retombe à 144p / lecture qui redémarre | [O] aussi sur Odysee seul, donc pas le script | Aucune | Mesure : `qualite.py` (déjà en place). Piste : forcer « Original » via le menu ⚙ (à faire seulement après inspection du DOM, sinon c'est fragile). Si un autre hébergeur a l'épisode, le proposer | P2 |
| 5 | Plein écran qui fait planter l'iframe (smiley gris) | [O] même sans plugin ; rapport Crashpad code 0x80000003 | Aucune | Hors script. Tester l'accélération graphique désactivée, mettre à jour le pilote. Éviter de lier ce défaut au script tant que ce n'est pas mesuré | P3 |
| 6 | API Odysee (resolve, claim_search) lente, bloquée ou en limite de débit | [C] une dépendance dans `referenceDuration` et `turboFetch` | Cache de durée par épisode ; délais d'attente 8 s ; échec = on continue sans | Ajouter un délai avant nouvelle tentative après un échec (éviter de réessayer à chaque ouverture) | P3 |
| 7 | La chaîne Odysee supprime ou renomme un épisode | [H] | Encadre « indisponible », autres sites, YouTube | Garder ; la recherche ailleurs s'améliore (7.23) | — |

## 2. Le script lui-même

| # | Problème | Preuve | Protection actuelle | Solution proposée | Prio |
|---|---|---|---|---|---|
| 8 | Faux « Épisode indisponible » alors que la vidéo joue | [O] | 7.22.2 (masquage) + 7.22.3 (minuteur annulé si ça joue) — NON vérifié à l'écran | Vérifier en vrai ; si ça réapparaît, regarder si le message « prêt » n'arrive jamais (journal) | P1 (vérifier) |
| 9 | Mémoire : épisode courant + épisode suivant préchargés en mémoire (environ 720 Mo chacun, avec un pic de ~2× pendant l'assemblage) | [C] `turboFetch`, `PRELOAD_ENABLED` | Délai maximal 240 s ; abandon en cas d'erreur | Garde-fous : désactiver le préchargement si `navigator.deviceMemory` ≤ 4 ou fichier > 1,2 Go ; révoquer le Blob de l'épisode précédent (`URL.revokeObjectURL`) ; bouton « mode économe » dans les réglages | P1 |
| 10 | Pause annulée par la remise du son après un clic | [O] puis [C] | Corrigé en 7.22.1 — NON vérifié | Vérifier en vrai (plusieurs pauses à la souris, puis barre d'espace) | P1 (vérifier) |
| 11 | Bascule automatique vers une mauvaise vidéo YouTube | [O] | Case « bascule auto » (7.21), bouton « Bloquer cette chaîne » (7.20), croix ✕ (7.19) | Vérifier que la sauvegarde les garde (7.23.1 : fait) | — |
| 12 | Mise à jour automatique depuis `master` : un push cassé casse tout | [C] `@updateURL` ; [O] v6.53 déjà cassée une fois | Règle : `node build.js && node --check && git push` en une chaîne | Script de contrôle avant push (build, `node --check`, tests purs sous Node, marqueur de version dans l'en-tête et le journal des nouveautés) ; éventuellement une branche « beta » | P1 |
| 13 | Donnée utilisateur oubliée dans la sauvegarde | [O] trouvée pendant cette analyse (`youtubeBlockedChannels`, `ytAutoSwitch`) | Règle écrite dans CLAUDE.md, mais pas appliquée à la main | Corrigé en 7.23.1. Ajouter un test qui compare les clés `GM_setValue(` du code aux listes de sauvegarde | P1 |
| 14 | Chrome / Opera / Firefox et Tampermonkey / Violentmonkey se comportent différemment | [C] garde `unsafeWindow` ; tâche 7 de TACHES.md jamais faite | Cas par cas | Tester une fois sur Firefox + Violentmonkey et noter les écarts | P3 |
| 15 | Règle de numérotation et nouveautés : oublier de les mettre à jour | [C] règle dans CLAUDE.md | Manuel | Le script de contrôle avant push vérifie que `@version` = première entrée des nouveautés = dernière entrée de HISTORIQUE.md | P2 |

## 3. Sites (structure des pages)

| # | Problème | Preuve | Protection actuelle | Solution proposée | Prio |
|---|---|---|---|---|---|
| 16 | Un site change son HTML : plus d'épisode détecté, « aucun lecteur compatible » | [C] adaptateurs `SITE_*` avec sélecteurs fixes | `tests/analyse-site.js`, message explicite | Contrôle de nuit : charger une page de chaque site, vérifier que `extract()` rend un épisode, noter le résultat. La tâche « veille des sites de nuit » existe déjà (n° 8) | P2 |
| 17 | Anime-Sama répond 403 à la lecture d'`episodes.js` | [O] console du 2026-11-06 (plusieurs fois par page) | Les erreurs sont tolérées | Retenir l'échec (cache négatif de quelques minutes) pour ne pas redemander en rafale | P2 |
| 18 | Fausses alertes et fenêtres publicitaires (« Ad Blocker Pro ») | [O] sans bloqueur | Aucune dans le script | Rien dans le script (risque de fausse détection). Doc : garder un bloqueur en niveau « optimal » | P1 (doc) |
| 19 | Numérotation Esprit Donghua par saison (s2-e149 = épisode 199) | [C] piège noté | Ne pas déduire le numéro de l'URL | Garder | — |

## 4. YouTube

| # | Problème | Preuve | Protection actuelle | Solution proposée | Prio |
|---|---|---|---|---|---|
| 20 | YouTube change le format de ses pages (`ytInitialData`) | [C] regex sur la page ; [H] | Aucune détection : « rien de sûr trouvé » | Distinguer « 0 résultat » de « page illisible » et afficher « YouTube a changé » dans le second cas ; contrôle de nuit avec une recherche connue | P2 |
| 21 | Requêtes en rafale (4 à 6 recherches par ouverture du choix de source) : risque de limite de débit | [C] | Aucune | Mettre les résultats en cache par épisode (durée de vie 24 h) | P2 |
| 22 | Mauvais résultat proposé (extraits, compilations, mauvaise série) | [O] E411 | 7.23 : durée comparée, badge, titres alternatifs ; chaînes masquables | Fait. Suite possible : après lecture, comparer la durée réelle de la vidéo à l'attendu | — |
| 23 | Vidéo YouTube privée / supprimée / non intégrable (erreurs 101, 150) | [H] | Aucune | Détecter l'erreur du lecteur YouTube dans l'iframe et passer au résultat suivant | P3 |
| 24 | Page de consentement cookies (Europe) | [C] `ucbcb=1` | En place | Garder | — |

## 5. Service de sous-titres (traduction, port 8787)

| # | Problème | Preuve | Protection actuelle | Solution proposée | Prio |
|---|---|---|---|---|---|
| 25 | Impossible de savoir pourquoi le service ne démarre pas | [C] le lanceur le lance en fenêtre cachée et sa sortie est perdue | Aucune | Rediriger la sortie de `serve.js` vers `serve.log` (lanceur) ; afficher les dernières lignes dans le panneau | P1 |
| 26 | Vidéo YouTube sans piste chinoise : le service échoue (« Aucune piste source… ») et le voyant reste rouge | [O] le 2026-11-07 (vidéo avec sous-titres anglais seulement) | Échec mémorisé 10 min | Message plus clair (« pas de piste chinoise sur cette vidéo, sous-titres YouTube conservés ») et voyant orange, pas rouge | P2 |
| 27 | Service éteint, clé DeepSeek absente, quota épuisé | [C] voyants du panneau | Voyants et compteur d'usage | Ajouter un plafond mensuel configurable (arrêt avec message) | P3 |
| 28 | Port 8787 déjà pris | [C] garde dans le lanceur | En place | Garder | — |
| 29 | Démarrage lent (plus de 3 s avant d'écouter) | [O] mesuré | Le panneau attend 15 s | Garder ; ne pas conclure « éteint » avant 15 s | — |

## 6. Diagnostic

| # | Problème | Solution proposée | Prio |
|---|---|---|---|
| 30 | Chaque panne demande plusieurs allers-retours (captures, questions) | Bouton « Copier le diagnostic » : version, navigateur, source en cours, résolution, dernières erreurs, état du service sous-titres. À coller dans la conversation | P1 |
| 31 | Les mesures de qualité ne servent que si les outils sont lancés | `qualite.py` et `surveille.py` existent déjà (bouton ▶ du cockpit) ; les garder hors de la version publique | — |

## Ordre de travail conseillé
1. **P1 de vérification** : tester 7.22.1, 7.22.2, 7.22.3 en vrai (pause, encadre, plein écran) — sans ça, les corrections restent supposées.
2. **P1 de protection** : contrôle avant push (12, 13, 15), garde-fous mémoire (9), journal du service (25), bouton « Copier le diagnostic » (30).
3. **P1 d'aide** : détecter l'erreur Odysee (2) et documenter uBlock (3, 18).
4. **P2** ensuite : caches (17, 21), lecture de YouTube (20), sous-titres (26), contrôle de nuit des sites (16).

## Ce qui n'est PAS fiable dans cette analyse
- Aucun de ces correctifs récents n'a été essayé dans un vrai lecteur.
- Les points [H] sont des risques plausibles, pas des pannes constatées.
- Je n'ai pas pu reproduire moi-même les défauts de qualité et de plein écran : ils viennent de votre profil Chrome et d'Odysee.
