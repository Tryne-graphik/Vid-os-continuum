        // ---- Fiche de l'anime (v6.23) : synopsis + genres/tags, tous sites ----
        // Synopsis FR tire de la page de l'anime sur le site (anime-sama :
        // #synopsisText ; ailleurs : description JSON-LD / og / meta), sinon
        // celui d'AniList (anglais). Le reste vient d'AniList (meme
        // association que pour AniSkip).
        const GENRES_FR = { 'Action': 'Action', 'Adventure': 'Aventure', 'Comedy': 'Comedie', 'Drama': 'Drame', 'Ecchi': 'Ecchi', 'Fantasy': 'Fantasy', 'Horror': 'Horreur',
            'Mahou Shoujo': 'Magical girl', 'Mecha': 'Mecha', 'Music': 'Musique', 'Mystery': 'Mystere', 'Psychological': 'Psychologique', 'Romance': 'Romance',
            'Sci-Fi': 'Science-fiction', 'Slice of Life': 'Tranche de vie', 'Sports': 'Sport', 'Supernatural': 'Surnaturel', 'Thriller': 'Thriller' };
        const STATUS_FR = { FINISHED: 'Termine', RELEASING: 'En cours de diffusion', NOT_YET_RELEASED: 'Pas encore sorti', CANCELLED: 'Annule', HIATUS: 'En pause' };
        // sel = { idMal } ou { id } (id AniList : beaucoup de donghua n'ont pas d'id MAL, ex. Wanmei Shijie, v6.62).
        function anilistDetails(sel) {
            const query = 'query($id:Int,$mal:Int){Media(id:$id,idMal:$mal,type:ANIME){siteUrl episodes status averageScore seasonYear genres description(asHtml:false) coverImage{large} title{romaji english} tags{name rank isMediaSpoiler isGeneralSpoiler} nextAiringEpisode{episode timeUntilAiring}}}';
            return gmRequest({ method: 'POST', url: 'https://graphql.anilist.co', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, data: JSON.stringify({ query: query, variables: { id: sel.id || undefined, mal: sel.idMal || undefined } }), anonymous: true, timeout: 15000 })
                .then((res) => JSON.parse(res.responseText).data.Media);
        }
        // Premier id AniList trouve en essayant le nom romanise puis le nom anglais (entre parentheses) :
        // "Perfect World" seul tombait sur un special d'1 episode au lieu de Wanmei Shijie.
        function anilistFindId(name) {
            const names = [String(name || '').replace(/\([^)]*\)/g, '').trim(), displayName(name)].filter((n, i, a) => n && a.indexOf(n) === i);
            const query = 'query($q:String){Page(perPage:1){media(search:$q,type:ANIME){id}}}';
            const tryNext = (i) => i >= names.length ? Promise.resolve(null) :
                gmRequest({ method: 'POST', url: 'https://graphql.anilist.co', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, data: JSON.stringify({ query: query, variables: { q: names[i] } }), anonymous: true, timeout: 15000 })
                    .then((res) => { const m = (JSON.parse(res.responseText).data.Page.media || [])[0]; return m ? m.id : tryNext(i + 1); });
            return tryNext(0);
        }
        function siteSynopsis(info) {
            const slug = ((info.seriesUrl || '').match(/anime-sama\.to\/catalogue\/([^/]+)/) || [])[1];
            const url = slug ? 'https://anime-sama.to/catalogue/' + slug + '/' : info.seriesUrl;
            if (!url) return Promise.resolve(null);
            const fromDoc = (doc) => {
                const cands = [];
                const el = doc.querySelector('#synopsisText, .synopsis-content, .anime-synopsis p, .full-text, [itemprop="description"]');
                if (el) cands.push(el.textContent);
                doc.querySelectorAll('script[type="application/ld+json"]').forEach((sc) => { try { const j = JSON.parse(sc.textContent); [].concat(j).forEach((o) => { if (o && typeof o.description === 'string') cands.push(o.description); }); } catch (e) {} });
                ['meta[property="og:description"]', 'meta[name="description"]'].forEach((sel) => { const m = doc.querySelector(sel); if (m) cands.push(m.getAttribute('content') || ''); });
                // Le plus long qui ne ressemble pas a un texte publicitaire du site.
                const good = cands.map((t) => String(t).replace(/\s+/g, ' ').trim()).filter((t) => t.length >= 80 && !(t.length < 220 && /streaming|regarder|gratuit|t[e\u00e9]l[e\u00e9]charg/i.test(t)));
                return good.sort((a, b) => b.length - a.length)[0] || null;
            };
            return fetchPageHtml(url).then((html) => {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const found = fromDoc(doc);
                if (found) return found;
                // Esprit Donghua (v6.62) : les vignettes menent a un episode, le synopsis est sur la page de la serie.
                const epSlug = (url.match(/^https?:\/\/[^/]+\/([^/?#]+)/) || [])[1] || '';
                const serie = Array.from(doc.querySelectorAll('a[href*="/anime/"]')).map((a) => a.href)
                    .map((h) => [h, (h.match(/\/anime\/([^/?#]+)\/?$/) || [])[1] || ''])
                    .filter(([, sl]) => sl.length >= 3 && epSlug.indexOf(sl) === 0).sort((x, y) => y[1].length - x[1].length)[0];
                if (!serie) return null;
                return fetchPageHtml(serie[0]).then((h2) => fromDoc(new DOMParser().parseFromString(h2, 'text/html')));
            }).catch(() => null);
        }
        const ficheCache = {}; // fiche deja chargee pendant la visite -> reaffichee sans recharger (v6.61)
        function openSeriesInfo(info) {
            const key = storageKey(info);
            const old = document.getElementById('ep-info-overlay');
            if (old) old.remove();
            const pop = document.createElement('div');
            pop.id = 'ep-info-overlay';
            pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true');
            pop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:2147483647;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;';
            pop.innerHTML = '<div id="ep-info-box" style="background:#15151f;color:#eee;max-width:640px;width:92%;max-height:84vh;overflow:auto;border-radius:8px;padding:18px;font-size:13px;line-height:1.5;">Chargement de la fiche de ' + escapeHtml(displayName(info.seriesName)) + '...</div>';
            (overlayEls && overlayEls.overlay.style.display !== 'none' ? overlayEls.overlay : document.body).appendChild(pop);
            focusDialog(pop);
            pop.addEventListener('click', (ev) => { if (ev.target === pop || ev.target.id === 'ep-info-close') pop.remove(); });
            const box = pop.querySelector('#ep-info-box');
            if (!ficheCache[key]) {
                // Serie suivie : meme anime qu'AniSkip (modifiable). Sinon recherche directe par nom romanise
                // (la recherche AniSkip, anglais + id MAL obligatoire, donnait un special pour Wanmei Shijie).
                const byName = () => anilistFindId(info.seriesName).then((id) => (id ? anilistDetails({ id: id }) : null));
                const media = (loadProgress()[key]
                    ? resolveAniLink(key, info).then((link) => (link && link.idMal ? anilistDetails({ idMal: link.idMal }) : byName()))
                    : byName()).catch(() => null);
                ficheCache[key] = Promise.all([media, siteSynopsis(info)]);
            }
            ficheCache[key].then(([m, frSyn]) => {
                if (!document.body.contains(pop)) return;
                const chip = (t, c) => '<span style="display:inline-block;margin:2px 4px 2px 0;padding:2px 8px;border-radius:10px;font-size:11px;background:' + c + ';">' + escapeHtml(t) + '</span>';
                let html = '<div style="display:flex;gap:14px;">';
                if (m && m.coverImage && /^https:\/\//.test(m.coverImage.large)) html += '<img src="' + escapeHtml(m.coverImage.large) + '" alt="" style="width:110px;height:auto;border-radius:6px;align-self:flex-start;">';
                html += '<div style="flex:1;min-width:0;"><div style="font-size:17px;font-weight:bold;color:#03d0fc;">' + escapeHtml(displayName(info.seriesName)) + '</div>';
                if (m) {
                    const meta = [];
                    if (m.seasonYear) meta.push(m.seasonYear);
                    if (m.episodes) meta.push(m.episodes + ' episodes');
                    if (STATUS_FR[m.status]) meta.push(STATUS_FR[m.status]);
                    if (m.averageScore) meta.push('note ' + (m.averageScore / 10).toFixed(1) + '/10');
                    html += '<div style="color:#aaa;font-size:12px;margin:2px 0 6px;">' + escapeHtml(meta.join(' \u00b7 ')) + '</div>';
                    if (m.nextAiringEpisode) html += '<div style="color:#ffb300;font-size:12px;">Prochain episode (' + m.nextAiringEpisode.episode + ') dans ' + Math.max(1, Math.round(m.nextAiringEpisode.timeUntilAiring / 86400)) + ' j</div>';
                    html += '<div style="margin-top:6px;">' + (m.genres || []).map((g) => chip(GENRES_FR[g] || g, '#1f3a4d')).join('') + '</div>';
                    const tags = (m.tags || []).filter((t) => !t.isMediaSpoiler && !t.isGeneralSpoiler && t.rank >= 60).slice(0, 8);
                    if (tags.length) html += '<div>' + tags.map((t) => chip(t.name, '#2a2a35')).join('') + '</div>';
                } else html += '<div style="color:#aaa;font-size:12px;">Anime non trouve sur AniList (genres indisponibles).</div>';
                html += '</div></div>';
                const enSyn = m && m.description ? m.description.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
                html += '<div style="margin-top:12px;"><b>Synopsis</b>' + (frSyn ? '' : (enSyn ? ' <span style="color:#888;font-size:11px;">(AniList, en anglais)</span>' : '')) +
                    '<p style="margin:4px 0 0;color:#ddd;">' + escapeHtml(frSyn || enSyn || 'Aucun synopsis trouve.') + '</p></div>';
                const dk = nameMarkKey(info.seriesName);
                html += '<div style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;">' +
                    (dk ? Object.keys(NAME_MARKS).map((st) => '<button type="button" class="ep-info-mark" data-st="' + st + '" title="Marque la vignette de cette serie sur les sites (pour s\'en souvenir)" style="background:#1f2a33;color:' + NAME_MARKS[st][2] + ';border:1px solid ' + NAME_MARKS[st][2] + ';padding:6px 12px;border-radius:4px;cursor:pointer;"></button>').join('') : '') +
                    (info.pageUrl && /^https?:\/\//.test(info.pageUrl) ? '<a href="' + escapeHtml(info.pageUrl) + '" style="background:#1f2a33;color:#03d0fc;border:1px solid #03d0fc;padding:6px 12px;border-radius:4px;text-decoration:none;">Page de l\'anime</a>' : '') +
                    (m && /^https:\/\/anilist\.co\//.test(m.siteUrl || '') ? '<a href="' + escapeHtml(m.siteUrl) + '" target="_blank" rel="noopener" style="background:#1f2a33;color:#03d0fc;border:1px solid #03d0fc;padding:6px 12px;border-radius:4px;text-decoration:none;">Voir sur AniList</a>' : '') +
                    '<button type="button" id="ep-info-close" style="background:#333;color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;">Fermer</button></div>';
                box.innerHTML = html;
                box.querySelectorAll('.ep-info-mark').forEach((btn) => {
                    const st = btn.getAttribute('data-st');
                    const label = () => { btn.textContent = loadNameMark(st)[dk] ? 'Retirer "' + NAME_MARKS[st][1].replace(/^\S+ /, '') + '"' : NAME_MARKS[st][1]; };
                    label();
                    btn.addEventListener('click', () => {
                        const all = loadNameMark(st);
                        if (all[dk]) delete all[dk]; else all[dk] = displayName(info.seriesName);
                        GM_setValue(NAME_MARKS[st][0], all);
                        label();
                        refreshThumbnailBadges();
                    });
                });
            });
        }

        function changeAniLink() {
            if (!currentEpisode || !aniSkip) return;
            const key = aniSkip.key;
            const q = prompt('Rechercher l\'anime sur AniList (pour AniSkip) :', aniSearchQuery(currentEpisode));
            if (q === null) return;
            anilistSearch(q).then((list) => {
                const menu = list.map((m, i) => (i + 1) + '. ' + m.title + (m.year ? ' (' + m.year + ')' : '')).join('\n');
                const pick = prompt((menu || 'Aucun resultat.') + '\n\n0 = desactiver AniSkip pour cet anime\nNumero :', list.length ? '1' : '0');
                if (pick === null) return;
                const n = parseInt(pick, 10);
                if (n === 0) setAniLink(key, { idMal: null, off: true });
                else if (list[n - 1]) setAniLink(key, { idMal: list[n - 1].idMal, title: list[n - 1].title });
                else return;
                const duration = aniSkip.duration;
                aniSkip = { key: key, ep: aniSkip.ep };
                applyUpdatedConfigIfCurrent(key);
                requestAniSkip(duration);
            }).catch(() => alert('Recherche AniList impossible (reseau).'));
        }

        function applyRuntimeConfig(key) {
            const manualIo = getIntroOutroForKey(key);
            const auto = aniSkip && aniSkip.key === key && aniSkip.cfg ? aniSkip.cfg : {};
            // Par paire : une intro (ou outro) reglee a la main remplace celle d'AniSkip.
            const introOutro = Object.assign({},
                manualIo.introEnd ? { introStart: manualIo.introStart, introEnd: manualIo.introEnd } : { introStart: auto.introStart, introEnd: auto.introEnd },
                manualIo.outroStart ? { outroStart: manualIo.outroStart, outroEnd: manualIo.outroEnd } : { outroStart: auto.outroStart, outroEnd: auto.outroEnd });
            currentConfig = {
                introStart: introOutro.introStart || null,
                introEnd: introOutro.introEnd || null,
                outroStart: introOutro.outroStart || null,
                outroEnd: introOutro.outroEnd || null,
                autoNext: isAutoNextEnabled()
            };
            refreshIntroOutroButtons();
        }

        // Vert = reglage present pour la serie (manuel ou AniSkip), gris = a faire.
        function refreshIntroOutroButtons() {
            const manual = currentEpisode ? getIntroOutroForKey(storageKey(currentEpisode)) : {};
            const intro = currentConfig.introEnd || manual.introEnd, outro = currentConfig.outroStart || manual.outroStart;
            [['ed-set-intro-btn', intro], ['ep-set-intro', intro], ['ed-set-outro-btn', outro], ['ep-set-outro', outro]].forEach(([id, on]) => {
                const b = document.getElementById(id);
                if (b) b.classList.toggle('vc-set', !!on);
            });
        }

        function triggerNextEpisode(reason, remaining) {
            if (!currentConfig.autoNext) return;
            if (!currentEpisode || !(ytActive || hasNextEpisode(currentEpisode))) { setStatus('Episode termine - pas de suivant detecte'); return; }
            showNextToast(isFinite(remaining) ? Math.max(1, Math.round(remaining)) : 3);
        }

        function showNextToast(start) {
            const { toast } = overlayEls;
            let seconds = start || 3, cancelled = false;
            const textEl = toast.querySelector('#ed-toast-text');
            toast.style.display = 'flex';
            textEl.textContent = 'Épisode suivant dans ' + seconds + 's...';
            const interval = setInterval(() => {
                if (cancelled) { clearInterval(interval); return; }
                seconds--;
                if (seconds <= 0) { clearInterval(interval); toast.style.display = 'none'; cancelCountdown = null; advanceToNextEpisode(); return; }
                textEl.textContent = 'Épisode suivant dans ' + seconds + 's...';
            }, 1000);
            cancelCountdown = () => { cancelled = true; clearInterval(interval); toast.style.display = 'none'; cancelCountdown = null; };
            nextNowCountdown = () => { cancelled = true; clearInterval(interval); toast.style.display = 'none'; cancelCountdown = null; advanceToNextEpisode(); };
        }

        // Construit l'InfoUnifie de l'episode suivant SANS toucher au
        // reseau pour le style 'index' (deja tout charge pour la saison) -
        // sinon (style 'page') refetch la vraie page suivante, comme v4.
        function buildNextEpisodeInfo() {
            if (currentEpisode.navStyle === 'index') {
                const nextIndex = currentEpisode.episodeIndex + 1;
                const nextNumber = currentEpisode.episodeNumbersByIndex[nextIndex];
                return Promise.resolve(Object.assign({}, currentEpisode, {
                    embedSrc: currentEpisode.embedByIndex[nextIndex], embedCandidates: currentEpisode.embedCandidatesByIndex ? currentEpisode.embedCandidatesByIndex[nextIndex] : undefined,
                    episodeIndex: nextIndex, episodeNumber: nextNumber, episodeLabel: 'Episode ' + nextNumber,
                    resumeUrl: currentEpisode.resumeUrlsByIndex[nextIndex]
                }));
            }
            const site = SITES.find((s) => s.id === currentEpisode.site);
            const nextPageUrl = currentEpisode.nextPageUrl;
            if (currentEpisode.navigate) return navigateToEpisodePage(nextPageUrl);
            return fetchPageHtml(nextPageUrl).then((html) => {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                return site.extract(doc, nextPageUrl);
            });
        }
        function buildPrevEpisodeInfo() {
            if (currentEpisode.navStyle === 'index') {
                const prevIndex = currentEpisode.episodeIndex - 1;
                const prevNumber = currentEpisode.episodeNumbersByIndex[prevIndex];
                return Promise.resolve(Object.assign({}, currentEpisode, {
                    embedSrc: currentEpisode.embedByIndex[prevIndex], embedCandidates: currentEpisode.embedCandidatesByIndex ? currentEpisode.embedCandidatesByIndex[prevIndex] : undefined,
                    episodeIndex: prevIndex, episodeNumber: prevNumber, episodeLabel: 'Episode ' + prevNumber,
                    resumeUrl: currentEpisode.resumeUrlsByIndex[prevIndex]
                }));
            }
            const site = SITES.find((s) => s.id === currentEpisode.site);
            const prevPageUrl = currentEpisode.prevPageUrl;
            if (currentEpisode.navigate) return navigateToEpisodePage(prevPageUrl);
            return fetchPageHtml(prevPageUrl).then((html) => {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                return site.extract(doc, prevPageUrl);
            });
        }

        function applyLoadedEpisode(info, pushHistory, skipYoutubeLookup) {
            if (!info) throw new Error('episode introuvable ou aucun lecteur compatible pour cet episode');
            // Serie passee sur YouTube : chercher d'abord cet episode la-bas.
            if (!skipYoutubeLookup && isYoutubeMode(info) && !getYoutubeOverrideUrl(info) && getYoutubeChannelAssociation(info)) {
                setStatus('Recherche de l\'episode ' + info.episodeNumber + ' sur YouTube...');
                findYoutubeEpisode(getYoutubeChannelAssociation(info), Number(info.episodeNumber), seriesSeason(info))
                    .then((hit) => { if (hit) storeYoutubeHit(info, hit); else console.log('[AnimeTracker v6] YouTube : episode ' + info.episodeNumber + ' introuvable sur la chaine, source du site'); })
                    .catch((e) => console.log('[AnimeTracker v6] YouTube : recherche impossible (' + e.message + '), source du site'))
                    .then(() => applyLoadedEpisode(info, pushHistory, true));
                return;
            }
            const youtubeOverride = getYoutubeOverrideUrl(info);
            ytActive = !!youtubeOverride;
            const segM = youtubeOverride && youtubeOverride.match(/#vcseg=(\d+)-(\d+)-(\d+)(?:-([\d.]+))?/);
            ytSegment = segM ? { first: Number(segM[1]), last: Number(segM[2]), perEp: Number(segM[3]), starts: segM[4] ? segM[4].split('.').map(Number) : null } : null;
            if (!info.embedSrc && !youtubeOverride) {
                // Ex. anime-sama : cet episode precis n'existe que sur un
                // hebergeur qu'on ne gere pas encore (v1 = sibnet
                // uniquement) - on renonce plutot que de bloquer sur un
                // calque vide, le lecteur natif du site reste utilisable.
                // Sauf si un lien YouTube de secours a ete configure pour
                // cet episode precis (voir ci-dessus) - dans ce cas on
                // continue avec lui.
                setStatus('Aucun lecteur compatible (ansembed/sibnet) pour cet episode - utilise le lecteur du site.');
                return;
            }
            currentEpisode = info;
            recordEpisodeProgress(info);
            renderCrossSiteHint(info);
            aniSkip = { key: storageKey(info), ep: info.episodeNumber };
            renderAniSkipStatus();
            applyRuntimeConfig(storageKey(info));
            outroSignalSent = false;
            positionArmed = false;
            overlayEls.playerFrame.src = youtubeOverride || info.embedSrc;
            playerCandidates = youtubeOverride ? [] : (info.embedCandidates && info.embedCandidates.length ? info.embedCandidates : [info.embedSrc]);
            playerCandidateIndex = 0;
            overlayEls.siteErrorBox.style.display = 'none';
            if (playerCandidates.length) armPlayerReadyTimer(); else clearTimeout(playerReadyTimer);
            renderSourceLine();
            if (youtubeOverride) {
                setStatus('Lecture via YouTube' + (ytSegment && ytSegment.last > ytSegment.first ? ' (compilation ep. ' + ytSegment.first + '-' + ytSegment.last + ')' : '') + ', sous-titres en francais - pas de saut intro/outro sur cette source.');
            } else {
                startBufferStallTracking();
                setStatus('Chargement...');
            }
            if (pushHistory) { try { history.pushState(null, '', info.resumeUrl); } catch (e) {} }
            buildPersistentPanel();
        }

        // Meme anime suivi sur un autre site (demande 2026-10-02, ex. Bleach
        // ep. 120 sur anime-sama, ep. 1 sur animoflix) : rapprochement par
        // nom normalise, sans fusionner les entrees (cles et numerotation
        // propres a chaque site).
        // ponytail: egalite stricte du nom normalise, ajouter un lien manuel si deux sites nomment differemment
        function normalizeSeriesName(name) {
            return (displayName(name) || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/\b(vostfr|vf)\b/g, '').replace(/[^a-z0-9]/g, '');
        }
        function findFurtherProgressElsewhere(info) {
            const name = normalizeSeriesName(info.seriesName);
            if (!name) return null;
            const progress = loadProgress();
            const excluded = loadExcludedSeries();
            let best = null;
            Object.keys(progress).forEach((k) => {
                const e = progress[k];
                if (excluded[k] || e.site === info.site || normalizeSeriesName(e.seriesName) !== name) return;
                if (Number(e.episodeNumber) > Number(info.episodeNumber) && (!best || Number(e.episodeNumber) > Number(best.episodeNumber))) best = e;
            });
            return best;
        }
        function renderCrossSiteHint(info) {
            const el = overlayEls && overlayEls.overlay.querySelector('#ed-cross-site');
            if (!el) return;
            const other = findFurtherProgressElsewhere(info);
            if (!other) { el.style.display = 'none'; return; }
            const next = Number(other.episodeNumber) + 1;
            el.innerHTML = 'Deja vu jusqu\'a l\'ep. ' + escapeHtml(String(other.episodeNumber)) + ' sur ' + escapeHtml(other.siteLabel || other.site) +
                '<br><button type="button" style="margin-top:4px;background:#ffb300;color:#000;border:none;padding:4px 8px;border-radius:4px;cursor:pointer;font-size:11px;font-weight:bold;">Aller a l\'ep. ' + next + '</button>';
            el.style.display = 'block';
            el.querySelector('button').addEventListener('click', () => { el.style.display = 'none'; goToEpisodeNumber(next); });
        }

        // Sites "une page par episode" generes en JS (sites ajoutes) : on va
        // sur la page et le lecteur se rouvre tout seul (meme sans "Lecteur
        // auto", via ce drapeau de session).
        function navigateToEpisodePage(url) {
            try { sessionStorage.setItem('vc-continue-playing', '1'); } catch (e) {}
            setStatus('Chargement de la page de l\'episode...');
            location.href = url;
            return new Promise(() => {});
        }

        // Suivi pendant une compilation YouTube (et suite apres la compilation).
        function episodeInfoForNumber(cur, ep) {
            if (cur.navStyle === 'index') {
                const i = cur.episodeNumbersByIndex.indexOf(ep);
                if (i === -1) return null;
                return Object.assign({}, cur, { episodeIndex: i, episodeNumber: ep, episodeLabel: 'Episode ' + ep, resumeUrl: cur.resumeUrlsByIndex[i], embedSrc: cur.embedByIndex[i],
                    embedCandidates: cur.embedCandidatesByIndex ? cur.embedCandidatesByIndex[i] : undefined });
            }
            // Page par episode : numero d'episode du site != numero d'adresse
            // (esprit-donghua : "S3 E90" = episode 345) -> on garde la page.
            return Object.assign({}, cur, { episodeNumber: ep, episodeLabel: 'Episode ' + ep, nextPageUrl: null, prevPageUrl: null });
        }
        function advanceTrackingTo(ep) {
            const next = episodeInfoForNumber(currentEpisode, ep);
            if (!next) return;
            currentEpisode = next;
            recordEpisodeProgress(next);
            buildPersistentPanel();
        }

        function advanceToNextEpisode() {
            if (advancingToNext) return;
            if (ytActive && currentEpisode) {
                const next = episodeInfoForNumber(currentEpisode, Number(currentEpisode.episodeNumber) + 1);
                if (next) { applyLoadedEpisode(next, true); return; }
            }
            if (!currentEpisode || !(ytActive || hasNextEpisode(currentEpisode))) return;
            advancingToNext = true;
            setStatus('Chargement de l\'episode suivant...');
            buildNextEpisodeInfo().then((info) => {
                advancingToNext = false;
                applyLoadedEpisode(info, true);
            }).catch((e) => {
                advancingToNext = false;
                console.log('[AnimeTracker v6] echec chargement episode suivant', e);
                setStatus('Erreur : impossible de charger l\'episode suivant');
            });
        }

        function goToPreviousEpisode() {
            if (ytActive && currentEpisode) {
                const prev = episodeInfoForNumber(currentEpisode, Number(currentEpisode.episodeNumber) - 1);
                if (prev && Number(prev.episodeNumber) >= 1) { outroSkipSuspended = true; applyLoadedEpisode(prev, true); return; }
            }
            if (!currentEpisode || !hasPrevEpisode(currentEpisode)) { alert('Aucun episode precedent detecte.'); return; }
            outroSkipSuspended = true;
            setStatus('Chargement de l\'episode precedent...');
            buildPrevEpisodeInfo().then((info) => {
                applyLoadedEpisode(info, true);
            }).catch((e) => {
                console.log('[AnimeTracker v6] echec chargement episode precedent', e);
                setStatus('Erreur : impossible de charger l\'episode precedent');
            });
        }

        function goToEpisodeNumber(targetNumber) {
            if (!currentEpisode) { setStatus('Ouvre d\'abord un episode.'); return; }
            // Serie sur YouTube : on cherche directement l'episode la-bas.
            if (ytActive) { const info = episodeInfoForNumber(currentEpisode, targetNumber); if (info) applyLoadedEpisode(info, true); return; }
            if (currentEpisode.navStyle === 'index') {
                // indexOf plutot que "targetNumber - 1" : la numerotation
                // peut avoir des trous (SITE_ODYSEE) ou la position dans le
                // tableau ne correspond pas au numero d'episode.
                const idx = currentEpisode.episodeNumbersByIndex.indexOf(targetNumber);
                if (idx === -1) { setStatus('Pas d\'episode ' + targetNumber + ' dans la playlist connue (total : ' + currentEpisode.totalEpisodes + ').'); return; }
                applyLoadedEpisode(Object.assign({}, currentEpisode, {
                    embedSrc: currentEpisode.embedByIndex[idx], embedCandidates: currentEpisode.embedCandidatesByIndex ? currentEpisode.embedCandidatesByIndex[idx] : undefined, episodeIndex: idx, episodeNumber: targetNumber, episodeLabel: 'Episode ' + targetNumber,
                    resumeUrl: currentEpisode.resumeUrlsByIndex[idx]
                }), true);
                return;
            }
            // v6.29 : plus de blocage sur latestKnownEpisode (perime entre deux
            // verifications -> "Aller 113" refuse alors que l'episode existait).
            const site = SITES.find((s) => s.id === currentEpisode.site);
            const ep = currentEpisode;
            const guessed = (ep.episodeUrlsByNumber && ep.episodeUrlsByNumber[targetNumber]) ||
                (site.buildEpisodeUrl ? site.buildEpisodeUrl(ep.pageUrl, targetNumber) : null);
            if (guessed && ep.navigate) { navigateToEpisodePage(guessed); return; }
            const load = (url) => fetchPageHtml(url).then((html) => site.extract(new DOMParser().parseFromString(html, 'text/html'), url));
            setStatus('Recherche de l\'episode ' + targetNumber + '...');
            (guessed ? load(guessed) : Promise.reject(new Error('url'))).catch((e) => {
                if (/statut 5\d\d/.test((e && e.message) || '')) throw e;
                // Repli : l'adresse devinee n'existe pas (le site change parfois le
                // nom de l'episode) -> lien "-eN" de la page de la serie, le plus proche
                // de l'adresse actuelle (la page liste aussi les autres saisons).
                return findEpisodeLinkOnSeriesPage(ep, targetNumber).then((url) => url ? (ep.navigate ? (navigateToEpisodePage(url), 'nav') : load(url)) : null);
            }).then((info) => {
                if (info === 'nav') return;
                if (!info) { setStatus('Episode ' + targetNumber + ' introuvable.'); return; }
                applyLoadedEpisode(info, true);
            }).catch((e) => {
                const serverError = /statut 5\d\d/.test((e && e.message) || '');
                setStatus(serverError ? 'Erreur serveur, reessaie dans un instant.' : 'Erreur : episode ' + targetNumber + ' introuvable.');
            });
        }

        function findEpisodeLinkOnSeriesPage(ep, n) {
            if (!ep.seriesUrl || !/^https:/i.test(ep.seriesUrl)) return Promise.resolve(null);
            const re = new RegExp('[-_/](?:e|ep|episode)[-_]?0*' + n + '(?:[-_/][^/]*)?/?$', 'i');
            return fetchPageHtml(ep.seriesUrl).then((html) => {
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const links = Array.from(doc.querySelectorAll('a[href]')).map((a) => resolveUrl(a.getAttribute('href'), ep.seriesUrl)).filter((u) => u && re.test(u.replace(/[?#].*$/, '')));
                const common = (u) => { let i = 0; while (i < u.length && u[i] === ep.pageUrl[i]) i++; return i; };
                return links.sort((a, b) => common(b) - common(a))[0] || null;
            }).catch(() => null);
        }

        function disableLiveVideoOnPage() {
            // esprit-donghua/animoflix : neutralise l'iframe native du
            // lecteur pour eviter un flux video en double sous notre calque.
            // anime-sama : #playerDF charge desormais ansembed par defaut.
            const iframe = document.getElementById('odysee-iframe') || document.querySelector('iframe[src*="odysee.com"]') || document.querySelector('#epVideoFrame') || document.getElementById('playerDF') ||
                // Sites ajoutes : relu ici (french-anime recree son lecteur apres le chargement).
                (site.custom ? document.getElementById('film_iframe') || findPlayerIframe(document) || site.liveIframe : null);
            if (iframe && iframe.src && iframe.src !== 'about:blank') {
                iframe.src = 'about:blank';
                console.log('[AnimeTracker v6] lecteur natif de la page desactive (evite un flux video en double)');
            }
        }

        function startEpisode(infoPromise, reason) {
            Promise.resolve(infoPromise).then((info) => {
                if (!info) { console.log('[AnimeTracker v6] aucun episode detecte sur cette page'); return; }
                disableLiveVideoOnPage();
                // Sites ajoutes : le site peut (re)creer son lecteur apres coup
                // (french-anime le fait apres le chargement) -> son en double.
                if (site.custom) [1000, 3000, 6000, 10000].forEach((ms) => setTimeout(disableLiveVideoOnPage, ms));
                const { overlay } = buildOverlay();
                overlay.style.display = 'block';

                if (currentEpisode && currentEpisode.site === info.site && currentEpisode.seriesUrl === info.seriesUrl &&
                    currentEpisode.episodeNumber === info.episodeNumber && overlayEls.playerFrame.src) {
                    console.log('[AnimeTracker v6] episode deja charge, reaffichage - raison :', reason);
                    currentEpisode = info;
                    applyRuntimeConfig(storageKey(info));
                    sendConfigToPlayerFrame();
                    postToPlayerFrame({ type: MSG_PREFIX + 'play' });
                    setStatus('Lecture');
                    buildPersistentPanel();
                    return;
                }
                console.log('[AnimeTracker v6] demande de lecture (' + info.site + ') :', info.embedSrc, '- raison :', reason);
                applyLoadedEpisode(info, false);
            }).catch((e) => console.log('[AnimeTracker v6] echec ouverture du lecteur', e));
        }

        function maybeAutoOpenPlayer(liveInfoPromise) {
            let continuing = false;
            try { continuing = sessionStorage.getItem('vc-continue-playing') === '1'; sessionStorage.removeItem('vc-continue-playing'); } catch (e) {}
            if (!isAutoOpenEnabled() && !continuing) return;
            Promise.resolve(liveInfoPromise).then((info) => {
                if (!info || isSeriesExcluded(storageKey(info))) return;
                startEpisode(Promise.resolve(info), 'auto au chargement de la page');
            });
        }

        function applyUpdatedConfigIfCurrent(key) {
            if (!currentEpisode || storageKey(currentEpisode) !== key) return;
            applyRuntimeConfig(key);
            sendConfigToPlayerFrame();
        }

        const INTRO_OUTRO_LABELS = {
            introStart: 'Debut du generique de debut (vide = il commence a 0:00, pas de resume avant)',
            introEnd: 'Fin du generique de debut',
            outroStart: 'Debut du generique de fin',
            outroEnd: 'Fin du generique de fin (vide = episode suivant des le generique ; a remplir si l\'episode continue apres)'
        };
        function promptIntroOutro(field) {
            if (!currentEpisode) { alert('Ouvre d\'abord le lecteur sur un episode.'); return; }
            const key = storageKey(currentEpisode);
            const current = getIntroOutroForKey(key)[field];
            const input = prompt(INTRO_OUTRO_LABELS[field] + ' pour "' + currentEpisode.seriesName + '" (format mm:ss, ou ex. 0712 pour 7:12) :', formatTimecode(current));
            if (input === null) return;
            // Champ vide = effacer (utile pour les 2 bornes optionnelles).
            const seconds = input.trim() ? parseTimecode(input) : null;
            if (input.trim() && seconds === null) return;
            setIntroOutroForKey(key, { [field]: seconds });
            applyUpdatedConfigIfCurrent(key);
        }

        function parseTimecode(input) {
            if (!input) return null;
            input = input.trim();
            if (input.indexOf(':') !== -1) {
                const parts = input.split(':').map((p) => parseInt(p, 10));
                if (parts.some(isNaN)) return null;
                let seconds = 0;
                for (let i = 0; i < parts.length; i++) seconds = seconds * 60 + parts[i];
                return seconds;
            }
            if (!/^\d+$/.test(input)) return null;
            const seconds = parseInt(input.slice(-2), 10);
            const minutes = parseInt(input.slice(0, -2) || '0', 10);
            if (isNaN(seconds) || isNaN(minutes)) return null;
            return minutes * 60 + seconds;
        }
        function formatTimecode(seconds) {
            if (seconds === undefined || seconds === null) return '';
            const m = Math.floor(seconds / 60);
            const s = seconds % 60;
            return m + ':' + String(s).padStart(2, '0');
        }

        // Meme principe que l'assistant Diablo IV : ouvre l'URL brute GitHub
        // du script (@downloadURL), Tampermonkey intercepte et propose
        // "Mettre a jour" / "Reinstaller" selon la version. Repli en dur si
        // GM_info ne la porte pas (copie importee a la main).
        function openScriptUpdatePage() {
            const url = (typeof GM_info !== 'undefined' && GM_info.script && (GM_info.script.downloadURL || GM_info.script.updateURL)) ||
                'https://raw.githubusercontent.com/Tryne-graphik/Vid-os-continuum/master/esprit-donghua-suivi-progression-v6.user.js';
            window.open(url, '_blank', 'noopener,noreferrer');
        }

        function openSettingsModal() {
            const progress = loadProgress();
            const entries = Object.keys(progress).map((k) => Object.assign({ key: k }, progress[k]))
                .sort((a, b) => (a.siteLabel || '').localeCompare(b.siteLabel || '') || a.seriesName.localeCompare(b.seriesName));

            const overlay = document.createElement('div');
            overlay.id = 'ep-settings-overlay';
            overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:1000001;display:flex;align-items:center;justify-content:center;';

            const box = document.createElement('div');
            box.style.cssText = 'background:#15151f;color:#eee;max-width:760px;width:92%;max-height:80vh;overflow:auto;border-radius:8px;padding:20px;font-family:Arial,sans-serif;';

            let html = '<h2 style="margin-top:0;color:#03d0fc;font-size:16px;">Reglages intro/outro des animes suivis</h2>';
            if (entries.length === 0) {
                html += '<p style="font-size:13px;color:#aaa;">Aucun anime suivi pour le moment.</p>';
            } else {
                html += '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
                html += '<tr style="text-align:left;color:#aaa;border-bottom:1px solid #333;">' +
                    '<th style="padding:6px 4px;">Site</th><th style="padding:6px 4px;">Anime</th>' +
                    '<th style="padding:6px 4px;">Début intro</th><th style="padding:6px 4px;">Fin intro</th><th style="padding:6px 4px;">Début outro</th><th style="padding:6px 4px;">Fin outro</th>' +
                    '<th style="padding:6px 4px;">Suivi</th></tr>';
                entries.forEach((e) => {
                    const io = getIntroOutroForKey(e.key);
                    const tracked = !isSeriesExcluded(e.key);
                    const unconfigured = !io.introEnd && !io.outroStart;
                    const rowStyle = unconfigured ? 'background:rgba(255,179,0,.08);' : '';
                    html += '<tr style="border-bottom:1px solid #222;' + rowStyle + '" data-key="' + escapeHtml(e.key) + '">' +
                        '<td style="padding:6px 4px;color:#888;">' + (e.siteTag || '') + '</td>' +
                        '<td style="padding:6px 4px;">' + (unconfigured ? '&#9888; ' : '') + escapeHtml(e.seriesName) + '</td>' +
                        '<td style="padding:6px 4px;"><input type="text" class="ep-set-introStart-input" aria-label="Début intro" placeholder="mm:ss" style="width:60px;background:#000;color:#eee;border:1px solid #333;border-radius:4px;padding:3px;" value="' + formatTimecode(io.introStart) + '"></td>' +
                        '<td style="padding:6px 4px;"><input type="text" class="ep-set-introEnd-input" aria-label="Fin intro" placeholder="mm:ss" style="width:60px;background:#000;color:#eee;border:1px solid #333;border-radius:4px;padding:3px;" value="' + formatTimecode(io.introEnd) + '"></td>' +
                        '<td style="padding:6px 4px;"><input type="text" class="ep-set-outroStart-input" aria-label="Début outro" placeholder="mm:ss" style="width:60px;background:#000;color:#eee;border:1px solid #333;border-radius:4px;padding:3px;" value="' + formatTimecode(io.outroStart) + '"></td>' +
                        '<td style="padding:6px 4px;"><input type="text" class="ep-set-outroEnd-input" aria-label="Fin outro" placeholder="mm:ss" style="width:60px;background:#000;color:#eee;border:1px solid #333;border-radius:4px;padding:3px;" value="' + formatTimecode(io.outroEnd) + '"></td>' +
                        '<td style="padding:6px 4px;text-align:center;"><input type="checkbox" class="ep-set-tracked-input" ' + (tracked ? 'checked' : '') + '></td>' +
                        '</tr>';
                });
                html += '</table>';
            }
            html += '<div style="margin-top:16px;text-align:right;">' +
                '<button id="ep-settings-save" style="background:#03d0fc;color:#000;border:none;padding:8px 14px;border-radius:4px;cursor:pointer;font-weight:bold;margin-right:8px;">Enregistrer</button>' +
                '<button id="ep-settings-close" style="background:#333;color:#fff;border:none;padding:8px 14px;border-radius:4px;cursor:pointer;">Fermer</button></div>';

            box.innerHTML = html;
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            focusDialog(overlay);
            overlay.addEventListener('click', (ev) => { if (ev.target === overlay) overlay.remove(); });
            box.querySelector('#ep-settings-close').addEventListener('click', () => overlay.remove());
            const saveBtn = box.querySelector('#ep-settings-save');
            if (saveBtn) saveBtn.addEventListener('click', () => {
                box.querySelectorAll('tr[data-key]').forEach((row) => {
                    const key = row.getAttribute('data-key');
                    const patch = {};
                    ['introStart', 'introEnd', 'outroStart', 'outroEnd'].forEach((f) => { patch[f] = parseTimecode(row.querySelector('.ep-set-' + f + '-input').value); });
                    const tracked = row.querySelector('.ep-set-tracked-input').checked;
                    setIntroOutroForKey(key, patch);
                    setSeriesExcluded(key, !tracked);
                    applyUpdatedConfigIfCurrent(key);
                });
                overlay.remove();
                buildPersistentPanel();
            });
        }

