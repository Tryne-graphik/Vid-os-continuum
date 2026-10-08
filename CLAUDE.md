# Vidéo Continuum (ex EspritDonghua-Script / Anime Tracker)

Userscript Tampermonkey : lecteur plein ecran par-dessus l'iframe du site, saut intro/outro,
enchainement des episodes, suivi de progression par serie, sauvegarde/restauration,
repli YouTube (recherche sans cle d'API, compilations).
Depot : github.com/Tryne-graphik/Vid-os-continuum (MAJ auto Tampermonkey depuis `master` :
tout push = mise a jour chez les utilisateurs -> demander avant de pousser).
Journal : `HISTORIQUE.md` (long : lire la fin, grep pour un sujet). v7 (`PLAN-v7.md`) en pause.

## Fichiers cles
- `esprit-donghua-suivi-progression-v6.user.js` : version ACTIVE (les v3/v4/sans suffixe sont anciennes).
- `anime-tracker-generique.user.js` : variante generique (v1.0, jamais testee).
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
