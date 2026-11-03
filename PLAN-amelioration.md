# Plan d'amélioration - Vidéo Continuum (rédigé le 2026-11-02, après 7.13.0)

Base : lecture ciblée du code + recherche IA n°03 vérifiée (RechercheIA/recherches/_bilan/03-video-continuum_2026-11-02_phase2.md). Rien de ce plan n'est fait.

## Principe
Geler les nouvelles fonctions tant que les étapes 1 à 3 ne sont pas finies. La dette n'est plus dans les fonctions, elle est dans la sécurité du service, les tests et la publication.

## Étape 1 - Fermer le service local (petit, 1 session) -> 7.13.1
Constat : `traduction/serve.js` répond `Access-Control-Allow-Origin: *`, sans contrôle ; /stop, /status, /sub?v= appelables par une page.
Les deux appelants (src/33-soustitres.js, src/02-iframe-lecteur.js:400) passent par `gmRequest` (GM_xmlhttpRequest) : ils ne sont pas soumis au CORS et peuvent poser un en-tête.
Correctif minimal, sans jeton à distribuer :
- supprimer `Access-Control-Allow-Origin` ;
- refuser (403) toute requête dont `Host` n'est pas `127.0.0.1:8787` (DNS rebinding) ;
- exiger l'en-tête `X-VC-Client: 1` ; une page web ne peut pas l'envoyer sans requête préalable, que le serveur refuse ;
- ajouter l'en-tête dans les 3 `gmRequest` ;
- un auto-test dans serve.js ou un petit script : sans en-tête = 403, avec = 200.
Limite assumée : un autre script ou une extension installée par l'utilisateur peut encore appeler le service ; si ça compte, passer à un jeton appairé.
À tester en vrai : sous-titres sur Opera + Tampermonkey (l'en-tête passe-t-il ?).

Ajouts après le passage « avis d'architecture » (4 IA, 2026-11-02) :
- Test préalable (10 min, Opera + Chrome) : l'en-tête `X-VC-Client` posé par `GM_xmlhttpRequest` arrive-t-il, et quel `Origin` voit le serveur ? Les IA l'ont toutes laissé en suspens.
- Les actions (/stop, lancer une traduction) passent en POST, plus en GET (un GET se déclenche depuis une balise image).
- `apiVersion: 1` dans /status, et le userscript affiche « service trop ancien » si elle ne correspond pas.
- Jeton appairé (3 IA sur 4 le préfèrent) : seulement si tu diffuses le service à d'autres. Appairage simple : page `http://127.0.0.1:8787/pair` qui affiche le jeton, copié une fois dans les réglages. NE PAS le faire passer par `videocontinuum://` (le lien va navigateur -> lanceur, jamais en retour ; proposition de Gemini erronée).

## Étape 2 - Tests de fumée par adaptateur (moyen, 2 sessions) -> 7.14.0
- Sonde intégrée au script (idée de 3 IA sur 4, absente de mon plan) : chaque adaptateur a un `probe()` (lecteur trouvé, vidéo, titre/épisode, épisode suivant) ; états fonctionnel / dégradé / cassé ; badge discret ; bouton « Copier le rapport » (version, site, URL nettoyée, contrôles échoués) à coller dans une issue GitHub. Avantage sur un test planifié : tourne sur la vraie machine de l'utilisateur, sans Cloudflare, sans serveur. À faire AVANT le test planifié.
- Les mêmes instantanés HTML par site servent aux tests unitaires et de référence ; un mock `GM_*` commun avec un test de contrat ; un contrôle manuel dans Tampermonkey réel (Opera + Chrome) avant chaque release stable.
- Déplacer dans le dépôt (`tests/`) les scripts Playwright qui sont dans `_outils/videocontinuum-tests`.
- Un fichier de cas par site (URL d'épisode + valeurs attendues : titre, numéro, iframe trouvée), modèle MALSync (sans copier son code, GPL).
- Lancement local par le Planificateur de tâches Windows (pas GitHub Actions : les sites d'anime bloquent les IP de datacenters, à confirmer), rapport en une ligne par site.
- node:test pour la logique pure (numéro d'épisode, saut, saisons) : demande d'extraire ces fonctions de la fermeture unique, à faire seulement pour celles-là.

## Étape 3 - Canal de publication (moyen) -> 7.15.0
Constat : `@updateURL`/`@downloadURL` pointent sur `master` : chaque push met à jour tout le monde.
- Publier le .user.js comme asset de release GitHub (modèle MALSync : `releases/latest/download/<fichier>.user.js`) ; `master` ne met plus personne à jour.
- Migration : une dernière version poussée sur `master` change `@updateURL`/`@downloadURL` ; ceux qui ne la reçoivent pas restent bloqués, à documenter.
- Une release seulement après les tests de l'étape 2 au vert. Option bêta : un second fichier avec un autre `@name`/`@namespace` (à vérifier : Tampermonkey identifie un script par nom + namespace).
- Tampermonkey exige un tag `@version` pour détecter une mise à jour (doc officielle).
- Variante des IA : branches `beta` / `stable` avec URL raw ; moins de formalisme mais promotion manuelle et cache raw.githubusercontent. Je garde les releases (historique, retour arrière, `latest/download` vérifié sur MALSync).

## Étape 4 - Friction d'installation (petit)
Sous Chrome 138+, Tampermonkey demande d'activer à la main « Allow user scripts » (issue Tampermonkey #2607, sources 2026) ; Opera non vérifié. Ajouter 3 lignes dans le README + un message dans le panneau si le script ne tourne pas. À vérifier sur ton Opera.

## Étape 5 - Décision de forme (après le prompt d'architecture)
Ne rien séparer avant d'avoir lancé `prompts/architecture-03.md` dans les 4 IA et lu les réponses. Hypothèse de départ à tester :
- le userscript reste un userscript (mise à jour automatique, pas de magasin d'extensions) ;
- `traduction/` devient un composant à part (dossier ou dépôt, versionné seul, démarrage optionnel), avec un contrat d'API (/sub, /status, /stop, en-tête) ;
- l'extension MV3 (PLAN-v7) reste en pause sauf si une fonction le demande vraiment (blocage réseau, notifications).

## Hors plan (idées gardées, non prioritaires)
- Ollama comme traducteur local au choix à côté de DeepSeek (idée de Subtide) : qualité plus faible, à tester sur un extrait zh.
- Bouton « corriger le saut » stocké en local (idée Aniskip Extension).
- Règles de sites en JSON (idée MALSync) : seulement si on ajoute beaucoup de sites.
- yt-dlp : prévoir un message clair si YouTube renvoie 429 sur les sous-titres (issue yt-dlp #13831).

## Ce que le plan ne couvre pas (à confirmer)
Fragilité réelle des adaptateurs (fréquence des casses inconnue), Opera pour Local Network Access, Firefox/Violentmonkey (pas utilisé).
