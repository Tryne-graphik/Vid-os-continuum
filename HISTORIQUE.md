# Historique de travail - Script Esprit Donghua

## Note importante

Je n'ai pas de mémoire enregistrée des sessions précédentes où ce script a été
écrit/modifié — ma mémoire persistante ne contient qu'une entrée sur un autre
projet (skin Rainmeter PillReminder). Cet historique n'est donc **pas** un
journal des conversations passées, mais un état des lieux du script tel qu'il
existe aujourd'hui (15/09/2026), déduit de la lecture du code.

À partir de maintenant, je peux tenir ce fichier à jour à chaque changement
qu'on fait ensemble — dis-moi simplement de le compléter après chaque session.

## Fichier

- `esprit-donghua-suivi-progression.user.js` — script Tampermonkey, v2.6
- Cible : `esprit-donghua.xyz` (page principale) + `odysee.com` (iframe du lecteur vidéo)
- Stockage : `GM_setValue`/`GM_getValue` (persistant par domaine, propre à Tampermonkey)

## État actuel (v2.6) — fonctionnalités identifiées dans le code

- **Suivi de progression par anime** : mémorise le dernier épisode ouvert
  (nom de la série, numéro/titre d'épisode, URL, date) à chaque page d'épisode
  visitée, sauf si la série est explicitement exclue du suivi.
- **Panneau persistant en haut de page** (`buildPersistentPanel`) : affiche
  l'épisode en cours, un sélecteur pour reprendre n'importe quel anime suivi,
  des cases à cocher (Suivre cet anime / Son auto / Lecture continue), et des
  boutons (Fin intro / Début outro / Réglages / Exporter).
- **Lecture continue automatique** : détecte le lien vers l'épisode suivant,
  déclenche un compte à rebours de 5s (annulable) puis navigue vers l'épisode
  suivant. Déclenchement soit par signal réel du lecteur (générique de fin
  atteint), soit par un minuteur de secours (durée de l'épisode ou début
  d'outro configuré).
- **Détection du générique de fin par série** (`introEnd`/`outroStart`,
  configurables via prompt ou le panneau de réglages) : permet de sauter
  l'intro automatiquement et de détecter précisément la fin de l'épisode côté
  lecteur Odysee (frame injectée).
- **Simulation du clic sur le bouton "lecture"** dans l'iframe Odysee, car le
  lecteur n'insère la balise `<video>` qu'après une interaction utilisateur —
  nécessaire pour que la navigation automatique fonctionne.
- **Rechargement automatique de la frame** si la vidéo ne charge pas dans les
  10s (une seule tentative, protégée par `sessionStorage` pour éviter une
  boucle de rechargement infinie).
- **"Son auto" (expérimental)** par série : tente de réactiver le son sur la
  vidéo Odysee (mutée par défaut par Chrome). Gère le cas où Chrome met la
  vidéo en pause suite à cette tentative (remise en muet + relance de la
  lecture pour ne jamais rester bloqué), et remonte l'état du son à la page
  principale via `postMessage` pour affichage d'un indicateur "🔇 Son coupé".
- **Export de la progression en HTML** (`exportProgress`), avec auto-export
  quotidien (une fois par jour, `lastAutoExport` en date AAAA-MM-JJ).
- **Panneau de réglages centralisé** (`openSettingsModal`) : tableau listant
  tous les animes suivis, avec édition en masse de fin d'intro / début outro /
  suivi actif / son auto.
- **Communication inter-frames** via `postMessage` avec vérification stricte
  de `event.origin` (page principale ↔ iframe Odysee) pour la config
  intro/outro, le son auto, les signaux de compte à rebours et de fin
  d'épisode.

## Pistes / points à surveiller (déduits du code, non confirmés comme "en cours")

- Le "Son auto" est explicitement marqué expérimental dans le code — peut
  mettre la vidéo en pause quelques instants selon la politique anti-autoplay
  de Chrome.
- La détection de l'épisode suivant repose sur la structure DOM du site
  (`.naveps.bignav`, `rel="next"` en fallback) — fragile si le site change son
  HTML.
- Pas de gestion d'erreur si `GM_getValue`/`GM_setValue` échouent ou si le
  quota de stockage Tampermonkey est dépassé.

## Journal des sessions

### 2026-09-15
- Le script a été déplacé de `C:\Users\Tryne\Desktop\` vers
  `E:\EspritDonghua-Script\` pour le ranger.
- Création de ce fichier d'historique.
- Discussion : la v2.6 embarque le lecteur Odysee dans un iframe sur la page
  esprit-donghua.xyz, ce qui pose deux problèmes difficiles à contourner dans
  cet iframe : le son coupé par la politique anti-autoplay de Chrome (le clic
  sur "lecture" est simulé par script, donc traité comme un autoplay sans
  vrai geste utilisateur), et le plein écran limité par les contraintes d'un
  iframe cross-origin imbriqué.
- Décision : créer une **v3.0 expérimentale**, fichier séparé
  (`esprit-donghua-suivi-progression-v3.user.js`), qui ouvre l'épisode dans
  une **vraie fenêtre/onglet séparé** pointant directement sur odysee.com
  (contexte de navigation de premier niveau) au lieu de l'iframe intégré. La
  v2.6 reste intacte et inchangée pour ne rien casser de ce qui fonctionne.
- Principe technique retenu : `window.open(url, 'espritdonghua-player-v3')`
  avec un nom de fenêtre fixe et réutilisé à chaque passage à l'épisode
  suivant — naviguer une fenêtre déjà ouverte via son nom ne déclenche pas le
  bloqueur de popups (contrairement à l'ouverture d'une fenêtre inédite, qui
  exige un vrai clic la première fois). Marqueur dans l'URL (`#espritdonghua-player`)
  + vérification de `window.opener` côté fenêtre odysee.com pour ne pas
  interférer avec une navigation normale de l'utilisateur sur odysee.com.
- Limite connue de la v3 : la conversion de l'URL de l'iframe embed Odysee
  (`/$/embed/...`) vers l'URL de la page de visionnage réelle est écrite de
  façon défensive mais **non testée en conditions réelles** — le site
  esprit-donghua.xyz a renvoyé une erreur 403 lors d'une tentative de
  vérification automatique de sa structure HTML (protection anti-bot), donc
  le format exact de l'iframe n'a pas pu être confirmé à l'avance. La
  conversion et l'URL détectée sont loguées dans la console à chaque
  tentative d'ouverture pour faciliter le diagnostic si ça ne marche pas du
  premier coup.
- Autre limite assumée (simplicité) : si l'utilisateur rafraîchit
  manuellement la page de l'épisode en cours, la fenêtre séparée est
  relancée depuis le début de la vidéo (pas de reprise de position).
- **Test réel effectué** : la fenêtre s'est bien ouverte avec une URL valide
  (`https://odysee.com/AS033:e?r=...#espritdonghua-player`), donc la
  détection/conversion `embedUrlToWatchUrl()` fonctionne correctement. En
  revanche, le script ne se déclenchait pas du tout sur cette fenêtre (aucun
  effet : pas de clic auto sur "lecture", rien).
- **Diagnostic** : la v3.0 se basait sur `window.opener` à la fois pour
  décider de s'activer sur la fenêtre odysee.com ET pour communiquer
  (`postMessage`) avec l'onglet principal. Hypothèse retenue : odysee.com
  envoie un en-tête `Cross-Origin-Opener-Policy` qui casse ce lien, même
  lorsque la fenêtre est ouverte via `window.open()` depuis notre page — donc
  `window.opener` valait `null` côté fenêtre Odysee et la condition
  d'activation du script échouait silencieusement.
- **Correctif (v3.1)** : suppression totale de la dépendance à
  `window.opener`/`postMessage`. La fenêtre lecteur s'active désormais via un
  identifiant de session encodé dans l'URL (`#espritdonghua-player:ID`), et
  toute la communication entre l'onglet principal et la fenêtre lecteur passe
  par le stockage partagé de Tampermonkey (`GM_setValue` +
  `GM_addValueChangeListener`), qui fonctionne entre onglets/origines
  indépendamment de tout lien `window.opener`/COOP.
- **Question soulevée par l'utilisateur** (résolue par la conception, pas par
  du code) : crainte que jouer directement sur Odysee complique la
  navigation entre épisodes (numérotation peu claire, VOSTFR difficile à
  suivre sur le site d'Odysee lui-même). Réponse : ce n'est pas un problème
  ici, car la fenêtre séparée ne fait jamais de recherche sur Odysee — c'est
  toujours esprit-donghua.xyz qui détermine l'épisode suivant (comme en v2.6)
  et qui indique explicitement l'URL Odysee correspondante à afficher.
- **Test v3.1 confirmé fonctionnel** : logs de la séquence complète observés
  (script démarré, clic auto sur lecture, vidéo trouvée, config reçue) — le
  correctif "canal GM au lieu de window.opener" fonctionne. Les nombreuses
  lignes `ERR_BLOCKED_BY_CLIENT` visibles (sentry, watchman/reports/playback,
  api.odysee.com/account/check) viennent du bloqueur de pub de l'utilisateur
  et sont sans rapport avec le script (watchman/reports/playback en boucle
  est même un signe que la lecture est en cours, Odysee tentant d'envoyer un
  rapport de progression périodique).
- **Résultat utilisateur** : la vidéo se lance bien avec le son (objectif
  principal de la v3 atteint). Deux points restants signalés :
  1. Le saut d'intro ne s'applique pas.
  2. Le changement d'épisode automatique ne se déclenche pas.
- **Cause identifiée** : les réglages "Fin intro"/"Début outro" sont stockés
  par script dans Tampermonkey — la v3 a un stockage totalement séparé de la
  v2.6, donc les valeurs éventuellement configurées côté v2.6 n'existent pas
  côté v3. Il faut les re-rentrer une fois via les boutons du panneau v3 pour
  chaque série. Sans "Début outro" configuré, le changement d'épisode ne se
  basait que sur une estimation de durée (20 min par défaut) — normal que
  rien ne se déclenche si le test n'a pas duré aussi longtemps.
- **Amélioration v3.2** : ajout d'un écouteur natif sur l'événement `ended`
  de la balise `<video>` dans la fenêtre lecteur, qui déclenche desormais le
  passage à l'épisode suivant dès la vraie fin de la vidéo, sans dépendre
  d'un "Début outro" configuré ni de l'estimation de durée (qui restent des
  filets de sécurité complémentaires, utiles pour sauter le générique de fin
  avant la fin exacte du fichier).
- **Prochaine étape à faire ensemble** : reconfigurer "Fin intro"/"Début
  outro" pour la série testée dans le panneau v3, puis retester le saut
  d'intro ; vérifier aussi que le changement d'épisode se déclenche bien à la
  fin réelle de la vidéo (v3.2) sans avoir besoin d'attendre l'estimation de
  durée.
- **Question v2.6** : possibilité de regrouper "passer en plein écran" et
  "réactiver le son" sur un même clic. Piste écartée : un bouton placé sur la
  page esprit-donghua.xyz ne peut pas déclencher un vrai déblocage du son
  dans l'iframe Odysee, car le geste utilisateur doit avoir lieu sur la bonne
  origine (odysee.com) pour que Chrome l'autorise — c'est la racine du bug de
  son. Solution retenue à la place : le clic réel de l'utilisateur sur le
  bouton plein écran *du lecteur Odysee lui-même* (a l'interieur de l'iframe)
  est un vrai geste sur la bonne origine, contrairement au clic simulé sur
  "lecture" fait par le script. On peut donc profiter de N'IMPORTE QUEL vrai
  clic a l'interieur du lecteur pour retenter l'activation du son.
- **Implémentation v2.7** (`esprit-donghua-suivi-progression.user.js`) :
  ajout d'un écouteur de clic (`document.addEventListener('click', ..., true)`,
  filtré sur `event.isTrusted` pour ignorer le clic simulé sur "lecture")
  dans `runInsidePlayerFrame()`. Sur le premier vrai clic detecte (typiquement
  celui sur le plein ecran) alors que la video est encore muette, il retente
  `tryAutoUnmute()`. Il a fallu ajouter un parametre `force` a
  `tryAutoUnmute(video, force)` pour contourner le verrou
  `autoUnmuteAttempted` qui, sinon, aurait deja ete pose par la premiere
  tentative synthetique (juste apres le clic simule sur "lecture") et aurait
  empeche toute nouvelle tentative lors du vrai clic. Toujours conditionne au
  reglage "Son auto" existant (par serie).
- **À tester** : recharger la v2.7 dans Tampermonkey, lancer un épisode avec
  "Son auto" coché, puis cliquer sur le bouton plein écran du lecteur Odysee
  et vérifier que le son se réactive à ce moment-là sans clic supplémentaire
  sur l'icône son.

### 2026-09-16
- Question posée : peut-on ouvrir le lecteur dans une fenêtre que le script
  génère et contrôle lui-même, pour garder le plein écran ET le son continus
  d'un épisode à l'autre (enchaînement fluide) ?
- Réponse donnée avant tout code : le son a de bonnes chances de déjà bien
  fonctionner avec la v3 (Media Engagement Index de Chrome), mais le plein
  écran ne peut pas survivre à une vraie navigation de page (changement
  d'URL de la fenêtre vers l'épisode suivant) — le Fullscreen API exige un
  vrai geste utilisateur sur *chaque nouveau document*, contrainte du
  navigateur non contournable par script. Pour un enchaînement vraiment
  fluide, il faut ne jamais recharger de document : garder la même fenêtre/
  page ouverte et changer seulement la source vidéo entre épisodes.
- **Test de faisabilité effectué (hors navigateur, requêtes brutes via
  curl/WebFetch, pas encore dans Tampermonkey)** :
  - L'API publique d'Odysee (`api.na-backend.odysee.com`, méthode JSON-RPC
    `resolve` puis `get`) permet de retrouver, à partir d'un URI `lbry://`,
    une `streaming_url` pointant vers le fichier vidéo brut (mp4) d'un
    épisode.
  - Ce fichier est protégé par un contrôle du header `Referer` côté CDN
    (`player.odycdn.com`) : 401 sans, 200 avec `Referer: https://odysee.com/`
    — confirmé avec un vrai fichier (taille reçue identique à celle annoncée
    par l'API : 556 988 349 octets), et `Accept-Ranges: bytes` supporté.
  - `GM_xmlhttpRequest` (déjà utilisé dans le script) peut définir un
    `Referer` arbitraire, contrairement à un `<video src>` ou un `fetch()`
    classique de page — donc ce contournement est faisable depuis
    Tampermonkey.
  - Point d'attention assumé : ceci contourne une protection anti-hotlink
    mise en place par Odysee. Acceptable pour un usage strictement
    personnel comme ici, mais ce n'est pas une API officiellement
    supportée pour cet usage — peut casser si Odysee change son mécanisme.
- **Décision** : création d'une **v4 expérimentale**, fichier séparé
  (`esprit-donghua-suivi-progression-v4.user.js`), storage isolé des v2.6/v3.
  - Principe : une seule fenêtre popup `about:blank` nommée, créée une fois
    pour toute la session et **jamais navguée** vers une vraie URL — le
    script y reste actif en continu (`@match about:blank`), donc son état
    JS (téléchargement en cours, config) survit d'un épisode à l'autre,
    contrairement à la v3 qui devait tout retransmettre à chaque navigation
    de fenêtre.
  - Comme ce popup reste sur `about:blank` (jamais navigué vers
    odysee.com), pas de problème de Cross-Origin-Opener-Policy : contrairement
    à la v3, `window.opener` (popup → onglet principal) et la référence
    retournée par `window.open('', NOM)` (onglet principal → popup, y
    compris après un rechargement de l'onglet principal) restent valides
    tout du long — communication directe par appel de fonction JS, sans
    canal `GM_setValue`/`postMessage`.
  - À chaque page d'épisode, l'onglet principal extrait l'URI `lbry://` de
    l'iframe Odysee intégrée au site (sans utiliser cette iframe elle-même
    pour la lecture) et demande au popup de jouer cet épisode. Pendant la
    lecture, le popup va lui-même chercher en arrière-plan
    (`GM_xmlhttpRequest`) le HTML de la page de l'épisode suivant sur
    esprit-donghua.xyz pour en extraire son URI `lbry://`, résoudre son
    URL de flux et télécharger le fichier vidéo complet en `Blob`.
  - Dès que l'épisode en cours se termine (événement `ended`, ou "Début
    outro" configuré), le popup remplace simplement le `src` de son
    `<video>` par le `Blob` déjà prêt : même document, même élément vidéo
    → le plein écran et le déblocage du son (obtenus au premier vrai clic
    de l'utilisateur dans le popup, qui devrait rester valable pour toute
    la session grâce à l'activation utilisateur "sticky" de Chrome sur un
    document qui ne recharge jamais) restent actifs sans rien redemander.
  - Limite assumée : chaque épisode est intégralement téléchargé en
    mémoire avant lecture (un `Blob` est un objet fini, pas de vrai
    streaming progressif) — d'où le préchargement en arrière-plan PENDANT
    l'épisode précédent pour masquer ce temps de téléchargement.
  - Fonctionnalité retirée par rapport à la v3 : "Son auto" (le popup
    n'étant plus un iframe cross-origin, le problème de son coupé par
    l'autoplay qui motivait cette fonctionnalité ne se pose plus de la
    même façon).
- **Non testé** : le script v4 complet n'a pas encore été chargé dans
  Tampermonkey ni essayé dans un vrai navigateur. À vérifier en priorité :
  1. Que `window.name === WINDOW_NAME` est bien lu par Tampermonkey dans le
     popup `about:blank` (mécanisme d'activation du contexte "lecteur").
  2. Que le popup peut bien joindre `esprit-donghua.xyz` en arrière-plan
     pour précharger la page suivante (risque de 403 anti-bot déjà observé
     une fois lors d'une vérification automatisée externe — ce script
     s'exécute lui dans la vraie session du navigateur, donc a priori moins
     exposé, mais à confirmer).
  3. Le comportement réel de l'autoplay avec son sur le tout premier
     épisode d'une session (avant le premier clic sur "Plein écran").
  4. Le temps de téléchargement réel d'un épisode par rapport à sa durée
     (le test de faisabilité a été fait sur un épisode de 543s/530 Mo -
     largement le temps sur une connexion correcte, mais à confirmer pour
     des épisodes plus longs/lourds).
- **Prochaine étape à faire ensemble** : charger la v4 dans Tampermonkey,
  tester l'ouverture du lecteur sur un épisode réel, et suivre les logs
  console (préfixés `[EspritDonghua v4]`) pour diagnostiquer si besoin.

- **Premier test réel effectué** (v4.0, popup `about:blank`) :
  1. Bug trouvé et corrigé en direct : `@run-at document-start` faisait
     planter `buildPersistentPanel()` (`document.body` encore `null` au
     moment de `insertBefore`) — l'erreur était invisible car le filtre de
     recherche de la console contenait le mot "esprit" et masquait les
     erreurs génériques du navigateur (qui ne contiennent pas ce mot).
     Leçon retenue : toujours demander explicitement d'effacer le filtre de
     recherche de la console avant de conclure "il n'y a pas d'erreur".
  2. Une fois corrigé (et le script re-collé dans l'éditeur Tampermonkey -
     **éditer le fichier sur le disque ne suffit pas**, il faut re-coller
     manuellement le contenu dans Tampermonkey pour qu'il prenne effet),
     l'extraction de l'URI lbry a fonctionné
     (`lbry://@Akirama:f/Wushen-Zhuzai-Da-Wei-Pian-(Martial-Master)-591:b`),
     le panneau s'est affiché correctement, et un onglet/fenêtre
     `about:blank` s'est bien ouvert(e) avec `window.name` correctement
     positionné à `espritdonghua-player-v4`.
  3. **Échec constaté** : ce popup `about:blank` est resté totalement vide
     (page blanche sans aucun style, `window.name` lisible mais **aucun**
     log `[EspritDonghua v4]`, "No issues" dans sa console) — Tampermonkey
     n'a jamais injecté le script à l'intérieur, malgré `@match about:blank`
     déclaré. Comportement pas fiable selon navigateur/configuration.
  4. **Décision** : abandon complet de l'approche "fenêtre séparée" au
     profit d'un **calque plein écran affiché directement sur la page
     esprit-donghua.xyz** (v4.1, même fichier, toujours storage isolé). Plus
     de `window.open`, plus de `@match about:blank`, plus de dépendance à
     l'injection Tampermonkey dans un contexte séparé. Le "changement
     d'épisode" ne recharge plus jamais la page : dès que l'épisode suivant
     précédemment préchargé est prêt, on remplace juste le `src` du
     `<video>` par le nouveau `Blob` et on met à jour l'URL affichée via
     `history.pushState` (sans navigation réelle) — même document du début
     à la fin de la session de visionnage, donc plein écran et son restent
     garantis actifs sans rien redemander, et plus aucun risque de "fenêtre
     qui ne répond pas".
  5. **Test v4.1 (calque plein écran) confirmé fonctionnel sur le point clé** :
     chargement de l'épisode (résolution API + téléchargement du Blob avec
     barre de progression), affichage du calque, passage en plein écran et
     **son fonctionnel** - validé en conditions réelles par l'utilisateur.
     L'objectif initial de la question de faisabilité (plein écran + son
     continus via un lecteur maison) est donc atteint pour un seul épisode.
  6. **Test "Début outro" à 10s** : a révélé deux échecs de préchargement à
     la suite, sous deux formes différentes (HTTP 429 une fois, puis une
     erreur API "could not find a corresponding entry in the resolve
     response" une autre fois) - très probablement une limitation de débit
     temporaire côté Odysee/CDN après plusieurs gros téléchargements de test
     rapprochés (mes tests curl + les rechargements de script + les essais
     répétés en peu de temps). Point positif : dans les deux cas, le script
     a géré l'échec proprement (message clair affiché, pas de plantage).
  7. **Correctif de robustesse (v4.2)** : ajout de `fetchEpisodeBlob()`, qui
     retente automatiquement (jusqu'à 2 fois, délai croissant 5s/10s)
     `resolveStreamingUrl()` + `downloadVideoBlob()` quand l'erreur ressemble
     à une limitation de débit (regex sur "429", "rate", "too many",
     "corresponding entry"). Utilisé à la fois pour le chargement de
     l'épisode courant et pour le préchargement du suivant.
  8. **Test en conditions réelles (épisode complet, pas de raccourci)** :
     confirmé fonctionnel "à la perfection" par l'utilisateur - le
     préchargement en arrière-plan a eu le temps de se faire tranquillement,
     et l'enchaînement automatique vers l'épisode suivant (déclenché par
     l'événement `ended` réel) a fonctionné sans couper le plein écran ni le
     son. **L'objectif initial de toute cette approche est donc validé.**
  9. **Améliorations demandées et ajoutées (v4.2)** pour plus de contrôle
     manuel sur le préchargement :
     - Bouton "Suivant ▶" dans le calque du lecteur : force le passage
       immédiat à l'épisode suivant (attend la fin du préchargement en
       cours s'il n'est pas encore terminé, ou en démarre un nouveau s'il
       n'y en avait pas).
     - Barre de progression dédiée au préchargement de l'épisode suivant
       (séparée de celle du chargement de l'épisode en cours), avec texte
       de statut ("préparation...", "NN%", "prêt", "échec - clique sur
       Relancer").
     - Bouton "Relancer le préchargement" : relance manuellement le
       préchargement du prochain épisode (utile après un échec, ou pour le
       déclencher plus tôt que d'habitude).
  10. **Test v4.2 (épisodes 593→594→595, enchaînement "Début outro")** :
      - Transition 593→594 réussie (préchargement terminé avant le
        déclenchement, passage sans coupure).
      - Transition 594→595 échouée : les 3 tentatives (initiale + 2 retries
        à 5s/10s) sont toutes tombées sur un 429 - le rate-limiting a
        persisté au-delà des 15s de fenêtre de retry. Attendu vu le rythme
        des tests (plusieurs épisodes complets coup sur coup). Repli
        gracieux confirmé : message clair affiché, pas de plantage, les
        boutons "Suivant"/"Relancer" (ajoutés dans ce même test) permettent
        de reprendre la main manuellement dans ce cas.
      - Bug réel trouvé et corrigé (v4.3) : un clic manuel pendant qu'un
        chargement automatique du MEME episode était encore en cours
        démarrait un second téléchargement concurrent, provoquant un
        `AbortError: The play() request was interrupted by a new load
        request`. Corrigé avec un verrou `loadingClaimUri` qui ignore les
        appels dupliqués tant qu'un chargement pour cet episode est en
        cours.
      - Autre correctif v4.3 : `startPrefetchForNext()` remet maintenant
        `prefetch` a `null` apres un echec definitif (au lieu de laisser
        trainer l'entree ratee), pour que le bouton "Suivant"/le
        declenchement automatique redemarrent proprement un nouveau
        prechargement plutot que de re-echouer sur la meme promesse deja
        rejetee.
  11. **Non testé** : la v4.3 (ces deux correctifs) n'a pas encore été
      essayée dans le navigateur.
  12. **Blocage persistant constaté (toujours sur la v4.2)** : après les
      tests ci-dessus, TOUTES les tentatives suivantes (chargement,
      retries automatiques, clics manuels sur "Relancer") sur plusieurs
      episodes de suite echouent systematiquement en 429 - ne ressemble
      plus a un pic temporaire mais a un blocage plus long du CDN
      (player.odycdn.com) suite au volume de gros telechargements
      enchaines pendant la session de test (plusieurs centaines de Mo a
      quelques Go coup sur coup). Pas un bug du script : le mecanisme
      (resolution + telechargement + lecture + son + plein ecran +
      enchainement) a deja ete valide sur les premiers episodes testes.
      **Decision : pause des tests** (30-60 min minimum, potentiellement
      plus) avant de reprendre, pour laisser le blocage se lever plutot
      que d'enchainer des tentatives qui le prolongeraient. A garder en
      tete pour un usage normal (un episode a la fois, au rythme naturel
      du visionnage) : le risque de declencher ce blocage devrait etre
      bien plus faible qu'en conditions de test intensif.
  13. **Cause supplementaire identifiee par l'utilisateur** : le calque du
      lecteur recouvre visuellement l'iframe Odysee native du site, mais ne
      la desactivait jamais - elle restait presente dans le DOM et pouvait
      continuer a charger/streamer en parallele de nos propres
      telechargements (double consommation du CDN Odysee depuis la meme
      IP), ce qui a plausiblement contribue/accelere le blocage constate au
      point precedent.
  14. **Correctif (v4.4)** : ajout de `disableLiveOdyseeIframe()`, appelee
      au debut de `startEpisode()`, qui met le `src` de l'iframe Odysee
      native a `about:blank` des que notre lecteur prend la main sur un
      episode. Effet de bord a gerer : une fois l'iframe neutralisee, son
      `src` ne reflete plus l'episode reel, donc re-extraire l'info depuis
      elle (ex: en re-cliquant sur "Ouvrir le lecteur") aurait echoue -
      corrige en ajoutant `getEpisodeInfoForCurrentPage()`, qui reutilise
      `currentEpisode` (deja extrait) tant qu'il correspond toujours a la
      page affichee, au lieu de re-lire l'iframe a chaque clic.
  15. **Non testé** : la v4.4 (neutralisation de l'iframe native) n'a pas
      encore ete essayee. A tester apres la pause de 30-60 min recommandee
      au point 12, pour voir si ca reduit vraiment la frequence des 429.
  16. **Blocage toujours present malgre la v4.4** (iframe native neutralisee)
      - le probleme n'etait donc pas seulement l'iframe en double.
  17. **Idee de l'utilisateur, retenue** : le prechargement de l'episode
      suivant demarrait immediatement apres la fin du telechargement de
      l'episode courant (quasi dos-a-dos) au lieu d'etre espace dans le
      temps comme le serait un vrai visionnage. **Correctif (v4.5)** :
      le prechargement ne demarre plus automatiquement des la fin du
      chargement de l'episode courant - il attend desormais la **moitie de
      la duree de l'episode en cours** (ecoute sur l'evenement `timeupdate`
      de la video, comparaison a `video.duration / 2`), pour espacer les
      deux gros telechargements. Nouveau flag `prefetchTriggeredForEpisode`
      (reinitialise a chaque nouvel episode, reel ou enchaine
      automatiquement) pour ne declencher ce prechargement retarde qu'une
      seule fois par episode. Les boutons "Suivant" et "Relancer le
      prechargement" restent immediats (override manuel volontaire de
      l'utilisateur, differencie d'un declenchement automatique en rafale).
  18. **Non testé** : la v4.5 (prechargement retarde a la moitie de
      l'episode) n'a pas encore ete essayee.
  19. **Demande d'amelioration UI (v4.6)** :
      - Boutons et statuts reorganises en une seule colonne compacte
        (position:fixed en haut a gauche du calque, un element par ligne)
        au lieu d'etre etales sur toute la largeur en deux rangees.
      - Barres de progression visuelles supprimees, remplacees par du texte
        avec pourcentage directement dans le statut ("Chargement... 42%",
        "Suivant : 42%").
      - Nouveau bouton "◀ Precedent" : recharge l'episode precedent (fetch
        a la demande de sa page, pas de prechargement en arriere-plan pour
        celui-la) via `goToPreviousEpisode()`, en utilisant le meme
        mecanisme d'extraction que pour la page suivante mais avec
        `extractPrevEpisodeUrlFromDoc()` (nouveau, cherche `a[rel="prev"]`
        ou le premier `.nvs` du bloc de nav).
      - Raison d'etre du bouton "Precedent" : certains animes ont une duree
        variable d'un episode a l'autre, donc un "Debut outro" regle pour
        la duree habituelle de la serie peut couper la fin d'un episode
        plus long avant son contenu reel. Le bouton "Precedent" permet de
        revenir en arriere pour revoir les secondes manquantes.
      - Nouveau flag `outroSkipSuspended` : suspend uniquement le
        declenchement ANTICIPE par "Debut outro" (le vrai `ended` de fin de
        video reste actif) des qu'on clique sur "Precedent", et se
        reactive automatiquement en cliquant sur "Suivant" - comme demande
        par l'utilisateur.
  20. **Non testé** : la v4.6 (colonne compacte, texte au lieu de barres,
      bouton Precedent + suspension/reactivation de l'outro) n'a pas encore
      ete essayee.
  21. **Nouvelle limitation de debit persistante constatee** (toujours sans
      avoir teste la v4.6) - le probleme revient sans cesse pendant cette
      session de tests intensifs.
  22. **Proposition de l'utilisateur, retenue en deux temps** :
      - D'abord : abandonner le prechargement a l'avance, et charger
        l'episode suivant seulement au moment du vrai changement (comme la
        v2.6, quasi instantanee car streaming progressif via l'iframe -
        mais on accepte ici un petit delai de chargement, inevitable avec
        notre approche "telecharger le fichier complet avant lecture").
      - Puis, en cours de route : plutot que zero prechargement, en garder
        un mais le **declencher au debut de l'outro** (`currentConfig.
        outroStart`) au lieu de la moitie de la duree de l'episode -
        beaucoup moins de chevauchement entre les deux gros
        telechargements (l'outro dure typiquement quelques dizaines de
        secondes, pas la moitie de l'episode), tout en gardant une chance
        raisonnable d'enchainement fluide.
  23. **Correctif (v4.7)** : `triggerNextEpisode()` demarre desormais
      lui-meme le prechargement (`startPrefetchForNext`) s'il n'existe pas
      encore, avant d'afficher le compte a rebours - au lieu d'exiger qu'un
      prechargement ait deja ete lance a l'avance. Le declenchement
      "moitie de la duree" (`prefetchTriggeredForEpisode`) a ete retire :
      le seul declenchement automatique a l'avance est desormais celui du
      "Debut outro" configure (dans le listener `timeupdate` existant).
      Sans "Debut outro" configure pour la serie, aucun prechargement
      n'est tente a l'avance : le telechargement ne commence qu'a la fin
      reelle de la video (evenement `ended`), avec le petit delai que
      cela implique - comportement volontairement accepte par
      l'utilisateur plutot que de re-tenter un declenchement plus tot et
      risquer a nouveau la limitation de debit.
  24. **Non testé** : la v4.7 (prechargement declenche au debut de l'outro
      au lieu de la moitie de la duree, repli "petit delai" sans outro
      configure) n'a pas encore ete essayee.
  25. **Demande de l'utilisateur : "retire completement le prechargement,
      ca pose trop de probleme"** — apres plusieurs tentatives pour
      l'espacer dans le temps (moitie de l'episode en v4.5, puis debut de
      l'outro en v4.7) sans regler durablement les 429, decision de
      l'abandonner completement plutot que de continuer a l'ajuster.
      **Correctif (v4.8)** :
      - Suppression totale du mecanisme de prechargement en arriere-plan :
        variable `prefetch`, fonction `startPrefetchForNext()`, bouton
        "Relancer le prechargement" et son statut dedie ("Suivant : ...").
      - `advanceToNextEpisode()` reecrite pour charger l'episode suivant
        **a la demande**, seulement au moment reel du changement (fin de
        video, "Debut outro" configure suivi du compte a rebours de 3s, ou
        clic sur "Suivant") : va chercher la page suivante, en extrait le
        claim, telecharge le Blob (avec pourcentage affiche dans le statut
        principal), puis bascule la lecture dessus. Delai de chargement
        desormais visible a chaque changement d'episode, assume comme
        contrepartie a l'absence totale de prechargement.
      - Le reste (compte a rebours annulable, declenchement anticipe par
        "Debut outro", boutons "Suivant"/"Precedent", suspension via
        `outroSkipSuspended`) est conserve tel quel.
  26. **Test v4.8 effectué** : le chargement de l'episode initial a
      d'abord echoue en 429 (3 tentatives), puis a fini par reussir en
      relancant apres avoir attendu un peu plus - confirme qu'il s'agissait
      bien du blocage temporaire du CDN deja documente, pas d'un bug du
      script.
  27. **Test de la lecture continue (v4.8)** : le declenchement au "Debut
      outro" fonctionne (toast affiche), mais le telechargement de
      l'episode suivant a lui aussi echoue en 429 (meme blocage residuel,
      trop tot apres l'episode precedent). L'utilisateur a alors rouvert
      manuellement le lecteur ("Ouvrir le lecteur"), ce qui a fait
      redemarrer une deuxieme tentative automatique de passage a l'episode
      suivant (nouvel echec 429) au lieu de simplement reafficher l'episode
      en cours.
  28. **Bug reel trouve et corrige (v4.9)** : dans `startEpisode()`, la
      branche "episode deja charge, reaffichage" remettait
      inconditionnellement `outroSignalSent` a `false`. Si l'utilisateur
      rouvrait le lecteur alors que la position de lecture avait deja
      depasse le "Debut outro" configure, le tout prochain `timeupdate`
      redeclenchait immediatement un nouveau passage automatique a
      l'episode suivant - explique le deuxieme echec 429 observe juste
      apres le "clic manuel" au point precedent. Corrige en ne remettant
      `outroSignalSent` a `false` que si la position de lecture n'a pas
      encore atteint le "Debut outro" (sinon il reste a `true`, comme si le
      declenchement avait deja eu lieu).
  29. **Non testé** : le correctif v4.9 n'a pas encore ete essaye.
  30. **Script v4 devenu invisible dans Tampermonkey** apres une session de
      tests intensifs (0 log `[EspritDonghua v4]`, absent du menu
      Tampermonkey de la page alors que v2.6/v3 y apparaissaient). Cause
      non determinee avec certitude (contenu du fichier local sur disque
      verifie correct - en-tete/syntaxe intacts). **Resolu en supprimant
      puis recreant le script v4 dans Tampermonkey** (recollage complet du
      contenu). Effet de bord attendu et confirme par la suite : supprimer/
      recreer un script reinitialise son storage `GM_setValue`/`GM_getValue`
      (namespace/@id different pour Tampermonkey) - toute la progression
      suivie par la v4 a ete perdue.
  31. **Recherche de sauvegardes existantes sur le disque** : plusieurs
      fichiers exportes retrouves dans `Downloads` (`ma-progression-donghua*
      .html`), avec exactement le probleme de doublons attendu (suffixes
      "(1)", "(2)"... ajoutes par Chrome car l'auto-export quotidien change
      de nom chaque jour et l'export manuel reutilise toujours le meme nom
      sans jamais ecraser). Le plus complet, `ma-progression-donghua-2026-
      09-16.html` (8 series suivies, horodatage le plus recent avant la
      creation de la v4 le meme jour), correspond a la sauvegarde de la v2.6/
      v3 - identifie comme LA sauvegarde a reimporter pour recuperer le
      suivi perdu au point 30.
  32. **Demandes de l'utilisateur, retenues** :
      - Ajouter un bouton pour importer une sauvegarde exportee (pour
        recuperer une progression perdue, comme au point 30).
      - Faire en sorte que la sauvegarde s'ecrive dans le meme dossier que
        le script, en un seul fichier qui se met a jour (au lieu d'un
        nouveau fichier telecharge a chaque fois, cause des doublons
        observes au point 31).
  - **Contrainte technique identifiee** : un script Tampermonkey ne peut
        pas ecrire directement dans un dossier arbitraire du disque avec un
        telechargement classique (`<a download>`) - seul le dossier de
        telechargement par defaut du navigateur est accessible ainsi, sans
        controle du nom en cas de conflit. Seule la **File System Access
        API** (`window.showSaveFilePicker`, Chrome/Edge - pas Firefox)
        permet de designer un fichier precis une fois et d'ecrire dedans
        (vraie mise a jour) a chaque sauvegarde suivante.
  33. **Implementation (v4.10)** :
      - Nouveau bouton **"Choisir fichier sauvegarde"** dans le panneau :
        ouvre le selecteur natif du navigateur (`showSaveFilePicker`),
        permet de designer un fichier precis (ex. dans le dossier du
        script). Le handle du fichier est conserve dans IndexedDB (survit
        aux rechargements de page et redemarrages du navigateur, tant que
        la permission reste accordee) pour ne pas avoir a le reselectionner
        a chaque session.
      - `exportProgress()` et `maybeAutoExport()` ecrivent desormais
        directement dans ce fichier lie s'il est configure et que la
        permission est valide (`createWritable()` + ecrasement complet) -
        sinon repli automatique sur l'ancien telechargement classique (nom
        fixe, sans date).
      - Nouveau bouton **"Importer"** : ouvre un selecteur de fichier
        classique, lit le HTML exporte choisi et fusionne les entrees dans
        la progression actuelle. Une entree importee plus ancienne que
        l'entree deja enregistree pour la meme serie est ignoree (ne fait
        jamais regresser un suivi a jour).
      - Format d'export enrichi : un bloc `<script type="application/
        json" id="ed-progress-backup">` cache est desormais ajoute a
        chaque export, contenant les donnees brutes completes
        (`seriesUrl`/`episodeNumber` inclus) pour une reimportation
        parfaitement fidele des futurs exports. Les anciens exports (v2.6,
        ou v4 < 4.10, sans ce bloc) restent importables via un repli qui
        relit la liste HTML lisible - dans ce cas `seriesUrl` est inconnu
        et une cle de secours `legacy:<nom de la serie>` est utilisee.
      - Nouvelle commande de menu Tampermonkey "Choisir le fichier de
        sauvegarde" (en plus du bouton dans le panneau).
  34. **Non testé** : la v4.10 (fichier de sauvegarde lie, import,
      bloc JSON embarque) n'a pas encore ete essayee. A tester en priorite :
      1. Que `showSaveFilePicker` fonctionne bien dans le contexte
         sandboxe de Tampermonkey (script avec des `@grant` specifiques,
         pas `@grant none`).
      2. Que le handle survit bien a un rechargement de page (relecture
         IndexedDB) sans redemander la permission a chaque fois.
      3. Import du fichier `ma-progression-donghua-2026-09-16.html`
         identifie au point 31, pour recuperer les 8 series perdues au
         point 30.
  35. **Test v4.10 : echec au clic sur "Choisir fichier sauvegarde"** -
      `Failed to execute 'showSaveFilePicker' on 'Window': Illegal
      invocation`. **Cause identifiee** : Tampermonkey execute ce script
      (des qu'un `@grant` specifique est declare, ce qui est le cas ici)
      dans un environnement "sandbox" ou `window` est un proxy et non le
      vrai objet `window` de la page - certaines methodes natives
      "brandees" (dont `showSaveFilePicker`, et `indexedDB.open` aurait
      pose le meme probleme juste apres) exigent d'etre appelees avec le
      vrai objet en `this` et rejettent l'appel via ce proxy.
  36. **Correctif (v4.11)** : utilisation de `unsafeWindow` (accessible
      sans `@grant` supplementaire sous Tampermonkey, donne acces au vrai
      objet `window` de la page) a la place de `window` pour
      `showSaveFilePicker` et `indexedDB.open`. Le reste du fichier de
      sauvegarde lie (permissions, ecriture) opere sur l'objet handle
      retourne directement, non affecte par ce probleme.
  37. **Non testé** : le correctif v4.11 n'a pas encore ete essaye.
  38. **Question de l'utilisateur** : pourquoi le lecteur maison a un delai
      de chargement a chaque changement d'episode, alors qu'il n'y en a
      aucun en navigant "a la volee" (lecteur natif Odysee) ?
  39. **Investigation reseau reelle effectuee** (curl, hors navigateur) :
      telechargement des 2 premiers Mo d'un fichier video reel + analyse de
      la structure ISO-BMFF (boites MP4). Resultat : fichier MP4 "a plat"
      (moov en tete avec stbl/stco/stsz classiques, PAS de mvex/moof) -
      confirme que ce n'est PAS un MP4 fragmente. Consequence : l'API
      MediaSource (qui permettrait d'alimenter le `<video>` morceau par
      morceau en JS pour un vrai streaming) ne peut pas fonctionner sur ce
      format - elle exige des segments fragmentes. Le lecteur natif Odysee
      n'a pas ce probleme car il streame nativement (`<video src>` direct
      + Range HTTP automatiques par le navigateur), sans passer par du JS -
      mais ca ne marche que parce qu'il n'a pas besoin de falsifier le
      Referer (requete emise directement depuis odysee.com).
  40. **Conclusion et decision** : la seule vraie solution pour eliminer le
      delai est de reecrire le header Referer au niveau reseau (hors de
      portee de tout script de page, y compris Tampermonkey), via une
      **extension de navigateur separee** utilisant `declarativeNetRequest`
      (Manifest V3) pour cibler `player.odycdn.com`. L'utilisateur a
      valide cette direction.
  41. **Implementation (v4.12)** :
      - Nouvelle extension `odysee-referer-extension/` (dossier separe du
        script) : `manifest.json` (MV3, permission `declarativeNetRequest`,
        `host_permissions` sur `player.odycdn.com`) + `rules.json` (regle
        statique `modifyHeaders` qui force `Referer: https://odysee.com/`
        sur toute requete vers ce domaine, types `media`/`xmlhttprequest`/
        `other`). A charger "en mode developpeur" dans `chrome://extensions`
        ("Charger l'extension non empaquetee").
      - Script v4 : nouvelles fonctions `tryDirectStream()` (pose
        directement `video.src` sur l'URL CDN resolue et attend
        `loadeddata` ou `error`/timeout 10s) et `loadEpisodeMedia()`
        (tente le streaming direct en premier, ne retombe sur
        `fetchEpisodeBlob` - Blob complet, methode existante - qu'en cas
        d'echec, ex. extension absente/inactive). `startEpisode()` et
        `advanceToNextEpisode()` utilisent desormais `loadEpisodeMedia()` a
        la place de `fetchEpisodeBlob()` directement ; `swapVideoSrc()`
        accepte maintenant un `blob` optionnel (absent = le `<video>` est
        deja pret en streaming direct, rien a remplacer). Statut affiche
        "Lecture (streaming direct)" quand ca fonctionne, pour distinguer
        des deux methodes en test.
      - Repli automatique et silencieux vers le Blob complet si l'extension
        n'est pas installee/active, sans aucune configuration a faire dans
        le script lui-meme.
  42. **Non testé** : ni l'extension ni le repli v4.12 n'ont encore ete
      essayes. A tester : 1) charger l'extension non empaquetee, verifier
      qu'elle apparait activee dans `chrome://extensions` : 2) recharger le
      script v4 (4.12) dans Tampermonkey ; 3) ouvrir un episode et verifier
      dans le statut si "Lecture (streaming direct)" apparait (signe que
      l'extension fonctionne et que le delai de chargement a disparu) ; 4)
      verifier qu'un changement d'episode complet (fin de video / bouton
      Suivant) reste fonctionnel dans ce mode.
  43. **Test v4.12 effectue** : extension chargee, script actif. Le
      streaming direct semble avoir fonctionne pour le premier episode
      (aucun message d'echec/repli dans les logs), mais la transition vers
      l'episode suivant a de nouveau echoue en 429 - a la fois la tentative
      de streaming direct ET son repli en Blob, ce qui confirme que ce 429
      est un blocage CDN par IP independant de la methode utilisee (deja vu
      plusieurs fois, necessite juste d'attendre).
  44. **Question de l'utilisateur** : plutot que de continuer a se battre
      avec les telechargements/contournements, est-il possible de
      carrement **prendre le controle du lecteur Odysee par defaut** (celui
      du site) et de l'afficher en plein ecran avec le son, au lieu de
      notre lecteur maison ?
  45. **Reponse et decision** : oui, et c'est une meilleure architecture -
      confirme en relisant le code de la v2.6, qui le faisait deja
      partiellement. Tampermonkey peut injecter une DEUXIEME instance du
      meme script directement dans l'iframe Odysee elle-meme (`@match
      https://odysee.com/*`), ou elle a un acces direct (same-origin,
      cross-origin uniquement depuis la page principale) a la vraie balise
      `<video>` du lecteur natif - plus besoin d'aucun contournement du
      Referer, plus de Blob, plus de 429, plus besoin de l'extension
      navigateur. Seul vrai compromis (deja connu de la v2.6/v3) : le son
      ne peut toujours pas etre force par script sur une origine
      cross-origin sans un vrai geste utilisateur - necessite un premier
      clic reel DANS le lecteur. L'utilisateur a valide cette direction.
  46. **Reecriture complete (v4.13)** : abandon total du telechargement/
      contournement Referer au profit du vrai lecteur Odysee, en combinant
      le meilleur des deux mondes :
      - Principe v4 conserve : calque plein ecran (`position:fixed`), cree
        une seule fois, jamais detruit, jamais de vraie navigation de page
        - c'est ce qui permet au plein ecran de survivre aux changements
        d'episode.
      - Principe v2.6 repris et adapte : DANS ce calque, une vraie iframe
        Odysee (memes URLs d'embed que le site) remplace le `<video>`
        maison. Le "changement d'episode" ne recharge plus jamais la page
        ni ne recree l'iframe : on change juste son `src` vers l'embed du
        nouvel episode - la navigation reste interne a l'iframe, le calque
        parent (le vrai element en plein ecran) n'est jamais affecte, donc
        le plein ecran survit sans rien redemander.
      - Deuxieme instance du script injectee par Tampermonkey directement
        DANS cette iframe (`runInsidePlayerFrame()`, nouveau `@match
        https://odysee.com/*`) : clic automatique sur le bouton "lecture"
        (necessaire pour que le lecteur insere sa balise `<video>`), saut
        d'intro, detection du debut d'outro ET de la fin reelle (`ended`,
        amelioration par rapport a la v2.6 qui n'avait qu'un minuteur de
        secours approximatif), tentative de reactivation du son sur tout
        vrai clic utilisateur dans le lecteur. Communique avec la page
        principale par `postMessage` (signaux `espritdonghua-ready`,
        `-outro-reached`, `-ended`, `-mute-state` ; commandes recues
        `espritdonghua-config`, `-pause`), filtre par `event.source` pour
        ignorer l'iframe Odysee native du site (qui recoit elle aussi ce
        script injecte tant qu'elle n'est pas neutralisee).
      - Pas besoin de porter le systeme de toast de compte a rebours de la
        v2.6 (affiche DANS l'iframe pour rester visible en plein ecran) :
        le toast existant de la v4 (affiche dans le calque PARENT, qui est
        le vrai element plein ecran) reste deja visible par-dessus l'iframe
        sans rien changer.
      - Tout le reste (suivi de progression, panneau persistant, export/
        import de sauvegarde, fichier de sauvegarde lie) est conserve tel
        quel, aucun changement.
      - L'extension `odysee-referer-extension/` (v4.12) n'est plus
        necessaire au fonctionnement du lecteur mais reste dans le depot.
  47. **Non testé** : la v4.13 (iframe Odysee natif controle via script
      injecte) n'a pas encore ete essayee. A tester en priorite : 1) que le
      clic automatique sur "lecture" fonctionne bien dans l'iframe injectee
      dans notre calque ; 2) que le plein ecran survit bien a un changement
      de "src" de l'iframe (transition automatique ou bouton Suivant) ; 3)
      si le son, une fois debloque par un premier vrai clic, "tient" bien
      pour les episodes enchaines automatiquement ensuite (meme iframe
      reutilisee, jamais recreee - bon espoir que oui, mais politique
      d'autoplay de Chrome pas garantie a 100% sur ce point precis) ; 4)
      que le detecteur de fin reelle (`ended`) et de debut d'outro
      fonctionnent comme avant.
  48. **Test v4.13 confirme par l'utilisateur : succes.** Transition
      automatique vers l'episode 2 fonctionnelle, outro detecte, moins de
      2 secondes entre les deux episodes (juste un bref ecran noir). Valide
      l'architecture "iframe Odysee natif dans le calque plein ecran".
  49. **Demandes d'amelioration suite a ce test reussi (v4.14)** :
      - Afficher un % de chargement pendant le bref ecran noir de
        transition, plutot qu'un texte statique. **Ajoute** : le script
        injecte dans l'iframe Odysee ecoute desormais l'evenement
        `progress` de la vraie balise `<video>` et calcule un pourcentage
        base sur `video.buffered` / `video.duration` (des que la duree est
        connue), transmis a la page principale par `postMessage`
        (`espritdonghua-load-status`, stages `video-trouvee` / `buffering`
        + `pct` / `pret`). Nuance assumee : ce n'est plus un % de
        "telechargement total du fichier" comme dans les versions Blob -
        c'est un % d'avance du buffer par rapport a la lecture, coherent
        avec un vrai streaming progressif (pas besoin d'atteindre 100%
        pour lire).
      - Bouton pour recharger completement la page en cas de blocage.
        **Ajoute** : nouveau bouton "↻ Recharger la page" dans le calque
        du lecteur (`location.reload()`).
      - Question de l'utilisateur : la qualite video baisse parfois
        automatiquement en cours de visionnage - un bouton pour choisir la
        qualite manuellement (ou la verrouiller en 1080p) serait-il
        possible ? **Reponse** : c'est le lecteur Odysee natif qui gere ca
        lui-meme (adaptive bitrate selon la bande passante mesuree, via son
        propre player React/JS interne) - pas quelque chose qu'on
        controle depuis notre script. Verifie que la page d'embed est une
        SPA React (contenu du lecteur genere cote client, illisible via un
        simple curl) : impossible de confirmer par une requete brute si un
        selecteur de qualite existe dans l'UI du lecteur natif en mode
        embed. **A verifier par l'utilisateur** : ouvrir les DevTools et
        chercher une icone "parametres"/roue dentee dans les controles du
        lecteur (au survol de la video) - si elle existe, il sera possible
        d'ajouter un clic automatique dessus (meme principe que le clic
        auto sur "lecture") pour forcer 1080p a chaque episode ; sinon ce
        ne sera pas faisable sans reverse-engineering fragile du lecteur
        Odysee.
  50. **Non testé** : le correctif v4.14 (% de buffer, bouton recharger)
      n'a pas encore ete essaye.
  51. **Confirmation utilisateur** : la roue "Reglages" est bien presente
      dans le lecteur en mode embed, et le verrouillage automatique en
      1080p est demande. Selecteurs identifies par l'utilisateur via
      inspection reelle du DOM (menu React) :
      - Bouton reglages : `button.media-button--settings[aria-label="Réglages"]`
      - Entree "Qualite" dans le menu : `.media-settings-menu__item`
        contenant un `.media-settings-menu__label` de texte "Qualité"
      - Options de resolution dans le sous-menu : boutons
        `.media-settings-menu__option` dont le texte est directement la
        resolution (ex. "1080p", "720p").
  52. **Implementation (v4.15)** : `tryLockQuality1080p()` dans le script
      injecte (`runInsidePlayerFrame`) - clique automatiquement Reglages ->
      Qualite -> "1080p" a chaque nouvel episode (des que la video est
      trouvee), avec un court delai entre chaque clic pour laisser le menu
      React se rendre, et un retry (jusqu'a 10 x 500ms) si le bouton
      reglages n'existe pas encore. Repli silencieux (log seulement, rien
      ne casse) si un des elements attendus est introuvable - notamment si
      1080p n'est pas disponible pour un episode donne (qualite source plus
      basse).
  53. **Revue de finalisation demandee par l'utilisateur** apres 5 episodes
      enchaines sans probleme. Point important souleve : v2.6 possede aussi
      `@match https://odysee.com/*` et utilise EXACTEMENT les memes noms de
      message (`espritdonghua-ready`, `-config`, `-outro-reached`, etc.)
      que v4 - si jamais v2.6/v3 sont reactives dans Tampermonkey en meme
      temps que v4, les deux s'injecteraient dans la meme iframe Odysee et
      se marcheraient dessus (clics et messages en double, comportement
      imprevisible). Recommandation faite a l'utilisateur : verifier que
      v2.6/v3 restent desactives ; proposition de renommer les types de
      message de v4 avec un prefixe distinct pour rendre la collision
      impossible meme par erreur - reponse de l'utilisateur pas encore
      recue au moment de cette entree.
  54. **Non testé** : le verrouillage 1080p (v4.15) n'a pas encore ete
      essaye.
  55. **Bug d'ergonomie trouve en repondant a une question de
      l'utilisateur** ("ajouter les boutons intro/outro dans le menu de
      droite ?") : les boutons "Fin intro"/"Debut outro" n'existaient que
      dans le panneau du haut (`ep-panel`), entierement recouvert par le
      calque plein ecran (`z-index` bien plus eleve, `position:fixed;
      inset:0`) des qu'un episode demarre - ils etaient donc inaccessibles
      pendant le visionnage sans d'abord cliquer "Fermer" (donc sortir du
      lecteur). **Corrige (v4.16)** : les deux boutons sont desormais
      AUSSI presents directement dans le calque du lecteur (topbar),
      branches sur les memes fonctions `promptIntroEnd`/`promptOutroStart`
      que le panneau du haut (garde egalement, utile quand le calque est
      ferme). Limite connue et non nouvelle : `prompt()` etant une boite de
      dialogue navigateur bloquante, l'ouvrir alors qu'on est en plein
      ecran force generalement une sortie automatique du plein ecran (deja
      vrai avant ce changement, comportement du navigateur, pas du script).
  56. **Non testé** : l'ajout des boutons intro/outro dans le calque
      (v4.16) n'a pas encore ete essaye.
  57. **Revue de finalisation demandee par l'utilisateur** ("vois-tu autre
      chose que j'aurais pu oublier ?"). Relecture complete du fichier,
      deux bugs reels trouves et corriges (v4.17), plus le point de
      collision de messages laisse en suspens tranche par prudence :
      1. **Bug : la lecture ne reprenait pas apres "Fermer" puis
         reouverture du meme episode.** "Fermer" envoie un postMessage
         "pause" a l'iframe ; mais la branche "episode deja charge,
         reaffichage" de `startEpisode()` ne renvoyait jamais d'ordre de
         reprise - reouvrir laissait donc la video figee en pause.
         **Corrige** : nouveau message `espritdonghua-v4-play` (gere cote
         iframe par un simple `video.play()`), envoye par cette branche.
      2. **Bug : fermer le calque pendant le compte a rebours "Episode
         suivant dans 3s..." ne l'annulait pas** - le passage a l'episode
         suivant se declenchait quand meme en arriere-plan, calque ferme,
         sans que l'utilisateur le voie ni le veuille. **Corrige** : le
         bouton "Fermer" appelle desormais `cancelCountdown()` comme le
         font deja "Suivant"/"Precedent".
      3. **Collision de messages avec v2.6/v3 (cf. point 53), tranchee
         par prudence sans attendre la reponse de l'utilisateur** : tous
         les types de message postMessage de v4 ont ete renommes avec un
         prefixe distinct (`espritdonghua-v4-...` au lieu de
         `espritdonghua-...`) - `ready`, `load-status`, `mute-state`,
         `outro-reached`, `ended`, `config`, `pause`, et le nouveau `play`.
         Rend la collision impossible meme si v2.6/v3 sont un jour
         reactives par erreur en meme temps que v4. (La cle sessionStorage
         `espritdonghua-reload-...`, elle, n'a pas ete renommee : simple
         garde-fou anti-boucle locale a la page, aucun risque reel de
         collision cross-script.)
  58. **Non testé** : les corrections v4.17 (reprise apres Fermer,
      annulation du compte a rebours a la fermeture, prefixe de message)
      n'ont pas encore ete essayees.
  59. **Demande utilisateur** : pouvoir saisir "0712" pour "Fin intro"/
      "Debut outro" et que ce soit compris comme 7 min 12s (au lieu de
      devoir taper "7:12"). **En parallele, bug signale** : l'outro ne
      declenche plus aucun changement d'episode - log fourni montrant que
      le signal `debut generique de fin atteint, signal envoye` part bien
      cote iframe, mais rien ne se passe cote page principale ensuite
      (aucun log, aucune erreur).
  60. **Analyse du bug** : deux endroits du code retournaient
      silencieusement sans logguer en cas de signal ignore -
      `triggerNextEpisode()` si "Lecture continue" est decochee, et le
      handler de message si `outroSkipSuspended`/`outroSignalSent` etaient
      deja vrais - impossible de diagnostiquer laquelle de ces causes sans
      logs dedies. **Correctif (v4.18)** : ajout d'un `console.log` dans
      chacun de ces deux cas, precisant l'etat exact des flags impliques.
      Hypothese principale communiquee a l'utilisateur (a verifier) : la
      case "Lecture continue" du panneau etait probablement decochee.
  61. **Implementation du format de saisie rapide (v4.18)** : `parseTimecode()`
      accepte desormais, en plus du format `mm:ss` existant, une saisie de
      chiffres purs sans ":" interpretee comme "les 2 derniers chiffres
      sont les secondes, le reste (s'il y en a) les minutes" - donc "0712"
      -> 7 min 12s (432s), "45" -> 45s, "130" -> 1 min 30s (90s). Testé
      unitairement (node) sur plusieurs cas, comportement confirme correct.
      Texte des invites `prompt()` mis a jour en consequence dans
      `promptIntroEnd`/`promptOutroStart`. Aucun impact sur les valeurs
      deja enregistrees (stockees en secondes, le champ pre-rempli via
      `formatTimecode()` reste au format "m:ss" avec ":", donc reconnu par
      l'ancienne branche - seule la saisie d'une NOUVELLE valeur change de
      comportement).
  62. **Non testé** : le format de saisie rapide et les nouveaux logs de
      diagnostic (v4.18) n'ont pas encore ete essayes en conditions
      reelles ; la cause exacte du bug outro reste a confirmer par
      l'utilisateur via ces nouveaux logs (ou en verifiant directement la
      case "Lecture continue").
  63. **Confirmation utilisateur** : le bug outro etait bien du a la case
      "Lecture continue" decochee par erreur - pas un bug du script.
  64. **Demande utilisateur** : pouvoir changer d'anime sans quitter le
      lecteur - meme constat que pour "Fin intro"/"Debut outro" (point 55) :
      le selecteur d'anime et les cases a cocher vivent dans le panneau du
      haut, invisible pendant la lecture. **Implementation (v4.19)** :
      ajout dans la colonne du lecteur d'un select "Changer de serie" et
      des cases "Lecture continue"/"Lecteur auto"/"Suivre cet anime",
      dupliquant les commandes du panneau du haut. Contrainte technique
      geree : `buildOverlay()` ne construit la colonne qu'UNE seule fois
      (jamais recreee), donc son contenu (liste des series suivies, etat
      des cases) doit etre tenu a jour separement - nouvelle fonction
      `syncOverlayControls()` appelee a chaque execution de
      `buildPersistentPanel()` (deja le point central de rafraichissement
      existant) pour reconstruire les options du select et resynchroniser
      les cases. Choix de perimetre : Export/Import/Choisir fichier
      sauvegarde restent uniquement dans le panneau du haut (moins
      utiles en cours de lecture) - a ajouter aussi si demande.
  65. **Non testé** : les commandes dupliquees dans la colonne du lecteur
      (v4.19) n'ont pas encore ete essayees.
  66. **Question de l'utilisateur** : la colonne devenant volumineuse,
      serait-il pertinent d'ajouter un moyen de l'afficher/la masquer ?
      **Reponse donnee** : oui, recommandation d'un bouton fixe (pas
      d'auto-masquage a l'inactivite, plus complexe et plus de cas
      limites pour peu de benefice ici) - validee par l'utilisateur, qui
      demande en meme temps d'ajouter aussi Export/Import/Choisir fichier
      sauvegarde dans la colonne (tout accessible en plein ecran), puis
      reconfirme explicitement pendant l'implementation : "bouton fixe, pas
      d'auto-masquage".
  67. **Implementation (v4.20)** :
      - Nouveau bouton toujours visible (`☰`/`✕`, coin superieur gauche,
        hors de la colonne elle-meme donc jamais masque par elle) qui
        bascule l'affichage (`display:flex`/`none`) de toute la colonne de
        commandes.
      - Colonne desormais complete : Export, Importer (+ input file cache),
        Choisir fichier sauvegarde et son statut, en plus de tout ce qui y
        etait deja (plein ecran/fermer/precedent/suivant/recharger/intro/
        outro/select serie/3 cases a cocher/statut/indicateur son).
      - `updateBackupStatusUi()` met desormais a jour le statut de
        sauvegarde a la fois dans le panneau du haut ET dans la colonne du
        lecteur.
      - Garde-fou ajoute sur la colonne : `max-height:calc(100vh - 70px);
        overflow-y:auto` pour eviter un debordement hors ecran sur les
        petits viewports maintenant qu'elle contient beaucoup d'elements.
  68. **Non testé** : le bouton d'affichage/masquage et les commandes
      d'export/import/sauvegarde dans la colonne (v4.20) n'ont pas encore
      ete essayes.
  69. **Demande utilisateur** : recuperer la sauvegarde des animes suivis de
      la v2.6 pour la transferer dans la v4 (progression perdue en partie -
      cf. point 30). **Fichier identifie** : `ma-progression-donghua-2026-
      09-16.html` dans `Downloads` (8 series, format "legacy" sans bloc
      JSON - le plus complet, deja repere au point 31). Import a faire par
      l'utilisateur lui-meme via le bouton "Importer" (panneau du haut ou
      colonne du lecteur, v4.10+) en choisissant ce fichier - operation
      cote navigateur (lecture du fichier + ecriture dans le stockage
      `GM_setValue` de Tampermonkey), hors de portee d'une modification de
      fichier sur disque. La fusion (`mergeImportedEntries`) ne fait
      jamais regresser une serie deja plus a jour dans la v4 (ex. Wushen
      Zhuzai, deja a l'episode 597 en v4 contre 578 dans ce backup - sera
      ignore automatiquement).
  70. **Question utilisateur** : possibilite de colorer le nom d'une serie
      dans le menu deroulant pour signaler l'ajout de nouveaux episodes -
      confirme non aborde auparavant (aucune occurrence dans cet
      historique avant ce point). **Implementation (v4.21)** : nouvelle
      fonction `checkForNewEpisodes()` qui, pour chaque serie suivie,
      recharge la page de l'episode enregistre (`fetchPageHtml` +
      `extractNextEpisodeUrlFromDoc`, reutilise tel quel de la logique de
      navigation existante) et detecte la presence d'un lien "episode
      suivant" - signe qu'un episode plus recent que celui suivi existe
      deja sur le site. Resultat mis en cache dans `newEpisodeFlags`
      (memoire, par `seriesUrl`) et applique en orange gras
      (`#ffb300`) sur l'option correspondante dans les deux menus
      deroulants de serie (panneau du haut `#ep-select` et colonne du
      lecteur `#ed-series-select`). Verification lancee 8s apres le
      demarrage (pour ne pas concurrencer les requetes de lancement du
      lecteur) puis toutes les 20 minutes tant que la page reste ouverte;
      le panneau n'est reconstruit que si au moins un statut a change.
      S'auto-corrige au fil des verifications suivantes (pas de reset
      manuel necessaire) une fois l'episode suivant regarde.
  71. **Non testé** : la v4.21 (verification et coloration des nouveaux
      episodes) n'a pas encore ete essayee - a valider en priorite : 1)
      qu'une serie avec un episode suivant deja publie s'affiche bien en
      orange gras dans les deux menus apres quelques secondes ; 2) que la
      couleur disparait au prochain cycle de verification une fois cet
      episode regarde ; 3) absence d'impact/ralentissement notable au
      demarrage de la page (requetes lancees en arriere-plan, differees
      de 8s).
  72. **Confirmation utilisateur** : la v4.21 (import v2.6, coloration des
      nouveaux episodes) fonctionne correctement au premier essai.
      **Nom retenu pour la version finale** : *Esprit Donghua Continuum*
      (parmi les propositions faites) - `@name` du script mis a jour en
      consequence (v4.22). `@namespace` volontairement inchange pour ne
      pas risquer de reinitialiser le storage `GM_setValue` (cf. point 30 -
      le risque connu vient de la suppression/recreation du script dans
      Tampermonkey, pas du nom affiche ; une simple edition en place du
      contenu existant reste sans danger).
  73. **Demandes utilisateur, retenues pour la v4.22** :
      - Bouton pour lancer une recherche de nouveaux episodes a la demande
        (sans attendre le cycle de 20 min).
      - Un petit tableau listant les series avec un nouvel episode dans la
        colonne du lecteur en plein ecran.
      - Reorganiser le panneau du haut (jusqu'ici une barre horizontale
        collante en haut de page) en colonne verticale a droite, avec un
        bouton fixe pour l'afficher/la masquer (meme principe que celui
        deja en place dans la colonne du lecteur).
  74. **Bug latent identifie et corrige en meme temps** : une serie
      importee depuis un ancien export sans `seriesUrl` connu est stockee
      sous une cle de secours `legacy:<nom>` (cf. point 33). Sans
      correctif, revisiter cette serie sur le site aurait cree une
      **deuxieme entree** sous la vraie `seriesUrl` (cle de stockage
      differente), laissant l'ancienne entree `legacy:` en doublon fige
      dans les menus, sans aucun moyen de la supprimer (l'exclusion
      masque sans jamais nettoyer le stockage). Ce cas concernait
      directement les 7 series du backup v2.6 pas encore rouvertes en v4.
      **Correctif** : `recordEpisodeProgress()` supprime desormais
      l'entree `legacy:<nom>` correspondante des qu'il ecrit sous la
      vraie `seriesUrl`.
  75. **Implementation (v4.22)** :
      - `newEpisodeFlags` (booleen) devient `newEpisodes` (objet
        `{seriesName, url}` par `seriesUrl`) : conserve desormais l'URL du
        nouvel episode detecte, pas seulement un statut - necessaire pour
        pouvoir y lier directement depuis la nouvelle mini-liste.
      - Nouvelle fonction `renderNewEpisodesList()` (HTML partage) :
        affiche chaque serie avec un nouvel episode deja publie comme un
        lien direct vers celui-ci, fond orange fonce/texte orange vif ;
        vide (rien affiche) si aucune serie concernee. Integree a la fois
        dans le panneau de droite et dans la colonne du lecteur (choix de
        perimetre : place aussi dans le panneau de droite en plus du
        plein ecran demande, pour rester visible meme hors lecture).
      - Nouveau bouton **"↻ Verifier les nouveaux episodes"** (panneau de
        droite ET colonne du lecteur) : declenche `checkForNewEpisodes()`
        a la demande, se desactive avec le texte "Recherche..." pendant
        l'appel.
      - Nouveau bouton **"Supprimer la serie selectionnee"** (panneau de
        droite ET colonne du lecteur, a cote du select de serie) :
        nouvelle fonction `deleteProgressEntryByEpisodeUrl()`, supprime
        definitivement l'entree correspondant a la serie choisie dans le
        select (confirmation demandee avant suppression). Complement de
        l'exclusion existante (qui masque sans supprimer).
      - **Panneau du haut devenu colonne fixe a droite** : `#ep-panel`
        passe de `position:sticky` (barre horizontale collee en haut,
        poussant le contenu de la page) a `position:fixed;top:54px;
        right:10px` (colonne verticale flottante, `width:250px`,
        `max-height:calc(100vh - 70px);overflow-y:auto` comme la colonne
        du lecteur). Tous les elements internes recalibres en
        `width:100%`/empilement vertical au lieu du flex horizontal avec
        retour a la ligne. Nouveau bouton fixe **`#ep-toggle-btn`** (coin
        superieur droit, `☰`/`✕`, meme principe que celui de la colonne du
        lecteur) qui bascule l'affichage de toute la colonne - cree une
        seule fois (`ensurePanelToggleButton()`), jamais recree par les
        reconstructions frequentes du panneau.
  76. **Non testé** : la v4.22 (colonne de droite repositionnee, bouton
      "Verifier les nouveaux episodes", suppression manuelle d'entree,
      mini-liste des nouveaux episodes, correctif doublon legacy:) n'a pas
      encore ete essayee.
  77. **Confirmation utilisateur** : la v4.22 fonctionne correctement, rien
      d'autre a ajouter cote fonctionnalites. **Demande** : relecture
      detaillee du code pour optimiser si besoin, en vue de la version
      finale (v4.23).
  78. **Relecture complete effectuee**. Un vrai bug trouve et corrige, plus
      quelques optimisations mineures sans impact fonctionnel :
      - **Bug** : `renderNewEpisodesList()` (v4.22) affichait une serie
        avec un nouvel episode meme si elle avait ete exclue entre-temps
        (case "Suivre cet anime" decochee) - la liste lisait `newEpisodes`
        sans jamais verifier `excludedSeries`, contrairement aux menus
        deroulants qui filtrent deja correctement. **Corrige** : meme
        filtre `excludedSeries` applique avant affichage.
      - **Optimisation** : `isSeriesExcluded()` relit integralement
        `GM_getValue('excludedSeries')` a CHAQUE serie testee a l'interieur
        des `.filter(...)` (buildHtml, checkForNewEpisodes,
        syncOverlayControls, buildPersistentPanel) - une lecture de storage
        par serie au lieu d'une seule pour toute la liste. Remplace par une
        lecture unique (`loadExcludedSeries()`) partagee pour tout le
        filtre a ces 4 endroits. Impact reel negligeable vu le nombre de
        series suivies, mais plus propre.
      - **Optimisation** : `checkForNewEpisodes()` refetchait en reseau la
        page de la serie actuellement ouverte dans le lecteur, alors que
        son "episode suivant" est deja connu localement
        (`currentEpisode.nextPageUrl`, extrait a l'ouverture de la page) -
        cette serie ne declenche plus de requete reseau redondante.
      - **Simplification** : `extractNextEpisodeUrlFromDoc()` et
        `extractPrevEpisodeUrlFromDoc()` (code quasi identique, seuls le
        `rel` cible et l'extremite de la liste de secours `.nvs`
        changeaient) fusionnes en une fonction commune parametree
        `extractAdjacentEpisodeUrlFromDoc()` - comportement inchange, deux
        fonctions publiques conservees pour ne pas toucher les appelants.
      - **Points restants, non traites (choix delibere)** : la colonne du
        lecteur (`ed-*`) et le panneau de droite (`ep-*`) dupliquent une
        bonne partie de leur logique de rendu (select de serie, boutons
        supprimer/verifier) - facilement 100-150 lignes proches mais pas
        identiques (l'un genere du HTML en chaine de caracteres reconstruit
        a chaque fois, l'autre maintient des noeuds DOM persistants). Une
        vraie fusion toucherait un flux deja fonctionnel et non stabilise
        (v4.22 tout juste validee) - juge trop risque pour le gain, a
        reconsiderer seulement si cette duplication cause un vrai probleme
        (bug corrige a un seul endroit, oublie a l'autre). Egalement non
        touche : le prefixe de log `[EspritDonghua v4]` (39 occurrences),
        laisse tel quel car purement cosmetique (nom interne de debug, pas
        le nom affiche a l'utilisateur) malgre le renommage en "Esprit
        Donghua Continuum".
  79. **Non testé** : les correctifs/optimisations v4.23 n'ont pas encore
      ete essayes (le bug de la mini-liste, en particulier, necessite
      d'exclure une serie qui a un nouvel episode pour se manifester -
      scenario peu probable a observer par hasard).
  80. **Demande utilisateur** : ajouter le bouton "Reautoriser l'acces"
      suggere au point 78 (fichier de sauvegarde lie), puis valider apres
      un test. **Implementation (v4.24)** : nouvelle fonction
      `reauthorizeBackupFile()` - reutilise `ensureBackupPermission()` deja
      existante sur le handle deja lie (`backupFileHandle`), sans jamais
      rouvrir le selecteur de fichier (`chooseBackupFile()` redesignerait
      un fichier au lieu de simplement reautoriser celui deja choisi).
      Fournit le vrai geste utilisateur qu'exige `requestPermission()` pour
      aboutir. Alerte explicite si aucun fichier n'est encore lie. Nouveau
      bouton **"Reautoriser l'acces au fichier"** ajoute a cote de
      "Choisir fichier sauvegarde" dans le panneau de droite (`#ep-reauth-
      backup`) ET dans la colonne du lecteur (`#ed-reauth-backup-btn`).
  81. **Non testé** : le bouton "Reautoriser l'acces" (v4.24) n'a pas
      encore ete essaye - a valider en priorite : forcer Chrome a oublier
      la permission (ou simplement apres un redemarrage du navigateur) et
      verifier que le clic suffit a la retablir sans passer par "Choisir
      fichier sauvegarde".
  82. **Confirmation utilisateur** : le bouton "Reautoriser l'acces"
      fonctionne bien. **Projet considere comme termine** (v4.24, "Esprit
      Donghua Continuum") - l'utilisateur reviendra "dans quelques temps"
      si de nouveaux besoins d'amelioration se presentent. Aucune tache en
      suspens a ce stade.
  83. **Demande utilisateur** : le projet reprend. Trois demandes a partir
      d'un screenshot (page episode E192 de "Dan Dao Zhizun") : deplacer le
      panneau hors lecteur (clarifie apres une premiere reponse ambigue -
      l'utilisateur avait d'abord dit "vers la droite" puis a precise "sur
      la gauche"), rendre le numero d'episode plus visible (le nom de la
      serie, long, poussait "Episode 192" hors de vue/discret en bas du
      libelle), et afficher le dernier episode vu sur le total disponible
      pour eviter la confusion observee : le libelle du panneau restait en
      jaune (couleur reservee en theorie a un nouvel episode disponible)
      alors que l'utilisateur venait de finir tous les episodes publies -
      en realite ce jaune etait inconditionnel (toujours applique au
      libelle de l'episode courant), sans lien avec la vraie detection de
      nouveaute.
      **Implementation (v4.25)** :
      - Panneau hors lecteur (`#ep-panel`) et son bouton bascule
        (`#ep-toggle-btn`) deplaces de `right:10px` a `left:10px` (calque
        plein ecran, ancre a gauche, non touche - hors demande).
      - Nouvelle fonction `extractLatestEpisodeFromDoc(doc, baseUrl)` : lit
        le numero du dernier episode publie directement dans
        `#singlepisode .episodelist li` (premiere entree, toujours la plus
        recente), colonne deja presente sur toute page episode - verifiee
        sur le HTML reel du site (`<em class="epnow">?</em> / ?` : le site
        ne connait/affiche PAS lui-meme de total pour une serie "Ongoing",
        d'ou le choix d'utiliser le dernier episode PUBLIE comme reference
        plutot qu'un total qui n'existe nulle part). Branchee dans
        `extractEpisodeInfoFromDoc` (champs `latestEpisodeNumber` /
        `latestEpisodeUrl`), donc disponible sans requete reseau
        supplementaire des qu'une page episode est chargee/parsee.
      - Nouvelle map memoire `latestKnownEpisode` (seriesUrl -> numero),
        alimentee (a) immediatement dans `recordEpisodeProgress()` pour la
        serie en cours, et (b) dans `checkForNewEpisodes()` pour les
        autres series suivies (reutilise le HTML deja fetch pour la
        detection d'episode suivant existante, aucun appel reseau en
        plus).
      - Panneau hors lecteur : libelle serie/episode separe en deux lignes
        (nom tronque avec ellipsis + tooltip title sur sa propre ligne,
        puis "Episode X / Y" en plus gros - 18px au lieu de 13px). Couleur
        du numero desormais liee a `newEpisodes[seriesUrl]` (le vrai
        signal de nouveaute deja utilise pour la mini-liste "Nouveaux
        episodes") : orange + " • nouveau" seulement si un episode plus
        recent existe reellement, vert sinon (a jour) - fini le jaune
        permanent qui laissait croire a un nouvel episode a tort.
      - Meme fraction "X / Y" ajoutee aux listes deroulantes (panneau et
        colonne du lecteur) et a la mini-liste "Nouveaux episodes" en haut
        du panneau.
      - `node --check` OK.
      **Non testé** : aucun de ces changements n'a encore ete verifie dans
      le vrai navigateur (positionnement du panneau a gauche, lisibilite
      du nouveau libelle, exactitude de la fraction X/Y et de la couleur
      selon les series reellement suivies par l'utilisateur).
  84. **Demande utilisateur** : suite au retour du point 83 (tests en
      cours) - retirer le suffixe " • nouveau" du libelle (le code couleur
      suffit), et dupliquer l'affichage nom/numero d'episode dans le
      calque plein ecran (colonne `ed-*`), qui n'avait jusqu'ici aucun
      rappel du nom de la serie ni du numero d'episode en cours (seulement
      un statut generique de lecture - "Chargement...", "Lecture", etc.).
      **Implementation (v4.26)** :
      - Suffixe " • nouveau" supprime - seule la couleur (orange si
        nouvel episode reellement disponible, vert sinon) subsiste.
      - Nouvelle fonction partagee `getCurrentEpisodeDisplay()` (nom,
        texte "Episode X / Y", couleur) - reutilisee par le panneau hors
        lecteur ET par la nouvelle zone du calque plein ecran, pour eviter
        que les deux affichages divergent.
      - Calque plein ecran : deux nouvelles lignes ajoutees en tete de la
        colonne de commandes (`#ed-current-name` - nom tronque avec
        tooltip, `#ed-current-ep` - "Episode X / Y" en 16px, couleur
        identique au panneau), mises a jour dans `syncOverlayControls()`
        (donc a chaque `buildPersistentPanel()`, y compris a chaque
        changement d'episode puisque `startEpisode()` l'appelle deja dans
        ses deux branches).
      - `node --check` OK.
      **Non testé** : nouvel affichage dans le calque plein ecran pas
      encore verifie dans le vrai navigateur.
  85. **Confirmation utilisateur** : "tout a l'air de fonctionner" - capture
      d'ecran a l'appui montrant le calque plein ecran avec le panneau
      hors lecteur a gauche, le nom de serie tronque et "Episode 548 / 632"
      bien visible en vert (episode a jour, pas de nouveau disponible).
  86. **Demande utilisateur** : trois suggestions supplementaires, dont une
      interrompue en cours de redaction (jamais appliquee, reprise ici) :
      (a) n'afficher que le nom entre parentheses (titre anglais, ex.
      "Supreme God Emperor" plutot que "Wu Shang Shen Di (Supreme God
      Emperor)") ; (b) dans le gros texte 18px, remplacer "Episode X/Y"
      par le nom anglais de l'anime directement (donc inverser les roles :
      le nom devient le gros texte, le numero d'episode passe en dessous,
      plus petit) ; (c) dans la mini-liste "Nouveaux episodes", afficher
      aussi a quel episode l'utilisateur s'est arrete (pas seulement le
      numero du nouvel episode) pour permettre une double verification a
      l'oeil.
      Capture d'ecran jointe (v4.26, serie "Wu Shang Shen Di") a aussi mis
      en evidence un bug independant des demandes : le libelle affichait
      "Episode 549 / 632" en VERT (couleur "a jour") alors que 632 > 549
      signifie clairement qu'un nouvel episode existe deja. Cause : la
      couleur dependait de `newEpisodes[seriesUrl]`, qui n'etait mis a
      jour que par `checkForNewEpisodes()` (declenche 8s apres le
      chargement de la page, puis toutes les 20 min) - alors que la
      fraction X/Y, elle, venait de `latestEpisodeNumber` lu directement
      sur la page et donc disponible immediatement. Resultat : une fenetre
      de quelques secondes (ou plus, si le minuteur n'etait pas encore
      passe) ou l'affichage se contredisait lui-meme.
      **Implementation (v4.27)** :
      - `recordEpisodeProgress()` met desormais a jour `newEpisodes`
        immediatement pour la serie en cours (meme logique que
        `checkForNewEpisodes` : `nextPageUrl` present -> entree ajoutee,
        absent -> supprimee), au lieu d'attendre le prochain passage du
        minuteur. Corrige le bug ci-dessus a la racine.
      - Nouvelle fonction `displayName(name)` : extrait le texte entre
        parentheses (`/\(([^)]+)\)/`), repli sur le nom complet si absent.
        Appliquee partout ou un nom de serie s'affiche (libelle courant,
        listes deroulantes des deux colonnes, mini-liste "Nouveaux
        episodes") ; le nom complet reste visible en infobulle (`title`)
        sur le libelle courant.
      - Libelle courant (panneau ET calque plein ecran) : roles inverses -
        le nom (extrait) est maintenant le gros texte en gras (18px
        panneau / 16px lecteur, blanc neutre), "Episode X/Y" passe en
        dessous, plus petit (13px / 12px), et garde le code couleur
        orange/vert (nouveaute reelle desormais fiable des l'ouverture de
        la page grace au correctif ci-dessus).
      - Mini-liste "Nouveaux episodes" : chaque entree affiche maintenant
        deux lignes - le nom (extrait) en gras, puis "vu X -> Y" en plus
        petit (numero suivi actuel vs dernier publie), pour la double
        verification demandee. Repli sur "Ep Y" seul si le numero suivi
        n'est pas encore connu pour cette serie.
      - `node --check` OK.
      **Non testé** : aucun de ces changements v4.27 n'a encore ete
      verifie dans le vrai navigateur.
  87. **Demande utilisateur** : dans les listes deroulantes (`#ep-select`
      et `#ed-series-select`), limiter le nom a un nombre de caracteres
      fixe (quitte a tronquer les titres trop longs) et aligner tous les
      numeros d'episode en colonne.
      **Implementation (v4.28)** : nouvelle fonction
      `buildSeriesOptionLabel(e)` (+ helper `padColumn`) - tronque/complete
      le nom (deja reduit au titre entre parentheses via `displayName`) a
      une largeur fixe `SERIES_NAME_COLUMN_WIDTH = 18` caracteres
      (ellipsis "…" si coupe), puis ajoute " Ep " et la fraction
      episode/dernier avec chaque numero cale sur 3 caracteres
      (`padStart(3)`) pour que la colonne des numeros tombe toujours au
      meme endroit visuellement. Un `<select>`/`<option>` natif ne
      supporte ni CSS ni HTML interne (rendu par l'OS/le navigateur), donc
      le seul moyen d'aligner une colonne est le padding par espaces sur
      une police a chasse fixe - `font-family:Consolas,monospace` ajoute
      aux deux `<select>` concernes pour que ce padding s'aligne
      reellement (sans ca, les espaces d'une police a chasse variable ne
      donnent pas un alignement constant). Les deux listes (panneau et
      lecteur) utilisent desormais ce meme helper, elimine la duplication
      de la construction du libelle qui existait entre les deux.
      `node --check` OK. **Non testé.**
      **Question utilisateur (reponse donnee, pas encore codee)** :
      faire defiler (marquee/scroll) les noms trop longs plutot que de les
      tronquer - explique que c'est infaisable dans les `<option>` d'un
      `<select>` natif (limitation navigateur, pas un choix), mais
      possible sur le libelle du nom en gros caracteres (div classique,
      pas un select) si l'utilisateur le souhaite la, en complement du
      tronquage qui reste de toute facon necessaire dans les listes
      deroulantes.
  88. **Demande utilisateur** : capture d'ecran a l'appui (`#ed-series-
      select` ouvert) montrant que malgre le tronquage a 18 caracteres et
      la police a chasse fixe (v4.28), la colonne "Ep" ne tombe PAS au
      meme endroit d'une ligne a l'autre - l'utilisateur demande si les
      numeros peuvent tous commencer au meme caractere.
      **Cause identifiee** : le padding utilisait des espaces normaux
      (`' '.repeat(...)`) - or le HTML reduit toute suite de 2+ espaces
      normaux consecutifs a un seul a l'affichage (normalisation des
      blancs, comportement standard du navigateur, pas un bug specifique
      au `<select>`). Le padding etait donc bien genere en JS mais
      invisible/ecrase au rendu, d'ou un alignement qui semblait aleatoire
      selon la longueur de chaque nom. Meme capture d'ecran, deuxieme
      defaut repere au passage (non signale par l'utilisateur mais visible
      dessus) : plusieurs series affichaient "Ep null / ..." - ce sont des
      series importees depuis un ancien backup v2.6 (`parseProgressBackup`,
      format HTML sans numero d'episode machine-lisible -> `episodeNumber:
      null` fige a l'import, cf. commentaire deja present dans le code a
      ce sujet) jamais rouvertes depuis dans v4 (ce qui aurait enregistre
      un vrai numero via `recordEpisodeProgress`).
      **Implementation (v4.29)** :
      - `padColumn()` et le nouveau `padEpisodeNum()` utilisent desormais
        l'espace insecable (` `) au lieu de l'espace normal pour le
        remplissage - non affecte par la normalisation des blancs, donc
        l'alignement en colonne est enfin reellement stable.
      - `padEpisodeNum()` affiche "?" a la place du numero quand il est
        `null`/`undefined` au lieu du texte litteral "null" (les entrees
        v2.6 encore non rouvertes dans v4 afficheront donc "Ep  ? / 156"
        par exemple, proprement, en attendant que l'utilisateur rouvre
        cette serie une fois pour que le vrai numero s'enregistre).
      - `node --check` OK. **Non testé.**
  89. **Demande utilisateur** : centrer la ligne "Episode X/Y" et la
      sous-ligne "Nouveaux episodes" sous le titre, dans le calque plein
      ecran (capture d'ecran : `#ed-current-name` "Supreme God Emperor" en
      titre, `#ed-current-ep` "Episode 553 / 632" juste en dessous, puis
      le bloc "Nouveaux episodes").
      **Implementation (v4.30)** : `text-align:center` ajoute sur
      `#ed-current-ep` et sur le conteneur `#ed-new-episodes` dans le
      template du calque plein ecran uniquement (le nom/titre au-dessus
      reste aligne a gauche, non demande ; le panneau hors lecteur, qui a
      un agencement different - liste "Nouveaux episodes" AVANT le
      libelle courant, pas apres - n'est pas touche, la capture montrant
      specifiquement le calque plein ecran). Les liens de la mini-liste
      (`<a style="display:block">` generes par `renderNewEpisodesList()`,
      fonction partagee) heritent du centrage via leur conteneur parent,
      aucun changement necessaire dans cette fonction elle-meme.
      `node --check` OK. **Non testé.**
  90. **Demande utilisateur** : "on va toutes les faire" - les 4 pistes
      proposees au point precedent (suggerees par la session, pas demandees
      au depart) : badge de compteur sur le bouton ☰, correction des
      numeros manquants ("?"), tri "nouveautes en premier", et affichage
      de l'anciennete du dernier visionnage.
      **Implementation (v4.31)** :
      - **Badge sur `#ep-toggle-btn`** : le bouton contient maintenant
        deux `<span>` internes (`#ep-toggle-icon` pour ☰/✕, `#ep-toggle-
        badge` pour le compteur) au lieu d'un simple `textContent` - sinon
        modifier l'icone aurait efface le badge et vice-versa. Nouvelle
        fonction `updateToggleBadge()` (compte `newEpisodes` hors series
        exclues), appelee a chaque `buildPersistentPanel()`. Badge cache
        si 0, plafonne a "99+".
      - **Correction des numeros manquants** : nouvelles fonctions
        `countMissingEpisodeNumbers()` et `fixMissingEpisodeNumbers()` -
        refetch la page `episodeUrl` de chaque entree a "?" et relit son
        `itemprop="episodeNumber"` (meme extraction qu'un chargement de
        page normal), sans changer quel episode est suivi. Bouton
        "Corriger les numeros manquants (N)" affiche uniquement dans le
        panneau hors lecteur (pas duplique dans le calque plein ecran -
        action de maintenance ponctuelle, pas un controle de lecture au
        meme titre que les autres boutons `ed-*`) et seulement s'il reste
        au moins une entree a corriger.
      - **Tri "nouveautes en premier"** : nouvelle fonction partagee
        `seriesSortCompare()` (groupe `newEpisodes` en tete, puis
        alphabetique) remplace le tri alphabetique simple dans les deux
        listes deroulantes (panneau et lecteur). La mini-liste "Nouveaux
        episodes" elle-meme (deja filtree aux seules series en retard)
        est en plus triee par anciennete du dernier visionnage (la plus
        en retard en premier).
      - **Anciennete du dernier visionnage** : nouvelle fonction
        `formatRelativeDays(iso)` ("vu aujourd'hui" / "vu hier" / "vu il y
        a Nj"), basee sur le champ `watchedAt` deja enregistre. Choix de
        placement : PAS dans le texte visible des listes deroulantes (deja
        alignees en colonne au point 87-88, y ajouter du texte aurait
        recasse cet alignement pour un gain marginal) - ajoutee plutot en
        infobulle (`title`) sur chaque `<option>`, et en texte visible
        dans la mini-liste "Nouveaux episodes" (juxtaposee a "vu X -> Y").
      - `node --check` OK.
      **Non testé** : les 4 changements v4.31 n'ont pas encore ete
      verifies dans le vrai navigateur - le bouton de correction des
      numeros manquants en particulier merite un test attentif (il
      declenche potentiellement plusieurs requetes reseau simultanees, une
      par serie a "?").
  91. **Demande utilisateur** : le centrage du point 89 n'avait ete
      applique qu'au calque plein ecran - capture d'ecran du panneau hors
      lecteur montrant "Episode 555 / 632" et le bloc "Nouveaux episodes"
      toujours alignes a gauche, en decalage visuel avec l'autre colonne.
      Demande d'harmoniser les deux.
      **Implementation (v4.32)** : le centrage est deplace dans
      `renderNewEpisodesList()` elle-meme (`text-align:center` sur son
      titre et son conteneur de liens) plutot que sur le conteneur
      `#ed-new-episodes` cote calque plein ecran (retire, devenu
      redondant) - la fonction etant deja partagee entre les deux
      colonnes, ca centre desormais la mini-liste partout d'un seul
      endroit au lieu de dupliquer le style a chaque appelant. Meme
      principe pour la ligne "Episode X/Y" du panneau hors lecteur :
      `text-align:center` ajoutee, pour matcher celle du calque plein
      ecran (v4.30). Le nom de la serie au-dessus reste aligne a gauche
      dans les deux colonnes (non demande, coherent avec le calque plein
      ecran).
      `node --check` OK. **Non testé.**
  92. **Demande utilisateur** : remettre "le bouton configuration" pour
      verifier les intro/outro de toutes les series - l'utilisateur pense
      que ca n'a pas ete importe de la v2.6 et ca l'aiderait a savoir
      lesquelles reparametrer.
      **Verification** : retrouve dans `esprit-donghua-suivi-progression.
      user.js` (v2.6) - bouton "Reglages" (`ep-settings-btn`) ouvrant
      `openSettingsModal()`, une fenetre modale avec un tableau (une ligne
      par serie suivie : nom, Fin intro, Debut outro, Suivi, Son auto,
      champs editables) et un bouton "Enregistrer" appliquant tout en une
      fois. Confirme absent de v4 (qui n'a que le `prompt()` par serie
      pour la serie actuellement ouverte, `promptIntroEnd`/
      `promptOutroStart` - aucune vue d'ensemble). L'import v2.6->v4 ne
      portait effectivement que nom/episode/URL (cf. `parseProgressBackup`,
      format HTML sans le bloc JSON), jamais les reglages intro/outro -
      confirme l'hypothese de l'utilisateur.
      **Implementation (v4.33)** : `openSettingsModal()` portee dans v4 a
      l'identique (memes fonctions reutilisees : `getIntroOutroForSeries`,
      `setIntroOutroForSeries`, `isSeriesExcluded`, `setSeriesExcluded`,
      `formatTimecode`, `parseTimecode`, deja presentes), avec deux
      differences : colonne "Son auto" retiree (concept v2.6 uniquement -
      v4 gere le son globalement via `tryAutoUnmute`, pas de reglage par
      serie a porter) ; et lignes des series sans AUCUN reglage (ni intro
      ni outro) marquees d'un fond legerement teinte + "⚠" devant le nom,
      pour justement reperer d'un coup d'oeil ce qui reste a
      reparametrer - c'etait le besoin explicite de la demande, absent de
      la version v2.6 d'origine. Bouton "Configuration" ajoute a cote de
      "Fin intro"/"Debut outro" dans les deux colonnes (panneau hors
      lecteur ET calque plein ecran, comme ces deux autres boutons).
      `node --check` OK. **Non testé.**
  93. **Demande utilisateur** : possibilite, une fois en plein ecran,
      d'avoir un menu deroulant ou une barre de recherche pour aller
      directement a un numero d'episode particulier (au lieu de cliquer
      "Suivant" un par un).
      **Choix technique** : deux options envisagees - (a) un vrai menu
      deroulant listant tous les episodes de la serie, qui aurait exige
      d'aller chercher/parser la page complete de la serie (potentiellement
      des centaines d'entrees, un fetch de plus) ; (b) un champ "aller a
      l'episode N°" qui deduit l'URL cible par substitution sur l'URL de
      l'episode courant (motif "...-e<numero>/" constant, deja verifie
      sur plusieurs series reelles) - retenue pour rester leger (pas de
      fetch supplementaire pour construire une liste, juste une requete
      pour l'episode cible une fois saisi).
      **Implementation (v4.34)**, calque plein ecran uniquement (portee
      demandee explicitement "une fois en plein ecran") :
      - Nouveau champ numerique `#ed-goto-input` + bouton "Aller"
        (`#ed-goto-btn`) sous "Suivant", valide aussi via Entree.
      - Nouvelle fonction `goToEpisodeNumber(n)` : verifie d'abord contre
        `latestKnownEpisode` (deja connu, pas de requete) si le numero
        depasse le dernier episode publie - message d'erreur immediat
        sans reseau si oui. Sinon construit l'URL cible par regex sur
        `currentEpisode.pageUrl`, fetch + `extractEpisodeInfoFromDoc`
        (meme validation qu'un chargement normal), puis charge l'episode
        exactement comme `advanceToNextEpisode` (changement de `src`
        iframe, `history.pushState`, `recordEpisodeProgress`,
        rafraichissement du panneau) - message d'erreur explicite si la
        page n'existe pas (numero invalide/inexistant).
      - Limite connue : suppose que la numerotation de la serie ne
        contient pas d'exception (ex. un episode special "12.5") - pas
        rencontre dans les series testees jusqu'ici mais a garder en tete
        si un saut echoue de façon inattendue sur une serie particuliere.
      - `node --check` OK. **Non testé.**
  94. **Demande utilisateur** : la qualite est verrouillee sur 1080p
      (`tryLockQuality1080p()`, injecte dans l'iframe Odysee) mais c'est
      parfois un peu long a charger - demande une case pour pouvoir
      choisir 720p a la place.
      **Implementation (v4.35)** :
      - Nouveau reglage global (pas par serie, comme "Lecture continue"/
        "Lecteur auto") : `isLowQualityEnabled()`/`setLowQualityEnabled()`
        (`GM_setValue('preferLowQuality720p', ...)`). Case a cocher
        "720p (plus rapide)" ajoutee dans les deux colonnes, juste apres
        "Lecteur auto".
      - `tryLockQuality1080p()` renommee `tryLockQuality()` et ne cible
        plus '1080p' en dur : lit `config.preferredQuality` ('1080p' ou
        '720p' selon la case), transmis depuis la page principale via
        `currentConfig`/`sendConfigToPlayerFrame()` (meme canal
        postMessage que introEnd/outroStart). Lecture faite au moment
        precis de la selection dans le sous-menu Qualite (pas a l'entree
        de la fonction) : la config arrive de la page principale par
        postMessage, quasi instantanee mais pas forcement encore recue au
        tout premier appel (declenche des que la balise <video> apparait,
        avant meme la reponse "config" du parent) - repousser la lecture
        de quelques centaines de ms (le temps d'ouvrir le sous-menu)
        fiabilise la prise en compte sans dupliquer l'appel.
      - **Limite assumee** : cocher/decocher la case en cours de lecture
        NE change PAS la qualite de l'episode deja charge (pas de nouvelle
        tentative d'ouverture du menu Reglages a la volee, pour eviter de
        faire ressurgir ce menu de façon intrusive pendant le visionnage) -
        s'applique au prochain chargement d'episode (bouton Suivant,
        changement de serie, saut vers un numero). Precise dans l'infobulle
        de la case.
      - `node --check` OK. **Non testé.**

### 2026-09-18
  95. **Signalement utilisateur** : "aller à l'épisode XXX" ne trouve plus les
      épisodes, et le passage automatique à l'épisode suivant a planté
      (l'épisode courant est resté bloqué à se rejouer en boucle) - captures
      d'écran de la console fournies.
      **Diagnostic** : la console montre la vraie cause, distincte d'un
      numero d'episode invalide - `Chargement de la page suivante echoue,
      statut 500` (`advanceToNextEpisode`, ligne ~1160), une erreur serveur
      passagere de esprit-donghua.xyz sur `fetchPageHtml`. `goToEpisodeNumber`
      utilise la meme fonction et le meme genre de message d'erreur generique
      ("introuvable"), donc un 500 transitoire au moment du saut produit
      exactement le symptome decrit ("ne trouve plus les épisodes") alors que
      l'episode existe bel et bien. Le reste des lignes de console (Mixed
      Content, `ERR_BLOCKED_BY_CLIENT` sur sentry/watchman/pubs) est du bruit
      sans rapport (bloqueur de pub + avertissements HTTPS), deja documente
      plus haut pour la v3.
      Rassure : le numero d'episode n'est pas vraiment "perdu" - `recordEpisodeProgress`
      l'enregistre dans le storage Tampermonkey (`GM_setValue`) a chaque
      episode charge AVEC SUCCES, et n'est jamais efface par un echec de
      chargement suivant. Consultable via le panneau (☰) : nom de serie +
      numero d'episode courant, et le menu deroulant liste le dernier episode
      connu de chaque serie suivie.
      **Correctif (v4.36)** :
      - `fetchPageHtml(url, retriesLeft)` retente automatiquement une fois
        (apres 1s) sur un statut 5xx avant d'abandonner - absorbe ce genre
        d'erreur serveur passagere sans boucler indefiniment (un vrai 404 sur
        un numero d'episode inexistant, lui, ne se resout jamais en retentant).
      - Message d'erreur de `goToEpisodeNumber` desormais distinct entre
        "Erreur serveur, reessaie dans un instant." (statut 5xx, meme apres
        la nouvelle tentative) et "Episode N introuvable." (page chargee mais
        sans iframe Odysee - vrai numero invalide), pour ne plus induire en
        erreur sur la cause reelle.
      - `node --check` OK. **Non testé.**

### 2026-09-21
  96. **Relecture complete du script (v4.36) a la demande de l'utilisateur**,
      deux points repérés et signalés comme bugs potentiels - **confirmes
      par l'utilisateur comme des comportements VOULUS, pas des bugs** :
      - `outroSkipSuspended` (mis a `true` par le bouton "Precedent") n'est
        remis a `false` que par le bouton "Suivant", jamais par la fin
        naturelle d'un episode (`ended`) - donc apres un "Precedent", le
        declenchement anticipe par "Debut outro" reste desactive pour tous
        les episodes suivants tant qu'on n'a pas recliqué sur "Suivant".
        Voulu.
      - `applyIntroSkipIfNeeded()` est rejouee a chaque renvoi de config a
        l'iframe (donc aussi quand on change un reglage sans rapport comme
        "Lecture continue"/"720p" pendant l'intro) - peut faire sauter la
        video a `introEnd` sans que ce soit ce qui a ete demande. Voulu.
      A garder en tete : ne pas re-signaler ces deux points comme des bugs
      dans une future relecture.

## Nouveau chantier : extension a animoflix.to et anime-sama.to (v6.0)

Demande de l'utilisateur : adapter le principe d'Esprit Donghua a deux
nouveaux sites, https://animoflix.to/ et https://anime-sama.to/, avec un
suivi unifie groupe par site (certains animes existent sur plusieurs
sites a la fois).

**Decisions prises avec l'utilisateur avant de coder** :
- Un seul script (pas 3 scripts par site + un 4e agregateur) : chaque
  script Tampermonkey a son PROPRE stockage isole (`GM_setValue`), un
  script separe "agregateur" n'aurait pas acces aux donnees des 3 autres
  sans un mecanisme de partage bricolé en plus - repris du principe deja
  valide par v4 (un seul fichier couvrant plusieurs domaines).
- v6.0 reprend AUSSI esprit-donghua.xyz/Odysee (pas seulement les 2
  nouveaux sites), pour une liste de suivi vraiment unique. Le fichier
  `esprit-donghua-suivi-progression-v4.user.js` reste intact et
  independant sur le disque - a desactiver dans Tampermonkey pour eviter
  un calque en double sur esprit-donghua.xyz.
- Perimetre v1 volontairement reduit : hebergeur video.sibnet.ru
  UNIQUEMENT (les 2 nouveaux sites en proposent 2-3 chacun -
  ansembed.net, sendvid.com - ignores pour l'instant). Un episode qui
  n'existe pas sur sibnet est simplement laisse au lecteur natif du site
  (pas de calque, message dans le panneau) plutot que de bloquer.

**Recherche technique faite avant de coder** (HTML brut via curl, pas de
navigateur reel - WebFetch echouait a voir le lecteur, genere en JS) :
- **animoflix.to** : vraie page par episode (comme esprit-donghua), liens
  suivant/precedent en HTML (`a.ep-nav-btn.next-btn` /
  `a.ep-nav-btn[aria-label="Episode precedent"]`), nom de serie/numero
  d'episode dans des selecteurs stables (`a.ep-anime-link`,
  `h1.ep-h1 .ep-num`). URL sibnet directement dans
  `<option data-host="video.sibnet.ru">` d'un `<select
  id="epLecteurSelect">` - server-rendu, pas besoin d'executer le JS du
  site pour la lire.
- **anime-sama.to** : PAS de page par episode - une seule page par
  saison/langue, changer d'episode = changer d'index dans un tableau JS
  (`var eps1 = [...]`, un tableau par "lecteur") charge depuis un fichier
  `episodes.js` propre a chaque saison. Lu par expression reguliere
  (jamais d'`eval`/`new Function` sur du JS distant) plutot que d'
  executer le fichier. Consequence : pas d'URL par episode a stocker -
  v6.0 invente sa propre convention `<url saison>#ep=N` (ignoree par le
  site, relue par nous au chargement) pour pouvoir "reprendre" un episode
  precis.
- **video.sibnet.ru** : lecteur Video.js standard (pas un lecteur React
  maison comme Odysee) - la balise `<video>` existe DEJA au chargement,
  contrairement a Odysee ou elle n'apparait qu'apres le clic. Piege
  identifie AVANT de coder (pas en testant) : la boucle de clic
  automatique de v4 s'arretait des que la balise <video> EXISTE - correct
  pour Odysee, faux ici (elle existe direct, la lecture n'a pas demarre
  pour autant). Corrige en se basant sur l'evenement `play` reel
  (`playbackStarted`) plutot que sur la simple presence de la balise -
  voir `runInsidePlayerFrameGeneric()` dans le nouveau fichier. Pas de
  menu de qualite trouve (une seule source video fournie) - la case
  "720p" du panneau ne s'applique donc qu'aux episodes lus via Odysee.

**Fichier cree** : `esprit-donghua-suivi-progression-v6.user.js`.
Architecture generale reprise de v4 (calque plein ecran jamais recree,
second script injecte DANS l'iframe du lecteur via
`runInsidePlayerFrameGeneric()` partagee entre Odysee et Sibnet, panneau
persistant, export/import, fichier de sauvegarde lie) mais generalisee
via un systeme d'adaptateurs par site (`SITE_ESPRIT_DONGHUA`,
`SITE_ANIMOFLIX`, `SITE_ANIME_SAMA`), chacun fournissant une forme
unifiee (`site`, `seriesUrl`, `episodeNumber`, `embedSrc`, `navStyle`
'page' ou 'index', etc.) consommee par un coeur commun. Stockage par
entree suivie desormais cle par `site::seriesUrl` (au lieu de juste
`seriesUrl`) pour eviter toute collision entre sites et permettre le
groupement par site demande (tri `seriesSortCompare` : site d'abord,
puis nouveaux episodes, puis alphabetique ; libelles prefixes `[ED]`/
`[AF]`/`[AS]`).

**Bug trouve et corrige AVANT tout test reel** (relecture attentive du
code juste ecrit, pas un retour utilisateur) : dans
`checkForNewEpisodes()`, la verification "nouvel episode" pour une serie
anime-sama PAS actuellement ouverte re-extrayait la saison sans le
suffixe `#ep=N`, ce qui repart toujours a l'episode 1 (`episodeIndex=0`)
- la comparaison generique `hasNextEpisode()` aurait alors dit "oui, un
nouvel episode existe" des qu'une saison a plus d'1 episode, quel que
soit l'episode REELLEMENT deja suivi. Corrige par une comparaison
directe `episodeNumber` (deja suivi) vs `totalEpisodes` (fraichement
relu) specifique a ce cas, plutot que de passer par la logique generique
concue pour le lecteur en cours.

`node --check` OK. **RIEN n'a ete teste dans un vrai navigateur** - a
faire en priorite absolue a la reprise, dans cet ordre :
1. Charger le script dans Tampermonkey, DESACTIVER v4.36 (evite un
   doublon de calque sur esprit-donghua.xyz).
2. Tester esprit-donghua.xyz d'abord (le mieux connu) pour verifier que
   la generalisation n'a rien casse par rapport a v4.
3. Tester animoflix.to sur un episode dont le Lecteur 1 est bien sibnet.
4. Tester anime-sama.to - en particulier le clic automatique sur
   `.vjs-big-play-button` et le declenchement par l'evenement `play`
   (le point le plus incertain, jamais verifie en conditions reelles).
5. Verifier l'affichage groupe par site dans le panneau et le menu
   deroulant du lecteur.

## Retour utilisateur (2026-09-21) : rien ne se passe sur aucun des 3 sites

L'utilisateur rapporte : le script v6 ne fait RIEN sur les 3 sites (le
site se comporte comme s'il n'y avait pas de script), y compris sur
esprit-donghua.xyz ou le panneau apparaissait pourtant deja des la page
d'accueil avec v4 (pas besoin d'etre sur une page episode).

**Cause trouvee (relecture du code, pas un test) : un vrai bug bloquant
d'ordre d'initialisation.** `const CURRENT_SITE = detectSite();` etait
appele tout en haut du fichier (juste apres le routage
iframe/page-principale), mais `detectSite()` lit le tableau `SITES`
(et les adaptateurs `SITE_ESPRIT_DONGHUA`/`SITE_ANIMOFLIX`/
`SITE_ANIME_SAMA`), tous declares en `const` bien plus bas dans le MEME
fichier. En JavaScript, un `const`/`let` reste dans sa "zone morte
temporelle" tant que sa ligne de declaration n'a pas encore ete
executee - y acceder avant leve un `ReferenceError` immediat, qui
arretait TOUT le script des le tout debut, sur les 3 sites sans
exception (contrairement a une fonction declaree avec `function`, qui
est elle entierement hissee - piege classique de melange des deux).

**Corrige** : le bloc qui appelle `detectSite()` et lance `main()` a ete
deplace tout a la fin du fichier, apres la definition de `SITES` et de
tous les adaptateurs (`detectSite()` elle-meme, en tant que declaration
`function`, pouvait rester ou elle etait - c'est l'endroit ou elle est
APPELEE qui comptait).

**Validee par un test reel (Playwright, vrai Chromium, fichier non
modifie)** : le script charge sur une fausse page d'accueil
esprit-donghua.xyz (avec des stubs `GM_*`) ne leve plus aucune erreur, et
`#ep-toggle-btn`/`#ep-panel` apparaissent bien - confirme que
l'initialisation atteint desormais `buildPersistentPanel()` avec
succes, meme hors page episode (script conserve dans le scratchpad de
session).

**Toujours pas teste sur un vrai onglet Tampermonkey (voir suite plus bas
pour les tests reels effectues ensuite)** - l'utilisateur
doit recopier le fichier mis a jour dans l'editeur Tampermonkey (rappel
habituel : le fichier disque n'est jamais relu automatiquement) puis
revalider les 3 sites, y compris le probleme de lecture Sibnet bloquee
signale juste avant (toujours pas confirme resolu ou non, le
ReferenceError empechait meme d'atteindre cette partie du code sur
cette session de test).

## Suite des tests reels (2026-09-21, apres correctif du ReferenceError)

- **Panneau visible sur les 3 sites, y compris hors page episode** :
  confirme fonctionnel apres avoir elargi `matchesUrl()` d'Animoflix et
  Anime-Sama a tout le domaine (au lieu de motifs d'URL trop stricts) -
  memes symptome et cause que documente juste avant.
- **Filtre par site ajoute** (menu deroulant "Tous les sites" / par site,
  partage entre le panneau et la colonne du lecteur, choix memorise) -
  demande explicite de l'utilisateur pour naviguer la liste unifiee plus
  facilement.
- **Lecture Sibnet bloquee indefiniment sur Anime-Sama** : cause
  identifiee - le plugin de pub VAST de sibnet attend une reponse
  publicitaire qui n'arrive jamais (bloqueur de pub). Cadence de clic
  automatique ralentie (2s/15 tentatives au lieu de 500ms/20) pour ne
  plus interrompre cette sequence.
- **Analyse des domaines de pub/tracker** faite pour Animoflix et
  Anime-Sama (meme demarche que deja appliquee sur esprit-donghua),
  liste fournie au format regle uBlock Origin : `ku.xyridpunitur.com`,
  `histats.com` (Animoflix) ; `acscdn.com` (aclib), `a-zzz.com`,
  `llvpn.com`, `kingdomparlor.com`, `googletagmanager.com` (Anime-Sama).
  Point d'attention transmis a l'utilisateur : bloquer aussi
  `advast.sibnet.ru`/`c.sibnet.ru` (pub propre a sibnet, differente des
  precedentes) risque de reproduire le blocage de lecture ci-dessus.
- **Bug reel trouve et corrige** : la video sur Anime-Sama "ne gardait
  pas la pause" (reprenait toute seule) sauf en cliquant sur le bouton
  lecture natif. Cause : `tryAutoUnmute()` surveillait une pause pendant
  1.5s apres CHAQUE vrai clic pour annuler un blocage du son par Chrome -
  fenetre bien trop large, qui finissait par avaler une vraie pause
  volontaire (plus visible sur sibnet, ou le son peine plus a passer,
  donc cette fonction se redeclenche a chaque clic tant qu'il reste
  coupe). Reduite a 350ms.
- **Doublons de sauvegarde nettoyes** : 11 fichiers
  `ma-progression-donghua (N).html` supprimes du dossier Telechargements
  (le plus recent garde comme filet de securite) - rappel donne a
  l'utilisateur d'utiliser le bouton "Choisir fichier sauvegarde" pour
  que ca ne se reproduise plus.

## Discussion : commercialiser le projet ?

Question posee par l'utilisateur. **Reponse donnee : deconseille**, pour
deux raisons - (1) juridique : les 3 sites cibles sont du streaming
gratuit non licencie, toute la valeur de l'outil consiste a faciliter
l'acces a ce contenu - vendre ca (par opposition a un usage personnel)
expose a un risque reel de contrefacon/complicite ; (2) pratique : outil
fragile (depend de la structure interne de sites qu'on ne controle pas,
casse a chaque changement), conflit d'interet direct avec les sites
cibles (qui vivent de la pub qu'on contourne), public habitue au
gratuit, normes des depots de scripts (Greasy Fork etc.) hostiles a ce
type d'outil. **Idee mise de cote par l'utilisateur** au profit d'une
piste plus saine.

## Nouvelle direction actee : reecriture en tracker GENERIQUE + installeur

Discussion sur "et si on detachait le projet des sites precis pour en
faire quelque chose de vendable/partageable proprement" :

- **Genericite** : remplacer l'extraction specifique a chaque site par
  (a) une recherche manuelle de la serie par l'utilisateur via l'API
  publique et gratuite AniList (couvre tous les animes, aucun scraping
  requis) et/ou reconnaissance depuis le titre d'onglet, et (b) les
  "nouveaux episodes" bases sur le calendrier de diffusion officiel
  AniList au lieu de rescraper chaque site suivi. Le clic automatique
  sur "lecture" est abandonne (l'utilisateur clique lui-meme une fois,
  normal de toute facon) - ne reste generique et reutilisable que ce qui
  ne depend d'aucun site : saut d'intro/detection de fin bases sur les
  evenements natifs de n'importe quelle balise `<video>`, panneau,
  sauvegarde/import. Fonctionnerait alors sur n'importe quel site avec
  une vraie balise video (y compris des plateformes legales).
- **Installeur** : option retenue parmi 3 - "petit installeur" (pas une
  vraie extension packagee, pas une appli Electron). Techniquement : un
  executable qui ouvre la page Tampermonkey du Chrome Web Store si
  l'extension n'est pas deja presente (l'installation silencieuse d'une
  extension par un programme externe est bloquee par Chrome pour des
  raisons de securite - un clic "Ajouter a Chrome" reste incompressible),
  puis ouvre le fichier `.user.js` en local pour que Tampermonkey affiche
  sa propre fenetre de confirmation d'installation automatiquement.
  Effort estime : quelques heures, pas des jours/semaines.

**Decision de l'utilisateur pour cloturer la session** : reecriture en
tracker generique validee comme prochaine direction, mais **pas
commencee maintenant**. L'utilisateur va d'abord utiliser le v6 actuel
(esprit-donghua/animoflix/anime-sama) pendant plusieurs jours en usage
reel pour s'assurer qu'il n'y a plus de bug bloquant avant de lancer ce
nouveau chantier.

**Etat du depot a la pause** : `esprit-donghua-suivi-progression-v6.user.js`
a jour avec tous les correctifs ci-dessus (filtre par site,
`recoverIfPaused` a 350ms, cadence sibnet ralentie, `matchesUrl` elargi).
`esprit-donghua-suivi-progression-v4.user.js` reste intact sur le disque,
desactive dans Tampermonkey. **Prochaine session** : si l'utilisateur
confirme plusieurs jours stables, demarrer la reecriture generique
(nouveau fichier, garder v6 intact comme reference/filet de secours -
meme principe que v4 garde intact au moment de creer v6).

### 2026-09-25

- **Signalement utilisateur** : l'episode ne se chargeait plus du tout sur
  Chrome (script "AnimeTracker v6" - nom affiche dans les logs console,
  a jour par rapport au nom de fichier `esprit-donghua-suivi-progression-v6`),
  alors que la lecture fonctionnait sur un autre navigateur.
- **Diagnostic fait via captures d'ecran de la console DevTools** (pas
  d'acces direct au navigateur de l'utilisateur) :
  1. Bruit habituel `ERR_BLOCKED_BY_CLIENT` sur
     `watchman.na-backend.odysee.com/reports/playback` ecarte d'emblee
     (deja documente comme harmless, cf. session du 2026-09-15).
  2. Filtre console sur `esprit` : confirme que le script demarre bien
     (`[AnimeTracker v6] script demarre sur Esprit Donghua`) et emet bien
     la demande de lecture avec l'URL d'embed Odysee resolue
     (`[AnimeTracker v6] demande de lecture (esprit-donghua) : .../$/embed/...`)
     - silence total apres cette ligne, aucun statut de chargement/erreur
     suivant.
  3. **Cause trouvee en inspectant le selecteur de frame de la Console** :
     le cadre nomme `odysee-iframe` etait reste a **`about:blank`** - la
     vraie iframe Odysee n'avait jamais fini de charger l'URL d'embed
     demandee. Le meme menu listait **uBlock Origin Lite** comme extension
     active sur ce Chrome.
  4. **Confirme par l'utilisateur** : baisser d'un cran le niveau de
     blocage d'uBlock Origin Lite a resolu le probleme immediatement -
     l'iframe Odysee se charge et la lecture reprend.
- **Conclusion** : ce n'est pas un bug du script v6 - un niveau de blocage
  uBlock Origin Lite trop agressif sur ce profil Chrome bloquait le
  chargement de l'iframe d'embed Odysee elle-meme (au-dela du simple bruit
  `watchman/reports/playback` deja connu et sans consequence). A garder en
  tete pour un futur "l'episode ne charge pas" : verifier en priorite
  l'URL du cadre `odysee-iframe` dans le selecteur de frame de la Console
  (si `about:blank`, suspecter un bloqueur de contenu cote navigateur
  avant de chercher un bug cote script) et le niveau de blocage d'uBlock
  Origin Lite si present.

## Demarrage du chantier "tracker generique" (2026-09-25)

L'utilisateur confirme demarrer la reecriture generique actee le 21/09
(voir plus haut "Nouvelle direction actee"), 4 jours apres la mise en
pause du v6 - pas de bug bloquant reste rencontre depuis (seul incident,
le meme jour, etait un faux positif : uBlock Origin Lite, cf. section
precedente).

**Fichier cree** : `anime-tracker-generique.user.js` (v1.0), independant
sur le disque de `esprit-donghua-suivi-progression-v6.user.js` (v6 reste
intact, desactive dans Tampermonkey le temps de valider le nouveau
script - meme principe que v4 garde intact au moment de creer v6).

**Implementation v1.0**, conforme aux decisions du 21/09 :
- `@match *://*/*` - tourne sur n'importe quel site, mais reste discret :
  n'active le suivi video (saut d'intro, detection d'outro/fin) que si une
  vraie balise `<video>` apparait sur la page (observee via
  `MutationObserver` + minuteur de secours ~8s, pas de polling infini).
  Bouton "Masquer sur ce site" par domaine (`GM_setValue('hiddenDomains', ...)`)
  pour les sites ou le panneau ne sert a rien, reactivable via le menu
  Tampermonkey "réafficher sur ce site".
- **Reconnaissance de serie generique** : `findMatchingTrackedSeries()`
  compare le titre d'onglet (normalise : minuscules, accents retires via
  NFD + filtrage des marques combinantes par plage de code point, pas de
  regex sur des caracteres combinants ecrits en dur - plus robuste/lisible)
  aux titres AniList (romaji/anglais/natif) de toutes les series suivies
  actives - pas de selecteur DOM ni de structure de page specifique a un
  site. Association initiale manuelle via une recherche AniList
  (`anilistSearch()`, API publique `graphql.anilist.co`, `@connect` dedie).
- **Numero d'episode devine par regex sur le titre d'onglet**
  (`guessEpisodeNumber()`) : plusieurs motifs essayes dans l'ordre
  (`S2E12`, "Episode 12"/"Épisode 12", "Ep. 12", "E12", "- 12 VOSTFR") -
  toujours editable a la main dans le panneau (champ numerique) avant
  d'enregistrer.
- **Pas de clic automatique sur "lecture"** et **pas de navigation
  automatique vers l'episode suivant** (aucune notion fiable d'URL
  "suivant" generique) - la progression se sauvegarde automatiquement a
  la fin reelle de la video (`ended`) ou au "Debut outro" configure par
  serie, mais l'utilisateur navigue lui-meme vers l'episode suivant.
- **Nouveaux episodes** : `checkForNewEpisodes()` interroge AniList par
  lot (`id_in`) pour `nextAiringEpisode`/`episodes` total de toutes les
  series suivies, plafonne a une fois par heure (`atg_lastNewEpisodeCheck`),
  comparee au dernier episode enregistre pour afficher un point "●" dans
  la liste du panneau.
- **Sauvegarde** : meme mecanisme que v6 (fichier lie via
  `showSaveFilePicker`/`unsafeWindow`, handle persiste dans IndexedDB,
  repli sur telechargement classique si non configure/non supporte,
  auto-export quotidien, bloc JSON cache pour reimport fidele). Format de
  donnees different de v4/v6 (cle par `anilistId` au lieu de
  `site::seriesUrl`) - **l'import ne relit que le format de CE script**,
  pas les anciens exports v4/v6 (limitation assumee, les deux systemes de
  suivi sont independants).
- Stockage par serie sous la cle `tracked::<anilistId>`, enumere via
  `GM_listValues()` (pas d'index separe a maintenir).

`node --check` OK. **RIEN n'a ete teste dans un vrai navigateur** - a
faire en priorite a la reprise, dans cet ordre :
1. Charger le script dans Tampermonkey (`anime-tracker-generique.user.js`),
   DESACTIVER v6 le temps du test (evite un double panneau sur
   esprit-donghua.xyz/animoflix.to/anime-sama.to).
2. Tester la recherche/association AniList (bouton "Associer cette page
   à une série…") sur un episode en cours de visionnage.
3. Verifier que `findMatchingTrackedSeries()` reconnait bien la serie sur
   une AUTRE page du meme site sans reassociation manuelle (rechargement
   de page, episode suivant).
4. Verifier la devinette du numero d'episode sur les vrais titres d'onglet
   des 3 sites deja connus (`esprit-donghua.xyz`, `animoflix.to`,
   `anime-sama.to`) et idealement un 4e site jamais teste, pour valider la
   genericite.
5. Verifier saut d'intro / sauvegarde a la fin (`ended`)/outro sur une
   vraie balise `<video>` (celle du lecteur natif du site, pas une iframe
   cross-origin - cas non gere volontairement, cf. commentaire d'en-tete).
6. Verifier "Choisir fichier sauvegarde" (piege deja connu : necessite
   `unsafeWindow`, pas `window`, sous peine d'`Illegal invocation` - deja
   applique ici mais jamais teste dans ce nouveau fichier).
7. Verifier "Vérifier nouveaux épisodes" et l'affichage du point "●".

## 2026-09-26 - Git initialise + retour sur v6 (rattrapage du journal, ecrit le 2026-09-27)

**Note sur ce rattrapage** : les 6 commits ci-dessous ont ete faits le 26/09 mais
n'avaient jamais ete consignes ici - reconstitue le 27/09 a partir des messages de
commit et des diffs (tous suffisamment detailles pour ca). Le chantier "tracker
generique" (`anime-tracker-generique.user.js`, section precedente) reste EXACTEMENT
ou il etait - toujours v1.0, toujours jamais teste dans un vrai navigateur. Toute
cette journee a plutot continue `esprit-donghua-suivi-progression-v6.user.js`
(v6.1 -> v6.5), qui reste le script "reel" utilise au quotidien.

**Git initialise pour la premiere fois sur ce projet** (`043df06`, 06:00) - jusque
la, seul ce fichier HISTORIQUE.md servait de suivi, aucun depot. Remote GitHub cree :
`https://github.com/Tryne-graphik/Vid-os-continuum`. Le premier commit visait encore
`esprit-donghua-tracker` comme nom de repo dans `@updateURL`/`@downloadURL` -
corrige 16 minutes plus tard (`2c7ec5a`, v6 inchangee cote fonctionnel) une fois le
repo reellement cree sous le nom `Vid-os-continuum`.

**v6.2** (`06ce6f4`) : vrai bug corrige - le bouton "Ouvrir sur Odysee" n'existait
que dans `#ep-panel` (visible seulement sur une page SANS lecteur actif, ex. accueil),
jamais dans le calque plein ecran (topbar, IDs `ed-*`) qui passe par-dessus et cache
`#ep-panel` des qu'un episode est lance - donc invisible en usage reel. Ajoute aussi
au topbar.

**v6.3** (`1432f56`) : renommage visuel du panneau. Le calque plein ecran affiche
maintenant "Video Continuum" + le numero de version (lu dynamiquement via
`GM_info.script.version`) au-dessus du nom de la serie, meme traitement que
`#ep-panel` deja fait avant. Premier signe visible dans le code du renommage du
projet (`@name` du script est deja "Anime Tracker Continuum (v6)" depuis le tout
premier commit git - le renommage a donc eu lieu avant l'init de git, pas trace).

**v6.4** (`e72555d`) : **lecteur YouTube de secours, par episode**. Depannage
manuel quand l'hebergeur habituel (Odysee/Sibnet) d'un episode precis est
casse/bloque (exemple cite : chaine officielle Tencent Video pour Wan Jie Du Zun) -
l'utilisateur colle un lien YouTube (`youtube.com/watch?v=...`, `youtu.be/...` ou
`.../embed/...`, extrait via regex sur les 11 caracteres de l'ID video), stocke par
`site+serie+numero d'episode` (`youtubeOverrides` via `GM_setValue`), applique dans
`applyLoadedEpisode()` a la place de l'embed habituel. **Volontairement degrade** :
pas de saut intro/outro ni d'enchainement automatique sur cette source, puisque
YouTube n'est pas pilote par le second script injecte dans l'iframe (contrairement
a Odysee/Sibnet) - juste un repli pour pouvoir regarder quand meme. UI ajoutee aux
DEUX panneaux (topbar ET `#ep-panel`) directement cette fois, lecon retenue du
bouton Odysee (v6.2) qui n'avait ete ajoute qu'a un seul au depart.

**v6.5** (`c8cb739`) : **playlist YouTube automatique par chaine associee**,
complement du lien manuel v6.4. Association unique (prompt) d'une chaine YouTube +
un mot-cle a la serie, puis construction/mise en cache d'une playlist triee par
numero d'episode (dernier nombre trouve dans le titre - marche aussi bien sur
"EP326" que "Episode 326") via l'API YouTube Data v3 (`playlistItems.list`,
1 unite/page de 50, largement sous le quota gratuit journalier). Bouton "Trouver
sur YouTube (chaine associee)" cherche l'episode courant dans la playlist en cache
et applique le lien automatiquement - plus besoin de copier-coller un lien a
chaque episode comme avec v6.4. Necessite une cle API YouTube gratuite,
configurable via un nouveau menu Tampermonkey "Configurer la cle API YouTube".
Ajoute aux deux panneaux comme v6.4.

**Etat a la reprise (2026-09-27)** : `node --check` relance sur le fichier actuel,
vert. **Aucune des fonctionnalites YouTube (v6.4/v6.5) n'a ete
testee dans un vrai navigateur** - ni le lien manuel, ni l'association de chaine,
ni la resolution de playlist, ni la configuration de la cle API par le menu
Tampermonkey. Le bouton Odysee (v6.2) et le titre "Video Continuum" (v6.3) sont de
simples changements d'UI, risque de regression faible mais non plus verifie en
navigateur reel depuis.
