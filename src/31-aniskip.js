        // ---- AniSkip (v6.18) ----
        // Temps d'opening/resume/ending communautaires (api.aniskip.com), par
        // episode. Anime associe automatiquement via AniList (1er resultat de
        // recherche, "Changer" pour corriger). Demande faite au 1er message
        // 'position' du lecteur pour passer la VRAIE duree : AniSkip ne garde
        // alors que les releves a ~20s pres, ce qui ecarte un mauvais anime ou
        // une autre version de la video. Reglages manuels prioritaires (par
        // paire intro / outro).
        let aniSkip = null; // { key, ep, requested, link, cfg, note }
        function loadAniLinks() { return GM_getValue('aniLinks', {}); }
        function setAniLink(key, link) { const all = loadAniLinks(); all[key] = link; GM_setValue('aniLinks', all); }
        function aniSearchQuery(info) {
            const season = ((info.seriesUrl || '').match(/\/saison-?(\d+)/i) || [])[1];
            const name = displayName(info.seriesName) || '';
            return season && season !== '1' ? name + ' ' + season : name;
        }
        function anilistSearch(q) {
            const query = 'query($q:String){Page(perPage:6){media(search:$q,type:ANIME){idMal seasonYear title{romaji english}}}}';
            return gmRequest({ method: 'POST', url: 'https://graphql.anilist.co', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, data: JSON.stringify({ query: query, variables: { q: q } }), anonymous: true, timeout: 15000 })
                .then((res) => (JSON.parse(res.responseText).data.Page.media || []).filter((m) => m.idMal)
                    .map((m) => ({ idMal: m.idMal, title: m.title.romaji || m.title.english, year: m.seasonYear })));
        }
        function resolveAniLink(key, info) {
            const known = loadAniLinks()[key];
            if (known) return Promise.resolve(known);
            return anilistSearch(aniSearchQuery(info)).then((list) => {
                const link = list[0] ? { idMal: list[0].idMal, title: list[0].title } : { idMal: null };
                setAniLink(key, link);
                return link;
            });
        }
        // Resultats AniSkip -> paires intro/outro du lecteur. Le resume
        // colle a l'opening (ecart < 30s) est saute avec lui.
        function aniSkipToConfig(results) {
            const iv = (types) => results.filter((r) => types.indexOf(r.skipType) !== -1).map((r) => ({ s: r.interval.startTime, e: r.interval.endTime, len: r.episodeLength }));
            const cfg = {};
            const op = iv(['op', 'mixed-op'])[0];
            if (op) {
                let s = op.s, e = op.e;
                iv(['recap']).forEach((r) => { if (r.s <= e + 30 && r.e >= s - 30) { s = Math.min(s, r.s); e = Math.max(e, r.e); } });
                cfg.introStart = s < 5 ? null : Math.round(s);
                cfg.introEnd = Math.round(e);
            }
            const ed = iv(['ed', 'mixed-ed'])[0];
            if (ed) {
                cfg.outroStart = Math.round(ed.s);
                // Contenu apres le generique (> 10s) : on le saute et on garde la suite.
                cfg.outroEnd = ed.len - ed.e > 10 ? Math.round(ed.e) : null;
            }
            return cfg;
        }
        function describeAniSkip(cfg) {
            const parts = [];
            if (cfg.introEnd) parts.push('intro ' + formatTimecode(cfg.introStart || 0) + '-' + formatTimecode(cfg.introEnd));
            if (cfg.outroStart) parts.push('outro ' + formatTimecode(cfg.outroStart) + (cfg.outroEnd ? '-' + formatTimecode(cfg.outroEnd) : ''));
            return parts.join(', ');
        }
        function isAniSkipShown() { return GM_getValue('aniskipShown', false); }
        function renderAniSkipStatus() {
            const el = overlayEls && overlayEls.overlay.querySelector('#ed-aniskip');
            if (!el) return;
            if (!isAniSkipShown() || !aniSkip || !currentEpisode || aniSkip.key !== storageKey(currentEpisode)) { el.style.display = 'none'; return; }
            const io = getIntroOutroForKey(aniSkip.key);
            const ok = aniSkip.cfg && describeAniSkip(aniSkip.cfg);
            const mark = ok ? '<span style="color:#4caf50;">&#10003;</span>' : aniSkip.note && !/recherche\.\.\.$/.test(aniSkip.note) ? '<span style="color:#f66;">&#10007;</span>' : '&#8230;';
            const tip = (aniSkip.note || 'en attente du lecteur...') + (io.introEnd || io.outroStart ? ' (tes reglages manuels passent avant)' : '');
            el.innerHTML = '<span title="' + escapeHtml(tip) + '">AniSkip ' + mark + '</span>' +
                ' <a href="#" id="ed-aniskip-change" style="color:#03d0fc;">Changer</a>';
            el.style.display = 'block';
            el.querySelector('#ed-aniskip-change').addEventListener('click', (ev) => { ev.preventDefault(); changeAniLink(); });
        }
        function requestAniSkip(duration) {
            const st = aniSkip;
            if (!st || st.requested || !currentEpisode) return;
            st.requested = true;
            st.duration = duration;
            const ep = Number(st.ep);
            if (!ep) { st.note = 'numero d\'episode inconnu'; renderAniSkipStatus(); return; }
            resolveAniLink(st.key, currentEpisode).then((link) => {
                st.link = link;
                if (!link.idMal) { st.note = link.off ? 'desactive pour cet anime' : 'anime introuvable sur AniList'; return null; }
                st.note = link.title + ' - recherche...';
                renderAniSkipStatus();
                const url = 'https://api.aniskip.com/v2/skip-times/' + link.idMal + '/' + ep + '?types=op&types=ed&types=recap&types=mixed-op&types=mixed-ed&episodeLength=' + Math.round(duration || 0);
                return gmRequest({ method: 'GET', url: url, anonymous: true, timeout: 15000 }).then((res) => {
                    const data = JSON.parse(res.responseText);
                    st.cfg = aniSkipToConfig(data.found ? data.results : []);
                    const desc = describeAniSkip(st.cfg);
                    st.note = link.title + ' - ' + (desc || 'pas de donnees pour cet episode');
                });
            }).catch((e) => { st.note = 'erreur reseau'; console.log('[AnimeTracker v6] AniSkip', e); })
                .then(() => {
                    if (aniSkip !== st) return;
                    renderAniSkipStatus();
                    if (st.cfg) applyUpdatedConfigIfCurrent(st.key);
                });
        }
