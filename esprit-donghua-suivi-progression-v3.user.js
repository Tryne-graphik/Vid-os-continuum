// ==UserScript==
// @name         Esprit Donghua - Suivi de progression (v3, fenetre separee)
// @namespace    esprit-donghua-tracker-v3
// @version      3.2
// @description  Variante experimentale de la v2.6 : ouvre l'episode dans une fenetre/onglet separe pointant directement sur odysee.com au lieu de l'iframe integree, pour corriger le son coupe et les limites du plein ecran. Communication entre onglets via le stockage Tampermonkey (pas window.opener/postMessage, casse par Cross-Origin-Opener-Policy sur odysee.com). Script independant, storage isole : n'affecte pas la v2.6.
// @match        https://esprit-donghua.xyz/*
// @match        https://odysee.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// ==/UserScript==

// NOTE IMPORTANTE : cette v3 et la v2.6 (esprit-donghua-suivi-progression.user.js)
// matchent les memes URLs. Si les deux sont actives en meme temps dans
// Tampermonkey, elles vont toutes les deux injecter leur panneau sur la page
// -> desactive celle que tu n'utilises pas (icone Tampermonkey > interrupteur
// sur le script) le temps de comparer les deux approches.
//
// Principe : au lieu d'un iframe Odysee integre a la page esprit-donghua.xyz
// (approche v2.6), on ouvre une vraie fenetre/onglet sur la page odysee.com
// elle-meme (contexte de navigation de premier niveau). Ca change deux choses :
//   - Son : les politiques anti-autoplay de Chrome sont plus permissives sur
//     une page de premier niveau que dans un iframe cross-origin.
//   - Plein ecran : c'est le plein ecran natif d'odysee.com, sans les limites
//     du plein ecran d'un iframe imbrique.
// Pour que la lecture continue (episode suivant) fonctionne sans reclamer un
// clic a chaque fois, on reutilise systematiquement la MEME fenetre nommee
// (window.open(url, NOM)) : naviguer une fenetre deja ouverte via son nom ne
// declenche pas le bloqueur de popups, contrairement a l'ouverture d'une
// fenetre inedite (qui, elle, exige un vrai clic la premiere fois).
//
// v3.1 : odysee.com envoie apparemment un en-tete Cross-Origin-Opener-Policy
// qui casse le lien window.opener/postMessage entre l'onglet principal et la
// fenetre ouverte (meme si window.open() a bien fonctionne et que l'URL est
// correcte). Le script v3.0 se basait dessus pour s'activer ET pour
// communiquer -> il ne se declenchait jamais. Corrige en v3.1 : activation
// via un identifiant de session dans l'URL (#espritdonghua-player:ID), et
// toute la communication entre les deux fenetres passe par le stockage
// partage de Tampermonkey (GM_setValue + GM_addValueChangeListener), qui
// fonctionne entre onglets/origines sans dependre d'une reference JS directe
// entre les deux fenetres.

