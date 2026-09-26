// ==UserScript==
// @name         Esprit Donghua - Suivi de progression
// @namespace    esprit-donghua-tracker
// @version      2.7
// @description  Retient le dernier episode ouvert par anime sur esprit-donghua.xyz, lecture continue precise via le lecteur Odysee, et permet de reprendre facilement
// @match        https://esprit-donghua.xyz/*
// @match        https://odysee.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
    'use strict';

    const PARENT_ORIGIN = 'https://esprit-donghua.xyz';
    const PLAYER_ORIGIN = 'https://odysee.com';
    const isTopFrame = (window.top === window.self);

    if (!isTopFrame && location.hostname.indexOf('odysee.com') !== -1) {
        runInsidePlayerFrame();
        return;
    }

    if (isTopFrame && location.hostname.indexOf('esprit-donghua.xyz') !== -1) {
        runOnTopPage();
    }

    // ================= Contexte : iframe Odysee =================
    function runInsidePlayerFrame() {
        console.log('[EspritDonghua] (frame Odysee) script demarre');

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

        // Le lecteur Odysee n'insere la balise <video> qu'apres un clic sur le gros
        // bouton "lecture" affiche au centre. Sans utilisateur pour cliquer (navigation
        // automatique), rien ne se charge jamais : on simule ce clic nous-memes.
        let autoClicked = false;

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
                    autoClicked = true;
                    console.log('[EspritDonghua] (frame Odysee) clic automatique sur le bouton lecture (' + selectors[i] + ')');
                    return true;
                }
            }
            return false;
        }

        let autoClickAttempts = 0;
        const autoClickInterval = setInterval(() => {
            if (videoFound || autoClickAttempts > 20) {
                clearInterval(autoClickInterval);
                return;
            }
            autoClickAttempts++;
            tryClickBigPlayButton();
        }, 500);

        // Si le lecteur Odysee reste bloque (ex: "Resoudre...") apres une navigation
        // automatique, on tente un rechargement unique de la frame.
        setTimeout(() => {
            if (videoFound) return;
            const reloadKey = 'espritdonghua-reload-' + location.href;
            if (sessionStorage.getItem(reloadKey)) {
                console.log('[EspritDonghua] (frame Odysee) video toujours non chargee apres rechargement, abandon');
                return;
            }
            sessionStorage.setItem(reloadKey, '1');
            console.log('[EspritDonghua] (frame Odysee) video non chargee apres 10s, rechargement automatique de la frame');
            location.reload();
        }, 10000);

        function applyIntroSkipIfNeeded(video) {
            if (!config || !config.introEnd) return;
            if (video.currentTime < config.introEnd) {
                video.currentTime = config.introEnd;
                const playAttempt = video.play();
                if (playAttempt && playAttempt.catch) playAttempt.catch(() => {});
                console.log('[EspritDonghua] (frame Odysee) intro sautee, demarrage a ' + config.introEnd + 's');
            }
        }

        // Tentative (experimentale) de reactivation automatique du son. Chrome bloque
        // le son sur une video sans "geste utilisateur" reel sur cette page precise ;
        // sans ce geste, il peut aussi mettre la video en PAUSE quand on force
        // video.muted = false. On ne tente donc l'operation qu'une fois par episode
        // (reglage "Son auto" active pour la serie), et on relance la lecture au cas
        // ou Chrome l'aurait coupee, pour ne jamais rester bloque meme si le son, lui,
        // reste coupe.
        let autoUnmuteAttempted = false;

        function tryAutoUnmute(video, force) {
            if (!config || !config.autoUnmute) return;
            if (autoUnmuteAttempted && !force) return;
            autoUnmuteAttempted = true;
            console.log('[EspritDonghua] (frame Odysee) tentative d\'activation automatique du son (experimental)' + (force ? ' [suite a un vrai clic]' : ''));

            let recovered = false;
            function recoverIfPaused() {
                if (recovered || !video.paused) return;
                recovered = true;
                // Important : si on relance simplement video.play() sans remettre muted a
                // true, Chrome considere que c'est une nouvelle tentative de lecture
                // automatique AVEC son sans geste utilisateur, et la bloque aussi en
                // silence -> la video reste coincee en pause sans aucun bouton. On repasse
                // donc en muet (toujours autorise sans geste) avant de relancer.
                console.log('[EspritDonghua] (frame Odysee) Chrome a mis la video en pause suite a la tentative de son, remise en muet et relance de la lecture');
                try { video.muted = true; } catch (e) {}
                const p = video.play();
                if (p && p.catch) p.catch(() => {});
            }

            video.addEventListener('pause', recoverIfPaused);
            try {
                video.muted = false;
            } catch (e) {}
            setTimeout(() => {
                recoverIfPaused();
                video.removeEventListener('pause', recoverIfPaused);
            }, 1500);
        }

        // Regroupe "plein ecran" et "son" sur le meme clic : un vrai clic de
        // l'utilisateur a l'interieur du lecteur (ex: sur le bouton plein
        // ecran d'Odysee) est un geste authentique sur la bonne origine
        // (odysee.com), contrairement au clic simule sur "lecture" plus haut
        // (non fiable pour debloquer le son) ou a un bouton place sur la page
        // esprit-donghua.xyz (mauvaise origine, ne compte pas pour Chrome).
        // On profite donc de CE clic pour retenter l'activation du son, sans
        // que l'utilisateur ait besoin de cliquer une deuxieme fois sur
        // l'icone son.
        let lastRealUnmuteAttempt = 0;
        document.addEventListener('click', (e) => {
            if (!e.isTrusted) return; // ignore le clic simule sur "lecture"
            if (!config || !config.autoUnmute) return;
            const video = findVideo();
            if (!video || !video.muted) return;
            const now = Date.now();
            if (now - lastRealUnmuteAttempt < 1000) return; // evite le spam sur clics rapproches
            lastRealUnmuteAttempt = now;
            console.log('[EspritDonghua] (frame Odysee) vrai clic utilisateur detecte (ex: plein ecran), nouvelle tentative de son');
            tryAutoUnmute(video, true);
        }, true);

        waitForVideo((video) => {
            console.log('[EspritDonghua] (frame Odysee) element video trouve, envoi du signal pret');
            window.parent.postMessage({ type: 'espritdonghua-ready' }, PARENT_ORIGIN);

            if (config) applyIntroSkipIfNeeded(video);
            if (config) tryAutoUnmute(video);

            // On informe la page principale de l'etat du son, pour qu'elle puisse
            // l'afficher clairement (on ne peut pas le forcer nous-memes, voir plus haut).
            function reportMuteState() {
                window.parent.postMessage({ type: 'espritdonghua-mute-state', muted: video.muted }, PARENT_ORIGIN);
            }
            reportMuteState();
            video.addEventListener('volumechange', reportMuteState);

            video.addEventListener('timeupdate', () => {
                if (!config || !config.outroStart || outroSignalSent) return;
                if (video.currentTime >= config.outroStart) {
                    outroSignalSent = true;
                    console.log('[EspritDonghua] (frame Odysee) debut generique de fin atteint, signal envoye');
                    window.parent.postMessage({ type: 'espritdonghua-outro-reached' }, PARENT_ORIGIN);
                }
            });
        });

        // Affiche le message "episode suivant dans Xs" a l'interieur du lecteur, pour qu'il
        // reste visible meme en plein ecran (la page principale, elle, est masquee dans ce cas).
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
                window.parent.postMessage({ type: 'espritdonghua-countdown-cancel' }, PARENT_ORIGIN);
                console.log('[EspritDonghua] (frame Odysee) annulation du passage a l\'episode suivant');
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

        window.addEventListener('message', (event) => {
            if (event.origin !== PARENT_ORIGIN) return;
            if (!event.data || !event.data.type) return;

            if (event.data.type === 'espritdonghua-config') {
                config = event.data;
                outroSignalSent = false;
                console.log('[EspritDonghua] (frame Odysee) config recue :', config);
                const video = findVideo();
                if (video) applyIntroSkipIfNeeded(video);
                if (video) tryAutoUnmute(video);
            }

            if (event.data.type === 'espritdonghua-countdown-start') {
                showNextEpisodeToast(event.data.seconds || 5);
            }
        });
    }

    // ================= Contexte : page principale esprit-donghua.xyz =================
    function runOnTopPage() {
        console.log('[EspritDonghua] script demarre');

        const STORE_KEY = 'progress';

        function loadProgress() {
            return GM_getValue(STORE_KEY, {});
        }

        function saveProgress(data) {
            GM_setValue(STORE_KEY, data);
        }

        function getSeriesInfo() {
            const seriesLink = document.querySelector('#singlepisode .headlist .det h2 a');
            if (!seriesLink) return null;
            return { url: seriesLink.href, name: seriesLink.textContent.trim() };
        }

        function loadExcludedSeries() {
            return GM_getValue('excludedSeries', {});
        }

        function saveExcludedSeries(data) {
            GM_setValue('excludedSeries', data);
        }

        function isSeriesExcluded(seriesUrl) {
            return !!loadExcludedSeries()[seriesUrl];
        }

        function setSeriesExcluded(seriesUrl, excluded) {
            const all = loadExcludedSeries();
            if (excluded) {
                all[seriesUrl] = true;
            } else {
                delete all[seriesUrl];
            }
            saveExcludedSeries(all);
        }

        // Reglage "Son auto" par serie : certaines series ont le son coupe par
        // defaut sur Odysee, d'autres non. Active, le script tente de reactiver le
        // son a chaque episode (experimental, voir tryAutoUnmute() cote lecteur).
        function loadAutoUnmute() {
            return GM_getValue('autoUnmute', {});
        }

        function saveAutoUnmute(data) {
            GM_setValue('autoUnmute', data);
        }

        function isAutoUnmuteEnabled(seriesUrl) {
            return !!loadAutoUnmute()[seriesUrl];
        }

        function setAutoUnmuteEnabled(seriesUrl, enabled) {
            const all = loadAutoUnmute();
            if (enabled) {
                all[seriesUrl] = true;
            } else {
                delete all[seriesUrl];
            }
            saveAutoUnmute(all);
        }

        function recordCurrentEpisode() {
            const episodeMeta = document.querySelector('meta[itemprop="episodeNumber"]');
            if (!episodeMeta) return; // pas une page d'episode

            const series = getSeriesInfo();
            const titleEl = document.querySelector('h1.entry-title');
            if (!series || !titleEl) return;
            if (isSeriesExcluded(series.url)) return; // suivi desactive pour cette serie

            const seriesUrl = series.url;
            const seriesName = series.name;
            const episodeLabel = titleEl.textContent.trim();
            const episodeNumber = episodeMeta.getAttribute('content');

            const progress = loadProgress();
            progress[seriesUrl] = {
                seriesName,
                seriesUrl,
                episodeLabel,
                episodeNumber,
                episodeUrl: location.href,
                watchedAt: new Date().toISOString()
            };
            saveProgress(progress);
        }

        function formatDate(iso) {
            return new Date(iso).toLocaleString('fr-FR');
        }

        function showProgressPanel() {
            buildPersistentPanel();
        }

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
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        }

        function exportProgress() {
            downloadHtml('ma-progression-donghua.html');
        }

        function maybeAutoExport() {
            const progress = loadProgress();
            if (Object.keys(progress).length === 0) return; // rien a sauvegarder

            const today = new Date().toISOString().slice(0, 10); // AAAA-MM-JJ
            const lastAutoExport = GM_getValue('lastAutoExport', null);
            if (lastAutoExport === today) return;

            downloadHtml(`ma-progression-donghua-${today}.html`);
            GM_setValue('lastAutoExport', today);
        }

        function getEpisodeDurationMinutes() {
            const speText = document.querySelector('.single-info .spe')?.textContent || '';
            const match = speText.match(/Dure\s*:\s*(\d+)\s*min/i);
            return match ? parseInt(match[1], 10) : 20; // valeur par defaut si non trouvee
        }

        function getNextEpisodeUrl() {
            // On essaie d'abord l'attribut rel="next" (si le site l'utilise).
            let nextLink = document.querySelector('.naveps.bignav a[rel="next"]');
            if (nextLink) return nextLink.href;

            // Sinon on se base sur la position : le bloc .nvs precedent/suivant/tous-episodes
            // apparait toujours dans l'ordre precedent, milieu, suivant.
            const navContainer = document.querySelector('.naveps.bignav');
            if (!navContainer) return null;
            const navItems = navContainer.querySelectorAll('.nvs');
            if (navItems.length === 0) return null;
            const lastItem = navItems[navItems.length - 1];
            const link = lastItem.querySelector('a[href]');
            return link ? link.href : null;
        }

        function isAutoNextEnabled() {
            return GM_getValue('autoNextEnabled', true);
        }

        function setAutoNextEnabled(value) {
            GM_setValue('autoNextEnabled', value);
        }

        function loadIntroOutro() {
            return GM_getValue('introOutro', {});
        }

        function saveIntroOutro(data) {
            GM_setValue('introOutro', data);
        }

        function getIntroOutroForSeries(seriesUrl) {
            return loadIntroOutro()[seriesUrl] || {};
        }

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

        function sendConfigToPlayer() {
            const series = getSeriesInfo();
            if (!series) return;
            const introOutro = getIntroOutroForSeries(series.url);
            const iframe = document.getElementById('odysee-iframe');
            if (!iframe || !iframe.contentWindow) return;
            iframe.contentWindow.postMessage({
                type: 'espritdonghua-config',
                introEnd: introOutro.introEnd || null,
                outroStart: introOutro.outroStart || null,
                autoUnmute: isAutoUnmuteEnabled(series.url)
            }, PLAYER_ORIGIN);
            console.log('[EspritDonghua] config envoyee au lecteur :', introOutro);
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

            const iframe = document.getElementById('odysee-iframe');
            const sentToPlayer = !!(iframe && iframe.contentWindow);
            if (sentToPlayer) {
                iframe.contentWindow.postMessage({ type: 'espritdonghua-countdown-start', seconds: COUNTDOWN_SECONDS }, PLAYER_ORIGIN);
            }

            // Filet de securite : si jamais on n'a pas pu parler au lecteur (iframe introuvable),
            // on affiche quand meme un message sur la page principale (invisible en plein ecran,
            // mais mieux que rien).
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
                console.log('[EspritDonghua] passage a l\'episode suivant annule par l\'utilisateur');
            };
        }

        function setupAutoNext() {
            const nextUrl = getNextEpisodeUrl();
            console.log('[EspritDonghua] lien episode suivant detecte :', nextUrl);
            if (!nextUrl) {
                console.log('[EspritDonghua] pas de lecture continue : aucun episode suivant trouve sur cette page');
                return;
            }

            if (!isAutoNextEnabled()) {
                console.log('[EspritDonghua] pas de lecture continue : case decochee');
                return;
            }

            let alreadyTriggered = false;
            const setupStartTime = Date.now();
            triggerNextEpisode = function (reason) {
                if (alreadyTriggered) return;
                if (Date.now() - setupStartTime < 5000) {
                    // Declenchement quasi instantane : probablement une video dont le
                    // lecteur se souvenait deja qu'elle etait terminee. On l'ignore et on
                    // laisse le minuteur de secours prendre le relais plus tard.
                    console.log('[EspritDonghua] declenchement ignore, trop tot apres le chargement (' + reason + ')');
                    return;
                }
                alreadyTriggered = true;
                if (!isAutoNextEnabled()) return;
                console.log('[EspritDonghua] declenchement passage episode suivant (' + reason + ')');
                showNextEpisodeCountdown(nextUrl);
            };

            const series = getSeriesInfo();
            const outroStart = series ? getIntroOutroForSeries(series.url).outroStart : null;
            console.log('[EspritDonghua] debut generique de fin configure pour cette serie :', outroStart);

            let delayMs;
            if (outroStart) {
                delayMs = outroStart * 1000;
                console.log('[EspritDonghua] filet de securite programme a ' + outroStart + 's (minuteur de secours, le signal reel du lecteur devrait arriver avant)');
            } else {
                const durationMin = getEpisodeDurationMinutes();
                delayMs = durationMin * 60 * 1000;
                console.log('[EspritDonghua] filet de securite programme dans ' + durationMin + ' min (estimation, generique de fin non configure)');
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

            let html = '<div style="font-weight:bold;color:#03d0fc;font-size:13px;white-space:nowrap;">Ma progression</div>';

            if (currentSeries && currentEpisodeMeta) {
                const currentLabel = currentSeries.name + ' - Episode ' + currentEpisodeMeta.getAttribute('content');
                html += '<div style="color:gold;font-weight:bold;font-size:13px;">' + currentLabel + '</div>';

                html += '<span id="ep-mute-indicator" hidden style="color:#ff6b6b;font-weight:bold;font-size:12px;white-space:nowrap;">🔇 Son coupe - clique sur l\'icone son du lecteur</span>';

                const trackedChecked = isSeriesExcluded(currentSeries.url) ? '' : 'checked';
                html += '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#ccc;white-space:nowrap;">' +
                    '<input type="checkbox" id="ep-track-series" ' + trackedChecked + '> Suivre cet anime' +
                    '</label>';

                const autoUnmuteChecked = isAutoUnmuteEnabled(currentSeries.url) ? 'checked' : '';
                html += '<label style="display:flex;align-items:center;gap:6px;font-size:11px;color:#ccc;white-space:nowrap;" title="Tente d\'activer le son automatiquement a chaque episode de cette serie (experimental : peut mettre la video en pause quelques instants selon la politique de Chrome).">' +
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

            html += '<button id="ep-set-intro" style="background:#333;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;white-space:nowrap;">Fin intro</button>';
            html += '<button id="ep-set-outro" style="background:#333;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;white-space:nowrap;">Debut outro</button>';
            html += '<button id="ep-settings-btn" style="background:#333;color:#fff;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;white-space:nowrap;">Reglages</button>';
            html += '<button id="ep-export-panel" style="background:#03d0fc;color:#000;border:none;padding:6px 10px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:bold;white-space:nowrap;">Exporter</button>';

            panel.innerHTML = html;

            const select = panel.querySelector('#ep-select');
            if (select) {
                select.addEventListener('change', () => {
                    if (select.value) location.href = select.value;
                });
            }
            const exportBtn = panel.querySelector('#ep-export-panel');
            if (exportBtn) {
                exportBtn.addEventListener('click', exportProgress);
            }
            const autoNextCheckbox = panel.querySelector('#ep-autonext');
            if (autoNextCheckbox) {
                autoNextCheckbox.addEventListener('change', () => {
                    setAutoNextEnabled(autoNextCheckbox.checked);
                });
            }
            const setIntroBtn = panel.querySelector('#ep-set-intro');
            if (setIntroBtn) {
                setIntroBtn.addEventListener('click', promptIntroEnd);
            }
            const setOutroBtn = panel.querySelector('#ep-set-outro');
            if (setOutroBtn) {
                setOutroBtn.addEventListener('click', promptOutroStart);
            }
            const trackCheckbox = panel.querySelector('#ep-track-series');
            if (trackCheckbox && currentSeries) {
                trackCheckbox.addEventListener('change', () => {
                    setSeriesExcluded(currentSeries.url, !trackCheckbox.checked);
                    if (trackCheckbox.checked) {
                        recordCurrentEpisode();
                    }
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
            if (settingsBtn) {
                settingsBtn.addEventListener('click', openSettingsModal);
            }
        }

        function openSettingsModal() {
            const progress = loadProgress();
            const entries = Object.values(progress).sort((a, b) => a.seriesName.localeCompare(b.seriesName));

            const overlay = document.createElement('div');
            overlay.id = 'ep-settings-overlay';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1000001;display:flex;align-items:center;justify-content:center;';

            const box = document.createElement('div');
            box.style.cssText = 'background:#15151f;color:#eee;max-width:700px;width:92%;max-height:80vh;overflow:auto;border-radius:8px;padding:20px;font-family:Arial,sans-serif;';

            let html = '<h2 style="margin-top:0;color:#03d0fc;font-size:16px;">Reglages des animes suivis</h2>';
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

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) overlay.remove();
            });
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
                    console.log('[EspritDonghua] reglages mis a jour depuis le panneau centralise');
                });
            }
        }

        function listenForPlayerFrame() {
            window.addEventListener('message', (event) => {
                if (event.origin !== PLAYER_ORIGIN) return;
                if (!event.data || !event.data.type) return;

                if (event.data.type === 'espritdonghua-ready') {
                    console.log('[EspritDonghua] frame lecteur prete, envoi de la config');
                    sendConfigToPlayer();
                }

                if (event.data.type === 'espritdonghua-outro-reached' && triggerNextEpisode) {
                    triggerNextEpisode('signal reel du lecteur');
                }

                if (event.data.type === 'espritdonghua-mute-state') {
                    const indicator = document.getElementById('ep-mute-indicator');
                    if (indicator) indicator.hidden = !event.data.muted;
                }

                if (event.data.type === 'espritdonghua-countdown-cancel' && cancelPendingCountdown) {
                    cancelPendingCountdown();
                }
            });
        }

        console.log('[EspritDonghua] enregistrement des commandes de menu...');
        GM_registerMenuCommand('Voir ma progression', showProgressPanel);
        GM_registerMenuCommand('Exporter en fichier', exportProgress);
        console.log('[EspritDonghua] commandes de menu enregistrees');

        recordCurrentEpisode();
        buildPersistentPanel();
        maybeAutoExport();
        setupAutoNext();
        listenForPlayerFrame();
        console.log('[EspritDonghua] script termine sans erreur');
    }
})();
