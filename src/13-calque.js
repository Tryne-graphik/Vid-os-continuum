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

