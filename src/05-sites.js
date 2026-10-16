    // ================= Adaptateurs par site =================
    //
    // Chaque adaptateur expose : matchesUrl(url), isPlayablePage(doc),
    // extract(doc, pageUrl, rawHtml) -> Promise<InfoUnifie|null>.
    //
    // Forme unifiee retournee par extract() (voir commentaire de tete pour
    // le detail des deux styles de navigation 'page' et 'index') :
    //   { site, siteLabel, siteTag, playerOrigin, navStyle,
    //     embedSrc, pageUrl, resumeUrl, seriesUrl, seriesName,
    //     episodeLabel, episodeNumber, latestEpisodeNumber, latestEpisodeUrl,
    //     nextPageUrl, prevPageUrl,                       // navStyle 'page'
    //     episodeIndex, totalEpisodes, embedByIndex,        // navStyle 'index'
    //     episodeNumbersByIndex, resumeUrlsByIndex }        // (numero reel et
    //                                                        //  URL de reprise
    //                                                        //  par position -
    //                                                        //  ne PAS supposer
    //                                                        //  numero = index+1,
    //                                                        //  faux des qu'il y
    //                                                        //  a des trous, cf.
    //                                                        //  SITE_ODYSEE)

    function storageKey(info) { return info.site + '::' + info.seriesUrl; }

    // ---- esprit-donghua.xyz (repris de v4) ----
    const SITE_ESPRIT_DONGHUA = {
        id: 'esprit-donghua', label: 'Esprit Donghua', tag: 'ED',
        playerOrigin: PLAYER_ORIGIN_ODYSEE,
        matchesUrl(url) { return url.indexOf('https://esprit-donghua.xyz/') === 0; },
        isPlayablePage(doc) { return !!extractOdyseeIframe(doc); },
        extract(doc, pageUrl) {
            const iframe = extractOdyseeIframe(doc);
            const rawSrc = iframe ? iframe.getAttribute('src') : null;
            const embedSrc = rawSrc ? resolveUrl(rawSrc, pageUrl) : null;
            if (!embedSrc) return Promise.resolve(null);

            const seriesLink = doc.querySelector('#singlepisode .headlist .det h2 a');
            const seriesUrl = seriesLink && seriesLink.getAttribute('href') ? resolveUrl(seriesLink.getAttribute('href'), pageUrl) : null;
            const seriesName = seriesLink ? seriesLink.textContent.trim() : null;

            const episodeMeta = doc.querySelector('meta[itemprop="episodeNumber"]');
            const titleEl = doc.querySelector('h1.entry-title');

            const nextLink = extractAdjacentEpisodeLink(doc, '.naveps.bignav', 'next', true);
            const prevLink = extractAdjacentEpisodeLink(doc, '.naveps.bignav', 'prev', false);

            const firstLi = doc.querySelector('#singlepisode .episodelist li');
            let latestEpisodeNumber = null, latestEpisodeUrl = null;
            if (firstLi) {
                const link = firstLi.querySelector('a[href]');
                const span = firstLi.querySelector('.playinfo span');
                const match = span ? span.textContent.match(/Eps\s*(\d+)/i) : null;
                if (link && match) { latestEpisodeNumber = match[1]; latestEpisodeUrl = resolveUrl(link.getAttribute('href'), pageUrl); }
            }
            // Numero affiche ("Eps 193") -> adresse (s5-e17) : la numerotation de
            // l'URL repart a chaque saison, "Aller" ne peut pas la deviner (v6.29).
            const episodeUrlsByNumber = {};
            doc.querySelectorAll('#singlepisode .episodelist li').forEach((li) => {
                const a = li.querySelector('a[href]');
                const m = (li.textContent || '').match(/Eps\s*(\d+)/i);
                if (a && m) episodeUrlsByNumber[Number(m[1])] = resolveUrl(a.getAttribute('href'), pageUrl);
            });

            if (!seriesUrl) return Promise.resolve(null);
            return Promise.resolve({
                site: this.id, siteLabel: this.label, siteTag: this.tag, playerOrigin: this.playerOrigin, navStyle: 'page',
                embedSrc: embedSrc, pageUrl: pageUrl, resumeUrl: pageUrl,
                seriesUrl: seriesUrl, seriesName: seriesName,
                episodeLabel: titleEl ? titleEl.textContent.trim() : null,
                episodeNumber: episodeMeta ? episodeMeta.getAttribute('content') : null,
                latestEpisodeNumber: latestEpisodeNumber, latestEpisodeUrl: latestEpisodeUrl, episodeUrlsByNumber: episodeUrlsByNumber,
                nextPageUrl: nextLink ? resolveUrl(nextLink, pageUrl) : null,
                prevPageUrl: prevLink ? resolveUrl(prevLink, pageUrl) : null
            });
        },
        buildEpisodeUrl(currentPageUrl, targetNumber) {
            // Le site ecrit au moins 2 chiffres : -e06 existe, -e6 = 404.
            const m = currentPageUrl.match(/^(.*-e)(\d+)(\/?)$/i);
            return m ? m[1] + String(targetNumber).padStart(2, '0') + m[3] : null;
        }
    };

    function extractOdyseeIframe(doc) {
        return doc.getElementById('odysee-iframe') || doc.querySelector('iframe[src*="odysee.com"]');
    }

    function extractAdjacentEpisodeLink(doc, containerSelector, rel, fallbackAtEnd) {
        let link = doc.querySelector(containerSelector + ' a[rel="' + rel + '"]');
        if (!link) {
            const navContainer = doc.querySelector(containerSelector);
            if (navContainer) {
                const navItems = navContainer.querySelectorAll('.nvs');
                if (navItems.length > 0) link = navItems[fallbackAtEnd ? navItems.length - 1 : 0].querySelector('a[href]');
            }
        }
        return link ? link.getAttribute('href') : null;
    }

    // ---- animoflix.to ----
    const SITE_ANIMOFLIX = {
        id: 'animoflix', label: 'Animoflix', tag: 'AF',
        playerOrigin: PLAYER_ORIGIN_SIBNET,
        // Tout le domaine (comme esprit-donghua), pas juste "/anime/..." -
        // sinon le panneau disparaissait sur l'accueil/le catalogue/etc.
        // (signale par l'utilisateur 2026-09-21). isPlayablePage() ci-dessous
        // reste le vrai filtre pour savoir si CETTE page a un episode a lire.
        matchesUrl(url) { return url.indexOf('https://animoflix.to/') === 0; },
        isPlayablePage(doc) { return !!doc.getElementById('epLecteurSelect'); },
        extract(doc, pageUrl) {
            const lecteurSelect = doc.getElementById('epLecteurSelect');
            if (!lecteurSelect) return Promise.resolve(null);
            // ansembed d'abord (v6.20 : sibnet ferme, animoflix n'a plus que
            // ansembed), sibnet en secours. Aucun des deux (ex. sendvid seul) :
            // embedSrc reste null et le lecteur natif du site reste utilisable.
            // Tous les lecteurs de la page, ansembed puis sibnet d'abord : si
            // le 1er est mort (lien 404 chez l'hebergeur), le calque essaie le
            // suivant (v6.21).
            const options = Array.from(lecteurSelect.querySelectorAll('option'));
            const rank = (o) => { const i = ['ansembed.net', 'video.sibnet.ru'].indexOf(o.getAttribute('data-host')); return i === -1 ? 9 : i; };
            const embedCandidates = options.slice().sort((a, b) => rank(a) - rank(b)).map((o) => o.getAttribute('value'))
                .filter((v, i, all) => /^https:\/\//.test(v || '') && all.indexOf(v) === i);
            const embedSrc = embedCandidates[0] || null;

            const seriesLink = doc.querySelector('a.ep-anime-link');
            const seriesUrl = seriesLink && seriesLink.getAttribute('href') ? resolveUrl(seriesLink.getAttribute('href'), pageUrl) : null;
            const seriesName = seriesLink ? seriesLink.textContent.trim() : null;

            const epNumEl = doc.querySelector('h1.ep-h1 .ep-num');
            const epNumMatch = epNumEl ? epNumEl.textContent.match(/(\d+)/) : null;
            const h1 = doc.querySelector('h1.ep-h1');

            const nextBtn = doc.querySelector('a.ep-nav-btn.next-btn');
            const prevBtn = doc.querySelector('a.ep-nav-btn[aria-label="Épisode précédent"]');

            if (!seriesUrl) return Promise.resolve(null);
            return Promise.resolve({
                site: this.id, siteLabel: this.label, siteTag: this.tag, playerOrigin: this.playerOrigin, navStyle: 'page',
                embedSrc: embedSrc, embedCandidates: embedCandidates, pageUrl: pageUrl, resumeUrl: pageUrl,
                seriesUrl: seriesUrl, seriesName: seriesName,
                episodeLabel: h1 ? h1.textContent.replace(/\s+/g, ' ').trim() : null,
                episodeNumber: epNumMatch ? epNumMatch[1] : null,
                // Pas de colonne "dernier episode publie" reperee sur ce
                // site (contrairement a #singlepisode .episodelist sur
                // esprit-donghua) - a ajouter plus tard si une source est
                // trouvee. Sans ca, le badge "nouvel episode" ne peut pas
                // fonctionner pour ce site pour l'instant.
                latestEpisodeNumber: null, latestEpisodeUrl: null,
                nextPageUrl: nextBtn ? resolveUrl(nextBtn.getAttribute('href'), pageUrl) : null,
                prevPageUrl: prevBtn ? resolveUrl(prevBtn.getAttribute('href'), pageUrl) : null
            });
        },
        buildEpisodeUrl(currentPageUrl, targetNumber) {
            const m = currentPageUrl.match(/^(.*episode-)(\d+)(\/?)$/i);
            return m ? m[1] + targetNumber + m[3] : null;
        }
    };

    // ---- anime-sama.to ----
    //
    // Voir commentaire de tete : pas de page par episode, tout est sur la
    // page de saison via des tableaux JS (eps1/eps2/eps3...) charges depuis
    // un fichier "episodes.js" propre a chaque saison/langue. On ne
    // ré-execute jamais ce fichier (pas d'eval/new Function sur du JS
    // distant) - juste une lecture par expression reguliere des tableaux
    // `var epsN = [...]`, largement suffisant vu leur forme tres reguliere
    // (une simple liste d'URLs entre guillemets).
    const SITE_ANIME_SAMA = {
        id: 'anime-sama', label: 'Anime-Sama', tag: 'AS',
        playerOrigin: PLAYER_ORIGIN_SIBNET,
        // Tout le domaine (voir commentaire equivalent sur Animoflix
        // ci-dessus) - isPlayablePage() reste limite aux vraies pages de
        // saison/langue (presence de #playerDF).
        matchesUrl(url) { return url.indexOf('https://anime-sama.to/') === 0; },
        isPlayablePage(doc) { return !!doc.getElementById('playerDF'); },
        extract(doc, pageUrl) {
            const scriptEl = Array.from(doc.querySelectorAll('script[src]')).find((s) => /episodes\.js/i.test(s.getAttribute('src') || ''));
            if (!scriptEl) return Promise.resolve(null);
            const episodesJsUrl = resolveUrl(scriptEl.getAttribute('src'), pageUrl);
            const titreEl = doc.getElementById('titreOeuvre');
            const seriesName = titreEl ? titreEl.textContent.trim() : null;
            // La page de saison/langue elle-meme sert de cle de serie (une
            // saison ou une langue differente = une entree de suivi
            // differente, comme pour un "anime" separe sur les autres sites).
            const seriesUrl = pageUrl.replace(/#.*$/, '');

            return fetchPageHtml(episodesJsUrl).then((jsText) => {
                const epsArrays = parseEpsArrays(jsText);
                const embedByIndex = buildEmbedByIndex(epsArrays);
                const totalEpisodes = embedByIndex.length;
                if (totalEpisodes === 0) return null;
                // Pas de trous possibles ici (tableau JS du site, un index =
                // un episode) - numero = index+1, contrairement a SITE_ODYSEE.
                const episodeNumbersByIndex = embedByIndex.map((_, i) => i + 1);
                const resumeUrlsByIndex = embedByIndex.map((_, i) => seriesUrl + '#ep=' + (i + 1));

                // Reprend l'episode indique dans l'ancre #ep=N laissee par
                // notre propre "URL de reprise" (voir resumeUrl plus bas) -
                // sinon demarre au premier episode.
                const hashMatch = pageUrl.match(/#ep=(\d+)/);
                let episodeIndex = hashMatch ? Math.max(0, Math.min(totalEpisodes - 1, parseInt(hashMatch[1], 10) - 1)) : 0;

                return {
                    site: this.id, siteLabel: this.label, siteTag: this.tag, playerOrigin: this.playerOrigin, navStyle: 'index',
                    embedSrc: embedByIndex[episodeIndex], pageUrl: seriesUrl, resumeUrl: resumeUrlsByIndex[episodeIndex],
                    seriesUrl: seriesUrl, seriesName: seriesName,
                    episodeLabel: 'Episode ' + (episodeIndex + 1),
                    episodeNumber: episodeIndex + 1,
                    // Le total d'episodes deja charges sert de "dernier
                    // episode connu" - se rafraichit en re-fetchant
                    // episodes.js (checkForNewEpisodes), pas d'appel reseau
                    // supplementaire dedie necessaire.
                    latestEpisodeNumber: totalEpisodes, latestEpisodeUrl: seriesUrl + '#ep=' + totalEpisodes,
                    episodeIndex: episodeIndex, totalEpisodes: totalEpisodes, embedByIndex: embedByIndex,
                    episodeNumbersByIndex: episodeNumbersByIndex, resumeUrlsByIndex: resumeUrlsByIndex
                };
            }).catch((e) => {
                console.log('[AnimeTracker v6] (anime-sama) echec lecture episodes.js', e);
                return null;
            });
        }
    };

    // Extrait chaque tableau `var epsN = ['url', "url", ...];` sans jamais
    // executer le fichier - juste une lecture texte, dans l'ordre ou les
    // URLs apparaissent (qui correspond a l'ordre des episodes, tel
    // qu'utilise par le site lui-meme, cf. code source anime-sama observe :
    // `for (var i = 1; i <= tailleEpisodes; i++)` sur eps1).
    function parseEpsArrays(jsText) {
        const arrays = {};
        const arrayRe = /var\s+eps(\d+)\s*=\s*\[([\s\S]*?)\]\s*;/g;
        let m;
        while ((m = arrayRe.exec(jsText))) {
            const n = m[1];
            const body = m[2];
            const urls = [];
            const strRe = /'([^']*)'|"([^"]*)"/g;
            let sm;
            while ((sm = strRe.exec(body))) urls.push(sm[1] !== undefined ? sm[1] : sm[2]);
            arrays[n] = urls;
        }
        return arrays; // { "1": [...], "2": [...], ... }
    }

    // Pour chaque index d'episode, prend la premiere URL d'un hebergeur
    // gere parmi les lecteurs disponibles a CET index (la disponibilite par
    // hebergeur peut varier episode par episode - constate en inspectant un
    // vrai fichier episodes.js). Ansembed d'abord (lecteur par defaut du
    // site, sibnet en 403 depuis 2026-10-01), sibnet en secours. null si
    // aucun hebergeur gere pour cet episode precis.
    const ANIME_SAMA_HOSTS = [/ansembed\.net/i, /sibnet\.ru/i];
    function buildEmbedByIndex(epsArrays) {
        const lecteurKeys = Object.keys(epsArrays).sort((a, b) => Number(a) - Number(b));
        const maxLen = lecteurKeys.reduce((max, k) => Math.max(max, epsArrays[k].length), 0);
        const result = [];
        for (let i = 0; i < maxLen; i++) {
            const urls = lecteurKeys.map((k) => epsArrays[k][i]).filter(Boolean);
            let found = null;
            for (let h = 0; h < ANIME_SAMA_HOSTS.length && !found; h++) found = urls.find((u) => ANIME_SAMA_HOSTS[h].test(u)) || null;
            result.push(found);
        }
        return result;
    }

    // ---- odysee.com (navigation directe, hors esprit-donghua.xyz) ----
    //
    // Voir le commentaire d'en-tete (AJOUT 2026-09-26) pour le contexte
    // complet. Resume : pas de "chaine officielle" avec les episodes dans
    // l'ordre sur Odysee - on reconstruit notre propre playlist ordonnee
    // via l'API publique claim_search (aucune authentification requise),
    // triee par numero d'episode devine dans le TITRE de chaque video
    // (seule source fiable constatee).
    const ODYSEE_API_URL = 'https://api.na-backend.odysee.com/api/v1/proxy?m=claim_search';
    const ODYSEE_PLAYLIST_REFRESH_MS = 60 * 60 * 1000; // 1h, comme checkForNewEpisodes

    function odyseeApiRequest(body) {
        return gmRequest({
            method: 'POST', url: ODYSEE_API_URL,
            headers: { 'Content-Type': 'application/json' },
            data: JSON.stringify(body)
        }).then((res) => {
            if (res.status < 200 || res.status >= 300) throw new Error('API Odysee, statut ' + res.status);
            const parsed = JSON.parse(res.responseText);
            if (parsed.error) throw new Error('API Odysee : ' + parsed.error.message);
            return parsed.result;
        });
    }

    // Pagine tant que la chaine a d'autres resultats - plafonne a 500 videos
    // par securite (largement suffisant pour retrouver les episodes recents
    // d'une serie en cours, l'usage vise ici - pas un archivage complet).
    function fetchAllOdyseeChannelClaims(channelName) {
        const pageSize = 50;
        function fetchPage(page, acc) {
            return odyseeApiRequest({
                jsonrpc: '2.0', method: 'claim_search',
                params: {
                    channel: channelName, claim_type: 'stream', stream_types: ['video'],
                    page: page, page_size: pageSize, order_by: ['release_time']
                }
            }).then((result) => {
                const items = (result && result.items) || [];
                const merged = acc.concat(items);
                if (items.length < pageSize || merged.length >= 500) return merged;
                return fetchPage(page + 1, merged);
            });
        }
        return fetchPage(1, []);
    }

    // Numero d'episode = dernier nombre trouve dans le titre - marche sur
    // les formats de nommage constates en usage reel sur ce type de chaine
    // ("Episode 484", "S02E480" -> 484/480 dans les 2 cas, meme si "02"
    // apparait aussi plus tot dans le titre).
    function guessOdyseeEpisodeNumber(title) {
        const matches = title.match(/\d+/g);
        return matches ? parseInt(matches[matches.length - 1], 10) : null;
    }

    // Prefixe de serie = titre sans l'etiquette d'episode finale - gere les
    // 2 formats constates POUR LA MEME SERIE sur LA MEME chaine
    // ("... Season 2 Episode 484 vostfr" et "... S02E480 vostfr" donnent
    // tous deux "..." une fois les etiquettes retirees). Heuristique texte
    // best-effort (pas de structure fiable cote site) - a affiner si
    // d'autres formats apparaissent en usage reel.
    function deriveOdyseeSeriesPrefix(title) {
        const matches = title.match(/\d+/g);
        if (!matches) return title.trim();
        const lastNumber = matches[matches.length - 1];
        const lastIndex = title.lastIndexOf(lastNumber);
        let prefix = title.slice(0, lastIndex);
        let previous;
        do {
            previous = prefix;
            prefix = prefix.replace(/\s*(?:Season|Saison)\s*\d*\s*$/i, '');
            prefix = prefix.replace(/\bS\d+E\s*$/i, '');
            prefix = prefix.replace(/\s*\b(?:Episode|Épisode|Ep\.?)\s*$/i, '');
        } while (prefix !== previous);
        return prefix.trim();
    }

    function odyseeWatchUrl(channelName, channelClaimId, streamName, streamClaimId) {
        return 'https://odysee.com/' + encodeURIComponent(channelName) + ':' + channelClaimId +
            '/' + encodeURIComponent(streamName) + ':' + streamClaimId;
    }
    function odyseeEmbedUrlFromWatchUrl(watchUrl) {
        return watchUrl.replace('https://odysee.com/', 'https://odysee.com/$/embed/');
    }

    // Construit la playlist triee pour une serie donnee sur une chaine :
    // filtre les videos de la chaine dont le prefixe de titre correspond,
    // et ne retient QUE celles marquees "vostfr" dans le titre - demande
    // explicite de l'utilisateur suite a des reposts "multi-traduction" en
    // realite sous-titres automatiquement (Google Trad) de mauvaise
    // qualite (le champ metadonnee "languages" de l'API ne permet pas de
    // les distinguer, il reste a 'en' meme pour du vrai contenu vostfr).
    function buildOdyseePlaylist(channelName, seriesPrefixLower) {
        return fetchAllOdyseeChannelClaims(channelName).then((items) => {
            const entries = [];
            items.forEach((item) => {
                const value = item.value || {};
                const title = value.title || item.name;
                const signing = item.signing_channel;
                if (!title || !signing) return;
                if (deriveOdyseeSeriesPrefix(title).toLowerCase() !== seriesPrefixLower) return;
                if (!/vostfr/i.test(title)) return;
                const episodeNumber = guessOdyseeEpisodeNumber(title);
                if (episodeNumber === null) return;
                const watchUrl = odyseeWatchUrl(signing.name, signing.claim_id, item.name, item.claim_id);
                entries.push({ episodeNumber: episodeNumber, title: title, watchUrl: watchUrl, embedUrl: odyseeEmbedUrlFromWatchUrl(watchUrl) });
            });
            entries.sort((a, b) => a.episodeNumber - b.episodeNumber);
            return entries;
        });
    }

    function odyseePlaylistCacheKey(channelName, seriesPrefixLower) { return channelName + '::' + seriesPrefixLower; }

    // Cache + rafraichissement periodique (comme checkForNewEpisodes) -
    // evite de repaginer toute la chaine a chaque page vue. En cas d'echec
    // reseau ou de chaine vide passagere, garde l'ancienne liste en cache
    // plutot que de tout perdre.
    function getOdyseePlaylist(channelName, seriesPrefixLower) {
        const cacheKey = odyseePlaylistCacheKey(channelName, seriesPrefixLower);
        const all = GM_getValue('odyseePlaylists', {});
        const cached = all[cacheKey];
        if (cached && (Date.now() - cached.builtAt) < ODYSEE_PLAYLIST_REFRESH_MS) return Promise.resolve(cached.entries);
        return buildOdyseePlaylist(channelName, seriesPrefixLower).then((entries) => {
            if (entries.length === 0 && cached) return cached.entries;
            const fresh = GM_getValue('odyseePlaylists', {});
            fresh[cacheKey] = { builtAt: Date.now(), entries: entries };
            GM_setValue('odyseePlaylists', fresh);
            return entries;
        }).catch((e) => {
            console.log('[AnimeTracker v6] (odysee) echec construction playlist', e);
            return cached ? cached.entries : [];
        });
    }

    const SITE_ODYSEE = {
        id: 'odysee', label: 'Odysee', tag: 'OD',
        playerOrigin: PLAYER_ORIGIN_ODYSEE,
        // Le domaine entier matche (comme les autres sites) - isPlayablePage()
        // filtre les pages qui ne sont pas une vraie page de video (accueil,
        // recherche, page de chaine...). Exclut aussi "/$/embed/..." par
        // securite (ne devrait jamais se charger en page principale en usage
        // normal - uniquement dans notre propre iframe pilotee).
        matchesUrl(url) {
            return url.indexOf('https://odysee.com/') === 0 &&
                url.indexOf('/$/embed/') === -1 && url.indexOf('/%24/embed/') === -1;
        },
        isPlayablePage(doc) { return !!doc.querySelector('meta[property="og:video"]'); },
        extract(doc, pageUrl) {
            const urlMeta = doc.querySelector('meta[property="og:url"]');
            const titleMeta = doc.querySelector('meta[property="og:title"]');
            const ogUrl = urlMeta ? urlMeta.getAttribute('content') : null;
            const fullTitle = titleMeta ? titleMeta.getAttribute('content') : null;
            if (!ogUrl || !fullTitle) return Promise.resolve(null);
            const pathMatch = ogUrl.match(/odysee\.com\/(@[^/]+)\//i);
            const channelName = pathMatch ? pathMatch[1] : null;
            if (!channelName) return Promise.resolve(null);

            const seriesPrefix = deriveOdyseeSeriesPrefix(fullTitle);
            const seriesPrefixLower = seriesPrefix.toLowerCase();
            const seriesUrl = 'https://odysee.com/@serie/' + channelName + '/' + encodeURIComponent(seriesPrefixLower);
            const currentEpisodeNumber = guessOdyseeEpisodeNumber(fullTitle);

            return getOdyseePlaylist(channelName, seriesPrefixLower).then((entries) => {
                const workingEntries = entries.slice();
                let episodeIndex = workingEntries.findIndex((e) => e.episodeNumber === currentEpisodeNumber);
                if (episodeIndex === -1 && currentEpisodeNumber !== null) {
                    // La video en cours peut manquer de la playlist en cache
                    // (rafraichie il y a moins d'1h, episode tout juste mis
                    // en ligne) - on l'ajoute a la volee pour ne pas bloquer
                    // le suivi de CETTE page, sans la sauvegarder dans le
                    // cache (evite de re-valider le filtre "vostfr" ici).
                    workingEntries.push({
                        episodeNumber: currentEpisodeNumber, title: fullTitle,
                        watchUrl: ogUrl, embedUrl: odyseeEmbedUrlFromWatchUrl(ogUrl)
                    });
                    workingEntries.sort((a, b) => a.episodeNumber - b.episodeNumber);
                    episodeIndex = workingEntries.findIndex((e) => e.episodeNumber === currentEpisodeNumber);
                }
                if (episodeIndex === -1) return null;

                const current = workingEntries[episodeIndex];
                const last = workingEntries[workingEntries.length - 1];
                return {
                    site: this.id, siteLabel: this.label, siteTag: this.tag, playerOrigin: this.playerOrigin, navStyle: 'index',
                    embedSrc: current.embedUrl, pageUrl: current.watchUrl, resumeUrl: current.watchUrl,
                    seriesUrl: seriesUrl, seriesName: seriesPrefix,
                    episodeLabel: current.title, episodeNumber: current.episodeNumber,
                    latestEpisodeNumber: last ? last.episodeNumber : null, latestEpisodeUrl: last ? last.watchUrl : null,
                    episodeIndex: episodeIndex, totalEpisodes: workingEntries.length,
                    embedByIndex: workingEntries.map((e) => e.embedUrl),
                    episodeNumbersByIndex: workingEntries.map((e) => e.episodeNumber),
                    resumeUrlsByIndex: workingEntries.map((e) => e.watchUrl)
                };
            });
        }
    };

    // ---- Sites ajoutes par l'utilisateur (v6.22, 1re brique du lecteur generique) ----
    //
    // "Ajouter ce site" (fenetre Mes animes) enregistre un domaine dans
    // GM customSites ; il recoit alors un adaptateur generique qui reconnait
    // deux formes de pages :
    //  - liste d'episodes "DLE" cachee dans la page (<div class="eps">
    //    "N!lien1,lien2,..." - french-anime.com et les sites du meme moteur) :
    //    navigation interne comme anime-sama, tous les lecteurs en secours ;
    //  - une page par episode avec un lecteur en iframe (myfluneo.eu) : le
    //    lecteur = la plus grande iframe, "suivant" = lien "Épisode suivant"
    //    du site, suivi par navigation (les pages peuvent etre generees en JS,
    //    donc pas de lecture du HTML brut).
    function loadCustomSites() { try { return GM_getValue('customSites', {}) || {}; } catch (e) { return {}; } }
    function hostOf(url) { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
    function hostMatches(url, host) { const h = hostOf(url); return h === host || h.endsWith('.' + host); }
    function cleanSeriesTitle(t) {
        return String(t || '').replace(/\s+/g, ' ').replace(/\s*\|.*$/, '')
            .replace(/\s+(?:en\s+)?(?:DDL\s+)?streaming\b.*$/i, '')
            .replace(/\s+(?:S\d+\s*)?(?:Ep\.?|Episode|\u00c9pisode)\s*\d+.*$/i, '')
            .replace(/\s+(?:VF|VOSTFR)\b.*$/i, '').trim();
    }
    // Lecteur "emballe" par le site (myfluneo : /embed-player?v=<base64 de
    // l'adresse ansembed>) : on decode pour piloter le vrai lecteur.
    function unwrapEmbed(src) {
        try {
            const u = new URL(src);
            for (const v of u.searchParams.values()) {
                if (/^https?:\/\//.test(v)) return v;
                if (/^[A-Za-z0-9+/=_-]{16,}$/.test(v)) {
                    const d = atob(v.replace(/-/g, '+').replace(/_/g, '/'));
                    if (/^https?:\/\/\S+$/.test(d)) return d;
                }
            }
        } catch (e) {}
        return src;
    }
    function parseDleEps(doc) {
        const box = doc.querySelector('.eps');
        if (!box) return null;
        const eps = box.textContent.split(/\r?\n|__NEWL__/).map((l) => l.trim().match(/^(\d+)!(.+)$/)).filter(Boolean).map((m) => ({
            num: Number(m[1]),
            urls: m[2].split(',').map((x) => x.trim().replace(/^https?:\/\/vidmoly\.me\/w\/([A-Za-z0-9]+).*$/, 'https://vidmoly.org/embed-$1.html'))
                .filter((x) => /^https:\/\//.test(x) && !/up4fun/i.test(x))
        })).filter((e) => e.urls.length);
        return eps.length ? eps.sort((a, b) => a.num - b.num) : null;
    }
    function findPlayerIframe(doc) {
        let best = null, bestArea = 0;
        doc.querySelectorAll('iframe').forEach((f) => {
            if (!/^https?:\/\//.test(f.src || '') || f.name === PLAYER_FRAME_NAME) return;
            const r = f.getBoundingClientRect ? f.getBoundingClientRect() : { width: 0, height: 0 };
            const area = r.width * r.height;
            if (r.width >= 300 && area > bestArea) { best = f; bestArea = area; }
        });
        return best;
    }
    const EP_IN_URL = /(episode|ep)[-_]?(\d+)/i;
    function makeGenericSite(host) {
        const site = {
            id: 'custom:' + host, label: host, tag: host.replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase(), playerOrigin: null, custom: true,
            matchesUrl(url) { return hostMatches(url, host); },
            isPlayablePage(doc) { return !!parseDleEps(doc) || EP_IN_URL.test(location.pathname); },
            buildEpisodeUrl(currentPageUrl, n) { return EP_IN_URL.test(currentPageUrl) ? currentPageUrl.replace(EP_IN_URL, (m0, w) => w + (m0.charAt(w.length) === '-' || m0.charAt(w.length) === '_' ? m0.charAt(w.length) : '') + n) : null; },
            extract(doc, pageUrl) {
                const h1 = doc.querySelector('h1');
                const og = doc.querySelector('meta[property="og:title"]');
                const seriesName = cleanSeriesTitle((h1 && h1.textContent) || (og && og.getAttribute('content')) || doc.title) || host;
                const eps = parseDleEps(doc);
                if (eps) {
                    const canon = doc.querySelector('link[rel="canonical"]');
                    const seriesUrl = ((canon && canon.getAttribute('href')) || pageUrl).replace(/#.*$/, '');
                    const nums = eps.map((e) => e.num);
                    const hash = pageUrl.match(/#ep=(\d+)/);
                    let idx = hash ? nums.indexOf(Number(hash[1])) : 0;
                    if (idx < 0) idx = 0;
                    const cands = eps.map((e) => e.urls);
                    const resumeUrls = nums.map((n) => seriesUrl + '#ep=' + n);
                    if (doc === document) site.liveIframe = doc.querySelector('#film_iframe') || findPlayerIframe(doc);
                    return Promise.resolve({
                        site: site.id, siteLabel: site.label, siteTag: site.tag, playerOrigin: null, navStyle: 'index',
                        embedSrc: cands[idx][0], embedCandidates: cands[idx], embedCandidatesByIndex: cands,
                        pageUrl: seriesUrl, resumeUrl: resumeUrls[idx], seriesUrl: seriesUrl, seriesName: seriesName,
                        episodeLabel: 'Episode ' + nums[idx], episodeNumber: nums[idx],
                        latestEpisodeNumber: nums[nums.length - 1], latestEpisodeUrl: resumeUrls[resumeUrls.length - 1],
                        episodeIndex: idx, totalEpisodes: eps.length, embedByIndex: cands.map((c) => c[0]),
                        episodeNumbersByIndex: nums, resumeUrlsByIndex: resumeUrls
                    });
                }
                // Page d'episode : seulement sur la page vivante (lecteur souvent
                // insere en JS apres le chargement -> on l'attend jusqu'a 10 s).
                if (doc !== document) return Promise.resolve(null);
                const m = location.pathname.match(EP_IN_URL);
                if (!m) return Promise.resolve(null);
                return new Promise((resolve) => {
                    let tries = 0;
                    (function poll() {
                        const f = findPlayerIframe(doc);
                        if (!f && ++tries < 20) { setTimeout(poll, 500); return; }
                        if (!f) { resolve(null); return; }
                        site.liveIframe = f;
                        const n = Number(m[2]);
                        const links = Array.from(doc.querySelectorAll('a[href]'));
                        const findLink = (re) => { const a = links.find((l) => re.test((l.textContent + ' ' + (l.getAttribute('aria-label') || '')).trim()) && l.href.replace(/#.*$/, '') !== location.href.replace(/#.*$/, '')); return a ? a.href : null; };
                        const pageNoHash = location.href.replace(/#.*$/, '');
                        resolve({
                            site: site.id, siteLabel: site.label, siteTag: site.tag, playerOrigin: null, navStyle: 'page', navigate: true,
                            embedSrc: unwrapEmbed(f.src), embedCandidates: [unwrapEmbed(f.src)],
                            pageUrl: pageNoHash, resumeUrl: pageNoHash,
                            // Serie = adresse sans le segment de l'episode (une saison = une entree, comme anime-sama).
                            seriesUrl: pageNoHash.replace(/\/[^/]*(?:episode|ep)[-_]?\d+[^/]*\/?$/i, '') || pageNoHash,
                            seriesName: seriesName, episodeLabel: 'Episode ' + n, episodeNumber: n,
                            latestEpisodeNumber: null, latestEpisodeUrl: null,
                            nextPageUrl: findLink(/(?:\u00e9pisode|episode)\s+suivant|^suivant|\bnext\b/i),
                            prevPageUrl: findLink(/(?:\u00e9pisode|episode)\s+pr\u00e9c\u00e9dent|pr\u00e9c\u00e9dent|\bprev(?:ious)?\b/i)
                        });
                    })();
                });
            }
        };
        return site;
    }

    const SITES = [SITE_ESPRIT_DONGHUA, SITE_ANIMOFLIX, SITE_ANIME_SAMA, SITE_ODYSEE].concat(Object.keys(loadCustomSites()).map(makeGenericSite));

    function detectSite() {
        const url = location.href.replace(/#.*$/, '');
        for (let i = 0; i < SITES.length; i++) if (SITES[i].matchesUrl(url)) return SITES[i];
        return null;
    }

