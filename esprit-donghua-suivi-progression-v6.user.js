// ==UserScript==
// @name         Anime Tracker Continuum (v6)
// @namespace    esprit-donghua-tracker-v6
// @version      6.11
// @description  Suite de esprit-donghua-suivi-progression-v4 (v4 restait limite a esprit-donghua.xyz/Odysee) : meme principe (calque plein ecran, jamais recharge, iframe du lecteur natif pilotee par un second script injecte) mais etendu a 4 familles de sites - esprit-donghua.xyz (Odysee), animoflix.to (video.sibnet.ru), anime-sama.to (video.sibnet.ru) et odysee.com en navigation directe (playlist reconstruite via l'API publique Odysee) - avec UNE seule liste de suivi, groupee par site. Script independant de v4 (storage isole) : le fichier v4.36 reste intact sur le disque mais doit etre DESACTIVE dans Tampermonkey pour eviter un doublon de calque sur esprit-donghua.xyz.
// @match        https://esprit-donghua.xyz/*
// @match        https://odysee.com/*
// @match        https://animoflix.to/*
// @match        https://anime-sama.to/*
// @match        https://video.sibnet.ru/*
// @match        https://ansembed.net/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      esprit-donghua.xyz
// @connect      animoflix.to
// @connect      anime-sama.to
// @connect      api.na-backend.odysee.com
// @connect      www.googleapis.com
// @connect      script.google.com
// @connect      script.googleusercontent.com
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
//  - Pas de menu de qualite reperable sur Video.js/sibnet (une seule
//    source video fournie, contrairement au menu Reglages d'Odysee) - la
//    case "720p" reste dans l'interface mais n'a d'effet que pour les
//    episodes lus via Odysee (voir supportsQualityLock).
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

    // ================= Contexte : DANS l'iframe du lecteur =================
    if (!isTopFrame) {
        if (location.hostname.indexOf('odysee.com') !== -1) { runInsidePlayerFrame_odysee(); return; }
        if (location.hostname.indexOf('sibnet.ru') !== -1) { runInsidePlayerFrame_sibnet(); return; }
        if (location.hostname.indexOf('ansembed.net') !== -1) { runInsidePlayerFrame_ansembed(); return; }
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
                return;
            }
            sessionStorage.setItem(reloadKey, '1');
            console.log('[AnimeTracker v6] (' + cfg.label + ') video non demarree apres ' + Math.round(reloadWatchdogMs / 1000) + 's, rechargement automatique');
            location.reload();
        }, reloadWatchdogMs);

        function applyIntroSkipIfNeeded(video) {
            if (!config || !config.introEnd) return;
            if (video.currentTime < config.introEnd) {
                video.currentTime = config.introEnd;
                const p = video.play();
                if (p && p.catch) p.catch(() => {});
                console.log('[AnimeTracker v6] (' + cfg.label + ') intro sautee, demarrage a ' + config.introEnd + 's');
            }
        }

        // Uniquement Odysee (cf. cfg.supportsQualityLock) - voir v4 pour le
        // detail de la demarche (menu Reglages du lecteur natif).
        function tryLockQuality(attempt) {
            if (!cfg.supportsQualityLock) return;
            attempt = attempt || 1;
            const settingsBtn = document.querySelector('button.media-button--settings[aria-label="Réglages"]');
            if (!settingsBtn) {
                if (attempt < 10) { setTimeout(() => tryLockQuality(attempt + 1), 500); return; }
                console.log('[AnimeTracker v6] (' + cfg.label + ') bouton reglages introuvable, qualite non verrouillee');
                return;
            }
            settingsBtn.click();
            setTimeout(() => {
                const items = Array.from(document.querySelectorAll('.media-settings-menu__item'));
                const qualityItem = items.find((el) => {
                    const label = el.querySelector('.media-settings-menu__label');
                    return label && label.textContent.trim() === 'Qualité';
                });
                if (!qualityItem) { settingsBtn.click(); return; }
                qualityItem.click();
                setTimeout(() => {
                    const targetQuality = (config && config.preferredQuality) || '1080p';
                    const options = Array.from(document.querySelectorAll('.media-settings-menu__option'));
                    const target = options.find((el) => el.textContent.trim() === targetQuality);
                    if (target) target.click();
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                }, 200);
            }, 200);
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
            tryLockQuality();

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

            video.addEventListener('timeupdate', () => {
                if (!config || !config.outroStart || outroSignalSent) return;
                if (video.currentTime >= config.outroStart) {
                    outroSignalSent = true;
                    window.parent.postMessage({ type: MSG_PREFIX + 'outro-reached' }, '*');
                }
            });
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
            supportsQualityLock: true
        });
    }

    function runInsidePlayerFrame_sibnet() {
        runInsidePlayerFrameGeneric({
            label: 'Sibnet',
            playSelectors: ['.vjs-big-play-button', 'button.vjs-big-play-button'],
            supportsQualityLock: false,
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
    function runInsidePlayerFrame_ansembed() {
        runInsidePlayerFrameGeneric({
            label: 'Ansembed',
            playSelectors: ['.jw-icon-display', '.jw-display-icon-display'],
            supportsQualityLock: false
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
        return gmRequest({ method: 'GET', url: url }).then((res) => {
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

            if (!seriesUrl) return Promise.resolve(null);
            return Promise.resolve({
                site: this.id, siteLabel: this.label, siteTag: this.tag, playerOrigin: this.playerOrigin, navStyle: 'page',
                embedSrc: embedSrc, pageUrl: pageUrl, resumeUrl: pageUrl,
                seriesUrl: seriesUrl, seriesName: seriesName,
                episodeLabel: titleEl ? titleEl.textContent.trim() : null,
                episodeNumber: episodeMeta ? episodeMeta.getAttribute('content') : null,
                latestEpisodeNumber: latestEpisodeNumber, latestEpisodeUrl: latestEpisodeUrl,
                nextPageUrl: nextLink ? resolveUrl(nextLink, pageUrl) : null,
                prevPageUrl: prevLink ? resolveUrl(prevLink, pageUrl) : null
            });
        },
        buildEpisodeUrl(currentPageUrl, targetNumber) {
            const m = currentPageUrl.match(/^(.*-e)(\d+)(\/?)$/i);
            return m ? m[1] + targetNumber + m[3] : null;
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
            // v1 : uniquement l'hebergeur sibnet (demande explicite) - si cet
            // episode n'y est pas disponible (seulement ansembed/sendvid),
            // embedSrc reste null et l'appelant renonce a prendre le controle
            // (le lecteur natif du site continue de fonctionner normalement).
            const sibnetOption = Array.from(lecteurSelect.querySelectorAll('option')).find((o) => o.getAttribute('data-host') === 'video.sibnet.ru');
            const embedSrc = sibnetOption ? sibnetOption.getAttribute('value') : null;

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
                embedSrc: embedSrc, pageUrl: pageUrl, resumeUrl: pageUrl,
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

    const SITES = [SITE_ESPRIT_DONGHUA, SITE_ANIMOFLIX, SITE_ANIME_SAMA, SITE_ODYSEE];

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
    const CURRENT_SITE = detectSite();
    if (!CURRENT_SITE) return; // domaine matche par Tampermonkey mais pas une page qu'on sait gerer

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
        // Depannage manuel : quand un episode est casse/bloque sur son
        // hebergeur habituel, l'utilisateur peut coller un lien YouTube
        // pour CET episode precis. Pas de saut intro/outro ni d'enchainement
        // automatique sur cette source (YouTube n'est pas un domaine
        // pilote par notre script injecte dans l'iframe, contrairement a
        // Odysee/Sibnet) - juste un repli pour pouvoir regarder quand meme.
        function youtubeVideoIdFromUrl(url) {
            const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
            return m ? m[1] : null;
        }
        function youtubeOverrideKey(info) { return storageKey(info) + '::' + info.episodeNumber; }
        function loadYoutubeOverrides() { return GM_getValue('youtubeOverrides', {}); }
        function saveYoutubeOverrides(data) { GM_setValue('youtubeOverrides', data); }
        function getYoutubeOverrideUrl(info) { return info ? (loadYoutubeOverrides()[youtubeOverrideKey(info)] || null) : null; }
        function setYoutubeOverride(info, youtubeUrl) {
            const videoId = youtubeVideoIdFromUrl(youtubeUrl);
            if (!videoId) { alert('Lien YouTube non reconnu (attendu : youtube.com/watch?v=..., youtu.be/... ou .../embed/...).'); return false; }
            const all = loadYoutubeOverrides();
            all[youtubeOverrideKey(info)] = 'https://www.youtube.com/embed/' + videoId + '?autoplay=1';
            saveYoutubeOverrides(all);
            return true;
        }
        function clearYoutubeOverride(info) {
            const all = loadYoutubeOverrides();
            delete all[youtubeOverrideKey(info)];
            saveYoutubeOverrides(all);
        }

        // ---- Playlist YouTube automatique (par chaine associee) ----
        //
        // Complement au lien manuel ci-dessus : au lieu de chercher/coller
        // un lien par episode, on associe UNE FOIS une chaine YouTube +
        // un mot-cle (les titres de chaines comme celle de Tencent Video
        // melangent plein de series differentes, pas de structure fiable a
        // scraper - le mot-cle est fourni par l'utilisateur, plus simple et
        // plus fiable qu'une heuristique de prefixe comme pour Odysee vu la
        // variete des formats de titre). Necessite une cle API YouTube Data
        // v3 (gratuite, configurable via le menu Tampermonkey) - l'API
        // publique Odysee n'a pas d'equivalent chez YouTube.
        function getYoutubeApiKey() { return GM_getValue('youtubeApiKey', ''); }
        function setYoutubeApiKey(key) { GM_setValue('youtubeApiKey', key); }

        function youtubeApiRequest(path, params) {
            const apiKey = getYoutubeApiKey();
            if (!apiKey) return Promise.reject(new Error('Cle API YouTube non configuree (menu Tampermonkey > Configurer la cle API YouTube).'));
            const query = Object.assign({}, params, { key: apiKey });
            const qs = Object.keys(query).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(query[k])).join('&');
            return gmRequest({ method: 'GET', url: 'https://www.googleapis.com/youtube/v3/' + path + '?' + qs }).then((res) => {
                let parsed;
                try { parsed = JSON.parse(res.responseText); } catch (e) { throw new Error('Reponse API YouTube illisible (statut ' + res.status + ')'); }
                if (parsed.error) throw new Error('API YouTube : ' + parsed.error.message);
                return parsed;
            });
        }

        function normalizeYoutubeChannelHandle(input) {
            const trimmed = input.trim();
            const urlMatch = trimmed.match(/youtube\.com\/(@[\w.-]+)/i);
            if (urlMatch) return urlMatch[1];
            return trimmed.indexOf('@') === 0 ? trimmed : '@' + trimmed;
        }

        function resolveYoutubeUploadsPlaylistId(channelHandle) {
            return youtubeApiRequest('channels', { forHandle: channelHandle, part: 'contentDetails' }).then((data) => {
                const item = data.items && data.items[0];
                const uploadsId = item && item.contentDetails && item.contentDetails.relatedPlaylists && item.contentDetails.relatedPlaylists.uploads;
                if (!uploadsId) throw new Error('Chaine YouTube introuvable : ' + channelHandle);
                return uploadsId;
            });
        }

        // Pagine tant que la chaine a d'autres resultats - plafonne a 2000
        // videos par securite (playlistItems.list coute 1 unite de quota
        // par page de 50, largement sous la limite gratuite quotidienne).
        function fetchAllYoutubeUploads(uploadsPlaylistId) {
            function fetchPage(pageToken, acc) {
                const params = { playlistId: uploadsPlaylistId, part: 'snippet', maxResults: 50 };
                if (pageToken) params.pageToken = pageToken;
                return youtubeApiRequest('playlistItems', params).then((data) => {
                    const items = data.items || [];
                    const merged = acc.concat(items);
                    if (data.nextPageToken && merged.length < 2000) return fetchPage(data.nextPageToken, merged);
                    return merged;
                });
            }
            return fetchPage(null, []);
        }

        // Numero d'episode = dernier nombre trouve dans le titre - meme
        // heuristique que pour Odysee, marche sur "EP326" comme sur
        // "Episode 326".
        function guessYoutubeEpisodeNumber(title) {
            const matches = title.match(/\d+/g);
            return matches ? parseInt(matches[matches.length - 1], 10) : null;
        }

        function buildYoutubePlaylist(channelHandle, titleKeywordLower) {
            return resolveYoutubeUploadsPlaylistId(channelHandle).then((uploadsId) => fetchAllYoutubeUploads(uploadsId)).then((items) => {
                const entries = [];
                items.forEach((item) => {
                    const snippet = item.snippet || {};
                    const title = snippet.title || '';
                    if (title.toLowerCase().indexOf(titleKeywordLower) === -1) return;
                    const videoId = snippet.resourceId && snippet.resourceId.videoId;
                    if (!videoId) return;
                    const episodeNumber = guessYoutubeEpisodeNumber(title);
                    if (episodeNumber === null) return;
                    entries.push({ episodeNumber: episodeNumber, title: title, videoId: videoId });
                });
                entries.sort((a, b) => a.episodeNumber - b.episodeNumber);
                return entries;
            });
        }

        function youtubePlaylistCacheKey(channelHandle, titleKeywordLower) { return channelHandle + '::' + titleKeywordLower; }

        function getYoutubePlaylist(channelHandle, titleKeywordLower) {
            const cacheKey = youtubePlaylistCacheKey(channelHandle, titleKeywordLower);
            const all = GM_getValue('youtubePlaylists', {});
            const cached = all[cacheKey];
            if (cached && (Date.now() - cached.builtAt) < 60 * 60 * 1000) return Promise.resolve(cached.entries);
            return buildYoutubePlaylist(channelHandle, titleKeywordLower).then((entries) => {
                if (entries.length === 0 && cached) return cached.entries;
                const fresh = GM_getValue('youtubePlaylists', {});
                fresh[cacheKey] = { builtAt: Date.now(), entries: entries };
                GM_setValue('youtubePlaylists', fresh);
                return entries;
            }).catch((e) => {
                console.log('[AnimeTracker v6] (youtube) echec construction playlist', e);
                if (cached) return cached.entries;
                throw e;
            });
        }

        function getYoutubeChannelAssociation(info) {
            const all = GM_getValue('youtubeChannelAssociations', {});
            return info ? (all[storageKey(info)] || null) : null;
        }
        function setYoutubeChannelAssociation(info, channelHandle, titleKeyword) {
            const all = GM_getValue('youtubeChannelAssociations', {});
            all[storageKey(info)] = { channelHandle: channelHandle, titleKeyword: titleKeyword };
            GM_setValue('youtubeChannelAssociations', all);
        }

        // Action bouton "Trouver sur YouTube (chaine associee)" - demande
        // la chaine/le mot-cle une seule fois par serie (prompt()), puis
        // recherche l'episode courant dans la playlist (mise en cache) et
        // applique directement le lien trouve, sans copier-coller manuel.
        function useYoutubeAutoForCurrentEpisode() {
            if (!currentEpisode) { alert('Ouvre d\'abord un episode.'); return; }
            if (!getYoutubeApiKey()) {
                alert('Configure d\'abord une cle API YouTube (menu Tampermonkey > Configurer la cle API YouTube).');
                return;
            }
            let assoc = getYoutubeChannelAssociation(currentEpisode);
            if (!assoc) {
                const channelInput = prompt('Chaine YouTube (lien ou @handle) pour cette serie :');
                if (!channelInput) return;
                const keywordInput = prompt('Mot-cle a chercher dans les titres pour reconnaitre cette serie sur la chaine (ex: "Ten Thousand Worlds") :');
                if (!keywordInput) return;
                assoc = { channelHandle: normalizeYoutubeChannelHandle(channelInput), titleKeyword: keywordInput.trim() };
                setYoutubeChannelAssociation(currentEpisode, assoc.channelHandle, assoc.titleKeyword);
            }
            setStatus('Recherche sur YouTube...');
            getYoutubePlaylist(assoc.channelHandle, assoc.titleKeyword.toLowerCase()).then((entries) => {
                const match = entries.find((e) => e.episodeNumber === currentEpisode.episodeNumber);
                if (!match) { alert('Episode ' + currentEpisode.episodeNumber + ' introuvable sur ' + assoc.channelHandle + ' avec le mot-cle "' + assoc.titleKeyword + '".'); return; }
                const all = loadYoutubeOverrides();
                all[youtubeOverrideKey(currentEpisode)] = 'https://www.youtube.com/embed/' + match.videoId + '?autoplay=1';
                saveYoutubeOverrides(all);
                applyLoadedEpisode(currentEpisode, false);
            }).catch((e) => { alert('Erreur recherche YouTube : ' + e.message); setStatus('Erreur recherche YouTube'); });
        }

        function isAutoNextEnabled() { return GM_getValue('autoNextEnabled', true); }
        function setAutoNextEnabled(v) { GM_setValue('autoNextEnabled', v); }
        function isAutoOpenEnabled() { return GM_getValue('popupAutoOpen', true); }
        function setAutoOpenEnabled(v) { GM_setValue('popupAutoOpen', v); }
        function isLowQualityEnabled() { return GM_getValue('preferLowQuality720p', false); }
        function setLowQualityEnabled(v) { GM_setValue('preferLowQuality720p', v); }

        // Filtre "voir seulement ce site" partage entre le panneau et la
        // colonne du lecteur (un seul reglage, applique partout) - demande
        // par l'utilisateur pour naviguer les animes suivis site par site
        // maintenant que la liste est unifiee. 'all' = pas de filtre.
        function getSiteFilter() { return GM_getValue('panelSiteFilter', 'all'); }
        function setSiteFilter(v) { GM_setValue('panelSiteFilter', v); }
        function matchesSiteFilter(siteId) { const f = getSiteFilter(); return f === 'all' || f === siteId; }
        function buildSiteFilterOptionsHtml() {
            const current = getSiteFilter();
            const opt = (value, label) => '<option value="' + value + '"' + (current === value ? ' selected' : '') + '>' + label + '</option>';
            return opt('all', 'Tous les sites') + SITES.map((s) => opt(s.id, s.label)).join('');
        }

        function recordEpisodeProgress(info) {
            if (!info || !info.seriesUrl || !info.episodeNumber) return;
            const key = storageKey(info);
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
            progress[key] = {
                site: info.site, siteLabel: info.siteLabel, siteTag: info.siteTag,
                seriesName: info.seriesName, seriesUrl: info.seriesUrl,
                episodeLabel: info.episodeLabel, episodeNumber: info.episodeNumber,
                episodeUrl: info.resumeUrl,
                watchedAt: new Date().toISOString()
            };
            saveProgress(progress);
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
                JSON.stringify(entries).replace(/</g, '\\u003c') + '</' + 'script>';
            return '<!doctype html><html><head><meta charset="utf-8">' +
                '<meta name="viewport" content="width=device-width, initial-scale=1">' +
                '<title>Ma progression - Vidéo_Continuum</title>' +
                '<style>body{font-family:Arial,sans-serif;background:#0d0d12;color:#eee;padding:20px;} a{color:#03d0fc;} li{margin-bottom:12px;font-size:15px;} h2{color:#03d0fc;font-size:16px;border-bottom:1px solid #333;padding-bottom:4px;}</style>' +
                '</head><body><h1>Ma progression - Vidéo_Continuum</h1>' + items + dataBlock + '</body></html>';
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
                    alert('Import termine : ' + result.added + ' ajoutee(s), ' + result.updated + ' mise(s) a jour, ' + result.skipped + ' ignoree(s).');
                    buildPersistentPanel();
                } catch (e) { alert('Import impossible : ' + e.message); }
            };
            reader.onerror = () => alert('Impossible de lire ce fichier.');
            reader.readAsText(file);
        }

        // ---- Calque plein ecran ----

        let currentEpisode = null;
        let currentConfig = { introEnd: null, outroStart: null, autoNext: true, preferredQuality: '1080p' };
        let outroSignalSent = false;
        let advancingToNext = false;
        let cancelCountdown = null;
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

        function collapsibleSection(key, title, innerHtml, open) {
            return '<details data-sec="' + key + '"' + (open ? ' open' : '') + ' style="border-top:1px solid #2a2a35;padding-top:6px;">' +
                '<summary style="cursor:pointer;font-size:12px;font-weight:bold;color:#ccc;">' + title + '</summary>' +
                '<div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">' + innerHtml + '</div></details>';
        }

        // Endpoint Apps Script (google-apps-script/incidents-collector.gs).
        // Tant que l'URL n'est pas collee, repli sur une issue GitHub
        // pre-remplie (depot public). Le "secret" n'en est pas un (il est
        // dans ce script public) : il ecarte seulement les bots generiques,
        // le vrai garde-fou est le quota journalier cote serveur.
        const INCIDENTS_ENDPOINT_URL = 'https://script.google.com/macros/s/AKfycbyoNpSWs28TV9KktdTYw0EaYNI8jtNitXmaa_Ck9lBtn6du6O-8Gq88HGN1IhR-V1pD/exec';
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
                    playerStatus: statusEl ? statusEl.textContent : ''
                };
                if (INCIDENTS_ENDPOINT_URL.indexOf('PASTE_') === 0) {
                    const ctx = '\n\n---\nType : ' + report.type + '\nSite : ' + report.site + '\nAnime : ' + report.anime + ' (ep ' + report.episode + ')\nVersion : ' + report.version + '\nNavigateur : ' + report.browser + '\nPage : ' + report.page;
                    window.open('https://github.com/Tryne-graphik/Vid-os-continuum/issues/new?title=' + encodeURIComponent('[' + report.type + '] ' + report.anime) + '&body=' + encodeURIComponent(description + ctx), '_blank');
                    return;
                }
                sendBtn.disabled = true; sendBtn.textContent = 'Envoi...';
                gmRequest({ method: 'POST', url: INCIDENTS_ENDPOINT_URL, data: JSON.stringify(report), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, timeout: 20000 })
                    .then((res) => {
                        let ok = false;
                        try { ok = JSON.parse(res.responseText).status === 'ok'; } catch (e) {}
                        if (!ok) throw new Error('reponse serveur inattendue');
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
                '<div style="font-weight:bold;color:#03d0fc;font-size:13px;">Vidéo_Continuum</div>' +
                '<div style="font-size:10px;color:#888;margin-top:-6px;">v' + scriptVersion + '</div>' +
                '<div id="ed-current-name" style="font-size:13px;font-weight:bold;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></div>' +
                '<div id="ed-current-ep" style="font-size:12px;font-weight:bold;text-align:center;"></div>' +
                '<span id="ed-status" style="color:#ccc;font-size:11px;text-align:center;">En attente...</span>' +
                '<span id="ed-mute-indicator" style="color:#f66;display:none;font-size:11px;text-align:center;">Son coupe - clique dans le lecteur</span>' +
                '<select id="ed-site-filter" title="Filtrer la liste des animes suivis par site" style="' + SELECT + '">' + buildSiteFilterOptionsHtml() + '</select>' +
                '<div id="ed-tracking-summary" style="display:flex;flex-direction:column;gap:4px;"></div>' +
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
                (site.id === 'esprit-donghua' ? '<button id="ed-open-odysee-btn" title="Ouvre cet episode directement sur odysee.com dans un nouvel onglet (playlist/suivant-precedent geres la-bas independamment)." style="' + B + '">Ouvrir sur Odysee</button>' : '') +
                '<select id="ed-series-select" style="' + SELECT + 'font-family:Consolas,monospace;"><option value="">-- Changer de serie --</option></select>' +
                '<button id="ed-check-new-btn" style="' + BTN_STYLE + '">&#8635; Verifier les nouveaux episodes</button>' +
                '<label style="' + CHECK + '"><input type="checkbox" id="ed-autonext-cb"> Lecture continue</label>' +
                '<label style="' + CHECK + '"><input type="checkbox" id="ed-autoopen-cb"> Lecteur auto</label>' +
                '<label style="' + CHECK + '" title="Uniquement pour les episodes lus via Odysee (Esprit Donghua) pour l\'instant - un seul niveau de qualite disponible sur sibnet."><input type="checkbox" id="ed-lowquality-cb"> 720p (Esprit Donghua uniquement)</label>' +
                '<label style="' + CHECK + '"><input type="checkbox" id="ed-track-cb"> Suivre cet anime</label>' +
                collapsibleSection('reglages', 'Reglages',
                    '<button id="ed-set-intro-btn" style="' + B + '">Fin intro</button>' +
                    '<button id="ed-set-outro-btn" style="' + B + '">Debut outro</button>' +
                    '<button id="ed-settings-btn" style="' + B + '">Configuration</button>' +
                    '<button id="ed-reload-btn" style="' + B + '">&#8635; Recharger la page</button>' +
                    '<button id="ed-delete-btn" style="background:#5a1f1f;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;">Supprimer la serie selectionnee</button>') +
                collapsibleSection('youtube', 'Lien YouTube de secours',
                    '<input type="text" id="ed-youtube-input" placeholder="Lien YouTube de secours" style="width:100%;padding:6px;border-radius:4px;border:none;background:#000;color:#eee;font-size:11px;box-sizing:border-box;">' +
                    '<button id="ed-youtube-apply-btn" title="Utilise ce lien YouTube pour CET episode uniquement, si l\'hebergeur habituel est casse - pas de saut intro/outro ni d\'enchainement auto sur cette source." style="' + B + '">Utiliser ce lien YouTube</button>' +
                    '<button id="ed-youtube-clear-btn" style="' + B + '">Retirer le lien YouTube</button>' +
                    '<button id="ed-youtube-auto-btn" title="Recherche automatiquement cet episode sur une chaine YouTube associee (demande la chaine/le mot-cle la premiere fois) - necessite une cle API YouTube configuree." style="' + B + '">Trouver sur YouTube (chaine associee)</button>') +
                collapsibleSection('sauvegarde', 'Sauvegarde',
                    '<button id="ed-export-btn" style="' + B + '">Exporter</button>' +
                    '<button id="ed-import-btn" style="' + B + '">Importer</button>' +
                    '<input type="file" id="ed-import-file" accept=".html,.htm" style="display:none;">' +
                    '<button id="ed-choose-backup-btn" style="' + B + '">Choisir fichier sauvegarde</button>' +
                    '<button id="ed-reauth-backup-btn" style="' + B + '">Reautoriser l\'acces au fichier</button>' +
                    '<span id="ed-backup-status" style="color:#888;font-size:11px;"></span>') +
                incidentSectionHtml('ed', false) +
                '<button id="ed-check-update-btn" title="Ouvre la page d\'installation du script - Tampermonkey indique lui-meme si une mise a jour est disponible" style="' + B + '">&#128260; Verifier MAJ</button>';
            overlay.appendChild(topbar);

            toggleBtn.addEventListener('click', () => {
                const hidden = topbar.style.display === 'none';
                topbar.style.display = hidden ? 'flex' : 'none';
                toggleBtn.textContent = hidden ? '✕' : '☰';
            });

            const toast = document.createElement('div');
            toast.id = 'ed-toast';
            toast.style.cssText = 'position:absolute;bottom:30px;left:50%;transform:translateX(-50%);z-index:10;background:#15151f;color:#eee;padding:14px 20px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.6);font-family:Arial,sans-serif;display:none;align-items:center;gap:12px;';
            toast.innerHTML = '<span id="ed-toast-text">Episode suivant dans 3s...</span><button id="ed-toast-cancel" style="background:#333;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:13px;">Annuler</button>';
            overlay.appendChild(toast);

            document.body.appendChild(overlay);

            const currentNameEl = topbar.querySelector('#ed-current-name');
            const currentEpEl = topbar.querySelector('#ed-current-ep');
            const statusEl = topbar.querySelector('#ed-status');
            const muteIndicatorEl = topbar.querySelector('#ed-mute-indicator');
            const seriesSelectEl = topbar.querySelector('#ed-series-select');
            const siteFilterSelectEl = topbar.querySelector('#ed-site-filter');
            const autoNextCb = topbar.querySelector('#ed-autonext-cb');
            const autoOpenCb = topbar.querySelector('#ed-autoopen-cb');
            const lowQualityCb = topbar.querySelector('#ed-lowquality-cb');
            const trackCb = topbar.querySelector('#ed-track-cb');
            const backupStatusEl = topbar.querySelector('#ed-backup-status');

            topbar.querySelector('#ed-reload-btn').addEventListener('click', () => location.reload());
            topbar.querySelector('#ed-set-intro-btn').addEventListener('click', promptIntroEnd);
            topbar.querySelector('#ed-set-outro-btn').addEventListener('click', promptOutroStart);
            topbar.querySelector('#ed-settings-btn').addEventListener('click', openSettingsModal);
            topbar.querySelector('#ed-check-update-btn').addEventListener('click', openScriptUpdatePage);
            bindIncidentSection(topbar, 'ed');

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
            lowQualityCb.addEventListener('change', () => {
                setLowQualityEnabled(lowQualityCb.checked);
                if (currentEpisode) applyUpdatedConfigIfCurrent(storageKey(currentEpisode));
                buildPersistentPanel();
            });
            trackCb.addEventListener('change', () => {
                if (!currentEpisode) return;
                const key = storageKey(currentEpisode);
                setSeriesExcluded(key, !trackCb.checked);
                if (trackCb.checked) recordEpisodeProgress(currentEpisode);
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
                if (!currentEpisode || !hasNextEpisode(currentEpisode)) { alert('Aucun episode suivant detecte.'); return; }
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
            topbar.querySelector('#ed-youtube-apply-btn').addEventListener('click', () => {
                if (!currentEpisode) { alert('Ouvre d\'abord un episode.'); return; }
                const input = topbar.querySelector('#ed-youtube-input');
                if (!input.value.trim()) return;
                if (setYoutubeOverride(currentEpisode, input.value.trim())) {
                    input.value = '';
                    applyLoadedEpisode(currentEpisode, false);
                }
            });
            topbar.querySelector('#ed-youtube-clear-btn').addEventListener('click', () => {
                if (!currentEpisode) return;
                clearYoutubeOverride(currentEpisode);
                applyLoadedEpisode(currentEpisode, false);
            });
            topbar.querySelector('#ed-youtube-auto-btn').addEventListener('click', useYoutubeAutoForCurrentEpisode);
            toast.querySelector('#ed-toast-cancel').addEventListener('click', () => { if (cancelCountdown) cancelCountdown(); });

            overlayEls = {
                overlay: overlay, playerFrame: playerFrame, toast: toast, statusEl: statusEl, muteIndicatorEl: muteIndicatorEl,
                seriesSelect: seriesSelectEl, siteFilterSelect: siteFilterSelectEl, autoNextCb: autoNextCb, autoOpenCb: autoOpenCb, lowQualityCb: lowQualityCb, trackCb: trackCb,
                backupStatusEl: backupStatusEl, currentNameEl: currentNameEl, currentEpEl: currentEpEl
            };
            return overlayEls;
        }

        function hasNextEpisode(info) {
            if (info.navStyle === 'page') return !!info.nextPageUrl;
            return info.episodeIndex < info.totalEpisodes - 1;
        }
        function hasPrevEpisode(info) {
            if (info.navStyle === 'page') return !!info.prevPageUrl;
            return info.episodeIndex > 0;
        }

        function setStatus(text, warning) {
            if (overlayEls) {
                overlayEls.statusEl.textContent = text;
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
        function sendConfigToPlayerFrame() {
            postToPlayerFrame({ type: MSG_PREFIX + 'config', introEnd: currentConfig.introEnd, outroStart: currentConfig.outroStart, preferredQuality: currentConfig.preferredQuality });
        }

        // Origines autorisees pour les messages ENTRANTS du lecteur - le
        // vrai controle de securite reste event.source (voir plus bas), cet
        // ensemble n'est qu'un premier filtre rapide.
        const PLAYER_ORIGINS = new Set([PLAYER_ORIGIN_ODYSEE, PLAYER_ORIGIN_SIBNET, PLAYER_ORIGIN_ANSEMBED]);
        window.addEventListener('message', (event) => {
            if (!PLAYER_ORIGINS.has(event.origin)) return;
            if (!event.data || typeof event.data.type !== 'string' || event.data.type.indexOf(MSG_PREFIX) !== 0) return;
            if (!overlayEls || event.source !== overlayEls.playerFrame.contentWindow) return;
            const type = event.data.type.slice(MSG_PREFIX.length);

            if (type === 'ready') sendConfigToPlayerFrame();
            if (type === 'outro-reached') {
                if (outroSkipSuspended || outroSignalSent) return;
                outroSignalSent = true;
                triggerNextEpisode('debut outro configure');
            }
            if (type === 'ended') {
                if (outroSignalSent) return;
                outroSignalSent = true;
                triggerNextEpisode('fin reelle de la video');
            }
            if (type === 'mute-state' && overlayEls.muteIndicatorEl) overlayEls.muteIndicatorEl.style.display = event.data.muted ? 'block' : 'none';
            if (type === 'load-status') {
                if (event.data.stage === 'video-trouvee') setStatus('Chargement...');
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

        function applyRuntimeConfig(key) {
            const introOutro = getIntroOutroForKey(key);
            currentConfig = {
                introEnd: introOutro.introEnd || null,
                outroStart: introOutro.outroStart || null,
                autoNext: isAutoNextEnabled(),
                preferredQuality: isLowQualityEnabled() ? '720p' : '1080p'
            };
        }

        function triggerNextEpisode(reason) {
            if (!currentConfig.autoNext) return;
            if (!currentEpisode || !hasNextEpisode(currentEpisode)) { setStatus('Episode termine - pas de suivant detecte'); return; }
            showNextToast();
        }

        function showNextToast() {
            const { toast } = overlayEls;
            let seconds = 3, cancelled = false;
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
        }

        // Construit l'InfoUnifie de l'episode suivant SANS toucher au
        // reseau pour le style 'index' (deja tout charge pour la saison) -
        // sinon (style 'page') refetch la vraie page suivante, comme v4.
        function buildNextEpisodeInfo() {
            if (currentEpisode.navStyle === 'index') {
                const nextIndex = currentEpisode.episodeIndex + 1;
                const nextNumber = currentEpisode.episodeNumbersByIndex[nextIndex];
                return Promise.resolve(Object.assign({}, currentEpisode, {
                    embedSrc: currentEpisode.embedByIndex[nextIndex],
                    episodeIndex: nextIndex, episodeNumber: nextNumber, episodeLabel: 'Episode ' + nextNumber,
                    resumeUrl: currentEpisode.resumeUrlsByIndex[nextIndex]
                }));
            }
            const site = SITES.find((s) => s.id === currentEpisode.site);
            const nextPageUrl = currentEpisode.nextPageUrl;
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
                    embedSrc: currentEpisode.embedByIndex[prevIndex],
                    episodeIndex: prevIndex, episodeNumber: prevNumber, episodeLabel: 'Episode ' + prevNumber,
                    resumeUrl: currentEpisode.resumeUrlsByIndex[prevIndex]
                }));
            }
            const site = SITES.find((s) => s.id === currentEpisode.site);
            const prevPageUrl = currentEpisode.prevPageUrl;
            return fetchPageHtml(prevPageUrl).then((html) => {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                return site.extract(doc, prevPageUrl);
            });
        }

        function applyLoadedEpisode(info, pushHistory) {
            if (!info) throw new Error('episode introuvable ou aucun lecteur compatible pour cet episode');
            const youtubeOverride = getYoutubeOverrideUrl(info);
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
            applyRuntimeConfig(storageKey(info));
            outroSignalSent = false;
            overlayEls.playerFrame.src = youtubeOverride || info.embedSrc;
            if (youtubeOverride) {
                setStatus('Lecture via lien YouTube de secours - pas de saut intro/outro ni enchainement auto sur cette source.');
            } else {
                startBufferStallTracking();
                setStatus('Chargement...');
            }
            if (pushHistory) { try { history.pushState(null, '', info.resumeUrl); } catch (e) {} }
            buildPersistentPanel();
        }

        function advanceToNextEpisode() {
            if (advancingToNext) return;
            if (!currentEpisode || !hasNextEpisode(currentEpisode)) return;
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
            if (currentEpisode.navStyle === 'index') {
                // indexOf plutot que "targetNumber - 1" : la numerotation
                // peut avoir des trous (SITE_ODYSEE) ou la position dans le
                // tableau ne correspond pas au numero d'episode.
                const idx = currentEpisode.episodeNumbersByIndex.indexOf(targetNumber);
                if (idx === -1) { setStatus('Pas d\'episode ' + targetNumber + ' dans la playlist connue (total : ' + currentEpisode.totalEpisodes + ').'); return; }
                applyLoadedEpisode(Object.assign({}, currentEpisode, {
                    embedSrc: currentEpisode.embedByIndex[idx], episodeIndex: idx, episodeNumber: targetNumber, episodeLabel: 'Episode ' + targetNumber,
                    resumeUrl: currentEpisode.resumeUrlsByIndex[idx]
                }), true);
                return;
            }
            const site = SITES.find((s) => s.id === currentEpisode.site);
            const latest = latestKnownEpisode[storageKey(currentEpisode)];
            if (latest && targetNumber > Number(latest)) { setStatus('Pas d\'episode ' + targetNumber + ' (dernier connu : ' + latest + ').'); return; }
            const targetUrl = site.buildEpisodeUrl ? site.buildEpisodeUrl(currentEpisode.pageUrl, targetNumber) : null;
            if (!targetUrl) { setStatus('Impossible de deviner l\'URL de cet episode.'); return; }
            setStatus('Recherche de l\'episode ' + targetNumber + '...');
            fetchPageHtml(targetUrl).then((html) => {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                return site.extract(doc, targetUrl);
            }).then((info) => {
                if (!info) { setStatus('Episode ' + targetNumber + ' introuvable.'); return; }
                applyLoadedEpisode(info, true);
            }).catch((e) => {
                const serverError = /statut 5\d\d/.test((e && e.message) || '');
                setStatus(serverError ? 'Erreur serveur, reessaie dans un instant.' : 'Erreur : episode ' + targetNumber + ' introuvable.');
            });
        }

        function disableLiveVideoOnPage() {
            // esprit-donghua/animoflix : neutralise l'iframe native du
            // lecteur pour eviter un flux video en double sous notre calque.
            // anime-sama : le lecteur (#playerDF) est deja vide par defaut
            // (src="") tant que rien n'a ete choisi - rien a neutraliser.
            const iframe = document.getElementById('odysee-iframe') || document.querySelector('iframe[src*="odysee.com"]') || document.querySelector('#epVideoFrame');
            if (iframe && iframe.src && iframe.src !== 'about:blank') {
                iframe.src = 'about:blank';
                console.log('[AnimeTracker v6] lecteur natif de la page desactive (evite un flux video en double)');
            }
        }

        function startEpisode(infoPromise, reason) {
            Promise.resolve(infoPromise).then((info) => {
                if (!info) { console.log('[AnimeTracker v6] aucun episode detecte sur cette page'); return; }
                disableLiveVideoOnPage();
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
            if (!isAutoOpenEnabled()) return;
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

        function promptIntroEnd() {
            if (!currentEpisode) { alert('Ouvre d\'abord le lecteur sur un episode.'); return; }
            const key = storageKey(currentEpisode);
            const current = getIntroOutroForKey(key).introEnd;
            const input = prompt('Fin du generique de debut pour "' + currentEpisode.seriesName + '" (format mm:ss, ou ex. 0712 pour 7:12) :', formatTimecode(current));
            const seconds = parseTimecode(input);
            if (seconds === null) return;
            setIntroOutroForKey(key, { introEnd: seconds });
            applyUpdatedConfigIfCurrent(key);
        }
        function promptOutroStart() {
            if (!currentEpisode) { alert('Ouvre d\'abord le lecteur sur un episode.'); return; }
            const key = storageKey(currentEpisode);
            const current = getIntroOutroForKey(key).outroStart;
            const input = prompt('Debut du generique de fin pour "' + currentEpisode.seriesName + '" (format mm:ss, ou ex. 0712 pour 7:12) :', formatTimecode(current));
            const seconds = parseTimecode(input);
            if (seconds === null) return;
            setIntroOutroForKey(key, { outroStart: seconds });
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
                    '<th style="padding:6px 4px;">Fin intro</th><th style="padding:6px 4px;">Debut outro</th>' +
                    '<th style="padding:6px 4px;">Suivi</th></tr>';
                entries.forEach((e) => {
                    const io = getIntroOutroForKey(e.key);
                    const tracked = !isSeriesExcluded(e.key);
                    const unconfigured = !io.introEnd && !io.outroStart;
                    const rowStyle = unconfigured ? 'background:rgba(255,179,0,.08);' : '';
                    html += '<tr style="border-bottom:1px solid #222;' + rowStyle + '" data-key="' + e.key + '">' +
                        '<td style="padding:6px 4px;color:#888;">' + (e.siteTag || '') + '</td>' +
                        '<td style="padding:6px 4px;">' + (unconfigured ? '&#9888; ' : '') + escapeHtml(e.seriesName) + '</td>' +
                        '<td style="padding:6px 4px;"><input type="text" class="ep-set-intro-input" placeholder="mm:ss" style="width:70px;background:#000;color:#eee;border:1px solid #333;border-radius:4px;padding:3px;" value="' + formatTimecode(io.introEnd) + '"></td>' +
                        '<td style="padding:6px 4px;"><input type="text" class="ep-set-outro-input" placeholder="mm:ss" style="width:70px;background:#000;color:#eee;border:1px solid #333;border-radius:4px;padding:3px;" value="' + formatTimecode(io.outroStart) + '"></td>' +
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
                    const introSeconds = parseTimecode(row.querySelector('.ep-set-intro-input').value);
                    const outroSeconds = parseTimecode(row.querySelector('.ep-set-outro-input').value);
                    const tracked = row.querySelector('.ep-set-tracked-input').checked;
                    setIntroOutroForKey(key, { introEnd: introSeconds, outroStart: outroSeconds });
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
            if (el) el.textContent = text;
        }

        function checkForNewEpisodes() {
            const progress = loadProgress();
            const excluded = loadExcludedSeries();
            const entries = Object.keys(progress).map((k) => Object.assign({ key: k }, progress[k])).filter((e) => !excluded[e.key] && e.episodeUrl);
            let changed = false;
            const checks = entries.map((e) => {
                const site = SITES.find((s) => s.id === e.site);
                if (!site) return Promise.resolve();
                if (currentEpisode && storageKey(currentEpisode) === e.key) {
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
                return fetchPageHtml(e.episodeUrl).then((html) => {
                    const doc = new DOMParser().parseFromString(html, 'text/html');
                    return site.extract(doc, e.episodeUrl);
                }).then((info) => { if (info) applyResultFor(e, info, (c) => { if (c) changed = true; }); }).catch(() => {});
            });
            return Promise.all(checks).then(() => {
                const firstCheck = !lastNewEpisodesCheckAt;
                lastNewEpisodesCheckAt = new Date();
                if (changed || firstCheck) buildPersistentPanel();
                refreshTrackingPopup();
            });

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

        function renderTrackingSummary() {
            const bySite = getTrackedEntriesBySite();
            return SITES.filter((s) => bySite[s.id] && matchesSiteFilter(s.id)).map((s) => {
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
        }

        function bindTrackingSummary(container) {
            container.querySelectorAll('.ep-summary-line').forEach((el) => {
                el.addEventListener('click', () => openTrackingPopup(el.getAttribute('data-site')));
            });
        }

        let trackingPopupSite = null;
        function refreshTrackingPopup() {
            if (document.getElementById('ep-tracking-overlay')) openTrackingPopup(trackingPopupSite);
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
                '<tr style="text-align:left;color:#aaa;border-bottom:1px solid #333;"><th style="padding:6px 4px;">Anime</th><th style="padding:6px 4px;">Vu</th><th style="padding:6px 4px;">Dispo</th><th style="padding:6px 4px;">Dernier visionnage</th><th></th></tr>';
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
                    '<td style="padding:6px 4px;text-align:right;"><a href="' + escapeHtml(link) + '" style="color:' + (nb ? '#000;background:#ffb300' : '#fff;background:#333') + ';text-decoration:none;padding:4px 8px;border-radius:4px;white-space:nowrap;">' + action + '</a></td></tr>';
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
            // anime-sama : meme page, seule l'ancre #ep=N change - sans
            // rechargement le navigateur ne fait rien, on force donc.
            pop.querySelectorAll('a[href]').forEach((a) => a.addEventListener('click', (ev) => {
                if (a.href.replace(/#.*$/, '') !== location.href.replace(/#.*$/, '')) return;
                ev.preventDefault();
                location.href = a.href;
                location.reload();
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
            overlayEls.lowQualityCb.checked = isLowQualityEnabled();
            overlayEls.trackCb.checked = !!(currentEpisode && !isSeriesExcluded(storageKey(currentEpisode)));

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
            toggleBtn.style.cssText = 'position:fixed;top:10px;left:10px;z-index:999999;background:#15151f;color:#eee;border:none;border-radius:6px;width:34px;height:34px;cursor:pointer;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,.4);';
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
                panel.style.cssText = 'position:fixed;top:54px;left:10px;z-index:999998;background:#15151f;color:#eee;padding:12px;font-family:Arial,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.4);border-radius:8px;display:flex;flex-direction:column;gap:8px;width:260px;max-height:calc(100vh - 70px);overflow-y:auto;';
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

            let html = '<div style="font-weight:bold;color:#03d0fc;font-size:13px;">Vidéo_Continuum</div>';
            html += '<div style="font-size:10px;color:#888;margin-top:-6px;">v' + scriptVersion + '</div>';
            html += '<select id="ep-site-filter" title="Filtrer la liste des animes suivis par site" style="width:100%;padding:6px;border-radius:4px;border:none;background:#000;color:#eee;font-size:11px;">' +
                buildSiteFilterOptionsHtml() + '</select>';
            html += renderTrackingSummary();

            if (currentEpisode && currentEpisode.seriesName) {
                const disp = getCurrentEpisodeDisplay();
                html += '<div style="font-size:13px;font-weight:bold;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(disp.fullName) + '">' + escapeHtml(disp.name) + '</div>';
                html += '<div style="font-size:13px;font-weight:bold;color:' + disp.color + ';text-align:center;">' + disp.epText + '</div>';
                html += '<button id="ep-open-player" style="background:#03d0fc;color:#000;border:none;padding:7px 10px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold;">Ouvrir le lecteur</button>';
                html += '<span id="ep-player-status" style="font-size:11px;color:#ccc;"></span>';
                if (currentEpisode.site === 'esprit-donghua') {
                    html += '<button id="ep-open-odysee" title="Ouvre cet episode directement sur odysee.com dans un nouvel onglet (playlist/suivant-precedent geres la-bas independamment)." style="' + BTN_STYLE + '">Ouvrir sur Odysee</button>';
                }
                const trackedChecked = isSeriesExcluded(storageKey(currentEpisode)) ? '' : 'checked';
                html += '<label style="' + CHECK + '"><input type="checkbox" id="ep-track-series" ' + trackedChecked + '> Suivre cet anime</label>';
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
            html += '<label style="' + CHECK + '"><input type="checkbox" id="ep-autonext" ' + (isAutoNextEnabled() ? 'checked' : '') + '> Lecture continue</label>';
            html += '<label style="' + CHECK + '"><input type="checkbox" id="ep-autoopen" ' + (isAutoOpenEnabled() ? 'checked' : '') + '> Lecteur auto</label>';
            html += '<label style="' + CHECK + '" title="Uniquement pour Esprit Donghua/Odysee."><input type="checkbox" id="ep-lowquality" ' + (isLowQualityEnabled() ? 'checked' : '') + '> 720p (Esprit Donghua uniquement)</label>';

            html += collapsibleSection('reglages', 'Reglages',
                '<button id="ep-set-intro" style="' + BTN_STYLE + '">Fin intro</button>' +
                '<button id="ep-set-outro" style="' + BTN_STYLE + '">Debut outro</button>' +
                '<button id="ep-settings-btn" style="' + BTN_STYLE + '">Configuration</button>' +
                (entries.length ? '<button id="ep-delete-btn" style="background:#5a1f1f;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;">Supprimer la serie selectionnee</button>' : ''),
                prevOpen.reglages);
            if (currentEpisode && currentEpisode.seriesName) {
                html += collapsibleSection('youtube', 'Lien YouTube de secours',
                    '<input type="text" id="ep-youtube-input" placeholder="Lien YouTube de secours" style="width:100%;padding:6px;border-radius:4px;border:none;background:#000;color:#eee;font-size:11px;box-sizing:border-box;">' +
                    '<button id="ep-youtube-apply-btn" title="Utilise ce lien YouTube pour CET episode uniquement, si l\'hebergeur habituel est casse - pas de saut intro/outro ni d\'enchainement auto sur cette source." style="' + BTN_STYLE + '">Utiliser ce lien YouTube</button>' +
                    '<button id="ep-youtube-clear-btn" style="' + BTN_STYLE + '">Retirer le lien YouTube</button>' +
                    '<button id="ep-youtube-auto-btn" title="Recherche automatiquement cet episode sur une chaine YouTube associee (demande la chaine/le mot-cle la premiere fois) - necessite une cle API YouTube configuree." style="' + BTN_STYLE + '">Trouver sur YouTube (chaine associee)</button>',
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
            html += '<button id="ep-check-update-btn" title="Ouvre la page d\'installation du script - Tampermonkey indique lui-meme si une mise a jour est disponible" style="' + BTN_STYLE + '">&#128260; Verifier MAJ</button>';

            panel.innerHTML = html;

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

            const openPlayerBtn = panel.querySelector('#ep-open-player');
            if (openPlayerBtn) openPlayerBtn.addEventListener('click', () => startEpisode(getEpisodeInfoForCurrentPage(), 'clic manuel'));

            const openOdyseeBtn = panel.querySelector('#ep-open-odysee');
            if (openOdyseeBtn) openOdyseeBtn.addEventListener('click', openCurrentEpisodeOnOdysee);

            const youtubeApplyBtn = panel.querySelector('#ep-youtube-apply-btn');
            if (youtubeApplyBtn) youtubeApplyBtn.addEventListener('click', () => {
                if (!currentEpisode) { alert('Ouvre d\'abord un episode.'); return; }
                const input = panel.querySelector('#ep-youtube-input');
                if (!input.value.trim()) return;
                if (setYoutubeOverride(currentEpisode, input.value.trim())) {
                    input.value = '';
                    applyLoadedEpisode(currentEpisode, false);
                }
            });
            const youtubeClearBtn = panel.querySelector('#ep-youtube-clear-btn');
            if (youtubeClearBtn) youtubeClearBtn.addEventListener('click', () => {
                if (!currentEpisode) return;
                clearYoutubeOverride(currentEpisode);
                applyLoadedEpisode(currentEpisode, false);
            });
            const youtubeAutoBtn = panel.querySelector('#ep-youtube-auto-btn');
            if (youtubeAutoBtn) youtubeAutoBtn.addEventListener('click', useYoutubeAutoForCurrentEpisode);

            const autoNextCheckbox = panel.querySelector('#ep-autonext');
            if (autoNextCheckbox) autoNextCheckbox.addEventListener('change', () => {
                setAutoNextEnabled(autoNextCheckbox.checked);
                if (currentEpisode) applyUpdatedConfigIfCurrent(storageKey(currentEpisode));
            });
            const autoOpenCheckbox = panel.querySelector('#ep-autoopen');
            if (autoOpenCheckbox) autoOpenCheckbox.addEventListener('change', () => setAutoOpenEnabled(autoOpenCheckbox.checked));
            const lowQualityCheckbox = panel.querySelector('#ep-lowquality');
            if (lowQualityCheckbox) lowQualityCheckbox.addEventListener('change', () => {
                setLowQualityEnabled(lowQualityCheckbox.checked);
                if (currentEpisode) applyUpdatedConfigIfCurrent(storageKey(currentEpisode));
            });

            const setIntroBtn = panel.querySelector('#ep-set-intro');
            if (setIntroBtn) setIntroBtn.addEventListener('click', promptIntroEnd);
            const setOutroBtn = panel.querySelector('#ep-set-outro');
            if (setOutroBtn) setOutroBtn.addEventListener('click', promptOutroStart);
            const settingsBtn = panel.querySelector('#ep-settings-btn');
            if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);
            const checkUpdateBtn = panel.querySelector('#ep-check-update-btn');
            if (checkUpdateBtn) checkUpdateBtn.addEventListener('click', openScriptUpdatePage);

            const trackCheckbox = panel.querySelector('#ep-track-series');
            if (trackCheckbox && currentEpisode) {
                trackCheckbox.addEventListener('change', () => {
                    const key = storageKey(currentEpisode);
                    setSeriesExcluded(key, !trackCheckbox.checked);
                    if (trackCheckbox.checked) recordEpisodeProgress(currentEpisode);
                    buildPersistentPanel();
                });
            }

            if (overlayEls) updatePanelStatus(overlayEls.statusEl.textContent);
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
        GM_registerMenuCommand('Exporter en fichier', exportProgress);
        GM_registerMenuCommand('Choisir le fichier de sauvegarde', chooseBackupFile);
        GM_registerMenuCommand('Ouvrir le lecteur', () => startEpisode(getEpisodeInfoForCurrentPage(), 'commande menu'));
        GM_registerMenuCommand('Configurer la cle API YouTube', () => {
            const current = getYoutubeApiKey();
            const key = prompt('Cle API YouTube Data v3 (console.cloud.google.com > API et services > Identifiants) :', current);
            if (key !== null) setYoutubeApiKey(key.trim());
        });

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
