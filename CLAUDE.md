# Vidéo Continuum (ex EspritDonghua-Script / Anime Tracker)

Userscript Tampermonkey : lecteur plein ecran par-dessus l'iframe du site, saut intro/outro,
enchainement des episodes, suivi de progression par serie, sauvegarde/restauration,
repli YouTube (recherche sans cle d'API, compilations).
Depot : github.com/Tryne-graphik/Vid-os-continuum (MAJ auto Tampermonkey depuis `master` :
tout push = mise a jour chez les utilisateurs -> demander avant de pousser).
Journal : `HISTORIQUE.md` (long : lire la fin, grep pour un sujet). v7 (`PLAN-v7.md`) en pause.

## Fichiers cles
- `esprit-donghua-suivi-progression-v6.user.js` : version ACTIVE (les v3/v4/sans suffixe sont anciennes).
- (`anime-tracker-generique.user.js` v1.0 supprime en v6.50 : la version generique partira de la v6 ; recuperable via git.)
- Sauvegarde : blocs JSON `ed-progress-backup`, `ed-history-backup`, `ed-settings-backup` (BACKUP_SETTINGS / BACKUP_PREFS,
  `cleanBackupValue` a l'import : fichier non fiable). Toute nouvelle donnee utilisateur en GM -> l'ajouter a BACKUP_SETTINGS.
- `installateur/Program.cs` : installateur (ouvre seulement des pages ; SHA-256 de l'exe dans README a mettre a jour si rebuild).
- `google-apps-script/`, `odysee-referer-extension/`, `save/` (exemple de sauvegarde).

## A chaque version
- Monter `@version` ET ajouter une entree en tete de `CHANGELOG` (encart "Nouveautes").
- Chaines JS entre apostrophes : echapper `\'` (les patchs via bash/python perdent souvent l'echappement -> `node --check`).
- Ajouter une section a la fin de `HISTORIQUE.md` (ce qui a ete teste / pas teste).

## YouTube (v6.27 -> v6.38)
- Recherche generale `searchYoutubeForEpisode` (2 noms de la serie x "episode N vostfr" / "EP N") ->
  vignettes (`renderYoutubeChoices`) ; clic = chaine retenue (`youtubeChannelAssociations`), puis
  `findYoutubeEpisode` cherche sur cette chaine pour les episodes suivants.
- Compilations : `positionHit` lit les chapitres (`chapterRenderer`), sinon duree / nb d'episodes ;
  bornes et debuts transmis dans le fragment `#vcseg=first-last-perEp[-s1.s2...]`.
- Toujours `ucbcb=1` dans les adresses YouTube : sinon page de consentement cookies (Europe), sans resultats.
- Le script tourne aussi dans l'iframe YouTube (sous-titres FR, CSS qui masque "Plus de videos").

## Suivi : etats et saisons (v6.40 -> v6.49)
- Icones des vignettes : `refreshThumbnailBadges`, `badgeSvg` / `badgeInfo` (fonctions, pas de const : legende du panneau).
  Anime-sama / animoflix : en bas a droite (leur etiquette "Anime" z-index 15 cache le haut gauche).
- GM `seasonDone` (pause = saison finie), `newSeasons` (saison suivante trouvee), `seasonDismissed` (saison ignoree) ;
  `isBehind(key)` = regle unique "a rattraper" (compteurs, liste, tri, icones). `forgetSeasonState` quand une entree disparait.
- `seasonOf(url)` / `findNextSeason(e)` : anime-sama (panneauAnime + episodes.js non vide), animoflix (saison-N, meme cle),
  myfluneo (slug-N). Saison suivante vue -> l'ancienne (anime-sama / myfluneo) est retiree de la progression.

## Pieges connus
- Sous Tampermonkey, `window` est un proxy : `unsafeWindow` pour `showSaveFilePicker`.
- Adaptateurs par site (`SITE_ESPRIT_DONGHUA`, `SITE_ANIMOFLIX`, `SITE_ANIME_SAMA`), stockage cle `site::seriesUrl`.
- Esprit Donghua numerote ses URL par saison (s2-e149 = episode 199) : ne pas deduire le numero de l'URL.
- La page et l'iframe du lecteur communiquent par `postMessage` (`MSG_PREFIX` + type : position, activity, ended...).
- Un lecteur qui "cale" vient souvent du fichier Odysee (MP4 brut non transcode), pas du script ; un bloqueur de pub aussi.

## Tests (Playwright, pas dans le depot)
- Charger le script via `file:///...user.js` (innerText), l'injecter avec `addInitScript` dans une NOUVELLE page
  (`page.context().newPage()`, sinon l'ancien script injecte reste), enveloppe dans DOMContentLoaded.
- Shim GM_* sur localStorage ; GM_xmlhttpRequest via `exposeFunction` + `page.request` ; semer `lastAutoExport`
  (sinon telechargement auto) ; neutraliser `confirm`/`alert` ; fermer les popups de pub du site.
- Les clics : `el.click()` en JS (les iframes de pub du site interceptent la souris).
- Exemple fiable : Ten Thousand Worlds (`wan-jie-du-zun-ten-thousand-worlds-s2-e149`, chaine YouTube Anime Zone).
