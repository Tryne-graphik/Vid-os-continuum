# Historique de travail - Anime Tracker Continuum (ex-Esprit Donghua)

## Note importante

Ce fichier est un journal de suivi tenu au fil des sessions, pas un enregistrement
automatique des conversations. Il a déjà raté une journée entière de vrais commits
(voir 2026-09-26/27 ci-dessous) — **toujours croiser avec `git log`/`git log -p`**
avant de supposer qu'il est exhaustif. Compacté le 2026-09-29 (voir dernière section) :
la narration pas-à-pas des sessions résolues a été condensée, l'historique complet
reste dans `git log -p -- HISTORIQUE.md`.

## Fichiers actuels

- `esprit-donghua-suivi-progression-v6.user.js` (v6.14, affiché "Vidéo Continuum",
  `@name` inchangé) — script réellement utilisé au quotidien. Couvre
  esprit-donghua.xyz/Odysee, animoflix.to (sibnet), anime-sama.to (ansembed, sibnet
  en secours). Mise à jour auto via `@updateURL` (dépôt GitHub public).
- `anime-tracker-generique.user.js` (v1.0) — chantier parallèle : tracker générique
  par reconnaissance AniList, sans dépendance à la structure d'un site précis. Créé
  le 25/09, **jamais testé dans un vrai navigateur**.
- `installateur/Program.cs` + `guide/` — installateur WinForms illustré (v6.11),
  ouvre la page Tampermonkey du navigateur choisi puis l'URL raw GitHub du script.
  Exe propre (6.11.0.0) sur le Bureau, pas encore commité (voir "à reprendre").
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

- **Secours YouTube (v6.4/v6.5)** : la v6.5 a été utilisée en profondeur le 01/10,
  mais le lien YouTube manuel, l'association de chaîne/playlist et la clé API n'ont
  pas été explicitement validés — jugés "situationnels" par l'utilisateur, basse
  priorité.
- **Reprise de position (v6.14)** : vérifiée dans Chrome (Playwright) seulement, pas
  encore en usage réel dans Tampermonkey.
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

### 2026-10-01 (suite 3) — v6.9 : signalement d'incidents branché

URL `/exec` fournie par l'utilisateur, collée dans `INCIDENTS_ENDPOINT_URL`.
Vérifié : GET → "endpoint incidents OK", mauvais secret → `unauthorized`, bon
secret → `{"status":"ok"}` ; puis envoi réel depuis le panneau (Chrome, banc
Playwright) → "Merci, envoyé !". **2 lignes `[TEST]` écrites dans la feuille
Incidents** (à supprimer à la main). Bug corrigé au passage : le message de
résultat était effacé par la reconstruction du panneau (1re vérification des
nouveaux épisodes 8 s après le chargement) — désormais gardé hors du DOM
(`setIncidentNote`). Leçon banc de test : le shim `GM_xmlhttpRequest` doit
transmettre `data`/`headers`, sinon faux "réponse serveur inattendue".

### 2026-10-01 (suite 4) — v6.10 : sécurisation avant partage avec des inconnus

