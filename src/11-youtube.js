        // ---- Lecteur alternatif YouTube (episode par episode) ----
        //
        // Lien embed memorise par episode (trouve par recherche, v6.36 : plus
        // de lien colle a la main). Pas de saut intro/outro sur cette source.
        function youtubeOverrideKey(info) { return storageKey(info) + '::' + info.episodeNumber; }
        function loadYoutubeOverrides() { return GM_getValue('youtubeOverrides', {}); }
        function saveYoutubeOverrides(data) { GM_setValue('youtubeOverrides', data); }
        function getYoutubeOverrideUrl(info) { return info ? (loadYoutubeOverrides()[youtubeOverrideKey(info)] || null) : null; }

        // ---- YouTube sans cle d'API (v6.27) ----
        //
        // Une chaine + un mot-cle associes a la serie (une fois, a partir du
        // lien d'une de ses videos). Recherche via la page "rechercher" de la
        // chaine (ytInitialData). Titres "EP 364" ou compilations "EP 365-384"
        // / "EP 201 - EP 250" : episode seul d'abord, sinon la plus petite
        // compilation qui le contient, position = (n - premier) x duree / nb
        // (pas de chapitres sur la chaine testee "Anime Zone", episodes de
        // duree egale ~7 min). Remplace la version v6.5 (cle API obligatoire).
        function getYoutubeChannelAssociation(info) { return GM_getValue('youtubeChannelAssociations', {})[storageKey(info)] || null; }
        function setYoutubeChannelAssociation(info, assoc) {
            const all = GM_getValue('youtubeChannelAssociations', {});
            all[storageKey(info)] = assoc;
            GM_setValue('youtubeChannelAssociations', all);
        }
        function isYoutubeMode(info) { return !!GM_getValue('youtubeMode', {})[storageKey(info)]; }
        function setYoutubeMode(info, on) {
            const all = GM_getValue('youtubeMode', {});
            if (on) all[storageKey(info)] = true; else delete all[storageKey(info)];
            GM_setValue('youtubeMode', all);
        }
        // ucbcb=1 dans les adresses YouTube : evite la page de consentement aux
        // cookies (Europe) qui renvoie une page sans resultats (v6.37).
        function ytInitialJson(html, varName) {
            const m = html.match(new RegExp(varName + '\\s*=\\s*(\\{.+?\\});(?:var |<\\/script>)', 's'));
            return m ? JSON.parse(m[1]) : null;
        }
        function ytTimeToSec(t) { return String(t || '').split(':').reduce((acc, x) => acc * 60 + Number(x), 0); }
        // Titre YouTube -> nom compare sans accents/espaces/ponctuation.
        function ytNorm(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ''); }
        // "EP 364", "Episode 364", "EP 365-384", "EP 201 - EP 250" -> {first,last}
        // contenant n, sinon null (v6.34 : "Episode N" n'etait pas reconnu).
        function episodeRangeInTitle(title, n) {
            const re = /\b(?:ep(?:isode|isodio)?s?|[eé]pisode)\.?\s*(\d+)(?:\s*(?:-|~|à|a|to)\s*(?:ep(?:isode)?\.?\s*)?(\d+))?/gi;
            let m;
            while ((m = re.exec(title))) {
                const a = Number(m[1]), b = Number(m[2] || m[1]);
                if (n >= a && n <= b && b - a < 200) return { first: a, last: b };
            }
            return null;
        }
        // v7.1 : nom de la serie en mots entiers ("The Demon Hunter's Romance",
        // serie live, passait pour "The Demon Hunter") et pas d'autre saison
        // annoncee ("S2", "Season 3", "Saison 2", "S02E480", "Nom 2 EP17").
        // ponytail: saison du titre comparee a celle de l'adresse du site ; une chaine qui numerote autrement est ecartee
        function ytWords(t) { return ' ' + String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]s\b/g, 's').replace(/[^a-z0-9]+/g, ' ').trim() + ' '; }
        function ytTitleOk(title, name, season) {
            const t = ytWords(title), k = ytWords(name);
            const at = t.indexOf(k);
            if (k.length < 4 || at === -1) return false;
            const m = t.match(/ s(?:eason|aison)? ?0?(\d{1,2})(?= |e\d)/) || t.slice(at + k.length).match(/^(\d{1,2}) (?:ep|episode)/);
            return !m || Number(m[1]) === season;
        }
        function seriesSeason(info) {
            const url = info.resumeUrl || info.pageUrl || '';
            const sea = seasonOf(url);
            return sea ? Math.floor(sea.n) : Number((url.match(/-s(\d+)-e\d+/) || [])[1]) || 1;
        }
        // Recherche YouTube generale (v6.34, sans cle d'API) quand la video
        // cale ou est morte : resultats dont le titre contient un des noms de
        // la serie (avant / entre parentheses) ET le numero d'episode.
        // v6.37 : chaque nom x ("episode N vostfr", "EP N") - les compilations
        // sont souvent titrees avec le nom anglais ("Ten Thousand Worlds EP 181 - EP 200").
        function searchYoutubeForEpisode(info) {
            const n = Number(info.episodeNumber);
            const full = info.seriesName || '';
            const names = [full.replace(/\([^)]*\)/g, ' ').trim(), (full.match(/\(([^)]+)\)/) || [])[1], full]
                .filter((v) => v && ytNorm(v).length >= 4);
            if (!n || !names.length) return Promise.resolve([]);
            const queries = [];
            names.slice(0, 2).forEach((v) => queries.push(v + ' episode ' + n + ' vostfr', v + ' EP ' + n));
            const seen = {}, out = [];
            const season = seriesSeason(info);
            // Duree de l'episode si le lecteur du site l'a donnee : ecarte un episode unique 2x trop long/court.
            const dur = aniSkip && aniSkip.key === storageKey(info) && aniSkip.ep === info.episodeNumber && aniSkip.duration;
            return Promise.all(queries.map((q) => fetchPageHtml('https://www.youtube.com/results?hl=fr&ucbcb=1&search_query=' + encodeURIComponent(q)).catch(() => ''))).then((pages) => {
                pages.forEach((html) => (function walk(o) {
                    if (Array.isArray(o)) { o.forEach(walk); return; }
                    if (!o || typeof o !== 'object') return;
                    if (o.videoId && o.title && o.lengthText && o.ownerText && !seen[o.videoId]) {
                        seen[o.videoId] = true;
                        const title = o.title.simpleText || (o.title.runs || []).map((r) => r.text).join('');
                        const owner = (o.ownerText.runs || [])[0] || {};
                        const be = owner.navigationEndpoint && owner.navigationEndpoint.browseEndpoint;
                        const name = names.find((v) => ytTitleOk(title, v, season));
                        const range = episodeRangeInTitle(title, n);
                        // Extraits / bandes-annonces : pas l'episode entier.
                        const teaser = /highlight|trailer|preview|teaser|bande[- ]annonce|apercu|aperçu|clip|shorts?/i.test(title);
                        const vf = /vostfr|\bfr\b|fran[cç]ais/i.test(title);
                        // Badge "Sous-titres" = vraie piste traduisible en FR. Sans
                        // badge ni FR : sous-titres anglais incrustes, ecartee (v6.35).
                        const cc = /"label":"(?:Sous-titres|CC|Subtitles)"/.test(JSON.stringify(o.badges || []));
                        const len = ytTimeToSec(o.lengthText.simpleText);
                        const badLen = dur && range && range.first === range.last && (len > dur * 1.6 || len < dur * 0.5);
                        if (name && range && be && be.browseId && !teaser && !badLen && (vf || cc)) {
                            out.push({ id: o.videoId, title: title, len: len, channelId: be.browseId, channelName: owner.text || '',
                                keyword: name, first: range.first, last: range.last, vf: vf, score: (vf ? 2 : 0) + (range.first === range.last ? 1 : 0) });
                        }
                    }
                    Object.keys(o).forEach((k) => walk(o[k]));
                })(html && ytInitialJson(html, 'var ytInitialData')));
                return out.sort((a, b) => (b.score - a.score) || ((a.last - a.first) - (b.last - b.first))).slice(0, 5);
            });
        }
        // Compilation : debut de chaque episode lu dans les chapitres de la
        // video (v6.36) si chaque episode a le sien ("EP 366", ou autant de
        // chapitres que d'episodes) ; sinon duree / nb d'episodes.
        function chapterStarts(html, first, last) {
            const chaps = [];
            (function walk(o) {
                if (Array.isArray(o)) { o.forEach(walk); return; }
                if (!o || typeof o !== 'object') return;
                if (o.chapterRenderer) chaps.push({ t: Math.floor(Number(o.chapterRenderer.timeRangeStartMillis) / 1000), title: (o.chapterRenderer.title || {}).simpleText || '' });
                Object.keys(o).forEach((k) => walk(o[k]));
            })(ytInitialJson(html, 'var ytInitialData'));
            const count = last - first + 1, starts = [];
            chaps.forEach((c) => {
                const m = c.title.match(/\b(?:ep(?:isode)?s?|[eé]pisode)\.?\s*(\d+)/i);
                const n = m && Number(m[1]);
                if (n >= first && n <= last && starts[n - first] === undefined) starts[n - first] = c.t;
            });
            // Chapitres sans numero d'episode : un par episode, dans l'ordre.
            if (!starts.length) return chaps.length === count ? chaps.map((c) => c.t) : null;
            for (let i = 0; i < count; i++) if (starts[i] === undefined) return null;
            return starts;
        }
        function positionHit(hit, n) {
            hit.perEp = hit.len / (hit.last - hit.first + 1);
            hit.start = Math.floor((n - hit.first) * hit.perEp);
            if (hit.first === hit.last) return Promise.resolve(hit);
            return fetchPageHtml('https://www.youtube.com/watch?ucbcb=1&v=' + hit.id).then((html) => {
                const starts = chapterStarts(html, hit.first, hit.last);
                if (starts) { hit.starts = starts; hit.start = starts[n - hit.first]; }
                return hit;
            }).catch(() => hit);
        }
        // Resultat choisi : chaine retenue pour la serie (bascule auto ensuite)
        // + cet episode lu tout de suite sur cette video.
        function useYoutubeSearchResult(info, r) {
            setYoutubeChannelAssociation(info, { channelId: r.channelId, channelHandle: null, channelName: r.channelName, titleKeyword: r.keyword });
            const hit = { id: r.id, title: r.title, first: r.first, last: r.last, len: r.len };
            setStatus('Ouverture de la video YouTube...');
            positionHit(hit, Number(info.episodeNumber)).then(() => {
                storeYoutubeHit(info, hit);
                setYoutubeMode(info, true);
                console.log('[AnimeTracker v6] YouTube (resultat choisi) : ' + r.title + ' - chaine ' + r.channelName + ' retenue pour la serie' + (hit.starts ? ' (chapitres)' : ''));
                applyLoadedEpisode(info, false, true);
            });
        }
        // Vignettes des resultats de la recherche YouTube dans `zone` ; clic =
        // useYoutubeSearchResult (+ onPick, ex. fermer l'encadre).
        function renderYoutubeChoices(zone, info, onPick) {
            return searchYoutubeForEpisode(info).then((results) => {
                if (!zone.isConnected || currentEpisode !== info) return;
                if (!results.length) { zone.textContent = 'Rien de sur trouve sur YouTube (nom + episode ' + info.episodeNumber + ').'; return; }
                zone.innerHTML = '<div style="margin-bottom:4px;">Sur YouTube (clique pour regarder) :</div>' + results.map((r, i) =>
                    '<div data-yt="' + i + '" role="button" tabindex="0" style="display:flex;gap:8px;align-items:center;cursor:pointer;background:#1f1508;border:1px solid #5a4010;border-radius:6px;padding:4px;margin-bottom:4px;">' +
                    '<img src="https://i.ytimg.com/vi/' + escapeHtml(r.id) + '/mqdefault.jpg" style="width:96px;height:54px;object-fit:cover;border-radius:4px;flex-shrink:0;">' +
                    '<div style="min-width:0;"><div style="color:#fff;font-size:12px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">' + escapeHtml(r.title) + '</div>' +
                    '<div style="font-size:11px;"><span style="opacity:.8;">' + escapeHtml(r.channelName) + (r.first !== r.last ? ' - compilation ep. ' + r.first + '-' + r.last : '') + '</span> ' +
                    // VOSTFR = annonce dans le titre ; sinon piste de sous-titres
                    // traduite automatiquement en francais par YouTube.
                    (r.vf ? '<span style="background:#2e7d32;color:#fff;border-radius:3px;padding:0 4px;font-weight:bold;">VOSTFR</span>'
                        : '<span style="background:#b26a00;color:#fff;border-radius:3px;padding:0 4px;font-weight:bold;" title="Sous-titres traduits automatiquement en francais par YouTube">ST auto FR</span>') +
                    '</div></div></div>').join('');
                zone.querySelectorAll('[data-yt]').forEach((el) => el.addEventListener('click', () => {
                    if (onPick) onPick();
                    useYoutubeSearchResult(info, results[Number(el.getAttribute('data-yt'))]);
                }));
            }).catch((e) => { zone.textContent = 'Recherche YouTube impossible : ' + e.message; });
        }
        // Choix de la source (v7.1, remplace le volet "Sources") : lecteurs du
        // site, meme episode sur les autres sites geres, resultats YouTube.
        function showSourceChooser(info) {
            if (!overlayEls) return;
            const box = overlayEls.siteErrorBox;
            const BTN = 'display:block;width:100%;text-align:left;margin-bottom:4px;background:#0d2a33;color:#fff;border:1px solid #03d0fc;padding:6px 8px;border-radius:6px;cursor:pointer;font-size:12px;';
            const head = (t, c) => '<div style="font-weight:bold;color:' + c + ';margin:10px 0 4px;">' + t + '</div>';
            let site = head('Sur ' + escapeHtml(info.siteLabel || 'le site'), '#03d0fc');
            if (ytActive) site += '<button type="button" data-act="site" style="' + BTN + '">&#8617; Revenir au lecteur du site</button>';
            else site += playerCandidates.map((src, i) => '<button type="button" data-act="player" data-i="' + i + '" style="' + BTN + (i === playerCandidateIndex ? 'opacity:.6;cursor:default;' : '') + '"' + (i === playerCandidateIndex ? ' disabled' : '') + '>' +
                'Lecteur ' + (i + 1) + ' &middot; ' + escapeHtml(hostOf(src)) + (i === playerCandidateIndex ? ' &#10003; en cours' : '') + '</button>').join('');
            if (info.site === 'esprit-donghua') site += '<button type="button" data-act="odysee" style="' + BTN + '">Ouvrir sur odysee.com (nouvel onglet)</button>';
            box.setAttribute('data-kind', 'sources');
            box.innerHTML = '<div style="font-size:16px;font-weight:bold;">Sources de l\'épisode ' + escapeHtml(String(info.episodeNumber)) + '</div>' +
                '<div style="font-size:12px;text-align:left;">' + site +
                head('Autres sites', '#ffb300') + '<div id="ed-site-alt" style="color:#d9b77a;">Recherche sur les autres sites...</div>' +
                head('YouTube', '#ff4e45') + '<div id="ed-yt-results" style="color:#d9b77a;">Recherche sur YouTube...</div></div>' +
                '<div style="margin-top:12px;"><button type="button" data-act="close" style="background:#333;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;">Fermer</button></div>';
            box.style.display = 'block';
            box.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
                const act = b.getAttribute('data-act');
                box.style.display = 'none';
                if (act === 'site') leaveYoutubeMode();
                if (act === 'odysee') openCurrentEpisodeOnOdysee();
                if (act === 'player') selectPlayer(Number(b.getAttribute('data-i')));
            }));
            renderElsewhere(box.querySelector('#ed-site-alt'), info, ytActive ? [] : playerCandidates.slice());
            renderYoutubeChoices(box.querySelector('#ed-yt-results'), info, () => { box.style.display = 'none'; });
        }
        function findYoutubeEpisode(assoc, n, season) {
            const path = assoc.channelId ? 'channel/' + assoc.channelId : assoc.channelHandle;
            const search = (q) => fetchPageHtml('https://www.youtube.com/' + path + '/search?ucbcb=1&query=' + encodeURIComponent(q)).then((html) => {
                const vids = [];
                (function walk(o) {
                    if (Array.isArray(o)) { o.forEach(walk); return; }
                    if (!o || typeof o !== 'object') return;
                    if (o.videoId && o.title && o.lengthText) vids.push({ id: o.videoId, title: o.title.simpleText || (o.title.runs || []).map((r) => r.text).join(''), len: ytTimeToSec(o.lengthText.simpleText) });
                    Object.keys(o).forEach((k) => walk(o[k]));
                })(ytInitialJson(html, 'var ytInitialData'));
                let best = null;
                vids.forEach((v) => {
                    if (!v.len || !ytTitleOk(v.title, assoc.titleKeyword, season)) return;
                    const r = episodeRangeInTitle(v.title, n);
                    if (!r) return;
                    const a = r.first, b = r.last;
                    if (!best || (b - a) < (best.last - best.first)) best = { id: v.id, title: v.title, first: a, last: b, len: v.len };
                });
                return best && positionHit(best, n);
            });
            return search(assoc.titleKeyword + ' EP ' + n).then((hit) => hit || search(assoc.titleKeyword));
        }
        // Le fragment #vcseg garde les bornes de la compilation : le suivi
        // avance tout seul quand la video passe a l'episode suivant.
        function youtubeEmbedFor(hit) {
            return 'https://www.youtube.com/embed/' + hit.id + '?autoplay=1&start=' + hit.start + '&cc_load_policy=1&cc_lang_pref=fr&hl=fr#vcseg=' + hit.first + '-' + hit.last + '-' + Math.round(hit.perEp) + (hit.starts ? '-' + hit.starts.join('.') : '');
        }
        function storeYoutubeHit(info, hit) {
            const all = loadYoutubeOverrides();
            all[youtubeOverrideKey(info)] = youtubeEmbedFor(hit);
            saveYoutubeOverrides(all);
        }
        // Bascule l'episode (et la suite de la serie) sur YouTube.
        function switchToYoutube(info, reason) {
            const go = (assoc) => {
                if (!assoc) return;
                setStatus('Recherche de l\'episode ' + info.episodeNumber + ' sur YouTube (' + assoc.channelName + ')...');
                return findYoutubeEpisode(assoc, Number(info.episodeNumber), seriesSeason(info)).then((hit) => {
                    if (!hit) { setStatus('Episode ' + info.episodeNumber + ' introuvable sur la chaine YouTube ' + assoc.channelName + ' : choisis une autre video.'); showSourceChooser(info); return; }
                    storeYoutubeHit(info, hit);
                    setYoutubeMode(info, true);
                    console.log('[AnimeTracker v6] YouTube (' + reason + ') : ' + hit.title + ' a ' + hit.start + 's');
                    applyLoadedEpisode(info, false, true);
                }).catch((e) => setStatus('Recherche YouTube impossible : ' + e.message));
            };
            const assoc = getYoutubeChannelAssociation(info);
            if (assoc && assoc.titleKeyword && (assoc.channelId || assoc.channelHandle)) return go(assoc);
            showSourceChooser(info);
        }
        function useYoutubeAutoForCurrentEpisode() {
            if (!currentEpisode) { alert('Ouvre d\'abord un episode.'); return; }
            showSourceChooser(currentEpisode);
        }
        function leaveYoutubeMode() {
            if (!currentEpisode) return;
            setYoutubeMode(currentEpisode, false);
            // Oublie tous les liens YouTube memorises de la serie (sinon l'episode
            // de la page relue repartait sur YouTube).
            const prefix = storageKey(currentEpisode) + '::';
            const overrides = loadYoutubeOverrides();
            Object.keys(overrides).forEach((k) => { if (k.indexOf(prefix) === 0) delete overrides[k]; });
            saveYoutubeOverrides(overrides);
            ytActive = false;
            // Sites "une page par episode" : l'episode suivi sur YouTube n'a ni
            // lecteur ni liens suivant/precedent du site -> on relit la vraie
            // page (sinon "Aucun episode suivant detecte", signale v6.27).
            if (currentEpisode.navStyle === 'page') {
                setStatus('Retour a la source du site...');
                // Page re-telechargee : dans la page affichee, notre script a deja
                // neutralise le lecteur du site (about:blank).
                fetchPageHtml(location.href).then((html) => site.extract(new DOMParser().parseFromString(html, 'text/html'), location.href))
                    .then((info) => { if (info) applyLoadedEpisode(info, false, true); else setStatus('Page de l\'episode illisible, recharge la page (F5).'); })
                    .catch(() => setStatus('Page de l\'episode illisible, recharge la page (F5).'));
                return;
            }
            applyLoadedEpisode(currentEpisode, false, true);
        }

        function isAutoNextEnabled() { return GM_getValue('autoNextEnabled', true); }
        function setAutoNextEnabled(v) { GM_setValue('autoNextEnabled', v); }
        function isAutoOpenEnabled() { return GM_getValue('popupAutoOpen', true); }
        function setAutoOpenEnabled(v) { GM_setValue('popupAutoOpen', v); }

        // Filtre "voir seulement ce site" partage entre le panneau et la
        // colonne du lecteur (un seul reglage, applique partout) - demande
        // par l'utilisateur pour naviguer les animes suivis site par site
        // maintenant que la liste est unifiee. 'all' = pas de filtre.
        // 'behind' (defaut v6.29) : resume limite aux sites avec des animes a rattraper ;
        // les listes de series restent completes.
        function getSiteFilter() { return GM_getValue('panelSiteFilter2', 'behind'); }
        function setSiteFilter(v) { GM_setValue('panelSiteFilter2', v); }
        function matchesSiteFilter(siteId) { const f = getSiteFilter(); return f === 'all' || f === 'behind' || f === siteId; }
        function buildSiteFilterOptionsHtml() {
            const current = getSiteFilter();
            const opt = (value, label) => '<option value="' + value + '"' + (current === value ? ' selected' : '') + '>' + label + '</option>';
            return opt('behind', 'Afficher : à rattraper') + opt('all', 'Afficher : tous les sites') + SITES.map((s) => opt(s.id, s.label)).join('');
        }

        // Historique (v6.29) : une ligne par serie regardee (suivie ou non), 50 max.
        const HISTORY_MAX = 50;
        function loadHistory() { return GM_getValue('watchHistory', {}); }
        function saveHistory(h) {
            const keys = Object.keys(h).sort((a, b) => String(h[b].watchedAt).localeCompare(String(h[a].watchedAt)));
            keys.slice(HISTORY_MAX).forEach((k) => delete h[k]);
            GM_setValue('watchHistory', h);
        }
        // Suivie = entree de progression non exclue. Depuis v6.29 un nouvel anime n'est
        // plus suivi d'office : seulement par le bouton, ou si le meme anime est deja
        // suivi sur ce site (saison suivante anime-sama, variante de titre Odysee).
        function isSeriesTracked(key) { return !!loadProgress()[key] && !isSeriesExcluded(key); }
        function hasTrackedSibling(info, progress) {
            const norm = normalizeSeriesName(info.seriesName);
            const excluded = loadExcludedSeries();
            return Object.keys(progress).some((k) => !excluded[k] && progress[k].site === info.site && normalizeSeriesName(progress[k].seriesName) === norm);
        }

        function recordEpisodeProgress(info, force) {
            if (!info || !info.seriesUrl || !info.episodeNumber) return;
            const key = storageKey(info);
            const history = loadHistory();
            history[key] = {
                site: info.site, siteLabel: info.siteLabel, siteTag: info.siteTag,
                seriesName: info.seriesName, seriesUrl: info.seriesUrl,
                episodeLabel: info.episodeLabel, episodeNumber: info.episodeNumber,
                episodeUrl: info.resumeUrl, watchedAt: new Date().toISOString()
            };
            saveHistory(history);
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
            // Saison suivante (v6.49) : animoflix garde la meme entree -> fin de
            // l'annonce ; anime-sama / myfluneo : nouvelle entree, l'ancienne
            // saison (suivie) est retiree du suivi (reste dans l'historique).
            const cur = seasonOf(info.site === 'animoflix' ? info.resumeUrl : info.seriesUrl);
            const newSeasons = loadNewSeasons();
            const nsCount = Object.keys(newSeasons).length;
            if (newSeasons[key] && cur && cur.n >= newSeasons[key].n) delete newSeasons[key];
            const olderSeasons = cur && info.site !== 'animoflix' ? Object.keys(progress).filter((k) => {
                if (k === key || progress[k].site !== info.site) return false;
                const o = seasonOf(progress[k].seriesUrl);
                return o && o.fam === cur.fam && o.n < cur.n;
            }) : [];
            if (Object.keys(newSeasons).length !== nsCount) GM_setValue('newSeasons', newSeasons);
            olderSeasons.forEach(forgetSeasonState);
            if (!progress[key] && !force && !hasTrackedSibling(info, progress) && !olderSeasons.length) return;
            olderSeasons.forEach((k) => { console.log('[AnimeTracker v6] saison precedente retiree du suivi : ' + k); delete progress[k]; });
            progress[key] = {
                site: info.site, siteLabel: info.siteLabel, siteTag: info.siteTag,
                seriesName: info.seriesName, seriesUrl: info.seriesUrl,
                episodeLabel: info.episodeLabel, episodeNumber: info.episodeNumber,
                episodeUrl: info.resumeUrl,
                watchedAt: new Date().toISOString()
            };
            // Odysee : la serie est reperee par chaine + titre de la video, et
            // le meme anime existe sur plusieurs chaines / avec des titres
            // varies -> une entree par variante (5 lignes "Wan Jie Du Zun",
            // signale 2026-10-02). Une seule entree par anime : la derniere vue
            // remplace les autres. Pas sur les autres sites : anime-sama donne
            // le meme nom a toutes les saisons.
            if (info.site === 'odysee') {
                const norm = normalizeSeriesName(info.seriesName);
                Object.keys(progress).forEach((k) => {
                    if (k !== key && progress[k].site === 'odysee' && normalizeSeriesName(progress[k].seriesName) === norm) delete progress[k];
                });
            }
            saveProgress(progress);
        }

        // Nettoyage unique des doublons Odysee deja enregistres : on garde le
        // moins avance (demande de l'utilisateur : ne pas sauter d'episodes).
        function mergeOdyseeDuplicatesOnce() {
            if (GM_getValue('odyseeDedupDone', false)) return;
            const progress = loadProgress();
            const keep = {};
            Object.keys(progress).forEach((k) => {
                const e = progress[k];
                if (e.site !== 'odysee') return;
                const norm = normalizeSeriesName(e.seriesName);
                if (!keep[norm] || Number(e.episodeNumber) < Number(progress[keep[norm]].episodeNumber)) keep[norm] = k;
            });
            let removed = 0;
            Object.keys(progress).forEach((k) => {
                const e = progress[k];
                if (e.site === 'odysee' && keep[normalizeSeriesName(e.seriesName)] !== k) { delete progress[k]; removed++; }
            });
            if (removed) { saveProgress(progress); console.log('[AnimeTracker v6] doublons Odysee fusionnes : ' + removed); }
            GM_setValue('odyseeDedupDone', true);
        }

        function deleteProgressEntry(key) {
            const progress = loadProgress();
            if (!progress[key]) return false;
            delete progress[key];
            saveProgress(progress);
            delete newEpisodes[key];
            forgetSeasonState(key);
            return true;
        }

        function formatDate(iso) { return new Date(iso).toLocaleString('fr-FR'); }

