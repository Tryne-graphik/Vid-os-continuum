// ==UserScript==
// @name         Esprit Donghua Continuum
// @namespace    esprit-donghua-tracker-v4
// @version      4.36
// @description  Calque plein ecran affiche directement sur la page esprit-donghua.xyz (jamais dans une fenetre separee) qui embarque le vrai lecteur Odysee (natif, pas de contournement) et prend le controle de sa balise <video> via un second script injecte dans l'iframe (clic auto sur "lecture", saut d'intro, detection fin/outro, tentative de son). Le "changement d'episode" ne recharge jamais la page ni ne re-cree l'iframe : on change seulement son "src", donc plein ecran et son debloque restent actifs sans rien redemander. Sauvegarde de la progression reimportable (bouton "Importer"), et possibilite de lier un fichier unique (ex. dans le dossier du script) que chaque sauvegarde met a jour directement au lieu de telecharger un nouveau fichier a chaque fois. Script independant des v2.6/v3 (storage isole).
// @match        https://esprit-donghua.xyz/*
// @match        https://odysee.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @connect      esprit-donghua.xyz
// ==/UserScript==

// CONTEXTE / ETAT (2026-09-16) : approche nee d'une question de faisabilite
// (garder le plein ecran et le son continus en enchainant les episodes).
//
// v4.0 a v4.12 : plusieurs approches testees pour contourner le controle
// anti-hotlink d'Odysee (header Referer) afin de lire le fichier video brut
// nous-memes - telechargement complet en Blob (v4.1), puis tentative de
// streaming direct via une extension navigateur qui reecrit le Referer au
// niveau reseau (v4.12). Ces approches fonctionnaient mais se heurtaient a
// des limitations de debit (429) recurrentes cote CDN Odysee des qu'on
// telechargeait plusieurs gros fichiers rapprochés, et duplicaient un
// travail que le lecteur natif fait deja tres bien.
//
// v4.13 (PRINCIPE ACTUEL) : abandon complet du telechargement/contournement.
// A la place, on utilise le vrai lecteur Odysee (aucun hotlinking, aucune
// limitation de debit specifique a ce script) :
//   - Le calque plein ecran (meme principe que v4.1 : position:fixed, cree
//     une seule fois, jamais detruit) contient desormais une VRAIE iframe
//     Odysee (memes URLs d'embed que le site), pas un <video> maison.
//   - Comme cette iframe est cross-origin, on ne peut pas toucher a son
//     contenu depuis la page principale. Solution : ce meme script est
//     injecte une deuxieme fois PAR TAMPERMONKEY directement DANS l'iframe
//     (@match https://odysee.com/*), ou il a acces direct a la vraie balise
//     <video> (clic automatique sur le bouton "lecture" - necessaire pour
//     qu'elle apparaisse -, saut d'intro, detection du debut d'outro et de
//     la fin reelle, tentative de reactivation du son). Il communique avec
//     la page principale par postMessage (config recue, signaux envoyes).
//   - Le "changement d'episode" ne recharge JAMAIS la page ni ne recree
//     l'iframe : on change seulement son "src" vers l'embed du nouvel
//     episode. Comme le calque parent (celui qui est reellement en plein
//     ecran) ne change jamais de document, le plein ecran survit au
//     changement de "src" de son enfant sans rien redemander.
//   - Limite assumee (deja presente en v2.6/v3, inherente au web) : le son
//     ne peut jamais etre force par script sur une origine cross-origin
//     sans geste utilisateur reel. Un premier vrai clic DANS le lecteur
//     (ex: sur son propre bouton plein ecran ou play) le debloque un
//     episode donne ; a verifier en usage reel si ca "tient" episode apres
//     episode enchaine automatiquement (meme iframe reutilisee, jamais
//     recreee, donc bon espoir que oui).
//   - L'extension navigateur "odysee-referer-extension/" (creee pour la
//     v4.12) n'est plus necessaire au fonctionnement du lecteur, mais reste
//     dans le depot au cas ou.
//   - Une vraie navigation (clic sur un lien, retour arriere, choix dans le
//     selecteur d'anime suivi) recharge normalement la page et reinitialise
//     le script depuis zero, comme n'importe quelle page web classique.

