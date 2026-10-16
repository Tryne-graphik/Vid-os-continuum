    // ================= Analyse pollution tierce (uBlock) =================
    //
    // Port JS des heuristiques du script E:\UblockAnalyzer\analyse-site.ps1
    // (projet separe, meme logique validee dessus) : re-fetch la page en
    // HTML brut - le DOM deja parse par le navigateur ne garde pas l'ordre
    // d'origine des balises situees avant <!DOCTYPE>, indice cle pour
    // reperer les injections publicitaires. Ne bloque rien : signale
    // seulement, a l'utilisateur de decider s'il ajoute des regles uBlock.

    const BRAND_REAL_SUFFIXES = {
        google: ['.google.com', '.googleapis.com', '.gstatic.com', '.googlesyndication.com', '.googletagmanager.com', '.google-analytics.com', '.doubleclick.net', '.googleusercontent.com', '.googleadservices.com', '.googlevideo.com'],
        gsyndication: ['.googlesyndication.com'],
        syndication: ['.googlesyndication.com'],
        akamai: ['.akamai.net', '.akamaized.net', '.akamaihd.net', '.akamaitechnologies.com', '.akamai-staging.net', '.edgekey.net', '.edgesuite.net'],
        akam: ['.akamai.net', '.akamaized.net', '.akamaihd.net', '.akamaitechnologies.com', '.edgekey.net', '.edgesuite.net'],
        cloudflare: ['.cloudflare.com', '.cloudflareinsights.com', '.cloudflarestream.com', '.cloudflare.net'],
        facebook: ['.facebook.com', '.fbcdn.net', '.facebook.net'],
        amazon: ['.amazon.com', '.amazonaws.com', '.cloudfront.net'],
        microsoft: ['.microsoft.com', '.msedge.net', '.live.com', '.office.com'],
        youtube: ['.youtube.com', '.googlevideo.com', '.ytimg.com']
    };

    const KNOWN_AD_NETWORKS = [
        'doubleclick.net', 'popads.net', 'propellerads.com', 'adsterra.com',
        'exoclick.com', 'juicyads.com', 'hilltopads.net', 'adnxs.com',
        'taboola.com', 'outbrain.com', 'criteo.com', 'media.net',
        'revcontent.com', 'mgid.com', 'bidvertiser.com', 'popcash.net',
        'adcash.com', 'yllix.com', 'clickadu.com', 'trafficjunky.com'
    ];

    const TRUSTED_IFRAME_HOSTS = [
        'odysee.com', 'video.sibnet.ru', 'ansembed.net', 'youtube.com',
        'youtube-nocookie.com', 'player.vimeo.com', 'dailymotion.com',
        'recaptcha.net', 'w.soundcloud.com'
    ];

    function hostFromUrl(rawUrl, baseUrl) {
        if (!rawUrl) return null;
        let u = rawUrl.trim();
        if (u.indexOf('//') === 0) u = 'https:' + u;
        try { return new URL(u, baseUrl).host; } catch (e) { return null; }
    }

    function domainLookalike(host) {
        if (!host) return null;
        const lower = host.toLowerCase();
        for (const brand in BRAND_REAL_SUFFIXES) {
            if (lower.indexOf(brand) !== -1) {
                const isReal = BRAND_REAL_SUFFIXES[brand].some((suf) => lower.endsWith(suf));
                if (!isReal) return "contient '" + brand + "' mais ne correspond a aucun vrai domaine " + brand + " connu";
            }
        }
        return null;
    }

    function isKnownAdNetwork(host) {
        if (!host) return false;
        const lower = host.toLowerCase();
        return KNOWN_AD_NETWORKS.some((net) => lower === net || lower.endsWith('.' + net));
    }

    function isTrustedIframeHost(host) {
        if (!host) return true;
        const lower = host.toLowerCase();
        return TRUSTED_IFRAME_HOSTS.some((t) => lower === t || lower.endsWith('.' + t) || lower.indexOf(t) !== -1);
    }

    function analyzeThirdPartyPollution(rawHtml, pageUrl) {
        const siteHost = hostFromUrl(pageUrl);
        const findings = [];
        const doctypeMatch = /<!DOCTYPE/i.exec(rawHtml);
        const doctypeIdx = doctypeMatch ? doctypeMatch.index : Infinity;

        const scriptRe = /<script\b[^>]*?src="([^"]+)"[^>]*>/gi;
        let m;
        while ((m = scriptRe.exec(rawHtml))) {
            const host = hostFromUrl(m[1], pageUrl);
            if (!host || host === siteHost) continue;
            const tagText = m[0];
            const beforeDoctype = m.index < doctypeIdx;
            const hasAsyncDefer = /\basync\b/.test(tagText) || /\bdefer\b/.test(tagText);
            const lookalike = domainLookalike(host);
            const knownAd = isKnownAdNetwork(host);

            if (beforeDoctype) {
                findings.push({ severity: 'ELEVEE', category: 'Position anormale', detail: "Script '" + host + "' charge AVANT le <!DOCTYPE> - hors flux HTML normal.", rule: '||' + host + '^' });
            }
            if (lookalike) {
                findings.push({ severity: 'ELEVEE', category: 'Imitation de domaine connu', detail: "Script '" + host + "' " + lookalike + '.', rule: '||' + host + '^' });
            }
            if (knownAd) {
                findings.push({ severity: 'MOYENNE', category: 'Reseau publicitaire connu', detail: "Script '" + host + "' correspond a un reseau pub/tracking deja connu.", rule: '||' + host + '^' });
            }
            if (!beforeDoctype && !lookalike && !knownAd && !hasAsyncDefer) {
                findings.push({ severity: 'FAIBLE', category: 'Script bloquant potentiel', detail: "Script tiers '" + host + "' sans async/defer.", rule: null });
            }
        }

        const iframeRe = /<iframe\b[^>]*?src="([^"]+)"[^>]*>/gi;
        while ((m = iframeRe.exec(rawHtml))) {
            const host = hostFromUrl(m[1], pageUrl);
            if (!host || host === siteHost) continue;
            if (!isTrustedIframeHost(host)) {
                findings.push({ severity: 'MOYENNE', category: 'Iframe tierce non reconnue', detail: "Iframe pointant vers '" + host + "', hors liste des lecteurs/services connus.", rule: '||' + host + '^' });
            }
        }

        return findings;
    }

    function showPollutionBanner(findings) {
        if (!findings.length) { console.log('[AnimeTracker v6] Analyse pollution tierce : rien a signaler.'); return; }
        console.warn('[AnimeTracker v6] Pollution tierce detectee (' + findings.length + ') :');
        findings.forEach((f) => console.warn('  [' + f.severity + '] ' + f.category + ' - ' + f.detail + (f.rule ? ' | regle : ' + f.rule : '')));

        // Encadre jaune retire en v6.32 (bruit sans action possible) : console seule (code supprime en v7.0).
    }

    function runPollutionAnalysis() {
        fetchPageHtml(location.href).then((html) => {
            const findings = analyzeThirdPartyPollution(html, location.href);
            showPollutionBanner(findings);
        }).catch((e) => console.log('[AnimeTracker v6] Analyse pollution tierce echouee : ' + e.message));
    }

