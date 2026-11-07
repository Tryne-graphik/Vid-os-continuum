#!/usr/bin/env node
// Tests unitaires sans navigateur ni dependance : node tests/unit.js
// Charge src/11-youtube.js dans un contexte avec de faux GM_* / reseau et verifie la logique de recherche YouTube
// (noms chinois, durees, cache, page illisible, chaines masquees). Code de sortie 1 si un test echoue.
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('ECHEC  ' + m); } else console.log('ok     ' + m); };

function makeCtx(opts) {
    const store = {}, calls = { fetch: 0, gm: 0 };
    const ctx = {
        console, Promise, Date, JSON, Object, Array, Math, String, Number, RegExp, decodeURIComponent, encodeURIComponent, setTimeout,
        GM_getValue: (k, d) => (k in store ? JSON.parse(JSON.stringify(store[k])) : d), GM_setValue: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); },
        storageKey: () => 'site::serie', seasonOf: () => null, aniSkip: null, displayName: (s) => s, escapeHtml: (s) => s,
        document: { querySelector: () => null },
        fetchPageHtml: (u) => { calls.fetch++; return opts.fetch(u); },
        gmRequest: () => { calls.gm++; return opts.gm ? opts.gm() : Promise.reject(new Error('hors ligne')); }
    };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(root, 'src/11-youtube.js'), 'utf8') + '\n;this.__api = { ytTitleOk, episodeRangeInTitle, fmtLen, searchYoutubeForEpisode, blockYoutubeChannel: (typeof blockYoutubeChannel === "function" ? blockYoutubeChannel : null) };', ctx);
    return { api: ctx.__api, store, calls };
}
const video = (id, title, owner, browse, len, cc) => ({ videoId: id, title: { simpleText: title }, lengthText: { simpleText: len }, ownerText: { runs: [{ text: owner, navigationEndpoint: { browseEndpoint: { browseId: browse } } }] }, badges: cc ? [{ metadataBadgeRenderer: { label: 'Sous-titres' } }] : [] });
const page = (vids) => '<script>var ytInitialData = ' + JSON.stringify({ contents: vids }) + ';</script>';
const info = { seriesName: 'Ni Tian Zhizun (Against the Sky Supreme)', episodeNumber: '411', embedSrc: '' };

