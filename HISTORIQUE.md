# Historique de travail - Anime Tracker Continuum (ex-Esprit Donghua)

## Note importante

Ce fichier est un journal de suivi tenu au fil des sessions, pas un enregistrement
automatique des conversations. Il a déjà raté une journée entière de vrais commits
(voir 2026-09-26/27 ci-dessous) — **toujours croiser avec `git log`/`git log -p`**
avant de supposer qu'il est exhaustif. Compacté le 2026-09-29 (voir dernière section) :
la narration pas-à-pas des sessions résolues a été condensée, l'historique complet
reste dans `git log -p -- HISTORIQUE.md`.

## Fichiers actuels

- `esprit-donghua-suivi-progression-v6.user.js` (v6.5, "Anime Tracker Continuum") —
  script réellement utilisé au quotidien. Couvre esprit-donghua.xyz/Odysee,
  animoflix.to, anime-sama.to (hébergeur vidéo : sibnet uniquement pour l'instant).
- `anime-tracker-generique.user.js` (v1.0) — chantier parallèle : tracker générique
  par reconnaissance AniList, sans dépendance à la structure d'un site précis. Créé
  le 25/09, **jamais testé dans un vrai navigateur**.
- `installateur/EspritDonghuaInstaller.exe` + `Program.cs` — installeur console C#
  (ouvre la page Tampermonkey du navigateur choisi puis le `.user.js` local). Cible
  en dur v6 ; à repointer vers la version générique une fois celle-ci validée.
- Anciens fichiers gardés intacts sur le disque comme filets de sécurité, désactivés
  dans Tampermonkey : `esprit-donghua-suivi-progression.user.js` (v2.6),
  `esprit-donghua-suivi-progression-v3.user.js`, `...-v4.user.js`.
- `odysee-referer-extension/` : extension Chrome MV3 (`declarativeNetRequest`) créée
  pendant le chantier v4 pour forcer le header `Referer` sur `player.odycdn.com` —
  plus nécessaire depuis le pivot d'architecture v4.13 (voir plus bas), reste dans
  le dépôt sans utilité active.
- Stockage : `GM_setValue`/`GM_getValue`, isolé par script (chaque fichier
  Tampermonkey a son propre namespace).

## Points non testés / non résolus à ce jour (priorité à la reprise)

- **v6.2 à v6.5** (bouton "Ouvrir sur Odysee", titre "Video Continuum" au topbar,
  lecteur YouTube de secours manuel par épisode, playlist YouTube automatique par
  chaîne associée) : RIEN testé dans un vrai navigateur depuis leur écriture le
  26/09 — ni le lien manuel, ni l'association de chaîne, ni la résolution de
  playlist, ni la configuration de la clé API YouTube via le menu Tampermonkey.
- **Installateur C#** : l'ajout d'Opera a été testé avec succès ; le flux complet
  avec les autres navigateurs (Chrome/Firefox/Edge) n'a pas été revérifié
  récemment.
- **`anime-tracker-generique.user.js` v1.0** : jamais testé dans un vrai navigateur.
  À valider dans l'ordre : 1) recherche/association AniList manuelle sur un
  épisode ; 2) `findMatchingTrackedSeries()` reconnaît bien la série sur une autre
  page du même site sans réassociation ; 3) devinette du numéro d'épisode par
  regex sur titre d'onglet, sur les 3 sites déjà connus + un 4e site jamais testé
  (validation de la généricité) ; 4) saut d'intro / sauvegarde à `ended`/outro sur
  une vraie balise `<video>` native (pas une iframe cross-origin, cas non géré
  volontairement) ; 5) "Choisir fichier sauvegarde" (piège `unsafeWindow` déjà
  appliqué mais jamais vérifié dans ce fichier) ; 6) "Vérifier nouveaux épisodes"
  et l'affichage du point "●".

## Leçons génériques de debug (valables pour toute future session)

- **Faux positif "ça ne marche pas" = souvent un bloqueur de pub/contenu**, pas un
  bug du script. Vu plusieurs fois : bruit `ERR_BLOCKED_BY_CLIENT` sur
  sentry/watchman/reports (Odysee) sans rapport avec le script ; iframe Odysee
  bloquée en `about:blank` par un niveau de blocage uBlock Origin Lite trop
  agressif (résolu en le baissant d'un cran) ; lecture Sibnet bloquée indéfiniment
  par un bloqueur de pub empêchant la réponse VAST d'arriver (résolu en ralentissant
  la cadence de clic auto). **Réflexe** : vérifier l'URL réelle du cadre iframe
  (`about:blank` = suspect) et les extensions actives avant de suspecter le script.
