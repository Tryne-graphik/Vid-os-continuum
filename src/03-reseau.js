    // ================= Reseau =================

    function gmRequest(details) {
        return new Promise((resolve, reject) => {
            if (String(details.url).startsWith("http://127.0.0.1:8787/")) details = Object.assign({}, details, { headers: Object.assign({ "X-VC-Client": "1" }, details.headers) }); // service local : en-tête exigé par serve.js (7.13.1)
            GM_xmlhttpRequest(Object.assign({}, details, { onload: resolve, onerror: reject, ontimeout: reject }));
        });
    }

    const failedPages = {}; // v7.24 : 403 / 429 (anti-bot, limite de debit) retenus 5 min : on ne redemande pas en rafale
    function fetchPageHtml(url, retriesLeft) {
        if (retriesLeft === undefined) retriesLeft = 1;
        if (failedPages[url] && failedPages[url].until > Date.now()) return Promise.reject(new Error(failedPages[url].msg));
        // Meme site que la page : fetch() du navigateur, pas besoin d'@connect
        // (sites ajoutes par l'utilisateur, inconnus a l'avance - v6.23).
        let sameOrigin = false;
        try { sameOrigin = new URL(url, location.href).origin === location.origin; } catch (e) {}
        const req = sameOrigin
            ? fetch(url, { credentials: 'include' }).then((r) => r.text().then((t) => ({ status: r.status, responseText: t })))
            : gmRequest({ method: 'GET', url: url });
        return req.then((res) => {
            if (res.status >= 200 && res.status < 300) return res.responseText;
            if (res.status >= 500 && res.status < 600 && retriesLeft > 0) {
                return new Promise((resolve) => setTimeout(resolve, 1000)).then(() => fetchPageHtml(url, retriesLeft - 1));
            }
            const err = new Error('Chargement de la page echoue, statut ' + res.status);
            if (res.status === 403 || res.status === 429) failedPages[url] = { until: Date.now() + 300000, msg: err.message };
            throw err;
        });
    }

    function resolveUrl(href, baseUrl) {
        try { return new URL(href, baseUrl).href; } catch (e) { return href; }
    }