Audit (demande : "sécuriser nos projets pour les partager avec des inconnus") :
- **Import de sauvegarde = vrai risque** : champs repris tels quels → un fichier
  partagé pouvait injecter du HTML/JS dans le panneau (nom d'anime) ou un lien
  `javascript:` (navigation via la liste). Corrigé : `sanitizeImportedEntry()`
  (liste blanche de champs, longueurs plafonnées, lien accepté seulement s'il
  pointe vers le site de l'entrée via `matchesUrl`) + `escapeHtml()` sur tous les
  noms/liens insérés en HTML (panneau, pop-up, Configuration, fichier exporté).
  **Testé** avec un fichier piégé (Chrome) : injection affichée en texte brut,
  lien `javascript:` et domaine étranger rejetés, aucune exécution.
  Cause racine du "[ES]" trouvée : repli `site.slice(0, 2)` à l'import.
- **Injection de formule Google Sheets** dans les collecteurs (ici ET dans
  l'assistant Diablo) : un texte commençant par `= + - @` était interprété comme
  formule (ex. IMPORTXML qui exfiltre des données). `cap()` préfixe désormais une
  apostrophe. Testé (assertions node). **À redéployer côté Apps Script** (les 2).
- `LICENSE` (tous droits réservés, usage perso libre, non-affiliation) + `README.md`
  (installation, empreinte SHA-256 de l'installateur, ce qui est envoyé par
  "Signaler un problème").
- Vérifié : aucun chemin local / e-mail / clé / ID de feuille dans les fichiers
  suivis ; `save/` (historique perso) bien ignoré. Reste visible : l'e-mail
  d'auteur des commits (métadonnées git publiques).

### 2026-10-01 (suite 5) — v6.11 : renommage Vidéo_Continuum + installateur illustré

- **Renommage** demandé : "Vidéo_Continuum" partout où le nom est AFFICHÉ (panneau,
  calque, fichier de sauvegarde exporté, README, Apps Script, installateur).
  **Volontairement inchangés** : `@name` (Tampermonkey identifie un script par
  nom+namespace → changer `@name` créerait un 2e script, double calque +
  progression vide), nom du fichier `.user.js` et dépôt GitHub (= `@updateURL`
  des installations existantes).
- **Installateur en fenêtre** (WinForms, `-target:winexe`) au lieu de la console :
  accueil + choix du navigateur, puis un écran illustré par manipulation
  (Ajouter Tampermonkey / Autoriser les scripts utilisateur / Installer), bouton
  "Rouvrir la page". Illustrations = schémas `installateur/guide/mockups.html`
  rendus en PNG (Playwright) et embarqués (`/resource`). Accents via
  `-codepage:65001`. Fiche d'identité de l'exe (AssemblyInfo). Option `--preview
  <dossier>` = rendu PNG de tous les écrans sans rien ouvrir ; `--detect` = dit si
  Tampermonkey est installé (Chrome/Edge, par dossier de profil).
- **Installation automatique de Tampermonkey tentée puis RETIRÉE** : clé HKLM
  "extensions externes" (méthode officielle Chrome/Edge, HKLM seulement d'après
  leurs docs) + relance de l'exe en administrateur. **Bitdefender bloquait l'exe
  dès sa compilation** (verrou, impossible à lancer/supprimer). Prouvé par
  élimination : même exe sans `runas` ni écriture registre → lancé sans souci.
  Schéma typique d'adware → aurait été bloqué chez les testeurs aussi. Remplacé
  par la page du store + écran illustré.
- Build compilé : `csc -codepage:65001 -target:winexe -r:System.Windows.Forms.dll
  -r:System.Drawing.dll -resource:guide/store.png,store.png
  -resource:guide/userscripts.png,userscripts.png
  -resource:guide/install.png,install.png -out:"Vidéo_Continuum-Installateur.exe" Program.cs`

### 2026-10-01 (suite 6) — v6.12 : nouvelle adresse du collecteur d'incidents

L'utilisateur a redéployé les 2 Apps Script (anti-injection de formule). Pour
Vidéo_Continuum, 1er essai = code modifié sans "Nouvelle version" (l'URL servait
encore l'ancien texte "Video Continuum") ; 2e essai = **nouveau déploiement →
nouvelle URL** `.../AKfycbyhbP6z.../exec`. Vérifié : GET renvoie le nouveau texte
"Vidéo_Continuum - endpoint incidents OK", mauvais secret → `unauthorized`.
`INCIDENTS_ENDPOINT_URL` mis à jour. L'ancien déploiement (AKfycbyoNp...) sert
toujours l'ancien code sans la protection : à archiver une fois les installations
passées en 6.12.

### 2026-10-01 — fin de séance : à reprendre

État : v6.12 en ligne et installée chez l'utilisateur ; phase de test avec un ami
(installateur envoyé depuis le Bureau). Les 2 Apps Script sont redéployés.

À faire / vérifier à la reprise :
- **Retours de l'ami** : regarder la feuille "Incidents" (statut "Nouveau").
- Supprimer l'ancien `installateur/Vidéo_Continuum-Installateur.exe` (version
  0.0.0.0, verrouillé par Bitdefender) puis committer la version propre (6.11.0.0,
  sha c6eeb62a…, copie sur le Bureau).
- Archiver l'ancien déploiement Apps Script (`AKfycbyoNp…`) si pas encore fait ;
  supprimer les 2 lignes `[TEST]` de la feuille.
- Non testé en conditions réelles : saut d'intro/outro + enchaînement sur ansembed,
  pop-up de suivi sur esprit-donghua/animoflix/odysee, parcours complet de
  l'installateur chez quelqu'un d'autre.
- Plus tard : version générique (`anime-tracker-generique.user.js`, v1.0 non
  testée) avant toute présentation publique ; vitrine GitHub Pages ; double
  authentification GitHub avant partage public.

### 2026-10-01 (suite 7) — v6.13 : plus de lecture en double sur anime-sama (`f45c55c`)

Rattrapé le 02/10 depuis `git log` (non journalisé sur le moment).
- anime-sama charge désormais lui-même ansembed dans `#playerDF` → notre clic auto
  y lançait une **2e lecture en arrière-plan**. Le script injecté ne s'active plus
  que si `window.name === 'continuum-player'` (notre iframe) ; `#playerDF` vidé au
  lancement comme les autres lecteurs natifs.
- Signalement d'incident : requête `anonymous: true` (sans cookies Google), erreur
  détaillée affichée + log console. **Vraie cause du "réponse serveur inattendue"** :
  l'Apps Script redéployé contenait `SHEET_ID = "PASTE_YOUR_GOOGLE_SHEET_ID_HERE"`
  (copie avec le marqueur collée). Une erreur Apps Script = page HTML en HTTP 200 →
  diagnostiquer par un vrai POST (bon secret) et chercher "Exception:" dans le HTML.
  Les copies `.gs` du dépôt/Bureau gardent le marqueur exprès (dépôt public) :
  **toujours rappeler de remettre l'ID à chaque redéploiement.**

### 2026-10-01 (suite 8) — v6.14 : reprise à la position où on s'était arrêté (`21f8fb9`)

Rattrapé le 02/10 depuis `git log` (non journalisé sur le moment).
- Le lecteur injecté envoie sa position (`position`, t + durée) toutes les 5 s.
- Stockage `resumePositions` : `{ [site::série]: { ep, t } }`, **une seule position
  par série** (écrasée d'un épisode à l'autre, ne grossit pas). Ignorée sous 30 s ;
  effacée dans les 2 dernières minutes, à l'outro et à `ended`.
- `resumeAt` transmis dans la config du lecteur si l'épisode correspond ; appliqué
  **une seule fois par chargement** (la config est renvoyée à chaque réaffichage du
  calque et ne doit pas faire reculer la lecture).
- `positionArmed` : faux entre le changement de `src` et le `ready` du nouveau
  lecteur, sinon l'ancien lecteur pouvait encore envoyer sa position, attribuée à
  tort au nouvel épisode (même `contentWindow`).
- **Testé** dans Chrome (Playwright) sur Dragon Ball Z Kai format films (1h28) :
  sauvegarde à 3005 s, rechargement → reprise à ~3005 s. Pas encore en usage réel.
- Détail : les commentaires du code disent "(v6.13)" pour cette fonction alors
  qu'elle est arrivée en v6.14.

### 2026-10-02 — reprise

État : v6.14 poussée (`master` = `origin/master`). L'ancien exe signalé par
Bitdefender (0.0.0.0, sha `b48621a8…`) est **toujours** dans `installateur/`, non
suivi. Liste "à reprendre" du 01/10 toujours valable (retours de l'ami, exe propre
à committer, ancien déploiement Apps Script à archiver, lignes `[TEST]`).

### 2026-10-02 — v6.15 : plages intro/outro, abandon de suivi, progression multi-site

Demandes de l'utilisateur après usage sur anime-sama :
- **Panneau baissé de 50 px** (bouton ☰ top 60, panneau top 104) pour garder le
  titre/logo du site visible. Le calque plein écran n'est pas concerné.
- **Croix ✕ par ligne** dans la fenêtre de suivi par site → confirmation puis
  `setSeriesExcluded` (même effet que décocher "Suivre cet anime", réactivable via
  Configuration).
- **Même anime sur plusieurs sites** (Bleach ép. 120+ sur anime-sama, ép. 1 sur
  animoflix) : pas de fusion des entrées (clé et numérotation propres à chaque
  site) ; à l'ouverture d'un épisode, si une autre entrée au **nom normalisé
  identique** (`displayName`, minuscules, sans accents/VF/VOSTFR/ponctuation) est plus
  avancée, encadré orange "Déjà vu jusqu'à l'ép. N sur X" + bouton "Aller à l'ép.
  N+1" (`goToEpisodeNumber`). Limite : noms différents d'un site à l'autre = pas
  de rapprochement (lien manuel à ajouter si besoin).
- **Intro et outro en plages** : `introStart`/`outroEnd` en plus de
  `introEnd`/`outroStart` (boutons Début/Fin intro et outro, 4 colonnes dans
  Configuration ; champ vide = effacer). Intro avec début > 0 : sautée au passage
  (résumé + bout d'épisode avant le générique). Outro avec fin : générique sauté,
  l'épisode continue, et c'est `ended` qui enchaîne (ex. Bleach). Chaque plage
  sautée une seule fois par épisode (retour en arrière volontaire possible).
- **Testé** dans Chrome (Playwright, shims GM) sur Bleach anime-sama/ansembed :
  panneau à 60/104 px, encadré multi-site affiché puis saut à #ep=121 OK, intro
  5→20 s et outro 40→60 s sautées, `ended` → toast "Episode suivant", ✕ → série
  exclue et ligne retirée. Pas encore testé dans Tampermonkey réel.
- Non porté : le transfert intro/outro esprit-donghua → Odysee ne copie que
  `introEnd`/`outroStart`.

### 2026-10-02 (suite) — v6.16 : bouton "✓ Tout vu" dans la fenêtre de suivi

Demande : marquer une série comme entièrement vue sans relancer l'épisode (ex.
Clevatess sur anime-sama). Bouton entre "Regarder" et ✕, affiché seulement si la
série a des épisodes à rattraper, un dernier épisode connu, et qu'on sait
construire l'URL de ce dernier épisode (`lastEpisodeUrlFor` : anime-sama `#ep=N`,
sinon `site.buildEpisodeUrl`). Confirmation, puis progression placée sur le
dernier épisode connu. **Pas affiché** sur animoflix (dernier épisode inconnu) ni
sur Odysee (URL non constructible).

**Bug trouvé en testant (préexistant)** : `checkForNewEpisodes()` réutilisait
l'épisode affiché sur la page pour la série en cours même s'il ne correspondait
pas à la progression enregistrée → "Tout vu" sur Bleach depuis la page de l'ép. 1
était annulé à la vérification suivante ("1 nouveau"). Raccourci désormais limité
au cas où le numéro affiché = numéro enregistré.

**Testé** dans Chrome (Playwright, shims GM) sur anime-sama : Bleach et Clevatess
marqués, Bleach 366/366 "Reprendre", résumé "à jour", et ça tient après "Vérifier
maintenant".

### 2026-10-02 (suite 2) — v6.17 : titre du panneau

Titre centré "Vidéo Continuum" (sans le _), 13 → 15 px ; version sur la même ligne,
en jaune `#ffd400`, 10 → 12 px. Appliqué au panneau de page et au calque plein
écran. Le titre de l'export HTML garde "Vidéo_Continuum". Vérifié par capture
d'écran (Playwright).

### 2026-10-02 (suite 3) — nom affiché "Vidéo Continuum" partout (sans _)

Demande de l'utilisateur : plus de "_" nulle part. Remplacé dans le script (titre
de l'export HTML), README, `installateur/Program.cs` (titres, fiche d'identité),
`incidents-collector.gs` + copie Bureau (commentaire + texte de réponse GET — **pas
besoin de redéployer**, rien de fonctionnel). `@name`/fichier/dépôt toujours
inchangés (même raison qu'en v6.11).
Installateur recompilé (version 6.17.0.0) → **`Vidéo-Continuum-Installateur.exe`**,
sha256 `b0677633…4462`. Lancé une fois pour vérifier : fenêtre "Installateur Vidéo
Continuum", pas de blocage Bitdefender. Copie sur le Bureau ; l'ancien exe du Bureau
(6.11) a été supprimé. Toujours pas commité dans `installateur/` (l'ancien exe
verrouillé y est encore) — à faire avec le nouveau nom.

### 2026-10-02 (suite 4) — v6.18 : bouton Fiche, AniSkip, encart Nouveautés

- **Test AniSkip préalable** (api.aniskip.com, id MAL via AniList) : Bleach (MAL
  269) opening trouvé sur 8/8 épisodes testés, ending 5/8, résumé sur 3 ; temps qui
  varient d'un épisode à l'autre (ép. 366 : opening à 6:34) ; Clevatess S1 (59205)
  1/4, S2 (62513) 2/3. Le paramètre `episodeLength` filtre côté serveur à ~±20 s et
  choisit le relevé le plus proche → on passe la **vraie durée** de la vidéo.
- **"ℹ Fiche" sur les vignettes anime-sama** (`.card-base` avec lien
  `/catalogue/<slug>/...`) → page de l'anime `/catalogue/<slug>/` (synopsis,
  genres). Le clic normal reprend toujours l'épisode. Cause du "ça ouvre direct
  l'épisode" : les vignettes du site mènent à la page de saison, où notre "Lecteur
  auto" lance l'épisode. Cartes générées en JS par le site → MutationObserver.
- **AniSkip** : association auto série → AniList (1er résultat de recherche ; nom
  + " N" pour `saisonN` > 1), stockée dans `aniLinks` ; "Changer" dans la ligne
  AniSkip du lecteur (recherche + choix numéroté, 0 = désactiver pour cet anime).
  Requête au 1er message `position` du lecteur (durée réelle connue). Opening +
  résumé collé (< 30 s) = plage intro ; ending = outro, avec fin si > 10 s de contenu
  après. **Réglages manuels prioritaires par paire** (intro / outro) : il faut les
  vider dans Configuration pour laisser AniSkip faire.
- **Encart "🆕 Nouveautés"** (panneau + lecteur) : changelog 6.14→6.18, ouvert
  d'office avec "(nouveau !)" tant que la version n'a pas été vue (clic sur le
  titre → `lastSeenVersion`). Piège évité : l'événement `toggle` part aussi à
  l'affichage d'un `<details open>`, ce qui marquait "vu" sans clic.
- `@connect` ajoutés : `graphql.anilist.co`, `api.aniskip.com`.
- **Testé** (Playwright, shims GM) : 194 boutons Fiche sur l'accueil, clic → bonne
  page ; Bleach ép. 2 et 121 reconnus (MAL 269), ép. 121 : "intro 1:30-3:33 (opening
  + résumé fusionnés), outro 22:00", saut d'intro et toast "épisode suivant" OK.
  Le lecteur ansembed a été remplacé par une fausse `<video>` pour le test.
