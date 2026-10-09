// ==UserScript==
// @name         Anime Tracker Continuum (v6)
// @namespace    esprit-donghua-tracker-v6
// @version      6.42
// @description  Suite de esprit-donghua-suivi-progression-v4 (v4 restait limite a esprit-donghua.xyz/Odysee) : meme principe (calque plein ecran, jamais recharge, iframe du lecteur natif pilotee par un second script injecte) mais etendu a 4 familles de sites - esprit-donghua.xyz (Odysee), animoflix.to (video.sibnet.ru), anime-sama.to (video.sibnet.ru) et odysee.com en navigation directe (playlist reconstruite via l'API publique Odysee) - avec UNE seule liste de suivi, groupee par site. Script independant de v4 (storage isole) : le fichier v4.36 reste intact sur le disque mais doit etre DESACTIVE dans Tampermonkey pour eviter un doublon de calque sur esprit-donghua.xyz.
// @match        https://esprit-donghua.xyz/*
// @match        https://odysee.com/*
// @match        https://animoflix.to/*
// @match        https://anime-sama.to/*
// @match        https://video.sibnet.ru/*
// @match        https://ansembed.net/*
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      esprit-donghua.xyz
// @connect      animoflix.to
// @connect      anime-sama.to
// @connect      api.na-backend.odysee.com
// @connect      odysee.com
// @connect      www.googleapis.com
// @connect      www.youtube.com
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @connect      graphql.anilist.co
// @connect      api.aniskip.com
// @updateURL    https://raw.githubusercontent.com/Tryne-graphik/Vid-os-continuum/master/esprit-donghua-suivi-progression-v6.user.js
// @downloadURL  https://raw.githubusercontent.com/Tryne-graphik/Vid-os-continuum/master/esprit-donghua-suivi-progression-v6.user.js
// ==/UserScript==

// CONTEXTE (2026-09-21) : v4 (esprit-donghua-suivi-progression-v4.user.js,
// reste intact et INDEPENDANT sur le disque) gere esprit-donghua.xyz/Odysee.
// Ce script (v6) reprend son architecture qui a fait ses preuves (calque
// plein ecran jamais recree + second script injecte DANS l'iframe du
// lecteur natif pour piloter la vraie balise <video>) et la generalise a
// 3 "sites" par un systeme d'adaptateurs (SITES ci-dessous), chacun sachant
// juste extraire depuis sa page : nom de serie, numero d'episode, URL
// d'embed du lecteur, et comment passer a l'episode suivant/precedent.
//
// Differences structurelles trouvees en etudiant les 2 nouveaux sites
// (recherche HTML brute, pas encore de test en navigateur reel) :
//  - animoflix.to : une vraie page par episode (comme esprit-donghua),
//    liens suivant/precedent en HTML (`a.ep-nav-btn.next-btn` /
//    `a.ep-nav-btn[aria-label="Episode precedent"]`). Mais 2-3 hebergeurs
//    video au choix par episode (video.sibnet.ru, ansembed.net, parfois
//    sendvid.com) exposes dans un <select id="epLecteurSelect"> - ce
//    script v1 ne gere QUE video.sibnet.ru (demande explicite de
//    l'utilisateur), ignore les episodes qui n'y sont pas disponibles.
//  - anime-sama.to : PAS de page par episode - une seule page par
//    saison/langue, avec un tableau JS (eps1/eps2/eps3...) listant les URLs
//    de TOUS les episodes de la saison pour chaque "lecteur". Changer
//    d'episode = changer d'index dans ce tableau (deja charge, aucune
//    requete reseau necessaire pour avancer), pas une vraie navigation de
//    page. Consequence : pas d'URL par episode a stocker - ce script
//    construit sa propre URL de reprise avec un suffixe `#ep=N` (ignore par
//    le site, relu par nous au chargement pour rouvrir directement cet
//    episode).
//  - video.sibnet.ru : lecteur Video.js standard (contrairement au lecteur
//    React maison d'Odysee) - la balise <video> existe DEJA dans le HTML
//    au chargement (pas seulement apres un clic comme sur Odysee), mais la
//    lecture ne demarre pas seule (`autoplay:false`) : il faut quand meme
//    simuler un clic sur le gros bouton central `.vjs-big-play-button`.
//    Piege trouve en concevant ce script (pas encore teste) : la boucle de
//    clic automatique de v4 s'arretait des que la balise <video> EXISTE
//    (videoFound) - correct pour Odysee (le clic LA fait apparaitre), mais
//    faux ici puisque la balise existe direct et la lecture n'a toujours
//    pas demarre. Corrige en arretant la boucle sur l'evenement `play` de
//    la video (playbackStarted) plutot que sur sa simple existence dans le
//    DOM - voir runInsidePlayerFrameGeneric().
//  - (v6.33 : choix auto de la qualite Odysee supprime - refuse sans compte.)
//
// RIEN DE TOUT CA N'A ENCORE ETE TESTE DANS UN VRAI NAVIGATEUR - attendu
// vu l'ampleur du changement (cf. historique de v4 : chaque nouvelle
// version a toujours demande au moins un aller-retour de bugs en usage
// reel avant de fonctionner).
//
// AJOUT (2026-09-26) : navigation directe sur odysee.com (SITE_ODYSEE,
// voir plus bas). Motivation utilisateur : certains donghua ne sont
// suivables QUE sur Odysee, mais la liste des videos d'une chaine Odysee
// est triee par date de mise en ligne, pas par episode, et une chaine
// mélange souvent plusieurs series - aucune notion fiable de "suivant" a
// lire dans la page elle-meme (contrairement aux 3 autres sites). Solution :
// reconstruire notre propre playlist ordonnee via l'API publique Odysee
// (claim_search sur la chaine, sans authentification), triee par numero
// d'episode devine dans le TITRE de chaque video (seule source fiable -
// verifie en usage reel : la recherche du site lui-meme ne retrouve meme
// pas toujours des videos pourtant bien hebergees, et le champ metadonnee
// "languages" de l'API reste a 'en' meme pour du contenu vostfr). Meme
// principe que anime-sama (navStyle 'index'), mais generalise pour
// supporter les trous dans la numerotation (une chaine donnee ne detient
// pas forcement TOUS les episodes d'une serie - voir episodeNumbersByIndex/
// resumeUrlsByIndex plus bas, qui remplacent l'hypothese "numero = index+1"
// valable uniquement pour anime-sama).
// Filet de securite demande explicitement par l'utilisateur : seules les
// videos dont le titre contient "vostfr" sont retenues dans la playlist -
// certains reposts se presentent comme "multi-traduction" mais sont en
// realite un sous-titrage automatique (Google Trad) de mauvaise qualite.
// Limite assumee : la playlist ne couvre que le contenu de LA CHAINE
// suivie (pas de recherche inter-chaines pour combler un trou), pour ne
// pas multiplier le risque de tomber sur une de ces mauvaises versions.
// Egalement ajoute : bouton "Ouvrir sur Odysee" cote SITE_ESPRIT_DONGHUA,
// qui ouvre la page Odysee correspondante dans un nouvel onglet et
// transfere les reglages intro/outro actuels (voir pendingIntroOutroTransfer)
// pour ne pas avoir a les re-regler la-bas.