(function () {
    'use strict';

    const PARENT_ORIGIN = 'https://esprit-donghua.xyz';
    const PLAYER_ORIGIN = 'https://odysee.com';
    const isTopFrame = (window.top === window.self);

    if (!isTopFrame && location.hostname.indexOf('odysee.com') !== -1) {
        runInsidePlayerFrame();
        return;
    }

    if (location.hostname.indexOf('esprit-donghua.xyz') === -1) return;

    if (!document.body) {
        document.addEventListener('DOMContentLoaded', main, { once: true });
    } else {
        main();
    }

    // ================= Contexte : iframe Odysee (lecteur natif) =================
    //
    // Tourne DANS l'iframe odysee.com de notre calque (cross-origin depuis
    // la page principale) - c'est le seul endroit ou on a un acces direct a
    // la vraie balise <video> du lecteur natif.
    function runInsidePlayerFrame() {
        console.log('[EspritDonghua v4] (iframe Odysee) script demarre');

        let config = null;
        let outroSignalSent = false;
        let videoFound = false;

        function findVideo() {
            return document.querySelector('video');
        }

        function waitForVideo(callback) {
            const existing = findVideo();
            if (existing) { videoFound = true; callback(existing); return; }
            const observer = new MutationObserver(() => {
                const v = findVideo();
                if (v) {
                    videoFound = true;
                    observer.disconnect();
                    callback(v);
                }
            });
            observer.observe(document.documentElement, { childList: true, subtree: true });
        }

        // Le lecteur Odysee n'insere la balise <video> qu'apres un clic sur
        // le gros bouton "lecture" central. Sans utilisateur pour cliquer
        // (changement d'episode automatique), rien ne se charge jamais : on
        // simule ce clic nous-memes.
        let autoClickAttempts = 0;
        const autoClickInterval = setInterval(() => {
            if (videoFound || autoClickAttempts > 20) { clearInterval(autoClickInterval); return; }
            autoClickAttempts++;
            const selectors = ['button.button--play', '.button--play', 'button[aria-label="Jouer "]', 'button[aria-label="Jouer"]', 'button[aria-label="Play"]'];
            for (let i = 0; i < selectors.length; i++) {
                const btn = document.querySelector(selectors[i]);
                if (btn) {
                    btn.click();
                    console.log('[EspritDonghua v4] (iframe Odysee) clic automatique sur le bouton lecture (' + selectors[i] + ')');
                    return;
                }
            }
        }, 500);

        // Si le lecteur reste bloque (ex: "Resoudre...") apres un
        // changement d'episode, on tente un rechargement unique de
        // l'iframe (protege par sessionStorage pour eviter une boucle).
        setTimeout(() => {
            if (videoFound) return;
            const reloadKey = 'espritdonghua-reload-' + location.href;
            if (sessionStorage.getItem(reloadKey)) {
                console.log('[EspritDonghua v4] (iframe Odysee) video toujours non chargee apres rechargement, abandon');
                return;
            }
            sessionStorage.setItem(reloadKey, '1');
            console.log('[EspritDonghua v4] (iframe Odysee) video non chargee apres 10s, rechargement automatique');
            location.reload();
        }, 10000);

        function applyIntroSkipIfNeeded(video) {
            if (!config || !config.introEnd) return;
            if (video.currentTime < config.introEnd) {
                video.currentTime = config.introEnd;
                const p = video.play();
                if (p && p.catch) p.catch(() => {});
                console.log('[EspritDonghua v4] (iframe Odysee) intro sautee, demarrage a ' + config.introEnd + 's');
            }
        }

        // Verrouille la qualite (1080p par defaut, 720p si l'utilisateur a
        // coche la case "720p" - cf. config.preferredQuality) en naviguant
        // dans le menu Reglages du lecteur natif : celui-ci adapte parfois
        // la resolution automatiquement (bande passante mesuree), ce qui
        // fait baisser la qualite en cours de route - selectionner une
        // resolution precise (au lieu d'"Auto") desactive cette adaptation
        // automatique. Selecteurs identifies via inspection reelle du DOM
        // (menu React, illisible par simple requete) - fragile si Odysee
        // change son interface, d'ou le repli silencieux en cas d'echec.
        function tryLockQuality(attempt) {
            attempt = attempt || 1;
            const settingsBtn = document.querySelector('button.media-button--settings[aria-label="Réglages"]');
            if (!settingsBtn) {
                if (attempt < 10) { setTimeout(() => tryLockQuality(attempt + 1), 500); return; }
                console.log('[EspritDonghua v4] (iframe Odysee) bouton reglages introuvable, qualite non verrouillee');
                return;
            }
            settingsBtn.click();
            setTimeout(() => {
                const items = Array.from(document.querySelectorAll('.media-settings-menu__item'));
                const qualityItem = items.find((el) => {
                    const label = el.querySelector('.media-settings-menu__label');
                    return label && label.textContent.trim() === 'Qualité';
                });
                if (!qualityItem) {
                    console.log('[EspritDonghua v4] (iframe Odysee) entree "Qualite" introuvable dans les reglages');
                    settingsBtn.click(); // referme le menu ouvert pour rien
                    return;
                }
                qualityItem.click();
                setTimeout(() => {
                    // Lu ici (pas au debut de la fonction) : la config
                    // arrive par postMessage depuis la page principale,
                    // quasi instantane mais pas forcement encore recue au
                    // moment ou waitForVideo() declenche ce premier appel -
                    // a ce stade (~400ms plus tard), elle l'est presque
                    // toujours.
                    const targetQuality = (config && config.preferredQuality) || '1080p';
                    const options = Array.from(document.querySelectorAll('.media-settings-menu__option'));
                    const target = options.find((el) => el.textContent.trim() === targetQuality);
                    if (target) {
                        target.click();
                        console.log('[EspritDonghua v4] (iframe Odysee) qualite verrouillee sur ' + targetQuality);
                    } else {
                        console.log('[EspritDonghua v4] (iframe Odysee) option ' + targetQuality + ' indisponible pour cet episode');
                    }
                    // Ferme le menu au cas ou il ne se refermerait pas tout
                    // seul apres la selection.
                    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
                }, 200);
            }, 200);
        }

        // Tentative (best-effort) de reactivation automatique du son.
        // Chrome bloque le son sans geste utilisateur reel sur CETTE
        // origine (odysee.com) ; sans ce geste il peut aussi mettre la
        // video en pause si on force muted=false - on la relance alors en
        // muet pour ne jamais rester bloque, meme si le son, lui, reste
        // coupe.
        let autoUnmuteAttempted = false;
        function tryAutoUnmute(video, force) {
            if (autoUnmuteAttempted && !force) return;
            autoUnmuteAttempted = true;
            let recovered = false;
            function recoverIfPaused() {
                if (recovered || !video.paused) return;
                recovered = true;
                console.log('[EspritDonghua v4] (iframe Odysee) Chrome a mis la video en pause suite a la tentative de son, remise en muet et relance de la lecture');
                try { video.muted = true; } catch (e) {}
                const p = video.play();
                if (p && p.catch) p.catch(() => {});
            }
            video.addEventListener('pause', recoverIfPaused);
            try { video.muted = false; } catch (e) {}
            setTimeout(() => {
                recoverIfPaused();
                video.removeEventListener('pause', recoverIfPaused);
            }, 1500);
        }

        // Un vrai clic de l'utilisateur A L'INTERIEUR du lecteur (seule
        // origine ou Chrome autorise un geste a debloquer le son de cette
        // frame) relance la tentative, quelle que soit la cible du clic
        // (bouton plein ecran natif d'Odysee, la video elle-meme, etc.).
        let lastRealUnmuteAttempt = 0;
        document.addEventListener('click', (e) => {
            if (!e.isTrusted) return; // ignore le clic simule sur "lecture"
            const video = findVideo();
            if (!video || !video.muted) return;
            const now = Date.now();
            if (now - lastRealUnmuteAttempt < 1000) return;
            lastRealUnmuteAttempt = now;
            console.log('[EspritDonghua v4] (iframe Odysee) vrai clic utilisateur detecte, nouvelle tentative de son');
            tryAutoUnmute(video, true);
        }, true);

        waitForVideo((video) => {
            console.log('[EspritDonghua v4] (iframe Odysee) element video trouve, envoi du signal pret');
            window.parent.postMessage({ type: 'espritdonghua-v4-ready' }, PARENT_ORIGIN);
            window.parent.postMessage({ type: 'espritdonghua-v4-load-status', stage: 'video-trouvee' }, PARENT_ORIGIN);

            if (config) applyIntroSkipIfNeeded(video);
            tryAutoUnmute(video);
            tryLockQuality();

            function reportMuteState() {
                window.parent.postMessage({ type: 'espritdonghua-v4-mute-state', muted: video.muted }, PARENT_ORIGIN);
            }
            reportMuteState();
            video.addEventListener('volumechange', reportMuteState);

            // Pourcentage charge en avance sur la lecture (buffer), pas un
            // vrai % de "telechargement total" comme avant (streaming
            // progressif : il ne faut pas tout charger pour jouer).
            video.addEventListener('progress', () => {
                if (video.duration && isFinite(video.duration) && video.buffered.length > 0) {
                    const bufferedEnd = video.buffered.end(video.buffered.length - 1);
                    const pct = Math.min(100, Math.round((bufferedEnd / video.duration) * 100));
                    window.parent.postMessage({ type: 'espritdonghua-v4-load-status', stage: 'buffering', pct: pct }, PARENT_ORIGIN);
                }
            });
            video.addEventListener('canplay', () => {
                window.parent.postMessage({ type: 'espritdonghua-v4-load-status', stage: 'pret' }, PARENT_ORIGIN);
            }, { once: true });

            video.addEventListener('timeupdate', () => {
                if (!config || !config.outroStart || outroSignalSent) return;
                if (video.currentTime >= config.outroStart) {
                    outroSignalSent = true;
                    console.log('[EspritDonghua v4] (iframe Odysee) debut generique de fin atteint, signal envoye');
                    window.parent.postMessage({ type: 'espritdonghua-v4-outro-reached' }, PARENT_ORIGIN);
                }
            });
            video.addEventListener('ended', () => {
                if (outroSignalSent) return;
                outroSignalSent = true;
                console.log('[EspritDonghua v4] (iframe Odysee) fin reelle de la video, signal envoye');
                window.parent.postMessage({ type: 'espritdonghua-v4-ended' }, PARENT_ORIGIN);
            });
        });

        window.addEventListener('message', (event) => {
            if (event.origin !== PARENT_ORIGIN) return;
            if (!event.data || !event.data.type) return;

            if (event.data.type === 'espritdonghua-v4-config') {
                config = event.data;
                outroSignalSent = false;
                console.log('[EspritDonghua v4] (iframe Odysee) config recue :', config);
                const video = findVideo();
                if (video) applyIntroSkipIfNeeded(video);
                if (video) tryAutoUnmute(video);
            }

            if (event.data.type === 'espritdonghua-v4-pause') {
                const video = findVideo();
                if (video) video.pause();
            }

            if (event.data.type === 'espritdonghua-v4-play') {
                const video = findVideo();
                if (video) {
                    const p = video.play();
                    if (p && p.catch) p.catch(() => {});
                }
            }
        });
    }

    // ================= Reseau / parsing (page principale) =================

    function gmRequest(details) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest(Object.assign({}, details, {
                onload: resolve,
                onerror: reject,
                ontimeout: reject
            }));
        });
    }

    // Une erreur 5xx du serveur (observee en usage reel, transitoire) faisait
    // jusque-la echouer directement "suivant"/"aller a l'episode N" avec un
    // message trompeur ("episode introuvable" alors que la page existe bien) -
    // une seule nouvelle tentative apres une courte pause absorbe ce cas sans
    // masquer une vraie erreur persistante (404 sur un numero qui n'existe pas
    // ne se resout jamais en retentant, donc pas de boucle infinie a craindre).
    function fetchPageHtml(url, retriesLeft) {
        if (retriesLeft === undefined) retriesLeft = 1;
        return gmRequest({ method: 'GET', url: url }).then((res) => {
            if (res.status >= 200 && res.status < 300) return res.responseText;
            if (res.status >= 500 && res.status < 600 && retriesLeft > 0) {
                console.log('[EspritDonghua v4] statut ' + res.status + ' sur ' + url + ', nouvelle tentative dans 1s');
                return new Promise((resolve) => setTimeout(resolve, 1000)).then(() => fetchPageHtml(url, retriesLeft - 1));
            }
            throw new Error('Chargement de la page echoue, statut ' + res.status);
        });
    }

    function extractOdyseeIframe(doc) {
        return doc.getElementById('odysee-iframe') || doc.querySelector('iframe[src*="odysee.com"]');
    }

    function resolveUrl(href, baseUrl) {
        try { return new URL(href, baseUrl).href; } catch (e) { return href; }
    }

    // "next"/"prev" partagent la meme structure de navigation
    // (.naveps.bignav) - seul le rel cible et l'extremite de la liste de
    // secours (.nvs) changent entre les deux sens.
    function extractAdjacentEpisodeUrlFromDoc(doc, baseUrl, rel, fallbackAtEnd) {
        let link = doc.querySelector('.naveps.bignav a[rel="' + rel + '"]');
        if (!link) {
            const navContainer = doc.querySelector('.naveps.bignav');
            if (navContainer) {
                const navItems = navContainer.querySelectorAll('.nvs');
                if (navItems.length > 0) link = navItems[fallbackAtEnd ? navItems.length - 1 : 0].querySelector('a[href]');
            }
        }
        if (!link) return null;
        const href = link.getAttribute('href');
        return href ? resolveUrl(href, baseUrl) : null;
    }

    function extractNextEpisodeUrlFromDoc(doc, baseUrl) {
        return extractAdjacentEpisodeUrlFromDoc(doc, baseUrl, 'next', true);
    }

    function extractPrevEpisodeUrlFromDoc(doc, baseUrl) {
        return extractAdjacentEpisodeUrlFromDoc(doc, baseUrl, 'prev', false);
    }

    function extractSeriesInfoFromDoc(doc, baseUrl) {
        const seriesLink = doc.querySelector('#singlepisode .headlist .det h2 a');
        if (!seriesLink) return null;
        return { url: seriesLink.getAttribute('href') ? resolveUrl(seriesLink.getAttribute('href'), baseUrl) : null, name: seriesLink.textContent.trim() };
    }

    function extractEpisodeMetaFromDoc(doc) {
        const episodeMeta = doc.querySelector('meta[itemprop="episodeNumber"]');
        const titleEl = doc.querySelector('h1.entry-title');
        if (!episodeMeta || !titleEl) return null;
        return { episodeNumber: episodeMeta.getAttribute('content'), episodeLabel: titleEl.textContent.trim() };
    }

    // Le numero du dernier episode publie pour la serie (utilise pour
    // afficher "vu X / dernier Y") est lu directement dans la colonne
    // #singlepisode .episodelist, toujours presente sur une page episode
    // et triee du plus recent au plus ancien - pas besoin d'appel reseau
    // supplementaire, cette colonne est deja dans le doc qu'on parse.
    function extractLatestEpisodeFromDoc(doc, baseUrl) {
        const firstLi = doc.querySelector('#singlepisode .episodelist li');
        if (!firstLi) return null;
        const link = firstLi.querySelector('a[href]');
        const span = firstLi.querySelector('.playinfo span');
        if (!link || !span) return null;
        const match = span.textContent.match(/Eps\s*(\d+)/i);
        if (!match) return null;
        return { number: match[1], url: resolveUrl(link.getAttribute('href'), baseUrl) };
    }

    function extractEpisodeInfoFromDoc(doc, pageUrl) {
        const iframe = extractOdyseeIframe(doc);
        const rawSrc = iframe ? iframe.getAttribute('src') : null;
        const embedSrc = rawSrc ? resolveUrl(rawSrc, pageUrl) : null;
        if (!embedSrc) return null;
        const series = extractSeriesInfoFromDoc(doc, pageUrl);
        const epMeta = extractEpisodeMetaFromDoc(doc);
        const latest = extractLatestEpisodeFromDoc(doc, pageUrl);
        return {
            embedSrc: embedSrc,
            pageUrl: pageUrl,
            nextPageUrl: extractNextEpisodeUrlFromDoc(doc, pageUrl),
            prevPageUrl: extractPrevEpisodeUrlFromDoc(doc, pageUrl),
            seriesUrl: series ? series.url : null,
            seriesName: series ? series.name : null,
            episodeLabel: epMeta ? epMeta.episodeLabel : null,
            episodeNumber: epMeta ? epMeta.episodeNumber : null,
            latestEpisodeNumber: latest ? latest.number : null,
            latestEpisodeUrl: latest ? latest.url : null
        };
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
        // Saisie rapide sans ":" (ex. "0712") : les 2 derniers chiffres
        // sont les secondes, le reste (s'il y en a) les minutes - donc
        // "0712" -> 7 min 12s, "45" -> 45s.
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

    // ================= Script principal (page principale) =================

    function main() {
        console.log('[EspritDonghua v4] script demarre');

        const STORE_KEY = 'progress';
        function loadProgress() { return GM_getValue(STORE_KEY, {}); }
        function saveProgress(data) { GM_setValue(STORE_KEY, data); }

        function loadExcludedSeries() { return GM_getValue('excludedSeries', {}); }
        function saveExcludedSeries(data) { GM_setValue('excludedSeries', data); }
        function isSeriesExcluded(seriesUrl) { return !!loadExcludedSeries()[seriesUrl]; }
        function setSeriesExcluded(seriesUrl, excluded) {
            const all = loadExcludedSeries();
            if (excluded) all[seriesUrl] = true; else delete all[seriesUrl];
            saveExcludedSeries(all);
        }

        function loadIntroOutro() { return GM_getValue('introOutro', {}); }
        function saveIntroOutro(data) { GM_setValue('introOutro', data); }
        function getIntroOutroForSeries(seriesUrl) { return loadIntroOutro()[seriesUrl] || {}; }
        function setIntroOutroForSeries(seriesUrl, patch) {
            const all = loadIntroOutro();
            all[seriesUrl] = Object.assign({}, all[seriesUrl], patch);
            saveIntroOutro(all);
        }

        function isAutoNextEnabled() { return GM_getValue('autoNextEnabled', true); }
        function setAutoNextEnabled(v) { GM_setValue('autoNextEnabled', v); }

        function isAutoOpenEnabled() { return GM_getValue('popupAutoOpen', true); }
        function setAutoOpenEnabled(v) { GM_setValue('popupAutoOpen', v); }

        function isLowQualityEnabled() { return GM_getValue('preferLowQuality720p', false); }
        function setLowQualityEnabled(v) { GM_setValue('preferLowQuality720p', v); }

        function recordEpisodeProgress(info) {
            if (!info || !info.seriesUrl || !info.episodeNumber) return;
            if (info.latestEpisodeNumber) latestKnownEpisode[info.seriesUrl] = info.latestEpisodeNumber;
            // Met a jour newEpisodes immediatement (meme logique que
            // checkForNewEpisodes pour la serie en cours) plutot que
            // d'attendre le prochain passage du minuteur (jusqu'a 8s au
            // chargement) - sinon la couleur du libelle courant reste au
            // vert "a jour" pendant quelques secondes meme quand un
            // episode plus recent est deja detectable sur la page.
            if (info.nextPageUrl) newEpisodes[info.seriesUrl] = { seriesName: info.seriesName, url: info.nextPageUrl };
            else delete newEpisodes[info.seriesUrl];
            if (isSeriesExcluded(info.seriesUrl)) return;
            const progress = loadProgress();
            // Une serie importee depuis un ancien export sans seriesUrl
            // connu est stockee sous une cle de secours "legacy:<nom>"
            // (cf. mergeImportedEntries). Des qu'on retrouve la vraie
            // seriesUrl en revisitant la serie sur le site, on supprime
            // cette entree de secours pour ne pas laisser un doublon
            // (ancienne entree figee + nouvelle a jour) dans les menus.
            const legacyKey = 'legacy:' + info.seriesName;
            if (legacyKey !== info.seriesUrl && progress[legacyKey]) delete progress[legacyKey];
            progress[info.seriesUrl] = {
                seriesName: info.seriesName,
                seriesUrl: info.seriesUrl,
                episodeLabel: info.episodeLabel,
                episodeNumber: info.episodeNumber,
                episodeUrl: info.pageUrl,
                watchedAt: new Date().toISOString()
            };
            saveProgress(progress);
        }

        // Suppression manuelle d'une entree suivie (contrairement a
        // isSeriesExcluded/setSeriesExcluded, qui masquent seulement une
        // serie sans jamais nettoyer le stockage) - utile pour retirer un
        // doublon ou une serie abandonnee. Identifiee par son episodeUrl
        // (valeur utilisee dans les <select> de serie).
        function deleteProgressEntryByEpisodeUrl(episodeUrl) {
            const progress = loadProgress();
            const key = Object.keys(progress).find((k) => progress[k].episodeUrl === episodeUrl);
            if (!key) return false;
            delete progress[key];
            saveProgress(progress);
            delete newEpisodes[key];
            return true;
        }

        function formatDate(iso) { return new Date(iso).toLocaleString('fr-FR'); }

        function buildHtml() {
            const progress = loadProgress();
            const excluded = loadExcludedSeries();
            const entries = Object.values(progress)
                .filter((e) => !excluded[e.seriesUrl])
                .sort((a, b) => a.seriesName.localeCompare(b.seriesName));
            let items;
            if (entries.length === 0) {
                items = '<p>Aucun anime suivi pour le moment.</p>';
            } else {
                items = '<ul>';
                entries.forEach((e) => {
                    items += '<li><strong>' + e.seriesName + '</strong> - ' + e.episodeLabel +
                        ' - <a href="' + e.episodeUrl + '">Reprendre ici</a>' +
                        ' <span style="color:#888;font-size:12px;">(' + formatDate(e.watchedAt) + ')</span></li>';
                });
                items += '</ul>';
            }
            // Bloc JSON cache, invisible a la lecture : donnees brutes
            // completes (seriesUrl/episodeNumber inclus) pour permettre une
            // reimportation fidele de ce meme fichier plus tard. Les anciens
            // exports (sans ce bloc) restent importables via un repli qui
            // relit la liste HTML lisible (cf. parseProgressBackup).
            const dataBlock = '<script type="application/json" id="ed-progress-backup">' +
                JSON.stringify(entries).replace(/</g, '\\u003c') + '</' + 'script>';
            return '<!doctype html><html><head><meta charset="utf-8">' +
                '<meta name="viewport" content="width=device-width, initial-scale=1">' +
                '<title>Ma progression - Esprit Donghua</title>' +
                '<style>body{font-family:Arial,sans-serif;background:#0d0d12;color:#eee;padding:20px;} a{color:#03d0fc;} li{margin-bottom:12px;font-size:15px;}</style>' +
                '</head><body><h1>Ma progression - Esprit Donghua</h1>' + items + dataBlock + '</body></html>';
        }

        function downloadHtml(filename) {
            const blob = new Blob([buildHtml()], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
        }

        // ---- Fichier de sauvegarde unique (File System Access API) ----
        //
        // Par defaut (ou si le navigateur ne supporte pas cette API, ex.
        // Firefox), on retombe sur un telechargement classique nomme sans
        // date - mais Chrome renomme quand meme en double ("(1)", "(2)"...)
        // s'il trouve deja un fichier du meme nom dans le dossier de
        // telechargement et que "Demander ou enregistrer chaque fichier"
        // est desactive : c'est exactement ce qui a ete observe dans
        // Downloads. Le bouton "Choisir le fichier de sauvegarde" permet a
        // l'utilisateur de designer UNE FOIS un fichier precis (ex. dans le
        // meme dossier que le script) ; toutes les sauvegardes suivantes
        // (manuelles ou auto) ecrivent alors directement dedans (vraie
        // mise a jour du meme fichier, plus de doublons).

        // Tampermonkey execute ce script dans un environnement "sandbox"
        // (actif des qu'un @grant specifique est declare) : "window" y est
        // un proxy, pas le vrai objet window de la page. Certaines methodes
        // natives (showSaveFilePicker, indexedDB.open...) verifient en
        // interne que "this" est exactement le vrai objet et echouent avec
        // "Illegal invocation" quand on les appelle via ce proxy.
        // "unsafeWindow" (toujours accessible sans @grant supplementaire
        // sous Tampermonkey) donne acces au vrai objet window de la page.
        const realWindow = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

        function isFileSystemAccessSupported() {
            return typeof realWindow.showSaveFilePicker === 'function';
        }

        function idbOpen() {
            return new Promise((resolve, reject) => {
                const req = realWindow.indexedDB.open('espritDonghuaV4', 1);
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
        let backupFileReady = false; // true une fois la lecture initiale d'IndexedDB terminee

        function updateBackupStatusUi() {
            const text = backupFileHandle
                ? ('Sauvegarde liee : ' + backupFileHandle.name)
                : 'Sauvegarde : telechargement classique';
            const el = document.getElementById('ep-backup-status');
            if (el) el.textContent = text;
            if (overlayEls && overlayEls.backupStatusEl) overlayEls.backupStatusEl.textContent = text;
        }

        function loadBackupFileHandle() {
            if (!isFileSystemAccessSupported()) { backupFileReady = true; return Promise.resolve(); }
            return idbGetHandle('backupFile').then((handle) => {
                backupFileHandle = handle || null;
                backupFileReady = true;
                updateBackupStatusUi();
            }).catch((e) => {
                console.log('[EspritDonghua v4] impossible de relire le fichier de sauvegarde lie', e);
                backupFileReady = true;
            });
        }

        function chooseBackupFile() {
            if (!isFileSystemAccessSupported()) {
                alert('Ton navigateur ne supporte pas la sauvegarde directe dans un dossier (File System Access API, dispo sur Chrome/Edge) - reste sur le telechargement classique.');
                return;
            }
            realWindow.showSaveFilePicker({
                suggestedName: 'ma-progression-donghua.html',
                types: [{ description: 'Page HTML', accept: { 'text/html': ['.html'] } }]
            }).then((handle) => {
                backupFileHandle = handle;
                return idbSetHandle('backupFile', handle);
            }).then(() => {
                updateBackupStatusUi();
                return writeBackupFile();
            }).catch((e) => {
                if (e && e.name === 'AbortError') return; // annule par l'utilisateur
                console.log('[EspritDonghua v4] echec de selection du fichier de sauvegarde', e);
                alert('Impossible de configurer le fichier de sauvegarde : ' + e.message);
            });
        }

        function ensureBackupPermission(handle) {
            return handle.queryPermission({ mode: 'readwrite' }).then((state) => {
                if (state === 'granted') return true;
                return handle.requestPermission({ mode: 'readwrite' }).then((res) => res === 'granted');
            });
        }

        // Chrome redemande parfois la permission readwrite sur le fichier
        // lie apres un redemarrage du navigateur (queryPermission repasse a
        // "prompt"). requestPermission() exige un vrai geste utilisateur
        // pour aboutir - ce bouton fournit ce geste sans obliger a rouvrir
        // tout le selecteur de fichier (chooseBackupFile), qui redesignerait
        // un fichier au lieu de simplement reautoriser celui deja lie.
        function reauthorizeBackupFile() {
            if (!backupFileHandle) {
                alert('Aucun fichier de sauvegarde lie pour le moment - utilise "Choisir fichier sauvegarde" d\'abord.');
                return;
            }
            ensureBackupPermission(backupFileHandle).then((ok) => {
                if (ok) alert('Acces reautorise pour "' + backupFileHandle.name + '".');
                else alert('Permission refusee - la sauvegarde retombera sur un telechargement classique.');
                updateBackupStatusUi();
            }).catch((e) => {
                console.log('[EspritDonghua v4] echec de reautorisation du fichier de sauvegarde', e);
                alert('Impossible de reautoriser : ' + e.message);
            });
        }

        function writeBackupFile() {
            if (!backupFileHandle) return Promise.resolve(false);
            return ensureBackupPermission(backupFileHandle).then((ok) => {
                if (!ok) throw new Error('permission refusee');
                return backupFileHandle.createWritable();
            }).then((writable) => writable.write(buildHtml()).then(() => writable.close())).then(() => {
                console.log('[EspritDonghua v4] sauvegarde ecrite dans le fichier lie');
                return true;
            }).catch((e) => {
                console.log('[EspritDonghua v4] echec ecriture dans le fichier de sauvegarde lie, repli sur telechargement', e);
                return false;
            });
        }

        // Sauvegarde effective : ecrit dans le fichier lie s'il est
        // configure et accessible, sinon telecharge un fichier classique.
        function saveProgressBackup() {
            return writeBackupFile().then((wrote) => { if (!wrote) downloadHtml('ma-progression-donghua.html'); });
        }

        function exportProgress() { saveProgressBackup(); }

        function maybeAutoExport() {
            const progress = loadProgress();
            if (Object.keys(progress).length === 0) return;
            const today = new Date().toISOString().slice(0, 10);
            const lastAutoExport = GM_getValue('lastAutoExport', null);
            if (lastAutoExport === today) return;
            saveProgressBackup();
            GM_setValue('lastAutoExport', today);
        }

        // ---- Import d'une sauvegarde ----
        //
        // Comprend deux formats : les exports recents (avec le bloc JSON
        // cache ci-dessus, fidelite complete y compris seriesUrl) et les
        // anciens exports (v2.6, ou v4 avant ce bloc JSON) qui ne
        // contiennent que la liste HTML lisible - dans ce cas seriesUrl est
        // inconnu et une cle de secours ("legacy:<nom de la serie>") est
        // utilisee pour la stocker quand meme.

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
                } catch (e) {
                    console.log('[EspritDonghua v4] bloc JSON illisible dans le fichier importe, repli sur le parsing HTML', e);
                }
            }
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
                    seriesName: seriesName,
                    episodeLabel: episodeLabel,
                    episodeUrl: link.getAttribute('href'),
                    seriesUrl: null,
                    episodeNumber: null,
                    watchedAt: dateSpan ? parseFrenchDateToIso(dateSpan.textContent) : null
                };
            }).filter(Boolean);
        }

        // Fusionne avec la progression existante : une entree importee plus
        // ancienne qu'une entree deja enregistree pour la meme serie
        // (identifiee par seriesUrl si connu, sinon par nom) est ignoree
        // pour ne jamais faire regresser un suivi deja a jour.
        function mergeImportedEntries(entries) {
            const progress = loadProgress();
            const bySeriesName = {};
            Object.keys(progress).forEach((key) => { bySeriesName[progress[key].seriesName] = key; });
            let added = 0, updated = 0, skipped = 0;
            entries.forEach((e) => {
                if (!e || !e.seriesName || !e.episodeUrl) return;
                const existingKey = (e.seriesUrl && progress[e.seriesUrl]) ? e.seriesUrl : bySeriesName[e.seriesName];
                if (existingKey) {
                    const existing = progress[existingKey];
                    if (existing.watchedAt && e.watchedAt && new Date(existing.watchedAt) >= new Date(e.watchedAt)) {
                        skipped++;
                        return;
                    }
                    progress[existingKey] = Object.assign({}, existing, e, { seriesUrl: existing.seriesUrl });
                    updated++;
                } else {
                    const key = e.seriesUrl || ('legacy:' + e.seriesName);
                    progress[key] = Object.assign({}, e, { seriesUrl: key });
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
                    alert('Import termine : ' + result.added + ' serie(s) ajoutee(s), ' + result.updated + ' mise(s) a jour, ' + result.skipped + ' ignoree(s) (deja plus recentes).');
                    buildPersistentPanel();
                } catch (e) {
                    console.log('[EspritDonghua v4] echec import', e);
                    alert('Import impossible : ' + e.message);
                }
            };
            reader.onerror = () => alert('Impossible de lire ce fichier.');
            reader.readAsText(file);
        }

        // ---- Calque plein ecran (lecteur) ----

        let currentEpisode = null;
        let currentConfig = { introEnd: null, outroStart: null, autoNext: true, preferredQuality: '1080p' };
        let outroSignalSent = false;
        let advancingToNext = false; // evite un double declenchement concurrent (toast + clic manuel sur "Suivant")
        let cancelCountdown = null;
        let overlayEls = null;
        let outroSkipSuspended = false; // suspendu par le bouton "Precedent", reactive par "Suivant"
        let newEpisodes = {}; // seriesUrl -> { seriesName, url } si un episode plus recent que le suivi existe deja sur le site
        let latestKnownEpisode = {}; // seriesUrl -> numero du dernier episode publie connu (pour l'affichage "vu X / dernier Y")

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

            // Bouton toujours visible (independant de la colonne, jamais
            // masque) qui replie/deplie toute la colonne de commandes -
            // utile en plein ecran une fois qu'on a regle ce qu'on voulait,
            // pour ne plus obstruer la video.
            const toggleBtn = document.createElement('button');
            toggleBtn.id = 'ed-toggle-btn';
            toggleBtn.type = 'button';
            toggleBtn.title = 'Afficher/masquer les commandes';
            toggleBtn.textContent = '☰';
            toggleBtn.style.cssText = 'position:absolute;top:10px;left:10px;z-index:11;background:rgba(0,0,0,.6);color:#eee;border:none;border-radius:4px;width:32px;height:32px;cursor:pointer;font-size:16px;';
            overlay.appendChild(toggleBtn);

            const topbar = document.createElement('div');
            topbar.style.cssText = 'position:absolute;top:52px;left:10px;z-index:10;display:flex;flex-direction:column;gap:5px;background:rgba(0,0,0,.6);padding:10px;border-radius:8px;font-family:Arial,sans-serif;color:#eee;font-size:12px;max-width:210px;max-height:calc(100vh - 70px);overflow-y:auto;';
            topbar.innerHTML =
                '<div id="ed-current-name" style="font-size:16px;font-weight:bold;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></div>' +
                '<div id="ed-current-ep" style="font-size:12px;font-weight:bold;text-align:center;"></div>' +
                '<div id="ed-new-episodes"></div>' +
                '<button id="ed-fullscreen-btn" style="background:#03d0fc;color:#000;border:none;padding:7px 10px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;">Plein ecran</button>' +
                '<button id="ed-close-btn" style="background:#333;color:#fff;border:none;padding:7px 10px;border-radius:4px;cursor:pointer;font-size:12px;">Fermer</button>' +
                '<button id="ed-prev-btn" style="background:#333;color:#fff;border:none;padding:7px 10px;border-radius:4px;cursor:pointer;font-size:12px;">&#9664; Precedent</button>' +
                '<button id="ed-next-btn" style="background:#333;color:#fff;border:none;padding:7px 10px;border-radius:4px;cursor:pointer;font-size:12px;">Suivant &#9654;</button>' +
                '<div style="display:flex;gap:4px;">' +
                '<input type="number" id="ed-goto-input" min="1" placeholder="N&#176; episode" style="width:0;flex:1;padding:6px;border-radius:4px;border:none;background:#000;color:#eee;font-size:12px;">' +
                '<button id="ed-goto-btn" style="background:#333;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:12px;">Aller</button>' +
                '</div>' +
                '<button id="ed-reload-btn" style="background:#333;color:#fff;border:none;padding:7px 10px;border-radius:4px;cursor:pointer;font-size:12px;" title="Recharge completement la page (si le lecteur reste bloque).">&#8635; Recharger la page</button>' +
                '<button id="ed-set-intro-btn" style="background:#333;color:#fff;border:none;padding:7px 10px;border-radius:4px;cursor:pointer;font-size:12px;">Fin intro</button>' +
                '<button id="ed-set-outro-btn" style="background:#333;color:#fff;border:none;padding:7px 10px;border-radius:4px;cursor:pointer;font-size:12px;">Debut outro</button>' +
                '<button id="ed-settings-btn" style="background:#333;color:#fff;border:none;padding:7px 10px;border-radius:4px;cursor:pointer;font-size:12px;" title="Vue d\'ensemble des reglages intro/outro de toutes les series suivies.">Configuration</button>' +
                '<select id="ed-series-select" style="width:100%;padding:5px;border-radius:4px;border:none;background:#000;color:#eee;font-size:11px;font-family:Consolas,monospace;">' +
                '<option value="">-- Changer de serie --</option>' +
                '</select>' +
                '<button id="ed-delete-btn" style="background:#5a1f1f;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;" title="Retire definitivement la serie selectionnee de la liste suivie.">Supprimer la serie selectionnee</button>' +
                '<button id="ed-check-new-btn" style="background:#333;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;">&#8635; Verifier les nouveaux episodes</button>' +
                '<label style="display:flex;align-items:center;gap:6px;color:#ccc;"><input type="checkbox" id="ed-autonext-cb"> Lecture continue</label>' +
                '<label style="display:flex;align-items:center;gap:6px;color:#ccc;"><input type="checkbox" id="ed-autoopen-cb"> Lecteur auto</label>' +
                '<label style="display:flex;align-items:center;gap:6px;color:#ccc;" title="Qualite plus legere, prend effet au prochain chargement d\'episode.">' +
                '<input type="checkbox" id="ed-lowquality-cb"> 720p (plus rapide)' +
                '</label>' +
                '<label style="display:flex;align-items:center;gap:6px;color:#ccc;"><input type="checkbox" id="ed-track-cb"> Suivre cet anime</label>' +
                '<button id="ed-export-btn" style="background:#03d0fc;color:#000;border:none;padding:7px 10px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:12px;">Exporter</button>' +
                '<button id="ed-import-btn" style="background:#333;color:#fff;border:none;padding:7px 10px;border-radius:4px;cursor:pointer;font-size:12px;">Importer</button>' +
                '<input type="file" id="ed-import-file" accept=".html,.htm" style="display:none;">' +
                '<button id="ed-choose-backup-btn" style="background:#333;color:#fff;border:none;padding:7px 10px;border-radius:4px;cursor:pointer;font-size:12px;" title="Choisir un fichier unique (ex. dans le dossier du script) que la sauvegarde mettra a jour directement.">Choisir fichier sauvegarde</button>' +
                '<button id="ed-reauth-backup-btn" style="background:#333;color:#fff;border:none;padding:7px 10px;border-radius:4px;cursor:pointer;font-size:12px;" title="Si le navigateur a redemande la permission (ex. apres un redemarrage), reautorise l\'acces au fichier lie sans avoir a le rechoisir.">Reautoriser l\'acces au fichier</button>' +
                '<span id="ed-backup-status" style="color:#888;font-size:11px;"></span>' +
                '<span id="ed-status" style="color:#ccc;">En attente...</span>' +
                '<span id="ed-mute-indicator" style="color:#f66;display:none;">Son coupe - clique dans le lecteur</span>';
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
            const autoNextCb = topbar.querySelector('#ed-autonext-cb');
            const autoOpenCb = topbar.querySelector('#ed-autoopen-cb');
            const lowQualityCb = topbar.querySelector('#ed-lowquality-cb');
            const trackCb = topbar.querySelector('#ed-track-cb');
            const backupStatusEl = topbar.querySelector('#ed-backup-status');
            const newEpisodesEl = topbar.querySelector('#ed-new-episodes');

            topbar.querySelector('#ed-reload-btn').addEventListener('click', () => location.reload());
            topbar.querySelector('#ed-set-intro-btn').addEventListener('click', promptIntroEnd);
            topbar.querySelector('#ed-set-outro-btn').addEventListener('click', promptOutroStart);
            topbar.querySelector('#ed-settings-btn').addEventListener('click', openSettingsModal);

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
                deleteProgressEntryByEpisodeUrl(seriesSelectEl.value);
                buildPersistentPanel();
            });
            topbar.querySelector('#ed-check-new-btn').addEventListener('click', (ev) => {
                const btn = ev.currentTarget;
                btn.disabled = true;
                btn.textContent = 'Recherche...';
                checkForNewEpisodes().then(() => {
                    btn.disabled = false;
                    btn.textContent = '↻ Verifier les nouveaux episodes';
                });
            });

            // Reprend les commandes du panneau du haut (invisible pendant
            // la lecture, cf. buildPersistentPanel) pour pouvoir changer de
            // serie et ajuster les reglages sans fermer le lecteur.
            seriesSelectEl.addEventListener('change', () => { if (seriesSelectEl.value) location.href = seriesSelectEl.value; });
            autoNextCb.addEventListener('change', () => {
                setAutoNextEnabled(autoNextCb.checked);
                if (currentEpisode) applyUpdatedConfigIfCurrent(currentEpisode.seriesUrl);
                buildPersistentPanel();
            });
            autoOpenCb.addEventListener('change', () => {
                setAutoOpenEnabled(autoOpenCb.checked);
                buildPersistentPanel();
            });
            lowQualityCb.addEventListener('change', () => {
                setLowQualityEnabled(lowQualityCb.checked);
                if (currentEpisode) applyUpdatedConfigIfCurrent(currentEpisode.seriesUrl);
                buildPersistentPanel();
            });
            trackCb.addEventListener('change', () => {
                if (!currentEpisode) return;
                setSeriesExcluded(currentEpisode.seriesUrl, !trackCb.checked);
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
                // Reactive le declenchement anticipe par "Debut outro",
                // au cas ou il avait ete suspendu par le bouton "Precedent"
                // (retour en arriere pour revoir les quelques secondes
                // coupees trop tot par un outro regle pour un episode plus
                // court).
                outroSkipSuspended = false;
                if (!currentEpisode || !currentEpisode.nextPageUrl) {
                    alert('Aucun episode suivant detecte sur cette page.');
                    return;
                }
                advanceToNextEpisode();
            });
            topbar.querySelector('#ed-prev-btn').addEventListener('click', () => {
                if (cancelCountdown) cancelCountdown();
                goToPreviousEpisode();
            });

            topbar.querySelector('#ed-fullscreen-btn').addEventListener('click', () => {
                // Plein ecran sur NOTRE calque (toujours le meme document,
                // jamais recharge) : reste actif d'un episode a l'autre
                // sans rien redemander, meme quand le "src" de l'iframe
                // Odysee change en dessous. Le son, lui, ne peut pas etre
                // force depuis ici (iframe cross-origin) - cf.
                // runInsidePlayerFrame : un vrai clic DANS le lecteur reste
                // necessaire pour le debloquer.
                const req = overlay.requestFullscreen || overlay.webkitRequestFullscreen;
                if (req) req.call(overlay).catch((e) => console.log('[EspritDonghua v4] plein ecran refuse', e));
            });
            topbar.querySelector('#ed-close-btn').addEventListener('click', () => {
                if (cancelCountdown) cancelCountdown(); // sinon le passage a l'episode suivant se declenchait quand meme, calque ferme
                overlay.style.display = 'none';
                postToPlayerFrame({ type: 'espritdonghua-v4-pause' });
                if (document.fullscreenElement === overlay) document.exitFullscreen().catch(() => {});
            });
            toast.querySelector('#ed-toast-cancel').addEventListener('click', () => { if (cancelCountdown) cancelCountdown(); });

            overlayEls = {
                overlay: overlay, playerFrame: playerFrame, toast: toast, statusEl: statusEl, muteIndicatorEl: muteIndicatorEl,
                seriesSelect: seriesSelectEl, autoNextCb: autoNextCb, autoOpenCb: autoOpenCb, lowQualityCb: lowQualityCb, trackCb: trackCb,
                backupStatusEl: backupStatusEl, newEpisodesEl: newEpisodesEl,
                currentNameEl: currentNameEl, currentEpEl: currentEpEl
            };
            return overlayEls;
        }

        function setStatus(text) {
            if (overlayEls) overlayEls.statusEl.textContent = text;
            updatePanelStatus(text);
        }

        function postToPlayerFrame(data) {
            if (!overlayEls || !overlayEls.playerFrame.contentWindow) return;
            overlayEls.playerFrame.contentWindow.postMessage(data, PLAYER_ORIGIN);
        }

        function sendConfigToPlayerFrame() {
            postToPlayerFrame({ type: 'espritdonghua-v4-config', introEnd: currentConfig.introEnd, outroStart: currentConfig.outroStart, preferredQuality: currentConfig.preferredQuality });
        }

        // Messages en provenance de NOTRE iframe Odysee (filtres par
        // event.source pour ignorer l'iframe native du site, qui recoit
        // elle aussi ce meme script injecte tant qu'elle n'est pas
        // neutralisee par disableLiveOdyseeIframe).
        window.addEventListener('message', (event) => {
            if (event.origin !== PLAYER_ORIGIN) return;
            if (!event.data || !event.data.type) return;
            if (!overlayEls || event.source !== overlayEls.playerFrame.contentWindow) return;

            if (event.data.type === 'espritdonghua-v4-ready') {
                console.log('[EspritDonghua v4] (iframe Odysee) lecteur pret, envoi de la config');
                sendConfigToPlayerFrame();
            }
            if (event.data.type === 'espritdonghua-v4-outro-reached') {
                if (outroSkipSuspended || outroSignalSent) {
                    console.log('[EspritDonghua v4] signal outro recu mais ignore (suspendu=' + outroSkipSuspended + ', deja envoye=' + outroSignalSent + ')');
                    return;
                }
                outroSignalSent = true;
                triggerNextEpisode('debut outro configure');
            }
            if (event.data.type === 'espritdonghua-v4-ended') {
                if (outroSignalSent) {
                    console.log('[EspritDonghua v4] signal fin recu mais ignore (deja envoye=' + outroSignalSent + ')');
                    return;
                }
                outroSignalSent = true;
                triggerNextEpisode('fin reelle de la video');
            }
            if (event.data.type === 'espritdonghua-v4-mute-state' && overlayEls.muteIndicatorEl) {
                overlayEls.muteIndicatorEl.style.display = event.data.muted ? 'block' : 'none';
            }
            if (event.data.type === 'espritdonghua-v4-load-status') {
                if (event.data.stage === 'video-trouvee') setStatus('Chargement...');
                else if (event.data.stage === 'buffering') setStatus('Chargement... ' + event.data.pct + '%');
                else if (event.data.stage === 'pret') setStatus('Lecture');
            }
        });

        function applyRuntimeConfig(seriesUrl) {
            const introOutro = getIntroOutroForSeries(seriesUrl);
            currentConfig = {
                introEnd: introOutro.introEnd || null,
                outroStart: introOutro.outroStart || null,
                autoNext: isAutoNextEnabled(),
                preferredQuality: isLowQualityEnabled() ? '720p' : '1080p'
            };
        }

        function triggerNextEpisode(reason) {
            if (!currentConfig.autoNext) {
                console.log('[EspritDonghua v4] "Lecture continue" desactivee, passage automatique ignore (' + reason + ')');
                return;
            }
            if (!currentEpisode || !currentEpisode.nextPageUrl) {
                console.log('[EspritDonghua v4] pas d\'episode suivant detecte (' + reason + ')');
                setStatus('Episode termine - pas de suivant detecte');
                return;
            }
            console.log('[EspritDonghua v4] declenchement passage episode suivant (' + reason + ')');
            showNextToast();
        }

        function showNextToast() {
            const { toast } = overlayEls;
            let seconds = 3;
            let cancelled = false;
            const textEl = toast.querySelector('#ed-toast-text');
            toast.style.display = 'flex';
            textEl.textContent = 'Episode suivant dans ' + seconds + 's...';
            const interval = setInterval(() => {
                if (cancelled) { clearInterval(interval); return; }
                seconds--;
                if (seconds <= 0) {
                    clearInterval(interval);
                    toast.style.display = 'none';
                    cancelCountdown = null;
                    advanceToNextEpisode();
                    return;
                }
                textEl.textContent = 'Episode suivant dans ' + seconds + 's...';
            }, 1000);
            cancelCountdown = () => {
                cancelled = true;
                clearInterval(interval);
                toast.style.display = 'none';
                cancelCountdown = null;
                console.log('[EspritDonghua v4] passage a l\'episode suivant annule par l\'utilisateur');
            };
        }

        // Charge l'episode suivant a la demande, au moment reel du
        // changement : resout la page suivante, en extrait l'URL d'embed
        // Odysee, et change juste le "src" de l'iframe - pas de
        // telechargement, quasi instantane.
        function advanceToNextEpisode() {
            if (advancingToNext) return;
            if (!currentEpisode || !currentEpisode.nextPageUrl) return;
            const nextPageUrl = currentEpisode.nextPageUrl;
            advancingToNext = true;
            setStatus('Chargement de l\'episode suivant...');
            fetchPageHtml(nextPageUrl).then((html) => {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const info = extractEpisodeInfoFromDoc(doc, nextPageUrl);
                if (!info) throw new Error('iframe Odysee introuvable sur la page suivante (' + nextPageUrl + ')');
                currentEpisode = info;
                recordEpisodeProgress(info);
                applyRuntimeConfig(info.seriesUrl);
                outroSignalSent = false;
                overlayEls.playerFrame.src = info.embedSrc;
                setStatus('Chargement...');
                try { history.pushState(null, '', info.pageUrl); } catch (e) {}
                advancingToNext = false;
                buildPersistentPanel();
            }).catch((e) => {
                advancingToNext = false;
                console.log('[EspritDonghua v4] echec chargement episode suivant', e);
                setStatus('Erreur : impossible de charger l\'episode suivant');
            });
        }

        // Saut direct vers un numero d'episode saisi, sans passer par les
        // liens suivant/precedent un a un. Le site n'expose pas d'index
        // avec toutes les URLs par numero (la colonne #singlepisode ne
        // liste que les episodes recents), donc l'URL cible est deduite
        // par substitution sur l'URL de l'episode courant (motif constant
        // observe partout : "...-e<numero>/") plutot que d'aller chercher
        // une vraie liste complete - plus leger, mais suppose que la
        // numerotation ne contient pas d'exception (ex. un episode
        // special "12.5") pour cette serie.
        function goToEpisodeNumber(targetNumber) {
            if (!currentEpisode || !currentEpisode.pageUrl) { setStatus('Ouvre d\'abord un episode.'); return; }
            const latest = latestKnownEpisode[currentEpisode.seriesUrl];
            if (latest && targetNumber > Number(latest)) {
                setStatus('Pas d\'episode ' + targetNumber + ' (dernier connu : ' + latest + ').');
                return;
            }
            const match = currentEpisode.pageUrl.match(/^(.*-e)(\d+)(\/?)$/i);
            if (!match) { setStatus('Impossible de deviner l\'URL de cet episode.'); return; }
            const targetUrl = match[1] + targetNumber + match[3];
            setStatus('Recherche de l\'episode ' + targetNumber + '...');
            fetchPageHtml(targetUrl).then((html) => {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const info = extractEpisodeInfoFromDoc(doc, targetUrl);
                if (!info) { setStatus('Episode ' + targetNumber + ' introuvable.'); return; }
                currentEpisode = info;
                recordEpisodeProgress(info);
                applyRuntimeConfig(info.seriesUrl);
                outroSignalSent = false;
                overlayEls.playerFrame.src = info.embedSrc;
                setStatus('Chargement...');
                try { history.pushState(null, '', info.pageUrl); } catch (e) {}
                buildPersistentPanel();
            }).catch((e) => {
                console.log('[EspritDonghua v4] echec saut vers episode ' + targetNumber, e);
                // Un statut 5xx (deja retente une fois dans fetchPageHtml) est
                // une erreur serveur passagere, pas une preuve que l'episode
                // n'existe pas - message distinct pour ne pas induire en erreur.
                const serverError = /statut 5\d\d/.test((e && e.message) || '');
                setStatus(serverError ? 'Erreur serveur, reessaie dans un instant.' : 'Erreur : episode ' + targetNumber + ' introuvable.');
            });
        }

        function disableLiveOdyseeIframe() {
            // Notre calque recouvre visuellement l'iframe Odysee native du
            // site, mais sans ca elle reste presente dans le DOM et
            // continuerait a jouer (son en double, double consommation du
            // CDN) en parallele de la notre.
            const iframe = extractOdyseeIframe(document);
            if (iframe && iframe.src !== 'about:blank') {
                iframe.src = 'about:blank';
                console.log('[EspritDonghua v4] iframe Odysee native desactivee (evite un flux video en double)');
            }
        }

        function goToPreviousEpisode() {
            if (!currentEpisode || !currentEpisode.prevPageUrl) {
                alert('Aucun episode precedent detecte sur cette page.');
                return;
            }
            // On suspend le declenchement anticipe par "Debut outro" : le
            // but de revenir en arriere est generalement de revoir les
            // quelques secondes coupees trop tot parce que l'outro,
            // configure pour la duree habituelle de la serie, ne correspond
            // pas a cet episode plus long. Reactive par le bouton "Suivant".
            outroSkipSuspended = true;
            const prevPageUrl = currentEpisode.prevPageUrl;
            setStatus('Chargement de l\'episode precedent...');
            fetchPageHtml(prevPageUrl).then((html) => {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const info = extractEpisodeInfoFromDoc(doc, prevPageUrl);
                if (!info) throw new Error('iframe Odysee introuvable sur la page precedente (' + prevPageUrl + ')');
                startEpisode(info, 'bouton precedent');
            }).catch((e) => {
                console.log('[EspritDonghua v4] echec chargement episode precedent', e);
                setStatus('Erreur : impossible de charger l\'episode precedent');
            });
        }

        function startEpisode(info, reason) {
            if (!info || !info.embedSrc) {
                console.log('[EspritDonghua v4] aucune iframe Odysee detectee sur cette page');
                return;
            }
            disableLiveOdyseeIframe();
            const { overlay, playerFrame } = buildOverlay();
            overlay.style.display = 'block';

            if (currentEpisode && currentEpisode.embedSrc === info.embedSrc && playerFrame.src) {
                // Deja en cours de lecture (ex: reouverture manuelle du
                // meme episode) : on ne recharge rien, mais on relance la
                // lecture au cas ou "Fermer" l'avait mise en pause
                // (postMessage "pause" envoye a la fermeture du calque).
                console.log('[EspritDonghua v4] episode deja charge, reaffichage - raison :', reason);
                currentEpisode = info;
                applyRuntimeConfig(info.seriesUrl);
                sendConfigToPlayerFrame();
                postToPlayerFrame({ type: 'espritdonghua-v4-play' });
                setStatus('Lecture');
                buildPersistentPanel();
                return;
            }

            console.log('[EspritDonghua v4] demande de lecture :', info.embedSrc, '- raison :', reason);
            currentEpisode = info;
            recordEpisodeProgress(info);
            applyRuntimeConfig(info.seriesUrl);
            outroSignalSent = false;
            playerFrame.src = info.embedSrc;
            setStatus('Chargement...');
            buildPersistentPanel();
        }

        function maybeAutoOpenPlayer(liveInfo) {
            if (!isAutoOpenEnabled()) return;
            if (!liveInfo || isSeriesExcluded(liveInfo.seriesUrl)) return;
            startEpisode(liveInfo, 'auto au chargement de la page');
        }

        function applyUpdatedConfigIfCurrent(seriesUrl) {
            if (!currentEpisode || currentEpisode.seriesUrl !== seriesUrl) return;
            applyRuntimeConfig(seriesUrl);
            sendConfigToPlayerFrame();
        }

        function promptIntroEnd() {
            if (!currentEpisode || !currentEpisode.seriesUrl) { alert('Ouvre d\'abord le lecteur sur un episode.'); return; }
            const current = getIntroOutroForSeries(currentEpisode.seriesUrl).introEnd;
            const input = prompt('Fin du generique de debut pour "' + currentEpisode.seriesName + '" (format mm:ss, ou juste les chiffres ex. 0712 pour 7:12) :', formatTimecode(current));
            const seconds = parseTimecode(input);
            if (seconds === null) return;
            setIntroOutroForSeries(currentEpisode.seriesUrl, { introEnd: seconds });
            applyUpdatedConfigIfCurrent(currentEpisode.seriesUrl);
        }

        function promptOutroStart() {
            if (!currentEpisode || !currentEpisode.seriesUrl) { alert('Ouvre d\'abord le lecteur sur un episode.'); return; }
            const current = getIntroOutroForSeries(currentEpisode.seriesUrl).outroStart;
            const input = prompt('Debut du generique de fin pour "' + currentEpisode.seriesName + '" (format mm:ss, ou juste les chiffres ex. 0712 pour 7:12) :', formatTimecode(current));
            const seconds = parseTimecode(input);
            if (seconds === null) return;
            setIntroOutroForSeries(currentEpisode.seriesUrl, { outroStart: seconds });
            applyUpdatedConfigIfCurrent(currentEpisode.seriesUrl);
        }

        // Vue d'ensemble intro/outro pour toutes les series suivies - ne
        // venait pas du script v2.6 (dont l'import ne portait que le nom/
        // episode, pas les reglages intro/outro par serie), portee ici
        // pour retrouver en un coup d'oeil quelles series n'ont encore
        // aucun reglage (colonnes vides) apres la migration.
        function openSettingsModal() {
            const progress = loadProgress();
            const entries = Object.values(progress).sort((a, b) => a.seriesName.localeCompare(b.seriesName));

            const overlay = document.createElement('div');
            overlay.id = 'ep-settings-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1000001;display:flex;align-items:center;justify-content:center;';

            const box = document.createElement('div');
            box.style.cssText = 'background:#15151f;color:#eee;max-width:700px;width:92%;max-height:80vh;overflow:auto;border-radius:8px;padding:20px;font-family:Arial,sans-serif;';

            let html = '<h2 style="margin-top:0;color:#03d0fc;font-size:16px;">Reglages intro/outro des animes suivis</h2>';
            if (entries.length === 0) {
                html += '<p style="font-size:13px;color:#aaa;">Aucun anime suivi pour le moment.</p>';
            } else {
                html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
                html += '<tr style="text-align:left;color:#aaa;border-bottom:1px solid #333;">' +
                    '<th style="padding:6px 4px;">Anime</th>' +
                    '<th style="padding:6px 4px;">Fin intro</th>' +
                    '<th style="padding:6px 4px;">Debut outro</th>' +
                    '<th style="padding:6px 4px;">Suivi</th>' +
                    '</tr>';
                entries.forEach((e) => {
                    const io = getIntroOutroForSeries(e.seriesUrl);
                    const tracked = !isSeriesExcluded(e.seriesUrl);
                    // Aucun reglage du tout -> fond legerement teinte pour
                    // reperer d'un coup d'oeil quoi reparametrer.
                    const unconfigured = !io.introEnd && !io.outroStart;
                    const rowStyle = unconfigured ? 'background:rgba(255,179,0,.08);' : '';
                    html += '<tr style="border-bottom:1px solid #222;' + rowStyle + '" data-url="' + e.seriesUrl + '">' +
                        '<td style="padding:6px 4px;">' + (unconfigured ? '&#9888; ' : '') + e.seriesName + '</td>' +
                        '<td style="padding:6px 4px;"><input type="text" class="ep-set-intro-input" placeholder="mm:ss" style="width:70px;background:#000;color:#eee;border:1px solid #333;border-radius:4px;padding:3px;" value="' + formatTimecode(io.introEnd) + '"></td>' +
                        '<td style="padding:6px 4px;"><input type="text" class="ep-set-outro-input" placeholder="mm:ss" style="width:70px;background:#000;color:#eee;border:1px solid #333;border-radius:4px;padding:3px;" value="' + formatTimecode(io.outroStart) + '"></td>' +
                        '<td style="padding:6px 4px;text-align:center;"><input type="checkbox" class="ep-set-tracked-input" ' + (tracked ? 'checked' : '') + '></td>' +
                        '</tr>';
                });
                html += '</table>';
            }
            html += '<div style="margin-top:16px;text-align:right;">' +
                '<button id="ep-settings-save" style="background:#03d0fc;color:#000;border:none;padding:8px 14px;border-radius:4px;cursor:pointer;font-weight:bold;margin-right:8px;">Enregistrer</button>' +
                '<button id="ep-settings-close" style="background:#333;color:#fff;border:none;padding:8px 14px;border-radius:4px;cursor:pointer;">Fermer</button>' +
                '</div>';

            box.innerHTML = html;
            overlay.appendChild(box);
            document.body.appendChild(overlay);

            overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });
            box.querySelector('#ep-settings-close').addEventListener('click', () => overlay.remove());

            const saveBtn = box.querySelector('#ep-settings-save');
            if (saveBtn) saveBtn.addEventListener('click', () => {
                box.querySelectorAll('tr[data-url]').forEach((row) => {
                    const url = row.getAttribute('data-url');
                    const introSeconds = parseTimecode(row.querySelector('.ep-set-intro-input').value);
                    const outroSeconds = parseTimecode(row.querySelector('.ep-set-outro-input').value);
                    const tracked = row.querySelector('.ep-set-tracked-input').checked;
                    setIntroOutroForSeries(url, { introEnd: introSeconds, outroStart: outroSeconds });
                    setSeriesExcluded(url, !tracked);
                    applyUpdatedConfigIfCurrent(url);
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

        // Verifie pour chaque serie suivie si un episode plus recent que
        // celui enregistre existe deja sur le site, en reutilisant la meme
        // detection de lien "episode suivant" que la navigation normale
        // (page de l'episode suivi -> presence d'un lien ".naveps.bignav
        // a[rel=next]"). Resultat (nom de serie + URL du nouvel episode)
        // mis en cache dans newEpisodes et reapplique au prochain rendu du
        // panneau/de la colonne des lors qu'un changement est detecte.
        function checkForNewEpisodes() {
            const progress = loadProgress();
            const excluded = loadExcludedSeries();
            const entries = Object.values(progress).filter((e) => !excluded[e.seriesUrl] && e.episodeUrl);
            let changed = false;
            function applyResult(e, nextUrl, latest) {
                const had = newEpisodes[e.seriesUrl];
                if (nextUrl) {
                    if (!had || had.url !== nextUrl) changed = true;
                    newEpisodes[e.seriesUrl] = { seriesName: e.seriesName, url: nextUrl };
                } else if (had) {
                    delete newEpisodes[e.seriesUrl];
                    changed = true;
                }
                if (latest && latest.number && latestKnownEpisode[e.seriesUrl] !== latest.number) {
                    latestKnownEpisode[e.seriesUrl] = latest.number;
                    changed = true;
                }
            }
            const checks = entries.map((e) => {
                // La serie actuellement ouverte a deja son "episode suivant"
                // resolu localement (page courante) - pas besoin de la
                // refetcher en reseau comme les autres series suivies.
                if (currentEpisode && currentEpisode.seriesUrl === e.seriesUrl) {
                    applyResult(e, currentEpisode.nextPageUrl, currentEpisode.latestEpisodeNumber ? { number: currentEpisode.latestEpisodeNumber } : null);
                    return Promise.resolve();
                }
                return fetchPageHtml(e.episodeUrl).then((html) => {
                    const doc = new DOMParser().parseFromString(html, 'text/html');
                    applyResult(e, extractNextEpisodeUrlFromDoc(doc, e.episodeUrl), extractLatestEpisodeFromDoc(doc, e.episodeUrl));
                }).catch((err) => {
                    console.log('[EspritDonghua v4] verification nouvel episode echouee pour ' + e.seriesName, err);
                });
            });
            return Promise.all(checks).then(() => { if (changed) buildPersistentPanel(); });
        }

        function countMissingEpisodeNumbers() {
            const progress = loadProgress();
            return Object.keys(progress).filter((key) => !progress[key].episodeNumber && progress[key].episodeUrl).length;
        }

        // Recupere le vrai numero d'episode pour les series suivies dont
        // il est inconnu (`null`) - cas des entrees importees depuis un
        // ancien backup v2.6 (cf. parseProgressBackup) jamais rouvertes
        // depuis dans v4. Refetch la page de l'episode suivi (episodeUrl)
        // et lit son meta itemprop="episodeNumber", exactement comme au
        // premier chargement d'une page episode - sans changer quel
        // episode est suivi, juste combler le numero manquant.
        function fixMissingEpisodeNumbers() {
            const progress = loadProgress();
            const missingKeys = Object.keys(progress).filter((key) => !progress[key].episodeNumber && progress[key].episodeUrl);
            if (missingKeys.length === 0) return Promise.resolve(0);
            let fixed = 0;
            const tasks = missingKeys.map((key) => {
                const entry = progress[key];
                return fetchPageHtml(entry.episodeUrl).then((html) => {
                    const doc = new DOMParser().parseFromString(html, 'text/html');
                    const meta = extractEpisodeMetaFromDoc(doc);
                    if (meta && meta.episodeNumber) {
                        const p = loadProgress();
                        if (p[key]) { p[key].episodeNumber = meta.episodeNumber; saveProgress(p); }
                        fixed++;
                    }
                }).catch((err) => {
                    console.log('[EspritDonghua v4] correction numero echouee pour ' + entry.seriesName, err);
                });
            });
            return Promise.all(tasks).then(() => fixed);
        }

        // La plupart des noms de serie sur le site suivent le format "Nom
        // original (Titre anglais)" - le titre anglais entre parentheses
        // est plus court et plus lisible, donc c'est lui qu'on affiche
        // partout ou la place est limitee (le nom complet reste
        // disponible en infobulle). Repli sur le nom complet si pas de
        // parentheses.
        function displayName(name) {
            if (!name) return name;
            const match = name.match(/\(([^)]+)\)/);
            return match ? match[1].trim() : name;
        }

        // Aligne les numeros d'episode en colonne dans les listes
        // deroulantes (panneau + lecteur) : un <select> natif ne supporte
        // ni CSS ni HTML dans ses <option>, donc le seul moyen d'aligner
        // une colonne est de tronquer/completer le nom a une largeur fixe
        // avec des espaces, sur une police a chasse fixe (cf. font-family
        // sur les deux <select> concernes).
        const SERIES_NAME_COLUMN_WIDTH = 18;

        // Espace insecable ( ) plutot qu'un espace normal : le HTML
        // reduit toute suite d'espaces normaux consecutifs a un seul a
        // l'affichage (comportement standard de normalisation des blancs),
        // ce qui detruisait silencieusement l'alignement en colonne malgre
        // la police a chasse fixe - un espace normal isole (ex. autour de
        // "/") ne pose pas ce probleme, seules les suites de 2+ en posent.
        function padColumn(str, width) {
            const s = String(str);
            return s.length >= width ? s.slice(0, width - 1) + '…' : s + ' '.repeat(width - s.length);
        }

        // Repli "?" quand le numero d'episode suivi est inconnu (cas des
        // series importees depuis un ancien backup v2.6 - cf.
        // parseProgressBackup - qui n'enregistrait pas ce numero ; se
        // corrige tout seul des que la serie est rouverte dans v4).
        function padEpisodeNum(n) {
            return String(n === null || n === undefined ? '?' : n).padStart(3, ' ');
        }

        // Trie les series suivies avec un nouvel episode reellement
        // disponible en premier (pour les reperer sans avoir a scroller),
        // puis par ordre alphabetique au sein de chaque groupe. Reutilise
        // pour les deux listes deroulantes (panneau + lecteur).
        function seriesSortCompare(a, b) {
            const aNew = newEpisodes[a.seriesUrl] ? 1 : 0;
            const bNew = newEpisodes[b.seriesUrl] ? 1 : 0;
            if (aNew !== bNew) return bNew - aNew;
            return a.seriesName.localeCompare(b.seriesName);
        }

        function formatRelativeDays(iso) {
            if (!iso) return null;
            const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
            if (days <= 0) return "vu aujourd'hui";
            if (days === 1) return 'vu hier';
            return 'vu il y a ' + days + 'j';
        }

        function buildSeriesOptionLabel(e) {
            const latest = latestKnownEpisode[e.seriesUrl];
            const epStr = latest
                ? padEpisodeNum(e.episodeNumber) + ' / ' + padEpisodeNum(latest)
                : padEpisodeNum(e.episodeNumber);
            return padColumn(displayName(e.seriesName), SERIES_NAME_COLUMN_WIDTH) + ' Ep ' + epStr;
        }

        // Nom/numero d'episode de la serie en cours, factorise car affiche
        // a l'identique dans le panneau hors lecteur et dans la colonne du
        // calque plein ecran - la couleur reflete le vrai signal de
        // nouveaute (newEpisodes), pas un etat permanent.
        function getCurrentEpisodeDisplay() {
            if (!currentEpisode || !currentEpisode.seriesName) return null;
            const epNum = currentEpisode.episodeNumber || '?';
            const latest = latestKnownEpisode[currentEpisode.seriesUrl];
            const isNew = !!newEpisodes[currentEpisode.seriesUrl];
            return {
                name: displayName(currentEpisode.seriesName),
                fullName: currentEpisode.seriesName,
                epText: 'Episode ' + (latest ? epNum + ' / ' + latest : epNum),
                color: isNew ? '#ffb300' : '#4caf50'
            };
        }

        // Petite liste HTML des series avec un nouvel episode deja publie
        // sur le site (issues de newEpisodes) - un clic ouvre directement
        // cet episode. Reutilisee a l'identique dans le panneau (colonne
        // droite) et dans la colonne du lecteur en plein ecran.
        function renderNewEpisodesList() {
            const excluded = loadExcludedSeries();
            const progress = loadProgress();
            // Les series les plus en retard (vues il y a le plus longtemps)
            // en premier - aide a prioriser quoi rattraper.
            const keys = Object.keys(newEpisodes)
                .filter((seriesUrl) => !excluded[seriesUrl])
                .sort((a, b) => {
                    const wa = progress[a] ? progress[a].watchedAt : null;
                    const wb = progress[b] ? progress[b].watchedAt : null;
                    if (!wa && !wb) return 0;
                    if (!wa) return -1;
                    if (!wb) return 1;
                    return new Date(wa) - new Date(wb);
                });
            if (keys.length === 0) return '';
            let html = '<div style="font-size:11px;font-weight:bold;color:#ffb300;text-align:center;">Nouveaux episodes</div>' +
                '<div style="display:flex;flex-direction:column;gap:4px;text-align:center;">';
            keys.forEach((seriesUrl) => {
                const info = newEpisodes[seriesUrl];
                const latest = latestKnownEpisode[seriesUrl];
                // Affiche "vu X -> Y" (pas seulement le nouveau numero) :
                // sert de double verification a l'oeil, sans avoir a
                // rouvrir la serie pour comparer avec l'episode suivi.
                // La date relative aide en plus a prioriser quoi rattraper.
                const watched = progress[seriesUrl] ? progress[seriesUrl].episodeNumber : null;
                const since = progress[seriesUrl] ? formatRelativeDays(progress[seriesUrl].watchedAt) : null;
                const epInfo = [watched && latest ? ('vu ' + watched + ' &rarr; ' + latest) : (latest ? ('Ep ' + latest) : ''), since]
                    .filter(Boolean).join(' &middot; ');
                html += `<a href="${info.url}" style="display:block;color:#ffb300;text-decoration:none;background:rgba(255,179,0,.12);padding:5px 7px;border-radius:4px;">` +
                    `<div style="font-weight:bold;font-size:11px;">${displayName(info.seriesName)}</div>` +
                    (epInfo ? `<div style="font-size:10px;font-weight:normal;opacity:.85;">${epInfo}</div>` : '') +
                    `</a>`;
            });
            html += '</div>';
            return html;
        }

        // Garde les commandes dupliquees dans la colonne du lecteur (select
        // de serie, cases a cocher) synchronisees avec l'etat reel - a
        // chaque fois que buildPersistentPanel() tourne (donc a chaque
        // changement pertinent).
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
            overlayEls.trackCb.checked = !!(currentEpisode && !isSeriesExcluded(currentEpisode.seriesUrl));

            const progress = loadProgress();
            const excluded = loadExcludedSeries();
            const entries = Object.values(progress)
                .filter((e) => !excluded[e.seriesUrl])
                .sort(seriesSortCompare);
            const select = overlayEls.seriesSelect;
            select.innerHTML = '<option value="">-- Changer de serie --</option>';
            entries.forEach((e) => {
                const opt = document.createElement('option');
                opt.value = e.episodeUrl;
                opt.textContent = buildSeriesOptionLabel(e);
                if (currentEpisode && e.episodeUrl === currentEpisode.pageUrl) opt.selected = true;
                if (newEpisodes[e.seriesUrl]) { opt.style.color = '#ffb300'; opt.style.fontWeight = 'bold'; }
                const since = formatRelativeDays(e.watchedAt);
                if (since) opt.title = since;
                select.appendChild(opt);
            });

            if (overlayEls.newEpisodesEl) overlayEls.newEpisodesEl.innerHTML = renderNewEpisodesList();
        }

        // Bouton toujours visible (jamais recree ni masque par le
        // rafraichissement du panneau, meme principe que ed-toggle-btn dans
        // le calque plein ecran) qui replie/deplie toute la colonne de
        // droite. Etat non persiste entre rechargements de page (choix
        // coherent avec l'existant, cf. point 66 de l'historique).
        function ensurePanelToggleButton() {
            let toggleBtn = document.getElementById('ep-toggle-btn');
            if (toggleBtn) return toggleBtn;
            toggleBtn = document.createElement('button');
            toggleBtn.id = 'ep-toggle-btn';
            toggleBtn.type = 'button';
            toggleBtn.title = 'Afficher/masquer le panneau de progression';
            // position:fixed sert deja de bloc de positionnement pour le
            // badge en position:absolute ci-dessous, pas besoin de
            // position:relative en plus.
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

        // Nombre de series avec un nouvel episode reellement disponible
        // (newEpisodes, filtre des series exclues) affiche en badge sur le
        // bouton toujours visible - permet de voir qu'il y a du nouveau
        // sans avoir a ouvrir le panneau.
        function updateToggleBadge() {
            const badge = document.getElementById('ep-toggle-badge');
            if (!badge) return;
            const excluded = loadExcludedSeries();
            const count = Object.keys(newEpisodes).filter((seriesUrl) => !excluded[seriesUrl]).length;
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : String(count);
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }

        function buildPersistentPanel() {
            ensurePanelToggleButton();
            updateToggleBadge();

            let panel = document.getElementById('ep-panel');
            if (!panel) {
                panel = document.createElement('div');
                panel.id = 'ep-panel';
                panel.style.cssText = 'position:fixed;top:54px;left:10px;z-index:999998;background:#15151f;color:#eee;padding:12px;font-family:Arial,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.4);border-radius:8px;display:flex;flex-direction:column;gap:8px;width:250px;max-height:calc(100vh - 70px);overflow-y:auto;';
                document.body.appendChild(panel);
            }

            const progress = loadProgress();
            const excluded = loadExcludedSeries();
            const entries = Object.values(progress)
                .filter((e) => !excluded[e.seriesUrl])
                .sort(seriesSortCompare);

            let html = '<div style="font-weight:bold;color:#03d0fc;font-size:13px;">Esprit Donghua Continuum</div>';

            html += renderNewEpisodesList();

            if (currentEpisode && currentEpisode.seriesName) {
                const disp = getCurrentEpisodeDisplay();
                html += '<div style="font-size:18px;font-weight:bold;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + disp.fullName + '">' + disp.name + '</div>';
                html += '<div style="font-size:13px;font-weight:bold;color:' + disp.color + ';text-align:center;">' + disp.epText + '</div>';

                html += '<button id="ep-open-player" style="background:#03d0fc;color:#000;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:bold;">Ouvrir le lecteur</button>';
                html += '<span id="ep-player-status" style="font-size:11px;color:#ccc;"></span>';

                const trackedChecked = isSeriesExcluded(currentEpisode.seriesUrl) ? '' : 'checked';
                html += '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#ccc;">' +
                    '<input type="checkbox" id="ep-track-series" ' + trackedChecked + '> Suivre cet anime' +
                    '</label>';
            }

            if (entries.length === 0) {
                html += '<div style="font-size:12px;color:#aaa;">Aucun anime suivi.</div>';
            } else {
                html += '<select id="ep-select" style="width:100%;padding:6px;border-radius:4px;border:none;background:#000;color:#eee;font-size:12px;font-family:Consolas,monospace;">';
                html += '<option value="">-- Choisir un anime --</option>';
                entries.forEach((e) => {
                    const label = buildSeriesOptionLabel(e);
                    const selected = currentEpisode && e.episodeUrl === currentEpisode.pageUrl ? ' selected' : '';
                    const style = newEpisodes[e.seriesUrl] ? ' style="color:#ffb300;font-weight:bold;"' : '';
                    const since = formatRelativeDays(e.watchedAt);
                    const titleAttr = since ? ` title="${since}"` : '';
                    html += `<option value="${e.episodeUrl}"${selected}${style}${titleAttr}>${label}</option>`;
                });
                html += '</select>';
                html += '<button id="ep-delete-btn" style="background:#5a1f1f;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;" title="Retire definitivement la serie selectionnee de la liste suivie.">Supprimer la serie selectionnee</button>';
            }

            html += '<button id="ep-check-new" style="background:#333;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;">&#8635; Verifier les nouveaux episodes</button>';

            const missingCount = countMissingEpisodeNumbers();
            if (missingCount > 0) {
                html += '<button id="ep-fix-numbers" style="background:#333;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;" title="Recupere le vrai numero d\'episode pour les series affichant \'?\' (importees depuis un ancien backup sans ce numero).">Corriger les numeros manquants (' + missingCount + ')</button>';
            }

            const autoNextChecked = isAutoNextEnabled() ? 'checked' : '';
            html += '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#ccc;">' +
                '<input type="checkbox" id="ep-autonext" ' + autoNextChecked + '> Lecture continue' +
                '</label>';

            const autoOpenChecked = isAutoOpenEnabled() ? 'checked' : '';
            html += '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#ccc;" title="Ouvre/charge automatiquement le lecteur a chaque episode.">' +
                '<input type="checkbox" id="ep-autoopen" ' + autoOpenChecked + '> Lecteur auto' +
                '</label>';

            const lowQualityChecked = isLowQualityEnabled() ? 'checked' : '';
            html += '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#ccc;" title="Qualite plus legere, prend effet au prochain chargement d\'episode.">' +
                '<input type="checkbox" id="ep-lowquality" ' + lowQualityChecked + '> 720p (plus rapide)' +
                '</label>';

            html += '<button id="ep-set-intro" style="background:#333;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;">Fin intro</button>';
            html += '<button id="ep-set-outro" style="background:#333;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;">Debut outro</button>';
            html += '<button id="ep-settings-btn" style="background:#333;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;" title="Vue d\'ensemble des reglages intro/outro de toutes les series suivies.">Configuration</button>';
            html += '<button id="ep-export-panel" style="background:#03d0fc;color:#000;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:bold;">Exporter</button>';
            html += '<button id="ep-import-panel" style="background:#333;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;">Importer</button>';
            html += '<button id="ep-choose-backup" style="background:#333;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;" title="Choisir un fichier unique (ex. dans le dossier du script) que la sauvegarde mettra a jour directement, au lieu de telecharger un nouveau fichier a chaque fois.">Choisir fichier sauvegarde</button>';
            html += '<button id="ep-reauth-backup" style="background:#333;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;" title="Si le navigateur a redemande la permission (ex. apres un redemarrage), reautorise l\'acces au fichier lie sans avoir a le rechoisir.">Reautoriser l\'acces au fichier</button>';
            html += '<span id="ep-backup-status" style="font-size:11px;color:#888;"></span>';
            html += '<input type="file" id="ep-import-file" accept=".html,.htm" style="display:none;">';

            panel.innerHTML = html;

            const select = panel.querySelector('#ep-select');
            if (select) select.addEventListener('change', () => { if (select.value) location.href = select.value; });

            const deleteBtn = panel.querySelector('#ep-delete-btn');
            if (deleteBtn) deleteBtn.addEventListener('click', () => {
                if (!select.value) { alert('Choisis d\'abord une serie dans la liste.'); return; }
                if (!confirm('Retirer definitivement cette serie de la liste suivie ?')) return;
                deleteProgressEntryByEpisodeUrl(select.value);
                buildPersistentPanel();
            });

            const checkNewBtn = panel.querySelector('#ep-check-new');
            if (checkNewBtn) checkNewBtn.addEventListener('click', () => {
                checkNewBtn.disabled = true;
                checkNewBtn.textContent = 'Recherche...';
                checkForNewEpisodes().then(() => {
                    checkNewBtn.disabled = false;
                    checkNewBtn.textContent = '↻ Verifier les nouveaux episodes';
                });
            });

            const fixNumbersBtn = panel.querySelector('#ep-fix-numbers');
            if (fixNumbersBtn) fixNumbersBtn.addEventListener('click', () => {
                fixNumbersBtn.disabled = true;
                fixNumbersBtn.textContent = 'Correction...';
                fixMissingEpisodeNumbers().then(() => buildPersistentPanel());
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

            const autoNextCheckbox = panel.querySelector('#ep-autonext');
            if (autoNextCheckbox) autoNextCheckbox.addEventListener('change', () => {
                setAutoNextEnabled(autoNextCheckbox.checked);
                if (currentEpisode) applyUpdatedConfigIfCurrent(currentEpisode.seriesUrl);
            });

            const autoOpenCheckbox = panel.querySelector('#ep-autoopen');
            if (autoOpenCheckbox) autoOpenCheckbox.addEventListener('change', () => setAutoOpenEnabled(autoOpenCheckbox.checked));

            const lowQualityCheckbox = panel.querySelector('#ep-lowquality');
            if (lowQualityCheckbox) lowQualityCheckbox.addEventListener('change', () => {
                setLowQualityEnabled(lowQualityCheckbox.checked);
                if (currentEpisode) applyUpdatedConfigIfCurrent(currentEpisode.seriesUrl);
            });

            const setIntroBtn = panel.querySelector('#ep-set-intro');
            if (setIntroBtn) setIntroBtn.addEventListener('click', promptIntroEnd);
            const setOutroBtn = panel.querySelector('#ep-set-outro');
            if (setOutroBtn) setOutroBtn.addEventListener('click', promptOutroStart);
            const settingsBtn = panel.querySelector('#ep-settings-btn');
            if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);

            const trackCheckbox = panel.querySelector('#ep-track-series');
            if (trackCheckbox && currentEpisode) {
                trackCheckbox.addEventListener('change', () => {
                    setSeriesExcluded(currentEpisode.seriesUrl, !trackCheckbox.checked);
                    if (trackCheckbox.checked) recordEpisodeProgress(currentEpisode);
                    buildPersistentPanel();
                });
            }

            if (overlayEls) updatePanelStatus(overlayEls.statusEl.textContent);
            syncOverlayControls();
        }

        function getLiveEpisodeInfo() {
            return extractEpisodeInfoFromDoc(document, location.href);
        }

        // Une fois l'iframe native desactivee (disableLiveOdyseeIframe), son
        // "src" ne reflete plus l'episode reel : on reutilise donc l'info
        // deja extraite (currentEpisode) tant qu'elle correspond toujours a
        // la page affichee, plutot que de re-extraire depuis l'iframe.
        function getEpisodeInfoForCurrentPage() {
            if (currentEpisode && currentEpisode.pageUrl === location.href) return currentEpisode;
            return getLiveEpisodeInfo();
        }

        console.log('[EspritDonghua v4] enregistrement des commandes de menu...');
        GM_registerMenuCommand('Voir ma progression', () => buildPersistentPanel());
        GM_registerMenuCommand('Exporter en fichier', exportProgress);
        GM_registerMenuCommand('Choisir le fichier de sauvegarde', chooseBackupFile);
        GM_registerMenuCommand('Ouvrir le lecteur', () => startEpisode(getEpisodeInfoForCurrentPage(), 'commande menu'));

        const liveInfo = getLiveEpisodeInfo();
        if (liveInfo) {
            currentEpisode = liveInfo;
            recordEpisodeProgress(liveInfo);
        }
        buildPersistentPanel();
        // Le handle du fichier de sauvegarde (IndexedDB) est relu de facon
        // asynchrone : l'auto-export attend cette lecture pour savoir s'il
        // doit ecrire dedans ou repli sur un telechargement classique.
        loadBackupFileHandle().then(maybeAutoExport);
        maybeAutoOpenPlayer(liveInfo);

        // Verification des nouveaux episodes : decalee de quelques secondes
        // pour ne pas concurrencer les requetes de demarrage du lecteur,
        // puis repetee toutes les 20 minutes pendant que la page reste
        // ouverte.
        setTimeout(checkForNewEpisodes, 8000);
        setInterval(checkForNewEpisodes, 20 * 60 * 1000);
        console.log('[EspritDonghua v4] script termine sans erreur');
    }
})();