- **Piège du banc de test** (pas un bug du script) : le navigateur Playwright
  plantait (onglet fermé, navigateur déconnecté) à chaque **sauvegarde automatique
  du jour** (téléchargement) → pré-remplir `lastAutoExport` = date du jour dans
  les shims. Aussi : ne pas appeler `addInitScript` deux fois sur le même onglet
  (script injecté en double = deux calques).

### 2026-10-02 (suite 5) — v6.19 : liens des sites + "Mes animes" sur tous les sites

- **Section "Sites"** (panneau + lecteur, repliable) : un bouton par site géré +
  sélecteur **"Ouvrir dans"** (nouvel onglet / nouvelle fenêtre `popup` / cet
  onglet, `GM openMode`), partagé avec "Mes animes". Délégation globale sur
  `a.vc-open-link` et `select.vc-open-mode`.
- **`@match *://*/*`** ajouté : sur un site non géré (cadre principal seulement),
  le script ne fait que proposer **"Mes animes"** — commande du menu Tampermonkey
  + petit bouton ▶ en bas à gauche (masquable via le menu, `floatingButtonEverywhere`,
  affiché par défaut). Fenêtre = liste des animes suivis par site, triés par
  dernier visionnage, bouton "Reprendre" (liens `http(s)` uniquement, noms échappés).
  Le stockage GM_* étant propre au script, la liste est la même sur tous les sites.
  Les iframes des autres sites sortent toujours tout de suite (`window.name`).
