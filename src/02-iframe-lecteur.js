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