(function () {
    'use strict';

    const PARENT_ORIGIN = 'https://esprit-donghua.xyz';
    const PLAYER_ORIGIN = 'https://odysee.com';
    const WINDOW_NAME = 'espritdonghua-player-v3';
    const PLAYER_MARKER = 'espritdonghua-player';
    const CHANNEL_TO_PLAYER = 'v3ChannelToPlayer';
    const CHANNEL_TO_OPENER = 'v3ChannelToOpener';
    const isTopFrame = (window.top === window.self);

    function parseSessionIdFromHash() {
        const hash = location.hash || '';
        const markerIdx = hash.indexOf(PLAYER_MARKER);
        if (markerIdx === -1) return null;
        const rest = hash.slice(markerIdx + PLAYER_MARKER.length);
        const afterColon = rest.charAt(0) === ':' ? rest.slice(1) : '';
        const sessionId = afterColon.split('&')[0];
        return sessionId || null;
    }

    if (isTopFrame && location.hostname.indexOf('odysee.com') !== -1) {
        const sessionId = parseSessionIdFromHash();
        if (sessionId) {
            runAsPlayerWindow(sessionId);
        }
        return;
    }

    if (isTopFrame && location.hostname.indexOf('esprit-donghua.xyz') !== -1) {
        runOnTopPage();
    }

    // ================= Contexte : fenetre separee odysee.com =================
    function runAsPlayerWindow(sessionId) {
        console.log('[EspritDonghua v3] (fenetre lecteur) script demarre, session', sessionId);

        let config = null;
        let outroSignalSent = false;
        let videoFound = false;

        function sendToOpener(type, payload) {
            GM_setValue(CHANNEL_TO_OPENER, Object.assign({ sessionId, type, ts: Date.now() }, payload || {}));
        }

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

        // Meme necessite qu'en v2.6 : le lecteur Odysee n'insere la balise
        // <video> qu'apres un clic sur le gros bouton "lecture" central.
        let autoClickAttempts = 0;
        function tryClickBigPlayButton() {
            const selectors = [
                'button.button--play',
                '.button--play',
                'button[aria-label="Jouer "]',
                'button[aria-label="Jouer"]',
                'button[aria-label="Play"]'
            ];
            for (let i = 0; i < selectors.length; i++) {
                const btn = document.querySelector(selectors[i]);
                if (btn) {
                    btn.click();
                    console.log('[EspritDonghua v3] (fenetre lecteur) clic automatique sur le bouton lecture (' + selectors[i] + ')');
                    return true;
                }
            }
            return false;
        }
        const autoClickInterval = setInterval(() => {
            if (videoFound || autoClickAttempts > 20) {
                clearInterval(autoClickInterval);
                return;
            }
            autoClickAttempts++;
            tryClickBigPlayButton();
        }, 500);

        // Filet de securite identique a la v2.6 : rechargement unique si la
        // video n'a toujours pas charge apres 10s.
        setTimeout(() => {
            if (videoFound) return;
            const reloadKey = 'espritdonghua-reload-' + location.href;
            if (sessionStorage.getItem(reloadKey)) {
                console.log('[EspritDonghua v3] (fenetre lecteur) video toujours non chargee apres rechargement, abandon');
                return;
            }
            sessionStorage.setItem(reloadKey, '1');
            console.log('[EspritDonghua v3] (fenetre lecteur) video non chargee apres 10s, rechargement automatique');
            location.reload();
        }, 10000);

        function applyIntroSkipIfNeeded(video) {
            if (!config || !config.introEnd) return;
            if (video.currentTime < config.introEnd) {
                video.currentTime = config.introEnd;
                const playAttempt = video.play();
                if (playAttempt && playAttempt.catch) playAttempt.catch(() => {});
                console.log('[EspritDonghua v3] (fenetre lecteur) intro sautee, demarrage a ' + config.introEnd + 's');
            }
        }

        // Reactivation experimentale du son, conservee comme filet de securite
        // (le contexte "fenetre separee" devrait deja se comporter mieux que
        // l'iframe vis-a-vis de la politique anti-autoplay de Chrome, mais rien
        // ne le garantit selon l'historique de navigation de l'utilisateur sur
        // odysee.com).
        let autoUnmuteAttempted = false;
        function tryAutoUnmute(video) {
            if (!config || !config.autoUnmute || autoUnmuteAttempted) return;
            autoUnmuteAttempted = true;
            console.log('[EspritDonghua v3] (fenetre lecteur) tentative d\'activation automatique du son');

            let recovered = false;
            function recoverIfPaused() {
                if (recovered || !video.paused) return;
                recovered = true;
                console.log('[EspritDonghua v3] (fenetre lecteur) remise en muet et relance suite a une pause forcee');
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

        waitForVideo((video) => {
            console.log('[EspritDonghua v3] (fenetre lecteur) element video trouve, envoi du signal pret');
            sendToOpener('ready');

            if (config) applyIntroSkipIfNeeded(video);
            if (config) tryAutoUnmute(video);

            function reportMuteState() {
                sendToOpener('mute-state', { muted: video.muted });
            }
            reportMuteState();
            video.addEventListener('volumechange', reportMuteState);

            video.addEventListener('timeupdate', () => {
                if (!config || !config.outroStart || outroSignalSent) return;
                if (video.currentTime >= config.outroStart) {
                    outroSignalSent = true;
                    console.log('[EspritDonghua v3] (fenetre lecteur) debut generique de fin atteint, signal envoye');
                    sendToOpener('outro-reached');
                }
            });

            // Filet de securite inconditionnel : meme sans "Debut outro"
            // configure pour la serie (et sans attendre l'estimation de duree
            // cote page principale), la vraie fin de la video declenche le
            // passage a l'episode suivant.
            video.addEventListener('ended', () => {
                if (outroSignalSent) return;
                outroSignalSent = true;
                console.log('[EspritDonghua v3] (fenetre lecteur) video terminee (evenement ended), signal envoye');
                sendToOpener('outro-reached');
            });
        });

        // Ici, "plein ecran" = plein ecran natif de cette fenetre : plus besoin
        // de gerer un cas particulier pour un iframe imbrique.
        function showNextEpisodeToast(startSeconds) {
            let seconds = startSeconds;
            const container = document.fullscreenElement || document.body;

            const toast = document.createElement('div');
            toast.id = 'ep-next-toast';
            toast.style.cssText = 'position:fixed;bottom:30px;left:50%;transform:translateX(-50%);z-index:2147483647;background:#15151f;color:#eee;padding:14px 20px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.6);font-family:Arial,sans-serif;display:flex;align-items:center;gap:12px;';
            toast.innerHTML = '<span id="ep-toast-text" style="font-size:14px;">Episode suivant dans ' + seconds + 's...</span>' +
                '<button id="ep-toast-cancel" style="background:#333;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:13px;">Annuler</button>';
            container.appendChild(toast);

            const textEl = toast.querySelector('#ep-toast-text');
            const cancelBtn = toast.querySelector('#ep-toast-cancel');
            cancelBtn.addEventListener('click', () => {
                toast.remove();
                sendToOpener('countdown-cancel');
                console.log('[EspritDonghua v3] (fenetre lecteur) annulation du passage a l\'episode suivant');
            });

            const localInterval = setInterval(() => {
                if (!document.body.contains(toast) && !(document.fullscreenElement && document.fullscreenElement.contains(toast))) {
                    clearInterval(localInterval);
                    return;
                }
                seconds--;
                if (seconds <= 0) {
                    clearInterval(localInterval);
                    toast.remove();
                    return;
                }
                textEl.textContent = 'Episode suivant dans ' + seconds + 's...';
            }, 1000);
        }

        GM_addValueChangeListener(CHANNEL_TO_PLAYER, (name, oldValue, newValue, remote) => {
            if (!remote) return;
            if (!newValue || newValue.sessionId !== sessionId) return;

            if (newValue.type === 'config') {
                config = newValue;
                outroSignalSent = false;
                console.log('[EspritDonghua v3] (fenetre lecteur) config recue :', config);
                const video = findVideo();
                if (video) applyIntroSkipIfNeeded(video);
                if (video) tryAutoUnmute(video);
            }

            if (newValue.type === 'countdown-start') {
                showNextEpisodeToast(newValue.seconds || 5);
            }
        });
    }

    // ================= Contexte : page principale esprit-donghua.xyz =================
    function runOnTopPage() {
        console.log('[EspritDonghua v3] script demarre');

        const STORE_KEY = 'progress';

        function loadProgress() { return GM_getValue(STORE_KEY, {}); }
        function saveProgress(data) { GM_setValue(STORE_KEY, data); }

        function getSeriesInfo() {
            const seriesLink = document.querySelector('#singlepisode .headlist .det h2 a');
            if (!seriesLink) return null;
            return { url: seriesLink.href, name: seriesLink.textContent.trim() };
        }

        function loadExcludedSeries() { return GM_getValue('excludedSeries', {}); }
        function saveExcludedSeries(data) { GM_setValue('excludedSeries', data); }
        function isSeriesExcluded(seriesUrl) { return !!loadExcludedSeries()[seriesUrl]; }
        function setSeriesExcluded(seriesUrl, excluded) {
            const all = loadExcludedSeries();
            if (excluded) all[seriesUrl] = true; else delete all[seriesUrl];
            saveExcludedSeries(all);
        }

        function loadAutoUnmute() { return GM_getValue('autoUnmute', {}); }
        function saveAutoUnmute(data) { GM_setValue('autoUnmute', data); }
        function isAutoUnmuteEnabled(seriesUrl) { return !!loadAutoUnmute()[seriesUrl]; }
        function setAutoUnmuteEnabled(seriesUrl, enabled) {
            const all = loadAutoUnmute();
            if (enabled) all[seriesUrl] = true; else delete all[seriesUrl];
            saveAutoUnmute(all);
        }

        // Reglage propre a la v3 : ouverture automatique de la fenetre separee
        // a chaque chargement de page d'episode (sinon il faut cliquer sur
        // "Ouvrir le lecteur" a chaque episode).
        function isPopupAutoOpenEnabled() { return GM_getValue('popupAutoOpen', true); }
        function setPopupAutoOpenEnabled(value) { GM_setValue('popupAutoOpen', value); }

        function recordCurrentEpisode() {
            const episodeMeta = document.querySelector('meta[itemprop="episodeNumber"]');
            if (!episodeMeta) return;

            const series = getSeriesInfo();
            const titleEl = document.querySelector('h1.entry-title');
            if (!series || !titleEl) return;
            if (isSeriesExcluded(series.url)) return;

            const seriesUrl = series.url;
            const seriesName = series.name;
            const episodeLabel = titleEl.textContent.trim();
            const episodeNumber = episodeMeta.getAttribute('content');

            const progress = loadProgress();
            progress[seriesUrl] = {
                seriesName, seriesUrl, episodeLabel, episodeNumber,
                episodeUrl: location.href,
                watchedAt: new Date().toISOString()
            };
            saveProgress(progress);
        }

        function formatDate(iso) { return new Date(iso).toLocaleString('fr-FR'); }

        function showProgressPanel() { buildPersistentPanel(); }

        function buildHtml() {
            const progress = loadProgress();
            const entries = Object.values(progress)
                .filter(e => !isSeriesExcluded(e.seriesUrl))
                .sort((a, b) => a.seriesName.localeCompare(b.seriesName));

            let items;
            if (entries.length === 0) {
                items = '<p>Aucun anime suivi pour le moment.</p>';
            } else {
                items = '<ul>';
                entries.forEach(e => {
                    items += '<li><strong>' + e.seriesName + '</strong> - ' + e.episodeLabel +
                        ' - <a href="' + e.episodeUrl + '">Reprendre ici</a>' +
                        ' <span style="color:#888;font-size:12px;">(' + formatDate(e.watchedAt) + ')</span></li>';
                });
                items += '</ul>';
            }

            return '<!doctype html><html><head><meta charset="utf-8">' +
                '<meta name="viewport" content="width=device-width, initial-scale=1">' +
                '<title>Ma progression - Esprit Donghua</title>' +
                '<style>body{font-family:Arial,sans-serif;background:#0d0d12;color:#eee;padding:20px;} a{color:#03d0fc;} li{margin-bottom:12px;font-size:15px;}</style>' +
                '</head><body><h1>Ma progression - Esprit Donghua</h1>' + items + '</body></html>';
        }

        function downloadHtml(filename) {
            const blob = new Blob([buildHtml()], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
        }

        function exportProgress() { downloadHtml('ma-progression-donghua.html'); }

        function maybeAutoExport() {
            const progress = loadProgress();
            if (Object.keys(progress).length === 0) return;
            const today = new Date().toISOString().slice(0, 10);
            const lastAutoExport = GM_getValue('lastAutoExport', null);
            if (lastAutoExport === today) return;
            downloadHtml(`ma-progression-donghua-${today}.html`);
            GM_setValue('lastAutoExport', today);
        }

        function getEpisodeDurationMinutes() {
            const speText = document.querySelector('.single-info .spe')?.textContent || '';
            const match = speText.match(/Dure\s*:\s*(\d+)\s*min/i);
            return match ? parseInt(match[1], 10) : 20;
        }

        function getNextEpisodeUrl() {
            let nextLink = document.querySelector('.naveps.bignav a[rel="next"]');
            if (nextLink) return nextLink.href;
            const navContainer = document.querySelector('.naveps.bignav');
            if (!navContainer) return null;
            const navItems = navContainer.querySelectorAll('.nvs');
            if (navItems.length === 0) return null;
            const lastItem = navItems[navItems.length - 1];
            const link = lastItem.querySelector('a[href]');
            return link ? link.href : null;
        }

        function isAutoNextEnabled() { return GM_getValue('autoNextEnabled', true); }
        function setAutoNextEnabled(value) { GM_setValue('autoNextEnabled', value); }

        function loadIntroOutro() { return GM_getValue('introOutro', {}); }
        function saveIntroOutro(data) { GM_setValue('introOutro', data); }
        function getIntroOutroForSeries(seriesUrl) { return loadIntroOutro()[seriesUrl] || {}; }
        function setIntroOutroForSeries(seriesUrl, patch) {
            const all = loadIntroOutro();
            all[seriesUrl] = Object.assign({}, all[seriesUrl], patch);
            saveIntroOutro(all);
        }

        function parseTimecode(input) {
            if (!input) return null;
            input = input.trim();
            if (input.indexOf(':') !== -1) {
                const parts = input.split(':').map(p => parseInt(p, 10));
                if (parts.some(isNaN)) return null;
                let seconds = 0;
                for (let i = 0; i < parts.length; i++) seconds = seconds * 60 + parts[i];
                return seconds;
            }
            const n = parseInt(input, 10);
            return isNaN(n) ? null : n;
        }

        function formatTimecode(seconds) {
            if (seconds === undefined || seconds === null) return '';
            const m = Math.floor(seconds / 60);
            const s = seconds % 60;
            return m + ':' + String(s).padStart(2, '0');
        }

        // ---- Specifique v3 : detection de l'URL Odysee et pilotage de la fenetre ----

        let playerWin = null;
        let playerWinStatus = 'jamais-ouvert'; // 'jamais-ouvert' | 'ouvert' | 'bloque'
        let currentSessionId = null;

        function generateSessionId() {
            return 'v3-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        }

        function sendToPlayer(type, payload) {
            if (!currentSessionId) return;
            GM_setValue(CHANNEL_TO_PLAYER, Object.assign({ sessionId: currentSessionId, type, ts: Date.now() }, payload || {}));
        }

        // Convertit une URL d'embed Odysee (utilisee dans l'iframe du site,
        // ex: https://odysee.com/$/embed/<claim>) en URL de la vraie page de
        // visionnage (https://odysee.com/<claim>). Confirme fonctionnel le
        // 2026-09-15 (URL produite : https://odysee.com/AS033:e?r=...).
        function embedUrlToWatchUrl(embedUrl) {
            try {
                const u = new URL(embedUrl, PLAYER_ORIGIN);
                let path = u.pathname;
                const markers = ['/$/embed/', '/%24/embed/', '/embed/'];
                for (const marker of markers) {
                    const idx = path.indexOf(marker);
                    if (idx !== -1) {
                        path = '/' + path.slice(idx + marker.length);
                        break;
                    }
                }
                return PLAYER_ORIGIN + path + u.search;
            } catch (e) {
                console.log('[EspritDonghua v3] impossible de convertir l\'URL embed, on la garde telle quelle', e);
                return embedUrl;
            }
        }

        function getOdyseeWatchUrl(sessionId) {
            const iframe = document.getElementById('odysee-iframe') ||
                document.querySelector('iframe[src*="odysee.com"]');
            if (!iframe || !iframe.src) {
                console.log('[EspritDonghua v3] aucun iframe Odysee trouve sur cette page');
                return null;
            }
            const watchUrl = embedUrlToWatchUrl(iframe.src);
            console.log('[EspritDonghua v3] URL iframe detectee :', iframe.src, '-> URL fenetre separee :', watchUrl);
            const separator = watchUrl.indexOf('#') !== -1 ? '&' : '#';
            return watchUrl + separator + PLAYER_MARKER + ':' + sessionId;
        }

        // Ouvre (ou reutilise/navigue) la fenetre nommee du lecteur. Si aucune
        // fenetre de ce nom n'existe deja et qu'on n'est pas dans un vrai geste
        // utilisateur (clic), le navigateur bloquera l'ouverture : on le
        // detecte et on l'affiche clairement dans le panneau plutot que
        // d'echouer en silence.
        function openOrUpdatePlayerWindow(reason) {
            currentSessionId = generateSessionId();
            const url = getOdyseeWatchUrl(currentSessionId);
            if (!url) {
                playerWinStatus = 'bloque';
                updatePlayerStatusUI('Aucune video Odysee detectee sur cette page');
                return;
            }

            const win = window.open(url, WINDOW_NAME);
            if (!win || win.closed) {
                playerWinStatus = 'bloque';
                console.log('[EspritDonghua v3] ouverture de la fenetre bloquee (' + reason + ')');
                updatePlayerStatusUI('Bloque par le navigateur - clique sur "Ouvrir le lecteur"');
                return;
            }

            playerWin = win;
            playerWinStatus = 'ouvert';
            try { win.focus(); } catch (e) {}
            console.log('[EspritDonghua v3] fenetre du lecteur ouverte/mise a jour (' + reason + '), session', currentSessionId);
            updatePlayerStatusUI('Ouvert');

            sessionStorage.setItem('espritdonghua-popup-opened-for', location.href);
        }

        // Au chargement d'une page d'episode : on essaie de suivre
        // automatiquement (utile apres un passage a l'episode suivant, ou la
        // fenetre nommee existe deja et n'exige donc pas de nouveau clic). On
        // evite de relancer inutilement si on a deja ouvert pour CETTE page
        // precise dans cet onglet (ex: simple rafraichissement manuel).
        function maybeAutoOpenPlayerWindow() {
            if (!isPopupAutoOpenEnabled()) return;
            const series = getSeriesInfo();
            if (!series || isSeriesExcluded(series.url)) return;
            if (sessionStorage.getItem('espritdonghua-popup-opened-for') === location.href) {
                console.log('[EspritDonghua v3] fenetre deja ouverte pour cet episode dans cet onglet, pas de nouvel appel automatique');
                return;
            }
            openOrUpdatePlayerWindow('auto au chargement de la page');
        }

        function updatePlayerStatusUI(text) {
            const el = document.getElementById('ep-player-status');
            if (el) el.textContent = text;
        }

        function sendConfigToPlayer() {
            const series = getSeriesInfo();
            if (!series) return;
            const introOutro = getIntroOutroForSeries(series.url);
            sendToPlayer('config', {
                introEnd: introOutro.introEnd || null,
                outroStart: introOutro.outroStart || null,
                autoUnmute: isAutoUnmuteEnabled(series.url)
            });
            console.log('[EspritDonghua v3] config envoyee (canal GM) :', introOutro);
        }

        function promptIntroEnd() {
            const series = getSeriesInfo();
            if (!series) { alert('Impossible de determiner la serie sur cette page.'); return; }
            const current = getIntroOutroForSeries(series.url).introEnd;
            const input = prompt('Fin du generique de debut pour "' + series.name + '" (format mm:ss ou secondes) :', formatTimecode(current));
            const seconds = parseTimecode(input);
            if (seconds === null) return;
            setIntroOutroForSeries(series.url, { introEnd: seconds });
            sendConfigToPlayer();
        }

        function promptOutroStart() {
            const series = getSeriesInfo();
            if (!series) { alert('Impossible de determiner la serie sur cette page.'); return; }
            const current = getIntroOutroForSeries(series.url).outroStart;
            const input = prompt('Debut du generique de fin pour "' + series.name + '" (format mm:ss ou secondes) :', formatTimecode(current));
            const seconds = parseTimecode(input);
            if (seconds === null) return;
            setIntroOutroForSeries(series.url, { outroStart: seconds });
            sendConfigToPlayer();
        }

        let triggerNextEpisode = null;
        let cancelPendingCountdown = null;

        function showNextEpisodeCountdown(nextUrl) {
            const COUNTDOWN_SECONDS = 5;
            let seconds = COUNTDOWN_SECONDS;
            let cancelled = false;

            const sentToPlayer = playerWinStatus === 'ouvert';
            if (sentToPlayer) {
                sendToPlayer('countdown-start', { seconds: COUNTDOWN_SECONDS });
            }

            let fallbackToast = null;
            if (!sentToPlayer) {
                fallbackToast = document.createElement('div');
                fallbackToast.id = 'ep-next-toast';
                fallbackToast.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:1000000;background:#15151f;color:#eee;padding:14px 18px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.5);font-family:Arial,sans-serif;display:flex;align-items:center;gap:12px;';
                fallbackToast.innerHTML = '<span id="ep-toast-text" style="font-size:13px;">Episode suivant dans ' + seconds + 's...</span>' +
                    '<button id="ep-toast-cancel" style="background:#333;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;">Annuler</button>';
                document.body.appendChild(fallbackToast);
                fallbackToast.querySelector('#ep-toast-cancel').addEventListener('click', () => {
                    if (cancelPendingCountdown) cancelPendingCountdown();
                });
            }

            const interval = setInterval(() => {
                if (cancelled) { clearInterval(interval); return; }
                seconds--;
                if (fallbackToast) {
                    const textEl = fallbackToast.querySelector('#ep-toast-text');
                    if (textEl) textEl.textContent = 'Episode suivant dans ' + seconds + 's...';
                }
                if (seconds <= 0) {
                    clearInterval(interval);
                    if (fallbackToast) fallbackToast.remove();
                    cancelPendingCountdown = null;
                    if (isAutoNextEnabled()) location.href = nextUrl;
                }
            }, 1000);

            cancelPendingCountdown = () => {
                cancelled = true;
                clearInterval(interval);
                if (fallbackToast) fallbackToast.remove();
                cancelPendingCountdown = null;
                console.log('[EspritDonghua v3] passage a l\'episode suivant annule par l\'utilisateur');
            };
        }

        function setupAutoNext() {
            const nextUrl = getNextEpisodeUrl();
            console.log('[EspritDonghua v3] lien episode suivant detecte :', nextUrl);
            if (!nextUrl) return;
            if (!isAutoNextEnabled()) return;

            let alreadyTriggered = false;
            const setupStartTime = Date.now();
            triggerNextEpisode = function (reason) {
                if (alreadyTriggered) return;
                if (Date.now() - setupStartTime < 5000) {
                    console.log('[EspritDonghua v3] declenchement ignore, trop tot apres le chargement (' + reason + ')');
                    return;
                }
                alreadyTriggered = true;
                if (!isAutoNextEnabled()) return;
                console.log('[EspritDonghua v3] declenchement passage episode suivant (' + reason + ')');
                showNextEpisodeCountdown(nextUrl);
            };

            const series = getSeriesInfo();
            const outroStart = series ? getIntroOutroForSeries(series.url).outroStart : null;

            let delayMs;
            if (outroStart) {
                delayMs = outroStart * 1000;
            } else {
                const durationMin = getEpisodeDurationMinutes();
                delayMs = durationMin * 60 * 1000;
            }
            setTimeout(() => triggerNextEpisode('minuteur de secours'), delayMs);
        }

        function buildPersistentPanel() {
            let panel = document.getElementById('ep-panel');
            if (!panel) {
                panel = document.createElement('div');
                panel.id = 'ep-panel';
                panel.style.cssText = 'position:sticky;top:0;left:0;right:0;z-index:999998;background:#15151f;color:#eee;padding:8px 16px;font-family:Arial,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.4);display:flex;align-items:center;gap:14px;flex-wrap:wrap;';
                document.body.insertBefore(panel, document.body.firstChild);
            }

            const progress = loadProgress();
            const entries = Object.values(progress)
                .filter(e => !isSeriesExcluded(e.seriesUrl))
                .sort((a, b) => a.seriesName.localeCompare(b.seriesName));
            const currentSeries = getSeriesInfo();
            const currentEpisodeMeta = document.querySelector('meta[itemprop="episodeNumber"]');

            let html = '<div style="font-weight:bold;color:#03d0fc;font-size:13px;white-space:nowrap;">Ma progression (v3)</div>';

            if (currentSeries && currentEpisodeMeta) {
                const currentLabel = currentSeries.name + ' - Episode ' + currentEpisodeMeta.getAttribute('content');
                html += '<div style="color:gold;font-weight:bold;font-size:13px;">' + currentLabel + '</div>';

                html += '<button id="ep-open-player" style="background:#03d0fc;color:#000;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:bold;white-space:nowrap;">Ouvrir le lecteur</button>';
                html += '<span id="ep-player-status" style="font-size:11px;color:#ccc;white-space:nowrap;">' +
                    (playerWinStatus === 'ouvert' ? 'Ouvert' : playerWinStatus === 'bloque' ? 'Bloque - clique sur "Ouvrir le lecteur"' : 'Pas encore ouvert') +
                    '</span>';

                const trackedChecked = isSeriesExcluded(currentSeries.url) ? '' : 'checked';
                html += '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#ccc;white-space:nowrap;">' +
                    '<input type="checkbox" id="ep-track-series" ' + trackedChecked + '> Suivre cet anime' +
                    '</label>';

                const autoUnmuteChecked = isAutoUnmuteEnabled(currentSeries.url) ? 'checked' : '';
                html += '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#ccc;white-space:nowrap;" title="Tente d\'activer le son automatiquement dans la fenetre separee (filet de securite, generalement inutile en dehors d\'un iframe).">' +
                    '<input type="checkbox" id="ep-autounmute" ' + autoUnmuteChecked + '> Son auto' +
                    '</label>';
            }

            if (entries.length === 0) {
                html += '<div style="font-size:12px;color:#aaa;">Aucun anime suivi.</div>';
            } else {
                html += '<select id="ep-select" style="flex:1;min-width:240px;max-width:500px;padding:6px;border-radius:4px;border:none;background:#000;color:#eee;font-size:12px;">';
                html += '<option value="">-- Choisir un anime --</option>';
                entries.forEach(e => {
                    const label = `${e.seriesName} - Episode ${e.episodeNumber}`;
                    const selected = e.episodeUrl === location.href ? ' selected' : '';
                    html += `<option value="${e.episodeUrl}"${selected}>${label}</option>`;
                });
                html += '</select>';
            }

            const autoNextChecked = isAutoNextEnabled() ? 'checked' : '';
            html += '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#ccc;white-space:nowrap;">' +
                '<input type="checkbox" id="ep-autonext" ' + autoNextChecked + '> Lecture continue' +
                '</label>';

            const popupAutoChecked = isPopupAutoOpenEnabled() ? 'checked' : '';
            html += '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#ccc;white-space:nowrap;" title="Ouvre automatiquement la fenetre separee a chaque episode (necessite un premier clic manuel sur \'Ouvrir le lecteur\' pour debloquer les popups).">' +
                '<input type="checkbox" id="ep-popupauto" ' + popupAutoChecked + '> Fenetre auto' +
                '</label>';

            html += '<button id="ep-set-intro" style="background:#333;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;white-space:nowrap;">Fin intro</button>';
            html += '<button id="ep-set-outro" style="background:#333;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;white-space:nowrap;">Debut outro</button>';
            html += '<button id="ep-settings-btn" style="background:#333;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;white-space:nowrap;">Reglages</button>';
            html += '<button id="ep-export-panel" style="background:#03d0fc;color:#000;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:bold;white-space:nowrap;">Exporter</button>';

            panel.innerHTML = html;

            const select = panel.querySelector('#ep-select');
            if (select) {
                select.addEventListener('change', () => { if (select.value) location.href = select.value; });
            }
            const exportBtn = panel.querySelector('#ep-export-panel');
            if (exportBtn) exportBtn.addEventListener('click', exportProgress);

            const openPlayerBtn = panel.querySelector('#ep-open-player');
            if (openPlayerBtn) {
                openPlayerBtn.addEventListener('click', () => openOrUpdatePlayerWindow('clic manuel'));
            }

            const autoNextCheckbox = panel.querySelector('#ep-autonext');
            if (autoNextCheckbox) {
                autoNextCheckbox.addEventListener('change', () => setAutoNextEnabled(autoNextCheckbox.checked));
            }
            const popupAutoCheckbox = panel.querySelector('#ep-popupauto');
            if (popupAutoCheckbox) {
                popupAutoCheckbox.addEventListener('change', () => setPopupAutoOpenEnabled(popupAutoCheckbox.checked));
            }
            const setIntroBtn = panel.querySelector('#ep-set-intro');
            if (setIntroBtn) setIntroBtn.addEventListener('click', promptIntroEnd);
            const setOutroBtn = panel.querySelector('#ep-set-outro');
            if (setOutroBtn) setOutroBtn.addEventListener('click', promptOutroStart);

            const trackCheckbox = panel.querySelector('#ep-track-series');
            if (trackCheckbox && currentSeries) {
                trackCheckbox.addEventListener('change', () => {
                    setSeriesExcluded(currentSeries.url, !trackCheckbox.checked);
                    if (trackCheckbox.checked) recordCurrentEpisode();
                    buildPersistentPanel();
                });
            }
            const autoUnmuteCheckbox = panel.querySelector('#ep-autounmute');
            if (autoUnmuteCheckbox && currentSeries) {
                autoUnmuteCheckbox.addEventListener('change', () => {
                    setAutoUnmuteEnabled(currentSeries.url, autoUnmuteCheckbox.checked);
                    sendConfigToPlayer();
                });
            }
            const settingsBtn = panel.querySelector('#ep-settings-btn');
            if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);
        }

        function openSettingsModal() {
            const progress = loadProgress();
            const entries = Object.values(progress).sort((a, b) => a.seriesName.localeCompare(b.seriesName));

            const overlay = document.createElement('div');
            overlay.id = 'ep-settings-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1000001;display:flex;align-items:center;justify-content:center;';

            const box = document.createElement('div');
            box.style.cssText = 'background:#15151f;color:#eee;max-width:700px;width:92%;max-height:80vh;overflow:auto;border-radius:8px;padding:20px;font-family:Arial,sans-serif;';

            let html = '<h2 style="margin-top:0;color:#03d0fc;font-size:16px;">Reglages des animes suivis (v3)</h2>';
            if (entries.length === 0) {
                html += '<p style="font-size:13px;color:#aaa;">Aucun anime suivi pour le moment.</p>';
            } else {
                html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
                html += '<tr style="text-align:left;color:#aaa;border-bottom:1px solid #333;">' +
                    '<th style="padding:6px 4px;">Anime</th>' +
                    '<th style="padding:6px 4px;">Fin intro</th>' +
                    '<th style="padding:6px 4px;">Debut outro</th>' +
                    '<th style="padding:6px 4px;">Suivi</th>' +
                    '<th style="padding:6px 4px;">Son auto</th>' +
                    '</tr>';
                entries.forEach(e => {
                    const io = getIntroOutroForSeries(e.seriesUrl);
                    const tracked = !isSeriesExcluded(e.seriesUrl);
                    const autoUnmute = isAutoUnmuteEnabled(e.seriesUrl);
                    html += '<tr style="border-bottom:1px solid #222;" data-url="' + e.seriesUrl + '">' +
                        '<td style="padding:6px 4px;">' + e.seriesName + '</td>' +
                        '<td style="padding:6px 4px;"><input type="text" class="ep-set-intro-input" placeholder="mm:ss" style="width:70px;background:#000;color:#eee;border:1px solid #333;border-radius:4px;padding:3px;" value="' + formatTimecode(io.introEnd) + '"></td>' +
                        '<td style="padding:6px 4px;"><input type="text" class="ep-set-outro-input" placeholder="mm:ss" style="width:70px;background:#000;color:#eee;border:1px solid #333;border-radius:4px;padding:3px;" value="' + formatTimecode(io.outroStart) + '"></td>' +
                        '<td style="padding:6px 4px;text-align:center;"><input type="checkbox" class="ep-set-tracked-input" ' + (tracked ? 'checked' : '') + '></td>' +
                        '<td style="padding:6px 4px;text-align:center;"><input type="checkbox" class="ep-set-autounmute-input" ' + (autoUnmute ? 'checked' : '') + '></td>' +
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

            overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
            box.querySelector('#ep-settings-close').addEventListener('click', () => overlay.remove());

            const saveBtn = box.querySelector('#ep-settings-save');
            if (saveBtn) {
                saveBtn.addEventListener('click', () => {
                    box.querySelectorAll('tr[data-url]').forEach(row => {
                        const url = row.getAttribute('data-url');
                        const introSeconds = parseTimecode(row.querySelector('.ep-set-intro-input').value);
                        const outroSeconds = parseTimecode(row.querySelector('.ep-set-outro-input').value);
                        const tracked = row.querySelector('.ep-set-tracked-input').checked;
                        const autoUnmute = row.querySelector('.ep-set-autounmute-input').checked;

                        setIntroOutroForSeries(url, { introEnd: introSeconds, outroStart: outroSeconds });
                        setSeriesExcluded(url, !tracked);
                        setAutoUnmuteEnabled(url, autoUnmute);
                    });
                    overlay.remove();
                    buildPersistentPanel();
                    console.log('[EspritDonghua v3] reglages mis a jour depuis le panneau centralise');
                });
            }
        }

        function listenForPlayerFrame() {
            GM_addValueChangeListener(CHANNEL_TO_OPENER, (name, oldValue, newValue, remote) => {
                if (!remote) return;
                if (!newValue || newValue.sessionId !== currentSessionId) return;

                if (newValue.type === 'ready') {
                    console.log('[EspritDonghua v3] fenetre lecteur prete (canal GM), envoi de la config');
                    sendConfigToPlayer();
                }
                if (newValue.type === 'outro-reached' && triggerNextEpisode) {
                    triggerNextEpisode('signal reel du lecteur (canal GM)');
                }
                if (newValue.type === 'mute-state') {
                    console.log('[EspritDonghua v3] etat du son rapporte par la fenetre lecteur :', newValue.muted);
                }
                if (newValue.type === 'countdown-cancel' && cancelPendingCountdown) {
                    cancelPendingCountdown();
                }
            });
        }

        console.log('[EspritDonghua v3] enregistrement des commandes de menu...');
        GM_registerMenuCommand('Voir ma progression', showProgressPanel);
        GM_registerMenuCommand('Exporter en fichier', exportProgress);
        // Best-effort : selon le navigateur, un clic sur une commande de menu
        // d'extension ne compte pas toujours comme un "vrai" geste utilisateur
        // pour window.open(). Si ca ne marche pas depuis ce menu, utilise le
        // bouton "Ouvrir le lecteur" du panneau.
        GM_registerMenuCommand('Ouvrir le lecteur (fenetre separee)', () => openOrUpdatePlayerWindow('commande menu'));

        recordCurrentEpisode();
        buildPersistentPanel();
        maybeAutoExport();
        setupAutoNext();
        listenForPlayerFrame();
        maybeAutoOpenPlayerWindow();
        console.log('[EspritDonghua v3] script termine sans erreur');
    }
})();