- Code placé hors de `main()` (avant `detectSite()`), donc sans dépendre des
  helpers de `main` (petit `escHtml` dédié).
- **Testé** (Playwright) sur example.com : bouton ▶ + 2 commandes de menu, fenêtre
  correcte (nom piégé `<b>` affiché en texte, lien `javascript:` ignoré),
  "Reprendre" → nouvel onglet en gardant la page, mode "Nouvelle fenêtre"
  enregistré puis lien Odysee ouvert en fenêtre. Sur anime-sama : section Sites
  dans le panneau, pas de bouton ▶ (le panneau suffit).

### 2026-10-02 (suite 6) — v6.20 : animoflix de nouveau lisible (ansembed)

Signalé : "le lecteur ne fonctionne pas sur animoflix". Cause : Sibnet a fermé
(bandeau "SIBNET HS" sur anime-sama) et animoflix ne propose plus que des lecteurs
**ansembed** (`#epLecteurSelect`, `data-host="ansembed.net"` ×2). Notre extracteur
animoflix ne prenait que `video.sibnet.ru` → `embedSrc` null → "aucun lecteur
compatible". Corrigé : ansembed en priorité, sibnet en secours (même ordre
qu'anime-sama). Le pilote ansembed et les origines `postMessage` étaient déjà
génériques, rien d'autre à toucher. Sélecteurs de page (nom de série, numéro,
navigation) vérifiés inchangés.
**Testé** (Playwright, vrai lecteur ansembed cette fois) : Thunder 3 ép. 11,
vidéo qui avance (durée 23:33), ligne AniSkip affichée ("pas de données").

### 2026-10-02 (suite 7) — v6.21 : lecteur de secours + "c'est le site, pas nous"

