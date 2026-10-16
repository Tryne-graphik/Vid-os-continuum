// ==UserScript==
// @name         Anime Tracker Continuum (v6)
// @namespace    esprit-donghua-tracker-v6
// @version      7.4
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
// @grant        GM_getResourceURL
// @resource     vcCinzel https://raw.githubusercontent.com/Tryne-graphik/Vid-os-continuum/master/themes/cinzel.woff2
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
//    `a.ep-nav-btn[aria-label="Épisode précédent"]`). Mais 2-3 hebergeurs
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

    // Opera + Tampermonkey (2026-10-16) : addEventListener n'enregistre rien (boutons morts, sans erreur)
    // alors que les proprietes onclick... marchent. Test au demarrage ; si casse, repli sur on<type>.
    // ponytail: le repli occupe la propriete on<type> (un site qui la reecrit apres coup ecrase nos ecouteurs).
    (function fixBrokenAddEventListener() {
        const proto = EventTarget.prototype;
        const nativeAdd = proto.addEventListener, nativeRemove = proto.removeEventListener;
        let ok = false;
        const probe = document.createElement('span');
        nativeAdd.call(probe, 'click', () => { ok = true; });
        probe.click();
        if (ok) return;
        console.warn('[AnimeTracker v6] addEventListener inactif (Opera + Tampermonkey ?) : repli sur les proprietes on<type>.');
        const lists = new WeakMap();
        proto.addEventListener = function (type, fn, opts) {
            if (typeof fn !== 'function' || !(('on' + type) in this)) return nativeAdd.call(this, type, fn, opts);
            let byType = lists.get(this);
            if (!byType) lists.set(this, byType = {});
            let list = byType[type];
            if (!list) {
                list = byType[type] = [];
                const target = this, prev = this['on' + type];
                this['on' + type] = function (ev) {
                    if (typeof prev === 'function') prev.call(target, ev);
                    list.slice().forEach((l) => {
                        if (l.once) list.splice(list.indexOf(l), 1);
                        l.fn.call(target, ev);
                    });
                };
            }
            if (!list.some((l) => l.fn === fn)) list.push({ fn: fn, once: !!(opts && opts.once) });
        };
        proto.removeEventListener = function (type, fn, opts) {
            const list = (lists.get(this) || {})[type];
            if (!list) return nativeRemove.call(this, type, fn, opts);
            const i = list.findIndex((l) => l.fn === fn);
            if (i >= 0) list.splice(i, 1);
        };
        // window / document peuvent etre des enveloppes du bac a sable : on les force aussi.
        [window, document].forEach((t) => { try { t.addEventListener = proto.addEventListener; t.removeEventListener = proto.removeEventListener; } catch (e) { /* lecture seule */ } });
    })();

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
            if (event.source !== window.parent) return; // v7.0 : seulement le calque (pas une pub voisine)
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

        // Encadre jaune retire en v6.32 (bruit sans action possible) : console seule (code supprime en v7.0).
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
    //    lecteur = la plus grande iframe, "suivant" = lien "Épisode suivant"
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
    // ou qu'ils soient (panneau, calque).
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
    function addCurrentSite() {
        const host = hostOf(location.href);
        const site = makeGenericSite(host);
        Promise.resolve(site.isPlayablePage(document) ? site.extract(document, location.href) : null).then((info) => {
            if (!info || !info.embedSrc) {
                alert('Aucun lecteur video reconnu sur cette page.\n\nOuvre la page d\'un episode (lecteur visible), puis reessaie.');
                return;
            }
            const nbPlayers = (info.embedCandidates || []).length;
            if (!confirm('Detecte sur ' + host + ' :\n\nAnime : ' + info.seriesName + '\nEpisode : ' + info.episodeNumber + (info.totalEpisodes ? ' (sur ' + info.totalEpisodes + ')' : '') +
                '\nLecteur : ' + hostOf(info.embedSrc) + (nbPlayers > 1 ? ' (+' + (nbPlayers - 1) + ' de secours)' : '') +
                '\nÉpisode suivant : ' + (info.navStyle === 'index' ? 'liste du site' : (info.nextPageUrl ? 'lien trouve' : 'non trouve')) +
                '\n\nAjouter ' + host + ' a Video Continuum ? (la page va se recharger)')) return;
            const all = loadCustomSites();
            all[host] = { addedAt: new Date().toISOString() };
            GM_setValue('customSites', all);
            location.reload();
        });
    }

    const CURRENT_SITE = detectSite();
    if (!CURRENT_SITE) {
        // Autre site : seulement "Ajouter ce site" dans le menu Tampermonkey
        // (fenetre "Mes animes" et bouton flottant retires en v6.50).
        if (!isTopFrame) return;
        GM_registerMenuCommand('\u2795 Ajouter ce site a Vidéo Continuum', addCurrentSite);
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
        // v7.0 : focus clavier dans la fenetre ouverte, rendu au bouton d'origine a la fermeture.
        function focusDialog(el) {
            const opener = document.activeElement;
            const rm = el.remove.bind(el);
            el.remove = () => { rm(); if (opener && opener.isConnected && opener.focus) opener.focus(); };
            el.tabIndex = -1; el.style.outline = 'none';
            el.focus();
        }
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
            // v7.0 : pas de guillemet/chevron/espace dans un lien importe (sortie
            // d'attribut HTML si un rendu oublie escapeHtml).
            const okUrl = (u) => /^https:\/\/[^\s"'<>`]+$/i.test(u) && known.matchesUrl(u);
            const episodeUrl = str(e.episodeUrl, 1000);
            if (!okUrl(episodeUrl)) return null;
            const seriesName = str(e.seriesName, 300);
            if (!seriesName) return null;
            let seriesUrl = str(e.seriesUrl, 1000);
            if (!okUrl(seriesUrl) && seriesUrl.indexOf('legacy:') !== 0) seriesUrl = 'legacy:' + seriesName;
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
                if (!data[k] || typeof data[k] !== 'object') { delete data[k]; return; } // v7.0 : entree corrompue
                const known = SITES.find((x) => x.id === data[k].site);
                if (known) { data[k].siteTag = known.tag; data[k].siteLabel = known.label; }
            });
            return data;
        }
        function saveProgress(data) { GM_setValue(STORE_KEY, data); }

        function loadExcludedSeries() { return GM_getValue('excludedSeries', {}); }
        function saveExcludedSeries(data) { GM_setValue('excludedSeries', data); }
        function isSeriesExcluded(key) { return !!loadExcludedSeries()[key]; }
        // Marques par nom, posees depuis la Fiche (suivie ou non) : { nom normalise: nom affiche }.
        // naime = pas aimee (v6.63), vu = deja vue avant le script (v6.64). [cle GM, bouton, couleur]
        const NAME_MARKS = { naime: ['dislikedSeries', '\uD83D\uDC4E Pas aime', '#ff851b'], vu: ['seenSeries', '\u2713 Deja vu', '#c0c0c0'] };
        function loadNameMark(st) { return GM_getValue(NAME_MARKS[st][0], {}); }
        function nameMarkKey(name) { return nameVariants(name)[0] || ''; }
        // Saison finie, en attente de la suite (v6.48) : { cle: dernier ep. connu au marquage }.
        // Reste verifie ; retire tout seul quand un episode plus recent apparait.
        function loadSeasonDone() { return GM_getValue('seasonDone', {}); }
        function setSeasonDone(key, on) {
            const all = loadSeasonDone();
            if (on) all[key] = Number(latestKnownEpisode[key]) || Number((loadProgress()[key] || {}).episodeNumber) || 0; else delete all[key];
            GM_setValue('seasonDone', all);
            // Pause alors qu'une saison suivante est annoncee = pas interesse :
            // elle n'est plus re-signalee (sinon retiree de l'attente a chaque verif).
            const ns = loadNewSeasons();
            if (on && ns[key]) {
                const dismissed = GM_getValue('seasonDismissed', {});
                dismissed[key] = ns[key].n;
                GM_setValue('seasonDismissed', dismissed);
                delete ns[key];
                GM_setValue('newSeasons', ns);
            }
        }
        function loadNewSeasons() { return GM_getValue('newSeasons', {}); }
        function forgetSeasonState(key) {
            ['seasonDone', 'newSeasons', 'seasonDismissed'].forEach((name) => {
                const all = GM_getValue(name, {});
                if (key in all) { delete all[key]; GM_setValue(name, all); }
            });
        }
        function isBehind(key) { return (!!newEpisodes[key] || !!loadNewSeasons()[key]) && !loadSeasonDone()[key]; }

        // Nouvelles saisons (v6.49) : anime-sama (saisonN/langue), animoflix
        // (saison-N, meme entree de suivi), myfluneo (une fiche par saison :
        // slug, slug-2, slug-3...). fam = meme anime, n = numero de saison.
        function seasonOf(url) {
            let m;
            url = String(url || '');
            if ((m = url.match(/anime-sama\.[a-z]+\/catalogue\/([^/]+)\/saison(\d+)(?:-(\d+))?\/([^/#?]+)/))) return { fam: 'as:' + m[1] + ':' + m[4], n: Number(m[2]) + (Number(m[3]) || 0) / 100, lang: m[4] };
            if ((m = url.match(/animoflix\.to\/anime\/([^/]+)\/saison-(\d+)\/([^/]+)\//))) return { fam: 'af:' + m[1], n: Number(m[2]), slug: m[1], lang: m[3] };
            if ((m = url.match(/myfluneo\.[a-z]+\/anime\/([^/?#]+?)(?:-(\d+))?(?:[/?#]|$)/))) return { fam: 'mf:' + m[1], n: Number(m[2]) || 1, base: m[1] };
            return null;
        }
        function seasonLabel(n) { return 'Saison ' + Math.floor(n) + (n % 1 ? ' partie ' + Math.round((n % 1) * 100) : ''); }
        function findNextSeason(e) {
            const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const cur = seasonOf(e.site === 'animoflix' ? e.episodeUrl : e.seriesUrl);
            if (!cur) return Promise.resolve(null);
            if (cur.fam.indexOf('as:') === 0) {
                const base = e.seriesUrl.match(/^(.*\/catalogue\/[^/]+\/)/)[1];
                return fetchPageHtml(base).then((html) => {
                    // Saisons commentees (/* ... */) ignorees ; hors-series (saison1hs), films, OAV aussi.
                    const list = Array.from(html.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/panneauAnime\("[^"]*",\s*"(saison(\d+)(?:-(\d+))?\/([^"/]+))\/?"\)/g))
                        .map((m) => ({ path: m[1], n: Number(m[2]) + (Number(m[3]) || 0) / 100, lang: m[4] }))
                        .filter((x) => x.lang === cur.lang && x.n > cur.n).sort((a, b) => a.n - b.n);
                    if (!list.length) return null;
                    // Saison listee avant ses episodes : episodes.js doit en contenir au moins un.
                    const seasonUrl = base + list[0].path + '/';
                    return fetchPageHtml(seasonUrl).then((h2) => {
                        const js = h2.match(/<script[^>]+src=["']([^"']*episodes\.js[^"']*)["']/i);
                        return js ? fetchPageHtml(resolveUrl(js[1], seasonUrl)) : '';
                    }).then((jsText) => (jsText && buildEmbedByIndex(parseEpsArrays(jsText)).length ? { url: seasonUrl + '#ep=1', n: list[0].n } : null));
                });
            }
            if (cur.fam.indexOf('af:') === 0) {
                return fetchPageHtml(e.seriesUrl).then((html) => {
                    const ns = Array.from(html.matchAll(new RegExp('/anime/' + esc(cur.slug) + '/saison-(\\d+)/', 'g'))).map((m) => Number(m[1])).filter((n) => n > cur.n).sort((a, b) => a - b);
                    if (!ns.length) return null;
                    const seasonUrl = 'https://animoflix.to/anime/' + cur.slug + '/saison-' + ns[0] + '/';
                    // Episode 1 dans la meme langue = la saison est vraiment sortie.
                    return fetchPageHtml(seasonUrl).then((h2) => {
                        const m = h2.match(new RegExp('/anime/' + esc(cur.slug) + '/saison-' + ns[0] + '/' + esc(cur.lang) + '/episode-1/'));
                        return m ? { url: resolveUrl(m[0], seasonUrl), n: ns[0] } : null;
                    });
                });
            }
            const origin = new URL(e.seriesUrl).origin;
            const curSlug = (e.seriesUrl.match(/\/anime\/([^/?#]+)/) || [])[1];
            if (!curSlug) return Promise.resolve(null);
            return fetchPageHtml(origin + '/anime/' + curSlug).then((html) => {
                const ns = Array.from(html.matchAll(new RegExp('/anime/' + esc(cur.base) + '-(\\d+)"', 'g'))).map((m) => Number(m[1])).filter((n) => n > cur.n).sort((a, b) => a - b);
                if (!ns.length) return null;
                const slug = cur.base + '-' + ns[0];
                return fetchPageHtml(origin + '/anime/' + slug).then((h2) => {
                    const m = h2.match(new RegExp('href="(/anime/' + esc(slug) + '/[^"]*episode-1)"'));
                    return m ? { url: origin + m[1], n: ns[0] } : null;
                });
            });
        }
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
        // v7.1 : nom de la serie en mots entiers ("The Demon Hunter's Romance",
        // serie live, passait pour "The Demon Hunter") et pas d'autre saison
        // annoncee ("S2", "Season 3", "Saison 2", "S02E480", "Nom 2 EP17").
        // ponytail: saison du titre comparee a celle de l'adresse du site ; une chaine qui numerote autrement est ecartee
        function ytWords(t) { return ' ' + String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]s\b/g, 's').replace(/[^a-z0-9]+/g, ' ').trim() + ' '; }
        function ytTitleOk(title, name, season) {
            const t = ytWords(title), k = ytWords(name);
            const at = t.indexOf(k);
            if (k.length < 4 || at === -1) return false;
            const m = t.match(/ s(?:eason|aison)? ?0?(\d{1,2})(?= |e\d)/) || t.slice(at + k.length).match(/^(\d{1,2}) (?:ep|episode)/);
            return !m || Number(m[1]) === season;
        }
        function seriesSeason(info) {
            const url = info.resumeUrl || info.pageUrl || '';
            const sea = seasonOf(url);
            return sea ? Math.floor(sea.n) : Number((url.match(/-s(\d+)-e\d+/) || [])[1]) || 1;
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
            const season = seriesSeason(info);
            // Duree de l'episode si le lecteur du site l'a donnee : ecarte un episode unique 2x trop long/court.
            const dur = aniSkip && aniSkip.key === storageKey(info) && aniSkip.ep === info.episodeNumber && aniSkip.duration;
            return Promise.all(queries.map((q) => fetchPageHtml('https://www.youtube.com/results?hl=fr&ucbcb=1&search_query=' + encodeURIComponent(q)).catch(() => ''))).then((pages) => {
                pages.forEach((html) => (function walk(o) {
                    if (Array.isArray(o)) { o.forEach(walk); return; }
                    if (!o || typeof o !== 'object') return;
                    if (o.videoId && o.title && o.lengthText && o.ownerText && !seen[o.videoId]) {
                        seen[o.videoId] = true;
                        const title = o.title.simpleText || (o.title.runs || []).map((r) => r.text).join('');
                        const owner = (o.ownerText.runs || [])[0] || {};
                        const be = owner.navigationEndpoint && owner.navigationEndpoint.browseEndpoint;
                        const name = names.find((v) => ytTitleOk(title, v, season));
                        const range = episodeRangeInTitle(title, n);
                        // Extraits / bandes-annonces : pas l'episode entier.
                        const teaser = /highlight|trailer|preview|teaser|bande[- ]annonce|apercu|aperçu|clip|shorts?/i.test(title);
                        const vf = /vostfr|\bfr\b|fran[cç]ais/i.test(title);
                        // Badge "Sous-titres" = vraie piste traduisible en FR. Sans
                        // badge ni FR : sous-titres anglais incrustes, ecartee (v6.35).
                        const cc = /"label":"(?:Sous-titres|CC|Subtitles)"/.test(JSON.stringify(o.badges || []));
                        const len = ytTimeToSec(o.lengthText.simpleText);
                        const badLen = dur && range && range.first === range.last && (len > dur * 1.6 || len < dur * 0.5);
                        if (name && range && be && be.browseId && !teaser && !badLen && (vf || cc)) {
                            out.push({ id: o.videoId, title: title, len: len, channelId: be.browseId, channelName: owner.text || '',
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
                    '<div data-yt="' + i + '" role="button" tabindex="0" style="display:flex;gap:8px;align-items:center;cursor:pointer;background:#1f1508;border:1px solid #5a4010;border-radius:6px;padding:4px;margin-bottom:4px;">' +
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
        // Choix de la source (v7.1, remplace le volet "Sources") : lecteurs du
        // site, meme episode sur les autres sites geres, resultats YouTube.
        function showSourceChooser(info) {
            if (!overlayEls) return;
            const box = overlayEls.siteErrorBox;
            const BTN = 'display:block;width:100%;text-align:left;margin-bottom:4px;background:#0d2a33;color:#fff;border:1px solid #03d0fc;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:12px;';
            const head = (t, c) => '<div style="font-weight:bold;color:' + c + ';margin:10px 0 4px;">' + t + '</div>';
            let site = head('Sur ' + escapeHtml(info.siteLabel || 'le site'), '#03d0fc');
            if (ytActive) site += '<button type="button" data-act="site" style="' + BTN + '">&#8617; Revenir au lecteur du site</button>';
            else site += playerCandidates.map((src, i) => '<button type="button" data-act="player" data-i="' + i + '" style="' + BTN + (i === playerCandidateIndex ? 'opacity:.6;cursor:default;' : '') + '"' + (i === playerCandidateIndex ? ' disabled' : '') + '>' +
                'Lecteur ' + (i + 1) + ' &middot; ' + escapeHtml(hostOf(src)) + (i === playerCandidateIndex ? ' &#10003; en cours' : '') + '</button>').join('');
            if (info.site === 'esprit-donghua') site += '<button type="button" data-act="odysee" style="' + BTN + '">Ouvrir sur odysee.com (nouvel onglet)</button>';
            box.setAttribute('data-kind', 'sources');
            box.innerHTML = '<div style="font-size:16px;font-weight:bold;">Sources de l\'épisode ' + escapeHtml(String(info.episodeNumber)) + '</div>' +
                '<div style="font-size:12px;text-align:left;">' + site +
                head('Autres sites', '#ffb300') + '<div id="ed-site-alt" style="color:#d9b77a;">Recherche sur les autres sites...</div>' +
                head('YouTube', '#ff4e45') + '<div id="ed-yt-results" style="color:#d9b77a;">Recherche sur YouTube...</div></div>' +
                '<div style="margin-top:12px;"><button type="button" data-act="close" style="background:#333;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;">Fermer</button></div>';
            box.style.display = 'block';
            box.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
                const act = b.getAttribute('data-act');
                box.style.display = 'none';
                if (act === 'site') leaveYoutubeMode();
                if (act === 'odysee') openCurrentEpisodeOnOdysee();
                if (act === 'player') selectPlayer(Number(b.getAttribute('data-i')));
            }));
            renderElsewhere(box.querySelector('#ed-site-alt'), info, ytActive ? [] : playerCandidates.slice());
            renderYoutubeChoices(box.querySelector('#ed-yt-results'), info, () => { box.style.display = 'none'; });
        }
        function findYoutubeEpisode(assoc, n, season) {
            const path = assoc.channelId ? 'channel/' + assoc.channelId : assoc.channelHandle;
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
                    if (!v.len || !ytTitleOk(v.title, assoc.titleKeyword, season)) return;
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
                return findYoutubeEpisode(assoc, Number(info.episodeNumber), seriesSeason(info)).then((hit) => {
                    if (!hit) { setStatus('Episode ' + info.episodeNumber + ' introuvable sur la chaine YouTube ' + assoc.channelName + ' : choisis une autre video.'); showSourceChooser(info); return; }
                    storeYoutubeHit(info, hit);
                    setYoutubeMode(info, true);
                    console.log('[AnimeTracker v6] YouTube (' + reason + ') : ' + hit.title + ' a ' + hit.start + 's');
                    applyLoadedEpisode(info, false, true);
                }).catch((e) => setStatus('Recherche YouTube impossible : ' + e.message));
            };
            const assoc = getYoutubeChannelAssociation(info);
            if (assoc && assoc.titleKeyword && (assoc.channelId || assoc.channelHandle)) return go(assoc);
            showSourceChooser(info);
        }
        function useYoutubeAutoForCurrentEpisode() {
            if (!currentEpisode) { alert('Ouvre d\'abord un episode.'); return; }
            showSourceChooser(currentEpisode);
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
            return opt('behind', 'Afficher : à rattraper') + opt('all', 'Afficher : tous les sites') + SITES.map((s) => opt(s.id, s.label)).join('');
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
            // Saison suivante (v6.49) : animoflix garde la meme entree -> fin de
            // l'annonce ; anime-sama / myfluneo : nouvelle entree, l'ancienne
            // saison (suivie) est retiree du suivi (reste dans l'historique).
            const cur = seasonOf(info.site === 'animoflix' ? info.resumeUrl : info.seriesUrl);
            const newSeasons = loadNewSeasons();
            const nsCount = Object.keys(newSeasons).length;
            if (newSeasons[key] && cur && cur.n >= newSeasons[key].n) delete newSeasons[key];
            const olderSeasons = cur && info.site !== 'animoflix' ? Object.keys(progress).filter((k) => {
                if (k === key || progress[k].site !== info.site) return false;
                const o = seasonOf(progress[k].seriesUrl);
                return o && o.fam === cur.fam && o.n < cur.n;
            }) : [];
            if (Object.keys(newSeasons).length !== nsCount) GM_setValue('newSeasons', newSeasons);
            olderSeasons.forEach(forgetSeasonState);
            if (!progress[key] && !force && !hasTrackedSibling(info, progress) && !olderSeasons.length) return;
            olderSeasons.forEach((k) => { console.log('[AnimeTracker v6] saison precedente retiree du suivi : ' + k); delete progress[k]; });
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
            forgetSeasonState(key);
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
                // v7.0 : toutes les entrees, exclues comprises (excludedSeries est
                // sauvegarde : sans l'entree, l'episode memorise etait perdu).
                JSON.stringify(Object.keys(progress).map((k) => progress[k])).replace(/</g, '\\u003c') + '</' + 'script>' +
                '<script type="application/json" id="ed-history-backup">' +
                JSON.stringify(Object.keys(loadHistory()).map((k) => loadHistory()[k])).replace(/</g, '\\u003c') + '</' + 'script>' +
                '<script type="application/json" id="ed-settings-backup">' +
                JSON.stringify(collectBackupSettings()).replace(/</g, '\\u003c') + '</' + 'script>';
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
        // Sauvegarde complete (v6.50) : etats de suivi, intro/outro, YouTube,
        // sites ajoutes, reprises, liens AniList + preferences. Pas les caches.
        const BACKUP_SETTINGS = ['excludedSeries', 'dislikedSeries', 'seenSeries', 'seasonDone', 'newSeasons', 'seasonDismissed', 'introOutro', 'customSites',
            'youtubeChannelAssociations', 'youtubeMode', 'youtubeOverrides', 'resumePositions', 'aniLinks'];
        const BACKUP_PREFS = ['autoNextEnabled', 'popupAutoOpen', 'openMode', 'panelSiteFilter2', 'aniskipShown', 'theme', 'panelLayout', 'panelAutoHide', 'panelHidden',
            'accentColor', 'accentTarget', 'fontFamily', 'titleCinzel', 'dimTracked'];
        function collectBackupSettings() {
            const out = {};
            BACKUP_SETTINGS.concat(BACKUP_PREFS).forEach((k) => { const v = GM_getValue(k, undefined); if (v !== undefined) out[k] = v; });
            return out;
        }
        // Fichier de sauvegarde = donnee non fiable : types simples seulement,
        // tailles bornees, pas d'adresse autre que https (iframe, liens).
        function cleanBackupValue(v, depth) {
            if (typeof v === 'boolean' || (typeof v === 'number' && isFinite(v))) return v;
            // v7.0 : seuls les schemas dangereux sont rejetes ("Re:Zero" ou
            // "Overlord: S4" etaient effaces, marques Pas aime/Deja vu perdues).
            if (typeof v === 'string') return v.length > 2000 || /^\s*(javascript|data|vbscript|file|blob)\s*:/i.test(v) ? undefined : v;
            if (!v || typeof v !== 'object' || depth > 3) return undefined;
            const out = Array.isArray(v) ? [] : {};
            Object.keys(v).slice(0, 5000).forEach((k) => {
                if (k.length > 1000 || k === '__proto__' || k === 'constructor' || k === 'prototype') return;
                const c = cleanBackupValue(v[k], depth + 1);
                if (c !== undefined) { if (Array.isArray(out)) out.push(c); else out[k] = c; }
            });
            return out;
        }
        function mergeImportedSettings(html) {
            const el = new DOMParser().parseFromString(html, 'text/html').getElementById('ed-settings-backup');
            let data = null;
            try { data = el ? JSON.parse(el.textContent) : null; } catch (e) { data = null; }
            if (!data || typeof data !== 'object' || Array.isArray(data)) return 0;
            let restored = 0;
            BACKUP_SETTINGS.forEach((k) => {
                let v = cleanBackupValue(data[k], 0);
                if (!v || typeof v !== 'object' || Array.isArray(v)) return;
                if (k === 'customSites') v = Object.fromEntries(Object.entries(v).filter(([h]) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(h)));
                if (k === 'youtubeOverrides') v = Object.fromEntries(Object.entries(v).filter(([, u]) => /^https:\/\/(www\.)?youtube(-nocookie)?\.com\//i.test(u)));
                // Fusion : les reglages deja presents ici gagnent.
                GM_setValue(k, Object.assign({}, v, GM_getValue(k, {})));
                restored++;
            });
            BACKUP_PREFS.forEach((k) => {
                const v = data[k];
                if (GM_getValue(k, undefined) === undefined && validImportedPref(k, v)) { GM_setValue(k, v); restored++; }
            });
            // Sites ajoutes restaures : connus tout de suite (sinon leurs animes seraient ignores ci-apres).
            Object.keys(loadCustomSites()).forEach((h) => { if (!SITES.some((x) => x.id === 'custom:' + h)) SITES.push(makeGenericSite(h)); });
            return restored;
        }
        // Type attendu par preference (recette 6.58 : "oui" texte activait le panneau discret).
        function validImportedPref(k, v) {
            if (['autoNextEnabled', 'popupAutoOpen', 'aniskipShown', 'panelAutoHide', 'panelHidden', 'titleCinzel', 'dimTracked'].includes(k)) return typeof v === 'boolean';
            if (k === 'theme') return typeof v === 'string' && Object.prototype.hasOwnProperty.call(themes(), v);
            if (k === 'panelLayout') return typeof v === 'string' && Object.prototype.hasOwnProperty.call(layouts(), v);
            if (k === 'accentColor') return typeof v === 'string' && /^(#[0-9a-f]{6})?$/i.test(v);
            if (k === 'accentTarget') return Object.prototype.hasOwnProperty.call(accentTargets(), v);
            if (k === 'fontFamily') return typeof v === 'string' && Object.prototype.hasOwnProperty.call(vcFonts(), v);
            if (k === 'openMode') return OPEN_MODES.some((m) => m[0] === v);
            return typeof v === 'string' && v.length <= 50;
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
                    // v7.0 : une entree importee sans date n'ecrase plus une entree datee.
                    if (existing.watchedAt && (!e.watchedAt || new Date(existing.watchedAt) >= new Date(e.watchedAt))) { skipped++; return; }
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
                    // v7.0 : un fichier sans progression mais avec reglages est restaure.
                    if (entries.length === 0 && !/id="ed-settings-backup"/.test(String(reader.result))) { alert('Aucune donnee Video Continuum trouvee dans ce fichier.'); return; }
                    const nbSettings = mergeImportedSettings(String(reader.result));
                    const result = mergeImportedEntries(entries);
                    mergeImportedHistory(String(reader.result));
                    alert('Import termine : ' + result.added + ' ajoutee(s), ' + result.updated + ' mise(s) a jour, ' + result.skipped + ' ignoree(s).' +
                        (nbSettings ? '\nReglages restaures (etats de suivi, intro/outro, YouTube, sites ajoutes...) : ' + nbSettings + ' groupe(s).' : ''));
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
        const BTN_STYLE = 'background:#333;color:#fff;border:none;padding:6px;border-radius:4px;cursor:pointer;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';

        function collapsibleSection(key, title, innerHtml, open, sub) {
            // sub : sous-menu (decale et plus clair, ex. Reglages > Plus).
            return '<details data-sec="' + key + '"' + (open ? ' open' : '') + ' style="padding-top:2px;' + '' + '">' +
                '<summary style="cursor:pointer;font-size:11px;font-weight:bold;color:#eee;background:' + (sub ? '#4a4a58' : '#3a3a46') + ';padding:6px 8px;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + title + '</summary>' +
                '<div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">' + innerHtml + '</div></details>';
        }

        // v7.4 : tout le CSS vient de css/ (base, agencements, themes), recopie ici par build.js ; seules les polices sont dynamiques.
        function vcCss() { return ".vc-thm { --vc-bg: #15151f; --vc-text: #e6e6ea; --vc-dim: #9a9aa6; --vc-acc: #03d0fc; --vc-acct: #5fd3ec; --vc-onacc: #04161b; --vc-btn: #2a2a34; --vc-bline: transparent; --vc-bsh: none; --vc-brad: 4px; --vc-main: var(--vc-acc); --vc-mainsh: none; --vc-field: #0e0e14; --vc-card: rgba(255,255,255,.04); --vc-edge: rgba(255,255,255,.1); --vc-rad: 6px; --vc-on: #2e7d32; --vc-onl: #4caf50; --vc-glow: rgba(3,208,252,.25); --vc-tfont: inherit; --vc-tsh: none; --vc-pad: 10px; --vc-gap: 6px; display: flex; flex-direction: column; gap: var(--vc-gap); box-sizing: border-box; padding: var(--vc-pad); background: var(--vc-bg); color: var(--vc-text); border-radius: var(--vc-rad); box-shadow: 0 2px 10px rgba(0,0,0,.5); font: 12px/1.35 var(--vc-font, \"Segoe UI\"), system-ui, Arial, sans-serif; text-shadow: var(--vc-tsh); } .vc-thm * { box-sizing: border-box; } .vc-thm > * { flex-shrink: 0; } .vc-thm.vc-thm [hidden] { display: none !important; } .vc-thm .vc-head { display: flex; align-items: center; justify-content: center; gap: 6px; font-weight: 700; font-size: 15px; color: var(--vc-acct); } .vc-thm .vc-brand { font-family: var(--vc-tfont); } .vc-thm .vc-card { display: flex; flex-direction: column; gap: 6px; padding: 6px; background: var(--vc-card); border: 1px solid var(--vc-edge); border-radius: var(--vc-rad); } .vc-thm .vc-name { text-align: center; font-size: 14px; font-weight: 700; line-height: 1.25; font-family: var(--vc-tfont); display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; } .vc-thm .vc-epline { display: flex; align-items: center; justify-content: center; gap: 8px; } .vc-thm .vc-epnum { font-size: 15px; font-weight: 700; } .vc-thm .vc-src { align-items: center; justify-content: center; gap: 6px; } .vc-thm .vc-src-label { border-left: 3px solid var(--vc-acc); padding-left: 5px; font-size: 11px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .vc-thm .vc-status { font-size: 11px; text-align: center; color: var(--vc-dim); } .vc-thm .vc-note { font-size: 11px; color: var(--vc-dim); } .vc-thm .vc-alert { font-size: 11px; text-align: center; padding: 6px; border-radius: var(--vc-rad); border: 1px solid #ffb300; background: rgba(255,179,0,.12); color: #ffb300; } .vc-thm .vc-alert--danger { border: none; background: none; padding: 0; color: #f66; } .vc-thm .vc-row { display: flex; gap: 4px; } .vc-thm .vc-row > * { flex: 1; min-width: 0; } .vc-thm .vc-wrap { flex-wrap: wrap; } .vc-thm .vc-row > button { white-space: normal; line-height: 1.15; } .vc-thm .vc-actions > .vc-main { flex: 2; } .vc-thm .vc-goto > button { flex: 0 0 auto; } .vc-thm .vc-goto > input { width: 0; flex: 1; } .vc-thm button:where(:not(.vc-ver):not(.vc-tab)) { min-height: 29px; padding: 5px 8px !important; cursor: pointer; font: inherit !important; font-size: 12px !important; font-weight: 600 !important; background: var(--vc-btn) !important; color: var(--vc-text) !important; border: 1px solid var(--vc-bline) !important; border-radius: var(--vc-brad) !important; box-shadow: var(--vc-bsh) !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .vc-thm button.vc-main { background: var(--vc-main) !important; color: var(--vc-onacc) !important; border-color: transparent !important; box-shadow: var(--vc-mainsh) !important; text-shadow: none; } .vc-thm button.vc-danger { background: #5a1f1f !important; color: #fff !important; border-color: transparent !important; } .vc-thm button.vc-set { background: var(--vc-on) !important; border-color: var(--vc-onl) !important; } .vc-thm button.vc-chip { min-height: 24px; padding: 2px 8px !important; font-size: 11px !important; background: transparent !important; color: var(--vc-acct) !important; border: 1px solid var(--vc-acct) !important; box-shadow: none !important; flex: 0 0 auto; } .vc-thm button:disabled { opacity: .55; cursor: default; } .vc-thm select, .vc-thm input[type=number], .vc-thm input[type=text], .vc-thm textarea { width: 100%; padding: 5px !important; font: inherit !important; font-size: 12px !important; background: var(--vc-field) !important; color: var(--vc-text) !important; border: 1px solid var(--vc-edge) !important; border-radius: var(--vc-brad) !important; } .vc-thm .vc-series { font-family: Consolas, monospace !important; } .vc-thm option.vc-behind { color: #ffb300; font-weight: 700; } .vc-thm label { color: var(--vc-text) !important; } .vc-thm input[type=color] { border: none !important; background: none !important; } .vc-thm .vc-track { position: relative; display: block; min-width: 0; text-align: center; padding: 5px 4px; line-height: 17px; min-height: 29px; cursor: pointer; font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: var(--vc-btn); color: var(--vc-text) !important; border: 1px solid var(--vc-bline); border-radius: var(--vc-brad); box-shadow: var(--vc-bsh); } .vc-thm .vc-row > .vc-track, .vc-thm .vc-track.vc-small { flex: 1; } .vc-thm .vc-track:has(input:checked) { background: var(--vc-on); border-color: var(--vc-onl); } .vc-thm .vc-track input { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; } .vc-thm .vc-track .on { display: none; } .vc-thm .vc-track:has(input:checked) .on { display: inline; } .vc-thm .vc-track:has(input:checked) .off { display: none; } .vc-thm .vc-ver { background: none !important; border: none !important; box-shadow: none !important; padding: 5px 2px !important; color: #ffd400 !important; font: 700 12px Arial, sans-serif !important; cursor: pointer; } .vc-thm .vc-ver:hover { text-decoration: underline; } .vc-thm .vc-grp { font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: var(--vc-acct); margin-top: 8px; font-family: var(--vc-tfont); } .vc-thm summary { cursor: pointer; padding: 6px 4px !important; height: auto; line-height: 16px; font-size: 12px !important; font-weight: 600 !important; background: transparent !important; border: none !important; border-bottom: 1px solid var(--vc-edge) !important; border-radius: 0 !important; color: var(--vc-dim) !important; font-family: var(--vc-tfont) !important; } .vc-thm details[open] > summary { color: var(--vc-acct) !important; border-bottom-color: var(--vc-acct) !important; } .vc-thm .vc-nav { display: flex; flex-wrap: wrap; gap: 4px; } .vc-thm .vc-tab { flex: 1 1 auto; display: flex; align-items: center; justify-content: center; gap: 5px; min-width: 0; padding: 6px 7px; margin: 0; cursor: pointer; font: inherit; font-size: 11px; font-weight: 600; font-family: var(--vc-tfont); background: var(--vc-card); color: var(--vc-dim); border: 1px solid var(--vc-edge); border-radius: var(--vc-rad); white-space: nowrap; text-shadow: inherit; } .vc-thm .vc-tab:hover { color: var(--vc-text); } .vc-thm .vc-tab[aria-expanded=\"true\"] { color: var(--vc-acct); border-color: var(--vc-acc); } .vc-thm .vc-tab .vc-ic { display: none; width: 16px; height: 16px; flex: 0 0 auto; } .vc-thm .vc-lbl { overflow: hidden; text-overflow: ellipsis; } .vc-thm .vc-badge { color: #ffd400; font-weight: 700; } .vc-thm .vc-pane { display: flex; flex-direction: column; gap: 6px; } .vc-thm .vc-pane-title { display: none; } .vc-thm .vc-news-x { color: var(--vc-dim) !important; } .vc-thm .vc-foot, .vc-thm .vc-summary { display: flex; flex-direction: column; gap: 6px; } .vc-thm .ep-summary-line { background: var(--vc-card) !important; border-color: var(--vc-acct) !important; border-radius: var(--vc-rad) !important; } .vc-thm .vc-open-link { background: var(--vc-field) !important; border-color: var(--vc-edge) !important; border-radius: var(--vc-brad) !important; font-size: 11px !important; padding: 6px 4px !important; } .vc-thm [style*=\"color:#03d0fc\"] { color: var(--vc-acct) !important; } .vc-thm [style*=\"background:#03d0fc\"]:not(button) { background: var(--vc-acc) !important; } .vc-thm [style*=\"color:#fff\"], .vc-thm [style*=\"color:#eee\"], .vc-thm [style*=\"color:#ccc\"], .vc-thm [style*=\"color:#ddd\"] { color: var(--vc-text) !important; } .vc-thm [style*=\"color:#888\"], .vc-thm [style*=\"color:#aaa\"], .vc-thm [style*=\"color:#8a8a99\"] { color: var(--vc-dim) !important; } .vc-thm.vc-light { --vc-tsh: none; } .vc-thm.vc-light [style*=\"color:#ffb300\"] { color: #9a5200 !important; } .vc-thm.vc-light .vc-ver, .vc-thm.vc-light [style*=\"color:#ffd400\"], .vc-thm.vc-light .vc-badge { color: #9a4a00 !important; } .vc-thm.vc-glass { backdrop-filter: blur(14px) saturate(1.2); -webkit-backdrop-filter: blur(14px) saturate(1.2); } @media (prefers-reduced-transparency: reduce) { .vc-thm.vc-glass { background: #141b24; backdrop-filter: none; -webkit-backdrop-filter: none; } } .vc-ct-cadre { outline: 2px solid var(--vc-cc) !important; outline-offset: -2px; } .vc-thm.vc-ct-titres button.vc-main { background: var(--vc-cc) !important; color: var(--vc-ccon) !important; } .vc-thm.vc-ct-titres .vc-head, .vc-thm.vc-ct-titres .vc-grp, .vc-thm.vc-ct-titres .vc-tab[aria-expanded=\"true\"], .vc-thm.vc-ct-titres details[open] > summary { color: var(--vc-cct) !important; } .vc-thm.vc-ct-cases .vc-track:has(input:checked) { background: var(--vc-cc) !important; border-color: var(--vc-cc) !important; color: var(--vc-ccon) !important; } .vc-cinzel .vc-tab, .vc-cinzel summary, .vc-cinzel .vc-grp, .vc-cinzel .vc-brand { font-family: \"VC Cinzel\", var(--vc-font, \"Segoe UI\"), serif !important; letter-spacing: .06em; } .vc-thm :focus-visible, .vc-thm .vc-track:has(input:focus-visible) { outline: 2px solid var(--vc-acct) !important; outline-offset: 1px !important; } #ed-topbar { transition: opacity .4s; } #ed-topbar.vc-faded:not(:hover):not(:focus-within) { opacity: .12; } @media (prefers-reduced-motion: reduce) { #ed-topbar { transition: none; } } .vc-dim-tracked img[data-vc-st] { opacity: .35; filter: grayscale(.85); transition: opacity .2s, filter .2s; } .vc-dim-tracked a:hover img[data-vc-st] { opacity: 1; filter: none; } [data-vc-layout=\"liste\"] { row-gap: 0; } [data-vc-layout=\"liste\"] > :not(.vc-nav) { margin-bottom: var(--vc-gap); } [data-vc-layout=\"liste\"] .vc-head { order: -3; } [data-vc-layout=\"liste\"] .vc-ep { order: -2; } [data-vc-layout=\"liste\"] .vc-follow { order: -1; } [data-vc-layout=\"liste\"] .vc-nav { display: contents; } [data-vc-layout=\"liste\"] .vc-tab, [data-vc-layout=\"liste\"] .vc-pane { order: var(--o); } [data-vc-layout=\"liste\"] .vc-foot { order: 999; margin-top: var(--vc-gap); } [data-vc-layout=\"liste\"] .vc-tab { justify-content: flex-start; gap: 8px; width: 100%; padding: 7px 8px; background: transparent; border: none; border-bottom: 1px solid var(--vc-edge); border-radius: 0; font-size: 12px; text-align: left; } [data-vc-layout=\"liste\"] .vc-tab::before { content: \"\\25C7\"; font-size: 10px; color: var(--vc-dim); } [data-vc-layout=\"liste\"] .vc-tab::after { content: \"\\25B8\"; margin-left: auto; font-size: 10px; color: var(--vc-dim); } [data-vc-layout=\"liste\"] .vc-lbl { flex: 1; text-align: center; } [data-vc-layout=\"liste\"] .vc-tab[aria-expanded=\"true\"] { background: var(--vc-card); color: var(--vc-acct); box-shadow: inset 3px 0 0 var(--vc-acc); border-bottom-color: var(--vc-acc); } [data-vc-layout=\"liste\"] .vc-tab[aria-expanded=\"true\"]::before { content: \"\\25C6\"; color: var(--vc-acc); } [data-vc-layout=\"liste\"] .vc-tab[aria-expanded=\"true\"]::after { content: \"\\25BE\"; color: var(--vc-acc); } [data-vc-layout=\"liste\"] .vc-pane { padding: 6px 6px 8px 10px; background: var(--vc-card); box-shadow: inset 3px 0 0 var(--vc-acc); } [data-vc-layout=\"onglets\"] .vc-nav { flex-wrap: nowrap; gap: 0; border-bottom: 1px solid var(--vc-edge); } [data-vc-layout=\"onglets\"] .vc-tab { flex: 1 1 0; flex-direction: column; gap: 2px; padding: 5px 1px 4px; background: transparent; border: none; border-bottom: 2px solid transparent; border-radius: 0; margin-bottom: -1px; font-size: 9.5px; position: relative; } [data-vc-layout=\"onglets\"] .vc-tab .vc-ic { display: block; } [data-vc-layout=\"onglets\"] .vc-lbl { display: none; max-width: 100%; } [data-vc-layout=\"onglets\"] .vc-tab[aria-expanded=\"true\"] { flex-grow: 2.2; } [data-vc-layout=\"onglets\"] .vc-tab[aria-expanded=\"true\"] .vc-lbl { display: block; } [data-vc-layout=\"onglets\"] .vc-badge { position: absolute; top: 1px; right: 4px; font-size: 9px; } [data-vc-layout=\"onglets\"] .vc-tab[aria-expanded=\"true\"] { border-bottom-color: var(--vc-acc); } [data-vc-layout=\"onglets\"] .vc-pane { padding: 2px 0 4px; } .vc-thm[data-vc-layout=\"rail\"] { display: grid; grid-template-columns: 54px minmax(0, 1fr); column-gap: 8px; row-gap: 0; align-content: start; width: 300px !important; max-width: 300px !important; } [data-vc-layout=\"rail\"] > * { grid-column: 2; margin-bottom: var(--vc-gap); } [data-vc-layout=\"rail\"] > .vc-nav { grid-column: 1; grid-row: 1 / span 40; align-self: start; position: sticky; top: 0; flex-direction: column; flex-wrap: nowrap; gap: 6px; padding: 4px 0; margin: 0; } [data-vc-layout=\"rail\"] .vc-tab { flex: 0 0 auto; flex-direction: column; gap: 2px; width: 54px; padding: 6px 1px; background: transparent; border: none; border-radius: var(--vc-rad); font-size: 8.5px; letter-spacing: -.1px; position: relative; } [data-vc-layout=\"rail\"] .vc-tab .vc-ic { display: block; width: 18px; height: 18px; } [data-vc-layout=\"rail\"] .vc-lbl { max-width: 100%; } [data-vc-layout=\"rail\"] .vc-badge { position: absolute; top: 2px; right: 4px; font-size: 9px; } [data-vc-layout=\"rail\"] .vc-tab[aria-expanded=\"true\"] { background: var(--vc-on); color: var(--vc-acct); box-shadow: 0 0 10px var(--vc-glow); } [data-vc-layout=\"rail\"] .vc-pane { padding: 0 0 4px; } [data-vc-layout=\"rail\"] .vc-pane-title { display: block; font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--vc-acct); font-family: var(--vc-tfont); } [data-vc-layout=\"tablettes\"] .vc-nav { display: flex; flex-wrap: wrap; gap: 4px; } [data-vc-layout=\"tablettes\"] .vc-tab { flex: 1 1 auto; padding: 6px 6px; } [data-vc-layout=\"tablettes\"] .vc-tab[aria-expanded=\"true\"] { box-shadow: 0 0 8px var(--vc-glow); } [data-vc-layout=\"tablettes\"] .vc-pane { padding: 0 6px 6px; background: var(--vc-card); border: 1px solid var(--vc-acc); border-radius: var(--vc-rad); box-shadow: 0 0 10px var(--vc-glow); } [data-vc-layout=\"tablettes\"] .vc-pane-title { display: block; text-align: center; padding: 6px 0 5px; border-bottom: 1px solid var(--vc-edge); font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--vc-acct); font-family: var(--vc-tfont); } [data-vc-layout=\"tablettes\"] .vc-pane button:not(.vc-danger):not(.vc-ver):not(.vc-set) { color: var(--vc-acct) !important; } .vc-th-braise { --vc-bg: #0d0f14; --vc-text: #e8e8f0; --vc-dim: #8a90a0; --vc-acc: #ff6a3d; --vc-acct: #ffb38f; --vc-onacc: #190700; --vc-btn: rgba(255,255,255,.08); --vc-bline: transparent; --vc-bsh: none; --vc-brad: 8px; --vc-main: #ff6a3d; --vc-field: #08090d; --vc-card: #171a22; --vc-edge: #20232d; --vc-rad: 10px; --vc-on: #4a2214; --vc-onl: #ff6a3d; --vc-glow: rgba(255,106,61,.35); --vc-tfont: \"VC Cinzel\", Georgia, serif; border: 1px solid #20232d; border-radius: 14px; } .vc-th-braise .vc-ep { border: none; padding: 10px; background: linear-gradient(160deg, rgba(255,106,61,.35), rgba(120,40,200,.35) 55%, #0d0f14), repeating-linear-gradient(45deg, #1a1d27 0 6px, #161922 6px 12px); } .vc-th-braise .vc-name { text-align: left; color: #fff; font-size: 15px; } .vc-th-braise .vc-epline { justify-content: space-between; } .vc-th-braise .vc-tab { background: #171a22; border: none; border-radius: 10px; padding: 8px 2px; color: #8a90a0; } .vc-th-braise .vc-tab[aria-expanded=\"true\"] { background: #1f1612; color: #ffb38f; box-shadow: 0 0 0 1px #ff6a3d, 0 0 12px rgba(255,106,61,.35); } .vc-th-braise .vc-pane { background: #1f1612; border-color: rgba(255,106,61,.5); } .vc-th-groupes { --vc-bg: #232326; --vc-text: #e6e6e9; --vc-dim: #8e8e93; --vc-acc: #0a84ff; --vc-acct: #64b0ff; --vc-onacc: #fff; --vc-btn: #38383d; --vc-bline: transparent; --vc-bsh: none; --vc-brad: 8px; --vc-field: #1c1c1f; --vc-card: #2c2c30; --vc-edge: #38383d; --vc-rad: 8px; --vc-on: #1f6b34; --vc-onl: #34c759; --vc-glow: rgba(10,132,255,.22); border-radius: 10px; font-size: 13px; } .vc-th-groupes .vc-card { border: none; } .vc-th-groupes .vc-tab { background: #2c2c30; font-size: 13px; color: #e6e6e9; border-bottom-color: #38383d; } .vc-th-groupes .vc-tab::before { content: none; } .vc-th-groupes .vc-lbl { text-align: left; } .vc-th-groupes .vc-tab[aria-expanded=\"true\"] { background: #34343a; color: #64b0ff; box-shadow: 0 0 0 1px rgba(10,132,255,.4); } .vc-th-groupes .vc-pane { background: #34343a; box-shadow: none; padding-left: 8px; } .vc-th-inspecteur { --vc-bg: #1e1f22; --vc-text: #d4d6da; --vc-dim: #8b8f97; --vc-acc: #03d0fc; --vc-acct: #5fd3ec; --vc-onacc: #04202a; --vc-btn: #26282c; --vc-bline: #3a3d44; --vc-bsh: none; --vc-brad: 4px; --vc-field: #17181b; --vc-card: transparent; --vc-edge: #2f3136; --vc-rad: 4px; --vc-on: #1f4a2c; --vc-onl: #3fae62; --vc-glow: rgba(3,208,252,.18); border: 1px solid #2f3136; } .vc-th-inspecteur .vc-head { justify-content: space-between; font-size: 12px; color: #d4d6da; padding-bottom: 6px; border-bottom: 1px solid #2f3136; } .vc-th-inspecteur .vc-card { border: none; padding: 0; } .vc-th-inspecteur .vc-name { text-align: left; font-size: 13px; color: #fff; } .vc-th-inspecteur .vc-epline { justify-content: space-between; } .vc-th-inspecteur .vc-tab { text-transform: uppercase; font-size: 10.5px; letter-spacing: .06em; } .vc-th-inspecteur .vc-tab::before { content: \"\\25B8\"; } .vc-th-inspecteur .vc-tab[aria-expanded=\"true\"]::before { content: \"\\25BE\"; } .vc-th-inspecteur .vc-tab::after { content: none; } .vc-th-inspecteur .vc-lbl { text-align: left; } .vc-th-inspecteur .vc-tab[aria-expanded=\"true\"] { background: #25272b; color: #fff; box-shadow: inset 2px 0 #03d0fc; } .vc-th-inspecteur .vc-pane { background: #25272b; box-shadow: inset 2px 0 #03d0fc; } .vc-th-jade { --vc-bg: linear-gradient(160deg, #0f3b31, #0a2620); --vc-text: #d6efe4; --vc-dim: #7fb8a3; --vc-acc: #3fe0aa; --vc-acct: #7ff0c4; --vc-onacc: #06241c; --vc-btn: #12493c; --vc-bline: #2e8f73; --vc-bsh: none; --vc-brad: 6px; --vc-main: linear-gradient(#7ff0c4, #2fbf91); --vc-mainsh: 0 0 12px rgba(63,224,170,.4); --vc-field: #08201a; --vc-card: rgba(10,38,32,.9); --vc-edge: #2e8f73; --vc-rad: 8px; --vc-on: #1f7a62; --vc-onl: #7ff0c4; --vc-glow: rgba(63,224,170,.35); border: 1px solid #2e8f73; border-radius: 10px; box-shadow: 0 0 0 1px #06150f, inset 0 1px 0 rgba(63,176,143,.33), 0 2px 10px rgba(0,0,0,.5); } .vc-th-jade .vc-head { justify-content: space-between; font: 600 12px \"VC Cinzel\", serif; letter-spacing: .1em; color: #e8cf8a; text-transform: uppercase; } .vc-th-jade .vc-head .vc-ver { color: #7fd1b5 !important; } .vc-th-jade .vc-name { color: #fff; font-size: 15px; } .vc-th-jade .vc-tab[aria-expanded=\"true\"] { color: #e8cf8a; border-color: #e8cf8a; background: #12493c; } .vc-th-laque { --vc-bg: #14110f; --vc-text: #cfc8b8; --vc-dim: #7d745f; --vc-acc: #d9a94a; --vc-acct: #e0b866; --vc-onacc: #14110f; --vc-btn: #1f1a16; --vc-bline: #3a3228; --vc-bsh: none; --vc-brad: 0; --vc-main: #d9a94a; --vc-field: #0e0c0a; --vc-card: transparent; --vc-edge: #2a231d; --vc-rad: 0; --vc-on: #2a2112; --vc-onl: #d9a94a; --vc-glow: rgba(217,169,74,.25); border: 1px solid #3a3228; border-top: 3px solid #b8892c; border-radius: 0; counter-reset: vc-menu; } .vc-th-laque .vc-head { justify-content: space-between; font: 600 13px \"VC Cinzel\", serif; letter-spacing: .12em; color: #d9a94a; text-transform: uppercase; } .vc-th-laque .vc-head .vc-ver { border: 1px solid #d9a94a !important; color: #d9a94a !important; padding: 0 5px !important; font: 10px Bahnschrift, sans-serif !important; } .vc-th-laque .vc-card { border: none; padding: 0; } .vc-th-laque .vc-name { text-align: left; color: #f2ead8; font-size: 15px; } .vc-th-laque .vc-epline { justify-content: space-between; } .vc-th-laque button.vc-main { border-bottom: 3px solid #8c6414 !important; text-transform: uppercase; letter-spacing: .08em; } .vc-th-laque .vc-track:has(input:checked) { color: #d9a94a !important; } .vc-th-laque .vc-tab { counter-increment: vc-menu; color: #7d745f; text-transform: uppercase; letter-spacing: .08em; } .vc-th-laque .vc-tab::before { content: counter(vc-menu, upper-roman); font: 700 12px \"VC Cinzel\", serif; color: #5d5340; width: 18px; } .vc-th-laque .vc-lbl { text-align: left; } .vc-th-laque .vc-tab[aria-expanded=\"true\"] { color: #f2ead8; background: linear-gradient(90deg, #3a2a12, #14110f); } .vc-th-laque .vc-tab[aria-expanded=\"true\"]::before { content: counter(vc-menu, upper-roman); color: #d9a94a; } .vc-th-laque .vc-pane { background: linear-gradient(90deg, #1f180e, #14110f); } .vc-th-linear { --vc-bg: #17181a; --vc-text: #c9ccd1; --vc-dim: #7d818a; --vc-acc: #5e6ad2; --vc-acct: #9aa3f0; --vc-onacc: #fff; --vc-btn: #26282c; --vc-bline: #33363b; --vc-bsh: none; --vc-brad: 5px; --vc-field: #121315; --vc-card: #1f2124; --vc-edge: #2a2c30; --vc-rad: 6px; --vc-on: #2b2f5a; --vc-onl: #5e6ad2; --vc-glow: rgba(94,106,210,.25); border: 1px solid #2a2c30; border-radius: 8px; } .vc-th-linear .vc-head { justify-content: space-between; font-size: 11px; color: #7d818a; font-weight: 600; } .vc-th-linear .vc-name { text-align: left; color: #f2f3f5; font-size: 13.5px; font-weight: 600; } .vc-th-linear .vc-epline { justify-content: space-between; } .vc-th-linear .vc-tab[aria-expanded=\"true\"] { color: #f2f3f5; } .vc-th-linear .vc-grp { color: #7d818a; } .vc-th-menthe { --vc-bg: rgba(10,14,20,.78); --vc-text: #dfe6ee; --vc-dim: #7d8b9a; --vc-acc: #50ffbe; --vc-acct: #50ffbe; --vc-onacc: #03150d; --vc-btn: rgba(255,255,255,.08); --vc-bline: transparent; --vc-bsh: none; --vc-brad: 99px; --vc-main: #50ffbe; --vc-mainsh: 0 0 14px rgba(80,255,190,.5); --vc-field: #0a0d12; --vc-card: rgba(10,13,18,.75); --vc-edge: #1d242e; --vc-rad: 10px; --vc-on: rgba(80,255,190,.16); --vc-onl: rgba(80,255,190,.4); --vc-glow: rgba(80,255,190,.25); border: 1px solid rgba(80,255,190,.2); border-radius: 14px; } .vc-th-menthe .vc-head { justify-content: space-between; font: 600 13px Bahnschrift, \"Segoe UI\", sans-serif; color: #fff; } .vc-th-menthe .vc-card { border: none; } .vc-th-menthe .vc-name { text-align: left; color: #fff; } .vc-th-menthe .vc-epline { justify-content: space-between; } .vc-th-menthe .vc-track:has(input:checked) { color: #50ffbe !important; } .vc-th-menthe .vc-tab { border-radius: 99px; border-color: transparent; background: rgba(255,255,255,.08); } .vc-th-menthe .vc-tab[aria-expanded=\"true\"] { background: rgba(80,255,190,.16); color: #50ffbe; } .vc-th-menthe .vc-pane { background: #0a0d12; border-color: #50ffbe; } .vc-th-menthe .vc-pane button:not(.vc-danger):not(.vc-ver) { border-radius: 8px !important; } .vc-th-neon { --vc-bg: rgba(14,18,26,.82); --vc-text: #cfd8e3; --vc-dim: #6b7788; --vc-acc: #03d0fc; --vc-acct: #6fdcff; --vc-onacc: #041018; --vc-btn: rgba(255,255,255,.07); --vc-bline: rgba(3,208,252,.28); --vc-bsh: none; --vc-brad: 7px; --vc-main: linear-gradient(90deg, #03d0fc, #2b7bff); --vc-mainsh: 0 0 12px rgba(3,208,252,.35); --vc-field: rgba(0,0,0,.45); --vc-card: rgba(0,0,0,.25); --vc-edge: rgba(255,255,255,.08); --vc-rad: 10px; --vc-on: rgba(3,208,252,.12); --vc-onl: rgba(3,208,252,.5); --vc-glow: rgba(3,208,252,.45); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; } .vc-th-neon .vc-nav { background: rgba(0,0,0,.35); border-radius: 10px; padding: 8px 0; } .vc-th-neon .vc-tab { color: #6b7788; } .vc-th-neon .vc-tab .vc-lbl { display: none; } .vc-th-neon .vc-tab .vc-ic { width: 20px; height: 20px; } .vc-th-neon .vc-tab[aria-expanded=\"true\"] { color: #03d0fc; background: rgba(3,208,252,.12); box-shadow: 0 0 10px rgba(3,208,252,.45), inset 0 0 0 1px rgba(3,208,252,.5); } .vc-th-neon .vc-badge { width: 8px; height: 8px; border-radius: 50%; background: #ff9f1a; font-size: 0; } .vc-th-neon .vc-pane-title, .vc-th-neon .vc-grp { color: #03d0fc; } .vc-th-nuit { --vc-bg: linear-gradient(180deg, #171a24, #0e1017); --vc-text: #d6dbe3; --vc-dim: #7d8699; --vc-acc: #b46bff; --vc-acct: #c99bff; --vc-onacc: #fff; --vc-btn: #1f2330; --vc-bline: #2f3547; --vc-bsh: none; --vc-brad: 6px; --vc-main: linear-gradient(90deg, #b46bff, #7b5cff); --vc-mainsh: 0 0 10px rgba(180,107,255,.35); --vc-field: #0b0d13; --vc-card: #161925; --vc-edge: #262b3a; --vc-rad: 6px; --vc-on: #3b2560; --vc-onl: #b46bff; --vc-glow: rgba(180,107,255,.28); border: 1px solid #262b3a; border-radius: 10px; } .vc-th-nuit .vc-head { justify-content: space-between; font: 600 13px Bahnschrift, \"Segoe UI\", sans-serif; color: #fff; } .vc-th-nuit .vc-card { border: none; background: transparent; padding: 0; } .vc-th-nuit .vc-tab[aria-expanded=\"true\"] { color: #fff; text-shadow: 0 0 8px #b46bff; background: linear-gradient(180deg, transparent, rgba(180,107,255,.14)); } .vc-th-nuit .vc-grp { color: #b46bff; } .vc-th-parchemin { --vc-bg: linear-gradient(#f1e4c3, #e6d3a6); --vc-text: #3a2a1a; --vc-dim: #6b5636; --vc-acc: #a8261f; --vc-acct: #8c1f19; --vc-onacc: #f6e7c4; --vc-btn: #f8eed4; --vc-bline: #9a7a42; --vc-bsh: none; --vc-brad: 3px; --vc-main: linear-gradient(#a8261f, #7c1814); --vc-mainsh: inset 0 1px 0 #d4574f; --vc-field: #fbf4e2; --vc-card: transparent; --vc-edge: #b8975a; --vc-rad: 3px; --vc-on: #e4d29c; --vc-onl: #7a5a2e; --vc-glow: rgba(168,38,31,.25); --vc-tfont: \"VC Cinzel\", Georgia, serif; --vc-warn: #9a4a00; --vc-ok: #2f6b2f; border: 2px solid #7a5a2e; border-radius: 4px; box-shadow: inset 0 0 0 3px #f1e4c3, inset 0 0 0 4px #b8975a, 0 2px 10px rgba(0,0,0,.5); } .vc-th-parchemin .vc-head { justify-content: space-between; font-size: 14px; letter-spacing: .06em; color: #3a2a1a; padding-bottom: 5px; border-bottom: 1px solid #b8975a; } .vc-th-parchemin.vc-thm .vc-ver { background: #8c1d18 !important; color: #f6e7c4 !important; font: 11px Consolas, monospace !important; padding: 1px 6px !important; border-radius: 2px; } .vc-th-parchemin .vc-card { border: none; padding: 0; } .vc-th-parchemin .vc-name { text-align: left; font-size: 15px; } .vc-th-parchemin .vc-epline { justify-content: space-between; } .vc-th-parchemin button.vc-main { font-family: var(--vc-tfont) !important; font-size: 13px !important; border: 1px solid #4d0d0a !important; } .vc-th-parchemin .vc-tab { font-size: 12px; letter-spacing: .04em; color: #6b5636; } .vc-th-parchemin .vc-tab[aria-expanded=\"true\"] { background: #f8eed4; color: #8c1d18; } .vc-th-parchemin .vc-pane { background: rgba(248,238,212,.6); } .vc-th-parchemin .vc-track:has(input:checked) { color: #3a2a1a !important; } .vc-th-stele { --vc-bg: linear-gradient(#3b4248, #2c3237); --vc-text: #d8dde1; --vc-dim: #8f99a1; --vc-acc: #03d0fc; --vc-acct: #6fd3ee; --vc-onacc: #04161b; --vc-btn: linear-gradient(#444c52, #353b40); --vc-bline: #14181a; --vc-bsh: inset 0 1px 0 #5b646b; --vc-brad: 3px; --vc-main: linear-gradient(#25343b, #1a262c); --vc-mainsh: 0 0 10px rgba(3,208,252,.3); --vc-field: #1c2023; --vc-card: #23282c; --vc-edge: #14181a; --vc-rad: 3px; --vc-on: linear-gradient(#2c5a3a, #1f4029); --vc-onl: #5fbf7a; --vc-glow: rgba(3,208,252,.3); --vc-tfont: \"VC Cinzel\", Georgia, serif; --vc-tsh: 0 -1px 0 #111; --vc-pad: 9px; border: 2px solid #1a1e21; box-shadow: inset 0 1px 0 #5b646b, 0 2px 10px rgba(0,0,0,.5); } .vc-th-stele .vc-head { justify-content: space-between; font-size: 12px; letter-spacing: .1em; color: #d8dde1; text-transform: uppercase; } .vc-th-stele .vc-card { box-shadow: inset 0 2px 4px rgba(0,0,0,.4); } .vc-th-stele .vc-name { color: #eef2f4; text-shadow: 0 -1px 0 #000; } .vc-th-stele button.vc-main { color: #03d0fc !important; border: 1px solid #03d0fc !important; text-shadow: 0 0 8px #03d0fc; font-family: var(--vc-tfont) !important; } .vc-th-stele .vc-tab { box-shadow: inset 0 2px 4px rgba(0,0,0,.4); } .vc-th-stele .vc-tab[aria-expanded=\"true\"] { background: #1b2c33; text-shadow: 0 0 6px #03d0fc; } .vc-th-tonal { --vc-bg: #1c1b1f; --vc-text: #e6e1e5; --vc-dim: #938f99; --vc-acc: #c4e7ff; --vc-acct: #c4e7ff; --vc-onacc: #002a36; --vc-btn: transparent; --vc-bline: #49454f; --vc-bsh: none; --vc-brad: 14px; --vc-main: #03d0fc; --vc-field: #151418; --vc-card: #2b2930; --vc-edge: #36343b; --vc-rad: 12px; --vc-on: #3b4a5a; --vc-onl: #3b4a5a; --vc-glow: transparent; border-radius: 12px; } .vc-th-tonal .vc-card { border: none; } .vc-th-tonal button.vc-main { border-radius: 18px !important; } .vc-th-tonal .vc-nav { background: #211f26; border-radius: 12px; padding: 8px 0; } .vc-th-tonal .vc-tab { color: #938f99; } .vc-th-tonal .vc-tab .vc-ic { width: 40px; height: 24px; padding: 3px 0; border-radius: 13px; } .vc-th-tonal .vc-tab[aria-expanded=\"true\"] { background: transparent; box-shadow: none; color: #e6e1e5; } .vc-th-tonal .vc-tab[aria-expanded=\"true\"] .vc-ic { background: #3b4a5a; color: #c4e7ff; } .vc-th-tonal .vc-pane { background: #2b2930; border-radius: 12px; padding: 8px; }"; }
        function ensureVcStyles() {
            if (document.getElementById('vc-styles')) return;
            const st = document.createElement('style');
            st.id = 'vc-styles';
            st.textContent = vcCss() + themeFontCss();
            (document.head || document.documentElement).appendChild(st);
        }
        // ---- Themes (v7.4) : liste seulement. Couleurs, formes et signature de chaque theme : css/themes/<id>.css
        // (classe .vc-th-<id> sur l'hote) ; agencement par defaut : css/agencements/<layout>.css (attribut data-vc-layout).
        // font = police si "Police du theme" ; acc = accent par defaut (pipette de Personnaliser) ; light = theme clair.
        // fonction (pas de const) : ensureVcStyles peut tourner avant cette ligne.
        function themes() { return {
            stele: { label: 'Stèle de cultivation', layout: 'tablettes', font: 'Segoe UI', acc: '#03d0fc' },
            inspecteur: { label: 'Inspecteur', layout: 'liste', font: 'Segoe UI', acc: '#03d0fc' },
            linear: { label: 'Indigo', layout: 'onglets', font: 'Segoe UI', acc: '#5e6ad2' },
            groupes: { label: 'Graphite', layout: 'liste', font: 'Segoe UI', acc: '#0a84ff' },
            tonal: { label: 'Tonal', layout: 'rail', font: 'Segoe UI', acc: '#d0bcff' },
            parchemin: { label: 'Parchemin et sceaux', layout: 'liste', font: 'Cambria', acc: '#a8261f', light: true },
            jade: { label: 'Jade impérial', layout: 'tablettes', font: 'Segoe UI', acc: '#3fe0aa' },
            laque: { label: 'Laque noire et or', layout: 'liste', font: 'Bahnschrift', acc: '#d9a94a' },
            neon: { label: 'Verre néon', layout: 'rail', font: 'Segoe UI', acc: '#03d0fc', glass: true },
            nuit: { label: 'Nuit violette', layout: 'onglets', font: 'Segoe UI', acc: '#b46bff' },
            braise: { label: 'Braise', layout: 'tablettes', font: 'Segoe UI', acc: '#ff6a3d' },
            menthe: { label: 'Menthe néon', layout: 'tablettes', font: 'Segoe UI', acc: '#50ffbe', glass: true }
        }; }
        function layouts() { return { theme: 'Celui du thème', liste: 'Liste', tablettes: 'Tablettes', onglets: 'Onglets', rail: 'Rail d’icônes' }; }
        function currentLayout() {
            const l = GM_getValue('panelLayout', 'theme');
            return layouts()[l] && l !== 'theme' ? l : themes()[currentThemeId()].layout;
        }
        // Seule partie dynamique du CSS : polices (Cinzel livree via @resource ; chiffres de Georgia pris dans Cambria).
        function themeFontCss() {
            return '@font-face{font-family:"VC Georgia";src:local("Cambria");unicode-range:U+0030-0039;}@font-face{font-family:"VC Georgia";src:local("Georgia");}' +
                '@font-face{font-family:"VC Cinzel";src:' + themeTexUrl(['vcCinzel', 'cinzel.woff2']) + ' format("woff2");font-weight:400 900;font-display:swap;}';
        }
        // ---- Personnaliser (v6.59) : couleur d'accent, police du texte, Cinzel (livree, OFL) pour les titres.
        function vcFonts() { return { theme: 'Police du thème', segoe: 'Segoe UI', calibri: 'Calibri', cambria: 'Cambria', georgia: 'Georgia', verdana: 'Verdana', consolas: 'Consolas' }; }
        function currentFont() { const f = GM_getValue('fontFamily', 'theme'); return vcFonts()[f] ? f : 'theme'; }
        function currentAccent() { const a = GM_getValue('accentColor', ''); return /^#[0-9a-f]{6}$/i.test(a) ? a : ''; }
        function hexRgb(h) { return [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16)); }
        function rgbHex(c) { return '#' + c.map((v) => ('0' + v.toString(16)).slice(-2)).join(''); }
        function relLum(c) {
            const l = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
            return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
        }
        // Accent en texte : eclairci jusqu'a 4,5:1 sur plaque sombre (#15151f).
        function accentText(h) {
            let c = hexRgb(h);
            for (let i = 0; i < 12 && (relLum(c) + 0.05) / 0.058 < 4.5; i++) c = c.map((v) => Math.round(v + (255 - v) * 0.2));
            return rgbHex(c);
        }
        function accentTargets() { return { cadre: 'Cadre du panneau', titres: 'Titres des sections', cases: 'Cases cochees', tout: 'Tout' }; }
        function currentAccentTarget() { const t = GM_getValue('accentTarget', 'cadre'); return accentTargets()[t] ? t : 'cadre'; }
        function themeAccent() { return themes()[currentThemeId()].acc; }
        function currentThemeId() { const t = GM_getValue('theme', 'stele'); return themes()[t] ? t : 'stele'; }
        function themeTexUrl(tex) {
            if (!tex) return 'none';
            try { const u = typeof GM_getResourceURL === 'function' && GM_getResourceURL(tex[0]); if (u) return 'url("' + u + '")'; } catch (e) { /* repli */ }
            return 'url("https://raw.githubusercontent.com/Tryne-graphik/Vid-os-continuum/master/themes/' + tex[1] + '")';
        }
        function applyTheme(el) {
            if (!el) return;
            ensureVcStyles();
            bindScaleOnResize();
            const id = currentThemeId();
            el.classList.add('vc-th-host');
            Object.keys(themes()).forEach((k) => el.classList.toggle('vc-th-' + k, k === id));
            el.classList.add('vc-thm');
            el.classList.toggle('vc-light', !!themes()[id].light);
            el.classList.toggle('vc-glass', !!themes()[id].glass);
            el.setAttribute('data-vc-layout', currentLayout());
            const acc = currentAccent();
            const tg = currentAccentTarget();
            ['cadre', 'titres', 'cases'].forEach((t) => el.classList.toggle('vc-ct-' + t, !!acc && (tg === t || tg === 'tout')));
            ['cc', 'cct', 'ccon'].forEach((n) => el.style.removeProperty('--vc-' + n));
            if (acc) {
                el.style.setProperty('--vc-cc', acc);
                el.style.setProperty('--vc-cct', accentText(acc));
                el.style.setProperty('--vc-ccon', relLum(hexRgb(acc)) > 0.18 ? '#000' : '#fff');
            }
            // v7.3 : "Police du theme" par defaut (choix de Personnaliser sinon).
            el.style.setProperty('--vc-font', '"' + (currentFont() === 'theme' ? themes()[id].font || 'Segoe UI' : vcFonts()[currentFont()]).replace(/^Georgia$/, 'VC Georgia') + '"');
            el.classList.toggle('vc-cinzel', GM_getValue('titleCinzel', false) === true);
            applyScale(el);
        }
        // Grand ecran : panneau compact en 1080p (fenetre ~950 px de haut), agrandi au-dela
        // (x1,25 en 1440p, plafonne a x1,6).
        function applyScale(el) {
            const z = Math.round(Math.max(1, Math.min(1.6, window.innerHeight / 1050)) * 100) / 100;
            const off = el.id === 'ep-panel' ? 120 : 70;
            el.style.zoom = z === 1 ? '' : String(z);
            // le zoom agrandit aussi le decalage du haut (top) : hauteur max = 100vh / z - off,
            // sinon le bas du panneau sortait de l'ecran en 1440p / 4K (recette 6.58).
            el.style.maxHeight = 'calc(100vh / ' + z + ' - ' + off + 'px)';
        }
        let vcScaleBound = false;
        function bindScaleOnResize() {
            if (vcScaleBound) return;
            vcScaleBound = true;
            window.addEventListener('resize', () => document.querySelectorAll('.vc-th-host').forEach(applyScale));
        }
        function groupLabel(t) { return '<div class="vc-grp">' + t + '</div>'; }
        function versionButtonHtml(prefix, v) {
            return '<button id="' + prefix + '-version-btn" class="vc-ver" title="Verifier les mises a jour : ouvre la page d\'installation, Tampermonkey indique si une version plus recente existe">v' + v + ' &#8635;</button>';
        }
        function themeSelectHtml(id) {
            const cur = currentThemeId();
            return '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#ccc;">Theme :<select id="' + id + '" aria-label="Theme du panneau" style="flex:1;padding:5px;border-radius:4px;border:none;background:#000;color:#eee;font-size:11px;">' +
                Object.keys(themes()).map((k) => '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + themes()[k].label + '</option>').join('') + '</select></label>';
        }
        function bindThemeSelect(container, id) {
            const sel = container.querySelector('#' + id);
            if (sel) sel.addEventListener('change', () => { GM_setValue('theme', sel.value); document.querySelectorAll('.vc-th-host').forEach(applyTheme); syncAccentInput(container, id); });
            bindCustomize(container, id.replace('-theme-select', ''));
        }
        function customizeHtml(prefix, open) {
            const f = currentFont(), F = vcFonts();
            const row = 'display:flex;align-items:center;gap:6px;font-size:11px;color:#ccc;';
            return collapsibleSection('perso', 'Personnaliser',
                '<label style="' + row + '">Couleur :<input type="color" id="' + prefix + '-accent" value="' + (currentAccent() || themeAccent()) + '" aria-label="Couleur (pipette dans le selecteur)" style="flex:1;height:26px;padding:0 2px;border:none;background:none;cursor:pointer;">' +
                '<button id="' + prefix + '-accent-apply" title="Appliquer et enregistrer la couleur choisie" style="' + BTN_STYLE + 'flex:0 0 auto;">Appliquer</button></label>' +
                '<label style="' + row + '">Appliquer à<select id="' + prefix + '-accent-target" aria-label="Element colore" style="flex:1;padding:5px;border-radius:4px;border:none;background:#000;color:#eee;font-size:11px;">' +
                Object.keys(accentTargets()).map((k) => '<option value="' + k + '"' + (k === currentAccentTarget() ? ' selected' : '') + '>' + accentTargets()[k] + '</option>').join('') + '</select></label>' +
                '<label style="' + row + '">Police :<select id="' + prefix + '-font" aria-label="Police du panneau" style="flex:1;padding:5px;border-radius:4px;border:none;background:#000;color:#eee;font-size:11px;">' +
                Object.keys(F).map((k) => '<option value="' + k + '"' + (k === f ? ' selected' : '') + ' style="font-family:\'' + F[k] + '\';">' + F[k] + '</option>').join('') + '</select></label>' +
                '<label style="' + row + '">Agencement :<select id="' + prefix + '-layout" aria-label="Agencement du panneau" style="flex:1;">' +
                Object.keys(layouts()).map((k) => '<option value="' + k + '"' + (k === GM_getValue('panelLayout', 'theme') ? ' selected' : '') + '>' + layouts()[k] + '</option>').join('') + '</select></label>' +
                '<label class="vc-track" title="Titres des sections en Cinzel (capitales gravees)"><input type="checkbox" id="' + prefix + '-cinzel"' + (GM_getValue('titleCinzel', false) === true ? ' checked' : '') + '><span class="off">Titres en Cinzel</span><span class="on">&#10003; Titres en Cinzel</span></label>' +
                '<button id="' + prefix + '-perso-reset" title="Revenir a l\'accent et a la police du theme" style="' + BTN_STYLE + '">Réinitialiser</button>', open, true);
        }
        function syncAccentInput(container, id) {
            const inp = container.querySelector('#' + id.replace('-theme-select', '') + '-accent');
            if (inp && !currentAccent()) inp.value = themeAccent();
        }
        function bindCustomize(container, prefix) {
            const q = (s) => container.querySelector('#' + prefix + s);
            const all = () => document.querySelectorAll('.vc-th-host').forEach(applyTheme);
            const acc = q('-accent'), apply = q('-accent-apply'), tgt = q('-accent-target'), font = q('-font'), lay = q('-layout'), cz = q('-cinzel'), reset = q('-perso-reset');
            // v6.60 : plus d'application en direct, bouton Appliquer (demande utilisateur).
            if (apply && acc) apply.addEventListener('click', (ev) => { ev.preventDefault(); GM_setValue('accentColor', acc.value); all(); });
            if (tgt) tgt.addEventListener('change', () => { GM_setValue('accentTarget', tgt.value); all(); });
            if (font) font.addEventListener('change', () => { GM_setValue('fontFamily', font.value); all(); });
            if (lay) lay.addEventListener('change', () => { GM_setValue('panelLayout', lay.value); all(); });
            if (cz) cz.addEventListener('change', () => { GM_setValue('titleCinzel', cz.checked); all(); });
            if (reset) reset.addEventListener('click', () => {
                GM_setValue('accentColor', ''); GM_setValue('accentTarget', 'cadre'); GM_setValue('fontFamily', 'theme'); GM_setValue('panelLayout', 'theme'); GM_setValue('titleCinzel', false);
                if (acc) acc.value = themeAccent();
                if (tgt) tgt.value = 'cadre';
                if (font) font.value = 'theme';
                if (lay) lay.value = 'theme';
                if (cz) cz.checked = false;
                all();
            });
        }
        function toggleButtonsHtml(prefix, autoNext, autoOpen) {
            ensureVcStyles();
            const t = (id, on, label) => '<label class="vc-track vc-small" title="' + (label === 'Ouverture auto' ? 'Ouvre le lecteur tout seul sur une page d\'episode' : 'Enchaine l\'episode suivant a la fin') + '"><input type="checkbox" id="' + id + '"' + (on ? ' checked' : '') + '><span class="off">' + label + '</span><span class="on">&#10003; ' + label + '</span></label>';
            return '<div style="display:flex;gap:4px;">' + t(prefix + 'autonext' + (prefix === 'ed-' ? '-cb' : ''), autoNext, 'Enchaîner') +
                t(prefix + 'autoopen' + (prefix === 'ed-' ? '-cb' : ''), autoOpen, 'Ouverture auto') + '</div>';
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
            return '<label class="vc-track"><input type="checkbox" id="' + id + '"' + (checked ? ' checked' : '') + '><span class="off">&#9734; Suivre</span><span class="on">&#9733; Suivi</span></label>';
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
            return menuItem('incident', 'Signaler',
                '<select id="' + prefix + '-fb-type" style="width:100%;padding:5px;border-radius:4px;border:none;background:#000;color:#eee;font-size:11px;">' +
                '<option>Bug</option><option>Vidéo ne se lance pas</option><option>Suggestion</option><option>Autre</option></select>' +
                '<textarea id="' + prefix + '-fb-body" aria-label="Description du problème" rows="4" placeholder="Ce que tu faisais, ce qui s\'est passe..." style="width:100%;box-sizing:border-box;padding:6px;border-radius:4px;border:none;background:#000;color:#eee;font-size:11px;resize:vertical;">' + draft + '</textarea>' +
                '<div style="font-size:10px;color:#888;">Envoye avec : site, anime, episode, version, navigateur.</div>' +
                '<button id="' + prefix + '-fb-send" style="' + BTN_STYLE + '">&#128228; Envoyer</button>' +
                '<span id="' + prefix + '-fb-note" style="font-size:11px;color:' + incidentNote.color + ';">' + incidentNote.text + '</span>', open);
        }

        // ---- Nouveautes (v6.18) : encart repliable, ouvert d'office tant
        // que la version installee n'a pas ete "vue" (ouverture de l'encart).
        const CHANGELOG = [
            ['7.4', ['Chaque thème reprend maintenant l’agencement de sa maquette : menus en liste (Parchemin, Laque, Inspecteur, Graphite), en tablettes (Stèle, Jade, Braise, Menthe), en onglets (Indigo, Nuit violette) ou en rail d’icônes à gauche (Tonal, Verre néon).',
                'Nouveau réglage « Agencement » (Personnaliser) : garder celui du thème ou en choisir un autre.',
                'Un seul menu ouvert à la fois ; le bouton principal (Regarder, Plein écran) a enfin la couleur de chaque thème ; Fin intro ici / Début outro ici redeviennent verts une fois réglés.',
                'Thème Parchemin : numéro d’épisode, version et (!) bien lisibles sur le fond clair.']],
            ['7.3', ['Chaque thème a maintenant sa propre allure : forme des boutons, bouton principal, police des titres, cadre. Seuls les 12 nouveaux thèmes restent (les anciens sont retirés ; un ancien choix passe sur Stèle de cultivation).',
                'Police : nouveau choix « Police du thème », par défaut (Personnaliser).',
                'Libellés plus clairs : Regarder, Mes séries, Nouveaux épisodes, Enchaîner, Ouverture auto, Fin intro ici, Début outro ici, Avancé, Réglages par série, Ne plus suivre, Fichier de sauvegarde, Redonner l’accès, Afficher : à rattraper.',
                'Police Georgia : les chiffres sont maintenant pris dans Cambria et restent alignés (le 5 et le 9 ne descendent plus sous la ligne).']],
            ['7.2', ['Nouveau look : le panneau est rangé en cartes (épisode, suivi) et les menus deviennent des tablettes ; un seul menu s\'ouvre à la fois, encadré et dans la couleur d\'accent.',
                '12 nouveaux thèmes (Réglages > Plus > Affichage) : Stèle de cultivation (par défaut), Inspecteur, Indigo, Graphite, Tonal, Parchemin et sceaux, Jade impérial, Laque noire et or, Verre néon, Nuit violette, Braise, Menthe néon. Les anciens thèmes restent disponibles.']],
            ['7.1', ['Ligne « Source » sous le numéro d\'épisode (bleu = lecteur du site, rouge = YouTube) avec un bouton Changer : une seule fenêtre pour les lecteurs du site, le même épisode sur les autres sites et les vidéos YouTube. Remplace le volet Sources du lecteur.',
                'Recherche YouTube : le nom de la série doit apparaître en entier (« The Demon Hunter\'s Romance », une série live, n\'est plus proposée pour « The Demon Hunter »), les vidéos d\'une autre saison sont écartées, et un épisode deux fois trop long ou trop court aussi (si la durée est connue).']],
            ['7.0', ['Version de recette complète : sauvegarde plus sûre (les noms comme "Re:Zero" et les séries exclues ne se perdent plus à la restauration ; un fichier contenant seulement des réglages s\'importe).', 'Sécurité : un fichier de sauvegarde piégé ne peut plus injecter de code ; le lecteur n\'écoute plus que le calque.', 'Plus fluide : vérification des nouveaux épisodes 4 séries à la fois et jamais en onglet caché, moins d\'écritures pendant la lecture.', 'Clavier : Échap ferme la fenêtre du dessus, puis le lecteur ; le focus va dans la fenêtre ouverte.', 'Panneau : accents corrigés, Réglages fermés hors épisode (plus de défilement en 1366x768), Nouveautés limitées aux 5 dernières versions, message clair quand le filtre masque tout.']],
            ['6.66', ['Le panneau reste ferme (ou ouvert) d\'une page a l\'autre : il ne reapparait plus a chaque rechargement.', 'Nouveautes fermees par defaut : le (!) jaune signale une nouvelle version, a ouvrir si besoin.']],
            ['6.65', ['Opera (Tampermonkey) : les boutons du panneau, Importer, Historique, le suivi et les Fiches ne reagissaient pas. Corrige.']],
            ['6.64', ['Nouveau bouton "\u2713 Deja vu" dans la Fiche : icone grise (3 coches) sur les vignettes des series vues avant le script. Une serie suivie garde son icone de suivi.']],
            ['6.63', ['Nouvelle icone "Pas aime" (orange, 3 croix) sur les vignettes : bouton "\uD83D\uDC4E Pas aime" dans la Fiche, pour se souvenir d\'une serie qu\'on n\'a pas aimee (suivie ou non). Re-cliquer pour la retirer.']],
            ['6.62', ['Fiche : synopsis en francais retrouve depuis les vignettes d\'episode d\'Esprit Donghua (lu sur la page de la serie).', 'Fiche : genres et note aussi pour les series AniList sans fiche MyAnimeList (beaucoup de donghua), en essayant le nom romanise puis le nom anglais.']],
            ['6.61', ['Bouton "ℹ Fiche" sur toutes les vignettes (Esprit Donghua, Animoflix, sites ajoutes) : synopsis, genres et note par-dessus la page, sans lancer l\'episode.', 'Anime-Sama : le bouton Fiche des vignettes ouvre aussi la fiche sur place (lien "Page de l\'anime" dedans).', 'Une fiche deja ouverte se reaffiche tout de suite ; rien n\'est enregistre pour les series non suivies.']],
            ['6.60', ['Personnaliser : "Accent" devient "Couleur", avec un bouton Appliquer (la couleur ne change plus pendant le choix).', 'Nouvelle liste "Appliquer a" : cadre du panneau (par defaut), titres des sections, cases cochees, ou tout.']],
            ['6.59', ['Series en memoire mieux reperables sur les pages des sites : cadre de couleur autour de la vignette (meme couleur que l\'icone, agrandie).', 'Option "Estomper les séries suivies" (panneau du site, Reglages > Plus > Affichage) : les series deja en memoire sont grisees, les nouveautes ressortent ; nettes au survol.', 'Reglages > Plus > Personnaliser : couleur d\'accent (avec pipette), police du panneau (6 polices Windows), titres en Cinzel, bouton Reinitialiser.']],
            ['6.58', ['Lisibilite (12 pistes) : police Segoe UI 12 px demi-gras ; boutons sur plaques pleines et textures adoucies ; verre trempe fume (texte lisible sur scene claire) ; titres de sections en simples intitules ; couleurs d\'accent adoucies ; plus de noir ni de blanc purs.', 'Cartes des sites : etat avec icone et mot (● 2 a rattraper, ✓ a jour). Zones de clic d\'au moins 24 px, contour clavier visible sur tous les themes.', 'Option "Panneau discret en lecture" (Reglages > Plus > Affichage) : le panneau s\'efface apres 4 s sans souris et revient au survol.']],
            ['6.57', ['Retours de recette : nom de la serie sur 2 lignes si besoin, bouton "ℹ Fiche" sur la ligne de l\'episode, numero de version cliquable pour verifier les mises a jour.', '"↻ Verifier les nouveaux episodes" de nouveau sur une ligne entiere ; Reglages : Fin intro | Début outro | Plus, et Plus range en 3 groupes (Intro / outro, Affichage, Page).', 'Croix ✕ sur Nouveautes pour la masquer jusqu\'a la prochaine version.', 'Themes plus lisibles (texte teinte, semi-gras, ombre) ; panneau agrandi automatiquement sur grand ecran (1440p, 4K).']],
            ['6.56', ['Themes du panneau (Reglages > Plus > Theme) : Metallique, Fibre de carbone, Verre trempe, Pierre noire, Pierre bleue, ou Actuel. Une couleur d\'accent par theme ; le lecteur et le panneau du site suivent le meme theme.']],
            ['6.55', ['Reglages ouvert par defaut (Fin intro / Début outro toujours visibles).', 'Afficher l\'etat AniSkip deplace dans Reglages > Plus, en bouton comme les autres ; Plus aligne sur les autres sections.']],
            ['6.54', ['Correctif : la 6.53 ne se lancait pas (erreur de syntaxe).']],
            ['6.53', ['Nom de la serie et numero d\'episode un peu plus petits.']],
            ['6.52', ['Panneau plus compact (tient sur un ecran 1080p) : Plein écran / Fermer, Prec. / N° / Aller / Suiv., Nouveaux ep. / Historique et Signaler / Legende sur une meme ligne ; Fiche de l\'anime = bouton ℹ a cote du nom ; Vérifier MAJ dans Nouveautes ; Suivre | Historique ; liste des series + ↻ (verifier les nouveaux episodes) ; Reglages | Sources, Sauvegarde | Nouveautes, Exporter | Importer, YouTube | Source du site.', 'Tous les boutons a la meme taille (Suivre, Plein écran, Fermer, Aller... etaient plus gros).', 'Ligne AniSkip masquee par defaut (Reglages > Afficher l\'etat AniSkip) et raccourcie : AniSkip ✓ / ✗, detail au survol.']],
            ['6.51', ['Clavier : Echap ferme les fenetres (fiche, reglages, historique, suivi) ; cases Suivre, vignettes YouTube, lignes du resume et bouton Fiche utilisables au clavier (Tab, Entree).', 'Lecteurs d\'ecran : champs et listes etiquetes, statut et compte a rebours annonces.']],
            ['6.50', ['Fenetre de suivi : la saison vue est affichee apres le nom (Anime-Sama, Animoflix, myfluneo), ex. "Clevatess · Saison 2".', 'Fenetre "Mes animes" et petit bouton ▶ retires des autres sites. "Ajouter ce site" devient une commande directe du menu Tampermonkey (depuis la page d\'un episode).', 'Sauvegarde complete : en plus de la progression et de l\'historique, le fichier garde les series abandonnees / en attente, les reglages intro/outro, les chaines YouTube, les sites ajoutes, les reprises et les preferences (restaures a l\'import, sans ecraser ceux deja presents).']],
            ['6.49', ['Nouvelles saisons detectees pour les series en attente (pause) sur Anime-Sama, Animoflix et myfluneo : la serie repasse en nouvel episode avec un bouton "Regarder (Saison N)" dans la fenetre de suivi.', 'Anime-Sama / myfluneo : des qu\'un episode de la nouvelle saison est vu, l\'ancienne saison est retiree du suivi (elle reste dans l\'historique).']],
            ['6.48', ['Nouvel etat "Saison finie, en attente" (violet, 3 cases cochees) : bouton pause dans la fenetre de suivi d\'un site. La serie n\'est plus comptee "a rattraper" et repasse toute seule en nouvel episode quand la suite sort (sites qui continuent la numerotation, ex. Esprit Donghua).', 'Icones des vignettes plus petites (24 px).', 'Section "Legende des icones" dans le panneau.']],
            ['6.47', ['Animoflix : plus de 2e icone au milieu de certaines vignettes (elle se posait sur le petit drapeau de langue).']],
            ['6.46', ['Animoflix : icone de suivi des vignettes en bas a droite aussi (meme etiquette Anime qui la cachait).']],
            ['6.45', ['Anime-Sama : icone de suivi des vignettes deplacee en bas a droite (l\'etiquette "Anime" du site la cachait).']],
            ['6.44', ['Boutons Épisode précédent / suivant places sous la barre de lecture, dans la rangee des commandes (entre le temps et les reglages).']],
            ['6.43', ['Verification des nouveaux episodes : les series importees d\'une ancienne sauvegarde (Esprit Donghua) retrouvent leur page serie par la recherche du site au lieu d\'une erreur "Refused to connect to legacy:".']],
            ['6.42', ['Boutons Épisode précédent / suivant plus petits et plus bas, juste au-dessus de la barre de lecture.']],
            ['6.41', ['Pastilles des vignettes remplacees par une petite icone liste a cases, cases a la couleur de l\'etat, 1re case cochee (croix pour les series exclues), la coche se dessine a l\'apparition.']],
            ['6.40', ['Pastille ✓ sur les vignettes des sites : verte = suivi ici, turquoise = nouvel episode a voir, jaune = suivi sur un autre site, rouge = exclu du suivi.']],
            ['6.39', ['Boutons Épisode précédent / suivant deplaces en bas au centre, au-dessus de la barre de lecture.',
                'Le bouton Suivant reste visible (grise, "Pas encore sorti") sur le dernier episode sorti.',
                'Video sans choix de qualite (fichier d\'origine) qui cale : bascule directe sur YouTube au lieu de recharger.']],
            ['6.38', ['Boutons Épisode précédent / suivant sur la video, a gauche et a droite du centre : ils apparaissent quand la souris bouge et disparaissent apres 3 s.',
                'Vignettes YouTube : badge VOSTFR (annonce dans le titre) ou ST auto FR (sous-titres traduits automatiquement par YouTube).',
                'Lecture sur YouTube : "Prec." revient a l\'episode precedent au lieu d\'afficher "Aucun episode precedent".']],
            ['6.37', ['Recherche YouTube : essaie aussi le nom anglais de la serie et "EP N" - trouve les compilations (ex. "EP 181 - EP 200") qui ne citent pas le numero cherche.',
                'Lecteur YouTube : le bouton "Plus de videos" est masque (il cachait les reglages).',
                'Épisode suivant sur YouTube : ne retombe plus sur le site quand YouTube affiche sa page de consentement aux cookies.']],
            ['6.36', ['"Trouver sur YouTube" cherche tout seul et propose les videos en vignettes (plus de lien a coller) ; la chaine choisie est retenue pour les episodes suivants.', 'Compilations YouTube : le debut de chaque episode est lu dans les chapitres de la video quand elle en a (sinon estime).']],
            ['6.35', ['Recherche YouTube : les videos aux sous-titres anglais incrustes dans l\'image (pas traduisibles en francais) ne sont plus proposees.']],
            ['6.34', ['Video qui cale ou episode indisponible : l\'encadre cherche tout seul l\'episode sur YouTube et affiche les resultats (nom de la serie + numero, VOSTFR en premier). Un clic lance la video et retient la chaine : les prochains episodes qui calent y basculent automatiquement.',
                'Titres YouTube "Episode 243" reconnus (avant : seulement "EP 243").']],
            ['6.33', ['Video qui cale au changement d\'episode : un nouvel essai est fait automatiquement avant d\'afficher l\'encadre "Reessayer".',
                'Choix automatique de la qualite Odysee et case 720p supprimes (Odysee le refuse sans compte : petite fenetre rouge). Avec un compte, regler la qualite sur odysee.com/$/settings.']],
            ['6.32', ['Esprit Donghua a change ses adresses d\'episodes (numerotation par saison) : les series suivies dont l\'adresse ne marchait plus sont retrouvees et corrigees toutes seules, la detection des nouveaux episodes remarche.',
                'Plus d\'encadre jaune "elements tiers suspects" : le detail reste dans la console (F12).']],
            ['6.31', ['Épisode suivant : le decompte commence 4 s avant le debut de l\'outro et enchaine 2 s apres (la derniere replique n\'est plus coupee). Sans outro reglee : decompte sur les 4 dernieres secondes, enchainement a la fin.',
                'Decompte en bas a droite (ne cache plus les sous-titres) avec "Suivant maintenant" a cote d\'"Annuler".',
                'Boutons "Fin intro" / "Début outro" verts quand c\'est regle pour la serie (a la main ou par AniSkip), gris sinon.']],
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
            ['6.26', ['Si la video cale chez l\'hebergeur (fichier trop lourd ou mal prepare, cas de certaines chaines Odysee pour Wan Jie Du Zun), un encadre l\'explique et propose : Reessayer, Chercher sur YouTube, Rechercher sur Google, Épisode suivant.']],
            ['6.25', ['Plus de message "@connect" dans la console : les nouveaux episodes des sites ajoutes ne sont verifies que depuis ces sites.']],
            ['6.24', ['Odysee : un meme anime publie par plusieurs chaines (ou avec des titres differents) ne cree plus plusieurs lignes de suivi. Les doublons existants sont fusionnes une fois, en gardant le plus ancien episode vu.']],
            ['6.23', ['Fiche de l\'anime sur tous les sites (bouton \u2139 dans le lecteur, le panneau et la fenetre de suivi) : synopsis en francais quand le site le fournit (sinon AniList en anglais), genres, tags sans spoilers, note, nombre d\'episodes, statut et prochain episode.',
                'Sites ajoutes : la verification des nouveaux episodes n\'etait pas autorisee par Tampermonkey, corrige.']],
            ['6.22', ['"Ajouter ce site" (fenetre \u25B6 Mes animes, depuis la page d\'un episode) : le lecteur, le suivi, la reprise, l\'enchainement et AniSkip sur un site non prevu. Teste sur french-anime.com et myfluneo.eu. Menu Tampermonkey : "Retirer ce site".']],
            ['6.21', ['Lecteur de secours automatique : si le lecteur d\'un episode est mort (ex. "video not found"), le lecteur suivant de la page est essaye tout seul.',
                'Si aucun lecteur ne marche, un encadre explique que c\'est le site (video supprimee, hebergeur en panne) et non Video Continuum, cherche tout seul le meme episode sur l\'autre site (Anime-Sama / Animoflix), et propose "Rechercher sur Google" et "Épisode suivant".',
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
        function newsSectionHtml(prevOpen, prefix) {
            if (GM_getValue('newsHiddenFor', '') === currentScriptVersion()) return '';
            const unseen = GM_getValue('lastSeenVersion', '') !== currentScriptVersion();
            // v7.0 : 5 dernieres versions seulement (tout l'historique faisait ~9000 px).
            const body = CHANGELOG.slice(0, 5).map(([v, items]) => '<div style="font-size:11px;color:#ccc;"><b style="color:#ffd400;">v' + v + '</b><ul style="margin:2px 0 0 16px;padding:0;">' +
                items.map((t) => '<li style="margin:2px 0;">' + escapeHtml(t) + '</li>').join('') + '</ul></div>').join('') +
                '<a href="https://github.com/Tryne-graphik/Vid-os-continuum/blob/master/HISTORIQUE.md" target="_blank" rel="noopener" style="font-size:11px;color:#03d0fc;">Tout l\'historique des versions</a>' +
                '<button id="' + prefix + '-check-update-btn" title="Ouvre la page d\'installation du script - Tampermonkey indique lui-meme si une mise a jour est disponible" style="' + BTN_STYLE + '">&#128260; Vérifier MAJ</button>';
            // v7.4 : element de menu ; le bouton Masquer est dans le volet.
            return menuItem('nouveautes', 'Nouveautés', body + '<button class="vc-news-x" title="Masquer jusqu’à la prochaine version">&#10005; Masquer jusqu’à la prochaine version</button>', { badge: unseen ? '(!)' : '' });
        }
        function bindNewsSection(container) {
            const tab = container.querySelector('.vc-tab[data-menu="nouveautes"]');
            if (tab) tab.addEventListener('click', () => {
                GM_setValue('lastSeenVersion', currentScriptVersion());
                document.querySelectorAll('.vc-tab[data-menu="nouveautes"] .vc-badge').forEach((b) => b.remove());
            });
            const x = container.querySelector('.vc-news-x');
            const hide = (ev) => {
                ev.preventDefault(); ev.stopPropagation();
                GM_setValue('newsHiddenFor', currentScriptVersion());
                GM_setValue('lastSeenVersion', currentScriptVersion());
                document.querySelectorAll('[data-menu="nouveautes"]').forEach((n) => n.remove());
            };
            if (x) x.addEventListener('click', hide);
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

        // ---- Menus du panneau (v7.4) : onglets (.vc-nav > .vc-tab) + volets (.vc-pane), un seul ouvert.
        // Meme HTML pour les 4 agencements (css/agencements/*.css) : liste, tablettes, onglets, rail.
        // --o = ordre d'affichage en agencement "liste" (volet juste sous son onglet).
        // fonctions (pas de const) : appelables avant cette ligne (meme raison que themes()).
        function vcIcons() { return {
            reglages: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
            youtube: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
            sauvegarde: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
            nouveautes: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
            incident: '<path d="M5 21V4h11l-1.5 4L16 12H5"/>',
            legende: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'
        }; }
        function vcIcon(key) {
            return '<svg class="vc-ic" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (vcIcons()[key] || '') + '</svg>';
        }
        // Element de menu : { key, label, html, badge }. 4e argument (ancien "open") ignore.
        function menuItem(key, label, html, extra) {
            return Object.assign({ key: key, label: label, html: html }, extra && typeof extra === 'object' ? extra : {});
        }
        function menusHtml(items) {
            items = items.filter(Boolean);
            const tabs = items.map((m, i) => '<button type="button" class="vc-tab" data-menu="' + m.key + '" aria-expanded="false" title="' + m.label + '" style="--o:' + (2 * i + 1) + ';">' +
                vcIcon(m.key) + '<span class="vc-lbl">' + m.label + '</span>' + (m.badge ? '<span class="vc-badge">' + m.badge + '</span>' : '') + '</button>').join('');
            const panes = items.map((m, i) => '<div class="vc-pane" data-menu="' + m.key + '" style="--o:' + (2 * i + 2) + ';" hidden>' +
                '<div class="vc-pane-title">' + m.label + '</div>' + m.html + '</div>').join('');
            return '<nav class="vc-nav" aria-label="Menus">' + tabs + '</nav>' + panes;
        }
        // Menu ouvert retenu par panneau ('ep' / 'ed') d'une reconstruction a l'autre ; '' = tout ferme.
        function vcMenuState() { return vcMenuState.s || (vcMenuState.s = {}); }
        function openMenu(root, prefix, key) {
            vcMenuState()[prefix] = key;
            root.querySelectorAll('.vc-tab').forEach((t) => t.setAttribute('aria-expanded', String(t.getAttribute('data-menu') === key)));
            root.querySelectorAll('.vc-pane').forEach((p) => { p.hidden = p.getAttribute('data-menu') !== key; });
            root.classList.toggle('vc-menu-open', !!key);
        }
        function bindMenus(root, prefix, defaultKey) {
            const has = (k) => k && root.querySelector('.vc-pane[data-menu="' + k + '"]');
            const start = prefix in vcMenuState() ? vcMenuState()[prefix] : defaultKey;
            openMenu(root, prefix, has(start) ? start : '');
            root.querySelectorAll('.vc-tab').forEach((t) => t.addEventListener('click', () => {
                const k = t.getAttribute('data-menu');
                openMenu(root, prefix, vcMenuState()[prefix] === k ? '' : k);
            }));
        }
        function isMenuOpen(prefix, key) { return vcMenuState()[prefix] === key; }
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
            // v7.4 : position seulement ; aspect et agencement dans css/ (classes vc-thm + data-vc-layout).
            topbar.style.cssText = 'position:absolute;top:52px;left:10px;z-index:10;max-width:236px;max-height:calc(100vh - 70px);overflow-y:auto;';
            applyTheme(topbar);
            const scriptVersion = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '6.0';
            topbar.innerHTML =
                '<header class="vc-head"><span class="vc-brand">Vidéo Continuum</span>' + versionButtonHtml('ed', scriptVersion) + '</header>' +
                '<section class="vc-card vc-ep">' +
                '<div id="ed-current-name" class="vc-name"></div>' +
                '<div class="vc-epline"><div id="ed-current-ep" class="vc-epnum"></div>' +
                '<button id="ed-info-btn" class="vc-chip" title="Fiche de l\'anime : synopsis, genres, note...">&#8505; Fiche</button></div>' +
                // v7.1 : source en cours toujours visible + un seul bouton pour en changer (demande : "confus avec les autres sources").
                '<div id="ed-source" class="vc-src" style="display:none;"><span id="ed-source-label" class="vc-src-label"></span>' +
                '<button id="ed-source-btn" class="vc-chip" title="Lecteurs du site, autres sites, YouTube">&#8644; Changer</button></div>' +
                '<div id="ed-status" class="vc-status" role="status" aria-live="polite">En attente...</div>' +
                '<div id="ed-aniskip" class="vc-status" style="display:none;"></div>' +
                '<div id="ed-cross-site" class="vc-alert" style="display:none;"></div>' +
                '<span id="ed-mute-indicator" class="vc-alert vc-alert--danger" style="display:none;">Son coupé : clique dans la vidéo</span>' +
                '<div class="vc-row vc-actions"><button id="ed-fullscreen-btn" class="vc-main">Plein écran</button>' +
                '<button id="ed-close-btn">&#10005; Fermer</button></div>' +
                '<div class="vc-row vc-goto">' +
                '<button id="ed-prev-btn" title="Épisode précédent" aria-label="Épisode précédent">&#9664;</button>' +
                '<input type="number" id="ed-goto-input" aria-label="Numéro de l’épisode" min="1" placeholder="N&#176; ép.">' +
                '<button id="ed-goto-btn">Aller</button>' +
                '<button id="ed-next-btn" title="Épisode suivant" aria-label="Épisode suivant">&#9654;</button>' +
                '</div></section>' +
                '<section class="vc-card vc-follow"><div class="vc-row">' + trackButtonHtml('ed-track-cb', false) +
                '<button id="ed-history-btn">&#128338; Historique</button></div>' +
                '<select id="ed-series-select" class="vc-series" aria-label="Changer de série"><option value="">-- Mes séries --</option></select>' +
                '<button id="ed-check-new-btn">&#8635; Nouveaux épisodes</button>' +
                toggleButtonsHtml('ed-', false, false) + '</section>' +
                menusHtml([
                    menuItem('reglages', 'Réglages',
                        '<div class="vc-row vc-wrap"><button id="ed-set-intro-btn">Fin intro ici</button><button id="ed-set-outro-btn">Début outro ici</button></div>' +
                        collapsibleSection('plus', 'Avancé',
                            groupLabel('Intro / outro') +
                            '<div class="vc-row"><button id="ed-set-introstart-btn">Début intro</button><button id="ed-set-outroend-btn">Fin outro</button></div>' +
                            '<button id="ed-settings-btn">Réglages par série</button>' +
                            groupLabel('Affichage') +
                            themeSelectHtml('ed-theme-select') + customizeHtml('ed', false) +
                            '<label class="vc-track"><input type="checkbox" id="ed-aniskip-cb"' + (isAniSkipShown() ? ' checked' : '') + '><span class="off">Afficher l\'etat AniSkip</span><span class="on">&#10003; Afficher l\'etat AniSkip</span></label>' +
                            '<label class="vc-track" title="4 s sans bouger la souris : le panneau devient presque transparent ; il revient au survol ou au moindre mouvement"><input type="checkbox" id="ed-autohide-cb"' + (GM_getValue('panelAutoHide', false) === true ? ' checked' : '') + '><span class="off">Panneau discret en lecture</span><span class="on">&#10003; Panneau discret en lecture</span></label>' +
                            groupLabel('Page') +
                            '<div class="vc-row"><button id="ed-reload-btn" title="Recharger la page">&#8635; Recharger</button>' +
                            '<button id="ed-delete-btn" class="vc-danger" title="Retire de la progression la série choisie dans la liste">Ne plus suivre</button></div>', false, true)),
                    menuItem('sauvegarde', 'Sauvegarde',
                        '<div class="vc-row"><button id="ed-export-btn">Exporter</button><button id="ed-import-btn">Importer</button></div>' +
                        '<input type="file" id="ed-import-file" accept=".html,.htm" style="display:none;">' +
                        '<button id="ed-choose-backup-btn">Fichier de sauvegarde</button>' +
                        '<button id="ed-reauth-backup-btn">Redonner l\'accès</button>' +
                        '<span id="ed-backup-status" class="vc-note"></span>'),
                    newsSectionHtml(false, 'ed'), incidentSectionHtml('ed', false), legendSectionHtml(false)
                ]) +
                '<footer class="vc-foot"><select id="ed-site-filter" title="Filtrer la liste des animes suivis par site">' + buildSiteFilterOptionsHtml() + '</select>' +
                '<div id="ed-tracking-summary" class="vc-summary"></div>' +
                siteLinksHtml() + openModeSelectHtml() + '</footer>';
            bindMenus(topbar, 'ed', 'reglages');
            overlay.appendChild(topbar);
            topbar.id = 'ed-topbar';
            overlay.addEventListener('mousemove', panelWake);
            panelWake();

            toggleBtn.addEventListener('click', () => {
                const hidden = topbar.style.display === 'none';
                topbar.style.display = hidden ? '' : 'none';
                toggleBtn.textContent = hidden ? '✕' : '☰';
            });

            const siteErrorBox = document.createElement('div');
            siteErrorBox.id = 'ed-site-error';
            siteErrorBox.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:12;max-width:440px;max-height:90%;overflow-y:auto;background:#2a1a05;color:#ffd27a;border:2px solid #ffb020;border-radius:10px;padding:18px 22px;font-family:Arial,sans-serif;font-size:14px;line-height:1.45;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,.7);display:none;';
            overlay.appendChild(siteErrorBox);

            const toast = document.createElement('div');
            toast.id = 'ed-toast';
            toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite');
            toast.style.cssText = 'position:absolute;bottom:30px;right:30px;z-index:10;background:#15151f;color:#eee;padding:14px 20px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.6);font-family:Arial,sans-serif;display:none;align-items:center;gap:12px;';
            toast.innerHTML = '<span id="ed-toast-text">Épisode suivant dans 3s...</span><button id="ed-toast-now" style="background:#03d0fc;color:#000;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:13px;font-weight:bold;">Suivant maintenant</button><button id="ed-toast-cancel" style="background:#333;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:13px;">Annuler</button>';
            overlay.appendChild(toast);

            // Prec./Suiv. sur la video (v6.38) : apparaissent quand la souris
            // bouge, disparaissent apres 3 s, comme lecture/pause.
            const NAV = 'position:absolute;bottom:6px;z-index:9;transform:translateX(-50%);width:32px;height:32px;border-radius:50%;border:none;background:rgba(0,0,0,.55);color:#fff;font-size:14px;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .3s;';
            const navPrev = document.createElement('button');
            navPrev.type = 'button'; navPrev.title = 'Épisode précédent'; navPrev.textContent = '⏮';
            navPrev.style.cssText = NAV + 'left:calc(50% - 90px);';
            const navNext = document.createElement('button');
            navNext.type = 'button'; navNext.title = 'Épisode suivant'; navNext.textContent = '⏭';
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
            bindThemeSelect(topbar, 'ed-theme-select');
            topbar.querySelector('#ed-autohide-cb').addEventListener('change', (ev) => { GM_setValue('panelAutoHide', ev.target.checked); panelWake(); });
            topbar.querySelector('#ed-info-btn').addEventListener('click', () => { if (currentEpisode) openSeriesInfo(currentEpisode); });
            const edUpd = topbar.querySelector('#ed-check-update-btn');
            if (edUpd) edUpd.addEventListener('click', openScriptUpdatePage);
            topbar.querySelector('#ed-version-btn').addEventListener('click', openScriptUpdatePage);
            topbar.querySelector('#ed-history-btn').addEventListener('click', openHistoryPopup);
            topbar.querySelector('#ed-aniskip-cb').addEventListener('change', (ev) => { GM_setValue('aniskipShown', ev.target.checked); renderAniSkipStatus(); });
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
                checkForNewEpisodes().then(() => { btn.disabled = false; btn.textContent = '↻ Nouveaux épisodes'; });
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
            topbar.querySelector('#ed-source-btn').addEventListener('click', () => { if (currentEpisode) showSourceChooser(currentEpisode); });
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
        // Panneau discret (v6.58) : 4 s sans souris -> 12 % d'opacite ; revient au survol, au focus,
        // ou a un mouvement dans le lecteur (message 'activity' de l'iframe).
        let panelFadeTimer = null;
        function panelWake() {
            const tb = document.getElementById('ed-topbar');
            if (!tb) return;
            tb.classList.remove('vc-faded');
            clearTimeout(panelFadeTimer);
            if (GM_getValue('panelAutoHide', false) === true) panelFadeTimer = setTimeout(() => tb.classList.add('vc-faded'), 4000);
        }
        function showNavButtons() {
            if (!overlayEls || !currentEpisode) return;
            const show = (el, on) => { el.style.opacity = on ? '1' : '0'; el.style.pointerEvents = on ? 'auto' : 'none'; };
            show(overlayEls.navPrev, ytActive || hasPrevEpisode(currentEpisode));
            // Suiv. toujours visible, grise s'il n'y a rien apres (v6.39)
            const hasNext = ytActive || hasNextEpisode(currentEpisode);
            show(overlayEls.navNext, true);
            overlayEls.navNext.style.opacity = hasNext ? '1' : '.35';
            overlayEls.navNext.style.cursor = hasNext ? 'pointer' : 'default';
            overlayEls.navNext.title = hasNext ? 'Épisode suivant' : 'Pas encore sorti';
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
            else {
                const old = all[storageKey(info)];
                if (old && old.ep === info.episodeNumber && Math.abs(old.t - t) < 10) return; // v7.0 : moins d'ecritures
                all[storageKey(info)] = { ep: info.episodeNumber, t: Math.floor(t) };
            }
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
            renderSourceLine();
        }
        function selectPlayer(i) {
            if (!playerCandidates[i]) return;
            playerCandidateIndex = i;
            positionArmed = false;
            outroSignalSent = false;
            setStatus('Chargement du lecteur ' + (i + 1) + '...');
            overlayEls.playerFrame.src = playerCandidates[i];
            armPlayerReadyTimer();
            renderSourceLine();
        }
        // Ligne "Source" sous le numero d'episode : bleu = site, rouge = YouTube.
        function renderSourceLine() {
            const line = overlayEls && overlayEls.overlay.querySelector('#ed-source');
            if (!line || !currentEpisode) return;
            const assoc = ytActive && getYoutubeChannelAssociation(currentEpisode);
            const text = ytActive
                ? 'YouTube' + (assoc && assoc.channelName ? ' · ' + assoc.channelName : '') + (ytSegment && ytSegment.last > ytSegment.first ? ' · compil. ' + ytSegment.first + '-' + ytSegment.last : '')
                : hostOf(overlayEls.playerFrame.src) + (playerCandidates.length > 1 ? ' (' + (playerCandidateIndex + 1) + '/' + playerCandidates.length + ')' : '');
            const label = line.querySelector('#ed-source-label');
            label.textContent = '▶ ' + text;
            label.title = 'Source en cours : ' + (ytActive ? '' : (currentEpisode.siteLabel || 'site') + ', ') + text;
            label.style.borderLeftColor = ytActive ? '#ff4e45' : '#03d0fc';
            line.style.display = 'flex';
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
                (currentEpisode && hasNextEpisode(currentEpisode) ? '<button type="button" data-act="next" style="background:#ffb020;color:#000;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-weight:bold;">Épisode suivant</button>' : '') +
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
            renderElsewhere(box.querySelector('#ed-site-alt'), info, playerCandidates.slice());
        }
        function renderElsewhere(alt, info, deadEmbeds) {
            findEpisodeElsewhere(info, deadEmbeds).then((found) => {
                if (!alt.isConnected || currentEpisode !== info) return;
                if (!found.length) { alt.textContent = 'Pas trouve sur les autres sites geres - essaie la recherche Google.'; return; }
                alt.innerHTML = 'Disponible ailleurs : ' + found.map((f) => '<a href="' + escapeHtml(f.url) + '" style="display:inline-block;margin:4px;background:#ffb300;color:#000;font-weight:bold;text-decoration:none;padding:5px 10px;border-radius:4px;">Regarder l\'ep. ' + escapeHtml(String(info.episodeNumber)) + ' sur ' + escapeHtml(f.label) + '</a>').join('');
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
            if (type === 'activity') { showNavButtons(); panelWake(); }
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
        function isAniSkipShown() { return GM_getValue('aniskipShown', false); }
        function renderAniSkipStatus() {
            const el = overlayEls && overlayEls.overlay.querySelector('#ed-aniskip');
            if (!el) return;
            if (!isAniSkipShown() || !aniSkip || !currentEpisode || aniSkip.key !== storageKey(currentEpisode)) { el.style.display = 'none'; return; }
            const io = getIntroOutroForKey(aniSkip.key);
            const ok = aniSkip.cfg && describeAniSkip(aniSkip.cfg);
            const mark = ok ? '<span style="color:#4caf50;">&#10003;</span>' : aniSkip.note && !/recherche\.\.\.$/.test(aniSkip.note) ? '<span style="color:#f66;">&#10007;</span>' : '&#8230;';
            const tip = (aniSkip.note || 'en attente du lecteur...') + (io.introEnd || io.outroStart ? ' (tes reglages manuels passent avant)' : '');
            el.innerHTML = '<span title="' + escapeHtml(tip) + '">AniSkip ' + mark + '</span>' +
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
        // sel = { idMal } ou { id } (id AniList : beaucoup de donghua n'ont pas d'id MAL, ex. Wanmei Shijie, v6.62).
        function anilistDetails(sel) {
            const query = 'query($id:Int,$mal:Int){Media(id:$id,idMal:$mal,type:ANIME){siteUrl episodes status averageScore seasonYear genres description(asHtml:false) coverImage{large} title{romaji english} tags{name rank isMediaSpoiler isGeneralSpoiler} nextAiringEpisode{episode timeUntilAiring}}}';
            return gmRequest({ method: 'POST', url: 'https://graphql.anilist.co', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, data: JSON.stringify({ query: query, variables: { id: sel.id || undefined, mal: sel.idMal || undefined } }), anonymous: true, timeout: 15000 })
                .then((res) => JSON.parse(res.responseText).data.Media);
        }
        // Premier id AniList trouve en essayant le nom romanise puis le nom anglais (entre parentheses) :
        // "Perfect World" seul tombait sur un special d'1 episode au lieu de Wanmei Shijie.
        function anilistFindId(name) {
            const names = [String(name || '').replace(/\([^)]*\)/g, '').trim(), displayName(name)].filter((n, i, a) => n && a.indexOf(n) === i);
            const query = 'query($q:String){Page(perPage:1){media(search:$q,type:ANIME){id}}}';
            const tryNext = (i) => i >= names.length ? Promise.resolve(null) :
                gmRequest({ method: 'POST', url: 'https://graphql.anilist.co', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, data: JSON.stringify({ query: query, variables: { q: names[i] } }), anonymous: true, timeout: 15000 })
                    .then((res) => { const m = (JSON.parse(res.responseText).data.Page.media || [])[0]; return m ? m.id : tryNext(i + 1); });
            return tryNext(0);
        }
        function siteSynopsis(info) {
            const slug = ((info.seriesUrl || '').match(/anime-sama\.to\/catalogue\/([^/]+)/) || [])[1];
            const url = slug ? 'https://anime-sama.to/catalogue/' + slug + '/' : info.seriesUrl;
            if (!url) return Promise.resolve(null);
            const fromDoc = (doc) => {
                const cands = [];
                const el = doc.querySelector('#synopsisText, .synopsis-content, .anime-synopsis p, .full-text, [itemprop="description"]');
                if (el) cands.push(el.textContent);
                doc.querySelectorAll('script[type="application/ld+json"]').forEach((sc) => { try { const j = JSON.parse(sc.textContent); [].concat(j).forEach((o) => { if (o && typeof o.description === 'string') cands.push(o.description); }); } catch (e) {} });
                ['meta[property="og:description"]', 'meta[name="description"]'].forEach((sel) => { const m = doc.querySelector(sel); if (m) cands.push(m.getAttribute('content') || ''); });
                // Le plus long qui ne ressemble pas a un texte publicitaire du site.
                const good = cands.map((t) => String(t).replace(/\s+/g, ' ').trim()).filter((t) => t.length >= 80 && !(t.length < 220 && /streaming|regarder|gratuit|t[e\u00e9]l[e\u00e9]charg/i.test(t)));
                return good.sort((a, b) => b.length - a.length)[0] || null;
            };
            return fetchPageHtml(url).then((html) => {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const found = fromDoc(doc);
                if (found) return found;
                // Esprit Donghua (v6.62) : les vignettes menent a un episode, le synopsis est sur la page de la serie.
                const epSlug = (url.match(/^https?:\/\/[^/]+\/([^/?#]+)/) || [])[1] || '';
                const serie = Array.from(doc.querySelectorAll('a[href*="/anime/"]')).map((a) => a.href)
                    .map((h) => [h, (h.match(/\/anime\/([^/?#]+)\/?$/) || [])[1] || ''])
                    .filter(([, sl]) => sl.length >= 3 && epSlug.indexOf(sl) === 0).sort((x, y) => y[1].length - x[1].length)[0];
                if (!serie) return null;
                return fetchPageHtml(serie[0]).then((h2) => fromDoc(new DOMParser().parseFromString(h2, 'text/html')));
            }).catch(() => null);
        }
        const ficheCache = {}; // fiche deja chargee pendant la visite -> reaffichee sans recharger (v6.61)
        function openSeriesInfo(info) {
            const key = storageKey(info);
            const old = document.getElementById('ep-info-overlay');
            if (old) old.remove();
            const pop = document.createElement('div');
            pop.id = 'ep-info-overlay';
            pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true');
            pop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;';
            pop.innerHTML = '<div id="ep-info-box" style="background:#15151f;color:#eee;max-width:640px;width:92%;max-height:84vh;overflow:auto;border-radius:8px;padding:18px;font-size:13px;line-height:1.5;">Chargement de la fiche de ' + escapeHtml(displayName(info.seriesName)) + '...</div>';
            (overlayEls && overlayEls.overlay.style.display !== 'none' ? overlayEls.overlay : document.body).appendChild(pop);
            focusDialog(pop);
            pop.addEventListener('click', (ev) => { if (ev.target === pop || ev.target.id === 'ep-info-close') pop.remove(); });
            const box = pop.querySelector('#ep-info-box');
            if (!ficheCache[key]) {
                // Serie suivie : meme anime qu'AniSkip (modifiable). Sinon recherche directe par nom romanise
                // (la recherche AniSkip, anglais + id MAL obligatoire, donnait un special pour Wanmei Shijie).
                const byName = () => anilistFindId(info.seriesName).then((id) => (id ? anilistDetails({ id: id }) : null));
                const media = (loadProgress()[key]
                    ? resolveAniLink(key, info).then((link) => (link && link.idMal ? anilistDetails({ idMal: link.idMal }) : byName()))
                    : byName()).catch(() => null);
                ficheCache[key] = Promise.all([media, siteSynopsis(info)]);
            }
            ficheCache[key].then(([m, frSyn]) => {
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
                const dk = nameMarkKey(info.seriesName);
                html += '<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;">' +
                    (dk ? Object.keys(NAME_MARKS).map((st) => '<button type="button" class="ep-info-mark" data-st="' + st + '" title="Marque la vignette de cette serie sur les sites (pour s\'en souvenir)" style="background:#1f2a33;color:' + NAME_MARKS[st][2] + ';border:1px solid ' + NAME_MARKS[st][2] + ';padding:6px 12px;border-radius:4px;cursor:pointer;"></button>').join('') : '') +
                    (info.pageUrl && /^https?:\/\//.test(info.pageUrl) ? '<a href="' + escapeHtml(info.pageUrl) + '" style="background:#1f2a33;color:#03d0fc;border:1px solid #03d0fc;padding:6px 12px;border-radius:4px;text-decoration:none;">Page de l\'anime</a>' : '') +
                    (m && /^https:\/\/anilist\.co\//.test(m.siteUrl || '') ? '<a href="' + escapeHtml(m.siteUrl) + '" target="_blank" rel="noopener" style="background:#1f2a33;color:#03d0fc;border:1px solid #03d0fc;padding:6px 12px;border-radius:4px;text-decoration:none;">Voir sur AniList</a>' : '') +
                    '<button type="button" id="ep-info-close" style="background:#333;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;">Fermer</button></div>';
                box.innerHTML = html;
                box.querySelectorAll('.ep-info-mark').forEach((btn) => {
                    const st = btn.getAttribute('data-st');
                    const label = () => { btn.textContent = loadNameMark(st)[dk] ? 'Retirer "' + NAME_MARKS[st][1].replace(/^\S+ /, '') + '"' : NAME_MARKS[st][1]; };
                    label();
                    btn.addEventListener('click', () => {
                        const all = loadNameMark(st);
                        if (all[dk]) delete all[dk]; else all[dk] = displayName(info.seriesName);
                        GM_setValue(NAME_MARKS[st][0], all);
                        label();
                        refreshThumbnailBadges();
                    });
                });
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
                if (b) b.classList.toggle('vc-set', !!on);
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
            textEl.textContent = 'Épisode suivant dans ' + seconds + 's...';
            const interval = setInterval(() => {
                if (cancelled) { clearInterval(interval); return; }
                seconds--;
                if (seconds <= 0) { clearInterval(interval); toast.style.display = 'none'; cancelCountdown = null; advanceToNextEpisode(); return; }
                textEl.textContent = 'Épisode suivant dans ' + seconds + 's...';
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
                findYoutubeEpisode(getYoutubeChannelAssociation(info), Number(info.episodeNumber), seriesSeason(info))
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
            renderSourceLine();
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
            overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
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
                    '<th style="padding:6px 4px;">Début intro</th><th style="padding:6px 4px;">Fin intro</th><th style="padding:6px 4px;">Début outro</th><th style="padding:6px 4px;">Fin outro</th>' +
                    '<th style="padding:6px 4px;">Suivi</th></tr>';
                entries.forEach((e) => {
                    const io = getIntroOutroForKey(e.key);
                    const tracked = !isSeriesExcluded(e.key);
                    const unconfigured = !io.introEnd && !io.outroStart;
                    const rowStyle = unconfigured ? 'background:rgba(255,179,0,.08);' : '';
                    html += '<tr style="border-bottom:1px solid #222;' + rowStyle + '" data-key="' + escapeHtml(e.key) + '">' +
                        '<td style="padding:6px 4px;color:#888;">' + (e.siteTag || '') + '</td>' +
                        '<td style="padding:6px 4px;">' + (unconfigured ? '&#9888; ' : '') + escapeHtml(e.seriesName) + '</td>' +
                        '<td style="padding:6px 4px;"><input type="text" class="ep-set-introStart-input" aria-label="Début intro" placeholder="mm:ss" style="width:60px;background:#000;color:#eee;border:1px solid #333;border-radius:4px;padding:3px;" value="' + formatTimecode(io.introStart) + '"></td>' +
                        '<td style="padding:6px 4px;"><input type="text" class="ep-set-introEnd-input" aria-label="Fin intro" placeholder="mm:ss" style="width:60px;background:#000;color:#eee;border:1px solid #333;border-radius:4px;padding:3px;" value="' + formatTimecode(io.introEnd) + '"></td>' +
                        '<td style="padding:6px 4px;"><input type="text" class="ep-set-outroStart-input" aria-label="Début outro" placeholder="mm:ss" style="width:60px;background:#000;color:#eee;border:1px solid #333;border-radius:4px;padding:3px;" value="' + formatTimecode(io.outroStart) + '"></td>' +
                        '<td style="padding:6px 4px;"><input type="text" class="ep-set-outroEnd-input" aria-label="Fin outro" placeholder="mm:ss" style="width:60px;background:#000;color:#eee;border:1px solid #333;border-radius:4px;padding:3px;" value="' + formatTimecode(io.outroEnd) + '"></td>' +
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
            focusDialog(overlay);
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

        // File d'attente : au plus `limit` appels de fn en cours ; une erreur
        // n'arrete pas les autres.
        function runLimited(items, limit, fn) {
            let i = 0;
            const worker = () => { if (i >= items.length) return null; const item = items[i++]; return Promise.resolve().then(() => fn(item)).catch(() => {}).then(worker); };
            return Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
        }
        function checkForNewEpisodes() {
            const progress = loadProgress();
            const excluded = loadExcludedSeries();
            const entries = Object.keys(progress).map((k) => Object.assign({ key: k }, progress[k])).filter((e) => !excluded[e.key] && e.episodeUrl);
            let changed = false;
            // v7.0 : 4 series verifiees a la fois (avant : toutes en meme temps).
            const checks = runLimited(entries, 4, (e) => {
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
            return checks.then(() => checkNewSeasons()).then(() => {
                const done = loadSeasonDone();
                Object.keys(done).forEach((k) => {
                    if (Number(latestKnownEpisode[k]) > done[k]) { setSeasonDone(k, false); changed = true; console.log('[AnimeTracker v6] nouvel episode, fin d\'attente : ' + k); }
                });
                const firstCheck = !lastNewEpisodesCheckAt;
                lastNewEpisodesCheckAt = new Date();
                if (changed || firstCheck) buildPersistentPanel();
                refreshTrackingPopup();
                refreshThumbnailBadges();
            }).catch((err) => console.log('[AnimeTracker v6] verification des nouveaux episodes echouee', err));

            // Entree importee d'une vieille sauvegarde : seriesUrl = "legacy:<nom>"
            // (pas une adresse, Tampermonkey refusait). Page serie = 1er resultat
            // de la recherche du site sur le nom hors parentheses.
            function edSeriesPageUrl(entry) {
                if (/^https:/i.test(entry.seriesUrl)) return Promise.resolve(entry.seriesUrl);
                const name = entry.seriesName.replace(/\([^)]*\)/g, '').trim() || entry.seriesName;
                const searchUrl = 'https://esprit-donghua.xyz/?s=' + encodeURIComponent(name);
                return fetchPageHtml(searchUrl).then((html) => {
                    const a = new DOMParser().parseFromString(html, 'text/html').querySelector('article.bs a[href*="/anime/"]');
                    if (!a) throw new Error('serie introuvable : ' + name);
                    return resolveUrl(a.getAttribute('href'), searchUrl);
                });
            }

            // Series en attente (saison finie) : saison suivante publiee ? (v6.49)
            function checkNewSeasons() {
                const done = loadSeasonDone();
                const prog = loadProgress();
                return Promise.all(Object.keys(done).filter((k) => prog[k] && !excluded[k]).map((k) => {
                    const e = Object.assign({ key: k }, prog[k]);
                    const s = SITES.find((x) => x.id === e.site);
                    if (!s || (s.custom && !hostMatches(location.href, s.label))) return null;
                    return Promise.resolve().then(() => findNextSeason(e)).then((ns) => {
                        if (!ns || ns.n <= (GM_getValue('seasonDismissed', {})[k] || 0)) return;
                        const all = loadNewSeasons();
                        all[k] = { url: ns.url, n: ns.n, label: seasonLabel(ns.n) };
                        GM_setValue('newSeasons', all);
                        setSeasonDone(k, false);
                        changed = true;
                        console.log('[AnimeTracker v6] nouvelle saison pour ' + e.seriesName + ' : ' + ns.url);
                    }).catch((err) => console.log('[AnimeTracker v6] verif. saison echouee pour ' + e.seriesName, err));
                }));
            }

            function relocateEdEpisodeUrl(entry) {
                let seriesPage;
                return edSeriesPageUrl(entry).then((u) => { seriesPage = u; return fetchPageHtml(u); }).then((html) => {
                    const doc = new DOMParser().parseFromString(html, 'text/html');
                    const li = Array.from(doc.querySelectorAll('.eplister li')).find((el) => {
                        const num = el.querySelector('.epl-num');
                        return num && Number(num.textContent.trim()) === Number(entry.episodeNumber);
                    });
                    const a = li && li.querySelector('a[href]');
                    if (!a) throw new Error('episode ' + entry.episodeNumber + ' introuvable sur la page serie');
                    const url = resolveUrl(a.getAttribute('href'), seriesPage);
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
            const aNew = isBehind(a.key) ? 1 : 0;
            const bNew = isBehind(b.key) ? 1 : 0;
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
            const isNew = isBehind(key);
            return {
                name: '[' + currentEpisode.siteTag + '] ' + displayName(currentEpisode.seriesName),
                fullName: currentEpisode.seriesName + ' (' + currentEpisode.siteLabel + ')',
                epText: 'Episode ' + (latest ? epNum + ' / ' + latest : epNum),
                // v7.4 : variables de theme (Parchemin, theme clair : orange et vert trop pales sur fond beige).
                color: isNew ? 'var(--vc-warn,#ffb300)' : 'var(--vc-ok,#4caf50)'
            };
        }

        // ---- Resume par site + fenetre de suivi (demande 2026-10-01) ----
        // Une ligne cliquable par site : nom, nb d'animes suivis, nb de
        // nouveaux episodes (somme dernier connu - vu quand les deux sont
        // connus, sinon 1 par serie signalee). Ouvre openTrackingPopup().

        function countNewEpisodesFor(key, watched) {
            if (!isBehind(key)) return 0;
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
            const lines = SITES.filter((s) => bySite[s.id] && matchesSiteFilter(s.id) && (!onlyBehind || bySite[s.id].some((e) => isBehind(e.key)))).map((s) => {
                const entries = bySite[s.id];
                // Nombre d'ANIMES a rattraper, pas d'episodes : une seule serie
                // tres en retard (ex. 139 ep.) noyait le total. Detail par
                // anime dans la fenetre de suivi.
                const nbBehind = entries.filter((e) => isBehind(e.key)).length;
                // Etat = icone + mot (jamais la couleur seule, WCAG 1.4.1) ; seul "a rattraper" reste colore.
                const chip = !lastNewEpisodesCheckAt ? '<span style="font-size:11px;color:#aaa;">vérification…</span>'
                    : nbBehind ? '<span style="font-size:11px;font-weight:bold;background:#ffb300;color:#1a1000;border-radius:9px;padding:1px 7px;white-space:nowrap;">&#9679; ' + nbBehind + ' a rattraper</span>'
                    : '<span style="font-size:11px;color:#9fb4c8;border:1px solid #3a4652;border-radius:9px;padding:0 7px;white-space:nowrap;">&#10003; a jour</span>';
                return '<div class="ep-summary-line" role="button" tabindex="0" data-site="' + s.id + '" title="Ouvrir le suivi detaille" style="cursor:pointer;background:rgba(255,255,255,.04);border:1px solid rgba(3,208,252,.45);border-radius:6px;padding:7px 9px;font-size:12px;display:flex;flex-direction:column;gap:3px;">' +
                    '<div style="font-weight:bold;color:#03d0fc;">' + s.label + ' &#9656;</div>' +
                    '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;"><span style="color:#ccc;">' + entries.length + ' suivi' + (entries.length > 1 ? 's' : '') + '</span>' + chip + '</div></div>';
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
            pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true');
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
            focusDialog(pop);
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
            pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true');
            pop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;';
            const checkedText = lastNewEpisodesCheckAt ? 'Derniere verification : ' + lastNewEpisodesCheckAt.toLocaleTimeString().slice(0, 5) : 'Pas encore verifie';
            let html = '<div style="background:#15151f;color:#eee;max-width:720px;width:92%;max-height:80vh;overflow:auto;border-radius:8px;padding:20px;">' +
                '<h2 style="margin:0 0 4px;color:#03d0fc;font-size:16px;">Suivi - ' + siteObj.label + '</h2>' +
                '<div style="font-size:11px;color:#888;margin-bottom:12px;">' + entries.length + ' anime(s) suivi(s) &middot; ' + checkedText + '</div>' +
                '<table style="width:100%;border-collapse:collapse;font-size:12px;">' +
                '<tr style="text-align:left;color:#aaa;border-bottom:1px solid #333;"><th style="padding:6px 4px;">Anime</th><th style="padding:6px 4px;">Vu</th><th style="padding:6px 4px;">Dispo</th><th style="padding:6px 4px;">Dernier visionnage</th><th></th><th></th><th></th><th></th><th></th></tr>';
            const seasonDone = loadSeasonDone();
            const newSeasons = loadNewSeasons();
            const seasonDismissed = GM_getValue('seasonDismissed', {});
            entries.forEach((e) => {
                const nb = countNewEpisodesFor(e.key, e.episodeNumber);
                const waiting = !!seasonDone[e.key];
                const ignored = waiting && seasonDismissed[e.key];
                // Saison vue (anime-sama / animoflix / myfluneo), v6.50
                const curSeason = seasonOf(e.site === 'animoflix' ? e.episodeUrl : e.seriesUrl);
                const season = !newEpisodes[e.key] && newSeasons[e.key];
                const latest = latestKnownEpisode[e.key];
                const link = nb ? (season ? season.url : newEpisodes[e.key].url) : e.episodeUrl;
                const action = nb ? (season ? 'Regarder (' + season.label + ')' : 'Regarder (' + nb + ' nouveau' + (nb > 1 ? 'x' : '') + ')') : 'Reprendre';
                html += '<tr style="border-bottom:1px solid #222;' + (nb ? 'color:#ffb300;font-weight:bold;' : waiting ? 'color:#b07cff;' : '') + '">' +
                    '<td style="padding:6px 4px;" title="' + escapeHtml(e.seriesName) + '">' + escapeHtml(displayName(e.seriesName)) + (curSeason ? ' &middot; ' + escapeHtml(seasonLabel(curSeason.n)) : '') + (waiting ? ' <span style="font-size:10px;">(' + (ignored ? escapeHtml(seasonLabel(ignored)) + ' ignoree' : 'saison finie, en attente') + ')</span>' : '') + '</td>' +
                    '<td style="padding:6px 4px;">' + (e.episodeNumber || '?') + '</td>' +
                    '<td style="padding:6px 4px;">' + (latest || '?') + '</td>' +
                    '<td style="padding:6px 4px;font-weight:normal;color:#aaa;">' + (formatRelativeDays(e.watchedAt) || '') + '</td>' +
                    '<td style="padding:6px 4px;text-align:right;"><a href="' + escapeHtml(link) + '" style="color:' + (nb ? '#000;background:#ffb300' : '#fff;background:#333') + ';text-decoration:none;padding:4px 8px;border-radius:4px;white-space:nowrap;">' + action + '</a></td>' +
                    '<td style="padding:6px 2px;"><button class="ep-tracking-info" data-key="' + escapeHtml(e.key) + '" title="Fiche : synopsis, genres" style="background:none;border:1px solid #03d0fc;border-radius:4px;color:#03d0fc;cursor:pointer;font-size:12px;padding:2px 6px;">&#8505;</button></td>' +
                    '<td style="padding:6px 2px;">' + (nb && !season && latest && lastEpisodeUrlFor(e, latest) ? '<button class="ep-tracking-allseen" data-key="' + escapeHtml(e.key) + '" data-name="' + escapeHtml(displayName(e.seriesName)) + '" data-latest="' + escapeHtml(String(latest)) + '" title="Deja tout vu (jusqu\'a l\'ep. ' + escapeHtml(String(latest)) + ')" style="background:none;border:1px solid #4caf50;border-radius:4px;color:#4caf50;cursor:pointer;font-size:12px;padding:2px 6px;white-space:nowrap;">&#10003; Tout vu</button>' : '') + '</td>' +
                    '<td style="padding:6px 2px;"><button class="ep-tracking-wait" data-key="' + escapeHtml(e.key) + '" data-on="' + (waiting ? '0' : '1') + '" title="' + (ignored ? escapeHtml(seasonLabel(ignored)) + ' ignoree : cliquer pour la reproposer' : waiting ? 'Reprendre le suivi normal' : 'Saison finie : en attente de la suite (repasse en nouvel episode tout seul)') + '" style="background:' + (waiting ? '#b07cff;color:#000' : 'none;color:#b07cff') + ';border:1px solid #b07cff;border-radius:4px;cursor:pointer;font-size:12px;padding:2px 6px;">&#9208;</button></td>' +
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
            focusDialog(pop);
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
            pop.querySelectorAll('.ep-tracking-wait').forEach((btn) => btn.addEventListener('click', () => {
                const k = btn.getAttribute('data-key');
                const dismissed = GM_getValue('seasonDismissed', {});
                // Saison suivante ignoree : le clic la repropose (reste en attente,
                // la verification la retrouve et la signale).
                if (btn.getAttribute('data-on') === '0' && dismissed[k]) {
                    delete dismissed[k];
                    GM_setValue('seasonDismissed', dismissed);
                    checkForNewEpisodes();
                } else setSeasonDone(k, btn.getAttribute('data-on') === '1');
                buildPersistentPanel();
                refreshTrackingPopup();
                refreshThumbnailBadges();
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
            select.innerHTML = '<option value="">-- Mes séries --</option>';
            if (overlayEls.siteFilterSelect) overlayEls.siteFilterSelect.value = getSiteFilter();
            entries.forEach((e) => {
                const opt = document.createElement('option');
                opt.value = e.episodeUrl;
                opt.textContent = buildSeriesOptionLabel(e);
                if (currentEpisode && e.key === storageKey(currentEpisode)) opt.selected = true;
                if (isBehind(e.key)) { opt.style.color = '#ffb300'; opt.style.fontWeight = 'bold'; }
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
            toggleBtn.innerHTML = '<span id="ep-toggle-icon">' + (GM_getValue('panelHidden', false) === true ? '☰' : '✕') + '</span>' +
                '<span id="ep-toggle-badge" style="position:absolute;top:-6px;right:-6px;background:#ffb300;color:#000;font-size:10px;font-weight:bold;min-width:16px;height:16px;border-radius:8px;display:none;align-items:center;justify-content:center;padding:0 3px;line-height:1;"></span>';
            document.body.appendChild(toggleBtn);
            toggleBtn.addEventListener('click', () => {
                const panelEl = document.getElementById('ep-panel');
                if (!panelEl) return;
                const hidden = panelEl.style.display === 'none';
                panelEl.style.display = hidden ? '' : 'none';
                GM_setValue('panelHidden', !hidden);
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
                // v7.4 : position et taille seulement ; aspect et agencement dans css/.
                panel.style.cssText = 'position:fixed;top:104px;left:10px;z-index:999998;width:260px;max-height:calc(100vh - 120px);overflow-y:auto;';
                applyTheme(panel);
                if (GM_getValue('panelHidden', false) === true) panel.style.display = 'none';
                document.body.appendChild(panel);
            }

            const progress = loadProgress();
            const excluded = loadExcludedSeries();
            const entries = Object.keys(progress).map((k) => Object.assign({ key: k }, progress[k])).filter((e) => !excluded[e.key] && matchesSiteFilter(e.site)).sort(seriesSortCompare);

            const scriptVersion = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '6.0';
            const onEpisode = !!(currentEpisode && currentEpisode.seriesName);
            // Sous-sections (Avance, Personnaliser) : etat ouvert/ferme garde d'une reconstruction a l'autre.
            const prevOpen = {};
            panel.querySelectorAll('details[data-sec]').forEach((d) => { prevOpen[d.getAttribute('data-sec')] = d.open; });

            let html = '<header class="vc-head"><span class="vc-brand">Vidéo Continuum</span>' + versionButtonHtml('ep', scriptVersion) + '</header>';
            if (onEpisode) {
                const disp = getCurrentEpisodeDisplay();
                html += '<section class="vc-card vc-ep"><div class="vc-name" title="' + escapeHtml(disp.fullName) + '">' + escapeHtml(disp.name) + '</div>' +
                    '<div class="vc-epline"><div class="vc-epnum" style="color:' + disp.color + ';">' + disp.epText + '</div>' +
                    '<button id="ep-info-btn" class="vc-chip" title="Fiche de l\'anime : synopsis, genres, note...">&#8505; Fiche</button></div>' +
                    '<div class="vc-row vc-actions"><button id="ep-open-player" class="vc-main">&#9654; Regarder</button></div>' +
                    '<div id="ep-player-status" class="vc-status"></div></section>';
            }

            html += '<section class="vc-card vc-follow"><div class="vc-row">' + (onEpisode ? trackButtonHtml('ep-track-series', isSeriesTracked(storageKey(currentEpisode))) : '') +
                '<button id="ep-history-btn">&#128338; Historique</button></div>';
            if (entries.length === 0) {
                // v7.0 : le filtre de sites peut tout masquer : ne pas dire "aucun anime suivi" a tort.
                html += '<div class="vc-note">' + (Object.keys(progress).length ? 'Aucun anime avec ce filtre (liste en bas du panneau).' : 'Aucun anime suivi pour l\'instant : ouvre un épisode puis clique sur Suivre.') + '</div>';
            } else {
                html += '<select id="ep-select" class="vc-series" aria-label="Choisir un anime"><option value="">-- Mes séries --</option>';
                entries.forEach((e) => {
                    const label = buildSeriesOptionLabel(e);
                    const selected = currentEpisode && e.key === storageKey(currentEpisode) ? ' selected' : '';
                    const style = isBehind(e.key) ? ' class="vc-behind"' : '';
                    const since = formatRelativeDays(e.watchedAt);
                    const titleAttr = since ? ` title="${since}"` : '';
                    html += `<option value="${escapeHtml(e.episodeUrl)}"${selected}${style}${titleAttr}>${escapeHtml(label)}</option>`;
                });
                html += '</select>';
            }
            html += '<button id="ep-check-new">&#8635; Nouveaux épisodes</button>' + toggleButtonsHtml('ep-', isAutoNextEnabled(), isAutoOpenEnabled()) + '</section>';

            html += menusHtml([
                menuItem('reglages', 'Réglages',
                    '<div class="vc-row vc-wrap"><button id="ep-set-intro">Fin intro ici</button><button id="ep-set-outro">Début outro ici</button></div>' +
                    collapsibleSection('plus', 'Avancé',
                        groupLabel('Intro / outro') +
                        '<div class="vc-row"><button id="ep-set-introstart">Début intro</button><button id="ep-set-outroend">Fin outro</button></div>' +
                        '<button id="ep-settings-btn">Réglages par série</button>' +
                        groupLabel('Affichage') +
                        themeSelectHtml('ep-theme-select') + customizeHtml('ep', prevOpen.perso) +
                        '<label class="vc-track" title="Series deja en memoire grisees sur les pages du site (nettes au survol) : les nouveautes ressortent"><input type="checkbox" id="ep-dim-cb"' + (GM_getValue('dimTracked', false) === true ? ' checked' : '') + '><span class="off">Estomper les suivies</span><span class="on">&#10003; Estomper les suivies</span></label>' +
                        (entries.length ? groupLabel('Suivi') + '<button id="ep-delete-btn" class="vc-danger">Ne plus suivre la série choisie</button>' : ''),
                        prevOpen.plus, true)),
                onEpisode && menuItem('youtube', 'Sources',
                    (currentEpisode.site === 'esprit-donghua' ? '<button id="ep-open-odysee" title="Ouvre cet episode directement sur odysee.com dans un nouvel onglet (playlist/suivant-precedent geres la-bas independamment).">Ouvrir sur Odysee</button>' : '') +
                    '<div class="vc-row"><button id="ep-youtube-auto-btn" title="Cherche cet episode sur YouTube et propose les videos en vignettes (compilations : bon moment via les chapitres). La chaine choisie est retenue pour la suite.">YouTube</button>' +
                    '<button id="ep-youtube-off-btn" title="Revenir a la source du site">Source du site</button></div>'),
                menuItem('sauvegarde', 'Sauvegarde',
                    '<div class="vc-row"><button id="ep-export-panel">Exporter</button><button id="ep-import-panel">Importer</button></div>' +
                    '<button id="ep-choose-backup">Fichier de sauvegarde</button>' +
                    '<button id="ep-reauth-backup">Redonner l\'accès</button>' +
                    '<span id="ep-backup-status" class="vc-note"></span>' +
                    '<input type="file" id="ep-import-file" accept=".html,.htm" style="display:none;">'),
                newsSectionHtml(false, 'ep'), incidentSectionHtml('ep', false), legendSectionHtml(false)
            ]);
            html += '<footer class="vc-foot"><select id="ep-site-filter" title="Filtrer la liste des animes suivis par site">' + buildSiteFilterOptionsHtml() + '</select>' +
                '<div class="vc-summary">' + renderTrackingSummary() + '</div>' + siteLinksHtml() + openModeSelectHtml() + '</footer>';

            panel.innerHTML = html;
            bindMenus(panel, 'ep', onEpisode ? 'reglages' : '');
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
                checkForNewEpisodes().then(() => { checkNewBtn.disabled = false; checkNewBtn.textContent = '↻ Nouveaux épisodes'; });
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
            bindThemeSelect(panel, 'ep-theme-select');
            const dimCb = panel.querySelector('#ep-dim-cb');
            if (dimCb) dimCb.addEventListener('change', () => { GM_setValue('dimTracked', dimCb.checked); refreshThumbnailBadges(); });
            const versionBtn = panel.querySelector('#ep-version-btn');
            if (versionBtn) versionBtn.addEventListener('click', openScriptUpdatePage);
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
                    btn.setAttribute('role', 'button'); btn.tabIndex = 0;
                    btn.title = 'Fiche de l\'anime : synopsis, genres, note';
                    btn.textContent = '\u2139 Fiche';
                    btn.style.cssText = 'position:absolute;left:6px;bottom:6px;z-index:5;background:rgba(3,208,252,.9);color:#000;font:bold 11px Arial,sans-serif;padding:3px 7px;border-radius:4px;cursor:pointer;';
                    const name = a.getAttribute('title') || (card.querySelector('h1,h2,h3,.card-title') || {}).textContent || (card.querySelector('img') || {}).alt || '';
                    btn.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); openSeriesInfo({ site: 'anime-sama', seriesUrl: m[1], seriesName: thumbSeriesName(name), pageUrl: m[1] }); });
                    const host = card.querySelector('.card-image-container') || card;
                    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
                    host.appendChild(btn);
                });
            };
            addFicheButtons();
            let ficheTimer = null;
            new MutationObserver((muts) => {
                // v7.0 : ignorer nos propres boutons (sinon l'observer se relancait sur ses ajouts)
                if (muts.every((m) => Array.from(m.addedNodes).every((n) => n.nodeType === 1 && n.closest('.ep-fiche-btn,.ep-thumb-badge,.ep-thumb-frame,.ep-thumb-info')))) return;
                clearTimeout(ficheTimer); ficheTimer = setTimeout(addFicheButtons, 300);
            })
                .observe(document.body, { childList: true, subtree: true });
        }

        // Pastilles sur les vignettes (v6.40) : vert = suivi ici, turquoise =
        // suivi ici avec episode(s) en retard, jaune = suivi sur un autre site,
        // rouge = exclu du suivi. Reconnaissance par le nom (comme les doublons).
        // Couleurs/sens des icones (fonction : pas de TDZ, la legende du panneau
        // peut etre construite avant cette ligne).
        function badgeInfo(state) {
            return {
                ici: ['#2ecc40', 'Suivi sur ce site, a jour'],
                retard: ['#03d0fc', 'Suivi sur ce site, nouvel episode disponible'],
                attente: ['#b07cff', 'Saison finie, en attente de la suite'],
                ailleurs: ['#ffd400', 'Suivi sur un autre site'],
                exclu: ['#ff4136', 'Abandonne (exclu du suivi)'],
                naime: ['#ff851b', 'Pas aime (bouton dans la Fiche)'],
                vu: ['#c0c0c0', 'Deja vue avant le script (bouton dans la Fiche)']
            }[state];
        }
        // Icone liste a cases (style Flaticon "lister") : cases a la couleur de
        // l'etat, 1re cochee (croix si exclu, 3 cochees si saison finie), la
        // marque se trace (v6.41).
        function badgeSvg(state, px) {
            const c = badgeInfo(state)[0];
            const tick = (y) => 'M3.5 ' + (y + 2.2) + 'l1.2 1.2 2-2.4';
            const cross = (y) => 'M3.7 ' + (y + 1.2) + 'l2.6 2.6M6.3 ' + (y + 1.2) + 'L3.7 ' + (y + 3.8);
            const mark = state === 'exclu' ? cross(2) : state === 'naime' ? cross(2) + cross(9.5) + cross(17) : state === 'attente' || state === 'vu' ? tick(2.5) + tick(10) + tick(17.5) : tick(2.5);
            const row = (y) => '<rect x="2.5" y="' + y + '" width="5" height="5" rx=".8" stroke="' + c + '"/><rect x="10.5" y="' + (y + 1.1) + '" width="11" height="2.8" rx="1.4" stroke="#fff" stroke-width="1.3"/>';
            return '<svg width="' + px + '" height="' + px + '" viewBox="0 0 24 24" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
                row(2) + row(9.5) + row(17) +
                '<path d="' + mark + '" stroke="' + c + '" stroke-dasharray="30" stroke-dashoffset="30"><animate attributeName="stroke-dashoffset" from="30" to="0" dur=".6s" begin=".1s" fill="freeze"/></path></svg>';
        }
        function legendSectionHtml(open) {
            return menuItem('legende', 'Légende', ['ici', 'retard', 'attente', 'ailleurs', 'exclu', 'naime', 'vu'].map((st) =>
                '<div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#ddd;"><span style="display:inline-flex;background:rgba(10,10,18,.8);border-radius:4px;padding:2px;">' + badgeSvg(st, 18) + '</span>' + badgeInfo(st)[1] + '</div>').join('') +
                '<div style="font-size:10px;color:#888;">Pause &#9208; dans la fenetre de suivi d\'un site = saison finie.</div>', open);
        }
        function nameVariants(name) {
            const s = String(name || '').replace(/\s*[-:]?\s*(\b(s\d+\s*)?e\d+\b|(episode|épisode|ep\.?)\s*\d+).*$/i, '').replace(/\s*saison\s*\d+.*$/i, '');
            const inside = (s.match(/\(([^)]+)\)/) || [])[1];
            return [s, s.replace(/\([^)]*\)/g, ''), inside].map((n) => (n || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
                .replace(/\b(vostfr|vf)\b/g, '').replace(/[^a-z0-9]/g, '')).filter((n) => n.length >= 3);
        }
        // Nom de serie tire du titre d'une vignette (sans "S4 E113", "E263 END"...).
        function thumbSeriesName(t) {
            return String(t || '').replace(/\s*[-:]?\s*(\b(s\d+\s*)?e\d+\b|(episode|épisode|ep\.?)\s*\d+).*$/i, '').replace(/\s+/g, ' ').trim();
        }
        // Bouton "i" sur chaque vignette (v6.61) : fiche par-dessus la page, sans lancer l'episode.
        // Anime-Sama a deja le sien (.ep-fiche-btn). Esprit Donghua : "Ep N" en bas a gauche -> en bas a droite.
        function addThumbInfoButton(host, a, title) {
            if (site.id === 'anime-sama' || host.querySelector(':scope > .ep-thumb-info')) return;
            if (!/^https?:/.test(a.href) || new URL(a.href).pathname.length <= 1) return; // logo -> accueil
            const name = thumbSeriesName(title);
            if (name.length < 2) return;
            const btn = document.createElement('span');
            btn.className = 'ep-thumb-info';
            btn.setAttribute('role', 'button'); btn.tabIndex = 0;
            btn.title = 'Fiche : synopsis, genres, note';
            btn.setAttribute('aria-label', 'Fiche de ' + name);
            btn.textContent = 'ℹ Fiche';
            btn.style.cssText = 'position:absolute;bottom:6px;' + (site.id === 'animoflix' ? 'left:6px;' : 'right:6px;') + 'z-index:17;background:rgba(3,208,252,.92);color:#000;font:bold 11px Arial,sans-serif;padding:4px 7px;min-height:24px;box-sizing:border-box;border-radius:4px;cursor:pointer;display:flex;align-items:center;';
            btn.setAttribute('data-vc-name', name);
            if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
            host.appendChild(btn);
        }
        // Clic delegue (v6.62) : les carrousels (owl.carousel d'Esprit Donghua) clonent les vignettes sans
        // les ecouteurs -> le bouton d'une copie ouvrait la page de la serie. Capture : avant le lien et le site.
        document.addEventListener('click', (ev) => {
            const b = ev.target && ev.target.closest && ev.target.closest('.ep-thumb-info');
            if (!b) return;
            ev.preventDefault(); ev.stopPropagation();
            const a = b.closest('a[href]') || (b.parentElement && b.parentElement.querySelector('a[href]'));
            const url = a ? a.href : '';
            openSeriesInfo({ site: site.id, seriesUrl: url, seriesName: b.getAttribute('data-vc-name') || '', pageUrl: url });
        }, true);
        function refreshThumbnailBadges() {
            ensureVcStyles();
            document.documentElement.classList.toggle('vc-dim-tracked', GM_getValue('dimTracked', false) === true);
            const progress = loadProgress();
            const excluded = loadExcludedSeries();
            const rank = { exclu: 1, ailleurs: 2, ici: 3, retard: 3, attente: 3, naime: 4, vu: 0 };
            const seasonDone = loadSeasonDone();
            const newSeasons = loadNewSeasons();
            const byName = {};
            Object.keys(progress).forEach((k) => {
                const e = progress[k];
                const state = excluded[k] ? 'exclu' : e.site !== site.id ? 'ailleurs' : seasonDone[k] ? 'attente' : (newEpisodes[k] || newSeasons[k]) ? 'retard' : 'ici';
                nameVariants(e.seriesName).forEach((n) => { if (!byName[n] || rank[state] > rank[byName[n]]) byName[n] = state; });
            });
            // "Deja vu" seulement si rien d'autre (une serie reprise garde son etat de suivi) ; "Pas aime" passe devant tout.
            Object.values(loadNameMark('vu')).forEach((name) => nameVariants(name).forEach((n) => { if (!byName[n]) byName[n] = 'vu'; }));
            Object.values(loadNameMark('naime')).forEach((name) => nameVariants(name).forEach((n) => { byName[n] = 'naime'; }));
            document.querySelectorAll('a[href] img').forEach((img) => {
                const a = img.closest('a');
                if (a.closest('[id^="ep-"],[id^="ed-"]')) return;
                // Drapeau de langue / petite image dans le meme lien (animoflix :
                // 2e icone sur le drapeau, v6.47) -> seulement la vignette.
                if (img.closest('.badge') || (img.offsetWidth && img.offsetWidth < 60)) {
                    img.parentElement.querySelectorAll(':scope > .ep-thumb-badge, :scope > .ep-thumb-frame, :scope > .ep-thumb-info').forEach((n) => n.remove());
                    return;
                }
                const title = a.getAttribute('title') || img.getAttribute('alt') || (a.querySelector('h1,h2,h3,h4') || {}).textContent;
                const state = nameVariants(title).map((n) => byName[n]).filter(Boolean).sort((x, y) => rank[y] - rank[x])[0];
                const host = img.parentElement;
                addThumbInfoButton(host, a, title);
                let badge = host.querySelector(':scope > .ep-thumb-badge');
                let frame = host.querySelector(':scope > .ep-thumb-frame');
                if (!state) { if (badge) badge.remove(); if (frame) frame.remove(); img.removeAttribute('data-vc-st'); return; }
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'ep-thumb-badge';
                    // anime-sama / animoflix : etiquette "Anime" (z-index 15) en haut a gauche -> en bas a droite (v6.45-46)
                    badge.style.cssText = 'position:absolute;' + (site.id === 'anime-sama' || site.id === 'animoflix' ?'bottom:6px;right:6px;z-index:16;' : 'top:6px;left:6px;z-index:5;') + 'width:28px;height:28px;border-radius:5px;background:rgba(10,10,18,.85);box-shadow:0 1px 4px rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;pointer-events:auto;';
                    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
                    host.appendChild(badge);
                }
                // Cadre de couleur (v6.59, l'icone seule etait trop discrete) : calque a part,
                // il reste net quand l'option "Estomper les séries suivies" grise l'image.
                if (!frame) {
                    frame = document.createElement('span');
                    frame.className = 'ep-thumb-frame';
                    frame.style.cssText = 'position:absolute;inset:0;z-index:4;pointer-events:none;box-sizing:border-box;border-radius:3px;';
                    host.insertBefore(frame, badge);
                }
                if (badge.getAttribute('data-state') === state) return;
                badge.setAttribute('data-state', state);
                img.setAttribute('data-vc-st', state);
                frame.style.border = '5px solid ' + badgeInfo(state)[0];
                frame.style.boxShadow = '0 0 12px 1px ' + badgeInfo(state)[0];
                badge.innerHTML = badgeSvg(state, 22);
                badge.title = badgeInfo(state)[1];
            });
        }
        refreshThumbnailBadges();
        let badgeTimer = null;
        new MutationObserver((muts) => {
            if (muts.every((m) => Array.from(m.addedNodes).every((n) => n.nodeType === 1 && n.closest('.ep-thumb-badge,.ep-thumb-frame,.ep-thumb-info,.ep-fiche-btn')))) return;
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
        setInterval(() => { if (!document.hidden) checkForNewEpisodes(); }, 20 * 60 * 1000); // v7.0 : pas en onglet cache
        document.addEventListener('keydown', (ev) => {
            if (ev.key === 'Escape') {
                // v7.0 : la fenetre du dessus (la derniere dans le document), puis le lecteur.
                const top = Array.from(document.querySelectorAll('#ep-info-overlay, #ep-settings-overlay, #vc-history-overlay, #ep-tracking-overlay')).pop();
                if (top) { ev.preventDefault(); top.remove(); }
                else if (overlayEls && overlayEls.overlay.style.display !== 'none' && !document.fullscreenElement) { ev.preventDefault(); overlayEls.overlay.querySelector('#ed-close-btn').click(); }
            } else if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.matches && ev.target.matches('[data-yt], .ep-summary-line, .ep-fiche-btn, .ep-thumb-info')) {
                ev.preventDefault(); ev.target.click();
            }
        }, true);
        console.log('[AnimeTracker v6] initialisation terminee');
    }
})();
