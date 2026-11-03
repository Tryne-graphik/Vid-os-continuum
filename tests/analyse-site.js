#!/usr/bin/env node
// Analyse statique d'un site : peut-il recevoir un adaptateur Video Continuum ?
// Usage : node tests/analyse-site.js <url-page-episode> [url-page-serie]
// Limite : HTML recu par fetch, sans JS. Si "0 iframe" alors que la page en a
// une a l'ecran, le site la construit en JS -> verifier a la main (Playwright).
const KNOWN = { 'odysee.com': 'ODYSEE', 'video.sibnet.ru': 'SIBNET', 'ansembed.net': 'ANSEMBED' };
const [epUrl, serieUrl] = process.argv.slice(2);
if (!epUrl) { console.log('Usage : node tests/analyse-site.js <url-episode> [url-serie]'); process.exit(1); }

const UA = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36', 'accept-language': 'fr-FR,fr;q=0.9' };
const abs = (h, base) => { try { return new URL(h, base).href; } catch (e) { return null; } };
const attr = (tag, name) => (tag.match(new RegExp('\\b' + name + '\\s*=\\s*["\']([^"\']*)["\']', 'i')) || [])[1];
const text = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

async function get(url) {
    const r = await fetch(url, { headers: UA, redirect: 'follow' });
    return { status: r.status, headers: r.headers, url: r.url, html: await r.text() };
}

function analysePage(p, label) {
    const out = { ok: [], ko: [], info: [] };
    const h = p.html;
    if (p.status >= 400) out.ko.push(`HTTP ${p.status}`);
    if (/just a moment|attention required|ddos-guard/i.test(h) || p.headers.get('cf-mitigated'))
        out.ko.push('Protection anti-bot (Cloudflare/DDoS-Guard) : le fetch du script (GM_xmlhttpRequest) risque d\'echouer');
    if (p.headers.get('server') && /cloudflare/i.test(p.headers.get('server'))) out.info.push('Derriere Cloudflare (ok tant qu\'il n\'y a pas de challenge)');

    // Lecteurs : iframes + data-src (lazy) dans le HTML brut.
    const frames = [...h.matchAll(/<iframe\b[^>]*>/gi)].map((m) => abs(attr(m[0], 'src') || attr(m[0], 'data-src') || attr(m[0], 'data-lazy-src') || '', p.url)).filter(Boolean);
    const extra = [...h.matchAll(/https?:\\?\/\\?\/(?:odysee\.com|video\.sibnet\.ru|ansembed\.net)[^"'\s<>\\]*/gi)].map((m) => m[0].replace(/\\/g, ''));
    const players = [...new Set([...frames, ...extra])];
    if (!players.length) out.ko.push('Aucune iframe/lecteur dans le HTML brut (page rendue en JS ? verifier a la main)');
    for (const u of players) {
        const host = new URL(u).hostname;
        const k = KNOWN[host];
        (k ? out.ok : out.info).push(k ? `Lecteur SUPPORTE ${k} : ${u}` : `Lecteur INCONNU ${host} : ${u} (le script du lecteur dans l'iframe devra etre adapte : @match + detection <video>)`);
    }
    if (/episodes\.js|var\s+eps\d*\s*=|const\s+eps\d*\s*=/i.test(h)) out.info.push('Liste d\'episodes dans un script (style anime-sama, navStyle "index")');

    // Numero d'episode.
    const num = (h.match(/itemprop=["']episodeNumber["'][^>]*content=["'](\d+)/i) || [])[1]
        || (text((h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '').match(/(?:[ée]pisode|ep\.?|e)\s*0*(\d+)/i) || [])[1]
        || (new URL(p.url).pathname.match(/(?:episode|ep|e)[-_/]?0*(\d+)/i) || [])[1];
    (num ? out.ok : out.ko).push(num ? `Numero d'episode lisible : ${num}` : 'Numero d\'episode introuvable (meta, h1, URL)');

    // Precedent / suivant.
    const links = [...h.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/gi)].map((m) => ({ tag: m[0], href: abs(attr(m[0], 'href') || '', p.url), t: text(m[0]), rel: attr(m[0], 'rel') }));
    const nav = (re, rel) => links.find((l) => l.href && (l.rel === rel || re.test(l.t) || re.test(attr(l.tag, 'class') || '')));
    const nxt = nav(/suivant|next/i, 'next'), prv = nav(/pr[ée]c[ée]dent|prev/i, 'prev');
    out[nxt ? 'ok' : 'info'].push(nxt ? `Lien suivant : ${nxt.href}` : 'Pas de lien "suivant" (ok si navigation par liste)');
    out[prv ? 'ok' : 'info'].push(prv ? `Lien precedent : ${prv.href}` : 'Pas de lien "precedent"');

    // Page serie.
    const host = new URL(p.url).host;
    const ser = links.filter((l) => l.href && new URL(l.href).host === host && /(anime|serie|series|catalogue|donghua|manga|saison)/i.test(new URL(l.href).pathname) && !/episode|\/ep[-_]?\d/i.test(l.href) && l.t);
    out[ser.length ? 'ok' : 'ko'].push(ser.length ? `Lien page serie probable : "${ser[0].t.slice(0, 50)}" -> ${ser[0].href}` : 'Aucun lien vers la page serie (cle de suivi impossible a deduire)');
    const og = (h.match(/property=["']og:title["'][^>]*content=["']([^"']+)/i) || [])[1];
    if (og) out.info.push(`Titre og:title : ${og}`);
    return { out, serie: ser[0] && ser[0].href, nextUrl: nxt && nxt.href };
}

function show(title, o) {
    console.log(`\n=== ${title} ===`);
    o.ok.forEach((s) => console.log('  [OK]   ' + s));
    o.info.forEach((s) => console.log('  [..]   ' + s));
    o.ko.forEach((s) => console.log('  [KO]   ' + s));
}

(async () => {
    const ep = await get(epUrl);
    const a = analysePage(ep, 'episode');
    show('Page episode ' + ep.url, a.out);
    let ko = a.out.ko.length;
    const sUrl = serieUrl || a.serie;
    if (sUrl) {
        const sp = await get(sUrl);
        const eps = [...sp.html.matchAll(/<a\b[^>]*href=["']([^"']*(?:episode|[-/]ep?[-_]?\d+)[^"']*)["']/gi)].length;
        const o = { ok: [], ko: [], info: [] };
        if (sp.status >= 400) o.ko.push('HTTP ' + sp.status);
        (eps ? o.ok : o.info).push(eps ? `${eps} liens d'episodes dans la page serie` : 'Aucun lien d\'episode dans le HTML brut (liste en JS ?)');
        show('Page serie ' + sp.url, o); ko += o.ko.length;
    }
    const host = new URL(ep.url).hostname;
    console.log(`\nA ajouter dans l'en-tete : // @match https://${host}/*   // @connect ${host}`);
    console.log(ko ? '\nVERDICT : DIFFICILE / a verifier (voir [KO])' : '\nVERDICT : FAISABLE (adaptateur a ecrire dans src/05-sites.js)');
})().catch((e) => { console.error('Echec :', e.message); process.exit(1); });
