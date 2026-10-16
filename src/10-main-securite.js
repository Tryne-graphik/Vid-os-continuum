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

