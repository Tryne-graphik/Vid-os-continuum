    // ================= Reseau =================

    function gmRequest(details) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest(Object.assign({}, details, { onload: resolve, onerror: reject, ontimeout: reject }));
        });
    }

    function fetchPageHtml(url, retriesLeft) {
        if (retriesLeft === undefined) retriesLeft = 1;
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
            throw new Error('Chargement de la page echoue, statut ' + res.status);
        });
    }

    function resolveUrl(href, baseUrl) {
        try { return new URL(href, baseUrl).href; } catch (e) { return href; }
    }