(function () {
    'use strict';

    const isTopFrame = (window.top === window.self);
    const PLAYER_ORIGIN_ODYSEE = 'https://odysee.com';
    const PLAYER_ORIGIN_SIBNET = 'https://video.sibnet.ru';
    const PLAYER_ORIGIN_ANSEMBED = 'https://ansembed.net';
    const MSG_PREFIX = 'anime-tracker-v6-';
    const PLAYER_FRAME_NAME = 'continuum-player';

    // ================= Contexte : DANS l'iframe du lecteur =================
    if (!isTopFrame) {
        // Seulement dans NOTRE iframe (nommee dans buildOverlay) : anime-sama
        // charge desormais lui-meme ansembed dans #playerDF, et le clic
        // automatique y lancait une 2e lecture en arriere-plan (v6.13).
        if (window.name !== PLAYER_FRAME_NAME) return;
        if (location.hostname.indexOf('odysee.com') !== -1) { runInsidePlayerFrame_odysee(); return; }
        if (location.hostname.indexOf('sibnet.ru') !== -1) { runInsidePlayerFrame_sibnet(); return; }
        if (location.hostname.indexOf('ansembed.net') !== -1) { runInsidePlayerFrame_ansembed(); return; }
        if (/(^|\.)youtube(-nocookie)?\.com$/.test(location.hostname)) { runInsidePlayerFrame_youtube(); return; }
        // Autre hebergeur (ex. lecteur 2 d'animoflix) : pilote generique,
        // possible depuis @match *://*/* (v6.21). Marche si la <video> est
        // dans cette page ; sinon le calque passe au lecteur suivant.
        runInsidePlayerFrameGeneric({
            label: location.hostname,
            playSelectors: ['.jw-icon-display', '.vjs-big-play-button', '.plyr__control--overlaid', 'button[aria-label="Play"]', 'button[aria-label="Lecture"]']
        });
        return;
    }

    // ================= Generique : lecteur video (DANS l'iframe) =================
    //
    // Partage par Odysee et Sibnet - seules les differences reelles entre
    // les deux (selecteurs du bouton lecture, presence ou non d'un menu de
    // qualite) sont passees en parametre (cfg).
    function runInsidePlayerFrameGeneric(cfg) {
        console.log('[AnimeTracker v6] (' + cfg.label + ') script demarre');

        let config = null;
        let outroSignalSent = false;
        let playbackStarted = false; // evenement 'play' reel, PAS juste "la balise <video> existe" (faux sur sibnet, ou elle existe des le depart)

        function findVideo() { return document.querySelector('video'); }

        // Souris dans le lecteur : la page affiche ses boutons Prec./Suiv. (v6.38).
        let lastActivityPost = 0;
        const postActivity = () => {
            const now = Date.now();
            if (now - lastActivityPost < 400) return;
            lastActivityPost = now;
            window.parent.postMessage({ type: MSG_PREFIX + 'activity' }, '*');
        };
        document.addEventListener('mousemove', postActivity, true);
        document.addEventListener('touchstart', postActivity, true);

        function waitForVideo(callback) {
            const existing = findVideo();
            if (existing) { callback(existing); return; }
            const observer = new MutationObserver(() => {
                const v = findVideo();
                if (v) { observer.disconnect(); callback(v); }
            });
            observer.observe(document.documentElement, { childList: true, subtree: true });
        }

        // cfg.autoClickIntervalMs/MaxAttempts sont parametrables par
        // hebergeur (voir appelants) : sibnet passe par un plugin de pub
        // VAST avant la vraie video (adCancelTimeout 10s, responseTimeout
        // 20s dans sa propre config, vus dans son HTML) - si la requete de
        // pub est bloquee par un bloqueur de pub, le plugin peut rester
        // "en attente" un moment avant de laisser passer le contenu.
        // Recliquer toutes les 500ms (valeur d'origine, pensee pour
        // Odysee qui n'a pas cette etape) risquait d'interrompre/relancer
        // cette sequence pub-puis-video au lieu de la laisser aboutir -
        // constate en usage reel le 2026-09-21 (lecteur sibnet reste
        // bloque indefiniment sur "Video indisponible ? Changez de
        // lecteur" avec un blocage de pub actif). Sibnet reclique donc
        // moins souvent et attend plus longtemps avant d'abandonner.
        let autoClickAttempts = 0;
        const intervalMs = cfg.autoClickIntervalMs || 500;
        const maxAttempts = cfg.autoClickMaxAttempts || 20;
        const autoClickInterval = setInterval(() => {
            if (playbackStarted || autoClickAttempts > maxAttempts) { clearInterval(autoClickInterval); return; }
            autoClickAttempts++;
            for (let i = 0; i < cfg.playSelectors.length; i++) {
                const btn = document.querySelector(cfg.playSelectors[i]);
                if (btn) {
                    btn.click();
                    console.log('[AnimeTracker v6] (' + cfg.label + ') clic automatique sur le bouton lecture (' + cfg.playSelectors[i] + '), tentative ' + autoClickAttempts + '/' + maxAttempts);
                    return;
                }
            }
        }, intervalMs);

        const reloadWatchdogMs = cfg.reloadWatchdogMs || 10000;
        setTimeout(() => {
            if (playbackStarted) return;
            const reloadKey = 'anime-tracker-reload-' + location.href;
            if (sessionStorage.getItem(reloadKey)) {
                console.log('[AnimeTracker v6] (' + cfg.label + ') video toujours non demarree apres rechargement, abandon');
                window.parent.postMessage({ type: MSG_PREFIX + 'load-status', stage: 'echec' }, '*');
                return;
            }
            sessionStorage.setItem(reloadKey, '1');
            console.log('[AnimeTracker v6] (' + cfg.label + ') video non demarree apres ' + Math.round(reloadWatchdogMs / 1000) + 's, rechargement automatique');
            location.reload();
        }, reloadWatchdogMs);

        // Reprise en cours d'episode (v6.13) : une seule fois par chargement
        // du lecteur - la config est renvoyee a chaque reaffichage du calque
        // et ne doit pas faire reculer la lecture.
        let resumeApplied = false;
        function applyResumeIfNeeded(video) {
            if (resumeApplied || !config || !config.resumeAt) return;
            resumeApplied = true;
            if (video.currentTime >= config.resumeAt) return;
            video.currentTime = config.resumeAt;
            console.log('[AnimeTracker v6] (' + cfg.label + ') reprise a ' + Math.round(config.resumeAt) + 's');
        }

        function applyIntroSkipIfNeeded(video) {
            applyResumeIfNeeded(video);
            // introStart > 0 (resume avant le generique) : gere au fil de la
            // lecture par le timeupdate plus bas, pas au demarrage.
            if (!config || !config.introEnd || config.introStart) return;
            if (video.currentTime < config.introEnd) {
                video.currentTime = config.introEnd;
                const p = video.play();
                if (p && p.catch) p.catch(() => {});
                console.log('[AnimeTracker v6] (' + cfg.label + ') intro sautee, demarrage a ' + config.introEnd + 's');
            }
        }

        let autoUnmuteAttempted = false;
        function tryAutoUnmute(video, force) {
            if (autoUnmuteAttempted && !force) return;
            autoUnmuteAttempted = true;
            let recovered = false;
            function recoverIfPaused() {
                if (recovered || !video.paused) return;
                recovered = true;
                try { video.muted = true; } catch (e) {}
                const p = video.play();
                if (p && p.catch) p.catch(() => {});
            }
            video.addEventListener('pause', recoverIfPaused);
            try { video.muted = false; } catch (e) {}
            // Fenetre de surveillance courte (pas 1.5s) : Chrome met la
            // video en pause QUASI INSTANTANEMENT quand il refuse le son
            // suite a `muted = false` sans geste utilisateur reel - une
            // fenetre longue finissait par avaler une vraie pause
            // volontaire de l'utilisateur a la place (constate sur sibnet
            // 2026-09-21 : "la video ne garde pas la pause", plus visible
            // ici que sur Odysee car le son met plus de temps a passer sur
            // sibnet, donc cette fonction est rappelee plus souvent, a
            // chaque vrai clic tant que la video reste muette).
            setTimeout(() => {
                recoverIfPaused();
                video.removeEventListener('pause', recoverIfPaused);
            }, 350);
        }

        let lastRealUnmuteAttempt = 0;
        document.addEventListener('click', (e) => {
            if (!e.isTrusted) return;
            const video = findVideo();
            if (!video || !video.muted) return;
            const now = Date.now();
            if (now - lastRealUnmuteAttempt < 1000) return;
            lastRealUnmuteAttempt = now;
            tryAutoUnmute(video, true);
        }, true);

        waitForVideo((video) => {
            console.log('[AnimeTracker v6] (' + cfg.label + ') element video trouve');
            video.addEventListener('play', () => { playbackStarted = true; }, { once: true });

            window.parent.postMessage({ type: MSG_PREFIX + 'ready' }, '*');
            window.parent.postMessage({ type: MSG_PREFIX + 'load-status', stage: 'video-trouvee' }, '*');

            if (config) applyIntroSkipIfNeeded(video);
            tryAutoUnmute(video);

            function reportMuteState() {
                window.parent.postMessage({ type: MSG_PREFIX + 'mute-state', muted: video.muted }, '*');
            }
            reportMuteState();
            video.addEventListener('volumechange', reportMuteState);

            video.addEventListener('progress', () => {
                if (video.duration && isFinite(video.duration) && video.buffered.length > 0) {
                    const bufferedEnd = video.buffered.end(video.buffered.length - 1);
                    const pct = Math.min(100, Math.round((bufferedEnd / video.duration) * 100));
                    window.parent.postMessage({ type: MSG_PREFIX + 'load-status', stage: 'buffering', pct: pct }, '*');
                }
            });
            video.addEventListener('canplay', () => {
                window.parent.postMessage({ type: MSG_PREFIX + 'load-status', stage: 'pret' }, '*');
            }, { once: true });

            let lastPositionPost = 0;
            video.addEventListener('timeupdate', () => {
                const now = Date.now();
                if (now - lastPositionPost > 5000) {
                    lastPositionPost = now;
                    window.parent.postMessage({ type: MSG_PREFIX + 'position', t: video.currentTime, d: video.duration }, '*');
                }
            });
            // Plages intro/outro (v6.15) : chacune sautee une seule fois par
            // episode, pour pouvoir revenir en arriere volontairement.
            let introRangeSkipped = false, outroRangeSkipped = false;
            video.addEventListener('timeupdate', () => {
                if (!config) return;
                const t = video.currentTime;
                if (!introRangeSkipped && config.introStart && config.introEnd > config.introStart &&
                    t >= config.introStart && t < config.introEnd) {
                    introRangeSkipped = true;
                    video.currentTime = config.introEnd;
                    console.log('[AnimeTracker v6] (' + cfg.label + ') intro sautee ' + config.introStart + 's -> ' + config.introEnd + 's');
                }
                // Fin d'outro renseignee : l'episode continue apres le
                // generique (ex. Bleach) - on saute le generique et on laisse
                // 'ended' declencher l'episode suivant.
                if (!outroRangeSkipped && config.outroStart && config.outroEnd > config.outroStart &&
                    t >= config.outroStart && t < config.outroEnd) {
                    outroRangeSkipped = true;
                    video.currentTime = config.outroEnd;
                    console.log('[AnimeTracker v6] (' + cfg.label + ') outro sautee ' + config.outroStart + 's -> ' + config.outroEnd + 's');
                }
            });
            // v6.31 : decompte affiche AVANT la coupure. Outro reglee (debut seul) :
            // signal 4 s avant, enchainement 2 s apres son debut (remaining = 6 s).
            // Sinon (pas d'outro, ou outro sautee en plage) : 4 dernieres secondes.
            video.addEventListener('timeupdate', () => {
                if (!config || outroSignalSent) return;
                const t = video.currentTime;
                if (config.outroStart && !(config.outroEnd > config.outroStart)) {
                    if (t >= config.outroStart - 4) {
                        outroSignalSent = true;
                        window.parent.postMessage({ type: MSG_PREFIX + 'outro-reached', remaining: config.outroStart + 2 - t }, '*');
                    }
                } else if (isFinite(video.duration) && video.duration > 30 && t >= video.duration - 4) {
                    outroSignalSent = true;
                    window.parent.postMessage({ type: MSG_PREFIX + 'near-end', remaining: video.duration - t }, '*');
                }
            });
            // Lecture qui cale (v6.26) : position figee ET donnees insuffisantes
            // pendant 15 s alors que la lecture avait demarre (une vraie pause
            // de l'utilisateur garde readyState >= 3). Cas reel : fichiers MP4
            // bruts mal prepares sur certaines chaines Odysee (index en fin de
            // fichier, ~8 Mbit/s) - le navigateur n'arrive pas a les lire.
            let stallLastT = -1, stallFor = 0, stallSent = false;
            setInterval(() => {
                if (!playbackStarted || video.ended) return;
                const frozen = Math.abs(video.currentTime - stallLastT) < 0.2 && video.readyState < 3;
                stallLastT = video.currentTime;
                if (!frozen) {
                    if (stallSent) window.parent.postMessage({ type: MSG_PREFIX + 'load-status', stage: 'stall-fini' }, '*');
                    stallSent = false; stallFor = 0; return;
                }
                if (++stallFor >= 15 && !stallSent) {
                    stallSent = true;
                    console.log('[AnimeTracker v6] (' + cfg.label + ') lecture bloquee depuis 15 s a ' + Math.round(video.currentTime) + 's');
                    window.parent.postMessage({ type: MSG_PREFIX + 'load-status', stage: 'stall', direct: !/^blob:/.test(video.currentSrc || '') }, '*');
                }
            }, 1000);

            video.addEventListener('ended', () => {
                if (outroSignalSent) return;
                outroSignalSent = true;
                window.parent.postMessage({ type: MSG_PREFIX + 'ended' }, '*');
            });
        });

        window.addEventListener('message', (event) => {
            if (!event.data || typeof event.data.type !== 'string' || event.data.type.indexOf(MSG_PREFIX) !== 0) return;
            const type = event.data.type.slice(MSG_PREFIX.length);

            if (type === 'config') {
                config = event.data;
                outroSignalSent = false;
                const video = findVideo();
                if (video) applyIntroSkipIfNeeded(video);
                if (video) tryAutoUnmute(video);
            }
            if (type === 'pause') {
                const video = findVideo();
                if (video) video.pause();
            }
            if (type === 'play') {
                const video = findVideo();
                if (video) {
                    const p = video.play();
                    if (p && p.catch) p.catch(() => {});
                }
            }
        });
    }

    function runInsidePlayerFrame_odysee() {
        runInsidePlayerFrameGeneric({
            label: 'Odysee',
            playSelectors: ['button.button--play', '.button--play', 'button[aria-label="Jouer "]', 'button[aria-label="Jouer"]', 'button[aria-label="Play"]'],
        });
    }

    function runInsidePlayerFrame_sibnet() {
        runInsidePlayerFrameGeneric({
            label: 'Sibnet',
            playSelectors: ['.vjs-big-play-button', 'button.vjs-big-play-button'],
            // Cadence plus lente/plus longue qu'Odysee (defauts 500ms/20
            // tentatives) - sibnet passe par un plugin de pub VAST avant la
            // video (adCancelTimeout 10s, responseTimeout 20s cote site),
            // qu'un reclic trop frequent risque d'interrompre au lieu de le
            // laisser aboutir (cf. commentaire dans runInsidePlayerFrameGeneric).
            autoClickIntervalMs: 2000,
            autoClickMaxAttempts: 15, // ~30s
            reloadWatchdogMs: 30000
        });
    }

    // anime-sama (2026-10-01) : sibnet renvoie 403 meme dans le lecteur du
    // site lui-meme ; le lecteur par defaut du site est desormais ansembed.net
    // (JW Player, vraie balise <video> dans le meme document - clic sur
    // .jw-icon-display + seek verifies en vrai navigateur).
    // YouTube (v6.27) : pilote generique + sous-titres en francais - piste FR
    // si elle existe, sinon traduction automatique YouTube de la 1re piste
    // (anglais de preference). API du lecteur (#movie_player) lue cote page.
    function runInsidePlayerFrame_youtube() {
        runInsidePlayerFrameGeneric({ label: 'YouTube', playSelectors: ['.ytp-large-play-button'] });
        const doc = (typeof unsafeWindow !== 'undefined' && unsafeWindow.document) || document;
        // "Plus de videos" (bas du lecteur) masquait le bouton des reglages (v6.37).
        const hideCss = doc.createElement('style');
        hideCss.textContent = '.fullscreen-watch-next-entrypoint-wrapper,.ytp-pause-overlay{display:none!important}';
        (doc.head || doc.documentElement).appendChild(hideCss);
        let tries = 0;
        const timer = setInterval(() => {
            if (++tries > 40) { clearInterval(timer); return; }
            const p = doc.getElementById('movie_player');
            if (!p || typeof p.getOption !== 'function') return;
            try { if (p.loadModule) p.loadModule('captions'); } catch (e) {}
            let list = [];
            try { list = p.getOption('captions', 'tracklist') || []; } catch (e) {}
            if (!list.length) return;
            const fr = list.find((x) => x.languageCode === 'fr');
            const src = fr || list.find((x) => /^en/.test(x.languageCode)) || list[0];
            try {
                p.setOption('captions', 'track', fr ? { languageCode: 'fr' } : { languageCode: src.languageCode, translationLanguage: { languageCode: 'fr', languageName: 'Francais' } });
                clearInterval(timer);
                console.log('[AnimeTracker v6] (YouTube) sous-titres en francais' + (fr ? '' : ' (traduction automatique depuis ' + src.languageCode + ')'));
            } catch (e) {}
        }, 1000);
    }

    function runInsidePlayerFrame_ansembed() {
        runInsidePlayerFrameGeneric({
            label: 'Ansembed',
            playSelectors: ['.jw-icon-display', '.jw-display-icon-display']
        });
    }

    // ================= Reseau =================

    function gmRequest(details) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest(Object.assign({}, details, { onload: resolve, onerror: reject, ontimeout: reject }));
        });
    }

    function fetchPageHtml(url, retriesLeft) {
        if (retriesLeft === undefined) retriesLeft = 1;
        // Meme site que la page : fetch() du navigateur, pas besoin d'@connect
        // (sites ajoutes par l'utilisateur, inconnus a l'avance - v6.23).
        let sameOrigin = false;
        try { sameOrigin = new URL(url, location.href).origin === location.origin; } catch (e) {}
        const req = sameOrigin
            ? fetch(url, { credentials: 'include' }).then((r) => r.text().then((t) => ({ status: r.status, responseText: t })))
            : gmRequest({ method: 'GET', url: url });
        return req.then((res) => {
            if (res.status >= 200 && res.status < 300) return res.responseText;
            if (res.status >= 500 && res.status < 600 && retriesLeft > 0) {
                return new Promise((resolve) => setTimeout(resolve, 1000)).then(() => fetchPageHtml(url, retriesLeft - 1));
            }
            throw new Error('Chargement de la page echoue, statut ' + res.status);
        });
    }

    function resolveUrl(href, baseUrl) {
        try { return new URL(href, baseUrl).href; } catch (e) { return href; }
    }

    // ================= Analyse pollution tierce (uBlock) =================
    //
    // Port JS des heuristiques du script E:\UblockAnalyzer\analyse-site.ps1
    // (projet separe, meme logique validee dessus) : re-fetch la page en
    // HTML brut - le DOM deja parse par le navigateur ne garde pas l'ordre
    // d'origine des balises situees avant <!DOCTYPE>, indice cle pour
    // reperer les injections publicitaires. Ne bloque rien : signale
    // seulement, a l'utilisateur de decider s'il ajoute des regles uBlock.

    const BRAND_REAL_SUFFIXES = {
        google: ['.google.com', '.googleapis.com', '.gstatic.com', '.googlesyndication.com', '.googletagmanager.com', '.google-analytics.com', '.doubleclick.net', '.googleusercontent.com', '.googleadservices.com', '.googlevideo.com'],
        gsyndication: ['.googlesyndication.com'],
        syndication: ['.googlesyndication.com'],
        akamai: ['.akamai.net', '.akamaized.net', '.akamaihd.net', '.akamaitechnologies.com', '.akamai-staging.net', '.edgekey.net', '.edgesuite.net'],
        akam: ['.akamai.net', '.akamaized.net', '.akamaihd.net', '.akamaitechnologies.com', '.edgekey.net', '.edgesuite.net'],
        cloudflare: ['.cloudflare.com', '.cloudflareinsights.com', '.cloudflarestream.com', '.cloudflare.net'],
        facebook: ['.facebook.com', '.fbcdn.net', '.facebook.net'],
        amazon: ['.amazon.com', '.amazonaws.com', '.cloudfront.net'],
        microsoft: ['.microsoft.com', '.msedge.net', '.live.com', '.office.com'],
        youtube: ['.youtube.com', '.googlevideo.com', '.ytimg.com']
    };

    const KNOWN_AD_NETWORKS = [
        'doubleclick.net', 'popads.net', 'propellerads.com', 'adsterra.com',
        'exoclick.com', 'juicyads.com', 'hilltopads.net', 'adnxs.com',
        'taboola.com', 'outbrain.com', 'criteo.com', 'media.net',
        'revcontent.com', 'mgid.com', 'bidvertiser.com', 'popcash.net',
        'adcash.com', 'yllix.com', 'clickadu.com', 'trafficjunky.com'
    ];

    const TRUSTED_IFRAME_HOSTS = [
        'odysee.com', 'video.sibnet.ru', 'ansembed.net', 'youtube.com',
        'youtube-nocookie.com', 'player.vimeo.com', 'dailymotion.com',
        'recaptcha.net', 'w.soundcloud.com'
    ];

    function hostFromUrl(rawUrl, baseUrl) {
        if (!rawUrl) return null;
        let u = rawUrl.trim();
        if (u.indexOf('//') === 0) u = 'https:' + u;
        try { return new URL(u, baseUrl).host; } catch (e) { return null; }
    }

    function domainLookalike(host) {
        if (!host) return null;
        const lower = host.toLowerCase();
        for (const brand in BRAND_REAL_SUFFIXES) {
            if (lower.indexOf(brand) !== -1) {
                const isReal = BRAND_REAL_SUFFIXES[brand].some((suf) => lower.endsWith(suf));
                if (!isReal) return "contient '" + brand + "' mais ne correspond a aucun vrai domaine " + brand + " connu";
            }
        }
        return null;
    }

    function isKnownAdNetwork(host) {
        if (!host) return false;
        const lower = host.toLowerCase();
        return KNOWN_AD_NETWORKS.some((net) => lower === net || lower.endsWith('.' + net));
    }

    function isTrustedIframeHost(host) {
        if (!host) return true;
        const lower = host.toLowerCase();
        return TRUSTED_IFRAME_HOSTS.some((t) => lower === t || lower.endsWith('.' + t) || lower.indexOf(t) !== -1);
    }

    function analyzeThirdPartyPollution(rawHtml, pageUrl) {
        const siteHost = hostFromUrl(pageUrl);
        const findings = [];
        const doctypeMatch = /<!DOCTYPE/i.exec(rawHtml);
        const doctypeIdx = doctypeMatch ? doctypeMatch.index : Infinity;

        const scriptRe = /<script\b[^>]*?src="([^"]+)"[^>]*>/gi;
        let m;
        while ((m = scriptRe.exec(rawHtml))) {
            const host = hostFromUrl(m[1], pageUrl);
            if (!host || host === siteHost) continue;
            const tagText = m[0];
            const beforeDoctype = m.index < doctypeIdx;
            const hasAsyncDefer = /\basync\b/.test(tagText) || /\bdefer\b/.test(tagText);
            const lookalike = domainLookalike(host);
            const knownAd = isKnownAdNetwork(host);

            if (beforeDoctype) {
                findings.push({ severity: 'ELEVEE', category: 'Position anormale', detail: "Script '" + host + "' charge AVANT le <!DOCTYPE> - hors flux HTML normal.", rule: '||' + host + '^' });
            }
            if (lookalike) {
                findings.push({ severity: 'ELEVEE', category: 'Imitation de domaine connu', detail: "Script '" + host + "' " + lookalike + '.', rule: '||' + host + '^' });
            }
            if (knownAd) {
                findings.push({ severity: 'MOYENNE', category: 'Reseau publicitaire connu', detail: "Script '" + host + "' correspond a un reseau pub/tracking deja connu.", rule: '||' + host + '^' });
            }
            if (!beforeDoctype && !lookalike && !knownAd && !hasAsyncDefer) {
                findings.push({ severity: 'FAIBLE', category: 'Script bloquant potentiel', detail: "Script tiers '" + host + "' sans async/defer.", rule: null });
            }
        }

        const iframeRe = /<iframe\b[^>]*?src="([^"]+)"[^>]*>/gi;
        while ((m = iframeRe.exec(rawHtml))) {
            const host = hostFromUrl(m[1], pageUrl);
            if (!host || host === siteHost) continue;
            if (!isTrustedIframeHost(host)) {
                findings.push({ severity: 'MOYENNE', category: 'Iframe tierce non reconnue', detail: "Iframe pointant vers '" + host + "', hors liste des lecteurs/services connus.", rule: '||' + host + '^' });
            }
        }

        return findings;
    }

    function showPollutionBanner(findings) {
        if (!findings.length) { console.log('[AnimeTracker v6] Analyse pollution tierce : rien a signaler.'); return; }
        console.warn('[AnimeTracker v6] Pollution tierce detectee (' + findings.length + ') :');
        findings.forEach((f) => console.warn('  [' + f.severity + '] ' + f.category + ' - ' + f.detail + (f.rule ? ' | regle : ' + f.rule : '')));

        // ponytail: encadre jaune retire (v6.32, bruit sans action possible) - console seule.
        return;
        if (document.getElementById('ed-pollution-banner')) return;
        const banner = document.createElement('div');
        banner.id = 'ed-pollution-banner';
        banner.style.cssText = 'position:fixed;bottom:10px;right:10px;z-index:2147483647;background:#2a1a05;color:#ffb020;border:1px solid #ffb020;border-radius:6px;padding:10px 14px;font-family:Arial,sans-serif;font-size:12px;max-width:360px;box-shadow:0 2px 10px rgba(0,0,0,.5);';

        const title = document.createElement('div');
        title.style.cssText = 'font-weight:bold;margin-bottom:6px;display:flex;justify-content:space-between;gap:10px;align-items:center;';
        const titleText = document.createElement('span');
        titleText.textContent = findings.length + ' element(s) tiers suspect(s) detecte(s)';
        const closeBtn = document.createElement('span');
        closeBtn.textContent = 'x';
        closeBtn.style.cssText = 'cursor:pointer;opacity:.7;padding:0 4px;';
        closeBtn.addEventListener('click', () => banner.remove());
        title.appendChild(titleText);
        title.appendChild(closeBtn);
        banner.appendChild(title);

        const list = document.createElement('div');
        list.style.cssText = 'max-height:160px;overflow-y:auto;';
        findings.slice(0, 8).forEach((f) => {
            const line = document.createElement('div');
            line.style.cssText = 'margin-bottom:4px;';
            line.textContent = '[' + f.severity + '] ' + f.detail;
            list.appendChild(line);
        });
        banner.appendChild(list);

        const hint = document.createElement('div');
        hint.style.cssText = 'margin-top:6px;opacity:.8;';
        hint.textContent = 'Detail complet + regles uBlock suggerees dans la console (F12).';
        banner.appendChild(hint);

        document.body.appendChild(banner);
    }

    function runPollutionAnalysis() {
        fetchPageHtml(location.href).then((html) => {
            const findings = analyzeThirdPartyPollution(html, location.href);
            showPollutionBanner(findings);
        }).catch((e) => console.log('[AnimeTracker v6] Analyse pollution tierce echouee : ' + e.message));
    }

    // ================= Adaptateurs par site =================
    //
    // Chaque adaptateur expose : matchesUrl(url), isPlayablePage(doc),
    // extract(doc, pageUrl, rawHtml) -> Promise<InfoUnifie|null>.
    //
    // Forme unifiee retournee par extract() (voir commentaire de tete pour
    // le detail des deux styles de navigation 'page' et 'index') :
    //   { site, siteLabel, siteTag, playerOrigin, navStyle,
    //     embedSrc, pageUrl, resumeUrl, seriesUrl, seriesName,
    //     episodeLabel, episodeNumber, latestEpisodeNumber, latestEpisodeUrl,
    //     nextPageUrl, prevPageUrl,                       // navStyle 'page'
    //     episodeIndex, totalEpisodes, embedByIndex,        // navStyle 'index'
    //     episodeNumbersByIndex, resumeUrlsByIndex }        // (numero reel et
    //                                                        //  URL de reprise
    //                                                        //  par position -
    //                                                        //  ne PAS supposer
    //                                                        //  numero = index+1,
    //                                                        //  faux des qu'il y
    //                                                        //  a des trous, cf.
    //                                                        //  SITE_ODYSEE)

    function storageKey(info) { return info.site + '::' + info.seriesUrl; }

    // ---- esprit-donghua.xyz (repris de v4) ----
    const SITE_ESPRIT_DONGHUA = {
        id: 'esprit-donghua', label: 'Esprit Donghua', tag: 'ED',
        playerOrigin: PLAYER_ORIGIN_ODYSEE,
        matchesUrl(url) { return url.indexOf('https://esprit-donghua.xyz/') === 0; },
        isPlayablePage(doc) { return !!extractOdyseeIframe(doc); },
        extract(doc, pageUrl) {
            const iframe = extractOdyseeIframe(doc);
            const rawSrc = iframe ? iframe.getAttribute('src') : null;
            const embedSrc = rawSrc ? resolveUrl(rawSrc, pageUrl) : null;
            if (!embedSrc) return Promise.resolve(null);

            const seriesLink = doc.querySelector('#singlepisode .headlist .det h2 a');
            const seriesUrl = seriesLink && seriesLink.getAttribute('href') ? resolveUrl(seriesLink.getAttribute('href'), pageUrl) : null;
            const seriesName = seriesLink ? seriesLink.textContent.trim() : null;

            const episodeMeta = doc.querySelector('meta[itemprop="episodeNumber"]');
            const titleEl = doc.querySelector('h1.entry-title');

            const nextLink = extractAdjacentEpisodeLink(doc, '.naveps.bignav', 'next', true);
            const prevLink = extractAdjacentEpisodeLink(doc, '.naveps.bignav', 'prev', false);

            const firstLi = doc.querySelector('#singlepisode .episodelist li');
            let latestEpisodeNumber = null, latestEpisodeUrl = null;
            if (firstLi) {
                const link = firstLi.querySelector('a[href]');
                const span = firstLi.querySelector('.playinfo span');
                const match = span ? span.textContent.match(/Eps\s*(\d+)/i) : null;
                if (link && match) { latestEpisodeNumber = match[1]; latestEpisodeUrl = resolveUrl(link.getAttribute('href'), pageUrl); }
            }
            // Numero affiche ("Eps 193") -> adresse (s5-e17) : la numerotation de
            // l'URL repart a chaque saison, "Aller" ne peut pas la deviner (v6.29).
            const episodeUrlsByNumber = {};
            doc.querySelectorAll('#singlepisode .episodelist li').forEach((li) => {
                const a = li.querySelector('a[href]');
                const m = (li.textContent || '').match(/Eps\s*(\d+)/i);
                if (a && m) episodeUrlsByNumber[Number(m[1])] = resolveUrl(a.getAttribute('href'), pageUrl);
            });

            if (!seriesUrl) return Promise.resolve(null);
            return Promise.resolve({
                site: this.id, siteLabel: this.label, siteTag: this.tag, playerOrigin: this.playerOrigin, navStyle: 'page',
                embedSrc: embedSrc, pageUrl: pageUrl, resumeUrl: pageUrl,
                seriesUrl: seriesUrl, seriesName: seriesName,
                episodeLabel: titleEl ? titleEl.textContent.trim() : null,
                episodeNumber: episodeMeta ? episodeMeta.getAttribute('content') : null,
                latestEpisodeNumber: latestEpisodeNumber, latestEpisodeUrl: latestEpisodeUrl, episodeUrlsByNumber: episodeUrlsByNumber,
                nextPageUrl: nextLink ? resolveUrl(nextLink, pageUrl) : null,
                prevPageUrl: prevLink ? resolveUrl(prevLink, pageUrl) : null
            });
        },
        buildEpisodeUrl(currentPageUrl, targetNumber) {
            // Le site ecrit au moins 2 chiffres : -e06 existe, -e6 = 404.
            const m = currentPageUrl.match(/^(.*-e)(\d+)(\/?)$/i);
            return m ? m[1] + String(targetNumber).padStart(2, '0') + m[3] : null;
        }
    };

    function extractOdyseeIframe(doc) {
        return doc.getElementById('odysee-iframe') || doc.querySelector('iframe[src*="odysee.com"]');
    }

    function extractAdjacentEpisodeLink(doc, containerSelector, rel, fallbackAtEnd) {
        let link = doc.querySelector(containerSelector + ' a[rel="' + rel + '"]');
        if (!link) {
            const navContainer = doc.querySelector(containerSelector);
            if (navContainer) {
                const navItems = navContainer.querySelectorAll('.nvs');
                if (navItems.length > 0) link = navItems[fallbackAtEnd ? navItems.length - 1 : 0].querySelector('a[href]');
            }
        }
        return link ? link.getAttribute('href') : null;
    }

    // ---- animoflix.to ----
    const SITE_ANIMOFLIX = {
        id: 'animoflix', label: 'Animoflix', tag: 'AF',
        playerOrigin: PLAYER_ORIGIN_SIBNET,
        // Tout le domaine (comme esprit-donghua), pas juste "/anime/..." -
        // sinon le panneau disparaissait sur l'accueil/le catalogue/etc.
        // (signale par l'utilisateur 2026-09-21). isPlayablePage() ci-dessous
        // reste le vrai filtre pour savoir si CETTE page a un episode a lire.
        matchesUrl(url) { return url.indexOf('https://animoflix.to/') === 0; },
        isPlayablePage(doc) { return !!doc.getElementById('epLecteurSelect'); },
        extract(doc, pageUrl) {
            const lecteurSelect = doc.getElementById('epLecteurSelect');
            if (!lecteurSelect) return Promise.resolve(null);
            // ansembed d'abord (v6.20 : sibnet ferme, animoflix n'a plus que
            // ansembed), sibnet en secours. Aucun des deux (ex. sendvid seul) :
            // embedSrc reste null et le lecteur natif du site reste utilisable.
            // Tous les lecteurs de la page, ansembed puis sibnet d'abord : si
            // le 1er est mort (lien 404 chez l'hebergeur), le calque essaie le
            // suivant (v6.21).
            const options = Array.from(lecteurSelect.querySelectorAll('option'));
            const rank = (o) => { const i = ['ansembed.net', 'video.sibnet.ru'].indexOf(o.getAttribute('data-host')); return i === -1 ? 9 : i; };
            const embedCandidates = options.slice().sort((a, b) => rank(a) - rank(b)).map((o) => o.getAttribute('value'))
                .filter((v, i, all) => /^https:\/\//.test(v || '') && all.indexOf(v) === i);
            const embedSrc = embedCandidates[0] || null;

            const seriesLink = doc.querySelector('a.ep-anime-link');
            const seriesUrl = seriesLink && seriesLink.getAttribute('href') ? resolveUrl(seriesLink.getAttribute('href'), pageUrl) : null;
            const seriesName = seriesLink ? seriesLink.textContent.trim() : null;

            const epNumEl = doc.querySelector('h1.ep-h1 .ep-num');
            const epNumMatch = epNumEl ? epNumEl.textContent.match(/(\d+)/) : null;
            const h1 = doc.querySelector('h1.ep-h1');

            const nextBtn = doc.querySelector('a.ep-nav-btn.next-btn');
            const prevBtn = doc.querySelector('a.ep-nav-btn[aria-label="Épisode précédent"]');

            if (!seriesUrl) return Promise.resolve(null);
            return Promise.resolve({
                site: this.id, siteLabel: this.label, siteTag: this.tag, playerOrigin: this.playerOrigin, navStyle: 'page',
                embedSrc: embedSrc, embedCandidates: embedCandidates, pageUrl: pageUrl, resumeUrl: pageUrl,
                seriesUrl: seriesUrl, seriesName: seriesName,
                episodeLabel: h1 ? h1.textContent.replace(/\s+/g, ' ').trim() : null,
                episodeNumber: epNumMatch ? epNumMatch[1] : null,
                // Pas de colonne "dernier episode publie" reperee sur ce
                // site (contrairement a #singlepisode .episodelist sur
                // esprit-donghua) - a ajouter plus tard si une source est
                // trouvee. Sans ca, le badge "nouvel episode" ne peut pas
                // fonctionner pour ce site pour l'instant.
                latestEpisodeNumber: null, latestEpisodeUrl: null,
                nextPageUrl: nextBtn ? resolveUrl(nextBtn.getAttribute('href'), pageUrl) : null,
                prevPageUrl: prevBtn ? resolveUrl(prevBtn.getAttribute('href'), pageUrl) : null
            });
        },
        buildEpisodeUrl(currentPageUrl, targetNumber) {
            const m = currentPageUrl.match(/^(.*episode-)(\d+)(\/?)$/i);
            return m ? m[1] + targetNumber + m[3] : null;
        }
    };

    // ---- anime-sama.to ----
    //
    // Voir commentaire de tete : pas de page par episode, tout est sur la
    // page de saison via des tableaux JS (eps1/eps2/eps3...) charges depuis
    // un fichier "episodes.js" propre a chaque saison/langue. On ne
    // ré-execute jamais ce fichier (pas d'eval/new Function sur du JS
    // distant) - juste une lecture par expression reguliere des tableaux
    // `var epsN = [...]`, largement suffisant vu leur forme tres reguliere
    // (une simple liste d'URLs entre guillemets).
    const SITE_ANIME_SAMA = {
        id: 'anime-sama', label: 'Anime-Sama', tag: 'AS',
        playerOrigin: PLAYER_ORIGIN_SIBNET,
        // Tout le domaine (voir commentaire equivalent sur Animoflix
        // ci-dessus) - isPlayablePage() reste limite aux vraies pages de
        // saison/langue (presence de #playerDF).
        matchesUrl(url) { return url.indexOf('https://anime-sama.to/') === 0; },
        isPlayablePage(doc) { return !!doc.getElementById('playerDF'); },
        extract(doc, pageUrl) {
            const scriptEl = Array.from(doc.querySelectorAll('script[src]')).find((s) => /episodes\.js/i.test(s.getAttribute('src') || ''));
            if (!scriptEl) return Promise.resolve(null);
            const episodesJsUrl = resolveUrl(scriptEl.getAttribute('src'), pageUrl);
            const titreEl = doc.getElementById('titreOeuvre');
            const seriesName = titreEl ? titreEl.textContent.trim() : null;
            // La page de saison/langue elle-meme sert de cle de serie (une
            // saison ou une langue differente = une entree de suivi
            // differente, comme pour un "anime" separe sur les autres sites).
            const seriesUrl = pageUrl.replace(/#.*$/, '');

            return fetchPageHtml(episodesJsUrl).then((jsText) => {
                const epsArrays = parseEpsArrays(jsText);
                const embedByIndex = buildEmbedByIndex(epsArrays);
                const totalEpisodes = embedByIndex.length;
                if (totalEpisodes === 0) return null;
                // Pas de trous possibles ici (tableau JS du site, un index =
                // un episode) - numero = index+1, contrairement a SITE_ODYSEE.
                const episodeNumbersByIndex = embedByIndex.map((_, i) => i + 1);
                const resumeUrlsByIndex = embedByIndex.map((_, i) => seriesUrl + '#ep=' + (i + 1));

                // Reprend l'episode indique dans l'ancre #ep=N laissee par
                // notre propre "URL de reprise" (voir resumeUrl plus bas) -
                // sinon demarre au premier episode.
                const hashMatch = pageUrl.match(/#ep=(\d+)/);
                let episodeIndex = hashMatch ? Math.max(0, Math.min(totalEpisodes - 1, parseInt(hashMatch[1], 10) - 1)) : 0;

                return {
                    site: this.id, siteLabel: this.label, siteTag: this.tag, playerOrigin: this.playerOrigin, navStyle: 'index',
                    embedSrc: embedByIndex[episodeIndex], pageUrl: seriesUrl, resumeUrl: resumeUrlsByIndex[episodeIndex],
                    seriesUrl: seriesUrl, seriesName: seriesName,
                    episodeLabel: 'Episode ' + (episodeIndex + 1),
                    episodeNumber: episodeIndex + 1,
                    // Le total d'episodes deja charges sert de "dernier
                    // episode connu" - se rafraichit en re-fetchant
                    // episodes.js (checkForNewEpisodes), pas d'appel reseau
                    // supplementaire dedie necessaire.
                    latestEpisodeNumber: totalEpisodes, latestEpisodeUrl: seriesUrl + '#ep=' + totalEpisodes,
                    episodeIndex: episodeIndex, totalEpisodes: totalEpisodes, embedByIndex: embedByIndex,
                    episodeNumbersByIndex: episodeNumbersByIndex, resumeUrlsByIndex: resumeUrlsByIndex
                };
            }).catch((e) => {
                console.log('[AnimeTracker v6] (anime-sama) echec lecture episodes.js', e);
                return null;
            });
        }
    };

    // Extrait chaque tableau `var epsN = ['url', "url", ...];` sans jamais
    // executer le fichier - juste une lecture texte, dans l'ordre ou les
    // URLs apparaissent (qui correspond a l'ordre des episodes, tel
    // qu'utilise par le site lui-meme, cf. code source anime-sama observe :
    // `for (var i = 1; i <= tailleEpisodes; i++)` sur eps1).
    function parseEpsArrays(jsText) {
        const arrays = {};
        const arrayRe = /var\s+eps(\d+)\s*=\s*\[([\s\S]*?)\]\s*;/g;
        let m;
        while ((m = arrayRe.exec(jsText))) {
            const n = m[1];
            const body = m[2];
            const urls = [];
            const strRe = /'([^']*)'|"([^"]*)"/g;
            let sm;
            while ((sm = strRe.exec(body))) urls.push(sm[1] !== undefined ? sm[1] : sm[2]);
            arrays[n] = urls;
        }
        return arrays; // { "1": [...], "2": [...], ... }
    }

    // Pour chaque index d'episode, prend la premiere URL d'un hebergeur
    // gere parmi les lecteurs disponibles a CET index (la disponibilite par
    // hebergeur peut varier episode par episode - constate en inspectant un
    // vrai fichier episodes.js). Ansembed d'abord (lecteur par defaut du
    // site, sibnet en 403 depuis 2026-10-01), sibnet en secours. null si
    // aucun hebergeur gere pour cet episode precis.
    const ANIME_SAMA_HOSTS = [/ansembed\.net/i, /sibnet\.ru/i];
    function buildEmbedByIndex(epsArrays) {
        const lecteurKeys = Object.keys(epsArrays).sort((a, b) => Number(a) - Number(b));
        const maxLen = lecteurKeys.reduce((max, k) => Math.max(max, epsArrays[k].length), 0);
        const result = [];
        for (let i = 0; i < maxLen; i++) {
            const urls = lecteurKeys.map((k) => epsArrays[k][i]).filter(Boolean);
            let found = null;
            for (let h = 0; h < ANIME_SAMA_HOSTS.length && !found; h++) found = urls.find((u) => ANIME_SAMA_HOSTS[h].test(u)) || null;
            result.push(found);
        }
        return result;
    }

    // ---- odysee.com (navigation directe, hors esprit-donghua.xyz) ----
    //
    // Voir le commentaire d'en-tete (AJOUT 2026-09-26) pour le contexte
    // complet. Resume : pas de "chaine officielle" avec les episodes dans
    // l'ordre sur Odysee - on reconstruit notre propre playlist ordonnee
    // via l'API publique claim_search (aucune authentification requise),
    // triee par numero d'episode devine dans le TITRE de chaque video
    // (seule source fiable constatee).
    const ODYSEE_API_URL = 'https://api.na-backend.odysee.com/api/v1/proxy?m=claim_search';
    const ODYSEE_PLAYLIST_REFRESH_MS = 60 * 60 * 1000; // 1h, comme checkForNewEpisodes

    function odyseeApiRequest(body) {
        return gmRequest({
            method: 'POST', url: ODYSEE_API_URL,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify(body)
        }).then((res) => {
            if (res.status < 200 || res.status >= 300) throw new Error('API Odysee, statut ' + res.status);
            const parsed = JSON.parse(res.responseText);
            if (parsed.error) throw new Error('API Odysee : ' + parsed.error.message);
            return parsed.result;
        });
    }

    // Pagine tant que la chaine a d'autres resultats - plafonne a 500 videos
    // par securite (largement suffisant pour retrouver les episodes recents
    // d'une serie en cours, l'usage vise ici - pas un archivage complet).
    function fetchAllOdyseeChannelClaims(channelName) {
        const pageSize = 50;
        function fetchPage(page, acc) {
            return odyseeApiRequest({
                jsonrpc: '2.0', method: 'claim_search',
                params: {
                    channel: channelName, claim_type: 'stream', stream_types: ['video'],
                    page: page, page_size: pageSize, order_by: ['release_time']
                }
            }).then((result) => {
                const items = (result && result.items) || [];
                const merged = acc.concat(items);
                if (items.length < pageSize || merged.length >= 500) return merged;
                return fetchPage(page + 1, merged);
            });
        }
        return fetchPage(1, []);
    }

    // Numero d'episode = dernier nombre trouve dans le titre - marche sur
    // les formats de nommage constates en usage reel sur ce type de chaine
    // ("Episode 484", "S02E480" -> 484/480 dans les 2 cas, meme si "02"
    // apparait aussi plus tot dans le titre).
    function guessOdyseeEpisodeNumber(title) {
        const matches = title.match(/\d+/g);
        return matches ? parseInt(matches[matches.length - 1], 10) : null;
    }

    // Prefixe de serie = titre sans l'etiquette d'episode finale - gere les
    // 2 formats constates POUR LA MEME SERIE sur LA MEME chaine
    // ("... Season 2 Episode 484 vostfr" et "... S02E480 vostfr" donnent
    // tous deux "..." une fois les etiquettes retirees). Heuristique texte
    // best-effort (pas de structure fiable cote site) - a affiner si
    // d'autres formats apparaissent en usage reel.
    function deriveOdyseeSeriesPrefix(title) {
        const matches = title.match(/\d+/g);
        if (!matches) return title.trim();
        const lastNumber = matches[matches.length - 1];
        const lastIndex = title.lastIndexOf(lastNumber);
        let prefix = title.slice(0, lastIndex);
        let previous;
        do {
            previous = prefix;
            prefix = prefix.replace(/\s*(?:Season|Saison)\s*\d*\s*$/i, '');
            prefix = prefix.replace(/\bS\d+E\s*$/i, '');
            prefix = prefix.replace(/\s*\b(?:Episode|Épisode|Ep\.?)\s*$/i, '');
        } while (prefix !== previous);
        return prefix.trim();
    }

    function odyseeWatchUrl(channelName, channelClaimId, streamName, streamClaimId) {
        return 'https://odysee.com/' + encodeURIComponent(channelName) + ':' + channelClaimId +
            '/' + encodeURIComponent(streamName) + ':' + streamClaimId;
    }
    function odyseeEmbedUrlFromWatchUrl(watchUrl) {
        return watchUrl.replace('https://odysee.com/', 'https://odysee.com/$/embed/');
    }

    // Construit la playlist triee pour une serie donnee sur une chaine :
    // filtre les videos de la chaine dont le prefixe de titre correspond,
    // et ne retient QUE celles marquees "vostfr" dans le titre - demande
    // explicite de l'utilisateur suite a des reposts "multi-traduction" en
    // realite sous-titres automatiquement (Google Trad) de mauvaise
    // qualite (le champ metadonnee "languages" de l'API ne permet pas de
    // les distinguer, il reste a 'en' meme pour du vrai contenu vostfr).
    function buildOdyseePlaylist(channelName, seriesPrefixLower) {
        return fetchAllOdyseeChannelClaims(channelName).then((items) => {
            const entries = [];
            items.forEach((item) => {
                const value = item.value || {};
                const title = value.title || item.name;
                const signing = item.signing_channel;
                if (!title || !signing) return;
                if (deriveOdyseeSeriesPrefix(title).toLowerCase() !== seriesPrefixLower) return;
                if (!/vostfr/i.test(title)) return;
                const episodeNumber = guessOdyseeEpisodeNumber(title);
                if (episodeNumber === null) return;
                const watchUrl = odyseeWatchUrl(signing.name, signing.claim_id, item.name, item.claim_id);
                entries.push({ episodeNumber: episodeNumber, title: title, watchUrl: watchUrl, embedUrl: odyseeEmbedUrlFromWatchUrl(watchUrl) });
            });
            entries.sort((a, b) => a.episodeNumber - b.episodeNumber);
            return entries;
        });
    }

    function odyseePlaylistCacheKey(channelName, seriesPrefixLower) { return channelName + '::' + seriesPrefixLower; }

    // Cache + rafraichissement periodique (comme checkForNewEpisodes) -
    // evite de repaginer toute la chaine a chaque page vue. En cas d'echec
    // reseau ou de chaine vide passagere, garde l'ancienne liste en cache
    // plutot que de tout perdre.
    function getOdyseePlaylist(channelName, seriesPrefixLower) {
        const cacheKey = odyseePlaylistCacheKey(channelName, seriesPrefixLower);
        const all = GM_getValue('odyseePlaylists', {});
        const cached = all[cacheKey];
        if (cached && (Date.now() - cached.builtAt) < ODYSEE_PLAYLIST_REFRESH_MS) return Promise.resolve(cached.entries);
        return buildOdyseePlaylist(channelName, seriesPrefixLower).then((entries) => {
            if (entries.length === 0 && cached) return cached.entries;
            const fresh = GM_getValue('odyseePlaylists', {});
            fresh[cacheKey] = { builtAt: Date.now(), entries: entries };
            GM_setValue('odyseePlaylists', fresh);
            return entries;
        }).catch((e) => {
            console.log('[AnimeTracker v6] (odysee) echec construction playlist', e);
            return cached ? cached.entries : [];
        });
    }

    const SITE_ODYSEE = {
        id: 'odysee', label: 'Odysee', tag: 'OD',
        playerOrigin: PLAYER_ORIGIN_ODYSEE,
        // Le domaine entier matche (comme les autres sites) - isPlayablePage()
        // filtre les pages qui ne sont pas une vraie page de video (accueil,
        // recherche, page de chaine...). Exclut aussi "/$/embed/..." par
        // securite (ne devrait jamais se charger en page principale en usage
        // normal - uniquement dans notre propre iframe pilotee).
        matchesUrl(url) {
            return url.indexOf('https://odysee.com/') === 0 &&
                url.indexOf('/$/embed/') === -1 && url.indexOf('/%24/embed/') === -1;
        },
        isPlayablePage(doc) { return !!doc.querySelector('meta[property="og:video"]'); },
        extract(doc, pageUrl) {
            const urlMeta = doc.querySelector('meta[property="og:url"]');
            const titleMeta = doc.querySelector('meta[property="og:title"]');
            const ogUrl = urlMeta ? urlMeta.getAttribute('content') : null;
            const fullTitle = titleMeta ? titleMeta.getAttribute('content') : null;
            if (!ogUrl || !fullTitle) return Promise.resolve(null);
            const pathMatch = ogUrl.match(/odysee\.com\/(@[^/]+)\//i);
            const channelName = pathMatch ? pathMatch[1] : null;
            if (!channelName) return Promise.resolve(null);

            const seriesPrefix = deriveOdyseeSeriesPrefix(fullTitle);
            const seriesPrefixLower = seriesPrefix.toLowerCase();
            const seriesUrl = 'https://odysee.com/@serie/' + channelName + '/' + encodeURIComponent(seriesPrefixLower);
            const currentEpisodeNumber = guessOdyseeEpisodeNumber(fullTitle);

            return getOdyseePlaylist(channelName, seriesPrefixLower).then((entries) => {
                const workingEntries = entries.slice();
                let episodeIndex = workingEntries.findIndex((e) => e.episodeNumber === currentEpisodeNumber);
                if (episodeIndex === -1 && currentEpisodeNumber !== null) {
                    // La video en cours peut manquer de la playlist en cache
                    // (rafraichie il y a moins d'1h, episode tout juste mis
                    // en ligne) - on l'ajoute a la volee pour ne pas bloquer
                    // le suivi de CETTE page, sans la sauvegarder dans le
                    // cache (evite de re-valider le filtre "vostfr" ici).
                    workingEntries.push({
                        episodeNumber: currentEpisodeNumber, title: fullTitle,
                        watchUrl: ogUrl, embedUrl: odyseeEmbedUrlFromWatchUrl(ogUrl)
                    });
                    workingEntries.sort((a, b) => a.episodeNumber - b.episodeNumber);
                    episodeIndex = workingEntries.findIndex((e) => e.episodeNumber === currentEpisodeNumber);
                }
                if (episodeIndex === -1) return null;

                const current = workingEntries[episodeIndex];
                const last = workingEntries[workingEntries.length - 1];
                return {
                    site: this.id, siteLabel: this.label, siteTag: this.tag, playerOrigin: this.playerOrigin, navStyle: 'index',
                    embedSrc: current.embedUrl, pageUrl: current.watchUrl, resumeUrl: current.watchUrl,
                    seriesUrl: seriesUrl, seriesName: seriesPrefix,
                    episodeLabel: current.title, episodeNumber: current.episodeNumber,
                    latestEpisodeNumber: last ? last.episodeNumber : null, latestEpisodeUrl: last ? last.watchUrl : null,
                    episodeIndex: episodeIndex, totalEpisodes: workingEntries.length,
                    embedByIndex: workingEntries.map((e) => e.embedUrl),
                    episodeNumbersByIndex: workingEntries.map((e) => e.episodeNumber),
                    resumeUrlsByIndex: workingEntries.map((e) => e.watchUrl)
                };
            });
        }
    };

    // ---- Sites ajoutes par l'utilisateur (v6.22, 1re brique du lecteur generique) ----
    //
    // "Ajouter ce site" (fenetre Mes animes) enregistre un domaine dans
    // GM customSites ; il recoit alors un adaptateur generique qui reconnait
    // deux formes de pages :
    //  - liste d'episodes "DLE" cachee dans la page (<div class="eps">
    //    "N!lien1,lien2,..." - french-anime.com et les sites du meme moteur) :
    //    navigation interne comme anime-sama, tous les lecteurs en secours ;
    //  - une page par episode avec un lecteur en iframe (myfluneo.eu) : le
    //    lecteur = la plus grande iframe, "suivant" = lien "Episode suivant"
    //    du site, suivi par navigation (les pages peuvent etre generees en JS,
    //    donc pas de lecture du HTML brut).
    function loadCustomSites() { try { return GM_getValue('customSites', {}) || {}; } catch (e) { return {}; } }
    function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
    function hostMatches(url, host) { const h = hostOf(url); return h === host || h.endsWith('.' + host); }
    function cleanSeriesTitle(t) {
        return String(t || '').replace(/\s+/g, ' ').replace(/\s*\|.*$/, '')
            .replace(/\s+(?:en\s+)?(?:DDL\s+)?streaming\b.*$/i, '')
            .replace(/\s+(?:S\d+\s*)?(?:Ep\.?|Episode|\u00c9pisode)\s*\d+.*$/i, '')
            .replace(/\s+(?:VF|VOSTFR)\b.*$/i, '').trim();
    }
    // Lecteur "emballe" par le site (myfluneo : /embed-player?v=<base64 de
    // l'adresse ansembed>) : on decode pour piloter le vrai lecteur.
    function unwrapEmbed(src) {
        try {
            const u = new URL(src);
            for (const v of u.searchParams.values()) {
                if (/^https?:\/\//.test(v)) return v;
                if (/^[A-Za-z0-9+/=_-]{16,}$/.test(v)) {
                    const d = atob(v.replace(/-/g, '+').replace(/_/g, '/'));
                    if (/^https?:\/\/\S+$/.test(d)) return d;
                }
            }
        } catch (e) {}
        return src;
    }
    function parseDleEps(doc) {
        const box = doc.querySelector('.eps');
        if (!box) return null;
        const eps = box.textContent.split(/\r?\n|__NEWL__/).map((l) => l.trim().match(/^(\d+)!(.+)$/)).filter(Boolean).map((m) => ({
            num: Number(m[1]),
            urls: m[2].split(',').map((x) => x.trim().replace(/^https?:\/\/vidmoly\.me\/w\/([A-Za-z0-9]+).*$/, 'https://vidmoly.org/embed-$1.html'))
                .filter((x) => /^https:\/\//.test(x) && !/up4fun/i.test(x))
        })).filter((e) => e.urls.length);
        return eps.length ? eps.sort((a, b) => a.num - b.num) : null;
    }
    function findPlayerIframe(doc) {
        let best = null, bestArea = 0;
        doc.querySelectorAll('iframe').forEach((f) => {
            if (!/^https?:\/\//.test(f.src || '') || f.name === PLAYER_FRAME_NAME) return;
            const r = f.getBoundingClientRect ? f.getBoundingClientRect() : { width: 0, height: 0 };
            const area = r.width * r.height;
            if (r.width >= 300 && area > bestArea) { best = f; bestArea = area; }
        });
        return best;
    }
    const EP_IN_URL = /(episode|ep)[-_]?(\d+)/i;
    function makeGenericSite(host) {
        const site = {
            id: 'custom:' + host, label: host, tag: host.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase(), playerOrigin: null, custom: true,
            matchesUrl(url) { return hostMatches(url, host); },
            isPlayablePage(doc) { return !!parseDleEps(doc) || EP_IN_URL.test(location.pathname); },
            buildEpisodeUrl(currentPageUrl, n) { return EP_IN_URL.test(currentPageUrl) ? currentPageUrl.replace(EP_IN_URL, (m0, w) => w + (m0.charAt(w.length) === '-' || m0.charAt(w.length) === '_' ? m0.charAt(w.length) : '') + n) : null; },
            extract(doc, pageUrl) {
                const h1 = doc.querySelector('h1');
                const og = doc.querySelector('meta[property="og:title"]');
                const seriesName = cleanSeriesTitle((h1 && h1.textContent) || (og && og.getAttribute('content')) || doc.title) || host;
                const eps = parseDleEps(doc);
                if (eps) {
                    const canon = doc.querySelector('link[rel="canonical"]');
                    const seriesUrl = ((canon && canon.getAttribute('href')) || pageUrl).replace(/#.*$/, '');
                    const nums = eps.map((e) => e.num);
                    const hash = pageUrl.match(/#ep=(\d+)/);
                    let idx = hash ? nums.indexOf(Number(hash[1])) : 0;
                    if (idx < 0) idx = 0;
                    const cands = eps.map((e) => e.urls);
                    const resumeUrls = nums.map((n) => seriesUrl + '#ep=' + n);
                    if (doc === document) site.liveIframe = doc.querySelector('#film_iframe') || findPlayerIframe(doc);
                    return Promise.resolve({
                        site: site.id, siteLabel: site.label, siteTag: site.tag, playerOrigin: null, navStyle: 'index',
                        embedSrc: cands[idx][0], embedCandidates: cands[idx], embedCandidatesByIndex: cands,
                        pageUrl: seriesUrl, resumeUrl: resumeUrls[idx], seriesUrl: seriesUrl, seriesName: seriesName,
                        episodeLabel: 'Episode ' + nums[idx], episodeNumber: nums[idx],
                        latestEpisodeNumber: nums[nums.length - 1], latestEpisodeUrl: resumeUrls[resumeUrls.length - 1],
                        episodeIndex: idx, totalEpisodes: eps.length, embedByIndex: cands.map((c) => c[0]),
                        episodeNumbersByIndex: nums, resumeUrlsByIndex: resumeUrls
                    });
                }
                // Page d'episode : seulement sur la page vivante (lecteur souvent
                // insere en JS apres le chargement -> on l'attend jusqu'a 10 s).
                if (doc !== document) return Promise.resolve(null);
                const m = location.pathname.match(EP_IN_URL);
                if (!m) return Promise.resolve(null);
                return new Promise((resolve) => {
                    let tries = 0;
                    (function poll() {
                        const f = findPlayerIframe(doc);
                        if (!f && ++tries < 20) { setTimeout(poll, 500); return; }
                        if (!f) { resolve(null); return; }
                        site.liveIframe = f;
                        const n = Number(m[2]);
                        const links = Array.from(doc.querySelectorAll('a[href]'));
                        const findLink = (re) => { const a = links.find((l) => re.test((l.textContent + ' ' + (l.getAttribute('aria-label') || '')).trim()) && l.href.replace(/#.*$/, '') !== location.href.replace(/#.*$/, '')); return a ? a.href : null; };
                        const pageNoHash = location.href.replace(/#.*$/, '');
                        resolve({
                            site: site.id, siteLabel: site.label, siteTag: site.tag, playerOrigin: null, navStyle: 'page', navigate: true,
                            embedSrc: unwrapEmbed(f.src), embedCandidates: [unwrapEmbed(f.src)],
                            pageUrl: pageNoHash, resumeUrl: pageNoHash,
                            // Serie = adresse sans le segment de l'episode (une saison = une entree, comme anime-sama).
                            seriesUrl: pageNoHash.replace(/\/[^/]*(?:episode|ep)[-_]?\d+[^/]*\/?$/i, '') || pageNoHash,
                            seriesName: seriesName, episodeLabel: 'Episode ' + n, episodeNumber: n,
                            latestEpisodeNumber: null, latestEpisodeUrl: null,
                            nextPageUrl: findLink(/(?:\u00e9pisode|episode)\s+suivant|^suivant|\bnext\b/i),
                            prevPageUrl: findLink(/(?:\u00e9pisode|episode)\s+pr\u00e9c\u00e9dent|pr\u00e9c\u00e9dent|\bprev(?:ious)?\b/i)
                        });
                    })();
                });
            }
        };
        return site;
    }

    const SITES = [SITE_ESPRIT_DONGHUA, SITE_ANIMOFLIX, SITE_ANIME_SAMA, SITE_ODYSEE].concat(Object.keys(loadCustomSites()).map(makeGenericSite));

    function detectSite() {
        const url = location.href.replace(/#.*$/, '');
        for (let i = 0; i < SITES.length; i++) if (SITES[i].matchesUrl(url)) return SITES[i];
        return null;
    }

    // ================= Contexte : page principale =================
    //
    // Doit rester APRES la definition de SITES/des adaptateurs ci-dessus -
    // detectSite() les lit au moment de l'appel, pas seulement a sa
    // definition (bug trouve en usage reel le 2026-09-21 : cet appel etait
    // place tout en haut du fichier, avant que SITE_ESPRIT_DONGHUA/
    // SITE_ANIMOFLIX/SITE_ANIME_SAMA/SITES (declares en `const`, donc dans
    // leur "zone morte temporelle" tant que leur ligne n'a pas encore
    // ete executee) existent - ReferenceError immediat qui arretait TOUT
    // le script silencieusement, sur les 3 sites y compris esprit-donghua.xyz).
    // ================= Partout : "mes animes" + liens des sites (v6.19) =================
    //
    // Le script tourne desormais sur tous les sites (@match *://*/*) pour
    // offrir, depuis n'importe quelle page, la liste des animes suivis
    // (comme des favoris) sans quitter ce qu'on fait : ouverture au choix
    // dans un nouvel onglet, une nouvelle fenetre ou l'onglet courant. Le
    // stockage GM_* est celui du script, donc le meme sur tous les sites.
    const SITE_LINKS = [
        ['Esprit Donghua', 'https://esprit-donghua.xyz/'],
        ['Animoflix', 'https://animoflix.to/'],
        ['Anime-Sama', 'https://anime-sama.to/'],
        ['Odysee', 'https://odysee.com/']
    ];
    const OPEN_MODES = [['tab', 'Nouvel onglet'], ['window', 'Nouvelle fenetre'], ['same', 'Cet onglet']];
    function escHtml(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function getOpenMode() { return GM_getValue('openMode', 'tab'); }
    function openWithMode(url) {
        const mode = getOpenMode();
        if (mode === 'same') { location.href = url; return; }
        const w = window.open(url, '_blank', mode === 'window' ? 'popup,width=1280,height=760' : '');
        if (w) w.opener = null;
    }
    function siteLinksHtml() {
        const links = SITE_LINKS.concat(Object.keys(loadCustomSites()).map((h) => [h, 'https://' + h + '/']));
        return '<div style="display:flex;flex-wrap:wrap;gap:4px;">' + links.map(([label, url]) =>
            '<a href="' + url + '" class="vc-open-link" style="flex:1 1 auto;text-align:center;background:#1f2a33;color:#03d0fc;border:1px solid #03d0fc55;border-radius:4px;padding:3px 3px;font:bold 10px Arial,sans-serif;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + label + '</a>').join('') + '</div>';
    }
    function openModeSelectHtml() {
        const cur = getOpenMode();
        return '<label style="display:flex;align-items:center;gap:6px;font:11px Arial,sans-serif;color:#ccc;">Ouvrir dans :' +
            '<select class="vc-open-mode" style="flex:1;padding:3px;border-radius:4px;border:none;background:#000;color:#eee;font-size:11px;">' +
            OPEN_MODES.map(([v, l]) => '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>';
    }
    // Delegation globale : liens de sites/"Reprendre" et selecteur de mode,
    // ou qu'ils soient (panneau, calque, fenetre "Mes animes").
    if (isTopFrame) {
        document.addEventListener('click', (ev) => {
            const a = ev.target.closest && ev.target.closest('a.vc-open-link');
            if (!a) return;
            ev.preventDefault();
            openWithMode(a.href);
        }, true);
        document.addEventListener('change', (ev) => {
            if (!ev.target.classList || !ev.target.classList.contains('vc-open-mode')) return;
            GM_setValue('openMode', ev.target.value);
            document.querySelectorAll('select.vc-open-mode').forEach((sel) => { sel.value = ev.target.value; });
        }, true);
    }
    function relativeDays(iso) {
        if (!iso) return '';
        const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
        return days <= 0 ? "aujourd'hui" : days === 1 ? 'hier' : 'il y a ' + days + 'j';
    }
    function openFavoritesPopup() {
        const old = document.getElementById('vc-favorites');
        if (old) { old.remove(); return; }
        const progress = GM_getValue('progress', {});
        const excluded = GM_getValue('excludedSeries', {});
        const entries = Object.keys(progress).filter((k) => !excluded[k]).map((k) => progress[k])
            .sort((a, b) => String(b.watchedAt || '').localeCompare(String(a.watchedAt || '')));
        const bySite = {};
        entries.forEach((e) => { (bySite[e.siteLabel || e.site] = bySite[e.siteLabel || e.site] || []).push(e); });
        const version = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '';
        let html = '<div style="background:#15151f;color:#eee;width:min(520px,92vw);max-height:80vh;overflow:auto;border-radius:8px;padding:16px;font-family:Arial,sans-serif;display:flex;flex-direction:column;gap:10px;">' +
            '<div style="font-weight:bold;color:#03d0fc;font-size:15px;text-align:center;">Vidéo Continuum <span style="font-size:12px;color:#ffd400;">v' + escHtml(version) + '</span></div>' +
            siteLinksHtml() + openModeSelectHtml();
        if (!entries.length) html += '<div style="font-size:12px;color:#aaa;">Aucun anime suivi pour le moment.</div>';
        Object.keys(bySite).forEach((siteLabel) => {
            html += '<div style="font-size:12px;font-weight:bold;color:#03d0fc;border-top:1px solid #2a2a35;padding-top:6px;">' + escHtml(siteLabel) + '</div>';
            bySite[siteLabel].forEach((e) => {
                html += '<div style="display:flex;align-items:center;gap:8px;font-size:12px;">' +
                    '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escHtml(e.seriesName) + '">' + escHtml(e.seriesName) + '</span>' +
                    '<span style="color:#aaa;white-space:nowrap;">ep. ' + escHtml(e.episodeNumber || '?') + ' &middot; ' + relativeDays(e.watchedAt) + '</span>' +
                    (/^https?:\/\//.test(e.episodeUrl || '') ? '<a href="' + escHtml(e.episodeUrl) + '" class="vc-open-link" style="background:#03d0fc;color:#000;text-decoration:none;padding:3px 8px;border-radius:4px;font-weight:bold;white-space:nowrap;">Reprendre</a>' : '') +
                    '</div>';
            });
        });
        if (!detectSite()) html += '<button type="button" id="vc-add-site" style="background:#1f2a33;color:#4caf50;border:1px solid #4caf50;border-radius:4px;padding:7px;font:bold 12px Arial,sans-serif;cursor:pointer;">&#10133; Ajouter ce site (' + escHtml(hostOf(location.href)) + ') a Video Continuum</button>' +
            '<div style="font-size:10px;color:#888;margin-top:-6px;">A faire depuis la page d\'un episode, avec son lecteur affiche.</div>';
        html += '<div style="text-align:right;"><button type="button" id="vc-fav-close" style="background:#333;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;">Fermer</button></div></div>';
        const pop = document.createElement('div');
        pop.id = 'vc-favorites';
        pop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:2147483647;display:flex;align-items:center;justify-content:center;';
        pop.innerHTML = html;
        pop.addEventListener('click', (ev) => {
            if (ev.target === pop || ev.target.id === 'vc-fav-close') pop.remove();
            if (ev.target.id === 'vc-add-site') addCurrentSite(ev.target);
        });
        // Dans le calque plein ecran s'il est affiche (sinon invisible).
        (document.fullscreenElement || document.body).appendChild(pop);
    }
    function addCurrentSite(btn) {
        const host = hostOf(location.href);
        const site = makeGenericSite(host);
        btn.disabled = true; btn.textContent = 'Analyse de la page...';
        Promise.resolve(site.isPlayablePage(document) ? site.extract(document, location.href) : null).then((info) => {
            btn.disabled = false; btn.textContent = 'Ajouter ce site (' + host + ')';
            if (!info || !info.embedSrc) {
                alert('Aucun lecteur video reconnu sur cette page.\n\nOuvre la page d\'un episode (lecteur visible), puis reessaie.');
                return;
            }
            const nbPlayers = (info.embedCandidates || []).length;
            if (!confirm('Detecte sur ' + host + ' :\n\nAnime : ' + info.seriesName + '\nEpisode : ' + info.episodeNumber + (info.totalEpisodes ? ' (sur ' + info.totalEpisodes + ')' : '') +
                '\nLecteur : ' + hostOf(info.embedSrc) + (nbPlayers > 1 ? ' (+' + (nbPlayers - 1) + ' de secours)' : '') +
                '\nEpisode suivant : ' + (info.navStyle === 'index' ? 'liste du site' : (info.nextPageUrl ? 'lien trouve' : 'non trouve')) +
                '\n\nAjouter ' + host + ' a Video Continuum ? (la page va se recharger)')) return;
            const all = loadCustomSites();
            all[host] = { addedAt: new Date().toISOString() };
            GM_setValue('customSites', all);
            location.reload();
        });
    }
    function isFloatingButtonEnabled() { return GM_getValue('floatingButtonEverywhere', true); }
    function installFloatingButton() {
        if (document.getElementById('vc-float-btn')) return;
        const b = document.createElement('button');
        b.id = 'vc-float-btn';
        b.type = 'button';
        b.title = 'Vidéo Continuum - mes animes (masquable via le menu Tampermonkey)';
        b.textContent = '\u25B6';
        b.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483646;width:30px;height:30px;border-radius:50%;border:1px solid #03d0fc;background:#15151f;color:#03d0fc;font-size:13px;cursor:pointer;opacity:.55;box-shadow:0 2px 8px rgba(0,0,0,.4);padding:0;';
        b.addEventListener('mouseenter', () => { b.style.opacity = '1'; });
        b.addEventListener('mouseleave', () => { b.style.opacity = '.55'; });
        b.addEventListener('click', openFavoritesPopup);
        document.body.appendChild(b);
    }

    const CURRENT_SITE = detectSite();
    if (!CURRENT_SITE) {
        // Autre site : juste "Mes animes" (menu Tampermonkey + petit bouton).
        if (!isTopFrame) return;
        GM_registerMenuCommand('\uD83C\uDFAC Mes animes (Vidéo Continuum)', openFavoritesPopup);
        GM_registerMenuCommand((isFloatingButtonEnabled() ? 'Masquer' : 'Afficher') + ' le bouton sur tous les sites', () => {
            GM_setValue('floatingButtonEverywhere', !isFloatingButtonEnabled());
            const b = document.getElementById('vc-float-btn');
            if (b) b.remove(); else installFloatingButton();
        });
        if (isFloatingButtonEnabled()) {
            if (document.body) installFloatingButton();
            else document.addEventListener('DOMContentLoaded', installFloatingButton, { once: true });
        }
        return;
    }

    if (!document.body) {
        document.addEventListener('DOMContentLoaded', () => main(CURRENT_SITE), { once: true });
    } else {
        main(CURRENT_SITE);
    }

    // ================= Script principal (page principale) =================

    function main(site) {
        console.log('[AnimeTracker v6] script demarre sur ' + site.label);
        runPollutionAnalysis();

        const STORE_KEY = 'progress';
        // ---- Securite (v6.10, partage avec des inconnus) ----
        // Toute donnee venue d'une page scrapee ou d'un fichier importe est
        // echappee avant d'entrer dans du innerHTML : un fichier de sauvegarde
        // partage pouvait sinon injecter du HTML/JS dans le panneau.
        function escapeHtml(value) {
            return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        }

        // Import : liste blanche de champs, longueurs plafonnees, et lien
        // accepte seulement s'il pointe vers le site de l'entree (bloque
        // javascript:/data: et les domaines arbitraires). Etiquette/libelle
        // tires de SITES (l'ancien repli "site.slice(0, 2)" donnait "[ES]").
        function sanitizeImportedEntry(e) {
            if (!e || typeof e !== 'object') return null;
            const siteId = typeof e.site === 'string' ? e.site : 'esprit-donghua';
            const known = SITES.find((x) => x.id === siteId);
            if (!known) return null;
            const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
            const episodeUrl = str(e.episodeUrl, 1000);
            if (!/^https:\/\//i.test(episodeUrl) || !known.matchesUrl(episodeUrl)) return null;
            const seriesName = str(e.seriesName, 300);
            if (!seriesName) return null;
            let seriesUrl = str(e.seriesUrl, 1000);
            if (!(/^https:\/\//i.test(seriesUrl) && known.matchesUrl(seriesUrl)) && seriesUrl.indexOf('legacy:') !== 0) seriesUrl = 'legacy:' + seriesName;
            const num = Number(e.episodeNumber);
            const watched = e.watchedAt && !isNaN(new Date(e.watchedAt).getTime()) ? new Date(e.watchedAt).toISOString() : null;
            return {
                site: known.id, siteLabel: known.label, siteTag: known.tag,
                seriesName: seriesName, seriesUrl: seriesUrl,
                episodeLabel: str(e.episodeLabel, 100),
                episodeNumber: num > 0 && num < 100000 ? Math.floor(num) : null,
                episodeUrl: episodeUrl, watchedAt: watched
            };
        }

        function loadProgress() {
            const data = GM_getValue(STORE_KEY, {});
            // Etiquette/libelle toujours tires de SITES : une vieille sauvegarde
            // peut porter une etiquette perimee ("[ES]" vu en usage reel le
            // 2026-10-01 sur une entree esprit-donghua).
            Object.keys(data).forEach((k) => {
                const known = SITES.find((x) => x.id === data[k].site);
                if (known) { data[k].siteTag = known.tag; data[k].siteLabel = known.label; }
            });
            return data;
        }
        function saveProgress(data) { GM_setValue(STORE_KEY, data); }

        function loadExcludedSeries() { return GM_getValue('excludedSeries', {}); }
        function saveExcludedSeries(data) { GM_setValue('excludedSeries', data); }
        function isSeriesExcluded(key) { return !!loadExcludedSeries()[key]; }
        function setSeriesExcluded(key, excluded) {
            const all = loadExcludedSeries();
            if (excluded) all[key] = true; else delete all[key];
            saveExcludedSeries(all);
        }

        function loadIntroOutro() { return GM_getValue('introOutro', {}); }
        function saveIntroOutro(data) { GM_setValue('introOutro', data); }
        function getIntroOutroForKey(key) { return loadIntroOutro()[key] || {}; }
        function setIntroOutroForKey(key, patch) {
            const all = loadIntroOutro();
            all[key] = Object.assign({}, all[key], patch);
            saveIntroOutro(all);
        }

        // ---- Lecteur alternatif YouTube (episode par episode) ----
        //
        // Lien embed memorise par episode (trouve par recherche, v6.36 : plus
        // de lien colle a la main). Pas de saut intro/outro sur cette source.
        function youtubeOverrideKey(info) { return storageKey(info) + '::' + info.episodeNumber; }
        function loadYoutubeOverrides() { return GM_getValue('youtubeOverrides', {}); }
        function saveYoutubeOverrides(data) { GM_setValue('youtubeOverrides', data); }
        function getYoutubeOverrideUrl(info) { return info ? (loadYoutubeOverrides()[youtubeOverrideKey(info)] || null) : null; }

        // ---- YouTube sans cle d'API (v6.27) ----
        //
        // Une chaine + un mot-cle associes a la serie (une fois, a partir du
        // lien d'une de ses videos). Recherche via la page "rechercher" de la
        // chaine (ytInitialData). Titres "EP 364" ou compilations "EP 365-384"
        // / "EP 201 - EP 250" : episode seul d'abord, sinon la plus petite
        // compilation qui le contient, position = (n - premier) x duree / nb
        // (pas de chapitres sur la chaine testee "Anime Zone", episodes de
        // duree egale ~7 min). Remplace la version v6.5 (cle API obligatoire).
        function getYoutubeChannelAssociation(info) { return GM_getValue('youtubeChannelAssociations', {})[storageKey(info)] || null; }
        function setYoutubeChannelAssociation(info, assoc) {
            const all = GM_getValue('youtubeChannelAssociations', {});
            all[storageKey(info)] = assoc;
            GM_setValue('youtubeChannelAssociations', all);
        }
        function isYoutubeMode(info) { return !!GM_getValue('youtubeMode', {})[storageKey(info)]; }
        function setYoutubeMode(info, on) {
            const all = GM_getValue('youtubeMode', {});
            if (on) all[storageKey(info)] = true; else delete all[storageKey(info)];
            GM_setValue('youtubeMode', all);
        }
        // ucbcb=1 dans les adresses YouTube : evite la page de consentement aux
        // cookies (Europe) qui renvoie une page sans resultats (v6.37).
        function ytInitialJson(html, varName) {
            const m = html.match(new RegExp(varName + '\\s*=\\s*(\\{.+?\\});(?:var |<\\/script>)', 's'));
            return m ? JSON.parse(m[1]) : null;
        }
        function ytTimeToSec(t) { return String(t || '').split(':').reduce((acc, x) => acc * 60 + Number(x), 0); }
        // Titre YouTube -> nom compare sans accents/espaces/ponctuation.
        function ytNorm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ''); }
        // "EP 364", "Episode 364", "EP 365-384", "EP 201 - EP 250" -> {first,last}
        // contenant n, sinon null (v6.34 : "Episode N" n'etait pas reconnu).
        function episodeRangeInTitle(title, n) {
            const re = /\b(?:ep(?:isode|isodio)?s?|[eé]pisode)\.?\s*(\d+)(?:\s*(?:-|~|à|a|to)\s*(?:ep(?:isode)?\.?\s*)?(\d+))?/gi;
            let m;
            while ((m = re.exec(title))) {
                const a = Number(m[1]), b = Number(m[2] || m[1]);
                if (n >= a && n <= b && b - a < 200) return { first: a, last: b };
            }
            return null;
        }
        // Recherche YouTube generale (v6.34, sans cle d'API) quand la video
        // cale ou est morte : resultats dont le titre contient un des noms de
        // la serie (avant / entre parentheses) ET le numero d'episode.
        // v6.37 : chaque nom x ("episode N vostfr", "EP N") - les compilations
        // sont souvent titrees avec le nom anglais ("Ten Thousand Worlds EP 181 - EP 200").
        function searchYoutubeForEpisode(info) {
            const n = Number(info.episodeNumber);
            const full = info.seriesName || '';
            const names = [full.replace(/\([^)]*\)/g, ' ').trim(), (full.match(/\(([^)]+)\)/) || [])[1], full]
                .filter((v) => v && ytNorm(v).length >= 4);
            if (!n || !names.length) return Promise.resolve([]);
            const queries = [];
            names.slice(0, 2).forEach((v) => queries.push(v + ' episode ' + n + ' vostfr', v + ' EP ' + n));
            const seen = {}, out = [];
            return Promise.all(queries.map((q) => fetchPageHtml('https://www.youtube.com/results?hl=fr&ucbcb=1&search_query=' + encodeURIComponent(q)).catch(() => ''))).then((pages) => {
                pages.forEach((html) => (function walk(o) {
                    if (Array.isArray(o)) { o.forEach(walk); return; }
                    if (!o || typeof o !== 'object') return;
                    if (o.videoId && o.title && o.lengthText && o.ownerText && !seen[o.videoId]) {
                        seen[o.videoId] = true;
                        const title = o.title.simpleText || (o.title.runs || []).map((r) => r.text).join('');
                        const owner = (o.ownerText.runs || [])[0] || {};
                        const be = owner.navigationEndpoint && owner.navigationEndpoint.browseEndpoint;
                        const name = names.find((v) => ytNorm(title).indexOf(ytNorm(v)) !== -1);
                        const range = episodeRangeInTitle(title, n);
                        // Extraits / bandes-annonces : pas l'episode entier.
                        const teaser = /highlight|trailer|preview|teaser|bande[- ]annonce|apercu|aperçu|clip|shorts?/i.test(title);
                        const vf = /vostfr|\bfr\b|fran[cç]ais/i.test(title);
                        // Badge "Sous-titres" = vraie piste traduisible en FR. Sans
                        // badge ni FR : sous-titres anglais incrustes, ecartee (v6.35).
                        const cc = /"label":"(?:Sous-titres|CC|Subtitles)"/.test(JSON.stringify(o.badges || []));
                        if (name && range && be && be.browseId && !teaser && (vf || cc)) {
                            out.push({ id: o.videoId, title: title, len: ytTimeToSec(o.lengthText.simpleText), channelId: be.browseId, channelName: owner.text || '',
                                keyword: name, first: range.first, last: range.last, vf: vf, score: (vf ? 2 : 0) + (range.first === range.last ? 1 : 0) });
                        }
                    }
                    Object.keys(o).forEach((k) => walk(o[k]));
                })(html && ytInitialJson(html, 'var ytInitialData')));
                return out.sort((a, b) => (b.score - a.score) || ((a.last - a.first) - (b.last - b.first))).slice(0, 5);
            });
        }
        // Compilation : debut de chaque episode lu dans les chapitres de la
        // video (v6.36) si chaque episode a le sien ("EP 366", ou autant de
        // chapitres que d'episodes) ; sinon duree / nb d'episodes.
        function chapterStarts(html, first, last) {
            const chaps = [];
            (function walk(o) {
                if (Array.isArray(o)) { o.forEach(walk); return; }
                if (!o || typeof o !== 'object') return;
                if (o.chapterRenderer) chaps.push({ t: Math.floor(Number(o.chapterRenderer.timeRangeStartMillis) / 1000), title: (o.chapterRenderer.title || {}).simpleText || '' });
                Object.keys(o).forEach((k) => walk(o[k]));
            })(ytInitialJson(html, 'var ytInitialData'));
            const count = last - first + 1, starts = [];
            chaps.forEach((c) => {
                const m = c.title.match(/\b(?:ep(?:isode)?s?|[eé]pisode)\.?\s*(\d+)/i);
                const n = m && Number(m[1]);
                if (n >= first && n <= last && starts[n - first] === undefined) starts[n - first] = c.t;
            });
            // Chapitres sans numero d'episode : un par episode, dans l'ordre.
            if (!starts.length) return chaps.length === count ? chaps.map((c) => c.t) : null;
            for (let i = 0; i < count; i++) if (starts[i] === undefined) return null;
            return starts;
        }
        function positionHit(hit, n) {
            hit.perEp = hit.len / (hit.last - hit.first + 1);
            hit.start = Math.floor((n - hit.first) * hit.perEp);
            if (hit.first === hit.last) return Promise.resolve(hit);
            return fetchPageHtml('https://www.youtube.com/watch?ucbcb=1&v=' + hit.id).then((html) => {
                const starts = chapterStarts(html, hit.first, hit.last);
                if (starts) { hit.starts = starts; hit.start = starts[n - hit.first]; }
                return hit;
            }).catch(() => hit);
        }
        // Resultat choisi : chaine retenue pour la serie (bascule auto ensuite)
        // + cet episode lu tout de suite sur cette video.
        function useYoutubeSearchResult(info, r) {
            setYoutubeChannelAssociation(info, { channelId: r.channelId, channelHandle: null, channelName: r.channelName, titleKeyword: r.keyword });
            const hit = { id: r.id, title: r.title, first: r.first, last: r.last, len: r.len };
            setStatus('Ouverture de la video YouTube...');
            positionHit(hit, Number(info.episodeNumber)).then(() => {
                storeYoutubeHit(info, hit);
                setYoutubeMode(info, true);
                console.log('[AnimeTracker v6] YouTube (resultat choisi) : ' + r.title + ' - chaine ' + r.channelName + ' retenue pour la serie' + (hit.starts ? ' (chapitres)' : ''));
                applyLoadedEpisode(info, false, true);
            });
        }
        // Vignettes des resultats de la recherche YouTube dans `zone` ; clic =
        // useYoutubeSearchResult (+ onPick, ex. fermer l'encadre).
        function renderYoutubeChoices(zone, info, onPick) {
            return searchYoutubeForEpisode(info).then((results) => {
                if (!zone.isConnected || currentEpisode !== info) return;
                if (!results.length) { zone.textContent = 'Rien de sur trouve sur YouTube (nom + episode ' + info.episodeNumber + ').'; return; }
                zone.innerHTML = '<div style="margin-bottom:4px;">Sur YouTube (clique pour regarder) :</div>' + results.map((r, i) =>
                    '<div data-yt="' + i + '" style="display:flex;gap:8px;align-items:center;cursor:pointer;background:#1f1508;border:1px solid #5a4010;border-radius:6px;padding:4px;margin-bottom:4px;">' +
                    '<img src="https://i.ytimg.com/vi/' + escapeHtml(r.id) + '/mqdefault.jpg" style="width:96px;height:54px;object-fit:cover;border-radius:4px;flex-shrink:0;">' +
                    '<div style="min-width:0;"><div style="color:#fff;font-size:12px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">' + escapeHtml(r.title) + '</div>' +
                    '<div style="font-size:11px;"><span style="opacity:.8;">' + escapeHtml(r.channelName) + (r.first !== r.last ? ' - compilation ep. ' + r.first + '-' + r.last : '') + '</span> ' +
                    // VOSTFR = annonce dans le titre ; sinon piste de sous-titres
                    // traduite automatiquement en francais par YouTube.
                    (r.vf ? '<span style="background:#2e7d32;color:#fff;border-radius:3px;padding:0 4px;font-weight:bold;">VOSTFR</span>'
                        : '<span style="background:#b26a00;color:#fff;border-radius:3px;padding:0 4px;font-weight:bold;" title="Sous-titres traduits automatiquement en francais par YouTube">ST auto FR</span>') +
                    '</div></div></div>').join('');
                zone.querySelectorAll('[data-yt]').forEach((el) => el.addEventListener('click', () => {
                    if (onPick) onPick();
                    useYoutubeSearchResult(info, results[Number(el.getAttribute('data-yt'))]);
                }));
            }).catch((e) => { zone.textContent = 'Recherche YouTube impossible : ' + e.message; });
        }
        // Bouton "Trouver sur YouTube" : vignettes au choix dans l'encadre du calque.
        function showYoutubeChooser(info) {
            if (!overlayEls) return;
            const box = overlayEls.siteErrorBox;
            box.setAttribute('data-kind', 'youtube');
            box.innerHTML = '<div style="font-size:16px;font-weight:bold;margin-bottom:8px;">Episode ' + escapeHtml(String(info.episodeNumber)) + ' sur YouTube</div>' +
                '<div id="ed-yt-results" style="font-size:12px;text-align:left;">Recherche sur YouTube...</div>' +
                '<div style="margin-top:12px;"><button type="button" data-act="close" style="background:#333;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;">Fermer</button></div>';
            box.style.display = 'block';
            box.querySelector('[data-act="close"]').addEventListener('click', () => { box.style.display = 'none'; });
            renderYoutubeChoices(box.querySelector('#ed-yt-results'), info, () => { box.style.display = 'none'; });
        }
        function findYoutubeEpisode(assoc, n) {
            const path = assoc.channelId ? 'channel/' + assoc.channelId : assoc.channelHandle;
            const kw = ytNorm(assoc.titleKeyword);
            const search = (q) => fetchPageHtml('https://www.youtube.com/' + path + '/search?ucbcb=1&query=' + encodeURIComponent(q)).then((html) => {
                const vids = [];
                (function walk(o) {
                    if (Array.isArray(o)) { o.forEach(walk); return; }
                    if (!o || typeof o !== 'object') return;
                    if (o.videoId && o.title && o.lengthText) vids.push({ id: o.videoId, title: o.title.simpleText || (o.title.runs || []).map((r) => r.text).join(''), len: ytTimeToSec(o.lengthText.simpleText) });
                    Object.keys(o).forEach((k) => walk(o[k]));
                })(ytInitialJson(html, 'var ytInitialData'));
                let best = null;
                vids.forEach((v) => {
                    if (!v.len || ytNorm(v.title).indexOf(kw) === -1) return;
                    const r = episodeRangeInTitle(v.title, n);
                    if (!r) return;
                    const a = r.first, b = r.last;
                    if (!best || (b - a) < (best.last - best.first)) best = { id: v.id, title: v.title, first: a, last: b, len: v.len };
                });
                return best && positionHit(best, n);
            });
            return search(assoc.titleKeyword + ' EP ' + n).then((hit) => hit || search(assoc.titleKeyword));
        }
        // Le fragment #vcseg garde les bornes de la compilation : le suivi
        // avance tout seul quand la video passe a l'episode suivant.
        function youtubeEmbedFor(hit) {
            return 'https://www.youtube.com/embed/' + hit.id + '?autoplay=1&start=' + hit.start + '&cc_load_policy=1&cc_lang_pref=fr&hl=fr#vcseg=' + hit.first + '-' + hit.last + '-' + Math.round(hit.perEp) + (hit.starts ? '-' + hit.starts.join('.') : '');
        }
        function storeYoutubeHit(info, hit) {
            const all = loadYoutubeOverrides();
            all[youtubeOverrideKey(info)] = youtubeEmbedFor(hit);
            saveYoutubeOverrides(all);
        }
        // Bascule l'episode (et la suite de la serie) sur YouTube.
        function switchToYoutube(info, reason) {
            const go = (assoc) => {
                if (!assoc) return;
                setStatus('Recherche de l\'episode ' + info.episodeNumber + ' sur YouTube (' + assoc.channelName + ')...');
                return findYoutubeEpisode(assoc, Number(info.episodeNumber)).then((hit) => {
                    if (!hit) { setStatus('Episode ' + info.episodeNumber + ' introuvable sur la chaine YouTube ' + assoc.channelName + ' : choisis une autre video.'); showYoutubeChooser(info); return; }
                    storeYoutubeHit(info, hit);
                    setYoutubeMode(info, true);
                    console.log('[AnimeTracker v6] YouTube (' + reason + ') : ' + hit.title + ' a ' + hit.start + 's');
                    applyLoadedEpisode(info, false, true);
                }).catch((e) => setStatus('Recherche YouTube impossible : ' + e.message));
            };
            const assoc = getYoutubeChannelAssociation(info);
            if (assoc && assoc.titleKeyword && (assoc.channelId || assoc.channelHandle)) return go(assoc);
            showYoutubeChooser(info);
        }
        function useYoutubeAutoForCurrentEpisode() {
            if (!currentEpisode) { alert('Ouvre d\'abord un episode.'); return; }
            showYoutubeChooser(currentEpisode);
        }
        function leaveYoutubeMode() {
            if (!currentEpisode) return;
            setYoutubeMode(currentEpisode, false);
            // Oublie tous les liens YouTube memorises de la serie (sinon l'episode
            // de la page relue repartait sur YouTube).
            const prefix = storageKey(currentEpisode) + '::';
            const overrides = loadYoutubeOverrides();
            Object.keys(overrides).forEach((k) => { if (k.indexOf(prefix) === 0) delete overrides[k]; });
            saveYoutubeOverrides(overrides);
            ytActive = false;
            // Sites "une page par episode" : l'episode suivi sur YouTube n'a ni
            // lecteur ni liens suivant/precedent du site -> on relit la vraie
            // page (sinon "Aucun episode suivant detecte", signale v6.27).
            if (currentEpisode.navStyle === 'page') {
                setStatus('Retour a la source du site...');
                // Page re-telechargee : dans la page affichee, notre script a deja
                // neutralise le lecteur du site (about:blank).
                fetchPageHtml(location.href).then((html) => site.extract(new DOMParser().parseFromString(html, 'text/html'), location.href))
                    .then((info) => { if (info) applyLoadedEpisode(info, false, true); else setStatus('Page de l\'episode illisible, recharge la page (F5).'); })
                    .catch(() => setStatus('Page de l\'episode illisible, recharge la page (F5).'));
                return;
            }
            applyLoadedEpisode(currentEpisode, false, true);
        }

        function isAutoNextEnabled() { return GM_getValue('autoNextEnabled', true); }
        function setAutoNextEnabled(v) { GM_setValue('autoNextEnabled', v); }
        function isAutoOpenEnabled() { return GM_getValue('popupAutoOpen', true); }
        function setAutoOpenEnabled(v) { GM_setValue('popupAutoOpen', v); }

        // Filtre "voir seulement ce site" partage entre le panneau et la
        // colonne du lecteur (un seul reglage, applique partout) - demande
        // par l'utilisateur pour naviguer les animes suivis site par site
        // maintenant que la liste est unifiee. 'all' = pas de filtre.
        // 'behind' (defaut v6.29) : resume limite aux sites avec des animes a rattraper ;
        // les listes de series restent completes.
        function getSiteFilter() { return GM_getValue('panelSiteFilter2', 'behind'); }
        function setSiteFilter(v) { GM_setValue('panelSiteFilter2', v); }
        function matchesSiteFilter(siteId) { const f = getSiteFilter(); return f === 'all' || f === 'behind' || f === siteId; }
        function buildSiteFilterOptionsHtml() {
            const current = getSiteFilter();
            const opt = (value, label) => '<option value="' + value + '"' + (current === value ? ' selected' : '') + '>' + label + '</option>';
            return opt('behind', 'Sites à rattraper') + opt('all', 'Tous les sites') + SITES.map((s) => opt(s.id, s.label)).join('');
        }

        // Historique (v6.29) : une ligne par serie regardee (suivie ou non), 50 max.
        const HISTORY_MAX = 50;
        function loadHistory() { return GM_getValue('watchHistory', {}); }
        function saveHistory(h) {
            const keys = Object.keys(h).sort((a, b) => String(h[b].watchedAt).localeCompare(String(h[a].watchedAt)));
            keys.slice(HISTORY_MAX).forEach((k) => delete h[k]);
            GM_setValue('watchHistory', h);
        }
        // Suivie = entree de progression non exclue. Depuis v6.29 un nouvel anime n'est
        // plus suivi d'office : seulement par le bouton, ou si le meme anime est deja
        // suivi sur ce site (saison suivante anime-sama, variante de titre Odysee).
        function isSeriesTracked(key) { return !!loadProgress()[key] && !isSeriesExcluded(key); }
        function hasTrackedSibling(info, progress) {
            const norm = normalizeSeriesName(info.seriesName);
            const excluded = loadExcludedSeries();
            return Object.keys(progress).some((k) => !excluded[k] && progress[k].site === info.site && normalizeSeriesName(progress[k].seriesName) === norm);
        }

        function recordEpisodeProgress(info, force) {
            if (!info || !info.seriesUrl || !info.episodeNumber) return;
            const key = storageKey(info);
            const history = loadHistory();
            history[key] = {
                site: info.site, siteLabel: info.siteLabel, siteTag: info.siteTag,
                seriesName: info.seriesName, seriesUrl: info.seriesUrl,
                episodeLabel: info.episodeLabel, episodeNumber: info.episodeNumber,
                episodeUrl: info.resumeUrl, watchedAt: new Date().toISOString()
            };
            saveHistory(history);
            if (info.latestEpisodeNumber) latestKnownEpisode[key] = info.latestEpisodeNumber;
            if (info.navStyle === 'page' && info.nextPageUrl) newEpisodes[key] = { seriesName: info.seriesName, site: info.site, url: info.nextPageUrl };
            else if (info.navStyle === 'index' && info.totalEpisodes && info.episodeIndex < info.totalEpisodes - 1) {
                // resumeUrlsByIndex[i] : URL de reprise reelle de l'episode a
                // la position i (peut differer de "index+1" - cf. SITE_ODYSEE
                // qui peut avoir des trous dans la numerotation).
                newEpisodes[key] = { seriesName: info.seriesName, site: info.site, url: info.resumeUrlsByIndex[info.episodeIndex + 1] };
            } else delete newEpisodes[key];
            if (isSeriesExcluded(key)) return;
            const progress = loadProgress();
            if (!progress[key] && !force && !hasTrackedSibling(info, progress)) return;
            progress[key] = {
                site: info.site, siteLabel: info.siteLabel, siteTag: info.siteTag,
                seriesName: info.seriesName, seriesUrl: info.seriesUrl,
                episodeLabel: info.episodeLabel, episodeNumber: info.episodeNumber,
                episodeUrl: info.resumeUrl,
                watchedAt: new Date().toISOString()
            };
            // Odysee : la serie est reperee par chaine + titre de la video, et
            // le meme anime existe sur plusieurs chaines / avec des titres
            // varies -> une entree par variante (5 lignes "Wan Jie Du Zun",
            // signale 2026-10-02). Une seule entree par anime : la derniere vue
            // remplace les autres. Pas sur les autres sites : anime-sama donne
            // le meme nom a toutes les saisons.
            if (info.site === 'odysee') {
                const norm = normalizeSeriesName(info.seriesName);
                Object.keys(progress).forEach((k) => {
                    if (k !== key && progress[k].site === 'odysee' && normalizeSeriesName(progress[k].seriesName) === norm) delete progress[k];
                });
            }
            saveProgress(progress);
        }

        // Nettoyage unique des doublons Odysee deja enregistres : on garde le
        // moins avance (demande de l'utilisateur : ne pas sauter d'episodes).
        function mergeOdyseeDuplicatesOnce() {
            if (GM_getValue('odyseeDedupDone', false)) return;
            const progress = loadProgress();
            const keep = {};
            Object.keys(progress).forEach((k) => {
                const e = progress[k];
                if (e.site !== 'odysee') return;
                const norm = normalizeSeriesName(e.seriesName);
                if (!keep[norm] || Number(e.episodeNumber) < Number(progress[keep[norm]].episodeNumber)) keep[norm] = k;
            });
            let removed = 0;
            Object.keys(progress).forEach((k) => {
                const e = progress[k];
                if (e.site === 'odysee' && keep[normalizeSeriesName(e.seriesName)] !== k) { delete progress[k]; removed++; }
            });
            if (removed) { saveProgress(progress); console.log('[AnimeTracker v6] doublons Odysee fusionnes : ' + removed); }
            GM_setValue('odyseeDedupDone', true);
        }

        function deleteProgressEntry(key) {
            const progress = loadProgress();
            if (!progress[key]) return false;
            delete progress[key];
            saveProgress(progress);
            delete newEpisodes[key];
            return true;
        }

        function formatDate(iso) { return new Date(iso).toLocaleString('fr-FR'); }

        // ---- Export / import (identique dans l'esprit a v4, "site" en plus) ----

        function buildHtml() {
            const progress = loadProgress();
            const excluded = loadExcludedSeries();
            const entries = Object.keys(progress).map((k) => progress[k]).filter((e) => !excluded[storageKey(e)] && !excluded[e.seriesUrl]);
            entries.sort((a, b) => (a.siteLabel || '').localeCompare(b.siteLabel || '') || a.seriesName.localeCompare(b.seriesName));
            let items;
            if (entries.length === 0) {
                items = '<p>Aucun anime suivi pour le moment.</p>';
            } else {
                items = '<ul>';
                let currentSite = null;
                entries.forEach((e) => {
                    if (e.siteLabel !== currentSite) { items += '</ul><h2>' + escapeHtml(e.siteLabel || 'Site inconnu') + '</h2><ul>'; currentSite = e.siteLabel; }
                    items += '<li><strong>' + escapeHtml(e.seriesName) + '</strong> - ' + escapeHtml(e.episodeLabel) +
                        ' - <a href="' + escapeHtml(e.episodeUrl) + '">Reprendre ici</a>' +
                        ' <span style="color:#888;font-size:12px;">(' + formatDate(e.watchedAt) + ')</span></li>';
                });
                items += '</ul>';
            }
            const dataBlock = '<script type="application/json" id="ed-progress-backup">' +
                JSON.stringify(entries).replace(/</g, '\\u003c') + '</' + 'script>' +
                '<script type="application/json" id="ed-history-backup">' +
                JSON.stringify(Object.keys(loadHistory()).map((k) => loadHistory()[k])).replace(/</g, '\\u003c') + '</' + 'script>';
            return '<!doctype html><html><head><meta charset="utf-8">' +
                '<meta name="viewport" content="width=device-width, initial-scale=1">' +
                '<title>Ma progression - Vidéo Continuum</title>' +
                '<style>body{font-family:Arial,sans-serif;background:#0d0d12;color:#eee;padding:20px;} a{color:#03d0fc;} li{margin-bottom:12px;font-size:15px;} h2{color:#03d0fc;font-size:16px;border-bottom:1px solid #333;padding-bottom:4px;}</style>' +
                '</head><body><h1>Ma progression - Vidéo Continuum</h1>' + items + dataBlock + '</body></html>';
        }

        function downloadHtml(filename) {
            const blob = new Blob([buildHtml()], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
        }

        const realWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;
        function isFileSystemAccessSupported() { return typeof realWindow.showSaveFilePicker === 'function'; }

        function idbOpen() {
            return new Promise((resolve, reject) => {
                const req = realWindow.indexedDB.open('animeTrackerV6', 1);
                req.onupgradeneeded = () => { req.result.createObjectStore('handles'); };
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        }
        function idbGetHandle(key) {
            return idbOpen().then((db) => new Promise((resolve, reject) => {
                const tx = db.transaction('handles', 'readonly');
                const req = tx.objectStore('handles').get(key);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            }));
        }
        function idbSetHandle(key, handle) {
            return idbOpen().then((db) => new Promise((resolve, reject) => {
                const tx = db.transaction('handles', 'readwrite');
                tx.objectStore('handles').put(handle, key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            }));
        }

        let backupFileHandle = null;
        function updateBackupStatusUi() {
            const text = backupFileHandle ? ('Sauvegarde liee : ' + backupFileHandle.name) : 'Sauvegarde : telechargement classique';
            const el = document.getElementById('ep-backup-status');
            if (el) el.textContent = text;
            if (overlayEls && overlayEls.backupStatusEl) overlayEls.backupStatusEl.textContent = text;
        }
        function loadBackupFileHandle() {
            if (!isFileSystemAccessSupported()) return Promise.resolve();
            return idbGetHandle('backupFile').then((handle) => {
                backupFileHandle = handle || null;
                updateBackupStatusUi();
            }).catch((e) => console.log('[AnimeTracker v6] impossible de relire le fichier de sauvegarde lie', e));
        }
        function chooseBackupFile() {
            if (!isFileSystemAccessSupported()) {
                alert('Ton navigateur ne supporte pas la sauvegarde directe dans un dossier (File System Access API, dispo sur Chrome/Edge).');
                return;
            }
            realWindow.showSaveFilePicker({
                suggestedName: 'ma-progression-anime-tracker.html',
                types: [{ description: 'Page HTML', accept: { 'text/html': ['.html'] } }]
            }).then((handle) => {
                backupFileHandle = handle;
                return idbSetHandle('backupFile', handle);
            }).then(() => { updateBackupStatusUi(); return writeBackupFile(); }).catch((e) => {
                if (e && e.name === 'AbortError') return;
                alert('Impossible de configurer le fichier de sauvegarde : ' + e.message);
            });
        }
        function ensureBackupPermission(handle) {
            return handle.queryPermission({ mode: 'readwrite' }).then((state) => {
                if (state === 'granted') return true;
                return handle.requestPermission({ mode: 'readwrite' }).then((res) => res === 'granted');
            });
        }
        function reauthorizeBackupFile() {
            if (!backupFileHandle) { alert('Aucun fichier de sauvegarde lie - utilise "Choisir fichier sauvegarde" d\'abord.'); return; }
            ensureBackupPermission(backupFileHandle).then((ok) => {
                alert(ok ? ('Acces reautorise pour "' + backupFileHandle.name + '".') : 'Permission refusee.');
                updateBackupStatusUi();
            });
        }
        function writeBackupFile() {
            if (!backupFileHandle) return Promise.resolve(false);
            return ensureBackupPermission(backupFileHandle).then((ok) => {
                if (!ok) throw new Error('permission refusee');
                return backupFileHandle.createWritable();
            }).then((writable) => writable.write(buildHtml()).then(() => writable.close())).then(() => true).catch((e) => {
                console.log('[AnimeTracker v6] echec ecriture fichier lie, repli sur telechargement', e);
                return false;
            });
        }
        function saveProgressBackup() {
            return writeBackupFile().then((wrote) => { if (!wrote) downloadHtml('ma-progression-anime-tracker.html'); });
        }
        function exportProgress() { saveProgressBackup(); }
        function maybeAutoExport() {
            if (Object.keys(loadProgress()).length === 0) return;
            const today = new Date().toISOString().slice(0, 10);
            if (GM_getValue('lastAutoExport', null) === today) return;
            saveProgressBackup();
            GM_setValue('lastAutoExport', today);
        }

        function parseFrenchDateToIso(text) {
            const m = text.match(/(\d{2})\/(\d{2})\/(\d{4})[^\d]+(\d{2}):(\d{2}):(\d{2})/);
            if (!m) return null;
            const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), Number(m[4]), Number(m[5]), Number(m[6]));
            return isNaN(d.getTime()) ? null : d.toISOString();
        }
        function parseProgressBackup(html) {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const dataEl = doc.getElementById('ed-progress-backup');
            if (dataEl) {
                try {
                    const entries = JSON.parse(dataEl.textContent);
                    if (Array.isArray(entries)) return entries;
                } catch (e) { console.log('[AnimeTracker v6] bloc JSON illisible, repli sur le parsing HTML', e); }
            }
            // Repli pour un export v4 (esprit-donghua uniquement, pas de champ "site").
            const items = Array.from(doc.querySelectorAll('li'));
            return items.map((li) => {
                const strong = li.querySelector('strong');
                const link = li.querySelector('a[href]');
                const dateSpan = li.querySelector('span');
                if (!strong || !link) return null;
                const seriesName = strong.textContent.trim();
                const fullText = li.textContent;
                const afterSeries = fullText.slice(fullText.indexOf(seriesName) + seriesName.length).replace(/^\s*-\s*/, '');
                const episodeLabel = afterSeries.split(' - Reprendre ici')[0].trim();
                return {
                    site: 'esprit-donghua', siteLabel: 'Esprit Donghua', siteTag: 'ED',
                    seriesName: seriesName, episodeLabel: episodeLabel, episodeUrl: link.getAttribute('href'),
                    seriesUrl: 'legacy:' + seriesName, episodeNumber: null,
                    watchedAt: dateSpan ? parseFrenchDateToIso(dateSpan.textContent) : null
                };
            }).filter(Boolean);
        }
        function mergeImportedHistory(html) {
            const el = new DOMParser().parseFromString(html, 'text/html').getElementById('ed-history-backup');
            let list = [];
            try { list = el ? JSON.parse(el.textContent) : []; } catch (e) { list = []; }
            if (!Array.isArray(list) || !list.length) return;
            const h = loadHistory();
            list.forEach((raw) => {
                const e = sanitizeImportedEntry(raw);
                if (!e) return;
                const key = e.site + '::' + e.seriesUrl;
                if (!h[key] || String(e.watchedAt) > String(h[key].watchedAt)) h[key] = e;
            });
            saveHistory(h);
        }
        function mergeImportedEntries(entries) {
            const progress = loadProgress();
            let added = 0, updated = 0, skipped = 0;
            entries.forEach((raw) => {
                const e = sanitizeImportedEntry(raw);
                if (!e) { skipped++; return; }
                const site = e.site;
                const seriesUrl = e.seriesUrl;
                const key = site + '::' + seriesUrl;
                const existing = progress[key];
                if (existing) {
                    if (existing.watchedAt && e.watchedAt && new Date(existing.watchedAt) >= new Date(e.watchedAt)) { skipped++; return; }
                    progress[key] = Object.assign({}, existing, e, { site: site, seriesUrl: seriesUrl });
                    updated++;
                } else {
                    progress[key] = e;
                    added++;
                }
            });
            saveProgress(progress);
            return { added: added, updated: updated, skipped: skipped };
        }
        function importProgressFile(file) {
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const entries = parseProgressBackup(String(reader.result));
                    if (entries.length === 0) { alert('Aucune entree de progression trouvee dans ce fichier.'); return; }
                    const result = mergeImportedEntries(entries);
                    mergeImportedHistory(String(reader.result));
                    alert('Import termine : ' + result.added + ' ajoutee(s), ' + result.updated + ' mise(s) a jour, ' + result.skipped + ' ignoree(s).');
                    buildPersistentPanel();
                } catch (e) { alert('Import impossible : ' + e.message); }
            };
            reader.onerror = () => alert('Impossible de lire ce fichier.');
            reader.readAsText(file);
        }

        // ---- Calque plein ecran ----

        let currentEpisode = null;
        let currentConfig = { introStart: null, introEnd: null, outroStart: null, outroEnd: null, autoNext: true };
        let outroSignalSent = false;
        let advancingToNext = false;
        let cancelCountdown = null;
        let nextNowCountdown = null;
        let overlayEls = null;
        let outroSkipSuspended = false;
        let newEpisodes = {};
        let latestKnownEpisode = {};
        let lastNewEpisodesCheckAt = null;

        // ---- Detection "chargement tres lent" (surcharge serveur probable) ----
        // Base sur la meme progression de % de buffer que l'affichage normal
        // (voir stage 'buffering' plus bas) : si ce % n'avance plus pendant
        // BUFFER_STALL_WARNING_MS, on suppose une surcharge cote serveur
        // (constate en usage reel sur Odysee, cf. HISTORIQUE.md) plutot qu'un
        // bug du script, et on le signale au lieu de laisser un "Chargement..."
        // silencieux.
        const BUFFER_STALL_WARNING_MS = 15000;
        let lastBufferPct = -1;
        let lastBufferProgressAt = 0;
        let bufferStallTimer = null;

        function renderLoadStatus() {
            if (lastBufferPct < 0) return;
            if (Date.now() - lastBufferProgressAt >= BUFFER_STALL_WARNING_MS) {
                setStatus('Chargement tres lent (' + lastBufferPct + '%) - le serveur semble surcharge', true);
            } else {
                setStatus('Chargement... ' + lastBufferPct + '%');
            }
        }

        function stopBufferStallTracking() {
            if (bufferStallTimer) { clearInterval(bufferStallTimer); bufferStallTimer = null; }
        }

        function startBufferStallTracking() {
            lastBufferPct = -1;
            lastBufferProgressAt = Date.now();
            stopBufferStallTracking();
            bufferStallTimer = setInterval(renderLoadStatus, 2000);
        }

        // ---- Sections repliables + signalement d'incident (v6.8) ----
        const BTN_STYLE = 'background:#333;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;';

        function collapsibleSection(key, title, innerHtml, open, sub) {
            // sub : sous-menu (decale et plus clair, ex. Reglages > Plus).
            return '<details data-sec="' + key + '"' + (open ? ' open' : '') + ' style="padding-top:2px;' + (sub ? 'margin-left:10px;' : '') + '">' +
                '<summary style="cursor:pointer;font-size:' + (sub ? 11 : 12) + 'px;font-weight:bold;color:#eee;background:' + (sub ? '#4a4a58' : '#3a3a46') + ';padding:' + (sub ? '4px 8px' : '5px 8px') + ';border-radius:4px;">' + title + '</summary>' +
                '<div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">' + innerHtml + '</div></details>';
        }

        // Gros bouton "Suivre" (v6.29) : case cachee dans un label, couleur par :has(:checked).
        function ensureVcStyles() {
            if (document.getElementById('vc-styles')) return;
            const st = document.createElement('style');
            st.id = 'vc-styles';
            st.textContent = '.vc-track{display:block;text-align:center;padding:8px;border-radius:6px;font-size:13px;font-weight:bold;cursor:pointer;background:#333;color:#ddd;border:1px solid #555;}' +
                '.vc-track.vc-small{flex:1;padding:6px 4px;font-size:11px;}' +
                '.vc-track:has(input:checked){background:#2e7d32;color:#fff;border-color:#4caf50;}' +
                '.vc-track input{display:none;}.vc-track .on{display:none;}.vc-track:has(input:checked) .on{display:inline;}.vc-track:has(input:checked) .off{display:none;}';
            (document.head || document.documentElement).appendChild(st);
        }
        function toggleButtonsHtml(prefix, autoNext, autoOpen) {
            ensureVcStyles();
            const t = (id, on, label) => '<label class="vc-track vc-small"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span class="off">' + label + '</span><span class="on">&#10003; ' + label + '</span></label>';
            return '<div style="display:flex;gap:4px;">' + t(prefix + 'autonext' + (prefix === 'ed-' ? '-cb' : ''), autoNext, 'Lecture continue') +
                t(prefix + 'autoopen' + (prefix === 'ed-' ? '-cb' : ''), autoOpen, 'Lecteur auto') + '</div>';
        }
        // "Chargement... 42%" -> fine barre ; tout autre message reste en texte.
        function statusHtml(text) {
            const m = /^Chargement\.\.\.(?: (\d+)%)?$/.exec(text || '');
            if (!m) return escapeHtml(text || '');
            const pct = m[1] ? Number(m[1]) : 0;
            return '<div style="display:flex;align-items:center;gap:6px;" title="Chargement de la video"><div style="flex:1;height:4px;background:#333;border-radius:2px;overflow:hidden;"><div style="width:' + pct + '%;height:100%;background:#03d0fc;"></div></div><span style="font-size:10px;color:#aaa;">' + pct + '%</span></div>';
        }
        function trackButtonHtml(id, checked) {
            ensureVcStyles();
            return '<label class="vc-track"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '><span class="off">&#9734; Suivre cet anime</span><span class="on">&#9733; Suivi</span></label>';
        }

        // Endpoint Apps Script (google-apps-script/incidents-collector.gs).
        // Tant que l'URL n'est pas collee, repli sur une issue GitHub
        // pre-remplie (depot public). Le "secret" n'en est pas un (il est
        // dans ce script public) : il ecarte seulement les bots generiques,
        // le vrai garde-fou est le quota journalier cote serveur.
        const INCIDENTS_ENDPOINT_URL = 'https://script.google.com/macros/s/AKfycbyhbP6zqVXnReLV0mcwEWBF68w7zZBfe6DSD7u522SeXECVNzGiHux6FVD8yKEm2H3s/exec';
        const INCIDENTS_SHARED_SECRET = 'c9322995-95ba-4fca-a51f-1d67abd6ea96';
        let incidentDraft = '';
        // Message de resultat garde hors du DOM : le panneau est regenere
        // (ex. 1re verification des nouveaux episodes, 8s apres le
        // chargement) et effacait le "Merci, envoye !" en plein envoi.
        let incidentNote = { text: '', color: '#888' };
        function setIncidentNote(text, color) {
            incidentNote = { text: text, color: color };
            ['ep', 'ed'].forEach((prefix) => {
                const el = document.getElementById(prefix + '-fb-note');
                if (el) { el.textContent = text; el.style.color = color; }
            });
        }

        function incidentSectionHtml(prefix, open) {
            const draft = incidentDraft.replace(/&/g, '&amp;').replace(/</g, '&lt;');
            return collapsibleSection('incident', '&#9888; Signaler un probleme',
                '<select id="' + prefix + '-fb-type" style="width:100%;padding:5px;border-radius:4px;border:none;background:#000;color:#eee;font-size:11px;">' +
                '<option>Bug</option><option>Video ne se lance pas</option><option>Suggestion</option><option>Autre</option></select>' +
                '<textarea id="' + prefix + '-fb-body" rows="4" placeholder="Ce que tu faisais, ce qui s\'est passe..." style="width:100%;box-sizing:border-box;padding:6px;border-radius:4px;border:none;background:#000;color:#eee;font-size:11px;resize:vertical;">' + draft + '</textarea>' +
                '<div style="font-size:10px;color:#888;">Envoye avec : site, anime, episode, version, navigateur.</div>' +
                '<button id="' + prefix + '-fb-send" style="' + BTN_STYLE + '">&#128228; Envoyer</button>' +
                '<span id="' + prefix + '-fb-note" style="font-size:11px;color:' + incidentNote.color + ';">' + incidentNote.text + '</span>', open);
        }

        // ---- Nouveautes (v6.18) : encart repliable, ouvert d'office tant
        // que la version installee n'a pas ete "vue" (ouverture de l'encart).
        const CHANGELOG = [
            ['6.42', ['Boutons Episode precedent / suivant plus petits et plus bas, juste au-dessus de la barre de lecture.']],
            ['6.41', ['Pastilles des vignettes remplacees par une petite icone liste a cases, cases a la couleur de l\'etat, 1re case cochee (croix pour les series exclues), la coche se dessine a l\'apparition.']],
            ['6.40', ['Pastille ✓ sur les vignettes des sites : verte = suivi ici, turquoise = nouvel episode a voir, jaune = suivi sur un autre site, rouge = exclu du suivi.']],
            ['6.39', ['Boutons Episode precedent / suivant deplaces en bas au centre, au-dessus de la barre de lecture.',
                'Le bouton Suivant reste visible (grise, "Pas encore sorti") sur le dernier episode sorti.',
                'Video sans choix de qualite (fichier d\'origine) qui cale : bascule directe sur YouTube au lieu de recharger.']],
            ['6.38', ['Boutons Episode precedent / suivant sur la video, a gauche et a droite du centre : ils apparaissent quand la souris bouge et disparaissent apres 3 s.',
                'Vignettes YouTube : badge VOSTFR (annonce dans le titre) ou ST auto FR (sous-titres traduits automatiquement par YouTube).',
                'Lecture sur YouTube : "Prec." revient a l\'episode precedent au lieu d\'afficher "Aucun episode precedent".']],
            ['6.37', ['Recherche YouTube : essaie aussi le nom anglais de la serie et "EP N" - trouve les compilations (ex. "EP 181 - EP 200") qui ne citent pas le numero cherche.',
                'Lecteur YouTube : le bouton "Plus de videos" est masque (il cachait les reglages).',
                'Episode suivant sur YouTube : ne retombe plus sur le site quand YouTube affiche sa page de consentement aux cookies.']],
            ['6.36', ['"Trouver sur YouTube" cherche tout seul et propose les videos en vignettes (plus de lien a coller) ; la chaine choisie est retenue pour les episodes suivants.', 'Compilations YouTube : le debut de chaque episode est lu dans les chapitres de la video quand elle en a (sinon estime).']],
            ['6.35', ['Recherche YouTube : les videos aux sous-titres anglais incrustes dans l\'image (pas traduisibles en francais) ne sont plus proposees.']],
            ['6.34', ['Video qui cale ou episode indisponible : l\'encadre cherche tout seul l\'episode sur YouTube et affiche les resultats (nom de la serie + numero, VOSTFR en premier). Un clic lance la video et retient la chaine : les prochains episodes qui calent y basculent automatiquement.',
                'Titres YouTube "Episode 243" reconnus (avant : seulement "EP 243").']],
            ['6.33', ['Video qui cale au changement d\'episode : un nouvel essai est fait automatiquement avant d\'afficher l\'encadre "Reessayer".',
                'Choix automatique de la qualite Odysee et case 720p supprimes (Odysee le refuse sans compte : petite fenetre rouge). Avec un compte, regler la qualite sur odysee.com/$/settings.']],
            ['6.32', ['Esprit Donghua a change ses adresses d\'episodes (numerotation par saison) : les series suivies dont l\'adresse ne marchait plus sont retrouvees et corrigees toutes seules, la detection des nouveaux episodes remarche.',
                'Plus d\'encadre jaune "elements tiers suspects" : le detail reste dans la console (F12).']],
            ['6.31', ['Episode suivant : le decompte commence 4 s avant le debut de l\'outro et enchaine 2 s apres (la derniere replique n\'est plus coupee). Sans outro reglee : decompte sur les 4 dernieres secondes, enchainement a la fin.',
                'Decompte en bas a droite (ne cache plus les sous-titres) avec "Suivant maintenant" a cote d\'"Annuler".',
                'Boutons "Fin intro" / "Debut outro" verts quand c\'est regle pour la serie (a la main ou par AniSkip), gris sinon.']],
            ['6.30', ['Numero d\'episode plus gros, chargement en fine barre (les messages d\'erreur restent en texte).',
                '"Lecture continue" et "Lecteur auto" deviennent des boutons comme "Suivi" ; 720p rangee dans Reglages > Plus (sous-menu decale).',
                'Sites tout en bas en petits boutons toujours visibles, avec le choix du mode d\'ouverture juste dessous.']],
            ['6.29', ['Panneaux allégés : boutons principaux en haut, liste par site tout en bas, titres de menus sur fond gris, Réglages réduits à Fin intro / Début outro (le reste dans "Plus"), Odysee et YouTube regroupés dans "Autres sources".',
                '"Suivre cet anime" devient un gros bouton, décoché par défaut pour un nouvel anime (la saison suivante d\'un anime suivi reste suivie). Nouveau "Historique" : une ligne par série regardée, suivie ou non, avec Reprendre / Suivre / croix ; doublons entre sites en rouge.',
                'Par défaut, seuls les sites avec des animes à rattraper sont affichés ; ligne "doublons" quand un anime est suivi sur deux sites.',
                '"Aller" à l\'épisode : corrigé pour les épisodes 1 à 9 d\'Esprit Donghua (zéro devant), ne bloque plus sur un "dernier connu" périmé, et cherche dans la liste de la série si l\'adresse devinée n\'existe pas.']],
            ['6.28', ['"Revenir a la source du site" relit la page de l\'episode : Suivant / Precedent remarchent (avant : "Aucun episode suivant detecte").']],
            ['6.27', ['YouTube sans cle API : "Lire sur YouTube" (ou bouton "Trouver sur YouTube") demande une seule fois le lien d\'une video de la serie, puis trouve l\'episode, meme dans une compilation de 10 ou 20 episodes, avec les sous-titres traduits en francais.',
                'Quand la video cale chez l\'hebergeur, bascule automatique sur YouTube si une chaine est associee ; la serie reste sur YouTube ensuite ("Revenir a la source du site" pour annuler). Le suivi avance tout seul pendant une compilation.']],
            ['6.26', ['Si la video cale chez l\'hebergeur (fichier trop lourd ou mal prepare, cas de certaines chaines Odysee pour Wan Jie Du Zun), un encadre l\'explique et propose : Reessayer, Chercher sur YouTube, Rechercher sur Google, Episode suivant.']],
            ['6.25', ['Plus de message "@connect" dans la console : les nouveaux episodes des sites ajoutes ne sont verifies que depuis ces sites.']],
            ['6.24', ['Odysee : un meme anime publie par plusieurs chaines (ou avec des titres differents) ne cree plus plusieurs lignes de suivi. Les doublons existants sont fusionnes une fois, en gardant le plus ancien episode vu.']],
            ['6.23', ['Fiche de l\'anime sur tous les sites (bouton \u2139 dans le lecteur, le panneau et la fenetre de suivi) : synopsis en francais quand le site le fournit (sinon AniList en anglais), genres, tags sans spoilers, note, nombre d\'episodes, statut et prochain episode.',
                'Sites ajoutes : la verification des nouveaux episodes n\'etait pas autorisee par Tampermonkey, corrige.']],
            ['6.22', ['"Ajouter ce site" (fenetre \u25B6 Mes animes, depuis la page d\'un episode) : le lecteur, le suivi, la reprise, l\'enchainement et AniSkip sur un site non prevu. Teste sur french-anime.com et myfluneo.eu. Menu Tampermonkey : "Retirer ce site".']],
            ['6.21', ['Lecteur de secours automatique : si le lecteur d\'un episode est mort (ex. "video not found"), le lecteur suivant de la page est essaye tout seul.',
                'Si aucun lecteur ne marche, un encadre explique que c\'est le site (video supprimee, hebergeur en panne) et non Video Continuum, cherche tout seul le meme episode sur l\'autre site (Anime-Sama / Animoflix), et propose "Rechercher sur Google" et "Episode suivant".',
                'Les lecteurs d\'autres hebergeurs (ex. lecteur 2 d\'animoflix) peuvent etre pilotes.',
                'Odysee : la verification des nouveaux episodes n\'etait plus autorisee, corrige.']],
            ['6.20', ['Animoflix : le lecteur fonctionne de nouveau (le site est passe de Sibnet, ferme, a ansembed).']],
            ['6.19', ['Section "Sites" : un bouton par site gere (Esprit Donghua, Animoflix, Anime-Sama, Odysee) + choix "Ouvrir dans" : nouvel onglet, nouvelle fenetre ou cet onglet.',
                '"Mes animes" disponible sur TOUS les sites : petit bouton \u25B6 en bas a gauche (ou menu Tampermonkey) qui liste tes animes suivis avec "Reprendre", sans quitter ta page. Le bouton se masque via le menu Tampermonkey.']],
            ['6.18', ['Bouton \u2139 Fiche sur les vignettes d\'Anime-Sama : ouvre la page de l\'anime (synopsis, genres) au lieu de l\'episode.',
                'AniSkip : intro, resume et generique de fin sautes automatiquement quand la communaute AniSkip a les temps de l\'episode (ligne "AniSkip" dans le lecteur, "Changer" si le mauvais anime est reconnu). Tes reglages manuels restent prioritaires : vide-les dans Configuration pour laisser AniSkip faire.',
                'Cet encart Nouveautes.']],
            ['6.17', ['Titre "Video Continuum" centre, version en jaune.']],
            ['6.16', ['Bouton "\u2713 Tout vu" dans la fenetre de suivi d\'un site.']],
            ['6.15', ['Intro et outro avec debut ET fin (resume avant le generique, episode qui continue apres le generique de fin).',
                'Croix \u2715 pour abandonner le suivi d\'un anime.',
                'Encadre "Deja vu jusqu\'a l\'ep. N sur un autre site".',
                'Panneau descendu pour laisser voir le haut du site.']],
            ['6.14', ['Reprise de la lecture la ou tu t\'etais arrete.']]
        ];
        function currentScriptVersion() { return (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '?'; }
        function newsSectionHtml(prevOpen) {
            const unseen = GM_getValue('lastSeenVersion', '') !== currentScriptVersion();
            const body = CHANGELOG.map(([v, items]) => '<div style="font-size:11px;color:#ccc;"><b style="color:#ffd400;">v' + v + '</b><ul style="margin:2px 0 0 16px;padding:0;">' +
                items.map((t) => '<li style="margin:2px 0;">' + escapeHtml(t) + '</li>').join('') + '</ul></div>').join('');
            return collapsibleSection('nouveautes', '&#127381; Nouveautes' + (unseen ? ' <span style="color:#ffd400;">(nouveau !)</span>' : ''), body, prevOpen === undefined ? unseen : prevOpen);
        }
        function bindNewsSection(container) {
            const d = container.querySelector('details[data-sec="nouveautes"]');
            // clic sur le titre seulement : 'toggle' part aussi a l'affichage d'un encart deja ouvert.
            if (d) d.querySelector('summary').addEventListener('click', () => GM_setValue('lastSeenVersion', currentScriptVersion()));
        }

        function bindIncidentSection(container, prefix) {
            const body = container.querySelector('#' + prefix + '-fb-body');
            const sendBtn = container.querySelector('#' + prefix + '-fb-send');
            if (!body || !sendBtn) return;
            body.addEventListener('input', () => { incidentDraft = body.value; });
            sendBtn.addEventListener('click', () => {
                const description = body.value.trim();
                if (!description) { alert('Ecris un message avant d\'envoyer.'); return; }
                const statusEl = document.getElementById('ed-status');
                const report = {
                    action: 'incident', secret: INCIDENTS_SHARED_SECRET,
                    type: container.querySelector('#' + prefix + '-fb-type').value,
                    site: currentEpisode ? currentEpisode.siteLabel : site.label,
                    anime: currentEpisode ? currentEpisode.seriesName : '',
                    episode: currentEpisode ? String(currentEpisode.episodeNumber || '') : '',
                    description: description,
                    version: (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '?',
                    browser: navigator.userAgent,
                    page: location.href,
                    playerStatus: lastStatusText
                };
                if (INCIDENTS_ENDPOINT_URL.indexOf('PASTE_') === 0) {
                    const ctx = '\n\n---\nType : ' + report.type + '\nSite : ' + report.site + '\nAnime : ' + report.anime + ' (ep ' + report.episode + ')\nVersion : ' + report.version + '\nNavigateur : ' + report.browser + '\nPage : ' + report.page;
                    window.open('https://github.com/Tryne-graphik/Vid-os-continuum/issues/new?title=' + encodeURIComponent('[' + report.type + '] ' + report.anime) + '&body=' + encodeURIComponent(description + ctx), '_blank');
                    return;
                }
                sendBtn.disabled = true; sendBtn.textContent = 'Envoi...';
                // anonymous : sans les cookies Google du navigateur - avec plusieurs
                // comptes Google connectes, Apps Script renvoie une page HTML au
                // lieu du JSON ("reponse serveur inattendue", v6.13).
                gmRequest({ method: 'POST', url: INCIDENTS_ENDPOINT_URL, data: JSON.stringify(report), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, timeout: 20000, anonymous: true })
                    .then((res) => {
                        let json = null;
                        try { json = JSON.parse(res.responseText); } catch (e) {}
                        if (!json || json.status !== 'ok') {
                            console.log('[AnimeTracker v6] reponse incident inattendue', res.status, res.finalUrl, (res.responseText || '').slice(0, 500));
                            throw new Error(json && json.message ? json.message : 'reponse serveur inattendue, statut ' + res.status);
                        }
                        setIncidentNote('Merci, envoye !', '#4caf50');
                        incidentDraft = '';
                        ['ep', 'ed'].forEach((p2) => { const b = document.getElementById(p2 + '-fb-body'); if (b) b.value = ''; });
                    })
                    .catch((e) => { setIncidentNote('Echec de l\'envoi (' + ((e && e.message) || 'reseau') + ') - reessaie plus tard.', '#f66'); })
                    .then(() => { sendBtn.disabled = false; sendBtn.innerHTML = '&#128228; Envoyer'; });
            });
        }

        function buildOverlay() {
            if (overlayEls) return overlayEls;
            const overlay = document.createElement('div');
            overlay.id = 'ed-overlay-player';
            overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#000;display:none;';

            const playerFrame = document.createElement('iframe');
            playerFrame.id = 'ed-player-frame';
            playerFrame.name = PLAYER_FRAME_NAME;
            playerFrame.setAttribute('allow', 'autoplay; fullscreen');
            playerFrame.style.cssText = 'width:100%;height:100%;border:0;background:#000;display:block;';
            overlay.appendChild(playerFrame);

            const toggleBtn = document.createElement('button');
            toggleBtn.id = 'ed-toggle-btn';
            toggleBtn.type = 'button';
            toggleBtn.title = 'Afficher/masquer les commandes';
            toggleBtn.textContent = '☰';
            toggleBtn.style.cssText = 'position:absolute;top:10px;left:10px;z-index:11;background:rgba(0,0,0,.6);color:#eee;border:none;border-radius:4px;width:32px;height:32px;cursor:pointer;font-size:16px;';
            overlay.appendChild(toggleBtn);

            const topbar = document.createElement('div');
            topbar.style.cssText = 'position:absolute;top:52px;left:10px;z-index:10;display:flex;flex-direction:column;gap:5px;background:rgba(0,0,0,.6);padding:10px;border-radius:8px;font-family:Arial,sans-serif;color:#eee;font-size:12px;max-width:220px;max-height:calc(100vh - 70px);overflow-y:auto;';
            const scriptVersion = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '6.0';
            const B = 'background:#333;color:#fff;border:none;padding:7px 10px;border-radius:4px;cursor:pointer;font-size:12px;';
            const SELECT = 'width:100%;padding:5px;border-radius:4px;border:none;background:#000;color:#eee;font-size:11px;';
            const CHECK = 'display:flex;align-items:center;gap:6px;color:#ccc;';
            topbar.innerHTML =
                '<div style="font-weight:bold;color:#03d0fc;font-size:15px;text-align:center;">Vidéo Continuum <span style="font-size:12px;color:#ffd400;">v' + scriptVersion + '</span></div>' +
                '<div id="ed-current-name" style="font-size:13px;font-weight:bold;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0;"></div>' +
                '<div id="ed-current-ep" style="font-size:18px;font-weight:bold;text-align:center;"></div>' +
                '<button id="ed-info-btn" title="Synopsis, genres, note..." style="background:#1f2a33;color:#03d0fc;border:1px solid #03d0fc55;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;">&#8505; Fiche de l\'anime</button>' +
                '<div id="ed-status" style="color:#ccc;font-size:11px;text-align:center;">En attente...</div>' +
                '<div id="ed-aniskip" style="display:none;font-size:12px;color:#ccc;text-align:center;"></div>' +
                '<div id="ed-cross-site" style="display:none;background:rgba(255,179,0,.12);border:1px solid #ffb300;border-radius:6px;padding:6px;font-size:11px;color:#ffb300;text-align:center;"></div>' +
                '<span id="ed-mute-indicator" style="color:#f66;display:none;font-size:11px;text-align:center;">Son coupe - clique dans le lecteur</span>' +
                '<button id="ed-fullscreen-btn" style="background:#03d0fc;color:#000;border:none;padding:7px 10px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;">Plein ecran</button>' +
                '<button id="ed-close-btn" style="' + B + '">Fermer</button>' +
                '<div style="display:flex;gap:4px;">' +
                '<button id="ed-prev-btn" style="' + B + 'flex:1;">&#9664; Prec.</button>' +
                '<button id="ed-next-btn" style="' + B + 'flex:1;">Suiv. &#9654;</button>' +
                '</div>' +
                '<div style="display:flex;gap:4px;">' +
                '<input type="number" id="ed-goto-input" min="1" placeholder="N&#176; episode" style="width:0;flex:1;padding:6px;border-radius:4px;border:none;background:#000;color:#eee;font-size:12px;">' +
                '<button id="ed-goto-btn" style="' + B + '">Aller</button>' +
                '</div>' +
                trackButtonHtml('ed-track-cb', false) +
                '<select id="ed-series-select" style="' + SELECT + 'font-family:Consolas,monospace;"><option value="">-- Changer de serie --</option></select>' +
                '<button id="ed-check-new-btn" style="' + BTN_STYLE + '">&#8635; Verifier les nouveaux episodes</button>' +
                '<button id="ed-history-btn" style="' + BTN_STYLE + '">&#128338; Historique</button>' +
                toggleButtonsHtml('ed-', false, false) +
                collapsibleSection('reglages', 'Reglages',
                    '<div style="display:flex;gap:4px;"><button id="ed-set-intro-btn" style="' + B + 'flex:1;">Fin intro</button><button id="ed-set-outro-btn" style="' + B + 'flex:1;">Debut outro</button></div>' +
                    collapsibleSection('plus', 'Plus',
                        '<div style="display:flex;gap:4px;"><button id="ed-set-introstart-btn" style="' + B + 'flex:1;">Debut intro</button><button id="ed-set-outroend-btn" style="' + B + 'flex:1;">Fin outro</button></div>' +
                        '<button id="ed-settings-btn" style="' + B + '">Configuration</button>' +
                        '<button id="ed-reload-btn" style="' + B + '">&#8635; Recharger la page</button>' +
                        '<button id="ed-delete-btn" style="background:#5a1f1f;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;">Supprimer la serie selectionnee</button>', false, true)) +
                collapsibleSection('youtube', 'Autres sources',
                    (site.id === 'esprit-donghua' ? '<button id="ed-open-odysee-btn" title="Ouvre cet episode directement sur odysee.com dans un nouvel onglet (playlist/suivant-precedent geres la-bas independamment)." style="' + B + '">Ouvrir sur Odysee</button>' : '') +
                    '<button id="ed-youtube-auto-btn" title="Cherche cet episode sur YouTube et propose les videos en vignettes (compilations : bon moment via les chapitres). La chaine choisie est retenue pour la suite." style="' + B + '">Trouver sur YouTube</button>' +
                    '<button id="ed-youtube-off-btn" style="' + B + '">Revenir a la source du site</button>') +
                collapsibleSection('sauvegarde', 'Sauvegarde',
                    '<button id="ed-export-btn" style="' + B + '">Exporter</button>' +
                    '<button id="ed-import-btn" style="' + B + '">Importer</button>' +
                    '<input type="file" id="ed-import-file" accept=".html,.htm" style="display:none;">' +
                    '<button id="ed-choose-backup-btn" style="' + B + '">Choisir fichier sauvegarde</button>' +
                    '<button id="ed-reauth-backup-btn" style="' + B + '">Reautoriser l\'acces au fichier</button>' +
                    '<span id="ed-backup-status" style="color:#888;font-size:11px;"></span>') +
                incidentSectionHtml('ed', false) +
                newsSectionHtml(false) +
                '<button id="ed-check-update-btn" title="Ouvre la page d\'installation du script - Tampermonkey indique lui-meme si une mise a jour est disponible" style="' + B + '">&#128260; Verifier MAJ</button>' +
                '<select id="ed-site-filter" title="Filtrer la liste des animes suivis par site" style="' + SELECT + '">' + buildSiteFilterOptionsHtml() + '</select>' +
                '<div id="ed-tracking-summary" style="display:flex;flex-direction:column;gap:4px;"></div>' +
                siteLinksHtml() + openModeSelectHtml();
            overlay.appendChild(topbar);

            toggleBtn.addEventListener('click', () => {
                const hidden = topbar.style.display === 'none';
                topbar.style.display = hidden ? 'flex' : 'none';
                toggleBtn.textContent = hidden ? '✕' : '☰';
            });

            const siteErrorBox = document.createElement('div');
            siteErrorBox.id = 'ed-site-error';
            siteErrorBox.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:12;max-width:440px;max-height:90%;overflow-y:auto;background:#2a1a05;color:#ffd27a;border:2px solid #ffb020;border-radius:10px;padding:18px 22px;font-family:Arial,sans-serif;font-size:14px;line-height:1.45;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.7);display:none;';
            overlay.appendChild(siteErrorBox);

            const toast = document.createElement('div');
            toast.id = 'ed-toast';
            toast.style.cssText = 'position:absolute;bottom:30px;right:30px;z-index:10;background:#15151f;color:#eee;padding:14px 20px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.6);font-family:Arial,sans-serif;display:none;align-items:center;gap:12px;';
            toast.innerHTML = '<span id="ed-toast-text">Episode suivant dans 3s...</span><button id="ed-toast-now" style="background:#03d0fc;color:#000;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:13px;font-weight:bold;">Suivant maintenant</button><button id="ed-toast-cancel" style="background:#333;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:13px;">Annuler</button>';
            overlay.appendChild(toast);

            // Prec./Suiv. sur la video (v6.38) : apparaissent quand la souris
            // bouge, disparaissent apres 3 s, comme lecture/pause.
            const NAV = 'position:absolute;bottom:64px;z-index:9;transform:translateX(-50%);width:42px;height:42px;border-radius:50%;border:none;background:rgba(0,0,0,.55);color:#fff;font-size:17px;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .3s;';
            const navPrev = document.createElement('button');
            navPrev.type = 'button'; navPrev.title = 'Episode precedent'; navPrev.textContent = '⏮';
            navPrev.style.cssText = NAV + 'left:calc(50% - 90px);';
            const navNext = document.createElement('button');
            navNext.type = 'button'; navNext.title = 'Episode suivant'; navNext.textContent = '⏭';
            navNext.style.cssText = NAV + 'left:calc(50% + 90px);';
            overlay.appendChild(navPrev);
            overlay.appendChild(navNext);
            navPrev.addEventListener('click', () => topbar.querySelector('#ed-prev-btn').click());
            navNext.addEventListener('click', () => (ytActive || hasNextEpisode(currentEpisode)) && topbar.querySelector('#ed-next-btn').click());
            overlay.addEventListener('mousemove', showNavButtons);

            document.body.appendChild(overlay);

            const currentNameEl = topbar.querySelector('#ed-current-name');
            const currentEpEl = topbar.querySelector('#ed-current-ep');
            const statusEl = topbar.querySelector('#ed-status');
            const muteIndicatorEl = topbar.querySelector('#ed-mute-indicator');
            const seriesSelectEl = topbar.querySelector('#ed-series-select');
            const siteFilterSelectEl = topbar.querySelector('#ed-site-filter');
            const autoNextCb = topbar.querySelector('#ed-autonext-cb');
            const autoOpenCb = topbar.querySelector('#ed-autoopen-cb');
            const trackCb = topbar.querySelector('#ed-track-cb');
            const backupStatusEl = topbar.querySelector('#ed-backup-status');

            topbar.querySelector('#ed-reload-btn').addEventListener('click', () => location.reload());
            topbar.querySelector('#ed-set-introstart-btn').addEventListener('click', () => promptIntroOutro('introStart'));
            topbar.querySelector('#ed-set-intro-btn').addEventListener('click', () => promptIntroOutro('introEnd'));
            topbar.querySelector('#ed-set-outro-btn').addEventListener('click', () => promptIntroOutro('outroStart'));
            topbar.querySelector('#ed-set-outroend-btn').addEventListener('click', () => promptIntroOutro('outroEnd'));
            topbar.querySelector('#ed-settings-btn').addEventListener('click', openSettingsModal);
            topbar.querySelector('#ed-info-btn').addEventListener('click', () => { if (currentEpisode) openSeriesInfo(currentEpisode); });
            topbar.querySelector('#ed-check-update-btn').addEventListener('click', openScriptUpdatePage);
            topbar.querySelector('#ed-history-btn').addEventListener('click', openHistoryPopup);
            bindIncidentSection(topbar, 'ed');
            bindNewsSection(topbar);

            const gotoInput = topbar.querySelector('#ed-goto-input');
            const gotoBtn = topbar.querySelector('#ed-goto-btn');
            const triggerGoto = () => {
                const n = parseInt(gotoInput.value, 10);
                if (!n || n < 1) return;
                goToEpisodeNumber(n);
            };
            gotoBtn.addEventListener('click', triggerGoto);
            gotoInput.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') triggerGoto(); });

            topbar.querySelector('#ed-delete-btn').addEventListener('click', () => {
                if (!seriesSelectEl.value) { alert('Choisis d\'abord une serie dans la liste.'); return; }
                if (!confirm('Retirer definitivement cette serie de la liste suivie ?')) return;
                deleteProgressEntry(seriesSelectEl.value);
                buildPersistentPanel();
            });
            topbar.querySelector('#ed-check-new-btn').addEventListener('click', (ev) => {
                const btn = ev.currentTarget;
                btn.disabled = true; btn.textContent = 'Recherche...';
                checkForNewEpisodes().then(() => { btn.disabled = false; btn.textContent = '↻ Verifier les nouveaux episodes'; });
            });

            seriesSelectEl.addEventListener('change', () => { if (seriesSelectEl.value) location.href = seriesSelectEl.value; });
            siteFilterSelectEl.addEventListener('change', () => { setSiteFilter(siteFilterSelectEl.value); buildPersistentPanel(); });
            autoNextCb.addEventListener('change', () => {
                setAutoNextEnabled(autoNextCb.checked);
                if (currentEpisode) applyUpdatedConfigIfCurrent(storageKey(currentEpisode));
                buildPersistentPanel();
            });
            autoOpenCb.addEventListener('change', () => { setAutoOpenEnabled(autoOpenCb.checked); buildPersistentPanel(); });
            trackCb.addEventListener('change', () => {
                if (!currentEpisode) return;
                const key = storageKey(currentEpisode);
                setSeriesExcluded(key, !trackCb.checked);
                if (trackCb.checked) recordEpisodeProgress(currentEpisode, true);
                buildPersistentPanel();
            });

            topbar.querySelector('#ed-export-btn').addEventListener('click', exportProgress);
            const edImportFileInput = topbar.querySelector('#ed-import-file');
            topbar.querySelector('#ed-import-btn').addEventListener('click', () => edImportFileInput.click());
            edImportFileInput.addEventListener('change', () => {
                if (edImportFileInput.files && edImportFileInput.files[0]) importProgressFile(edImportFileInput.files[0]);
                edImportFileInput.value = '';
            });
            topbar.querySelector('#ed-choose-backup-btn').addEventListener('click', chooseBackupFile);
            topbar.querySelector('#ed-reauth-backup-btn').addEventListener('click', reauthorizeBackupFile);

            topbar.querySelector('#ed-next-btn').addEventListener('click', () => {
                if (cancelCountdown) cancelCountdown();
                outroSkipSuspended = false;
                if (!currentEpisode || !(ytActive || hasNextEpisode(currentEpisode))) { alert('Aucun episode suivant detecte.'); return; }
                advanceToNextEpisode();
            });
            topbar.querySelector('#ed-prev-btn').addEventListener('click', () => {
                if (cancelCountdown) cancelCountdown();
                goToPreviousEpisode();
            });

            topbar.querySelector('#ed-fullscreen-btn').addEventListener('click', () => {
                const req = overlay.requestFullscreen || overlay.webkitRequestFullscreen;
                if (req) req.call(overlay).catch(() => {});
            });
            topbar.querySelector('#ed-close-btn').addEventListener('click', () => {
                if (cancelCountdown) cancelCountdown();
                overlay.style.display = 'none';
                postToPlayerFrame({ type: MSG_PREFIX + 'pause' });
                if (document.fullscreenElement === overlay) document.exitFullscreen().catch(() => {});
            });
            const edOpenOdyseeBtn = topbar.querySelector('#ed-open-odysee-btn');
            if (edOpenOdyseeBtn) edOpenOdyseeBtn.addEventListener('click', openCurrentEpisodeOnOdysee);
            topbar.querySelector('#ed-youtube-auto-btn').addEventListener('click', useYoutubeAutoForCurrentEpisode);
            topbar.querySelector('#ed-youtube-off-btn').addEventListener('click', leaveYoutubeMode);
            toast.querySelector('#ed-toast-cancel').addEventListener('click', () => { if (cancelCountdown) cancelCountdown(); });
            toast.querySelector('#ed-toast-now').addEventListener('click', () => { if (cancelCountdown && nextNowCountdown) nextNowCountdown(); });

            overlayEls = {
                overlay: overlay, playerFrame: playerFrame, toast: toast, statusEl: statusEl, muteIndicatorEl: muteIndicatorEl,
                seriesSelect: seriesSelectEl, siteFilterSelect: siteFilterSelectEl, autoNextCb: autoNextCb, autoOpenCb: autoOpenCb, trackCb: trackCb,
                backupStatusEl: backupStatusEl, currentNameEl: currentNameEl, currentEpEl: currentEpEl, siteErrorBox: siteErrorBox,
                navPrev: navPrev, navNext: navNext
            };
            return overlayEls;
        }

        let navHideTimer = null;
        function showNavButtons() {
            if (!overlayEls || !currentEpisode) return;
            const show = (el, on) => { el.style.opacity = on ? '1' : '0'; el.style.pointerEvents = on ? 'auto' : 'none'; };
            show(overlayEls.navPrev, ytActive || hasPrevEpisode(currentEpisode));
            // Suiv. toujours visible, grise s'il n'y a rien apres (v6.39)
            const hasNext = ytActive || hasNextEpisode(currentEpisode);
            show(overlayEls.navNext, true);
            overlayEls.navNext.style.opacity = hasNext ? '1' : '.35';
            overlayEls.navNext.style.cursor = hasNext ? 'pointer' : 'default';
            overlayEls.navNext.title = hasNext ? 'Episode suivant' : 'Pas encore sorti';
            clearTimeout(navHideTimer);
            navHideTimer = setTimeout(() => { show(overlayEls.navPrev, false); show(overlayEls.navNext, false); }, 3000);
        }

        function hasNextEpisode(info) {
            if (info.navStyle === 'page') return !!info.nextPageUrl;
            return info.episodeIndex < info.totalEpisodes - 1;
        }
        function hasPrevEpisode(info) {
            if (info.navStyle === 'page') return !!info.prevPageUrl;
            return info.episodeIndex > 0;
        }

        var lastStatusText = ''; // var : setStatus peut etre appele avant cette ligne (TDZ)
        function setStatus(text, warning) {
            lastStatusText = text;
            if (overlayEls) {
                overlayEls.statusEl.innerHTML = statusHtml(text);
                overlayEls.statusEl.style.color = warning ? '#ffb020' : '#ccc';
            }
            updatePanelStatus(text);
        }

        function postToPlayerFrame(data) {
            if (!overlayEls || !overlayEls.playerFrame.contentWindow || !currentEpisode) return;
            // Origine tiree de la vraie src de l'iframe (anime-sama melange
            // ansembed/sibnet selon l'episode), pas de info.playerOrigin.
            let origin = currentEpisode.playerOrigin;
            try { origin = new URL(overlayEls.playerFrame.src).origin; } catch (e) {}
            overlayEls.playerFrame.contentWindow.postMessage(data, origin);
        }
        // Position dans l'episode en cours, une seule par serie (v6.13) :
        // { [storageKey]: { ep, t } } - ecrasee a chaque episode, donc ne
        // grossit pas. Effacee en fin d'episode.
        function loadResumePositions() { return GM_getValue('resumePositions', {}); }
        function setResumePosition(info, t) {
            const all = loadResumePositions();
            if (t === null) { if (!all[storageKey(info)]) return; delete all[storageKey(info)]; }
            else all[storageKey(info)] = { ep: info.episodeNumber, t: Math.floor(t) };
            GM_setValue('resumePositions', all);
        }
        // Faux entre le changement de src et le 'ready' du nouveau lecteur :
        // l'ancien peut encore envoyer sa position, attribuee a tort au
        // nouvel episode (meme contentWindow d'une navigation a l'autre).
        let positionArmed = false;
        function getResumeAt(info) {
            const r = loadResumePositions()[storageKey(info)];
            return r && r.ep === info.episodeNumber ? r.t : null;
        }
        // Lecteurs de secours (v6.21) : si le lecteur ne trouve pas de video
        // (lien mort, 'echec' envoye par le script du lecteur) ou ne repond
        // pas du tout (hebergeur injoignable, aucun script dedans), on
        // passe au lecteur suivant de la page.
        let playerCandidates = [], playerCandidateIndex = 0, playerReadyTimer = null;
        let ytActive = false, ytSegment = null; // lecture YouTube en cours (v6.27)
        let stallRetriedSrc = null; // un seul essai auto par lecteur (v6.33)
        function armPlayerReadyTimer() {
            clearTimeout(playerReadyTimer);
            playerReadyTimer = setTimeout(tryNextPlayer, 25000);
        }
        function tryNextPlayer() {
            clearTimeout(playerReadyTimer);
            if (!overlayEls || playerCandidateIndex + 1 >= playerCandidates.length) {
                if (playerCandidates.length) showSiteError(playerCandidates.length);
                return;
            }
            playerCandidateIndex++;
            positionArmed = false;
            outroSignalSent = false;
            setStatus('Lecteur ' + playerCandidateIndex + ' du site indisponible, essai du lecteur ' + (playerCandidateIndex + 1) + '...');
            overlayEls.playerFrame.src = playerCandidates[playerCandidateIndex];
            armPlayerReadyTimer();
        }

        // Demande utilisateur : dire clairement que c'est le site (video
        // supprimee / hebergeur en panne), pas Video Continuum.
        function showSiteError(nbPlayers, kind) {
            const box = overlayEls.siteErrorBox;
            const siteLabel = currentEpisode ? currentEpisode.siteLabel : 'le site';
            let host = '';
            try { host = new URL(overlayEls.playerFrame.src).hostname.replace(/^www\./, ''); } catch (e) {}
            const stall = kind === 'stall';
            box.setAttribute('data-kind', stall ? 'stall' : 'dead');
            setStatus(stall ? 'Lecture bloquee par le fichier video de l\'hebergeur' : 'Episode indisponible sur ' + siteLabel + ' (probleme du site)');
            const BTN = 'background:#1f2a33;color:#03d0fc;border:1px solid #03d0fc;padding:6px 12px;border-radius:4px;cursor:pointer;';
            box.innerHTML = (stall
                ? '<div style="font-size:16px;font-weight:bold;margin-bottom:8px;">&#9888; La video cale chez l\'hebergeur (' + escapeHtml(host || siteLabel) + ')</div>' +
                  'Le fichier publie pour cet episode est trop lourd ou mal prepare (cas de certaines chaines Odysee) : le navigateur n\'arrive pas a le lire d\'une traite.<br><b>Ce n\'est pas un probleme de Video Continuum.</b><br>' +
                  '<span style="font-size:12px;color:#d9b77a;">Clique un resultat YouTube ci-dessous : sa chaine est retenue et les prochains episodes qui calent y basculent tout seuls.</span>'
                : '<div style="font-size:16px;font-weight:bold;margin-bottom:8px;">&#9888; Episode indisponible sur ' + escapeHtml(siteLabel) + '</div>' +
                  (nbPlayers > 1 ? 'Les ' + nbPlayers + ' lecteurs proposes par le site ont ete essayes : ' : 'Le lecteur propose par le site ') +
                  'la video a ete supprimee ou l\'hebergeur est en panne.<br><b>Ce n\'est pas un probleme de Video Continuum.</b><br>') +
                '<div id="ed-site-alt" style="margin-top:10px;font-size:12px;color:#d9b77a;">Recherche de cet episode sur les autres sites...</div>' +
                '<div id="ed-yt-results" style="margin-top:10px;font-size:12px;color:#d9b77a;text-align:left;">Recherche de cet episode sur YouTube...</div>' +
                '<div style="margin-top:12px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">' +
                (stall ? '<button type="button" data-act="retry" style="' + BTN + '">Reessayer</button>' : '') +
                '<button type="button" data-act="youtube" style="' + BTN + '">Lire sur YouTube</button>' +
                '<button type="button" data-act="google" style="' + BTN + '">Rechercher sur Google</button>' +
                (currentEpisode && hasNextEpisode(currentEpisode) ? '<button type="button" data-act="next" style="background:#ffb020;color:#000;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-weight:bold;">Episode suivant</button>' : '') +
                '<button type="button" data-act="close" style="background:#333;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;">Fermer</button></div>';
            box.style.display = 'block';
            const info = currentEpisode;
            box.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
                const act = b.getAttribute('data-act');
                if (act === 'google') {
                    const q = displayName(info.seriesName) + ' episode ' + info.episodeNumber + ' vostfr streaming';
                    window.open('https://www.google.com/search?q=' + encodeURIComponent(q), '_blank', 'noopener');
                    return;
                }
                if (act === 'youtube') { box.style.display = 'none'; switchToYoutube(info, 'bouton de l\'encadre'); return; }
                box.style.display = 'none';
                if (act === 'next') advanceToNextEpisode();
                // Recharge le lecteur : la position est reprise (sauvegardee toutes les 5 s).
                if (act === 'retry') { positionArmed = false; overlayEls.playerFrame.src = overlayEls.playerFrame.src; }
            }));
            renderYoutubeChoices(box.querySelector('#ed-yt-results'), info, () => { box.style.display = 'none'; });
            findEpisodeElsewhere(info, playerCandidates.slice()).then((found) => {
                const alt = box.querySelector('#ed-site-alt');
                if (!alt || currentEpisode !== info) return;
                if (!found.length) { alt.textContent = 'Pas trouve sur les autres sites geres - essaie la recherche Google.'; return; }
                alt.innerHTML = 'Disponible ailleurs : ' + found.map((f) => '<a href="' + escapeHtml(f.url) + '" style="display:inline-block;margin:4px;background:#4caf50;color:#000;font-weight:bold;text-decoration:none;padding:5px 10px;border-radius:4px;">Regarder l\'ep. ' + escapeHtml(String(info.episodeNumber)) + ' sur ' + escapeHtml(f.label) + '</a>').join('');
            });
        }

        // Meme episode sur l'autre site (v6.21) : anime-sama et animoflix
        // utilisent le meme nom court d'anime dans leurs adresses
        // (/catalogue/<nom>/saison1/vostfr/ et /anime/<nom>/saison-1/vostfr/
        // episode-N/) et renvoient une vraie 404 s'il n'existe pas. On
        // verifie que l'episode y a bien un lecteur gere.
        // deadEmbeds : liens deja essayes sans succes - les deux sites
        // partagent souvent les memes sources (ex. meme lien ansembed mort).
        function findEpisodeElsewhere(info, deadEmbeds) {
            const n = Number(info.episodeNumber);
            const url = info.resumeUrl || info.pageUrl || '';
            const m = url.match(/animoflix\.to\/anime\/([^/]+)\/saison-(\d+)\/([^/]+)\//) || url.match(/anime-sama\.to\/catalogue\/([^/]+)\/saison(\d+)\/([^/#]+)/);
            if (!m || !n) return Promise.resolve([]);
            const [, slug, season, lang] = m;
            const tries = [];
            if (info.site !== 'anime-sama') {
                const u = 'https://anime-sama.to/catalogue/' + slug + '/saison' + season + '/' + lang + '/#ep=' + n;
                tries.push(fetchPageHtml(u).then((html) => SITE_ANIME_SAMA.extract(new DOMParser().parseFromString(html, 'text/html'), u))
                    .then((i) => (i && i.embedByIndex[n - 1] && deadEmbeds.indexOf(i.embedByIndex[n - 1]) === -1 ? { label: 'Anime-Sama', url: u } : null)));
            }
            if (info.site !== 'animoflix') {
                const u = 'https://animoflix.to/anime/' + slug + '/saison-' + season + '/' + lang + '/episode-' + n + '/';
                tries.push(fetchPageHtml(u).then((html) => SITE_ANIMOFLIX.extract(new DOMParser().parseFromString(html, 'text/html'), u))
                    .then((i) => (i && (i.embedCandidates || []).some((e) => deadEmbeds.indexOf(e) === -1) ? { label: 'Animoflix', url: u } : null)));
            }
            return Promise.all(tries.map((t) => t.catch(() => null))).then((r) => r.filter(Boolean));
        }

        function sendConfigToPlayerFrame() {
            if (ytActive) { postToPlayerFrame({ type: MSG_PREFIX + 'config', introStart: null, introEnd: null, outroStart: null, outroEnd: null, resumeAt: null }); return; }
            postToPlayerFrame({ type: MSG_PREFIX + 'config', introStart: currentConfig.introStart, introEnd: currentConfig.introEnd, outroStart: currentConfig.outroStart, outroEnd: currentConfig.outroEnd, resumeAt: currentEpisode ? getResumeAt(currentEpisode) : null });
        }

        // Origines autorisees pour les messages ENTRANTS du lecteur - le
        // vrai controle de securite reste event.source (voir plus bas), cet
        // ensemble n'est qu'un premier filtre rapide.
        const PLAYER_ORIGINS = new Set([PLAYER_ORIGIN_ODYSEE, PLAYER_ORIGIN_SIBNET, PLAYER_ORIGIN_ANSEMBED]);
        window.addEventListener('message', (event) => {
            let frameOrigin = null;
            try { frameOrigin = overlayEls && new URL(overlayEls.playerFrame.src).origin; } catch (e) {}
            if (!PLAYER_ORIGINS.has(event.origin) && event.origin !== frameOrigin) return;
            if (!event.data || typeof event.data.type !== 'string' || event.data.type.indexOf(MSG_PREFIX) !== 0) return;
            if (!overlayEls || event.source !== overlayEls.playerFrame.contentWindow) return;
            const type = event.data.type.slice(MSG_PREFIX.length);

            if (type === 'ready') { clearTimeout(playerReadyTimer); positionArmed = true; sendConfigToPlayerFrame(); }
            if (type === 'position' && currentEpisode && positionArmed && ytActive) {
                // Compilation YouTube : le suivi suit l'episode en cours de lecture.
                if (ytSegment) {
                    const t = Number(event.data.t);
                    const ep = ytSegment.starts ? ytSegment.first + ytSegment.starts.filter((x) => x <= t).length - 1
                        : ytSegment.first + Math.floor(t / ytSegment.perEp);
                    if (ep > Number(currentEpisode.episodeNumber) && ep <= ytSegment.last) advanceTrackingTo(ep);
                }
            } else if (type === 'position' && currentEpisode && positionArmed) {
                const t = Number(event.data.t), d = Number(event.data.d);
                if (isFinite(d) && d > 0) requestAniSkip(d);
                // < 30s : rien a reprendre ; dernieres 2 min : considere fini.
                if (t >= 30 && (!isFinite(d) || d - t > 120)) setResumePosition(currentEpisode, t);
                else if (isFinite(d) && d - t <= 120) setResumePosition(currentEpisode, null);
            }
            if (type === 'outro-reached' || type === 'ended' || type === 'near-end') { if (currentEpisode) setResumePosition(currentEpisode, null); }
            if (type === 'outro-reached') {
                if (outroSkipSuspended || outroSignalSent) return;
                outroSignalSent = true;
                triggerNextEpisode('debut outro configure', event.data.remaining);
            }
            if (type === 'near-end') {
                if (outroSignalSent) return;
                outroSignalSent = true;
                triggerNextEpisode('fin de la video', event.data.remaining);
            }
            if (type === 'ended') {
                if (outroSignalSent) return;
                outroSignalSent = true;
                triggerNextEpisode('fin reelle de la video');
            }
            if (type === 'activity') showNavButtons();
            if (type === 'mute-state' && overlayEls.muteIndicatorEl) overlayEls.muteIndicatorEl.style.display = event.data.muted ? 'block' : 'none';
            if (type === 'load-status') {
                if (event.data.stage === 'echec') tryNextPlayer();
                else if (event.data.stage === 'stall') {
                    // "Reessayer" suffisait presque toujours au changement
                    // d'episode (signale 2026-10-06) : on le fait une fois tout
                    // seul avant d'afficher l'encadre.
                    // Fichier d'origine sans choix de qualite (pas de flux HLS en blob:) :
                    // recharger ne sert a rien, on passe direct a YouTube (v6.39).
                    if (!event.data.direct && stallRetriedSrc !== overlayEls.playerFrame.src) {
                        stallRetriedSrc = overlayEls.playerFrame.src;
                        setStatus('La video cale, nouvel essai...');
                        positionArmed = false; overlayEls.playerFrame.src = overlayEls.playerFrame.src;
                        return;
                    }
                    if (!ytActive && currentEpisode && getYoutubeChannelAssociation(currentEpisode)) {
                        setStatus('La video cale chez l\'hebergeur : bascule automatique sur YouTube...');
                        switchToYoutube(currentEpisode, 'auto, video bloquee');
                    } else showSiteError(0, 'stall');
                }
                else if (event.data.stage === 'stall-fini') { if (overlayEls.siteErrorBox.getAttribute('data-kind') === 'stall') overlayEls.siteErrorBox.style.display = 'none'; }
                else if (event.data.stage === 'video-trouvee') setStatus('Chargement...');
                else if (event.data.stage === 'buffering') {
                    if (event.data.pct > lastBufferPct) {
                        lastBufferPct = event.data.pct;
                        lastBufferProgressAt = Date.now();
                    }
                    renderLoadStatus();
                }
                else if (event.data.stage === 'pret') { stopBufferStallTracking(); setStatus('Lecture'); }
            }
        });

        // ---- AniSkip (v6.18) ----
        // Temps d'opening/resume/ending communautaires (api.aniskip.com), par
        // episode. Anime associe automatiquement via AniList (1er resultat de
        // recherche, "Changer" pour corriger). Demande faite au 1er message
        // 'position' du lecteur pour passer la VRAIE duree : AniSkip ne garde
        // alors que les releves a ~20s pres, ce qui ecarte un mauvais anime ou
        // une autre version de la video. Reglages manuels prioritaires (par
        // paire intro / outro).
        let aniSkip = null; // { key, ep, requested, link, cfg, note }
        function loadAniLinks() { return GM_getValue('aniLinks', {}); }
        function setAniLink(key, link) { const all = loadAniLinks(); all[key] = link; GM_setValue('aniLinks', all); }
        function aniSearchQuery(info) {
            const season = ((info.seriesUrl || '').match(/\/saison-?(\d+)/i) || [])[1];
            const name = displayName(info.seriesName) || '';
            return season && season !== '1' ? name + ' ' + season : name;
        }
        function anilistSearch(q) {
            const query = 'query($q:String){Page(perPage:6){media(search:$q,type:ANIME){idMal seasonYear title{romaji english}}}}';
            return gmRequest({ method: 'POST', url: 'https://graphql.anilist.co', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, data: JSON.stringify({ query: query, variables: { q: q } }), anonymous: true, timeout: 15000 })
                .then((res) => (JSON.parse(res.responseText).data.Page.media || []).filter((m) => m.idMal)
                    .map((m) => ({ idMal: m.idMal, title: m.title.romaji || m.title.english, year: m.seasonYear })));
        }
        function resolveAniLink(key, info) {
            const known = loadAniLinks()[key];
            if (known) return Promise.resolve(known);
            return anilistSearch(aniSearchQuery(info)).then((list) => {
                const link = list[0] ? { idMal: list[0].idMal, title: list[0].title } : { idMal: null };
                setAniLink(key, link);
                return link;
            });
        }
        // Resultats AniSkip -> paires intro/outro du lecteur. Le resume
        // colle a l'opening (ecart < 30s) est saute avec lui.
        function aniSkipToConfig(results) {
            const iv = (types) => results.filter((r) => types.indexOf(r.skipType) !== -1).map((r) => ({ s: r.interval.startTime, e: r.interval.endTime, len: r.episodeLength }));
            const cfg = {};
            const op = iv(['op', 'mixed-op'])[0];
            if (op) {
                let s = op.s, e = op.e;
                iv(['recap']).forEach((r) => { if (r.s <= e + 30 && r.e >= s - 30) { s = Math.min(s, r.s); e = Math.max(e, r.e); } });
                cfg.introStart = s < 5 ? null : Math.round(s);
                cfg.introEnd = Math.round(e);
            }
            const ed = iv(['ed', 'mixed-ed'])[0];
            if (ed) {
                cfg.outroStart = Math.round(ed.s);
                // Contenu apres le generique (> 10s) : on le saute et on garde la suite.
                cfg.outroEnd = ed.len - ed.e > 10 ? Math.round(ed.e) : null;
            }
            return cfg;
        }
        function describeAniSkip(cfg) {
            const parts = [];
            if (cfg.introEnd) parts.push('intro ' + formatTimecode(cfg.introStart || 0) + '-' + formatTimecode(cfg.introEnd));
            if (cfg.outroStart) parts.push('outro ' + formatTimecode(cfg.outroStart) + (cfg.outroEnd ? '-' + formatTimecode(cfg.outroEnd) : ''));
            return parts.join(', ');
        }
        function renderAniSkipStatus() {
            const el = overlayEls && overlayEls.overlay.querySelector('#ed-aniskip');
            if (!el) return;
            if (!aniSkip || !currentEpisode || aniSkip.key !== storageKey(currentEpisode)) { el.style.display = 'none'; return; }
            const io = getIntroOutroForKey(aniSkip.key);
            const manual = io.introEnd || io.outroStart ? ' <span style="color:#888;">(tes reglages manuels passent avant)</span>' : '';
            el.innerHTML = 'AniSkip : ' + escapeHtml(aniSkip.note || 'en attente du lecteur...') + manual +
                ' <a href="#" id="ed-aniskip-change" style="color:#03d0fc;">Changer</a>';
            el.style.display = 'block';
            el.querySelector('#ed-aniskip-change').addEventListener('click', (ev) => { ev.preventDefault(); changeAniLink(); });
        }
        function requestAniSkip(duration) {
            const st = aniSkip;
            if (!st || st.requested || !currentEpisode) return;
            st.requested = true;
            st.duration = duration;
            const ep = Number(st.ep);
            if (!ep) { st.note = 'numero d\'episode inconnu'; renderAniSkipStatus(); return; }
            resolveAniLink(st.key, currentEpisode).then((link) => {
                st.link = link;
                if (!link.idMal) { st.note = link.off ? 'desactive pour cet anime' : 'anime introuvable sur AniList'; return null; }
                st.note = link.title + ' - recherche...';
                renderAniSkipStatus();
                const url = 'https://api.aniskip.com/v2/skip-times/' + link.idMal + '/' + ep + '?types=op&types=ed&types=recap&types=mixed-op&types=mixed-ed&episodeLength=' + Math.round(duration || 0);
                return gmRequest({ method: 'GET', url: url, anonymous: true, timeout: 15000 }).then((res) => {
                    const data = JSON.parse(res.responseText);
                    st.cfg = aniSkipToConfig(data.found ? data.results : []);
                    const desc = describeAniSkip(st.cfg);
                    st.note = link.title + ' - ' + (desc || 'pas de donnees pour cet episode');
                });
            }).catch((e) => { st.note = 'erreur reseau'; console.log('[AnimeTracker v6] AniSkip', e); })
                .then(() => {
                    if (aniSkip !== st) return;
                    renderAniSkipStatus();
                    if (st.cfg) applyUpdatedConfigIfCurrent(st.key);
                });
        }
        // ---- Fiche de l'anime (v6.23) : synopsis + genres/tags, tous sites ----
        // Synopsis FR tire de la page de l'anime sur le site (anime-sama :
        // #synopsisText ; ailleurs : description JSON-LD / og / meta), sinon
        // celui d'AniList (anglais). Le reste vient d'AniList (meme
        // association que pour AniSkip).
        const GENRES_FR = { 'Action': 'Action', 'Adventure': 'Aventure', 'Comedy': 'Comedie', 'Drama': 'Drame', 'Ecchi': 'Ecchi', 'Fantasy': 'Fantasy', 'Horror': 'Horreur',
            'Mahou Shoujo': 'Magical girl', 'Mecha': 'Mecha', 'Music': 'Musique', 'Mystery': 'Mystere', 'Psychological': 'Psychologique', 'Romance': 'Romance',
            'Sci-Fi': 'Science-fiction', 'Slice of Life': 'Tranche de vie', 'Sports': 'Sport', 'Supernatural': 'Surnaturel', 'Thriller': 'Thriller' };
        const STATUS_FR = { FINISHED: 'Termine', RELEASING: 'En cours de diffusion', NOT_YET_RELEASED: 'Pas encore sorti', CANCELLED: 'Annule', HIATUS: 'En pause' };
        function anilistDetails(idMal) {
            const query = 'query($id:Int){Media(idMal:$id,type:ANIME){siteUrl episodes status averageScore seasonYear genres description(asHtml:false) coverImage{large} title{romaji english} tags{name rank isMediaSpoiler isGeneralSpoiler} nextAiringEpisode{episode timeUntilAiring}}}';
            return gmRequest({ method: 'POST', url: 'https://graphql.anilist.co', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, data: JSON.stringify({ query: query, variables: { id: idMal } }), anonymous: true, timeout: 15000 })
                .then((res) => JSON.parse(res.responseText).data.Media);
        }
        function siteSynopsis(info) {
            const slug = ((info.seriesUrl || '').match(/anime-sama\.to\/catalogue\/([^/]+)/) || [])[1];
            const url = slug ? 'https://anime-sama.to/catalogue/' + slug + '/' : info.seriesUrl;
            if (!url) return Promise.resolve(null);
            return fetchPageHtml(url).then((html) => {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const cands = [];
                const el = doc.querySelector('#synopsisText, .synopsis-content, .anime-synopsis p, .full-text, [itemprop="description"]');
                if (el) cands.push(el.textContent);
                doc.querySelectorAll('script[type="application/ld+json"]').forEach((sc) => { try { const j = JSON.parse(sc.textContent); [].concat(j).forEach((o) => { if (o && typeof o.description === 'string') cands.push(o.description); }); } catch (e) {} });
                ['meta[property="og:description"]', 'meta[name="description"]'].forEach((sel) => { const m = doc.querySelector(sel); if (m) cands.push(m.getAttribute('content') || ''); });
                // Le plus long qui ne ressemble pas a un texte publicitaire du site.
                const good = cands.map((t) => String(t).replace(/\s+/g, ' ').trim()).filter((t) => t.length >= 80 && !(t.length < 220 && /streaming|regarder|gratuit|t[e\u00e9]l[e\u00e9]charg/i.test(t)));
                return good.sort((a, b) => b.length - a.length)[0] || null;
            }).catch(() => null);
        }
        function openSeriesInfo(info) {
            const key = storageKey(info);
            const old = document.getElementById('ep-info-overlay');
            if (old) old.remove();
            const pop = document.createElement('div');
            pop.id = 'ep-info-overlay';
            pop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;';
            pop.innerHTML = '<div id="ep-info-box" style="background:#15151f;color:#eee;max-width:640px;width:92%;max-height:84vh;overflow:auto;border-radius:8px;padding:18px;font-size:13px;line-height:1.5;">Chargement de la fiche de ' + escapeHtml(displayName(info.seriesName)) + '...</div>';
            (overlayEls && overlayEls.overlay.style.display !== 'none' ? overlayEls.overlay : document.body).appendChild(pop);
            pop.addEventListener('click', (ev) => { if (ev.target === pop || ev.target.id === 'ep-info-close') pop.remove(); });
            const box = pop.querySelector('#ep-info-box');
            const media = resolveAniLink(key, info).then((link) => (link && link.idMal ? anilistDetails(link.idMal) : null)).catch(() => null);
            Promise.all([media, siteSynopsis(info)]).then(([m, frSyn]) => {
                if (!document.body.contains(pop)) return;
                const chip = (t, c) => '<span style="display:inline-block;margin:2px 4px 2px 0;padding:2px 8px;border-radius:10px;font-size:11px;background:' + c + ';">' + escapeHtml(t) + '</span>';
                let html = '<div style="display:flex;gap:14px;">';
                if (m && m.coverImage && /^https:\/\//.test(m.coverImage.large)) html += '<img src="' + escapeHtml(m.coverImage.large) + '" alt="" style="width:110px;height:auto;border-radius:6px;align-self:flex-start;">';
                html += '<div style="flex:1;min-width:0;"><div style="font-size:17px;font-weight:bold;color:#03d0fc;">' + escapeHtml(displayName(info.seriesName)) + '</div>';
                if (m) {
                    const meta = [];
                    if (m.seasonYear) meta.push(m.seasonYear);
                    if (m.episodes) meta.push(m.episodes + ' episodes');
                    if (STATUS_FR[m.status]) meta.push(STATUS_FR[m.status]);
                    if (m.averageScore) meta.push('note ' + (m.averageScore / 10).toFixed(1) + '/10');
                    html += '<div style="color:#aaa;font-size:12px;margin:2px 0 6px;">' + escapeHtml(meta.join(' \u00b7 ')) + '</div>';
                    if (m.nextAiringEpisode) html += '<div style="color:#ffb300;font-size:12px;">Prochain episode (' + m.nextAiringEpisode.episode + ') dans ' + Math.max(1, Math.round(m.nextAiringEpisode.timeUntilAiring / 86400)) + ' j</div>';
                    html += '<div style="margin-top:6px;">' + (m.genres || []).map((g) => chip(GENRES_FR[g] || g, '#1f3a4d')).join('') + '</div>';
                    const tags = (m.tags || []).filter((t) => !t.isMediaSpoiler && !t.isGeneralSpoiler && t.rank >= 60).slice(0, 8);
                    if (tags.length) html += '<div>' + tags.map((t) => chip(t.name, '#2a2a35')).join('') + '</div>';
                } else html += '<div style="color:#aaa;font-size:12px;">Anime non trouve sur AniList (genres indisponibles).</div>';
                html += '</div></div>';
                const enSyn = m && m.description ? m.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
                html += '<div style="margin-top:12px;"><b>Synopsis</b>' + (frSyn ? '' : (enSyn ? ' <span style="color:#888;font-size:11px;">(AniList, en anglais)</span>' : '')) +
                    '<p style="margin:4px 0 0;color:#ddd;">' + escapeHtml(frSyn || enSyn || 'Aucun synopsis trouve.') + '</p></div>';
                html += '<div style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end;">' +
                    (m && /^https:\/\/anilist\.co\//.test(m.siteUrl || '') ? '<a href="' + escapeHtml(m.siteUrl) + '" target="_blank" rel="noopener" style="background:#1f2a33;color:#03d0fc;border:1px solid #03d0fc;padding:6px 12px;border-radius:4px;text-decoration:none;">Voir sur AniList</a>' : '') +
                    '<button type="button" id="ep-info-close" style="background:#333;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;">Fermer</button></div>';
                box.innerHTML = html;
            });
        }

        function changeAniLink() {
            if (!currentEpisode || !aniSkip) return;
            const key = aniSkip.key;
            const q = prompt('Rechercher l\'anime sur AniList (pour AniSkip) :', aniSearchQuery(currentEpisode));
            if (q === null) return;
            anilistSearch(q).then((list) => {
                const menu = list.map((m, i) => (i + 1) + '. ' + m.title + (m.year ? ' (' + m.year + ')' : '')).join('\n');
                const pick = prompt((menu || 'Aucun resultat.') + '\n\n0 = desactiver AniSkip pour cet anime\nNumero :', list.length ? '1' : '0');
                if (pick === null) return;
                const n = parseInt(pick, 10);
                if (n === 0) setAniLink(key, { idMal: null, off: true });
                else if (list[n - 1]) setAniLink(key, { idMal: list[n - 1].idMal, title: list[n - 1].title });
                else return;
                const duration = aniSkip.duration;
                aniSkip = { key: key, ep: aniSkip.ep };
                applyUpdatedConfigIfCurrent(key);
                requestAniSkip(duration);
            }).catch(() => alert('Recherche AniList impossible (reseau).'));
        }

        function applyRuntimeConfig(key) {
            const manualIo = getIntroOutroForKey(key);
            const auto = aniSkip && aniSkip.key === key && aniSkip.cfg ? aniSkip.cfg : {};
            // Par paire : une intro (ou outro) reglee a la main remplace celle d'AniSkip.
            const introOutro = Object.assign({},
                manualIo.introEnd ? { introStart: manualIo.introStart, introEnd: manualIo.introEnd } : { introStart: auto.introStart, introEnd: auto.introEnd },
                manualIo.outroStart ? { outroStart: manualIo.outroStart, outroEnd: manualIo.outroEnd } : { outroStart: auto.outroStart, outroEnd: auto.outroEnd });
            currentConfig = {
                introStart: introOutro.introStart || null,
                introEnd: introOutro.introEnd || null,
                outroStart: introOutro.outroStart || null,
                outroEnd: introOutro.outroEnd || null,
                autoNext: isAutoNextEnabled()
            };
            refreshIntroOutroButtons();
        }

        // Vert = reglage present pour la serie (manuel ou AniSkip), gris = a faire.
        function refreshIntroOutroButtons() {
            const manual = currentEpisode ? getIntroOutroForKey(storageKey(currentEpisode)) : {};
            const intro = currentConfig.introEnd || manual.introEnd, outro = currentConfig.outroStart || manual.outroStart;
            [['ed-set-intro-btn', intro], ['ep-set-intro', intro], ['ed-set-outro-btn', outro], ['ep-set-outro', outro]].forEach(([id, on]) => {
                const b = document.getElementById(id);
                if (b) b.style.background = on ? '#2e7d32' : '#333';
            });
        }

        function triggerNextEpisode(reason, remaining) {
            if (!currentConfig.autoNext) return;
            if (!currentEpisode || !(ytActive || hasNextEpisode(currentEpisode))) { setStatus('Episode termine - pas de suivant detecte'); return; }
            showNextToast(isFinite(remaining) ? Math.max(1, Math.round(remaining)) : 3);
        }

        function showNextToast(start) {
            const { toast } = overlayEls;
            let seconds = start || 3, cancelled = false;
            const textEl = toast.querySelector('#ed-toast-text');
            toast.style.display = 'flex';
            textEl.textContent = 'Episode suivant dans ' + seconds + 's...';
            const interval = setInterval(() => {
                if (cancelled) { clearInterval(interval); return; }
                seconds--;
                if (seconds <= 0) { clearInterval(interval); toast.style.display = 'none'; cancelCountdown = null; advanceToNextEpisode(); return; }
                textEl.textContent = 'Episode suivant dans ' + seconds + 's...';
            }, 1000);
            cancelCountdown = () => { cancelled = true; clearInterval(interval); toast.style.display = 'none'; cancelCountdown = null; };
            nextNowCountdown = () => { cancelled = true; clearInterval(interval); toast.style.display = 'none'; cancelCountdown = null; advanceToNextEpisode(); };
        }

        // Construit l'InfoUnifie de l'episode suivant SANS toucher au
        // reseau pour le style 'index' (deja tout charge pour la saison) -
        // sinon (style 'page') refetch la vraie page suivante, comme v4.
        function buildNextEpisodeInfo() {
            if (currentEpisode.navStyle === 'index') {
                const nextIndex = currentEpisode.episodeIndex + 1;
                const nextNumber = currentEpisode.episodeNumbersByIndex[nextIndex];
                return Promise.resolve(Object.assign({}, currentEpisode, {
                    embedSrc: currentEpisode.embedByIndex[nextIndex], embedCandidates: currentEpisode.embedCandidatesByIndex ? currentEpisode.embedCandidatesByIndex[nextIndex] : undefined,
                    episodeIndex: nextIndex, episodeNumber: nextNumber, episodeLabel: 'Episode ' + nextNumber,
                    resumeUrl: currentEpisode.resumeUrlsByIndex[nextIndex]
                }));
            }
            const site = SITES.find((s) => s.id === currentEpisode.site);
            const nextPageUrl = currentEpisode.nextPageUrl;
            if (currentEpisode.navigate) return navigateToEpisodePage(nextPageUrl);
            return fetchPageHtml(nextPageUrl).then((html) => {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                return site.extract(doc, nextPageUrl);
            });
        }
        function buildPrevEpisodeInfo() {
            if (currentEpisode.navStyle === 'index') {
                const prevIndex = currentEpisode.episodeIndex - 1;
                const prevNumber = currentEpisode.episodeNumbersByIndex[prevIndex];
                return Promise.resolve(Object.assign({}, currentEpisode, {
                    embedSrc: currentEpisode.embedByIndex[prevIndex], embedCandidates: currentEpisode.embedCandidatesByIndex ? currentEpisode.embedCandidatesByIndex[prevIndex] : undefined,
                    episodeIndex: prevIndex, episodeNumber: prevNumber, episodeLabel: 'Episode ' + prevNumber,
                    resumeUrl: currentEpisode.resumeUrlsByIndex[prevIndex]
                }));
            }
            const site = SITES.find((s) => s.id === currentEpisode.site);
            const prevPageUrl = currentEpisode.prevPageUrl;
            if (currentEpisode.navigate) return navigateToEpisodePage(prevPageUrl);
            return fetchPageHtml(prevPageUrl).then((html) => {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                return site.extract(doc, prevPageUrl);
            });
        }

        function applyLoadedEpisode(info, pushHistory, skipYoutubeLookup) {
            if (!info) throw new Error('episode introuvable ou aucun lecteur compatible pour cet episode');
            // Serie passee sur YouTube : chercher d'abord cet episode la-bas.
            if (!skipYoutubeLookup && isYoutubeMode(info) && !getYoutubeOverrideUrl(info) && getYoutubeChannelAssociation(info)) {
                setStatus('Recherche de l\'episode ' + info.episodeNumber + ' sur YouTube...');
                findYoutubeEpisode(getYoutubeChannelAssociation(info), Number(info.episodeNumber))
                    .then((hit) => { if (hit) storeYoutubeHit(info, hit); else console.log('[AnimeTracker v6] YouTube : episode ' + info.episodeNumber + ' introuvable sur la chaine, source du site'); })
                    .catch((e) => console.log('[AnimeTracker v6] YouTube : recherche impossible (' + e.message + '), source du site'))
                    .then(() => applyLoadedEpisode(info, pushHistory, true));
                return;
            }
            const youtubeOverride = getYoutubeOverrideUrl(info);
            ytActive = !!youtubeOverride;
            const segM = youtubeOverride && youtubeOverride.match(/#vcseg=(\d+)-(\d+)-(\d+)(?:-([\d.]+))?/);
            ytSegment = segM ? { first: Number(segM[1]), last: Number(segM[2]), perEp: Number(segM[3]), starts: segM[4] ? segM[4].split('.').map(Number) : null } : null;
            if (!info.embedSrc && !youtubeOverride) {
                // Ex. anime-sama : cet episode precis n'existe que sur un
                // hebergeur qu'on ne gere pas encore (v1 = sibnet
                // uniquement) - on renonce plutot que de bloquer sur un
                // calque vide, le lecteur natif du site reste utilisable.
                // Sauf si un lien YouTube de secours a ete configure pour
                // cet episode precis (voir ci-dessus) - dans ce cas on
                // continue avec lui.
                setStatus('Aucun lecteur compatible (ansembed/sibnet) pour cet episode - utilise le lecteur du site.');
                return;
            }
            currentEpisode = info;
            recordEpisodeProgress(info);
            renderCrossSiteHint(info);
            aniSkip = { key: storageKey(info), ep: info.episodeNumber };
            renderAniSkipStatus();
            applyRuntimeConfig(storageKey(info));
            outroSignalSent = false;
            positionArmed = false;
            overlayEls.playerFrame.src = youtubeOverride || info.embedSrc;
            playerCandidates = youtubeOverride ? [] : (info.embedCandidates && info.embedCandidates.length ? info.embedCandidates : [info.embedSrc]);
            playerCandidateIndex = 0;
            overlayEls.siteErrorBox.style.display = 'none';
            if (playerCandidates.length) armPlayerReadyTimer(); else clearTimeout(playerReadyTimer);
            if (youtubeOverride) {
                setStatus('Lecture via YouTube' + (ytSegment && ytSegment.last > ytSegment.first ? ' (compilation ep. ' + ytSegment.first + '-' + ytSegment.last + ')' : '') + ', sous-titres en francais - pas de saut intro/outro sur cette source.');
            } else {
                startBufferStallTracking();
                setStatus('Chargement...');
            }
            if (pushHistory) { try { history.pushState(null, '', info.resumeUrl); } catch (e) {} }
            buildPersistentPanel();
        }

        // Meme anime suivi sur un autre site (demande 2026-10-02, ex. Bleach
        // ep. 120 sur anime-sama, ep. 1 sur animoflix) : rapprochement par
        // nom normalise, sans fusionner les entrees (cles et numerotation
        // propres a chaque site).
        // ponytail: egalite stricte du nom normalise, ajouter un lien manuel si deux sites nomment differemment
        function normalizeSeriesName(name) {
            return (displayName(name) || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/\b(vostfr|vf)\b/g, '').replace(/[^a-z0-9]/g, '');
        }
        function findFurtherProgressElsewhere(info) {
            const name = normalizeSeriesName(info.seriesName);
            if (!name) return null;
            const progress = loadProgress();
            const excluded = loadExcludedSeries();
            let best = null;
            Object.keys(progress).forEach((k) => {
                const e = progress[k];
                if (excluded[k] || e.site === info.site || normalizeSeriesName(e.seriesName) !== name) return;
                if (Number(e.episodeNumber) > Number(info.episodeNumber) && (!best || Number(e.episodeNumber) > Number(best.episodeNumber))) best = e;
            });
            return best;
        }
        function renderCrossSiteHint(info) {
            const el = overlayEls && overlayEls.overlay.querySelector('#ed-cross-site');
            if (!el) return;
            const other = findFurtherProgressElsewhere(info);
            if (!other) { el.style.display = 'none'; return; }
            const next = Number(other.episodeNumber) + 1;
            el.innerHTML = 'Deja vu jusqu\'a l\'ep. ' + escapeHtml(String(other.episodeNumber)) + ' sur ' + escapeHtml(other.siteLabel || other.site) +
                '<br><button type="button" style="margin-top:4px;background:#ffb300;color:#000;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:bold;">Aller a l\'ep. ' + next + '</button>';
            el.style.display = 'block';
            el.querySelector('button').addEventListener('click', () => { el.style.display = 'none'; goToEpisodeNumber(next); });
        }

        // Sites "une page par episode" generes en JS (sites ajoutes) : on va
        // sur la page et le lecteur se rouvre tout seul (meme sans "Lecteur
        // auto", via ce drapeau de session).
        function navigateToEpisodePage(url) {
            try { sessionStorage.setItem('vc-continue-playing', '1'); } catch (e) {}
            setStatus('Chargement de la page de l\'episode...');
            location.href = url;
            return new Promise(() => {});
        }

        // Suivi pendant une compilation YouTube (et suite apres la compilation).
        function episodeInfoForNumber(cur, ep) {
            if (cur.navStyle === 'index') {
                const i = cur.episodeNumbersByIndex.indexOf(ep);
                if (i === -1) return null;
                return Object.assign({}, cur, { episodeIndex: i, episodeNumber: ep, episodeLabel: 'Episode ' + ep, resumeUrl: cur.resumeUrlsByIndex[i], embedSrc: cur.embedByIndex[i],
                    embedCandidates: cur.embedCandidatesByIndex ? cur.embedCandidatesByIndex[i] : undefined });
            }
            // Page par episode : numero d'episode du site != numero d'adresse
            // (esprit-donghua : "S3 E90" = episode 345) -> on garde la page.
            return Object.assign({}, cur, { episodeNumber: ep, episodeLabel: 'Episode ' + ep, nextPageUrl: null, prevPageUrl: null });
        }
        function advanceTrackingTo(ep) {
            const next = episodeInfoForNumber(currentEpisode, ep);
            if (!next) return;
            currentEpisode = next;
            recordEpisodeProgress(next);
            buildPersistentPanel();
        }

        function advanceToNextEpisode() {
            if (advancingToNext) return;
            if (ytActive && currentEpisode) {
                const next = episodeInfoForNumber(currentEpisode, Number(currentEpisode.episodeNumber) + 1);
                if (next) { applyLoadedEpisode(next, true); return; }
            }
            if (!currentEpisode || !(ytActive || hasNextEpisode(currentEpisode))) return;
            advancingToNext = true;
            setStatus('Chargement de l\'episode suivant...');
            buildNextEpisodeInfo().then((info) => {
                advancingToNext = false;
                applyLoadedEpisode(info, true);
            }).catch((e) => {
                advancingToNext = false;
                console.log('[AnimeTracker v6] echec chargement episode suivant', e);
                setStatus('Erreur : impossible de charger l\'episode suivant');
            });
        }

        function goToPreviousEpisode() {
            if (ytActive && currentEpisode) {
                const prev = episodeInfoForNumber(currentEpisode, Number(currentEpisode.episodeNumber) - 1);
                if (prev && Number(prev.episodeNumber) >= 1) { outroSkipSuspended = true; applyLoadedEpisode(prev, true); return; }
            }
            if (!currentEpisode || !hasPrevEpisode(currentEpisode)) { alert('Aucun episode precedent detecte.'); return; }
            outroSkipSuspended = true;
            setStatus('Chargement de l\'episode precedent...');
            buildPrevEpisodeInfo().then((info) => {
                applyLoadedEpisode(info, true);
            }).catch((e) => {
                console.log('[AnimeTracker v6] echec chargement episode precedent', e);
                setStatus('Erreur : impossible de charger l\'episode precedent');
            });
        }

        function goToEpisodeNumber(targetNumber) {
            if (!currentEpisode) { setStatus('Ouvre d\'abord un episode.'); return; }
            // Serie sur YouTube : on cherche directement l'episode la-bas.
            if (ytActive) { const info = episodeInfoForNumber(currentEpisode, targetNumber); if (info) applyLoadedEpisode(info, true); return; }
            if (currentEpisode.navStyle === 'index') {
                // indexOf plutot que "targetNumber - 1" : la numerotation
                // peut avoir des trous (SITE_ODYSEE) ou la position dans le
                // tableau ne correspond pas au numero d'episode.
                const idx = currentEpisode.episodeNumbersByIndex.indexOf(targetNumber);
                if (idx === -1) { setStatus('Pas d\'episode ' + targetNumber + ' dans la playlist connue (total : ' + currentEpisode.totalEpisodes + ').'); return; }
                applyLoadedEpisode(Object.assign({}, currentEpisode, {
                    embedSrc: currentEpisode.embedByIndex[idx], embedCandidates: currentEpisode.embedCandidatesByIndex ? currentEpisode.embedCandidatesByIndex[idx] : undefined, episodeIndex: idx, episodeNumber: targetNumber, episodeLabel: 'Episode ' + targetNumber,
                    resumeUrl: currentEpisode.resumeUrlsByIndex[idx]
                }), true);
                return;
            }
            // v6.29 : plus de blocage sur latestKnownEpisode (perime entre deux
            // verifications -> "Aller 113" refuse alors que l'episode existait).
            const site = SITES.find((s) => s.id === currentEpisode.site);
            const ep = currentEpisode;
            const guessed = (ep.episodeUrlsByNumber && ep.episodeUrlsByNumber[targetNumber]) ||
                (site.buildEpisodeUrl ? site.buildEpisodeUrl(ep.pageUrl, targetNumber) : null);
            if (guessed && ep.navigate) { navigateToEpisodePage(guessed); return; }
            const load = (url) => fetchPageHtml(url).then((html) => site.extract(new DOMParser().parseFromString(html, 'text/html'), url));
            setStatus('Recherche de l\'episode ' + targetNumber + '...');
            (guessed ? load(guessed) : Promise.reject(new Error('url'))).catch((e) => {
                if (/statut 5\d\d/.test((e && e.message) || '')) throw e;
                // Repli : l'adresse devinee n'existe pas (le site change parfois le
                // nom de l'episode) -> lien "-eN" de la page de la serie, le plus proche
                // de l'adresse actuelle (la page liste aussi les autres saisons).
                return findEpisodeLinkOnSeriesPage(ep, targetNumber).then((url) => url ? (ep.navigate ? (navigateToEpisodePage(url), 'nav') : load(url)) : null);
            }).then((info) => {
                if (info === 'nav') return;
                if (!info) { setStatus('Episode ' + targetNumber + ' introuvable.'); return; }
                applyLoadedEpisode(info, true);
            }).catch((e) => {
                const serverError = /statut 5\d\d/.test((e && e.message) || '');
                setStatus(serverError ? 'Erreur serveur, reessaie dans un instant.' : 'Erreur : episode ' + targetNumber + ' introuvable.');
            });
        }

        function findEpisodeLinkOnSeriesPage(ep, n) {
            if (!ep.seriesUrl || !/^https:/i.test(ep.seriesUrl)) return Promise.resolve(null);
            const re = new RegExp('[-_/](?:e|ep|episode)[-_]?0*' + n + '(?:[-_/][^/]*)?/?$', 'i');
            return fetchPageHtml(ep.seriesUrl).then((html) => {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const links = Array.from(doc.querySelectorAll('a[href]')).map((a) => resolveUrl(a.getAttribute('href'), ep.seriesUrl)).filter((u) => u && re.test(u.replace(/[?#].*$/, '')));
                const common = (u) => { let i = 0; while (i < u.length && u[i] === ep.pageUrl[i]) i++; return i; };
                return links.sort((a, b) => common(b) - common(a))[0] || null;
            }).catch(() => null);
        }

        function disableLiveVideoOnPage() {
            // esprit-donghua/animoflix : neutralise l'iframe native du
            // lecteur pour eviter un flux video en double sous notre calque.
            // anime-sama : #playerDF charge desormais ansembed par defaut.
            const iframe = document.getElementById('odysee-iframe') || document.querySelector('iframe[src*="odysee.com"]') || document.querySelector('#epVideoFrame') || document.getElementById('playerDF') ||
                // Sites ajoutes : relu ici (french-anime recree son lecteur apres le chargement).
                (site.custom ? document.getElementById('film_iframe') || findPlayerIframe(document) || site.liveIframe : null);
            if (iframe && iframe.src && iframe.src !== 'about:blank') {
                iframe.src = 'about:blank';
                console.log('[AnimeTracker v6] lecteur natif de la page desactive (evite un flux video en double)');
            }
        }

        function startEpisode(infoPromise, reason) {
            Promise.resolve(infoPromise).then((info) => {
                if (!info) { console.log('[AnimeTracker v6] aucun episode detecte sur cette page'); return; }
                disableLiveVideoOnPage();
                // Sites ajoutes : le site peut (re)creer son lecteur apres coup
                // (french-anime le fait apres le chargement) -> son en double.
                if (site.custom) [1000, 3000, 6000, 10000].forEach((ms) => setTimeout(disableLiveVideoOnPage, ms));
                const { overlay } = buildOverlay();
                overlay.style.display = 'block';

                if (currentEpisode && currentEpisode.site === info.site && currentEpisode.seriesUrl === info.seriesUrl &&
                    currentEpisode.episodeNumber === info.episodeNumber && overlayEls.playerFrame.src) {
                    console.log('[AnimeTracker v6] episode deja charge, reaffichage - raison :', reason);
                    currentEpisode = info;
                    applyRuntimeConfig(storageKey(info));
                    sendConfigToPlayerFrame();
                    postToPlayerFrame({ type: MSG_PREFIX + 'play' });
                    setStatus('Lecture');
                    buildPersistentPanel();
                    return;
                }
                console.log('[AnimeTracker v6] demande de lecture (' + info.site + ') :', info.embedSrc, '- raison :', reason);
                applyLoadedEpisode(info, false);
            }).catch((e) => console.log('[AnimeTracker v6] echec ouverture du lecteur', e));
        }

        function maybeAutoOpenPlayer(liveInfoPromise) {
            let continuing = false;
            try { continuing = sessionStorage.getItem('vc-continue-playing') === '1'; sessionStorage.removeItem('vc-continue-playing'); } catch (e) {}
            if (!isAutoOpenEnabled() && !continuing) return;
            Promise.resolve(liveInfoPromise).then((info) => {
                if (!info || isSeriesExcluded(storageKey(info))) return;
                startEpisode(Promise.resolve(info), 'auto au chargement de la page');
            });
        }

        function applyUpdatedConfigIfCurrent(key) {
            if (!currentEpisode || storageKey(currentEpisode) !== key) return;
            applyRuntimeConfig(key);
            sendConfigToPlayerFrame();
        }

        const INTRO_OUTRO_LABELS = {
            introStart: 'Debut du generique de debut (vide = il commence a 0:00, pas de resume avant)',
            introEnd: 'Fin du generique de debut',
            outroStart: 'Debut du generique de fin',
            outroEnd: 'Fin du generique de fin (vide = episode suivant des le generique ; a remplir si l\'episode continue apres)'
        };
        function promptIntroOutro(field) {
            if (!currentEpisode) { alert('Ouvre d\'abord le lecteur sur un episode.'); return; }
            const key = storageKey(currentEpisode);
            const current = getIntroOutroForKey(key)[field];
            const input = prompt(INTRO_OUTRO_LABELS[field] + ' pour "' + currentEpisode.seriesName + '" (format mm:ss, ou ex. 0712 pour 7:12) :', formatTimecode(current));
            if (input === null) return;
            // Champ vide = effacer (utile pour les 2 bornes optionnelles).
            const seconds = input.trim() ? parseTimecode(input) : null;
            if (input.trim() && seconds === null) return;
            setIntroOutroForKey(key, { [field]: seconds });
            applyUpdatedConfigIfCurrent(key);
        }

        function parseTimecode(input) {
            if (!input) return null;
            input = input.trim();
            if (input.indexOf(':') !== -1) {
                const parts = input.split(':').map((p) => parseInt(p, 10));
                if (parts.some(isNaN)) return null;
                let seconds = 0;
                for (let i = 0; i < parts.length; i++) seconds = seconds * 60 + parts[i];
                return seconds;
            }
            if (!/^\d+$/.test(input)) return null;
            const seconds = parseInt(input.slice(-2), 10);
            const minutes = parseInt(input.slice(0, -2) || '0', 10);
            if (isNaN(seconds) || isNaN(minutes)) return null;
            return minutes * 60 + seconds;
        }
        function formatTimecode(seconds) {
            if (seconds === undefined || seconds === null) return '';
            const m = Math.floor(seconds / 60);
            const s = seconds % 60;
            return m + ':' + String(s).padStart(2, '0');
        }

        // Meme principe que l'assistant Diablo IV : ouvre l'URL brute GitHub
        // du script (@downloadURL), Tampermonkey intercepte et propose
        // "Mettre a jour" / "Reinstaller" selon la version. Repli en dur si
        // GM_info ne la porte pas (copie importee a la main).
        function openScriptUpdatePage() {
            const url = (typeof GM_info !== 'undefined' && GM_info.script && (GM_info.script.downloadURL || GM_info.script.updateURL)) ||
                'https://raw.githubusercontent.com/Tryne-graphik/Vid-os-continuum/master/esprit-donghua-suivi-progression-v6.user.js';
            window.open(url, '_blank', 'noopener,noreferrer');
        }

        function openSettingsModal() {
            const progress = loadProgress();
            const entries = Object.keys(progress).map((k) => Object.assign({ key: k }, progress[k]))
                .sort((a, b) => (a.siteLabel || '').localeCompare(b.siteLabel || '') || a.seriesName.localeCompare(b.seriesName));

            const overlay = document.createElement('div');
            overlay.id = 'ep-settings-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1000001;display:flex;align-items:center;justify-content:center;';

            const box = document.createElement('div');
            box.style.cssText = 'background:#15151f;color:#eee;max-width:760px;width:92%;max-height:80vh;overflow:auto;border-radius:8px;padding:20px;font-family:Arial,sans-serif;';

            let html = '<h2 style="margin-top:0;color:#03d0fc;font-size:16px;">Reglages intro/outro des animes suivis</h2>';
            if (entries.length === 0) {
                html += '<p style="font-size:13px;color:#aaa;">Aucun anime suivi pour le moment.</p>';
            } else {
                html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
                html += '<tr style="text-align:left;color:#aaa;border-bottom:1px solid #333;">' +
                    '<th style="padding:6px 4px;">Site</th><th style="padding:6px 4px;">Anime</th>' +
                    '<th style="padding:6px 4px;">Debut intro</th><th style="padding:6px 4px;">Fin intro</th><th style="padding:6px 4px;">Debut outro</th><th style="padding:6px 4px;">Fin outro</th>' +
                    '<th style="padding:6px 4px;">Suivi</th></tr>';
                entries.forEach((e) => {
                    const io = getIntroOutroForKey(e.key);
                    const tracked = !isSeriesExcluded(e.key);
                    const unconfigured = !io.introEnd && !io.outroStart;
                    const rowStyle = unconfigured ? 'background:rgba(255,179,0,.08);' : '';
                    html += '<tr style="border-bottom:1px solid #222;' + rowStyle + '" data-key="' + e.key + '">' +
                        '<td style="padding:6px 4px;color:#888;">' + (e.siteTag || '') + '</td>' +
                        '<td style="padding:6px 4px;">' + (unconfigured ? '&#9888; ' : '') + escapeHtml(e.seriesName) + '</td>' +
                        '<td style="padding:6px 4px;"><input type="text" class="ep-set-introStart-input" placeholder="mm:ss" style="width:60px;background:#000;color:#eee;border:1px solid #333;border-radius:4px;padding:3px;" value="' + formatTimecode(io.introStart) + '"></td>' +
                        '<td style="padding:6px 4px;"><input type="text" class="ep-set-introEnd-input" placeholder="mm:ss" style="width:60px;background:#000;color:#eee;border:1px solid #333;border-radius:4px;padding:3px;" value="' + formatTimecode(io.introEnd) + '"></td>' +
                        '<td style="padding:6px 4px;"><input type="text" class="ep-set-outroStart-input" placeholder="mm:ss" style="width:60px;background:#000;color:#eee;border:1px solid #333;border-radius:4px;padding:3px;" value="' + formatTimecode(io.outroStart) + '"></td>' +
                        '<td style="padding:6px 4px;"><input type="text" class="ep-set-outroEnd-input" placeholder="mm:ss" style="width:60px;background:#000;color:#eee;border:1px solid #333;border-radius:4px;padding:3px;" value="' + formatTimecode(io.outroEnd) + '"></td>' +
                        '<td style="padding:6px 4px;text-align:center;"><input type="checkbox" class="ep-set-tracked-input" ' + (tracked ? 'checked' : '') + '></td>' +
                        '</tr>';
                });
                html += '</table>';
            }
            html += '<div style="margin-top:16px;text-align:right;">' +
                '<button id="ep-settings-save" style="background:#03d0fc;color:#000;border:none;padding:8px 14px;border-radius:4px;cursor:pointer;font-weight:bold;margin-right:8px;">Enregistrer</button>' +
                '<button id="ep-settings-close" style="background:#333;color:#fff;border:none;padding:8px 14px;border-radius:4px;cursor:pointer;">Fermer</button></div>';

            box.innerHTML = html;
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });
            box.querySelector('#ep-settings-close').addEventListener('click', () => overlay.remove());
            const saveBtn = box.querySelector('#ep-settings-save');
            if (saveBtn) saveBtn.addEventListener('click', () => {
                box.querySelectorAll('tr[data-key]').forEach((row) => {
                    const key = row.getAttribute('data-key');
                    const patch = {};
                    ['introStart', 'introEnd', 'outroStart', 'outroEnd'].forEach((f) => { patch[f] = parseTimecode(row.querySelector('.ep-set-' + f + '-input').value); });
                    const tracked = row.querySelector('.ep-set-tracked-input').checked;
                    setIntroOutroForKey(key, patch);
                    setSeriesExcluded(key, !tracked);
                    applyUpdatedConfigIfCurrent(key);
                });
                overlay.remove();
                buildPersistentPanel();
            });
        }

        // ---- Panneau persistant ----

        function updatePanelStatus(text) {
            const el = document.getElementById('ep-player-status');
            if (el) el.innerHTML = statusHtml(text);
        }

        function checkForNewEpisodes() {
            const progress = loadProgress();
            const excluded = loadExcludedSeries();
            const entries = Object.keys(progress).map((k) => Object.assign({ key: k }, progress[k])).filter((e) => !excluded[e.key] && e.episodeUrl);
            let changed = false;
            const checks = entries.map((e) => {
                const site = SITES.find((s) => s.id === e.site);
                if (!site) return Promise.resolve();
                // Site ajoute : verifiable seulement depuis ce site (pas dans
                // @connect -> refus de Tampermonkey vu depuis Odysee, v6.25).
                if (site.custom && !hostMatches(location.href, site.label)) return Promise.resolve();
                // Raccourci seulement si la page affiche bien l'episode enregistre
                // (sinon "Tout vu" etait annule par la page ouverte, ex. ep. 1).
                if (currentEpisode && storageKey(currentEpisode) === e.key && Number(currentEpisode.episodeNumber) === Number(e.episodeNumber)) {
                    applyResultFor(e, currentEpisode, changed_ => { if (changed_) changed = true; });
                    return Promise.resolve();
                }
                if (e.site === 'anime-sama') {
                    // Ne PAS passer par applyResultFor()/hasNextEpisode()
                    // ici : une extraction fraiche sans "#ep=" dans l'URL
                    // repart toujours a l'episode 1 (episodeIndex=0), donc
                    // hasNextEpisode() aurait toujours dit "oui" (des qu'il
                    // y a plus d'1 episode dans la saison) au lieu de
                    // comparer au VRAI episode deja suivi (entry.episodeNumber).
                    // Comparaison directe a la place.
                    const seasonUrl = e.seriesUrl;
                    return fetchPageHtml(seasonUrl).then((html) => {
                        const doc = new DOMParser().parseFromString(html, 'text/html');
                        return site.extract(doc, seasonUrl);
                    }).then((info) => {
                        if (!info) return;
                        const watchedNumber = Number(e.episodeNumber) || 0;
                        let didChange = false;
                        const had = newEpisodes[e.key];
                        if (info.totalEpisodes > watchedNumber) {
                            const url = seasonUrl + '#ep=' + (watchedNumber + 1);
                            if (!had || had.url !== url) didChange = true;
                            newEpisodes[e.key] = { seriesName: e.seriesName, site: e.site, url: url };
                        } else if (had) { delete newEpisodes[e.key]; didChange = true; }
                        if (info.totalEpisodes && latestKnownEpisode[e.key] !== info.totalEpisodes) { latestKnownEpisode[e.key] = info.totalEpisodes; didChange = true; }
                        if (didChange) changed = true;
                    }).catch(() => {});
                }
                return fetchPageHtml(e.episodeUrl).catch((err) => {
                    // ED a renumerote ses adresses par saison (s4-e243 -> s4-e113,
                    // 404 vu 2026-10-06) : retrouver l'episode dans la liste de la
                    // page serie et corriger l'adresse enregistree.
                    if (e.site !== 'esprit-donghua' || !/statut 404/.test(err.message)) throw err;
                    return relocateEdEpisodeUrl(e).then((url) => fetchPageHtml(url));
                }).then((html) => {
                    const doc = new DOMParser().parseFromString(html, 'text/html');
                    return site.extract(doc, e.episodeUrl);
                }).then((info) => { if (info) applyResultFor(e, info, (c) => { if (c) changed = true; }); }).catch(() => {});
            });
            return Promise.all(checks).then(() => {
                const firstCheck = !lastNewEpisodesCheckAt;
                lastNewEpisodesCheckAt = new Date();
                if (changed || firstCheck) buildPersistentPanel();
                refreshTrackingPopup();
                refreshThumbnailBadges();
            });

            function relocateEdEpisodeUrl(entry) {
                return fetchPageHtml(entry.seriesUrl).then((html) => {
                    const doc = new DOMParser().parseFromString(html, 'text/html');
                    const li = Array.from(doc.querySelectorAll('.eplister li')).find((el) => {
                        const num = el.querySelector('.epl-num');
                        return num && Number(num.textContent.trim()) === Number(entry.episodeNumber);
                    });
                    const a = li && li.querySelector('a[href]');
                    if (!a) throw new Error('episode ' + entry.episodeNumber + ' introuvable sur la page serie');
                    const url = resolveUrl(a.getAttribute('href'), entry.seriesUrl);
                    const oldUrl = entry.episodeUrl;
                    const progress = loadProgress();
                    if (progress[entry.key]) { progress[entry.key].episodeUrl = url; saveProgress(progress); }
                    const history = loadHistory();
                    if (history[entry.key] && history[entry.key].episodeUrl === oldUrl) { history[entry.key].episodeUrl = url; saveHistory(history); }
                    entry.episodeUrl = url;
                    console.log('[AnimeTracker v6] adresse corrigee pour ' + entry.seriesName + ' : ' + oldUrl + ' -> ' + url);
                    return url;
                });
            }

            function applyResultFor(entry, info, cb) {
                let didChange = false;
                const had = newEpisodes[entry.key];
                const hasNext = hasNextEpisode(info);
                if (hasNext) {
                    const url = info.navStyle === 'page' ? info.nextPageUrl : info.resumeUrlsByIndex[info.episodeIndex + 1];
                    if (!had || had.url !== url) didChange = true;
                    newEpisodes[entry.key] = { seriesName: entry.seriesName, site: entry.site, url: url };
                } else if (had) { delete newEpisodes[entry.key]; didChange = true; }
                if (info.latestEpisodeNumber && latestKnownEpisode[entry.key] !== info.latestEpisodeNumber) {
                    latestKnownEpisode[entry.key] = info.latestEpisodeNumber; didChange = true;
                }
                cb(didChange);
            }
        }

        function displayName(name) {
            if (!name) return name;
            const match = name.match(/\(([^)]+)\)/);
            return match ? match[1].trim() : name;
        }

        function formatRelativeDays(iso) {
            if (!iso) return null;
            const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
            if (days <= 0) return "vu aujourd'hui";
            if (days === 1) return 'vu hier';
            return 'vu il y a ' + days + 'j';
        }

        // Groupe par site (demande explicite de l'utilisateur), puis
        // nouveaux episodes en tete, puis alphabetique au sein du groupe.
        function seriesSortCompare(a, b) {
            if (a.siteTag !== b.siteTag) return (a.siteTag || '').localeCompare(b.siteTag || '');
            const aNew = newEpisodes[a.key] ? 1 : 0;
            const bNew = newEpisodes[b.key] ? 1 : 0;
            if (aNew !== bNew) return bNew - aNew;
            return a.seriesName.localeCompare(b.seriesName);
        }

        function buildSeriesOptionLabel(e) {
            const latest = latestKnownEpisode[e.key];
            const epStr = latest ? (e.episodeNumber || '?') + '/' + latest : String(e.episodeNumber || '?');
            return '[' + (e.siteTag || '?') + '] ' + displayName(e.seriesName) + ' - Ep ' + epStr;
        }

        function getCurrentEpisodeDisplay() {
            if (!currentEpisode || !currentEpisode.seriesName) return null;
            const key = storageKey(currentEpisode);
            const epNum = currentEpisode.episodeNumber || '?';
            const latest = latestKnownEpisode[key];
            const isNew = !!newEpisodes[key];
            return {
                name: '[' + currentEpisode.siteTag + '] ' + displayName(currentEpisode.seriesName),
                fullName: currentEpisode.seriesName + ' (' + currentEpisode.siteLabel + ')',
                epText: 'Episode ' + (latest ? epNum + ' / ' + latest : epNum),
                color: isNew ? '#ffb300' : '#4caf50'
            };
        }

        // ---- Resume par site + fenetre de suivi (demande 2026-10-01) ----
        // Une ligne cliquable par site : nom, nb d'animes suivis, nb de
        // nouveaux episodes (somme dernier connu - vu quand les deux sont
        // connus, sinon 1 par serie signalee). Ouvre openTrackingPopup().

        function countNewEpisodesFor(key, watched) {
            if (!newEpisodes[key]) return 0;
            const latest = Number(latestKnownEpisode[key]);
            const w = Number(watched);
            return latest && w && latest > w ? latest - w : 1;
        }

        function getTrackedEntriesBySite() {
            const progress = loadProgress();
            const excluded = loadExcludedSeries();
            const bySite = {};
            Object.keys(progress).forEach((k) => {
                if (excluded[k]) return;
                const e = Object.assign({ key: k }, progress[k]);
                (bySite[e.site] = bySite[e.site] || []).push(e);
            });
            return bySite;
        }

        // Meme anime suivi sur plusieurs sites (nom normalise identique, sites differents).
        function crossSiteDuplicates(entries) {
            const groups = {};
            entries.forEach((e) => { const n = normalizeSeriesName(e.seriesName); (groups[n] = groups[n] || []).push(e); });
            return Object.values(groups).filter((g) => new Set(g.map((e) => e.site)).size > 1);
        }
        function renderDuplicatesHtml() {
            const all = [].concat(...Object.values(getTrackedEntriesBySite()));
            const dups = crossSiteDuplicates(all);
            if (!dups.length) return '';
            return collapsibleSection('doublons', '&#9888; ' + dups.length + ' doublon' + (dups.length > 1 ? 's' : ''), dups.map((g) => g.map((e) =>
                '<div style="display:flex;align-items:center;gap:4px;background:rgba(255,80,80,.15);border:1px solid #f66;border-radius:4px;padding:4px 6px;font-size:11px;">' +
                '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(e.seriesName) + '">[' + escapeHtml(e.siteTag || '') + '] ' + escapeHtml(displayName(e.seriesName)) + ' &middot; ep. ' + escapeHtml(String(e.episodeNumber || '?')) + '</span>' +
                '<button class="vc-dup-drop" data-key="' + escapeHtml(e.key) + '" data-name="' + escapeHtml(displayName(e.seriesName) + ' [' + (e.siteTag || '') + ']') + '" title="Ne plus suivre sur ce site" style="background:none;border:none;color:#f66;cursor:pointer;font-size:13px;">&#10005;</button></div>').join('')).join(''), false);
        }

        function renderTrackingSummary() {
            const bySite = getTrackedEntriesBySite();
            const onlyBehind = getSiteFilter() === 'behind' && lastNewEpisodesCheckAt;
            const lines = SITES.filter((s) => bySite[s.id] && matchesSiteFilter(s.id) && (!onlyBehind || bySite[s.id].some((e) => newEpisodes[e.key]))).map((s) => {
                const entries = bySite[s.id];
                // Nombre d'ANIMES a rattraper, pas d'episodes : une seule serie
                // tres en retard (ex. 139 ep.) noyait le total. Detail par
                // anime dans la fenetre de suivi.
                const nbBehind = entries.filter((e) => newEpisodes[e.key]).length;
                const newText = !lastNewEpisodesCheckAt ? 'verification...' : (nbBehind ? nbBehind + ' a rattraper' : 'a jour');
                const color = nbBehind > 0 ? '#ffb300' : '#4caf50';
                return '<div class="ep-summary-line" data-site="' + s.id + '" title="Ouvrir le suivi detaille" style="cursor:pointer;background:rgba(3,208,252,.12);border:1px solid #03d0fc;border-radius:6px;padding:7px 9px;font-size:12px;">' +
                    '<div style="font-weight:bold;color:#03d0fc;">' + s.label + ' &#9656;</div>' +
                    '<div style="color:' + color + ';">' + entries.length + ' suivi' + (entries.length > 1 ? 's' : '') + ' &middot; ' + newText + '</div></div>';
            }).join('');
            return (lines || (onlyBehind ? '<div style="font-size:12px;color:#4caf50;text-align:center;">Tout est à jour</div>' : '')) + renderDuplicatesHtml();
        }

        function bindTrackingSummary(container) {
            container.querySelectorAll('.ep-summary-line').forEach((el) => {
                el.addEventListener('click', () => openTrackingPopup(el.getAttribute('data-site')));
            });
            container.querySelectorAll('.vc-dup-drop').forEach((btn) => btn.addEventListener('click', () => {
                if (!confirm('Ne plus suivre "' + btn.getAttribute('data-name') + '" ? (sa progression sur ce site sera oubliee)')) return;
                setSeriesExcluded(btn.getAttribute('data-key'), true);
                buildPersistentPanel();
            }));
        }

        let trackingPopupSite = null;
        function refreshTrackingPopup() {
            if (document.getElementById('ep-tracking-overlay')) openTrackingPopup(trackingPopupSite);
        }

        // "Deja tout vu" (demande 2026-10-02) : place la progression sur le
        // dernier episode connu sans le relancer. Seulement quand on sait
        // construire son URL (sinon la prochaine verification reprendrait
        // l'ancienne page et resignalerait des nouveaux episodes).
        function lastEpisodeUrlFor(e, latest) {
            if (e.site === 'anime-sama') return e.seriesUrl + '#ep=' + latest;
            const site = SITES.find((s) => s.id === e.site);
            return site && site.buildEpisodeUrl && e.episodeUrl ? site.buildEpisodeUrl(e.episodeUrl, latest) : null;
        }
        function markSeriesFullyWatched(key) {
            const progress = loadProgress();
            const e = progress[key];
            const latest = latestKnownEpisode[key];
            const url = e && latest ? lastEpisodeUrlFor(e, latest) : null;
            if (!url) return;
            progress[key] = Object.assign({}, e, { episodeNumber: latest, episodeLabel: 'Episode ' + latest, episodeUrl: url, watchedAt: new Date().toISOString() });
            saveProgress(progress);
            delete newEpisodes[key];
        }

        // anime-sama : meme page, seule l'ancre #ep=N change - sans
        // rechargement le navigateur ne fait rien, on force donc.
        function bindSamePageLinks(pop) {
            pop.querySelectorAll('a[href]').forEach((a) => a.addEventListener('click', (ev) => {
                if (a.href.replace(/#.*$/, '') !== location.href.replace(/#.*$/, '')) return;
                ev.preventDefault();
                location.href = a.href;
                location.reload();
            }));
        }

        function openHistoryPopup() {
            const old = document.getElementById('vc-history-overlay');
            if (old) old.remove();
            const history = loadHistory();
            const rows = Object.keys(history).map((k) => Object.assign({ key: k }, history[k]))
                .sort((a, b) => String(b.watchedAt).localeCompare(String(a.watchedAt)));
            const dupKeys = new Set([].concat(...crossSiteDuplicates(rows)).map((e) => e.key));
            const pop = document.createElement('div');
            pop.id = 'vc-history-overlay';
            pop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;';
            let html = '<div style="background:#15151f;color:#eee;max-width:720px;width:92%;max-height:80vh;overflow:auto;border-radius:8px;padding:20px;">' +
                '<h2 style="margin:0 0 4px;color:#03d0fc;font-size:16px;">&#128338; Historique</h2>' +
                '<div style="font-size:11px;color:#888;margin-bottom:12px;">Dernier episode regarde de chaque serie (' + HISTORY_MAX + ' max). &#9733; = suivie. En rouge : le meme anime sur deux sites.</div>';
            if (!rows.length) html += '<div style="color:#aaa;font-size:12px;">Rien pour l\'instant.</div>';
            else {
                html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
                rows.forEach((e) => {
                    const tracked = isSeriesTracked(e.key);
                    html += '<tr style="border-bottom:1px solid #222;' + (dupKeys.has(e.key) ? 'background:rgba(255,80,80,.18);color:#ff8a8a;' : '') + '">' +
                        '<td style="padding:6px 4px;color:#ffd400;">' + (tracked ? '&#9733;' : '') + '</td>' +
                        '<td style="padding:6px 4px;" title="' + escapeHtml(e.seriesName) + '">' + escapeHtml(displayName(e.seriesName)) + '</td>' +
                        '<td style="padding:6px 4px;">ep. ' + escapeHtml(String(e.episodeNumber || '?')) + '</td>' +
                        '<td style="padding:6px 4px;color:#aaa;">' + escapeHtml(e.siteTag || '') + '</td>' +
                        '<td style="padding:6px 4px;color:#aaa;">' + (formatRelativeDays(e.watchedAt) || '') + '</td>' +
                        '<td style="padding:6px 2px;text-align:right;"><a href="' + escapeHtml(e.episodeUrl || '#') + '" style="color:#fff;background:#333;text-decoration:none;padding:4px 8px;border-radius:4px;white-space:nowrap;">&#9654; Reprendre</a></td>' +
                        '<td style="padding:6px 2px;">' + (tracked ? '' : '<button class="vc-hist-track" data-key="' + escapeHtml(e.key) + '" style="background:none;border:1px solid #4caf50;border-radius:4px;color:#4caf50;cursor:pointer;font-size:12px;padding:2px 6px;white-space:nowrap;">&#9734; Suivre</button>') + '</td>' +
                        '<td style="padding:6px 2px;"><button class="vc-hist-del" data-key="' + escapeHtml(e.key) + '" title="Retirer de l\'historique" style="background:none;border:none;color:#f66;cursor:pointer;font-size:14px;padding:2px 6px;">&#10005;</button></td></tr>';
                });
                html += '</table>';
            }
            html += '<div style="margin-top:16px;text-align:right;"><button id="vc-history-close" style="background:#03d0fc;color:#000;border:none;padding:8px 14px;border-radius:4px;cursor:pointer;font-weight:bold;">Fermer</button></div></div>';
            pop.innerHTML = html;
            const host = overlayEls && overlayEls.overlay.style.display !== 'none' ? overlayEls.overlay : document.body;
            host.appendChild(pop);
            pop.addEventListener('click', (ev) => { if (ev.target === pop) pop.remove(); });
            pop.querySelector('#vc-history-close').addEventListener('click', () => pop.remove());
            bindSamePageLinks(pop);
            pop.querySelectorAll('.vc-hist-track').forEach((btn) => btn.addEventListener('click', () => {
                const key = btn.getAttribute('data-key');
                const h = loadHistory()[key];
                if (!h) return;
                const progress = loadProgress();
                progress[key] = Object.assign({}, h);
                saveProgress(progress);
                setSeriesExcluded(key, false);
                buildPersistentPanel();
                if (overlayEls) syncOverlayControls();
                openHistoryPopup();
            }));
            pop.querySelectorAll('.vc-hist-del').forEach((btn) => btn.addEventListener('click', () => {
                const h = loadHistory();
                delete h[btn.getAttribute('data-key')];
                GM_setValue('watchHistory', h);
                openHistoryPopup();
            }));
        }

        function openTrackingPopup(siteId) {
            trackingPopupSite = siteId;
            const old = document.getElementById('ep-tracking-overlay');
            if (old) old.remove();
            const siteObj = SITES.find((s) => s.id === siteId) || { id: siteId, label: siteId };
            const entries = (getTrackedEntriesBySite()[siteId] || []).sort((a, b) => {
                const d = countNewEpisodesFor(b.key, b.episodeNumber) - countNewEpisodesFor(a.key, a.episodeNumber);
                return d || displayName(a.seriesName).localeCompare(displayName(b.seriesName));
            });

            const pop = document.createElement('div');
            pop.id = 'ep-tracking-overlay';
            pop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;';
            const checkedText = lastNewEpisodesCheckAt ? 'Derniere verification : ' + lastNewEpisodesCheckAt.toLocaleTimeString().slice(0, 5) : 'Pas encore verifie';
            let html = '<div style="background:#15151f;color:#eee;max-width:720px;width:92%;max-height:80vh;overflow:auto;border-radius:8px;padding:20px;">' +
                '<h2 style="margin:0 0 4px;color:#03d0fc;font-size:16px;">Suivi - ' + siteObj.label + '</h2>' +
                '<div style="font-size:11px;color:#888;margin-bottom:12px;">' + entries.length + ' anime(s) suivi(s) &middot; ' + checkedText + '</div>' +
                '<table style="width:100%;border-collapse:collapse;font-size:12px;">' +
                '<tr style="text-align:left;color:#aaa;border-bottom:1px solid #333;"><th style="padding:6px 4px;">Anime</th><th style="padding:6px 4px;">Vu</th><th style="padding:6px 4px;">Dispo</th><th style="padding:6px 4px;">Dernier visionnage</th><th></th><th></th><th></th><th></th></tr>';
            entries.forEach((e) => {
                const nb = countNewEpisodesFor(e.key, e.episodeNumber);
                const latest = latestKnownEpisode[e.key];
                const link = nb ? newEpisodes[e.key].url : e.episodeUrl;
                const action = nb ? 'Regarder (' + nb + ' nouveau' + (nb > 1 ? 'x' : '') + ')' : 'Reprendre';
                html += '<tr style="border-bottom:1px solid #222;' + (nb ? 'color:#ffb300;font-weight:bold;' : '') + '">' +
                    '<td style="padding:6px 4px;" title="' + escapeHtml(e.seriesName) + '">' + escapeHtml(displayName(e.seriesName)) + '</td>' +
                    '<td style="padding:6px 4px;">' + (e.episodeNumber || '?') + '</td>' +
                    '<td style="padding:6px 4px;">' + (latest || '?') + '</td>' +
                    '<td style="padding:6px 4px;font-weight:normal;color:#aaa;">' + (formatRelativeDays(e.watchedAt) || '') + '</td>' +
                    '<td style="padding:6px 4px;text-align:right;"><a href="' + escapeHtml(link) + '" style="color:' + (nb ? '#000;background:#ffb300' : '#fff;background:#333') + ';text-decoration:none;padding:4px 8px;border-radius:4px;white-space:nowrap;">' + action + '</a></td>' +
                    '<td style="padding:6px 2px;"><button class="ep-tracking-info" data-key="' + escapeHtml(e.key) + '" title="Fiche : synopsis, genres" style="background:none;border:1px solid #03d0fc;border-radius:4px;color:#03d0fc;cursor:pointer;font-size:12px;padding:2px 6px;">&#8505;</button></td>' +
                    '<td style="padding:6px 2px;">' + (nb && latest && lastEpisodeUrlFor(e, latest) ? '<button class="ep-tracking-allseen" data-key="' + escapeHtml(e.key) + '" data-name="' + escapeHtml(displayName(e.seriesName)) + '" data-latest="' + escapeHtml(String(latest)) + '" title="Deja tout vu (jusqu\'a l\'ep. ' + escapeHtml(String(latest)) + ')" style="background:none;border:1px solid #4caf50;border-radius:4px;color:#4caf50;cursor:pointer;font-size:12px;padding:2px 6px;white-space:nowrap;">&#10003; Tout vu</button>' : '') + '</td>' +
                    '<td style="padding:6px 2px;"><button class="ep-tracking-drop" data-key="' + escapeHtml(e.key) + '" data-name="' + escapeHtml(displayName(e.seriesName)) + '" title="Abandonner le suivi" style="background:none;border:none;color:#f66;cursor:pointer;font-size:14px;padding:2px 6px;">&#10005;</button></td></tr>';
            });
            html += '</table><div style="margin-top:16px;text-align:right;">' +
                '<button id="ep-tracking-check" style="background:#333;color:#fff;border:none;padding:8px 14px;border-radius:4px;cursor:pointer;margin-right:8px;">&#8635; Verifier maintenant</button>' +
                '<button id="ep-tracking-close" style="background:#03d0fc;color:#000;border:none;padding:8px 14px;border-radius:4px;cursor:pointer;font-weight:bold;">Fermer</button></div></div>';
            pop.innerHTML = html;
            // Dans le calque du lecteur s'il est affiche (sinon invisible en
            // plein ecran, qui ne montre que les descendants du calque).
            const host = overlayEls && overlayEls.overlay.style.display !== 'none' ? overlayEls.overlay : document.body;
            host.appendChild(pop);
            pop.addEventListener('click', (ev) => { if (ev.target === pop) pop.remove(); });
            pop.querySelector('#ep-tracking-close').addEventListener('click', () => pop.remove());
            bindSamePageLinks(pop);
            // Meme effet que decocher "Suivre cet anime" : reactivable via
            // Configuration (case "Suivi").
            pop.querySelectorAll('.ep-tracking-info').forEach((btn) => btn.addEventListener('click', () => {
                const e = entries.find((x) => x.key === btn.getAttribute('data-key'));
                if (e) openSeriesInfo(e);
            }));
            pop.querySelectorAll('.ep-tracking-allseen').forEach((btn) => btn.addEventListener('click', () => {
                if (!confirm('Marquer "' + btn.getAttribute('data-name') + '" comme vu jusqu\'a l\'episode ' + btn.getAttribute('data-latest') + ' ?')) return;
                markSeriesFullyWatched(btn.getAttribute('data-key'));
                buildPersistentPanel();
                refreshTrackingPopup();
            }));
            pop.querySelectorAll('.ep-tracking-drop').forEach((btn) => btn.addEventListener('click', () => {
                if (!confirm('Abandonner le suivi de "' + btn.getAttribute('data-name') + '" ?')) return;
                setSeriesExcluded(btn.getAttribute('data-key'), true);
                buildPersistentPanel();
                refreshTrackingPopup();
            }));
            pop.querySelector('#ep-tracking-check').addEventListener('click', (ev) => {
                ev.currentTarget.disabled = true; ev.currentTarget.textContent = 'Recherche...';
                checkForNewEpisodes();
            });
        }

        function syncOverlayControls() {
            if (!overlayEls) return;
            const disp = getCurrentEpisodeDisplay();
            if (overlayEls.currentNameEl && overlayEls.currentEpEl) {
                overlayEls.currentNameEl.textContent = disp ? disp.name : '';
                overlayEls.currentNameEl.title = disp ? disp.fullName : '';
                overlayEls.currentEpEl.textContent = disp ? disp.epText : '';
                overlayEls.currentEpEl.style.color = disp ? disp.color : '#eee';
            }
            overlayEls.autoNextCb.checked = isAutoNextEnabled();
            overlayEls.autoOpenCb.checked = isAutoOpenEnabled();
            overlayEls.trackCb.checked = !!(currentEpisode && isSeriesTracked(storageKey(currentEpisode)));

            const progress = loadProgress();
            const excluded = loadExcludedSeries();
            const entries = Object.keys(progress).map((k) => Object.assign({ key: k }, progress[k])).filter((e) => !excluded[e.key] && matchesSiteFilter(e.site)).sort(seriesSortCompare);
            const select = overlayEls.seriesSelect;
            select.innerHTML = '<option value="">-- Changer de serie --</option>';
            if (overlayEls.siteFilterSelect) overlayEls.siteFilterSelect.value = getSiteFilter();
            entries.forEach((e) => {
                const opt = document.createElement('option');
                opt.value = e.episodeUrl;
                opt.textContent = buildSeriesOptionLabel(e);
                if (currentEpisode && e.key === storageKey(currentEpisode)) opt.selected = true;
                if (newEpisodes[e.key]) { opt.style.color = '#ffb300'; opt.style.fontWeight = 'bold'; }
                const since = formatRelativeDays(e.watchedAt);
                if (since) opt.title = since;
                select.appendChild(opt);
            });
            const summaryEl = overlayEls.overlay.querySelector('#ed-tracking-summary');
            if (summaryEl) { summaryEl.innerHTML = renderTrackingSummary(); bindTrackingSummary(summaryEl); }
        }

        function ensurePanelToggleButton() {
            let toggleBtn = document.getElementById('ep-toggle-btn');
            if (toggleBtn) return toggleBtn;
            toggleBtn = document.createElement('button');
            toggleBtn.id = 'ep-toggle-btn';
            toggleBtn.type = 'button';
            toggleBtn.title = 'Afficher/masquer le panneau de progression';
            toggleBtn.style.cssText = 'position:fixed;top:60px;left:10px;z-index:999999;background:#15151f;color:#eee;border:none;border-radius:6px;width:34px;height:34px;cursor:pointer;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,.4);';
            toggleBtn.innerHTML = '<span id="ep-toggle-icon">☰</span>' +
                '<span id="ep-toggle-badge" style="position:absolute;top:-6px;right:-6px;background:#ffb300;color:#000;font-size:10px;font-weight:bold;min-width:16px;height:16px;border-radius:8px;display:none;align-items:center;justify-content:center;padding:0 3px;line-height:1;"></span>';
            document.body.appendChild(toggleBtn);
            toggleBtn.addEventListener('click', () => {
                const panelEl = document.getElementById('ep-panel');
                if (!panelEl) return;
                const hidden = panelEl.style.display === 'none';
                panelEl.style.display = hidden ? 'flex' : 'none';
                toggleBtn.querySelector('#ep-toggle-icon').textContent = hidden ? '✕' : '☰';
            });
            return toggleBtn;
        }

        function updateToggleBadge() {
            const badge = document.getElementById('ep-toggle-badge');
            if (!badge) return;
            const excluded = loadExcludedSeries();
            const count = Object.keys(newEpisodes).filter((key) => !excluded[key]).length;
            if (count > 0) { badge.textContent = count > 99 ? '99+' : String(count); badge.style.display = 'flex'; }
            else badge.style.display = 'none';
        }

        // Ouvre l'episode Odysee equivalent a la page esprit-donghua.xyz
        // actuelle, dans un nouvel onglet - demande explicite de
        // l'utilisateur. Le lien exact (cle de stockage cote Odysee) n'est
        // connu qu'une fois LA-BAS (chaine + prefixe de serie tires des
        // metadonnees de cette page, cf. SITE_ODYSEE.extract) - les reglages
        // intro/outro actuels sont donc places dans un "transfert en
        // attente" repris au demarrage cote Odysee par
        // maybeApplyPendingIntroOutroTransfer(), plutot que copies
        // directement vers une cle qu'on ne peut pas calculer ici.
        function openCurrentEpisodeOnOdysee() {
            if (!currentEpisode || currentEpisode.site !== 'esprit-donghua' || !currentEpisode.embedSrc) return;
            const watchUrl = currentEpisode.embedSrc.replace(/\/(?:\$|%24)\/embed\//, '/');
            const current = getIntroOutroForKey(storageKey(currentEpisode));
            if (current.introEnd || current.outroStart) {
                GM_setValue('pendingIntroOutroTransfer', { introEnd: current.introEnd || null, outroStart: current.outroStart || null, at: Date.now() });
            }
            window.open(watchUrl, '_blank', 'noopener');
        }

        // Cote receveur du transfert ci-dessus : n'applique que dans les 20s
        // suivant l'ouverture (evite d'ecraser les reglages d'une visite
        // Odysee independante plus tard) et seulement si cette entree
        // Odysee n'a pas deja ses propres reglages intro/outro.
        function maybeApplyPendingIntroOutroTransfer(info) {
            if (!info || info.site !== 'odysee') return;
            const pending = GM_getValue('pendingIntroOutroTransfer', null);
            if (!pending || (Date.now() - pending.at) > 20000) return;
            GM_setValue('pendingIntroOutroTransfer', null);
            const key = storageKey(info);
            const existing = getIntroOutroForKey(key);
            if (existing.introEnd || existing.outroStart) return;
            setIntroOutroForKey(key, { introEnd: pending.introEnd, outroStart: pending.outroStart });
        }

        function buildPersistentPanel() {
            ensurePanelToggleButton();
            updateToggleBadge();

            let panel = document.getElementById('ep-panel');
            if (!panel) {
                panel = document.createElement('div');
                panel.id = 'ep-panel';
                panel.style.cssText = 'position:fixed;top:104px;left:10px;z-index:999998;background:#15151f;color:#eee;padding:12px;font-family:Arial,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.4);border-radius:8px;display:flex;flex-direction:column;gap:8px;width:260px;max-height:calc(100vh - 120px);overflow-y:auto;';
                document.body.appendChild(panel);
            }

            const progress = loadProgress();
            const excluded = loadExcludedSeries();
            const entries = Object.keys(progress).map((k) => Object.assign({ key: k }, progress[k])).filter((e) => !excluded[e.key] && matchesSiteFilter(e.site)).sort(seriesSortCompare);

            const scriptVersion = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '6.0';
            // Etat ouvert/ferme des sections conserve d'une reconstruction a
            // l'autre (le panneau est regenere a chaque changement).
            const prevOpen = {};
            panel.querySelectorAll('details[data-sec]').forEach((d) => { prevOpen[d.getAttribute('data-sec')] = d.open; });
            const CHECK = 'display:flex;align-items:center;gap:6px;font-size:11px;color:#ccc;';

            let html = '<div style="font-weight:bold;color:#03d0fc;font-size:15px;text-align:center;">Vidéo Continuum <span style="font-size:12px;color:#ffd400;">v' + scriptVersion + '</span></div>';

            if (currentEpisode && currentEpisode.seriesName) {
                const disp = getCurrentEpisodeDisplay();
                html += '<div style="font-size:13px;font-weight:bold;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:0;" title="' + escapeHtml(disp.fullName) + '">' + escapeHtml(disp.name) + '</div>';
                html += '<div style="font-size:18px;font-weight:bold;color:' + disp.color + ';text-align:center;">' + disp.epText + '</div>';
                html += '<button id="ep-open-player" style="background:#03d0fc;color:#000;border:none;padding:7px 10px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;">Ouvrir le lecteur</button>';
                html += '<button id="ep-info-btn" style="' + BTN_STYLE + '">&#8505; Fiche de l\'anime</button>';
                html += '<div id="ep-player-status" style="font-size:11px;color:#ccc;"></div>';
                html += trackButtonHtml('ep-track-series', isSeriesTracked(storageKey(currentEpisode)));
            }

            if (entries.length === 0) {
                html += '<div style="font-size:12px;color:#aaa;">Aucun anime suivi.</div>';
            } else {
                html += '<select id="ep-select" style="width:100%;padding:6px;border-radius:4px;border:none;background:#000;color:#eee;font-size:11px;font-family:Consolas,monospace;">';
                html += '<option value="">-- Choisir un anime --</option>';
                entries.forEach((e) => {
                    const label = buildSeriesOptionLabel(e);
                    const selected = currentEpisode && e.key === storageKey(currentEpisode) ? ' selected' : '';
                    const style = newEpisodes[e.key] ? ' style="color:#ffb300;font-weight:bold;"' : '';
                    const since = formatRelativeDays(e.watchedAt);
                    const titleAttr = since ? ` title="${since}"` : '';
                    html += `<option value="${escapeHtml(e.episodeUrl)}"${selected}${style}${titleAttr}>${escapeHtml(label)}</option>`;
                });
                html += '</select>';
            }

            html += '<button id="ep-check-new" style="' + BTN_STYLE + '">&#8635; Verifier les nouveaux episodes</button>';
            html += '<button id="ep-history-btn" style="' + BTN_STYLE + '">&#128338; Historique</button>';
            html += toggleButtonsHtml('ep-', isAutoNextEnabled(), isAutoOpenEnabled());

            html += collapsibleSection('reglages', 'Reglages',
                '<div style="display:flex;gap:4px;"><button id="ep-set-intro" style="' + BTN_STYLE + 'flex:1;">Fin intro</button><button id="ep-set-outro" style="' + BTN_STYLE + 'flex:1;">Debut outro</button></div>' +
                collapsibleSection('plus', 'Plus',
                    '<div style="display:flex;gap:4px;"><button id="ep-set-introstart" style="' + BTN_STYLE + 'flex:1;">Debut intro</button><button id="ep-set-outroend" style="' + BTN_STYLE + 'flex:1;">Fin outro</button></div>' +
                    '<button id="ep-settings-btn" style="' + BTN_STYLE + '">Configuration</button>' +
                    (entries.length ? '<button id="ep-delete-btn" style="background:#5a1f1f;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;">Supprimer la serie selectionnee</button>' : ''),
                    prevOpen.plus, true),
                prevOpen.reglages);
            if (currentEpisode && currentEpisode.seriesName) {
                html += collapsibleSection('youtube', 'Autres sources',
                    (currentEpisode.site === 'esprit-donghua' ? '<button id="ep-open-odysee" title="Ouvre cet episode directement sur odysee.com dans un nouvel onglet (playlist/suivant-precedent geres la-bas independamment)." style="' + BTN_STYLE + '">Ouvrir sur Odysee</button>' : '') +
                    '<button id="ep-youtube-auto-btn" title="Cherche cet episode sur YouTube et propose les videos en vignettes (compilations : bon moment via les chapitres). La chaine choisie est retenue pour la suite." style="' + BTN_STYLE + '">Trouver sur YouTube</button>' +
                    '<button id="ep-youtube-off-btn" style="' + BTN_STYLE + '">Revenir a la source du site</button>',
                    prevOpen.youtube);
            }
            html += collapsibleSection('sauvegarde', 'Sauvegarde',
                '<button id="ep-export-panel" style="' + BTN_STYLE + '">Exporter</button>' +
                '<button id="ep-import-panel" style="' + BTN_STYLE + '">Importer</button>' +
                '<button id="ep-choose-backup" style="' + BTN_STYLE + '">Choisir fichier sauvegarde</button>' +
                '<button id="ep-reauth-backup" style="' + BTN_STYLE + '">Reautoriser l\'acces au fichier</button>' +
                '<span id="ep-backup-status" style="font-size:11px;color:#888;"></span>' +
                '<input type="file" id="ep-import-file" accept=".html,.htm" style="display:none;">',
                prevOpen.sauvegarde);
            html += incidentSectionHtml('ep', prevOpen.incident);
            html += newsSectionHtml(prevOpen.nouveautes);
            html += '<button id="ep-check-update-btn" title="Ouvre la page d\'installation du script - Tampermonkey indique lui-meme si une mise a jour est disponible" style="' + BTN_STYLE + '">&#128260; Verifier MAJ</button>';
            html += '<select id="ep-site-filter" title="Filtrer la liste des animes suivis par site" style="width:100%;padding:6px;border-radius:4px;border:none;background:#000;color:#eee;font-size:11px;">' +
                buildSiteFilterOptionsHtml() + '</select>';
            html += renderTrackingSummary();
            html += siteLinksHtml() + openModeSelectHtml();

            panel.innerHTML = html;
            panel.querySelector('#ep-history-btn').addEventListener('click', openHistoryPopup);
            refreshIntroOutroButtons();

            const select = panel.querySelector('#ep-select');
            if (select) select.addEventListener('change', () => { if (select.value) location.href = select.value; });

            const siteFilterSelect = panel.querySelector('#ep-site-filter');
            if (siteFilterSelect) siteFilterSelect.addEventListener('change', () => { setSiteFilter(siteFilterSelect.value); buildPersistentPanel(); });

            const deleteBtn = panel.querySelector('#ep-delete-btn');
            if (deleteBtn) deleteBtn.addEventListener('click', () => {
                if (!select.value) { alert('Choisis d\'abord une serie dans la liste.'); return; }
                const entry = entries.find((e) => e.episodeUrl === select.value);
                if (!entry) return;
                if (!confirm('Retirer definitivement cette serie de la liste suivie ?')) return;
                deleteProgressEntry(entry.key);
                buildPersistentPanel();
            });

            bindTrackingSummary(panel);
            bindIncidentSection(panel, 'ep');
            bindNewsSection(panel);
            const checkNewBtn = panel.querySelector('#ep-check-new');
            if (checkNewBtn) checkNewBtn.addEventListener('click', () => {
                checkNewBtn.disabled = true; checkNewBtn.textContent = 'Recherche...';
                checkForNewEpisodes().then(() => { checkNewBtn.disabled = false; checkNewBtn.textContent = '↻ Verifier les nouveaux episodes'; });
            });

            const exportBtn = panel.querySelector('#ep-export-panel');
            if (exportBtn) exportBtn.addEventListener('click', exportProgress);

            const importFileInput = panel.querySelector('#ep-import-file');
            const importBtn = panel.querySelector('#ep-import-panel');
            if (importBtn && importFileInput) {
                importBtn.addEventListener('click', () => importFileInput.click());
                importFileInput.addEventListener('change', () => {
                    if (importFileInput.files && importFileInput.files[0]) importProgressFile(importFileInput.files[0]);
                    importFileInput.value = '';
                });
            }

            const chooseBackupBtn = panel.querySelector('#ep-choose-backup');
            if (chooseBackupBtn) chooseBackupBtn.addEventListener('click', chooseBackupFile);
            const reauthBackupBtn = panel.querySelector('#ep-reauth-backup');
            if (reauthBackupBtn) reauthBackupBtn.addEventListener('click', reauthorizeBackupFile);
            updateBackupStatusUi();

            const infoBtn = panel.querySelector('#ep-info-btn');
            if (infoBtn) infoBtn.addEventListener('click', () => { if (currentEpisode) openSeriesInfo(currentEpisode); });
            const openPlayerBtn = panel.querySelector('#ep-open-player');
            if (openPlayerBtn) openPlayerBtn.addEventListener('click', () => startEpisode(getEpisodeInfoForCurrentPage(), 'clic manuel'));

            const openOdyseeBtn = panel.querySelector('#ep-open-odysee');
            if (openOdyseeBtn) openOdyseeBtn.addEventListener('click', openCurrentEpisodeOnOdysee);

            const youtubeAutoBtn = panel.querySelector('#ep-youtube-auto-btn');
            if (youtubeAutoBtn) youtubeAutoBtn.addEventListener('click', useYoutubeAutoForCurrentEpisode);
            const youtubeOffBtn = panel.querySelector('#ep-youtube-off-btn');
            if (youtubeOffBtn) youtubeOffBtn.addEventListener('click', leaveYoutubeMode);

            const autoNextCheckbox = panel.querySelector('#ep-autonext');
            if (autoNextCheckbox) autoNextCheckbox.addEventListener('change', () => {
                setAutoNextEnabled(autoNextCheckbox.checked);
                if (currentEpisode) applyUpdatedConfigIfCurrent(storageKey(currentEpisode));
            });
            const autoOpenCheckbox = panel.querySelector('#ep-autoopen');
            if (autoOpenCheckbox) autoOpenCheckbox.addEventListener('change', () => setAutoOpenEnabled(autoOpenCheckbox.checked));

            [['#ep-set-introstart', 'introStart'], ['#ep-set-intro', 'introEnd'], ['#ep-set-outro', 'outroStart'], ['#ep-set-outroend', 'outroEnd']].forEach(([sel, field]) => {
                const btn = panel.querySelector(sel);
                if (btn) btn.addEventListener('click', () => promptIntroOutro(field));
            });
            const settingsBtn = panel.querySelector('#ep-settings-btn');
            if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);
            const checkUpdateBtn = panel.querySelector('#ep-check-update-btn');
            if (checkUpdateBtn) checkUpdateBtn.addEventListener('click', openScriptUpdatePage);

            const trackCheckbox = panel.querySelector('#ep-track-series');
            if (trackCheckbox && currentEpisode) {
                trackCheckbox.addEventListener('change', () => {
                    const key = storageKey(currentEpisode);
                    setSeriesExcluded(key, !trackCheckbox.checked);
                    if (trackCheckbox.checked) recordEpisodeProgress(currentEpisode, true);
                    buildPersistentPanel();
                });
            }

            if (overlayEls) updatePanelStatus(lastStatusText);
            syncOverlayControls();
        }

        function getLiveEpisodeInfo() {
            if (!site.isPlayablePage(document)) return Promise.resolve(null);
            return Promise.resolve(site.extract(document, location.href));
        }

        function getEpisodeInfoForCurrentPage() {
            if (currentEpisode && currentEpisode.pageUrl.replace(/#.*$/, '') === location.href.replace(/#.*$/, '')) return Promise.resolve(currentEpisode);
            return getLiveEpisodeInfo();
        }

        console.log('[AnimeTracker v6] enregistrement des commandes de menu...');
        GM_registerMenuCommand('Voir ma progression', () => buildPersistentPanel());
        if (site.custom) GM_registerMenuCommand('Retirer ' + site.label + ' de Video Continuum', () => {
            if (!confirm('Retirer ' + site.label + ' des sites geres ? (les animes suivis restent dans la liste)')) return;
            const all = loadCustomSites(); delete all[site.label]; GM_setValue('customSites', all); location.reload();
        });
        GM_registerMenuCommand('\uD83C\uDFAC Mes animes (Vidéo Continuum)', openFavoritesPopup);
        GM_registerMenuCommand('Exporter en fichier', exportProgress);
        GM_registerMenuCommand('Choisir le fichier de sauvegarde', chooseBackupFile);
        GM_registerMenuCommand('Ouvrir le lecteur', () => startEpisode(getEpisodeInfoForCurrentPage(), 'commande menu'));

        // Vignettes anime-sama (v6.18) : elles menent a la page de saison, ou
        // "Lecteur auto" lance l'episode. Petit bouton "Fiche" vers la page
        // de l'anime (/catalogue/<slug>/ : synopsis, genres). Cartes
        // generees en JS par le site -> observateur.
        if (site.id === 'anime-sama') {
            const addFicheButtons = () => {
                document.querySelectorAll('.card-base a[href*="/catalogue/"]').forEach((a) => {
                    const card = a.closest('.card-base');
                    if (!card || card.querySelector('.ep-fiche-btn')) return;
                    const m = a.href.match(/^(https?:\/\/[^/]+\/catalogue\/[^/]+\/)[^/]+/);
                    if (!m) return;
                    const btn = document.createElement('span');
                    btn.className = 'ep-fiche-btn';
                    btn.title = 'Page de l\'anime (synopsis, genres)';
                    btn.textContent = '\u2139 Fiche';
                    btn.style.cssText = 'position:absolute;left:6px;bottom:6px;z-index:5;background:rgba(3,208,252,.9);color:#000;font:bold 11px Arial,sans-serif;padding:3px 7px;border-radius:4px;cursor:pointer;';
                    btn.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); location.href = m[1]; });
                    const host = card.querySelector('.card-image-container') || card;
                    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
                    host.appendChild(btn);
                });
            };
            addFicheButtons();
            let ficheTimer = null;
            new MutationObserver(() => { clearTimeout(ficheTimer); ficheTimer = setTimeout(addFicheButtons, 300); })
                .observe(document.body, { childList: true, subtree: true });
        }

        // Pastilles sur les vignettes (v6.40) : vert = suivi ici, turquoise =
        // suivi ici avec episode(s) en retard, jaune = suivi sur un autre site,
        // rouge = exclu du suivi. Reconnaissance par le nom (comme les doublons).
        const BADGES = {
            ici: ['#2ecc40', 'Suivi sur ce site, a jour'],
            retard: ['#03d0fc', 'Suivi sur ce site, nouvel episode disponible'],
            ailleurs: ['#ffd400', 'Suivi sur un autre site'],
            exclu: ['#ff4136', 'Exclu du suivi']
        };
        function nameVariants(name) {
            const s = String(name || '').replace(/\s*[-:]?\s*(\b(s\d+\s*)?e\d+\b|(episode|épisode|ep\.?)\s*\d+).*$/i, '').replace(/\s*saison\s*\d+.*$/i, '');
            const inside = (s.match(/\(([^)]+)\)/) || [])[1];
            return [s, s.replace(/\([^)]*\)/g, ''), inside].map((n) => (n || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
                .replace(/\b(vostfr|vf)\b/g, '').replace(/[^a-z0-9]/g, '')).filter((n) => n.length >= 3);
        }
        function refreshThumbnailBadges() {
            const progress = loadProgress();
            const excluded = loadExcludedSeries();
            const rank = { exclu: 1, ailleurs: 2, ici: 3, retard: 3 };
            const byName = {};
            Object.keys(progress).forEach((k) => {
                const e = progress[k];
                const state = excluded[k] ? 'exclu' : e.site !== site.id ? 'ailleurs' : newEpisodes[k] ? 'retard' : 'ici';
                nameVariants(e.seriesName).forEach((n) => { if (!byName[n] || rank[state] > rank[byName[n]]) byName[n] = state; });
            });
            document.querySelectorAll('a[href] img').forEach((img) => {
                const a = img.closest('a');
                if (a.closest('[id^="ep-"],[id^="ed-"]')) return;
                const title = a.getAttribute('title') || img.getAttribute('alt') || (a.querySelector('h1,h2,h3,h4') || {}).textContent;
                const state = nameVariants(title).map((n) => byName[n]).filter(Boolean).sort((x, y) => rank[y] - rank[x])[0];
                const host = img.parentElement;
                let badge = host.querySelector(':scope > .ep-thumb-badge');
                if (!state) { if (badge) badge.remove(); return; }
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'ep-thumb-badge';
                    badge.style.cssText = 'position:absolute;top:6px;left:6px;z-index:5;width:36px;height:36px;border-radius:7px;background:rgba(10,10,18,.8);box-shadow:0 1px 4px rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;pointer-events:auto;';
                    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
                    host.appendChild(badge);
                }
                if (badge.getAttribute('data-state') === state) return;
                badge.setAttribute('data-state', state);
                // Icone liste a cases (style Flaticon "lister") : cases a la couleur
                // de l'etat, 1re cochee (croix si exclu), la marque se trace (v6.41)
                const c = BADGES[state][0];
                const mark = state === 'exclu' ? 'M3.7 3.2l2.6 2.6M6.3 3.2L3.7 5.8' : 'M3.5 4.7l1.2 1.2 2-2.4';
                const row = (y) => '<rect x="2.5" y="' + y + '" width="5" height="5" rx=".8" stroke="' + c + '"/><rect x="10.5" y="' + (y + 1.1) + '" width="11" height="2.8" rx="1.4" stroke="#fff" stroke-width="1.3"/>';
                badge.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
                    row(2) + row(9.5) + row(17) +
                    '<path d="' + mark + '" stroke="' + c + '" stroke-dasharray="10" stroke-dashoffset="10"><animate attributeName="stroke-dashoffset" from="10" to="0" dur=".5s" begin=".1s" fill="freeze"/></path></svg>';
                badge.title = BADGES[state][1];
            });
        }
        refreshThumbnailBadges();
        let badgeTimer = null;
        new MutationObserver((muts) => {
            if (muts.every((m) => Array.from(m.addedNodes).every((n) => n.nodeType === 1 && n.closest('.ep-thumb-badge')))) return;
            clearTimeout(badgeTimer); badgeTimer = setTimeout(refreshThumbnailBadges, 400);
        }).observe(document.body, { childList: true, subtree: true });

        mergeOdyseeDuplicatesOnce();
        const liveInfoPromise = getLiveEpisodeInfo();
        liveInfoPromise.then((liveInfo) => {
            if (liveInfo) {
                currentEpisode = currentEpisode || liveInfo;
                maybeApplyPendingIntroOutroTransfer(liveInfo);
                recordEpisodeProgress(liveInfo);
            }
            buildPersistentPanel();
            loadBackupFileHandle().then(maybeAutoExport);
            maybeAutoOpenPlayer(Promise.resolve(liveInfo));
        }).catch((e) => console.log('[AnimeTracker v6] echec extraction initiale', e));

        setTimeout(checkForNewEpisodes, 8000);
        setInterval(checkForNewEpisodes, 20 * 60 * 1000);
        console.log('[AnimeTracker v6] initialisation terminee');
    }
})();
