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

