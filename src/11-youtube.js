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
        // v7.21 : bascule automatique vers YouTube (video qui cale, serie passee sur YouTube) ; activee par defaut.
        function isYtAutoSwitch() { return GM_getValue('ytAutoSwitch', true); }
        // v7.19 : chaines YouTube masquees (globales) : plus jamais proposees dans les resultats.
        function ytBlocked() { return GM_getValue('youtubeBlockedChannels', {}); }
        function blockYoutubeChannel(info, id, name) {
            const all = ytBlocked(); all[id] = name || id; GM_setValue('youtubeBlockedChannels', all);
            const assoc = getYoutubeChannelAssociation(info);
            if (assoc && assoc.channelId === id) {
                setYoutubeChannelAssociation(info, null); // plus de bascule automatique vers cette chaine
                if (ytActive) leaveYoutubeMode(); // et on quitte la video YouTube en cours (oublie aussi les liens memorises de la serie)
            }
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
            // v7.23 : titres chinois « 第411集 » / « 第411-420集 »
            const zh = /第\s*(\d+)(?:\s*[-~至]\s*(\d+))?\s*[集话話]/.exec(title);
            if (zh) { const a = Number(zh[1]), b = Number(zh[2] || zh[1]); if (n >= a && n <= b && b - a < 200) return { first: a, last: b }; }
            return null;
        }
        // v7.1 : nom de la serie en mots entiers ("The Demon Hunter's Romance",
        // serie live, passait pour "The Demon Hunter") et pas d'autre saison
        // annoncee ("S2", "Season 3", "Saison 2", "S02E480", "Nom 2 EP17").
        // ponytail: saison du titre comparee a celle de l'adresse du site ; une chaine qui numerote autrement est ecartee
        function ytWords(t) { return ' ' + String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]s\b/g, 's').replace(/[^a-z0-9]+/g, ' ').trim() + ' '; }
        const CJK = /[㐀-鿿]/;
        function ytTitleOk(title, name, season) {
            if (CJK.test(name)) return String(title || '').indexOf(name) !== -1; // v7.23 : nom chinois (ex. 逆天至尊) : simple inclusion, pas de saison
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
        // v7.23 : duree reelle de l'episode. Lecteur du site si connue, sinon l'API Odysee (resolve, sans cle) a partir du lien du lecteur.
        const odyDurCache = {}, odyDurFail = {}; // v7.24 : echec de l'API retenu 5 min
        function referenceDuration(info) {
            const d0 = aniSkip && aniSkip.key === storageKey(info) && aniSkip.ep === info.episodeNumber && aniSkip.duration;
            if (d0) return Promise.resolve(d0);
            let m;
            try { m = decodeURIComponent(info.embedSrc || '').match(/odysee\.com\/\$\/embed\/(@[^/?#]+)\/([^/?#]+)/); } catch (e) { m = null; }
            if (!m) return Promise.resolve(0);
            const lbry = 'lbry://' + m[1] + '/' + m[2];
            if (odyDurCache[lbry] !== undefined) return Promise.resolve(odyDurCache[lbry]);
            if (odyDurFail[lbry] > Date.now()) return Promise.resolve(0);
            return gmRequest({ method: 'POST', url: 'https://api.na-backend.odysee.com/api/v1/proxy', headers: { 'Content-Type': 'application/json' }, timeout: 8000,
                data: JSON.stringify({ method: 'resolve', params: { urls: [lbry] } }) })
                .then((r) => { const v = ((JSON.parse(r.responseText).result || {})[lbry] || {}).value; return (odyDurCache[lbry] = Number(v && v.video && v.video.duration) || 0); })
                .catch(() => { odyDurFail[lbry] = Date.now() + 300000; return 0; });
        }
        // v7.23 : autres titres de la serie (« Against The Sky Supreme, N.T.Z.Z, 逆天至尊 ») lus dans la page ouverte, seulement si c'est bien la meme serie.
        function altSeriesNames(info) {
            try {
                const h = document.querySelector('.infox h2'), a = document.querySelector('.infox .alter');
                if (!h || !a || ytNorm(h.textContent) !== ytNorm(info.seriesName)) return [];
                return a.textContent.split(',').map((s) => s.trim()).filter((s) => s.length >= 2 && (CJK.test(s) || (/\s/.test(s) && ytNorm(s).length >= 8)));
            } catch (e) { return []; }
        }
        // true = piste chinoise (zh*) presente dans la page de la video, false = absente, null = page illisible (inconnu : on garde la video)
        function ytHasZhTrack(id) {
            return fetchPageHtml('https://www.youtube.com/watch?v=' + encodeURIComponent(id) + '&ucbcb=1').then((html) => {
                const i = html.indexOf('"captionTracks"');
                if (i < 0) return html.indexOf('"playerCaptionsTracklistRenderer"') >= 0 || html.indexOf('ytInitialPlayerResponse') >= 0 ? false : null;
                const rest = html.slice(i, i + 30000), e = Math.min(...['"audioTracks"', '"translationLanguages"'].map((s) => { const n = rest.indexOf(s); return n < 0 ? rest.length : n; }));
                return /"languageCode":"zh(-[A-Za-z]+)?"/.test(rest.slice(0, e));
            }).catch(() => null);
        }
        function searchYoutubeForEpisode(info) {
            const n = Number(info.episodeNumber);
            const full = info.seriesName || '';
            const names = [full.replace(/\([^)]*\)/g, ' ').trim(), (full.match(/\(([^)]+)\)/) || [])[1], full]
                .filter((v) => v && ytNorm(v).length >= 4);
            if (!n || !names.length) return Promise.resolve([]);
            const queries = [];
            names.slice(0, 2).forEach((v) => queries.push(v + ' episode ' + n + ' vostfr', v + ' EP ' + n));
            // v7.23 : titres alternatifs : le chinois (chaines officielles) et un nom anglais different, une requete chacun
            const alts = altSeriesNames(info).filter((v) => !names.some((x) => ytNorm(x) === ytNorm(v)));
            alts.slice(0, 2).forEach((v) => { queries.push(v + ' EP ' + n); names.push(v); });
            const seen = {}, out = [];
            const season = seriesSeason(info);
            // v7.24 : resultats gardes 24 h par episode (pas de nouvelle rafale de requetes a chaque ouverture) ; chaines masquees filtrees a la lecture
            const ckey = storageKey(info) + '::' + n, cache = GM_getValue('ytSearchCache', {});
            if (cache[ckey] && Date.now() - cache[ckey].t < 86400000 && cache[ckey].out && cache[ckey].out.length) {
                const bl = ytBlocked();
                return Promise.resolve(cache[ckey].out.filter((r) => !bl[r.channelId]));
            }
            // Duree de l'episode (v7.23 : aussi via Odysee) : ecarte un episode unique trop long/court (v7.23 : 0,75 a 1,3 au lieu de 0,5 a 1,6) et classe en tete celui de meme duree.
            return Promise.all([referenceDuration(info), Promise.all(queries.map((q) => fetchPageHtml('https://www.youtube.com/results?hl=fr&ucbcb=1&search_query=' + encodeURIComponent(q)).catch(() => '')))]).then((res) => {
                const dur = res[0], pages = res[1];
                let parsed = 0;
                pages.forEach((html) => { let data = null; try { data = html && ytInitialJson(html, 'var ytInitialData'); } catch (e) {} if (data) parsed++; (function walk(o) {
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
                        const badLen = dur && range && range.first === range.last && (len > dur * 1.3 || len < dur * 0.75);
                        const durMatch = !!(dur && range && range.first === range.last && Math.abs(len - dur) <= Math.max(10, dur * 0.03));
                        if (name && range && be && be.browseId && !ytBlocked()[be.browseId] && !teaser && !badLen && (vf || cc)) {
                            out.push({ id: o.videoId, title: title, len: len, channelId: be.browseId, channelName: owner.text || '',
                                keyword: name, first: range.first, last: range.last, vf: vf, durMatch: durMatch, refDur: dur || 0, score: (vf ? 2 : 0) + (range.first === range.last ? 1 : 0) + (durMatch ? 4 : 0) });
                        }
                    }
                    Object.keys(o).forEach((k) => walk(o[k]));
                })(data); });
                if (!parsed) throw new Error(pages.some(Boolean) ? 'la page YouTube est illisible (format change ?)' : 'YouTube ne repond pas');
                const top = out.sort((a, b) => (b.score - a.score) || ((a.last - a.first) - (b.last - b.first))).slice(0, 5);
                // v7.24.3 : le traducteur (traduction/serve.js, --src zh) a besoin d'une piste de sous-titres CHINOISE (manuelle ou automatique) :
                // on la cherche dans la page de chaque video ; les videos sans piste chinoise sont ecartees s'il en reste d'autres.
                return Promise.all(top.map((r) => ytHasZhTrack(r.id).then((z) => { r.zh = z; }))).then(() => {
                    const ok = top.filter((r) => r.zh === true), res = ok.length ? top.filter((r) => r.zh !== false) : top;
                    res.sort((a, b) => (b.zh === true) - (a.zh === true));
                    if (res.length) { // cache : 30 recherches au plus
                        cache[ckey] = { t: Date.now(), out: res };
                        Object.keys(cache).sort((x, y) => cache[y].t - cache[x].t).slice(30).forEach((k) => delete cache[k]);
                        GM_setValue('ytSearchCache', cache);
                    }
                    return res;
                });
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
        // v7.23 : recherche web hors YouTube (pages de resultats ouvertes dans un onglet ; pas de scraping automatique, trop fragile)
        const WEB_SEARCHES = [['google', 'Google', (q) => 'https://www.google.com/search?q=' + q], ['ddg', 'DuckDuckGo', (q) => 'https://duckduckgo.com/?q=' + q],
            ['dm', 'Dailymotion', (q) => 'https://www.dailymotion.com/search/' + q + '/videos'], ['bili', 'Bilibili', (q) => 'https://www.bilibili.tv/en/search-result?q=' + q]];
        function webSearchButtons(style) { return WEB_SEARCHES.map((w) => '<button type="button" data-act="web-' + w[0] + '" style="' + style + '">' + w[1] + '</button>').join(''); }
        function openWebSearch(act, info) {
            const w = WEB_SEARCHES.find((x) => 'web-' + x[0] === act);
            if (!w) return false;
            window.open(w[2](encodeURIComponent(displayName(info.seriesName) + ' episode ' + info.episodeNumber + ' vostfr')), '_blank', 'noopener');
            return true;
        }
        function fmtLen(s) { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); }
        function renderYoutubeChoices(zone, info, onPick) {
            return searchYoutubeForEpisode(info).then((results) => {
                if (!zone.isConnected || currentEpisode !== info) return;
                if (!results.length) { zone.textContent = 'Rien de sur trouve sur YouTube (nom + episode ' + info.episodeNumber + ').'; return; }
                zone.innerHTML = '<div style="margin-bottom:4px;">Sur YouTube (clique pour regarder) :</div>' + results.map((r, i) =>
                    '<div data-yt="' + i + '" role="button" tabindex="0" style="display:flex;gap:8px;align-items:center;cursor:pointer;background:#1f1508;border:1px solid #5a4010;border-radius:6px;padding:4px;margin-bottom:4px;">' +
                    '<img src="https://i.ytimg.com/vi/' + escapeHtml(r.id) + '/mqdefault.jpg" style="width:96px;height:54px;object-fit:cover;border-radius:4px;flex-shrink:0;">' +
                    '<div style="min-width:0;flex:1;"><div style="color:#fff;font-size:12px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">' + escapeHtml(r.title) + '</div>' +
                    '<div style="font-size:11px;"><span style="opacity:.8;">' + escapeHtml(r.channelName) + (r.first !== r.last ? ' - compilation ep. ' + r.first + '-' + r.last : '') + ' - ' + fmtLen(r.len) + '</span> ' +
                    (r.durMatch ? '<span style="background:#1565c0;color:#fff;border-radius:3px;padding:0 4px;font-weight:bold;" title="Meme duree que l\'episode du site (' + fmtLen(r.refDur) + ')">duree identique</span> ' : '') +
                    // VOSTFR = annonce dans le titre ; sinon piste de sous-titres
                    // traduite automatiquement en francais par YouTube.
                    (r.zh === true ? '<span style="background:#00695c;color:#fff;border-radius:3px;padding:0 4px;font-weight:bold;" title="Piste de sous-titres chinoise presente : le traducteur peut l\'utiliser">traduisible</span> ' : r.zh === false ? '<span style="background:#8a1c1c;color:#fff;border-radius:3px;padding:0 4px;font-weight:bold;" title="Aucune piste chinoise : le traducteur ne pourra pas traduire cette video">pas de piste chinoise</span> ' : '') +
                    (r.vf ? '<span style="background:#2e7d32;color:#fff;border-radius:3px;padding:0 4px;font-weight:bold;">VOSTFR</span>'
                        : '<span style="background:#b26a00;color:#fff;border-radius:3px;padding:0 4px;font-weight:bold;" title="Sous-titres traduits automatiquement en francais par YouTube">ST auto FR</span>') +
                    '</div></div><button type="button" data-block="' + i + '" title="Ne plus proposer la chaine ' + escapeHtml(r.channelName) + '" style="flex-shrink:0;background:#3a1010;color:#fff;border:1px solid #a33;border-radius:4px;cursor:pointer;padding:2px 6px;">&#10005;</button></div>').join('');
                zone.querySelectorAll('[data-block]').forEach((el) => el.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    const r = results[Number(el.getAttribute('data-block'))];
                    blockYoutubeChannel(info, r.channelId, r.channelName);
                    renderYoutubeChoices(zone, info, onPick);
                }));
                zone.querySelectorAll('[data-yt]').forEach((el) => el.addEventListener('click', () => {
                    if (onPick) onPick();
                    useYoutubeSearchResult(info, results[Number(el.getAttribute('data-yt'))]);
                }));
            }).then(() => {
                const n = Object.keys(ytBlocked()).length;
                if (!n || !zone.isConnected) return;
                const l = document.createElement('div');
                l.style.cssText = 'font-size:11px;opacity:.7;cursor:pointer;text-decoration:underline;margin-top:4px;';
                l.textContent = n + ' chaine(s) masquee(s) - tout reafficher';
                l.onclick = () => { GM_setValue('youtubeBlockedChannels', {}); renderYoutubeChoices(zone, info, onPick); };
                zone.append(l);
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
                head('Sur le web', '#9ccc65') + '<div>' + webSearchButtons(BTN.replace('display:block;width:100%;', 'display:inline-block;width:auto;margin-right:4px;')) + '</div>' +
                head('YouTube', '#ff4e45') + '<label style="display:block;margin-bottom:6px;cursor:pointer;"><input type="checkbox" id="ed-yt-auto"' + (isYtAutoSwitch() ? ' checked' : '') + '> Basculer automatiquement sur YouTube si la vidéo cale</label><div id="ed-yt-results" style="color:#d9b77a;">Recherche sur YouTube...</div></div>' +
                '<div style="margin-top:12px;"><button type="button" data-act="close" style="background:#333;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;">Fermer</button></div>';
            box.style.display = 'block';
            box.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
                const act = b.getAttribute('data-act');
                if (openWebSearch(act, info)) return; // recherche web : on garde le choix ouvert
                box.style.display = 'none';
                if (act === 'site') leaveYoutubeMode();
                if (act === 'odysee') openCurrentEpisodeOnOdysee();
                if (act === 'player') selectPlayer(Number(b.getAttribute('data-i')));
            }));
            box.querySelector('#ed-yt-auto').addEventListener('change', (ev) => GM_setValue('ytAutoSwitch', ev.target.checked));
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