(async () => {
    // --- fonctions pures
    const p = makeCtx({ fetch: () => Promise.resolve('') }).api;
    ok(p.ytTitleOk('《逆天至尊》Against The Sky Supreme EP411', '逆天至尊', 1), 'nom chinois present dans le titre');
    ok(!p.ytTitleOk('Peerless Martial Spirit EP 411', '逆天至尊', 1), 'nom chinois absent');
    ok(p.ytTitleOk('Against The Sky Supreme EP411', 'Against the Sky Supreme', 1), 'nom anglais');
    ok(JSON.stringify(p.episodeRangeInTitle('逆天至尊 第411集', 411)) === '{"first":411,"last":411}', 'titre chinois 第411集');
    ok(JSON.stringify(p.episodeRangeInTitle('逆天至尊 第411-420集', 415)) === '{"first":411,"last":420}', 'titre chinois 第411-420集');
    ok(p.episodeRangeInTitle('Against The Sky Supreme EP411', 411).first === 411, 'EP411');
    ok(p.fmtLen(711) === '11:51' && p.fmtLen(4227) === '1:10:27', 'formatage des durees');

    // --- recherche : resultat normal + cache
    const good = page([video('abc12345678', 'Against The Sky Supreme EP411', 'Tencent', 'UCtencent0000000000000000', '11:51', true),
        video('def12345678', 'Against The Sky Supreme EP411 highlights', 'Autre', 'UCautre00000000000000000', '7:02', true)]);
    let t = makeCtx({ fetch: () => Promise.resolve(good) });
    let r = await t.api.searchYoutubeForEpisode(info);
    ok(r.length === 1 && r[0].id === 'abc12345678', 'resultat garde, extrait « highlights » ecarte');
    const n1 = t.calls.fetch;
    r = await t.api.searchYoutubeForEpisode(info);
    ok(t.calls.fetch === n1 && r.length === 1, 'deuxieme recherche servie par le cache (aucune requete de plus)');
    t.store.youtubeBlockedChannels = { UCtencent0000000000000000: 'Tencent' };
    r = await t.api.searchYoutubeForEpisode(info);
    ok(r.length === 0, 'chaine masquee filtree meme depuis le cache');

    // --- duree de reference (API Odysee simulee) : badge « duree identique »
    const dinfo = Object.assign({}, info, { embedSrc: 'https://odysee.com/%24/embed/%40chan%3Ae%2FNTZZ411%3Ab?r=x' });
    t = makeCtx({ fetch: () => Promise.resolve(good), gm: () => Promise.resolve({ responseText: JSON.stringify({ result: { 'lbry://@chan:e/NTZZ411:b': { value: { video: { duration: 710 } } } } }) }) });
    r = await t.api.searchYoutubeForEpisode(dinfo);
    ok(r.length === 1 && r[0].durMatch === true, 'duree 11:51 = 710 s a +-3 % : badge duree identique');
    t = makeCtx({ fetch: () => Promise.resolve(good), gm: () => Promise.resolve({ responseText: JSON.stringify({ result: { 'lbry://@chan:e/NTZZ411:b': { value: { video: { duration: 400 } } } } }) }) });
    r = await t.api.searchYoutubeForEpisode(dinfo);
    ok(r.length === 0, 'duree reference 400 s : video de 11:51 ecartee (hors 0,75-1,3)');

    // --- piste chinoise pour le traducteur (page de chaque video)
    const watch = (langs) => '<script>var ytInitialPlayerResponse = {"captions":{"playerCaptionsTracklistRenderer":{"captionTracks":[' + langs.map((l) => '{"baseUrl":"x","languageCode":"' + l + '"}').join(',') + '],"audioTracks":[],"translationLanguages":[{"languageCode":"zh-Hans"}]}}};</script>';
    const two = page([video('abc12345678', 'Against The Sky Supreme EP411', 'Tencent', 'UCtencent0000000000000000', '11:51', true), video('zzz12345678', 'Against The Sky Supreme EP411 eng', 'Autre', 'UCautre00000000000000000', '11:50', true)]);
    t = makeCtx({ fetch: (u) => Promise.resolve(/watch\?v=abc/.test(u) ? watch(['zh-Hans', 'en']) : /watch\?v=zzz/.test(u) ? watch(['en']) : two) });
    r = await t.api.searchYoutubeForEpisode(info);
    ok(r.length === 1 && r[0].id === 'abc12345678' && r[0].zh === true, 'video sans piste chinoise ecartee (translationLanguages ignore), avec piste : zh=true');
    t = makeCtx({ fetch: (u) => Promise.resolve(/watch\?v=/.test(u) ? watch(['en']) : two) });
    r = await t.api.searchYoutubeForEpisode(info);
    ok(r.length === 2 && r.every((x) => x.zh === false), 'aucune piste chinoise nulle part : on garde les videos, marquees zh=false');

    // --- page illisible / pas de reponse
    t = makeCtx({ fetch: () => Promise.resolve('<html>rien ici</html>') });
    let err = null; try { await t.api.searchYoutubeForEpisode(info); } catch (e) { err = e; }
    ok(err && /illisible/.test(err.message), 'page sans ytInitialData : erreur « illisible »');
    t = makeCtx({ fetch: () => Promise.reject(new Error('reseau')) });
    err = null; try { await t.api.searchYoutubeForEpisode(info); } catch (e) { err = e; }
    ok(err && /ne repond pas/.test(err.message), 'aucune reponse : erreur « ne repond pas »');
    t = makeCtx({ fetch: () => Promise.resolve(page([])) });
    r = await t.api.searchYoutubeForEpisode(info);
    ok(r.length === 0 && !t.store.ytSearchCache, 'zero resultat : pas de mise en cache');

    // --- v7.25 : plancher de qualite HLS (hlsKeepHd, src/02-iframe-lecteur.js)
    {
        const src = fs.readFileSync(path.join(root, 'src/02-iframe-lecteur.js'), 'utf8'), a = src.indexOf('function hlsKeepHd'), b = src.indexOf('function installHlsFloor');
        const c = {}; vm.createContext(c); vm.runInContext(src.slice(a, b) + ';this.f=hlsKeepHd', c);
        const m = ['#EXTM3U', '#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=256x144', 'v144.m3u8', '#EXT-X-STREAM-INF:BANDWIDTH=2,RESOLUTION=1280x720', 'v720.m3u8', '#EXT-X-STREAM-INF:BANDWIDTH=3,RESOLUTION=1920x1080', 'v1080.m3u8'].join('\n');
        const r = c.f(m, 720);
        ok(!/v144/.test(r) && /v720/.test(r) && /v1080/.test(r) && !/256x144/.test(r), 'hlsKeepHd : retire 144p, garde 720p et 1080p');
        const low = ['#EXTM3U', '#EXT-X-STREAM-INF:RESOLUTION=640x360', 'a.m3u8', '#EXT-X-STREAM-INF:RESOLUTION=256x144', 'b.m3u8'].join('\n');
        ok(c.f(low, 720) === low, 'hlsKeepHd : aucune variante >= 720p -> playlist intacte');
        ok(c.f('#EXTINF:4,\nseg.ts', 720) === '#EXTINF:4,\nseg.ts', 'hlsKeepHd : playlist media ignoree');
    }

    console.log(fails ? '\n' + fails + ' echec(s)' : '\ntout est bon');
    process.exit(fails ? 1 : 0);
})();
