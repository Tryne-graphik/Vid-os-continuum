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