- **Éditer le fichier sur disque ne suffit pas** : il faut toujours recoller
  manuellement le contenu dans l'éditeur Tampermonkey pour qu'un changement prenne
  effet.
- **HISTORIQUE.md a déjà raté une journée entière de vrais commits** (le 26/09,
  rattrapée le 27/09 à partir des messages de commit/diffs) : toujours croiser avec
  `git log` avant de supposer que ce fichier est exhaustif.
- **Un filtre de recherche dans la console peut masquer une vraie erreur** : un
  filtre sur "esprit" a caché une erreur générique du navigateur (`document.body`
  null au run-at document-start) qui faisait planter le script en silence. Toujours
  faire effacer le filtre de recherche avant de conclure "pas d'erreur".
- **Piège de zone morte temporelle (TDZ) en JavaScript** : un `const`/`let`
  référencé avant sa ligne de déclaration lève un `ReferenceError` qui arrête TOUT
  le script dès le démarrage, sans aucun log — contrairement à une `function`
  (hissée entièrement). Repéré une fois (v6.0 : `detectSite()` appelé tout en haut
  du fichier alors qu'elle lisait `SITES`, déclaré en `const` bien plus bas) — a
  cassé silencieusement les 3 sites cibles simultanément. Corrigé en déplaçant
  l'appel après toutes les déclarations.
- **Tampermonkey exécute le script dans un `window` proxifié (sandbox)** dès qu'un
  `@grant` spécifique est déclaré — certaines méthodes natives "brandées"
  (`showSaveFilePicker`, `indexedDB.open`) rejettent l'appel via ce proxy
  (`Illegal invocation`). Solution : utiliser `unsafeWindow` pour ces appels
  précis.
- **`window.opener`/`postMessage` entre fenêtres cross-origin peut être cassé par
  `Cross-Origin-Opener-Policy`** (vu avec une popup Odysee) — préférer un canal
  indépendant de tout lien opener/COOP (`GM_setValue` + `GM_addValueChangeListener`)
  ou rester dans le même document/iframe plutôt qu'ouvrir une popup séparée.
- **Le son ne peut jamais être débloqué par script sur une origine cross-origin
  sans un vrai geste utilisateur** (`event.isTrusted`) sur CETTE origine —
  contrainte navigateur non contournable, revenue plusieurs fois dans ce projet.
- Un popup `about:blank` nommé n'est pas un contexte fiable pour l'injection
  Tampermonkey (`@match about:blank` peut simplement ne rien injecter selon le
  navigateur) — mieux vaut un calque plein écran sur la page elle-même.

## Journal des sessions

### 2026-09-15 à 2026-09-18 — de la v2.6 à la v4.36 (résolu, condensé)

Point de départ (v2.6, `esprit-donghua-suivi-progression.user.js`) : suivi de
progression par anime, panneau persistant, lecture continue avec compte à rebours,
saut d'intro/détection d'outro, iframe Odysee intégrée au site avec clic auto sur
"lecture" et tentative de réactivation du son. Trois refontes successives ont suivi
pour résoudre le son coupé et le plein écran limité par l'iframe cross-origin :

- **v3 (fenêtre séparée)** : ouverture d'odysee.com dans une vraie fenêtre nommée.
  Le lien `window.opener` s'est révélé cassé par `Cross-Origin-Opener-Policy` —
  corrigé (v3.1) en passant par le stockage partagé Tampermonkey au lieu
  d'opener/postMessage. Confirmé fonctionnel (son + navigation), mais le plein
  écran ne peut pas survivre à une vraie navigation de page (contrainte Fullscreen
  API : geste utilisateur exigé sur chaque nouveau document).
- **v4 (téléchargement Blob + calque plein écran)** : pour éviter toute navigation
  de document, calque `position:fixed` jamais recréé + téléchargement complet de
  chaque épisode en `Blob` via `GM_xmlhttpRequest` (contournement du contrôle
  `Referer` anti-hotlink d'Odysee). L'approche popup `about:blank` initiale a été
  abandonnée (Tampermonkey n'y injectait pas toujours le script) au profit du
  calque sur la page elle-même. Fonctionnel et validé sur plusieurs épisodes
  enchaînés, mais plombé par des **limitations de débit (HTTP 429) récurrentes et
  persistantes côté CDN Odysee** dès qu'on téléchargeait plusieurs épisodes complets
  rapprochés — de nombreux essais d'espacement du préchargement (moitié de la durée,
  puis début d'outro, puis suppression totale du préchargement en v4.8) n'ont jamais
  éliminé le problème, seulement des pauses de 30-60 min. Autres bugs réels
  rencontrés et corrigés sur cette branche : double-téléchargement concurrent sur
  clic manuel pendant un chargement auto (verrou ajouté v4.3) ; `outroSignalSent`
  mal réinitialisé causant un double déclenchement d'épisode suivant après
  réouverture (v4.9) ; `showSaveFilePicker`/`indexedDB.open` rejetés par le sandbox
  Tampermonkey (`Illegal invocation`) — corrigé avec `unsafeWindow` (v4.11).
  Investigation réseau confirmant que le fichier vidéo n'est pas un MP4 fragmenté
  (donc MediaSource/streaming progressif par morceaux impossible côté script) a
  mené à une tentative d'extension navigateur (`declarativeNetRequest`) pour
  streamer directement — qui a buté sur le même 429 indépendant de la méthode.
- **v4.13 (pivot d'architecture, solution finale retenue)** : abandon complet du
  téléchargement/contournement Referer. À la place, la vraie iframe Odysee native
  (mêmes URLs d'embed que le site) est placée DANS le calque plein écran toujours
  présent, avec une deuxième instance du script injectée directement dans cette
  iframe (`@match https://odysee.com/*`) pour le clic auto sur "lecture", le saut
  d'intro/détection de fin/outro et la tentative de son. Changer d'épisode = changer
  le `src` de l'iframe, jamais recréer le calque parent — le plein écran et le son
  débloqué survivent sans rien redemander. **Validé en conditions réelles** :
  transition automatique en moins de 2 secondes entre épisodes, plus aucun 429.

Nombreux affinages UX ensuite (v4.14 à v4.36), tous testés et validés au fil de
l'eau sauf mention contraire : pourcentage de buffer pendant la transition, bouton
recharger la page, verrouillage de qualité 1080p/720p (sélecteurs DOM du menu
React Odysee), boutons Suivant/Précédent avec suspension de l'outro anticipé,
colonne de commandes dans le calque (affichable/masquable, dupliquant panneau du
haut passé lui aussi en colonne à droite puis à gauche), export/import de
sauvegarde avec fichier lié (`showSaveFilePicker`) et permission réautorisable,
saisie rapide de timecode ("0712" → 7m12s), détection et coloration des nouveaux
épisodes disponibles (avec bug de rafraîchissement tardif corrigé en v4.27), champ
"aller à l'épisode N°", alignement en colonne des listes déroulantes (piège :
espaces normaux fusionnés par le HTML, corrigé avec des espaces insécables),
panneau de configuration de masse porté depuis v2.6 (v4.33), suppression du doublon
`legacy:` créé par un ancien import (v4.22). **Bug réel trouvé le 18/09** : un
statut HTTP 500 transitoire sur `esprit-donghua.xyz` était affiché comme "épisode
introuvable" au lieu d'une erreur serveur passagère — corrigé (v4.36) avec un retry
automatique + messages d'erreur distincts. Revue du 21/09 : deux comportements
suspectés bugs confirmés **voulus** par l'utilisateur (suspension de l'outro
anticipé persistante après "Précédent" ; réapplication du saut d'intro à chaque
renvoi de config) — ne pas les re-signaler comme bugs.

**Version finale de cette branche : v4.36**, validée en usage réel.

### 2026-09-21 — extension à animoflix.to et anime-sama.to (v6.0)

Demande : étendre le principe à animoflix.to et anime-sama.to avec un suivi unifié
par site, dans un seul script (chaque script Tampermonkey a son propre stockage
isolé — pas d'agrégateur séparé). Périmètre réduit à l'hébergeur video.sibnet.ru
uniquement pour ces deux sites. Fichier créé : `esprit-donghua-suivi-progression-
v6.user.js`, architecture v4 généralisée via des adaptateurs par site
(`SITE_ESPRIT_DONGHUA`/`SITE_ANIMOFLIX`/`SITE_ANIME_SAMA`), stockage par
`site::seriesUrl`, tri/groupement par site.

- **Bug bloquant trouvé après un retour utilisateur ("rien ne se passe sur les 3
  sites")** : piège de TDZ JavaScript — voir la leçon générique ci-dessus
  (`detectSite()` appelé avant la déclaration de `SITES`). Corrigé en déplaçant
  l'appel en fin de fichier ; validé par un test Playwright réel.
- Bug secondaire trouvé et corrigé avant tout test : la détection "nouvel épisode"
  sur anime-sama pour une série non ouverte comparait un index reparti toujours à 0
  au lieu du vrai épisode suivi — corrigé par comparaison directe des numéros.
- Sibnet utilise un vrai lecteur Video.js où la balise `<video>` existe déjà au
  chargement (contrairement à Odysee) — le déclenchement basé sur la simple
  présence de la balise ne marchait donc pas ; corrigé en se basant sur
  l'événement `play` réel.
- Après correctif TDZ : panneau confirmé fonctionnel sur les 3 sites. Filtre par
  site ajouté au panneau/colonne. Lecture Sibnet bloquée sur anime-sama identifiée
  comme un bloqueur de pub (cf. leçons génériques) — cadence de clic ralentie.
  Bug réel corrigé : `tryAutoUnmute()` avalait une vraie pause volontaire
  (fenêtre de surveillance de 1.5s réduite à 350ms).

**Discussion "commercialiser le projet ?"** : déconseillé (risque juridique lié au
streaming non licencié des 3 sites cibles + fragilité technique/conflit d'intérêt)
— idée abandonnée par l'utilisateur.

**Décision actée à la place : réécriture en tracker générique + petit installeur**
(exécutable qui ouvre la page Tampermonkey du store puis le `.user.js` local, pas
d'installation silencieuse possible côté Chrome). Généricité prévue via l'API
publique AniList (recherche manuelle + calendrier de diffusion) au lieu du scraping
par site — plus de clic auto sur "lecture" ni de navigation auto vers l'épisode
suivant, seulement ce qui ne dépend d'aucun site (saut d'intro, fin réelle,
panneau, sauvegarde). **Pas commencé immédiatement** : l'utilisateur voulait
d'abord valider v6 en usage réel plusieurs jours.

### 2026-09-25 — faux positif uBlock + démarrage du tracker générique

- Signalement "l'épisode ne charge plus sur Chrome" : diagnostic console a montré
  l'iframe Odysee restée en `about:blank` — causé par uBlock Origin Lite trop
  agressif sur ce profil, résolu en baissant le niveau de blocage (cf. leçon
  générique ci-dessus). Pas un bug du script.
- **Démarrage du chantier tracker générique acté le 21/09**, 4 jours de v6 stable
  entre-temps. Fichier créé : `anime-tracker-generique.user.js` (v1.0), v6 laissé
  intact et désactivé (même principe que v4→v6). Voir "Fichiers actuels" et
  "Points non testés" en tête de fichier pour le détail de ce qui a été implémenté
  et reste à valider.

### 2026-09-26 et 27 — rattrapage du journal : git init + v6.2 à v6.5 (non testé)

**Note sur ce rattrapage** : les commits ci-dessous datent du 26/09 mais n'avaient
jamais été consignés ici — reconstitués le 27/09 à partir des messages de commit et
des diffs. Le chantier "tracker générique" (section précédente) est resté
strictement où il était (v1.0, jamais testé) — toute cette journée a en réalité
porté sur `esprit-donghua-suivi-progression-v6.user.js` (v6.1 → v6.5), qui reste le
script réellement utilisé au quotidien.

- **Git initialisé pour la première fois sur ce projet** (`043df06`) — jusque-là
  seul ce fichier servait de suivi, aucun dépôt. Remote créé :
  `github.com/Tryne-graphik/Vid-os-continuum` (nom corrigé dans `@updateURL`/
  `@downloadURL` 16 min après le premier commit, `2c7ec5a`).
- **v6.2** (`06ce6f4`) : bug réel corrigé — le bouton "Ouvrir sur Odysee" n'existait
  que dans le panneau hors lecteur, invisible dès qu'un épisode est lancé (calque
  plein écran par-dessus). Ajouté aussi au topbar du calque.
- **v6.3** (`1432f56`) : le calque plein écran affiche désormais "Video Continuum" +
  la version (lue via `GM_info.script.version`) au-dessus du nom de la série.
- **v6.4** (`e72555d`) : **lecteur YouTube de secours, par épisode.** Dépannage
  manuel quand l'hébergeur habituel (Odysee/Sibnet) d'un épisode précis est
  cassé/bloqué — l'utilisateur colle un lien YouTube (ID extrait par regex),
  stocké par `site+série+numéro d'épisode` (`youtubeOverrides`), appliqué à la
  place de l'embed habituel. Volontairement dégradé : pas de saut intro/outro ni
  d'enchaînement auto sur cette source (YouTube n'est pas piloté par le script
  injecté). UI ajoutée aux deux panneaux dès le départ (leçon retenue du bouton
  Odysee v6.2, ajouté à un seul panneau au départ).
- **v6.5** (`c8cb739`) : **playlist YouTube automatique par chaîne associée**,
  complément du lien manuel v6.4. Association unique (chaîne + mot-clé) par série,
  playlist mise en cache via l'API YouTube Data v3 (`playlistItems.list`), triée
  par numéro d'épisode détecté dans le titre. Bouton "Trouver sur YouTube (chaîne
  associée)" applique automatiquement le bon épisode. Nécessite une clé API
  YouTube gratuite, configurable via un menu Tampermonkey dédié.

**Aucune des fonctionnalités v6.2 à v6.5 n'a été testée dans un vrai navigateur**
depuis leur écriture — voir "Points non testés" en tête de fichier.

### 2026-09-27 — installateur découvert (jamais journalisé) + ajout d'Opera

En reprenant le projet, découverte d'un `installateur/EspritDonghuaInstaller.exe`
(+ source `Program.cs`) créé le 26/09 à 00:53, juste avant l'init de git (inclus
dans le premier commit), jamais mentionné ici. Console C# simple : demande le
navigateur, ouvre la page Tampermonkey correspondante, attend une touche, puis
ouvre le `.user.js` local pour déclencher la fenêtre de confirmation
d'installation de Tampermonkey. Cible en dur `esprit-donghua-suivi-progression-
v6.user.js` — un commentaire dans le code indique de le changer pour
`anime-tracker-generique.user.js` une fois cette version validée.

**Ajout demandé et testé** : Opera à la liste des navigateurs (menu 1-4 → 1-5,
"Autre" passe en position 5) — Opera a sa propre fiche Tampermonkey sur son propre
store (`addons.opera.com`), pas le Chrome Web Store. Recompilé avec `csc.exe`
(.NET Framework), même taille d'exe qu'avant (8704 octets). **Testé en conditions
réelles** : le menu affiche bien l'option Opera, et les deux étapes (page
Tampermonkey puis script local) se sont ouvertes dans Opera sur la machine de test.

### 2026-09-29 — compaction de ce fichier

Fichier réduit d'environ 1953 à ~450 lignes : narration pas-à-pas des sessions
2026-09-15 à 2026-09-18 (v2.6 → v4.36, 96 points numérotés) condensée en un
résumé par version avec bugs réels + causes racines + version finale atteinte ;
sections plus récentes (v6.0, tracker générique, v6.2-v6.5, installateur) gardées
en détail car non testées/en cours. Historique complet original récupérable via
`git log -p -- HISTORIQUE.md`.

### 2026-10-01 — v6.6 : anime-sama via ansembed + résumé/pop-up de suivi

Retour utilisateur après test approfondi de la v6.5 sur plusieurs sites/animes :
- **Bug anime-sama "la vidéo ne se lance pas"** : cause réelle trouvée en vrai
  navigateur (Playwright/Chrome) — `video.sibnet.ru/shell.php` répond **403**, y
  compris dans le lecteur du site lui-même ("Lecteur 2"). Le lecteur par défaut
  d'anime-sama est désormais **ansembed.net** (JW Player, vraie `<video>` dans le
  même document). Corrigé : `@match https://ansembed.net/*`, pilote in-iframe
  `runInsidePlayerFrame_ansembed()` (clic `.jw-icon-display`), `buildEmbedByIndex()`
  préfère ansembed puis sibnet en secours, origine `postMessage` tirée de la vraie
  src de l'iframe. **Testé** (script injecté avec shims GM dans Chrome) : épisode
  demandé chargé, lecture qui avance (muet tant qu'on n'a pas cliqué, comme sibnet).
- **Suivi des nouveaux épisodes peu clair** : ajout d'une ligne résumé par site
  sous "Vérifier les nouveaux épisodes" (panneau + calque) — "Site · N suivis · N
  nouveaux" ("?" avant la 1re vérification). Clic → pop-up de suivi du site
  (anime, vu, dispo, dernier visionnage, bouton Regarder/Reprendre, "Vérifier
  maintenant"). Pop-up insérée dans le calque quand il est affiché (sinon
  invisible en plein écran). **Testé** dans Chrome sur anime-sama.
- Lien YouTube jugé "situationnel" par l'utilisateur (un seul anime à problème) —
  laissé tel quel.

Non testé : saut d'intro/outro + enchaînement auto réels sur ansembed (seek
vérifié à la main uniquement), pop-up sur esprit-donghua/animoflix/odysee, et le
tout sous Tampermonkey réel (le banc Playwright simule GM_*).

### 2026-10-01 (suite) — v6.7 : bouton "Vérifier MAJ"

Demande : bouton de mise à jour comme sur l'assistant Diablo IV. Ajouté au
panneau et au calque ("🔄 Vérifier MAJ", après Configuration) : ouvre
`GM_info.script.downloadURL` (repli en dur sur l'URL raw GitHub `master`),
Tampermonkey intercepte et propose Mettre à jour/Réinstaller. Testé (Chrome,
banc Playwright) : les deux boutons ouvrent la bonne URL. **Le dépôt GitHub
était déjà poussé jusqu'à v6.5** (`c8cb739`) — contrairement à ce que disait la
note de session précédente. v6.6 + v6.7 poussées. Rappel : monter `@version`
avant chaque push destiné à l'usage réel, sinon Tampermonkey ne voit rien.

### 2026-10-01 (suite 2) — v6.8 : panneau allégé, signalement d'incidents, installateur GitHub

- **Lisibilité** (proposée puis validée par l'utilisateur) : liste "Nouveaux
  épisodes" supprimée (doublon de la pop-up de suivi) ; ligne résumé par site
  remontée en haut, plus visible, comptant les **animes à rattraper** (et non la
  somme d'épisodes, noyée par une série à 139 ép. de retard) ; actions rares
  repliées dans des sections `<details>` (Réglages / Lien YouTube de secours /
  Sauvegarde / Signaler un problème), état ouvert conservé entre reconstructions ;
  Exporter n'est plus en bleu vif. Même chose dans le calque (statut remonté sous
  l'épisode, Préc./Suiv. sur une ligne).
- **Bug "[ES] Big Brother"** sous le filtre Esprit Donghua : étiquette périmée
  stockée dans une vieille sauvegarde (aucun tag "ES" dans v6). `loadProgress()`
  réécrit désormais tag/libellé depuis `SITES`. Testé (entrée "ES" injectée →
  affichée "[ED]").
- **Signalement d'incidents** (comme l'assistant Diablo, déploiement Apps Script
  SÉPARÉ) : section "⚠ Signaler un problème" (type + description, envoie aussi
  site/anime/épisode/version/navigateur/état du lecteur) →
  `google-apps-script/incidents-collector.gs` → feuille "Incidents" avec colonne
  Statut à liste déroulante (Nouveau/En cours/Résolu/Ignoré) + Notes. Secret
  partagé + quota 200/jour. Copie `continuum-incidents-collector.txt` sur le
  Bureau. **En attente** : l'utilisateur doit créer la feuille + déployer et
  fournir l'URL `/exec` (`INCIDENTS_ENDPOINT_URL`) ; d'ici là, repli sur une issue
  GitHub pré-remplie (testé).
- **Installateur** renommé `VideoContinuum-Installateur.exe` : ouvre désormais
  l'URL brute GitHub (l'ami n'a besoin que de l'exe, mises à jour auto) au lieu
  d'un fichier local ; rappel "Autoriser les scripts utilisateur" pour Chrome.
  Recompilé (csc .NET Framework), démarrage vérifié.
