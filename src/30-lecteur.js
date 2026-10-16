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