Signalé : "le bouton épisode suivant ne fonctionne pas" (animoflix, The Insipid
Prince's Furtive Grab for the Throne, ép. 7 → 8). Cause : le lien ansembed de
l'ép. 8 est **mort chez l'hébergeur** ("Sorry, this video not found", 404) — le
calque passait bien à l'ép. 8 mais n'avait rien à lire. Le lecteur 2 du site est
minochinos.com (injoignable depuis ici, DNS).
- **Lecteurs de secours** : l'extracteur animoflix renvoie `embedCandidates`
  (tous les lecteurs de la page, ansembed puis sibnet d'abord, dédoublonnés).
  Le calque passe au suivant si le script du lecteur abandonne (nouveau message
  `load-status` `echec`, envoyé quand le chien de garde renonce, ~20 s) ou si
  aucun `ready` n'arrive en 25 s (hébergeur injoignable, aucun script dedans).
- **Pilote générique** dans NOTRE iframe pour tout autre hébergeur (possible depuis
  `@match *://*/*`) ; les messages entrants sont acceptés depuis l'origine réelle
  de l'iframe en plus des origines connues.
- **Encadré "Épisode indisponible sur <site>"** au centre du calque, à la demande
  de l'utilisateur : dit explicitement que c'est le site (vidéo supprimée /
  hébergeur en panne) et pas Vidéo Continuum ; boutons "Rechercher sur Google"
  (`<nom> episode N vostfr streaming`), "Épisode suivant", "Fermer".
- **Recherche sur l'autre site** : anime-sama et animoflix partagent le même nom
  court dans leurs adresses et renvoient une vraie 404 sinon →
  `findEpisodeElsewhere()` essaie l'adresse équivalente sur l'autre site et ne la
  propose que si elle a un lecteur **différent des liens déjà morts** (les deux
  sites partagent souvent les mêmes sources : ép. 8 = même ansembed mort sur
  anime-sama). Limite : côté anime-sama on ne voit qu'un lien par épisode
  (ansembed puis sibnet), pas ses autres hébergeurs (embed4me, minochinos…).
- `@connect odysee.com` ajouté : la vérification des nouveaux épisodes Odysee
  était refusée par Tampermonkey ("not part of the @connect list", vu dans la
  console de l'utilisateur).
- Alerte Bitdefender "phishing" sur `finisheddaysflamboyant.com/sbar.json` :
  domaine de pub du site, absent du script (vérifié) — ne pas l'autoriser.
- Le 1er clic sur l'encadré peut être avalé par une pub du site (nouvel onglet) ;
  le bouton marche au clic suivant.
- **Testé** (Playwright) : ép. 8 → lecteur 1 en échec à 21 s → lecteur 2 → encadré
  à 46 s ; "Épisode suivant" → ép. 9 qui se charge ; Google ouvre la recherche ;
  recherche sur l'autre site → "pas trouvé" (lien identique exclu). Cas positif
  non démontré (Bleach : le 2e lecteur animoflix, my.mail.ru, a suffi).

### 2026-10-02 (suite 8) — v6.22 : "Ajouter ce site" (1re brique du lecteur générique)

Idée de l'utilisateur, à partir de l'incident v6.21 : pouvoir ajouter d'autres
sites. Sites de test fournis : **french-anime.com** et **myfluneo.eu**.
- **Bouton "➕ Ajouter ce site"** dans la fenêtre ▶ Mes animes (sites non gérés) :
  analyse la page courante, montre ce qui est détecté (anime, épisode, lecteur +
  nb de secours, épisode suivant), confirmation → `GM customSites[host]` → recharge.
  Menu Tampermonkey "Retirer <site> de Vidéo Continuum". Sites ajoutés listés
  dans la section Sites.
- **Adaptateur générique** `makeGenericSite(host)` (ajouté à `SITES`, id
  `custom:<host>`), deux formes reconnues :
  - **liste "DLE"** cachée `<div class="eps">` `N!lien1,lien2,…` (french-anime ;
    moteur courant des sites FR) → style `index` comme anime-sama, `#ep=N`,
    `embedCandidatesByIndex` (tous les lecteurs en secours, `vidmoly.me/w/X`
    converti comme le fait le site, `up4fun` ignoré) ;
  - **une page par épisode** (`episode-N` dans l'adresse, myfluneo/Next.js) : lecteur =
    plus grande iframe (attendue jusqu'à 10 s, insérée en JS) ; **lecteur "emballé"
    décodé** (`/embed-player?v=<base64 de l'adresse ansembed>`) ; suivant/précédent
    = liens "Épisode suivant/précédent" du site ; navigation par changement de page
    (`navigate: true`) + drapeau de session pour rouvrir le lecteur sur la page
    suivante même sans "Lecteur auto". Série = adresse sans le segment épisode.
  - Nom : `h1` > `og:title` > `title`, nettoyé ("en DDL STREAMING", "| Site",
    "S1 Ep.1", "VF/VOSTFR").
- Index : `embedCandidates` propagé en suivant/précédent/aller-à (sinon les
  secours restaient ceux du 1er épisode). AniSkip : saison lue aussi en `saison-N`.
- **Son en double** : french-anime recrée son lecteur (`#film_iframe`) après le
  chargement → relu et recoupé à 1/3/6/10 s sur les sites ajoutés.
- Hébergeurs de french-anime testés dans NOTRE iframe : vidmoly ✓, VOE
  (jeremyparticipantanything.com) ✓, vidara ✗ (échec → secours), luluvdo ✗
  (rien → délai 25 s → secours).
- **Testé** (Playwright, GM_xmlhttpRequest sans CORS via `page.request`) :
  french-anime → détection "Thunder 3, ép. 1 sur 12, vidmoly (+3)", lecture ép. 1,
  suivant → ép. 2, ouverture directe `#ep=3` avec lecteur natif coupé ;
  myfluneo → détection "Aho-Girl, ép. 1, ansembed, suivant trouvé", lecture,
  suivant → page `episode-2` puis lecteur rouvert tout seul, progression
  `myfluneo.eu | Aho-Girl ép. 2 | …/saison-1`.
- **Limite connue (pub des sites)** : sur french-anime, la pub ouvre un onglet dès
  l'appui souris (`pointerdown`) → le 1er clic sur nos boutons est perdu, le 2e
  passe. Contournement possible : petit écouteur placé avant les scripts du site
  (`@run-at document-start`) — proposé, pas fait.

### 2026-10-02 (suite 9) — tentative "bloquer les pop-ups de pub" : abandonnée (rien publié)

Objectif : que la pub de french-anime (onglet ouvert dès l'appui souris) ne vole
plus le 1er clic sur nos boutons. Essayé (v6.23 locale, **annulée**, v6.22 reste
en ligne) : `@run-at document-start` + `whenDomReady()` pour le reste ;
neutralisation dans le contexte de la page de `window.open` (d'abord `null`, puis
fausse fenêtre), de `HTMLAnchorElement.prototype.click` (liens `_blank` étrangers)
et de `contentWindow.open` des iframes vides.
Résultat mesuré (vrais clics Playwright) : **identique avec ou sans blocage** — les
2 premiers clics sont avalés, le 3e passe, des onglets s'ouvrent quand même et
aucun appel bloqué n'est journalisé : la régie (`kr.sayyidvanglo.com/…`, script
"popunder") passe par un autre chemin et intercepte les clics (même un `.click()`
JS n'atteint pas le bouton). Avec `window.open → null`, c'était pire (elle avalait
tout pour réessayer). Conclusion : pas de gain, du risque (démarrage anticipé)
→ tout retiré.
Domaines : seul `finisheddaysflamboyant.com` est dans EasyList ;
`sayyidvanglo.com`/`mudeeepigne.cyou` ne sont dans aucune des listes vérifiées
(uAssets filters/badware, EasyList, AdGuard French) — domaines tournants.
Piste restante si besoin un jour : mettre nos commandes dans une iframe
(about:blank) pour que les écouteurs de la page ne voient plus nos clics — gros
remaniement. En pratique : uBlock Origin Lite en mode "Complet" pour ce site seul.

### 2026-10-02 (suite 10) — v6.23 : fiche de l'anime sur tous les sites

Demande : synopsis + genres/tags lisibles avant de commencer un anime, sur tous
les sites. Bouton **ℹ** dans le lecteur ("Fiche de l'anime"), le panneau et chaque
ligne de la fenêtre de suivi → fenêtre avec couverture, année, nb d'épisodes,
statut, note, prochain épisode, genres (traduits), tags AniList sans spoilers
(rang ≥ 60, 8 max), synopsis.
- Synopsis **FR depuis le site** : anime-sama → page `/catalogue/<nom>/`
  (`#synopsisText`) ; ailleurs → page de la série, plus long texte parmi
  `.synopsis-content`/`[itemprop=description]`/JSON-LD/`og:description`/meta,
  en écartant les textes publicitaires courts ("regarder… streaming"). Sinon
  synopsis AniList (anglais, signalé). Infos AniList via la même association que
  AniSkip (`aniLinks`).
- **Correctif** : `fetchPageHtml` passe par `fetch()` du navigateur pour le même
  site que la page → plus besoin d'`@connect` pour les sites ajoutés (leur
  vérification des nouveaux épisodes était refusée par Tampermonkey en v6.22).
- **Testé** (Playwright) : Bleach/anime-sama (synopsis FR complet, 366 ép., 7.9),
  Thunder 3/animoflix (FR, mais tronqué par le site lui-même), Thunder 3/french-anime
  (FR complet).

### 2026-10-02 (suite 11) — v6.24 : doublons de suivi sur Odysee

Signalé (capture) : 5 lignes pour le même anime dans le suivi Odysee ("Wan Jie
Du Zun Ten Thousand Worlds" ×4 à 317/319/327/328 + "Ten Thousand Worlds" 326) →
impossible de savoir où on en est. Cause : clé Odysee = chaîne + préfixe du titre
de la vidéo (`deriveOdyseeSeriesPrefix`) ; le même anime est publié par plusieurs
chaînes et avec des titres variables → une entrée par variante.
- `recordEpisodeProgress` : sur **Odysee seulement**, l'épisode vu remplace les
  autres entrées au même nom normalisé (`normalizeSeriesName`). Pas ailleurs :
  anime-sama donne le même nom à toutes les saisons (Bleach saison1/saison2).
- `mergeOdyseeDuplicatesOnce()` (drapeau `odyseeDedupDone`) : fusion unique des
  doublons existants en gardant **l'épisode le moins avancé** (choix de
  l'utilisateur : "repartir du plus ancien", pas de risque de sauter).
- "Ten Thousand Worlds" (nom différent) n'est pas fusionné : à retirer avec ✕ si
  c'est le même.
- **Testé** (Playwright, données simulées) : 4 doublons → 1 entrée ép. 317 ;
  "Ten Thousand Worlds" conservé ; Bleach S1 (50) et S2 (3) intacts.
- À suivre : l'utilisateur évoque un "problème de mise en cache" côté Odysee et
  l'envie de continuer via YouTube — à préciser.

### 2026-10-02 (suite 12) — v6.25 : vérification des sites ajoutés depuis un autre site

Vu dans la console de l'utilisateur (sur Odysee) : "Refused to connect to
https://myfluneo.eu/… not part of the @connect list". `checkForNewEpisodes()`
tentait de vérifier l'entrée myfluneo depuis Odysee ; les sites ajoutés ne sont
pas dans `@connect`. Désormais ignorés sauf depuis leur propre site.
En cours : blocages de lecture récurrents sur Wan Jie Du Zun (Odysee /
esprit-donghua : pause, F5 = quelques secondes puis re-blocage, tampon qui ne
reprend pas). Pas encore reproduit (lecture OK au moment du test) ; l'utilisateur
capturera l'onglet Réseau filtré "odycdn" + la console au prochain blocage.
Piste à tester : case "720p".

### 2026-10-02 (suite 13) — v6.26 : vidéo qui cale chez l'hébergeur (Wan Jie Du Zun)

**Cause trouvée** grâce à la capture Réseau de l'utilisateur (filtre `odycdn`) :
l'épisode lu via esprit-donghua (S3 E90 = "Season 2 Episode 364", chaîne
**@chaineparrainage**, claim 5cccc0e4…) est servi par Odysee en **MP4 brut non
transcodé** (`61864d.mp4`, 595 Mo pour 9 min 49 ≈ 8 Mbit/s, 1080p, H.264), avec
l'**atome `moov` (index) en fin de fichier** (`ftyp, free, mdat 623 Mo, moov`) :
dizaines de requêtes `206` dont beaucoup `(canceled)`, la vidéo cale après
quelques secondes, F5 → idem. Comparaison : S3 E99 de la chaîne @Akirama est
servi en HLS (`v1_s0000xx.ts`) et se lit sans souci, saut de reprise compris.
→ Problème du fichier publié par cette chaîne, pas du script ni de la reprise.
- **Détection dans le lecteur** (tous hébergeurs) : position figée + `readyState
  < 3` pendant 15 s alors que la lecture avait démarré → message `stall` ; reprise
  → `stall-fini` (l'encadré se referme seul). Une vraie pause utilisateur garde
  `readyState ≥ 3` et ne déclenche rien.
- **Encadré** (même que les liens morts, variante "La vidéo cale chez
  l'hébergeur") : "Ce n'est pas un problème de Vidéo Continuum", astuce "Lien
  YouTube de secours", boutons **Réessayer** (recharge le lecteur, reprise à la
  dernière position), **Chercher sur YouTube**, **Rechercher sur Google**,
  **Épisode suivant**. "Chercher sur YouTube" ajouté aussi à l'encadré des liens
  morts.
- **Testé** (Playwright, faux lecteur qui cale de 6 à 30 s) : encadré à 21 s,
  refermé à 30 s, boutons présents.
- Piste non faite : chercher le même épisode sur une autre chaîne Odysee
  (transcodée HLS) — numérotations différentes selon les chaînes (S2 E364 vs
  S3 E90/E99), à voir si le problème se répète.

### 2026-10-02 (suite 14) — v6.27 : YouTube sans clé d'API, compilations, sous-titres FR, bascule auto

Demande : basculer automatiquement sur YouTube pour Wan Jie Du Zun (fichiers
Odysee illisibles, même source sur animoflix). Source trouvée par l'utilisateur :
chaîne **Anime Zone** (UCUZxkPZPkzObCb7aCDjUNmg), titres "✨Ten Thousand Worlds EP 364
[MULTI SUB]" et compilations "EP 365-384" / "EP 201 - EP 250 Full Version", même
numérotation que notre suivi, pas de chapitres, épisodes ≈ 7 min 04, sous-titres
anglais de la chaîne (traduisibles).
- **Remplace la v6.5** (clé API YouTube Data obligatoire, jamais utilisée) : code
  API supprimé (`youtubeApiRequest`, playlists, menu "Configurer la clé API").
- **Association** par série (`youtubeChannelAssociations`, une fois) : lien d'une
  vidéo → chaîne (`ytInitialPlayerResponse.videoDetails`) + nom de la série déduit
  du titre (modifiable).
- **Recherche sans clé** : page `youtube.com/channel/<id>/search?query=<nom> EP <n>`
  (puis sans "EP n" en repli), lecture de `ytInitialData` ; épisode seul en
  priorité, sinon la plus petite compilation contenant n ; position =
  (n − premier) × durée ÷ nb d'épisodes. `@connect www.youtube.com` ajouté.
- **Lecteur** : embed `?start=…&cc_load_policy=1&cc_lang_pref=fr&hl=fr` +
  fragment `#vcseg=premier-dernier-duréeParÉpisode`. Pilote in-frame YouTube :
  `movie_player.setOption('captions','track', {languageCode:'en',
  translationLanguage:{languageCode:'fr'}})` (piste FR directe si elle existe) —
  vérifié : "Anglais >> Français".
- **Mode YouTube par série** (`youtubeMode`) : activé à la bascule ; ensuite chaque
  épisode de la série est cherché sur YouTube avant de charger ; "Revenir à la
  source du site" l'annule. Sur YouTube : pas d'intro/outro/AniSkip/reprise (temps
  faux dans une compilation) ; le **suivi avance tout seul** quand la lecture passe
  la limite d'un épisode ; suivant / aller-à cherchent sur YouTube (les pages
  esprit-donghua ne correspondent pas aux numéros : "S3 E90" = ép. 345).
- **Bascule automatique** : vidéo qui cale (v6.26) + chaîne associée → YouTube
  sans intervention ; sinon le bouton "Lire sur YouTube" de l'encadré demande le
  lien la 1re fois.
- **Testé** (Playwright, vraie chaîne) : esprit-donghua ép. 373 → vidéo "EP 373",
  sous-titres FR ("Dois-je lui dire ?") ; page rouverte → directement YouTube ;
  aller-à 210 → "EP 201 - EP 250" à 3812 s (9 × 424) ; passage de limite → suivi
  ép. 211.

### 2026-10-02 (suite 15) — v6.28 : "Revenir à la source du site" réparé

Signalé : après le retour au site, "Suivant" → alerte "Aucun épisode suivant
détecté". Cause : on rechargeait l'épisode tel qu'il était en mode YouTube (copie
sans liens suivant/précédent ni lecteur du site — esprit-donghua numérote ses pages
"S3 E93" ≠ n° d'épisode). Corrigé :
- sites "une page par épisode" : **la page est re-téléchargée et relue** (la page
  affichée a son lecteur neutralisé en about:blank par notre script) → vrai
  lecteur + vrais liens suivant/précédent ;
- **tous les liens YouTube mémorisés de la série sont oubliés** (sinon l'épisode de
  la page repartait sur YouTube).
**Testé** (Playwright) : YouTube → aller à 380 → retour au site → épisode de la
page (373) sur Odysee → Suivant → 374, sans alerte. Note : on revient à l'épisode
de la page ouverte, pas forcément à l'endroit où on s'était arrêté sur YouTube.

## 2026-10-06 - v6.29 : panneaux alleges, historique, "Aller" corrige

- Panneaux : boutons principaux en haut, filtre + resume par site + "Sites" tout en bas ; titres de menus sur fond gris ; Reglages = Fin intro / Debut outro (reste dans "Plus") ; "Autres sources" = Odysee + YouTube ; AniSkip en 12 px.
- "Suivre cet anime" = gros bouton (vert "Suivi"), decoche par defaut pour un nouvel anime ; reste suivi si le meme nom est deja suivi sur ce site (saisons anime-sama, variantes Odysee).
- Historique (GM `watchHistory`, 50 series max, une ligne par serie) : Reprendre / Suivre / croix, doublons entre sites en rouge ; inclus dans l'export/import (bloc `ed-history-backup`).
- Filtre par defaut "Sites a rattraper" (cle GM `panelSiteFilter2`) ; ligne "doublons" (meme nom normalise sur 2 sites) avec croix (= ne plus suivre).
- "Aller" : vraie cause = Esprit Donghua numerote l'URL par saison (s5-e17 = Eps 193) -> table numero->URL lue dans `.episodelist` ; zero devant (-e06) ; plus de blocage sur "dernier connu" ; repli sur la page de la serie.
- Teste en Playwright sur esprit-donghua (Aller 113 et 5, Suivre, Historique, doublons). Pas teste : anime-sama/animoflix/sites ajoutes avec la nouvelle mise en page.

## 2026-10-06 - v6.30 : finitions du panneau

- Numero d'episode 18 px ; "Chargement... N%" affiche en fine barre (statusHtml), autres messages inchanges ; `lastStatusText` (var, pas let : TDZ) pour resynchroniser le panneau et le rapport d'incident.
- "Lecture continue" / "Lecteur auto" = boutons bascule cote a cote ; 720p dans Reglages > Plus ; "Plus" = sous-menu decale (collapsibleSection(..., sub)).
- Sites en bas : petits boutons toujours visibles + "Ouvrir dans" juste dessous (plus de menu Sites).
- Corrige : nom de la serie ecrase a 0 px dans le calque (overflow:hidden dans une colonne flex qui deborde) -> flex-shrink:0.
- Teste en Playwright sur esprit-donghua (barre, bascules, rendu complet).

## 2026-10-06 - v6.31 : decompte avant la coupure

- Iframe : debut d'outro regle (sans fin) -> signal 'outro-reached' 4 s avant avec remaining = outroStart + 2 - t (decompte ~6 s, enchainement 2 s apres le debut du generique) ; sinon (pas d'outro ou outro en plage) -> nouveau signal 'near-end' 4 s avant la fin (enchainement a la fin). 'ended' reste le repli.
- Encadre du decompte en bas a droite (ne cache plus les sous-titres) + "Suivant maintenant".
- Boutons Fin intro / Debut outro verts si regles (manuel ou AniSkip), gris sinon (refreshIntroOutroButtons, appele par applyRuntimeConfig et le panneau).
- Teste en Playwright (Odysee reel, ep. 192) : near-end -> decompte 4 s puis ep. 193 ; outro 5:10 -> signal a 306 s, remaining 5,9 s, enchainement ; boutons gris/vert.

## 2026-10-08 - v6.36 : YouTube en vignettes, plus de lien a coller

- Supprimes : champ "Lien YouTube de secours", "Utiliser ce lien", "Retirer le lien" (2 panneaux) + `setYoutubeOverride`/`clearYoutubeOverride`/`askYoutubeAssociation` (prompt de lien). "Revenir a la source du site" efface toujours les liens memorises.
- "Trouver sur YouTube" = recherche generale (`searchYoutubeForEpisode`) affichee en vignettes dans l'encadre du calque (`showYoutubeChooser`, rendu partage avec l'encadre "video cale" via `renderYoutubeChoices`). Clic = chaine retenue pour la serie. Chaine associee sans resultat -> vignettes au lieu d'un message.
- Compilations : `positionHit` lit les chapitres de la video (`chapterRenderer` de la page watch) ; titres "EP N" ou, si aucun chapitre numerote, autant de chapitres que d'episodes ; sinon estimation duree / nb. Debuts transmis dans `#vcseg=first-last-perEp-s1.s2...` -> le suivi avance au vrai changement de chapitre.
- Teste : `chapterStarts` (page reelle a 11 chapitres + cas synthetique "Intro + EP"), recherche reelle (Ten Thousand Worlds 200 -> compilation 181-200 a 8049 s, estime ; aucune compilation trouvee n'a de chapitres), Playwright esprit-donghua : anciens champs absents, bouton ouvre l'encadre. Pas teste : clic sur une vignette dans le calque (meme chemin qu'avant, v6.34).

## 2026-10-08 - v6.37 : recherche YouTube elargie, consentement cookies, "Plus de videos"

- Recherche generale : chaque nom de la serie (2 premiers) x "episode N vostfr" / "EP N" en parallele. Avant : seul "Wan Jie Du Zun episode 199 vostfr" -> rien ; les compilations sont titrees en anglais ("Ten Thousand Worlds EP 181 - EP 200") et ne citent pas 199.
- `ucbcb=1` sur les 3 adresses YouTube (results, channel search, watch) : sans cookie de consentement (Europe), YouTube renvoie consent.youtube.com sans ytInitialData -> "Suivant" retombait sur Odysee en silence. Echec de recherche auto desormais logue (plus de catch muet).
- Iframe YouTube : CSS masque `.fullscreen-watch-next-entrypoint-wrapper` ("Plus de videos", cachait les reglages) et `.ytp-pause-overlay`.
- Teste Playwright (Ten Thousand Worlds ep. 199 sur esprit-donghua) : vignette compilation 181-200 -> clic -> YouTube a 2:07 (7625 s, estime), chaine Anime Zone retenue, sous-titres FR ; Suivant -> ep. 200 meme video a 8049 s ; "Plus de videos" display:none, reglages visibles.

## 2026-10-08 - v6.38 : boutons Prec./Suiv. sur la video, badges VOSTFR

- Iframe (runInsidePlayerFrameGeneric) : mousemove/touchstart -> message 'activity' (max 1 / 400 ms). Calque : 2 boutons ronds a 130 px de part et d'autre du centre, visibles 3 s apres le dernier mouvement (showNavButtons), caches s'il n'y a pas d'episode avant/apres ; clic = clic sur #ed-prev-btn / #ed-next-btn.
- goToPreviousEpisode en mode YouTube : episodeInfoForNumber(n - 1) comme Suivant (avant : "Aucun episode precedent detecte" sur les sites une page par episode).
- Vignettes : badge vert VOSTFR (titre) ou orange "ST auto FR" (piste traduite par YouTube).
- Teste Playwright (Ten Thousand Worlds ep. 149) : Odysee -> boutons invisibles au repos, visibles quand la souris bouge, caches apres 3,5 s, ⏭ -> 150, ⏮ -> 149 ; vignette compilation 141-160 badge ST auto FR ; YouTube -> ⏮ -> 148 dans la meme video (3389 s -> 2965 s).

## v6.39 (2026-10-09)
- Boutons ⏮/⏭ en bas au centre (bottom:90px, ±130px), ⏭ toujours visible, grise + "Pas encore sorti" s'il n'y a pas d'episode suivant (signale : Lingwu 219 = dernier sorti, ⏭ absent -> pris pour un bug).
- Retour utilisateur : les blocages arrivent sur les videos SANS choix de qualite (fichier d'origine), et sur le grand ecran seulement. Le message 'stall' de l'iframe porte `direct` (currentSrc pas en blob: = pas de HLS/MSE) -> pas de rechargement auto, YouTube direct (association ou recherche). Hypothese a confirmer : Odysee sert l'original en URL directe. Piste non-code donnee : desactiver l'acceleration materielle Chrome pour tester le decodage GPU.
- Teste : node --check seulement, pas en navigateur.

## v6.40 (2026-10-09)
- Pastilles sur les vignettes (`refreshThumbnailBadges`, tous sites) : vert suivi ici, turquoise suivi ici + `newEpisodes`, jaune suivi sur un autre site, rouge exclu. Reconnaissance par nom (`nameVariants` : nom entier, hors parentheses, entre parentheses ; suffixes "S3 E28", "E280", "Episode N", "Saison N" retires). Titre lu dans a[title], img[alt], puis h1-h4. Pastille en haut a gauche (ED met "ONA" a droite). Rafraichie par MutationObserver (400 ms) et apres checkForNewEpisodes.
- Teste : Playwright sur l'accueil ED reel (vert/jaune/rouge OK, capture). Turquoise pas teste en vrai (depend de la verif reseau). anime-sama / animoflix pas testes.

## v6.41 (2026-10-09)
- Pastille ronde -> icone SVG inline reprise de l'icone Flaticon "lister" choisie par l'utilisateur (3 cases a la couleur de l'etat + 3 traits pilule blancs, 1re case cochee, croix si exclu) dans un carre sombre 36px, couleur = etat, coche tracee par <animate> SMIL (pas de CSS injecte). Icones Flaticon proposees par l'utilisateur ecartees (GIF non recolorable, attribution, chargement externe ; site bloque Playwright). Redessin seulement si l'etat change (data-state).
- Teste : Playwright accueil ED (capture vert/jaune/rouge OK).

## v6.42 (2026-10-09)
- ⏮/⏭ : 64px -> 42px (police 26 -> 17), bottom 90 -> 64px (barre de progression Odysee a ~54px du bas sur la capture utilisateur), ecart ±130 -> ±90px. Non teste en navigateur.
- Session 2026-10-09 : v6.39 a v6.42 publiees (dernier commit 4b457ce).
- Suite : retours utilisateur attendus sur (1) les icones des vignettes sur anime-sama/animoflix et la turquoise, (2) la bascule YouTube directe sur les videos sans choix de qualite (si un rechargement a encore lieu, le test `direct` = pas d'adresse blob: est faux), (3) le test acceleration materielle Chrome desactivee sur le grand ecran, (4) taille/position de ⏮/⏭ v6.42.

## v6.43 (2026-10-09)
- Console utilisateur : "Refused to connect to legacy:Tun Shi Xing Kong (Swallowed Star)" + 404 sur s4-e243 / s4-e178. Cause : entrees importees d'une vieille sauvegarde (seriesUrl = "legacy:<nom>") ; adresse d'episode renumerotee -> 404 -> relocateEdEpisodeUrl chargeait seriesUrl = "legacy:..." -> refus Tampermonkey. Correctif : edSeriesPageUrl() = recherche ED `?s=<nom hors parentheses>`, 1er `article.bs a[href*="/anime/"]` (verifie a la main : swallowed-star, will-eternal ; will-eternal liste bien epl-num 178). seriesUrl (= cle) non modifie, seule l'adresse d'episode est corrigee et enregistree.
- Page Bitdefender "telechargement bloque" sur mushen-ji-tales-of-herding-gods-e08 : vient d'une pub du site, pas du script (aucune ligne du script ne telecharge d'executable).
- Teste : node --check seulement.

## v6.44 (2026-10-09)
- ⏮/⏭ sous la barre de lecture (demande utilisateur, capture Odysee : barre a ~45px du bas, rangee des commandes centree a ~22px) : bottom 64 -> 6px, 42 -> 32px, police 17 -> 14. Non teste en navigateur (YouTube : rangee de commandes similaire, a verifier).

## v6.45 (2026-10-09)
- Anime-Sama : captures utilisateur, icones absentes ou cachees. Cause verifiee sur anime-sama.to (Playwright, elementFromPoint) : `.anime-badge` / `.scan-badge` du site (z-index 15) en haut a gauche recouvrent notre icone (z-index 5) sur les cartes anime-card-premium, scan-card-premium et carteHistorique ; seules les catalog-card (sans etiquette) la montraient. Correctif : sur anime-sama, icone en bas a droite, z-index 16. Verifie sur 9 cartes de chaque type : visible, ne touche pas "Fiche" (bas gauche). Autres sites inchanges.

## v6.46 (2026-10-09)
- Meme correctif sur animoflix (capture utilisateur : icone sous l'etiquette ANIME ; balisage identique a anime-sama). Verifie Playwright sur animoflix.to : en bas a droite visible sur toutes les cartes a l'ecran (echecs = cartes hors ecran du carrousel). Esprit Donghua reste en haut a gauche.

## v6.47 (2026-10-09)
- Animoflix (capture utilisateur, cartes Red River de "Reprenez votre visionnage") : 2e icone en haut au milieu. Cause : la boucle prend toutes les `a[href] img`, y compris le drapeau `.language-badge-top.badge > img` du meme lien ; quand le nom correspond, icone posee sur le drapeau. Correctif : ignorer les img dans `.badge` ou de largeur < 60px (et retirer une icone deja posee). Parent `.badge` du drapeau verifie sur animoflix.to (Playwright) ; cartes historique non reproduites (generees depuis le compte).
